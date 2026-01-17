# Zentoria Personal Edition - Docker Infrastructure Index

Complete index and navigation guide for all Docker Compose configurations and documentation.

---

## Quick Links

### Start Here
1. **New to Zentoria Docker?** → Read [README.md](./README.md)
2. **Need to deploy now?** → See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
3. **Want detailed procedures?** → Consult [DEPLOYMENT.md](./DEPLOYMENT.md)
4. **Looking for a file?** → Check [FILES_MANIFEST.md](./FILES_MANIFEST.md)

---

## Directory Map

```
infrastructure/docker/
├── INDEX.md (this file)
├── README.md                           # Overview & quick start
├── DEPLOYMENT.md                       # Complete deployment guide
├── QUICK_REFERENCE.md                  # Command reference
├── FILES_MANIFEST.md                   # File documentation
├── docker-compose.yaml                 # Master orchestration
├── docker-compose.override.yaml.example # Development overrides
│
├── services/ (14 service definitions)
│   ├── docker-compose.db.yaml          # PostgreSQL + PgBouncer
│   ├── docker-compose.redis.yaml       # Redis + Redis Insight
│   ├── docker-compose.vault.yaml       # HashiCorp Vault
│   ├── docker-compose.logs.yaml        # Prometheus, Grafana, Loki
│   ├── docker-compose.files.yaml       # MinIO
│   ├── docker-compose.n8n.yaml         # n8n Automation
│   ├── docker-compose.ai.yaml          # Ollama + Open WebUI
│   ├── docker-compose.embeddings.yaml  # Qdrant + Embeddings
│   ├── docker-compose.ocr.yaml         # Paperless + Tesseract
│   ├── docker-compose.voice.yaml       # Whisper + Piper
│   ├── docker-compose.auth.yaml        # Auth Service
│   ├── docker-compose.waf.yaml         # CrowdSec + ModSecurity
│   ├── docker-compose.docs.yaml        # Wiki.js + Swagger
│   └── docker-compose.proxy.yaml       # NGINX + Traefik
│
└── envs/ (3 configuration templates)
    ├── .env.example                    # Main environment template
    ├── .env.db.example                 # Database config
    └── .env.redis.example              # Cache config
```

---

## File Categories

### Documentation (4 files)

| File | Purpose | Audience | Length |
|------|---------|----------|--------|
| `README.md` | Overview & quick start | Everyone | 600 lines |
| `DEPLOYMENT.md` | Complete deployment guide | DevOps/Operators | 1500 lines |
| `QUICK_REFERENCE.md` | Command reference | Operators | 400 lines |
| `FILES_MANIFEST.md` | File documentation | Developers | 500 lines |

**Total Documentation:** ~3,000 lines

### Orchestration (1 file)

| File | Services | Purpose |
|------|----------|---------|
| `docker-compose.yaml` | All 30+ | Master orchestration |

### Service Configurations (14 files)

| Category | Services | Ports | File |
|----------|----------|-------|------|
| **Database** | PostgreSQL, PgBouncer, Backup | 5432, 6432 | `docker-compose.db.yaml` |
| **Cache** | Redis, Redis Insight | 6379, 5540 | `docker-compose.redis.yaml` |
| **Secrets** | Vault | 8200 | `docker-compose.vault.yaml` |
| **Monitoring** | Prometheus, Grafana, Loki, AlertManager | 9090, 3000, 3100, 9093 | `docker-compose.logs.yaml` |
| **Storage** | MinIO | 9000, 9001 | `docker-compose.files.yaml` |
| **Automation** | n8n, n8n Worker | 5678 | `docker-compose.n8n.yaml` |
| **AI/LLM** | Ollama, Open WebUI, Orchestrator | 11434, 8080, 8001 | `docker-compose.ai.yaml` |
| **Embeddings** | Qdrant, Embedding Service, RAG | 6333, 8002, 8003 | `docker-compose.embeddings.yaml` |
| **OCR** | Paperless, Tesseract | 8000, 8004 | `docker-compose.ocr.yaml` |
| **Voice** | Whisper, Piper, Orchestrator | 8005, 8006, 8007 | `docker-compose.voice.yaml` |
| **Auth** | Auth Service, OAuth2 Proxy | 8008, 4180 | `docker-compose.auth.yaml` |
| **WAF** | CrowdSec, ModSecurity, Console | 8081, 8082, 8009 | `docker-compose.waf.yaml` |
| **Docs** | Wiki.js, Swagger, Redoc, Generator | 3001, 8010, 8011, 8012 | `docker-compose.docs.yaml` |
| **Proxy** | NGINX, Traefik, HAProxy, Caddy | 80/443, various | `docker-compose.proxy.yaml` |

