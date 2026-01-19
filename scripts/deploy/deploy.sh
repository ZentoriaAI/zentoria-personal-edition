#!/bin/bash

#############################################################################
# Zentoria All-in-One Deployment Script
#
# Orchestrates deployment of all services in correct order
# Handles feature flags and coordinated rollback
#
# Usage: ./deploy.sh [environment] [version]
#   environment: staging or production (default: staging)
#   version: Docker image tag (default: latest)
#############################################################################

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-staging}"
VERSION="${2:-latest}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_FAILED=false

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Logging functions
log_section() {
    echo ""
    echo -e "${PURPLE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${PURPLE}$1${NC}"
    echo -e "${PURPLE}═══════════════════════════════════════════════════════${NC}"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Print header
print_header() {
    echo ""
    echo -e "${PURPLE}╔═════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║         Zentoria Personal Edition Deployment            ║${NC}"
    echo -e "${PURPLE}╚═════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
}

# Pre-flight checks
preflight_checks() {
    log_section "Pre-flight Checks"

    # Check scripts exist and are executable
    local scripts=(
        "${SCRIPT_DIR}/deploy-backend.sh"
        "${SCRIPT_DIR}/deploy-frontend.sh"
    )

    for script in "${scripts[@]}"; do
        if [ ! -x "$script" ]; then
            log_error "Script not found or not executable: $script"
            exit 1
        fi
    done

    log_success "All deployment scripts found"

    # Validate environment
    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        log_error "Invalid environment: $ENVIRONMENT (must be staging or production)"
        exit 1
    fi

    log_success "Environment validation passed"

    # Confirm deployment
    echo ""
    read -p "Proceed with deployment to $ENVIRONMENT? (yes/no) " -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_warn "Deployment cancelled"
        exit 0
    fi

    log_success "Deployment confirmed"
}

# Backup databases
backup_databases() {
    log_section "Database Backup"

    log_info "Creating database backup..."

    ssh root@100.121.19.12 << 'EOF'
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        BACKUP_DIR="/opt/zentoria/backups"
        mkdir -p "${BACKUP_DIR}"

        # PostgreSQL backup
        pct exec 404 -- bash -c "
            pg_dump -U zentoria zentoria_main > ${BACKUP_DIR}/zentoria_main.${TIMESTAMP}.sql
            gzip ${BACKUP_DIR}/zentoria_main.${TIMESTAMP}.sql
            echo 'PostgreSQL backup completed: zentoria_main.${TIMESTAMP}.sql.gz'
        "

        # Redis backup (if needed)
        pct exec 410 -- redis-cli bgsave > /dev/null 2>&1
        pct exec 410 -- bash -c "
            cp /var/lib/redis/dump.rdb ${BACKUP_DIR}/dump.rdb.${TIMESTAMP}
            echo 'Redis backup completed'
        "

        echo "Backups stored in: ${BACKUP_DIR}"
EOF

    if [ $? -eq 0 ]; then
        log_success "Database backups completed"
    else
        log_error "Database backup failed"
        exit 1
    fi
}

# Deploy database migrations
deploy_database() {
    log_section "Database Migrations"

    log_info "Running pending migrations..."

    ssh root@100.121.19.12 << EOF
        pct exec 441 -- bash -c "
            cd /opt/zentoria-api-full

            # Check pending migrations
            npx prisma migrate status || {
                echo 'Failed to check migration status'
                exit 1
            }

            # Deploy migrations
            npx prisma migrate deploy || {
                echo 'Failed to deploy migrations'
                exit 1
            }

            # Verify schema
            npx prisma db validate || {
                echo 'Schema validation failed'
                exit 1
            }

            echo 'Database migrations completed'
        "
EOF

    if [ $? -eq 0 ]; then
        log_success "Database migrations completed"
    else
        log_error "Database migrations failed"
        DEPLOYMENT_FAILED=true
        return 1
    fi
}

# Deploy backend
deploy_backend() {
    log_section "Backend Deployment (MCP Gateway)"

    log_info "Deploying backend to staging environment..."

    if bash "${SCRIPT_DIR}/deploy-backend.sh" "$ENVIRONMENT" "$VERSION"; then
        log_success "Backend deployment successful"
    else
        log_error "Backend deployment failed"
        DEPLOYMENT_FAILED=true
        return 1
    fi
}

# Deploy frontend
deploy_frontend() {
    log_section "Frontend Deployment (Next.js)"

    log_info "Deploying frontend to staging environment..."

    if bash "${SCRIPT_DIR}/deploy-frontend.sh" "$ENVIRONMENT" "$VERSION"; then
        log_success "Frontend deployment successful"
    else
        log_error "Frontend deployment failed"
        DEPLOYMENT_FAILED=true
        return 1
    fi
}

# Configure feature flags
configure_feature_flags() {
    log_section "Feature Flags Configuration"

    log_info "Configuring feature flags for $ENVIRONMENT..."

    ssh root@100.121.19.12 << EOF
        pct exec 441 -- bash -c "
            cd /opt/zentoria-api-full

            # Update feature flags configuration
            cat > config/feature-flags.env << 'FFEOF'
FEATURE_CHAT_V2_ENABLED=false
FEATURE_CHAT_V2_ROLLOUT=0
FEATURE_RAG_SEARCH_ENABLED=true
FEATURE_RAG_SEARCH_ROLLOUT=100
FEATURE_WEBSOCKET_COMPRESSION_ENABLED=false
FEATURE_WEBSOCKET_COMPRESSION_ROLLOUT=0
FEATURE_NEW_VECTOR_DB_ENABLED=false
FEATURE_NEW_VECTOR_DB_ROLLOUT=0
FFEOF

            echo 'Feature flags configured'

            # Restart backend to apply flags
            docker compose restart
            sleep 5
        "
EOF

    if [ $? -eq 0 ]; then
        log_success "Feature flags configured"
    else
        log_error "Feature flags configuration failed"
        DEPLOYMENT_FAILED=true
        return 1
    fi
}

# Run integration tests
integration_tests() {
    log_section "Integration Tests"

    log_info "Running integration tests..."

    ssh root@100.121.19.12 << 'EOF'
        pct exec 441 -- bash -c "
            cd /opt/zentoria-api-full

            # Wait for services to be ready
            echo 'Waiting for services to be ready...'
            sleep 10

            # Test backend health
            curl -s http://localhost:3000/health | jq . || {
                echo 'Backend health check failed'
                exit 1
            }

            # Test database connection
            npx prisma db execute --stdin << 'SQL'
SELECT 1;
SQL
            || {
                echo 'Database connection failed'
                exit 1
            }

            # Test Redis connection
            redis-cli ping || {
                echo 'Redis connection failed'
                exit 1
            }

            echo 'Integration tests passed'
        "
EOF

    if [ $? -eq 0 ]; then
        log_success "Integration tests passed"
    else
        log_error "Integration tests failed"
        DEPLOYMENT_FAILED=true
        return 1
    fi
}

