# Zentoria Personal Edition – Volledig Architectuur & Implementatieplan v1.0

**Creator:** Zentoria  
**Type:** Self-Hosted Personal Edition (Geen SaaS/Multi-Tenancy)  
**Datum:** Januari 2026

---

# 1. Visie

Zentoria Personal Edition is een **self-hosted AI Control Plane** op Proxmox, volledig voor persoonlijk gebruik. Eén centrale AI beheert al je cloud-diensten, API-toegang, workflows, bestanden en externe tools via een veilig MCP-platform.

**Kernprincipes:**

- Single-user, geen multi-tenancy overhead
- Elke service in eigen dedicated LXC container
- Modulair en uitbreidbaar
- Zero-trust security binnen eigen netwerk
- Volledige controle over alle data

---

# 2. Container Overzicht (400-reeks)

## Hoofdcontainers

| LXC ID | Hostname          | Rol                          | Technologie                 |
| ------ | ----------------- | ---------------------------- | --------------------------- |
| 400    | zentoria-frontend | Web UI + AI Chat Interface   | Next.js / React             |
| 401    | zentoria-backend  | MCP Core API Gateway         | Node.js / Fastify           |
| 402    | zentoria-n8n      | Workflow Automation Engine   | n8n                         |
| 403    | zentoria-vault    | Secrets & Token Management   | HashiCorp Vault             |
| 404    | zentoria-db       | PostgreSQL + Vector Database | PostgreSQL + pgvector       |
| 405    | zentoria-ai       | AI Orchestrator + Ollama     | Ollama + Custom Agents      |
| 406    | zentoria-logs     | Logging & Monitoring Stack   | Prometheus + Grafana + Loki |
| 407    | zentoria-files    | Object Storage & File Router | MinIO                       |
| 408    | zentoria-proxy    | Reverse Proxy & WAF          | NGINX + ModSecurity         |
| 409    | zentoria-auth     | Authentication & JWT         | Authentik / Custom Auth     |
| 410    | zentoria-redis    | Cache & Message Queue        | Redis + Redis Insight       |

## Uitgebreide Containers

| LXC ID | Hostname            | Rol                              | Technologie               |
| ------ | ------------------- | -------------------------------- | ------------------------- |
| 412    | zentoria-ocr        | Document OCR & Processing        | Tesseract + Paperless-ngx |
| 413    | zentoria-voice      | Voice Processing & Transcription | Whisper + Custom API      |
| 416    | zentoria-backup     | Backup & Disaster Recovery       | Restic + rclone           |
| 418    | zentoria-docs       | Documentatie & Kennisbank        | Wiki.js + Swagger UI      |
| 419    | zentoria-embeddings | Vector DB & RAG Pipeline         | Qdrant + LangChain        |
| 423    | zentoria-waf        | Web Application Firewall         | CrowdSec + GeoIP          |

## Reserve Containers (Toekomstige Uitbreiding)

| LXC ID | Hostname              | Geplande Rol                   |
| ------ | --------------------- | ------------------------------ |
| 411    | zentoria-search       | Full-text Search (Meilisearch) |
| 414    | zentoria-agents       | Dedicated AI Agents            |
| 415    | zentoria-sync         | Cloud Sync Services            |
| 420    | zentoria-pos          | Restaurant POS Integration     |
| 421    | zentoria-reservations | Booking System                 |
| 422    | zentoria-menu         | Menu & Allergen Management     |

---

# 3. Container Specificaties

## 3.1 zentoria-frontend (LXC 400)

**Doel:** Web UI voor alle MCP functies en AI interactie

| Eigenschap | Waarde            |
| ---------- | ----------------- |
| OS         | Ubuntu 24.04 LTS  |
| CPU        | 2 cores           |
| RAM        | 4 GB              |
| Storage    | 40 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)    |

**Services:**

- Next.js 14 Frontend
- WebSocket Client
- JWT Handler

**Poorten:**
| Poort | Doel |
|-------|------|
| 3000 | Frontend App |

**Directory Structuur:**

```
/opt/zentoria/frontend/
├── app/                    # Next.js applicatie
├── public/                 # Static assets
├── config/                 # Configuratie
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── scripts/
│   ├── deploy.sh
│   ├── backup.sh
│   └── healthcheck.sh
└── logs/
```

---

## 3.2 zentoria-backend (LXC 401)

**Doel:** MCP Core API Gateway - Hart van het systeem

| Eigenschap | Waarde            |
| ---------- | ----------------- |
| OS         | Ubuntu 24.04 LTS  |
| CPU        | 4 cores           |
| RAM        | 8 GB              |
| Storage    | 60 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)    |

**Services:**

- REST API (Fastify/Express)
- WebSocket Server
- Permission Engine
- API Key Validator
- Audit Logger

**API Endpoints:**

```
POST /api/v1/mcp/command      # AI command verwerking
POST /api/v1/mcp/upload       # File upload
POST /api/v1/mcp/create-key   # API key generatie
GET  /api/v1/mcp/files        # File listing
POST /api/v1/mcp/email        # Email versturen
POST /api/v1/mcp/workflow     # Workflow trigger
GET  /api/v1/health           # Health check
```

**Poorten:**
| Poort | Doel |
|-------|------|
| 4000 | REST API |
| 4001 | WebSocket |

**Directory Structuur:**

