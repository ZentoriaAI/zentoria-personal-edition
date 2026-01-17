# Zentoria Personal Edition - Operations Runbook

**Version:** 1.0
**Last Updated:** January 2026

---

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Service Management](#service-management)
3. [Troubleshooting](#troubleshooting)
4. [Incident Response](#incident-response)
5. [Maintenance Procedures](#maintenance-procedures)
6. [Emergency Procedures](#emergency-procedures)

---

## Daily Operations

### Morning Health Check

**Duration:** 5-10 minutes
**Frequency:** Daily

```bash
# Quick health check
make verify

# Expected output: All services PASS

# Check container status
pct list | grep zentoria

# Check disk space
make disk-usage

# Check recent logs for errors
make logs-backend | grep -i error
```

### Monitor Key Metrics

**Grafana Dashboard:** http://logs.zentoria.local:3001

**Key Metrics to Watch:**
| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU Usage | > 80% | Investigate high CPU consumers |
| Memory Usage | > 90% | Check for memory leaks |
| Disk Usage | > 85% | Clean up old logs/backups |
| API Response Time | > 1000ms | Check database performance |
| Error Rate | > 5% | Review application logs |

### Review Logs

```bash
# Backend errors
make logs-backend | grep -i error

# Database slow queries
make db-shell
SELECT * FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 10;

# Redis memory usage
make redis-shell
INFO memory
```

---

## Service Management

### Starting Services

**Start all containers:**
```bash
make start

# Or individually
pct start 400  # Frontend
pct start 401  # Backend
pct start 404  # Database
pct start 410  # Redis
```

**Verify services started:**
```bash
# Check container status
make status

# Check application processes
pct exec 401 -- pm2 status
pct exec 404 -- docker ps
```

### Stopping Services

**Graceful shutdown:**
```bash
# Stop applications first
pct exec 401 -- pm2 stop all
pct exec 400 -- pm2 stop all

# Wait 30 seconds for connections to drain
sleep 30

# Stop containers
make stop
```

**Emergency stop:**
```bash
# Force stop all containers
for ct in 400 401 404 410 405; do
  pct stop $ct --force
done
```

### Restarting Services

**Full restart:**
```bash
make restart

# Or specific services
pct restart 401  # Backend
make verify-api  # Verify it came back up
```

**Application reload (zero downtime):**
```bash
# Backend
pct exec 401 -- pm2 reload all

# Frontend
pct exec 400 -- pm2 reload all

# NGINX
pct exec 408 -- nginx -s reload
```

### Checking Service Status

**Container level:**
```bash
pct list | grep zentoria
```

**Application level:**
```bash
# PM2 processes
pct exec 401 -- pm2 status

# Docker containers
pct exec 404 -- docker ps
pct exec 410 -- docker ps

# NGINX
pct exec 408 -- systemctl status nginx
```

**Health endpoints:**
```bash
# Backend API
curl http://api.zentoria.local/api/v1/health

# Database
pct exec 404 -- docker exec postgres pg_isready

# Redis
pct exec 410 -- docker exec redis redis-cli -a changeme123 ping

# AI Service
curl http://10.10.40.5:5000/health
```

---

## Troubleshooting

### Issue: High CPU Usage

**Diagnosis:**
```bash
# Check top processes in container
pct exec 401 -- top -bn1 | head -20

# Check PM2 metrics
pct exec 401 -- pm2 monit

# Check for stuck processes
pct exec 401 -- ps aux | grep -i defunct
```

**Resolution:**
```bash
# Restart high-CPU service
pct exec 401 -- pm2 restart <service>

# If that doesn't help, restart container
pct restart 401

# Check for infinite loops in logs
make logs-backend | grep -i "loop\|recursive\|stack"
```

### Issue: High Memory Usage

**Diagnosis:**
```bash
# Check memory per container
make disk-usage

# Check for memory leaks
pct exec 401 -- pm2 monit

# Check Redis memory
make redis-shell
INFO memory
```

**Resolution:**
```bash
# Clear Redis cache
make redis-flush

# Restart leaking service
pct exec 401 -- pm2 restart <service>

# Increase container memory (if needed)
pct set 401 --memory 16384
pct restart 401
```

### Issue: Database Connection Pool Exhausted

**Symptoms:**
- API errors: "Connection pool exhausted"
- High database connection count
- Slow query performance

**Diagnosis:**
```bash
# Check PgBouncer stats
pct exec 404 -- docker exec pgbouncer psql -p 6432 -U zentoria -d pgbouncer << EOF
SHOW POOLS;
SHOW STATS;
EOF

# Check active connections
make db-shell
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

**Resolution:**
```bash
# Restart PgBouncer
pct exec 404 -- docker-compose restart pgbouncer

# Kill idle connections (if safe)
make db-shell
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
AND state_change < now() - interval '5 minutes';

# Increase pool size
pct exec 404 -- bash -c "
  sed -i 's/DEFAULT_POOL_SIZE=.*/DEFAULT_POOL_SIZE=50/' /opt/zentoria/db/docker-compose.yml
  docker-compose restart pgbouncer
"
```

### Issue: Redis Out of Memory

**Symptoms:**
- API errors: "OOM command not allowed"
- Redis rejecting writes

**Diagnosis:**
```bash
make redis-shell
INFO memory

# Check largest keys
MEMORY USAGE <key>
```

**Resolution:**
```bash
# Increase Redis memory
pct set 410 --memory 16384
pct restart 410

# Or configure eviction policy
make redis-shell
CONFIG SET maxmemory-policy allkeys-lru
CONFIG REWRITE
```

### Issue: AI Model Not Loading

**Symptoms:**
- AI requests timeout
- Ollama errors in logs

**Diagnosis:**
```bash
# Check Ollama status
pct exec 405 -- docker logs ollama --tail 50

# Check available models
make ai-models

# Check disk space
pct exec 405 -- df -h /opt/zentoria/ai/ollama/models
```

**Resolution:**
```bash
# Restart Ollama
pct exec 405 -- docker restart ollama

# Re-pull model
make ai-pull MODEL=llama3.2:latest

# Clear corrupted model cache
pct exec 405 -- rm -rf /opt/zentoria/ai/ollama/models/*
make ai-pull MODEL=llama3.2:latest
```

### Issue: NGINX 502 Bad Gateway

**Symptoms:**
- Users get 502 errors
- NGINX can't reach backend

**Diagnosis:**
```bash
# Check NGINX logs
pct exec 408 -- tail -50 /var/log/nginx/error.log

# Test backend connectivity from proxy
pct exec 408 -- curl http://10.10.40.1:4000/api/v1/health

# Check backend status
pct exec 401 -- pm2 status
```

**Resolution:**
```bash
# Restart backend
pct exec 401 -- pm2 restart all

# If backend is running, reload NGINX
pct exec 408 -- nginx -t
pct exec 408 -- nginx -s reload

# Check firewall rules
iptables -L -n -v | grep "10.10.40"
```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| **P0 - Critical** | Complete outage | Immediate | All hands on deck |
| **P1 - High** | Major functionality broken | 15 minutes | On-call engineer |
| **P2 - Medium** | Degraded service | 1 hour | During business hours |
| **P3 - Low** | Minor issue | 4 hours | Scheduled work |

### P0: Complete Outage

**Symptoms:**
- All services down
- Users cannot access system

**Immediate Actions:**
```bash
# 1. Check Proxmox host status
ssh proxmox
uptime
df -h

# 2. Check container status
pct list | grep zentoria

# 3. Start critical containers
make start

# 4. Verify services
make verify

# 5. Check logs for errors
make logs-backend
make logs-db
```

**Communication:**
1. Post status update
2. Update every 15 minutes
3. Notify when resolved

### P1: Database Corruption

**Symptoms:**
- Database errors in logs
- Data inconsistency
- PostgreSQL won't start

**Immediate Actions:**
```bash
# 1. Stop all applications
pct exec 401 -- pm2 stop all
pct exec 400 -- pm2 stop all

# 2. Check database integrity
pct exec 404 -- docker exec postgres pg_dump -U zentoria zentoria_core > /tmp/test_dump.sql

# 3. If dump fails, restore from backup
make restore-db

# 4. Verify database
make verify-db

# 5. Restart applications
pct exec 401 -- pm2 start all
pct exec 400 -- pm2 start all
```

### P1: Security Breach

**Symptoms:**
- Suspicious activity in logs
- Unauthorized access attempts
- CrowdSec alerts

**Immediate Actions:**
```bash
# 1. Block suspicious IPs
pct exec 423 -- docker exec crowdsec cscli decisions add --ip <IP> --duration 24h --reason "Security incident"

# 2. Review access logs
pct exec 408 -- tail -100 /var/log/nginx/access.log | grep <IP>

# 3. Check for unauthorized users
make db-shell
SELECT * FROM users ORDER BY created_at DESC LIMIT 10;

# 4. Rotate credentials
# Follow security incident playbook

# 5. Enable debug logging
make debug

# 6. Document incident
# Create incident report
```

---

## Maintenance Procedures

### Weekly Maintenance

**Every Sunday at 02:00 AM**

```bash
# 1. Update packages
make update

# 2. Update Docker images
make update-docker

# 3. Run backups
make backup

# 4. Verify backups
make backup-verify

# 5. Clean up old data
make cleanup

# 6. Check disk usage
make disk-usage

# 7. Review logs for warnings
make logs | grep -i warning
```

### Monthly Maintenance

**First Sunday of each month**

```bash
# 1. Database maintenance
make db-shell
VACUUM ANALYZE;
REINDEX DATABASE zentoria_core;

# 2. Redis persistence
make redis-shell
BGSAVE

# 3. Rotate logs
for ct in 400 401 402; do
  pct exec $ct -- journalctl --vacuum-time=30d
done

# 4. Security updates
make update

# 5. SSL certificate check
pct exec 408 -- certbot certificates

# 6. Review monitoring dashboards
# Check Grafana for trends
```

### Quarterly Maintenance

**First Sunday of quarter**

```bash
# 1. Full system backup
make backup

# 2. Disaster recovery test
# Follow DR procedure (see below)

# 3. Security audit
# Review access logs, user accounts, API keys

# 4. Performance tuning
# Review slow queries, optimize indexes

# 5. Capacity planning
# Review growth trends, plan for scaling

# 6. Update documentation
# Update runbooks, architecture docs
```

---

## Emergency Procedures

### Complete System Restore

**Scenario:** Total data loss, need to restore from backup

**Prerequisites:**
- Recent backup available
- Clean Proxmox host

**Steps:**

1. **Restore Containers:**
```bash
cd infrastructure/scripts
./02-provision-all.sh
```

2. **Restore Database:**
```bash
# Copy backup to container
pct push 404 /path/to/backup.sql /tmp/backup.sql

# Restore
pct exec 404 -- bash << EOF
docker-compose -f /opt/zentoria/db/docker-compose.yml up -d
sleep 10
docker exec -i postgres psql -U zentoria zentoria_core < /tmp/backup.sql
EOF
```

3. **Restore Configuration:**
```bash
# Restore Vault data
pct push 403 /path/to/vault-backup.tar.gz /tmp/vault-backup.tar.gz
pct exec 403 -- tar -xzf /tmp/vault-backup.tar.gz -C /opt/zentoria/vault/data

# Restore n8n workflows
pct push 402 /path/to/n8n-backup.tar.gz /tmp/n8n-backup.tar.gz
pct exec 402 -- tar -xzf /tmp/n8n-backup.tar.gz -C /opt/zentoria/n8n/data
```

4. **Verify Restoration:**
```bash
make verify-all
```

5. **Restore User Data:**
```bash
# Restore MinIO buckets
pct exec 407 -- bash << EOF
docker exec minio mc mirror /backup/uploads s3/uploads
docker exec minio mc mirror /backup/documents s3/documents
EOF
```

### Disaster Recovery Test

**Purpose:** Verify backups and procedures

**Frequency:** Quarterly

**Steps:**

1. **Create isolated test environment:**
```bash
# Clone containers for testing
for ct in 404 410; do
  pct clone $ct $((ct + 100)) --full
done
```

2. **Test backup restore:**
```bash
# Restore latest backup to test containers
# Follow restore procedure above
```

3. **Verify functionality:**
```bash
# Run verification tests
# Check data integrity
# Test application functionality
```

4. **Document results:**
```bash
# Record:
# - Restore time
# - Data loss (if any)
# - Issues encountered
# - Procedure improvements
```

5. **Clean up test environment:**
```bash
# Destroy test containers
pct destroy 504
pct destroy 510
```

---

## Log Locations

| Service | Location |
|---------|----------|
| Backend | `pm2 logs` in container 401 |
| Frontend | `pm2 logs` in container 400 |
| PostgreSQL | `docker logs postgres` in container 404 |
| Redis | `docker logs redis` in container 410 |
| NGINX | `/var/log/nginx/` in container 408 |
| Ollama | `docker logs ollama` in container 405 |
| System | `journalctl -u pve-container@<ID>` on host |

---

## Useful Commands Reference

### Container Management
```bash
pct list                          # List all containers
pct status <ID>                   # Check container status
pct start <ID>                    # Start container
pct stop <ID>                     # Stop container (graceful)
pct stop <ID> --force             # Force stop
pct restart <ID>                  # Restart container
pct enter <ID>                    # Enter container shell
pct exec <ID> -- <command>        # Execute command in container
```

### Database Operations
```bash
make db-shell                     # PostgreSQL CLI
make db-dump                      # Create backup
make db-restore                   # Restore from backup
```

### Process Management
```bash
pm2 status                        # Show all processes
pm2 restart <app>                 # Restart application
pm2 reload <app>                  # Zero-downtime reload
pm2 stop <app>                    # Stop application
pm2 logs <app>                    # View logs
pm2 monit                         # Real-time monitoring
```

### Docker Operations
```bash
docker ps                         # List running containers
docker logs <container>           # View logs
docker restart <container>        # Restart container
docker exec -it <container> sh    # Enter container
docker-compose up -d              # Start services
docker-compose down               # Stop services
docker-compose restart <service>  # Restart specific service
```

---

## Escalation Contacts

**On-Call Engineer:** [Define rotation]

**Infrastructure Team:** [Define contacts]

**Security Team:** [Define contacts]

**External Support:**
- Proxmox Support: https://www.proxmox.com/en/proxmox-ve/support
- PostgreSQL Mailing List: pgsql-general@postgresql.org

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-01 | 1.0 | Initial runbook |

---

**Document Owner:** Infrastructure Team
**Review Frequency:** Quarterly
**Next Review:** April 2026
