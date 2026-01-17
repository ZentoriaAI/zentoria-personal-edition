# Zentoria Backup System - Scripts Index

Complete reference for all backup, verification, and recovery scripts.

## Master Scripts

### backup-all.sh
Master orchestrator that manages all backup operations based on schedule or manual trigger.

**Usage:**
```bash
./backup-all.sh [hourly|daily|weekly|full|auto]
```

**Parameters:**
- `hourly` - PostgreSQL hourly + Redis 6h backup
- `daily` - All daily backups (PG daily, Qdrant, MinIO, n8n, configs, Vault)
- `weekly` - PostgreSQL weekly backup
- `full` - Full backup of all sources
- `auto` - Auto-detect based on current time (default)

**Output:**
- Backup files in `/opt/zentoria/backup/local/`
- Log file: `/opt/zentoria/backup/logs/backup_YYYYMMDD_HHMMSS.log`
- Prometheus metrics: `/opt/zentoria/backup/metrics/backup_status.txt`

**Runtime:** ~5-30 minutes depending on data size

**Example:**
```bash
# Run daily backups
./backup-all.sh daily

# Run full backup (all sources)
./backup-all.sh full

# Let cron auto-detect schedule
./backup-all.sh auto
```

---

## Backup Scripts

### backup-postgresql.sh
Creates PostgreSQL database backups with multiple strategies.

**Usage:**
```bash
./backup-postgresql.sh [hourly|daily|weekly|full]
```

**What it backs up:**
- Database: `zentoria_main`, `zentoria_vectors`, `n8n`
- Full cluster backup (including users, roles, permissions)
- WAL archives for Point-in-Time Recovery (PITR)
- Database statistics and metadata

**Output:**
```
/opt/zentoria/backup/local/postgresql/
├── hourly/
│   ├── zentoria_main_20260116_120000.sql.gz
│   ├── zentoria_main_20260116_120000.sql.gz.sha256
│   └── metadata_20260116_120000.json
├── daily/
├── weekly/
└── wal_archive/
    ├── 000000010000000000000001.lz4
    └── wal_archive_20260116.tar.gz
```

**Retention:**
- Hourly: 7 days (168 backups)
- Daily: 30 days
- Weekly: 12 weeks
- WAL archives: 24 hours

**Key Features:**
- Compression: gzip-9 (~10:1 ratio)
- Verification: SHA-256 checksums
- Metadata: JSON backup info
- PITR support: WAL archiving
- Parallel processing: Enabled for large databases

**Performance:**
- Size reduction: 100GB → 10GB (compressed)
- Duration: ~10 minutes for 100GB database
- Network: ~100 MB/s throughput

---

### backup-redis.sh
Creates Redis persistence backups (RDB and AOF).

**Usage:**
```bash
./backup-redis.sh
```

**What it backs up:**
- RDB snapshot (point-in-time)
- AOF transaction log (if enabled)
- Redis configuration
- Keyspace statistics

**Output:**
```
/opt/zentoria/backup/local/redis/
├── rdb/
│   ├── dump_20260116_000000.rdb
│   └── dump_20260116_000000.rdb.sha256
├── aof/
│   ├── appendonly_20260116_000000.aof
│   ├── appendonly_20260116_000000.aof.tar.gz
│   └── aof_archive_20260116.tar.gz
└── metadata/
    └── redis_stats_20260116.json
```

**Retention:**
- RDB: 7 days
- AOF: 7 days
- Backups: Every 6 hours

**Key Features:**
- RDB backup during operation (non-blocking)
- AOF backup with compression
- Redis Insight export (optional)
- Key count statistics

---

### backup-qdrant.sh
Creates Qdrant vector database snapshots.

**Usage:**
```bash
./backup-qdrant.sh [daily|full]
```

**What it backs up:**
- Collection snapshots (all collections)
- Full cluster snapshot (Raft state)
- Vector metadata
- Collection configuration

**Output:**
```
/opt/zentoria/backup/local/qdrant/
├── collections/
│   ├── documents_20260116.snapshot
│   ├── chat_history_20260116.snapshot
│   ├── code_20260116.snapshot
│   └── knowledge_20260116.snapshot
├── full/
│   └── cluster_20260116.snapshot
└── metadata/
    └── qdrant_status_20260116.json
```

**Retention:**
- Daily: 30 days
- Full: 12 weeks

**Key Features:**
- Per-collection snapshots
- Full cluster snapshots (Sundays)
- Vector count tracking
- Collection health checks

---

### backup-minio.sh
Syncs MinIO buckets for offsite backup aggregation.

**Usage:**
```bash
./backup-minio.sh [daily|full]
```

