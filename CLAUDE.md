# Zentoria Personal Edition

Self-hosted AI Control Plane on Proxmox. Single-user system with centralized AI management for cloud services, APIs, workflows, and file management.

## Project Overview

| Aspect | Value |
|--------|-------|
| Type | Self-Hosted Personal Edition |
| Platform | Proxmox VE (LXC Containers) |
| Container Range | 400-423 (17 containers) |
| Domain | zentoria.local / zentoria.ai |

---

## Container Architecture (Deployed)

### Core Services (Active)

| LXC | Hostname | IP | Role | Port(s) | Status |
|-----|----------|-----|------|---------|--------|
| 404 | zentoria-pe-db | 192.168.220.244 | PostgreSQL + pgvector | 5432 | ✅ Running |
| 410 | zentoria-pe-redis | 192.168.220.250 | Cache & Message Queue | 6379 | ✅ Running |
| 440 | zentoria-pe-frontend | 192.168.220.240 | Web UI (Next.js) | 3000 | ✅ Running |
| 441 | zentoria-pe-backend | 192.168.220.241 | MCP Core API (Fastify) | 3000 | ✅ Running |
| 442 | zentoria-pe-nginx | 192.168.220.242 | NGINX Reverse Proxy | 80 | ✅ Running |
| 443 | zentoria-pe-qdrant | 192.168.220.243 | Qdrant Vector DB | 6333 | ✅ Running |
| 444 | zentoria-pe-ai | 192.168.220.245 | Ollama + AI Orchestrator | 11434, 8000 | ✅ Running |

### Access URLs

| Service | URL |
|---------|-----|
| **Main App** | http://192.168.220.242 |
| **API** | http://192.168.220.242/api/ |
| **AI** | http://192.168.220.242/ai/ |
| **WebSocket** | ws://192.168.220.242/ws/ |

### Future Services (Not Yet Deployed)

| LXC | Hostname | Planned Role |
|-----|----------|--------------|
| 445 | zentoria-pe-n8n | Workflow Automation |
| 446 | zentoria-pe-vault | Secrets Management |
| 447 | zentoria-pe-logs | Prometheus + Grafana |
| 448 | zentoria-pe-files | MinIO Object Storage |
| 449 | zentoria-pe-auth | JWT Authentication |

---

## Network Architecture

### Internal Network
- Subnet: `192.168.220.0/24`
- Hostname pattern: `zentoria-pe-{service}`

### IP Mapping (Deployed)

```
# Core Services
192.168.220.240   zentoria-pe-frontend   # LXC 440
192.168.220.241   zentoria-pe-backend    # LXC 441
192.168.220.242   zentoria-pe-nginx      # LXC 442
192.168.220.243   zentoria-pe-qdrant     # LXC 443
192.168.220.244   zentoria-pe-db         # LXC 404
192.168.220.245   zentoria-pe-ai         # LXC 444
192.168.220.250   zentoria-pe-redis      # LXC 410
```

### NGINX Routing (Container 442)

| Path | Upstream | Port |
|------|----------|------|
| `/` | zentoria-pe-frontend | 3000 |
| `/api/` | zentoria-pe-backend | 3000 |
| `/ai/` | zentoria-pe-ai | 8000 |
| `/ws/` | zentoria-pe-backend (WebSocket) | 3000 |
| `/health` | Static response | - |

---

## SSH Access

```bash
# Proxmox Dell (pve-dev) via Tailscale
ssh root@100.121.19.12

# Execute in container
ssh root@100.121.19.12 "pct exec {LXC_ID} -- {command}"

# Examples
ssh root@100.121.19.12 "pct exec 441 -- curl localhost:3000/health"      # Backend API
ssh root@100.121.19.12 "pct exec 404 -- psql -U zentoria zentoria_main"  # PostgreSQL
ssh root@100.121.19.12 "pct exec 444 -- ollama list"                     # Ollama models
ssh root@100.121.19.12 "pct exec 443 -- curl localhost:6333/healthz"     # Qdrant
ssh root@100.121.19.12 "pct exec 410 -- redis-cli ping"                  # Redis
```

