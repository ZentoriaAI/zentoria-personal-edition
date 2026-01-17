# Zentoria Personal Edition - Backup & Disaster Recovery System

Comprehensive backup and disaster recovery infrastructure for all Zentoria services across 14 containers with multiple redundancy tiers, automated verification, and multi-location storage.

## Overview

This system provides:

- **3-tier backup storage**: Local, MinIO object storage, and offsite (OneDrive)
- **Automated backup scheduling**: Hourly, daily, and weekly intervals
- **Multiple data sources**: PostgreSQL, Redis, Qdrant, MinIO, n8n workflows, configs
- **Backup verification**: Integrity tests, checksum validation, recovery testing
- **Disaster recovery runbooks**: Step-by-step recovery procedures
- **Monitoring & alerts**: Real-time backup status tracking
- **Security**: Encryption, access control, credential management

## Quick Start

### 1. Deploy Backup Container (416)

```bash
# Start backup container with Docker Compose
docker-compose -f services/docker-compose.backup.yaml up -d

# Verify it's running
docker-compose ps | grep backup
```

### 2. Initialize Restic Repositories

```bash
# SSH into backup container
docker-compose exec backup bash

# Initialize repositories
./scripts/init-restic-repos.sh
```

### 3. Configure rclone (OneDrive Sync)

```bash
# Configure OneDrive remote
rclone config create zentoria-onedrive microsoft OneDrive

# Test connection
rclone ls zentoria-onedrive:Zentoria/Backups/
```

### 4. Enable Scheduled Backups

```bash
# Copy crontab entries to backup container
docker-compose exec backup crontab -e

# Paste contents from config/crontab-backup-416
```

### 5. Test Backup & Recovery

```bash
# Run manual backup
docker-compose exec backup ./scripts/backup-all.sh

# Verify backup integrity
docker-compose exec backup ./scripts/verify-backups.sh

# Test restore procedures
docker-compose exec backup ./scripts/test-restore-postgresql.sh
```

## Directory Structure

```
infrastructure/backup/
├── README.md                           # This file
├── DISASTER_RECOVERY.md                # Complete DR runbook
├── ARCHITECTURE.md                     # System design and topology
│
├── scripts/
│   ├── backup-all.sh                   # Master backup script
│   ├── backup-postgresql.sh            # PostgreSQL backups
│   ├── backup-redis.sh                 # Redis RDB/AOF
│   ├── backup-qdrant.sh                # Qdrant snapshots
│   ├── backup-minio.sh                 # MinIO bucket sync
│   ├── backup-n8n.sh                   # n8n workflow export
│   ├── backup-configs.sh               # Configuration files
│   ├── backup-vault.sh                 # Vault snapshot
│   │
│   ├── verify-backups.sh               # Master verification
│   ├── verify-postgresql.sh            # PG integrity tests
│   ├── verify-redis.sh                 # Redis verification
│   ├── verify-qdrant.sh                # Qdrant verification
│   │
│   ├── restore-all.sh                  # Master restore script
│   ├── restore-postgresql.sh           # PG restoration
│   ├── restore-redis.sh                # Redis restoration
│   ├── restore-qdrant.sh               # Qdrant restoration
│   ├── restore-minio.sh                # MinIO restoration
│   │
│   ├── test-restore-postgresql.sh      # PG restore testing
│   ├── test-restore-redis.sh           # Redis restore testing
│   ├── test-restore-qdrant.sh          # Qdrant restore testing
│   │
│   ├── init-restic-repos.sh            # Initialize Restic repos
│   ├── prune-old-backups.sh            # Cleanup old backups
│   ├── sync-to-onedrive.sh             # rclone sync to OneDrive
│   ├── health-check.sh                 # Backup health status
│   └── README.md                       # Script documentation
│
├── config/
│   ├── restic-config.md                # Restic repository setup
│   ├── rclone-config.md                # rclone OneDrive setup
│   ├── crontab-backup-416              # Scheduled jobs
│   ├── prometheus-rules.yml            # Monitoring rules
│   ├── alertmanager-rules.yml          # Alert rules
│   ├── env-backup-416.example          # Environment variables
│   └── docker-compose-backup.yaml      # Backup container compose
│
├── docs/
│   ├── BACKUP_POLICIES.md              # Retention & frequency policies
│   ├── RECOVERY_TIME_OBJECTIVES.md     # RTO/RPO targets
│   ├── VERIFICATION_PROCEDURES.md      # How to verify backups
│   ├── SECURITY_ARCHITECTURE.md        # Encryption & access control
│   ├── MONITORING_SETUP.md             # Prometheus/Grafana config
│   ├── TROUBLESHOOTING.md              # Common issues & fixes
│   └── MIGRATION_GUIDE.md              # Moving between systems
│
├── templates/
│   ├── backup-status-report.md         # Daily status template
│   ├── recovery-checklist.md           # Step-by-step recovery guide
│   ├── backup-test-results.md          # Test result template
│   └── incident-response.md            # Incident response template
│
└── examples/
    ├── restore-single-database.md      # Restore one database
    ├── restore-from-onedrive.md        # Offsite recovery
    ├── point-in-time-recovery.md       # PITR procedure
    ├── incremental-restore.md          # Incremental recovery
    └── full-system-disaster.md         # Complete system failure
```

