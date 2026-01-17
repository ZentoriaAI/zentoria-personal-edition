# Zentoria Personal Edition - LXC Container Provisioning System

Complete infrastructure provisioning system for deploying Zentoria on Proxmox with 17 LXC containers.

## 📋 Quick Navigation

| Document | Purpose |
|----------|---------|
| **[QUICKSTART.md](QUICKSTART.md)** | 5-minute fast deployment guide |
| **[README.md](README.md)** | Comprehensive documentation |
| **[INDEX.md](INDEX.md)** | This file - navigation guide |

## 🚀 Scripts Overview

### Configuration Layer
| Script | Purpose | Time | Required |
|--------|---------|------|----------|
| **[00-config.sh](00-config.sh)** | Shared configuration and utilities | - | ✅ YES (sourced by all scripts) |

### Deployment Phase
| Script | Purpose | Time | Order |
|--------|---------|------|-------|
| **[01-network-setup.sh](01-network-setup.sh)** | Network bridge & firewall | 5 min | 1st |
| **[02-provision-all.sh](02-provision-all.sh)** | Create 17 containers | 40 min | 2nd |

### Service Setup Phase
| Script | Purpose | Time | Container | Depends On |
|--------|---------|------|-----------|-----------|
| **[10-setup-db.sh](10-setup-db.sh)** | PostgreSQL 15 + pgvector | 10 min | 404 | 02-provision-all.sh |
| **[11-setup-redis.sh](11-setup-redis.sh)** | Redis cache | 5 min | 410 | 02-provision-all.sh |
| **[20-setup-proxy.sh](20-setup-proxy.sh)** | NGINX reverse proxy | 5 min | 408 | 02-provision-all.sh |
| **[30-setup-ai.sh](30-setup-ai.sh)** | Ollama AI services | 30 min | 405 | 02-provision-all.sh |
| **[40-setup-observability.sh](40-setup-observability.sh)** | Elasticsearch logging | 10 min | 406 | 02-provision-all.sh |

### Verification Phase
| Script | Purpose | Time |
|--------|---------|------|
| **[99-verify.sh](99-verify.sh)** | Health checks all services | 5 min |

## 📊 Deployment Overview

```
00-config.sh (sourced by all)
    ↓
01-network-setup.sh (5 min)
    ↓
02-provision-all.sh (40 min)
    ├→ 10-setup-db.sh (10 min) ─→
    ├→ 11-setup-redis.sh (5 min) ─→
    ├→ 20-setup-proxy.sh (5 min) ─→
    ├→ 30-setup-ai.sh (30 min) ─→
    └→ 40-setup-observability.sh (10 min) ─→ 99-verify.sh (5 min)

Total Time: 90-150 minutes (depending on which optional services you deploy)
```

## 🎯 Three Deployment Paths

### Path 1: Quick Start (60-90 min)
Core services only - fastest deployment:
```bash
./01-network-setup.sh
./02-provision-all.sh
./10-setup-db.sh
./11-setup-redis.sh
./20-setup-proxy.sh
./99-verify.sh
```

**Includes:**
- ✅ 17 running containers
- ✅ PostgreSQL database
- ✅ Redis cache
- ✅ NGINX proxy

**Excludes:**
- ❌ AI services (Ollama)
- ❌ Logging (Elasticsearch)

### Path 2: Full Stack (120-150 min) - Recommended
All services including observability:
```bash
./01-network-setup.sh
./02-provision-all.sh
./10-setup-db.sh
./11-setup-redis.sh
./20-setup-proxy.sh
./30-setup-ai.sh
./40-setup-observability.sh
./99-verify.sh
```

**Includes:** Everything in Quick Start plus:
- ✅ Ollama AI services with models
- ✅ Elasticsearch logging

### Path 3: Custom
Deploy only the services you need:
```bash
# Customize which scripts to run
./01-network-setup.sh        # Always required
./02-provision-all.sh        # Always required
# Then pick from service scripts:
./10-setup-db.sh             # If you need a database
./11-setup-redis.sh          # If you need caching
./20-setup-proxy.sh          # If you need reverse proxy
./30-setup-ai.sh             # If you need AI models
./40-setup-observability.sh  # If you need logging
./99-verify.sh               # Always recommended
```

