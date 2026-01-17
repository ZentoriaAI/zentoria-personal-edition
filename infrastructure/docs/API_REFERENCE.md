# Zentoria Personal Edition - API Reference

**Version:** 1.0
**Base URL:** `https://api.zentoria.local/api/v1`
**Last Updated:** January 2026

---

## Table of Contents

1. [Authentication](#authentication)
2. [MCP Gateway API](#mcp-gateway-api)
3. [AI Orchestrator API](#ai-orchestrator-api)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)
6. [Webhooks](#webhooks)

---

## Authentication

### JWT Authentication

**Obtain Token:**

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 900,
    "token_type": "Bearer"
  }
}
```

**Use Token:**

```http
GET /mcp/files
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### API Key Authentication

**Create API Key:**

```http
POST /api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "automation-key",
  "scopes": ["files:read", "files:write", "ai:chat"],
  "expires_at": "2026-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "key_123",
    "key": "znt_abc123def456...",
    "name": "automation-key",
    "scopes": ["files:read", "files:write", "ai:chat"],
    "created_at": "2026-01-16T12:00:00Z",
    "expires_at": "2026-12-31T23:59:59Z",
    "last_used": null
  }
}
```

**Use API Key:**

```http
GET /mcp/files
X-API-Key: znt_abc123def456...
```

### Token Refresh

```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

## MCP Gateway API

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "vault": "healthy",
    "ai": "healthy"
  }
}
```

### MCP Command Execution

Execute natural language commands through the MCP gateway.

```http
POST /mcp/command
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "Upload document.pdf to project X",
  "context": {
    "project_id": "proj_123",
    "workspace": "default"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "command_id": "cmd_789",
    "status": "processing",
    "intent": "file.upload",
    "entities": {
      "filename": "document.pdf",
      "project": "project X"
    },
    "workflow_id": "wf_456"
  }
}
```

**Stream Response (WebSocket):**

```javascript
const ws = new WebSocket('ws://api.zentoria.local/api/v1/mcp/stream');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'command',
    command: 'Summarize the latest report',
    token: '<jwt_token>'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

### File Operations

**Upload File:**

```http
POST /mcp/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary>
filename: document.pdf
project_id: proj_123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "file_id": "file_abc123",
    "filename": "document.pdf",
    "size": 1024000,
    "mime_type": "application/pdf",
    "uploaded_at": "2026-01-16T12:00:00Z",
    "url": "https://files.zentoria.local/uploads/file_abc123.pdf"
  }
}
```

**List Files:**

```http
GET /mcp/files?project_id=proj_123&limit=20&offset=0
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "id": "file_abc123",
        "filename": "document.pdf",
        "size": 1024000,
        "mime_type": "application/pdf",
        "uploaded_at": "2026-01-16T12:00:00Z",
        "url": "https://files.zentoria.local/uploads/file_abc123.pdf"
      }
    ],
    "pagination": {
      "total": 42,
      "limit": 20,
      "offset": 0,
      "has_more": true
    }
  }
}
```

**Download File:**

```http
GET /mcp/files/{file_id}/download
Authorization: Bearer <token>
```

**Delete File:**

```http
DELETE /mcp/files/{file_id}
Authorization: Bearer <token>
```

### Workflow Operations

**Trigger Workflow:**

```http
POST /mcp/workflow
Authorization: Bearer <token>
Content-Type: application/json

{
  "workflow_name": "document_processor",
  "input_data": {
    "file_id": "file_abc123",
    "options": {
      "ocr": true,
      "embedding": true
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "execution_id": "exec_xyz789",
    "workflow_name": "document_processor",
    "status": "running",
    "started_at": "2026-01-16T12:00:00Z"
  }
}
```

**Get Workflow Status:**

```http
GET /mcp/workflow/{execution_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "execution_id": "exec_xyz789",
    "workflow_name": "document_processor",
    "status": "completed",
    "started_at": "2026-01-16T12:00:00Z",
    "finished_at": "2026-01-16T12:05:30Z",
    "result": {
      "ocr_text": "Extracted text...",
      "embedding_id": "emb_123",
      "pages": 10
    }
  }
}
```

---

## AI Orchestrator API

**Base URL:** `http://ai.zentoria.local:5000/api/v1`

