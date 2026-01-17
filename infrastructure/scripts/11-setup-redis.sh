#!/bin/bash
##############################################################################
# Zentoria Personal Edition - Redis Setup
# Installs and configures Redis in container 410
##############################################################################

source "$(dirname "$0")/00-config.sh"

# Redis specific settings
REDIS_CONTAINER_VMID=410
REDIS_USER="redis"

##############################################################################
# REDIS SETUP
##############################################################################

main() {
  log "Starting Redis setup on container $REDIS_CONTAINER_VMID..."

  # Check if container exists
  if ! ssh_proxmox "pct status $REDIS_CONTAINER_VMID" &>/dev/null; then
    error "Container $REDIS_CONTAINER_VMID does not exist"
    exit 1
  fi

  # Execute setup steps
  install_redis
  configure_redis
  setup_persistence
  setup_monitoring
  verify_redis

  success "Redis setup completed!"
}

install_redis() {
  log "Installing Redis..."

  # Add Redis repository
  ssh_container "$REDIS_CONTAINER_VMID" "curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg"

  ssh_container "$REDIS_CONTAINER_VMID" "echo \"deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb \$(lsb_release -cs) main\" | tee /etc/apt/sources.list.d/redis.list"

  # Install Redis
  ssh_container "$REDIS_CONTAINER_VMID" "apt-get update && apt-get install -y redis-server redis-tools"

  # Enable service
  ssh_container "$REDIS_CONTAINER_VMID" "systemctl enable redis-server"

  success "Redis installed"
}

configure_redis() {
  log "Configuring Redis..."

  # Backup original config
  ssh_container "$REDIS_CONTAINER_VMID" "cp /etc/redis/redis.conf /etc/redis/redis.conf.backup"

  # Create new configuration
  ssh_container "$REDIS_CONTAINER_VMID" "cat > /etc/redis/redis.conf" << 'EOF'
# Zentoria Personal Edition - Redis Configuration
port 6379
bind 0.0.0.0
protected-mode yes
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Daemonize
daemonize no
supervised no
pidfile /var/run/redis_6379.pid

# Logging
loglevel notice
logfile ""
syslog-enabled yes
syslog-ident redis

# Database
databases 16

# Snapshots (RDB persistence)
save 900 1
save 300 10
save 60 10000
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /var/lib/redis

# Replication
replicaof no one
replica-serve-stale-data yes
replica-read-only yes
repl-diskless-sync no
repl-diskless-sync-delay 5

# Security
requirepass zentoria-redis-2024
maxclients 10000

# Memory Management
maxmemory 1gb
maxmemory-policy allkeys-lru

# AOF persistence
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no

# Lua scripting
lua-time-limit 5000

# Key eviction
lazyfree-lazy-eviction no
lazyfree-lazy-expire no

# Advanced config
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
list-compress-depth 0
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64
hll-sparse-max-bytes 3000

# Active rehashing
activerehashing yes

# Client output buffer limits
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit replica 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60

# Frequency of active defragmentation
active-defrag-ignore-bytes 100mb
active-defrag-threshold-lower 10
active-defrag-threshold-upper 100

# Stop writes on error
stop-writes-on-bgsave-error yes

# Slow log
slowlog-log-slower-than 10000
slowlog-max-len 128
EOF

  success "Redis configuration applied"
}

setup_persistence() {
  log "Setting up persistence and backups..."

  # Create necessary directories
  ssh_container "$REDIS_CONTAINER_VMID" "mkdir -p /var/lib/redis /var/log/redis && chown -R redis:redis /var/lib/redis /var/log/redis"

  # Create backup directory
  ssh_container "$REDIS_CONTAINER_VMID" "mkdir -p /var/backups/redis && chown redis:redis /var/backups/redis"

  # Create backup script
  ssh_container "$REDIS_CONTAINER_VMID" "cat > /usr/local/bin/redis-backup.sh" << 'EOF'
#!/bin/bash
# Redis backup script

BACKUP_DIR="/var/backups/redis"
REDIS_CLI="/usr/bin/redis-cli"
REDIS_PASS="zentoria-redis-2024"
RETENTION_DAYS=30

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/redis_$TIMESTAMP.rdb"

# Create BGSAVE
$REDIS_CLI -a $REDIS_PASS BGSAVE

# Wait for save to complete
while [ $($REDIS_CLI -a $REDIS_PASS LASTSAVE) -eq $(date +%s) ]; do
    sleep 1
done

# Copy dump file
cp /var/lib/redis/dump.rdb "$BACKUP_FILE"

# Compress
gzip "$BACKUP_FILE"

# Log
echo "Backup created: ${BACKUP_FILE}.gz" >> "$BACKUP_DIR/backup.log"

# Cleanup old backups
find "$BACKUP_DIR" -name "redis_*.rdb.gz" -mtime +$RETENTION_DAYS -delete

exit 0
EOF

  ssh_container "$REDIS_CONTAINER_VMID" "chmod +x /usr/local/bin/redis-backup.sh"

  # Add cron job for daily backup
  ssh_container "$REDIS_CONTAINER_VMID" "(crontab -l 2>/dev/null; echo '0 3 * * * /usr/local/bin/redis-backup.sh') | crontab -"

  success "Persistence and backups configured"
}

setup_monitoring() {
  log "Setting up monitoring..."

  # Create monitoring script
  ssh_container "$REDIS_CONTAINER_VMID" "cat > /usr/local/bin/redis-health-check.sh" << 'EOF'
#!/bin/bash
# Redis health check script

REDIS_CLI="/usr/bin/redis-cli"
REDIS_PASS="zentoria-redis-2024"

# Ping check
ping_result=$($REDIS_CLI -a $REDIS_PASS ping 2>&1)
if [ "$ping_result" != "PONG" ]; then
    echo "ERROR: Redis not responding to PING"
    exit 1
fi

# Memory check
memory_usage=$($REDIS_CLI -a $REDIS_PASS info memory | grep used_memory_human | cut -d: -f2)
echo "Redis is healthy. Memory usage: $memory_usage"

# Connection check
clients=$($REDIS_CLI -a $REDIS_PASS info clients | grep connected_clients | cut -d: -f2)
echo "Connected clients: $clients"

# Key space check
keys=$($REDIS_CLI -a $REDIS_PASS dbsize | cut -d: -f2)
echo "Total keys: $keys"

exit 0
EOF

  ssh_container "$REDIS_CONTAINER_VMID" "chmod +x /usr/local/bin/redis-health-check.sh"

  success "Monitoring script created"
}

verify_redis() {
  log "Verifying Redis installation..."

  # Start Redis
  ssh_container "$REDIS_CONTAINER_VMID" "systemctl start redis-server"

  # Wait for Redis to start
  sleep 2

  # Check service status
  local status=$(ssh_container "$REDIS_CONTAINER_VMID" "systemctl is-active redis-server")
  if [ "$status" = "active" ]; then
    success "Redis service is active"
  else
    error "Redis service is not active: $status"
    return 1
  fi

  # Test connectivity
  if ssh_container "$REDIS_CONTAINER_VMID" "redis-cli -p 6379 PING | grep -q PONG"; then
    success "Redis is responding to PING"
  else
    error "Redis is not responding"
    return 1
  fi

  # Run health check
  log "Running health check..."
  ssh_container "$REDIS_CONTAINER_VMID" "/usr/local/bin/redis-health-check.sh"

  # Get info
  log "Redis information:"
  ssh_container "$REDIS_CONTAINER_VMID" "redis-cli INFO server | head -20" | sed 's/^/  /'

  success "Redis verification completed"
}

# Main execution
main "$@"
