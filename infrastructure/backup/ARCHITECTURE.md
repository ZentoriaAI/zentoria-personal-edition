# Zentoria Backup System Architecture

Technical design and architecture of the comprehensive backup and disaster recovery infrastructure.

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       ZENTORIA BACKUP ARCHITECTURE                       │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ SOURCE SYSTEMS (14 Containers)                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [404]          [410]          [419]          [407]                    │
│ PostgreSQL      Redis          Qdrant         MinIO                    │
│ ~100GB          ~10GB          ~30GB          ~100GB                   │
│                                                                         │
│  [402]          [403]          [401]                                   │
│  n8n            Vault          Ollama                                  │
│  Workflows      Secrets        AI Models                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
         │              │              │              │
         └──────────────┼──────────────┼──────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKUP ORCHESTRATION (Container 416)                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Backup Scripts & Schedulers                                    │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │  • backup-all.sh (Master orchestrator)                         │   │
│  │  • backup-postgresql.sh (Hourly/Daily/Weekly)                 │   │
│  │  • backup-redis.sh (Every 6 hours)                            │   │
│  │  • backup-qdrant.sh (Daily snapshots)                         │   │
│  │  • backup-minio.sh (Daily sync)                               │   │
│  │  • backup-n8n.sh (Daily workflows)                            │   │
│  │  • backup-configs.sh (On-demand)                              │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Scheduling & Orchestration                                     │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │  • Cron jobs (hourly, daily, weekly)                           │   │
│  │  • Systemd timers (alternative)                               │   │
│  │  • n8n workflow automation                                    │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Verification & Testing                                         │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │  • verify-backups.sh (Integrity checks)                        │   │
│  │  • test-restore-*.sh (Recovery testing)                        │   │
│  │  • Checksum validation (SHA-256)                              │   │
│  │  • Size validation                                            │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
         │
         └─────────────────┬──────────────────┬──────────────────┐
                           │                  │                  │
                           ↓                  ↓                  ↓
┌────────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ TIER 1: LOCAL      │  │ TIER 2: OBJECT  │  │ TIER 3: OFFSITE │
│ STORAGE            │  │ STORAGE (MinIO) │  │ (OneDrive/rclone)
├────────────────────┤  ├─────────────────┤  ├─────────────────┤
│                    │  │                 │  │                 │
│ Container 416:     │  │ Container 407:  │  │ Microsoft 365:  │
│ /opt/zentoria/     │  │ /minio/data/    │  │ Zentoria/       │
│  backup/local/     │  │  backups/       │  │ Backups/        │
│                    │  │                 │  │                 │
│ • PostgreSQL       │  │ • PostgreSQL    │  │ • Daily Full    │
│ • Redis RDB/AOF    │  │ • Redis RDB/AOF │  │ • Weekly Incr   │
│ • Qdrant snapshots │  │ • Qdrant        │  │ • Archive       │
│ • Vault snapshots  │  │ • Vault         │  │ • Config        │
│ • n8n workflows    │  │ • n8n workflows │  │                 │
│ • Config files     │  │ • Configs       │  │ Sync hourly     │
│                    │  │                 │  │ at 07:00        │
│ Storage: 100+ GB   │  │ Storage: 200+ GB   │ Storage:        │
│ Access: Direct     │  │ Access: Network    │ Unlimited       │
│ Retention: < 30d   │  │ Retention: 90d     │ Retention:      │
│ Speed: Fastest     │  │ Speed: Fast        │ Forever         │
│                    │  │                    │ Speed: Slow     │
└────────────────────┘  └─────────────────┘  └─────────────────┘
```

## Data Flow

### Backup Data Flow

```
SOURCE (DB/Redis/etc)
    ↓
BACKUP SCRIPT
    ├─ Dump/Export data
    ├─ Compress (gzip-9)
    ├─ Generate checksum (SHA-256)
    └─ Create metadata
    ↓
┌─────────────────────────┐
│ TIER 1: LOCAL STORAGE   │
│ /opt/zentoria/backup/   │
│ local/                  │
└─────────────────────────┘
    ↓
SYNC PROCESS (rclone/s3cmd)
    ↓
┌─────────────────────────┐
│ TIER 2: MINIO BUCKETS   │
│ backups/[service]/      │
└─────────────────────────┘
    ↓
SYNC PROCESS (rclone)
    ↓
┌─────────────────────────┐
│ TIER 3: ONEDRIVE        │
│ Zentoria/Backups/       │
│ Daily/ or Weekly/       │
└─────────────────────────┘
```

### Recovery Data Flow

```
TIER 3: ONEDRIVE
    ↓
RCLONE DOWNLOAD
    ↓
TIER 2: MINIO
    ↓
DIRECT MINIO ACCESS (Container 416)
    ↓
