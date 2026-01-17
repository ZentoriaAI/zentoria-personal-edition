#!/bin/bash
# =============================================================================
# Zentoria Personal Edition - Qdrant Backup Script
# Container: 419 (zentoria-embeddings)
# Run via cron: 0 2 * * * /opt/zentoria/embeddings/scripts/backup_qdrant.sh
# =============================================================================

set -e
set -o pipefail

# =============================================================================
# Configuration
# =============================================================================

BACKUP_BASE_DIR="/opt/zentoria/embeddings/qdrant/snapshots"
LOG_FILE="/opt/zentoria/embeddings/logs/backup.log"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Qdrant configuration
QDRANT_HOST="${QDRANT_HOST:-localhost}"
QDRANT_PORT="${QDRANT_PORT:-6333}"
QDRANT_URL="http://${QDRANT_HOST}:${QDRANT_PORT}"

# Collections to backup
COLLECTIONS=("documents" "chat_history" "code" "knowledge")

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

# Check Qdrant connection
check_connection() {
    log "Verifying Qdrant connection..."
    if ! curl -s "${QDRANT_URL}/healthz" | grep -q "ok"; then
        error "Cannot connect to Qdrant at ${QDRANT_URL}"
    fi
    log "  Connection verified"
}

# Get collection info
get_collection_info() {
    local collection=$1
    local info=$(curl -s "${QDRANT_URL}/collections/${collection}")

    if echo "$info" | grep -q '"status":"error"'; then
        log "  WARNING: Collection ${collection} not found"
        return 1
    fi

    local points_count=$(echo "$info" | grep -o '"points_count":[0-9]*' | head -1 | cut -d: -f2)
    log "  Collection ${collection}: ${points_count:-0} points"

    return 0
}

# Create snapshot for a collection
create_snapshot() {
    local collection=$1
    local snapshot_dir="${BACKUP_BASE_DIR}/${collection}"

    mkdir -p "$snapshot_dir"

    log "Creating snapshot for collection: ${collection}"

    # Trigger snapshot creation
    local response=$(curl -s -X POST "${QDRANT_URL}/collections/${collection}/snapshots")

    if echo "$response" | grep -q '"status":"error"'; then
        log "  ERROR: Failed to create snapshot for ${collection}"
        log "  Response: ${response}"
        return 1
    fi

    # Extract snapshot name
    local snapshot_name=$(echo "$response" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$snapshot_name" ]; then
        log "  ERROR: Could not extract snapshot name"
        return 1
    fi

    log "  Snapshot created: ${snapshot_name}"

    # Download snapshot
    local local_file="${snapshot_dir}/${collection}_${DATE}.snapshot"
    curl -s "${QDRANT_URL}/collections/${collection}/snapshots/${snapshot_name}" -o "$local_file"

    # Verify download
    if [ ! -s "$local_file" ]; then
        log "  ERROR: Downloaded snapshot is empty"
        rm -f "$local_file"
        return 1
    fi

    # Compress
    gzip -9 "$local_file"
    local_file="${local_file}.gz"

    # Calculate checksum
    sha256sum "$local_file" | awk '{print $1}' > "${local_file}.sha256"

    local size=$(du -h "$local_file" | cut -f1)
    log "  Downloaded and compressed: ${local_file} (${size})"

    # Delete snapshot from Qdrant server (cleanup)
    curl -s -X DELETE "${QDRANT_URL}/collections/${collection}/snapshots/${snapshot_name}" >/dev/null

    echo "$local_file"
}

# Create full cluster snapshot (all collections)
create_full_snapshot() {
    log "Creating full cluster snapshot..."

    local response=$(curl -s -X POST "${QDRANT_URL}/snapshots")

    if echo "$response" | grep -q '"status":"error"'; then
        log "  ERROR: Failed to create full snapshot"
        return 1
    fi

    local snapshot_name=$(echo "$response" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    log "  Full snapshot created: ${snapshot_name}"

    # Download full snapshot
    local local_file="${BACKUP_BASE_DIR}/full_${DATE}.snapshot"
    curl -s "${QDRANT_URL}/snapshots/${snapshot_name}" -o "$local_file"

    # Compress
    gzip -9 "$local_file"
    local_file="${local_file}.gz"

    # Checksum
    sha256sum "$local_file" | awk '{print $1}' > "${local_file}.sha256"

    local size=$(du -h "$local_file" | cut -f1)
    log "  Full snapshot: ${local_file} (${size})"

    # Cleanup server-side snapshot
    curl -s -X DELETE "${QDRANT_URL}/snapshots/${snapshot_name}" >/dev/null

    echo "$local_file"
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
    mc cp "$file" "zentoria/${MINIO_BUCKET}/qdrant/" 2>>"$LOG_FILE"

    log "  Upload complete"
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning backups older than ${RETENTION_DAYS} days..."

    find "$BACKUP_BASE_DIR" -name "*.snapshot.gz" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find "$BACKUP_BASE_DIR" -name "*.sha256" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

    log "  Cleanup complete"
}

# Verify backup integrity
verify_backup() {
    local backup_file=$1
    local checksum_file="${backup_file}.sha256"

    if [ ! -f "$checksum_file" ]; then
        log "  WARNING: Checksum file not found"
        return 1
    fi

    local stored=$(cat "$checksum_file")
    local computed=$(sha256sum "$backup_file" | awk '{print $1}')

    if [ "$stored" = "$computed" ]; then
        log "  Checksum verified: ${backup_file}"
        return 0
    else
        log "  ERROR: Checksum mismatch"
        return 1
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

log "============================================="
log "Qdrant Backup"
log "============================================="

# Pre-flight checks
check_connection

# Create backup directory
mkdir -p "$BACKUP_BASE_DIR"

# Get collection info
log "Collection status:"
for collection in "${COLLECTIONS[@]}"; do
    get_collection_info "$collection" || true
done

# Backup each collection
BACKUP_FILES=()
for collection in "${COLLECTIONS[@]}"; do
    if snapshot_file=$(create_snapshot "$collection"); then
        BACKUP_FILES+=("$snapshot_file")
        verify_backup "$snapshot_file"
        upload_to_minio "$snapshot_file"
    fi
done

# Create full snapshot (weekly on Sundays)
if [ "$(date +%u)" = "7" ]; then
    log "Sunday - creating full cluster snapshot"
    if full_snapshot=$(create_full_snapshot); then
        BACKUP_FILES+=("$full_snapshot")
        verify_backup "$full_snapshot"
        upload_to_minio "$full_snapshot"
    fi
fi

# Cleanup
cleanup_old_backups

# Summary
log "============================================="
log "Backup Summary"
log "============================================="
log "Collections backed up: ${#BACKUP_FILES[@]}"
for file in "${BACKUP_FILES[@]}"; do
    log "  - ${file}"
done
log "Total backup size: $(du -sh "$BACKUP_BASE_DIR" 2>/dev/null | cut -f1 || echo 'N/A')"
log "Status: SUCCESS"
log "============================================="

exit 0