---

## Directory Structure (Per Container)

All containers use `/opt/zentoria/{service}/`:

```
/opt/zentoria/{service}/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── config/
├── data/
├── scripts/
│   ├── deploy.sh
│   ├── backup.sh
│   └── healthcheck.sh
└── logs/
```

---

## Key APIs

### Backend (441) - MCP Core API

Base URL: `http://192.168.220.242/api/` (via NGINX)

```
POST /api/v1/mcp/command      # AI command processing
POST /api/v1/mcp/upload       # File upload
POST /api/v1/mcp/create-key   # API key generation
GET  /api/v1/mcp/files        # File listing
POST /api/v1/mcp/email        # Send email
POST /api/v1/mcp/workflow     # Trigger workflow
GET  /health                  # Health check (requires auth)
```

### AI Orchestrator (444)

Base URL: `http://192.168.220.242/ai/` (via NGINX)

```
POST /api/v1/chat             # Chat with AI
POST /api/v1/chat/stream      # Streaming chat
POST /api/v1/command          # AI command processing
GET  /api/v1/agents           # List agents
GET  /api/v1/health           # Health check
WS   /api/v1/ws/chat          # WebSocket chat
```

### Qdrant (443) - Vector DB

Direct: `http://192.168.220.243:6333/`

```
GET  /healthz                 # Health check
GET  /collections             # List collections
POST /collections/{name}      # Create collection
POST /collections/{name}/points  # Insert vectors
POST /collections/{name}/points/search  # Search vectors
```

---

## AI Agents (444)

| Agent | Function |
|-------|----------|
| Chat Agent | Conversation interface |
| Code Agent | Code generation |
| File Agent | File management |
| Search Agent | Semantic search |
| Workflow Agent | Automation triggers |

### Ollama Models (Installed)

```bash
# Currently available on LXC 444
llama3.2:3b          # General purpose (2.0 GB)
codellama:7b         # Code generation (3.8 GB)
nomic-embed-text     # Embeddings (274 MB)
```

---

## Databases

### PostgreSQL (404) - 192.168.220.244

| Database | Purpose |
|----------|---------|
| zentoria_main | Main application data |
| zentoria_vectors | AI embeddings (pgvector) |

### Redis (410) - 192.168.220.250

| Function | Use Case |
|----------|----------|
| Session Cache | User sessions |
| API Cache | Response caching |
| Pub/Sub | Real-time events |
| AI Memory | Short-term context |

### Qdrant (443) - 192.168.220.243

| Collection | Content | Model |
|------------|---------|-------|
| documents | All documents | nomic-embed-text |
| chat_history | Conversation context | nomic-embed-text |
| code | Code snippets | codellama |
| knowledge | Wiki/docs | nomic-embed-text |

---

## File Storage (Future)

MinIO not yet deployed. Files stored locally on backend container.

---

## Workflows (Future)

n8n not yet deployed. Workflow automation planned for LXC 445.

---

## Security

### Authentication Flow

1. User login → Frontend
2. Frontend → Auth Service (409)
3. Auth → JWT + Refresh Token
4. JWT in httpOnly cookie
5. Backend validates on each request
6. Token rotation every 15 min

### API Key Scopes

```
files.read      files.write
ai.chat         ai.embed
workflow.run    workflow.edit
admin.users     admin.settings
```

### Secrets (Vault 403)

All credentials stored in Vault:
- Database credentials
- API keys
- OAuth tokens
- Encryption keys
- Service accounts

---

## Monitoring (406)

### Prometheus Metrics
- Container CPU/Memory/Disk
- API response times
- Database connections
- AI inference time
- Workflow execution time

### Grafana Dashboards
- System Overview
- API Performance
- AI Usage
- Workflow Statistics
- Security Events

### Loki Logs
- Application logs
- Access logs
- Error logs
- Audit logs

---

## Common Commands

