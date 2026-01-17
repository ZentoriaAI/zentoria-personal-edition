-- =============================================================================
-- Zentoria Personal Edition - Vector Database Schema
-- Database: zentoria_vectors (PostgreSQL 16 with pgvector)
-- Container: 404 (zentoria-db)
-- Version: 1.0.0
--
-- This database stores AI embeddings for semantic search and RAG pipelines.
-- Uses pgvector extension for vector similarity search.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector for embeddings

-- =============================================================================
-- SCHEMA: embeddings
-- Vector embeddings for documents, chat, and code
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS embeddings;

-- -----------------------------------------------------------------------------
-- Table: embeddings.models
-- Embedding model configurations
-- -----------------------------------------------------------------------------
CREATE TABLE embeddings.models (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL, -- 'ollama', 'openai', 'huggingface'
    dimensions INTEGER NOT NULL,
    description TEXT,
    max_tokens INTEGER,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Insert default embedding models
INSERT INTO embeddings.models (id, name, provider, dimensions, description, max_tokens, is_default) VALUES
    ('nomic-embed-text', 'Nomic Embed Text', 'ollama', 768, 'High quality text embeddings via Ollama', 8192, true),
    ('codellama-embed', 'CodeLlama Embeddings', 'ollama', 4096, 'Code-specialized embeddings', 4096, false),
    ('mxbai-embed-large', 'MixedBread Embed Large', 'ollama', 1024, 'Large multilingual embeddings', 512, false);

-- -----------------------------------------------------------------------------
-- Table: embeddings.documents
-- Document embeddings for RAG (nomic-embed-text, 768 dimensions)
-- This is the primary embedding store for all documents
-- -----------------------------------------------------------------------------
CREATE TABLE embeddings.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Source reference
    file_id UUID NOT NULL,                    -- References files.items in zentoria_main
    chunk_index INTEGER NOT NULL DEFAULT 0,   -- Chunk position in document
    total_chunks INTEGER DEFAULT 1,           -- Total chunks in document

    -- Content
    content TEXT NOT NULL,                    -- The actual text content
    content_hash VARCHAR(64),                 -- SHA-256 for deduplication

    -- Vector embedding (768 dimensions for nomic-embed-text)
    embedding vector(768) NOT NULL,

    -- Model info
    model_id VARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text',

    -- Chunking metadata
    char_start INTEGER,                       -- Start position in original
    char_end INTEGER,                         -- End position in original
    token_count INTEGER,

    -- Document context (for better retrieval)
    document_title VARCHAR(255),
    section_title VARCHAR(255),
    page_number INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata (source info, extraction details, etc.)
    metadata JSONB DEFAULT '{}',

    -- Ensure no duplicate chunks per file
    CONSTRAINT unique_document_chunk UNIQUE (file_id, chunk_index)
);

-- -----------------------------------------------------------------------------
-- Table: embeddings.chat_history
-- Chat message embeddings for conversation context (768 dimensions)
-- =============================================================================
CREATE TABLE embeddings.chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Conversation reference
    conversation_id UUID NOT NULL,           -- References mcp.conversations in zentoria_main
    message_id UUID NOT NULL,                -- References mcp.messages in zentoria_main
    user_id UUID NOT NULL,                   -- References core.users in zentoria_main

    -- Content
    role VARCHAR(20) NOT NULL,               -- 'user', 'assistant'
    content TEXT NOT NULL,

    -- Vector embedding
    embedding vector(768) NOT NULL,

    -- Model info
    model_id VARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text',

    -- Timestamps
    message_timestamp TIMESTAMPTZ NOT NULL,  -- Original message time
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    CONSTRAINT unique_message_embedding UNIQUE (message_id)
);

