# Chat Error Handling Patterns

## Overview

Error handling strategy for the Enhanced Chat Interface, extending the existing
`error-handler.ts` patterns. Provides consistent error responses across REST
and WebSocket APIs.

---

## Error Response Format

### REST API

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session 'sess_abc123' not found",
    "details": {
      "sessionId": "sess_abc123"
    },
    "requestId": "req_xyz789"
  }
}
```

### WebSocket

```json
{
  "type": "error",
  "error": "Session not found",
  "code": "SESSION_NOT_FOUND",
  "details": {
    "sessionId": "sess_abc123"
  },
  "timestamp": "2026-01-18T12:00:00.000Z"
}
```

---

## Error Categories

### 1. Client Errors (4xx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid request data |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `INVALID_API_KEY` | 401 | Invalid or expired API key |
| `INVALID_TOKEN` | 401 | Invalid or expired JWT |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `SESSION_NOT_FOUND` | 404 | Chat session not found |
| `MESSAGE_NOT_FOUND` | 404 | Chat message not found |
| `FOLDER_NOT_FOUND` | 404 | Folder not found |
| `AGENT_NOT_FOUND` | 404 | Agent not found |
| `ATTACHMENT_NOT_FOUND` | 404 | Attachment not found |
| `CONFLICT` | 409 | Resource conflict |
| `STREAMING_IN_PROGRESS` | 409 | Session has active streaming |
| `DUPLICATE_ENTRY` | 409 | Resource already exists |
| `ATTACHMENT_EXPIRED` | 410 | Attachment has expired |
| `FILE_TOO_LARGE` | 413 | Uploaded file exceeds limit |
| `INVALID_FILE_TYPE` | 415 | Unsupported file type |
| `RATE_LIMITED` | 429 | Too many requests |

### 2. Server Errors (5xx)

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `ENCRYPTION_ERROR` | 500 | Encryption operation failed |
| `AI_SERVICE_ERROR` | 502 | AI Orchestrator error |
| `STORAGE_ERROR` | 502 | MinIO/storage error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |
| `AI_SERVICE_TIMEOUT` | 504 | AI processing timed out |

### 3. WebSocket-Specific Errors

| Code | Description |
|------|-------------|
| `INVALID_MESSAGE` | Invalid message format |
| `UNKNOWN_TYPE` | Unknown message type |
| `NOT_AUTHENTICATED` | WebSocket not authenticated |
| `NOT_SUBSCRIBED` | Not subscribed to session |
| `STREAM_ERROR` | Error during streaming |
| `STREAM_CANCELLED` | Streaming was cancelled |

---

## Error Factory Extensions

Add to `middleware/error-handler.ts`:

```typescript
/**
 * Chat-specific error factories
 */