### Chat Completion

```http
POST /ai/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"}
  ],
  "model": "llama3.2:latest",
  "temperature": 0.7,
  "max_tokens": 500,
  "stream": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "chat_comp_123",
    "model": "llama3.2:latest",
    "choices": [
      {
        "message": {
          "role": "assistant",
          "content": "The capital of France is Paris."
        },
        "finish_reason": "stop"
      }
    ],
    "usage": {
      "prompt_tokens": 25,
      "completion_tokens": 8,
      "total_tokens": 33
    }
  }
}
```

**Streaming Response:**

```http
POST /ai/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "messages": [...],
  "stream": true
}
```

**Response (Server-Sent Events):**
```
data: {"delta": "The"}
data: {"delta": " capital"}
data: {"delta": " of"}
data: {"delta": " France"}
data: {"delta": " is"}
data: {"delta": " Paris"}
data: {"delta": "."}
data: {"done": true}
```

### RAG Query

```http
POST /ai/rag/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "What's in the contract from last month?",
  "collection": "documents",
  "top_k": 5,
  "include_citations": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "answer": "The contract from last month includes the following terms...",
    "citations": [
      {
        "text": "Relevant chunk of text...",
        "file_id": "file_abc123",
        "page": 2,
        "score": 0.92
      }
    ],
    "contexts_used": 3
  }
}
```

### Embeddings

```http
POST /ai/embeddings
Authorization: Bearer <token>
Content-Type: application/json

{
  "input": "This is a text to embed",
  "model": "nomic-embed-text"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "embeddings": [
      [0.123, -0.456, 0.789, ...] // 768 dimensions
    ],
    "model": "nomic-embed-text",
    "usage": {
      "tokens": 5
    }
  }
}
```

### Model Management

**List Models:**

```http
GET /ai/models
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "models": [
      {
        "name": "llama3.2:latest",
        "size": 4700000000,
        "modified_at": "2026-01-15T10:00:00Z",
        "digest": "sha256:abc123..."
      },
      {
        "name": "codellama:latest",
        "size": 3800000000,
        "modified_at": "2026-01-15T10:30:00Z",
        "digest": "sha256:def456..."
      }
    ]
  }
}
```

**Pull Model:**

```http
POST /ai/models/pull
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "llama3.2:latest"
}
```

**Delete Model:**

```http
DELETE /ai/models/{model_name}
Authorization: Bearer <token>
```

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token",
    "details": {
      "expired_at": "2026-01-16T11:45:00Z"
    },
    "request_id": "req_abc123"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created |
| 204 | No Content | Success, no response body |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (duplicate) |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily down |

### Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Invalid or expired token |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Request validation failed |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_ERROR` | Internal server error |
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable |
| `DUPLICATE_RESOURCE` | Resource already exists |
| `INVALID_API_KEY` | API key invalid or revoked |

### Error Handling Example

```javascript
try {
  const response = await fetch('https://api.zentoria.local/api/v1/mcp/command', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ command: 'Upload file' })
  });

  const data = await response.json();

  if (!data.success) {
    switch (data.error.code) {
      case 'UNAUTHORIZED':
        // Refresh token or re-login
        break;
      case 'RATE_LIMIT_EXCEEDED':
        // Wait and retry
        break;
      case 'VALIDATION_ERROR':
        // Show validation errors
        console.error(data.error.details);
        break;
      default:
        // Generic error handling
        console.error(data.error.message);
    }
  }
} catch (err) {
  console.error('Network error:', err);
}
```

---

