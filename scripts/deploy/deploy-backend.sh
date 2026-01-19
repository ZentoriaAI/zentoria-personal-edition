#!/bin/bash

#############################################################################
# Zentoria Backend Deployment Script
#
# Deploys MCP Gateway (Fastify) to Container 441
# Supports rolling update and blue/green deployments
#
# Usage: ./deploy-backend.sh [environment] [version]
#   environment: staging or production (default: staging)
#   version: Docker image tag (default: latest)
#############################################################################

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-staging}"
VERSION="${2:-latest}"
PROXMOX_HOST="${PROXMOX_HOST:-100.121.19.12}"
PROXMOX_USER="${PROXMOX_USER:-root}"
BACKEND_CONTAINER=441
BACKUP_CONTAINER=411
DEPLOY_DIR="/opt/zentoria-api-full"
REGISTRY="ghcr.io/ZentoriaAI"
IMAGE="zentoria-mcp-gateway"
HEALTH_CHECK_TIMEOUT=300
HEALTH_CHECK_INTERVAL=10
HEALTH_CHECK_RETRIES=30

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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
    echo "=========================================="
    echo "  Zentoria Backend Deployment"
    echo "=========================================="
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "Container: $BACKEND_CONTAINER"
    echo "=========================================="
    echo ""
}

# Pre-flight checks
preflight_checks() {
    log_info "Running pre-flight checks..."

    # Check SSH access
    if ! ssh -o ConnectTimeout=5 "${PROXMOX_USER}@${PROXMOX_HOST}" "true" 2>/dev/null; then
        log_error "Cannot connect to Proxmox host ${PROXMOX_HOST}"
        exit 1
    fi

    # Check container exists and is running
    if ! ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct status ${BACKEND_CONTAINER}" | grep -q "running"; then
        log_error "Container ${BACKEND_CONTAINER} is not running"
        exit 1
    fi

    log_success "Pre-flight checks passed"
}

# Validate deployment manifest
validate_manifest() {
    log_info "Validating deployment manifest..."

    # Check image exists
    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << EOF
        pct exec ${BACKEND_CONTAINER} -- bash -c "
            echo 'Checking image pull...'
            docker pull ${REGISTRY}/${IMAGE}:${VERSION} > /dev/null 2>&1
            if [ \$? -ne 0 ]; then
                echo 'Image not found: ${REGISTRY}/${IMAGE}:${VERSION}'
                exit 1
            fi
            echo 'Image validated'
        "
EOF

    if [ $? -ne 0 ]; then
        log_error "Image validation failed"
        exit 1
    fi

    log_success "Manifest validation passed"
}

# Backup current state
backup_current() {
    log_info "Backing up current deployment..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << 'EOF'
        pct exec 441 -- bash -c "
            mkdir -p /opt/zentoria-api-full/backups
            TIMESTAMP=$(date +%Y%m%d_%H%M%S)

            # Backup compose file and environment
            cp /opt/zentoria-api-full/docker-compose.yml /opt/zentoria-api-full/backups/docker-compose.yml.${TIMESTAMP}
            cp /opt/zentoria-api-full/.env /opt/zentoria-api-full/backups/.env.${TIMESTAMP} 2>/dev/null || true

            # Export current container image reference
            docker inspect zentoria-mcp-gateway:current --format='{{.RepoTags}}' > /opt/zentoria-api-full/backups/current-image.${TIMESTAMP} 2>/dev/null || true

            # Save Prisma schema
            cp /opt/zentoria-api-full/prisma/schema.prisma /opt/zentoria-api-full/backups/schema.${TIMESTAMP} 2>/dev/null || true

            echo 'Backup created: '${TIMESTAMP}
        "
EOF

    log_success "Backup completed"
}

# Deploy using rolling update strategy
deploy_rolling_update() {
    log_info "Starting rolling update deployment..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << EOF
        pct exec ${BACKEND_CONTAINER} -- bash -c "
            cd ${DEPLOY_DIR}

            # Pull new image
            echo 'Pulling image: ${REGISTRY}/${IMAGE}:${VERSION}'
            docker pull ${REGISTRY}/${IMAGE}:${VERSION}

            # Update docker-compose.yml with new image
            sed -i 's|image: .*${IMAGE}.*|image: ${REGISTRY}/${IMAGE}:${VERSION}|g' docker-compose.yml

            # Restart service with new image (rolling update)
            echo 'Restarting service...'
            docker compose up -d --no-deps --build --pull always

            # Wait for service to stabilize
            sleep 5
            echo 'Deployment initiated'
        "
EOF

    log_success "Rolling update deployed"
}

