# Zentoria Backup System - Implementation Guide

Step-by-step guide to deploy and configure the complete backup and disaster recovery system.

## Overview

This guide covers:

1. **System Requirements** - Prerequisites and dependencies
2. **Installation** - Deploying backup container and scripts
3. **Configuration** - Setting up credentials and storage
4. **Scheduling** - Configuring automated backups
5. **Verification** - Testing backup and restore capabilities
6. **Operations** - Daily monitoring and maintenance
7. **Disaster Recovery** - Recovery procedures

## System Requirements

### Hardware Requirements

| Tier | Size |
|------|------|
| Development | 50 GB free disk space |
| Production (Small) | 200 GB free disk space |
| Production (Medium) | 500 GB free disk space |
| Production (Large) | 1 TB+ SSD recommended |

### Software Requirements

- Docker 20.10+
- Docker Compose 2.0+
- Bash 4.0+
- GNU utilities (sed, awk, find, tar, gzip)
- PostgreSQL client tools (pg_dump, psql)
- Redis CLI
- curl, jq

### Network Requirements

- Internal container network connectivity
- External internet (for OneDrive sync via rclone)
- No firewall restrictions on container ports

### Storage Requirements

| Component | Purpose | Minimum |
|-----------|---------|---------|
| Local backups | Recent backups for fast restore | 100 GB |
| MinIO | Centralized backup repository | 200 GB |
| OneDrive | Offsite disaster recovery | 500 GB |

---

## Installation

### Step 1: Deploy Backup Container

```bash
# Clone or navigate to project
cd infrastructure/docker

# Ensure backup container is defined in docker-compose
# (should be services/docker-compose.backup.yaml)

# Start backup container
docker-compose -f services/docker-compose.backup.yaml up -d

# Verify it's running
docker-compose ps | grep backup
```

### Step 2: Copy Backup Scripts

```bash
# SSH into backup container
docker-compose exec backup bash

# Create script directory
mkdir -p /opt/zentoria/backup/scripts
mkdir -p /opt/zentoria/backup/logs
mkdir -p /opt/zentoria/backup/local
mkdir -p /opt/zentoria/backup/metrics

# Make scripts executable
chmod +x /opt/zentoria/backup/scripts/*.sh

# Exit container
exit
```

### Step 3: Configure Backup Scripts

```bash
# Copy scripts to container
docker cp infrastructure/backup/scripts/backup-all.sh \
    $(docker-compose ps -q backup):/opt/zentoria/backup/scripts/

docker cp infrastructure/backup/scripts/backup-postgresql.sh \
    $(docker-compose ps -q backup):/opt/zentoria/backup/scripts/

docker cp infrastructure/backup/scripts/verify-backups.sh \
    $(docker-compose ps -q backup):/opt/zentoria/backup/scripts/

# Repeat for all scripts in infrastructure/backup/scripts/
```

### Step 4: Verify Container Connectivity

```bash
# From backup container, verify connectivity to all services
docker-compose exec backup bash -c '
    echo "Testing PostgreSQL..."
    pg_isready -h postgres -p 5432 -U zentoria

    echo "Testing Redis..."
    redis-cli -h redis -p 6379 ping

    echo "Testing Qdrant..."
    curl -s http://qdrant:6333/health

    echo "Testing MinIO..."
    mc ls minio
'
```

---

## Configuration

### Step 1: Set Environment Variables