## Backup Schedule

### PostgreSQL (Container 404)

| Type | Frequency | Retention | Command |
|------|-----------|-----------|---------|
| Hourly | Every hour | 7 days (168) | `backup_postgresql.sh hourly` |
| Daily | 02:00 UTC | 30 days | `backup_postgresql.sh daily` |
| Weekly | Sun 03:00 UTC | 12 weeks | `backup_postgresql.sh weekly` |

**Cron entries:**
```cron
0 * * * * /opt/zentoria/backup/scripts/backup-postgresql.sh hourly
0 2 * * * /opt/zentoria/backup/scripts/backup-postgresql.sh daily
0 3 * * 0 /opt/zentoria/backup/scripts/backup-postgresql.sh weekly
```

### Redis (Container 410)

| Type | Frequency | Retention | Command |
|------|-----------|-----------|---------|
| RDB Snapshot | Every 6 hours | 7 days | `backup_redis.sh` |
| AOF Backup | Every 6 hours | 7 days | Included |

**Cron entry:**
```cron
0 */6 * * * /opt/zentoria/backup/scripts/backup-redis.sh
```

### Qdrant (Container 419)

| Type | Frequency | Retention | Command |
|------|-----------|-----------|---------|
| Collections | Daily 02:00 | 30 days | `backup_qdrant.sh` |
| Full Cluster | Weekly Sun 03:00 | 12 weeks | Included |

**Cron entry:**
```cron
0 2 * * * /opt/zentoria/backup/scripts/backup-qdrant.sh
```

### MinIO (Container 407)

| Type | Frequency | Retention | Command |
|------|-----------|-----------|---------|
| Bucket Sync | Daily 04:00 | 30 days | `backup_minio.sh` |

**Cron entry:**
```cron
0 4 * * * /opt/zentoria/backup/scripts/backup-minio.sh
```

### n8n Workflows (Container 402)

| Type | Frequency | Retention | Command |
|------|-----------|-----------|---------|
| Workflow Export | Daily 05:00 | 90 days | `backup_n8n.sh` |

**Cron entry:**
```cron
0 5 * * * /opt/zentoria/backup/scripts/backup-n8n.sh
```

### Configuration Files

| Type | Frequency | Retention | Command |
|------|-----------|-----------|---------|
| Config Backup | Daily 06:00 | Forever | `backup_configs.sh` |
| On Change | When modified | Forever | Git commits |

**Cron entry:**
```cron
0 6 * * * /opt/zentoria/backup/scripts/backup-configs.sh
```

### Vault (Container 403)

| Type | Frequency | Retention | Command |
|------|-----------|-----------|---------|
| Snapshot | Daily 01:00 | 30 days | `backup_vault.sh` |

**Cron entry:**
```cron
0 1 * * * /opt/zentoria/backup/scripts/backup-vault.sh
```

## Storage Tiers

### Tier 1: Local Container Storage

**Location:** Each container's local `/opt/zentoria/[service]/backups/`

| Container | Storage | Capacity | Purpose |
|-----------|---------|----------|---------|
| 404 (PostgreSQL) | `/opt/zentoria/db/backups/` | 50 GB | Fast restore for recent backups |
| 410 (Redis) | `/opt/zentoria/redis/backups/` | 10 GB | RDB/AOF snapshots |
| 419 (Qdrant) | `/opt/zentoria/embeddings/snapshots/` | 30 GB | Collection & cluster snapshots |
| 416 (Backup) | `/opt/zentoria/backup/local/` | 100 GB | Consolidated backups |

**Benefits:**
- Fastest restore time (no network latency)
- No dependencies on other services
- Good for recent backups (< 1 week)

### Tier 2: MinIO Object Storage (Container 407)

**Location:** MinIO buckets with replication

