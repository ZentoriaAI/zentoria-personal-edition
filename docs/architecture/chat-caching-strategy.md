# Chat Caching Strategy

## Overview

Redis caching strategy for the Enhanced Chat Interface, following existing patterns
from `api-key.repository.ts` and `session.repository.ts`.

---

## Cache Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                         │
│  ChatSessionService  │  ChatMessageService  │  FolderService    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                         Cache Layer                              │
│  SessionCache  │  FolderCache  │  SettingsCache  │  AgentCache  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                           Redis                                  │
│  Strings  │  Hashes  │  Sorted Sets  │  Pub/Sub                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cache Keys

### Naming Convention

```
chat:{entity}:{id}
chat:{entity}:{userId}:{subkey}
```

### Key Patterns

| Pattern | Purpose | TTL |
|---------|---------|-----|
| `chat:session:{sessionId}` | Session metadata | 15 min |
| `chat:session:{sessionId}:messages:recent` | Recent messages (last 50) | 5 min |
| `chat:sessions:{userId}:list` | User's session list (first page) | 5 min |
| `chat:sessions:{userId}:count` | Total session count | 5 min |
| `chat:folder:{folderId}` | Folder metadata | 30 min |
| `chat:folders:{userId}:tree` | User's folder tree | 30 min |
| `chat:settings:{userId}` | User chat settings | 1 hour |
| `chat:agents:list` | All enabled agents | 1 hour |
| `chat:agent:{agentId}` | Agent details | 1 hour |
| `chat:streaming:{messageId}` | Active streaming state | 5 min |
| `chat:typing:{sessionId}` | Typing indicators (hash) | 30 sec |

---

## Cache Implementation

### 1. Session Cache

```typescript
/**
 * Session Cache
 *
 * Caches session metadata and recent messages for fast access.
 */

import type { RedisClientType } from 'redis';
import type { SessionRecord } from '../repositories/session.repository.js';

const CACHE_TTL = {
  SESSION: 900,           // 15 minutes
  RECENT_MESSAGES: 300,   // 5 minutes
  SESSION_LIST: 300,      // 5 minutes
  SESSION_COUNT: 300,     // 5 minutes
};

export class SessionCache {
  constructor(private readonly redis: RedisClientType) {}

  // -------------------------------------------------------------------------
  // Session Metadata
  // -------------------------------------------------------------------------

  async get(sessionId: string): Promise<SessionRecord | null> {
    const data = await this.redis.get(`chat:session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async set(session: SessionRecord): Promise<void> {
    await this.redis.setEx(
      `chat:session:${session.id}`,
      CACHE_TTL.SESSION,
      JSON.stringify(session)
    );
  }

  async invalidate(sessionId: string): Promise<void> {
    await this.redis.del(`chat:session:${sessionId}`);
  }

  // -------------------------------------------------------------------------
  // Session List (for sidebar)
  // -------------------------------------------------------------------------

  async getList(userId: string): Promise<SessionRecord[] | null> {
    const data = await this.redis.get(`chat:sessions:${userId}:list`);
    return data ? JSON.parse(data) : null;
  }

  async setList(userId: string, sessions: SessionRecord[]): Promise<void> {
    await this.redis.setEx(
      `chat:sessions:${userId}:list`,
      CACHE_TTL.SESSION_LIST,
      JSON.stringify(sessions)
    );
  }

  async invalidateList(userId: string): Promise<void> {
    await this.redis.del(`chat:sessions:${userId}:list`);
  }

  // -------------------------------------------------------------------------
  // Session Count
  // -------------------------------------------------------------------------

  async getCount(userId: string): Promise<number | null> {
    const count = await this.redis.get(`chat:sessions:${userId}:count`);
    return count ? parseInt(count, 10) : null;
  }

  async setCount(userId: string, count: number): Promise<void> {
    await this.redis.setEx(
      `chat:sessions:${userId}:count`,
      CACHE_TTL.SESSION_COUNT,
      count.toString()
    );
  }

  async incrementCount(userId: string): Promise<void> {
    const key = `chat:sessions:${userId}:count`;
    const exists = await this.redis.exists(key);
    if (exists) {
      await this.redis.incr(key);
    }
  }

  async decrementCount(userId: string): Promise<void> {
    const key = `chat:sessions:${userId}:count`;
    const exists = await this.redis.exists(key);
    if (exists) {
      await this.redis.decr(key);
    }
  }

  // -------------------------------------------------------------------------
  // Recent Messages
  // -------------------------------------------------------------------------

  async getRecentMessages(sessionId: string): Promise<any[] | null> {
    const data = await this.redis.get(`chat:session:${sessionId}:messages:recent`);
    return data ? JSON.parse(data) : null;
  }

  async setRecentMessages(sessionId: string, messages: any[]): Promise<void> {
    await this.redis.setEx(
      `chat:session:${sessionId}:messages:recent`,
      CACHE_TTL.RECENT_MESSAGES,
      JSON.stringify(messages)
    );
  }

  async appendMessage(sessionId: string, message: any): Promise<void> {
    // Get existing messages
    const existing = await this.getRecentMessages(sessionId);
    if (!existing) return;

    // Append and trim to 50
    const updated = [...existing, message].slice(-50);

    await this.setRecentMessages(sessionId, updated);
  }

  async invalidateMessages(sessionId: string): Promise<void> {
    await this.redis.del(`chat:session:${sessionId}:messages:recent`);
  }

  // -------------------------------------------------------------------------
  // Bulk Invalidation
  // -------------------------------------------------------------------------

  async invalidateUserCaches(userId: string): Promise<void> {
    const keys = await this.redis.keys(`chat:sessions:${userId}:*`);
    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }
}
```

### 2. Folder Cache

```typescript
/**
 * Folder Cache
 *
 * Caches folder tree structure for sidebar navigation.
 */

