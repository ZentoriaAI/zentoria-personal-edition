#!/bin/bash
################################################################################
# Zentoria Personal Edition - PostgreSQL Backup Script
# Creates full, differential, and WAL backups of PostgreSQL databases
#
# Usage: ./backup-postgresql.sh [hourly|daily|weekly|full]
################################################################################

set -e

# Configuration
BACKUP_ROOT="/opt/zentoria/backup"
BACKUP_TYPE="${1:-hourly}"
BACKUP_DIR="${BACKUP_ROOT}/local/postgresql/${BACKUP_TYPE}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y%m%d)

# Database connection
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-zentoria}"
DB_NAMES="${DB_NAMES:-zentoria_main zentoria_vectors n8n}"

# Retention periods (in days)
RETENTION_HOURLY=7
RETENTION_DAILY=30
RETENTION_WEEKLY=84

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Logging
LOG_FILE="${BACKUP_ROOT}/logs/postgresql_${BACKUP_TYPE}_${TIMESTAMP}.log"
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

# Check database connectivity
check_connectivity() {
    log_info "Checking PostgreSQL connectivity..."

    if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" > /dev/null 2>&1; then
        log_error "Cannot connect to PostgreSQL at ${DB_HOST}:${DB_PORT}"
        return 1
    fi

    log_info "PostgreSQL connection successful"
    return 0
}

# Backup single database
backup_database() {
    local db_name=$1
    local backup_type=$2
    local backup_file="${BACKUP_DIR}/${db_name}_${TIMESTAMP}.sql.gz"

    log_info "Backing up database: ${db_name}"

    case "${backup_type}" in
        hourly|daily|weekly)
            # Full backup with compression
            if pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
                -d "${db_name}" \
                --format=plain \
                --verbose \
                | gzip -9 > "${backup_file}" 2>> "${LOG_FILE}"; then

                local size=$(du -h "${backup_file}" | cut -f1)
                log_info "Database backup successful: ${db_name} (${size})"

                # Create checksum
                sha256sum "${backup_file}" > "${backup_file}.sha256"

                # Verify backup integrity
                if ! gzip -t "${backup_file}" 2>/dev/null; then
                    log_error "Backup integrity check failed for ${db_name}"
                    rm -f "${backup_file}" "${backup_file}.sha256"
                    return 1
                fi

                return 0
            else
                log_error "Backup failed for database: ${db_name}"
                return 1
            fi
            ;;

        full)
            # Full backup with binary format (faster restore)
            if pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
                -d "${db_name}" \
                --format=custom \
                --verbose \
                --file="${backup_file%.gz}.dump" 2>> "${LOG_FILE}"; then

                # Compress dump
                gzip -9 "${backup_file%.gz}.dump"

                local size=$(du -h "${backup_file}" | cut -f1)
                log_info "Full database backup successful: ${db_name} (${size})"

                # Create checksum
                sha256sum "${backup_file}" > "${backup_file}.sha256"

                return 0
            else
                log_error "Full backup failed for database: ${db_name}"
                return 1
            fi
            ;;

        *)
            log_error "Unknown backup type: ${backup_type}"
            return 1
            ;;
    esac
}

# Backup all databases with metadata
backup_all_databases() {
    local backup_type=$1
    local backup_file="${BACKUP_DIR}/all_databases_${TIMESTAMP}.sql.gz"

    log_info "Creating full cluster backup..."

    if pg_dumpall -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
        --verbose \
        | gzip -9 > "${backup_file}" 2>> "${LOG_FILE}"; then

        local size=$(du -h "${backup_file}" | cut -f1)
        log_info "Cluster backup successful (${size})"

        # Create checksum
        sha256sum "${backup_file}" > "${backup_file}.sha256"

        # Create metadata file
        cat > "${BACKUP_DIR}/metadata_${TIMESTAMP}.json" <<EOF
{
  "backup_type": "${backup_type}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "pg_version": "$(psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -t -c "SELECT version()")",
  "database_list": $(psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -t -c "SELECT json_agg(datname) FROM pg_database WHERE datistemplate = false"),
  "backup_file": "$(basename ${backup_file})",
  "file_size_bytes": $(stat -f%z "${backup_file}" 2>/dev/null || stat -c%s "${backup_file}"),
  "compression": "gzip-9"
}
EOF

        return 0
    else
        log_error "Cluster backup failed"
        return 1
    fi
}