```bash
# Create/edit .env file
cat > .env <<'EOF'
# Backup Configuration
BACKUP_CONTAINER_ID=416
BACKUP_ROOT=/opt/zentoria/backup

# Database Connection
DB_HOST=postgres
DB_PORT=5432
DB_USER=zentoria
DB_PASSWORD=your_secure_password
DB_NAMES="zentoria_main zentoria_vectors n8n"

# Redis Connection
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_secure_password

# Qdrant Connection
QDRANT_HOST=qdrant
QDRANT_PORT=6333
QDRANT_API_KEY=your_api_key

# MinIO Connection
MINIO_HOST=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key

# Restic Configuration
RESTIC_PASSWORD=your_restic_password
RESTIC_REPOSITORY=/opt/zentoria/backup/restic

# Retention Policies
BACKUP_RETENTION_HOURLY=7
BACKUP_RETENTION_DAILY=30
BACKUP_RETENTION_WEEKLY=12

# Notifications
BACKUP_ALERT_EMAIL=admin@zentoria.ai
BACKUP_ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Compression
BACKUP_COMPRESSION_LEVEL=9
BACKUP_PARALLEL_JOBS=4
EOF

# Load environment
source .env
```

### Step 2: Configure Vault for Credentials

```bash
# Initialize secrets in Vault
docker-compose exec vault vault write -f secret/zentoria/backup/postgresql \
    username="zentoria" \
    password="your_secure_password" \
    connection_string="postgresql://zentoria:password@postgres:5432/zentoria_main"

docker-compose exec vault vault write -f secret/zentoria/backup/redis \
    password="your_secure_password" \
    host_port="redis:6379"

docker-compose exec vault vault write -f secret/zentoria/backup/minio \
    access_key="your_access_key" \
    secret_key="your_secret_key" \
    endpoint="minio:9000"

docker-compose exec vault vault write -f secret/zentoria/backup/onedrive \
    client_id="your_client_id" \
    client_secret="your_client_secret" \
    refresh_token="your_refresh_token"

docker-compose exec vault vault write -f secret/zentoria/backup/restic \
    password="your_restic_password"
```

### Step 3: Configure rclone for OneDrive

```bash
# SSH into backup container
docker-compose exec backup bash

# Configure rclone
rclone config create zentoria-onedrive microsoft OneDrive

# When prompted:
# - Use authorization to get token
# - Select personal OneDrive
# - Save configuration

# Test connection
rclone ls zentoria-onedrive:Zentoria/Backups/

# Exit
exit
```

### Step 4: Initialize Restic Repository (Optional)

```bash
# If using Restic for deduplication
docker-compose exec backup bash

mkdir -p /opt/zentoria/backup/restic

# Initialize
restic init -r /opt/zentoria/backup/restic/ \
    --password-file <(echo $RESTIC_PASSWORD)

# Verify
restic list -r /opt/zentoria/backup/restic/ snapshots

exit
```

---

## Scheduling

### Step 1: Install Cron Jobs

```bash
# Copy cron configuration
docker cp infrastructure/backup/config/crontab-backup-416 \
    $(docker-compose ps -q backup):/tmp/crontab

# Install crontab
docker-compose exec backup crontab /tmp/crontab

# Verify cron jobs
docker-compose exec backup crontab -l
```

### Step 2: Verify Cron Schedule

```bash
# Check if cron is running
docker-compose exec backup ps aux | grep crond

# Monitor cron logs
docker-compose logs -f backup | grep CRON
```

### Step 3: Run Initial Backup

```bash
# Manually run first backup to test configuration
docker-compose exec backup /opt/zentoria/backup/scripts/backup-all.sh full

# Monitor progress
docker-compose logs -f backup

# Check results
docker-compose exec backup ls -lah /opt/zentoria/backup/local/
```

---

## Verification

### Step 1: Verify Backup Files

```bash
# Check backup directory structure
docker-compose exec backup tree -L 3 /opt/zentoria/backup/local/

# Check file sizes
docker-compose exec backup du -sh /opt/zentoria/backup/local/*

# Check recent backups
docker-compose exec backup ls -lht /opt/zentoria/backup/local/*/* | head -20
```

### Step 2: Run Integrity Checks

```bash
# Full backup verification
docker-compose exec backup \
    /opt/zentoria/backup/scripts/verify-backups.sh all

# Verify PostgreSQL backups only
docker-compose exec backup \
    /opt/zentoria/backup/scripts/verify-backups.sh postgresql

# Verify checksums
docker-compose exec backup \
    sha256sum -c /opt/zentoria/backup/local/postgresql/daily/*.sha256
```

