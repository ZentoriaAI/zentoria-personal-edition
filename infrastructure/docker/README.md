# Zentoria Personal Edition - Docker Infrastructure

Complete Docker Compose configurations for deploying Zentoria Personal Edition with all microservices, supporting infrastructure, and cloud-native architecture.

## Overview

This directory contains production-ready Docker Compose files for the entire Zentoria Personal Edition stack:

- **14 Service Groups** across 14 dedicated compose files
- **30+ Individual Services** with health checks and resource limits
- **Multi-tier Architecture** for scalability and resilience
- **Development & Production** configurations
- **Comprehensive Documentation** and quick reference guides

## Quick Start

```bash
# 1. Clone and enter directory
git clone https://github.com/zentoria/zentoria-mcp.git
cd infrastructure/docker

# 2. Configure environment
cp envs/.env.example .env
nano .env  # Edit passwords and settings

# 3. Create network
docker network create zentoria --subnet 172.20.0.0/16

# 4. Start services
docker-compose up -d

# 5. Verify
docker-compose ps
```

Access services:
- **Dashboard:** http://localhost
- **Grafana:** http://localhost:3000
- **n8n:** http://localhost:5678
- **MinIO:** http://localhost:9001
- **PostgreSQL:** localhost:5432

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for common commands.

## Directory Structure

```
infrastructure/docker/
├── README.md                          # This file
├── DEPLOYMENT.md                      # Complete deployment guide
├── QUICK_REFERENCE.md                 # Command reference
├── docker-compose.yaml                # Master orchestration (includes all services)
├── docker-compose.override.yaml.example # Development overrides
├── .env.example                       # Main configuration template
│
├── services/                          # Individual service configurations
│   ├── docker-compose.db.yaml         # PostgreSQL + PgBouncer (404)
│   ├── docker-compose.redis.yaml      # Redis + Redis Insight (410)
│   ├── docker-compose.vault.yaml      # HashiCorp Vault (403)
│   ├── docker-compose.logs.yaml       # Prometheus, Grafana, Loki (406)
│   ├── docker-compose.files.yaml      # MinIO (407)
│   ├── docker-compose.n8n.yaml        # n8n automation (402)
│   ├── docker-compose.ai.yaml         # Ollama, Open WebUI (405)
│   ├── docker-compose.embeddings.yaml # Qdrant, Embeddings, RAG (419)
│   ├── docker-compose.ocr.yaml        # Paperless, Tesseract (412)
│   ├── docker-compose.voice.yaml      # Whisper, Piper (413)
│   ├── docker-compose.auth.yaml       # Auth Service, OAuth2 (409)
│   ├── docker-compose.waf.yaml        # CrowdSec, ModSecurity (423)
│   ├── docker-compose.docs.yaml       # Wiki.js, Swagger, Redoc (418)
│   └── docker-compose.proxy.yaml      # NGINX, Traefik, HAProxy (408)
│
├── envs/                              # Environment configuration examples
│   ├── .env.example                   # Main environment template
│   ├── .env.db.example                # Database-specific config
│   └── .env.redis.example             # Redis-specific config
│
├── config/                            # Service configuration files
│   ├── nginx/
│   │   ├── nginx.conf
│   │   ├── conf.d/
│   │   └── ssl/
│   ├── prometheus/
│   │   ├── prometheus.yml
│   │   ├── rules/
│   │   └── alertmanager.yml
│   ├── grafana/
│   │   ├── provisioning/
│   │   └── dashboards/
│   ├── loki/
│   │   └── loki-config.yaml
│   ├── vault/
│   │   └── vault.hcl
│   └── ... (additional configs)
│
├── scripts/                           # Deployment and utility scripts
│   ├── deploy.sh
│   ├── backup.sh
│   ├── restore.sh
│   └── health-check.sh
│
└── docs/                              # Additional documentation
    ├── ARCHITECTURE.md
    ├── SCALING.md
    ├── SECURITY.md
    ├── MONITORING.md
    └── TROUBLESHOOTING.md
```

## Service Architecture

### Tier 1: Core Infrastructure (Required)

| Service | Compose File | Ports | Purpose |
|---------|-------------|-------|---------|
| PostgreSQL | `docker-compose.db.yaml` | 5432 | Primary database with pgvector |
| PgBouncer | `docker-compose.db.yaml` | 6432 | Connection pooling |
| Redis | `docker-compose.redis.yaml` | 6379 | Cache and sessions |
| NGINX | `docker-compose.proxy.yaml` | 80, 443 | Reverse proxy |

### Tier 2: Platform Services

| Service | Compose File | Ports | Purpose |
|---------|-------------|-------|---------|
| n8n | `docker-compose.n8n.yaml` | 5678 | Workflow automation |
| Ollama | `docker-compose.ai.yaml` | 11434 | LLM inference |
| Qdrant | `docker-compose.embeddings.yaml` | 6333 | Vector database |
| Paperless | `docker-compose.ocr.yaml` | 8000 | Document OCR |

