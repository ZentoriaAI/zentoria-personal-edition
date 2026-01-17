# Zentoria Personal Edition - LXC Container Provisioning Scripts

Production-grade provisioning scripts for deploying Zentoria Personal Edition on Proxmox with 17 LXC containers (VMID 400-423).

## Overview

This provisioning system creates a complete, containerized infrastructure for Zentoria Personal Edition with:
- **17 LXC containers** with dedicated roles and services
- **Network bridge** (vmbr40, 10.10.40.0/24) for internal networking
- **Database layer** (PostgreSQL 15 with pgvector for embeddings)
- **Caching layer** (Redis with persistence)
- **AI services** (Ollama with multiple models)
- **Observability stack** (Elasticsearch, Prometheus-ready)
- **Reverse proxy** (NGINX with SSL/TLS)
- **Security hardening** (firewalls, SSH hardening, encryption)

## Container Inventory

| VMID | Hostname | IP | RAM | CPU | Storage | Primary Service |
|------|----------|--------|-----|-----|---------|-----------------|
| 400 | zentoria-frontend | 10.10.40.100 | 4GB | 4 | 32GB | React/Next.js Frontend |
| 401 | zentoria-backend | 10.10.40.101 | 4GB | 4 | 32GB | Backend API (Node.js) |
| 402 | zentoria-n8n | 10.10.40.102 | 2GB | 2 | 32GB | Workflow Automation |
| 403 | zentoria-vault | 10.10.40.103 | 1GB | 2 | 8GB | Secret Management |
| 404 | zentoria-db | 10.10.40.104 | 4GB | 4 | 32GB | PostgreSQL 15 + pgvector |
| 405 | zentoria-ai | 10.10.40.105 | 16GB | 8 | 64GB | Ollama AI Models |
| 406 | zentoria-logs | 10.10.40.106 | 4GB | 4 | 64GB | Elasticsearch Logs |
| 407 | zentoria-files | 10.10.40.107 | 2GB | 2 | 128GB | MinIO S3-compatible Storage |
| 408 | zentoria-proxy | 10.10.40.108 | 1GB | 2 | 8GB | NGINX Reverse Proxy |
| 409 | zentoria-auth | 10.10.40.109 | 2GB | 2 | 16GB | Keycloak SSO |
| 410 | zentoria-redis | 10.10.40.110 | 2GB | 2 | 8GB | Redis Cache |
| 412 | zentoria-ocr | 10.10.40.112 | 2GB | 2 | 32GB | Tesseract OCR |
| 413 | zentoria-voice | 10.10.40.113 | 8GB | 4 | 32GB | Whisper Voice Processing |
| 416 | zentoria-backup | 10.10.40.116 | 1GB | 2 | 16GB | Backup & Archival |
| 418 | zentoria-docs | 10.10.40.118 | 2GB | 2 | 16GB | Documentation Portal |
| 419 | zentoria-embeddings | 10.10.40.119 | 4GB | 4 | 64GB | Qdrant Vector DB |
| 423 | zentoria-waf | 10.10.40.123 | 1GB | 2 | 8GB | ModSecurity WAF |

**Total Resources Required:**
- **RAM:** 64GB
- **Storage:** 512GB
- **CPU Cores:** 60 vCPU

## Scripts Overview

### 1. `00-config.sh` (Configuration Module)
Central configuration file containing all settings, credentials, and functions.

**Key Variables:**
- `PROXMOX_HOST`, `PROXMOX_NODE` - Proxmox connection details
- `NETWORK_BRIDGE`, `NETWORK_SUBNET` - Network configuration
- `containers` array - All container definitions
- Service credentials (PostgreSQL, Redis, Vault, etc.)
- Helper functions for SSH and file operations

**Usage:**
```bash
source 00-config.sh
ssh_proxmox "command here"
ssh_container 404 "command here"
```

### 2. `01-network-setup.sh` (Network Configuration)
Sets up the vmbr40 bridge, routing, NAT, and firewall rules.