**Total Services:** 30+
**Total Network Ports:** 40+
**Total Volume Mounts:** 50+

### Configuration Templates (3 files)

| File | Scope | Variables | Purpose |
|------|-------|-----------|---------|
| `.env.example` | Global | 100+ | Main configuration |
| `.env.db.example` | Database | 20+ | PostgreSQL/PgBouncer |
| `.env.redis.example` | Cache | 15+ | Redis-specific |

### Development (1 file)

| File | Purpose | Additions |
|------|---------|-----------|
| `docker-compose.override.yaml.example` | Dev overrides | MailHog, pgAdmin, Adminer, debug logging |

---

## Service Matrix

### By Container (Zentoria Personal Edition)

| VMID | Container | Services | Status | Compose File |
|------|-----------|----------|--------|--------------|
| 402 | zentoria-n8n | n8n, n8n Worker | Live | `docker-compose.n8n.yaml` |
| 403 | zentoria-vault | Vault | Live | `docker-compose.vault.yaml` |
| 404 | zentoria-db | PostgreSQL, PgBouncer, Backup | Live | `docker-compose.db.yaml` |
| 405 | zentoria-ai | Ollama, Open WebUI, AI Orchestrator | Live | `docker-compose.ai.yaml` |
| 406 | zentoria-logs | Prometheus, Grafana, Loki, Promtail, AlertManager | Live | `docker-compose.logs.yaml` |
| 407 | zentoria-files | MinIO, MinIO Init | Live | `docker-compose.files.yaml` |
| 408 | zentoria-proxy | NGINX, Traefik, HAProxy, Caddy, Certbot | Live | `docker-compose.proxy.yaml` |
| 409 | zentoria-auth | Auth Service, OAuth2 Proxy | Live | `docker-compose.auth.yaml` |
| 410 | zentoria-cache | Redis, Redis Insight | Live | `docker-compose.redis.yaml` |
| 412 | zentoria-ocr | Paperless-ngx, Tesseract | Live | `docker-compose.ocr.yaml` |
| 413 | zentoria-voice | Whisper, Piper, Voice Orchestrator | Live | `docker-compose.voice.yaml` |
| 418 | zentoria-docs | Wiki.js, Swagger UI, Redoc, Docs Generator | Live | `docker-compose.docs.yaml` |
| 419 | zentoria-embeddings | Qdrant, Embedding Service, RAG Pipeline | Live | `docker-compose.embeddings.yaml` |
| 423 | zentoria-waf | CrowdSec, NGINX Bouncer, ModSecurity | Live | `docker-compose.waf.yaml` |

### By Port Range

| Port Range | Services | Type |
|------------|----------|------|
| 80, 443 | NGINX, Traefik, HAProxy, Caddy | HTTP/HTTPS |
| 3000-3001 | Grafana, Wiki.js | Web UI |
| 3100 | Loki | Logs |
| 4180 | OAuth2 Proxy | Auth |
| 5432-5540 | PostgreSQL, Redis Insight | Databases |
| 5678 | n8n | Automation |
| 6333-6379 | Qdrant, Redis | Databases |
| 8000-8015 | Various services | APIs |
| 9000-9093 | MinIO, Prometheus, AlertManager | Monitoring/Storage |
| 11434 | Ollama | LLM API |

---

## Configuration Sections in .env

