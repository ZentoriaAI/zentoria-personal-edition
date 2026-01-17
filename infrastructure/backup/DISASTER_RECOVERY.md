# Zentoria Personal Edition - Disaster Recovery Runbook

Complete step-by-step procedures for recovering from various failure scenarios.

## Table of Contents

1. [Recovery Overview](#recovery-overview)
2. [Prerequisites](#prerequisites)
3. [Single Container Failure](#single-container-failure)
4. [Single Database Recovery](#single-database-recovery)
5. [Point-in-Time Recovery (PITR)](#point-in-time-recovery)
6. [Full System Disaster](#full-system-disaster)
7. [Verification & Rollback](#verification-and-rollback)
8. [Post-Recovery Steps](#post-recovery-steps)
9. [Troubleshooting](#troubleshooting)

---

## Recovery Overview

### Recovery Time Objectives (RTO)

| Scenario | RTO | Effort |
|----------|-----|--------|
| Single database | 15 min | Low |
| Single container | 30 min | Medium |
| Multi-container | 2 hours | High |
| Data center failure | 24 hours | Very High |

### Recovery Point Objectives (RPO)

| Component | RPO | Backup Frequency |
|-----------|-----|------------------|
| PostgreSQL | 1 hour | Hourly + daily WAL |
| Redis | 6 hours | Every 6 hours |
| Qdrant | 24 hours | Daily |
| MinIO | 24 hours | Daily |
| Configs | On demand | On change |

### Backup Locations

| Tier | Location | Access | Speed |
|------|----------|--------|-------|
| Local | Container filesystem | Direct | Fastest |
| Object Storage | MinIO buckets | Network | Fast |
| Offsite | OneDrive | Internet | Slowest |

---

## Prerequisites

Before starting any recovery:

```bash
# 1. Verify backup container is accessible
docker-compose ps | grep backup

# 2. Check available backups
docker-compose exec backup ls -la /opt/zentoria/backup/local/

# 3. Verify connectivity to all services
docker-compose ps

# 4. Check disk space on all containers
docker-compose exec postgres df -h /
docker-compose exec redis df -h /
docker-compose exec qdrant df -h /

# 5. Get database credentials from Vault
docker-compose exec vault vault read secret/zentoria/backup/postgresql
```

---

## Single Container Failure

### Scenario: PostgreSQL Container (404) Crashes

**RTO:** 30 minutes | **RPO:** 1 hour

### Step 1: Stop and Remove Failed Container

```bash
# Stop the failed container
docker-compose stop postgres

# Backup its data volume (optional, for forensics)
docker run --rm -v postgres_data:/data -v /backup:/backup alpine \
    tar czf /backup/postgres_data_backup.tar.gz -C /data .

# Remove container
docker-compose rm postgres
```

### Step 2: Restore Container from Image

```bash
# Start fresh PostgreSQL container (new volume)
docker-compose up -d postgres

# Wait for it to initialize
sleep 30

# Verify it's running
docker-compose exec postgres pg_isready -U postgres
```

### Step 3: Restore from Latest Backup

```bash
# Find latest backup
LATEST_BACKUP=$(ls -t /opt/zentoria/backup/local/postgresql/daily/*.sql.gz | head -1)

# Verify checksum
sha256sum -c "${LATEST_BACKUP}.sha256"

# Restore database
gunzip < "${LATEST_BACKUP}" | \
    docker-compose exec -T postgres psql -U postgres

# Verify restoration
docker-compose exec postgres psql -U postgres -d zentoria_main -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')"
```

### Step 4: Verify Data Integrity

```bash
# Check row counts in critical tables
docker-compose exec postgres psql -U postgres zentoria_main <<EOF
SELECT schemaname, COUNT(*) as table_count
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname;
EOF

# Check for errors
docker-compose logs postgres | grep -i error | tail -20
```

### Step 5: Restart Dependent Services

```bash
# Restart services that depend on database
docker-compose restart n8n
docker-compose restart zentoria-backend

# Verify health
curl http://localhost:8000/health
```

---

## Single Database Recovery

### Scenario: Corrupted Table in Production Database

**RTO:** 15 minutes | **RPO:** 1 hour

### Option A: Restore Single Table

```bash
# 1. Get the latest backup
BACKUP_FILE="/opt/zentoria/backup/local/postgresql/daily/zentoria_main_20260116.sql.gz"

# 2. Create temporary database
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE zentoria_main_temp"

# 3. Restore to temporary database
gunzip < "${BACKUP_FILE}" | \
    docker-compose exec -T postgres psql -U postgres -d zentoria_main_temp

# 4. Extract specific table
docker-compose exec postgres pg_dump -U postgres -t public.corrupted_table \
    -d zentoria_main_temp | \
    docker-compose exec -T postgres psql -U postgres -d zentoria_main

# 5. Verify table
docker-compose exec postgres psql -U postgres -d zentoria_main \
    -c "SELECT COUNT(*) FROM public.corrupted_table"

# 6. Drop temporary database
docker-compose exec postgres psql -U postgres -c "DROP DATABASE zentoria_main_temp"
```

### Option B: Full Database Restore

```bash
# 1. Verify backup file
ls -lh /opt/zentoria/backup/local/postgresql/daily/zentoria_main*.sql.gz

# 2. Stop application
docker-compose stop zentoria-backend n8n

# 3. Drop and recreate database
docker-compose exec postgres psql -U postgres <<EOF
DROP DATABASE IF EXISTS zentoria_main;
CREATE DATABASE zentoria_main OWNER zentoria;
EOF

# 4. Restore from backup
BACKUP_FILE=$(ls -t /opt/zentoria/backup/local/postgresql/daily/zentoria_main*.sql.gz | head -1)
gunzip < "${BACKUP_FILE}" | \
    docker-compose exec -T postgres psql -U postgres -d zentoria_main

# 5. Restart application
docker-compose start zentoria-backend n8n

# 6. Verify
curl http://localhost:8000/health
```

---

## Point-in-Time Recovery (PITR)

### Scenario: User Accidentally Deletes Records at 14:30, Discovered at 15:00

**RTO:** 45 minutes | **RPO:** Seconds (with WAL)

### Prerequisites

PostgreSQL must have WAL archiving enabled:

```bash
# Check WAL configuration
docker-compose exec postgres psql -U postgres -c "SHOW wal_archiving"
docker-compose exec postgres psql -U postgres -c "SHOW wal_archive_command"
```

### Recovery Steps

```bash
# 1. Determine recovery target time (14:29:59, before deletion)
RECOVERY_TARGET_TIME="2026-01-16 14:29:59"

# 2. Stop application
docker-compose stop zentoria-backend

# 3. Create recovery database
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE zentoria_main_recovery"

# 4. Get latest backup before target time
BACKUP_FILE=$(find /opt/zentoria/backup/local/postgresql/daily \
    -name "*.sql.gz" -newermt "2026-01-16 00:00" | sort | tail -1)

# 5. Restore base backup
gunzip < "${BACKUP_FILE}" | \
    docker-compose exec -T postgres psql -U postgres -d zentoria_main_recovery

# 6. Apply WAL archives up to recovery target
# Copy WAL files to recovery directory
mkdir -p /tmp/pg_wal_recovery
cp /opt/zentoria/backup/local/postgresql/wal_*/*.lz4 /tmp/pg_wal_recovery/

# 7. Create recovery configuration
docker-compose exec postgres bash <<'EOF'
cat > /tmp/recovery.conf <<RECOVERYCFG
recovery_target_time = '2026-01-16 14:29:59'
recovery_target_timeline = 'latest'
recovery_target_action = 'pause'
restore_command = 'cp /opt/zentoria/backup/wal_archive/%f "%p"'
RECOVERYCFG
EOF

# 8. Perform PITR
docker-compose exec postgres pg_basebackup -D /tmp/pitr_data \
    -X stream -P

# 9. Verify recovered data
docker-compose exec postgres psql -U postgres -d zentoria_main_recovery \
    -c "SELECT MAX(created_at) FROM deleted_records_table"

# 10. If good, swap databases
docker-compose exec postgres psql -U postgres <<EOF
ALTER DATABASE zentoria_main RENAME TO zentoria_main_old;
ALTER DATABASE zentoria_main_recovery RENAME TO zentoria_main;
EOF

# 11. Restart application
docker-compose start zentoria-backend

# 12. Verify
curl http://localhost:8000/health
```

---

## Full System Disaster

### Scenario: Data Center Failure, All Containers Lost

**RTO:** 24 hours | **RPO:** 24 hours

### Phase 1: Infrastructure Rebuild

```bash
# 1. On new host, clone repository
git clone https://github.com/zentoria/zentoria-mcp.git
cd zentoria-mcp/infrastructure/docker

# 2. Create network
docker network create zentoria --subnet 172.20.0.0/16

# 3. Deploy essential infrastructure
docker-compose -f services/docker-compose.db.yaml up -d
docker-compose -f services/docker-compose.redis.yaml up -d
docker-compose -f services/docker-compose.vault.yaml up -d
docker-compose -f services/docker-compose.backup.yaml up -d

# 4. Wait for services to initialize
sleep 60

# 5. Verify connectivity
docker-compose exec postgres pg_isready -U postgres
docker-compose exec redis redis-cli ping
docker-compose exec vault vault status
```

### Phase 2: Restore Data Tier

```bash
# 1. Retrieve backups from OneDrive
docker-compose exec backup rclone ls zentoria-onedrive:Zentoria/Backups/Daily/

# 2. Download latest backup set
docker-compose exec backup bash <<'EOF'
cd /opt/zentoria/backup/restore

# Download PostgreSQL backup
rclone copy zentoria-onedrive:Zentoria/Backups/Daily/postgresql/latest/ . \
    --include "*.sql.gz" --include "*.sha256"

# Download Redis backup
rclone copy zentoria-onedrive:Zentoria/Backups/Daily/redis/ . \
    --include "*.rdb" --include "*.aof"

# Download Qdrant backup
rclone copy zentoria-onedrive:Zentoria/Backups/Daily/qdrant/ . \
    --include "*.snapshot"

# Download configuration
rclone copy zentoria-onedrive:Zentoria/Config/ ./configs/
EOF

# 3. Restore PostgreSQL
LATEST_PG=$(ls -t /opt/zentoria/backup/restore/*.sql.gz | head -1)
docker-compose exec -T postgres psql -U postgres < \
    <(gunzip < "${LATEST_PG}")

# 4. Restore Redis
docker-compose exec backup bash <<'EOF'
docker-compose exec -T redis bash -c \
    "cp /opt/zentoria/backup/restore/dump.rdb /data/dump.rdb && \
     redis-cli --rdb /data/dump.rdb"
EOF

# 5. Restore Qdrant
docker-compose exec backup bash <<'EOF'
LATEST_QDRANT=$(ls -t /opt/zentoria/backup/restore/*.snapshot | head -1)
curl -X POST "http://qdrant:6333/collections/documents/snapshots/recover" \
    -H "Content-Type: application/json" \
    -d "{\"location\": \"${LATEST_QDRANT}\"}"
EOF

# 6. Restore Vault
docker-compose exec backup bash <<'EOF'
LATEST_VAULT=$(ls -t /opt/zentoria/backup/restore/vault_*.snapshot | head -1)
docker-compose exec vault vault operator raft snapshot restore "${LATEST_VAULT}"
EOF
```

### Phase 3: Restore Application Tier

```bash
# 1. Deploy application containers
docker-compose -f services/docker-compose.n8n.yaml up -d
docker-compose -f services/docker-compose.ai.yaml up -d
docker-compose -f services/docker-compose.embeddings.yaml up -d

# 2. Restore configuration files
docker-compose exec backup bash <<'EOF'
cd /opt/zentoria/backup/restore/configs
for config in $(find . -type f); do
    target_path="/opt/zentoria/$(echo $config | sed 's|^\./||')"
    mkdir -p "$(dirname "$target_path")"
    cp "$config" "$target_path"
done
EOF

# 3. Restore n8n workflows
docker-compose exec n8n bash <<'EOF'
cd /opt/n8n/backups
for workflow in *.json; do
    curl -X POST http://localhost:5678/api/v1/workflows \
        -H "Content-Type: application/json" \
        -d @"$workflow"
done
EOF

# 4. Deploy proxy/load balancer
docker-compose -f services/docker-compose.proxy.yaml up -d

# 5. Deploy monitoring stack
docker-compose -f services/docker-compose.logs.yaml up -d
```

### Phase 4: Verification

```bash
# 1. Health checks
docker-compose ps
docker-compose exec postgres pg_isready -U postgres
docker-compose exec redis redis-cli ping
curl http://localhost:8000/health

# 2. Data verification
docker-compose exec postgres psql -U postgres zentoria_main \
    -c "SELECT COUNT(*) as table_count FROM information_schema.tables"

# 3. Application tests
curl -X GET http://localhost/api/health
curl -X GET http://localhost:5678/api/v1/workflows

# 4. Data integrity checks
docker-compose exec backup ./scripts/verify-backups.sh

# 5. Check monitoring
curl http://localhost:9090/api/v1/alerts
curl http://localhost:3000/api/health
```

---

## Verification and Rollback

### Post-Recovery Verification

```bash
# 1. Database verification
./scripts/verify-backups.sh

# 2. Application health
docker-compose exec postgres psql -U postgres -d zentoria_main <<EOF
SELECT schemaname, COUNT(*) as table_count
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname;

SELECT tablename, pg_size_pretty(pg_total_relation_size('public.'||tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC
LIMIT 10;
EOF

# 3. Check for errors
docker-compose logs --since 30m | grep -i error

# 4. Test critical workflows
curl -X POST http://localhost:8000/api/test
```

### Quick Rollback Procedures

If recovery fails or causes issues:

```bash
# 1. Switch to previous backup
PREVIOUS_BACKUP=$(ls -t /opt/zentoria/backup/local/postgresql/daily/*.sql.gz | head -2 | tail -1)

docker-compose exec postgres psql -U postgres <<EOF
DROP DATABASE zentoria_main;
CREATE DATABASE zentoria_main OWNER zentoria;
EOF

gunzip < "${PREVIOUS_BACKUP}" | \
    docker-compose exec -T postgres psql -U postgres -d zentoria_main

# 2. Restart application
docker-compose restart zentoria-backend

# 3. Verify
curl http://localhost:8000/health
```

---

## Post-Recovery Steps

### After Successful Recovery

```bash
# 1. Create new backup immediately
docker-compose exec backup ./scripts/backup-all.sh full

# 2. Document what happened
cat > /opt/zentoria/docs/incidents/incident_$(date +%Y%m%d_%H%M%S).md <<EOF
# Incident Report

## Timeline
- Failure detected: $(date)
- Recovery started: $(date)
- Recovery completed: $(date)
- RTO achieved: X minutes

## Root cause
[Describe what failed]

## Actions taken
1. [Action 1]
2. [Action 2]
3. [Action 3]

## Prevention
[How to prevent this in future]

## Testing improvements
[What testing was added]
EOF

# 3. Notify monitoring
curl -X POST http://localhost:9090/-/reload

# 4. Update DNS/load balancer if needed
# (Specific to your infrastructure)

# 5. Communication
echo "Recovery completed successfully at $(date)" | \
    mail -s "Zentoria Recovery Complete" admin@zentoria.ai

# 6. Schedule post-mortem
# Team review meeting 24 hours after recovery
```

### Lessons Learned

```bash
# 1. Update runbooks based on what was learned
# 2. Add monitoring for issues that weren't caught
# 3. Improve backup frequency if RPO was exceeded
# 4. Practice recovery procedures more frequently
# 5. Update disaster recovery tests
```

---

## Troubleshooting

### Issue: PostgreSQL Won't Start After Restore

```bash
# Solution:
# 1. Check PostgreSQL logs
docker-compose logs postgres | tail -100

# 2. Verify disk space
docker-compose exec postgres df -h /

# 3. Check permissions
docker-compose exec postgres ls -la /var/lib/postgresql/

# 4. Force recovery
docker-compose exec postgres postgres --recovery-init

# 5. Rebuild from backup
docker-compose down postgres
docker volume rm postgres_data
docker-compose up -d postgres
```

### Issue: Redis Corruption After Restore

```bash
# Solution:
# 1. Check Redis logs
docker-compose logs redis | tail -100

# 2. Validate RDB file
docker-compose exec redis redis-cli --rdb /tmp/dump.rdb

# 3. Rebuild from older backup
docker-compose exec backup ls -lrt /opt/zentoria/backup/local/redis/*.rdb

# 4. Restore from earlier backup
```

### Issue: Qdrant Collections Missing After Restore

```bash
# Solution:
# 1. List available snapshots
docker-compose exec backup ls -la /opt/zentoria/backup/local/qdrant/

# 2. Check backup integrity
docker-compose exec backup ./scripts/verify-qdrant.sh

# 3. Restore from MinIO
docker-compose exec backup rclone ls zentoria-minio:backups/qdrant/

# 4. Manual recovery
curl -X GET http://qdrant:6333/collections
```

### Issue: Data Integrity Problems After Recovery

```bash
# Solution:
# 1. Run comprehensive checks
docker-compose exec backup ./scripts/verify-backups.sh

# 2. Compare with older backup
LATEST=$(ls -t /opt/zentoria/backup/local/postgresql/daily/*.sql.gz | head -1)
PREVIOUS=$(ls -t /opt/zentoria/backup/local/postgresql/daily/*.sql.gz | head -2 | tail -1)

# 3. Restore from clean backup
gunzip < "${PREVIOUS}" | \
    docker-compose exec -T postgres psql -U postgres -d zentoria_main_test

# 4. Compare data
docker-compose exec postgres psql -U postgres <<EOF
SELECT table_name, row_count
FROM (
    SELECT tablename as table_name, n_live_tup as row_count
    FROM pg_stat_user_tables
) AS stats
ORDER BY row_count DESC;
EOF
```

---

## Emergency Contacts

In case of extended outage:

- **On-call Engineer:** contact@zentoria.ai
- **Infrastructure Team:** infrastructure@zentoria.ai
- **Emergency Line:** +1-XXX-XXX-XXXX

## Testing Schedule

- **Monthly:** Single container recovery test
- **Quarterly:** Full system disaster recovery drill
- **Annually:** Multi-site failover test

---

**Last Updated:** January 2026
**Version:** 1.0.0
**Next Drill:** February 2026