**Functions:**
- `create_bridge()` - Creates vmbr40 bridge for 10.10.40.0/24
- `configure_routing()` - Enables IP forwarding and bridge netfilter
- `setup_nat()` - Configures NAT for outbound connectivity
- `setup_firewall()` - Configures UFW firewall rules
- `verify_network()` - Tests network configuration

**Execution:**
```bash
./01-network-setup.sh
```

**Output:**
- Network bridge created and configured
- Routing enabled
- NAT rules applied
- Firewall rules configured

### 3. `02-provision-all.sh` (Master Provisioning)
Creates and configures all 17 LXC containers with proper specifications and base setup.

**Functions:**
- `create_container()` - Creates individual LXC containers
- `run_base_setup()` - Installs base packages and configurations
- `configure_ssh()` - Hardens SSH configuration
- `install_docker()` - Installs Docker and Docker Compose
- `provisioning_summary()` - Reports provisioning status

**Execution:**
```bash
./02-provision-all.sh
```

**Process:**
1. Validates Proxmox connectivity
2. Creates all 17 containers sequentially
3. Configures networking for each container
4. Installs base packages and Docker
5. Generates provisioning summary report

**Expected Time:** 30-45 minutes (depending on system load)

### 4. `10-setup-db.sh` (PostgreSQL Database)
Installs PostgreSQL 15 with pgvector extension in container 404.

**Features:**
- PostgreSQL 15 from official repository
- pgvector extension for vector embeddings
- Automated backup script with retention
- Performance-optimized configuration
- User and database creation

**Execution:**
```bash
./10-setup-db.sh
```

**Installed Schemas:**
- `zentoria` - Main application schema
- `audit` - Audit logging schema

**Tables Created:**
- `documents` - For storing documents with embeddings
- `users` - User management
- `conversations` - Chat conversations
- `messages` - Chat messages
- `audit.logs` - Audit trail

**Backup Configuration:**
- Automatic daily backups at 2 AM UTC
- 30-day retention policy
- Stored in `/var/backups/postgresql/`

### 5. `11-setup-redis.sh` (Redis Cache)
Installs and configures Redis in container 410.

**Features:**
- Latest Redis from official repository
- Persistent storage (AOF + RDB)
- Automated backup script
- Health monitoring
- Password-protected access

**Execution:**
```bash
./11-setup-redis.sh
```

**Configuration:**
- Port: 6379
- Max memory: 1GB with LRU eviction
- Persistence: AOF enabled
- Replication: Ready for replication setup
- Password: zentoria-redis-2024 (configurable in 00-config.sh)

**Backup Configuration:**
- Automatic daily backups at 3 AM UTC
- 30-day retention policy

### 6. `20-setup-proxy.sh` (NGINX Reverse Proxy)
Installs and configures NGINX as reverse proxy in container 408.

**Features:**
- NGINX with HTTP/2 and SSL/TLS support
- Upstream load balancing for all services
- Rate limiting (API: 10r/s, Auth: 5r/s)
- Gzip compression
- Security headers (HSTS, CSP, X-Frame-Options)
- Self-signed SSL certificates (for testing)

**Execution:**
```bash
./20-setup-proxy.sh
```

**Configured Upstreams:**
- `backend_api` → Container 401 (Backend API)
- `frontend_app` → Container 400 (Frontend)
- `n8n_service` → Container 402 (Workflows)
- `ollama_service` → Container 405 (AI)
- `elasticsearch_service` → Container 406 (Logs)
- `minio_service` → Container 407 (Storage)
- `keycloak_service` → Container 409 (Auth)

**Server Blocks:**
- `zentoria.local` - Frontend (HTTP → HTTPS redirect)
- `api.zentoria.local` - Backend API
- `n8n.zentoria.local` - Workflow automation

### 7. `30-setup-ai.sh` (Ollama AI Services)
Installs Ollama and pulls AI models in container 405.

