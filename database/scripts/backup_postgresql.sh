#!/bin/bash
# =============================================================================
# Zentoria Personal Edition - PostgreSQL Backup Script
# Container: 404 (zentoria-db)
# Run via cron: 0 * * * * /opt/zentoria/db/scripts/backup_postgresql.sh hourly
# =============================================================================

set -e
set -o pipefail

# =============================================================================
# Configuration
# =============================================================================

BACKUP_TYPE="${1:-hourly}"  # hourly, daily, weekly
BACKUP_BASE_DIR="/opt/zentoria/db/backups"
LOG_FILE="/opt/zentoria/db/logs/backup.log"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_HOURLY=168  # 7 days * 24 hours
RETENTION_DAILY=30
RETENTION_WEEKLY=12

# Database connection (from environment or Vault)
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-}"

# Databases to backup
DATABASES=("zentoria_main" "zentoria_vectors" "n8n")

# MinIO configuration for offsite backup
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

# Check required tools
check_dependencies() {
    command -v pg_dump >/dev/null 2>&1 || error "pg_dump not found"
    command -v gzip >/dev/null 2>&1 || error "gzip not found"
}

# Verify database connection
check_connection() {
    log "Verifying database connection..."
    pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -t 10 >/dev/null 2>&1 || \
        error "Cannot connect to PostgreSQL"
    log "  Connection verified"
}

# Backup a single database
backup_database() {
    local db_name=$1
    local backup_dir="${BACKUP_BASE_DIR}/${BACKUP_TYPE}/${db_name}"
    local backup_file="${backup_dir}/${db_name}_${DATE}.sql.gz"
    local checksum_file="${backup_file}.sha256"

    mkdir -p "$backup_dir"

    log "Backing up database: ${db_name}"

    # pg_dump with custom format for better compression and selective restore
    pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" \
        --format=plain \
        --verbose \
        --no-owner \
        --no-privileges \
        --encoding=UTF8 \
        "$db_name" 2>>"$LOG_FILE" | gzip -9 > "$backup_file"

    # Calculate checksum
    sha256sum "$backup_file" | awk '{print $1}' > "$checksum_file"

    # Get backup size
    local size=$(du -h "$backup_file" | cut -f1)
    log "  Backup complete: ${backup_file} (${size})"

    echo "$backup_file"
}

# Backup globals (roles, tablespaces)
backup_globals() {
    local backup_dir="${BACKUP_BASE_DIR}/${BACKUP_TYPE}/globals"
    local backup_file="${backup_dir}/globals_${DATE}.sql.gz"

    mkdir -p "$backup_dir"

    log "Backing up global objects (roles, tablespaces)..."

    pg_dumpall -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" \
        --globals-only \
        2>>"$LOG_FILE" | gzip -9 > "$backup_file"

    log "  Globals backup complete: ${backup_file}"

    echo "$backup_file"
}

# Upload to MinIO (if configured)
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

    # Configure MinIO client
    mc alias set zentoria "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --api S3v4 >/dev/null 2>&1

    # Upload file
    mc cp "$file" "zentoria/${MINIO_BUCKET}/postgresql/${BACKUP_TYPE}/" 2>>"$LOG_FILE"

    log "  Upload complete"
}

# Clean old backups
cleanup_old_backups() {
    local backup_dir=$1
    local retention=$2

    log "Cleaning backups older than ${retention} runs in ${backup_dir}..."

    if [ -d "$backup_dir" ]; then
        # Find and delete old backups, keeping $retention most recent
        find "$backup_dir" -name "*.sql.gz" -type f | \
            sort -r | \
            tail -n +$((retention + 1)) | \
            while read -r file; do
                log "  Removing: $file"
                rm -f "$file" "${file}.sha256"
            done
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file=$1
    local checksum_file="${backup_file}.sha256"

    log "Verifying backup integrity: ${backup_file}"

    if [ ! -f "$checksum_file" ]; then
        log "  WARNING: Checksum file not found"
        return 1
    fi

    local stored_checksum=$(cat "$checksum_file")
    local computed_checksum=$(sha256sum "$backup_file" | awk '{print $1}')

    if [ "$stored_checksum" = "$computed_checksum" ]; then
        log "  Checksum verified OK"
        return 0
    else
        log "  ERROR: Checksum mismatch!"
        return 1
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

log "============================================="
log "PostgreSQL Backup - ${BACKUP_TYPE}"
log "============================================="

# Pre-flight checks
check_dependencies
check_connection

# Create backup directories
mkdir -p "${BACKUP_BASE_DIR}/${BACKUP_TYPE}"

# Backup each database
BACKUP_FILES=()
for db in "${DATABASES[@]}"; do
    backup_file=$(backup_database "$db")
    BACKUP_FILES+=("$backup_file")

    # Verify backup
    verify_backup "$backup_file"

    # Upload to MinIO
    upload_to_minio "$backup_file"
done

# Backup globals (daily and weekly only)
if [ "$BACKUP_TYPE" != "hourly" ]; then
    globals_file=$(backup_globals)
    BACKUP_FILES+=("$globals_file")
    upload_to_minio "$globals_file"
fi

# Cleanup old backups based on type
case "$BACKUP_TYPE" in
    hourly)
        cleanup_old_backups "${BACKUP_BASE_DIR}/hourly" $RETENTION_HOURLY
        ;;
    daily)
        cleanup_old_backups "${BACKUP_BASE_DIR}/daily" $RETENTION_DAILY
        ;;
    weekly)
        cleanup_old_backups "${BACKUP_BASE_DIR}/weekly" $RETENTION_WEEKLY
        ;;
esac

# Summary
log "============================================="
log "Backup Summary"
log "============================================="
log "Type: ${BACKUP_TYPE}"
log "Databases: ${DATABASES[*]}"
log "Files created: ${#BACKUP_FILES[@]}"
log "Total size: $(du -sh "${BACKUP_BASE_DIR}/${BACKUP_TYPE}" 2>/dev/null | cut -f1 || echo 'N/A')"
log "Status: SUCCESS"
log "============================================="

exit 0