```bash
# Container management (pve-dev)
ssh root@100.121.19.12 "pct list"
ssh root@100.121.19.12 "pct start 441"
ssh root@100.121.19.12 "pct stop 441"
ssh root@100.121.19.12 "pct restart 441"

# Service logs
ssh root@100.121.19.12 "pct exec 441 -- tail -f /var/log/zentoria-api.log"
ssh root@100.121.19.12 "pct exec 442 -- tail -f /var/log/nginx/error.log"

# Database
ssh root@100.121.19.12 "pct exec 404 -- psql -U zentoria zentoria_main -c 'SELECT 1'"

# AI / Ollama
ssh root@100.121.19.12 "pct exec 444 -- ollama run llama3.2:3b 'Hello'"
ssh root@100.121.19.12 "pct exec 444 -- curl localhost:8000/"

# Redis
ssh root@100.121.19.12 "pct exec 410 -- redis-cli ping"

# Qdrant
ssh root@100.121.19.12 "pct exec 443 -- curl localhost:6333/healthz"
```

---

## Implementation Status

### Phase 1: Core Infrastructure ✅ COMPLETE
- [x] PostgreSQL + pgvector (404)
- [x] Redis (410)
- [x] Qdrant Vector DB (443)
- [x] NGINX Reverse Proxy (442)

### Phase 2: Application Layer ✅ COMPLETE
- [x] Frontend - Next.js (440)
- [x] Backend API - Fastify (441)
- [x] AI Orchestrator + Ollama (444)

### Phase 3: Integration ✅ COMPLETE
- [x] NGINX routing configured
- [x] All services communicating
- [x] Authentication flow (API key-based)
- [x] API key management (backend service + frontend UI)
- [x] File upload handling (frontend UI + backend routes)

### Phase 4: Extended Services 📋 PLANNED
- [ ] n8n Workflows (445)
- [ ] Vault Secrets (446)
- [ ] Monitoring/Grafana (447)
- [ ] MinIO File Storage (448)

---

## Hardware Requirements

### Minimum (Development)
- CPU: 16 cores (3:1 overcommit)
- RAM: 128 GB
- Storage: 2 TB SSD

### Recommended (Production)
- CPU: 32+ cores
- RAM: 192-256 GB
- Storage: 4+ TB NVMe
- GPU: Optional (NVIDIA for AI)

### Total Container Resources
- CPU: 52 cores allocated
- RAM: 152 GB allocated
- Storage: 2.17 TB allocated

---

## Environment Variables

### Global

```env
DOMAIN=zentoria.local
EXTERNAL_DOMAIN=zentoria.ai
INTERNAL_NETWORK=10.10.40.0/24
TZ=Europe/Amsterdam
LOG_LEVEL=info
```

---

## Data Flows

### Request Flow
```
User → NGINX (442) → Frontend (440) → Backend (441)
                            ↓
            Redis (410) / DB (404) / AI (444)
```

### RAG Flow
```
Query → Backend (441) → AI (444) → Embedding → Qdrant (443) → Top-K chunks
                                                     ↓
                                    Context Assembly → Ollama → Response
```

### Chat Flow
```
User Input → Frontend (440) → WebSocket → Backend (441)
                                               ↓
                                         AI Orchestrator (444) → Ollama
                                               ↓
                                         Stream Response → User
```

---

## Frontend Configuration (440)

### Environment (.env.local)

```env
NEXT_PUBLIC_API_URL=http://192.168.220.242/api
NEXT_PUBLIC_AI_URL=http://192.168.220.242/ai
NEXT_PUBLIC_WS_URL=ws://192.168.220.242/ws
NEXT_PUBLIC_API_KEY=znt_test_sk_NpjxMopze4q4ZCIdYrSbZ76ofxFBYynU
```

### Directory Structure

```
/opt/zentoria-frontend/
├── .env.local          # Environment config
├── app/
│   ├── layout.js       # Root layout
│   ├── page.js         # Dashboard
│   └── chat/
│       └── page.js     # Chat interface
├── lib/
│   └── api.js          # API client
└── .next/              # Build output
```

### Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | System status, stats |
| Chat | `/chat` | AI chat interface |
| Files | `/files` | File management (TODO) |
| Workflows | `/workflows` | n8n integration (TODO) |
| API Keys | `/keys` | Key management (TODO) |
| Settings | `/settings` | App settings (TODO) |

