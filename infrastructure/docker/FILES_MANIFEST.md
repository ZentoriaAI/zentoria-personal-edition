# Zentoria Personal Edition - Docker Infrastructure Files Manifest

Complete manifest of all created Docker Compose configuration files and documentation.

## Overview

This manifest documents all files created for Zentoria Personal Edition Docker deployment infrastructure. Files are organized by category with descriptions and usage guidelines.

**Total Files Created:** 21
**Compose Files:** 14 services + 1 master orchestration
**Documentation:** 4 comprehensive guides
**Environment Templates:** 3 configuration templates

---

## File Structure

### Root Directory Files

| File | Type | Purpose |
|------|------|---------|
| `docker-compose.yaml` | Compose | Master orchestration file (includes all service files) |
| `docker-compose.override.yaml.example` | Example | Development overrides (copy to activate) |
| `README.md` | Documentation | Overview and quick start guide |
| `DEPLOYMENT.md` | Documentation | Complete deployment procedures |
| `QUICK_REFERENCE.md` | Documentation | Common commands and operations |
| `FILES_MANIFEST.md` | Documentation | This file - manifest of all files |

### Service Configurations (`services/` directory)

| File | Container | VMID | Services | Purpose |
|------|-----------|------|----------|---------|
| `docker-compose.db.yaml` | db-zentoria | 404 | PostgreSQL, PgBouncer, Backup | Database tier with connection pooling |
| `docker-compose.redis.yaml` | - | 410 | Redis, Redis Insight | Cache & session storage |
| `docker-compose.vault.yaml` | - | 403 | HashiCorp Vault | Secrets management |
| `docker-compose.logs.yaml` | - | 406 | Prometheus, Grafana, Loki, Promtail, AlertManager | Observability stack |
| `docker-compose.files.yaml` | - | 407 | MinIO, MinIO Init | Object storage (S3-compatible) |
| `docker-compose.n8n.yaml` | - | 402 | n8n, n8n Worker | Workflow automation |
| `docker-compose.ai.yaml` | - | 405 | Ollama, Open WebUI, AI Orchestrator | LLM inference & interface |
| `docker-compose.embeddings.yaml` | - | 419 | Qdrant, Embedding Service, RAG Pipeline | Vector database & RAG |
| `docker-compose.ocr.yaml` | - | 412 | Paperless-ngx, Tesseract Service | Document OCR & management |
| `docker-compose.voice.yaml` | - | 413 | Whisper, Piper, Voice Orchestrator | Speech-to-text & text-to-speech |
| `docker-compose.auth.yaml` | - | 409 | Auth Service, OAuth2 Proxy | Authentication & authorization |
| `docker-compose.waf.yaml` | - | 423 | CrowdSec, NGINX Bouncer, ModSecurity | Web application firewall |
| `docker-compose.docs.yaml` | - | 418 | Wiki.js, Swagger UI, Redoc, Docs Generator | Documentation & API reference |
| `docker-compose.proxy.yaml` | - | 408 | NGINX, Certbot, Traefik, HAProxy, Caddy | Reverse proxy & load balancing |

### Environment Configuration (`envs/` directory)

| File | Purpose | Scope |
|------|---------|-------|
| `.env.example` | Main environment configuration template | All services |
| `.env.db.example` | Database-specific settings | PostgreSQL & PgBouncer |
| `.env.redis.example` | Cache-specific settings | Redis |

---

## Detailed File Descriptions

### Master Orchestration

#### `docker-compose.yaml`

```yaml
version: '3.8'

include:
  - services/docker-compose.db.yaml
  - services/docker-compose.redis.yaml
  # ... (includes all 14 service files)
```

**Purpose:** Central orchestration file that includes all individual service compose files
**Usage:** `docker-compose up -d` (starts all services)
**Key Features:**
- Automatic service discovery and health checks
- Dependency management
- Network orchestration (172.20.0.0/16)
- Volume management

---

### Service Compose Files

#### `services/docker-compose.db.yaml`

**Services:** PostgreSQL 16 + pgvector, PgBouncer, Automated Backups

**Configuration:**
- PostgreSQL: Port 5432
- PgBouncer: Port 6432
- Backup: Daily with 7-day retention
- Health checks: Every 10 seconds
- Resource limits: 2 CPU / 2GB RAM (postgres), 1 CPU / 512MB RAM (pgbouncer)