```
/opt/zentoria/backend/
├── src/
│   ├── api/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   └── utils/
├── config/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── scripts/
└── logs/
```

---

## 3.3 zentoria-n8n (LXC 402)

**Doel:** Workflow Automation Engine

| Eigenschap | Waarde            |
| ---------- | ----------------- |
| OS         | Ubuntu 24.04 LTS  |
| CPU        | 4 cores           |
| RAM        | 8 GB              |
| Storage    | 80 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)    |

**Services:**

- n8n Main Instance
- n8n Worker (queue mode)

**Poorten:**
| Poort | Doel |
|-------|------|
| 5678 | n8n Web Interface |

**Workflows:**
| Workflow | Trigger | Functie |
|----------|---------|---------|
| MCP Command Router | Webhook | Route AI → MCP endpoint |
| File Upload Handler | Webhook | Upload, metadata, AI analyse |
| OAuth Token Refresh | Cron | Token vernieuwing |
| AI Result Handler | Webhook | AI output verwerking |
| Backup Export | Cron | Dagelijkse backup |

**Directory Structuur:**

```
/opt/zentoria/n8n/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── data/
│   ├── workflows/
│   ├── credentials/
│   └── backups/
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
│   └── export-workflows.sh
└── logs/
```

---

## 3.4 zentoria-vault (LXC 403)

**Doel:** Secrets & Token Management

| Eigenschap | Waarde            |
| ---------- | ----------------- |
| OS         | Ubuntu 24.04 LTS  |
| CPU        | 2 cores           |
| RAM        | 4 GB              |
| Storage    | 40 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)    |

**Services:**

- HashiCorp Vault

**Opslag:**

- OAuth Tokens
- API Keys
- Encryption Keys
- Database Credentials

**Poorten:**
| Poort | Doel |
|-------|------|
| 8200 | Vault API |
| 8201 | Vault Cluster |

**Directory Structuur:**

```
/opt/zentoria/vault/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── config/
│   └── vault.hcl
├── data/
├── policies/
├── scripts/
│   ├── init.sh
│   ├── unseal.sh
│   └── backup.sh
└── logs/
```

---

## 3.5 zentoria-db (LXC 404)

**Doel:** PostgreSQL + Vector Database

| Eigenschap | Waarde             |
| ---------- | ------------------ |
| OS         | Ubuntu 24.04 LTS   |
| CPU        | 4 cores            |
| RAM        | 16 GB              |
| Storage    | 200 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)     |

**Services:**

- PostgreSQL 16
- pgvector extension (AI embeddings)

**Databases:**
| Database | Doel |
|----------|------|
| zentoria_main | Hoofddatabase |
| zentoria_vectors | AI embeddings |
| n8n | n8n workflow data |

**Poorten:**
| Poort | Doel |
|-------|------|
| 5432 | PostgreSQL |

**Directory Structuur:**

```
/opt/zentoria/db/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── data/
│   └── postgres/
├── backups/
│   ├── daily/
│   └── hourly/
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
│   └── vacuum.sh
├── migrations/
└── logs/
```

---

## 3.6 zentoria-ai (LXC 405)

**Doel:** AI Orchestrator + Ollama Models

| Eigenschap      | Waarde             |
| --------------- | ------------------ |
| OS              | Ubuntu 24.04 LTS   |
| CPU             | 8 cores            |
| RAM             | 32 GB              |
| Storage         | 150 GB (local-zfs) |
| GPU Passthrough | Optioneel          |
| Netwerk         | vmbr0 (intern)     |

**Services:**

- Ollama
- AI Orchestrator Service
- Agent Framework

**AI Agents:**
| Agent | Functie |
|-------|---------|
| File Agent | Bestandsbeheer |
| Mail Agent | Email verwerking |
| Key Agent | API key management |
| Workflow Agent | n8n integratie |
| Security Agent | Permission checks |
| Chat Agent | Conversatie interface |

**Modellen (Ollama):**

- llama3.2:latest (general purpose)
- codellama:latest (code generation)
- nomic-embed-text (embeddings)

**Poorten:**
| Poort | Doel |
|-------|------|
| 11434 | Ollama API |
| 5000 | AI Orchestrator API |

**Directory Structuur:**

```
/opt/zentoria/ai/
├── ollama/
│   └── models/
├── orchestrator/
│   ├── src/
│   ├── agents/
│   └── prompts/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── scripts/
│   ├── pull-models.sh
│   └── benchmark.sh
└── logs/
```

---

## 3.7 zentoria-logs (LXC 406)

**Doel:** Logging & Monitoring Stack

| Eigenschap | Waarde             |
| ---------- | ------------------ |
| OS         | Ubuntu 24.04 LTS   |
| CPU        | 2 cores            |
| RAM        | 8 GB               |
| Storage    | 100 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)     |

**Services:**

- Prometheus (metrics)
- Grafana (dashboards)
- Loki (logs)
- Promtail (log collector)

**Poorten:**
| Poort | Doel |
|-------|------|
| 3001 | Grafana |
| 9090 | Prometheus |
| 3100 | Loki |

**Directory Structuur:**

```
/opt/zentoria/logs/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── prometheus/
│   └── prometheus.yml
├── grafana/
│   ├── provisioning/
│   └── dashboards/
├── loki/
│   └── loki-config.yml
├── data/
└── scripts/
```