├─ VERIFY CHECKSUM
├─ VERIFY INTEGRITY (gzip -t)
└─ VERIFY METADATA
    ↓
RESTORE PROCESS
    ├─ Decompress
    ├─ Parse dump/export
    └─ Replay into database
    ↓
TARGET (Recovered DB)
    ↓
VERIFICATION
    ├─ Row count comparison
    ├─ Schema validation
    ├─ Data integrity checks
    └─ Application health
```

## Storage Architecture

### Tier 1: Local Container Storage

**Purpose:** Fast restore for recent backups
**Technology:** Container filesystem (ext4/btrfs)
**Location:** Each source container's `/opt/zentoria/[service]/backups/`

```
/opt/zentoria/backup/local/
├── postgresql/
│   ├── hourly/           (168 backups, 7 days)
│   │   ├── zentoria_main_20260116_120000.sql.gz
│   │   ├── zentoria_main_20260116_120000.sql.gz.sha256
│   │   └── metadata_20260116_120000.json
│   ├── daily/            (30 backups, 30 days)
│   ├── weekly/           (12 backups, 12 weeks)
│   └── wal_archive/      (WAL files for PITR)
├── redis/
│   ├── rdb/              (RDB snapshots)
│   ├── aof/              (AOF transaction logs)
│   └── metadata/
├── qdrant/
│   ├── collections/      (Collection snapshots)
│   ├── full/             (Full cluster snapshots)
│   └── metadata/
├── vault/
│   ├── snapshots/        (Vault Raft snapshots)
│   └── metadata/
├── n8n/
│   ├── workflows/        (Workflow JSON exports)
│   └── metadata/
└── logs/
    ├── backup_*.log
    └── verify_*.log
```

**Retention Policy:**
- Hourly: 7 days (168 backups)
- Daily: 30 days
- Weekly: 12 weeks (84 days)
- WAL: 24 hours

**Cleanup Strategy:**
```bash
# Run daily at 23:00
find /opt/zentoria/backup/local -name "*.sql.gz" -mtime +7 -delete
find /opt/zentoria/backup/local -name "*.rdb" -mtime +7 -delete
```

### Tier 2: Object Storage (MinIO)

**Purpose:** Centralized backup repository with versioning
**Technology:** MinIO (S3-compatible)
**Location:** Container 407, bucket `backups/`

```
minio:
  backups/
    postgresql/
      ├── zentoria_main/
      │   ├── 20260116_hourly/
      │   ├── 20260116_daily/
      │   └── 20260116_weekly/
      ├── zentoria_vectors/
      ├── n8n/
      └── metadata.json
    redis/
      ├── dump_20260116.rdb
      ├── dump_20260116.rdb.sha256
      └── aof_archive_20260116.tar.gz
    qdrant/
      ├── collections_20260116.snapshot
      ├── collections_20260116.snapshot.sha256
      └── full_cluster_20260116.snapshot
    vault/
      ├── snapshot_20260116.raft
      └── snapshot_20260116.raft.sha256
    n8n/
      ├── workflows_20260116.json
      └── workflows_20260116.json.sha256
    configs/
      ├── all_configs_20260116.tar.gz
      └── all_configs_20260116.tar.gz.sha256
```

**Features:**
- Automatic versioning (keep 30 days)
- Lifecycle policies (delete old versions)
- Replication across storage nodes
- Access control via IAM policies

**Lifecycle Policy:**
```json
{
  "Rules": [
    {
      "Filter": {"Prefix": "backups/"},
      "Expiration": {"Days": 90},
      "NoncurrentVersionExpiration": {"NoncurrentDays": 30}
    }
  ]
}
```

### Tier 3: Offsite Storage (OneDrive via rclone)

**Purpose:** Geographic redundancy and long-term archival
**Technology:** Microsoft OneDrive with rclone
**Location:** `Zentoria/Backups/`

```
Zentoria/
├── Backups/
│   ├── Daily/
│   │   ├── 20260116/
│   │   │   ├── postgresql_20260116_020000.sql.gz
│   │   │   ├── redis_20260116_060000.rdb
│   │   │   ├── qdrant_20260116_020000.snapshot
│   │   │   └── metadata.json
│   │   └── 20260115/
│   ├── Weekly/
│   │   ├── 2026-week-03/
│   │   └── 2026-week-02/
│   └── Archive/
│       ├── 2026-01-01/
│       └── 2025-12-01/
├── Config/
│   ├── docker-compose.yaml
│   ├── nginx.conf
│   └── postgresql.conf
└── Documentation/
    ├── runbooks/
    └── architecture/
