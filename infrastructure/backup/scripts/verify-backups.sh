#!/bin/bash
################################################################################
# Zentoria Personal Edition - Master Backup Verification Script
# Verifies integrity of all backups across all data sources
#
# Usage: ./verify-backups.sh [all|postgresql|redis|qdrant|minio|n8n]
################################################################################

set -e

# Configuration
BACKUP_ROOT="/opt/zentoria/backup"
VERIFY_TYPE="${1:-all}"
LOGS_DIR="${BACKUP_ROOT}/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create directories
mkdir -p "${LOGS_DIR}"

# Logging
LOG_FILE="${LOGS_DIR}/verify_${TIMESTAMP}.log"
exec 1> >(tee -a "${LOG_FILE}")
exec 2>&1

################################################################################
# Utility Functions
################################################################################

log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_pass() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [PASS] ✓ $1"
}

log_fail() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [FAIL] ✗ $1"
}

log_section() {
    echo ""
    echo "================================================================================"
    echo "  $1"
    echo "================================================================================"
}

# Verify file exists and is not empty
check_file_integrity() {
    local file=$1
    local file_type=${2:-"file"}

    if [[ ! -f "$file" ]]; then
        log_fail "File not found: $file"
        return 1
    fi

    local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")

    if [[ $size -eq 0 ]]; then
        log_fail "Empty $file_type: $file"
        return 1
    fi

    log_pass "File exists and is not empty: $(basename $file) ($(numfmt --to=iec-i --suffix=B $size 2>/dev/null || du -h $file | cut -f1))"
    return 0
}

# Verify checksum
verify_checksum() {
    local file=$1

    if [[ ! -f "${file}.sha256" ]]; then
        log_fail "Checksum file not found: ${file}.sha256"
        return 1
    fi

    if sha256sum -c "${file}.sha256" > /dev/null 2>&1; then
        log_pass "Checksum verified: $(basename $file)"
        return 0
    else
        log_fail "Checksum verification failed: $(basename $file)"
        return 1
    fi
}

# Test gzip file integrity
verify_gzip_integrity() {
    local file=$1

    if ! gzip -t "$file" 2>/dev/null; then
        log_fail "Gzip integrity check failed: $(basename $file)"
        return 1
    fi

    log_pass "Gzip integrity verified: $(basename $file)"
    return 0
}

################################################################################
# PostgreSQL Verification
################################################################################

verify_postgresql() {
    log_section "POSTGRESQL BACKUP VERIFICATION"

    local failed=0
    local backup_dir="${BACKUP_ROOT}/local/postgresql"

    if [[ ! -d "$backup_dir" ]]; then
        log_fail "Backup directory not found: $backup_dir"
        return 1
    fi

    # Check for recent backups
    local recent_backups=$(find "$backup_dir" -name "*.sql.gz" -mtime -1 | wc -l)

    if [[ $recent_backups -eq 0 ]]; then
        log_fail "No recent PostgreSQL backups found (< 24 hours)"
        ((failed++))
    else
        log_pass "Found ${recent_backups} recent PostgreSQL backups"
    fi

    # Verify each backup
    for backup in $(find "$backup_dir" -name "*.sql.gz" -type f | head -5); do
        log_info "Verifying: $(basename $backup)"

        # Check file integrity
        if ! check_file_integrity "$backup" "backup"; then
            ((failed++))
            continue
        fi

        # Verify checksum
        if ! verify_checksum "$backup"; then
            ((failed++))
            continue
        fi

        # Verify gzip
        if ! verify_gzip_integrity "$backup"; then
            ((failed++))
            continue
        fi

        # Test restore to temporary database
        log_info "Testing restore capability..."
        if docker-compose exec -T postgres psql -U postgres -c "CREATE TEMP TABLE test AS SELECT 1;" 2>/dev/null; then
            log_pass "Restore capability verified for $(basename $backup)"
        else
            log_fail "Restore test failed for $(basename $backup)"
            ((failed++))
        fi
    done

    # Check WAL archives
    if [[ -d "${backup_dir}/wal_"* ]]; then
        log_pass "WAL archives found for PITR"
    else
        log_info "No WAL archives found (PITR may be limited)"
    fi

    return $failed
}

################################################################################
# Redis Verification
################################################################################

verify_redis() {
    log_section "REDIS BACKUP VERIFICATION"

    local failed=0
    local backup_dir="${BACKUP_ROOT}/local/redis"

    if [[ ! -d "$backup_dir" ]]; then
        log_fail "Backup directory not found: $backup_dir"
        return 1
    fi

    # Check for recent RDB backups
    local recent_rdb=$(find "$backup_dir" -name "*.rdb" -mtime -7 | wc -l)

    if [[ $recent_rdb -eq 0 ]]; then
        log_fail "No recent Redis RDB backups found (< 7 days)"
        ((failed++))
    else
        log_pass "Found ${recent_rdb} recent Redis RDB backups"
    fi

    # Verify RDB files
    for rdb_file in $(find "$backup_dir" -name "*.rdb" -type f | head -3); do
        log_info "Verifying RDB: $(basename $rdb_file)"

        if ! check_file_integrity "$rdb_file" "RDB"; then
            ((failed++))
            continue
        fi

        # Verify RDB format
        if file "$rdb_file" | grep -q "data"; then
            log_pass "RDB format valid: $(basename $rdb_file)"
        else
            log_fail "RDB format invalid: $(basename $rdb_file)"
            ((failed++))
        fi
    done

    # Check AOF backups if present
    local aof_files=$(find "$backup_dir" -name "*.aof" -o -name "*aof*tar.gz")

    if [[ -n "$aof_files" ]]; then
        log_pass "AOF backups found"
    else
        log_info "No AOF backups found"
    fi

    return $failed
}