```
CORE CONFIGURATION
├── Environment (ENVIRONMENT, DEBUG, TZ)
└── Service naming (COMPOSE_PROJECT_NAME)

DATABASE
├── PostgreSQL (DB_USER, DB_PASSWORD, DB_PORT)
├── PgBouncer (PGBOUNCER_POOL_MODE, MAX_CLIENT_CONN)
└── Performance (POSTGRES_SHARED_BUFFERS, etc.)

CACHE
├── Redis (REDIS_PASSWORD, REDIS_HOST)
├── Memory (REDIS_MAXMEMORY, REDIS_MAXMEMORY_POLICY)
└── Persistence (REDIS_APPENDONLY, REDIS_SAVE_ENABLED)

SECRETS & SECURITY
├── Vault (VAULT_ADDR, VAULT_TOKEN)
├── JWT (JWT_SECRET_KEY, JWT_EXPIRATION)
└── Encryption (N8N_ENCRYPTION_KEY)

OBSERVABILITY
├── Prometheus (PROMETHEUS_RETENTION)
├── Grafana (GRAFANA_ADMIN_USER, GRAFANA_ADMIN_PASSWORD)
├── Loki (LOKI_LOG_LEVEL)
└── Alerts (ALERT_EMAIL, ALERT_WEBHOOK_URL)

FILE STORAGE
└── MinIO (MINIO_ROOT_USER, MINIO_ROOT_PASSWORD)

AUTOMATION
├── n8n (N8N_HOST, N8N_PORT, N8N_EXECUTION_MODE)
└── Workers (WORKER_TYPE, WORKER_COUNT)

AI/ML
├── Ollama (OLLAMA_HOST, OLLAMA_MODEL)
├── Embeddings (EMBEDDING_MODEL, EMBEDDING_DIMENSION)
└── RAG (RAG_TOP_K, RAG_SIMILARITY_THRESHOLD)

VOICE
├── Whisper (WHISPER_MODEL, WHISPER_DEVICE)
└── Piper (PIPER_DEFAULT_VOICE, PIPER_LANGUAGE)

AUTHENTICATION
├── Auth (JWT_ALGORITHM, JWT_SECRET_KEY)
└── OAuth2 (OAUTH2_CLIENT_ID, OAUTH2_CLIENT_SECRET)

WAF & SECURITY
├── CrowdSec (CROWDSEC_BOUNCER_KEY)
└── ModSecurity (MODSEC_PARANOIA_LEVEL)

PROXY & TLS
├── NGINX (NGINX_WORKERS, NGINX_WORKER_CONNECTIONS)
└── Certbot (CERTBOT_EMAIL, CERTBOT_DOMAIN)

MONITORING & MAINTENANCE
├── Backups (BACKUP_ENABLED, BACKUP_RETENTION_DAYS)
└── Alerts (ALERT_ENABLED, ALERT_EMAIL)
```

---

## Common Workflows

### 1. Fresh Installation

```bash
# 1. Clone repo
git clone https://github.com/zentoria/zentoria-mcp.git
cd infrastructure/docker

# 2. Configure
cp envs/.env.example .env
nano .env  # Edit passwords

# 3. Create network
docker network create zentoria --subnet 172.20.0.0/16

# 4. Start services
docker-compose up -d

# 5. Verify
docker-compose ps
```

### 2. Development Setup

```bash
# 1. Enable development overrides
cp docker-compose.override.yaml.example docker-compose.override.yaml

# 2. Configure for development
nano .env
# Set: DEBUG=true, LOG_LEVEL=debug

# 3. Start with dev services
docker-compose up -d

# Access dev tools:
# - pgAdmin: http://localhost:5050
# - MailHog: http://localhost:8025
# - Adminer: http://localhost:8081
```

### 3. Service-Specific Deployment

```bash
# Database only
docker-compose -f services/docker-compose.db.yaml up -d

# AI only
docker-compose -f services/docker-compose.ai.yaml up -d

# Combined (db + ai + proxy)
docker-compose -f services/docker-compose.db.yaml \
               -f services/docker-compose.ai.yaml \
               -f services/docker-compose.proxy.yaml up -d
```

### 4. Production Hardening