### Commands

```bash
# Rebuild frontend
ssh root@100.121.19.12 'pct exec 440 -- bash -c "cd /opt/zentoria-frontend && npm run build"'

# Restart frontend
ssh root@100.121.19.12 'pct exec 440 -- pkill -9 -f "next-server"'
ssh root@100.121.19.12 'pct exec 440 -- bash -c "cd /opt/zentoria-frontend && nohup npx next start -p 3000 > /var/log/zentoria-frontend.log 2>&1 &"'

# View logs
ssh root@100.121.19.12 'pct exec 440 -- tail -f /var/log/zentoria-frontend.log'
```

---

## Testing

### Test Frameworks

| Package | Framework | Environment |
|---------|-----------|-------------|
| **mcp-gateway** | Vitest 1.6.1 | Node.js |
| **frontend** | Vitest 1.6.1 | jsdom |
| **frontend (E2E)** | Playwright | Chromium/Firefox/WebKit |

### Test Commands

```bash
# Backend tests
cd mcp-gateway
npm test              # Watch mode
npm test -- --run     # Single run

# Frontend unit tests
cd frontend
npm test              # Watch mode
npm test -- --run     # Single run
npm run test:coverage # With coverage report
npm run test:ui       # Vitest UI dashboard

# Frontend E2E tests (requires Playwright)
npm run test:e2e           # Headless
npm run test:e2e:ui        # Interactive UI
npm run test:e2e:headed    # Visible browser
```

### Backend Test Files (mcp-gateway)

| File | Tests | Description |
|------|-------|-------------|
| `api-key.service.test.ts` | 64 | API key validation, creation, caching (SEC-005) |
| `command-processor.test.ts` | 54 | AI command processing (ARCH-001) |
| `command-response-builder.test.ts` | 37 | Response construction (ARCH-001) |
| `file-context-loader.test.ts` | 19 | File context loading for AI (ARCH-001) |
| `file.service.test.ts` | 73 | File upload, MIME validation, magic bytes (SEC-004) |
| `health.test.ts` | 18 | Health check endpoints |
| `input-sanitizer.test.ts` | 47 | Input sanitization, prompt injection (SEC-006) |
| `security.test.ts` | 47 | Auth middleware, rate limiter, scope checks |
| `integration.test.ts` | 52 | Full API route integration tests |

**Total Backend: 411 tests**

### Frontend Unit Test Files

| File | Tests | Description |
|------|-------|-------------|
| `src/stores/app-store.test.ts` | 31 | Theme, Sidebar, Toast, CommandPalette stores |
| `src/stores/chat-store.test.ts` | ~35 | Chat store, messages, streaming (PERF-011) |
| `src/stores/file-store.test.ts` | ~45 | File store, selection, uploads |
| `src/hooks/use-websocket.test.ts` | 37 | WebSocket hooks (PERF-003) |
| `src/lib/api-client.test.ts` | ~50 | Axios API client |
| `src/lib/utils.test.ts` | 42 | Utility functions |
| `src/components/ui/*.test.tsx` | 108 | Button, Badge, Card components |
| `src/components/layout/*.test.tsx` | 75 | Header, Sidebar components |

**Total Frontend Unit: ~423 tests**

### E2E Test Files (Playwright)

| File | Tests | Description |
|------|-------|-------------|
| `e2e/navigation.spec.ts` | 9 | Page routing, mobile navigation |
| `e2e/chat.spec.ts` | 14 | Chat interface, input, messages |
| `e2e/files.spec.ts` | 14 | File list, upload, actions |
| `e2e/dashboard.spec.ts` | 10 | Dashboard, quick actions, responsive |
| `e2e/theme.spec.ts` | 9 | Theme toggle, persistence, system preference |
| `e2e/accessibility.spec.ts` | 15 | Keyboard nav, ARIA, color contrast |

**Total E2E: 64 tests**

### Test Coverage by Issue

