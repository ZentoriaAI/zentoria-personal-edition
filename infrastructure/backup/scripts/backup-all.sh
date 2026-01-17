#!/bin/bash
################################################################################
# Zentoria Personal Edition - Master Backup Script
# Orchestrates all backup operations across all data sources
#
# Usage: ./backup-all.sh [hourly|daily|weekly|full]
# Default: Runs all applicable backups based on schedule
################################################################################

set -e

# Configuration
BACKUP_ROOT="/opt/zentoria/backup"
LOCAL_BACKUPS="${BACKUP_ROOT}/local"
LOGS_DIR="${BACKUP_ROOT}/logs"
SCRIPT_DIR="${BACKUP_ROOT}/scripts"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_TYPE="${1:-auto}"

# Create directories
mkdir -p "${LOCAL_BACKUPS}" "${LOGS_DIR}"

# Logging
LOG_FILE="${LOGS_DIR}/backup_${TIMESTAMP}.log"
exec 1> >(tee -a "${LOG_FILE}")
exec 2>&1

################################################################################
# Utility Functions
################################################################################

log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1" >&2
}

log_section() {
    echo ""
    echo "================================================================================"
    echo "  $1"
    echo "================================================================================"
}

# Send backup status notification
send_status() {
    local status=$1
    local message=$2
    local details=${3:-""}

    # Prometheus metric
    cat > "${BACKUP_ROOT}/metrics/backup_status.txt" <<EOF
# HELP backup_status Latest backup status (1=success, 0=failed)
# TYPE backup_status gauge
backup_status{type="${BACKUP_TYPE}"} $([ "$status" = "success" ] && echo "1" || echo "0")
backup_timestamp $(date +%s)
EOF

    # Log to monitoring system
    if command -v logger &> /dev/null; then
        logger -t zentoria-backup "[${status}] ${message}"
    fi
}

# Execute backup with error handling
run_backup() {
    local backup_name=$1
    local backup_script=$2
    local backup_args=${3:-""}

    log_info "Starting ${backup_name}..."

    if [[ ! -f "${SCRIPT_DIR}/${backup_script}" ]]; then
        log_error "Backup script not found: ${backup_script}"
        return 1
    fi

    local start_time=$(date +%s)

    if bash "${SCRIPT_DIR}/${backup_script}" ${backup_args}; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_info "${backup_name} completed successfully in ${duration}s"
        return 0
    else
        log_error "${backup_name} failed"
        return 1
    fi
}

# Verify all backups
verify_all() {
    log_section "VERIFYING ALL BACKUPS"

    local failed=0

    if ! bash "${SCRIPT_DIR}/verify-backups.sh"; then
        log_error "Backup verification failed"
        failed=$((failed + 1))
    fi

    return $failed
}

# Generate backup report
generate_report() {
    log_section "BACKUP SUMMARY REPORT"

    # Count backups
    local hourly_count=$(find "${LOCAL_BACKUPS}/hourly" -type f -mtime -1 2>/dev/null | wc -l)
    local daily_count=$(find "${LOCAL_BACKUPS}/daily" -type f -mtime -31 2>/dev/null | wc -l)
    local weekly_count=$(find "${LOCAL_BACKUPS}/weekly" -type f -mtime -91 2>/dev/null | wc -l)

    # Total size
    local total_size=$(du -sh "${LOCAL_BACKUPS}" 2>/dev/null | cut -f1)

    cat <<EOF

Backup Summary for ${TIMESTAMP}
================================

Backup Type: ${BACKUP_TYPE}
Total Size: ${total_size}

Recent Backups:
  - Hourly: ${hourly_count} backups
  - Daily: ${daily_count} backups
  - Weekly: ${weekly_count} backups

Storage Usage:
EOF

    find "${LOCAL_BACKUPS}" -type d -maxdepth 1 | while read -r dir; do
        if [[ -d "$dir" ]]; then
            local size=$(du -sh "$dir" 2>/dev/null | cut -f1)
            echo "  - $(basename $dir): ${size}"
        fi
    done

    echo ""
    echo "Log file: ${LOG_FILE}"
}

################################################################################
# Main Backup Orchestration
################################################################################