import type { RedisClientType } from 'redis';
import type { FolderRecord } from '../repositories/folder.repository.js';

const CACHE_TTL = {
  FOLDER: 1800,     // 30 minutes
  FOLDER_TREE: 1800 // 30 minutes
};

export class FolderCache {
  constructor(private readonly redis: RedisClientType) {}

  // -------------------------------------------------------------------------
  // Single Folder
  // -------------------------------------------------------------------------

  async get(folderId: string): Promise<FolderRecord | null> {
    const data = await this.redis.get(`chat:folder:${folderId}`);
    return data ? JSON.parse(data) : null;
  }

  async set(folder: FolderRecord): Promise<void> {
    await this.redis.setEx(
      `chat:folder:${folder.id}`,
      CACHE_TTL.FOLDER,
      JSON.stringify(folder)
    );
  }

  async invalidate(folderId: string): Promise<void> {
    await this.redis.del(`chat:folder:${folderId}`);
  }

  // -------------------------------------------------------------------------
  // Folder Tree
  // -------------------------------------------------------------------------

  async getTree(userId: string): Promise<any[] | null> {
    const data = await this.redis.get(`chat:folders:${userId}:tree`);
    return data ? JSON.parse(data) : null;
  }

  async setTree(userId: string, tree: any[]): Promise<void> {
    await this.redis.setEx(
      `chat:folders:${userId}:tree`,
      CACHE_TTL.FOLDER_TREE,
      JSON.stringify(tree)
    );
  }

  async invalidateTree(userId: string): Promise<void> {
    await this.redis.del(`chat:folders:${userId}:tree`);
  }

  // -------------------------------------------------------------------------
  // Bulk Invalidation
  // -------------------------------------------------------------------------

  async invalidateUserFolders(userId: string): Promise<void> {
    await this.invalidateTree(userId);
    // Individual folder caches don't need userId-based invalidation
  }
}
```

### 3. Settings Cache

```typescript
/**
 * Settings Cache
 *
 * Caches user chat settings with longer TTL.
 */

import type { RedisClientType } from 'redis';
import type { SettingsRecord } from '../repositories/settings.repository.js';

const CACHE_TTL = 3600; // 1 hour

export class SettingsCache {
  constructor(private readonly redis: RedisClientType) {}

