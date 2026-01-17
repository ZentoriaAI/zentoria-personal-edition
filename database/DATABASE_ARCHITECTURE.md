# Zentoria Personal Edition - Database Architecture

## Executive Summary

This document provides a complete database architecture for Zentoria Personal Edition, covering three database technologies across four containers:

| Container | Technology | Purpose | Port |
|-----------|------------|---------|------|
| 404 (zentoria-db) | PostgreSQL 16 + pgvector | Primary data store | 5432 (direct), 6432 (pooled) |
| 410 (zentoria-redis) | Redis 7.2 | Cache, queues, sessions | 6379 |
| 419 (zentoria-embeddings) | Qdrant | Vector similarity search | 6333, 6334 |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ZENTORIA DATA LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PostgreSQL (Container 404)                        │    │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │    │
│  │  │ zentoria_main   │ │zentoria_vectors │ │       n8n       │        │    │
│  │  │                 │ │                 │ │                 │        │    │
│  │  │ - core.users    │ │ - embeddings.*  │ │ - public.*      │        │    │
│  │  │ - api.keys      │ │   documents     │ │   (n8n managed) │        │    │
│  │  │ - files.*       │ │   chat_history  │ │                 │        │    │
│  │  │ - audit.logs    │ │   code          │ │ - zentoria_*    │        │    │
│  │  │ - mcp.*         │ │   knowledge     │ │   (integration) │        │    │
│  │  │ - workflows.*   │ │                 │ │                 │        │    │
│  │  │ - settings.*    │ │ [pgvector]      │ │                 │        │    │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘        │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────┐        │    │
│  │  │                    PgBouncer (Port 6432)                 │        │    │
│  │  │  Transaction pooling | 500 max clients | 100 pool size   │        │    │
│  │  └─────────────────────────────────────────────────────────┘        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Redis (Container 410)                           │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │    │
│  │  │ DB 0   │ │ DB 1   │ │ DB 2   │ │ DB 3   │ │ DB 4   │ │ DB 5   │  │    │
│  │  │Sessions│ │ Cache  │ │ Queues │ │Pub/Sub │ │AI Mem  │ │RateLim │  │    │
│  │  │1h TTL  │ │60s TTL │ │No TTL  │ │No TTL  │ │1h TTL  │ │Window  │  │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │    │
│  │  4GB maxmemory | volatile-lru eviction | AOF persistence            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Qdrant (Container 419)                           │    │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │    │
│  │  │   documents     │ │  chat_history   │ │      code       │        │    │
│  │  │   768-dim       │ │   768-dim       │ │   4096-dim      │        │    │
│  │  │   HNSW m=16     │ │   HNSW m=16     │ │   HNSW m=24     │        │    │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘        │    │
│  │  ┌─────────────────┐                                                 │    │
│  │  │   knowledge     │  HTTP :6333 | gRPC :6334 | Cosine distance     │    │
│  │  │   768-dim       │                                                 │    │
│  │  │   HNSW m=16     │                                                 │    │
│  │  └─────────────────┘                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. PostgreSQL Databases

### 1.1 zentoria_main

**Purpose:** Core application data storage

**Schemas:**

| Schema | Tables | Purpose |
|--------|--------|---------|
| `core` | users, sessions | User management |
| `api` | keys, key_usage | API key management |
| `files` | folders, items, thumbnails | File metadata |
| `audit` | logs (partitioned) | Audit trail |
| `mcp` | conversations, messages, commands | AI interaction history |
| `workflows` | definitions, executions | n8n integration |
| `settings` | app | Application configuration |

**Key Features:**
- UUID primary keys throughout
- Partitioned audit logs by month
- Comprehensive indexing (B-tree, GIN, partial)
- Automatic timestamp triggers
- Row-level security ready

### 1.2 zentoria_vectors

**Purpose:** AI embeddings storage with pgvector

**Schema:**