main() {
    log_section "ZENTORIA BACKUP - ${BACKUP_TYPE^^}"
    log_info "Starting backup operation at $(date)"
    log_info "Backup type: ${BACKUP_TYPE}"

    local failed_backups=0

    case "${BACKUP_TYPE}" in
        hourly)
            log_section "HOURLY BACKUP CYCLE"
            run_backup "PostgreSQL (hourly)" "backup-postgresql.sh" "hourly" || ((failed_backups++))
            run_backup "Redis (every 6h)" "backup-redis.sh" || ((failed_backups++))
            ;;

        daily)
            log_section "DAILY BACKUP CYCLE"
            run_backup "PostgreSQL (daily)" "backup-postgresql.sh" "daily" || ((failed_backups++))
            run_backup "Redis (6h)" "backup-redis.sh" || ((failed_backups++))
            run_backup "Qdrant (daily)" "backup-qdrant.sh" || ((failed_backups++))
            run_backup "MinIO (daily)" "backup-minio.sh" || ((failed_backups++))
            run_backup "n8n workflows (daily)" "backup-n8n.sh" || ((failed_backups++))
            run_backup "Configuration files" "backup-configs.sh" || ((failed_backups++))
            run_backup "Vault snapshot (daily)" "backup-vault.sh" || ((failed_backups++))
            ;;

        weekly)
            log_section "WEEKLY BACKUP CYCLE"
            run_backup "PostgreSQL (weekly)" "backup-postgresql.sh" "weekly" || ((failed_backups++))
            ;;

        full)
            log_section "FULL BACKUP - ALL SOURCES"
            run_backup "PostgreSQL (full)" "backup-postgresql.sh" "full" || ((failed_backups++))
            run_backup "Redis (full)" "backup-redis.sh" || ((failed_backups++))
            run_backup "Qdrant (full)" "backup-qdrant.sh" "full" || ((failed_backups++))
            run_backup "MinIO (full)" "backup-minio.sh" "full" || ((failed_backups++))
            run_backup "n8n workflows (full)" "backup-n8n.sh" || ((failed_backups++))
            run_backup "Configuration files" "backup-configs.sh" || ((failed_backups++))
            run_backup "Vault snapshot (full)" "backup-vault.sh" || ((failed_backups++))
            ;;

        auto)
            # Auto-detect based on time of day
            local hour=$(date +%H)

            # Every hour
            run_backup "PostgreSQL (hourly)" "backup-postgresql.sh" "hourly" || ((failed_backups++))
            run_backup "Redis (6h)" "backup-redis.sh" || ((failed_backups++))

            # At 02:00 - Daily backups
            if [[ "$hour" -eq 2 ]]; then
                log_section "DAILY BACKUP CYCLE (scheduled time)"
                run_backup "PostgreSQL (daily)" "backup-postgresql.sh" "daily" || ((failed_backups++))
                run_backup "Qdrant (daily)" "backup-qdrant.sh" || ((failed_backups++))
                run_backup "Vault snapshot" "backup-vault.sh" || ((failed_backups++))
            fi

            # At 04:00 - MinIO sync
            if [[ "$hour" -eq 4 ]]; then
                log_section "OBJECT STORAGE SYNC (scheduled time)"
                run_backup "MinIO bucket sync" "backup-minio.sh" || ((failed_backups++))
            fi

            # At 05:00 - n8n export
            if [[ "$hour" -eq 5 ]]; then
                log_section "WORKFLOW EXPORT (scheduled time)"
                run_backup "n8n workflows" "backup-n8n.sh" || ((failed_backups++))
            fi

            # At 06:00 - Config backup
            if [[ "$hour" -eq 6 ]]; then
                log_section "CONFIGURATION BACKUP (scheduled time)"
                run_backup "Configuration files" "backup-configs.sh" || ((failed_backups++))
            fi

            # Every Sunday at 03:00 - Weekly backups
            if [[ $(date +%A) == "Sunday" ]] && [[ "$hour" -eq 3 ]]; then
                log_section "WEEKLY BACKUP CYCLE (Sunday 03:00)"
                run_backup "PostgreSQL (weekly)" "backup-postgresql.sh" "weekly" || ((failed_backups++))
            fi
            ;;

        *)
            log_error "Unknown backup type: ${BACKUP_TYPE}"
            echo "Usage: $0 [hourly|daily|weekly|full|auto]"
            exit 1
            ;;
    esac

    # Verification phase
    log_section "BACKUP VERIFICATION"
    if ! verify_all; then
        ((failed_backups++))
    fi

    # Generate report
    generate_report

    # Cleanup old backups (optional)
    if [[ -f "${SCRIPT_DIR}/prune-old-backups.sh" ]]; then
        log_section "CLEANUP OLD BACKUPS"
        bash "${SCRIPT_DIR}/prune-old-backups.sh" || log_error "Cleanup failed"
    fi

    # Final status
    log_section "BACKUP OPERATION COMPLETE"

    if [[ $failed_backups -eq 0 ]]; then
        log_info "All backups completed successfully"
        send_status "success" "All backups completed successfully" "${TIMESTAMP}"
        echo ""
        echo "✓ Backup successful"
        return 0
    else
        log_error "${failed_backups} backup(s) failed"
        send_status "failed" "${failed_backups} backup(s) failed" "${TIMESTAMP}"
        echo ""
        echo "✗ Backup failed - check ${LOG_FILE}"
        return 1
    fi
}

# Run main function
main "$@"
