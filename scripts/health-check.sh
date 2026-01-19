#!/bin/bash

#############################################################################
# Zentoria Health Check Script
#
# Validates all service health across the infrastructure
#
# Usage: ./health-check.sh [verbose]
#############################################################################

set -euo pipefail

# Configuration
PROXMOX_HOST="${PROXMOX_HOST:-100.121.19.12}"
PROXMOX_USER="${PROXMOX_USER:-root}"
VERBOSE="${1:-false}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Logging functions
log_section() {
    echo ""
    echo -e "${PURPLE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${PURPLE}$1${NC}"
    echo -e "${PURPLE}═══════════════════════════════════════════════════════${NC}"
}

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

log_fail() {
    echo -e "${RED}✗${NC} $1"
    FAILED=$((FAILED + 1))
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

log_info() {
    if [ "$VERBOSE" = "true" ] || [ "$VERBOSE" = "-v" ]; then
        echo -e "${BLUE}ℹ${NC} $1"
    fi
}

# Check Proxmox connectivity
check_proxmox() {
    log_section "Proxmox Connectivity"

    if ssh -o ConnectTimeout=5 "${PROXMOX_USER}@${PROXMOX_HOST}" "true" 2>/dev/null; then
        log_pass "SSH connection to Proxmox"
    else
        log_fail "SSH connection to Proxmox"
        return 1
    fi
}

# Check container status
check_containers() {
    log_section "Container Status"

    local containers=(
        "440:Frontend"
        "441:Backend"
        "442:NGINX"
        "443:Qdrant"
        "404:PostgreSQL"
        "410:Redis"
        "444:AI Orchestrator"
    )

    for container in "${containers[@]}"; do
        local id="${container%%:*}"
        local name="${container##*:}"

        if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct status ${id}" 2>/dev/null | grep -q "running"; then
            log_pass "Container ${id} (${name}) is running"
        else
            log_fail "Container ${id} (${name}) is not running"
        fi
    done
}

# Check frontend
check_frontend() {
    log_section "Frontend (LXC 440)"

    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 440 -- curl -sf http://localhost:3000 > /dev/null" 2>/dev/null; then
        log_pass "Frontend is responding on port 3000"
    else
        log_fail "Frontend is not responding"
        return 1
    fi

    # Check static assets
    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 440 -- curl -sI http://localhost:3000/_next/static | head -1 | grep -q '200\|301\|302'" 2>/dev/null; then
        log_pass "Static assets are accessible"
    else
        log_warn "Static assets may not be accessible"
    fi
}

# Check backend
check_backend() {
    log_section "Backend (LXC 441)"

    local health=$(ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 441 -- curl -s http://localhost:3000/health 2>/dev/null" | grep -o '"status"' || echo "")

    if [ -n "$health" ]; then
        log_pass "Backend health check successful"
    else
        log_fail "Backend health check failed"
        return 1
    fi

    # Check API endpoint
    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 441 -- curl -sf http://localhost:3000/api/v1/health > /dev/null" 2>/dev/null; then
        log_pass "API is responding"
    else
        log_warn "API may not be responding"
    fi
}

# Check NGINX
check_nginx() {
    log_section "NGINX (LXC 442)"

    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 442 -- curl -sf http://localhost/health > /dev/null" 2>/dev/null; then
        log_pass "NGINX is responding"
    else
        log_fail "NGINX is not responding"
        return 1
    fi

    # Check config
    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 442 -- nginx -t" 2>/dev/null | grep -q "successful"; then
        log_pass "NGINX configuration is valid"
    else
        log_warn "NGINX configuration may have issues"
    fi

    # Check upstreams
    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 442 -- grep -q 'upstream' /etc/nginx/conf.d/zentoria.conf" 2>/dev/null; then
        log_pass "NGINX upstreams configured"
    else
        log_warn "NGINX upstreams may not be configured"
    fi
}

# Check database
check_database() {
    log_section "PostgreSQL (LXC 404)"

    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 404 -- psql -U zentoria zentoria_main -c 'SELECT 1' > /dev/null 2>&1" 2>/dev/null; then
        log_pass "PostgreSQL is responsive"
    else
        log_fail "PostgreSQL is not responsive"
        return 1
    fi

    # Check connections
    local conn=$(ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 404 -- psql -U zentoria zentoria_main -t -c \"SELECT count(*) FROM pg_stat_activity\" 2>/dev/null" | tr -d ' ' || echo "0")
    log_info "Active database connections: ${conn}"

    # Check schema
    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 404 -- psql -U zentoria zentoria_main -c \"\\d\" > /dev/null 2>&1" 2>/dev/null; then
        log_pass "Database schema is intact"
    else
        log_warn "Database schema validation failed"
    fi
}

# Check Redis
check_redis() {
    log_section "Redis (LXC 410)"

    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 410 -- redis-cli ping > /dev/null" 2>/dev/null; then
        log_pass "Redis is responsive"
    else
        log_fail "Redis is not responsive"
        return 1
    fi

    # Check memory
    local mem=$(ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 410 -- redis-cli info memory | grep used_memory_human" 2>/dev/null | cut -d: -f2 || echo "N/A")
    log_info "Redis memory usage: ${mem}"

    # Check keys
    local keys=$(ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 410 -- redis-cli dbsize | grep keys" 2>/dev/null | awk '{print $1}' || echo "N/A")
    log_info "Redis keys: ${keys}"
}

# Check Qdrant
check_qdrant() {
    log_section "Qdrant (LXC 443)"

    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 443 -- curl -sf http://localhost:6333/healthz > /dev/null" 2>/dev/null; then
        log_pass "Qdrant is responsive"
    else
        log_fail "Qdrant is not responsive"
        return 1
    fi

    # Check collections
    local collections=$(ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 443 -- curl -s http://localhost:6333/collections | grep -o '\"name\"' | wc -l" 2>/dev/null || echo "0")
    log_info "Qdrant collections: ${collections}"
}

# Check AI Orchestrator
check_ai() {
    log_section "AI Orchestrator (LXC 444)"

    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 444 -- curl -sf http://localhost:8000/api/v1/health > /dev/null" 2>/dev/null; then
        log_pass "AI Orchestrator is responsive"
    else
        log_fail "AI Orchestrator is not responsive"
        return 1
    fi

    # Check Ollama models
    local models=$(ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 444 -- ollama list 2>/dev/null" | wc -l || echo "0")
    log_info "Ollama models available: $((models - 1))"
}

# Check network connectivity
check_network() {
    log_section "Network Connectivity"

    # Frontend to Backend
    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 440 -- ping -c 1 -W 2 192.168.220.241 > /dev/null" 2>/dev/null; then
        log_pass "Frontend can reach Backend"
    else
        log_warn "Frontend cannot reach Backend"
    fi

    # Backend to Database
    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 441 -- ping -c 1 -W 2 192.168.220.244 > /dev/null" 2>/dev/null; then
        log_pass "Backend can reach Database"
    else
        log_warn "Backend cannot reach Database"
    fi

    # Backend to Redis
    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 441 -- ping -c 1 -W 2 192.168.220.250 > /dev/null" 2>/dev/null; then
        log_pass "Backend can reach Redis"
    else
        log_warn "Backend cannot reach Redis"
    fi

    # Backend to AI
    if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec 441 -- ping -c 1 -W 2 192.168.220.245 > /dev/null" 2>/dev/null; then
        log_pass "Backend can reach AI Orchestrator"
    else
        log_warn "Backend cannot reach AI Orchestrator"
    fi
}

# Check disk space
check_disk() {
    log_section "Disk Space"

    local containers=(
        "440"
        "441"
        "442"
        "443"
        "404"
        "410"
        "444"
    )

    for container in "${containers[@]}"; do
        local usage=$(ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec ${container} -- df -h / | tail -1 | awk '{print \$5}'" 2>/dev/null | tr -d '%' || echo "0")

        if [ "$usage" -lt 80 ]; then
            log_pass "Container ${container} disk usage: ${usage}%"
        elif [ "$usage" -lt 90 ]; then
            log_warn "Container ${container} disk usage: ${usage}% (high)"
        else
            log_fail "Container ${container} disk usage: ${usage}% (critical)"
        fi
    done
}

# Check memory
check_memory() {
    log_section "Memory Usage"

    local containers=(
        "441:Backend"
        "440:Frontend"
        "404:Database"
        "410:Redis"
    )

    for container in "${containers[@]}"; do
        local id="${container%%:*}"
        local name="${container##*:}"
        local usage=$(ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct exec ${id} -- free -h | grep Mem | awk '{print \$3/\$2*100}' | cut -d. -f1" 2>/dev/null || echo "0")

        log_info "Container ${id} (${name}) memory usage: ~${usage}%"
    done
}

# Print summary
print_summary() {
    echo ""
    log_section "Health Check Summary"

    echo ""
    echo -e "${GREEN}Passed:${NC} ${PASSED}"
    echo -e "${RED}Failed:${NC} ${FAILED}"
    echo -e "${YELLOW}Warnings:${NC} ${WARNINGS}"
    echo ""

    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All systems operational${NC}"
        echo ""
        exit 0
    else
        echo -e "${RED}✗ Some systems have issues${NC}"
        echo ""
        exit 1
    fi
}

# Main execution
main() {
    echo ""
    echo -e "${PURPLE}╔═════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║          Zentoria Health Check - $(date +%Y-%m-%d)           ║${NC}"
    echo -e "${PURPLE}╚═════════════════════════════════════════════════════════╝${NC}"

    check_proxmox || exit 1
    check_containers
    check_frontend || true
    check_backend || true
    check_nginx || true
    check_database || true
    check_redis || true
    check_qdrant || true
    check_ai || true
    check_network
    check_disk
    check_memory

    print_summary
}

# Run main function
main "$@"
