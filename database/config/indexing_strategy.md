# Zentoria Personal Edition - Indexing Strategy

## Overview

This document defines the comprehensive indexing strategy for all Zentoria databases, optimized for common query patterns and performance requirements.

---

## 1. PostgreSQL Indexing Strategy (Container 404)

### 1.1 Index Types Used

| Index Type | Use Case | Performance |
|------------|----------|-------------|
| **B-tree** | Equality, range queries, sorting | Default, balanced |
| **Hash** | Equality only | Faster for exact matches |
| **GIN** | Full-text search, JSONB, arrays | Best for containment |
| **GiST** | Geometric, range types | Spatial data |
| **BRIN** | Large tables with natural ordering | Very compact |
| **HNSW (pgvector)** | Vector similarity search | Approximate NN |

### 1.2 zentoria_main Database Indexes

#### 1.2.1 Core Schema

```sql
-- Users table
CREATE INDEX idx_users_email ON core.users(email);                    -- Login lookups
CREATE INDEX idx_users_username ON core.users(username);              -- Username lookups
CREATE INDEX idx_users_last_activity ON core.users(last_activity_at); -- Activity reports

-- Sessions table
CREATE INDEX idx_sessions_user_id ON core.sessions(user_id);          -- User's sessions
CREATE INDEX idx_sessions_token_hash ON core.sessions(token_hash);    -- Token validation
CREATE INDEX idx_sessions_expires ON core.sessions(expires_at)        -- Cleanup job
    WHERE revoked_at IS NULL;
```

**Query Patterns Supported:**
- Login by email/username: O(log n) with B-tree
- Token validation: O(1) with hash on token_hash
- Session cleanup: Partial index excludes revoked sessions

#### 1.2.2 API Schema

```sql
-- API Keys table
CREATE INDEX idx_api_keys_user_id ON api.keys(user_id);               -- User's keys
CREATE INDEX idx_api_keys_prefix ON api.keys(key_prefix);             -- Key identification
CREATE INDEX idx_api_keys_status ON api.keys(status)                  -- Active keys only
    WHERE status = 'active';
CREATE INDEX idx_api_keys_scopes ON api.keys USING GIN (scopes);      -- Scope filtering

-- API Key Usage (Partitioned by month)
CREATE INDEX idx_key_usage_key_id ON api.key_usage(key_id);           -- Per-key stats
CREATE INDEX idx_key_usage_endpoint ON api.key_usage(endpoint);       -- Endpoint analytics
```

**Query Patterns Supported:**
- Key lookup by prefix: Used for API key validation
- Scope filtering: GIN enables fast `scopes @> ARRAY['files.read']`
- Usage analytics: Partitioned for fast range queries

#### 1.2.3 Files Schema

```sql
-- Folders table
CREATE INDEX idx_files_folders_user_id ON files.folders(user_id);     -- User's folders
CREATE INDEX idx_files_folders_parent_id ON files.folders(parent_id); -- Folder hierarchy
CREATE INDEX idx_files_folders_path ON files.folders                  -- Path search
    USING GIN (path gin_trgm_ops);

-- Items table
CREATE INDEX idx_files_items_user_id ON files.items(user_id);         -- User's files
CREATE INDEX idx_files_items_folder_id ON files.items(folder_id);     -- Folder contents
CREATE INDEX idx_files_items_name ON files.items                      -- File search
    USING GIN (name gin_trgm_ops);
CREATE INDEX idx_files_items_mime_type ON files.items(mime_type);     -- Type filtering
CREATE INDEX idx_files_items_processing ON files.items(processing_status)
    WHERE processing_status IN ('pending', 'processing');             -- Processing queue
CREATE INDEX idx_files_items_tags ON files.items USING GIN (tags);    -- Tag filtering
CREATE INDEX idx_files_items_uploaded ON files.items(uploaded_at DESC); -- Recent files
CREATE INDEX idx_files_items_not_deleted ON files.items(id)           -- Non-deleted files
    WHERE deleted_at IS NULL;

-- Composite index for common query: user's files in folder by upload date
CREATE INDEX idx_files_items_user_folder_uploaded
    ON files.items(user_id, folder_id, uploaded_at DESC)
    WHERE deleted_at IS NULL;
```

**Query Patterns Supported:**
- File listing with pagination: Composite index for efficient sorting
- Full-text file search: GIN with trigrams for LIKE queries
- Tag-based filtering: GIN enables fast `tags && ARRAY['tag1']`
- Processing queue: Partial index only includes pending items

#### 1.2.4 Audit Schema

```sql
-- Audit logs (Partitioned by month)
CREATE INDEX idx_audit_logs_user_id ON audit.logs(user_id);           -- User activity
CREATE INDEX idx_audit_logs_action ON audit.logs(action);             -- Action filtering
CREATE INDEX idx_audit_logs_category ON audit.logs(category);         -- Category filtering
CREATE INDEX idx_audit_logs_resource ON audit.logs(resource_type, resource_id); -- Resource history
CREATE INDEX idx_audit_logs_created ON audit.logs(created_at DESC);   -- Recent activity
CREATE INDEX idx_audit_logs_severity ON audit.logs(severity)          -- Error monitoring
    WHERE severity IN ('warning', 'error', 'critical');
```