```

**Sync Schedule:**
- Daily backups: Sync at 07:00 UTC
- Weekly backups: Sync Sundays at 04:30 UTC
- Configs: Sync on change via Git
- Archive: Manual

**Storage Strategy:**
- Daily backups: Keep 30 days
- Weekly backups: Keep 52 weeks (1 year)
- Archive: Keep forever
- Configs: Keep forever

## Backup Technologies

### Compression

**PostgreSQL:**
```bash
# Gzip compression level 9 (best compression)
pg_dump | gzip -9
# Ratio: ~10:1 (100GB → 10GB)
# Speed: ~100 MB/s
```

**Redis:**
```bash
# RDB file is pre-compressed
# AOF logs compressed with gzip-9
tar czf aof_archive.tar.gz appendonly.aof
```

**Qdrant:**
```bash
# Snapshot files are binary
# Compressed with gzip-9 before storage
gzip -9 snapshot.snapshot
```

### Checksums

All backups include SHA-256 checksums:

```bash
# Generate during backup
sha256sum backup.sql.gz > backup.sql.gz.sha256

# Verify before restore
sha256sum -c backup.sql.gz.sha256
```

### Encryption

**In-Transit Encryption:**
- TLS 1.3 for all network transfers
- rclone encryption flag: `--crypt`
- Credentials stored in HashiCorp Vault

**At-Rest Encryption:**
- MinIO: Server-side encryption (optional)
- OneDrive: Microsoft encryption
- Restic: AES-256 encryption

### Deduplication

**Strategy:**
- Restic for deduplication (Content-Defined Chunking)
- MinIO versioning for point-in-time recovery

```bash
# Restic repository setup
restic init -r /opt/zentoria/backup/restic/

# Restic backup with deduplication
restic -r /opt/zentoria/backup/restic/ backup /opt/zentoria/
```

## Scheduling Strategy

### Cron Schedule

```cron
# PostgreSQL Backups
0 * * * * /opt/zentoria/backup/scripts/backup-postgresql.sh hourly >> /opt/zentoria/backup/logs/cron.log 2>&1
0 2 * * * /opt/zentoria/backup/scripts/backup-postgresql.sh daily >> /opt/zentoria/backup/logs/cron.log 2>&1
0 3 * * 0 /opt/zentoria/backup/scripts/backup-postgresql.sh weekly >> /opt/zentoria/backup/logs/cron.log 2>&1

# Redis Backups (every 6 hours)
0 */6 * * * /opt/zentoria/backup/scripts/backup-redis.sh >> /opt/zentoria/backup/logs/cron.log 2>&1

# Qdrant Daily Backup (02:00 UTC)
0 2 * * * /opt/zentoria/backup/scripts/backup-qdrant.sh >> /opt/zentoria/backup/logs/cron.log 2>&1

# MinIO Sync (04:00 UTC)
0 4 * * * /opt/zentoria/backup/scripts/backup-minio.sh >> /opt/zentoria/backup/logs/cron.log 2>&1

# n8n Workflows (05:00 UTC)
0 5 * * * /opt/zentoria/backup/scripts/backup-n8n.sh >> /opt/zentoria/backup/logs/cron.log 2>&1

# Config Backup (06:00 UTC)
0 6 * * * /opt/zentoria/backup/scripts/backup-configs.sh >> /opt/zentoria/backup/logs/cron.log 2>&1

# Vault Backup (01:00 UTC)
0 1 * * * /opt/zentoria/backup/scripts/backup-vault.sh >> /opt/zentoria/backup/logs/cron.log 2>&1

# Verification (07:00 UTC daily, 14:00 UTC Sunday)
0 7 * * * /opt/zentoria/backup/scripts/verify-backups.sh >> /opt/zentoria/backup/logs/cron.log 2>&1
0 14 * * 0 /opt/zentoria/backup/scripts/test-restore-postgresql.sh >> /opt/zentoria/backup/logs/cron.log 2>&1

# Sync to OneDrive (07:00 UTC daily, 04:30 UTC Sunday)
0 7 * * * /opt/zentoria/backup/scripts/sync-to-onedrive.sh daily >> /opt/zentoria/backup/logs/cron.log 2>&1
30 4 * * 0 /opt/zentoria/backup/scripts/sync-to-onedrive.sh weekly >> /opt/zentoria/backup/logs/cron.log 2>&1

# Cleanup old backups (23:00 UTC daily)
0 23 * * * /opt/zentoria/backup/scripts/prune-old-backups.sh >> /opt/zentoria/backup/logs/cron.log 2>&1

# Backup status report (08:00 UTC daily)
0 8 * * * /opt/zentoria/backup/scripts/health-check.sh >> /opt/zentoria/backup/logs/cron.log 2>&1
```

### Backup Timeline

```
00:00 ─ Daily start
01:00 ─ Vault snapshot backup
02:00 ─ PostgreSQL daily backup + Qdrant daily backup
04:00 ─ MinIO bucket sync
05:00 ─ n8n workflow export
06:00 ─ Config file backup
07:00 ─ Verification (PostgreSQL + Redis)
      ─ OneDrive daily sync