| Bucket | Content | Retention | Size |
|--------|---------|-----------|------|
| `backups/postgresql/` | Database dumps | 90 days | ~30 GB |
| `backups/redis/` | RDB/AOF files | 30 days | ~5 GB |
| `backups/qdrant/` | Snapshots | 90 days | ~20 GB |
| `backups/vault/` | Vault snapshots | 30 days | ~1 GB |
| `backups/n8n/` | Workflow exports | 90 days | ~2 GB |
| `backups/configs/` | Config files | Forever | ~500 MB |

**Benefits:**
- Centralized backup repository
- Accessible from all containers
- Versioning and lifecycle policies
- Compression and deduplication

### Tier 3: Offsite Storage (OneDrive via rclone)

**Location:** OneDrive via rclone in Container 416

| Path | Content | Sync | Retention |
|------|---------|------|-----------|
| `Zentoria/Backups/Daily/` | Daily backups | Daily 07:00 | 30 days |
| `Zentoria/Backups/Weekly/` | Weekly backups | Weekly Sun 04:30 | 52 weeks |
| `Zentoria/Backups/Archive/` | Important versions | Manual | Forever |
| `Zentoria/Config/` | Configuration files | On change | Forever |

**Benefits:**
- Geographic redundancy (offsite)
- Protection against data center failure
- Personal cloud storage (OneDrive integration)
- Long-term archival

## Backup Verification

### Automatic Verification

All backup scripts include:

1. **Checksum Verification** (SHA-256)
   ```bash
   sha256sum backup.tar.gz > backup.tar.gz.sha256
   ```

2. **Size Validation**
   ```bash
   if [ ! -s "$backup_file" ]; then
       echo "ERROR: Backup file is empty"
       exit 1
   fi
   ```

3. **Database-Specific Tests**
   - PostgreSQL: Row count verification, schema check
   - Redis: Key count validation, persistence check
   - Qdrant: Collection health, vector count

### Scheduled Verification Tests

| Test | Frequency | Container | Script |
|------|-----------|-----------|--------|
| PostgreSQL restore | Weekly | 416 | `verify-postgresql.sh` |
| Redis restore | Weekly | 416 | `verify-redis.sh` |
| Qdrant restore | Monthly | 416 | `verify-qdrant.sh` |
| Full system | Quarterly | 416 | `test-restore-all.sh` |

### Manual Verification

```bash
# Verify backup integrity
docker-compose exec backup ./scripts/verify-backups.sh

# Test restore to staging
docker-compose exec backup ./scripts/test-restore-postgresql.sh
```

## Disaster Recovery

### Recovery Time Objectives (RTO)

| Scenario | RTO | Procedure |
|----------|-----|-----------|
| Single database | 15 min | Local restore |
| Single container | 30 min | Container rebuild + data restore |
| Multi-container failure | 2 hours | Infrastructure rebuild + multi-restore |
| Data center failure | 24 hours | Provision new infrastructure + offsite restore |

### Recovery Point Objectives (RPO)

| Data Source | RPO |
|-------------|-----|
| PostgreSQL | 1 hour |
| Redis | 6 hours |
| Qdrant | 24 hours |
| MinIO | 24 hours |
| Configs | On-demand |

### Recovery Procedures

Complete step-by-step recovery procedures are in:

1. **Single Container Recovery** → `examples/restore-single-database.md`
2. **Point-in-Time Recovery** → `examples/point-in-time-recovery.md`
3. **Offsite Recovery** → `examples/restore-from-onedrive.md`
4. **Full System Disaster** → `examples/full-system-disaster.md`
5. **Complete Runbook** → `DISASTER_RECOVERY.md`

## Monitoring & Alerts

### Backup Metrics

All backups expose Prometheus metrics:

| Metric | Description |
|--------|-------------|
| `backup_last_run_timestamp` | When last backup ran |
| `backup_duration_seconds` | Backup duration |
| `backup_size_bytes` | Backup file size |
| `backup_success` | 1 if successful, 0 if failed |
| `backup_age_hours` | Hours since last successful backup |

### Alert Rules

```yaml
# Warning: Backup older than retention period
- alert: BackupAgeWarning
  expr: backup_age_hours > 26
  for: 10m
  annotations:
    severity: warning

# Critical: Backup failed or missing
- alert: BackupFailure
  expr: backup_success == 0
  for: 5m
  annotations:
    severity: critical
```

### Grafana Dashboard

Pre-built dashboard showing:
- Backup success/failure rate
- Backup duration trends
- Storage usage by tier
- Recovery point age
- Verification test results

**Import:** `/opt/zentoria/monitoring/grafana/dashboards/backup-dashboard.json`

## Security

### Encryption

- **In-transit:** TLS 1.3 for all network transfers
- **At-rest:** AES-256 encryption via Restic
- **Vault integration:** Encrypted credential storage