| Issue | Test File | Coverage |
|-------|-----------|----------|
| **ARCH-001** | `command-processor.test.ts`, `command-response-builder.test.ts`, `file-context-loader.test.ts` | 110 tests |
| **SEC-004** | `file.service.test.ts` | Magic byte validation |
| **SEC-005** | `api-key.service.test.ts` | Timing-safe comparison |
| **SEC-006** | `input-sanitizer.test.ts` | 47 prompt injection tests |
| **PERF-003** | `use-websocket.test.ts` | Singleton WebSocket |
| **PERF-011** | `chat-store.test.ts` | Selector pattern |

### Writing New Tests

```typescript
// Backend test example
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyService } from '../services/my.service.js';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService({ /* mock dependencies */ });
  });

  it('should process data correctly', async () => {
    const result = await service.process({ input: 'test' });
    expect(result.success).toBe(true);
  });
});

// Frontend test example
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from './my-component';

describe('MyComponent', () => {
  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<MyComponent onClick={handleClick}>Click</MyComponent>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

---

## API Key

### Admin Bootstrap Key

```
znt_test_sk_NpjxMopze4q4ZCIdYrSbZ76ofxFBYynU
```

**Scopes:** admin (full access)

### Key Format

- Prefix: `znt_test_sk_` (test) or `znt_live_sk_` (production)
- Length: 44 characters total
- Storage: SHA256 hashed in database

### API Key Usage

```bash
# Via header
curl -H "X-API-Key: znt_test_sk_..." http://192.168.220.242/api/v1/health

# Test chat
curl -X POST \
  -H "X-API-Key: znt_test_sk_NpjxMopze4q4ZCIdYrSbZ76ofxFBYynU" \
  -H "Content-Type: application/json" \
  http://192.168.220.242/api/v1/mcp/command \
  -d '{"command": "Hello"}'
```

---

## MCP Server Integration

This MCP server provides tools for:
- **Zentoria APIs** - All module endpoints
- **Proxmox Deployment** - Container management
- **Database Operations** - Query and manage

### Configuration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "zentoria-personal": {
      "command": "node",
      "args": ["path/to/zentoria-mcp/dist/index.js"]
    }
  }
}
```

---

## Security & Performance Fixes (v1.3)

### Security Implementations

| Issue | File | Description |
|-------|------|-------------|
| **SEC-001** | `.env.example`, `.env` | Secrets moved to environment variables |
| **SEC-003** | `src/routes/keys.ts` | Rate limit API key creation (5/hour per user) |
| **SEC-004** | `src/infrastructure/file-validator.ts` | Magic byte validation for file uploads |
| **SEC-005** | `src/repositories/api-key.repository.ts` | Timing-safe comparison for API keys |
| **SEC-006** | `src/infrastructure/input-sanitizer.ts` | Input sanitization + prompt injection detection |

### Performance Implementations

| Issue | File | Description |
|-------|------|-------------|
| **PERF-001** | `src/repositories/session.repository.ts` | Secondary Redis index for user sessions |
| **PERF-002** | `src/services/command.service.ts` | Batch file fetches with `Promise.all` |
| **PERF-003** | `frontend/src/hooks/use-websocket.ts` | Singleton WebSocket manager |
| **PERF-005** | `src/repositories/api-key.repository.ts` | Redis caching for API keys (5-min TTL) |
| **PERF-008** | `src/repositories/audit.repository.ts` | Fire-and-forget audit logging with batching |
| **PERF-010** | `prisma/schema.prisma` | Composite index `@@index([userId, createdAt])` |
| **PERF-011** | `frontend/src/stores/chat-store.ts` | Proper Zustand selector pattern |

### Code Quality Implementations

| Issue | File | Description |
|-------|------|-------------|
| **CQ-004** | `src/config/constants.ts` | Centralized configuration constants |

### Input Sanitizer (SEC-006)

Detects 12+ prompt injection patterns:
- System prompt override attempts
- Jailbreak techniques (DAN, developer mode)
- Delimiter injection (code blocks, XML tags)
- Context manipulation
- Output format manipulation

```typescript
import { sanitizeInput, logSuspiciousInput } from './infrastructure/input-sanitizer.js';

const result = sanitizeInput(userInput, { strictMode: true });
if (result.shouldBlock) {
  throw new Error('Suspicious input detected');
}
// Use result.sanitized
```

