# Zentoria Personal Edition - Docker Deployment Guide

Complete guide for deploying Zentoria Personal Edition using Docker Compose.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Service Architecture](#service-architecture)
4. [Configuration](#configuration)
5. [Deployment](#deployment)
6. [Management](#management)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)
9. [Production Checklist](#production-checklist)

---

## Prerequisites

### System Requirements

- **OS:** Linux (Ubuntu 20.04+), macOS, or Windows (WSL2)
- **CPU:** 8+ cores recommended
- **RAM:** 16GB minimum, 32GB recommended
- **Disk:** 100GB+ SSD
- **Network:** Stable internet connection

### Software Requirements

```bash
# Docker & Docker Compose
docker --version  # 20.10+
docker-compose --version  # 2.0+

# Essential tools
git clone https://github.com/zentoria/zentoria-mcp.git
cd infrastructure/docker
```

### Installation

**macOS/Linux:**
```bash
# Install Docker Desktop from https://www.docker.com/products/docker-desktop
# Or use system package manager
sudo apt-get install docker.io docker-compose -y
sudo usermod -aG docker $USER
```

**Windows (WSL2):**
```bash
# Enable WSL2
wsl --install

# Install Docker Desktop for Windows
# https://www.docker.com/products/docker-desktop

# Allocate resources in .wslconfig
notepad $env:USERPROFILE\.wslconfig
# Set:
# [wsl2]
# memory=16GB
# processors=8
```

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/zentoria/zentoria-mcp.git
cd infrastructure/docker
```

### 2. Configure Environment

```bash
# Copy environment templates
cp envs/.env.example .env
cp docker-compose.override.yaml.example docker-compose.override.yaml

# Edit configuration
nano .env

# Key settings to change:
# - DB_PASSWORD
# - REDIS_PASSWORD
# - MINIO_ROOT_PASSWORD
# - JWT_SECRET_KEY
# - N8N_ENCRYPTION_KEY
```

### 3. Create Network

```bash
docker network create zentoria --subnet 172.20.0.0/16
```

### 4. Start Services

```bash
# Start database first (wait for it to be healthy)
docker-compose -f services/docker-compose.db.yaml up -d
docker-compose -f services/docker-compose.db.yaml ps

# Wait for postgres to be healthy
docker-compose -f services/docker-compose.db.yaml logs postgres

# Start Redis
docker-compose -f services/docker-compose.redis.yaml up -d

# Start all other services
docker-compose up -d
```

### 5. Verify Deployment

```bash
# Check all services
docker-compose ps

# Expected output: all services should be "Up"

# Check logs
docker-compose logs -f nginx

# Access services
# - Dashboard: http://localhost
# - Grafana: http://localhost:3000
# - Ollama: http://localhost:11434
# - n8n: http://localhost:5678
# - MinIO: http://localhost:9001
# - PostgreSQL: localhost:5432
```

---

## Service Architecture

### Core Infrastructure

| Service | Port | Purpose | Container | Status |
|---------|------|---------|-----------|--------|
| **PostgreSQL** | 5432 | Primary database with pgvector | postgres | DB (404) |
| **PgBouncer** | 6432 | Connection pooling | pgbouncer | DB (404) |
| **Redis** | 6379 | Cache & sessions | redis | Cache (410) |
| **Redis Insight** | 5540 | Redis UI | redis-insight | Cache (410) |

### Security & Secrets

| Service | Port | Purpose | Container | Status |
|---------|------|---------|-----------|--------|
| **Vault** | 8200 | Secrets management | vault | Vault (403) |
| **CrowdSec** | 8081 | Threat detection | crowdsec | WAF (423) |
| **ModSecurity** | 8009 | Web application firewall | modsecurity | WAF (423) |
| **Auth Service** | 8008 | JWT authentication | auth-service | Auth (409) |
| **OAuth2 Proxy** | 4180 | Token validation | oauth2-proxy | Auth (409) |

### Observability

| Service | Port | Purpose | Container | Status |
|---------|------|---------|-----------|--------|
| **Prometheus** | 9090 | Metrics collection | prometheus | Logs (406) |
| **Grafana** | 3000 | Visualization | grafana | Logs (406) |
| **Loki** | 3100 | Log aggregation | loki | Logs (406) |
| **Promtail** | N/A | Log shipping | promtail | Logs (406) |
| **AlertManager** | 9093 | Alert routing | alertmanager | Logs (406) |

### Data & Files

| Service | Port | Purpose | Container | Status |
|---------|------|---------|-----------|--------|
| **MinIO** | 9000/9001 | Object storage | minio | Files (407) |
| **Qdrant** | 6333/6334 | Vector database | qdrant | Embeddings (419) |
| **Paperless-ngx** | 8000 | Document OCR | paperless | OCR (412) |
| **Tesseract** | 8004 | Advanced OCR | tesseract-service | OCR (412) |

### AI & Automation

| Service | Port | Purpose | Container | Status |
|---------|------|---------|-----------|--------|
| **Ollama** | 11434 | LLM inference | ollama | AI (405) |
| **Open WebUI** | 8080 | Ollama interface | open-webui | AI (405) |
| **n8n** | 5678 | Workflow automation | n8n | n8n (402) |
| **n8n Worker** | N/A | Queue processing | n8n-worker | n8n (402) |
| **Embedding Service** | 8002 | Vector embeddings | embedding-service | Embeddings (419) |
| **RAG Pipeline** | 8003 | Retrieval augmented generation | rag-pipeline | Embeddings (419) |
| **Whisper** | 8005 | Speech-to-text | whisper-service | Voice (413) |
| **Piper** | 8006 | Text-to-speech | piper-service | Voice (413) |
| **Voice Orchestrator** | 8007 | Voice API | voice-orchestrator | Voice (413) |

### Documentation & API

| Service | Port | Purpose | Container | Status |
|---------|------|---------|-----------|--------|
| **Wiki.js** | 3001 | Documentation wiki | wikijs | Docs (418) |
| **Swagger UI** | 8010 | API documentation | swagger-ui | Docs (418) |
| **Redoc** | 8011 | Alternative API docs | redoc | Docs (418) |
| **Docs Generator** | 8012 | Auto-generated docs | docs-generator | Docs (418) |

### Proxy & Load Balancing

| Service | Port | Purpose | Container | Status |
|---------|------|---------|-----------|--------|
| **NGINX** | 80/443 | Reverse proxy | nginx | Proxy (408) |
| **Traefik** | 80/443 | Advanced routing | traefik | Proxy (408) |
| **HAProxy** | 80/443 | Load balancing | haproxy | Proxy (408) |
| **Caddy** | 80/443 | Simple proxy | caddy | Proxy (408) |
| **Certbot** | N/A | SSL certificates | certbot | Proxy (408) |

---

## Configuration

### Environment Variables

All configuration is through `.env` file. Copy and customize:

```bash
cp envs/.env.example .env
```

### Key Configuration Files

```
infrastructure/docker/
├── .env                           # Main environment variables
├── docker-compose.yaml            # Master orchestration
├── docker-compose.override.yaml   # Development overrides
├── services/                      # Individual service configs
│   ├── docker-compose.db.yaml
│   ├── docker-compose.redis.yaml
│   ├── docker-compose.vault.yaml
│   └── ... (10+ service files)
└── config/                        # Service-specific configs
    ├── nginx/nginx.conf
    ├── prometheus/prometheus.yml
    ├── loki/loki-config.yaml
    ├── vault/vault.hcl
    └── ...
```

### Environment Variable Categories

**Core:**
```env
ENVIRONMENT=production
DEBUG=false
TZ=UTC
```

**Database:**
```env
DB_USER=zentoria
DB_PASSWORD=changeme
PGBOUNCER_MAX_CLIENT_CONN=1000
```

**Cache:**
```env
REDIS_PASSWORD=changeme
REDIS_MAXMEMORY=256mb
```

**Secrets:**
```env
JWT_SECRET_KEY=changeme
N8N_ENCRYPTION_KEY=changeme
VAULT_TOKEN=...
```

---

## Deployment

### Method 1: Docker Compose

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d postgres

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# View logs
docker-compose logs -f
docker-compose logs postgres -f

# Restart service
docker-compose restart postgres
```

### Method 2: Selective Startup

Start services by category:

```bash
# Start database tier
docker-compose -f services/docker-compose.db.yaml up -d
docker-compose -f services/docker-compose.redis.yaml up -d

# Wait for health checks
docker-compose ps

# Start application tier
docker-compose -f services/docker-compose.n8n.yaml up -d
docker-compose -f services/docker-compose.ai.yaml up -d

# Start infrastructure tier
docker-compose -f services/docker-compose.logs.yaml up -d
docker-compose -f services/docker-compose.proxy.yaml up -d
```

### Method 3: Production Deployment Script

```bash
#!/bin/bash
# deploy.sh

set -e

echo "Zentoria Personal Edition - Production Deployment"
echo "=================================================="

# Check prerequisites
if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: docker-compose not found"
    exit 1
fi

# Load environment
if [ ! -f .env ]; then
    echo "ERROR: .env file not found"
    echo "Copy from envs/.env.example first"
    exit 1
fi

# Create network
docker network create zentoria --subnet 172.20.0.0/16 2>/dev/null || true

# Pull latest images
echo "Pulling latest Docker images..."
docker-compose pull

# Start services
echo "Starting services..."
docker-compose up -d

# Wait for health checks
echo "Waiting for services to be healthy..."
sleep 30

# Verify deployment
echo "Verifying deployment..."
docker-compose ps

# Check critical services
CRITICAL_SERVICES=("postgres" "redis" "nginx")
for service in "${CRITICAL_SERVICES[@]}"; do
    status=$(docker-compose ps $service | grep -i running)
    if [ -z "$status" ]; then
        echo "ERROR: $service is not running"
        exit 1
    fi
done

echo "Deployment completed successfully!"
echo "Services available at: http://localhost"
```

---

## Management

### Service Management

```bash
# Start all services
docker-compose up -d

# Stop all services (data persists)
docker-compose down

# Restart service
docker-compose restart postgres

# View service logs
docker-compose logs postgres -f --tail=100

# Execute command in container
docker-compose exec postgres psql -U zentoria -d zentoria_core

# Scale service (if applicable)
docker-compose up -d --scale n8n-worker=3
```

### Database Management

```bash
# PostgreSQL CLI
docker-compose exec postgres psql -U zentoria -d zentoria_core

# Backup database
docker-compose exec postgres pg_dump -U zentoria zentoria_core > backup.sql

# Restore database
docker-compose exec -T postgres psql -U zentoria zentoria_core < backup.sql

# View PgBouncer stats
docker-compose exec pgbouncer psql -U zentoria -p 6432 -d pgbouncer -c "SHOW STATS"
```

### Cache Management

```bash
# Redis CLI
docker-compose exec redis redis-cli -a changeme

# Clear cache
docker-compose exec redis redis-cli -a changeme FLUSHALL

# Monitor cache
docker-compose exec redis redis-cli -a changeme MONITOR

# Check memory usage
docker-compose exec redis redis-cli -a changeme INFO memory
```

### Certificate Management

```bash
# Issue certificate
docker-compose -f services/docker-compose.proxy.yaml exec certbot \
  certonly --webroot --webroot-path=/var/www/certbot \
  -d zentoria.ai -d *.zentoria.ai

# Renew certificates
docker-compose -f services/docker-compose.proxy.yaml exec certbot \
  renew --dry-run

# View certificates
docker-compose -f services/docker-compose.proxy.yaml exec certbot \
  certificates
```

### Volume Management

```bash
# List volumes
docker volume ls | grep zentoria

# Inspect volume
docker volume inspect zentoria_postgres_data

# Backup volume
docker run --rm -v zentoria_postgres_data:/data \
  -v $(pwd):/backup alpine tar czf /backup/postgres.tar.gz /data

# Restore volume
docker run --rm -v zentoria_postgres_data:/data \
  -v $(pwd):/backup alpine tar xzf /backup/postgres.tar.gz -C /
```

---

## Monitoring

### Health Checks

```bash
# Check all services
docker-compose ps

# Expected format:
# NAME                COMMAND             STATUS              PORTS
# zentoria-postgres   "docker-entrypoint" Up (healthy)        5432/tcp
# zentoria-redis      "redis-server"      Up (healthy)        6379/tcp

# Detailed health check
for service in postgres redis nginx; do
    status=$(docker-compose exec $service true 2>/dev/null && echo "OK" || echo "FAIL")
    echo "$service: $status"
done
```

### Performance Monitoring

**Grafana Dashboard:**
```
http://localhost:3000
Username: admin
Password: (from .env: GRAFANA_ADMIN_PASSWORD)
```

**Prometheus Metrics:**
```
http://localhost:9090

# Query examples:
- up{job="postgres"}
- rate(container_cpu_usage_seconds_total[5m])
- node_memory_MemAvailable_bytes
- redis_memory_used_bytes
```

**Loki Logs:**
```
# View logs in Grafana -> Explore -> Loki
# Query examples:
- {job="docker"}
- {container_name="zentoria-postgres"}
```

### Container Metrics

```bash
# CPU and memory usage
docker stats

# Detailed resource usage
docker-compose stats

# Historical metrics
docker-compose ps -q | xargs docker inspect -f \
  '{{.Name}}: {{json .State.Status}}'
```

---

## Troubleshooting

### Common Issues

**Issue: Services not starting**

```bash
# Check logs
docker-compose logs

# Common causes:
# 1. Port already in use
lsof -i :5432  # Check port availability
sudo kill -9 <PID>

# 2. Insufficient resources
docker system df
docker system prune

# 3. Network issues
docker network ls
docker-compose down
docker network rm zentoria
docker-compose up -d
```

**Issue: Database connection failed**

```bash
# Check PostgreSQL
docker-compose logs postgres

# Test connection
docker-compose exec postgres \
  psql -U zentoria -d zentoria_core -c "SELECT 1"

# Check PgBouncer
docker-compose logs pgbouncer
docker-compose exec pgbouncer \
  psql -U zentoria -p 6432 -d pgbouncer -c "SHOW CONNECTIONS"
```

**Issue: Redis connection failed**

```bash
# Check Redis
docker-compose logs redis

# Test connection
docker-compose exec redis \
  redis-cli -a changeme ping

# Clear corrupted data
docker-compose exec redis \
  redis-cli -a changeme FLUSHALL
```

**Issue: Out of memory**

```bash
# Check disk usage
df -h

# Check Docker storage
docker system df

# Cleanup
docker-compose down -v
docker system prune -a

# Increase limits in .env
REDIS_MAXMEMORY=512mb
POSTGRES_SHARED_BUFFERS=512MB
```

### Debug Mode

```bash
# Enable debug logging
nano .env
# Change: DEBUG=true, all LOG_LEVEL=debug

# Restart services
docker-compose down
docker-compose up -d

# View debug logs
docker-compose logs -f --tail=500
```

### Container Inspection

```bash
# Enter container shell
docker-compose exec postgres bash

# Inside container:
# Check running processes
ps aux

# Test network connectivity
ping redis
curl http://nginx:80

# View mounted volumes
mount | grep zentoria

# Check environment variables
env | grep ZENTORIA
```

---

## Production Checklist

### Pre-Deployment

- [ ] Change all default passwords in `.env`
- [ ] Set `ENVIRONMENT=production`
- [ ] Set `DEBUG=false`
- [ ] Configure TLS certificates
- [ ] Set up backup schedule
- [ ] Configure monitoring alerts
- [ ] Test disaster recovery
- [ ] Review security settings
- [ ] Configure WAF rules
- [ ] Set up log retention

### Security

- [ ] Update all container images
- [ ] Enable HTTPS (Certbot)
- [ ] Configure CORS properly
- [ ] Set up firewall rules
- [ ] Enable rate limiting
- [ ] Configure CrowdSec
- [ ] Enable authentication
- [ ] Rotate JWT secrets regularly
- [ ] Use strong passwords
- [ ] Enable audit logging

### Monitoring & Alerting

- [ ] Configure Prometheus scrape targets
- [ ] Set up Grafana dashboards
- [ ] Configure alerting rules
- [ ] Set up log aggregation
- [ ] Configure health checks
- [ ] Set up incident response
- [ ] Configure notification channels
- [ ] Test alerting workflow
- [ ] Document runbooks
- [ ] Set up SLA monitoring

### Backup & Recovery

- [ ] Configure automated backups
- [ ] Test backup restoration
- [ ] Document recovery procedures
- [ ] Set backup retention policy
- [ ] Verify backup integrity
- [ ] Test disaster recovery drill
- [ ] Document RTO/RPO
- [ ] Configure off-site backup storage
- [ ] Set up backup notifications
- [ ] Monitor backup jobs

### Performance Optimization

- [ ] Configure PgBouncer pooling
- [ ] Set appropriate resource limits
- [ ] Configure Redis eviction policy
- [ ] Optimize NGINX caching
- [ ] Configure compression
- [ ] Set up CDN if needed
- [ ] Monitor query performance
- [ ] Configure connection timeouts
- [ ] Implement load balancing
- [ ] Test under load

### Documentation

- [ ] Document architecture
- [ ] Document configurations
- [ ] Document runbooks
- [ ] Document API endpoints
- [ ] Document deployment process
- [ ] Document troubleshooting guide
- [ ] Document scaling procedures
- [ ] Document upgrade procedures
- [ ] Update README
- [ ] Create deployment wiki

---

## Support

### Resources

- **Documentation:** https://docs.zentoria.ai
- **GitHub Issues:** https://github.com/zentoria/zentoria-mcp/issues
- **Community Forum:** https://forum.zentoria.ai
- **Email:** support@zentoria.ai

### Getting Help

When reporting issues, include:
- [ ] Docker version: `docker --version`
- [ ] Docker Compose version: `docker-compose --version`
- [ ] System information: `uname -a`
- [ ] `.env` configuration (sanitized)
- [ ] Service logs: `docker-compose logs -f`
- [ ] Error messages (full stack trace)
- [ ] Steps to reproduce

---

## License

Zentoria Personal Edition is licensed under the AGPL-3.0 License.

See LICENSE file for details.