| Table | Dimensions | Index | Use Case |
|-------|------------|-------|----------|
| embeddings.documents | 768 | HNSW | Document RAG |
| embeddings.chat_history | 768 | HNSW | Conversation context |
| embeddings.code | 4096 | HNSW | Code search |
| embeddings.knowledge | 768 | HNSW | Knowledge base |

**Search Functions:**
- `search_documents()` - Semantic document search
- `search_chat_context()` - Find relevant conversation history
- `search_code()` - Code similarity search
- `search_knowledge()` - Knowledge base search

### 1.3 n8n

**Purpose:** Workflow engine data (managed by n8n)

**Zentoria Integration Schema:**
- `webhook_registry` - Registered webhooks
- `scheduled_triggers` - Cron jobs
- `execution_queue` - Job queue backup
- `credential_mapping` - Vault integration

---

## 2. Redis Data Structures

### 2.1 Database Allocation

| DB | Purpose | Key Pattern | TTL |
|----|---------|-------------|-----|
| 0 | Sessions | `session:user:{id}:{sid}` | 1 hour (sliding) |
| 1 | API Cache | `cache:api:{endpoint}:{hash}` | 60s-86400s |
| 2 | Job Queues | `queue:n8n:*` | None |
| 3 | Pub/Sub | `pubsub:{domain}:{event}` | None |
| 4 | AI Memory | `ai:memory:conv:{id}` | 1 hour |
| 5 | Rate Limiting | `ratelimit:{type}:{id}:{window}` | Window |
| 6 | Locks | `lock:{resource}:{id}` | 30s |
| 7 | Metrics | `metrics:{type}:{name}` | 5 min |

### 2.2 Key Pub/Sub Channels

| Channel | Purpose |
|---------|---------|
| `pubsub:files:uploaded` | New file notification |
| `pubsub:ai:response` | AI response streaming |
| `pubsub:workflow:completed` | Workflow completion |
| `pubsub:system:notification` | System alerts |

---

## 3. Qdrant Collections

### 3.1 Collection Specifications

| Collection | Vectors | Dimensions | Distance | HNSW m |
|------------|---------|------------|----------|--------|
| documents | nomic-embed-text | 768 | Cosine | 16 |
| chat_history | nomic-embed-text | 768 | Cosine | 16 |
| code | codellama | 4096 | Cosine | 24 |
| knowledge | nomic-embed-text | 768 | Cosine | 16 |

### 3.2 Payload Schema (documents)

```json
{
  "file_id": "uuid",
  "chunk_index": 0,
  "content": "text content",
  "document_title": "title",
  "file_type": "pdf",
  "tags": ["tag1", "tag2"],
  "created_at": "2026-01-16T00:00:00Z"
}
```

---

## 4. Connection Pooling

### 4.1 PgBouncer Configuration

| Parameter | Value |
|-----------|-------|
| Pool Mode | transaction |
| Max Clients | 500 |
| Default Pool Size | 20 |
| Min Pool Size | 5 |
| Max DB Connections | 50 |

### 4.2 Connection Distribution

| Service | Pool | Max Connections |
|---------|------|-----------------|
| Backend API | zentoria_main | 40 |
| Backend API | zentoria_vectors | 20 |
| n8n | n8n | 20 |
| AI Orchestrator | zentoria_vectors | 30 |

---

## 5. Backup Strategy

### 5.1 Schedule

| Component | Frequency | Retention |
|-----------|-----------|-----------|
| PostgreSQL (hourly) | Every hour | 7 days |
| PostgreSQL (daily) | 02:00 AM | 30 days |
| PostgreSQL (weekly) | Sunday 03:00 AM | 12 weeks |
| Redis | Every 6 hours | 7 days |
| Qdrant | Daily 02:00 AM | 30 days |

### 5.2 Storage Tiers

1. **Local:** Fast restore (each container)
2. **MinIO:** Centralized storage (Container 407)
3. **OneDrive:** Offsite backup (via rclone)

---

## 6. Performance Targets