# Verify end-to-end connectivity
verify_connectivity() {
    log_section "End-to-End Connectivity Verification"

    log_info "Verifying all services are accessible..."

    local all_healthy=true

    # Frontend
    log_info "Testing frontend..."
    if ssh root@100.121.19.12 "pct exec 440 -- curl -s -f http://localhost:3000 > /dev/null" 2>/dev/null; then
        log_success "Frontend: OK"
    else
        log_error "Frontend: FAILED"
        all_healthy=false
    fi

    # Backend
    log_info "Testing backend..."
    if ssh root@100.121.19.12 "pct exec 441 -- curl -s -f http://localhost:3000/health > /dev/null" 2>/dev/null; then
        log_success "Backend: OK"
    else
        log_error "Backend: FAILED"
        all_healthy=false
    fi

    # NGINX
    log_info "Testing NGINX..."
    if ssh root@100.121.19.12 "pct exec 442 -- curl -s -f http://localhost/ > /dev/null" 2>/dev/null; then
        log_success "NGINX: OK"
    else
        log_error "NGINX: FAILED"
        all_healthy=false
    fi

    # AI Orchestrator
    log_info "Testing AI Orchestrator..."
    if ssh root@100.121.19.12 "pct exec 444 -- curl -s -f http://localhost:8000/api/v1/health > /dev/null" 2>/dev/null; then
        log_success "AI Orchestrator: OK"
    else
        log_error "AI Orchestrator: FAILED"
        all_healthy=false
    fi

    # Database
    log_info "Testing Database..."
    if ssh root@100.121.19.12 "pct exec 404 -- psql -U zentoria zentoria_main -c 'SELECT 1' > /dev/null" 2>/dev/null; then
        log_success "Database: OK"
    else
        log_error "Database: FAILED"
        all_healthy=false
    fi

    if [ "$all_healthy" = true ]; then
        log_success "All services healthy"
        return 0
    else
        log_error "Some services are unhealthy"
        return 1
    fi
}

