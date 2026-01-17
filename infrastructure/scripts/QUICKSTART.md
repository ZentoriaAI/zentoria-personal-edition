# Zentoria Personal Edition - Quick Start Guide

5-minute setup guide to get Zentoria running on Proxmox.

## TL;DR - Fast Deployment

```bash
# 1. Configure
nano 00-config.sh
# Update PROXMOX_HOST and credentials only

# 2. Deploy
chmod +x *.sh
./01-network-setup.sh
./02-provision-all.sh      # Takes 30-45 min
./10-setup-db.sh
./11-setup-redis.sh
./20-setup-proxy.sh
./99-verify.sh

# 3. Verify
# Check all services are green in final report
```

## Installation Paths

### Fast Track (Core Only)
**Time: 60-90 minutes**

Minimal setup with core services only:

```bash
# Just essential services
./01-network-setup.sh
./02-provision-all.sh
./10-setup-db.sh
./11-setup-redis.sh
./20-setup-proxy.sh
./99-verify.sh
```

This gives you:
- ✅ 17 containers up and running
- ✅ PostgreSQL database
- ✅ Redis cache
- ✅ NGINX reverse proxy
- ❌ No AI services
- ❌ No logging stack

### Full Stack (Recommended)
**Time: 120-150 minutes**

Complete installation with all services:

```bash
# Everything above plus:
./30-setup-ai.sh          # Ollama + models (20-30 min)
./40-setup-observability.sh  # Elasticsearch
```

This gives you:
- ✅ All from Fast Track
- ✅ Ollama AI services
- ✅ Elasticsearch logging
- ✅ Complete observability

## Pre-Deployment Checklist

- [ ] Proxmox host accessible via SSH
- [ ] 64GB+ RAM available
- [ ] 512GB+ storage space
- [ ] Network connectivity
- [ ] Debian 12 LXC template available
- [ ] `00-config.sh` updated with Proxmox host

## Critical Configuration Changes

Edit `00-config.sh` before running any scripts:

```bash
# Line 30-35: UPDATE THESE
PROXMOX_HOST="YOUR.PROXMOX.IP"     # ← MUST change this
PROXMOX_USER="root"                # Usually correct
PROXMOX_NODE="pve"                 # Usually correct

# Line 75-80: CHANGE PASSWORDS
LXC_ROOT_PASSWORD="YourSecurePass"
PG_PASSWORD="YourPGPass"
REDIS_PASSWORD="YourRedisPass"
```

## Execution Timeline

### Stage 1: Network Setup (5 min)
```bash
./01-network-setup.sh
```
**What happens:**
- Creates vmbr40 bridge
- Enables IP forwarding
- Configures NAT
- Sets up firewall

**Verify:**
```bash
ssh YOUR_PROXMOX_IP "ip addr show vmbr40"
# Should show 10.10.40.1/24
```

### Stage 2: Container Creation (40 min)
```bash
./02-provision-all.sh
```
**What happens:**
- Creates 17 LXC containers
- Configures networking
- Installs Docker on each
- Configures SSH

**Monitor progress:**
```bash
# In another terminal
ssh YOUR_PROXMOX_IP "watch -n 2 'pct list'"
```

**Verify:**
```bash
ssh YOUR_PROXMOX_IP "pct list | wc -l"
# Should show 17 containers + header = 18 lines
```

### Stage 3: Database Setup (10 min)
```bash
./10-setup-db.sh
```
**What happens:**
- Installs PostgreSQL 15
- Adds pgvector extension
- Creates databases and tables
- Configures backups

**Verify:**
```bash
ssh YOUR_PROXMOX_IP "pct exec 404 -- psql -U postgres -l | grep zentoria"
```

### Stage 4: Cache Setup (5 min)
```bash
./11-setup-redis.sh
```
**What happens:**
- Installs Redis
- Configures persistence
- Sets up backups
- Enables monitoring

**Verify:**
```bash
ssh YOUR_PROXMOX_IP "pct exec 410 -- redis-cli PING"
# Should return: PONG
```