**Features:**
- Ollama installation and configuration
- Multiple model support (llama2, mistral, neural-chat, orca-mini)
- API service wrapper
- Health monitoring with auto-restart
- Model management

**Execution:**
```bash
./30-setup-ai.sh
```

**Default Models:**
- `llama2` - General purpose LLM
- `mistral` - High-performance inference
- `neural-chat` - Optimized for conversations
- `orca-mini` - Lightweight model for edge deployment

**API Endpoints:**
- Health: `GET http://localhost:11434/api/health`
- Models: `GET http://localhost:11434/api/tags`
- Generate: `POST http://localhost:11434/api/generate`
- Embeddings: `POST http://localhost:11434/api/embeddings`

### 8. `40-setup-observability.sh` (Elasticsearch Logs)
Installs Elasticsearch for centralized logging in container 406.

**Features:**
- Elasticsearch 8.x installation
- Log index templates
- Ingest pipelines for log parsing
- ILM (Index Lifecycle Management)
- Dashboard templates

**Execution:**
```bash
./40-setup-observability.sh
```

**Configured:**
- Cluster: `zentoria-logs`
- Port: 9200 (HTTP API)
- Data path: `/var/lib/elasticsearch`
- Single-node cluster (suitable for Personal Edition)

**Pipelines:**
- `zentoria-logs` - Parse application logs
- `zentoria-events` - Process application events

### 9. `99-verify.sh` (Comprehensive Verification)
Runs health checks on all containers and services.

**Checks:**
- Proxmox connectivity
- Network bridge and routing
- Container status and networking
- Service status (PostgreSQL, Redis, NGINX, Ollama, Elasticsearch)
- Database connectivity and schema
- Cache functionality and backups
- AI model availability
- Logging infrastructure
- Security configuration

**Execution:**
```bash
./99-verify.sh
```

**Output:**
- Individual check results (PASS/FAIL/WARN)
- Summary statistics
- Service health overview
- Recommendations for failed checks

## Deployment Instructions

### Prerequisites

1. **Proxmox Host Requirements:**
   - Proxmox VE 7.0+ (tested on 8.0+)
   - At least 64GB RAM
   - 512GB storage (SSD recommended)
   - Network bridge configured (vmbr0 or similar)
   - SSH access enabled

2. **Local Requirements:**
   - Bash shell (Linux/Mac/WSL2)
   - `ssh` command available
   - Network connectivity to Proxmox host

3. **Configuration:**
   - Edit `00-config.sh` to customize settings
   - Update `PROXMOX_HOST` with your Proxmox IP or SSH alias
   - Modify credentials and passwords

### Step-by-Step Deployment

#### Step 1: Prepare Proxmox

```bash
# SSH to Proxmox host
ssh root@YOUR_PROXMOX_IP

# Verify system requirements
pvesh get /nodes/pve/status
pvesh get /storage

# Exit back to local
exit
```

#### Step 2: Configure Scripts

```bash
# Edit configuration
nano 00-config.sh

# Update these critical variables:
# - PROXMOX_HOST (your Proxmox IP or alias)
# - PROXMOX_NODE (usually 'pve')
# - LXC_ROOT_PASSWORD (change from default!)
# - All service credentials
```

#### Step 3: Setup Network

```bash
# Make script executable
chmod +x 01-network-setup.sh

# Create network bridge and firewall rules
./01-network-setup.sh

# Verify network setup
./01-network-setup.sh  # Run verification section
```

#### Step 4: Provision Containers

```bash
# Make script executable
chmod +x 02-provision-all.sh

# Create all 17 containers
# This will take 30-45 minutes
./02-provision-all.sh

# Monitor progress in Proxmox UI
# or watch container creation:
ssh_proxmox "watch -n 2 'pct list'"
```

#### Step 5: Setup Services

Deploy each service according to dependencies:

