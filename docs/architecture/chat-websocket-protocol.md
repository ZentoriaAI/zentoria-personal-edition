# Chat WebSocket Protocol

## Overview

WebSocket protocol for real-time streaming of AI responses, typing indicators,
and session events. Follows the existing pattern from `websocket.ts`.

---

## Connection

### Endpoint

```
wss://ai.zentoria.ai/ws/chat
wss://ai.zentoria.ai/ws/chat/{sessionId}  # Session-specific
```

### Authentication

Authentication is required via the first message after connection:

```json
{
  "type": "auth",
  "token": "znt_test_sk_..." // API key or JWT
}
```

**Response (success):**
```json
{
  "type": "auth_success",
  "userId": "user_123",
  "sessionId": "sess_abc123" // If connected to session-specific endpoint
}
```

**Response (failure):**
```json
{
  "type": "auth_error",
  "error": "Invalid token",
  "code": "INVALID_TOKEN"
}
```

Connection is closed with code 1008 on auth failure.

---

## Message Types

### Client -> Server

| Type | Description | Payload |
|------|-------------|---------|
| `auth` | Authenticate connection | `{ token: string }` |
| `subscribe` | Subscribe to session | `{ sessionId: string }` |
| `unsubscribe` | Unsubscribe from session | `{ sessionId: string }` |
| `message` | Send chat message | `SendMessagePayload` |
| `typing_start` | User started typing | `{ sessionId: string }` |
| `typing_stop` | User stopped typing | `{ sessionId: string }` |
| `cancel` | Cancel streaming response | `{ messageId: string }` |
| `ping` | Keep-alive ping | `{}` |

### Server -> Client

| Type | Description | Payload |
|------|-------------|---------|
| `connected` | Connection established | `{ clientId: string }` |
| `auth_success` | Authentication successful | `{ userId: string }` |
| `auth_error` | Authentication failed | `{ error: string, code: string }` |
| `subscribed` | Subscribed to session | `{ sessionId: string }` |
| `unsubscribed` | Unsubscribed from session | `{ sessionId: string }` |
| `message_created` | User message created | `Message` |
| `stream_start` | AI response streaming started | `StreamStartPayload` |
| `stream_chunk` | AI response chunk | `StreamChunkPayload` |
| `stream_end` | AI response complete | `StreamEndPayload` |
| `stream_error` | AI response error | `StreamErrorPayload` |
| `stream_cancelled` | AI response cancelled | `{ messageId: string }` |
| `typing` | User typing indicator | `TypingPayload` |
| `message_updated` | Message was edited | `Message` |
| `message_deleted` | Message was deleted | `{ messageId: string }` |
| `session_updated` | Session metadata changed | `Session` |
| `canvas_created` | New canvas extracted | `Canvas` |
| `canvas_updated` | Canvas content changed | `Canvas` |
| `pong` | Keep-alive response | `{ timestamp: number }` |
| `error` | General error | `{ error: string, code: string }` |

---

## Payload Definitions

### SendMessagePayload

```typescript
interface SendMessagePayload {
  type: 'message';
  sessionId: string;
  content: string;
  attachmentIds?: string[];
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}
```

### StreamStartPayload

```typescript
interface StreamStartPayload {
  type: 'stream_start';
  messageId: string;      // ID of the assistant message being created
  sessionId: string;
  model: string;
  timestamp: string;      // ISO timestamp
}
```

### StreamChunkPayload

```typescript
interface StreamChunkPayload {
  type: 'stream_chunk';
  messageId: string;
  content: string;        // Incremental content chunk
  index: number;          // Chunk index for ordering
  timestamp: string;
}
```

### StreamEndPayload

```typescript
interface StreamEndPayload {
  type: 'stream_end';
  messageId: string;
  sessionId: string;
  content: string;        // Full message content
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'max_tokens' | 'cancelled';
  canvases?: Canvas[];    // Extracted code blocks
  timestamp: string;
}
```

### StreamErrorPayload

```typescript
interface StreamErrorPayload {
  type: 'stream_error';
  messageId: string;
  error: string;
  code: string;
  retryable: boolean;
  timestamp: string;
}
```

### TypingPayload

```typescript
interface TypingPayload {
  type: 'typing';
  sessionId: string;
  userId: string;
  isTyping: boolean;
  timestamp: string;
}
```

---

## Flow Diagrams

### Send Message (Streaming)

