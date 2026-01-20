# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Zentoria MCP Server - Self-hosted AI Control Plane for Proxmox infrastructure using microservices architecture.

## Development Commands

### MCP Gateway (Node.js/Fastify) - `mcp-gateway_441/`
```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (tsx watch)
npm run build                  # Build for production (esbuild)
npm test                       # Run tests (vitest)
npm run test:coverage          # Tests with coverage
npm run lint                   # ESLint
npm run typecheck              # TypeScript check (tsc --noEmit)
npx prisma generate            # Generate Prisma client
npx prisma migrate dev         # Run migrations
npx prisma studio              # Open Prisma Studio
```

### AI Orchestrator (Python/FastAPI) - `ai-orchestrator_444/`
```bash
pip install uv                 # Install uv package manager
uv venv                        # Create virtualenv
source .venv/bin/activate      # Activate (Windows: .venv\Scripts\activate)
uv pip install -e ".[dev]"     # Install with dev dependencies
python -m src.main             # Run server
pytest                         # Run tests
ruff check .                   # Linting
mypy src                       # Type checking
```

### Frontend (Next.js/React) - `frontend_440/`
```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 3000)
npm run build                  # Production build
npm test                       # Unit tests (vitest)
npm run test:coverage          # Tests with coverage
npm run test:e2e               # E2E tests (Playwright)
npm run lint                   # Next.js lint
npm run type-check             # TypeScript check
```

## Architecture

### Service Topology
- **Frontend (440)**: Next.js 14, React 18, Tailwind CSS, Zustand state
- **MCP Gateway (441)**: Fastify API gateway, Prisma ORM, Awilix DI
- **NGINX (442)**: Reverse proxy, SSL termination
- **Qdrant (443)**: Vector database for embeddings
- **AI Orchestrator (444)**: FastAPI, Ollama LLM, agent routing
- **PostgreSQL (404)**: Primary database with pgvector
- **Redis (410)**: Cache, sessions, pub/sub events

### Key Architectural Patterns

**MCP Gateway - Dependency Injection (Awilix)**
Entry point: `src/container.ts`
```typescript
// Services access dependencies via constructor injection
class MyService {
  constructor({ prisma, redis, eventBus }: ContainerCradle) { ... }
}
// Routes access services via `request.diScope`
const service = request.diScope.cradle.myService;
```

**AI Orchestrator - Agent Routing**
Entry point: `src/core/router.py`
- Two-level routing: pattern matching → LLM classification fallback
- 8 specialized agents: chat, code, file, mail, key, workflow, security, search
- Priority-weighted conflict resolution

**Event Bus**
`src/infrastructure/event-bus.ts` - Redis pub/sub for domain events (file.uploaded, auth.*, etc.)

### Critical Files

| Service | Entry Point | Key Files |
|---------|-------------|-----------|
| MCP Gateway | `src/index.ts` | `src/server.ts`, `src/container.ts`, `prisma/schema.prisma` |
| AI Orchestrator | `src/main.py` | `src/core/router.py`, `src/agents/*.py`, `src/config.py` |
| Frontend | `src/app/page.tsx` | `src/lib/api-client.ts`, `src/stores/*.ts` |

## Testing Patterns

### Backend Testing (Vitest)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies via ContainerCradle pattern
const mockPrisma = { apiKey: { findUnique: vi.fn() } };
const service = new ApiKeyService({ prisma: mockPrisma, redis: mockRedis });
```

### Frontend Testing (Vitest + Testing Library)
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

// Mock API calls
vi.mock('@/lib/api-client', () => ({ apiClient: mockApiClient }));
```

## Database

**PostgreSQL Schema**: `prisma/schema.prisma`
- Main models: ApiKey, File, ChatSession, ChatMessage, UserSettings, Agent
- Uses `@map` for snake_case column names

**Migrations**:
```bash
npx prisma migrate dev --name description    # Create migration
npx prisma migrate deploy                    # Apply migrations
```

## Deployment

Uses `/deploy` command:

| Target | Container | Build Command |
|--------|-----------|---------------|
| frontend | 440 | `npm ci && npm run build` |
| backend | 441 | `npm ci && npm run build` |
| ai | 444 | `pip install -e .` |

```bash
/deploy frontend     # Deploy single target
/deploy backend ai   # Deploy multiple
/deploy              # Deploy all
```

## API Documentation

See `backend.md` for complete API reference including:
- All 73 MCP Gateway endpoints
- AI Orchestrator endpoints
- Authentication (JWT + API Key)
- WebSocket protocols
- Request/response schemas