  async get(userId: string): Promise<SettingsRecord | null> {
    const data = await this.redis.get(`chat:settings:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  async set(settings: SettingsRecord): Promise<void> {
    await this.redis.setEx(
      `chat:settings:${settings.userId}`,
      CACHE_TTL,
      JSON.stringify(settings)
    );
  }

  async invalidate(userId: string): Promise<void> {
    await this.redis.del(`chat:settings:${userId}`);
  }
}
```

### 4. Agent Cache

```typescript
/**
 * Agent Cache
 *
 * Caches agent list and details (rarely changes).
 */

import type { RedisClientType } from 'redis';

const CACHE_TTL = 3600; // 1 hour

export class AgentCache {
  constructor(private readonly redis: RedisClientType) {}

  // -------------------------------------------------------------------------
  // Agent List
  // -------------------------------------------------------------------------

  async getList(): Promise<any[] | null> {
    const data = await this.redis.get('chat:agents:list');
    return data ? JSON.parse(data) : null;
  }

  async setList(agents: any[]): Promise<void> {
    await this.redis.setEx(
      'chat:agents:list',
      CACHE_TTL,
      JSON.stringify(agents)
    );
  }

  async invalidateList(): Promise<void> {
    await this.redis.del('chat:agents:list');
  }

  // -------------------------------------------------------------------------
  // Single Agent
  // -------------------------------------------------------------------------

  async get(agentId: string): Promise<any | null> {
    const data = await this.redis.get(`chat:agent:${agentId}`);
    return data ? JSON.parse(data) : null;
  }

  async set(agent: any): Promise<void> {
    await this.redis.setEx(
      `chat:agent:${agent.id}`,
      CACHE_TTL,
      JSON.stringify(agent)
    );
  }

  async invalidate(agentId: string): Promise<void> {
    await this.redis.del(`chat:agent:${agentId}`);
  }

  // -------------------------------------------------------------------------
  // Bulk Invalidation (for admin updates)
  // -------------------------------------------------------------------------

  async invalidateAll(): Promise<void> {
    const keys = await this.redis.keys('chat:agent*');
    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }
}
```

### 5. Streaming State Cache

```typescript
/**
 * Streaming State Cache
 *
 * Tracks active streaming responses for cancellation and recovery.
 */

import type { RedisClientType } from 'redis';

const CACHE_TTL = 300; // 5 minutes

interface StreamingState {
  messageId: string;
  sessionId: string;
  userId: string;
  model: string;
  startedAt: string;
  chunks: number;
  content: string;
}

export class StreamingCache {
  constructor(private readonly redis: RedisClientType) {}

  async get(messageId: string): Promise<StreamingState | null> {
    const data = await this.redis.get(`chat:streaming:${messageId}`);
    return data ? JSON.parse(data) : null;
  }

  async set(state: StreamingState): Promise<void> {
    await this.redis.setEx(
      `chat:streaming:${state.messageId}`,
      CACHE_TTL,
      JSON.stringify(state)
    );
  }

  async appendChunk(messageId: string, content: string): Promise<void> {
    const state = await this.get(messageId);
    if (!state) return;

    state.content += content;
    state.chunks += 1;

    await this.set(state);
  }

  async delete(messageId: string): Promise<void> {
    await this.redis.del(`chat:streaming:${messageId}`);
  }

  async isStreaming(messageId: string): Promise<boolean> {
    return (await this.redis.exists(`chat:streaming:${messageId}`)) > 0;
  }

  async isSessionStreaming(sessionId: string): Promise<boolean> {
    // Check if any message in session is streaming
    const keys = await this.redis.keys('chat:streaming:*');
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const state = JSON.parse(data) as StreamingState;
        if (state.sessionId === sessionId) return true;
      }
    }
    return false;
  }
}
```

### 6. Typing Indicator Cache

```typescript
/**
 * Typing Indicator Cache
 *
 * Uses Redis hash with short TTL for typing indicators.
 */

import type { RedisClientType } from 'redis';

const TYPING_TTL = 30; // 30 seconds

export class TypingCache {
  constructor(private readonly redis: RedisClientType) {}

  async setTyping(sessionId: string, userId: string): Promise<void> {
    const key = `chat:typing:${sessionId}`;
    await this.redis.hSet(key, userId, Date.now().toString());
    await this.redis.expire(key, TYPING_TTL);
  }

  async clearTyping(sessionId: string, userId: string): Promise<void> {
    await this.redis.hDel(`chat:typing:${sessionId}`, userId);
  }

  async getTypingUsers(sessionId: string): Promise<string[]> {
    const key = `chat:typing:${sessionId}`;
    const users = await this.redis.hGetAll(key);
    const now = Date.now();
    const activeUsers: string[] = [];

    for (const [userId, timestamp] of Object.entries(users)) {
      // Filter out stale entries (older than 10 seconds)
      if (now - parseInt(timestamp, 10) < 10000) {
        activeUsers.push(userId);
      }
    }

    return activeUsers;
  }
}
```

---

## Cache Patterns

### Cache-Aside Pattern

Used for most entities:

```typescript
async getSession(userId: string, sessionId: string): Promise<Session | null> {
  // 1. Check cache
  const cached = await this.sessionCache.get(sessionId);
  if (cached) {
    // Verify ownership
    if (cached.userId !== userId) return null;
    return cached;
  }

  // 2. Load from database
  const session = await this.sessionRepository.findById(sessionId);
  if (!session || session.userId !== userId) return null;

  // 3. Cache result
  await this.sessionCache.set(session);

  return session;
}
```

### Write-Through Pattern

Used when immediate consistency is important:

```typescript
async updateSession(
  userId: string,
  sessionId: string,
  data: UpdateSessionInput
): Promise<Session> {
  // 1. Update database
  const session = await this.sessionRepository.update(sessionId, data);

  // 2. Update cache
  await this.sessionCache.set(session);

  // 3. Invalidate related caches
  await this.sessionCache.invalidateList(userId);

  return session;
}
```

### Cache Invalidation

```typescript
async deleteSession(userId: string, sessionId: string): Promise<void> {
  // 1. Delete from database
  await this.sessionRepository.delete(sessionId);

  // 2. Invalidate caches
  await Promise.all([
    this.sessionCache.invalidate(sessionId),
    this.sessionCache.invalidateMessages(sessionId),
    this.sessionCache.invalidateList(userId),
    this.sessionCache.decrementCount(userId),
  ]);
}
```

---

## Cache Warmup

Warm frequently accessed data on server start:

```typescript
async warmCache(): Promise<void> {
  this.logger.info('Warming cache...');

  // Warm agent list (used by all users)
  const agents = await this.agentRepository.findEnabled();
  await this.agentCache.setList(agents);

  this.logger.info('Cache warmup complete');
}
```

---

## Cache Monitoring

Add metrics for cache performance:

```typescript
import { Counter, Histogram } from 'prom-client';

const cacheHits = new Counter({
  name: 'chat_cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['entity'],
});

const cacheMisses = new Counter({
  name: 'chat_cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['entity'],
});

const cacheLatency = new Histogram({
  name: 'chat_cache_latency_seconds',
  help: 'Cache operation latency',
  labelNames: ['operation', 'entity'],
});
```

---

## Redis Memory Management

### Memory Limits

Configure Redis max memory policy:

```
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### Key Expiration

All keys have explicit TTL:
- Short-lived: 30s - 5min (typing, recent messages)
- Medium: 15-30min (sessions, folders)
- Long: 1 hour (settings, agents)

### Cleanup Job

Optional periodic cleanup for orphaned keys:

```typescript
async cleanupOrphanedKeys(): Promise<void> {
  // Run daily
  const pattern = 'chat:streaming:*';
  const keys = await this.redis.keys(pattern);

  for (const key of keys) {
    const ttl = await this.redis.ttl(key);
    if (ttl === -1) { // No expiry set
      await this.redis.expire(key, 300);
    }
  }
}
```

---

## Cache Constants

Add to `config/constants.ts`:

```typescript
export const CHAT_CACHE = {
  // TTLs in seconds
  SESSION_TTL: envInt('CHAT_SESSION_CACHE_TTL', 900),        // 15 min
  MESSAGES_TTL: envInt('CHAT_MESSAGES_CACHE_TTL', 300),      // 5 min
  FOLDER_TTL: envInt('CHAT_FOLDER_CACHE_TTL', 1800),         // 30 min
  SETTINGS_TTL: envInt('CHAT_SETTINGS_CACHE_TTL', 3600),     // 1 hour
  AGENT_TTL: envInt('CHAT_AGENT_CACHE_TTL', 3600),           // 1 hour
  STREAMING_TTL: envInt('CHAT_STREAMING_CACHE_TTL', 300),    // 5 min
  TYPING_TTL: envInt('CHAT_TYPING_CACHE_TTL', 30),           // 30 sec

  // Limits
  MAX_CACHED_MESSAGES: 50,
  MAX_CACHED_SESSIONS: 100,
} as const;
```