### Tier 3: Supporting Services

| Service | Compose File | Ports | Purpose |
|---------|-------------|-------|---------|
| Prometheus | `docker-compose.logs.yaml` | 9090 | Metrics collection |
| Grafana | `docker-compose.logs.yaml` | 3000 | Visualization |
| Loki | `docker-compose.logs.yaml` | 3100 | Log aggregation |
| MinIO | `docker-compose.files.yaml` | 9000 | Object storage |
| Vault | `docker-compose.vault.yaml` | 8200 | Secrets management |

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete service matrix.

## Configuration

### Environment Variables

All configuration is through `.env` file. Key sections:

```env
# Database
DB_USER=zentoria
DB_PASSWORD=changeme
PGBOUNCER_MAX_CLIENT_CONN=1000

# Cache
REDIS_PASSWORD=changeme
REDIS_MAXMEMORY=256mb

# Secrets
JWT_SECRET_KEY=changeme
N8N_ENCRYPTION_KEY=changeme

# Services
OLLAMA_MODEL=mistral
WHISPER_MODEL=base
EMBEDDING_MODEL=all-MiniLM-L6-v2

# Monitoring
LOG_LEVEL=info
PROMETHEUS_RETENTION=15d
```

See [envs/.env.example](./envs/.env.example) for complete reference.

### Service Configuration Files

Configuration files are in `config/` directory:

- **NGINX:** `config/nginx/nginx.conf`
- **Prometheus:** `config/prometheus/prometheus.yml`
- **Grafana:** `config/grafana/provisioning/`
- **Loki:** `config/loki/loki-config.yaml`
- **Vault:** `config/vault/vault.hcl`

Customize as needed for your deployment.

## Deployment Options

### Option 1: Complete Stack (All Services)

```bash
docker-compose up -d
```

Starts all 30+ services in dependency order.

### Option 2: Selective Deployment (By Tier)

```bash
# Tier 1: Infrastructure
docker-compose -f services/docker-compose.db.yaml up -d
docker-compose -f services/docker-compose.redis.yaml up -d

# Tier 2: Platform
docker-compose -f services/docker-compose.n8n.yaml up -d
docker-compose -f services/docker-compose.ai.yaml up -d

# Tier 3: Support
docker-compose -f services/docker-compose.logs.yaml up -d
```

### Option 3: Development Mode

```bash
# Enable development overrides
cp docker-compose.override.yaml.example docker-compose.override.yaml

# Start with additional dev tools
docker-compose up -d

# Includes:
# - MailHog (email testing)
# - pgAdmin (database UI)
# - Adminer (database management)
# - Additional debugging
```

### Option 4: Minimal Stack

```bash
# Run only essential services
docker-compose -f services/docker-compose.db.yaml \
               -f services/docker-compose.redis.yaml \
               -f services/docker-compose.proxy.yaml up -d
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment procedures.

## Common Commands

### Service Management

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View status
docker-compose ps

# View logs
docker-compose logs -f postgres

# Restart service
docker-compose restart postgres

# Execute command in container
docker-compose exec postgres psql -U zentoria
```

### Database Operations

```bash
# PostgreSQL shell
docker-compose exec postgres psql -U zentoria -d zentoria_core

# Backup database
docker-compose exec postgres pg_dump -U zentoria zentoria_core > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U zentoria -d zentoria_core

# View connection stats
docker-compose exec pgbouncer psql -U zentoria -p 6432 -d pgbouncer -c "SHOW STATS"
```

### Cache Management

```bash
# Redis CLI
docker-compose exec redis redis-cli -a changeme

# Clear cache
docker-compose exec redis redis-cli -a changeme FLUSHALL

# Check memory usage
docker-compose exec redis redis-cli -a changeme INFO memory
```

See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for more commands.

## Monitoring

### Access Points

- **Grafana Dashboard:** http://localhost:3000 (admin/changeme)
- **Prometheus Metrics:** http://localhost:9090
- **Loki Logs:** Integrated in Grafana
- **Redis Insight:** http://localhost:5540
- **MinIO Console:** http://localhost:9001
- **n8n UI:** http://localhost:5678

### Health Checks

```bash
# View service health
docker-compose ps

# Verify connectivity
docker-compose exec postgres psql -U zentoria -c "SELECT 1"
docker-compose exec redis redis-cli -a changeme ping
```

### Performance Monitoring

```bash
# View resource usage
docker stats

# Check specific service
docker-compose stats postgres
```

## Troubleshooting

### Services Not Starting

```bash
# Check logs
docker-compose logs

# Common issues:
# 1. Port already in use
lsof -i :5432

# 2. Insufficient resources
docker system df

# 3. Network problems
docker-compose down
docker network rm zentoria
docker-compose up -d
```

### Database Connection Issues