**Risk Levels:** `low` | `medium` | `high`
**Strict Mode:** Enable with `STRICT_INPUT_VALIDATION=true` to block high-risk inputs

### Rate Limiter

Redis-based sliding window rate limiting:

```typescript
import { checkRateLimit, RateLimitConfigs } from './infrastructure/rate-limiter.js';

const result = await checkRateLimit(redis, userId, 'api-key-creation', RateLimitConfigs.apiKeyCreation);
if (!result.allowed) {
  // Return 429 with X-RateLimit headers
}
```

**Predefined Configs:**
- `apiKeyCreation`: 5/hour
- `loginAttempts`: 10/15min
- `fileUpload`: 50/hour
- `aiCommands`: 20/min

### Magic Byte Validator (SEC-004)

Validates file content against claimed MIME type:

```typescript
import { validateFileMagicBytes } from './infrastructure/file-validator.js';

const { result, bufferedChunks } = await validateFileMagicBytes(stream, claimedMimeType);
if (!result.valid) {
  throw new Error(result.reason);
}
```

**Supported Types:** PNG, JPEG, GIF, WebP, PDF, ZIP, GZIP, MP3, MP4, WebM
**Blocked Types:** EXE, DLL, ELF, Mach-O, Scripts (.sh, .bat, .ps1)

### Singleton WebSocket Manager (PERF-003)

Single connection shared across all components:

```typescript
import { useWebSocket, useSystemHealth, useChatUpdates } from '@/hooks/use-websocket';

// All hooks share one WebSocket connection
const { status, emit, on, off } = useWebSocket();
const { health } = useSystemHealth();
const { messages, sendMessage } = useChatUpdates(sessionId);
```

**Features:**
- Reference counting for connection lifecycle
- `useSyncExternalStore` for React 18 support
- Event listener tracking with reconnection support

### Zustand Selector Pattern (PERF-011)

Proper selectors prevent unnecessary re-renders:

```typescript
import { useChatStore, selectCurrentMessages, useStreamingState, useChatActions } from '@/stores/chat-store';

// Subscribe to specific state slices
const messages = useChatStore(selectCurrentMessages);
const { isStreaming, streamingContent } = useStreamingState();
const { addMessage, setInputValue } = useChatActions();
```

### Configuration Constants (CQ-004)

Centralized in `src/config/constants.ts`:

```typescript
import { TIMEOUTS, RATE_LIMITS, SIZE_LIMITS, CACHE, SERVICE_URLS } from './config/constants.js';

// All values overridable via environment variables
const timeout = TIMEOUTS.AI_PROCESSING; // 120000ms
const maxSize = SIZE_LIMITS.MAX_FILE_SIZE_BYTES; // 100MB
```

---

## AI Orchestrator Integration (v1.4)

### Endpoint Configuration

The MCP Gateway communicates with AI Orchestrator (Container 444) via the `/api/v1/chat` endpoint.

| Field | Transformation |
|-------|---------------|
| `command` | → `message` |
| `userId` | → `user_id` |
| `sessionId` | → `session_id` |
| `fileContexts`, `systemPrompt`, `variables`, etc. | → `context` object |

### Key File

`mcp-gateway/src/clients/ai-orchestrator.client.ts`

```typescript
// Payload transformation for AI Orchestrator ChatRequest
const chatPayload = {
    message: payload.command,
    session_id: payload.sessionId,
    user_id: payload.userId,
    stream: false,
    use_rag: true,
    context: {
        command_id: payload.id,
        file_contexts: payload.fileContexts,
        system_prompt: payload.systemPrompt,
        // ... additional context
    },
};
```

### Testing AI Commands

```bash
# Test AI chat via NGINX
curl -X POST \
  -H "X-API-Key: znt_test_sk_NpjxMopze4q4ZCIdYrSbZ76ofxFBYynU" \
  -H "Content-Type: application/json" \
  http://192.168.220.242/api/v1/mcp/command \
  -d '{"command": "Hello"}'

# Direct AI Orchestrator test
ssh root@100.121.19.12 "pct exec 444 -- curl -s localhost:8000/api/v1/health"
```