1. Change all passwords in `.env`
2. Set `ENVIRONMENT=production`
3. Configure TLS certificates
4. Enable CrowdSec and ModSecurity
5. Set up monitoring and alerts
6. Test backup & recovery
7. Review security checklist in DEPLOYMENT.md

### 5. Backup & Recovery

```bash
# Backup database
docker-compose exec postgres pg_dump -U zentoria zentoria_core > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U zentoria -d zentoria_core

# Backup volumes
for vol in $(docker volume ls -q | grep zentoria); do
  docker run --rm -v $vol:/data -v /backup:/backup \
  alpine tar czf /backup/$vol.tar.gz -C /data .
done
```

---

## Port Reference

### Core Services
- **HTTP/HTTPS:** 80, 443
- **PostgreSQL:** 5432
- **PgBouncer:** 6432
- **Redis:** 6379

### Applications
- **n8n:** 5678
- **Ollama:** 11434
- **Paperless:** 8000
- **Whisper (STT):** 8005
- **Piper (TTS):** 8006

### Monitoring
- **Grafana:** 3000
- **Prometheus:** 9090
- **Loki:** 3100
- **AlertManager:** 9093

### Storage & Management
- **MinIO API:** 9000
- **MinIO Console:** 9001
- **Qdrant:** 6333
- **Redis Insight:** 5540
- **Wiki.js:** 3001

### Development Tools (if enabled)
- **MailHog:** 8025
- **pgAdmin:** 5050
- **Adminer:** 8081

---

## Environment Variable Quick Reference

### Passwords (Change These!)
```bash
DB_PASSWORD=changeme
REDIS_PASSWORD=changeme
JWT_SECRET_KEY=changeme
N8N_ENCRYPTION_KEY=changeme
GRAFANA_ADMIN_PASSWORD=changeme
MINIO_ROOT_PASSWORD=changeme
```

### Service Selection
```bash
OLLAMA_MODEL=mistral|neural-chat|stable-code
WHISPER_MODEL=tiny|base|small|medium|large
EMBEDDING_MODEL=all-MiniLM-L6-v2|all-mpnet-base-v2
```

### Performance Tuning
```bash
REDIS_MAXMEMORY=256mb|512mb|1gb
PGBOUNCER_MAX_CLIENT_CONN=1000
WORKER_COUNT=2|4|8
INFERENCE_TIMEOUT=60|120|300
```

### Features
```bash
DEBUG=false|true
ENVIRONMENT=production|staging|development
BACKUP_ENABLED=true|false
ALERT_ENABLED=true|false
LANGUAGE_DETECTION=true|false
```

---

## Resource Requirements

### Minimum (Development)
- CPU: 2 cores
- RAM: 8GB
- Disk: 20GB

### Recommended (Production)
- CPU: 8+ cores
- RAM: 32GB
- Disk: 100GB+ SSD

### Optimal (Enterprise)
- CPU: 16+ cores
- RAM: 64GB+
- Disk: 1TB+ SSD with backup

---

## Support & Help

### Documentation
- [README.md](./README.md) - Overview
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Complete guide
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Commands
- [FILES_MANIFEST.md](./FILES_MANIFEST.md) - File details

### Troubleshooting Steps
1. Check logs: `docker-compose logs -f`
2. Verify status: `docker-compose ps`
3. Test connectivity: `docker-compose exec postgres psql -U zentoria -c "SELECT 1"`
4. Review DEPLOYMENT.md troubleshooting section

### Get Help
- GitHub: https://github.com/zentoria/zentoria-mcp/issues
- Forum: https://forum.zentoria.ai
- Email: support@zentoria.ai

---

## Version Information

- **Created:** January 2026
- **Version:** 1.0.0
- **Compose Format:** v3.8
- **Docker:** 20.10+
- **Docker Compose:** 2.0+

---

## License

All configurations are part of Zentoria Personal Edition, licensed under AGPL-3.0.

---

**Navigation:** [README.md](README.md) | [DEPLOYMENT.md](DEPLOYMENT.md) | [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | [FILES_MANIFEST.md](FILES_MANIFEST.md)

**Last Updated:** January 2026