---

## 3.8 zentoria-files (LXC 407)

**Doel:** Object Storage & File Router

| Eigenschap | Waarde             |
| ---------- | ------------------ |
| OS         | Ubuntu 24.04 LTS   |
| CPU        | 2 cores            |
| RAM        | 4 GB               |
| Storage    | 500 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)     |

**Services:**

- MinIO (S3-compatible storage)

**Buckets:**
| Bucket | Doel |
|--------|------|
| uploads | User uploads |
| documents | Processed documents |
| backups | System backups |
| temp | Tijdelijke bestanden |

**Poorten:**
| Poort | Doel |
|-------|------|
| 9000 | MinIO API |
| 9001 | MinIO Console |

**Directory Structuur:**

```
/opt/zentoria/files/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── data/
│   └── minio/
├── scripts/
│   ├── create-buckets.sh
│   └── cleanup.sh
└── logs/
```

---

## 3.9 zentoria-proxy (LXC 408)

**Doel:** Reverse Proxy, SSL Termination & WAF

| Eigenschap | Waarde            |
| ---------- | ----------------- |
| OS         | Ubuntu 24.04 LTS  |
| CPU        | 2 cores           |
| RAM        | 4 GB              |
| Storage    | 40 GB (local-zfs) |
| Netwerk    | vmbr0 (DMZ)       |

**Services:**

- NGINX
- Certbot (Let's Encrypt)
- ModSecurity (WAF) - optioneel

**Subdomeinen:**
| Subdomein | Backend | Poort |
|-----------|---------|-------|
| ui.zentoria.local | zentoria-frontend | 3000 |
| api.zentoria.local | zentoria-backend | 4000 |
| n8n.zentoria.local | zentoria-n8n | 5678 |
| vault.zentoria.local | zentoria-vault | 8200 |
| ai.zentoria.local | zentoria-ai | 5000 |
| logs.zentoria.local | zentoria-logs | 3001 |
| files.zentoria.local | zentoria-files | 9001 |
| redis.zentoria.local | zentoria-redis | 8081 |
| docs.zentoria.local | zentoria-docs | 3002 |
| swagger.zentoria.local | zentoria-docs | 8080 |
| ocr.zentoria.local | zentoria-ocr | 8000 |
| voice.zentoria.local | zentoria-voice | 9300 |
| rag.zentoria.local | zentoria-embeddings | 8100 |

**Poorten:**
| Poort | Doel |
|-------|------|
| 80 | HTTP (redirect) |
| 443 | HTTPS |

**Directory Structuur:**

```
/opt/zentoria/proxy/
├── nginx/
│   ├── nginx.conf
│   ├── conf.d/
│   │   ├── frontend.conf
│   │   ├── backend.conf
│   │   ├── n8n.conf
│   │   └── ...
│   └── ssl/
├── certbot/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── scripts/
│   ├── renew-certs.sh
│   └── reload.sh
└── logs/
```

---

## 3.10 zentoria-auth (LXC 409)

**Doel:** Authentication & Authorization

| Eigenschap | Waarde            |
| ---------- | ----------------- |
| OS         | Ubuntu 24.04 LTS  |
| CPU        | 2 cores           |
| RAM        | 4 GB              |
| Storage    | 40 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)    |

**Services:**

- Authentik OF Custom JWT Auth Service

**Features:**

- JWT Token Generation
- Refresh Token Management
- Session Management
- 2FA (optioneel)

**Poorten:**
| Poort | Doel |
|-------|------|
| 9000 | Auth API |
| 9443 | Auth HTTPS |

**Directory Structuur:**

```
/opt/zentoria/auth/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── config/
├── data/
├── scripts/
└── logs/
```

---

## 3.11 zentoria-redis (LXC 410)

**Doel:** Cache & Message Queue

| Eigenschap | Waarde            |
| ---------- | ----------------- |
| OS         | Ubuntu 24.04 LTS  |
| CPU        | 2 cores           |
| RAM        | 8 GB              |
| Storage    | 40 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)    |

**Services:**

- Redis Server
- Redis Insight (Web UI)

**Gebruik:**
| Functie | Beschrijving |
|---------|--------------|
| Session Cache | User sessions |
| API Cache | Response caching |
| Queue | n8n job queue |
| Pub/Sub | Real-time events |
| AI Memory | Short-term AI memory |

**Poorten:**
| Poort | Doel |
|-------|------|
| 6379 | Redis |
| 8081 | Redis Insight |

**Directory Structuur:**

```
/opt/zentoria/redis/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── config/
│   └── redis.conf
├── data/
├── scripts/
│   ├── backup.sh
│   └── flush.sh
└── logs/
```

---

## 3.12 zentoria-ocr (LXC 412)

**Doel:** Document OCR & Automatische Processing

| Eigenschap | Waarde             |
| ---------- | ------------------ |
| OS         | Ubuntu 24.04 LTS   |
| CPU        | 4 cores            |
| RAM        | 8 GB               |
| Storage    | 100 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)     |

**Services:**

- Tesseract OCR Engine
- Paperless-ngx (Document Management)
- PDF Processing Pipeline

**Features:**
| Feature | Beschrijving |
|---------|--------------|
| OCR | Tekst extractie uit afbeeldingen/PDFs |
| Classification | Automatische document categorisatie |
| Tagging | AI-powered auto-tagging |
| Search | Full-text search in documenten |
| Archive | Langetermijn document archivering |