export const ChatErrors = {
  // =========================================================================
  // Session Errors
  // =========================================================================

  sessionNotFound: (sessionId: string) =>
    new AppError(
      'SESSION_NOT_FOUND',
      `Session '${sessionId}' not found`,
      404,
      { sessionId }
    ),

  sessionArchived: (sessionId: string) =>
    new AppError(
      'SESSION_ARCHIVED',
      `Session '${sessionId}' is archived and cannot be modified`,
      400,
      { sessionId }
    ),

  sessionAccessDenied: (sessionId: string) =>
    new AppError(
      'SESSION_ACCESS_DENIED',
      `Access denied to session '${sessionId}'`,
      403,
      { sessionId }
    ),

  streamingInProgress: (sessionId: string) =>
    new AppError(
      'STREAMING_IN_PROGRESS',
      `Session '${sessionId}' has an active streaming response. Cancel it first or wait for completion.`,
      409,
      { sessionId }
    ),

  // =========================================================================
  // Message Errors
  // =========================================================================

  messageNotFound: (messageId: string) =>
    new AppError(
      'MESSAGE_NOT_FOUND',
      `Message '${messageId}' not found`,
      404,
      { messageId }
    ),

  cannotEditAssistantMessage: () =>
    new AppError(
      'CANNOT_EDIT_ASSISTANT',
      'Cannot edit assistant messages. Use regenerate instead.',
      400
    ),

  cannotEditDeletedMessage: () =>
    new AppError(
      'CANNOT_EDIT_DELETED',
      'Cannot edit a deleted message',
      400
    ),

  cannotRegenerateUserMessage: () =>
    new AppError(
      'CANNOT_REGENERATE_USER',
      'Cannot regenerate user messages. Only assistant messages can be regenerated.',
      400
    ),

  messageTooLong: (maxLength: number) =>
    new AppError(
      'MESSAGE_TOO_LONG',
      `Message exceeds maximum length of ${maxLength} characters`,
      400,
      { maxLength }
    ),

  emptyMessage: () =>
    new AppError(
      'EMPTY_MESSAGE',
      'Message content cannot be empty',
      400
    ),

  // =========================================================================
  // Folder Errors
  // =========================================================================

  folderNotFound: (folderId: string) =>
    new AppError(
      'FOLDER_NOT_FOUND',
      `Folder '${folderId}' not found`,
      404,
      { folderId }
    ),

  circularFolderReference: (folderId: string, targetId: string) =>
    new AppError(
      'CIRCULAR_REFERENCE',
      'Cannot move folder into its own descendant',
      400,
      { folderId, targetId }
    ),

  folderNameRequired: () =>
    new AppError(
      'FOLDER_NAME_REQUIRED',
      'Folder name is required',
      400
    ),

  folderNameTooLong: (maxLength: number) =>
    new AppError(
      'FOLDER_NAME_TOO_LONG',
      `Folder name exceeds maximum length of ${maxLength} characters`,
      400,
      { maxLength }
    ),

  // =========================================================================
  // Agent Errors
  // =========================================================================

  agentNotFound: (agentId: string) =>
    new AppError(
      'AGENT_NOT_FOUND',
      `Agent '${agentId}' not found`,
      404,
      { agentId }
    ),

  agentDisabled: (agentId: string) =>
    new AppError(
      'AGENT_DISABLED',
      `Agent '${agentId}' is currently disabled`,
      400,
      { agentId }
    ),

  // =========================================================================
  // Attachment Errors
  // =========================================================================

  attachmentNotFound: (attachmentId: string) =>
    new AppError(
      'ATTACHMENT_NOT_FOUND',
      `Attachment '${attachmentId}' not found`,
      404,
      { attachmentId }
    ),

  attachmentExpired: (attachmentId: string) =>
    new AppError(
      'ATTACHMENT_EXPIRED',
      `Attachment '${attachmentId}' has expired. Please upload again.`,
      410,
      { attachmentId }
    ),

  attachmentAccessDenied: (attachmentId: string) =>
    new AppError(
      'ATTACHMENT_ACCESS_DENIED',
      `Access denied to attachment '${attachmentId}'`,
      403,
      { attachmentId }
    ),

  tooManyAttachments: (maxCount: number) =>
    new AppError(
      'TOO_MANY_ATTACHMENTS',
      `Maximum ${maxCount} attachments allowed per message`,
      400,
      { maxCount }
    ),

  invalidAttachment: (attachmentId: string, reason: string) =>
    new AppError(
      'INVALID_ATTACHMENT',
      `Attachment '${attachmentId}' is invalid: ${reason}`,
      400,
      { attachmentId, reason }
    ),

  // =========================================================================
  // Canvas Errors
  // =========================================================================

  canvasNotFound: (canvasId: string) =>
    new AppError(
      'CANVAS_NOT_FOUND',
      `Canvas '${canvasId}' not found`,
      404,
      { canvasId }
    ),

  canvasNotEditable: (canvasId: string) =>
    new AppError(
      'CANVAS_NOT_EDITABLE',
      `Canvas '${canvasId}' is not editable`,
      400,
      { canvasId }
    ),

  canvasVersionNotFound: (canvasId: string, version: number) =>
    new AppError(
      'CANVAS_VERSION_NOT_FOUND',
      `Version ${version} of canvas '${canvasId}' not found`,
      404,
      { canvasId, version }
    ),

  // =========================================================================
  // AI / Streaming Errors
  // =========================================================================

  aiServiceError: (statusCode: number, detail?: string) =>
    new AppError(
      'AI_SERVICE_ERROR',
      detail || `AI service returned error ${statusCode}`,
      502,
      { upstreamStatus: statusCode }
    ),

  aiServiceTimeout: (timeoutMs: number) =>
    new AppError(
      'AI_SERVICE_TIMEOUT',
      `AI processing timed out after ${timeoutMs}ms`,
      504,
      { timeoutMs }
    ),

  aiServiceUnavailable: () =>
    new AppError(
      'AI_SERVICE_UNAVAILABLE',
      'AI service is currently unavailable. Please try again later.',
      503
    ),

  streamError: (messageId: string, detail: string) =>
    new AppError(
      'STREAM_ERROR',
      `Streaming error for message '${messageId}': ${detail}`,
      500,
      { messageId }
    ),

  // =========================================================================
  // Rate Limiting
  // =========================================================================

  rateLimitedChat: (retryAfter: number) =>
    new AppError(
      'RATE_LIMITED',
      `Too many messages. Please wait ${retryAfter} seconds before sending another.`,
      429,
      { retryAfter, type: 'chat' }
    ),

  rateLimitedUpload: (retryAfter: number) =>
    new AppError(
      'RATE_LIMITED',
      `Too many uploads. Please wait ${retryAfter} seconds.`,
      429,
      { retryAfter, type: 'upload' }
    ),

  // =========================================================================
  // Settings Errors
  // =========================================================================

  invalidSettingValue: (setting: string, reason: string) =>
    new AppError(
      'INVALID_SETTING',
      `Invalid value for setting '${setting}': ${reason}`,
      400,
      { setting, reason }
    ),

  settingNotFound: (setting: string) =>
    new AppError(
      'SETTING_NOT_FOUND',
      `Setting '${setting}' not found`,
      404,
      { setting }
    ),
};
```

---

## Error Handling in Services

### Pattern: Service Error Handling

```typescript
export class ChatSessionService {
  async getSession(userId: string, sessionId: string): Promise<Session> {
    // Validate ownership and existence
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw ChatErrors.sessionNotFound(sessionId);
    }

