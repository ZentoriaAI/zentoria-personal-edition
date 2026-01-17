-- =============================================================================
-- Zentoria Personal Edition - Main Database Schema
-- Database: zentoria_main (PostgreSQL 16 with pgvector)
-- Container: 404 (zentoria-db)
-- Version: 1.0.0
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";    -- For composite GIN indexes

-- =============================================================================
-- SCHEMA: core
-- Core application tables (users, settings, audit)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS core;

-- -----------------------------------------------------------------------------
-- Table: core.users
-- Single user for personal edition, but extensible for future multi-user
-- -----------------------------------------------------------------------------
CREATE TABLE core.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,

    -- Profile
    avatar_url TEXT,
    timezone VARCHAR(50) DEFAULT 'Europe/Amsterdam',
    locale VARCHAR(10) DEFAULT 'nl-NL',

    -- Security
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255),
    recovery_codes TEXT[],

    -- Timestamps
    last_login_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    preferences JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- Insert default admin user (password should be changed on first login)
-- Default password: 'changeme' (bcrypt hash)
INSERT INTO core.users (email, username, display_name, password_hash, is_active, is_verified)
VALUES (
    'admin@zentoria.local',
    'admin',
    'Zentoria Admin',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.gkUQSjJYRxPxpG',
    true,
    true
);

-- -----------------------------------------------------------------------------
-- Table: core.sessions
-- Active user sessions
-- -----------------------------------------------------------------------------
CREATE TABLE core.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,

    -- Token info
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    refresh_token_hash VARCHAR(255) UNIQUE,

    -- Device/Client info
    user_agent TEXT,
    ip_address INET,
    device_fingerprint VARCHAR(255),
    client_type VARCHAR(50), -- 'web', 'api', 'cli', 'mobile'

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- =============================================================================
-- SCHEMA: api
-- API key management and rate limiting
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS api;

-- -----------------------------------------------------------------------------
-- Table: api.keys
-- API keys with scopes and usage tracking
-- -----------------------------------------------------------------------------
CREATE TABLE api.keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,

    -- Key identification
    name VARCHAR(255) NOT NULL,
    description TEXT,
    key_prefix VARCHAR(12) NOT NULL, -- First 12 chars for identification (zk_live_xxxx)
    key_hash VARCHAR(255) NOT NULL UNIQUE, -- SHA-256 hash of full key

    -- Permissions
    scopes TEXT[] NOT NULL DEFAULT '{}', -- e.g., ['files.read', 'files.write', 'ai.chat']
    allowed_ips INET[],                  -- IP whitelist (null = all IPs)
    allowed_origins TEXT[],              -- CORS origins whitelist

    -- Rate limiting
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_day INTEGER DEFAULT 10000,

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired', 'suspended')),
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,

    -- Timestamps
    expires_at TIMESTAMPTZ, -- null = never expires
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Usage statistics (denormalized for quick access)
    total_requests BIGINT DEFAULT 0,
    total_tokens_used BIGINT DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- Table: api.key_usage