**Poorten:**
| Poort | Doel |
|-------|------|
| 8000 | Paperless-ngx Web UI |
| 8001 | OCR API |

**Directory Structuur:**

```
/opt/zentoria/ocr/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── paperless/
│   ├── consume/          # Inkomende documenten
│   ├── data/
│   ├── media/
│   └── export/
├── tessdata/             # OCR language packs
├── scripts/
│   ├── process.sh
│   ├── export.sh
│   └── cleanup.sh
└── logs/
```

**Integratie:**

- Documenten van MinIO (407) → OCR → Terug naar MinIO
- Metadata → PostgreSQL (404)
- Embeddings → Qdrant (419)
- Workflow triggers → n8n (402)

---

## 3.13 zentoria-voice (LXC 413)

**Doel:** Voice Processing & Transcription

| Eigenschap      | Waarde                                 |
| --------------- | -------------------------------------- |
| OS              | Ubuntu 24.04 LTS                       |
| CPU             | 4 cores                                |
| RAM             | 16 GB                                  |
| Storage         | 80 GB (local-zfs)                      |
| GPU Passthrough | Optioneel (voor snellere transcriptie) |
| Netwerk         | vmbr0 (intern)                         |

**Services:**

- OpenAI Whisper (faster-whisper)
- Custom Voice API
- Audio Processing Pipeline

**Features:**
| Feature | Beschrijving |
|---------|--------------|
| Transcription | Audio naar tekst |
| Voice Commands | Spraak → MCP acties |
| Meeting Notes | Automatische meeting transcripties |
| Language Detection | Automatische taalherkening |
| Speaker Diarization | Spreker identificatie |

**Modellen:**
| Model | Grootte | Gebruik |
|-------|---------|---------|
| whisper-small | 461 MB | Snelle transcriptie |
| whisper-medium | 1.5 GB | Standaard gebruik |
| whisper-large-v3 | 3 GB | Beste kwaliteit |

**Poorten:**
| Poort | Doel |
|-------|------|
| 9300 | Voice API |
| 9301 | WebSocket (streaming) |

**Directory Structuur:**

```
/opt/zentoria/voice/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── whisper/
│   └── models/
├── api/
│   └── src/
├── audio/
│   ├── incoming/
│   ├── processed/
│   └── transcripts/
├── scripts/
│   ├── download-models.sh
│   └── benchmark.sh
└── logs/
```

**Integratie:**

- Audio uploads → Voice API → Transcript
- Transcript → AI Orchestrator (405) voor verwerking
- Voice commands → Backend MCP (401)
- Transcripts → PostgreSQL (404) + Embeddings (419)

---

## 3.14 zentoria-backup (LXC 416)

**Doel:** Centralized Backup & Disaster Recovery

| Eigenschap | Waarde             |
| ---------- | ------------------ |
| OS         | Ubuntu 24.04 LTS   |
| CPU        | 2 cores            |
| RAM        | 4 GB               |
| Storage    | 500 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)     |

**Services:**

- Restic (deduplicated backups)
- rclone (cloud sync)
- Backup Scheduler (cron/systemd timers)
- Backup Verification Service

**Backup Targets:**
| Target | Type | Beschrijving |
|--------|------|--------------|
| Local | Disk | Snelle restores |
| OneDrive | Cloud | Offsite via rclone |
| S3 | Cloud | Optionele extra offsite |

**Backup Schema:**
| Component | Frequentie | Retentie | Type |
|-----------|------------|----------|------|
| PostgreSQL (404) | Elk uur | 7d hourly, 30d daily | pg_dump |
| Redis (410) | 6 uur | 7 dagen | RDB dump |
| Vault (403) | Dagelijks | 30 dagen | Snapshot |
| MinIO (407) | Dagelijks | 30 dagen | Sync |
| n8n workflows (402) | Dagelijks | 90 dagen | JSON export |
| Paperless (412) | Dagelijks | 30 dagen | Export |
| Config files | Bij wijziging | Onbeperkt | Git/copy |
| LXC containers | Wekelijks | 4 weken | vzdump |

**Verificatie:**

- Dagelijkse integrity checks
- Wekelijkse restore tests (geautomatiseerd)
- Maandelijkse full restore drill

**Poorten:**
| Poort | Doel |
|-------|------|
| 8400 | Backup Dashboard (optioneel) |

**Directory Structuur:**

```
/opt/zentoria/backup/
├── restic/
│   ├── repos/
│   │   ├── local/
│   │   └── onedrive/
│   └── cache/
├── rclone/
│   └── config/
├── scripts/
│   ├── backup-all.sh
│   ├── backup-db.sh
│   ├── backup-files.sh
│   ├── verify.sh
│   ├── restore-db.sh
│   ├── restore-full.sh
│   └── disaster-recovery.sh
├── schedules/
│   └── crontab
├── reports/
│   ├── daily/
│   └── verification/
└── logs/
```

**Disaster Recovery Procedure:**

1. Nieuwe Proxmox server provisioning
2. LXC containers restore
3. Restic restore data
4. Service verification
5. DNS cutover

---

## 3.15 zentoria-docs (LXC 418)

**Doel:** Documentatie, Kennisbank & API Docs

