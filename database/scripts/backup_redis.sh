#!/bin/bash
# =============================================================================
# Zentoria Personal Edition - Redis Backup Script
# Container: 410 (zentoria-redis)
# Run via cron: 0 */6 * * * /opt/zentoria/redis/scripts/backup_redis.sh
# =============================================================================

set -e
set -o pipefail

# =============================================================================
# Configuration
# =============================================================================

BACKUP_BASE_DIR="/opt/zentoria/redis/backups"
LOG_FILE="/opt/zentoria/redis/logs/backup.log"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_DATA_DIR="${REDIS_DATA_DIR:-/var/lib/redis}"

# MinIO configuration
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://zentoria-files:9000}"
MINIO_BUCKET="${MINIO_BUCKET:-backups}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-}"

# =============================================================================
# Functions
# =============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    log "ERROR: $1"
    exit 1
}

# Build redis-cli command with authentication
redis_cmd() {
    local cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
    if [ -n "$REDIS_PASSWORD" ]; then
        cmd="$cmd -a $REDIS_PASSWORD"
    fi
    echo "$cmd"
}

# Check Redis connection
check_connection() {
    log "Verifying Redis connection..."
    local cmd=$(redis_cmd)
    if ! $cmd PING 2>/dev/null | grep -q "PONG"; then
        error "Cannot connect to Redis"
    fi
    log "  Connection verified"
}

# Trigger RDB save
trigger_bgsave() {
    log "Triggering BGSAVE..."
    local cmd=$(redis_cmd)

    # Get last save time before
    local last_save_before=$($cmd LASTSAVE)

    # Trigger background save
    $cmd BGSAVE >/dev/null 2>&1

    # Wait for save to complete (max 5 minutes)
    local wait_time=0
    local max_wait=300
    while [ $wait_time -lt $max_wait ]; do
        local last_save_after=$($cmd LASTSAVE)
        if [ "$last_save_after" != "$last_save_before" ]; then
            log "  BGSAVE completed"
            return 0
        fi
        sleep 5
        wait_time=$((wait_time + 5))
        log "  Waiting for BGSAVE... (${wait_time}s)"
    done

    log "  WARNING: BGSAVE timeout, proceeding with existing dump"
}

# Copy RDB file
backup_rdb() {
    local backup_dir="${BACKUP_BASE_DIR}/rdb"
    local backup_file="${backup_dir}/dump_${DATE}.rdb"
    local checksum_file="${backup_file}.sha256"
    local source_file="${REDIS_DATA_DIR}/dump.rdb"

    mkdir -p "$backup_dir"

    log "Backing up RDB file..."

    if [ ! -f "$source_file" ]; then
        log "  WARNING: RDB file not found at ${source_file}"
        return 1
    fi

    # Copy RDB file
    cp "$source_file" "$backup_file"

    # Compress
    gzip -9 "$backup_file"
    backup_file="${backup_file}.gz"

    # Calculate checksum
    sha256sum "$backup_file" | awk '{print $1}' > "${backup_file}.sha256"

    local size=$(du -h "$backup_file" | cut -f1)
    log "  RDB backup complete: ${backup_file} (${size})"

    echo "$backup_file"
}

# Backup AOF file (if enabled)
backup_aof() {
    local backup_dir="${BACKUP_BASE_DIR}/aof"
    local aof_dir="${REDIS_DATA_DIR}/appendonlydir"

    if [ ! -d "$aof_dir" ]; then
        log "AOF not enabled or directory not found, skipping"
        return 0
    fi

    mkdir -p "$backup_dir"

    log "Backing up AOF files..."

    # Create tarball of AOF directory
    local backup_file="${backup_dir}/aof_${DATE}.tar.gz"
    tar -czf "$backup_file" -C "$REDIS_DATA_DIR" appendonlydir 2>/dev/null

    # Calculate checksum
    sha256sum "$backup_file" | awk '{print $1}' > "${backup_file}.sha256"

    local size=$(du -h "$backup_file" | cut -f1)
    log "  AOF backup complete: ${backup_file} (${size})"

    echo "$backup_file"
}

