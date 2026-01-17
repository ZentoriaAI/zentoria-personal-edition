#!/bin/bash
# =============================================================================
# Zentoria Personal Edition - Database Initialization Script
# Container: 404 (zentoria-db)
# Run this script once to initialize all databases
# =============================================================================

set -e
set -o pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../migrations"
LOG_FILE="/opt/zentoria/db/logs/init.log"

# PostgreSQL connection
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Functions
# =============================================================================

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "$msg" | tee -a "$LOG_FILE"
}

log_success() {
    log "${GREEN}SUCCESS:${NC} $1"
}

log_warn() {
    log "${YELLOW}WARNING:${NC} $1"
}

log_error() {
    log "${RED}ERROR:${NC} $1"
}

# Check PostgreSQL connection
check_postgres() {
    log "Checking PostgreSQL connection..."
    if pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -t 10 >/dev/null 2>&1; then
        log_success "PostgreSQL is ready"
        return 0
    else
        log_error "Cannot connect to PostgreSQL"
        return 1
    fi
}

# Create database if not exists
create_database() {
    local db_name=$1
    local owner=$2

    log "Creating database: ${db_name}"

    if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -lqt | cut -d \| -f 1 | grep -qw "$db_name"; then
        log_warn "Database ${db_name} already exists"
        return 0
    fi

    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -c "
        CREATE DATABASE ${db_name}
        WITH OWNER = ${owner}
        ENCODING = 'UTF8'
        LC_COLLATE = 'en_US.UTF-8'
        LC_CTYPE = 'en_US.UTF-8'
        TEMPLATE = template0;
    " 2>>"$LOG_FILE"

    log_success "Database ${db_name} created"
}

# Create role if not exists
create_role() {
    local role_name=$1
    local password=$2

    log "Creating role: ${role_name}"

    if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -tAc "SELECT 1 FROM pg_roles WHERE rolname='${role_name}'" | grep -q 1; then
        log_warn "Role ${role_name} already exists"
        return 0
    fi

    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -c "
        CREATE ROLE ${role_name} WITH LOGIN PASSWORD '${password}';
    " 2>>"$LOG_FILE"

    log_success "Role ${role_name} created"
}

# Run migration file
run_migration() {
    local db_name=$1
    local migration_file=$2

    log "Running migration: ${migration_file} on ${db_name}"

    if [ ! -f "$migration_file" ]; then
        log_error "Migration file not found: ${migration_file}"
        return 1
    fi

    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$db_name" -f "$migration_file" 2>>"$LOG_FILE"

    log_success "Migration completed: $(basename "$migration_file")"
}