**Query Patterns Supported:**
- Security auditing: Fast lookup by user, action, resource
- Error monitoring: Partial index for severity filtering
- Time-based queries: Partition pruning + created_at index

#### 1.2.5 MCP Schema

```sql
-- Conversations
CREATE INDEX idx_mcp_conversations_user_id ON mcp.conversations(user_id);
CREATE INDEX idx_mcp_conversations_status ON mcp.conversations(status);
CREATE INDEX idx_mcp_conversations_last_msg ON mcp.conversations(last_message_at DESC);

-- Messages
CREATE INDEX idx_mcp_messages_conversation ON mcp.messages(conversation_id);
CREATE INDEX idx_mcp_messages_created ON mcp.messages(created_at);
CREATE INDEX idx_mcp_messages_role ON mcp.messages(role);

-- Composite for conversation history loading
CREATE INDEX idx_mcp_messages_conv_created
    ON mcp.messages(conversation_id, created_at DESC);

-- Commands
CREATE INDEX idx_mcp_commands_user_id ON mcp.commands(user_id);
CREATE INDEX idx_mcp_commands_type ON mcp.commands(command_type);
CREATE INDEX idx_mcp_commands_status ON mcp.commands(status);
CREATE INDEX idx_mcp_commands_created ON mcp.commands(created_at DESC);

-- Composite for command queue processing
CREATE INDEX idx_mcp_commands_pending_queue
    ON mcp.commands(created_at)
    WHERE status IN ('pending', 'running');
```

**Query Patterns Supported:**
- Conversation listing: Sorted by last activity
- Message loading: Composite index for efficient conversation history
- Command queue: Partial index for pending items only

#### 1.2.6 Workflows Schema

```sql
-- Workflow definitions
CREATE INDEX idx_workflows_definitions_name ON workflows.definitions
    USING GIN (name gin_trgm_ops);                                    -- Search by name
CREATE INDEX idx_workflows_definitions_active ON workflows.definitions(is_active)
    WHERE is_active = true;                                           -- Active workflows
CREATE INDEX idx_workflows_definitions_tags ON workflows.definitions
    USING GIN (tags);                                                 -- Tag filtering

-- Workflow executions
CREATE INDEX idx_workflows_executions_workflow ON workflows.executions(workflow_id);
CREATE INDEX idx_workflows_executions_status ON workflows.executions(status);
CREATE INDEX idx_workflows_executions_started ON workflows.executions(started_at DESC);

-- Composite for workflow execution history
CREATE INDEX idx_workflows_executions_workflow_started
    ON workflows.executions(workflow_id, started_at DESC);
```

### 1.3 zentoria_vectors Database Indexes

```sql
-- Document embeddings - HNSW for vector search
CREATE INDEX idx_documents_embedding_hnsw ON embeddings.documents
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Supporting indexes for filtering before vector search
CREATE INDEX idx_documents_file_id ON embeddings.documents(file_id);
CREATE INDEX idx_documents_model_id ON embeddings.documents(model_id);
CREATE INDEX idx_documents_created ON embeddings.documents(created_at DESC);
CREATE INDEX idx_documents_content_hash ON embeddings.documents(content_hash);

-- Chat history embeddings
CREATE INDEX idx_chat_history_embedding_hnsw ON embeddings.chat_history
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_chat_history_conversation ON embeddings.chat_history(conversation_id);
CREATE INDEX idx_chat_history_user ON embeddings.chat_history(user_id);
CREATE INDEX idx_chat_history_timestamp ON embeddings.chat_history(message_timestamp DESC);

-- Code embeddings (larger vectors)
CREATE INDEX idx_code_embedding_hnsw ON embeddings.code
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 24, ef_construction = 128);  -- Higher m for larger vectors

CREATE INDEX idx_code_language ON embeddings.code(language);
CREATE INDEX idx_code_repository ON embeddings.code(repository);
CREATE INDEX idx_code_file_path ON embeddings.code USING GIN (file_path gin_trgm_ops);

-- Knowledge embeddings
CREATE INDEX idx_knowledge_embedding_hnsw ON embeddings.knowledge
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 100);

CREATE INDEX idx_knowledge_source_type ON embeddings.knowledge(source_type);
CREATE INDEX idx_knowledge_category ON embeddings.knowledge(category);
CREATE INDEX idx_knowledge_is_latest ON embeddings.knowledge(is_latest) WHERE is_latest = true;
```

**HNSW Parameter Selection:**

| Collection | m | ef_construction | Reason |
|------------|---|-----------------|--------|
| documents | 16 | 64 | Balanced recall/speed |
| chat_history | 16 | 64 | Lower accuracy OK |
| code | 24 | 128 | Higher accuracy for code |
| knowledge | 16 | 100 | Higher accuracy for knowledge |