# Get Redis info for backup metadata
get_redis_info() {
    local backup_dir="${BACKUP_BASE_DIR}"
    local info_file="${backup_dir}/redis_info_${DATE}.txt"
    local cmd=$(redis_cmd)

    log "Collecting Redis info..."

    {
        echo "Zentoria Redis Backup - ${DATE}"
        echo "================================"
        echo ""
        echo "Server Info:"
        $cmd INFO server 2>/dev/null
        echo ""
        echo "Memory Info:"
        $cmd INFO memory 2>/dev/null
        echo ""
        echo "Keyspace Info:"
        $cmd INFO keyspace 2>/dev/null
        echo ""
        echo "Persistence Info:"
        $cmd INFO persistence 2>/dev/null
    } > "$info_file"

    log "  Info collected: ${info_file}"

    echo "$info_file"
}

# Upload to MinIO
upload_to_minio() {
    local file=$1

    if [ -z "$MINIO_ACCESS_KEY" ] || [ -z "$MINIO_SECRET_KEY" ]; then
        log "  MinIO not configured, skipping offsite upload"
        return 0
    fi

    if ! command -v mc >/dev/null 2>&1; then
        log "  WARNING: MinIO client (mc) not found, skipping upload"
        return 0
    fi

    log "  Uploading to MinIO: ${file}"

    mc alias set zentoria "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --api S3v4 >/dev/null 2>&1
    mc cp "$file" "zentoria/${MINIO_BUCKET}/redis/" 2>>"$LOG_FILE"

    log "  Upload complete"
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning backups older than ${RETENTION_DAYS} days..."

    find "$BACKUP_BASE_DIR" -name "*.rdb.gz" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find "$BACKUP_BASE_DIR" -name "*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find "$BACKUP_BASE_DIR" -name "*.sha256" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find "$BACKUP_BASE_DIR" -name "redis_info_*.txt" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

    log "  Cleanup complete"
}

# Verify backup integrity
verify_backup() {
    local backup_file=$1
    local checksum_file="${backup_file}.sha256"

    if [ ! -f "$checksum_file" ]; then
        log "  WARNING: Checksum file not found for ${backup_file}"
        return 1
    fi

    local stored=$(cat "$checksum_file")
    local computed=$(sha256sum "$backup_file" | awk '{print $1}')

    if [ "$stored" = "$computed" ]; then
        log "  Checksum verified: ${backup_file}"
        return 0
    else
        log "  ERROR: Checksum mismatch for ${backup_file}"
        return 1
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

log "============================================="
log "Redis Backup"
log "============================================="

# Pre-flight checks
check_connection

# Create backup directory
mkdir -p "$BACKUP_BASE_DIR"

# Trigger background save
trigger_bgsave

# Backup RDB
rdb_file=$(backup_rdb)
if [ -n "$rdb_file" ]; then
    verify_backup "$rdb_file"
    upload_to_minio "$rdb_file"
fi

# Backup AOF (if enabled)
aof_file=$(backup_aof)
if [ -n "$aof_file" ]; then
    verify_backup "$aof_file"
    upload_to_minio "$aof_file"
fi

# Collect Redis info
info_file=$(get_redis_info)
upload_to_minio "$info_file"

# Cleanup
cleanup_old_backups

# Summary
log "============================================="
log "Backup Summary"
log "============================================="
log "RDB: ${rdb_file:-N/A}"
log "AOF: ${aof_file:-N/A}"
log "Info: ${info_file}"
log "Total backup size: $(du -sh "$BACKUP_BASE_DIR" 2>/dev/null | cut -f1 || echo 'N/A')"
log "Status: SUCCESS"
log "============================================="

exit 0