-- Detailed API key usage tracking (partitioned by month)
-- -----------------------------------------------------------------------------
CREATE TABLE api.key_usage (
    id BIGSERIAL,
    key_id UUID NOT NULL REFERENCES api.keys(id) ON DELETE CASCADE,

    -- Request info
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code SMALLINT,
    response_time_ms INTEGER,

    -- Resource usage
    tokens_used INTEGER DEFAULT 0,
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,

    -- Client info
    ip_address INET,
    user_agent TEXT,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions for current and next 3 months
CREATE TABLE api.key_usage_2026_01 PARTITION OF api.key_usage
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE api.key_usage_2026_02 PARTITION OF api.key_usage
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE api.key_usage_2026_03 PARTITION OF api.key_usage
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE api.key_usage_2026_04 PARTITION OF api.key_usage
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- =============================================================================
-- SCHEMA: files
-- File metadata and relationships
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS files;

-- -----------------------------------------------------------------------------
-- Table: files.folders
-- Virtual folder hierarchy
-- -----------------------------------------------------------------------------
CREATE TABLE files.folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES files.folders(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    path TEXT NOT NULL, -- Materialized path: /root/subfolder/current
    depth INTEGER DEFAULT 0,

    -- Permissions
    is_public BOOLEAN DEFAULT false,
    share_token VARCHAR(64) UNIQUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Ensure unique folder names within same parent
    CONSTRAINT unique_folder_name_per_parent UNIQUE (parent_id, name)
);

-- -----------------------------------------------------------------------------
-- Table: files.items
-- File metadata (actual files stored in MinIO)
-- -----------------------------------------------------------------------------
CREATE TABLE files.items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES files.folders(id) ON DELETE SET NULL,

    -- File identification
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    extension VARCHAR(20),
    mime_type VARCHAR(127),

    -- Storage
    storage_bucket VARCHAR(63) NOT NULL, -- MinIO bucket
    storage_key VARCHAR(1024) NOT NULL,  -- Object key in MinIO
    storage_url TEXT,                     -- Pre-signed URL (cached)

    -- Size
    size_bytes BIGINT NOT NULL,

    -- Content
    checksum_md5 VARCHAR(32),
    checksum_sha256 VARCHAR(64),

    -- Processing status
    processing_status VARCHAR(20) DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    ocr_status VARCHAR(20) DEFAULT 'none'
        CHECK (ocr_status IN ('none', 'pending', 'processing', 'completed', 'failed')),
    embedding_status VARCHAR(20) DEFAULT 'none'
        CHECK (embedding_status IN ('none', 'pending', 'processing', 'completed', 'failed')),

    -- Content extraction
    extracted_text TEXT,
    extracted_metadata JSONB DEFAULT '{}',
    page_count INTEGER,
    word_count INTEGER,

    -- Versioning
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES files.items(id),
    is_latest BOOLEAN DEFAULT true,

    -- Timestamps
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ, -- Soft delete

    -- Metadata
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- Table: files.thumbnails
-- Generated thumbnails for files
-- -----------------------------------------------------------------------------
CREATE TABLE files.thumbnails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files.items(id) ON DELETE CASCADE,

    -- Thumbnail info
    size VARCHAR(20) NOT NULL, -- 'small', 'medium', 'large'
    width INTEGER,
    height INTEGER,
    format VARCHAR(10) DEFAULT 'webp',

    -- Storage
    storage_key VARCHAR(1024) NOT NULL,
    storage_url TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_thumbnail_per_size UNIQUE (file_id, size)
);

-- =============================================================================
-- SCHEMA: audit
-- Comprehensive audit logging
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS audit;

-- -----------------------------------------------------------------------------
-- Table: audit.logs
-- All system actions audit trail (partitioned by month)
-- -----------------------------------------------------------------------------
CREATE TABLE audit.logs (
    id BIGSERIAL,

    -- Actor
    user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api.keys(id) ON DELETE SET NULL,
    session_id UUID,

    -- Action
    action VARCHAR(100) NOT NULL, -- e.g., 'file.upload', 'api_key.create', 'user.login'
    category VARCHAR(50) NOT NULL, -- e.g., 'files', 'api', 'auth', 'ai', 'system'
    severity VARCHAR(20) DEFAULT 'info'
        CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),

    -- Target
    resource_type VARCHAR(50), -- e.g., 'file', 'api_key', 'user'
    resource_id UUID,
    resource_name VARCHAR(255),

    -- Details
    description TEXT,
    old_values JSONB,
    new_values JSONB,

    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(36),
    request_path VARCHAR(1024),
    request_method VARCHAR(10),

    -- Result
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failure', 'partial')),
    error_message TEXT,
    error_code VARCHAR(50),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Extra data
    metadata JSONB DEFAULT '{}',

    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions for audit logs
CREATE TABLE audit.logs_2026_01 PARTITION OF audit.logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit.logs_2026_02 PARTITION OF audit.logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit.logs_2026_03 PARTITION OF audit.logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit.logs_2026_04 PARTITION OF audit.logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- =============================================================================
-- SCHEMA: mcp
-- MCP command history and context
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS mcp;