### Access Control

| Role | Permissions |
|------|-------------|
| Backup service | Read/write backup directories, execute scripts |
| Application | No direct backup access |
| Admin | Full access via secure key |
| Auditor | Read-only access to logs |

### Credential Management

All credentials stored in HashiCorp Vault:

```
secret/zentoria/backup/
├── postgresql
├── redis
├── qdrant
├── minio
├── vault
├── n8n
├── rclone-onedrive
└── restic-password
```

## Deployment

### Prerequisites

- Docker and Docker Compose installed
- 200+ GB free disk space (local backups)
- OneDrive account for offsite storage
- HashiCorp Vault running (credentials)

### Installation Steps

```bash
# 1. Create backup container
docker-compose -f services/docker-compose.backup.yaml up -d

# 2. Initialize Restic repositories
docker-compose exec backup ./scripts/init-restic-repos.sh

# 3. Configure rclone
docker-compose exec backup rclone config

# 4. Enable cron jobs
docker-compose exec backup crontab /opt/zentoria/backup/config/crontab-backup-416

# 5. Run initial backup
docker-compose exec backup ./scripts/backup-all.sh

# 6. Verify success
docker-compose exec backup ./scripts/verify-backups.sh
```

### Verification

```bash
# Check backup container status
docker-compose ps | grep backup

# Verify backup directory exists
docker-compose exec backup ls -la /opt/zentoria/backup/local/

# Check recent backups
docker-compose exec backup ls -lht /opt/zentoria/backup/local/ | head -20

# View backup logs
docker-compose logs -f backup
```

## Configuration

### Environment Variables

Create `.env` with these backup-specific settings:

```env
# Backup container
BACKUP_CONTAINER_ID=416
BACKUP_RETENTION_HOURLY=168        # 7 days
BACKUP_RETENTION_DAILY=30          # 30 days
BACKUP_RETENTION_WEEKLY=12         # 12 weeks
LOCAL_BACKUP_PATH=/opt/zentoria/backup/local
MINIO_BACKUP_PATH=/opt/zentoria/backup/minio

# Restic
RESTIC_PASSWORD=your-secure-password
RESTIC_REPOSITORY=/opt/zentoria/backup/restic

# rclone
RCLONE_CONFIG_ONEDRIVE_TYPE=microsoft
RCLONE_CONFIG_ONEDRIVE_TOKEN=...

# Notifications
BACKUP_ALERT_EMAIL=admin@zentoria.ai
BACKUP_ALERT_SLACK_WEBHOOK=https://hooks.slack.com/...
```

See `config/env-backup-416.example` for complete template.

## Troubleshooting

### Backup Failed

```bash
# View logs
docker-compose logs backup | tail -50

# Check disk space
docker-compose exec backup df -h

# Verify service connectivity
docker-compose exec backup curl -s http://postgres:5432/health
```

### Restore Issues

See `docs/TROUBLESHOOTING.md` for detailed solutions:

- Database restore errors
- Qdrant collection recovery
- Network timeouts
- Storage permission issues

## Performance Tuning

### Compression Settings

```bash
# Balance between speed and size
# Default: gzip -9 (best compression)
# Fast: gzip -1 (low compression)

export BACKUP_COMPRESSION_LEVEL=6
```

### Parallel Processing

```bash
# Use multiple cores for backup/restore
export BACKUP_PARALLEL_JOBS=4
```

### Storage Optimization

```bash
# Enable MinIO compression
MINIO_COMPRESSION_ENABLE=true
MINIO_COMPRESSION_EXTENSIONS=.sql,.json,.txt

# Enable deduplication
BACKUP_DEDUPLICATE=true
```

## Documentation

- **[DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)** - Complete recovery runbook
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design details
- **[BACKUP_POLICIES.md](./docs/BACKUP_POLICIES.md)** - Retention policies
- **[VERIFICATION_PROCEDURES.md](./docs/VERIFICATION_PROCEDURES.md)** - How to verify
- **[SECURITY_ARCHITECTURE.md](./docs/SECURITY_ARCHITECTURE.md)** - Encryption & access control
- **[MONITORING_SETUP.md](./docs/MONITORING_SETUP.md)** - Prometheus integration
- **[TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Common issues

## Support & Contact

- **Issues:** https://github.com/zentoria/zentoria-mcp/issues
- **Documentation:** https://docs.zentoria.ai/backup
- **Email:** backup-team@zentoria.ai

---

**Last Updated:** January 2026
**Version:** 1.0.0
**Maintainer:** Zentoria Infrastructure Team