-- -----------------------------------------------------------------------------
-- Table: embeddings.code
-- Code embeddings for code search (4096 dimensions for codellama)
-- -----------------------------------------------------------------------------
CREATE TABLE embeddings.code (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Source reference
    file_id UUID,                            -- References files.items in zentoria_main
    repository VARCHAR(255),                  -- Git repository URL/name
    file_path VARCHAR(1024) NOT NULL,        -- Path within repository

    -- Code content
    content TEXT NOT NULL,
    language VARCHAR(50),                    -- Programming language
    content_hash VARCHAR(64),                -- SHA-256 for deduplication

    -- Vector embedding (4096 dimensions for codellama)
    embedding vector(4096) NOT NULL,

    -- Model info
    model_id VARCHAR(100) NOT NULL DEFAULT 'codellama-embed',

    -- Code context
    function_name VARCHAR(255),
    class_name VARCHAR(255),
    module_name VARCHAR(255),
    line_start INTEGER,
    line_end INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata (dependencies, imports, etc.)
    metadata JSONB DEFAULT '{}'
);

-- -----------------------------------------------------------------------------
-- Table: embeddings.knowledge
-- Knowledge base embeddings (wiki, docs, structured content)
-- -----------------------------------------------------------------------------
CREATE TABLE embeddings.knowledge (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Source identification
    source_type VARCHAR(50) NOT NULL,        -- 'wiki', 'documentation', 'faq', 'runbook'
    source_id VARCHAR(255) NOT NULL,          -- External ID from source system
    source_url TEXT,                          -- Original URL if applicable

    -- Content
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64),

    -- Vector embedding
    embedding vector(768) NOT NULL,

    -- Model info
    model_id VARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text',

    -- Categorization
    category VARCHAR(100),
    subcategory VARCHAR(100),
    tags TEXT[] DEFAULT '{}',

    -- Versioning
    version INTEGER DEFAULT 1,
    is_latest BOOLEAN DEFAULT true,

    -- Timestamps
    source_updated_at TIMESTAMPTZ,           -- When source was last modified
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    CONSTRAINT unique_knowledge_source UNIQUE (source_type, source_id, version)
);

-- =============================================================================
-- INDEXES FOR VECTOR SIMILARITY SEARCH
-- Using HNSW indexes for fast approximate nearest neighbor search
-- =============================================================================

-- Document embeddings - HNSW index for fast similarity search
-- Parameters: m=16 (connections per node), ef_construction=64 (build quality)
CREATE INDEX idx_documents_embedding_hnsw ON embeddings.documents
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Chat history embeddings
CREATE INDEX idx_chat_history_embedding_hnsw ON embeddings.chat_history
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Code embeddings (larger vectors need different parameters)
CREATE INDEX idx_code_embedding_hnsw ON embeddings.code
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 24, ef_construction = 128);

-- Knowledge embeddings
CREATE INDEX idx_knowledge_embedding_hnsw ON embeddings.knowledge
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- ADDITIONAL INDEXES FOR FILTERING
-- =============================================================================

-- Document indexes
CREATE INDEX idx_documents_file_id ON embeddings.documents(file_id);
CREATE INDEX idx_documents_model_id ON embeddings.documents(model_id);
CREATE INDEX idx_documents_created ON embeddings.documents(created_at DESC);
CREATE INDEX idx_documents_content_hash ON embeddings.documents(content_hash);

-- Chat history indexes
CREATE INDEX idx_chat_history_conversation ON embeddings.chat_history(conversation_id);
CREATE INDEX idx_chat_history_user ON embeddings.chat_history(user_id);
CREATE INDEX idx_chat_history_timestamp ON embeddings.chat_history(message_timestamp DESC);
CREATE INDEX idx_chat_history_role ON embeddings.chat_history(role);

-- Code indexes
CREATE INDEX idx_code_file_id ON embeddings.code(file_id);
CREATE INDEX idx_code_repository ON embeddings.code(repository);
CREATE INDEX idx_code_language ON embeddings.code(language);
CREATE INDEX idx_code_file_path ON embeddings.code USING GIN (file_path gin_trgm_ops);
CREATE INDEX idx_code_function_name ON embeddings.code(function_name) WHERE function_name IS NOT NULL;

