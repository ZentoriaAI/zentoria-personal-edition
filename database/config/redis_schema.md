# Zentoria Personal Edition - Redis Data Architecture

**Container:** 410 (zentoria-redis)
**Port:** 6379
**Version:** Redis 7.2+

## Overview

Redis serves as the primary cache, message queue, and real-time event system for Zentoria Personal Edition.

---

## 1. Database Allocation

Redis supports 16 databases (0-15). We allocate them by purpose:

| DB | Purpose | Description |
|----|---------|-------------|
| 0 | Sessions | User sessions and JWT tokens |
| 1 | API Cache | API response caching |
| 2 | Job Queues | n8n and background job queues |
| 3 | Pub/Sub | Real-time event channels |
| 4 | AI Memory | Short-term AI conversation context |
| 5 | Rate Limiting | API rate limit counters |
| 6 | Locks | Distributed locks |
| 7 | Metrics | Temporary metrics aggregation |
| 8-15 | Reserved | Future use |

---

## 2. Key Naming Convention

All keys follow a consistent naming pattern:
```
{service}:{entity}:{identifier}:{optional_suffix}
```

Examples:
- `session:user:uuid:data`
- `cache:api:files:list:hash`
- `queue:n8n:executions`
- `ai:memory:conv:uuid`

---

## 3. Database 0: Sessions

### User Sessions
```
session:user:{user_id}:{session_id}
```

**Type:** Hash
**TTL:** 3600 seconds (1 hour, sliding)

**Fields:**
```json
{
  "user_id": "uuid",
  "email": "admin@zentoria.local",
  "created_at": "2026-01-16T10:00:00Z",
  "last_activity": "2026-01-16T10:30:00Z",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "device_fingerprint": "hash",
  "refresh_token_hash": "sha256_hash"
}
```

### Session Index (for listing all user sessions)
```
session:index:{user_id}
```

**Type:** Set
**TTL:** None (managed by session cleanup)

**Values:** Set of session_ids

### JWT Blacklist (revoked tokens)
```
session:blacklist:{token_jti}
```

**Type:** String (value: "1")
**TTL:** Token's remaining validity time

---

## 4. Database 1: API Cache

### Response Cache
```
cache:api:{endpoint}:{method}:{params_hash}
```

**Type:** String (JSON)
**TTL:** Varies by endpoint (see below)

**TTL Policies by Endpoint:**

| Endpoint Pattern | TTL | Reason |
|-----------------|-----|--------|
| `/api/v1/files/list` | 30s | Frequently updated |
| `/api/v1/files/{id}` | 300s | Specific file metadata |
| `/api/v1/settings/*` | 3600s | Rarely changes |
| `/api/v1/workflows/list` | 60s | Moderately updated |
| `/api/v1/ai/models` | 86400s | Very stable |
| Default | 60s | Safe default |

### Cache Tags (for invalidation)
```
cache:tag:{tag_name}
```

**Type:** Set
**TTL:** None (managed by cache invalidation)

**Values:** Set of cache keys to invalidate together

Example tags:
- `cache:tag:files` - All file-related caches
- `cache:tag:user:{user_id}` - All caches for a user

### Cache Metadata
```
cache:meta:{cache_key}
```

**Type:** Hash
**TTL:** Same as cache entry

**Fields:**
```json
{
  "created_at": "timestamp",
  "hits": "count",
  "size_bytes": "number"
}
```

---

## 5. Database 2: Job Queues

### n8n Execution Queue
```
queue:n8n:executions
```

**Type:** List (FIFO)
**TTL:** None

**Item Format (JSON string):**
```json
{
  "id": "uuid",
  "workflow_id": "n8n_id",
  "trigger_type": "webhook|schedule|manual",
  "trigger_data": {},
  "priority": 0,
  "created_at": "timestamp",
  "retry_count": 0
}
```

### Priority Queues
```
queue:n8n:priority:{level}
```
Where level is: `high`, `normal`, `low`