### Stage 5: Reverse Proxy (5 min)
```bash
./20-setup-proxy.sh
```
**What happens:**
- Installs NGINX
- Creates upstream config
- Generates SSL certificates
- Configures rate limiting

**Verify:**
```bash
ssh YOUR_PROXMOX_IP "pct exec 408 -- nginx -t"
# Should show: nginx: configuration file test is successful
```

### Stage 6: AI Services (30 min) - Optional
```bash
./30-setup-ai.sh
```
**What happens:**
- Installs Ollama
- Pulls AI models
- Sets up API endpoints
- Configures monitoring

**Verify (takes a few minutes to pull models):**
```bash
ssh YOUR_PROXMOX_IP "pct exec 405 -- ollama list"
# Should show: llama2, mistral, neural-chat, orca-mini
```

### Stage 7: Logging (10 min) - Optional
```bash
./40-setup-observability.sh
```
**What happens:**
- Installs Elasticsearch
- Creates log indices
- Sets up pipelines
- Configures monitoring

**Verify:**
```bash
ssh YOUR_PROXMOX_IP "pct exec 406 -- curl -s http://localhost:9200/_cluster/health | jq .status"
# Should show: "green" or "yellow"
```

### Stage 8: Verification (5 min)
```bash
./99-verify.sh
```
**Output summary:**
- Green checkmarks = OK
- Yellow warnings = Monitor
- Red errors = Fix required

## Service Endpoints (After Deployment)

### Internal Access
- **API:** http://10.10.40.101:8000
- **Frontend:** http://10.10.40.100:3000
- **NGINX:** http://10.10.40.108:80
- **PostgreSQL:** postgresql://10.10.40.104:5432
- **Redis:** redis://10.10.40.110:6379
- **Ollama API:** http://10.10.40.105:11434
- **Elasticsearch:** http://10.10.40.106:9200
- **N8N:** http://10.10.40.102:5678

### External Access (via NGINX reverse proxy)
- **Frontend:** https://zentoria.local (or configure domain)
- **API:** https://api.zentoria.local
- **N8N:** https://n8n.zentoria.local

## Quick Fixes

### Container won't start
```bash
# Check logs
ssh PROXMOX "pct exec 404 -- journalctl -xe"

# Try stopping and starting
ssh PROXMOX "pct stop 404 && sleep 5 && pct start 404"
```

### Network not working
```bash
# Verify bridge
ssh PROXMOX "ip link show vmbr40"

# Check container networking
ssh PROXMOX "pct exec 400 -- ip route"
```

### Service won't start
```bash
# SSH to container
ssh PROXMOX "pct exec 404 -- bash"

# Check service status
systemctl status postgresql

# View logs
journalctl -xe -u postgresql

# Manual start for debugging
postgres -D /var/lib/postgresql/15/main
```

### Out of disk space
```bash
# Check available space
ssh PROXMOX "df -h"

# Resize container volume
ssh PROXMOX "pct resize 404 rootfs +100G"

# Or expand on Proxmox storage
# (See LVM expansion in Proxmox docs)
```

## Post-Deployment Tasks

### 1. Update Passwords
```bash
# Change PostgreSQL password
ssh PROXMOX "pct exec 404 -- sudo -u postgres psql -c \"ALTER USER zentoria WITH PASSWORD 'new_password';\""

# Change Redis password
ssh PROXMOX "pct exec 410 -- redis-cli CONFIG SET requirepass new_password"
```

### 2. Configure SSL Certificates
Replace self-signed certificates in container 408:
```bash
# Copy your certificates
scp your-cert.pem PROXMOX:/tmp/
scp your-key.pem PROXMOX:/tmp/

# Push to container
ssh PROXMOX "pct push 408 /tmp/your-cert.pem /etc/nginx/ssl/cert.pem"
ssh PROXMOX "pct push 408 /tmp/your-key.pem /etc/nginx/ssl/key.pem"

# Reload NGINX
ssh PROXMOX "pct exec 408 -- systemctl reload nginx"
```

### 3. Set Up Monitoring
```bash
# Access Elasticsearch
http://10.10.40.106:9200

# Create dashboards for:
# - Container resources (CPU, memory, disk)
# - Service performance
# - Error rates and logs
```