### Step 3: Test Recovery Procedures

```bash
# Test PostgreSQL restore
docker-compose exec backup \
    /opt/zentoria/backup/scripts/test-restore-postgresql.sh

# Test Redis restore
docker-compose exec backup \
    /opt/zentoria/backup/scripts/test-restore-redis.sh

# Test Qdrant restore
docker-compose exec backup \
    /opt/zentoria/backup/scripts/test-restore-qdrant.sh
```

### Step 4: Verify OneDrive Sync

```bash
# Manually sync to OneDrive
docker-compose exec backup \
    /opt/zentoria/backup/scripts/sync-to-onedrive.sh daily

# Verify files on OneDrive
docker-compose exec backup \
    rclone ls zentoria-onedrive:Zentoria/Backups/Daily/
```

---

## Operations

### Daily Monitoring

```bash
# Check backup system health
docker-compose exec backup /opt/zentoria/backup/scripts/health-check.sh

# View recent logs
docker-compose logs --since 24h backup | grep -i error

# Check disk usage
docker-compose exec backup df -h /opt/zentoria/backup/
```

### Weekly Tasks

```bash
# Run full backup verification (weekly)
docker-compose exec backup \
    /opt/zentoria/backup/scripts/verify-backups.sh all

# Run restore testing (weekly on specific systems)
docker-compose exec backup \
    /opt/zentoria/backup/scripts/test-restore-postgresql.sh
```

### Monthly Tasks

```bash
# Run full system restore test (monthly)
docker-compose exec backup \
    /opt/zentoria/backup/scripts/test-restore-all.sh

# Cleanup old backups (automatic, but verify)
docker-compose exec backup \
    /opt/zentoria/backup/scripts/prune-old-backups.sh

# Review and update retention policies
nano infrastructure/backup/config/crontab-backup-416
```

### Quarterly Tasks

```bash
# Disaster recovery drill (quarterly)
# Follow procedure in DISASTER_RECOVERY.md

# Test offsite recovery from OneDrive
# - Provision new infrastructure
# - Restore from OneDrive backups
# - Verify full system functionality

# Update documentation based on lessons learned
```

---

## Monitoring Integration

### Prometheus Setup

```bash
# Add backup metrics to Prometheus scrape config
cat >> /etc/prometheus/prometheus.yml <<'EOF'
  - job_name: 'zentoria-backup'
    static_configs:
      - targets: ['backup:9100']
    metrics_path: '/opt/zentoria/backup/metrics/backup_status.txt'
EOF

# Reload Prometheus
curl -X POST http://localhost:9090/-/reload
```

### Grafana Dashboard

```bash
# Import backup dashboard
curl -X POST http://localhost:3000/api/dashboards/db \
    -H "Content-Type: application/json" \
    -d @infrastructure/backup/config/grafana-backup-dashboard.json
```

### Alert Configuration

```bash
# Configure AlertManager rules
cat > /etc/alertmanager/backup-rules.yml <<'EOF'
groups:
  - name: backup_alerts
    rules:
      - alert: BackupFailed
        expr: backup_success == 0
        for: 5m
        annotations:
          severity: critical
          summary: "Backup failed for {{ $labels.service }}"
EOF

# Reload AlertManager
curl -X POST http://localhost:9093/-/reload
```

---

## Troubleshooting

### Backup Script Fails

```bash
# Check detailed logs
docker-compose logs backup | tail -100

# Verify database connectivity
docker-compose exec backup \
    psql -h postgres -U zentoria -d zentoria_main -c "SELECT 1"

# Check disk space
docker-compose exec backup df -h /opt/zentoria/backup/

# Run with verbose output
docker-compose exec backup bash -x \
    /opt/zentoria/backup/scripts/backup-all.sh daily
```