```bash
# Test PostgreSQL
docker-compose exec postgres psql -U zentoria -d zentoria_core -c "SELECT 1"

# Check PgBouncer
docker-compose logs pgbouncer

# View connection stats
docker-compose exec pgbouncer psql -U zentoria -p 6432 -d pgbouncer -c "SHOW STATS"
```

See [DEPLOYMENT.md Troubleshooting Section](./DEPLOYMENT.md#troubleshooting) for more detailed solutions.

## Production Checklist

Before deploying to production:

- [ ] Change all default passwords
- [ ] Set `ENVIRONMENT=production`
- [ ] Set `DEBUG=false`
- [ ] Configure TLS certificates
- [ ] Set up monitoring and alerting
- [ ] Configure backup schedule
- [ ] Test disaster recovery
- [ ] Review security settings
- [ ] Configure WAF rules
- [ ] Set up log retention

See [DEPLOYMENT.md Production Checklist](./DEPLOYMENT.md#production-checklist) for complete checklist.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    LOAD BALANCER / PROXY                     │
│              NGINX / Traefik / HAProxy / Caddy               │
└─────────────────────────────────────────────────────────────┘
         ↓              ↓              ↓              ↓
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Frontend   │ │   n8n API    │ │  Ollama API  │ │  Qdrant API  │
│  (Optional)  │ │  (Port 5678) │ │  (Port 11434)│ │  (Port 6333) │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
         ↓              ↓              ↓              ↓
┌─────────────────────────────────────────────────────────────┐
│                 DATABASE LAYER                               │
│  ┌────────────────┐         ┌──────────────────────────┐    │
│  │  PostgreSQL    │         │    Redis Cache           │    │
│  │  (Port 5432)   │         │    (Port 6379)           │    │
│  └────────────────┘         └──────────────────────────┘    │
│  ┌────────────────┐         ┌──────────────────────────┐    │
│  │  PgBouncer     │         │ MinIO Object Storage     │    │
│  │  (Port 6432)   │         │ (Port 9000 / 9001)       │    │
│  └────────────────┘         └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
         ↓                            ↓
┌────────────────────┐      ┌──────────────────────┐
│  MONITORING STACK  │      │  SECURITY LAYER      │
│ - Prometheus       │      │ - CrowdSec           │
│ - Grafana          │      │ - ModSecurity        │
│ - Loki             │      │ - Vault              │
└────────────────────┘      └──────────────────────┘
```

## Resource Requirements

### Minimum (Development)

- CPU: 2 cores
- RAM: 8GB
- Disk: 20GB

### Recommended (Production)

- CPU: 8+ cores
- RAM: 32GB
- Disk: 100GB+ SSD

### High Scale (Enterprise)

- CPU: 16+ cores
- RAM: 64GB+
- Disk: 1TB+ SSD with backup

## Scaling

### Horizontal Scaling

```bash
# Scale n8n workers
docker-compose up -d --scale n8n-worker=5

# Scale embedding service
docker-compose up -d --scale embedding-service=3

# View scaled services
docker-compose ps | grep worker
```

### Vertical Scaling

Update resource limits in compose files:

```yaml
resources:
  limits:
    cpus: '4'
    memory: 4G
  reservations:
    cpus: '2'
    memory: 2G
```

## Backup & Disaster Recovery

### Automated Backups

Database backups are automatically created daily and retained for 7 days.

```bash
# View backups
docker-compose exec postgres ls -la /backups/

# Manual backup
docker-compose exec postgres pg_dump -U zentoria zentoria_core | gzip > backup.sql.gz

# Restore from backup
gunzip < backup.sql.gz | docker-compose exec -T postgres psql -U zentoria -d zentoria_core
```

### Volume Backups

```bash
# Backup all volumes
for vol in $(docker volume ls -q | grep zentoria); do
  docker run --rm -v $vol:/data -v /backup:/backup \
  alpine tar czf /backup/$vol.tar.gz -C /data .
done

# Restore all volumes
for backup in /backup/*.tar.gz; do
  vol=$(basename $backup .tar.gz)
  docker run --rm -v $vol:/data -v /backup:/backup \
  alpine tar xzf /backup/$backup -C /
done
```

## Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Command reference
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Detailed architecture
- **[SCALING.md](./docs/SCALING.md)** - Scaling strategies
- **[SECURITY.md](./docs/SECURITY.md)** - Security hardening
- **[MONITORING.md](./docs/MONITORING.md)** - Monitoring setup
- **[TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Common issues

## Support & Resources

- **Documentation:** https://docs.zentoria.ai
- **GitHub Issues:** https://github.com/zentoria/zentoria-mcp/issues
- **Community Forum:** https://forum.zentoria.ai
- **Email Support:** support@zentoria.ai

## License

Zentoria Personal Edition is licensed under the AGPL-3.0 License.

See LICENSE file for details.

---

**Last Updated:** January 2026
**Version:** 1.0.0
**Maintainer:** Zentoria Team