# Extract WAL archives for point-in-time recovery
backup_wal_archives() {
    log_info "Backing up WAL archives for PITR..."

    local wal_backup_dir="${BACKUP_DIR}/wal_${TIMESTAMP}"
    mkdir -p "${wal_backup_dir}"

    # Get WAL archive location from PostgreSQL
    local wal_archive_dir=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" \
        -t -c "SHOW wal_archive_cmd" 2>/dev/null | grep -oP "'\K[^']*" || echo "")

    if [[ -n "${wal_archive_dir}" ]] && [[ -d "${wal_archive_dir}" ]]; then
        log_info "Archiving WAL files from: ${wal_archive_dir}"

        # Find recent WAL files (last 24 hours)
        find "${wal_archive_dir}" -type f -mtime -1 -name "*.lz4" -o -name "*.gz" | while read -r wal_file; do
            cp "${wal_file}" "${wal_backup_dir}/"
        done

        # Create archive
        tar czf "${BACKUP_DIR}/wal_archive_${TIMESTAMP}.tar.gz" "${wal_backup_dir}" 2>/dev/null

        log_info "WAL archive backup completed"
    else
        log_info "No WAL archive directory found - PITR may be limited"
    fi
}

# Delete old backups based on retention policy
cleanup_old_backups() {
    local backup_type=$1
    local retention_days=$2

    log_info "Cleaning up backups older than ${retention_days} days"

    # Delete old backup files
    find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime "+${retention_days}" -delete

    # Delete old checksums
    find "${BACKUP_DIR}" -type f -name "*.sha256" -mtime "+${retention_days}" -delete

    # Delete old metadata
    find "${BACKUP_DIR}" -type f -name "metadata_*.json" -mtime "+${retention_days}" -delete

    # Delete empty directories
    find "${BACKUP_DIR}" -type d -empty -delete

    log_info "Cleanup completed"
}

# Get database statistics
get_db_stats() {
    log_info "Gathering database statistics..."

    local stats_file="${BACKUP_DIR}/db_stats_${TIMESTAMP}.json"

    {
        echo "{"
        echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
        echo "  \"databases\": ["

        psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -t -A -F'|' \
            -c "SELECT datname, pg_size_pretty(pg_database.dattablespace) as size,
                       (SELECT count(*) FROM pg_tables WHERE pg_tables.schemaname NOT IN ('pg_catalog', 'information_schema') AND pg_tables.tablename NOT LIKE 'pg_toast%') as table_count
                FROM pg_database
                WHERE datistemplate = false
                ORDER BY datname" | while IFS='|' read -r db_name db_size table_count; do

            echo "    {"
            echo "      \"name\": \"${db_name}\","
            echo "      \"size\": \"${db_size}\","
            echo "      \"tables\": ${table_count}"
            echo "    },"
        done

        echo "    {}"
        echo "  ]"
        echo "}"
    } > "${stats_file}"

    return 0
}

################################################################################
# Main Backup Process
################################################################################

main() {
    echo "========================================================================"
    echo "PostgreSQL Backup - ${BACKUP_TYPE^^}"
    echo "========================================================================"
    echo ""

    # Check connectivity
    if ! check_connectivity; then
        log_error "Cannot proceed without database connectivity"
        exit 1
    fi

    local failed=0

    # Perform backup based on type
    case "${BACKUP_TYPE}" in
        hourly)
            log_info "Starting hourly backup cycle"

            for db_name in ${DB_NAMES}; do
                if ! backup_database "${db_name}" "hourly"; then
                    ((failed++))
                fi
            done

            cleanup_old_backups "hourly" "${RETENTION_HOURLY}"
            ;;

        daily)
            log_info "Starting daily backup cycle"

            # Full cluster backup
            if ! backup_all_databases "daily"; then
                ((failed++))
            fi

            # WAL archives for PITR
            if ! backup_wal_archives; then
                log_error "WAL backup failed - PITR may be limited"
                ((failed++))
            fi

            # Database statistics
            if ! get_db_stats; then
                log_error "Stats gathering failed"
                ((failed++))
            fi

            cleanup_old_backups "daily" "${RETENTION_DAILY}"
            ;;

        weekly)
            log_info "Starting weekly backup cycle"

            # Full cluster backup with binary format
            if ! backup_database "zentoria_main" "full"; then
                ((failed++))
            fi

            if ! backup_database "zentoria_vectors" "full"; then
                ((failed++))
            fi

            cleanup_old_backups "weekly" "${RETENTION_WEEKLY}"
            ;;

        *)
            log_error "Unknown backup type: ${BACKUP_TYPE}"
            exit 1
            ;;
    esac

    # Final report
    echo ""
    echo "========================================================================"
    echo "Backup Summary:"
    echo "========================================================================"
    echo "Type: ${BACKUP_TYPE}"
    echo "Directory: ${BACKUP_DIR}"
    echo "Total size: $(du -sh ${BACKUP_DIR} | cut -f1)"
    echo "Recent backups: $(ls -1 ${BACKUP_DIR}/*.sql.gz 2>/dev/null | wc -l)"
    echo "Log file: ${LOG_FILE}"
    echo ""

    if [[ $failed -eq 0 ]]; then
        log_info "PostgreSQL backup completed successfully"
        exit 0
    else
        log_error "PostgreSQL backup completed with ${failed} error(s)"
        exit 1
    fi
}

# Run main function
main
