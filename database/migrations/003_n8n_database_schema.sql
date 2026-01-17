-- =============================================================================
-- Zentoria Personal Edition - n8n Database Schema
-- Database: n8n (PostgreSQL 16)
-- Container: 404 (zentoria-db)
-- Version: 1.0.0
--
-- n8n manages its own schema, but we create the database and user here.
-- This migration also includes auxiliary tables for Zentoria integration.
-- =============================================================================

-- Note: n8n creates its own tables automatically on first run.
-- This script creates the database, user, and Zentoria-specific extensions.

-- =============================================================================
-- SCHEMA: zentoria_integration
-- Additional tables for Zentoria <-> n8n integration
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS zentoria_integration;

-- -----------------------------------------------------------------------------
-- Table: zentoria_integration.webhook_registry
-- Registry of all webhooks created by n8n workflows
-- Used by Zentoria backend to route incoming requests
-- -----------------------------------------------------------------------------
CREATE TABLE zentoria_integration.webhook_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Webhook identification
    webhook_id VARCHAR(255) NOT NULL UNIQUE,  -- n8n webhook ID
    webhook_path VARCHAR(500) NOT NULL,        -- URL path
    http_method VARCHAR(10) NOT NULL DEFAULT 'POST',

    -- Associated workflow
    workflow_id VARCHAR(100) NOT NULL,        -- n8n workflow ID
    workflow_name VARCHAR(255),

    -- Security
    requires_auth BOOLEAN DEFAULT true,
    allowed_api_keys UUID[],                  -- Specific API keys allowed
    allowed_scopes TEXT[],                    -- Required scopes

    -- Rate limiting
    rate_limit_per_minute INTEGER DEFAULT 60,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- Table: zentoria_integration.scheduled_triggers
-- Registry of scheduled/cron triggers
-- -----------------------------------------------------------------------------
CREATE TABLE zentoria_integration.scheduled_triggers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Schedule identification
    trigger_id VARCHAR(255) NOT NULL UNIQUE,
    workflow_id VARCHAR(100) NOT NULL,
    workflow_name VARCHAR(255),

    -- Schedule config
    cron_expression VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'Europe/Amsterdam',
    interval_seconds INTEGER,                 -- Alternative to cron

    -- Execution tracking
    last_execution_at TIMESTAMPTZ,
    next_execution_at TIMESTAMPTZ,
    execution_count BIGINT DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- Table: zentoria_integration.execution_queue
-- Queue for pending workflow executions (Redis is primary, this is backup)
-- -----------------------------------------------------------------------------
CREATE TABLE zentoria_integration.execution_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Queue item identification
    queue_name VARCHAR(100) NOT NULL DEFAULT 'default',
    priority INTEGER DEFAULT 0,               -- Higher = more priority

    -- Workflow info
    workflow_id VARCHAR(100) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,        -- 'webhook', 'schedule', 'manual', 'api'
    trigger_data JSONB NOT NULL DEFAULT '{}',

    -- Status
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Result
    result_data JSONB,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- Table: zentoria_integration.credential_mapping
-- Maps Zentoria vault secrets to n8n credentials
-- -----------------------------------------------------------------------------
CREATE TABLE zentoria_integration.credential_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- n8n credential reference
    n8n_credential_id VARCHAR(255) NOT NULL UNIQUE,
    n8n_credential_type VARCHAR(100) NOT NULL, -- 'oauth2', 'apiKey', 'basicAuth', etc.

    -- Vault reference
    vault_path VARCHAR(500) NOT NULL,          -- Path in HashiCorp Vault
    vault_version INTEGER,                     -- Specific version (null = latest)

    -- Metadata
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Status
    is_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Webhook registry indexes
CREATE INDEX idx_webhook_registry_path ON zentoria_integration.webhook_registry(webhook_path);
CREATE INDEX idx_webhook_registry_workflow ON zentoria_integration.webhook_registry(workflow_id);
CREATE INDEX idx_webhook_registry_active ON zentoria_integration.webhook_registry(is_active) WHERE is_active = true;

-- Scheduled triggers indexes
CREATE INDEX idx_scheduled_triggers_workflow ON zentoria_integration.scheduled_triggers(workflow_id);
CREATE INDEX idx_scheduled_triggers_next_exec ON zentoria_integration.scheduled_triggers(next_execution_at) WHERE is_active = true;
CREATE INDEX idx_scheduled_triggers_active ON zentoria_integration.scheduled_triggers(is_active);

-- Execution queue indexes
CREATE INDEX idx_execution_queue_status ON zentoria_integration.execution_queue(status);
CREATE INDEX idx_execution_queue_priority ON zentoria_integration.execution_queue(priority DESC, created_at ASC) WHERE status = 'pending';
CREATE INDEX idx_execution_queue_workflow ON zentoria_integration.execution_queue(workflow_id);
CREATE INDEX idx_execution_queue_next_retry ON zentoria_integration.execution_queue(next_retry_at) WHERE status = 'pending' AND retry_count > 0;

-- Credential mapping indexes
CREATE INDEX idx_credential_mapping_vault_path ON zentoria_integration.credential_mapping(vault_path);
CREATE INDEX idx_credential_mapping_type ON zentoria_integration.credential_mapping(n8n_credential_type);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function: Get next pending queue item
CREATE OR REPLACE FUNCTION zentoria_integration.get_next_queue_item(p_queue_name VARCHAR(100) DEFAULT 'default')
RETURNS TABLE (
    id UUID,
    workflow_id VARCHAR(100),
    trigger_type VARCHAR(50),
    trigger_data JSONB,
    retry_count INTEGER
) AS $$
DECLARE
    v_item_id UUID;
