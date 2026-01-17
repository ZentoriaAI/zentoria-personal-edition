# Zentoria Personal Edition - System Architecture

**Version:** 1.0
**Last Updated:** January 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [High-Level Architecture](#high-level-architecture)
3. [Component Architecture](#component-architecture)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Network Topology](#network-topology)
6. [Security Architecture](#security-architecture)
7. [Scaling Considerations](#scaling-considerations)
8. [Technology Stack](#technology-stack)

---

## Executive Summary

Zentoria Personal Edition is a self-hosted AI Control Plane designed for single-user deployment on Proxmox infrastructure. The system provides a unified interface for managing AI interactions, workflows, file storage, and external integrations through a Model Context Protocol (MCP) architecture.

### Design Principles

1. **Modularity**: Each service runs in isolated LXC containers
2. **Security-First**: Zero-trust architecture within private network
3. **Scalability**: Horizontal scaling capabilities for compute-intensive services
4. **Observability**: Comprehensive monitoring and logging across all layers
5. **Resilience**: Automated backups and disaster recovery procedures

### Core Capabilities

- **AI Orchestration**: Unified interface for multiple AI models (Ollama, Whisper, etc.)
- **Workflow Automation**: n8n-based visual workflow designer
- **Document Processing**: OCR, embeddings, vector search (RAG)
- **Secrets Management**: HashiCorp Vault for credential storage
- **Object Storage**: S3-compatible MinIO storage
- **Real-time Monitoring**: Prometheus + Grafana + Loki stack

---

## High-Level Architecture

### System Overview Diagram (ASCII)

```
┌──────────────────────────────────────────────────────────────────┐
│                        Internet / User                            │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  NGINX Proxy    │ (408)
                    │  SSL/WAF        │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐         ┌─────▼─────┐       ┌────▼────┐
   │ Frontend│         │  Backend  │       │   n8n   │
   │ Next.js │◄───────►│  MCP API  │◄─────►│Workflows│
   │  (400)  │         │   (401)   │       │  (402)  │
   └─────────┘         └─────┬─────┘       └─────────┘
                             │
        ┌────────────────────┼────────────────────────────┐
        │                    │                            │
   ┌────▼────┐         ┌─────▼─────┐              ┌──────▼──────┐
   │   Auth  │         │    Redis  │              │  PostgreSQL │
   │  (409)  │         │   Cache   │              │   + Vector  │
   └─────────┘         │   (410)   │              │    (404)    │
                       └─────┬─────┘              └──────┬──────┘
                             │                           │
                ┌────────────┼───────────────────────────┼────────┐
                │            │                           │        │
          ┌─────▼─────┐ ┌───▼────┐              ┌───────▼──────┐ │
          │   Vault   │ │ MinIO  │              │    Qdrant    │ │
          │ Secrets   │ │ Files  │              │   Vectors    │ │
          │   (403)   │ │ (407)  │              │    (419)     │ │
          └───────────┘ └────────┘              └──────────────┘ │
                                                                  │
        ┌─────────────────────────────────────────────────────────┘
        │
   ┌────▼────┐         ┌──────────┐              ┌──────────┐
   │   AI    │         │  Voice   │              │   OCR    │
   │ Ollama  │◄───────►│ Whisper  │              │Paperless │
   │  (405)  │         │  (413)   │              │  (412)   │
   └─────────┘         └──────────┘              └──────────┘

   ┌──────────────────────────────────────────────────────────┐
   │              Observability Layer (406)                    │
   │  ┌────────────┐  ┌──────────┐  ┌────────┐               │
   │  │ Prometheus │  │ Grafana  │  │  Loki  │               │
   │  └────────────┘  └──────────┘  └────────┘               │
   └──────────────────────────────────────────────────────────┘
```

### Container Zones

```
┌─────────────────────────────────────────────────────────────────┐
│                       DMZ Zone (vmbr0)                          │
│  ┌──────────────┐                    ┌──────────────┐          │
│  │ Proxy (408)  │                    │  WAF (423)   │          │
│  └──────────────┘                    └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Core Zone (10.10.40.0/24)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │Frontend  │ │ Backend  │ │   n8n    │ │   Auth   │          │
│  │  (400)   │ │  (401)   │ │  (402)   │ │  (409)   │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Data Zone (10.10.40.0/24)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │   DB     │ │  Vault   │ │  Files   │ │  Redis   │          │
│  │  (404)   │ │  (403)   │ │  (407)   │ │  (410)   │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  AI Zone (10.10.41.0/24)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │    AI    │ │  Voice   │ │   OCR    │ │Embeddings│          │
│  │  (405)   │ │  (413)   │ │  (412)   │ │  (419)   │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              Infrastructure Zone (10.10.41.0/24)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │   Logs   │ │   Docs   │ │  Backup  │                        │
│  │  (406)   │ │  (418)   │ │  (416)   │                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Frontend Layer (Container 400)

**Technology:** Next.js 14 + React 19 + TypeScript

```
┌─────────────────────────────────────────┐
│          zentoria-frontend              │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │      Next.js Application          │  │
│  │  ┌─────────┐  ┌────────────────┐  │  │
│  │  │  Pages  │  │   Components   │  │  │
│  │  │         │  │                │  │  │
│  │  │ - Chat  │  │ - ChatInterface│  │  │
│  │  │ - Files │  │ - FileManager  │  │  │
│  │  │ - Tools │  │ - WorkflowUI   │  │  │
│  │  └─────────┘  └────────────────┘  │  │
│  │                                    │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │      State Management       │  │  │
│  │  │  - Context API / Zustand    │  │  │
│  │  │  - WebSocket Client         │  │  │
│  │  │  - JWT Handler              │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Port: 3000                             │
│  Protocol: HTTP/HTTPS                   │
└─────────────────────────────────────────┘
```

**Key Features:**
- Server-side rendering (SSR) for SEO and performance
- Real-time updates via WebSocket
- JWT-based authentication
- Responsive design (mobile-first)
- Dark/light theme support

### 2. Backend Layer (Container 401)

**Technology:** Node.js + Fastify + TypeScript

```
┌─────────────────────────────────────────────────────┐
│              zentoria-backend                       │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │         MCP Core API Gateway                 │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │        API Routes                      │ │  │
│  │  │  - /api/v1/mcp/command                 │ │  │
│  │  │  - /api/v1/mcp/upload                  │ │  │
│  │  │  - /api/v1/mcp/files                   │ │  │
│  │  │  - /api/v1/mcp/workflow                │ │  │
│  │  │  - /api/v1/health                      │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │        Middleware                      │ │  │
│  │  │  - Authentication (JWT)                │ │  │
│  │  │  - Rate Limiting                       │ │  │
│  │  │  - Logging (Pino)                      │ │  │
│  │  │  - Error Handling                      │ │  │
│  │  │  - CORS                                │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │        Services                        │ │  │
│  │  │  - AI Orchestrator Client              │ │  │
│  │  │  - Vault Client                        │ │  │
│  │  │  - Database Client                     │ │  │
│  │  │  - Redis Client                        │ │  │
│  │  │  - MinIO Client                        │ │  │
│  │  │  - n8n Webhook Client                  │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │     Permission Engine                  │ │  │
│  │  │  - API Key Validation                  │ │  │
│  │  │  - Scope Checking                      │ │  │
│  │  │  - Audit Logging                       │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │         WebSocket Server                     │  │
│  │  - Real-time updates                         │  │
│  │  - AI response streaming                     │  │
│  │  - Workflow status updates                   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  Ports: 4000 (HTTP), 4001 (WebSocket)              │
└─────────────────────────────────────────────────────┘
```

### 3. Database Layer (Container 404)

**Technology:** PostgreSQL 16 + pgvector + PgBouncer

```
┌─────────────────────────────────────────┐
│            zentoria-db                  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │        PgBouncer                  │  │
│  │  Connection Pooling               │  │
│  │  Port: 6432                       │  │
│  │  Pool Mode: Transaction           │  │
│  │  Max Connections: 1000            │  │
│  │  Default Pool Size: 25            │  │
│  └──────────────┬────────────────────┘  │
│                 │                       │
│  ┌──────────────▼────────────────────┐  │
│  │      PostgreSQL 16                │  │
│  │                                   │  │
│  │  Databases:                       │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  zentoria_core              │  │  │
│  │  │  - users                    │  │  │
│  │  │  - api_keys                 │  │  │
│  │  │  - files                    │  │  │
│  │  │  - workflows                │  │  │
│  │  │  - audit_log                │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  zentoria_vectors           │  │  │
│  │  │  Extension: pgvector         │  │  │
│  │  │  - document_embeddings      │  │  │
│  │  │  - chat_history_embeddings  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  n8n                        │  │  │
│  │  │  - workflows                │  │  │
│  │  │  - executions               │  │  │
│  │  │  - credentials              │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Port: 5432                       │  │
│  │  Encoding: UTF8                   │  │
│  │  Timezone: UTC                    │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Volume: 200 GB                         │
│  Backups: Hourly + Daily                │
└─────────────────────────────────────────┘
```

**Database Schemas:**

See `database/DATABASE_ARCHITECTURE.md` for complete schema documentation.

### 4. AI Layer (Container 405)

**Technology:** Ollama + Custom AI Orchestrator (Python/FastAPI)

```
┌─────────────────────────────────────────────────────┐
│                 zentoria-ai                         │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │          AI Orchestrator Service             │  │
│  │          (FastAPI)                           │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │         Agent Framework                │ │  │
│  │  │                                        │ │  │
│  │  │  - File Agent                         │ │  │
│  │  │  - Email Agent                        │ │  │
│  │  │  - API Key Agent                      │ │  │
│  │  │  - Workflow Agent                     │ │  │
│  │  │  - Security Agent                     │ │  │
│  │  │  - Chat Agent                         │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │       Intent Recognition               │ │  │
│  │  │  - NLU Parser                          │ │  │
│  │  │  - Action Classifier                   │ │  │
│  │  │  - Entity Extraction                   │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  │                                              │  │
│  │  Port: 5000                                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │              Ollama Engine                   │  │
│  │                                              │  │
│  │  Models:                                     │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │  llama3.2:latest (8B)                  │ │  │
│  │  │  - General purpose                     │ │  │
│  │  │  - Context: 8k tokens                  │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │  codellama:latest (7B)                 │ │  │
│  │  │  - Code generation                     │ │  │
│  │  │  - Context: 16k tokens                 │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │  nomic-embed-text                      │ │  │
│  │  │  - Embeddings (768 dimensions)         │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  │                                              │  │
│  │  Port: 11434                                 │  │
│  │  API: OpenAI-compatible                      │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  CPU: 8 cores, RAM: 32 GB                          │
│  GPU: Optional (NVIDIA passthrough)                │
└─────────────────────────────────────────────────────┘
```

### 5. Workflow Automation (Container 402)

**Technology:** n8n

```
┌─────────────────────────────────────────┐
│           zentoria-n8n                  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │        n8n Main Instance          │  │
│  │  - Workflow Designer              │  │
│  │  - Webhook Endpoints              │  │
│  │  - Cron Triggers                  │  │
│  │  - Manual Triggers                │  │
│  │  Port: 5678                       │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │       n8n Worker (Queue)          │  │
│  │  - Long-running workflows         │  │
│  │  - Background jobs                │  │
│  │  - Retry logic                    │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Key Workflows:                         │
│  - MCP Command Router                   │
│  - File Upload Handler                  │
│  - OAuth Token Refresh                  │
│  - AI Result Handler                    │
│  - Backup Export                        │
│                                         │
│  Storage: PostgreSQL (zentoria_core)    │
│  Queue: Redis (bull)                    │
└─────────────────────────────────────────┘
```

### 6. Monitoring Stack (Container 406)

**Technology:** Prometheus + Grafana + Loki + AlertManager

```
┌─────────────────────────────────────────────────────┐
│                zentoria-logs                        │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │            Prometheus                        │  │
│  │  Metrics Collection                          │  │
│  │  - Scrape interval: 15s                      │  │
│  │  - Retention: 30 days                        │  │
│  │  Port: 9090                                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │             Grafana                          │  │
│  │  Visualization                               │  │
│  │  - Dashboards                                │  │
│  │  - Alerting                                  │  │
│  │  - Users/Teams                               │  │
│  │  Port: 3001                                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │              Loki                            │  │
│  │  Log Aggregation                             │  │
│  │  - Retention: 30 days                        │  │
│  │  - Compression: gzip                         │  │
│  │  Port: 3100                                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │            Promtail                          │  │
│  │  Log Shipping                                │  │
│  │  - Docker logs                               │  │
│  │  - Systemd logs                              │  │
│  │  - Application logs                          │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │          AlertManager                        │  │
│  │  Alert Routing                               │  │
│  │  - Email notifications                       │  │
│  │  - Webhook integrations                      │  │
│  │  Port: 9093                                  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### 1. User Request Flow

```
┌───────┐
│ User  │
└───┬───┘
    │
    │ 1. HTTPS Request
    ▼
┌──────────────┐
│ NGINX Proxy  │ SSL Termination, Rate Limiting
│   (408)      │
└──────┬───────┘
       │
       │ 2. HTTP (internal)
       ▼
┌──────────────┐
│   CrowdSec   │ Threat Detection, Bot Filtering
│   WAF (423)  │
└──────┬───────┘
       │
       │ 3. Validated Request
       ▼
┌──────────────┐
│  Frontend    │ Render UI, Client-side Logic
│   (400)      │
└──────┬───────┘
       │
       │ 4. API Call (JWT in header)
       ▼
┌──────────────┐
│   Backend    │
│   MCP API    │──────┐
│   (401)      │      │
└──────┬───────┘      │ 5. Validate JWT
       │              │
       │              ▼
       │         ┌──────────┐
       │         │   Auth   │
       │         │  (409)   │
       │         └──────────┘
       │
       │ 6. Check Cache
       ▼
┌──────────────┐
│    Redis     │
│    (410)     │
└──────┬───────┘
       │
       │ 7. Cache Miss
       ▼
┌──────────────┐
│ PostgreSQL   │ Query Data
│    (404)     │
└──────┬───────┘
       │
       │ 8. Data Retrieved
       ▼
┌──────────────┐
│   Backend    │ Format Response
│   (401)      │
└──────┬───────┘
       │
       │ 9. JSON Response
       ▼
┌──────────────┐
│  Frontend    │ Update UI
│   (400)      │
└──────┬───────┘
       │
       │ 10. Rendered Page
       ▼
┌───────┐
│ User  │
└───────┘
```

### 2. AI Command Flow

```
User: "Upload document.pdf to project X"
│
│ 1. Natural Language Input
▼
┌──────────────┐
│   Backend    │ Parse Request
│   (401)      │
└──────┬───────┘
       │
       │ 2. Forward to AI
       ▼
┌──────────────────┐
│ AI Orchestrator  │ Intent Recognition
│     (405)        │
└──────┬───────────┘
       │
       │ 3. Classify Intent: "file.upload"
       │    Extract Entities: ["document.pdf", "project X"]
       ▼
┌──────────────────┐
│ Permission Engine│ Check user scopes
│     (401)        │
└──────┬───────────┘
       │
       │ 4. Permission: GRANTED
       ▼
┌──────────────────┐
│   n8n Workflow   │ Trigger "File Upload Handler"
│     (402)        │
└──────┬───────────┘
       │
       ├─────────┬──────────┬──────────┐
       │         │          │          │
       ▼         ▼          ▼          ▼
   ┌──────┐ ┌──────┐  ┌─────────┐ ┌──────┐
   │MinIO │ │  DB  │  │OCR (412)│ │Qdrant│
   │(407) │ │(404) │  │         │ │(419) │
   └──┬───┘ └──┬───┘  └────┬────┘ └──┬───┘
      │        │           │          │
      │ 5a.    │ 5b.       │ 5c.      │ 5d.
      │ Store  │ Metadata  │ Extract  │ Embed
      │ File   │ Record    │ Text     │ Vector
      │        │           │          │
      └────────┴───────────┴──────────┘
                           │
                           │ 6. Callback
                           ▼
                     ┌──────────────┐
                     │   Backend    │
                     │    (401)     │
                     └──────┬───────┘
                            │
                            │ 7. WebSocket Push
                            ▼
                     ┌──────────────┐
                     │  Frontend    │
                     │    (400)     │
                     └──────┬───────┘
                            │
                            │ 8. Success Notification
                            ▼
                         ┌──────┐
                         │ User │
                         └──────┘
```

### 3. RAG-Enhanced Query Flow

```
User: "What's in the contract from last month?"
│
│ 1. Query
▼
┌──────────────┐
│   Backend    │
│   (401)      │
└──────┬───────┘
       │
       │ 2. Forward to AI
       ▼
┌──────────────────┐
│ AI Orchestrator  │ Determine RAG needed
│     (405)        │
└──────┬───────────┘
       │
       │ 3. Generate query embedding
       ▼
┌──────────────────┐
│     Ollama       │ nomic-embed-text
│     (405)        │
└──────┬───────────┘
       │
       │ 4. Vector (768 dims)
       ▼
┌──────────────────┐
│     Qdrant       │ Similarity Search
│     (419)        │ Top-K = 5
└──────┬───────────┘
       │
       │ 5. Relevant chunks
       │    [chunk1, chunk2, chunk3, ...]
       ▼
┌──────────────────┐
│ AI Orchestrator  │ Assemble context
│     (405)        │
└──────┬───────────┘
       │
       │ 6. Enhanced prompt:
       │    Context: [chunks]
       │    Question: "What's in the contract..."
       ▼
┌──────────────────┐
│     Ollama       │ llama3.2:latest
│     (405)        │
└──────┬───────────┘
       │
       │ 7. Generated response
       │    with citations
       ▼
┌──────────────┐
│   Backend    │ Format + Stream
│   (401)      │
└──────┬───────┘
       │
       │ 8. WebSocket stream
       ▼
┌──────────────┐
│  Frontend    │ Render with citations
│   (400)      │
└──────┬───────┘
       │
       ▼
┌──────┐
│ User │
└──────┘
```

### 4. Document Processing Pipeline

```
PDF Upload
│
│ 1. Multipart form data
▼
┌──────────────┐
│   Backend    │ Validate file
│   (401)      │
└──────┬───────┘
       │
       │ 2. Store original
       ▼
┌──────────────┐
│    MinIO     │ Bucket: uploads
│    (407)     │
└──────┬───────┘
       │
       │ 3. Trigger workflow
       ▼
┌──────────────────┐
│   n8n Workflow   │ "Document Processor"
│     (402)        │
└──────┬───────────┘
       │
       │ 4. Send to OCR
       ▼
┌──────────────────┐
│  Paperless-ngx   │ Tesseract OCR
│      (412)       │
└──────┬───────────┘
       │
       │ 5. Extracted text
       ▼
┌──────────────────┐
│  RAG Pipeline    │ Chunking Service
│      (419)       │ 512 token chunks
└──────┬───────────┘
       │
       │ 6. Chunks array
       ▼
┌──────────────────┐
│     Ollama       │ nomic-embed-text
│     (405)        │
└──────┬───────────┘
       │
       │ 7. Embeddings array
       ▼
┌──────────────────┐
│     Qdrant       │ Upsert vectors
│     (419)        │ Collection: documents
└──────┬───────────┘
       │
       │ 8. Success
       ├──────────┬─────────┐
       ▼          ▼         ▼
   ┌──────┐  ┌──────┐  ┌──────────┐
   │MinIO │  │  DB  │  │ Backend  │
   │(407) │  │(404) │  │  (401)   │
   │      │  │      │  │          │
   │Move  │  │Meta- │  │Callback  │
   │to    │  │data  │  │Complete  │
   │docs/ │  │      │  │          │
   └──────┘  └──────┘  └──────────┘
```

---

## Network Topology

### IP Address Allocation

| VMID | Container | IP Address | Zone |
|------|-----------|------------|------|
| 400 | zentoria-frontend | 10.10.40.0 | Core |
| 401 | zentoria-backend | 10.10.40.1 | Core |
| 402 | zentoria-n8n | 10.10.40.2 | Core |
| 403 | zentoria-vault | 10.10.40.3 | Data |
| 404 | zentoria-db | 10.10.40.4 | Data |
| 405 | zentoria-ai | 10.10.40.5 | AI |
| 406 | zentoria-logs | 10.10.40.6 | Infrastructure |
| 407 | zentoria-files | 10.10.40.7 | Data |
| 408 | zentoria-proxy | 10.10.40.8 | DMZ |
| 409 | zentoria-auth | 10.10.40.9 | Core |
| 410 | zentoria-redis | 10.10.41.0 | Data |
| 412 | zentoria-ocr | 10.10.41.2 | AI |
| 413 | zentoria-voice | 10.10.41.3 | AI |
| 416 | zentoria-backup | 10.10.41.6 | Infrastructure |
| 418 | zentoria-docs | 10.10.41.8 | Infrastructure |
| 419 | zentoria-embeddings | 10.10.41.9 | AI |
| 423 | zentoria-waf | 10.10.42.3 | Security |

### Firewall Rules Matrix

| Source | Destination | Port | Protocol | Purpose |
|--------|-------------|------|----------|---------|
| Internet | proxy (408) | 80, 443 | TCP | External access |
| proxy (408) | frontend (400) | 3000 | TCP | Web UI |
| proxy (408) | backend (401) | 4000-4001 | TCP | API + WebSocket |
| proxy (408) | n8n (402) | 5678 | TCP | Workflow UI |
| proxy (408) | logs (406) | 3001, 9090 | TCP | Monitoring |
| frontend (400) | backend (401) | 4000-4001 | TCP | API calls |
| backend (401) | db (404) | 5432, 6432 | TCP | Database |
| backend (401) | redis (410) | 6379 | TCP | Cache |
| backend (401) | vault (403) | 8200 | TCP | Secrets |
| backend (401) | ai (405) | 5000, 11434 | TCP | AI services |
| backend (401) | files (407) | 9000 | TCP | Object storage |
| backend (401) | auth (409) | 9000 | TCP | Authentication |
| backend (401) | embeddings (419) | 6333, 8100 | TCP | Vector DB + RAG |
| backend (401) | voice (413) | 9300-9301 | TCP | Voice API |
| backend (401) | ocr (412) | 8000-8001 | TCP | OCR API |
| n8n (402) | backend (401) | 4000 | TCP | Callbacks |
| n8n (402) | db (404) | 5432 | TCP | Workflow storage |
| n8n (402) | redis (410) | 6379 | TCP | Queue |
| n8n (402) | vault (403) | 8200 | TCP | Credentials |
| n8n (402) | ai (405) | 5000, 11434 | TCP | AI integration |
| n8n (402) | voice (413) | 9300 | TCP | Voice workflows |
| n8n (402) | ocr (412) | 8001 | TCP | OCR workflows |
| ai (405) | db (404) | 5432 | TCP | Metadata |
| ai (405) | redis (410) | 6379 | TCP | Caching |
| ai (405) | embeddings (419) | 6333, 8100 | TCP | Vector search |
| voice (413) | ai (405) | 11434 | TCP | Transcription |
| voice (413) | embeddings (419) | 6333 | TCP | Transcript embeddings |
| ocr (412) | files (407) | 9000 | TCP | Document storage |
| ocr (412) | embeddings (419) | 6333 | TCP | Document embeddings |
| ocr (412) | db (404) | 5432 | TCP | Metadata |
| embeddings (419) | ai (405) | 11434 | TCP | Generate embeddings |
| embeddings (419) | db (404) | 5432 | TCP | Metadata |
| backup (416) | ALL | varies | TCP | Backup access |
| logs (406) | ALL | varies | TCP | Metrics scraping |
| waf (423) | logs (406) | 9090 | TCP | Metrics export |

### Default Deny Policy

All traffic not explicitly allowed is **DENIED** by default.

```bash
# Example iptables rules
iptables -P FORWARD DROP
iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow specific flows (examples)
iptables -A FORWARD -s 10.10.40.8 -d 10.10.40.0 -p tcp --dport 3000 -j ACCEPT
iptables -A FORWARD -s 10.10.40.1 -d 10.10.40.4 -p tcp --dport 5432 -j ACCEPT
```

---

## Security Architecture

### 1. Defense in Depth Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 7: User                            │
│  Authentication, Authorization, Session Management          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Layer 6: Application Security                  │
│  Input Validation, CSRF Protection, XSS Prevention          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                Layer 5: API Security                        │
│  Rate Limiting, API Key Validation, Scope Checking          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│            Layer 4: Web Application Firewall                │
│  CrowdSec, Bot Detection, Threat Intelligence               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Layer 3: Network Segmentation                  │
│  Firewall Rules, Zone Isolation, Internal Networks          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│           Layer 2: Container Isolation                      │
│  LXC Isolation, Resource Limits, Namespaces                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Layer 1: Infrastructure                        │
│  Proxmox Security, Host Firewall, Physical Security         │
└─────────────────────────────────────────────────────────────┘
```

### 2. Authentication Flow

```
┌──────────┐
│   User   │
└────┬─────┘
     │ 1. POST /api/v1/auth/login
     │    {username, password}
     ▼
┌──────────────┐
│   Backend    │
│    (401)     │
└──────┬───────┘
       │ 2. Verify credentials
       ▼
┌──────────────┐
│     Auth     │ Validate against database
│   Service    │ or LDAP/OAuth
│    (409)     │
└──────┬───────┘
       │ 3. Credentials valid
       ▼
┌──────────────┐
│   Backend    │ Generate JWT + Refresh Token
│    (401)     │ - JWT expires: 15 min
│              │ - Refresh expires: 7 days
└──────┬───────┘
       │
       │ 4. Store refresh token
       ▼
┌──────────────┐
│    Redis     │ SET user:123:refresh_token = <token>
│    (410)     │ EXPIRE 604800 (7 days)
└──────────────┘
       │
       │ 5. Return tokens
       ▼
┌──────────────┐
│  Frontend    │ Store JWT in httpOnly cookie
│    (400)     │ Store refresh token in localStorage
└──────┬───────┘
       │
       │ 6. Subsequent requests
       │    Include JWT in Authorization header
       ▼
┌──────────────┐
│   Backend    │ Validate JWT signature
│    (401)     │ Check expiration
│              │ Verify scopes
└──────┬───────┘
       │
       │ 7. JWT expired?
       ▼
┌──────────────┐
│  Frontend    │ POST /api/v1/auth/refresh
│    (400)     │ {refresh_token}
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Backend    │ Validate refresh token
│    (401)     │ Generate new JWT
│              │ Rotate refresh token
└──────────────┘
```

### 3. Secrets Management

All sensitive credentials stored in **HashiCorp Vault** (Container 403).

**Secret Paths:**
```
zentoria/
├── db/
│   ├── password
│   └── admin_password
├── redis/
│   └── password
├── minio/
│   ├── root_user
│   └── root_password
├── jwt/
│   ├── secret_key
│   └── refresh_secret
├── n8n/
│   └── encryption_key
├── oauth/
│   ├── google_client_secret
│   ├── github_client_secret
│   └── microsoft_client_secret
└── api_keys/
    ├── openai
    ├── anthropic
    └── stripe
```

**Access Control:**
```hcl
# Example Vault policy for backend service
path "zentoria/db/*" {
  capabilities = ["read"]
}

path "zentoria/redis/*" {
  capabilities = ["read"]
}

path "zentoria/jwt/*" {
  capabilities = ["read"]
}
```

### 4. Audit Logging

All security-relevant events logged to PostgreSQL `audit_log` table.

**Events Tracked:**
- User login/logout
- API key creation/revocation
- Permission changes
- File uploads/downloads
- Workflow executions
- Configuration changes
- Failed authentication attempts
- Suspicious activities

**Schema:**
```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id INTEGER,
  action VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  details JSONB,
  severity VARCHAR(20),
  INDEX idx_audit_timestamp (timestamp),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action)
);
```

---

## Scaling Considerations

### Horizontal Scaling Options

**1. AI Layer (Container 405)**
- Add multiple Ollama instances
- Load balance with HAProxy
- Shared model cache via NFS

**2. Worker Layer (Container 402)**
- Scale n8n workers horizontally
- Use Redis Bull queue for distribution
- Auto-scaling based on queue depth

**3. Database Layer (Container 404)**
- PostgreSQL read replicas
- PgBouncer connection pooling
- Query optimization and indexing

**4. Cache Layer (Container 410)**
- Redis Cluster for horizontal scaling
- Redis Sentinel for high availability
- Separate cache instances per service

### Vertical Scaling Limits

| Container | Max CPU | Max RAM | Notes |
|-----------|---------|---------|-------|
| Frontend (400) | 4 cores | 8 GB | Mostly I/O bound |
| Backend (401) | 8 cores | 16 GB | CPU for API processing |
| AI (405) | 16 cores | 64 GB | GPU preferred |
| DB (404) | 8 cores | 32 GB | More RAM = better cache |
| Redis (410) | 4 cores | 16 GB | Memory-bound |

### Performance Optimization

**Database:**
- Connection pooling (PgBouncer)
- Query optimization
- Proper indexing
- Partitioning for large tables

**Caching Strategy:**
```
Level 1: Browser cache (static assets)
Level 2: CDN cache (if applicable)
Level 3: NGINX proxy cache
Level 4: Redis application cache
Level 5: PostgreSQL shared buffers
```

**AI Inference:**
- Model quantization (int8, int4)
- GPU acceleration (CUDA)
- Batch inference
- Result caching

---

## Technology Stack

### Frontend
- **Framework:** Next.js 14
- **UI Library:** React 19
- **Language:** TypeScript 5.3
- **Styling:** Tailwind CSS + shadcn/ui
- **State:** Zustand / Context API
- **WebSocket:** Socket.io-client

### Backend
- **Runtime:** Node.js 20 LTS
- **Framework:** Fastify 4.x
- **Language:** TypeScript 5.3
- **Validation:** Zod
- **Logging:** Pino
- **Process Manager:** PM2

### Database
- **Primary:** PostgreSQL 16
- **Extensions:** pgvector
- **Pooling:** PgBouncer
- **Migrations:** node-pg-migrate

### Cache
- **Cache:** Redis 7.x
- **Use Cases:** Sessions, API cache, queues
- **Libraries:** ioredis

### AI
- **LLM Engine:** Ollama 0.1.x
- **Models:** Llama 3.2, CodeLlama, Nomic Embed
- **Orchestrator:** Custom (Python FastAPI)
- **Vector DB:** Qdrant
- **OCR:** Tesseract + Paperless-ngx
- **Voice:** OpenAI Whisper (faster-whisper)

### Infrastructure
- **Virtualization:** Proxmox VE 8.x
- **Containers:** LXC
- **Orchestration:** Docker Compose
- **Reverse Proxy:** NGINX
- **Monitoring:** Prometheus + Grafana + Loki
- **Secrets:** HashiCorp Vault
- **Backups:** Restic + rclone
- **WAF:** CrowdSec

### Automation
- **Workflows:** n8n
- **CI/CD:** Git-based deployment
- **Scheduling:** Cron / systemd timers

---

## Diagrams

### Entity Relationship Diagram (Core Tables)

```
┌───────────────┐         ┌───────────────┐
│    users      │         │   api_keys    │
├───────────────┤         ├───────────────┤
│ id (PK)       │         │ id (PK)       │
│ email         │◄───────┤│ user_id (FK)  │
│ password_hash │         │ key_hash      │
│ role          │         │ name          │
│ created_at    │         │ scopes[]      │
└───────────────┘         │ expires_at    │
       ▲                  │ status        │
       │                  └───────────────┘
       │
       │                  ┌───────────────┐
       │                  │    files      │
       │                  ├───────────────┤
       │                  │ id (PK)       │
       └─────────────────┤│ user_id (FK)  │
                          │ filename      │
                          │ path          │
                          │ size          │
                          │ mime_type     │
                          │ uploaded_at   │
                          └───────┬───────┘
                                  │
                                  │
                                  ▼
                          ┌───────────────┐
                          │   embeddings  │
                          ├───────────────┤
                          │ id (PK)       │
                          │ file_id (FK)  │
                          │ chunk_index   │
                          │ text          │
                          │ vector(768)   │
                          │ created_at    │
                          └───────────────┘
```

---

## Conclusion

This architecture provides a robust, scalable, and secure foundation for the Zentoria Personal Edition. The modular design allows for incremental deployment and easy maintenance, while the comprehensive monitoring and backup systems ensure reliability and recoverability.

**Key Strengths:**
- ✅ Modular container-based architecture
- ✅ Defense-in-depth security model
- ✅ Comprehensive monitoring and logging
- ✅ Automated backup and disaster recovery
- ✅ Scalability for AI workloads
- ✅ Zero-trust internal networking

**Next Steps:**
1. Review and approve architecture
2. Begin Phase 1 deployment (see DEPLOYMENT_GUIDE.md)
3. Conduct security audit after deployment
4. Optimize performance based on usage patterns
5. Plan for future enhancements

---

**Document Version:** 1.0
**Authors:** Zentoria Engineering Team
**Last Review:** January 2026
**Next Review:** April 2026