## Rate Limiting

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/login` | 5 requests | 1 minute |
| `/auth/refresh` | 10 requests | 1 minute |
| `/mcp/*` | 100 requests | 1 minute |
| `/ai/chat` | 20 requests | 1 minute |
| `/ai/embeddings` | 50 requests | 1 minute |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642345678
```

### Rate Limit Exceeded Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "details": {
      "limit": 100,
      "reset_at": "2026-01-16T12:01:00Z",
      "retry_after": 45
    }
  }
}
```

---

## Webhooks

### Register Webhook

```http
POST /webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://your-app.com/webhook",
  "events": ["file.uploaded", "workflow.completed", "ai.response"],
  "secret": "your_webhook_secret"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "webhook_123",
    "url": "https://your-app.com/webhook",
    "events": ["file.uploaded", "workflow.completed", "ai.response"],
    "created_at": "2026-01-16T12:00:00Z",
    "status": "active"
  }
}
```

### Webhook Events

| Event | Description | Payload |
|-------|-------------|---------|
| `file.uploaded` | File uploaded | `{file_id, filename, size, url}` |
| `file.processed` | OCR/embedding complete | `{file_id, ocr_text, embedding_id}` |
| `workflow.started` | Workflow execution started | `{execution_id, workflow_name}` |
| `workflow.completed` | Workflow execution completed | `{execution_id, status, result}` |
| `workflow.failed` | Workflow execution failed | `{execution_id, error}` |
| `ai.response` | AI response generated | `{query, answer, model}` |

### Webhook Payload

```json
{
  "id": "evt_abc123",
  "event": "file.uploaded",
  "timestamp": "2026-01-16T12:00:00Z",
  "data": {
    "file_id": "file_abc123",
    "filename": "document.pdf",
    "size": 1024000,
    "url": "https://files.zentoria.local/uploads/file_abc123.pdf",
    "user_id": "user_456"
  },
  "signature": "sha256=abc123def456..."
}
```

### Webhook Signature Verification

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express.js example
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;

  if (!verifyWebhook(payload, signature, WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  // Process webhook
  console.log('Event:', payload.event);
  res.status(200).send('OK');
});
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { ZentoriaClient } from '@zentoria/sdk';

const client = new ZentoriaClient({
  baseUrl: 'https://api.zentoria.local',
  apiKey: 'znt_abc123...'
});

// Upload file
const file = await client.files.upload({
  file: fileBuffer,
  filename: 'document.pdf',
  projectId: 'proj_123'
});

// Execute command
const result = await client.mcp.command({
  command: 'Summarize the latest report'
});

// Chat with AI
const response = await client.ai.chat({
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  stream: true
});

for await (const chunk of response) {
  console.log(chunk.delta);
}
```

### Python

```python
from zentoria import ZentoriaClient

client = ZentoriaClient(
    base_url='https://api.zentoria.local',
    api_key='znt_abc123...'
)

# Upload file
with open('document.pdf', 'rb') as f:
    file = client.files.upload(
        file=f,
        filename='document.pdf',
        project_id='proj_123'
    )

# Execute command
result = client.mcp.command(
    command='Summarize the latest report'
)

# Chat with AI (streaming)
for chunk in client.ai.chat(
    messages=[
        {'role': 'user', 'content': 'Hello!'}
    ],
    stream=True
):
    print(chunk['delta'], end='', flush=True)
```

### cURL

```bash
# Upload file
curl -X POST https://api.zentoria.local/api/v1/mcp/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf" \
  -F "filename=document.pdf" \
  -F "project_id=proj_123"

# Execute command
curl -X POST https://api.zentoria.local/api/v1/mcp/command \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "Summarize the latest report"}'

# Chat with AI
curl -X POST https://api.zentoria.local/api/v1/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "model": "llama3.2:latest"
  }'
```

---

## Pagination

### Request Parameters

```
?limit=20       # Items per page (max 100)
?offset=0       # Offset for pagination
?sort=created_at:desc  # Sort field and direction
```

### Response Format

```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "total": 150,
      "limit": 20,
      "offset": 0,
      "has_more": true
    }
  }
}
```

---

## Versioning

### API Version Header

```http
GET /mcp/files
Authorization: Bearer <token>
X-API-Version: 1.0
```

### Deprecation Notice

Deprecated endpoints return:

```
X-API-Deprecated: true
X-API-Sunset: 2026-06-01T00:00:00Z
```

---

## Support

**API Issues:** api-support@zentoria.ai

**Documentation:** https://docs.zentoria.ai

**Changelog:** https://docs.zentoria.ai/changelog

**Status Page:** https://status.zentoria.ai

---

**API Version:** 1.0
**Last Updated:** January 2026
**Breaking Changes:** See changelog