```
Client                                  Server                              AI Orchestrator
  |                                        |                                      |
  |-- message (content) ------------------>|                                      |
  |                                        |                                      |
  |<-- message_created (user msg) ---------|                                      |
  |<-- stream_start (assistant msg) -------|                                      |
  |                                        |                                      |
  |                                        |-- POST /api/v1/chat (stream) ------->|
  |                                        |                                      |
  |                                        |<-- SSE: chunk 1 ---------------------|
  |<-- stream_chunk (chunk 1) -------------|                                      |
  |                                        |                                      |
  |                                        |<-- SSE: chunk 2 ---------------------|
  |<-- stream_chunk (chunk 2) -------------|                                      |
  |                                        |                                      |
  |                                        |<-- SSE: [DONE] ----------------------|
  |<-- stream_end (full content) ----------|                                      |
  |                                        |                                      |
  |                                        |-- Update message in DB ------------->|
  |                                        |                                      |
```

### Cancel Streaming

```
Client                                  Server
  |                                        |
  |-- cancel (messageId) ----------------->|
  |                                        |
  |                                        |-- Abort AI request
  |                                        |
  |<-- stream_cancelled (messageId) -------|
```

### Multiple Clients (Same Session)

```
Client A                 Server                  Client B
  |                         |                        |
  |-- subscribe ----------->|                        |
  |<-- subscribed ----------|                        |
  |                         |                        |
  |                         |<----- subscribe -------|
  |                         |------ subscribed ----->|
  |                         |                        |
  |-- typing_start -------->|                        |
  |                         |------ typing --------->|
  |                         |                        |
  |-- message ------------->|                        |
  |<-- message_created -----|------ message_created->|
  |<-- stream_start --------|------ stream_start --->|
  |<-- stream_chunk --------|------ stream_chunk --->|
  |<-- stream_end ----------|------ stream_end ----->|
```

---

## Implementation

### WebSocket Handler