-- Knowledge indexes
CREATE INDEX idx_knowledge_source_type ON embeddings.knowledge(source_type);
CREATE INDEX idx_knowledge_category ON embeddings.knowledge(category);
CREATE INDEX idx_knowledge_tags ON embeddings.knowledge USING GIN (tags);
CREATE INDEX idx_knowledge_title ON embeddings.knowledge USING GIN (title gin_trgm_ops);
CREATE INDEX idx_knowledge_is_latest ON embeddings.knowledge(is_latest) WHERE is_latest = true;

-- =============================================================================
-- FUNCTIONS FOR SEMANTIC SEARCH
-- =============================================================================

-- Function: Search documents by semantic similarity
CREATE OR REPLACE FUNCTION embeddings.search_documents(
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10,
    filter_file_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    file_id UUID,
    chunk_index INTEGER,
    content TEXT,
    document_title VARCHAR(255),
    section_title VARCHAR(255),
    similarity FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.file_id,
        d.chunk_index,
        d.content,
        d.document_title,
        d.section_title,
        1 - (d.embedding <=> query_embedding) AS similarity,
        d.metadata
    FROM embeddings.documents d
    WHERE
        (filter_file_ids IS NULL OR d.file_id = ANY(filter_file_ids))
        AND 1 - (d.embedding <=> query_embedding) > match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Search chat history for relevant context
CREATE OR REPLACE FUNCTION embeddings.search_chat_context(
    query_embedding vector(768),
    p_user_id UUID,
    p_conversation_id UUID DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.6,
    match_count INT DEFAULT 20,
    time_window INTERVAL DEFAULT INTERVAL '30 days'
)
RETURNS TABLE (
    id UUID,
    conversation_id UUID,
    message_id UUID,
    role VARCHAR(20),
    content TEXT,
    message_timestamp TIMESTAMPTZ,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.conversation_id,
        c.message_id,
        c.role,
        c.content,
        c.message_timestamp,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM embeddings.chat_history c
    WHERE
        c.user_id = p_user_id
        AND (p_conversation_id IS NULL OR c.conversation_id = p_conversation_id)
        AND c.message_timestamp > NOW() - time_window
        AND 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Search code by semantic similarity
CREATE OR REPLACE FUNCTION embeddings.search_code(
    query_embedding vector(4096),
    p_language VARCHAR(50) DEFAULT NULL,
    p_repository VARCHAR(255) DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.6,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    file_path VARCHAR(1024),
    language VARCHAR(50),
    content TEXT,
    function_name VARCHAR(255),
    class_name VARCHAR(255),
    line_start INTEGER,
    line_end INTEGER,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        co.id,
        co.file_path,
        co.language,
        co.content,
        co.function_name,
        co.class_name,
        co.line_start,
        co.line_end,
        1 - (co.embedding <=> query_embedding) AS similarity
    FROM embeddings.code co
    WHERE
        (p_language IS NULL OR co.language = p_language)
        AND (p_repository IS NULL OR co.repository = p_repository)
        AND 1 - (co.embedding <=> query_embedding) > match_threshold
    ORDER BY co.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Search knowledge base
CREATE OR REPLACE FUNCTION embeddings.search_knowledge(
    query_embedding vector(768),
    p_source_type VARCHAR(50) DEFAULT NULL,
    p_category VARCHAR(100) DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.65,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    source_type VARCHAR(50),
    title VARCHAR(500),
    content TEXT,
    source_url TEXT,
    category VARCHAR(100),
    tags TEXT[],
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        k.id,
        k.source_type,
        k.title,
        k.content,
        k.source_url,
        k.category,
        k.tags,
        1 - (k.embedding <=> query_embedding) AS similarity
    FROM embeddings.knowledge k
    WHERE
        k.is_latest = true
        AND (p_source_type IS NULL OR k.source_type = p_source_type)
        AND (p_category IS NULL OR k.category = p_category)
        AND (p_tags IS NULL OR k.tags && p_tags)
        AND 1 - (k.embedding <=> query_embedding) > match_threshold
    ORDER BY k.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- MAINTENANCE FUNCTIONS
-- =============================================================================

-- Function: Delete embeddings for a file (cascade on file deletion)
CREATE OR REPLACE FUNCTION embeddings.delete_file_embeddings(p_file_id UUID)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM embeddings.documents WHERE file_id = p_file_id RETURNING 1
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Reindex embeddings for a model change
CREATE OR REPLACE FUNCTION embeddings.mark_for_reindex(p_model_id VARCHAR(100))
RETURNS TABLE (
    documents_count BIGINT,
    chat_count BIGINT,
    code_count BIGINT,
    knowledge_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM embeddings.documents WHERE model_id = p_model_id),
        (SELECT COUNT(*) FROM embeddings.chat_history WHERE model_id = p_model_id),
        (SELECT COUNT(*) FROM embeddings.code WHERE model_id = p_model_id),
        (SELECT COUNT(*) FROM embeddings.knowledge WHERE model_id = p_model_id);
END;
$$ LANGUAGE plpgsql;

-- Function: Get embedding statistics
CREATE OR REPLACE FUNCTION embeddings.get_statistics()
RETURNS TABLE (
    table_name TEXT,
    row_count BIGINT,
    index_size TEXT,
    total_size TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.tablename::TEXT,
        (SELECT reltuples::BIGINT FROM pg_class WHERE relname = t.tablename),
        pg_size_pretty(pg_indexes_size((t.schemaname || '.' || t.tablename)::regclass)),
        pg_size_pretty(pg_total_relation_size((t.schemaname || '.' || t.tablename)::regclass))
    FROM pg_tables t
    WHERE t.schemaname = 'embeddings'
    ORDER BY t.tablename;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION embeddings.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON embeddings.documents
    FOR EACH ROW EXECUTE FUNCTION embeddings.update_updated_at_column();

CREATE TRIGGER update_code_updated_at BEFORE UPDATE ON embeddings.code
    FOR EACH ROW EXECUTE FUNCTION embeddings.update_updated_at_column();

CREATE TRIGGER update_knowledge_updated_at BEFORE UPDATE ON embeddings.knowledge
    FOR EACH ROW EXECUTE FUNCTION embeddings.update_updated_at_column();

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Create application role if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'zentoria_app') THEN
        CREATE ROLE zentoria_app WITH LOGIN PASSWORD 'CHANGE_ME_IN_VAULT';
    END IF;
END
$$;

GRANT USAGE ON SCHEMA embeddings TO zentoria_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA embeddings TO zentoria_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA embeddings TO zentoria_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA embeddings TO zentoria_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA embeddings
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zentoria_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA embeddings
    GRANT USAGE, SELECT ON SEQUENCES TO zentoria_app;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON SCHEMA embeddings IS 'Vector embeddings for semantic search and RAG pipelines';
COMMENT ON TABLE embeddings.documents IS 'Document chunk embeddings (768 dim, nomic-embed-text)';
COMMENT ON TABLE embeddings.chat_history IS 'Chat message embeddings for context retrieval';
COMMENT ON TABLE embeddings.code IS 'Code embeddings (4096 dim, codellama)';
COMMENT ON TABLE embeddings.knowledge IS 'Knowledge base embeddings (wiki, docs, FAQs)';
COMMENT ON TABLE embeddings.models IS 'Embedding model configurations';

COMMENT ON FUNCTION embeddings.search_documents IS 'Semantic search over document embeddings';
COMMENT ON FUNCTION embeddings.search_chat_context IS 'Find relevant chat history for context';
COMMENT ON FUNCTION embeddings.search_code IS 'Semantic code search';
COMMENT ON FUNCTION embeddings.search_knowledge IS 'Search knowledge base by semantic similarity';