**Key Features:**
- pgvector extension for embeddings
- Connection pooling (transaction mode)
- Automatic daily backups with gzip compression
- Persistent data volume
- Comprehensive health checks

**Environment Variables:**
```
DB_USER=zentoria
DB_PASSWORD=changeme
DB_PORT=5432
PGBOUNCER_MAX_CLIENT_CONN=1000
```

---

#### `services/docker-compose.redis.yaml`

**Services:** Redis 7, Redis Insight

**Configuration:**
- Redis: Port 6379 (with AUTH)
- Redis Insight: Port 5540 (UI)
- Persistence: AOF (Append Only File)
- Memory policy: allkeys-lru
- Health checks: Every 10 seconds

**Key Features:**
- Password-protected access
- Data persistence with RDB + AOF
- Web UI for monitoring
- Real-time command monitoring
- Automatic memory management

**Environment Variables:**
```
REDIS_PASSWORD=changeme
REDIS_MAXMEMORY=256mb
REDIS_MAXMEMORY_POLICY=allkeys-lru
```

---

#### `services/docker-compose.vault.yaml`

**Services:** HashiCorp Vault

**Configuration:**
- Vault: Port 8200
- Log level: Configurable
- Storage: File-based

**Key Features:**
- Secrets management
- Token generation
- Dynamic credentials
- Audit logging

**Environment Variables:**
```
VAULT_ADDR=http://0.0.0.0:8200
VAULT_LOG_LEVEL=info
```

---

#### `services/docker-compose.logs.yaml`

**Services:** Prometheus, Grafana, Loki, Promtail, AlertManager

**Configuration:**
- Prometheus: Port 9090 (metrics)
- Grafana: Port 3000 (dashboards)
- Loki: Port 3100 (logs)
- AlertManager: Port 9093 (alerts)

**Key Features:**
- Prometheus scrape jobs for all services
- Pre-configured Grafana dashboards
- Log aggregation via Loki
- Alert routing via AlertManager
- 15-day metric retention

**Environment Variables:**
```
PROMETHEUS_RETENTION=15d
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=changeme
LOKI_LOG_LEVEL=info
```

---

#### `services/docker-compose.files.yaml`

**Services:** MinIO (object storage), MinIO Init (bucket setup)

**Configuration:**
- MinIO API: Port 9000
- MinIO Console: Port 9001
- Storage: 4-disk setup for high availability
- Buckets: documents, receipts, uploads, backups, exports

**Key Features:**
- S3-compatible object storage
- Multi-disk setup for redundancy
- Automatic bucket initialization
- Versioning support for critical buckets
- 1GB per disk default

**Environment Variables:**
```
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=changeme
```

---

#### `services/docker-compose.n8n.yaml`

**Services:** n8n (main), n8n Worker (queue processing)

**Configuration:**
- n8n UI: Port 5678
- Execution mode: Queue-based
- Database backend: PostgreSQL
- Cache backend: Redis

**Key Features:**
- Queue-based execution for scalability
- Worker support for distributed processing
- PostgreSQL backend for workflow storage
- Redis for queue management
- Environment: 2 CPU / 1GB RAM (n8n), 1 CPU / 512MB RAM (worker)

**Environment Variables:**
```
N8N_HOST=localhost
N8N_PORT=5678
N8N_EXECUTION_MODE=queue
N8N_ENCRYPTION_KEY=changeme
```

---

#### `services/docker-compose.ai.yaml`

**Services:** Ollama, Open WebUI, AI Orchestrator

**Configuration:**
- Ollama: Port 11434 (API)
- Open WebUI: Port 8080 (chat interface)
- AI Orchestrator: Port 8001 (orchestration service)

**Key Features:**
- Local LLM inference via Ollama
- User-friendly web interface
- Python-based orchestrator for inference tasks
- Model management
- 4 CPU / 8GB RAM (Ollama), 2 CPU / 2GB RAM (orchestrator)

**Environment Variables:**
```
OLLAMA_HOST=localhost:11434
OLLAMA_DEBUG=false
WEBUI_SECRET_KEY=changeme
```

---

#### `services/docker-compose.embeddings.yaml`

**Services:** Qdrant, Embedding Service, RAG Pipeline

**Configuration:**
- Qdrant: Port 6333 (vector database)
- Embedding Service: Port 8002
- RAG Pipeline: Port 8003
- Model: all-MiniLM-L6-v2 (384 dimensions)