```bash
# Database (no dependencies)
chmod +x 10-setup-db.sh
./10-setup-db.sh

# Redis (no dependencies)
chmod +x 11-setup-redis.sh
./11-setup-redis.sh

# Reverse Proxy (no dependencies)
chmod +x 20-setup-proxy.sh
./20-setup-proxy.sh

# AI Services (optional, can run in parallel)
chmod +x 30-setup-ai.sh
./30-setup-ai.sh

# Logging (optional)
chmod +x 40-setup-observability.sh
./40-setup-observability.sh
```

#### Step 6: Verify Installation

```bash
# Run comprehensive verification
chmod +x 99-verify.sh
./99-verify.sh

# Check for failed checks and warnings
# Fix any issues before proceeding to production
```

### Deployment Timeline

| Phase | Script | Duration | Notes |
|-------|--------|----------|-------|
| Network Setup | 01-network-setup.sh | 5 min | Creates bridge and firewall |
| Container Creation | 02-provision-all.sh | 30-45 min | Base setup for all 17 containers |
| Database Setup | 10-setup-db.sh | 10 min | PostgreSQL + pgvector |
| Redis Setup | 11-setup-redis.sh | 5 min | Redis cache |
| Proxy Setup | 20-setup-proxy.sh | 5 min | NGINX configuration |
| AI Setup | 30-setup-ai.sh | 20+ min | Model pulling (parallel) |
| Logging Setup | 40-setup-observability.sh | 10 min | Elasticsearch |
| Verification | 99-verify.sh | 5 min | Health checks |
| **Total** | **All scripts** | **90-120 min** | First-time deployment |

## Configuration Reference

### Network Configuration (`00-config.sh`)

```bash
# Bridge settings
PROXMOX_BRIDGE="vmbr40"
NETWORK_SUBNET="10.10.40.0/24"
NETWORK_GATEWAY="10.10.40.1"
```

### Service Credentials

```bash
# PostgreSQL
PG_USER="zentoria"
PG_PASSWORD="PgPass2024!"  # CHANGE THIS!
PG_DB="zentoria_personal"

# Redis
REDIS_PASSWORD="RedisPass2024!"  # CHANGE THIS!

# Vault
VAULT_PORT="8200"

# N8N
N8N_PORT="5678"
```

### Resource Allocation

Adjust in `02-provision-all.sh` container definitions:

```bash
# Format: vmid:hostname:ip:ram:cpu:storage
"404:zentoria-db:10.10.40.104:4:4:32"  # 4GB RAM, 4 CPU, 32GB storage
```

## Troubleshooting

### Container Creation Failed

```bash
# Check Proxmox logs
ssh proxmox "tail -f /var/log/pveproxy.log"

# Check container status
ssh proxmox "pct status 400"

# Remove failed container and retry
ssh proxmox "pct destroy 400"
./02-provision-all.sh
```

### Network Not Working

```bash
# Verify bridge exists
ssh proxmox "ip addr show vmbr40"

# Check container networking
ssh proxmox "pct exec 400 -- ip addr"

# Test DNS resolution
ssh proxmox "pct exec 400 -- nslookup google.com"
```

### Service Not Starting

```bash
# Check service status
ssh proxmox "pct exec 404 -- systemctl status postgresql"

# View service logs
ssh proxmox "pct exec 404 -- journalctl -xe -u postgresql"

# Manually start service for debugging
ssh proxmox "pct exec 404 -- systemctl start postgresql"
```

### Database Connection Issues

```bash
# Connect to PostgreSQL directly
ssh proxmox "pct exec 404 -- sudo -u postgres psql"

# Check listening ports
ssh proxmox "pct exec 404 -- netstat -tlnp | grep postgres"

# Check password
ssh proxmox "pct exec 404 -- sudo -u postgres psql -c \"ALTER USER zentoria WITH PASSWORD 'newpass';\""
```

### High Resource Usage

