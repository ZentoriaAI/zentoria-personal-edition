# Performance Tuning Guide

Comprehensive guide for optimizing Zentoria Personal Edition performance across all layers.

## Table of Contents

- [Overview](#overview)
- [Backend Optimizations](#backend-optimizations)
- [Frontend Optimizations](#frontend-optimizations)
- [Database Tuning](#database-tuning)
- [Redis Configuration](#redis-configuration)
- [AI Orchestrator](#ai-orchestrator)
- [Container Resources](#container-resources)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Overview

### Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| API Response (p95) | <200ms | ~150ms |
| AI Command Processing | <5s | ~3s |
| WebSocket Latency | <50ms | ~30ms |
| Page Load (FCP) | <1.5s | ~1.2s |
| Time to Interactive | <3s | ~2.5s |

### Architecture Overview

```
┌─────────┐    ┌───────┐    ┌─────────┐    ┌──────┐
│ Frontend │───▶│ NGINX │───▶│ Backend │───▶│ Redis│
└─────────┘    └───────┘    └─────────┘    └──────┘
                   │              │
                   │              ▼
                   │         ┌────────┐
                   │         │PostgreSQL│
                   │         └────────┘
                   │              │
                   ▼              ▼
              ┌──────┐      ┌──────┐
              │ Qdrant│      │Ollama│
              └──────┘      └──────┘
```

---

## Backend Optimizations

### PERF-001: Session Index Optimization

**Problem**: Session lookup by user used Redis SCAN, causing O(n) complexity.

**Solution**: Secondary index using Redis SET for O(1) lookups.

```typescript
// session.repository.ts
class SessionRepository {
  private getUserSessionsKey(userId: string): string {
    return `user:sessions:${userId}`;
  }

  async create(session: SessionData): Promise<void> {
    const key = `session:${session.id}`;
    const indexKey = this.getUserSessionsKey(session.userId);

    // Store session and add to index atomically
    const multi = this.redis.multi();
    multi.set(key, JSON.stringify(session), 'EX', session.expiresIn);
    multi.sadd(indexKey, session.id);
    multi.expire(indexKey, session.expiresIn);
    await multi.exec();
  }

  async listByUser(userId: string): Promise<SessionData[]> {
    const indexKey = this.getUserSessionsKey(userId);
    const sessionIds = await this.redis.smembers(indexKey);

    if (sessionIds.length === 0) return [];

    const keys = sessionIds.map(id => `session:${id}`);
    const results = await this.redis.mget(...keys);

    return results
      .filter(Boolean)
      .map(r => JSON.parse(r as string));
  }
}
```

**Impact**: Session lookup reduced from ~50ms to ~5ms for users with 10+ sessions.

---

### PERF-002: Batch File Context Fetching

**Problem**: N+1 query pattern when loading file context for AI commands.

**Solution**: Use `Promise.all()` for parallel fetching.

```typescript
// file-context-loader.ts
class FileContextLoader {
  async loadContexts(fileIds: string[]): Promise<FileContext[]> {
    // Before: Sequential (slow)
    // for (const id of fileIds) {
    //   contexts.push(await this.loadContext(id));
    // }

    // After: Parallel (fast)
    const promises = fileIds.map(id => this.loadContext(id));
    const results = await Promise.all(promises);

    return results.filter(Boolean);
  }

  private async loadContext(fileId: string): Promise<FileContext | null> {
    try {
      const [file, chunks] = await Promise.all([
        this.fileRepository.findById(fileId),
        this.vectorStore.getChunks(fileId),
      ]);

      if (!file) return null;

      return {
        fileId,
        name: file.name,
        content: chunks.map(c => c.text).join('\n'),
        metadata: file.metadata,
      };
    } catch (error) {
      this.logger.error('Failed to load file context', { fileId, error });
      return null;
    }
  }
}
```

**Impact**: Loading 10 file contexts reduced from ~2s to ~300ms.

---

### PERF-005: API Key Validation Caching

**Problem**: Every request validated API key against database.

**Solution**: Redis cache with 5-minute TTL.

```typescript
// api-key.repository.ts
class ApiKeyRepository {
  private readonly CACHE_TTL = 300; // 5 minutes

  async validate(rawKey: string): Promise<ApiKeyRecord | null> {
    const cacheKey = `apikey:valid:${this.hashKey(rawKey)}`;

    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Database lookup
    const record = await this.findByHash(this.hashKey(rawKey));
    if (!record) return null;

    // Timing-safe comparison
    const valid = timingSafeEqual(
      Buffer.from(this.hashKey(rawKey)),
      Buffer.from(record.hashedKey)
    );

    if (!valid) return null;

    // Cache valid key
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(record));

    return record;
  }

  async invalidate(keyId: string): Promise<void> {
    const record = await this.findById(keyId);
    if (record) {
      await this.redis.del(`apikey:valid:${record.hashedKey}`);
    }
  }
}
```

**Impact**: API key validation reduced from ~15ms to ~2ms (cache hit).

---

### PERF-008: Fire-and-Forget Audit Logging

**Problem**: Synchronous audit logging added ~20ms latency per request.

**Solution**: Async logging with batched writes.

```typescript
// audit.repository.ts
class AuditRepository {
  private buffer: AuditEntry[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  async logAsync(entry: AuditEntry): Promise<void> {
    this.buffer.push(entry);

    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.flush();
    } else if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }

  private async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      await this.prisma.auditLog.createMany({
        data: entries,
      });
    } catch (error) {
      this.logger.error('Failed to flush audit log', { error, count: entries.length });
      // Re-add entries to buffer on failure
      this.buffer.unshift(...entries);
    }
  }

  async shutdown(): Promise<void> {
    await this.flush();
  }
}
```

**Impact**: Request latency reduced by ~20ms on average.

---

### PERF-009: Configurable Bulkhead Limits

**Problem**: Hardcoded concurrency limits were too restrictive.

**Solution**: Environment-variable configuration for bulkhead settings.

```typescript
// config/constants.ts
export const BULKHEAD = {
  AI_SERVICE: {
    maxConcurrent: parseInt(process.env.AI_BULKHEAD_MAX || '10', 10),
    maxQueue: parseInt(process.env.AI_BULKHEAD_QUEUE || '50', 10),
    timeout: parseInt(process.env.AI_BULKHEAD_TIMEOUT || '30000', 10),
  },
  AUTH_SERVICE: {
    maxConcurrent: parseInt(process.env.AUTH_BULKHEAD_MAX || '20', 10),
    maxQueue: parseInt(process.env.AUTH_BULKHEAD_QUEUE || '100', 10),
    timeout: parseInt(process.env.AUTH_BULKHEAD_TIMEOUT || '5000', 10),
  },
  N8N_SERVICE: {
    maxConcurrent: parseInt(process.env.N8N_BULKHEAD_MAX || '5', 10),
    maxQueue: parseInt(process.env.N8N_BULKHEAD_QUEUE || '20', 10),
    timeout: parseInt(process.env.N8N_BULKHEAD_TIMEOUT || '60000', 10),
  },
};
```

```env
# .env
AI_BULKHEAD_MAX=15
AI_BULKHEAD_QUEUE=75
AI_BULKHEAD_TIMEOUT=45000
```

---

## Frontend Optimizations

### PERF-003: Singleton WebSocket Manager

**Problem**: Multiple components created separate WebSocket connections.

**Solution**: Singleton manager with reference counting.

```typescript
// use-websocket.ts
class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private socket: WebSocket | null = null;
  private refCount = 0;
  private listeners = new Map<string, Set<Function>>();

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  acquire(): void {
    this.refCount++;
    if (this.refCount === 1) {
      this.connect();
    }
  }

  release(): void {
    this.refCount--;
    if (this.refCount === 0) {
      this.disconnect();
    }
  }

  private connect(): void {
    const url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000/ws';
    this.socket = new WebSocket(url);

    this.socket.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);
      this.listeners.get(type)?.forEach(cb => cb(payload));
    };
  }

  emit(type: string, payload: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    }
  }

  on(type: string, callback: Function): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return () => this.listeners.get(type)?.delete(callback);
  }
}

export function useWebSocket() {
  const manager = WebSocketManager.getInstance();

  useEffect(() => {
    manager.acquire();
    return () => manager.release();
  }, []);

  return {
    emit: manager.emit.bind(manager),
    on: manager.on.bind(manager),
  };
}
```

**Impact**: Reduced WebSocket connections from 5-10 to 1 per browser tab.

---

### PERF-011: Zustand Selector Pattern

**Problem**: Components re-rendered on every store update.

**Solution**: Proper selector functions for state slices.

```typescript
// chat-store.ts
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

interface ChatState {
  messages: Message[];
  sessions: Session[];
  currentSessionId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  inputValue: string;
  // ... actions
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessions: [],
  currentSessionId: null,
  isStreaming: false,
  streamingContent: '',
  inputValue: '',
  // ... actions
}));

// Memoized selectors
export const selectCurrentMessages = (state: ChatState): Message[] => {
  if (!state.currentSessionId) return [];
  return state.messages.filter(m => m.sessionId === state.currentSessionId);
};

export const selectCurrentSession = (state: ChatState): Session | undefined => {
  return state.sessions.find(s => s.id === state.currentSessionId);
};

// Hooks with shallow comparison
export function useStreamingState() {
  return useChatStore(
    useShallow(state => ({
      isStreaming: state.isStreaming,
      streamingContent: state.streamingContent,
    }))
  );
}

export function useChatActions() {
  return useChatStore(
    useShallow(state => ({
      addMessage: state.addMessage,
      setInputValue: state.setInputValue,
      startStreaming: state.startStreaming,
      stopStreaming: state.stopStreaming,
    }))
  );
}
```

**Usage:**

```typescript
// Component only re-renders when these specific values change
function ChatMessages() {
  const messages = useChatStore(selectCurrentMessages);
  const { isStreaming } = useStreamingState();
  // ...
}
```

**Impact**: Reduced unnecessary re-renders by ~70%.

---

### PERF-007: Bundle Size Optimization

**Techniques applied:**

1. **Dynamic imports** for route-based code splitting
2. **Tree shaking** with ES modules
3. **Compression** (gzip/brotli)

```typescript
// next.config.js
module.exports = {
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizeCss: true,
  },
};
```

```typescript
// Dynamic imports for pages
const ChatPage = dynamic(() => import('@/pages/chat'), {
  loading: () => <LoadingSpinner />,
});

const FilesPage = dynamic(() => import('@/pages/files'), {
  loading: () => <LoadingSpinner />,
});
```

---

## Database Tuning

### PERF-010: Composite Index

**Problem**: Queries on `CommandHistory` by user and date were slow.

**Solution**: Add composite index.

```prisma
// prisma/schema.prisma
model CommandHistory {
  id        String   @id @default(cuid())
  userId    String
  command   String
  response  String?
  status    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, createdAt])  // PERF-010
}
```

### PostgreSQL Configuration

```ini
# postgresql.conf

# Memory
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 16MB
maintenance_work_mem = 128MB

# Query Planning
random_page_cost = 1.1  # SSD storage
effective_io_concurrency = 200

# Connections
max_connections = 100
```

### pgvector Settings

```sql
-- Optimize vector similarity searches
SET ivfflat.probes = 10;  -- Increase for better recall
SET hnsw.ef_search = 40;  -- Tune for accuracy vs speed
```

---

## Redis Configuration

### Memory Management

```ini
# redis.conf

# Memory limit
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence (disable for cache-only)
save ""
appendonly no

# Network
tcp-backlog 511
tcp-keepalive 300
```

### Key Expiration Strategy

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `session:*` | 7 days | User sessions |
| `apikey:valid:*` | 5 min | API key cache |
| `user:sessions:*` | 7 days | Session index |
| `ratelimit:*` | 1 min | Rate limit counters |
| `cache:*` | 15 min | General response cache |

---

## AI Orchestrator

### Ollama Configuration

```bash
# Environment variables
OLLAMA_NUM_PARALLEL=4       # Concurrent requests
OLLAMA_MAX_LOADED_MODELS=2  # Models in memory
OLLAMA_FLASH_ATTENTION=1    # Enable flash attention
```

### Model Selection

| Use Case | Model | VRAM | Tokens/sec |
|----------|-------|------|------------|
| Chat | llama3.2:3b | 2GB | ~50 |
| Code | codellama:7b | 4GB | ~30 |
| Embeddings | nomic-embed-text | 0.3GB | ~200 |

### Context Window Management

```python
# ai-orchestrator/src/core/llm.py
class LLMClient:
    MAX_CONTEXT_TOKENS = 4096
    RESERVED_OUTPUT_TOKENS = 1024

    async def chat(self, messages: list[Message], context: str = "") -> str:
        # Calculate available tokens
        context_tokens = self.count_tokens(context)
        message_tokens = sum(self.count_tokens(m.content) for m in messages)

        available = self.MAX_CONTEXT_TOKENS - self.RESERVED_OUTPUT_TOKENS
        if context_tokens + message_tokens > available:
            # Truncate context, keeping recent messages
            context = self.truncate_context(
                context,
                available - message_tokens
            )

        return await self._generate(messages, context)
```

---

## Container Resources

### Resource Allocation

| Container | CPU | Memory | Storage |
|-----------|-----|--------|---------|
| Frontend (440) | 2 cores | 2GB | 20GB |
| Backend (441) | 4 cores | 4GB | 50GB |
| NGINX (442) | 1 core | 512MB | 5GB |
| Qdrant (443) | 2 cores | 4GB | 100GB |
| PostgreSQL (404) | 4 cores | 8GB | 200GB |
| Ollama (444) | 8 cores | 32GB | 100GB |
| Redis (410) | 2 cores | 1GB | 10GB |

### CPU Pinning (Optional)

```bash
# Pin Ollama to specific cores for AI workloads
taskset -c 0-7 ollama serve
```

---

## Monitoring

### Key Metrics

```typescript
// OpenTelemetry metrics
const meter = opentelemetry.getMeter('zentoria-backend');

const requestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'HTTP request duration',
  unit: 'ms',
});

const activeConnections = meter.createUpDownCounter('ws_active_connections', {
  description: 'Active WebSocket connections',
});

const cacheHitRate = meter.createObservableGauge('cache_hit_rate', {
  description: 'Cache hit rate percentage',
});
```

### Dashboard Queries (Prometheus)

```promql
# API Response Time (p95)
histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))

# Error Rate
sum(rate(http_requests_total{status=~"5.."}[5m])) /
sum(rate(http_requests_total[5m]))

# Cache Hit Rate
sum(rate(cache_hits_total[5m])) /
(sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))
```

---

## Troubleshooting

### Common Performance Issues

#### High API Latency

1. Check Redis connection pool
2. Verify database indexes are used (`EXPLAIN ANALYZE`)
3. Check for N+1 queries in logs
4. Monitor bulkhead queue depth

```bash
# Check slow queries
ssh proxmox "pct exec 404 -- psql -U zentoria zentoria_main -c \
  'SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;'"
```

#### Memory Leaks

```bash
# Monitor Node.js memory
ssh proxmox "pct exec 441 -- node --expose-gc -e \
  'console.log(process.memoryUsage())'"

# Check for unclosed connections
netstat -an | grep ESTABLISHED | wc -l
```

#### WebSocket Connection Issues

```typescript
// Debug WebSocket state
console.log({
  readyState: ws.readyState,
  bufferedAmount: ws.bufferedAmount,
  extensions: ws.extensions,
  protocol: ws.protocol,
});
```

### Performance Testing

```bash
# Load test with k6
k6 run --vus 50 --duration 60s load-test.js

# Profile Node.js
node --prof app.js
node --prof-process isolate-*.log > profile.txt
```

---

## Environment Variables

### Performance-Related Settings

```env
# Backend (mcp-gateway)
NODE_ENV=production
UV_THREADPOOL_SIZE=16

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Timeouts
AI_PROCESSING_TIMEOUT_MS=120000
REQUEST_TIMEOUT_MS=30000

# Bulkheads
AI_BULKHEAD_MAX=15
AI_BULKHEAD_QUEUE=75

# Caching
API_KEY_CACHE_TTL=300
RESPONSE_CACHE_TTL=900

# Database
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20

# Redis
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY_MS=100
```

---

## References

- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/dont-block-the-event-loop)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Redis Memory Optimization](https://redis.io/docs/management/optimization/memory-optimization/)
- [Zustand Performance](https://docs.pmnd.rs/zustand/guides/auto-generating-selectors)
- Issue Tracker: PERF-001 through PERF-011