    if (session.userId !== userId) {
      throw ChatErrors.sessionAccessDenied(sessionId);
    }

    if (session.isArchived) {
      throw ChatErrors.sessionArchived(sessionId);
    }

    return session;
  }

  async sendMessage(
    userId: string,
    sessionId: string,
    input: SendMessageInput
  ): Promise<SendMessageResult> {
    // Check for streaming in progress
    const isStreaming = await this.streamingCache.isSessionStreaming(sessionId);
    if (isStreaming) {
      throw ChatErrors.streamingInProgress(sessionId);
    }

    // Validate input
    if (!input.content?.trim()) {
      throw ChatErrors.emptyMessage();
    }

    if (input.content.length > SIZE_LIMITS.MAX_COMMAND_LENGTH) {
      throw ChatErrors.messageTooLong(SIZE_LIMITS.MAX_COMMAND_LENGTH);
    }

    // Validate attachments
    if (input.attachmentIds?.length) {
      if (input.attachmentIds.length > FILE_UPLOAD.MAX_FILES_PER_CONTEXT) {
        throw ChatErrors.tooManyAttachments(FILE_UPLOAD.MAX_FILES_PER_CONTEXT);
      }

      for (const attachmentId of input.attachmentIds) {
        const valid = await this.attachmentService.validateAttachment(userId, attachmentId);
        if (!valid) {
          throw ChatErrors.invalidAttachment(attachmentId, 'not found or expired');
        }
      }
    }

    try {
      // Process message...
    } catch (err: any) {
      // Handle AI service errors
      if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        throw ChatErrors.aiServiceTimeout(TIMEOUTS.AI_PROCESSING);
      }

      if (err.statusCode >= 500) {
        throw ChatErrors.aiServiceUnavailable();
      }

      throw err;
    }
  }
}
```

### Pattern: Repository Error Handling

```typescript
export class SessionRepository {
  async findById(id: string): Promise<SessionRecord | null> {
    try {
      return await this.prisma.chatSession.findUnique({
        where: { id },
      });
    } catch (err) {
      this.logger.error({ err, sessionId: id }, 'Database error finding session');
      throw Errors.databaseError('Failed to retrieve session');
    }
  }

