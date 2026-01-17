# MCP Core API Gateway

Central API Gateway for Zentoria Personal Edition (Container 401).

## Features

- **AI Command Processing** - Route commands to AI Orchestrator with context injection
- **File Management** - Upload, list, download files via MinIO S3 storage
- **API Key Management** - Create, list, revoke API keys with scoped permissions
- **Email Sending** - Send emails via SMTP with file attachments
- **Workflow Triggers** - Trigger n8n workflows synchronously or asynchronously
- **WebSocket Streaming** - Real-time AI response streaming
- **Circuit Breakers** - Resilience patterns for external service calls
- **Audit Logging** - Complete audit trail for all operations

## Quick Start

```bash
# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma migrate deploy

# Start development server
npm run dev

# Or with Docker
docker-compose up -d
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/mcp/command` | Process AI command |
| POST | `/api/v1/mcp/upload` | Upload file |
| GET | `/api/v1/mcp/files` | List files |
| GET | `/api/v1/mcp/files/:id` | Get file metadata |
| DELETE | `/api/v1/mcp/files/:id` | Delete file |
| GET | `/api/v1/mcp/files/:id/download` | Download file |
| POST | `/api/v1/mcp/create-key` | Create API key |
| GET | `/api/v1/mcp/keys` | List API keys |
| DELETE | `/api/v1/mcp/keys/:id` | Revoke API key |
| POST | `/api/v1/mcp/email` | Send email |
| POST | `/api/v1/mcp/workflow` | Trigger workflow |
| GET | `/api/v1/mcp/workflow/:id` | Get workflow status |
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/health/ready` | Readiness check |

## Authentication

The gateway supports two authentication methods:

### JWT Bearer Token
```bash
curl -H "Authorization: Bearer <jwt_token>" \
  http://localhost:4000/api/v1/mcp/files
```

### API Key
```bash
curl -H "X-API-Key: znt_live_sk_..." \
  http://localhost:4000/api/v1/mcp/files
```

## Scopes

| Scope | Description |
|-------|-------------|
| `files.read` | Read file metadata and content |
| `files.write` | Upload files |
| `files.delete` | Delete files |
| `ai.chat` | Process AI commands |
| `ai.complete` | AI text completion |
| `workflows.trigger` | Trigger n8n workflows |
| `workflows.read` | Read workflow status |
| `email.send` | Send emails |
| `keys.manage` | Create/revoke API keys |
| `admin` | Full access |

## Project Structure

```
mcp-gateway/
├── src/
│   ├── index.ts                 # Entry point
│   ├── server.ts                # Fastify configuration
│   ├── container.ts             # Dependency injection
│   ├── infrastructure/
│   │   ├── logger.ts            # Pino logger
│   │   ├── redis.ts             # Redis client
│   │   ├── minio.ts             # MinIO client
│   │   ├── database.ts          # Prisma client
│   │   ├── circuit-breaker.ts   # Resilience patterns
│   │   └── shutdown.ts          # Graceful shutdown
│   ├── middleware/
│   │   ├── auth.ts              # JWT/API key auth
│   │   ├── error-handler.ts     # Global error handler
│   │   └── request-logger.ts    # Request logging
│   ├── routes/
│   │   ├── health.ts            # Health endpoints
│   │   ├── mcp.ts               # Command & email
│   │   ├── files.ts             # File management
│   │   ├── keys.ts              # API key management
│   │   ├── workflows.ts         # Workflow triggers
│   │   └── websocket.ts         # WebSocket streaming
│   ├── services/
│   │   ├── auth.service.ts      # Auth validation
│   │   ├── command.service.ts   # AI command processing
│   │   ├── file.service.ts      # File operations
│   │   ├── api-key.service.ts   # API key management
│   │   ├── email.service.ts     # Email sending
│   │   ├── workflow.service.ts  # Workflow orchestration
│   │   ├── vault.service.ts     # Secrets management
│   │   └── health.service.ts    # Health checks
│   ├── repositories/
│   │   ├── api-key.repository.ts
│   │   ├── file.repository.ts
│   │   ├── audit.repository.ts
│   │   └── session.repository.ts
│   └── clients/
│       ├── auth.client.ts       # Auth Service (409)
│       ├── ai-orchestrator.client.ts  # AI Orchestrator (405)
│       └── n8n.client.ts        # n8n (402)
├── prisma/
│   └── schema.prisma            # Database schema
├── docker-compose.yaml          # Docker services
├── Dockerfile                   # Container image
├── openapi.yaml                 # API specification
└── package.json
```

## Environment Variables

See `.env.example` for all configuration options.

## Integration Points

| Service | Container | Purpose |
|---------|-----------|---------|
| Auth Service | 409 | JWT validation, user lookup |
| AI Orchestrator | 405 | Command processing |
| Vault | 403 | Secrets management |
| Redis | 410 | Caching, sessions |
| PostgreSQL | 404 | Persistence |
| MinIO | 407 | File storage |
| n8n | 402 | Workflow automation |

## Resilience Patterns

- **Circuit Breaker** - Prevents cascade failures (cockatiel)
- **Retry with Backoff** - Exponential backoff for transient errors
- **Timeout** - Request timeout handling
- **Bulkhead** - Concurrency isolation
- **Health Checks** - Dependency monitoring
- **Graceful Shutdown** - Proper connection cleanup

## WebSocket Protocol

Connect to `ws://localhost:4001/ws/command` for real-time streaming.

```javascript
const ws = new WebSocket('ws://localhost:4001/ws/command');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-jwt-or-api-key'
}));

// Subscribe to command updates
ws.send(JSON.stringify({
  type: 'subscribe',
  commandId: 'cmd_abc123'
}));

// Receive streaming responses
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'chunk') {
    console.log(data.content);
  }
};
```

## Development

```bash
# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate
```

## License

MIT