| Eigenschap | Waarde            |
| ---------- | ----------------- |
| OS         | Ubuntu 24.04 LTS  |
| CPU        | 2 cores           |
| RAM        | 4 GB              |
| Storage    | 60 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)    |

**Services:**

- Wiki.js (Kennisbank)
- Swagger UI (API Documentatie)
- Redoc (Alternative API docs)

**Documentatie Structuur:**
| Categorie | Inhoud |
|-----------|--------|
| Architecture | System design, data flows |
| API Reference | OpenAPI specs, endpoints |
| Runbooks | Operational procedures |
| Troubleshooting | Common issues & fixes |
| Development | Setup guides, coding standards |
| User Guides | End-user documentation |

**Poorten:**
| Poort | Doel |
|-------|------|
| 3002 | Wiki.js |
| 8080 | Swagger UI |

**Directory Structuur:**

```
/opt/zentoria/docs/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── wiki/
│   └── data/
├── swagger/
│   └── specs/
│       ├── backend-api.yaml
│       ├── ai-api.yaml
│       └── voice-api.yaml
├── runbooks/
│   ├── backup-restore.md
│   ├── scaling.md
│   └── incident-response.md
└── logs/
```

**Integratie:**

- Auto-sync API specs van backend containers
- Git backup van alle documentatie
- Search via Wiki.js built-in
- Links naar Grafana dashboards

---

## 3.16 zentoria-embeddings (LXC 419)

**Doel:** Vector Database & RAG Pipeline

| Eigenschap | Waarde             |
| ---------- | ------------------ |
| OS         | Ubuntu 24.04 LTS   |
| CPU        | 4 cores            |
| RAM        | 16 GB              |
| Storage    | 100 GB (local-zfs) |
| Netwerk    | vmbr0 (intern)     |

**Services:**

- Qdrant (Vector Database)
- Embedding API Service
- RAG Pipeline Service

**Collections:**
| Collection | Beschrijving | Embedding Model |
|------------|--------------|-----------------|
| documents | Alle documenten | nomic-embed-text |
| chat_history | Conversatie context | nomic-embed-text |
| code | Code snippets | codellama embeddings |
| knowledge | Wiki/docs content | nomic-embed-text |

**RAG Pipeline:**

```
Document Upload
    │
    ▼
┌─────────────┐
│   Chunking  │  (split in 512 token chunks)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Embedding  │  (via Ollama nomic-embed-text)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Qdrant    │  (vector storage)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Retrieval  │  (similarity search)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ AI Response │  (context-augmented)
└─────────────┘
```

**Poorten:**
| Poort | Doel |
|-------|------|
| 6333 | Qdrant HTTP API |
| 6334 | Qdrant gRPC |
| 8100 | RAG API Service |

**Directory Structuur:**

```
/opt/zentoria/embeddings/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── qdrant/
│   ├── storage/
│   └── snapshots/
├── rag/
│   ├── src/
│   ├── chunkers/
│   └── retrievers/
├── scripts/
│   ├── index-documents.sh
│   ├── rebuild-collection.sh
│   └── benchmark.sh
└── logs/
```

**Integratie:**

- Documenten van MinIO (407) → Embedding pipeline
- OCR output (412) → Embeddings
- Voice transcripts (413) → Embeddings
- AI queries (405) → RAG retrieval → Enhanced responses

---

## 3.17 zentoria-waf (LXC 423)

**Doel:** Web Application Firewall & Security

| Eigenschap | Waarde                   |
| ---------- | ------------------------ |
| OS         | Ubuntu 24.04 LTS         |
| CPU        | 2 cores                  |
| RAM        | 4 GB                     |
| Storage    | 40 GB (local-zfs)        |
| Netwerk    | vmbr0 (DMZ - voor proxy) |

**Services:**

- CrowdSec (Threat detection & blocking)
- CrowdSec Bouncers
- GeoIP Database
- Threat Intelligence Feeds

**Protection Layers:**
| Layer | Beschrijving |
|-------|--------------|
| Rate Limiting | Request throttling per IP |
| Bot Detection | Automated bot blocking |
| GeoIP Blocking | Block specific countries |
| Reputation | IP reputation scoring |
| Pattern Matching | Attack signature detection |
| Behavioral | Anomaly detection |

**CrowdSec Collections:**
| Collection | Beschrijving |
|------------|--------------|
| crowdsecurity/nginx | NGINX log parsing |
| crowdsecurity/http-cve | CVE exploits |
| crowdsecurity/nginx-http-bf | Brute force |
| crowdsecurity/base-http-scenarios | Common attacks |

**Integratie met NGINX (408):**

```
Internet
    │
    ▼
┌─────────────┐
│ CrowdSec    │ (analyze logs)
│ Agent       │
└──────┬──────┘
       │ (decisions)
       ▼
┌─────────────┐
│ CrowdSec    │ (NGINX bouncer)
│ Bouncer     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   NGINX     │ (408)
│   Proxy     │
└─────────────┘
```

**Poorten:**
| Poort | Doel |
|-------|------|
| 8080 | CrowdSec API |
| 6060 | Prometheus metrics |

**Directory Structuur:**