# Enable extensions
enable_extension() {
    local db_name=$1
    local extension=$2

    log "Enabling extension: ${extension} on ${db_name}"

    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$db_name" -c "
        CREATE EXTENSION IF NOT EXISTS \"${extension}\";
    " 2>>"$LOG_FILE"

    log_success "Extension ${extension} enabled"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    log "============================================="
    log "Zentoria Database Initialization"
    log "============================================="
    log ""

    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"

    # Check PostgreSQL connection
    check_postgres || exit 1

    # -------------------------------------------------------------------------
    # Step 1: Create Roles
    # -------------------------------------------------------------------------
    log ""
    log "Step 1: Creating Roles"
    log "---------------------------------------------"

    # Note: In production, get passwords from Vault
    create_role "zentoria_app" "CHANGE_ME_APP_PASSWORD"
    create_role "n8n_app" "CHANGE_ME_N8N_PASSWORD"
    create_role "readonly" "CHANGE_ME_READONLY_PASSWORD"
    create_role "pgbouncer" "CHANGE_ME_PGBOUNCER_PASSWORD"

    # -------------------------------------------------------------------------
    # Step 2: Create Databases
    # -------------------------------------------------------------------------
    log ""
    log "Step 2: Creating Databases"
    log "---------------------------------------------"

    create_database "zentoria_main" "zentoria_app"
    create_database "zentoria_vectors" "zentoria_app"
    create_database "n8n" "n8n_app"

    # -------------------------------------------------------------------------
    # Step 3: Enable Extensions
    # -------------------------------------------------------------------------
    log ""
    log "Step 3: Enabling Extensions"
    log "---------------------------------------------"

    # zentoria_main extensions
    enable_extension "zentoria_main" "uuid-ossp"
    enable_extension "zentoria_main" "pgcrypto"
    enable_extension "zentoria_main" "pg_trgm"
    enable_extension "zentoria_main" "btree_gin"

    # zentoria_vectors extensions
    enable_extension "zentoria_vectors" "uuid-ossp"
    enable_extension "zentoria_vectors" "vector"
    enable_extension "zentoria_vectors" "pg_trgm"

    # n8n extensions
    enable_extension "n8n" "uuid-ossp"

    # -------------------------------------------------------------------------
    # Step 4: Run Migrations
    # -------------------------------------------------------------------------
    log ""
    log "Step 4: Running Migrations"
    log "---------------------------------------------"

    # zentoria_main schema
    run_migration "zentoria_main" "${MIGRATIONS_DIR}/001_zentoria_main_schema.sql"

    # zentoria_vectors schema
    run_migration "zentoria_vectors" "${MIGRATIONS_DIR}/002_zentoria_vectors_schema.sql"

    # n8n integration schema (applied to n8n database)
    run_migration "n8n" "${MIGRATIONS_DIR}/003_n8n_database_schema.sql"

    # -------------------------------------------------------------------------
    # Step 5: Grant Permissions
    # -------------------------------------------------------------------------
    log ""
    log "Step 5: Granting Permissions"
    log "---------------------------------------------"

    # Grant zentoria_app access to zentoria_main
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "zentoria_main" -c "
        GRANT CONNECT ON DATABASE zentoria_main TO zentoria_app;
        GRANT USAGE ON ALL SCHEMAS IN DATABASE zentoria_main TO zentoria_app;
    " 2>>"$LOG_FILE"

    # Grant zentoria_app access to zentoria_vectors
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "zentoria_vectors" -c "
        GRANT CONNECT ON DATABASE zentoria_vectors TO zentoria_app;
        GRANT USAGE ON SCHEMA embeddings TO zentoria_app;
    " 2>>"$LOG_FILE"

    # Grant n8n_app access to n8n database
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "n8n" -c "
        GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n_app;
        GRANT ALL PRIVILEGES ON SCHEMA public TO n8n_app;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO n8n_app;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO n8n_app;
    " 2>>"$LOG_FILE"

    # Grant readonly access
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "zentoria_main" -c "
        GRANT CONNECT ON DATABASE zentoria_main TO readonly;
        GRANT USAGE ON ALL SCHEMAS IN DATABASE zentoria_main TO readonly;
        GRANT SELECT ON ALL TABLES IN SCHEMA core, api, files, audit, mcp, workflows, settings TO readonly;
    " 2>>"$LOG_FILE"

    log_success "Permissions granted"

    # -------------------------------------------------------------------------
    # Step 6: Create PgBouncer Auth File
    # -------------------------------------------------------------------------
    log ""
    log "Step 6: Creating PgBouncer Auth File"
    log "---------------------------------------------"

    # Create userlist.txt for PgBouncer
    # Format: "username" "password"
    # Note: In production, use md5 or scram-sha-256 hashes
    cat > /etc/pgbouncer/userlist.txt << 'EOF'
"zentoria_app" "CHANGE_ME_APP_PASSWORD"
"n8n_app" "CHANGE_ME_N8N_PASSWORD"
"readonly" "CHANGE_ME_READONLY_PASSWORD"
"postgres" "CHANGE_ME_POSTGRES_PASSWORD"
EOF

    chmod 600 /etc/pgbouncer/userlist.txt
    chown pgbouncer:pgbouncer /etc/pgbouncer/userlist.txt 2>/dev/null || true

    log_success "PgBouncer auth file created"

    # -------------------------------------------------------------------------
    # Step 7: Verify Setup
    # -------------------------------------------------------------------------
    log ""
    log "Step 7: Verification"
    log "---------------------------------------------"

    # Check databases
    log "Databases:"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -tAc "
        SELECT datname, pg_size_pretty(pg_database_size(datname)) as size
        FROM pg_database
        WHERE datname IN ('zentoria_main', 'zentoria_vectors', 'n8n');
    " | while read -r line; do
        log "  - ${line}"
    done

    # Check zentoria_main tables
    log "Tables in zentoria_main:"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "zentoria_main" -tAc "
        SELECT schemaname || '.' || tablename
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, tablename;
    " | while read -r line; do
        log "  - ${line}"
    done

    # Check zentoria_vectors tables
    log "Tables in zentoria_vectors:"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "zentoria_vectors" -tAc "
        SELECT schemaname || '.' || tablename
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, tablename;
    " | while read -r line; do
        log "  - ${line}"
    done

    # Check extensions
    log "Extensions:"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "zentoria_vectors" -tAc "
        SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
    " | while read -r line; do
        log "  - pgvector: ${line}"
    done

    # -------------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------------
    log ""
    log "============================================="
    log "Initialization Complete"
    log "============================================="
    log ""
    log "Databases created:"
    log "  - zentoria_main (application data)"
    log "  - zentoria_vectors (AI embeddings)"
    log "  - n8n (workflow data)"
    log ""
    log "Roles created:"
    log "  - zentoria_app (application access)"
    log "  - n8n_app (n8n access)"
    log "  - readonly (read-only access)"
    log "  - pgbouncer (connection pooler)"
    log ""
    log "Next steps:"
    log "  1. Update passwords in Vault"
    log "  2. Configure PgBouncer and restart"
    log "  3. Initialize Qdrant collections: ./init_qdrant.sh"
    log "  4. Verify Redis is running"
    log "  5. Run backup verification"
    log ""
    log "Connection strings:"
    log "  PostgreSQL (direct): postgresql://zentoria_app:***@zentoria-db:5432/zentoria_main"
    log "  PostgreSQL (pooled): postgresql://zentoria_app:***@zentoria-db:6432/zentoria_main"
    log "  Redis: redis://:***@zentoria-redis:6379/0"
    log "  Qdrant: http://zentoria-embeddings:6333"
    log ""

    return 0
}

# Run main function
main "$@"
