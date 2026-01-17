# Zentoria Personal Edition - Master Deployment Guide

**Version:** 1.0
**Last Updated:** January 2026
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Flight Checklist](#pre-flight-checklist)
3. [Deployment Phases](#deployment-phases)
4. [Configuration Reference](#configuration-reference)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Troubleshooting](#troubleshooting)
7. [Rollback Procedures](#rollback-procedures)
8. [Maintenance](#maintenance)

---

## Overview

Zentoria Personal Edition is a self-hosted AI Control Plane built for single-user deployment on Proxmox. This guide covers the complete deployment process from bare metal to a fully operational system.

### What You'll Deploy

- **17 LXC Containers** across 400-423 range
- **40+ Services** across infrastructure, AI, security, and observability layers
- **Complete Stack**: Database, cache, secrets management, AI orchestration, monitoring, backups
- **Network Architecture**: Segmented zones with firewall rules
- **Security Hardening**: WAF, authentication, secrets management, audit logging

### Time Estimates

| Phase | Duration | Complexity |
|-------|----------|------------|
| Pre-flight checks | 30 min | Low |
| Infrastructure setup | 2-3 hours | Medium |
| Core services | 3-4 hours | Medium |
| AI & automation | 2-3 hours | High |
| Security hardening | 1-2 hours | Medium |
| Testing & verification | 1-2 hours | Low |
| **Total** | **10-15 hours** | - |

---

## Pre-Flight Checklist

### 1. Hardware Requirements

**Minimum (Development/Testing):**
```
CPU: 16 cores (overcommit 3:1)
RAM: 128 GB
Storage: 2 TB SSD
Network: 1 Gbps
```

**Recommended (Production):**
```
CPU: 32+ cores
RAM: 192-256 GB
Storage: 4+ TB NVMe
Network: 10 Gbps
GPU: Optional (NVIDIA for AI acceleration)
```

**Storage Breakdown:**
| Purpose | Minimum | Recommended | Type |
|---------|---------|-------------|------|
| Containers (OS/Apps) | 500 GB | 1 TB | NVMe SSD |
| Database (PostgreSQL, Qdrant) | 200 GB | 500 GB | NVMe SSD |
| Files (MinIO, Backups) | 1 TB | 2 TB | SATA SSD/HDD RAID |
| Backup Storage | 500 GB | 1 TB | Separate disk/NAS |

### 2. Network Requirements

**DNS Configuration:**
- Internal DNS server or `/etc/hosts` entries
- Subdomains configured (ui.zentoria.local, api.zentoria.local, etc.)
- Optional: External domain for remote access

**Network Zones:**
| Zone | CIDR | Purpose |
|------|------|---------|
| Management | 10.10.40.0/24 | Core containers (400-410) |
| Extended | 10.10.41.0/24 | Support containers (411-419) |
| Security | 10.10.42.0/24 | WAF and security (420-423) |

**Firewall:**
- External access only through proxy (408)
- Inter-container communication restricted by zone
- Outbound internet access for package updates

### 3. Software Prerequisites

**Proxmox Host:**
```bash
# Verify Proxmox version
pveversion
# Expected: pve-manager/8.0+ (or 7.4+)

# Check storage
pvesm status
# Ensure local-zfs or local-lvm has sufficient space

# Verify network
ip addr show vmbr0
# Ensure bridge is configured
```

**Required Packages:**
```bash
# On Proxmox host
apt update
apt install -y \
  git \
  curl \
  wget \
  jq \
  htop \
  ncdu

# Verify Docker support (for containers)
docker --version
```

### 4. Access & Credentials

**Prepare the following:**
- [ ] Proxmox root credentials
- [ ] SSH key for automation
- [ ] Strong passwords for:
  - PostgreSQL root and zentoria user
  - Redis
  - MinIO root user
  - Vault root token
  - JWT secrets
  - n8n encryption key

**Password Requirements:**
- Minimum 32 characters
- Mix of uppercase, lowercase, numbers, symbols
- Generate with: `openssl rand -base64 32`

### 5. Backup & Recovery Planning

**Before deployment:**
- [ ] Existing Proxmox backup strategy in place
- [ ] Separate backup storage available
- [ ] Recovery Time Objective (RTO) defined
- [ ] Recovery Point Objective (RPO) defined
- [ ] Disaster recovery documentation ready

---

## Deployment Phases

### Phase 1: Infrastructure Base (Week 1)

#### 1.1 Create LXC Containers

**Script:** `infrastructure/scripts/02-provision-all.sh`

```bash
cd infrastructure/scripts

# Review configuration
cat 00-config.sh

# Customize if needed
nano 00-config.sh

# Create all 17 containers
./02-provision-all.sh

# Verify creation
pct list | grep zentoria
```

**Expected Output:**
```
400  zentoria-frontend    running  Ubuntu 24.04
401  zentoria-backend     running  Ubuntu 24.04
402  zentoria-n8n         running  Ubuntu 24.04
403  zentoria-vault       running  Ubuntu 24.04
404  zentoria-db          running  Ubuntu 24.04
405  zentoria-ai          running  Ubuntu 24.04
406  zentoria-logs        running  Ubuntu 24.04
407  zentoria-files       running  Ubuntu 24.04
408  zentoria-proxy       running  Ubuntu 24.04
409  zentoria-auth        running  Ubuntu 24.04
410  zentoria-redis       running  Ubuntu 24.04
412  zentoria-ocr         running  Ubuntu 24.04
413  zentoria-voice       running  Ubuntu 24.04
416  zentoria-backup      running  Ubuntu 24.04
418  zentoria-docs        running  Ubuntu 24.04
419  zentoria-embeddings  running  Ubuntu 24.04
423  zentoria-waf         running  Ubuntu 24.04
```

#### 1.2 Network Configuration

**Script:** `infrastructure/scripts/01-network-setup.sh`

```bash
# Configure internal DNS
./01-network-setup.sh

# Verify DNS resolution
pct exec 401 -- ping zentoria-db -c 2
pct exec 401 -- ping zentoria-redis -c 2
```

#### 1.3 Base Package Installation

For each container:
```bash
# Example for container 404 (database)
pct exec 404 -- bash -c "
  apt update && apt upgrade -y
  apt install -y \
    curl \
    wget \
    vim \
    htop \
    net-tools \
    docker.io \
    docker-compose
  systemctl enable docker
  systemctl start docker
"
```

**Automate for all containers:**
```bash
for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do
  echo "Setting up container $ct..."
  pct exec $ct -- bash -c "
    apt update && apt upgrade -y
    apt install -y curl wget vim htop net-tools docker.io docker-compose
    systemctl enable docker
    systemctl start docker
  "
done
```

### Phase 2: Data Layer (Week 1-2)

#### 2.1 PostgreSQL + pgvector (Container 404)

**Script:** `infrastructure/scripts/10-setup-db.sh`

```bash
./10-setup-db.sh

# Verify installation
pct exec 404 -- docker ps
pct exec 404 -- docker exec postgres psql -U postgres -c "SELECT version();"
pct exec 404 -- docker exec postgres psql -U postgres -c "SELECT * FROM pg_extension WHERE extname='vector';"
```

**Manual steps (if needed):**
```bash
pct exec 404 -- bash

cd /opt/zentoria/db
cat docker-compose.yml

# Start services
docker-compose up -d

# Create databases
docker exec postgres psql -U postgres << EOF
CREATE DATABASE zentoria_core;
CREATE DATABASE zentoria_vectors;
CREATE DATABASE n8n;

CREATE USER zentoria WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE zentoria_core TO zentoria;
GRANT ALL PRIVILEGES ON DATABASE zentoria_vectors TO zentoria;
GRANT ALL PRIVILEGES ON DATABASE n8n TO zentoria;
EOF

# Enable pgvector extension
docker exec postgres psql -U postgres -d zentoria_vectors << EOF
CREATE EXTENSION vector;
EOF

# Run migrations
cd /opt/zentoria/db/migrations
psql -h localhost -U zentoria -d zentoria_core -f 001_initial_schema.sql
```

#### 2.2 Redis (Container 410)

**Script:** `infrastructure/scripts/11-setup-redis.sh`

```bash
./11-setup-redis.sh

# Verify
pct exec 410 -- docker ps
pct exec 410 -- docker exec redis redis-cli -a your_password ping
```

#### 2.3 HashiCorp Vault (Container 403)

```bash
pct exec 403 -- bash

cd /opt/zentoria/vault
docker-compose up -d

# Initialize Vault (SAVE THE OUTPUT!)
docker exec vault vault operator init -key-shares=5 -key-threshold=3

# Unseal Vault (use 3 of 5 keys from above)
docker exec vault vault operator unseal <key1>
docker exec vault vault operator unseal <key2>
docker exec vault vault operator unseal <key3>

# Login with root token
docker exec vault vault login <root-token>

# Create secrets engine
docker exec vault vault secrets enable -path=zentoria kv-v2

# Store initial secrets
docker exec vault vault kv put zentoria/db password=<db_password>
docker exec vault vault kv put zentoria/redis password=<redis_password>
```

#### 2.4 MinIO (Container 407)

```bash
pct exec 407 -- bash

cd /opt/zentoria/files
docker-compose up -d

# Create buckets
docker exec minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec minio mc mb local/uploads
docker exec minio mc mb local/documents
docker exec minio mc mb local/backups
docker exec minio mc mb local/temp

# Set policies
docker exec minio mc anonymous set download local/uploads
```

#### 2.5 Qdrant Vector DB (Container 419)

```bash
pct exec 419 -- bash

cd /opt/zentoria/embeddings
docker-compose up -d

# Verify
curl http://localhost:6333/collections
```

### Phase 3: Security Layer (Week 2)

#### 3.1 CrowdSec WAF (Container 423)

```bash
pct exec 423 -- bash

cd /opt/zentoria/waf
docker-compose up -d

# Install collections
docker exec crowdsec cscli collections install crowdsecurity/nginx
docker exec crowdsec cscli collections install crowdsecurity/http-cve
docker exec crowdsec cscli parsers install crowdsecurity/nginx-logs

# Restart
docker-compose restart crowdsec
```

#### 3.2 Authentication Service (Container 409)

```bash
pct exec 409 -- bash

cd /opt/zentoria/auth

# Generate JWT secret
openssl rand -base64 64 > /opt/zentoria/auth/jwt_secret

# Start service
docker-compose up -d
```

#### 3.3 NGINX Reverse Proxy (Container 408)

**Script:** `infrastructure/scripts/20-setup-proxy.sh`

```bash
./20-setup-proxy.sh

# Verify
pct exec 408 -- nginx -t
pct exec 408 -- systemctl status nginx
```

### Phase 4: Core Services (Week 2-3)

#### 4.1 MCP Backend API (Container 401)

```bash
pct exec 401 -- bash

# Clone repository
cd /opt/zentoria
git clone https://github.com/your-org/zentoria-mcp.git backend
cd backend/mcp-gateway

# Install dependencies
npm install

# Copy environment
cp .env.example .env
nano .env

# Build
npm run build

# Start with PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 4.2 Next.js Frontend (Container 400)

```bash
pct exec 400 -- bash

cd /opt/zentoria
git clone https://github.com/your-org/zentoria-mcp.git frontend
cd frontend/frontend

npm install
npm run build

pm2 start npm --name "zentoria-frontend" -- start
pm2 save
```

### Phase 5: Automation & AI (Week 3-4)

#### 5.1 n8n Workflows (Container 402)

```bash
pct exec 402 -- bash

cd /opt/zentoria/n8n
docker-compose up -d

# Import workflows
docker exec n8n n8n import:workflow --input=/workflows/*.json

# Access UI
# http://n8n.zentoria.local:5678
```

#### 5.2 Ollama + AI Orchestrator (Container 405)

**Script:** `infrastructure/scripts/30-setup-ai.sh`

```bash
./30-setup-ai.sh

# Verify models
pct exec 405 -- docker exec ollama ollama list

# Expected:
# llama3.2:latest
# codellama:latest
# nomic-embed-text:latest
```

#### 5.3 Whisper Voice Service (Container 413)

```bash
pct exec 413 -- bash

cd /opt/zentoria/voice

# Download Whisper models
docker-compose run --rm whisper-service python -c "
from faster_whisper import WhisperModel
model = WhisperModel('medium', device='cpu', compute_type='int8')
"

# Start services
docker-compose up -d
```

#### 5.4 Paperless-ngx OCR (Container 412)

```bash
pct exec 412 -- bash

cd /opt/zentoria/ocr
docker-compose up -d

# Create admin user
docker exec paperless python3 manage.py createsuperuser
```

### Phase 6: Support Services (Week 4)

#### 6.1 Monitoring Stack (Container 406)

**Script:** `infrastructure/scripts/40-setup-observability.sh`

```bash
./40-setup-observability.sh

# Access dashboards
# Grafana: http://logs.zentoria.local:3001
# Prometheus: http://logs.zentoria.local:9090
```

#### 6.2 Wiki.js Documentation (Container 418)

```bash
pct exec 418 -- bash

cd /opt/zentoria/docs
docker-compose up -d

# Access: http://docs.zentoria.local:3002
# Complete setup wizard
```

#### 6.3 Backup System (Container 416)

```bash
pct exec 416 -- bash

cd /opt/zentoria/backup

# Initialize Restic repositories
restic init --repo /opt/zentoria/backup/restic/repos/local
restic init --repo rclone:onedrive:zentoria-backups

# Test backup
./scripts/backup-db.sh

# Schedule with cron
crontab -e
# Add:
# 0 */6 * * * /opt/zentoria/backup/scripts/backup-db.sh
# 0 2 * * * /opt/zentoria/backup/scripts/backup-all.sh
```

### Phase 7: Integration & Testing (Week 5)

#### 7.1 Service Interconnections

```bash
# Test API connectivity
curl http://api.zentoria.local/health

# Test database connection
psql -h zentoria-db -U zentoria -d zentoria_core -c "SELECT 1"

# Test Redis
redis-cli -h zentoria-redis -a password ping

# Test AI endpoint
curl http://ai.zentoria.local:5000/health
```

#### 7.2 RAG Pipeline Configuration

```bash
pct exec 419 -- bash

cd /opt/zentoria/embeddings/rag

# Index test document
python3 index_document.py --file /tmp/test.pdf

# Query test
curl -X POST http://localhost:8100/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test query", "top_k": 5}'
```

#### 7.3 End-to-End Testing

```bash
# Run verification script
cd infrastructure/scripts
./99-verify.sh

# Expected output: All checks PASS
```

---

## Configuration Reference

### Environment Variables

**Global Configuration (`/opt/zentoria/.env.global`):**
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

# Version
ZENTORIA_VERSION=1.0.0
```

**Database (Container 404):**
```env
POSTGRES_USER=zentoria
POSTGRES_PASSWORD=<strong_password>
POSTGRES_DB=zentoria_core
PGBOUNCER_MAX_CLIENT_CONN=1000
PGBOUNCER_DEFAULT_POOL_SIZE=25
```

**Redis (Container 410):**
```env
REDIS_PASSWORD=<strong_password>
REDIS_MAXMEMORY=8gb
REDIS_MAXMEMORY_POLICY=allkeys-lru
```

**Backend API (Container 401):**
```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://zentoria:password@zentoria-db:5432/zentoria_core
REDIS_URL=redis://:password@zentoria-redis:6379
VAULT_ADDR=http://zentoria-vault:8200
VAULT_TOKEN=<vault_token>
JWT_SECRET=<jwt_secret>
```

**AI Orchestrator (Container 405):**
```env
OLLAMA_HOST=http://localhost:11434
MODEL_DEFAULT=llama3.2:latest
MODEL_CODE=codellama:latest
MODEL_EMBEDDING=nomic-embed-text:latest
QDRANT_URL=http://zentoria-embeddings:6333
```

### Firewall Rules

See `ARCHITECTURE.md` Section 4.2 for complete firewall matrix.

**Quick reference:**
```bash
# Allow proxy to frontend
iptables -A FORWARD -s 10.10.40.8 -d 10.10.40.0 -p tcp --dport 3000 -j ACCEPT

# Allow backend to database
iptables -A FORWARD -s 10.10.40.1 -d 10.10.40.4 -p tcp --dport 5432 -j ACCEPT

# Allow backend to Redis
iptables -A FORWARD -s 10.10.40.1 -d 10.10.41.0 -p tcp --dport 6379 -j ACCEPT
```

---

## Post-Deployment Verification

### Health Checks

**Script:** `infrastructure/scripts/99-verify.sh`

```bash
cd infrastructure/scripts
./99-verify.sh

# Manual checks:

# 1. Container status
pct list | grep zentoria

# 2. Docker services
for ct in 400 401 402 404 405 406 407 408 410; do
  echo "Container $ct:"
  pct exec $ct -- docker ps
done

# 3. API endpoints
curl http://api.zentoria.local/health
curl http://ai.zentoria.local:5000/health

# 4. Database
psql -h zentoria-db -U zentoria -d zentoria_core -c "SELECT version();"

# 5. Redis
redis-cli -h zentoria-redis -a password info

# 6. Monitoring
curl http://logs.zentoria.local:9090/-/healthy
curl http://logs.zentoria.local:3001/api/health
```

### Performance Baseline

```bash
# CPU usage
pct exec 401 -- top -bn1 | head -20

# Memory usage
pct exec 404 -- free -h

# Disk usage
pct exec 407 -- df -h

# Network connectivity
pct exec 401 -- ping -c 5 zentoria-db
```

### Security Verification

```bash
# Check firewall rules
iptables -L -n -v | grep zentoria

# Verify SSL certificates
pct exec 408 -- certbot certificates

# Check Vault seal status
pct exec 403 -- docker exec vault vault status

# Verify WAF
curl http://logs.zentoria.local:9090/api/v1/query?query=up\{job=\"crowdsec\"\}
```

---

## Troubleshooting

### Common Issues

#### Issue: Container won't start
```bash
# Check logs
pct status 404
journalctl -u pve-container@404.service

# Common fixes:
# 1. Storage full
df -h
pvesm status

# 2. Network conflict
ip addr show vmbr0
pct config 404 | grep net0

# 3. Resource limits
pveam list local
pct config 404 | grep -E "memory|cores"
```

#### Issue: Database connection failed
```bash
# Check PostgreSQL
pct exec 404 -- docker logs postgres --tail 50

# Check PgBouncer
pct exec 404 -- docker logs pgbouncer --tail 50

# Test connection
pct exec 401 -- psql -h zentoria-db -U zentoria -d zentoria_core -c "SELECT 1"

# Common fixes:
# 1. Wrong credentials in .env
# 2. PgBouncer not routing correctly
# 3. PostgreSQL not accepting connections from container network
```

#### Issue: AI models not loading
```bash
# Check Ollama
pct exec 405 -- docker logs ollama --tail 100

# Check disk space
pct exec 405 -- df -h /opt/zentoria/ai/ollama/models

# Re-pull model
pct exec 405 -- docker exec ollama ollama pull llama3.2:latest

# Check GPU passthrough (if used)
pct exec 405 -- nvidia-smi
```

#### Issue: n8n workflows failing
```bash
# Check n8n logs
pct exec 402 -- docker logs n8n --tail 100

# Check Redis queue
pct exec 410 -- redis-cli -a password LLEN bull:n8n:queue

# Common fixes:
# 1. Increase Redis memory
# 2. Check n8n worker status
# 3. Verify database connectivity
```

### Debug Mode

Enable debug logging:
```bash
# Backend
pct exec 401 -- bash -c "echo 'LOG_LEVEL=debug' >> /opt/zentoria/backend/.env"
pct exec 401 -- pm2 restart all

# Docker services
pct exec 404 -- docker-compose logs -f postgres

# System logs
pct exec 401 -- journalctl -u docker -f
```

---

## Rollback Procedures

### Container Rollback

```bash
# Stop container
pct stop 404

# Restore from backup
pct restore 404 /var/lib/vz/dump/vzdump-lxc-404-2026_01_15-00_00_00.tar.zst

# Start container
pct start 404

# Verify
pct list | grep 404
```

### Database Rollback

```bash
# Stop applications
pm2 stop all

# Restore database
pct exec 404 -- bash -c "
  cd /opt/zentoria/db/backups
  psql -U zentoria -d zentoria_core < backup_2026_01_15.sql
"

# Restart applications
pm2 start all
```

### Configuration Rollback

```bash
# All configurations are in Git
cd /opt/zentoria
git log --oneline
git revert <commit-hash>
git push

# Redeploy
./deploy.sh
```

---

## Maintenance

### Daily Tasks

```bash
# Check service status
./scripts/99-verify.sh

# Review logs
pct exec 406 -- docker-compose logs --tail 100

# Check disk usage
for ct in 404 407 416; do
  echo "Container $ct:"
  pct exec $ct -- df -h
done
```

### Weekly Tasks

```bash
# Update packages
for ct in 400 401 402 404 405 406 407 408 409 410 412 413 416 418 419 423; do
  pct exec $ct -- apt update && apt upgrade -y
done

# Verify backups
cd /opt/zentoria/backup
./scripts/verify-backups.sh

# Review metrics
# Access Grafana dashboards

# Check security alerts
pct exec 423 -- docker exec crowdsec cscli decisions list
```

### Monthly Tasks

```bash
# Rotate logs
for ct in 400 401 402; do
  pct exec $ct -- journalctl --vacuum-time=30d
done

# Database maintenance
pct exec 404 -- docker exec postgres vacuumdb -U postgres -d zentoria_core --analyze --verbose

# Update Docker images
pct exec 401 -- docker-compose pull
pct exec 401 -- docker-compose up -d

# Disaster recovery drill
./scripts/disaster-recovery-test.sh

# Review and update documentation
```

### Quarterly Tasks

```bash
# Full system audit
# Security review
# Performance tuning
# Capacity planning
# Update runbooks
```

---

## Next Steps

After successful deployment:

1. **Configure Monitoring Alerts**
   - Set up Grafana alerts
   - Configure PagerDuty/Email notifications
   - Define SLA thresholds

2. **Create Runbooks**
   - Document common operations
   - Create incident response procedures
   - Train team members

3. **Optimize Performance**
   - Review query performance
   - Tune connection pools
   - Optimize AI model loading

4. **Plan Scaling**
   - Define scaling triggers
   - Document scaling procedures
   - Test horizontal scaling

5. **Security Hardening**
   - Complete security audit
   - Implement additional WAF rules
   - Set up regular security scans

---

## Support

**Documentation:** See `infrastructure/docs/` directory

**Issues:** Report in project issue tracker

**Emergency Contact:** Define on-call procedures

---

**Document Version:** 1.0
**Last Review:** January 2026
**Next Review:** April 2026