```
/opt/zentoria/waf/
├── docker/
│   ├── docker-compose.yml
│   └── .env
├── crowdsec/
│   ├── config/
│   │   ├── acquis.yaml
│   │   ├── profiles.yaml
│   │   └── local_api_credentials.yaml
│   ├── data/
│   └── hub/
├── geoip/
│   └── GeoLite2-City.mmdb
├── scripts/
│   ├── update-geoip.sh
│   ├── ban-ip.sh
│   ├── unban-ip.sh
│   └── report.sh
├── whitelists/
│   └── trusted-ips.txt
└── logs/
```

**Alerts & Monitoring:**

- CrowdSec → Prometheus (406) → Grafana dashboard
- Critical alerts → n8n (402) → Notification (email/push)
- Daily security reports

---

# 4. Netwerk Architectuur

## 4.1 Network Zones

| Zone           | Containers                                                        | Beschrijving               |
| -------------- | ----------------------------------------------------------------- | -------------------------- |
| DMZ            | proxy (408), waf (423)                                            | Externe toegang & security |
| Core           | frontend (400), backend (401), auth (409)                         | Applicatie laag            |
| Data           | db (404), vault (403), files (407), redis (410), embeddings (419) | Data opslag                |
| Automation     | n8n (402)                                                         | Workflow engine            |
| AI             | ai (405), voice (413), ocr (412)                                  | AI & processing            |
| Observability  | logs (406), docs (418)                                            | Monitoring & documentatie  |
| Infrastructure | backup (416)                                                      | Backup & recovery          |

## 4.2 Firewall Rules (Proxmox/iptables)

| Bron       | Doel            | Poort       | Protocol |
| ---------- | --------------- | ----------- | -------- |
| waf        | proxy           | 8080        | TCP      |
| proxy      | frontend        | 3000        | TCP      |
| proxy      | backend         | 4000-4001   | TCP      |
| proxy      | n8n             | 5678        | TCP      |
| proxy      | logs (grafana)  | 3001        | TCP      |
| proxy      | files (console) | 9001        | TCP      |
| proxy      | docs            | 3002, 8080  | TCP      |
| frontend   | backend         | 4000-4001   | TCP      |
| backend    | db              | 5432        | TCP      |
| backend    | redis           | 6379        | TCP      |
| backend    | vault           | 8200        | TCP      |
| backend    | ai              | 5000, 11434 | TCP      |
| backend    | files           | 9000        | TCP      |
| backend    | auth            | 9000        | TCP      |
| backend    | embeddings      | 6333, 8100  | TCP      |
| backend    | voice           | 9300-9301   | TCP      |
| backend    | ocr             | 8000-8001   | TCP      |
| n8n        | backend         | 4000        | TCP      |
| n8n        | db              | 5432        | TCP      |
| n8n        | redis           | 6379        | TCP      |
| n8n        | vault           | 8200        | TCP      |
| n8n        | ai              | 5000, 11434 | TCP      |
| n8n        | voice           | 9300        | TCP      |
| n8n        | ocr             | 8001        | TCP      |
| ai         | db              | 5432        | TCP      |
| ai         | redis           | 6379        | TCP      |
| ai         | embeddings      | 6333, 8100  | TCP      |
| voice      | ai              | 11434       | TCP      |
| voice      | embeddings      | 6333        | TCP      |
| ocr        | files           | 9000        | TCP      |
| ocr        | embeddings      | 6333        | TCP      |
| ocr        | db              | 5432        | TCP      |
| embeddings | ai              | 11434       | TCP      |
| embeddings | db              | 5432        | TCP      |
| backup     | ALL             | varies      | TCP      |
| logs       | ALL             | varies      | TCP      |
| waf        | logs            | 9090        | TCP      |

## 4.3 DNS/Hosts (Intern)

Voeg toe aan `/etc/hosts` op elke container of gebruik interne DNS:

```
# Core Services (400-410)
10.10.40.0   zentoria-frontend
10.10.40.1   zentoria-backend
10.10.40.2   zentoria-n8n
10.10.40.3   zentoria-vault
10.10.40.4   zentoria-db
10.10.40.5   zentoria-ai
10.10.40.6   zentoria-logs
10.10.40.7   zentoria-files
10.10.40.8   zentoria-proxy
10.10.40.9   zentoria-auth
10.10.41.0   zentoria-redis

# Extended Services (412-423)
10.10.41.2   zentoria-ocr
10.10.41.3   zentoria-voice
10.10.41.6   zentoria-backup
10.10.41.8   zentoria-docs
10.10.41.9   zentoria-embeddings
10.10.42.3   zentoria-waf
```

---

# 5. Data Flow Architectuur

## 5.1 Request Flow

```
User Request
    │
    ▼
┌─────────────────┐
│  NGINX Proxy    │ (408)
│  SSL Termination│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Frontend     │ (400)
│    Next.js      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│    Backend      │────►│    Auth      │ (409)
│    MCP API      │ (401)│   JWT Check  │
└────────┬────────┘     └──────────────┘
         │
    ┌────┴────┬─────────┬─────────┐
    ▼         ▼         ▼         ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│ Redis │ │  DB   │ │ Vault │ │  AI   │
│ (410) │ │ (404) │ │ (403) │ │ (405) │
└───────┘ └───────┘ └───────┘ └───┬───┘
                                   │
                                   ▼
                            ┌───────────┐
                            │   n8n     │ (402)
                            │ Workflows │
                            └─────┬─────┘
                                  │
                                  ▼
                            ┌───────────┐
                            │   Files   │ (407)
                            │   MinIO   │
                            └───────────┘
```