-- -----------------------------------------------------------------------------
-- Table: mcp.conversations
-- AI conversation sessions
-- -----------------------------------------------------------------------------
CREATE TABLE mcp.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,

    -- Conversation info
    title VARCHAR(255),
    summary TEXT,

    -- Model info
    model VARCHAR(100) DEFAULT 'llama3.2',

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),

    -- Statistics
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_duration_ms BIGINT DEFAULT 0,

    -- Timestamps
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- Table: mcp.messages
-- Individual messages in conversations
-- -----------------------------------------------------------------------------
CREATE TABLE mcp.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES mcp.conversations(id) ON DELETE CASCADE,

    -- Message content
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,

    -- For tool calls
    tool_call_id VARCHAR(255),
    tool_name VARCHAR(100),
    tool_arguments JSONB,
    tool_result JSONB,

    -- Token usage
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,

    -- Timing
    duration_ms INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata (citations, sources, etc.)
    metadata JSONB DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- Table: mcp.commands
-- MCP command execution history
-- -----------------------------------------------------------------------------
CREATE TABLE mcp.commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES mcp.conversations(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,

    -- Command info
    command_type VARCHAR(100) NOT NULL, -- e.g., 'file.upload', 'email.send', 'workflow.trigger'
    command_input JSONB NOT NULL,

    -- Execution
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
    result JSONB,
    error_message TEXT,
    error_code VARCHAR(50),

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Retry info
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_retry_at TIMESTAMPTZ,

    -- Context
    triggered_by VARCHAR(50) DEFAULT 'user' CHECK (triggered_by IN ('user', 'system', 'workflow', 'schedule')),
    workflow_id UUID,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- =============================================================================
-- SCHEMA: workflows
-- n8n workflow metadata and execution tracking
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS workflows;

-- -----------------------------------------------------------------------------
-- Table: workflows.definitions
-- Workflow definitions synced from n8n
-- -----------------------------------------------------------------------------
CREATE TABLE workflows.definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    n8n_workflow_id VARCHAR(100) NOT NULL UNIQUE, -- n8n internal ID

    -- Workflow info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tags TEXT[] DEFAULT '{}',

    -- Configuration
    is_active BOOLEAN DEFAULT true,
    trigger_type VARCHAR(50), -- 'webhook', 'schedule', 'manual', 'event'
    trigger_config JSONB,

    -- Permissions
    allowed_scopes TEXT[] DEFAULT '{}', -- Required API scopes to trigger

    -- Statistics
    total_executions BIGINT DEFAULT 0,
    successful_executions BIGINT DEFAULT 0,
    failed_executions BIGINT DEFAULT 0,
    avg_duration_ms INTEGER,

    -- Timestamps
    last_executed_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- Table: workflows.executions
-- Workflow execution history
-- -----------------------------------------------------------------------------
CREATE TABLE workflows.executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows.definitions(id) ON DELETE CASCADE,
    n8n_execution_id VARCHAR(100), -- n8n internal execution ID

    -- Trigger info
    triggered_by VARCHAR(50) NOT NULL, -- 'api', 'schedule', 'webhook', 'manual'
    trigger_data JSONB,
    mcp_command_id UUID REFERENCES mcp.commands(id) ON DELETE SET NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'running'
        CHECK (status IN ('running', 'success', 'error', 'cancelled', 'waiting')),

    -- Result
    result_data JSONB,
    error_message TEXT,

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- =============================================================================
-- SCHEMA: settings
-- Application settings and configuration
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS settings;

-- -----------------------------------------------------------------------------
-- Table: settings.app
-- Global application settings
-- -----------------------------------------------------------------------------
CREATE TABLE settings.app (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50),
    is_sensitive BOOLEAN DEFAULT false, -- If true, value is encrypted
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES core.users(id)
);

