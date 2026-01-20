# Zentoria MCP Server - Backend API Documentation

Complete API reference for the Zentoria MCP Server backend services.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [MCP Gateway API (Port 4000)](#mcp-gateway-api)
4. [AI Orchestrator API (Port 8080)](#ai-orchestrator-api)
5. [Available AI Agents](#available-ai-agents)
6. [Request/Response Models](#requestresponse-models)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)
9. [WebSocket APIs](#websocket-apis)

---

## Overview

The Zentoria MCP Server consists of two primary backend services:

| Service | Container | Port | Technology | Purpose |
|---------|-----------|------|------------|---------|
| **MCP Gateway** | 441 | 4000 | Node.js/Fastify | API gateway, auth, file management |
| **AI Orchestrator** | 444 | 8080 | Python/FastAPI | AI agents, RAG, LLM routing |

### Base URLs

```
MCP Gateway:     http://localhost:4000/api/v1
AI Orchestrator: http://localhost:8080/api/v1
```

### Quick Start

```bash
# Simple chat request
curl -X POST http://localhost:4000/api/v1/mcp/command \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"command": "Hello, what can you help me with?"}'

# Health check
curl http://localhost:4000/api/v1/health
```

---

## Authentication

### Methods

The MCP Gateway supports two authentication methods:

#### 1. JWT Bearer Token

```bash
curl -H "Authorization: Bearer <jwt_token>" \
  http://localhost:4000/api/v1/mcp/files
```

#### 2. API Key

```bash
curl -H "X-API-Key: znt_live_sk_..." \
  http://localhost:4000/api/v1/mcp/files
```

### Available Scopes

| Scope | Description |
|-------|-------------|
| `files.read` | Read file metadata and download files |
| `files.write` | Upload and modify files |
| `files.delete` | Delete files |
| `ai.chat` | Process AI commands and chat |
| `ai.complete` | Code completion operations |
| `workflows.trigger` | Trigger n8n workflows |
| `workflows.read` | Read workflow status |
| `email.send` | Send emails |
| `keys.manage` | Create and revoke API keys |
| `admin` | Full administrative access |

### Public Endpoints (No Auth Required)

- `GET /api/v1/health` - Health check
- `GET /api/v1/health/ready` - Readiness probe
- `POST /api/v1/auth/refresh` - Refresh tokens
- `POST /api/v1/auth/request-access` - Request API access

### Token Management

**Refresh Token Exchange:**
```bash
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "string"
}
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "refreshExpiresIn": 604800
}
```

---

## MCP Gateway API

The MCP Gateway (Container 441) provides 45+ endpoints across 14 route modules.

### Health Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/health` | GET | No | Full health check with dependencies |
| `/api/v1/health/ready` | GET | No | Kubernetes readiness probe |
| `/api/v1/health/live` | GET | No | Kubernetes liveness probe |
| `/api/v1/health/metrics` | GET | No | System metrics (CPU, memory, disk) |

**Health Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-20T12:00:00Z",
  "version": "1.1.0",
  "uptime": 86400,
  "dependencies": {
    "database": "healthy",
    "redis": "healthy",
    "aiOrchestrator": "healthy"
  }
}
```

---

### Authentication Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/auth/refresh` | POST | No | Exchange refresh token for new pair |
| `/api/v1/auth/token` | POST | Yes | Generate initial token pair |
| `/api/v1/auth/logout` | POST | Yes | Revoke single refresh token |
| `/api/v1/auth/logout-all` | POST | Yes | Logout from all devices |
| `/api/v1/auth/sessions` | GET | Yes | Get active session count |
| `/api/v1/auth/request-access` | POST | No | Request API access (rate limited) |

---

### API Key Management

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/mcp/create-key` | POST | `keys.manage` | Create new API key |
| `/api/v1/mcp/keys` | GET | `keys.manage` | List user's API keys |
| `/api/v1/mcp/keys/:keyId` | DELETE | `keys.manage` | Revoke API key |
| `/api/v1/mcp/forgot-key` | POST | None | Request key via email (rate limited) |

**Create API Key:**
```bash
POST /api/v1/mcp/create-key
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Production Key",
  "scopes": ["files.read", "files.write", "ai.chat"],
  "expiresIn": "30d",
  "rateLimit": {
    "requestsPerMinute": 60,
    "requestsPerDay": 10000
  }
}
```

**Response:**
```json
{
  "id": "key_abc123",
  "name": "My Production Key",
  "key": "znt_live_sk_...",
  "scopes": ["files.read", "files.write", "ai.chat"],
  "expiresAt": "2026-02-19T12:00:00Z",
  "createdAt": "2026-01-20T12:00:00Z"
}
```

---

### File Management

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/mcp/upload` | POST | `files.write` | Upload file |
| `/api/v1/mcp/files` | GET | `files.read` | List files (paginated) |
| `/api/v1/mcp/files/:fileId` | GET | `files.read` | Get file metadata |
| `/api/v1/mcp/files/:fileId` | DELETE | `files.delete` | Delete file |
| `/api/v1/mcp/files/:fileId/download` | GET | `files.read` | Download file |
| `/api/v1/mcp/files/folder` | POST | `files.write` | Create virtual folder |
| `/api/v1/mcp/files/:fileId/rename` | PATCH | `files.write` | Rename file |
| `/api/v1/mcp/files/:fileId/move` | PATCH | `files.write` | Move file |

**Upload File:**
```bash
POST /api/v1/mcp/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary>
purpose: "ai-input"
```

**List Files:**
```bash
GET /api/v1/mcp/files?page=1&limit=20&purpose=ai-input
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (1-100) |
| `purpose` | enum | - | Filter: `ai-input`, `attachment`, `backup` |
| `createdAfter` | datetime | - | Filter by creation date |
| `createdBefore` | datetime | - | Filter by creation date |

**File Response:**
```json
{
  "id": "file_abc123",
  "filename": "document.pdf",
  "size": 102400,
  "mimeType": "application/pdf",
  "checksum": "sha256:abc...",
  "purpose": "ai-input",
  "createdAt": "2026-01-20T12:00:00Z",
  "expiresAt": "2026-02-20T12:00:00Z"
}
```

---

### Chat Sessions & Messages

#### Session Endpoints

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/chat/sessions` | GET | `ai.chat` | List sessions |
| `/api/v1/chat/sessions` | POST | `ai.chat` | Create session |
| `/api/v1/chat/sessions/:sessionId` | GET | `ai.chat` | Get session |
| `/api/v1/chat/sessions/:sessionId` | PATCH | `ai.chat` | Update session |
| `/api/v1/chat/sessions/:sessionId` | DELETE | `ai.chat` | Delete session |
| `/api/v1/chat/sessions/:sessionId/duplicate` | POST | `ai.chat` | Duplicate session |

**List Sessions:**
```bash
GET /api/v1/chat/sessions?page=1&pageSize=20&sortBy=lastMessageAt&sortOrder=desc
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number |
| `pageSize` | integer | Items per page |
| `folderId` | string | Filter by folder |
| `isArchived` | boolean | Filter archived |
| `search` | string | Search in titles |
| `sortBy` | enum | `lastMessageAt`, `createdAt`, `title` |
| `sortOrder` | enum | `asc`, `desc` |

#### Message Endpoints

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/chat/sessions/:sessionId/messages` | GET | `ai.chat` | Get messages |
| `/api/v1/chat/sessions/:sessionId/messages` | POST | `ai.chat` | Send message |
| `/api/v1/chat/sessions/:sessionId/messages/:messageId` | PATCH | `ai.chat` | Edit message |
| `/api/v1/chat/sessions/:sessionId/messages/:messageId` | DELETE | `ai.chat` | Delete message |

**Send Message (Streaming):**
```bash
POST /api/v1/chat/sessions/sess_abc123/messages
Authorization: Bearer <token>
Content-Type: application/json
Accept: text/event-stream

{
  "content": "Explain quantum computing",
  "stream": true,
  "aiSource": "auto"
}
```

**SSE Response:**
```
event: start
data: {"session_id":"sess_abc123","agent":"chat","ai_source":"local"}

event: chunk
data: {"content":"Quantum computing is..."}

event: chunk
data: {"content":" a type of computation..."}

event: done
data: {"session_id":"sess_abc123","total_length":1234}
```

**Send Message (Non-Streaming):**
```bash
POST /api/v1/chat/sessions/sess_abc123/messages
Content-Type: application/json

{
  "content": "Hello!",
  "stream": false
}
```

---

### Folder Management

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/folders` | GET | `ai.chat` | Get folder tree |
| `/api/v1/folders` | POST | `ai.chat` | Create folder |
| `/api/v1/folders/:folderId` | GET | `ai.chat` | Get folder |
| `/api/v1/folders/:folderId` | PATCH | `ai.chat` | Update folder |
| `/api/v1/folders/:folderId` | DELETE | `ai.chat` | Delete folder |
| `/api/v1/folders/reorder` | POST | `ai.chat` | Reorder folders |
| `/api/v1/folders/:folderId/move-sessions` | POST | `ai.chat` | Move sessions to folder |

**Create Folder:**
```json
{
  "name": "Work Projects",
  "description": "Work-related conversations",
  "color": "#3B82F6",
  "icon": "folder",
  "parentId": null
}
```

---

### MCP Command Processing

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/mcp/command` | POST | `ai.chat` | Process AI command |
| `/api/v1/mcp/command/:commandId` | GET | `ai.chat` | Get async command status |
| `/api/v1/mcp/email` | POST | `email.send` | Send email |

**Process Command:**
```bash
POST /api/v1/mcp/command
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "Generate a Python function to sort a list",
  "sessionId": "sess_abc123",
  "context": {
    "files": ["file_abc123"],
    "previousMessages": 5,
    "systemPrompt": "You are a helpful coding assistant"
  },
  "options": {
    "model": "claude-3-5-sonnet",
    "maxTokens": 4096,
    "temperature": 0.7,
    "stream": false,
    "async": false
  }
}
```

**Sync Response:**
```json
{
  "result": "Here's a Python sorting function...",
  "content": "```python\ndef sort_list(items):\n    return sorted(items)\n```",
  "model": "codellama:7b",
  "usage": {
    "promptTokens": 50,
    "completionTokens": 100,
    "totalTokens": 150
  },
  "finishReason": "stop"
}
```

**Async Response (202):**
```json
{
  "executionId": "exec_abc123",
  "status": "processing",
  "estimatedCompletionMs": 5000,
  "pollingUrl": "/api/v1/mcp/command/exec_abc123",
  "websocketUrl": "/ws/command/exec_abc123"
}
```

---

### Workflow Management

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/workflows` | GET | `workflows.read` | List workflows |
| `/api/v1/workflows/trigger` | POST | `workflows.trigger` | Trigger workflow |
| `/api/v1/workflows/executions` | GET | `workflows.read` | List executions |
| `/api/v1/workflows/:executionId` | GET | `workflows.read` | Get execution status |
| `/api/v1/workflows/callback` | POST | - | Webhook callback from n8n |

**Trigger Workflow:**
```bash
POST /api/v1/workflows/trigger
Authorization: Bearer <token>
Content-Type: application/json

{
  "workflowId": "workflow_abc123",
  "payload": {
    "key": "value"
  },
  "async": true
}
```

---

### Settings Management

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/settings` | GET | `ai.chat` | Get user settings |
| `/api/v1/settings` | PATCH | `ai.chat` | Update settings |
| `/api/v1/settings/reset` | POST | `ai.chat` | Reset to defaults |
| `/api/v1/settings/models` | GET | `ai.chat` | Get available models |
| `/api/v1/settings/prompts` | POST | `ai.chat` | Add custom prompt |
| `/api/v1/settings/prompts/:promptId` | DELETE | `ai.chat` | Remove prompt |
| `/api/v1/settings/export` | GET | `ai.chat` | Export settings |
| `/api/v1/settings/import` | POST | `ai.chat` | Import settings |

**Settings Schema:**
```json
{
  "defaultAgentId": "chat",
  "defaultModel": "llama3.2:8b",
  "defaultTemperature": 0.7,
  "defaultMaxTokens": 4096,
  "defaultSystemPrompt": "You are a helpful assistant",
  "contextWindow": 10,
  "streamResponses": true,
  "showTokenCounts": true,
  "autoGenerateTitles": true,
  "saveHistory": true,
  "theme": "dark",
  "fontSize": "medium",
  "codeTheme": "github-dark",
  "sendOnEnter": true,
  "enableSounds": false,
  "enableNotifications": true
}
```

---

### External AI Keys

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/settings/ai-keys` | GET | `ai.chat` | List external AI keys |
| `/api/v1/settings/ai-keys` | POST | `ai.chat` | Add AI key |
| `/api/v1/settings/ai-keys/:keyId` | DELETE | `ai.chat` | Delete AI key |
| `/api/v1/settings/ai-keys/:keyId/default` | PATCH | `ai.chat` | Set as default |
| `/api/v1/settings/ai-keys/validate` | POST | `ai.chat` | Validate key |
| `/api/v1/settings/ai-keys/providers` | GET | `ai.chat` | Get configured providers |

**Add External AI Key:**
```json
{
  "provider": "openai",
  "name": "My OpenAI Key",
  "apiKey": "sk-...",
  "setAsDefault": true
}
```

---

### Feature Flags

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/api/v1/features` | GET | Any | List all flags |
| `/api/v1/features/:flagName` | GET | Any | Get single flag |
| `/api/v1/features/:flagName/check` | POST | Any | Check if enabled for user |
| `/api/v1/features` | POST | Admin | Create flag |
| `/api/v1/features/:flagName` | PUT | Admin | Update flag |
| `/api/v1/features/:flagName` | DELETE | Admin | Delete flag |
| `/api/v1/features/:flagName/rollout` | POST | Admin | Set rollout percentage |

---

### Admin: Access Requests

| Endpoint | Method | Scope | Description |
|----------|--------|-------|-------------|
| `/api/v1/admin/access-requests` | GET | `admin` | List requests |
| `/api/v1/admin/access-requests/stats` | GET | `admin` | Get statistics |
| `/api/v1/admin/access-requests/:id` | GET | `admin` | Get single request |
| `/api/v1/admin/access-requests/:id/approve` | POST | `admin` | Approve request |
| `/api/v1/admin/access-requests/:id/reject` | POST | `admin` | Reject request |

---

## AI Orchestrator API

The AI Orchestrator (Container 444) provides AI chat, agent routing, and RAG capabilities.

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/chat` | POST | Chat (non-streaming) |
| `/api/v1/chat/stream` | POST | Chat (SSE streaming) |
| `/api/v1/command` | POST | Direct command execution |
| `/api/v1/embed` | POST | Generate embeddings |
| `/api/v1/agents` | GET | List available agents |
| `/api/v1/agents/:agent_name` | POST | Invoke specific agent |
| `/api/v1/context/:session_id` | GET | Get conversation context |
| `/api/v1/context/:session_id` | DELETE | Clear context |
| `/api/v1/index` | POST | Index document for RAG |
| `/api/v1/index/:doc_id` | DELETE | Delete indexed document |
| `/api/v1/search` | POST | Search documents |

---

### Chat Endpoint

**POST /api/v1/chat**

Process a chat message with automatic agent routing.

**Request:**
```json
{
  "message": "Write a Python function to calculate fibonacci",
  "session_id": "sess_abc123",
  "user_id": "user_123",
  "stream": false,
  "use_rag": true,
  "agent": null,
  "context": {
    "ai_source": "local",
    "preferred_cloud_provider": "openai",
    "temperature": 0.7,
    "max_tokens": 4096
  }
}
```

**Response:**
```json
{
  "message": "Here's a Python function...",
  "session_id": "sess_abc123",
  "agent_used": "code",
  "citations": [],
  "metadata": {
    "model": "codellama:7b",
    "tokens": 150,
    "execution_time": 1.23
  },
  "timestamp": "2026-01-20T12:00:00Z"
}
```

**Context Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ai_source` | enum | `"local"` | `"local"`, `"cloud"`, `"auto"` |
| `preferred_cloud_provider` | enum | `"openai"` | `"openai"`, `"anthropic"` |
| `external_api_key` | string | - | Cloud provider API key |
| `temperature` | float | 0.7 | Creativity (0.0-1.0) |
| `max_tokens` | integer | 4096 | Max response tokens |

---

### Streaming Chat

**POST /api/v1/chat/stream**

Real-time streaming using Server-Sent Events.

**Request:**
```bash
curl -X POST http://localhost:8080/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message": "Explain machine learning"}'
```

**SSE Events:**
```
event: start
data: {"session_id":"sess_123","agent":"chat","ai_source":"local"}

event: chunk
data: {"content":"Machine learning is"}

event: chunk
data: {"content":" a subset of artificial"}

event: chunk
data: {"content":" intelligence..."}

event: done
data: {"session_id":"sess_123","total_length":500,"ai_source":"local"}
```

---

### Direct Command

**POST /api/v1/command**

Execute a command on a specific agent without automatic routing.

**Request:**
```json
{
  "command": "list /home/user",
  "agent": "file",
  "parameters": {
    "operation": "list",
    "source_path": "/home/user"
  },
  "session_id": "sess_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "result": ["file1.txt", "file2.pdf", "folder/"],
  "agent": "file",
  "execution_time": 0.05,
  "metadata": {}
}
```

---

### Generate Embeddings

**POST /api/v1/embed**

Generate vector embeddings for text.

**Request:**
```json
{
  "texts": ["Hello world", "Another text"],
  "model": "nomic-embed-text"
}
```

**Response:**
```json
{
  "embeddings": [
    [0.123, 0.456, ...],
    [0.789, 0.012, ...]
  ],
  "model": "nomic-embed-text",
  "dimensions": 768
}
```

---

### Document Indexing (RAG)

**POST /api/v1/index**

Index a document for retrieval-augmented generation.

**Request:**
```json
{
  "doc_id": "doc_123",
  "content": "Document content to index...",
  "metadata": {
    "title": "My Document",
    "author": "John Doe"
  }
}
```

**Response:**
```json
{
  "doc_id": "doc_123",
  "chunks_indexed": 5,
  "status": "success"
}
```

---

### Document Search

**POST /api/v1/search**

Search indexed documents.

**Request:**
```json
{
  "query": "How does authentication work?",
  "top_k": 5,
  "doc_id": null
}
```

**Response:**
```json
{
  "query": "How does authentication work?",
  "results": [
    {
      "id": "chunk_123",
      "content": "Authentication is handled via JWT tokens...",
      "score": 0.92,
      "metadata": {"doc_id": "doc_123", "title": "Auth Guide"}
    }
  ],
  "count": 1
}
```

---

## Available AI Agents

The AI Orchestrator includes 8 specialized agents:

### 1. Chat Agent

| Property | Value |
|----------|-------|
| **Type** | `chat` |
| **Model** | `llama3.2:8b` |
| **Description** | General conversation and Q&A |

**Capabilities:**
- Answer general knowledge questions
- Explain concepts and topics
- Provide recommendations
- Help with brainstorming

---

### 2. Code Agent

| Property | Value |
|----------|-------|
| **Type** | `code` |
| **Model** | `codellama:7b` |
| **Description** | Code generation, review, debugging |

**Capabilities:**
- Generate code in multiple languages
- Review and improve code
- Debug and fix issues
- Write unit tests
- Refactor for better structure

**Keywords:** code, program, function, class, python, javascript, debug, refactor

---

### 3. File Agent

| Property | Value |
|----------|-------|
| **Type** | `file` |
| **Model** | `llama3.2:8b` |
| **Description** | File and folder operations |

**Operations:**
- `list` - List directory contents
- `read` - Read file contents
- `write` - Write to file
- `delete` - Delete file/folder
- `move` - Rename or move
- `copy` - Copy file
- `search` - Find files by pattern
- `info` - Get file metadata

**Keywords:** file, folder, directory, read, write, create, delete, upload, download

---

### 4. Mail Agent

| Property | Value |
|----------|-------|
| **Type** | `mail` |
| **Model** | `llama3.2:8b` |
| **Description** | Email sending and management |

**Actions:**
- `send` - Send email
- `compose` - Draft email
- `list` - List inbox
- `search` - Search emails

**Keywords:** email, mail, send, compose, newsletter, notification

---

### 5. Key Agent

| Property | Value |
|----------|-------|
| **Type** | `key` |
| **Model** | `llama3.2:8b` |
| **Description** | API key and credential management |

**Actions:**
- `generate` - Create new API key
- `list` - List all keys
- `revoke` - Revoke key
- `rotate` - Generate new, retire old
- `check` - Check key status

**Keywords:** api key, secret, token, credential, password, generate, rotate

---

### 6. Workflow Agent

| Property | Value |
|----------|-------|
| **Type** | `workflow` |
| **Model** | `llama3.2:8b` |
| **Description** | n8n workflow automation |

**Actions:**
- `trigger` - Start workflow
- `list` - List workflows
- `status` - Check execution status
- `history` - Get execution history
- `schedule` - Schedule recurring runs

**Keywords:** workflow, automation, n8n, trigger, schedule, cron, webhook

---

### 7. Security Agent

| Property | Value |
|----------|-------|
| **Type** | `security` |
| **Model** | `llama3.2:8b` |
| **Description** | Permission and access control |

**Actions:**
- `grant` - Grant permission
- `revoke` - Revoke permission
- `list_permissions` - Show permissions
- `list_roles` - Show roles
- `audit` - Get audit logs
- `create_role` - Create role
- `check` - Security status

**Keywords:** permissions, access, roles, privileges, security, firewall, audit

---

### 8. Search Agent (RAG)

| Property | Value |
|----------|-------|
| **Type** | `search` |
| **Model** | `llama3.2:8b` |
| **Description** | Document search and retrieval |

**Actions:**
- `search` - Full-text search
- `question` - Q&A with context
- `index` - Index document
- `delete` - Remove document
- `list` - List documents

**Keywords:** search, find, query, document, knowledge, ?

---

### Agent Routing

The system uses two-level routing:

1. **Pattern-Based Matching** - Regex patterns for keywords
2. **LLM Classification** - Fallback when patterns are ambiguous

**Routing Priority:** Code > File > Mail/Key > Workflow/Security > Search > Chat

---

## Request/Response Models

### MCP Gateway (Zod Schemas)

#### CommandRequest
```typescript
{
  command: string,              // 1-32000 chars
  sessionId?: string,           // Pattern: ^sess_[a-zA-Z0-9]+$
  context?: {
    files?: string[],           // Max 10
    previousMessages?: number,  // 0-50
    systemPrompt?: string,      // Max 4000
    variables?: object
  },
  options?: {
    model?: "claude-3-5-sonnet" | "claude-3-opus" | "gpt-4-turbo" | "gpt-4o",
    maxTokens?: number,         // 1-16384
    temperature?: number,       // 0-2
    stream?: boolean,
    async?: boolean
  }
}
```

#### SendMessage
```typescript
{
  content: string,              // 1-32000 chars
  attachmentIds?: string[],     // Max 10
  parentId?: string,
  stream?: boolean,             // Default: true
  aiSource?: "local" | "cloud" | "auto"
}
```

#### CreateApiKey
```typescript
{
  name: string,                 // 1-100 chars
  scopes: string[],             // Required, from 10 available
  expiresIn?: string,           // e.g., "30d", "1y"
  rateLimit?: {
    requestsPerMinute: number,
    requestsPerDay: number
  }
}
```

---

### AI Orchestrator (Pydantic Models)

#### ChatRequest
```python
class ChatRequest(BaseModel):
    message: str                 # 1-10000 chars
    session_id: str | None
    user_id: str | None
    stream: bool = False
    use_rag: bool = True
    agent: AgentType | None
    context: dict = {}
```

#### ChatResponse
```python
class ChatResponse(BaseModel):
    message: str
    session_id: str
    agent_used: AgentType
    citations: list[dict] = []
    metadata: dict = {}
    timestamp: datetime
```

#### CommandRequest
```python
class CommandRequest(BaseModel):
    command: str
    agent: AgentType
    parameters: dict = {}
    session_id: str | None
```

#### AgentType (Enum)
```python
class AgentType(str, Enum):
    CHAT = "chat"
    CODE = "code"
    FILE = "file"
    MAIL = "mail"
    KEY = "key"
    WORKFLOW = "workflow"
    SECURITY = "security"
    SEARCH = "search"
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "requestId": "request-uuid",
    "details": {}
  }
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `INVALID_TOKEN` | 401 | Bad JWT or API key |
| `FORBIDDEN` | 403 | Insufficient scopes or roles |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate resource |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

### AI Orchestrator Errors

```json
{
  "error": "Error message",
  "detail": "Detailed info (debug mode only)",
  "statusCode": 400,
  "timestamp": "2026-01-20T12:00:00Z"
}
```

---

## Rate Limiting

### MCP Gateway Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| AI Command (`/mcp/command`) | 100 | per minute |
| API Key Creation | 5 | per hour per user |
| Forgot Key | 3 | per hour per email |
| Access Request | 5 | per hour per IP |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705752000
```

---

## WebSocket APIs

### MCP Gateway WebSocket

**Endpoint:** `/ws/command`

**Authentication:**
```javascript
// Connect
const ws = new WebSocket('ws://localhost:4000/ws/command');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  token: 'Bearer <jwt>' // or 'znt_...' for API key
}));
```

**Client Messages:**
```javascript
{ type: 'auth', token: string }
{ type: 'subscribe', commandId: string }
{ type: 'unsubscribe', commandId: string }
{ type: 'ping' }
```

**Server Messages:**
```javascript
{ type: 'connected', clientId, message }
{ type: 'auth_success', userId }
{ type: 'auth_error', error }
{ type: 'subscribed', commandId }
{ type: 'chunk', content, ... }
{ type: 'pong', timestamp }
{ type: 'error', error }
```

### AI Orchestrator WebSocket

**Endpoint:** `/api/v1/ws/chat`

Bidirectional real-time chat communication (if configured).

---

## Examples

### Complete Chat Flow

```bash
# 1. Create a session
curl -X POST http://localhost:4000/api/v1/chat/sessions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "My Chat"}'

# Response: {"id": "sess_abc123", ...}

# 2. Send a message
curl -X POST http://localhost:4000/api/v1/chat/sessions/sess_abc123/messages \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!", "stream": false}'

# 3. Get session history
curl http://localhost:4000/api/v1/chat/sessions/sess_abc123/messages \
  -H "Authorization: Bearer <token>"
```

### File Upload and AI Processing

```bash
# 1. Upload a file
curl -X POST http://localhost:4000/api/v1/mcp/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@document.pdf" \
  -F "purpose=ai-input"

# Response: {"id": "file_xyz789", ...}

# 2. Process with AI
curl -X POST http://localhost:4000/api/v1/mcp/command \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "Summarize this document",
    "context": {
      "files": ["file_xyz789"]
    }
  }'
```

### Workflow Automation

```bash
# 1. Trigger a workflow
curl -X POST http://localhost:4000/api/v1/workflows/trigger \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "wf_daily_report",
    "payload": {"date": "2026-01-20"},
    "async": true
  }'

# Response: {"executionId": "exec_123", "status": "running"}

# 2. Check status
curl http://localhost:4000/api/v1/workflows/exec_123 \
  -H "Authorization: Bearer <token>"
```

---

## Configuration

### Environment Variables

#### MCP Gateway
```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
AI_ORCHESTRATOR_URL=http://localhost:8080
MINIO_ENDPOINT=...
```

#### AI Orchestrator
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_CODE_MODEL=codellama:7b
OLLAMA_MAX_TOKENS=4096
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://...
MCP_BASE_URL=http://localhost:4000
DEBUG=false
```

---

## Summary

| Metric | Value |
|--------|-------|
| **MCP Gateway Endpoints** | 45+ |
| **AI Orchestrator Endpoints** | 12 |
| **Total Agents** | 8 |
| **Auth Methods** | JWT, API Key |
| **Scopes** | 10 |
| **Real-time** | WebSocket, SSE |

---

*Last Updated: January 2026 | Version 1.1*