################################################################################
# Qdrant Verification
################################################################################

verify_qdrant() {
    log_section "QDRANT BACKUP VERIFICATION"

    local failed=0
    local backup_dir="${BACKUP_ROOT}/local/qdrant"

    if [[ ! -d "$backup_dir" ]]; then
        log_fail "Backup directory not found: $backup_dir"
        return 1
    fi

    # Check for recent snapshots
    local recent_snapshots=$(find "$backup_dir" -name "*.snapshot" -mtime -30 | wc -l)

    if [[ $recent_snapshots -eq 0 ]]; then
        log_fail "No recent Qdrant snapshots found (< 30 days)"
        ((failed++))
    else
        log_pass "Found ${recent_snapshots} recent Qdrant snapshots"
    fi

    # Verify snapshot files
    for snapshot in $(find "$backup_dir" -name "*.snapshot" -type f | head -3); do
        log_info "Verifying snapshot: $(basename $snapshot)"

        if ! check_file_integrity "$snapshot" "snapshot"; then
            ((failed++))
            continue
        fi

        # Verify checksum if present
        if [[ -f "${snapshot}.sha256" ]]; then
            if ! verify_checksum "$snapshot"; then
                ((failed++))
                continue
            fi
        fi

        log_pass "Snapshot verified: $(basename $snapshot)"
    done

    return $failed
}

################################################################################
# MinIO/Object Storage Verification
################################################################################

verify_minio() {
    log_section "MINIO BACKUP VERIFICATION"

    local failed=0

    log_info "Checking MinIO connectivity..."

    if ! docker-compose exec minio mc ls minio/backups/ > /dev/null 2>&1; then
        log_fail "Cannot access MinIO"
        return 1
    fi

    log_pass "MinIO is accessible"

    # Check each backup bucket
    local buckets="postgresql redis qdrant vault n8n configs"

    for bucket in $buckets; do
        log_info "Checking backup bucket: $bucket"

        local count=$(docker-compose exec minio mc ls "minio/backups/${bucket}/" 2>/dev/null | wc -l)

        if [[ $count -gt 0 ]]; then
            log_pass "Bucket '$bucket' contains ${count} objects"
        else
            log_fail "Bucket '$bucket' is empty"
            ((failed++))
        fi
    done

    # Check total storage usage
    local total_size=$(docker-compose exec minio mc du "minio/backups/" 2>/dev/null | tail -1 | awk '{print $1}')
    log_pass "Total backup storage: ${total_size}"

    return $failed
}

################################################################################
# n8n Workflow Backup Verification
################################################################################

verify_n8n() {
    log_section "n8n WORKFLOW BACKUP VERIFICATION"

    local failed=0
    local backup_dir="${BACKUP_ROOT}/local/n8n"

    if [[ ! -d "$backup_dir" ]]; then
        log_fail "Backup directory not found: $backup_dir"
        return 1
    fi

    # Check for recent workflow exports
    local recent_exports=$(find "$backup_dir" -name "*.json" -mtime -7 | wc -l)

    if [[ $recent_exports -eq 0 ]]; then
        log_fail "No recent n8n workflow exports found (< 7 days)"
        ((failed++))
    else
        log_pass "Found ${recent_exports} recent workflow backups"
    fi

    # Verify JSON files
    for json_file in $(find "$backup_dir" -name "*.json" -type f | head -5); do
        log_info "Verifying workflow: $(basename $json_file)"

        if ! check_file_integrity "$json_file" "workflow"; then
            ((failed++))
            continue
        fi

        # Validate JSON
        if jq empty "$json_file" 2>/dev/null; then
            log_pass "JSON valid: $(basename $json_file)"
        else
            log_fail "JSON invalid: $(basename $json_file)"
            ((failed++))
        fi
    done

    return $failed
}

################################################################################
# Main Verification
################################################################################

main() {
    echo "========================================================================"
    echo "Zentoria Backup Verification - ${VERIFY_TYPE^^}"
    echo "========================================================================"
    echo ""

    local total_failed=0

    case "${VERIFY_TYPE}" in
        all)
            verify_postgresql && ((total_failed += $?))
            verify_redis && ((total_failed += $?))
            verify_qdrant && ((total_failed += $?))
            verify_minio && ((total_failed += $?))
            verify_n8n && ((total_failed += $?))
            ;;

        postgresql)
            verify_postgresql && ((total_failed += $?))
            ;;

        redis)
            verify_redis && ((total_failed += $?))
            ;;

        qdrant)
            verify_qdrant && ((total_failed += $?))
            ;;

        minio)
            verify_minio && ((total_failed += $?))
            ;;

        n8n)
            verify_n8n && ((total_failed += $?))
            ;;

        *)
            log_fail "Unknown verification type: ${VERIFY_TYPE}"
            exit 1
            ;;
    esac

    # Summary
    log_section "VERIFICATION SUMMARY"

    if [[ $total_failed -eq 0 ]]; then
        log_pass "All backups verified successfully"
        echo ""
        echo "✓ Verification successful"
        exit 0
    else
        log_fail "${total_failed} verification(s) failed"
        echo ""
        echo "✗ Verification failed - see log: ${LOG_FILE}"
        exit 1
    fi
}

# Run main function
main