-- Insert default settings
INSERT INTO settings.app (key, value, description, category) VALUES
    ('system.name', '"Zentoria Personal Edition"', 'System display name', 'system'),
    ('system.version', '"1.0.0"', 'Current system version', 'system'),
    ('system.timezone', '"Europe/Amsterdam"', 'Default timezone', 'system'),
    ('ai.default_model', '"llama3.2"', 'Default AI model for conversations', 'ai'),
    ('ai.max_tokens', '4096', 'Maximum tokens per AI response', 'ai'),
    ('ai.temperature', '0.7', 'Default AI temperature', 'ai'),
    ('files.max_upload_size_mb', '100', 'Maximum file upload size in MB', 'files'),
    ('files.allowed_extensions', '["pdf","doc","docx","txt","md","jpg","png","gif","mp3","mp4"]', 'Allowed file extensions', 'files'),
    ('security.session_timeout_minutes', '60', 'Session timeout in minutes', 'security'),
    ('security.api_rate_limit_minute', '60', 'Default API rate limit per minute', 'security'),
    ('backup.retention_days', '30', 'Backup retention in days', 'backup'),
    ('backup.frequency', '"daily"', 'Backup frequency', 'backup');

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Core indexes
CREATE INDEX idx_users_email ON core.users(email);
CREATE INDEX idx_users_username ON core.users(username);
CREATE INDEX idx_users_last_activity ON core.users(last_activity_at);

CREATE INDEX idx_sessions_user_id ON core.sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON core.sessions(token_hash);
CREATE INDEX idx_sessions_expires ON core.sessions(expires_at) WHERE revoked_at IS NULL;

-- API indexes
CREATE INDEX idx_api_keys_user_id ON api.keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api.keys(key_prefix);
CREATE INDEX idx_api_keys_status ON api.keys(status) WHERE status = 'active';
CREATE INDEX idx_api_keys_scopes ON api.keys USING GIN (scopes);

-- File indexes
CREATE INDEX idx_files_folders_user_id ON files.folders(user_id);
CREATE INDEX idx_files_folders_parent_id ON files.folders(parent_id);
CREATE INDEX idx_files_folders_path ON files.folders USING GIN (path gin_trgm_ops);

CREATE INDEX idx_files_items_user_id ON files.items(user_id);
CREATE INDEX idx_files_items_folder_id ON files.items(folder_id);
CREATE INDEX idx_files_items_name ON files.items USING GIN (name gin_trgm_ops);
CREATE INDEX idx_files_items_mime_type ON files.items(mime_type);
CREATE INDEX idx_files_items_processing ON files.items(processing_status) WHERE processing_status IN ('pending', 'processing');
CREATE INDEX idx_files_items_tags ON files.items USING GIN (tags);
CREATE INDEX idx_files_items_uploaded ON files.items(uploaded_at DESC);
CREATE INDEX idx_files_items_not_deleted ON files.items(id) WHERE deleted_at IS NULL;

-- Audit indexes
CREATE INDEX idx_audit_logs_user_id ON audit.logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit.logs(action);
CREATE INDEX idx_audit_logs_category ON audit.logs(category);
CREATE INDEX idx_audit_logs_resource ON audit.logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit.logs(created_at DESC);
CREATE INDEX idx_audit_logs_severity ON audit.logs(severity) WHERE severity IN ('warning', 'error', 'critical');

-- MCP indexes
CREATE INDEX idx_mcp_conversations_user_id ON mcp.conversations(user_id);
CREATE INDEX idx_mcp_conversations_status ON mcp.conversations(status);
CREATE INDEX idx_mcp_conversations_last_msg ON mcp.conversations(last_message_at DESC);

CREATE INDEX idx_mcp_messages_conversation ON mcp.messages(conversation_id);
CREATE INDEX idx_mcp_messages_created ON mcp.messages(created_at);
CREATE INDEX idx_mcp_messages_role ON mcp.messages(role);

CREATE INDEX idx_mcp_commands_user_id ON mcp.commands(user_id);
CREATE INDEX idx_mcp_commands_type ON mcp.commands(command_type);
CREATE INDEX idx_mcp_commands_status ON mcp.commands(status);
CREATE INDEX idx_mcp_commands_created ON mcp.commands(created_at DESC);

-- Workflow indexes
CREATE INDEX idx_workflows_definitions_name ON workflows.definitions USING GIN (name gin_trgm_ops);
CREATE INDEX idx_workflows_definitions_active ON workflows.definitions(is_active) WHERE is_active = true;
CREATE INDEX idx_workflows_definitions_tags ON workflows.definitions USING GIN (tags);