```typescript
/**
 * Chat WebSocket Routes
 * Path: /ws/chat
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { logger } from '../infrastructure/logger.js';
import type { ContainerCradle } from '../container.js';

interface ChatClient {
  id: string;
  userId: string | null;
  ws: WebSocket;
  subscribedSessions: Set<string>;
  authenticated: boolean;
}

// Client registry (in production, use Redis pub/sub for multi-instance)
const clients = new Map<string, ChatClient>();
const sessionClients = new Map<string, Set<string>>(); // sessionId -> clientIds

export const chatWebsocketRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const {
    chatMessageService,
    chatSessionService,
    apiKeyService,
    auditRepository,
  } = fastify.container.cradle as ContainerCradle;

  /**
   * Main chat WebSocket endpoint
   */
  fastify.get('/chat', { websocket: true }, (connection, request) => {
    const ws = connection.socket;
    const clientId = `ws_${nanoid(12)}`;

    const client: ChatClient = {
      id: clientId,
      userId: null,
      ws,
      subscribedSessions: new Set(),
      authenticated: false,
    };

    clients.set(clientId, client);
    logger.info({ clientId }, 'Chat WebSocket client connected');

    // Send connection acknowledgement
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Send auth message to authenticate',
    }));

    // Handle messages
    ws.on('message', async (rawData: Buffer) => {
      try {
        const message = JSON.parse(rawData.toString());
        await handleMessage(fastify, client, message);
      } catch (err) {
        logger.error({ err, clientId }, 'WebSocket message error');
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
          code: 'INVALID_MESSAGE',
        }));
      }
    });

    // Handle close
    ws.on('close', () => {
      cleanupClient(client);
      logger.info({ clientId }, 'Chat WebSocket client disconnected');
    });

    // Handle errors
    ws.on('error', (err) => {
      logger.error({ err, clientId }, 'WebSocket error');
      cleanupClient(client);
    });
  });

  /**
   * Session-specific WebSocket endpoint
   */
  fastify.get('/chat/:sessionId', { websocket: true }, async (connection, request) => {
    const { sessionId } = request.params as { sessionId: string };
    const ws = connection.socket;
    const clientId = `ws_${nanoid(12)}`;

    const client: ChatClient = {
      id: clientId,
      userId: null,
      ws,
      subscribedSessions: new Set([sessionId]),
      authenticated: false,
    };

    clients.set(clientId, client);
    logger.info({ clientId, sessionId }, 'Session WebSocket client connected');

    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      sessionId,
      message: 'Send auth message to authenticate and subscribe',
    }));

    ws.on('message', async (rawData: Buffer) => {
      try {
        const message = JSON.parse(rawData.toString());
        await handleMessage(fastify, client, message, sessionId);
      } catch (err) {
        logger.error({ err, clientId }, 'WebSocket message error');
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
          code: 'INVALID_MESSAGE',
        }));
      }
    });

    ws.on('close', () => {
      cleanupClient(client);
    });

    ws.on('error', (err) => {
      logger.error({ err, clientId }, 'WebSocket error');
      cleanupClient(client);
    });
  });
};

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(
  fastify: FastifyInstance,
  client: ChatClient,
  message: any,
  autoSubscribeSession?: string
): Promise<void> {
  const { chatMessageService, apiKeyService, chatSessionService } =
    fastify.container.cradle as ContainerCradle;

  switch (message.type) {
    case 'auth':
      await handleAuth(fastify, client, message.token, autoSubscribeSession);
      break;

    case 'subscribe':
      if (!requireAuth(client)) return;
      await handleSubscribe(client, message.sessionId, chatSessionService);
      break;

    case 'unsubscribe':
      if (!requireAuth(client)) return;
      handleUnsubscribe(client, message.sessionId);
      break;

    case 'message':
      if (!requireAuth(client)) return;
      await handleSendMessage(client, message, chatMessageService);
      break;

    case 'typing_start':
      if (!requireAuth(client)) return;
      broadcastToSession(message.sessionId, {
        type: 'typing',
        sessionId: message.sessionId,
        userId: client.userId,
        isTyping: true,
        timestamp: new Date().toISOString(),
      }, client.id);
      break;

    case 'typing_stop':
      if (!requireAuth(client)) return;
      broadcastToSession(message.sessionId, {
        type: 'typing',
        sessionId: message.sessionId,
        userId: client.userId,
        isTyping: false,
        timestamp: new Date().toISOString(),
      }, client.id);
      break;

    case 'cancel':
      if (!requireAuth(client)) return;
      await handleCancel(client, message.messageId, chatMessageService);
      break;

    case 'ping':
      client.ws.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now(),
      }));
      break;

    default:
      client.ws.send(JSON.stringify({
        type: 'error',
        error: `Unknown message type: ${message.type}`,
        code: 'UNKNOWN_TYPE',
      }));
  }
}

/**
 * Handle authentication
 */
async function handleAuth(
  fastify: FastifyInstance,
  client: ChatClient,
  token: string,
  autoSubscribeSession?: string
): Promise<void> {
  const { apiKeyService, chatSessionService } = fastify.container.cradle as ContainerCradle;

  try {
    let userId: string | null = null;

    // Try API key
    if (token.startsWith('znt_')) {
      const keyData = await apiKeyService.validateKey(token);
      if (keyData) {
        userId = keyData.userId;
      }
    }

    // Try JWT
    if (!userId) {
      try {
        const decoded = await fastify.jwt.verify<{ sub: string }>(token);
        userId = decoded.sub;
      } catch {
        // JWT validation failed
      }
    }

    if (!userId) {
      client.ws.send(JSON.stringify({
        type: 'auth_error',
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      }));
      client.ws.close(1008, 'Authentication failed');
      return;
    }

    client.userId = userId;
    client.authenticated = true;

    client.ws.send(JSON.stringify({
      type: 'auth_success',
      userId,
    }));

    // Auto-subscribe to session if specified
    if (autoSubscribeSession) {
      await handleSubscribe(client, autoSubscribeSession, chatSessionService);
    }

    logger.info({ clientId: client.id, userId }, 'WebSocket client authenticated');
  } catch (err) {
    logger.error({ err }, 'WebSocket auth error');
    client.ws.send(JSON.stringify({
      type: 'auth_error',
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
    }));
    client.ws.close(1008, 'Authentication failed');
  }
}

/**
 * Handle session subscription
 */
async function handleSubscribe(
  client: ChatClient,
  sessionId: string,
  sessionService: any
): Promise<void> {
  // Verify user has access to session
  const session = await sessionService.getSession(client.userId!, sessionId);
  if (!session) {
    client.ws.send(JSON.stringify({
      type: 'error',
      error: 'Session not found or access denied',
      code: 'SESSION_NOT_FOUND',
    }));
    return;
  }

  client.subscribedSessions.add(sessionId);

  // Track in session -> clients map
  if (!sessionClients.has(sessionId)) {
    sessionClients.set(sessionId, new Set());
  }
  sessionClients.get(sessionId)!.add(client.id);

  client.ws.send(JSON.stringify({
    type: 'subscribed',
    sessionId,
  }));
}

/**
 * Handle session unsubscription
 */
function handleUnsubscribe(client: ChatClient, sessionId: string): void {
  client.subscribedSessions.delete(sessionId);

  const sessionClientSet = sessionClients.get(sessionId);
  if (sessionClientSet) {
    sessionClientSet.delete(client.id);
    if (sessionClientSet.size === 0) {
      sessionClients.delete(sessionId);
    }
  }

  client.ws.send(JSON.stringify({
    type: 'unsubscribed',
    sessionId,
  }));
}

/**
 * Handle send message with streaming
 */
async function handleSendMessage(
  client: ChatClient,
  payload: any,
  messageService: any
): Promise<void> {
  const { sessionId, content, attachmentIds, model, systemPrompt, temperature, maxTokens } = payload;

  if (!client.subscribedSessions.has(sessionId)) {
    client.ws.send(JSON.stringify({
      type: 'error',
      error: 'Not subscribed to session',
      code: 'NOT_SUBSCRIBED',
    }));
    return;
  }

  try {
    // Create user message
    const result = await messageService.sendMessage(client.userId!, sessionId, {
      content,
      attachmentIds,
      stream: true,
      model,
      systemPrompt,
      temperature,
      maxTokens,
    });

    // Broadcast user message to all subscribed clients
    broadcastToSession(sessionId, {
      type: 'message_created',
      message: result.userMessage,
    });

    // Stream is handled by the service which calls broadcastStreamChunk
  } catch (err: any) {
    logger.error({ err, clientId: client.id }, 'Send message error');
    client.ws.send(JSON.stringify({
      type: 'stream_error',
      error: err.message || 'Failed to send message',
      code: err.code || 'SEND_ERROR',
      retryable: false,
      timestamp: new Date().toISOString(),
    }));
  }
}

/**
 * Handle streaming cancellation
 */
async function handleCancel(
  client: ChatClient,
  messageId: string,
  messageService: any
): Promise<void> {
  // Implementation depends on how streaming is managed
  // Typically involves aborting the fetch request to AI Orchestrator
  logger.info({ clientId: client.id, messageId }, 'Stream cancellation requested');

  // Broadcast cancellation
  client.ws.send(JSON.stringify({
    type: 'stream_cancelled',
    messageId,
  }));
}

/**
 * Broadcast message to all clients subscribed to a session
 */
export function broadcastToSession(
  sessionId: string,
  message: any,
  excludeClientId?: string
): void {
  const clientIds = sessionClients.get(sessionId);
  if (!clientIds) return;

  const payload = JSON.stringify(message);

  for (const clientId of clientIds) {
    if (clientId === excludeClientId) continue;

    const client = clients.get(clientId);
    if (client && client.ws.readyState === 1) { // OPEN
      try {
        client.ws.send(payload);
      } catch (err) {
        logger.error({ err, clientId }, 'Failed to send WebSocket message');
      }
    }
  }
}

/**
 * Broadcast stream chunk to session
 */
export function broadcastStreamChunk(
  sessionId: string,
  messageId: string,
  content: string,
  index: number
): void {
  broadcastToSession(sessionId, {
    type: 'stream_chunk',
    messageId,
    content,
    index,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast stream end to session
 */
export function broadcastStreamEnd(
  sessionId: string,
  messageId: string,
  content: string,
  model: string,
  usage: any,
  finishReason: string,
  canvases?: any[]
): void {
  broadcastToSession(sessionId, {
    type: 'stream_end',
    messageId,
    sessionId,
    content,
    model,
    usage,
    finishReason,
    canvases,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Check if client is authenticated
 */
function requireAuth(client: ChatClient): boolean {
  if (!client.authenticated) {
    client.ws.send(JSON.stringify({
      type: 'error',
      error: 'Not authenticated',
      code: 'NOT_AUTHENTICATED',
    }));
    return false;
  }
  return true;
}

/**
 * Cleanup client on disconnect
 */
function cleanupClient(client: ChatClient): void {
  // Remove from all session subscriptions
  for (const sessionId of client.subscribedSessions) {
    const sessionClientSet = sessionClients.get(sessionId);
    if (sessionClientSet) {
      sessionClientSet.delete(client.id);
      if (sessionClientSet.size === 0) {
        sessionClients.delete(sessionId);
      }
    }
  }

  // Remove from clients map
  clients.delete(client.id);
}
```