## 📦 Container Architecture

```
Network: 10.10.40.0/24 (vmbr40)

Frontend Layer
├─ 400 (zentoria-frontend, 10.10.40.100) - React/Next.js UI

Application Layer
├─ 401 (zentoria-backend, 10.10.40.101) - Node.js API
├─ 402 (zentoria-n8n, 10.10.40.102) - Workflow automation
├─ 409 (zentoria-auth, 10.10.40.109) - Keycloak SSO
├─ 412 (zentoria-ocr, 10.10.40.112) - Tesseract OCR
├─ 413 (zentoria-voice, 10.10.40.113) - Whisper voice

Data Layer
├─ 404 (zentoria-db, 10.10.40.104) - PostgreSQL 15
├─ 410 (zentoria-redis, 10.10.40.110) - Redis cache
├─ 419 (zentoria-embeddings, 10.10.40.119) - Qdrant vectors

AI/ML Layer
├─ 405 (zentoria-ai, 10.10.40.105) - Ollama models

Observability Layer
├─ 406 (zentoria-logs, 10.10.40.106) - Elasticsearch

Infrastructure Layer
├─ 408 (zentoria-proxy, 10.10.40.108) - NGINX reverse proxy
├─ 407 (zentoria-files, 10.10.40.107) - MinIO S3 storage
├─ 403 (zentoria-vault, 10.10.40.103) - Secret management
├─ 416 (zentoria-backup, 10.10.40.116) - Backups
├─ 418 (zentoria-docs, 10.10.40.118) - Documentation
├─ 423 (zentoria-waf, 10.10.40.123) - ModSecurity WAF
```

## ⚙️ Configuration

### Essential Changes Required
Edit `00-config.sh` before running any scripts:

1. **Proxmox Connection** (line ~30)
   ```bash
   PROXMOX_HOST="YOUR.PROXMOX.IP"    # Change this!
   PROXMOX_USER="root"
   PROXMOX_NODE="pve"
   ```

2. **Passwords** (line ~75)
   ```bash
   LXC_ROOT_PASSWORD="ChangeMe!"     # Change this!
   PG_PASSWORD="ChangeMe!"           # Change this!
   REDIS_PASSWORD="ChangeMe!"        # Change this!
   ```

3. **Network** (optional customization)
   ```bash
   NETWORK_BRIDGE="vmbr40"
   NETWORK_SUBNET="10.10.40.0/24"
   ```

### Optional Customizations
- Container resource allocation (RAM, CPU, storage)
- Service credentials and ports
- Backup retention policies
- SSL certificate paths

## 🔧 Usage Examples

### Deploy Everything (Recommended)
```bash
# Make scripts executable
chmod +x *.sh

# Deploy full stack
./01-network-setup.sh
./02-provision-all.sh
./10-setup-db.sh
./11-setup-redis.sh
./20-setup-proxy.sh
./30-setup-ai.sh
./40-setup-observability.sh
./99-verify.sh
```

### Monitor Deployment Progress
```bash
# In one terminal, watch container creation
ssh YOUR_PROXMOX_IP "watch -n 2 'pct list'"

# In another terminal, tail logs
ssh YOUR_PROXMOX_IP "tail -f /var/log/pveproxy.log"
```

### Verify Specific Service
```bash
# Check PostgreSQL
ssh YOUR_PROXMOX_IP "pct exec 404 -- sudo -u postgres psql -l"

# Check Redis
ssh YOUR_PROXMOX_IP "pct exec 410 -- redis-cli PING"

# Check NGINX
ssh YOUR_PROXMOX_IP "pct exec 408 -- nginx -t"

# Check Ollama
ssh YOUR_PROXMOX_IP "pct exec 405 -- ollama list"
```

## 📊 Resource Requirements

| Component | RAM | CPU | Storage |
|-----------|-----|-----|---------|
| Proxmox Host | 64GB+ | 60 cores | 512GB+ |
| All 17 Containers | 64GB | 60 vCPU | 512GB |
| Per Container (avg) | 3.8GB | 3.5 vCPU | 30GB |