**What it backs up:**
- All MinIO bucket contents
- Backup bucket versioning
- Object metadata
- Access logs

**Output:**
```
/opt/zentoria/backup/local/minio/
├── backups/
│   ├── postgresql/
│   ├── redis/
│   └── qdrant/
└── metadata/
    └── minio_inventory.json
```

**Retention:**
- Daily sync: 30 days
- Lifecycle: 90 days in MinIO

---

### backup-n8n.sh
Exports n8n workflows and credentials.

**Usage:**
```bash
./backup-n8n.sh
```

**What it backs up:**
- Workflow definitions (JSON)
- Execution history
- Credentials (encrypted)
- Settings and configuration

**Output:**
```
/opt/zentoria/backup/local/n8n/
├── workflows/
│   ├── workflow_001.json
│   ├── workflow_002.json
│   └── workflows_20260116.json
└── metadata/
    └── n8n_status_20260116.json
```

**Retention:**
- Workflows: 90 days

---

### backup-configs.sh
Backs up all configuration files across the system.

**Usage:**
```bash
./backup-configs.sh
```

**What it backs up:**
- Docker Compose files
- NGINX configuration
- PostgreSQL configuration
- Redis configuration
- Qdrant configuration
- Environment files (.env)
- Vault configuration
- Terraform files

**Output:**
```
/opt/zentoria/backup/local/configs/
├── docker/
├── nginx/
├── postgresql/
├── redis/
├── qdrant/
└── all_configs_20260116.tar.gz
```

**Retention:**
- Forever (configs rarely change)
- Tracked in Git for version control

---

### backup-vault.sh
Creates HashiCorp Vault snapshots for secrets backup.

**Usage:**
```bash
./backup-vault.sh
```

**What it backs up:**
- Vault Raft state
- Secrets and policies
- Auth methods
- Audit logs

**Output:**
```
/opt/zentoria/backup/local/vault/
├── snapshots/
│   ├── vault_20260116_010000.snapshot
│   └── vault_20260116_010000.snapshot.sha256
└── metadata/
    └── vault_status_20260116.json
```

**Retention:**
- Daily: 30 days

---

## Verification Scripts

### verify-backups.sh
Master verification script that tests all backup types.

**Usage:**
```bash
./verify-backups.sh [all|postgresql|redis|qdrant|minio|n8n]
```

**What it verifies:**
- File existence and size
- SHA-256 checksums
- Gzip integrity
- Database connectivity
- Restore capability (sample)

**Output:**
```
[PASS] ✓ File exists and is not empty: zentoria_main_20260116.sql.gz (10GB)
[PASS] ✓ Checksum verified: zentoria_main_20260116.sql.gz
[PASS] ✓ Gzip integrity verified: zentoria_main_20260116.sql.gz
[PASS] ✓ PostgreSQL connection successful
```

**Exit codes:**
- 0 = All verifications passed
- 1 = One or more verifications failed

---

### verify-postgresql.sh (implied by verify-backups.sh)
Detailed PostgreSQL backup verification.

**Checks:**
- Backup file integrity
- Checksum validation
- Compressed file integrity
- Database restore capability
- Row count comparison
- Schema validation

---

### verify-redis.sh (implied by verify-backups.sh)
Redis backup verification.

**Checks:**
- RDB file format
- AOF file validity
- Data integrity
- Compression verification

---

### verify-qdrant.sh (implied by verify-backups.sh)
Qdrant snapshot verification.

**Checks:**
- Snapshot file format
- Collection metadata
- Vector count validation
- Snapshot restore capability

---

## Recovery/Restore Scripts

### test-restore-postgresql.sh
Automated PostgreSQL restore test to verify recoverability.

**Usage:**
```bash
./test-restore-postgresql.sh
```

**Process:**
1. Find latest backup
2. Create temporary test database
3. Restore backup
4. Verify data integrity
5. Compare with production
6. Log results
7. Clean up

**Output:**
```
[INFO] Testing restore of: zentoria_main_20260116_020000.sql.gz
[INFO] Creating temporary database: zentoria_main_test
[INFO] Restoring backup...
[PASS] ✓ Restore successful
[INFO] Verifying data integrity...
[PASS] ✓ Row counts match production
[PASS] ✓ Schemas validated
[PASS] ✓ Restore test successful
```

**Runtime:** ~5-15 minutes

---

### test-restore-redis.sh
Redis restore capability testing.

**Process:**
1. Backup current RDB
2. Restore from backup to test instance
3. Verify key count
4. Compare data samples
5. Restore original

---

### test-restore-qdrant.sh
Qdrant snapshot recovery testing.