### 4. Configure Backups
```bash
# Verify backup jobs are running
ssh PROXMOX "pct exec 404 -- ls -lh /var/backups/postgresql/"
ssh PROXMOX "pct exec 410 -- ls -lh /var/backups/redis/"

# Test restore procedure
# (See README.md for full backup/recovery guide)
```

### 5. Add to Monitoring
- Configure Prometheus scrapers
- Set up alerting rules
- Create Grafana dashboards

## Scaling Tips

### Add More AI Models
```bash
# SSH to Ollama container
ssh PROXMOX "pct exec 405 -- bash"

# Pull additional models
ollama pull qwen:7b
ollama pull vicuna:13b
ollama pull dolphin-mixtral:latest

# List all models
ollama list
```

### Expand Database Storage
```bash
# Check current size
ssh PROXMOX "df -h /var/lib/postgresql"

# Extend container disk
ssh PROXMOX "pct resize 404 rootfs +50G"

# Verify
ssh PROXMOX "df -h /var/lib/postgresql"
```

### Increase Redis Memory
```bash
# Edit redis.conf
ssh PROXMOX "pct exec 410 -- nano /etc/redis/redis.conf"

# Find: maxmemory 1gb
# Change to: maxmemory 2gb

# Restart Redis
ssh PROXMOX "pct exec 410 -- systemctl restart redis-server"
```

## Troubleshooting

### All scripts failing to run
```bash
# Make scripts executable
chmod +x 00-config.sh 01-network-setup.sh 02-provision-all.sh \
          10-setup-db.sh 11-setup-redis.sh 20-setup-proxy.sh \
          30-setup-ai.sh 40-setup-observability.sh 99-verify.sh
```

### SSH connection timeouts
```bash
# Check SSH configuration in 00-config.sh
# Ensure SSH keys are set up properly
ssh-keygen -t rsa -b 4096

# Add public key to Proxmox
ssh-copy-id -i ~/.ssh/id_rsa.pub root@PROXMOX_IP
```

### Permission denied errors
```bash
# Verify running as appropriate user
whoami

# Proxmox scripts need Proxmox root access
# Container scripts use pct exec (no special permissions needed)
```

### Container creation fails with "template not found"
```bash
# Verify template exists on Proxmox
ssh PROXMOX "ls -lh /var/lib/vz/template/cache/*.tar.zst"

# Update PROXMOX_TEMPLATE in 00-config.sh if different
```

## Emergency Rollback

If deployment fails catastrophically:

```bash
# Stop all containers
ssh PROXMOX "for i in {400..423}; do pct stop \$i 2>/dev/null; done"

# Delete network bridge (if needed)
ssh PROXMOX "ip link delete vmbr40"

# Remove containers
ssh PROXMOX "for i in {400..423}; do pct destroy \$i --purge 2>/dev/null; done"

# Start over
./01-network-setup.sh
./02-provision-all.sh
# ... etc
```

## Next Steps

1. **Deployment:** Follow the stages above
2. **Verification:** Run `./99-verify.sh` and fix any errors
3. **Configuration:** Update credentials and SSL certificates
4. **Testing:** Test service connectivity
5. **Monitoring:** Set up dashboards and alerts
6. **Documentation:** Document your customizations
7. **Backup:** Test backup and restore procedures

## Support

- Check README.md for detailed documentation
- Review 00-config.sh comments for all configuration options
- See individual setup scripts for service-specific details
- Monitor container logs: `pct exec <vmid> -- journalctl -xe`

## Getting Help

```bash
# Enable debug mode in scripts
set -x  # At start of script

# Watch real-time logs
ssh PROXMOX "pct exec 404 -- tail -f /var/log/postgresql/postgresql.log"

# Check Proxmox system logs
ssh PROXMOX "tail -f /var/log/pve/pveproxy.log"

# Monitor container resources
ssh PROXMOX "pct status --verbose 404"
```

---

**Estimated Total Time:** 90-150 minutes depending on options selected

**Next:** Read README.md for comprehensive documentation