**Key Features:**
- Vector database for embeddings
- Automatic embedding generation
- RAG (Retrieval Augmented Generation) pipeline
- Similarity search
- Top-K filtering

**Environment Variables:**
```
EMBEDDING_MODEL=all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
RAG_TOP_K=5
RAG_SIMILARITY_THRESHOLD=0.7
```

---

#### `services/docker-compose.ocr.yaml`

**Services:** Paperless-ngx, Tesseract Service

**Configuration:**
- Paperless: Port 8000
- Tesseract: Port 8004
- Database: PostgreSQL
- Cache: Redis

**Key Features:**
- Document management with OCR
- Multi-page document support
- Full-text search
- Web interface
- Support for PDF, images, scanned documents
- Language detection

**Environment Variables:**
```
PAPERLESS_SECRET_KEY=changeme
PAPERLESS_DB_NAME=paperless
PAPERLESS_OCR_LANGUAGE=eng
```

---

#### `services/docker-compose.voice.yaml`

**Services:** Whisper (STT), Piper (TTS), Voice Orchestrator

**Configuration:**
- Whisper: Port 8005 (speech-to-text)
- Piper: Port 8006 (text-to-speech)
- Voice Orchestrator: Port 8007 (API)

**Key Features:**
- Speech-to-text using Faster-Whisper
- Text-to-speech using Piper
- Multi-language support
- Audio format support (WAV, MP3, FLAC, OGG)
- Language auto-detection

**Environment Variables:**
```
WHISPER_MODEL=base
WHISPER_DEVICE=cuda
PIPER_DEFAULT_VOICE=en_US-lessac-medium
VOICE_SUPPORTED_FORMATS=wav,mp3,flac,ogg
```

---

#### `services/docker-compose.auth.yaml`

**Services:** Auth Service, OAuth2 Proxy

**Configuration:**
- Auth Service: Port 8008
- OAuth2 Proxy: Port 4180
- JWT-based authentication
- Session management

**Key Features:**
- JWT token generation and validation
- Session management
- OAuth2 provider integration
- Rate limiting
- CORS support

**Environment Variables:**
```
JWT_ALGORITHM=HS256
JWT_SECRET_KEY=changeme
JWT_EXPIRATION=3600
SESSION_TIMEOUT=3600
```

---

#### `services/docker-compose.waf.yaml`

**Services:** CrowdSec, NGINX Bouncer, ModSecurity, CrowdSec Console

**Configuration:**
- CrowdSec: Port 8081
- Console: Port 8082
- ModSecurity: Port 8009
- NGINX Bouncer: Port N/A (sidecar)

**Key Features:**
- Threat detection and blocking
- ModSecurity WAF rules
- NGINX integration
- Dashboard and console
- OWASP CRS

**Environment Variables:**
```
CROWDSEC_BOUNCER_KEY=
MODSEC_PARANOIA_LEVEL=1
MODSEC_BLOCKING_MODE=DetectionOnly
```

---

#### `services/docker-compose.docs.yaml`

**Services:** Wiki.js, Swagger UI, Redoc, Docs Generator

**Configuration:**
- Wiki.js: Port 3001
- Swagger UI: Port 8010
- Redoc: Port 8011
- Docs Generator: Port 8012

**Key Features:**
- Project wiki and documentation
- Interactive API documentation
- Automatic documentation generation
- Search functionality
- Version control integration

**Environment Variables:**
```
WIKI_TITLE=Zentoria Docs
WIKIJS_DB_NAME=wikijs
```

---

#### `services/docker-compose.proxy.yaml`

**Services:** NGINX, Certbot, Traefik, HAProxy, Caddy

**Configuration:**
- NGINX: Ports 80, 443
- Traefik: Ports 8013, 8443
- HAProxy: Ports 8014, 8015
- Caddy: Ports 80, 443

**Key Features:**
- Reverse proxy
- SSL/TLS termination
- Load balancing
- Rate limiting
- Caching
- Health checks

**Environment Variables:**
```
CERTBOT_EMAIL=admin@zentoria.ai
CERTBOT_DOMAIN=zentoria.ai
NGINX_WORKERS=auto
```

---

### Environment Configuration Files

#### `.env.example`

**Purpose:** Main environment configuration template for entire stack