---

## Git Repository & Deployment

### GitHub Repository

| Field | Value |
|-------|-------|
| **Repository** | https://github.com/ZentoriaAI/zentoria-personal-edition |
| **Visibility** | Public |
| **Branch** | main |

### Deployment via Git

```bash
# Local development workflow
cd "C:/Users/jgvar/OneDrive/Data Base/2026 Ai coding/Zentoria_mcp"
git add . && git commit -m "Your changes" && git push

# Deploy to Backend (Container 441)
ssh proxmox "pct exec 441 -- bash -c 'cd /tmp/repo && git pull && cp -r mcp-gateway/* /opt/zentoria-api-full/'"
ssh proxmox "pct exec 441 -- bash -c 'cd /opt/zentoria-api-full && npm install && npm run build'"

# Deploy to Frontend (Container 440)
ssh proxmox "pct exec 440 -- bash -c 'cd /tmp/repo && git pull && cp -r frontend/* /opt/zentoria-frontend/'"
ssh proxmox "pct exec 440 -- bash -c 'cd /opt/zentoria-frontend && npm install && npm run build'"
```

### Build Scripts

**Backend (mcp-gateway):** Uses esbuild for transpile-only compilation (bypasses TypeScript type checking for faster builds).

```bash
npm run build        # esbuild transpile-only (fast)
npm run build:tsc    # Full TypeScript compilation (strict)
```

**Frontend:** Standard Next.js build.

```bash
npm run build        # Next.js production build
npm run dev          # Development server
```

### Server Directories

| Container | Path | Content |
|-----------|------|---------|
| 441 (Backend) | `/opt/zentoria-api-full/` | MCP Gateway (Fastify) |
| 440 (Frontend) | `/opt/zentoria-frontend/` | Next.js App |
| Both | `/tmp/repo/` | Git clone of repository |

### Key Build Changes (v1.5)

| File | Change |
|------|--------|
| `mcp-gateway/package.json` | Added esbuild, changed build to `node scripts/build.js` |
| `mcp-gateway/scripts/build.js` | New esbuild transpile-only build script |
| `mcp-gateway/tsconfig.json` | Relaxed strict mode for compatibility |
| `frontend/package.json` | Fixed dependency placement (react-query-devtools) |
| `frontend/tsconfig.json` | Excluded vitest.config.ts, playwright.config.ts, e2e |
| `frontend/src/hooks/use-websocket.ts` | Fixed EventCallback type with unknown + assertion |

---

**Version:** 1.5
**Last Updated:** January 17, 2026

### Changelog
- v1.5: Added Git repository setup (https://github.com/ZentoriaAI/zentoria-personal-edition)
- v1.5: Backend build now uses esbuild for transpile-only compilation (faster builds)
- v1.5: Fixed frontend dependencies and TypeScript config for production builds
- v1.5: Added Git Deployment section with deployment commands
- v1.4: Fixed AI Orchestrator integration - changed endpoint from `/api/v1/process` to `/api/v1/chat`
- v1.4: Added payload transformation layer (command→message, userId→user_id, sessionId→session_id)
- v1.4: Verified all containers healthy (440-444, 404, 410) on Proxmox server
- v1.3: Security fixes (SEC-001, SEC-003, SEC-004, SEC-005, SEC-006)
- v1.3: Performance optimizations (PERF-001, PERF-002, PERF-003, PERF-005, PERF-008, PERF-010, PERF-011)
- v1.3: Code quality improvements (CQ-004 centralized constants)
- v1.3: Added input sanitization, rate limiting, magic byte validation
- v1.3: Singleton WebSocket manager, proper Zustand selectors
- v1.2: Added comprehensive frontend test suite (293 tests across 8 files)
- v1.2: Added Frontend Testing section with test commands, coverage summary, and examples
- v1.1: Updated container IDs to match deployed infrastructure (440-444)
- v1.1: Added API key configuration and frontend setup
- v1.1: Added chat page with AI integration
