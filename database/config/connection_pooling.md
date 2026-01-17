# Zentoria Personal Edition - Connection Pooling Configuration

## Overview

This document describes the connection pooling strategy for all database connections in Zentoria Personal Edition.

---

## 1. Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐
│  Frontend (400) │     │  Backend (401)  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │    ┌──────────────────┤
         │    │                  │
         ▼    ▼                  ▼
    ┌─────────────────┐    ┌─────────────────┐
    │  PgBouncer      │    │  Redis (410)    │
    │  Port 6432      │    │  Port 6379      │
    └────────┬────────┘    └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │  PostgreSQL     │
    │  Port 5432      │
    │  (404)          │
    └─────────────────┘
```

---

## 2. PostgreSQL Connection Pooling (PgBouncer)

### 2.1 Pool Configuration

| Parameter          | Value       | Rationale                                    |
| ------------------ | ----------- | -------------------------------------------- |
| pool_mode          | transaction | Best balance of efficiency and compatibility |
| max_client_conn    | 500         | Handle burst of connections                  |
| default_pool_size  | 20          | Connections per user/db pair                 |
| min_pool_size      | 5           | Keep connections warm                        |
| reserve_pool_size  | 5           | Emergency connections                        |
| max_db_connections | 50          | Limit per database                           |

### 2.2 Connection Distribution

| Service          | Database         | Pool Size | Max Connections |
| ---------------- | ---------------- | --------- | --------------- |
| Backend API      | zentoria_main    | 20        | 40              |
| Backend API      | zentoria_vectors | 10        | 20              |
| n8n              | zentoria_main    | 5         | 10              |
| n8n              | n8n              | 10        | 20              |
| AI Orchestrator  | zentoria_main    | 5         | 10              |
| AI Orchestrator  | zentoria_vectors | 15        | 30              |
| Admin/Monitoring | All              | 5         | 10              |
| **Total**        |                  |           | **~140**        |

### 2.3 Pool Modes Comparison

| Mode            | When to Use               | Compatibility | Efficiency |
| --------------- | ------------------------- | ------------- | ---------- |
| **session**     | Legacy apps, SET commands | High          | Low        |
| **transaction** | Most applications         | Medium        | High       |
| **statement**   | Simple read-heavy apps    | Low           | Highest    |

**Recommendation:** Use `transaction` mode for all Zentoria services.

### 2.4 Application Connection Strings

```env
# Backend API (Node.js/Fastify)
DATABASE_URL=postgresql://zentoria_app:password@zentoria-db:6432/zentoria_main?sslmode=prefer

# For pgvector operations
VECTOR_DATABASE_URL=postgresql://zentoria_app:password@zentoria-db:6432/zentoria_vectors?sslmode=prefer

# n8n
DB_POSTGRESDB_HOST=zentoria-db
DB_POSTGRESDB_PORT=6432
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=n8n_app

# AI Orchestrator (Python)
DATABASE_URL=postgresql+asyncpg://zentoria_app:password@zentoria-db:6432/zentoria_main
```

### 2.5 Connection Limits by Role

```sql
-- PostgreSQL role configuration
ALTER ROLE zentoria_app CONNECTION LIMIT 50;
ALTER ROLE n8n_app CONNECTION LIMIT 20;
ALTER ROLE readonly CONNECTION LIMIT 10;
ALTER ROLE postgres CONNECTION LIMIT 10;
```

---

## 3. Redis Connection Pooling

### 3.1 Client-Side Pooling

Redis connections are pooled at the client level (each service manages its own pool).

**Node.js (ioredis) Configuration:**

```javascript
const Redis = require('ioredis');

const redis = new Redis({
  host: 'zentoria-redis',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0, // Select database

  // Connection pool settings
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,

  // Reconnection
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },

  // Connection timeout
  connectTimeout: 10000,
  commandTimeout: 5000,

  // Keep-alive
  keepAlive: 30000,
});
```

**Python (redis-py) Configuration:**

```python
import redis

pool = redis.ConnectionPool(
    host='zentoria-redis',
    port=6379,
    password=os.environ.get('REDIS_PASSWORD'),
    db=0,
    max_connections=20,
    socket_timeout=5,
    socket_connect_timeout=10,
    retry_on_timeout=True,
    health_check_interval=30,
)

redis_client = redis.Redis(connection_pool=pool)
```

### 3.2 Connection Distribution by Database

| Service         | Database        | Max Connections | Purpose              |
| --------------- | --------------- | --------------- | -------------------- |
| Backend API     | 0 (Sessions)    | 20              | Session management   |
| Backend API     | 1 (Cache)       | 30              | API response cache   |
| n8n             | 2 (Queues)      | 15              | Job queues           |
| Backend API     | 5 (Rate Limits) | 10              | Rate limiting        |
| AI Orchestrator | 4 (AI Memory)   | 20              | Conversation context |
| Pub/Sub         | 3 (Pub/Sub)     | 10              | Real-time events     |
| **Total**       |                 | **~105**        |                      |

### 3.3 Redis Server Limits

```conf
# redis.conf
maxclients 1000
```

---

## 4. Qdrant Connection Management

### 4.1 HTTP Client Configuration

Qdrant uses HTTP/gRPC, so standard HTTP client pooling applies.

**Node.js (axios) Configuration:**

```javascript
const axios = require('axios');
const https = require('https');