08:00 ─ Backup status report
...
Every 6 hours ─ Redis RDB/AOF backup
Every hour ─ PostgreSQL hourly backup
23:00 ─ Cleanup old backups

Sunday additionally:
03:00 ─ PostgreSQL weekly backup
04:30 ─ OneDrive weekly sync
14:00 ─ Full restore test (all systems)
```

## Monitoring & Observability

### Prometheus Metrics

```prometheus
# Backup metrics
backup_last_run_timestamp{service="postgresql", type="hourly"}
backup_duration_seconds{service="postgresql", type="daily"}
backup_size_bytes{service="redis", type="rdb"}
backup_success{service="qdrant", type="snapshot"}
backup_age_hours{service="postgresql"}
backup_files_count{location="local", service="all"}

# Storage metrics
backup_storage_used_bytes{tier="local"}
backup_storage_used_bytes{tier="minio"}
backup_storage_used_bytes{tier="onedrive"}
backup_storage_free_bytes{location="/opt/zentoria/backup/local"}

# Verification metrics
backup_verify_success{service="postgresql"}
backup_verify_duration_seconds{service="redis"}
backup_restore_test_success{service="qdrant"}
backup_checksum_failures{service="all"}

# Performance metrics
backup_compression_ratio{service="postgresql"}
backup_network_throughput_bytes{direction="upload", destination="minio"}
```

### Alert Rules

```yaml
groups:
  - name: backup_alerts
    rules:
      - alert: BackupFailed
        expr: backup_success == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Backup failed for {{ $labels.service }}"

      - alert: BackupOlderThanRPO
        expr: backup_age_hours > 25
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.service }} backup older than RPO"

      - alert: BackupStorageFull
        expr: backup_storage_free_bytes < 10737418240  # 10GB
        for: 30m
        labels:
          severity: critical
        annotations:
          summary: "Backup storage running out of space"

      - alert: RestoreTestFailed
        expr: backup_restore_test_success == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Recovery test failed for {{ $labels.service }}"
```

### Grafana Dashboards

**Backup Health Dashboard:**
- Backup success/failure rate (24h rolling)
- Backup duration trends (7d)
- Storage usage by tier (pie chart)
- Recovery point age (gauge)
- Verification test results (status)

**Storage Capacity Dashboard:**
- Local storage usage timeline
- MinIO bucket breakdown
- OneDrive usage trend
- Compression ratio by service

**Disaster Recovery Dashboard:**
- RTO/RPO targets vs actual
- Recovery test results (last 30 days)
- Backup coverage (% of data backed up)
- Verification pass rate

## Performance Tuning

### Backup Parallelization

```bash
# PostgreSQL: Use pg_dump with --jobs flag
pg_dump --jobs 4 --format=directory zentoria_main

# Redis: Use multiple AOF rewrite processes
CONFIG SET save "900 1 300 10 60 10000"

# Qdrant: Parallel snapshot per collection
parallel-snapshot-enabled = true
parallel-workers = 4
```

### Network Optimization

```bash
# rclone: Parallel uploads to MinIO
rclone copy --transfers 8 --checkers 8 local-backups:/ minio:backups/

# Compression level: Trade-off speed vs size
# Level 1: 10 min, 50GB compression
# Level 6: 20 min, 15GB compression
# Level 9: 30 min, 10GB compression
```

### Disk I/O Optimization

```bash
# Use separate disks for backup source and destination
# Enable compression in filesystem (if supported)
# Monitor I/O patterns and adjust schedule during off-peak

# Reduce duplicate writes during backup
ionice -c 3 nice -n 19 backup-all.sh  # Low priority I/O and CPU
```

## Security Architecture

### Credential Management

All credentials stored in HashiCorp Vault:

```
secret/zentoria/backup/
├── postgresql
│   ├── username
│   ├── password
│   └── connection_string
├── redis
│   ├── password
│   └── host_port
├── qdrant
│   ├── api_key
│   └── host_port
├── minio
│   ├── access_key
│   ├── secret_key
│   └── endpoint
├── onedrive
│   ├── client_id
│   ├── client_secret
│   └── refresh_token
└── restic
    ├── password
    ├── repository_path
    └── s3_credentials
```

### Access Control

| Role | Permissions | Scope |
|------|-------------|-------|
| Backup Service | Read/write backups | Container 416 only |
| Application | None | Blocked from backup access |
| Admin | Full access | With MFA |
| Auditor | Read-only | Log viewing only |

---

**Last Updated:** January 2026
**Version:** 1.0.0