**Type:** Sorted Set
**Score:** Unix timestamp (for ordering)

### Queue Statistics
```
queue:stats:{queue_name}
```

**Type:** Hash
**TTL:** None

**Fields:**
```json
{
  "total_processed": "count",
  "total_failed": "count",
  "avg_process_time_ms": "number",
  "last_processed_at": "timestamp"
}
```

### Dead Letter Queue
```
queue:dlq:{queue_name}
```

**Type:** List
**TTL:** 604800 (7 days)

---

## 6. Database 3: Pub/Sub Channels

### Channel Naming
```
pubsub:{domain}:{event_type}
```

### Available Channels

| Channel | Purpose | Message Format |
|---------|---------|----------------|
| `pubsub:files:uploaded` | New file uploaded | `{file_id, user_id, name}` |
| `pubsub:files:processed` | File processing complete | `{file_id, status}` |
| `pubsub:ai:response` | AI response streaming | `{conversation_id, chunk}` |
| `pubsub:workflow:started` | Workflow execution started | `{execution_id, workflow_id}` |
| `pubsub:workflow:completed` | Workflow execution done | `{execution_id, status, result}` |
| `pubsub:system:notification` | System notifications | `{type, message, severity}` |
| `pubsub:audit:event` | Real-time audit events | `{action, resource, user}` |

### Message Format
```json
{
  "event": "event_type",
  "timestamp": "2026-01-16T10:00:00Z",
  "payload": {},
  "source": "service_name"
}
```

---

## 7. Database 4: AI Memory

### Conversation Context (Short-term)
```
ai:memory:conv:{conversation_id}
```

**Type:** List (recent messages)
**TTL:** 3600 (1 hour after last activity)
**Max Length:** 50 messages

**Item Format:**
```json
{
  "role": "user|assistant|system",
  "content": "message content",
  "timestamp": "iso8601",
  "tokens": 150
}
```

### User Context (Cross-conversation)
```
ai:memory:user:{user_id}
```

**Type:** Hash
**TTL:** 86400 (24 hours)

**Fields:**
```json
{
  "recent_topics": ["topic1", "topic2"],
  "preferences": "{}",
  "last_conversation_id": "uuid",
  "total_tokens_today": "count"
}
```

### RAG Context Cache
```
ai:rag:query:{query_hash}
```

**Type:** String (JSON array of relevant chunks)
**TTL:** 1800 (30 minutes)

### Model Response Cache (for identical prompts)
```
ai:response:{model}:{prompt_hash}
```

**Type:** String
**TTL:** 300 (5 minutes, for repeated queries)

---

## 8. Database 5: Rate Limiting

### API Rate Limits
```
ratelimit:api:{api_key_id}:{window}
```
Where window is: `minute`, `hour`, `day`

**Type:** String (counter)
**TTL:** Window duration

### IP Rate Limits
```
ratelimit:ip:{ip_address}:{endpoint}:{window}
```

**Type:** String (counter)
**TTL:** Window duration

### Rate Limit Configuration
```
ratelimit:config:{api_key_id}
```

**Type:** Hash
**TTL:** None

**Fields:**
```json
{
  "per_minute": "60",
  "per_hour": "1000",
  "per_day": "10000",
  "burst": "10"
}
```

### Sliding Window (for more accurate limiting)
```
ratelimit:sliding:{identifier}:{endpoint}
```

**Type:** Sorted Set
**Score:** Unix timestamp (ms)
**Values:** Request IDs
**TTL:** Window duration

---

## 9. Database 6: Distributed Locks

### Resource Locks
```
lock:{resource_type}:{resource_id}
```

**Type:** String
**Value:** `{owner_id}:{timestamp}:{ttl}`
**TTL:** Lock duration (default 30s)

### Lock Queue (for fair locking)
```
lock:queue:{resource_type}:{resource_id}
```

**Type:** List
**TTL:** None (cleaned up with lock release)