## 5.2 AI Command Flow

```
1. User → "Upload bestand naar project X"
2. Frontend → Backend API
3. Backend → Auth (JWT validate)
4. Backend → AI Orchestrator
5. AI → Parse intent → "file.upload"
6. AI → Permission check
7. AI → n8n trigger (File Upload Workflow)
8. n8n → MinIO (upload)
9. n8n → DB (metadata)
10. n8n → Callback → Backend
11. Backend → Frontend (result)
12. Logs → Audit trail
```

## 5.3 RAG-Enhanced AI Flow

```
User Query: "Wat staat er in het contract van vorige maand?"
    │
    ▼
┌─────────────────┐
│    Backend      │
│    (401)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Orchestrator│
│     (405)       │
└────────┬────────┘
         │
    ┌────┴────────────────────┐
    │                         │
    ▼                         ▼
┌─────────────┐      ┌─────────────────┐
│  Embedding  │      │   Query Parse   │
│  Generation │      │   & Intent      │
└──────┬──────┘      └────────┬────────┘
       │                      │
       ▼                      │
┌─────────────┐               │
│   Qdrant    │◄──────────────┘
│   (419)     │  (similarity search)
└──────┬──────┘
       │
       │ Top-K relevant chunks
       ▼
┌─────────────────┐
│  Context        │
│  Assembly       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Ollama LLM    │
│   (405)         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Response with  │
│  Citations      │
└─────────────────┘
```

## 5.4 Document Processing Pipeline

```
Document Upload
    │
    ├──────────────────┐
    │                  │
    ▼                  ▼
┌─────────┐      ┌─────────┐
│  Image  │      │   PDF   │
│  File   │      │  /DOCX  │
└────┬────┘      └────┬────┘
     │                │
     ▼                ▼
┌─────────────────────────┐
│      OCR Service        │
│        (412)            │
│  Tesseract + Paperless  │
└───────────┬─────────────┘
            │
            │ Extracted Text
            ▼
┌─────────────────────────┐
│    Chunking Service     │
│    (512 token chunks)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Embedding Service     │
│        (419)            │
│  nomic-embed-text       │
└───────────┬─────────────┘
            │
       ┌────┴────┐
       ▼         ▼
┌─────────┐ ┌─────────┐
│ Qdrant  │ │ MinIO   │
│ Vectors │ │ Original│
│  (419)  │ │  (407)  │
└─────────┘ └─────────┘
            │
            ▼
┌─────────────────────────┐
│     PostgreSQL          │
│     Metadata (404)      │
└─────────────────────────┘
```

## 5.5 Voice Command Flow

```
Voice Input (Audio)
    │
    ▼
┌─────────────────┐
│   Voice API     │
│     (413)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Whisper      │
│  Transcription  │
└────────┬────────┘
         │
         │ Text transcript
         ▼
┌─────────────────┐
│   AI Orchestrator│
│     (405)        │
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│  MCP Command    │
│  Processing     │
└────────┬────────┘
         │
         ▼
    [Normal Flow]
```

---

# 6. Security Model (Simplified)

## 6.1 Authentication Flow

```
1. User login via Frontend
2. Frontend → Auth Service
3. Auth → Generate JWT + Refresh Token
4. JWT stored in httpOnly cookie
5. All API calls include JWT
6. Backend validates JWT on each request
7. Refresh token rotation every 15 min
```

## 6.2 API Key Model

| Veld      | Beschrijving                                  |
| --------- | --------------------------------------------- |
| key       | Unieke API key                                |
| name      | Beschrijvende naam                            |
| scopes    | Toegestane acties (files.read, ai.chat, etc.) |
| expires   | Verloopdatum                                  |
| status    | active / revoked                              |
| last_used | Laatste gebruik timestamp                     |

## 6.3 Secrets Management

Alle secrets in Vault:

- Database credentials
- API keys
- OAuth tokens
- Encryption keys
- Service accounts

---

# 7. Backup Strategie

## 7.1 Backup Schema

| Component     | Type        | Frequentie    | Retentie  |
| ------------- | ----------- | ------------- | --------- |
| PostgreSQL    | Full        | Dagelijks     | 30 dagen  |
| PostgreSQL    | Incremental | Elk uur       | 7 dagen   |
| Vault         | Snapshot    | Dagelijks     | 30 dagen  |
| MinIO         | Sync        | Dagelijks     | 30 dagen  |
| n8n Workflows | Export      | Dagelijks     | 30 dagen  |
| Config files  | Copy        | Bij wijziging | Onbeperkt |

## 7.2 Backup Locaties

- Lokaal: `/mnt/backups/zentoria/`
- Optioneel: OneDrive sync via rclone
- Optioneel: S3 compatible offsite

---

# 8. Monitoring & Logging

## 8.1 Metrics (Prometheus)

- Container CPU/Memory/Disk
- API response times
- Database connections
- Redis memory usage
- AI model inference time
- Workflow execution time

## 8.2 Logs (Loki)

Alle containers loggen naar Loki via Promtail:

- Application logs
- Access logs
- Error logs
- Audit logs

## 8.3 Dashboards (Grafana)

- System Overview
- API Performance
- AI Usage
- Workflow Statistics
- Security Events

---

# 9. Implementatie Volgorde