  async update(id: string, data: UpdateData): Promise<SessionRecord> {
    try {
      return await this.prisma.chatSession.update({
        where: { id },
        data,
      });
    } catch (err: any) {
      if (err.code === 'P2025') { // Prisma "Record not found"
        throw ChatErrors.sessionNotFound(id);
      }
      this.logger.error({ err, sessionId: id }, 'Database error updating session');
      throw Errors.databaseError('Failed to update session');
    }
  }
}
```

---

## Error Handling in Routes

### Pattern: Route Handler

```typescript
fastify.post('/sessions/:sessionId/messages', {
  preHandler: requireScope('ai.chat'),
  schema: {
    // ... validation schema
  },
}, async (request, reply) => {
  const { sessionId } = request.params as { sessionId: string };
  const body = SendMessageRequestSchema.parse(request.body);

  if (!request.user) {
    throw Errors.unauthorized();
  }

  // All errors thrown by service are AppError instances
  // Global error handler will format response appropriately
  const result = await chatMessageService.sendMessage(
    request.user.id,
    sessionId,
    body
  );

  if (body.stream) {
    // Streaming mode - return 202 with WebSocket URL
    return reply.status(202).send({
      messageId: result.streamingResponse!.messageId,
      sessionId,
      websocketUrl: result.streamingResponse!.websocketUrl,
    });
  }

  // Sync mode - return 200 with messages
  return reply.send({
    userMessage: result.userMessage,
    assistantMessage: result.assistantMessage,
  });
});
```

---

## Error Handling in WebSocket

### Pattern: WebSocket Error Handler

```typescript
async function handleWebSocketMessage(
  client: ChatClient,
  message: any
): Promise<void> {
  try {
    switch (message.type) {
      case 'message':
        await handleSendMessage(client, message);
        break;
      // ... other handlers
    }
  } catch (err: any) {
    // Convert AppError to WebSocket error format
    if (err instanceof AppError) {
      client.ws.send(JSON.stringify({
        type: 'error',
        error: err.message,
        code: err.code,
        details: err.details,
        timestamp: new Date().toISOString(),
      }));
    } else {
      // Unknown error - log and send generic message
      logger.error({ err, clientId: client.id }, 'WebSocket handler error');
      client.ws.send(JSON.stringify({
        type: 'error',
        error: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
      }));
    }

    // For streaming errors, also emit stream_error
    if (message.type === 'message' && message.stream) {
      client.ws.send(JSON.stringify({
        type: 'stream_error',
        messageId: message.messageId,
        error: err.message,
        code: err.code || 'STREAM_ERROR',
        retryable: err.statusCode < 500,
        timestamp: new Date().toISOString(),
      }));
    }
  }
}
```

### Pattern: Streaming Error Recovery

```typescript
async function processStream(
  client: ChatClient,
  messageId: string,
  sessionId: string
): Promise<void> {
  let chunks = 0;
  let content = '';

  try {
    // Start streaming
    client.ws.send(JSON.stringify({
      type: 'stream_start',
      messageId,
      sessionId,
      timestamp: new Date().toISOString(),
    }));

    // Track streaming state in Redis for recovery
    await streamingCache.set({
      messageId,
      sessionId,
      userId: client.userId!,
      model: 'claude-3-5-sonnet',
      startedAt: new Date().toISOString(),
      chunks: 0,
      content: '',
    });

    for await (const chunk of aiOrchestratorClient.processCommandStream(payload)) {
      if (chunk.type === 'chunk') {
        chunks++;
        content += chunk.content || '';

        // Update cache for recovery
        await streamingCache.appendChunk(messageId, chunk.content || '');

        // Broadcast chunk
        broadcastToSession(sessionId, {
          type: 'stream_chunk',
          messageId,
          content: chunk.content,
          index: chunks,
          timestamp: new Date().toISOString(),
        });
      } else if (chunk.type === 'error') {
        throw new Error(chunk.content);
      }
    }

    // Complete - save to database
    await messageRepository.update(messageId, {
      content,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    });

    // Broadcast completion
    broadcastStreamEnd(sessionId, messageId, content, model, usage, 'stop');

  } catch (err: any) {
    logger.error({ err, messageId }, 'Stream processing error');

    // Try to recover partial content
    const state = await streamingCache.get(messageId);
    if (state && state.content) {
      // Save partial content
      await messageRepository.update(messageId, {
        content: state.content + '\n\n[Response was interrupted]',
      });
    }

    // Broadcast error
    broadcastToSession(sessionId, {
      type: 'stream_error',
      messageId,
      error: err.message,
      code: 'STREAM_ERROR',
      retryable: true,
      timestamp: new Date().toISOString(),
    });
  } finally {
    // Cleanup streaming state
    await streamingCache.delete(messageId);
  }
}
```

---

## Error Logging

### Log Levels by Error Type

| Error Type | Log Level | Alerting |
|------------|-----------|----------|
| Validation (400) | warn | No |
| Unauthorized (401) | info | No |
| Forbidden (403) | warn | No |
| Not Found (404) | debug | No |
| Conflict (409) | info | No |
| Rate Limited (429) | info | High volume alert |
| Internal Error (500) | error | Yes |
| External Service (502-504) | error | Yes |

### Structured Logging

```typescript
// Error logging in global handler
function logError(
  requestId: string,
  error: AppError | Error,
  context?: Record<string, unknown>
): void {
  const isServerError = error instanceof AppError && error.statusCode >= 500;
  const level = isServerError ? 'error' : 'warn';

  logger[level]({
    requestId,
    errorCode: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
    errorMessage: error.message,
    statusCode: error instanceof AppError ? error.statusCode : 500,
    stack: isServerError ? error.stack : undefined,
    ...context,
  });
}
```

---

## Client Error Handling Guidelines

### Frontend Error Handling

```typescript
// Handle API errors
async function sendMessage(sessionId: string, content: string) {
  try {
    const response = await api.post(`/chat/sessions/${sessionId}/messages`, {
      content,
      stream: true,
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      const { code, message, details } = error.response.data.error;

      switch (code) {
        case 'STREAMING_IN_PROGRESS':
          showToast('Please wait for the current response to complete');
          break;
        case 'RATE_LIMITED':
          showToast(`Please wait ${details.retryAfter} seconds`);
          break;
        case 'SESSION_NOT_FOUND':
          // Session was deleted - redirect to home
          router.push('/chat');
          break;
        case 'AI_SERVICE_UNAVAILABLE':
          showToast('AI service is temporarily unavailable', { retry: true });
          break;
        default:
          showToast(message);
      }
    } else {
      showToast('Network error. Please check your connection.');
    }
    throw error;
  }
}
```

### WebSocket Error Handling

```typescript
// Handle WebSocket errors
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'error') {
    handleError(message.code, message.error);
  } else if (message.type === 'stream_error') {
    handleStreamError(message);
  }
  // ... other handlers
};