### Common Lock Resources

| Resource Pattern | Purpose | Default TTL |
|-----------------|---------|-------------|
| `lock:file:{file_id}` | File processing | 60s |
| `lock:workflow:{workflow_id}` | Workflow execution | 300s |
| `lock:user:{user_id}:session` | Session creation | 5s |
| `lock:cache:invalidate` | Cache invalidation | 10s |

---

## 10. Database 7: Metrics

### Counter Metrics
```
metrics:counter:{metric_name}:{dimension}
```

**Type:** String (counter)
**TTL:** 300 (aggregated every 5 minutes to permanent storage)

### Gauge Metrics
```
metrics:gauge:{metric_name}:{dimension}
```

**Type:** String
**TTL:** 60 (updated frequently)

### Histogram Metrics (for latencies)
```
metrics:histogram:{metric_name}:{bucket}
```

**Type:** String (counter per bucket)
**TTL:** 300

### Common Metrics

| Metric | Type | Dimensions |
|--------|------|------------|
| `api_requests_total` | Counter | endpoint, method, status |
| `api_latency_ms` | Histogram | endpoint |
| `ai_tokens_used` | Counter | model, type |
| `active_sessions` | Gauge | - |
| `queue_depth` | Gauge | queue_name |
| `file_uploads_bytes` | Counter | - |

---

## 11. TTL Policies Summary

| Data Type | Default TTL | Max TTL | Notes |
|-----------|-------------|---------|-------|
| Sessions | 3600s | 86400s | Sliding window |
| API Cache | 60s | 86400s | Varies by endpoint |
| Job Queue Items | None | - | Processed items removed |
| AI Memory | 3600s | 86400s | Sliding window |
| Rate Limits | Window | - | Auto-cleanup |
| Locks | 30s | 300s | With heartbeat |
| Metrics | 300s | - | Aggregated to DB |

---

## 12. Memory Management

### Eviction Policy
```
maxmemory-policy volatile-lru
```

Evict keys with TTL using LRU when memory limit reached.

### Memory Limits per Database (Recommended)

| DB | Max Memory | Priority |
|----|------------|----------|
| 0 (Sessions) | 256MB | High |
| 1 (Cache) | 512MB | Medium |
| 2 (Queues) | 128MB | High |
| 3 (Pub/Sub) | 64MB | Low |
| 4 (AI Memory) | 256MB | Medium |
| 5 (Rate Limits) | 64MB | High |
| 6 (Locks) | 32MB | Critical |
| 7 (Metrics) | 128MB | Low |

**Total Recommended:** 2GB minimum, 4GB recommended

---

## 13. Redis Configuration

See `redis.conf` for full configuration.

Key settings:
```conf
# Memory
maxmemory 4gb
maxmemory-policy volatile-lru

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Security
requirepass CHANGE_ME_IN_VAULT
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command DEBUG ""

# Performance
tcp-keepalive 300
timeout 0
tcp-backlog 511

# Logging
loglevel notice
logfile /var/log/redis/redis-server.log
```

---

## 14. Backup Strategy

### RDB Snapshots
- Every 15 minutes if 1+ key changed
- Every 5 minutes if 10+ keys changed
- Every 60 seconds if 10000+ keys changed

### AOF (Append Only File)
- Enabled with `everysec` fsync
- Rewrite at 100% growth or 64MB min

### Backup Schedule
- Hourly: RDB snapshot to MinIO
- Daily: Full backup with AOF to backup container
- Weekly: Backup verification test

---

## 15. Monitoring

### Key Metrics to Monitor
- `redis_connected_clients`
- `redis_used_memory`
- `redis_evicted_keys`
- `redis_keyspace_hits/misses`
- `redis_expired_keys`
- `redis_commands_processed`

### Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Memory Usage | >70% | >90% |
| Connected Clients | >100 | >500 |
| Evicted Keys/min | >10 | >100 |
| Hit Ratio | <80% | <50% |