BEGIN
    -- Lock and get the next item
    SELECT eq.id INTO v_item_id
    FROM zentoria_integration.execution_queue eq
    WHERE eq.queue_name = p_queue_name
        AND eq.status = 'pending'
        AND (eq.next_retry_at IS NULL OR eq.next_retry_at <= NOW())
    ORDER BY eq.priority DESC, eq.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_item_id IS NOT NULL THEN
        -- Mark as processing
        UPDATE zentoria_integration.execution_queue
        SET status = 'processing', started_at = NOW()
        WHERE execution_queue.id = v_item_id;

        -- Return the item
        RETURN QUERY
        SELECT eq.id, eq.workflow_id, eq.trigger_type, eq.trigger_data, eq.retry_count
        FROM zentoria_integration.execution_queue eq
        WHERE eq.id = v_item_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Mark queue item as completed
CREATE OR REPLACE FUNCTION zentoria_integration.complete_queue_item(
    p_item_id UUID,
    p_result_data JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE zentoria_integration.execution_queue
    SET
        status = 'completed',
        completed_at = NOW(),
        result_data = p_result_data
    WHERE id = p_item_id AND status = 'processing';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function: Mark queue item as failed (with retry logic)
CREATE OR REPLACE FUNCTION zentoria_integration.fail_queue_item(
    p_item_id UUID,
    p_error_message TEXT,
    p_retry_delay_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
    v_retry_count INTEGER;
    v_max_retries INTEGER;
BEGIN
    -- Get current retry info
    SELECT retry_count, max_retries INTO v_retry_count, v_max_retries
    FROM zentoria_integration.execution_queue
    WHERE id = p_item_id AND status = 'processing';

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_retry_count < v_max_retries THEN
        -- Schedule retry
        UPDATE zentoria_integration.execution_queue
        SET
            status = 'pending',
            retry_count = retry_count + 1,
            error_message = p_error_message,
            next_retry_at = NOW() + (p_retry_delay_seconds * (retry_count + 1)) * INTERVAL '1 second'
        WHERE id = p_item_id;
    ELSE
        -- Max retries reached, mark as failed
        UPDATE zentoria_integration.execution_queue
        SET
            status = 'failed',
            completed_at = NOW(),
            error_message = p_error_message
        WHERE id = p_item_id;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Clean up old queue items
CREATE OR REPLACE FUNCTION zentoria_integration.cleanup_old_queue_items(
    p_retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM zentoria_integration.execution_queue
        WHERE status IN ('completed', 'failed', 'cancelled')
            AND completed_at < NOW() - (p_retention_days || ' days')::INTERVAL
        RETURNING 1
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION zentoria_integration.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_webhook_registry_updated_at BEFORE UPDATE ON zentoria_integration.webhook_registry
    FOR EACH ROW EXECUTE FUNCTION zentoria_integration.update_updated_at_column();

CREATE TRIGGER update_scheduled_triggers_updated_at BEFORE UPDATE ON zentoria_integration.scheduled_triggers
    FOR EACH ROW EXECUTE FUNCTION zentoria_integration.update_updated_at_column();

CREATE TRIGGER update_credential_mapping_updated_at BEFORE UPDATE ON zentoria_integration.credential_mapping
    FOR EACH ROW EXECUTE FUNCTION zentoria_integration.update_updated_at_column();

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Create n8n application role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'n8n_app') THEN
        CREATE ROLE n8n_app WITH LOGIN PASSWORD 'CHANGE_ME_IN_VAULT';
    END IF;
END
$$;

-- Grant full access to n8n_app for all schemas
GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n_app;
GRANT ALL PRIVILEGES ON SCHEMA public TO n8n_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO n8n_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO n8n_app;

-- Grant access to zentoria_integration schema
GRANT USAGE ON SCHEMA zentoria_integration TO n8n_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA zentoria_integration TO n8n_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA zentoria_integration TO n8n_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA zentoria_integration TO n8n_app;

-- Also grant to zentoria_app for cross-database queries
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'zentoria_app') THEN
        CREATE ROLE zentoria_app WITH LOGIN PASSWORD 'CHANGE_ME_IN_VAULT';
    END IF;
END
$$;

GRANT USAGE ON SCHEMA zentoria_integration TO zentoria_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA zentoria_integration TO zentoria_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA zentoria_integration TO zentoria_app;

-- Default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA zentoria_integration
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO n8n_app, zentoria_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA zentoria_integration
    GRANT USAGE, SELECT ON SEQUENCES TO n8n_app, zentoria_app;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON SCHEMA zentoria_integration IS 'Zentoria <-> n8n integration tables';
COMMENT ON TABLE zentoria_integration.webhook_registry IS 'Registry of n8n webhooks for routing';
COMMENT ON TABLE zentoria_integration.scheduled_triggers IS 'Registry of scheduled workflow triggers';
COMMENT ON TABLE zentoria_integration.execution_queue IS 'Backup queue for workflow executions';
COMMENT ON TABLE zentoria_integration.credential_mapping IS 'Maps Vault secrets to n8n credentials';

COMMENT ON FUNCTION zentoria_integration.get_next_queue_item IS 'Get and lock next pending queue item';
COMMENT ON FUNCTION zentoria_integration.complete_queue_item IS 'Mark queue item as successfully completed';
COMMENT ON FUNCTION zentoria_integration.fail_queue_item IS 'Mark queue item as failed with retry logic';
COMMENT ON FUNCTION zentoria_integration.cleanup_old_queue_items IS 'Clean up old completed/failed queue items';