### OneDrive Sync Fails

```bash
# Check rclone configuration
docker-compose exec backup rclone config show zentoria-onedrive

# Test connection
docker-compose exec backup rclone ls zentoria-onedrive:

# Re-authenticate if needed
docker-compose exec backup rclone config create zentoria-onedrive microsoft OneDrive
```

### Restore Test Fails

```bash
# Check backup integrity
docker-compose exec backup \
    /opt/zentoria/backup/scripts/verify-backups.sh postgresql

# Test with older backup
docker-compose exec backup ls -lrt /opt/zentoria/backup/local/postgresql/daily/

# Manually restore to test database for debugging
docker-compose exec backup bash <<'EOF'
BACKUP=$(ls -t /opt/zentoria/backup/local/postgresql/daily/*.sql.gz | head -1)
gunzip < $BACKUP | psql -h postgres -U postgres -d zentoria_test_recovery
EOF
```

---

## Performance Tuning

### Optimize Compression

```bash
# Faster: Less compression
export BACKUP_COMPRESSION_LEVEL=1

# Balanced: Medium compression
export BACKUP_COMPRESSION_LEVEL=6

# Smallest: Maximum compression (slower)
export BACKUP_COMPRESSION_LEVEL=9
```

### Optimize Parallelization

```bash
# Increase parallel jobs
export BACKUP_PARALLEL_JOBS=8

# This speeds up:
# - PostgreSQL dumps
# - MinIO syncs
# - Restic backups
```

### Schedule Off-Peak

```bash
# Edit crontab to run during low-traffic hours
# 02:00 - 06:00 is typical

# Avoid:
# - Business hours (08:00-18:00)
# - Peak application usage
# - Maintenance windows
```

---

## Disaster Recovery Testing

### Monthly Test Procedure

```bash
# 1. Schedule maintenance window (2-4 hours)
# 2. Notify team: backup system will be tested
# 3. Create test environment

# 4. Test single container recovery
./test-restore-postgresql.sh

# 5. Test offsite recovery
docker-compose exec backup \
    rclone copy zentoria-onedrive:Zentoria/Backups/Daily/20260116/ \
    /opt/zentoria/backup/test-recovery/

# 6. Restore from downloaded backup
./restore-postgresql.sh /opt/zentoria/backup/test-recovery/*.sql.gz

# 7. Run health checks
curl http://localhost:8000/health

# 8. Document any issues
# 9. Return to normal operation
# 10. Hold post-mortem meeting if issues found
```

---

## Documentation

Reference documentation is available in:

- **ARCHITECTURE.md** - Technical system design
- **DISASTER_RECOVERY.md** - Complete recovery procedures
- **scripts/INDEX.md** - Detailed script reference
- **docs/BACKUP_POLICIES.md** - Retention and frequency policies
- **docs/VERIFICATION_PROCEDURES.md** - How to verify backups
- **docs/SECURITY_ARCHITECTURE.md** - Encryption and access control
- **docs/TROUBLESHOOTING.md** - Common issues and solutions

---

## Next Steps

1. ✅ Review this implementation guide
2. ✅ Deploy backup container (Step 1)
3. ✅ Configure all credentials (Configuration section)
4. ✅ Install cron jobs (Scheduling section)
5. ✅ Run initial backup (Scheduling Step 3)
6. ✅ Verify backup integrity (Verification section)
7. ✅ Set up monitoring (Operations section)
8. ✅ Schedule recovery test (Monthly)
9. ✅ Train team on recovery procedures
10. ✅ Review and update policies quarterly

---

## Support

For questions or issues:

- Check `docs/TROUBLESHOOTING.md`
- Review logs: `docker-compose logs backup`
- Contact infrastructure team: infrastructure@zentoria.ai

---

**Last Updated:** January 2026
**Version:** 1.0.0
**Maintainer:** Zentoria Infrastructure Team