---

## 2. Redis Indexing (Container 410)

Redis uses hash-based data structures, not traditional indexes. Optimization is through key design.

### 2.1 Key Design Patterns

```
# Hierarchical keys for efficient SCAN patterns
session:user:{user_id}:{session_id}
cache:api:{endpoint}:{method}:{hash}
ratelimit:{type}:{identifier}:{window}

# Benefits:
# - SCAN with pattern "session:user:abc*" finds all user sessions
# - Easy namespace-based cleanup
# - Predictable memory layout
```

### 2.2 Secondary Indexes (Manual)

```
# Session index for user sessions
session:index:{user_id} -> SET of session_ids

# Cache tag index for invalidation
cache:tag:{tag} -> SET of cache keys

# Rate limit windows
ratelimit:windows:{api_key_id} -> ZSET of timestamps
```

---

## 3. Qdrant Indexing (Container 419)

### 3.1 Vector Indexes (HNSW)

All collections use HNSW indexes for approximate nearest neighbor search:

| Collection | Dimensions | m | ef_construct | Reason |
|------------|------------|---|--------------|--------|
| documents | 768 | 16 | 100 | Standard retrieval |
| chat_history | 768 | 16 | 64 | Lower precision OK |
| code | 4096 | 24 | 128 | Larger vectors |
| knowledge | 768 | 16 | 100 | High accuracy needed |

### 3.2 Payload Indexes

Qdrant payload indexes enable filtered vector search:

```json
// documents collection
{
  "file_id": "uuid",           // Indexed - filter by file
  "file_type": "keyword",      // Indexed - filter by type
  "tags": "keyword[]",         // Indexed - tag filtering
  "created_at": "datetime",    // Indexed - time filtering
  "document_title": "text"     // Indexed - text search
}

// code collection
{
  "language": "keyword",       // Indexed - language filter
  "repository": "keyword",     // Indexed - repo filter
  "function_name": "keyword",  // Indexed - function search
  "file_path": "text"          // Indexed - path search
}
```

---

## 4. Index Maintenance

### 4.1 PostgreSQL Maintenance

```sql
-- Weekly: Reindex bloated indexes (run during low traffic)
REINDEX INDEX CONCURRENTLY idx_files_items_name;

-- Daily: Update statistics
ANALYZE files.items;
ANALYZE mcp.messages;

-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Find unused indexes
SELECT
    schemaname || '.' || tablename AS table,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
    AND indexrelid NOT IN (
        SELECT conindid FROM pg_constraint
    );

-- Check index bloat
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size
FROM pg_stat_user_indexes;
```

### 4.2 Qdrant Maintenance

```bash
# Trigger optimization for a collection
curl -X POST 'http://localhost:6333/collections/documents/index' \
    -H 'Content-Type: application/json' \
    -d '{"wait": true}'

# Check collection info
curl 'http://localhost:6333/collections/documents'
```

---

## 5. Query Pattern Analysis

### 5.1 Most Common Queries

| Query Pattern | Database | Expected Index | Target Time |
|---------------|----------|----------------|-------------|
| Login (email) | PostgreSQL | idx_users_email | < 1ms |
| Token validation | PostgreSQL | idx_sessions_token_hash | < 1ms |
| File listing | PostgreSQL | idx_files_items_user_folder_uploaded | < 10ms |
| File search | PostgreSQL | idx_files_items_name (GIN) | < 50ms |
| Audit lookup | PostgreSQL | idx_audit_logs_resource | < 20ms |
| Semantic search | pgvector/Qdrant | HNSW | < 100ms |
| Session lookup | Redis | Hash key | < 1ms |
| Rate limit check | Redis | String key | < 1ms |

### 5.2 Index Coverage Verification

```sql
-- Verify query uses expected index
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM files.items
WHERE user_id = 'uuid' AND folder_id = 'uuid'
ORDER BY uploaded_at DESC
LIMIT 20;

-- Should show: Index Scan using idx_files_items_user_folder_uploaded
```

---

## 6. Performance Benchmarks

### 6.1 Expected Performance

| Operation | Volume | Target Latency (p99) |
|-----------|--------|---------------------|
| Simple key lookup | Any | < 5ms |
| Range scan (100 rows) | < 10M rows | < 20ms |
| GIN array containment | < 1M rows | < 50ms |
| Full-text search | < 1M rows | < 100ms |
| Vector similarity (top-10) | < 100K vectors | < 100ms |
| Vector similarity (top-10) | < 1M vectors | < 200ms |

### 6.2 Scaling Thresholds

| Table | Rows | Action Needed |
|-------|------|---------------|
| files.items | > 1M | Consider partitioning |
| audit.logs | > 10M | Extend partition range |
| mcp.messages | > 5M | Archive old conversations |
| embeddings.documents | > 500K | Optimize HNSW parameters |