| Operation | Target Latency (p99) |
|-----------|---------------------|
| Simple lookup | < 5ms |
| Range scan (100 rows) | < 20ms |
| Full-text search | < 100ms |
| Vector search (top-10) | < 100ms |
| Session lookup (Redis) | < 1ms |

---

## 7. Files Created

### Migrations

| File | Database | Purpose |
|------|----------|---------|
| `001_zentoria_main_schema.sql` | zentoria_main | Core tables |
| `002_zentoria_vectors_schema.sql` | zentoria_vectors | Embedding tables |
| `003_n8n_database_schema.sql` | n8n | Integration tables |

### Configuration

| File | Service | Purpose |
|------|---------|---------|
| `postgresql.conf` | PostgreSQL | Server configuration |
| `pgbouncer.ini` | PgBouncer | Connection pooling |
| `redis.conf` | Redis | Server configuration |
| `qdrant_collections.json` | Qdrant | Collection schemas |

### Scripts

| Script | Purpose |
|--------|---------|
| `init_databases.sh` | Initialize all PostgreSQL databases |
| `init_qdrant.sh` | Create Qdrant collections |
| `backup_postgresql.sh` | PostgreSQL backup |
| `backup_redis.sh` | Redis backup |
| `backup_qdrant.sh` | Qdrant snapshot backup |

### Documentation

| File | Content |
|------|---------|
| `redis_schema.md` | Redis data structures |
| `indexing_strategy.md` | Index design |
| `backup_schedule.md` | Backup procedures |
| `connection_pooling.md` | Pool configuration |

---

## 8. Deployment Steps

### Step 1: PostgreSQL Setup

```bash
# SSH into container 404
ssh proxmox "pct exec 404 -- bash"

# Copy configuration
cp /opt/zentoria/db/config/postgresql.conf /etc/postgresql/16/main/
systemctl restart postgresql

# Run initialization
cd /opt/zentoria/db/scripts
./init_databases.sh
```

### Step 2: PgBouncer Setup

```bash
# Install PgBouncer
apt install pgbouncer

# Copy configuration
cp /opt/zentoria/db/config/pgbouncer.ini /etc/pgbouncer/

# Update passwords in userlist.txt from Vault
# ...

systemctl restart pgbouncer
```

### Step 3: Redis Setup

```bash
# SSH into container 410
ssh proxmox "pct exec 410 -- bash"

# Copy configuration
cp /opt/zentoria/redis/config/redis.conf /etc/redis/

# Update password
sed -i 's/ZENTORIA_REDIS_PASSWORD_CHANGE_ME/actual_password/' /etc/redis/redis.conf

systemctl restart redis
```

### Step 4: Qdrant Setup

```bash
# SSH into container 419
ssh proxmox "pct exec 419 -- bash"

# Run Qdrant (Docker)
docker run -d --name qdrant \
    -p 6333:6333 -p 6334:6334 \
    -v /opt/zentoria/embeddings/qdrant/storage:/qdrant/storage \
    qdrant/qdrant

# Initialize collections
./init_qdrant.sh
```

### Step 5: Verify Setup

```bash
# Test PostgreSQL
psql -h zentoria-db -p 6432 -U zentoria_app -d zentoria_main -c "SELECT 1"

# Test Redis
redis-cli -h zentoria-redis PING

# Test Qdrant
curl http://zentoria-embeddings:6333/collections
```

---

## 9. Security Considerations

1. **All passwords in HashiCorp Vault** (Container 403)
2. **Network isolation** via firewall rules
3. **Encrypted backups** before offsite transfer
4. **Audit logging** on all sensitive operations
5. **Connection limits** per role
6. **TLS for all connections** (recommended)

---

## 10. Monitoring

### Grafana Dashboards

- PostgreSQL Performance
- Redis Metrics
- Qdrant Collection Stats
- Backup Status
- Connection Pool Health

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Connection usage | > 70% | > 90% |
| Query latency (p99) | > 500ms | > 2s |
| Backup age | > 2h | > 6h |
| Redis memory | > 70% | > 90% |
| Qdrant search latency | > 200ms | > 1s |