## Fase 1: Infrastructure Base (Week 1)

1. ✅ Alle 17 LXC containers aanmaken
2. ✅ Netwerk configuratie & firewall rules
3. ✅ Base packages installeren op alle containers

## Fase 2: Data Layer (Week 1-2)

4. zentoria-db (404) - PostgreSQL + pgvector
5. zentoria-redis (410) - Cache & queues
6. zentoria-vault (403) - Secrets management
7. zentoria-files (407) - MinIO object storage
8. zentoria-embeddings (419) - Qdrant vector DB

## Fase 3: Security Layer (Week 2)

9. zentoria-waf (423) - CrowdSec WAF
10. zentoria-auth (409) - JWT Authentication
11. zentoria-proxy (408) - NGINX reverse proxy

## Fase 4: Core Services (Week 2-3)

12. zentoria-backend (401) - MCP API Gateway
13. zentoria-frontend (400) - Next.js UI

## Fase 5: Automation & AI (Week 3-4)

14. zentoria-n8n (402) - Workflow engine
15. zentoria-ai (405) - Ollama + AI Orchestrator
16. zentoria-voice (413) - Whisper transcription
17. zentoria-ocr (412) - Document processing

## Fase 6: Support Services (Week 4)

18. zentoria-logs (406) - Prometheus/Grafana/Loki
19. zentoria-docs (418) - Wiki.js + Swagger
20. zentoria-backup (416) - Restic + rclone

## Fase 7: Integration & Testing (Week 5)

21. Service interconnections testen
22. RAG pipeline configureren
23. Backup/restore verificatie
24. End-to-end testing
25. Security hardening
26. Documentation finaliseren

---

# 10. Environment Variables Template

## Global (.env.global)

```env
# Domain
DOMAIN=zentoria.local
EXTERNAL_DOMAIN=zentoria.ai

# Network
INTERNAL_NETWORK=10.10.40.0/24

# Timezone
TZ=Europe/Amsterdam

# Logging
LOG_LEVEL=info
```

## Per Container (.env)

Elk container heeft eigen .env met:

- Service-specifieke configuratie
- Credentials (via Vault referenties)
- Poort configuratie
- Feature flags

---

# 11. Hardware Requirements

## Totaal Resource Gebruik (17 containers)

| Container        | CPU    | RAM        | Storage     |
| ---------------- | ------ | ---------- | ----------- |
| frontend (400)   | 2      | 4 GB       | 40 GB       |
| backend (401)    | 4      | 8 GB       | 60 GB       |
| n8n (402)        | 4      | 8 GB       | 80 GB       |
| vault (403)      | 2      | 4 GB       | 40 GB       |
| db (404)         | 4      | 16 GB      | 200 GB      |
| ai (405)         | 8      | 32 GB      | 150 GB      |
| logs (406)       | 2      | 8 GB       | 100 GB      |
| files (407)      | 2      | 4 GB       | 500 GB      |
| proxy (408)      | 2      | 4 GB       | 40 GB       |
| auth (409)       | 2      | 4 GB       | 40 GB       |
| redis (410)      | 2      | 8 GB       | 40 GB       |
| ocr (412)        | 4      | 8 GB       | 100 GB      |
| voice (413)      | 4      | 16 GB      | 80 GB       |
| backup (416)     | 2      | 4 GB       | 500 GB      |
| docs (418)       | 2      | 4 GB       | 60 GB       |
| embeddings (419) | 4      | 16 GB      | 100 GB      |
| waf (423)        | 2      | 4 GB       | 40 GB       |
| **TOTAAL**       | **52** | **152 GB** | **2.17 TB** |

## Minimum (Development/Testing)

| Resource | Waarde                    |
| -------- | ------------------------- |
| CPU      | 16 cores (overcommit 3:1) |
| RAM      | 128 GB                    |
| Storage  | 2 TB SSD                  |

## Recommended (Production)

| Resource | Waarde                                 |
| -------- | -------------------------------------- |
| CPU      | 32+ cores                              |
| RAM      | 192-256 GB                             |
| Storage  | 4+ TB NVMe                             |
| GPU      | Optional (NVIDIA voor AI acceleration) |

## Storage Recommendations

| Type     | Gebruik            | Aanbeveling          |
| -------- | ------------------ | -------------------- |
| OS/Apps  | Containers         | NVMe SSD             |
| Database | PostgreSQL, Qdrant | NVMe SSD             |
| Files    | MinIO, Backups     | SATA SSD of HDD RAID |
| Backups  | Restic repos       | Separate disk/NAS    |

---

# 12. Volgende Stappen

Na goedkeuring van dit plan:

1. **Stap 1:** LXC containers aanmaken via Proxmox Shell
2. **Stap 2:** Base setup per container (Docker, directories)
3. **Stap 3:** Database container deployen
4. **Stap 4:** Redis container deployen
5. **... etc.**

Elke stap wordt individueel uitgevoerd met bevestiging.

---

# 13. Referenties

- Proxmox VE Documentation
- Docker Compose Best Practices
- HashiCorp Vault Documentation
- n8n Self-Hosting Guide
- Ollama Documentation
- NGINX Configuration Guide
- PostgreSQL Administration
- MinIO Documentation

---

**Document Status:** Ready for Implementation  
**Versie:** 1.0  
**Laatste Update:** Januari 2026