## 🔒 Security Features

- ✅ Unprivileged LXC containers
- ✅ Network isolation (vmbr40 bridge)
- ✅ Firewall rules (UFW)
- ✅ SSH hardening
- ✅ Database authentication
- ✅ Redis password protection
- ✅ NGINX SSL/TLS ready
- ✅ Secret management (Vault container)
- ✅ WAF support (ModSecurity)

## 📈 Scaling

Each service can be scaled independently:

### Add AI Models
```bash
ssh YOUR_PROXMOX_IP "pct exec 405 -- ollama pull qwen:7b"
```

### Expand Database
```bash
ssh YOUR_PROXMOX_IP "pct resize 404 rootfs +50G"
```

### Increase Redis Memory
Edit `/etc/redis/redis.conf` and increase `maxmemory`

## 🆘 Troubleshooting

### Quick Diagnostics
```bash
# Check all containers running
ssh YOUR_PROXMOX_IP "pct list"

# Check specific container status
ssh YOUR_PROXMOX_IP "pct status 404"

# Check container logs
ssh YOUR_PROXMOX_IP "pct exec 404 -- journalctl -xe"

# Check network connectivity
ssh YOUR_PROXMOX_IP "pct exec 404 -- ping 8.8.8.8"
```

### Reset Failed Container
```bash
# Stop container
ssh YOUR_PROXMOX_IP "pct stop 404"

# Remove if necessary
ssh YOUR_PROXMOX_IP "pct destroy 404"

# Re-run provision script
./02-provision-all.sh
```

See README.md for comprehensive troubleshooting guide.

## 📖 Documentation Structure

```
infrastructure/scripts/
├── 00-config.sh              # Shared configuration (MUST source first)
├── 01-network-setup.sh       # Network bridge & firewall
├── 02-provision-all.sh       # Master container provisioning
├── 10-setup-db.sh            # PostgreSQL setup
├── 11-setup-redis.sh         # Redis setup
├── 20-setup-proxy.sh         # NGINX setup
├── 30-setup-ai.sh            # Ollama setup
├── 40-setup-observability.sh # Elasticsearch setup
├── 99-verify.sh              # Verification & health checks
├── INDEX.md                  # This file - navigation
├── QUICKSTART.md             # 5-minute quick start
└── README.md                 # Comprehensive documentation
```

## ✅ Pre-Deployment Checklist

- [ ] Proxmox host is accessible
- [ ] 64GB+ RAM available
- [ ] 512GB+ storage available
- [ ] SSH access configured
- [ ] `00-config.sh` updated with Proxmox host
- [ ] All passwords changed
- [ ] Network requirements understood

## 🎓 Next Steps

1. **Review:** Read QUICKSTART.md for 5-minute overview
2. **Configure:** Edit 00-config.sh with your Proxmox details
3. **Execute:** Run scripts in order: 01, 02, then services (10-40), finally 99
4. **Verify:** Check output of 99-verify.sh for any errors
5. **Document:** Record any customizations you make
6. **Backup:** Test backup and recovery procedures

## 📞 Support Resources

- **Proxmox Docs:** https://pve.proxmox.com/wiki/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Redis Docs:** https://redis.io/documentation
- **NGINX Docs:** https://nginx.org/en/docs/
- **Ollama Docs:** https://github.com/jmorganca/ollama

## 📝 Version Information

| Component | Version | Status |
|-----------|---------|--------|
| Scripts | v1.0 | Production Ready |
| Debian Template | 12.2 | Current |
| PostgreSQL | 15 | Current |
| Redis | Latest | Current |
| NGINX | Latest | Current |
| Ollama | Latest | Current |
| Elasticsearch | 8.x | Current |

---

## Getting Started

**New to this system?**
→ Start with [QUICKSTART.md](QUICKSTART.md)

**Need detailed info?**
→ Read [README.md](README.md)

**Want to understand the structure?**
→ You're reading it!

---

**Last Updated:** 2026-01-16
**Status:** ✅ Production Ready
**Maintainer:** Zentoria Engineering
