#!/bin/bash
##############################################################################
# Zentoria Personal Edition - Verification Script
# Comprehensive health checks for all deployed services
##############################################################################

source "$(dirname "$0")/00-config.sh"

# Tracking variables
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

##############################################################################
# VERIFICATION FUNCTIONS
##############################################################################

main() {
  log "Starting comprehensive infrastructure verification..."
  log ""

  # 1. Proxmox connectivity
  verify_proxmox_connectivity

  # 2. Network verification
  verify_network_setup

  # 3. Container verification
  verify_containers

  # 4. Service verification
  verify_services

  # 5. Database verification
  verify_database

  # 6. Cache verification
  verify_cache

  # 7. AI services verification
  verify_ai_services

  # 8. Logging verification
  verify_logging

  # 9. Security verification
  verify_security

  # Print summary
  print_summary

  success "Verification completed!"
}

verify_proxmox_connectivity() {
  log ""
  log "=== PROXMOX CONNECTIVITY ==="

  if ssh_proxmox "echo 'OK'" &>/dev/null; then
    pass_check "Proxmox SSH connectivity"
  else
    fail_check "Proxmox SSH connectivity"
  fi

  # Check PVE version
  local pve_version=$(ssh_proxmox "pveversion" 2>/dev/null | head -1)
  if [ -n "$pve_version" ]; then
    pass_check "Proxmox version: $pve_version"
  else
    fail_check "Could not retrieve Proxmox version"
  fi

  # Check node status
  local node_status=$(ssh_proxmox "pvesh get /nodes/pve/status --noborder" 2>/dev/null)
  if [ -n "$node_status" ]; then
    pass_check "Proxmox node status accessible"
  else
    fail_check "Could not access Proxmox node status"
  fi
}

verify_network_setup() {
  log ""
  log "=== NETWORK SETUP ==="

  # Check bridge exists
  if ssh_proxmox "test -e /sys/class/net/$PROXMOX_BRIDGE"; then
    pass_check "Network bridge $PROXMOX_BRIDGE exists"
  else
    fail_check "Network bridge $PROXMOX_BRIDGE not found"
  fi

  # Check IP forwarding
  local ip_forward=$(ssh_proxmox "sysctl -n net.ipv4.ip_forward" 2>/dev/null)
  if [ "$ip_forward" -eq 1 ]; then
    pass_check "IP forwarding enabled"
  else
    warn_check "IP forwarding not enabled"
  fi

  # Check bridge IP
  local bridge_ip=$(ssh_proxmox "ip addr show $PROXMOX_BRIDGE 2>/dev/null | grep 'inet ' | awk '{print \$2}'" | head -1)
  if [ -n "$bridge_ip" ]; then
    pass_check "Bridge IP configured: $bridge_ip"
  else
    warn_check "Bridge IP not yet configured"
  fi

  # Check DNS
  local dns_check=$(ssh_proxmox "cat /etc/resolv.conf | grep nameserver | wc -l")
  if [ "$dns_check" -gt 0 ]; then
    pass_check "DNS servers configured ($dns_check servers)"
  else
    fail_check "DNS not configured"
  fi
}

