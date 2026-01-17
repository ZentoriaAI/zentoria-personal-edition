#!/bin/bash
##############################################################################
# Zentoria Personal Edition - PostgreSQL Setup
# Installs and configures PostgreSQL 15 with pgvector in container 404
##############################################################################

source "$(dirname "$0")/00-config.sh"

# PostgreSQL specific settings
PG_CONTAINER_VMID=404
PG_ADMIN_USER="postgres"
PG_VERSION="15"

##############################################################################
# POSTGRESQL SETUP
##############################################################################

main() {
  log "Starting PostgreSQL setup on container $PG_CONTAINER_VMID..."

  # Check if container exists
  if ! ssh_proxmox "pct status $PG_CONTAINER_VMID" &>/dev/null; then
    error "Container $PG_CONTAINER_VMID does not exist"
    exit 1
  fi

  # Execute setup steps
  install_postgresql
  configure_postgresql
  install_pgvector
  create_databases
  setup_backup_script
  verify_postgresql

  success "PostgreSQL setup completed!"
}

install_postgresql() {
  log "Installing PostgreSQL $PG_VERSION..."

  # Add PostgreSQL repository
  ssh_container "$PG_CONTAINER_VMID" "sh -c 'echo \"deb http://apt.postgresql.org/pub/repos/apt \$(lsb_release -cs)-pgdg main\" > /etc/apt/sources.list.d/pgdg.list'"

  # Add GPG key
  ssh_container "$PG_CONTAINER_VMID" "wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -"

  # Install PostgreSQL and extensions
  ssh_container "$PG_CONTAINER_VMID" "apt-get update && apt-get install -y \\
    postgresql-$PG_VERSION \\
    postgresql-contrib-$PG_VERSION \\
    postgresql-$PG_VERSION-pgvector \\
    libpq-dev \\
    pg-stat-kcache"

  # Start service
  ssh_container "$PG_CONTAINER_VMID" "systemctl start postgresql && systemctl enable postgresql"

  success "PostgreSQL $PG_VERSION installed"
}

configure_postgresql() {
  log "Configuring PostgreSQL..."

  # Get PostgreSQL config path
  local pg_conf_path="/etc/postgresql/$PG_VERSION/main"

  # Create postgresql.conf backup
  ssh_container "$PG_CONTAINER_VMID" "cp $pg_conf_path/postgresql.conf $pg_conf_path/postgresql.conf.backup"

  # Configure for production use
  ssh_container "$PG_CONTAINER_VMID" "cat >> $pg_conf_path/postgresql.conf" << 'EOF'

# Zentoria Personal Edition Configuration
shared_buffers = '256MB'
effective_cache_size = '1GB'
maintenance_work_mem = '64MB'
checkpoint_completion_target = 0.9
wal_buffers = '16MB'
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = '8MB'
min_wal_size = '2GB'
max_wal_size = '8GB'

# Replication
wal_level = 'replica'
max_wal_senders = 10
wal_keep_segments = 64

# Logging
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_truncate_on_rotation = on
log_rotation_age = '1d'
log_rotation_size = '100MB'
log_statement = 'mod'
log_duration = on
log_lock_waits = on
EOF

  # Configure pg_hba.conf for local access
  ssh_container "$PG_CONTAINER_VMID" "cat > $pg_conf_path/pg_hba.conf" << 'EOF'
# PostgreSQL Client Authentication Configuration
local   all             postgres                                peer
local   all             all                                     peer
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
host    all             all             10.10.40.0/24           md5
EOF

  # Create logs directory
  ssh_container "$PG_CONTAINER_VMID" "mkdir -p /var/log/postgresql && chown postgres:postgres /var/log/postgresql"

  # Reload PostgreSQL configuration
  ssh_container "$PG_CONTAINER_VMID" "systemctl reload postgresql"

  success "PostgreSQL configuration applied"
}

install_pgvector() {
  log "Installing pgvector extension..."

  # Create custom database user (if not exists)
  ssh_container "$PG_CONTAINER_VMID" "sudo -u postgres psql -c \"CREATE USER $PG_USER WITH PASSWORD '$PG_PASSWORD' CREATEDB CREATEROLE;\" 2>/dev/null || true"

  # Create main database
  ssh_container "$PG_CONTAINER_VMID" "sudo -u postgres psql -c \"CREATE DATABASE $PG_DB OWNER $PG_USER;\" 2>/dev/null || true"

  # Install pgvector extension
  ssh_container "$PG_CONTAINER_VMID" "sudo -u postgres psql -d $PG_DB -c \"CREATE EXTENSION IF NOT EXISTS vector;\""

  # Create schemas
  ssh_container "$PG_CONTAINER_VMID" "sudo -u postgres psql -d $PG_DB" << 'EOF'
CREATE SCHEMA IF NOT EXISTS zentoria;
CREATE SCHEMA IF NOT EXISTS audit;
GRANT ALL PRIVILEGES ON SCHEMA zentoria TO zentoria;
GRANT ALL PRIVILEGES ON SCHEMA audit TO zentoria;
EOF

  success "pgvector extension installed"
}