---

## Multi-Instance Scaling

For horizontal scaling, use Redis pub/sub:

```typescript
import { createClient } from 'redis';

const publisher = createClient({ url: process.env.REDIS_URL });
const subscriber = createClient({ url: process.env.REDIS_URL });

// Subscribe to session channels
async function subscribeToSessionChannel(sessionId: string): Promise<void> {
  await subscriber.subscribe(`chat:session:${sessionId}`, (message) => {
    const data = JSON.parse(message);
    broadcastToSession(sessionId, data);
  });
}

// Publish to session channel
async function publishToSession(sessionId: string, message: any): Promise<void> {
  await publisher.publish(
    `chat:session:${sessionId}`,
    JSON.stringify(message)
  );
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_TOKEN` | Authentication token is invalid |
| `AUTH_ERROR` | General authentication error |
| `INVALID_MESSAGE` | Message format is invalid |
| `UNKNOWN_TYPE` | Unknown message type |
| `NOT_AUTHENTICATED` | Action requires authentication |
| `NOT_SUBSCRIBED` | Action requires session subscription |
| `SESSION_NOT_FOUND` | Session not found or access denied |
| `SEND_ERROR` | Failed to send message |
| `STREAM_ERROR` | Error during AI streaming |
| `RATE_LIMITED` | Too many messages |

---

## Heartbeat / Keep-Alive

Clients should send ping every 30 seconds:

```typescript
// Client-side
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);
```

Server closes connections that don't ping for 60 seconds (configurable).