CREATE INDEX idx_workflows_executions_workflow ON workflows.executions(workflow_id);
CREATE INDEX idx_workflows_executions_status ON workflows.executions(status);
CREATE INDEX idx_workflows_executions_started ON workflows.executions(started_at DESC);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON core.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api.keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_files_items_updated_at BEFORE UPDATE ON files.items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON files.folders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON mcp.conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commands_updated_at BEFORE UPDATE ON mcp.commands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_definitions_updated_at BEFORE UPDATE ON workflows.definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update conversation statistics
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE mcp.conversations SET
            message_count = message_count + 1,
            total_tokens = total_tokens + COALESCE(NEW.total_tokens, 0),
            last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_stats_trigger
    AFTER INSERT ON mcp.messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_stats();

-- Function to update API key usage statistics
CREATE OR REPLACE FUNCTION update_api_key_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE api.keys SET
        total_requests = total_requests + 1,
        total_tokens_used = total_tokens_used + COALESCE(NEW.tokens_used, 0),
        last_used_at = NEW.created_at
    WHERE id = NEW.key_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_api_key_stats_trigger
    AFTER INSERT ON api.key_usage
    FOR EACH ROW EXECUTE FUNCTION update_api_key_stats();

-- Function to update workflow execution statistics
CREATE OR REPLACE FUNCTION update_workflow_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('success', 'error') AND OLD.status = 'running' THEN
        UPDATE workflows.definitions SET
            total_executions = total_executions + 1,
            successful_executions = successful_executions + CASE WHEN NEW.status = 'success' THEN 1 ELSE 0 END,
            failed_executions = failed_executions + CASE WHEN NEW.status = 'error' THEN 1 ELSE 0 END,
            last_executed_at = NEW.finished_at,
            avg_duration_ms = (
                (COALESCE(avg_duration_ms, 0) * (total_executions - 1) + COALESCE(NEW.duration_ms, 0)) /
                NULLIF(total_executions, 0)
            )::INTEGER,
            updated_at = NOW()
        WHERE id = NEW.workflow_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workflow_stats_trigger
    AFTER UPDATE ON workflows.executions
    FOR EACH ROW EXECUTE FUNCTION update_workflow_stats();

-- =============================================================================
-- ROW LEVEL SECURITY (Optional for future multi-user)
-- =============================================================================

-- Enable RLS on user-scoped tables (disabled by default for single user)
-- ALTER TABLE files.items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE files.folders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE mcp.conversations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE mcp.commands ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Create application role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'zentoria_app') THEN
        CREATE ROLE zentoria_app WITH LOGIN PASSWORD 'CHANGE_ME_IN_VAULT';
    END IF;
END
$$;

-- Grant schema permissions
GRANT USAGE ON SCHEMA core, api, files, audit, mcp, workflows, settings TO zentoria_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core, api, files, audit, mcp, workflows, settings TO zentoria_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core, api, files, audit, mcp, workflows, settings TO zentoria_app;

-- Grant default permissions for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA core, api, files, audit, mcp, workflows, settings
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zentoria_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA core, api, files, audit, mcp, workflows, settings
    GRANT USAGE, SELECT ON SEQUENCES TO zentoria_app;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON SCHEMA core IS 'Core application tables (users, sessions)';
COMMENT ON SCHEMA api IS 'API key management and usage tracking';
COMMENT ON SCHEMA files IS 'File metadata and virtual folder hierarchy';
COMMENT ON SCHEMA audit IS 'Comprehensive audit logging';
COMMENT ON SCHEMA mcp IS 'MCP command history and AI conversations';
COMMENT ON SCHEMA workflows IS 'n8n workflow metadata and execution tracking';
COMMENT ON SCHEMA settings IS 'Application settings and configuration';

COMMENT ON TABLE core.users IS 'User accounts (single user for personal edition)';
COMMENT ON TABLE api.keys IS 'API keys with scopes and usage tracking';
COMMENT ON TABLE files.items IS 'File metadata (actual files stored in MinIO)';
COMMENT ON TABLE audit.logs IS 'All system actions audit trail (partitioned monthly)';
COMMENT ON TABLE mcp.commands IS 'MCP command execution history';
COMMENT ON TABLE workflows.definitions IS 'Workflow definitions synced from n8n';