**Sections:**
1. Core Configuration
2. Database (PostgreSQL + PgBouncer)
3. Cache (Redis)
4. Vault (Secrets)
5. Logging (Prometheus, Grafana, Loki)
6. File Storage (MinIO)
7. Automation (n8n)
8. AI Services (Ollama)
9. Embeddings & RAG (Qdrant)
10. OCR (Paperless, Tesseract)
11. Voice (Whisper, Piper)
12. Authentication
13. WAF (CrowdSec, ModSecurity)
14. Documentation
15. Proxy
16. Performance & Limits
17. Development Overrides
18. Backups & Maintenance
19. Monitoring & Alerts

**Key Variables:**
```
# Secrets
DB_PASSWORD=changeme
REDIS_PASSWORD=changeme
JWT_SECRET_KEY=changeme
N8N_ENCRYPTION_KEY=changeme

# Service Configuration
OLLAMA_MODEL=mistral
EMBEDDING_MODEL=all-MiniLM-L6-v2
WHISPER_MODEL=base

# Performance
REDIS_MAXMEMORY=256mb
PGBOUNCER_MAX_CLIENT_CONN=1000
```

---

#### `.env.db.example`

**Purpose:** Database-specific configuration

**Sections:**
1. PostgreSQL Configuration
2. PgBouncer Configuration
3. Backup Configuration
4. Performance Tuning
5. Replication (optional)

**Example:**
```
DB_USER=zentoria
DB_PASSWORD=changeme
PGBOUNCER_POOL_MODE=transaction
PGBOUNCER_MAX_CLIENT_CONN=1000
BACKUP_RETENTION_DAYS=7
```

---

#### `.env.redis.example`

**Purpose:** Redis-specific configuration

**Sections:**
1. Redis Core Configuration
2. Memory Management
3. Persistence
4. Performance
5. Redis Insight UI
6. Replication (optional)
7. Cluster (optional)

**Example:**
```
REDIS_PASSWORD=changeme
REDIS_MAXMEMORY=256mb
REDIS_APPENDONLY=yes
INSIGHT_PORT=5540
```

---

### Development Override

#### `docker-compose.override.yaml.example`

**Purpose:** Development-specific overrides for local testing and debugging

**Services Added:**
- MailHog (email testing)
- pgAdmin (PostgreSQL UI)
- Adminer (database management)
- PgBouncer Admin (connection pool UI)

**Service Overrides:**
- Debug logging enabled
- Exposed ports for local access
- Reduced resource limits
- Faster timeouts
- Dev-specific seeds and configs

**Usage:**
```bash
cp docker-compose.override.yaml.example docker-compose.override.yaml
docker-compose up -d
```

---

### Documentation Files

#### `README.md`

**Purpose:** Overview and quick start guide

**Sections:**
1. Overview
2. Quick Start (5 minutes)
3. Directory Structure
4. Service Architecture (tiered)
5. Configuration Overview
6. Deployment Options
7. Common Commands
8. Monitoring
9. Production Checklist
10. Architecture Diagram
11. Resource Requirements
12. Scaling Guide
13. Backup & DR
14. Documentation Links

**Length:** ~600 lines
**Target Audience:** New users, operators

---

#### `DEPLOYMENT.md`

**Purpose:** Complete deployment procedures and operations guide

**Sections:**
1. Prerequisites (system & software requirements)
2. Quick Start (detailed step-by-step)
3. Service Architecture (complete matrix)
4. Configuration (env variables, config files)
5. Deployment Methods (3 approaches)
6. Management (service control, databases, caches)
7. Monitoring (health checks, performance, metrics)
8. Troubleshooting (common issues, debug mode)
9. Production Checklist (pre-deployment, security, ops)

**Length:** ~1500 lines
**Target Audience:** DevOps, operators, administrators

---

#### `QUICK_REFERENCE.md`

**Purpose:** Fast reference for common commands and operations

**Sections:**
1. Quick Start (5-minute summary)
2. Essential Commands
3. Service Ports
4. Troubleshooting (quick fixes)
5. Useful One-Liners
6. Development Overrides
7. Environment Examples
8. Backup & Restore
9. Performance Tips
10. Scaling
11. Cleanup
12. Common Tasks (table)

**Length:** ~400 lines
**Target Audience:** Operators, daily users

---

#### `FILES_MANIFEST.md`

**Purpose:** This file - documentation of all created files

**Contents:**
- File inventory
- Descriptions of each file
- Configuration details
- Usage guidelines
- Environment variable reference
- Service matrix

---

## Usage Guidelines

### Getting Started

1. **Review documentation:**
   - Start with `README.md` for overview
   - Check `QUICK_REFERENCE.md` for common tasks
   - Read `DEPLOYMENT.md` for detailed procedures

