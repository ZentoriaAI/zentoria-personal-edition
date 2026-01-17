# Zentoria Personal Edition - Backup & Replication Strategy

## Overview

This document defines the comprehensive backup and disaster recovery strategy for all Zentoria databases.

---

## 1. Backup Schedule

### 1.1 PostgreSQL (Container 404)

| Type   | Frequency       | Retention            | Command                       |
| ------ | --------------- | -------------------- | ----------------------------- |
| Hourly | Every hour      | 7 days (168 backups) | `backup_postgresql.sh hourly` |
| Daily  | 02:00 AM        | 30 days              | `backup_postgresql.sh daily`  |
| Weekly | Sunday 03:00 AM | 12 weeks             | `backup_postgresql.sh weekly` |

**Crontab entries:**

```cron
# PostgreSQL Backups
0 * * * * /opt/zentoria/db/scripts/backup_postgresql.sh hourly
0 2 * * * /opt/zentoria/db/scripts/backup_postgresql.sh daily
0 3 * * 0 /opt/zentoria/db/scripts/backup_postgresql.sh weekly
```

**Databases backed up:**

- `zentoria_main` - Core application data
- `zentoria_vectors` - AI embeddings (pgvector)
- `n8n` - Workflow data

### 1.2 Redis (Container 410)

| Type         | Frequency     | Retention | Command                     |
| ------------ | ------------- | --------- | --------------------------- |
| RDB Snapshot | Every 6 hours | 7 days    | `backup_redis.sh`           |
| AOF Backup   | Every 6 hours | 7 days    | Included in backup_redis.sh |

**Crontab entries:**

```cron
# Redis Backups
0 */6 * * * /opt/zentoria/redis/scripts/backup_redis.sh
```

**Redis persistence settings:**

```conf
save 900 1       # After 900s if 1+ key changed
save 300 10      # After 300s if 10+ keys changed
save 60 10000    # After 60s if 10000+ keys changed
appendonly yes
appendfsync everysec
```

### 1.3 Qdrant (Container 419)

| Type                  | Frequency       | Retention | Command                      |
| --------------------- | --------------- | --------- | ---------------------------- |
| Collection Snapshots  | Daily 02:00 AM  | 30 days   | `backup_qdrant.sh`           |
| Full Cluster Snapshot | Weekly (Sunday) | 12 weeks  | Included in backup_qdrant.sh |

**Crontab entries:**

```cron
# Qdrant Backups
0 2 * * * /opt/zentoria/embeddings/scripts/backup_qdrant.sh
```

**Collections backed up:**

- `documents` - Document embeddings
- `chat_history` - Conversation embeddings
- `code` - Code embeddings
- `knowledge` - Knowledge base embeddings

---

## 2. Backup Storage Tiers

### 2.1 Local Storage (Tier 1)

**Location:** Each container's local filesystem

| Container                 | Path                                         | Capacity |
| ------------------------- | -------------------------------------------- | -------- |
| zentoria-db (404)         | `/opt/zentoria/db/backups/`                  | 50 GB    |
| zentoria-redis (410)      | `/opt/zentoria/redis/backups/`               | 10 GB    |
| zentoria-embeddings (419) | `/opt/zentoria/embeddings/qdrant/snapshots/` | 30 GB    |

**Purpose:** Fast restore for recent backups

### 2.2 Object Storage (Tier 2)

**Location:** MinIO (Container 407)

| Bucket                | Content          | Retention |
| --------------------- | ---------------- | --------- |
| `backups/postgresql/` | PostgreSQL dumps | 90 days   |
| `backups/redis/`      | Redis RDB/AOF    | 30 days   |
| `backups/qdrant/`     | Qdrant snapshots | 90 days   |

**Purpose:** Centralized backup storage, accessible from all containers

### 2.3 Offsite Storage (Tier 3)

**Location:** OneDrive via rclone (Container 416)

| Path                       | Content        | Sync Frequency   |
| -------------------------- | -------------- | ---------------- |
| `Zentoria/Backups/Daily/`  | Daily backups  | Daily at 04:00   |
| `Zentoria/Backups/Weekly/` | Weekly backups | Weekly on Sunday |

**Purpose:** Disaster recovery, offsite protection

---

## 3. Backup Verification

### 3.1 Automatic Verification

All backup scripts include:

- **Checksum verification** (SHA-256)
- **Size validation** (non-empty check)
- **Integrity tests** (database-specific)

### 3.2 Scheduled Verification Tests

| Test                    | Frequency | Container             | Script                    |
| ----------------------- | --------- | --------------------- | ------------------------- |
| PostgreSQL restore test | Weekly    | zentoria-backup (416) | `verify_pg_backup.sh`     |
| Redis restore test      | Weekly    | zentoria-backup (416) | `verify_redis_backup.sh`  |
| Qdrant restore test     | Monthly   | zentoria-backup (416) | `verify_qdrant_backup.sh` |

**Verification process:**

1. Restore backup to isolated test database
2. Run integrity checks (row counts, checksums)
3. Compare with production metrics
4. Log results and alert on failure

---

## 4. Recovery Procedures

### 4.1 PostgreSQL Recovery

**Point-in-Time Recovery (PITR):**

```bash
# Stop application
ssh zentoria-backend "systemctl stop zentoria-api"

# Restore from backup
pg_restore -h localhost -U postgres -d zentoria_main_recovery \
    /opt/zentoria/db/backups/daily/zentoria_main/zentoria_main_20260116.sql.gz

# Verify data
psql -h localhost -U postgres -d zentoria_main_recovery \
    -c "SELECT COUNT(*) FROM core.users"

# Swap databases
psql -h localhost -U postgres -c "
    ALTER DATABASE zentoria_main RENAME TO zentoria_main_old;
    ALTER DATABASE zentoria_main_recovery RENAME TO zentoria_main;
"

# Restart application
ssh zentoria-backend "systemctl start zentoria-api"
```