**Process:**
1. List available snapshots
2. Restore to test collection
3. Verify vector count
4. Validate embeddings
5. Clean up test data

---

### test-restore-all.sh
Full system restore test (quarterly).

**Process:**
1. Backup all current data
2. Restore PostgreSQL to test database
3. Restore Redis to test instance
4. Restore Qdrant collections
5. Run application health checks
6. Verify all systems functional
7. Log detailed results
8. Restore to previous state

---

### restore-postgresql.sh
Live PostgreSQL restoration from backup (production use).

**Usage:**
```bash
./restore-postgresql.sh /path/to/backup.sql.gz [database_name]
```

**Process:**
1. Verify backup integrity
2. Stop dependent services
3. Drop and recreate database
4. Restore from backup
5. Restart services
6. Verify health

---

### restore-redis.sh
Live Redis restoration from backup.

**Usage:**
```bash
./restore-redis.sh /path/to/dump.rdb
```

---

### restore-qdrant.sh
Live Qdrant collection restoration.

**Usage:**
```bash
./restore-qdrant.sh /path/to/snapshot.snapshot
```

---

### restore-all.sh
Complete system restoration from backups.

**Usage:**
```bash
./restore-all.sh [--from-local|--from-minio|--from-onedrive]
```

---

## Maintenance Scripts

### prune-old-backups.sh
Removes old backups according to retention policy.

**Usage:**
```bash
./prune-old-backups.sh
```

**What it removes:**
- PostgreSQL hourly > 7 days
- PostgreSQL daily > 30 days
- PostgreSQL weekly > 84 days
- Redis RDB > 7 days
- Qdrant snapshots > 90 days
- Empty directories

---

### sync-to-onedrive.sh
Syncs backups to Microsoft OneDrive for offsite storage.

**Usage:**
```bash
./sync-to-onedrive.sh [daily|weekly]
```

**Process:**
1. Verify rclone connectivity
2. Upload recent backups
3. Verify checksums on remote
4. Apply lifecycle policies
5. Log sync results

---

### health-check.sh
Reports backup system health status.

**Usage:**
```bash
./health-check.sh
```

**Output:**
```
Backup System Health Report
===========================
PostgreSQL: HEALTHY (last backup: 2h ago)
Redis: HEALTHY (last backup: 6h ago)
Qdrant: HEALTHY (last backup: 24h ago)
MinIO: HEALTHY (1.2TB available)
OneDrive: CONNECTED (last sync: 1h ago)

Disk Usage:
Local: 150GB / 500GB (30%)
MinIO: 200GB / 1000GB (20%)

Next Scheduled Backups:
PostgreSQL hourly: in 15 minutes
Redis: in 5h 45m
Qdrant: tomorrow at 02:00
```

---

### init-restic-repos.sh
Initializes Restic repositories for deduplication backup.

**Usage:**
```bash
./init-restic-repos.sh
```

**Creates:**
- Restic repository structure
- Encryption keys
- Backend storage
- Initial backup metadata

---

### collect-metrics.sh
Collects Prometheus metrics for monitoring.

**Usage:**
```bash
./collect-metrics.sh
```

**Metrics collected:**
- Last backup timestamp
- Backup duration
- Backup size
- Success/failure status
- Storage usage
- Verification results

---

### update-db-stats.sh
Updates database statistics for capacity planning.

**Usage:**
```bash
./update-db-stats.sh
```

**Collects:**
- Database sizes
- Table counts
- Index usage
- Growth trends

---

## Utility Scripts

### send-status-email.sh
Sends backup status reports via email.

**Usage:**
```bash
./send-status-email.sh admin@zentoria.ai
```

---

### export-metrics.sh
Exports metrics for Prometheus scraping.

**Usage:**
```bash
./export-metrics.sh
```

---

## Quick Reference

### Daily Operations

```bash
# Run all daily backups manually
./backup-all.sh daily

# Verify backup integrity
./verify-backups.sh all

# Check health
./health-check.sh

# Sync to OneDrive
./sync-to-onedrive.sh daily
```

### Recovery Operations

```bash
# Test PostgreSQL restore
./test-restore-postgresql.sh

# Perform actual restore
./restore-postgresql.sh /opt/zentoria/backup/local/postgresql/daily/latest.sql.gz

# Full system restore
./restore-all.sh --from-onedrive
```

### Maintenance

```bash
# Clean up old backups
./prune-old-backups.sh

# Verify all backups
./verify-backups.sh all

# Update statistics
./update-db-stats.sh
```

---

**Last Updated:** January 2026
**Version:** 1.0.0