```bash
# Check memory usage on Proxmox
ssh proxmox "free -h"

# Check per-container usage
ssh proxmox "pct status --verbose 404"

# Monitor CPU
ssh proxmox "top -b -n 1"

# Reduce container allocation in 00-config.sh and re-provision
```

## Production Checklist

Before deploying to production:

- [ ] Update all credentials in `00-config.sh`
- [ ] Change `LXC_ROOT_PASSWORD` to strong password
- [ ] Configure SSL certificates (replace self-signed in 20-setup-proxy.sh)
- [ ] Set up automated backups (cron jobs in database/cache scripts)
- [ ] Configure backup rotation and off-site backup storage
- [ ] Test disaster recovery procedures
- [ ] Set up monitoring and alerting (Elasticsearch + custom dashboards)
- [ ] Configure log retention policies
- [ ] Review security hardening (firewall, SSH, container isolation)
- [ ] Test high availability failover (if applicable)
- [ ] Document any customizations made
- [ ] Train operations team on procedures

## Backup and Recovery

### Database Backups

```bash
# Manual backup
ssh proxmox "pct exec 404 -- /usr/local/bin/pg-backup.sh"

# List backups
ssh proxmox "pct exec 404 -- ls -lh /var/backups/postgresql/"

# Restore backup
ssh proxmox "pct exec 404 -- sudo -u postgres psql zentoria_personal < /var/backups/postgresql/backup_file.sql"
```

### Redis Backups

```bash
# Manual backup
ssh proxmox "pct exec 410 -- /usr/local/bin/redis-backup.sh"

# List backups
ssh proxmox "pct exec 410 -- ls -lh /var/backups/redis/"
```

### Container Snapshots

```bash
# Create LXC snapshot
ssh proxmox "pct snapshot 404 backup-2026-01-16"

# List snapshots
ssh proxmox "pct listsnapshot 404"

# Restore from snapshot
ssh proxmox "pct rollback 404 backup-2026-01-16"
```

## Maintenance

### Regular Tasks

**Daily:**
- Monitor container resource usage
- Check error logs in Elasticsearch
- Verify backup completion

**Weekly:**
- Review security logs
- Check disk space availability
- Test database backups

**Monthly:**
- Update Debian packages: `apt-get upgrade`
- Update Docker images
- Review and rotate credentials

### Scaling

To add more resources:

```bash
# Modify container memory
ssh proxmox "pct set 404 --memory 8192"

# Add CPU cores
ssh proxmox "pct set 404 --cores 8"

# Expand disk
ssh proxmox "pct resize 404 rootfs +50G"
```

## Performance Tuning

### Database Tuning

Edit `/etc/postgresql/15/main/postgresql.conf`:
- Increase `shared_buffers` for larger workloads
- Adjust `work_mem` for query performance
- Tune `maintenance_work_mem` for faster backups

### Redis Tuning

Edit `/etc/redis/redis.conf`:
- Increase `maxmemory` if needed
- Adjust `maxmemory-policy` for eviction behavior
- Configure replication if scaling to multiple nodes

### NGINX Tuning

Edit `/etc/nginx/nginx.conf`:
- Increase `worker_processes` to CPU count
- Adjust `worker_connections` for higher concurrency
- Configure caching headers

## Support and Documentation

- **Proxmox Documentation:** https://pve.proxmox.com/wiki/
- **PostgreSQL Documentation:** https://www.postgresql.org/docs/
- **Redis Documentation:** https://redis.io/documentation
- **NGINX Documentation:** https://nginx.org/en/docs/
- **Ollama Documentation:** https://github.com/jmorganca/ollama

## License

These scripts are part of Zentoria Personal Edition. Use according to the project license.

## Version History

- **v1.0** (2026-01-16) - Initial release with 17-container architecture
  - Network infrastructure setup
  - Master provisioning for all containers
  - Database, cache, proxy, and AI service setup
  - Comprehensive verification script

---

**Last Updated:** 2026-01-16
**Maintainer:** Zentoria Engineering
**Status:** Production Ready