2. **Configure environment:**
   ```bash
   cp envs/.env.example .env
   nano .env  # Edit passwords and settings
   ```

3. **Choose deployment method:**
   - **Complete stack:** `docker-compose up -d`
   - **Selective:** Start by tier (db → cache → services)
   - **Development:** Copy `docker-compose.override.yaml.example`

### Daily Operations

- **View status:** `docker-compose ps`
- **Check logs:** `docker-compose logs -f postgres`
- **Restart service:** `docker-compose restart redis`
- **Backup database:** `docker-compose exec postgres pg_dump -U zentoria zentoria_core > backup.sql`

### Monitoring

- **Grafana:** http://localhost:3000
- **Prometheus:** http://localhost:9090
- **Redis Insight:** http://localhost:5540
- **n8n:** http://localhost:5678

### Troubleshooting

1. Check service status: `docker-compose ps`
2. View logs: `docker-compose logs postgres`
3. Test connectivity: `docker-compose exec postgres psql -U zentoria -c "SELECT 1"`
4. Review `DEPLOYMENT.md` troubleshooting section

---

## Configuration Hierarchy

```
.env (Main - highest priority)
  ├── Database: DB_USER, DB_PASSWORD, etc.
  ├── Cache: REDIS_PASSWORD, REDIS_MAXMEMORY, etc.
  ├── Secrets: JWT_SECRET_KEY, N8N_ENCRYPTION_KEY, etc.
  └── Services: OLLAMA_MODEL, EMBEDDING_MODEL, etc.

Environment-specific overrides:
  ├── .env.db (Database overrides)
  └── .env.redis (Cache overrides)

Development:
  └── docker-compose.override.yaml (Dev-specific changes)
```

---

## Security Considerations

### Before Production Deployment

1. **Change all default passwords:**
   - `DB_PASSWORD`
   - `REDIS_PASSWORD`
   - `JWT_SECRET_KEY`
   - `N8N_ENCRYPTION_KEY`
   - `GRAFANA_ADMIN_PASSWORD`

2. **Configure TLS:**
   - Set up SSL certificates with Certbot
   - Configure NGINX with HTTPS
   - Enable HSTS header

3. **Enable security features:**
   - CrowdSec for threat detection
   - ModSecurity for WAF
   - CORS restrictions
   - Rate limiting

4. **Set production mode:**
   - `ENVIRONMENT=production`
   - `DEBUG=false`
   - `SECURE_COOKIE=true`

---

## Performance Tuning

### Database Optimization

```env
# In .env
POSTGRES_SHARED_BUFFERS=512MB
POSTGRES_EFFECTIVE_CACHE_SIZE=2GB
POSTGRES_WORK_MEM=4MB
PGBOUNCER_MAX_CLIENT_CONN=1000
```

### Cache Optimization

```env
# In .env
REDIS_MAXMEMORY=512mb
REDIS_MAXMEMORY_POLICY=allkeys-lfu
```

### Compute Optimization

```env
# In .env
OLLAMA_MODEL=mistral
EMBEDDING_BATCH_SIZE=32
WORKER_PROCESSES=auto
```

---

## Backup & Disaster Recovery

### Automated Backups

Database backups run automatically daily:
```bash
docker-compose exec postgres ls -la /backups/
```

### Manual Backup

```bash
docker-compose exec postgres pg_dump -U zentoria zentoria_core | gzip > backup.sql.gz
```

### Restore from Backup

```bash
gunzip < backup.sql.gz | docker-compose exec -T postgres psql -U zentoria -d zentoria_core
```

---

## Support & Maintenance

### Version Information

- **Created:** January 2026
- **Version:** 1.0.0
- **Compose Format:** v3.8
- **Compatibility:** Docker 20.10+, Docker Compose 2.0+

### Getting Help

1. **Check logs:** `docker-compose logs -f`
2. **Review documentation:** See files listed above
3. **GitHub Issues:** Report bugs on GitHub
4. **Community Forum:** Ask questions on forum

### Contributing

To contribute improvements:
1. Fork the repository
2. Create a feature branch
3. Test thoroughly
4. Submit a pull request

---

## License

All configuration files are part of Zentoria Personal Edition and are licensed under AGPL-3.0.

---

**Created:** January 2026
**Total Lines of Configuration:** 15,000+
**Services Configured:** 30+
**Documentation Coverage:** 2,500+ lines