create_databases() {
  log "Creating required databases and tables..."

  # Template for database creation
  local db_sql=$(cat << 'EOF'
-- Create tables with pgvector support
CREATE TABLE IF NOT EXISTS zentoria.documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    source VARCHAR(255),
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ON zentoria.documents USING ivfflat (embedding vector_cosine_ops);

-- Users table
CREATE TABLE IF NOT EXISTS zentoria.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit.logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(255),
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    performed_by INTEGER REFERENCES zentoria.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat conversations
CREATE TABLE IF NOT EXISTS zentoria.conversations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES zentoria.users(id),
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages
CREATE TABLE IF NOT EXISTS zentoria.messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES zentoria.conversations(id),
    role VARCHAR(50),
    content TEXT,
    tokens INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA zentoria TO zentoria;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA zentoria TO zentoria;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO zentoria;
EOF
)

  # Execute SQL
  ssh_container "$PG_CONTAINER_VMID" "sudo -u postgres psql -d $PG_DB" << EOF
$db_sql
EOF

  success "Database tables created"
}

setup_backup_script() {
  log "Setting up backup script..."

  # Create backup directory
  ssh_container "$PG_CONTAINER_VMID" "mkdir -p $PG_BACKUP_DIR && chown postgres:postgres $PG_BACKUP_DIR"

  # Create backup script
  ssh_container "$PG_CONTAINER_VMID" "cat > /usr/local/bin/pg-backup.sh" << 'EOF'
#!/bin/bash
# PostgreSQL backup script

BACKUP_DIR="/var/backups/postgresql"
BACKUP_RETENTION_DAYS=30
DB_USER="postgres"
DB_NAME="zentoria_personal"

# Create backup
BACKUP_FILE="$BACKUP_DIR/zentoria_$(date +%Y%m%d_%H%M%S).sql.gz"
sudo -u $DB_USER pg_dump $DB_NAME | gzip > $BACKUP_FILE

# Log backup
echo "Backup created: $BACKUP_FILE ($(du -h $BACKUP_FILE | cut -f1))" >> $BACKUP_DIR/backup.log

# Cleanup old backups
find $BACKUP_DIR -name "zentoria_*.sql.gz" -mtime +$BACKUP_RETENTION_DAYS -delete

exit 0
EOF

  # Make executable
  ssh_container "$PG_CONTAINER_VMID" "chmod +x /usr/local/bin/pg-backup.sh"

  # Add cron job
  ssh_container "$PG_CONTAINER_VMID" "(crontab -l 2>/dev/null; echo '0 2 * * * /usr/local/bin/pg-backup.sh') | crontab -"

  success "Backup script configured"
}

verify_postgresql() {
  log "Verifying PostgreSQL installation..."

  # Check service status
  local status=$(ssh_container "$PG_CONTAINER_VMID" "systemctl is-active postgresql")
  if [ "$status" = "active" ]; then
    success "PostgreSQL service is active"
  else
    error "PostgreSQL service is not active: $status"
    return 1
  fi

  # Check database connectivity
  local db_check=$(ssh_container "$PG_CONTAINER_VMID" "sudo -u postgres psql -l | wc -l")
  if [ "$db_check" -gt 0 ]; then
    success "PostgreSQL is responding"
  else
    error "PostgreSQL is not responding"
    return 1
  fi

  # Check pgvector installation
  local vector_check=$(ssh_container "$PG_CONTAINER_VMID" "sudo -u postgres psql -d $PG_DB -c \"SELECT extname FROM pg_extension WHERE extname='vector';\"")
  if echo "$vector_check" | grep -q "vector"; then
    success "pgvector extension is installed"
  else
    warning "pgvector extension may not be installed"
  fi

  # List databases
  log "Created databases:"
  ssh_container "$PG_CONTAINER_VMID" "sudo -u postgres psql -l" | sed 's/^/  /'

  success "PostgreSQL verification completed"
}

# Main execution
main "$@"