# Perform health checks
health_check() {
    log_info "Running health checks (${HEALTH_CHECK_RETRIES} retries, ${HEALTH_CHECK_INTERVAL}s interval)..."

    local attempt=0
    local success=false

    while [ $attempt -lt $HEALTH_CHECK_RETRIES ]; do
        attempt=$((attempt + 1))

        if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << EOF 2>/dev/null
            pct exec ${BACKEND_CONTAINER} -- curl -s -f http://localhost:3000/health > /dev/null
EOF
        then
            log_success "Health check passed (attempt $attempt)"
            success=true
            break
        else
            log_warn "Health check failed (attempt $attempt/$HEALTH_CHECK_RETRIES)"
            if [ $attempt -lt $HEALTH_CHECK_RETRIES ]; then
                sleep $HEALTH_CHECK_INTERVAL
            fi
        fi
    done

    if [ "$success" = false ]; then
        log_error "Health check failed after $HEALTH_CHECK_RETRIES attempts"
        return 1
    fi

    return 0
}

# Run smoke tests
smoke_tests() {
    log_info "Running smoke tests..."

    # Test API endpoints
    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << 'EOF'
        pct exec 441 -- bash -c "
            echo 'Testing health endpoint...'
            curl -s http://localhost:3000/health | grep -q 'ok' || exit 1

            echo 'Testing API key endpoint...'
            curl -s -H 'X-API-Key: test' http://localhost:3000/api/v1/health | grep -q 'status' || exit 1

            echo 'Smoke tests passed'
        "
EOF

    if [ $? -ne 0 ]; then
        log_error "Smoke tests failed"
        return 1
    fi

    log_success "Smoke tests passed"
    return 0
}

# Rollback to previous version
rollback() {
    log_error "Rolling back deployment..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << 'EOF'
        pct exec 441 -- bash -c "
            cd /opt/zentoria-api-full

            # Get previous backup
            LATEST_BACKUP=$(ls -t backups/docker-compose.yml.* 2>/dev/null | head -1)

            if [ -z \"$LATEST_BACKUP\" ]; then
                echo 'No backup found for rollback'
                exit 1
            fi

            echo 'Restoring from backup: '$LATEST_BACKUP
            cp \"$LATEST_BACKUP\" docker-compose.yml

            # Restart with previous version
            docker compose up -d --no-deps

            # Wait for service to stabilize
            sleep 5

            # Verify health
            if curl -s -f http://localhost:3000/health > /dev/null; then
                echo 'Rollback successful'
                exit 0
            else
                echo 'Rollback verification failed'
                exit 1
            fi
        "
EOF

    if [ $? -eq 0 ]; then
        log_success "Rollback completed successfully"
    else
        log_error "Rollback failed"
        exit 1
    fi
}

# Update NGINX upstream (if using blue/green)
update_nginx() {
    log_info "Updating NGINX configuration..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << EOF
        pct exec 442 -- bash -c "
            # Verify upstream
            grep -q 'backend_container_441' /etc/nginx/conf.d/zentoria.conf || exit 1

            # Test config
            nginx -t || exit 1

            # Reload NGINX
            systemctl reload nginx

            echo 'NGINX updated'
        "
EOF

    log_success "NGINX configuration updated"
}

# Notification
notify_deployment() {
    local status=$1
    local message="Deployment ${status}: Backend ${VERSION} to ${ENVIRONMENT}"

    log_info "Deployment $status"

    # Add custom notification here (Slack, Discord, etc.)
    # Example:
    # curl -X POST \
    #     -H 'Content-Type: application/json' \
    #     -d "{\"text\": \"$message\"}" \
    #     "$SLACK_WEBHOOK_URL"
}

# Main execution
main() {
    print_header

    preflight_checks
    validate_manifest
    backup_current

    # Deploy
    if deploy_rolling_update; then
        log_success "Deployment completed"
    else
        log_error "Deployment failed"
        rollback
        notify_deployment "FAILED"
        exit 1
    fi

    # Health checks
    if ! health_check; then
        log_error "Health checks failed"
        rollback
        notify_deployment "FAILED"
        exit 1
    fi

    # Smoke tests
    if ! smoke_tests; then
        log_error "Smoke tests failed"
        rollback
        notify_deployment "FAILED"
        exit 1
    fi

    # Update NGINX
    update_nginx

    # Final verification
    log_info "Performing final verification..."
    sleep 5

    if health_check; then
        log_success "Deployment successful!"
        notify_deployment "SUCCESS"

        echo ""
        echo "Deployment Summary:"
        echo "  Environment: $ENVIRONMENT"
        echo "  Version: $VERSION"
        echo "  Container: $BACKEND_CONTAINER"
        echo "  Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo ""

        exit 0
    else
        log_error "Final verification failed"
        rollback
        notify_deployment "FAILED"
        exit 1
    fi
}

# Run main function
main "$@"