const qdrantClient = axios.create({
  baseURL: 'http://zentoria-embeddings:6333',
  timeout: 30000,
  httpAgent: new http.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
  }),
});
```

**Python (qdrant-client) Configuration:**

```python
from qdrant_client import QdrantClient

client = QdrantClient(
    host='zentoria-embeddings',
    port=6333,
    timeout=30,
    prefer_grpc=True,  # gRPC is more efficient
    grpc_port=6334,
)
```

### 4.2 Connection Limits

| Operation             | Recommended Concurrency | Timeout |
| --------------------- | ----------------------- | ------- |
| Vector search         | 10                      | 5s      |
| Batch upsert          | 5                       | 30s     |
| Collection operations | 2                       | 60s     |

---

## 5. Monitoring Connection Pools

### 5.1 PgBouncer Monitoring

```sql
-- Connect to PgBouncer admin console
psql -h zentoria-db -p 6432 -U pgbouncer pgbouncer

-- Show pool status
SHOW POOLS;

-- Show server connections
SHOW SERVERS;

-- Show client connections
SHOW CLIENTS;

-- Show statistics
SHOW STATS;

-- Show memory usage
SHOW MEM;
```

**Key Metrics:**
| Metric | Warning | Critical |
|--------|---------|----------|
| cl_active | > 80% of max | > 95% of max |
| sv_active | > 80% of max | > 95% of max |
| avg_wait_time | > 100ms | > 500ms |
| pool errors | > 0 | > 10/min |

### 5.2 PostgreSQL Connection Monitoring

```sql
-- Current connections by application
SELECT
    application_name,
    state,
    COUNT(*) as count
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY application_name, state
ORDER BY count DESC;

-- Connection usage by database
SELECT
    datname,
    numbackends,
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_conn,
    ROUND(100.0 * numbackends / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 2) as pct
FROM pg_stat_database
WHERE datname IS NOT NULL
ORDER BY numbackends DESC;

-- Long-running queries (potential connection hogs)
SELECT
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE state != 'idle'
    AND now() - pg_stat_activity.query_start > interval '30 seconds';
```

### 5.3 Redis Connection Monitoring

```bash
# Connect to Redis
redis-cli -h zentoria-redis -p 6379 -a $REDIS_PASSWORD

# Show connected clients
CLIENT LIST

# Show connection stats
INFO clients

# Show memory stats
INFO memory
```

**Key Metrics:**
| Metric | Warning | Critical |
|--------|---------|----------|
| connected_clients | > 500 | > 900 |
| blocked_clients | > 10 | > 50 |
| rejected_connections | > 0 | > 10/min |

---

## 6. Connection Best Practices

### 6.1 Application Guidelines

1. **Always use connection pooling**
   
   - Never create direct connections in hot paths
   - Use PgBouncer for PostgreSQL
   - Use client-side pools for Redis

2. **Set appropriate timeouts**
   
   - Query timeout: 30s for most queries
   - Connection timeout: 10s
   - Idle timeout: 60s

3. **Handle connection errors gracefully**
   
   - Implement retry logic with backoff
   - Don't retry non-idempotent operations
   - Log connection failures

4. **Release connections promptly**
   
   - In transaction mode, commit/rollback quickly
   - Don't hold connections during I/O waits
   - Use async patterns where possible

### 6.2 Anti-Patterns to Avoid

| Anti-Pattern           | Problem            | Solution                |
| ---------------------- | ------------------ | ----------------------- |
| Connection per request | Exhausts pool      | Use shared pool         |
| Long transactions      | Holds connections  | Break into smaller txns |
| No timeout             | Zombie connections | Set query_timeout       |
| Ignoring errors        | Connection leaks   | Proper error handling   |
| Too many pools         | Resource waste     | Centralize pooling      |

### 6.3 Emergency Procedures

**Connection pool exhaustion:**

```bash
# PgBouncer: Terminate idle connections
psql -h zentoria-db -p 6432 pgbouncer -c "KILL zentoria_main"

# PostgreSQL: Terminate idle connections
psql -h zentoria-db -U postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE state = 'idle'
    AND query_start < NOW() - INTERVAL '30 minutes';
"

# Redis: Force client disconnection
redis-cli -h zentoria-redis CLIENT KILL TYPE normal
```

---

## 7. Configuration Files Summary

| File               | Container | Purpose                  |
| ------------------ | --------- | ------------------------ |
| `postgresql.conf`  | 404       | PostgreSQL server config |
| `pgbouncer.ini`    | 404       | Connection pooler config |
| `userlist.txt`     | 404       | PgBouncer auth file      |
| `redis.conf`       | 410       | Redis server config      |
| Application `.env` | Various   | Connection strings       |