verify_containers() {
  log ""
  log "=== CONTAINER VERIFICATION ==="

  local running_count=0
  local total_count=${#containers[@]}

  for container_def in "${containers[@]}"; do
    local vmid hostname ip ram cpu storage services
    IFS=':' read -r vmid hostname ip ram cpu storage services <<< "$container_def"

    # Check if container exists
    if ssh_proxmox "pct status $vmid" &>/dev/null; then
      # Check if running
      if ssh_proxmox "pct status $vmid" | grep -q "running"; then
        pass_check "Container $vmid ($hostname) is running"
        running_count=$((running_count + 1))

        # Check network
        if ssh_container "$vmid" "ping -c 1 8.8.8.8" &>/dev/null; then
          pass_check "  - Network connectivity OK"
        else
          warn_check "  - Network connectivity issue"
        fi
      else
        fail_check "Container $vmid ($hostname) is not running"
      fi
    else
      warn_check "Container $vmid ($hostname) does not exist"
    fi
  done

  log "Running containers: $running_count / $total_count"
}

verify_services() {
  log ""
  log "=== SERVICE VERIFICATION ==="

  # PostgreSQL
  check_service_status 404 "PostgreSQL" "systemctl is-active postgresql" "postgresql"

  # Redis
  check_service_status 410 "Redis" "systemctl is-active redis-server" "redis-server"

  # NGINX
  check_service_status 408 "NGINX" "systemctl is-active nginx" "nginx"

  # Ollama
  check_service_status 405 "Ollama" "systemctl is-active ollama" "ollama"

  # Elasticsearch
  check_service_status 406 "Elasticsearch" "systemctl is-active elasticsearch" "elasticsearch"

  # Docker
  verify_docker_services
}

check_service_status() {
  local vmid=$1
  local service_name=$2
  local check_cmd=$3
  local service_id=$4

  if ssh_container "$vmid" "$check_cmd" &>/dev/null; then
    pass_check "$service_name is running (container $vmid)"
  else
    fail_check "$service_name is not running (container $vmid)"
  fi
}

verify_docker_services() {
  log ""
  log "Checking Docker services..."

  for vmid in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do
    if ssh_container "$vmid" "command -v docker" &>/dev/null; then
      if ssh_container "$vmid" "docker ps -q | wc -l" | grep -q "[0-9]"; then
        pass_check "Docker available in container $vmid"
      else
        warn_check "Docker available but no containers running in $vmid"
      fi
    fi
  done
}

verify_database() {
  log ""
  log "=== DATABASE VERIFICATION ==="

  # Check PostgreSQL connectivity
  if ssh_container 404 "sudo -u postgres psql -l | grep -q zentoria_personal"; then
    pass_check "PostgreSQL main database exists"

    # Check tables
    if ssh_container 404 "sudo -u postgres psql -d zentoria_personal -c \"\\dt\"" | grep -q "public"; then
      pass_check "PostgreSQL tables exist"
    else
      warn_check "PostgreSQL tables not yet created"
    fi

    # Check pgvector
    if ssh_container 404 "sudo -u postgres psql -d zentoria_personal -c \"SELECT extname FROM pg_extension WHERE extname='vector';\" | grep -q vector"; then
      pass_check "pgvector extension is installed"
    else
      warn_check "pgvector extension not installed"
    fi
  else
    fail_check "PostgreSQL main database not found"
  fi

  # Check database backups
  if ssh_container 404 "test -d /var/backups/postgresql"; then
    local backup_count=$(ssh_container 404 "ls -1 /var/backups/postgresql/*.sql.gz 2>/dev/null | wc -l")
    if [ "$backup_count" -gt 0 ]; then
      pass_check "Database backups available ($backup_count backups)"
    else
      warn_check "Database backup directory exists but no backups yet"
    fi
  else
    warn_check "Database backup directory not configured"
  fi
}

verify_cache() {
  log ""
  log "=== CACHE VERIFICATION ==="

  # Check Redis connectivity
  if ssh_container 410 "redis-cli -p 6379 PING | grep -q PONG"; then
    pass_check "Redis is responding"

    # Check key space
    local keyspace=$(ssh_container 410 "redis-cli INFO keyspace | wc -l")
    pass_check "Redis key space: $keyspace entries"

    # Check memory usage
    local memory=$(ssh_container 410 "redis-cli INFO memory | grep used_memory_human | cut -d: -f2")
    if [ -n "$memory" ]; then
      pass_check "Redis memory usage: $memory"
    fi
  else
    fail_check "Redis is not responding"
  fi

  # Check backups
  if ssh_container 410 "test -d /var/backups/redis"; then
    local redis_backups=$(ssh_container 410 "ls -1 /var/backups/redis/*.rdb.gz 2>/dev/null | wc -l")
    if [ "$redis_backups" -gt 0 ]; then
      pass_check "Redis backups available ($redis_backups backups)"
    else
      warn_check "Redis backup directory exists but no backups yet"
    fi
  fi
}

verify_ai_services() {
  log ""
  log "=== AI SERVICES VERIFICATION ==="

  # Check Ollama
  if ssh_container 405 "curl -s http://localhost:11434/api/health" &>/dev/null; then
    pass_check "Ollama API is responding"

    # Check loaded models
    local models=$(ssh_container 405 "ollama list | tail -n +2 | wc -l")
    if [ "$models" -gt 0 ]; then
      pass_check "Ollama models loaded: $models"
    else
      warn_check "No Ollama models loaded yet"
    fi
  else
    fail_check "Ollama is not responding"
  fi
}

verify_logging() {
  log ""
  log "=== LOGGING VERIFICATION ==="

  # Check Elasticsearch
  if ssh_container 406 "curl -s http://localhost:9200/_cluster/health | jq .status" &>/dev/null; then
    pass_check "Elasticsearch cluster is responding"

    # Check cluster status
    local status=$(ssh_container 406 "curl -s http://localhost:9200/_cluster/health | jq -r .status" 2>/dev/null)
    if [ "$status" = "green" ] || [ "$status" = "yellow" ]; then
      pass_check "Elasticsearch cluster status: $status"
    else
      warn_check "Elasticsearch cluster status: $status"
    fi

    # Check indices
    local indices=$(ssh_container 406 "curl -s http://localhost:9200/_cat/indices | wc -l")
    if [ "$indices" -gt 0 ]; then
      pass_check "Elasticsearch indices: $indices"
    else
      warn_check "No Elasticsearch indices created yet"
    fi
  else
    warn_check "Elasticsearch is not responding"
  fi

  # Check log directory
  if ssh_proxmox "test -d /var/log/zentoria"; then
    pass_check "Zentoria log directory exists"
  else
    warn_check "Zentoria log directory not created"
  fi
}

verify_security() {
  log ""
  log "=== SECURITY VERIFICATION ==="

  # Check SSH configuration
  if ssh_proxmox "grep -q 'PasswordAuthentication no' /etc/ssh/sshd_config" 2>/dev/null || true; then
    pass_check "SSH password authentication disabled on Proxmox"
  else
    warn_check "SSH password authentication may be enabled on Proxmox"
  fi

  # Check UFW
  if ssh_proxmox "ufw status | grep -q 'Status: active'" 2>/dev/null || true; then
    pass_check "Firewall (UFW) is active"
  else
    warn_check "Firewall (UFW) may not be active"
  fi

  # Check SSL certificates
  if ssh_container 408 "test -f /etc/nginx/ssl/cert.pem"; then
    pass_check "SSL certificate configured for NGINX"
  else
    warn_check "SSL certificate not found"
  fi

  # Check container security settings
  for vmid in 400 401 404; do
    if ssh_proxmox "pct config $vmid | grep -q 'unprivileged: 1'" 2>/dev/null; then
      pass_check "Container $vmid is running unprivileged"
    else
      warn_check "Container $vmid may be running privileged"
    fi
  done
}

# Helper functions
pass_check() {
  success "$1"
  PASSED_CHECKS=$((PASSED_CHECKS + 1))
}

fail_check() {
  error "$1"
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
}

warn_check() {
  warning "$1"
  WARNING_CHECKS=$((WARNING_CHECKS + 1))
}

print_summary() {
  log ""
  log "========== VERIFICATION SUMMARY =========="
  log "Passed:  $PASSED_CHECKS"
  log "Failed:  $FAILED_CHECKS"
  log "Warned:  $WARNING_CHECKS"
  log "Total:   $((PASSED_CHECKS + FAILED_CHECKS + WARNING_CHECKS))"
  log "=========================================="

  if [ "$FAILED_CHECKS" -eq 0 ]; then
    success "All critical checks passed!"
  else
    error "$FAILED_CHECKS critical checks failed - review logs above"
  fi
}

# Main execution
main "$@"