function handleStreamError(message: StreamError) {
  if (message.retryable) {
    showToast('Response was interrupted. Click to retry.');
    // Store message ID for retry
  } else {
    showToast('Failed to generate response. Please try again.');
  }
}
```

---

## Retry Strategy

### Retryable Errors

| Error Code | Retryable | Retry Delay |
|------------|-----------|-------------|
| `RATE_LIMITED` | Yes | Use `retryAfter` value |
| `AI_SERVICE_TIMEOUT` | Yes | Exponential backoff |
| `AI_SERVICE_UNAVAILABLE` | Yes | Exponential backoff |
| `STREAM_ERROR` | Yes | Immediate |
| `DATABASE_ERROR` | No | N/A |
| `VALIDATION_ERROR` | No | N/A |
| `NOT_FOUND` | No | N/A |

### Exponential Backoff

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,  // 1 second
  maxDelay: 10000,     // 10 seconds
  backoffMultiplier: 2,
};

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config = RETRY_CONFIG
): Promise<T> {
  let lastError: Error;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;

      // Don't retry non-retryable errors
      if (err instanceof AppError && !isRetryable(err.code)) {
        throw err;
      }

      // Wait before retry
      await sleep(delay);
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
    }
  }

  throw lastError!;
}

function isRetryable(code: string): boolean {
  return [
    'RATE_LIMITED',
    'AI_SERVICE_TIMEOUT',
    'AI_SERVICE_UNAVAILABLE',
    'AI_SERVICE_ERROR',
    'STREAM_ERROR',
  ].includes(code);
}
```