**Single table recovery:**

```bash
# Extract specific table from backup
pg_restore -h localhost -U postgres -t files.items \
    -d zentoria_main /opt/zentoria/db/backups/daily/zentoria_main.dump
```

### 4.2 Redis Recovery

**Full restore from RDB:**

```bash
# Stop Redis
systemctl stop redis

# Replace dump file
cp /opt/zentoria/redis/backups/rdb/dump_20260116.rdb /var/lib/redis/dump.rdb

# Start Redis
systemctl start redis
```

**AOF recovery:**

```bash
# Stop Redis
systemctl stop redis

# Extract AOF backup
tar -xzf /opt/zentoria/redis/backups/aof/aof_20260116.tar.gz -C /var/lib/redis/

# Start Redis
systemctl start redis
```

### 4.3 Qdrant Recovery

**Collection restore:**

```bash
# Restore single collection
curl -X POST "http://localhost:6333/collections/documents/snapshots/recover" \
    -H "Content-Type: application/json" \
    -d '{
        "location": "/opt/zentoria/embeddings/qdrant/snapshots/documents/documents_20260116.snapshot"
    }'
```

**Full cluster restore:**

```bash
# Stop Qdrant
systemctl stop qdrant

# Replace storage directory
rm -rf /opt/zentoria/embeddings/qdrant/storage/*
tar -xzf /opt/zentoria/embeddings/backups/full_20260116.snapshot.gz \
    -C /opt/zentoria/embeddings/qdrant/storage/

# Start Qdrant
systemctl start qdrant
```

---

## 5. Replication Strategy

### 5.1 PostgreSQL Replication

**For personal edition:** Streaming replication is optional but recommended for high availability.

**Configuration (if enabled):**

```conf
# postgresql.conf (primary)
wal_level = replica
max_wal_senders = 3
wal_keep_size = 1GB
synchronous_commit = on
```

```conf
# recovery.conf (replica)
primary_conninfo = 'host=zentoria-db port=5432 user=replicator'
```

### 5.2 Redis Replication

**For personal edition:** Not required (single node).

**If enabling replica:**

```conf
# redis.conf (replica)
replicaof zentoria-redis 6379
masterauth <password>
```

### 5.3 Qdrant Replication

**For personal edition:** Single node, replication factor = 1.

**If scaling to cluster:**

```json
{
    "replication_factor": 2,
    "write_consistency_factor": 1
}
```

---

## 6. Disaster Recovery Plan

### 6.1 RTO/RPO Targets

| Scenario                 | RTO      | RPO      |
| ------------------------ | -------- | -------- |
| Single container failure | 15 min   | 1 hour   |
| Host server failure      | 2 hours  | 1 hour   |
| Data center failure      | 24 hours | 24 hours |

### 6.2 Recovery Steps

**Complete system recovery:**

1. **Provision new infrastructure**
   
   - Create new Proxmox containers from templates
   - Configure networking and DNS

2. **Restore data tier** (Containers 404, 410, 419)
   
   ```bash
   # PostgreSQL
   ./restore_postgresql.sh /backups/daily/latest
   
   # Redis
   ./restore_redis.sh /backups/redis/latest
   
   # Qdrant
   ./restore_qdrant.sh /backups/qdrant/latest
   ```

3. **Restore application tier** (Containers 400, 401, 402)
   
   - Deploy containers from git/images
   - Update configuration to point to new data tier

4. **Verify services**
   
   - Run health checks on all endpoints
   - Verify data integrity
   - Test authentication flow

5. **Update DNS/proxy**
   
   - Point traffic to new infrastructure
   - Monitor for errors

### 6.3 Runbook Location

Detailed runbooks available at:

- Wiki.js: `https://docs.zentoria.local/runbooks/disaster-recovery`
- Local: `/opt/zentoria/docs/runbooks/disaster-recovery.md`

---

## 7. Monitoring & Alerts

### 7.1 Backup Monitoring

| Metric              | Warning    | Critical    |
| ------------------- | ---------- | ----------- |
| Backup age (hourly) | > 2 hours  | > 6 hours   |
| Backup age (daily)  | > 26 hours | > 48 hours  |
| Backup size change  | > 50%      | > 80%       |
| Backup failure      | 1 failure  | 2+ failures |

### 7.2 Alert Channels

- **Prometheus/Grafana:** Dashboard for backup metrics
- **n8n workflow:** Sends email/push on backup failure
- **Log aggregation:** Loki collects all backup logs

### 7.3 Grafana Dashboard

Import dashboard from: `/opt/zentoria/docs/grafana/backup-dashboard.json`

Panels:

- Backup success/failure rate
- Backup duration trends
- Storage usage by tier
- Recovery point age

---

## 8. Security Considerations

### 8.1 Backup Encryption

```bash
# Encrypt backup before offsite upload
gpg --symmetric --cipher-algo AES256 backup.sql.gz

# Decrypt when needed
gpg --decrypt backup.sql.gz.gpg > backup.sql.gz
```

### 8.2 Access Control

| Role                   | Access                           |
| ---------------------- | -------------------------------- |
| Backup service account | Read/write to backup directories |
| Application service    | No direct backup access          |
| Admin                  | Full access for recovery         |

### 8.3 Credential Management

All backup credentials stored in HashiCorp Vault:

- `secret/zentoria/backup/postgres`
- `secret/zentoria/backup/redis`
- `secret/zentoria/backup/minio`
- `secret/zentoria/backup/onedrive`