# Rollback all services
rollback_all() {
    log_section "Rolling Back All Services"

    log_error "Initiating rollback due to deployment failure..."

    # Rollback backend
    log_info "Rolling back backend..."
    ssh root@100.121.19.12 << 'EOF'
        pct exec 441 -- bash -c "
            cd /opt/zentoria-api-full
            LATEST_BACKUP=\$(ls -t backups/docker-compose.yml.* 2>/dev/null | head -1)
            if [ -n \"\$LATEST_BACKUP\" ]; then
                cp \"\$LATEST_BACKUP\" docker-compose.yml
                docker compose up -d --no-deps
                sleep 5
                echo 'Backend rollback completed'
            fi
        "
EOF

    # Rollback frontend
    log_info "Rolling back frontend..."
    ssh root@100.121.19.12 << 'EOF'
        pct exec 440 -- bash -c "
            cd /opt/zentoria-frontend
            LATEST_BACKUP=\$(ls -t backups/.next.* 2>/dev/null | head -1)
            if [ -n \"\$LATEST_BACKUP\" ]; then
                rm -rf .next
                cp -r \"\$LATEST_BACKUP\" .next
                docker compose up -d --no-deps
                sleep 5
                echo 'Frontend rollback completed'
            fi
        "
EOF

    log_error "Rollback completed. Please investigate the failure."
}

# Deployment summary
print_summary() {
    local status=$1

    echo ""
    log_section "Deployment Summary"

    echo ""
    echo "Status: $status"
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""

    if [ "$status" = "SUCCESS" ]; then
        echo "All services deployed successfully!"
        echo ""
        echo "Access your application:"
        if [ "$ENVIRONMENT" = "production" ]; then
            echo "  Frontend: https://ai.zentoria.ai"
            echo "  API: https://ai.zentoria.ai/api"
            echo "  AI: https://ai.zentoria.ai/ai"
        else
            echo "  Frontend: https://staging.zentoria.ai"
            echo "  API: https://staging.zentoria.ai/api"
            echo "  AI: https://staging.zentoria.ai/ai"
        fi
    else
        echo "Deployment FAILED. Review logs and rollback as needed."
        echo ""
        echo "Troubleshooting:"
        echo "  1. Check service logs: ssh root@100.121.19.12 'pct exec [container] -- tail -f /var/log/...'"
        echo "  2. Verify connectivity: ssh root@100.121.19.12 'pct exec [container] -- curl localhost:port/health'"
        echo "  3. Manual rollback: ./rollback.sh"
    fi

    echo ""
}

# Main execution
main() {
    print_header
    preflight_checks

    # Pre-deployment
    backup_databases

    # Deployment sequence (respecting dependencies)
    if ! deploy_database; then
        log_error "Database migrations failed - aborting deployment"
        exit 1
    fi

    if ! deploy_backend; then
        rollback_all
        print_summary "FAILED"
        exit 1
    fi

    if ! deploy_frontend; then
        rollback_all
        print_summary "FAILED"
        exit 1
    fi

    # Post-deployment
    configure_feature_flags

    if ! integration_tests; then
        rollback_all
        print_summary "FAILED"
        exit 1
    fi

    if ! verify_connectivity; then
        rollback_all
        print_summary "FAILED"
        exit 1
    fi

    # Success
    print_summary "SUCCESS"
    exit 0
}

# Run main function
main "$@"
