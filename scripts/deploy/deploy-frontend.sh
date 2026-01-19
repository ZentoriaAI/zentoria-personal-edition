#!/bin/bash

#############################################################################
# Zentoria Frontend Deployment Script
#
# Deploys Next.js frontend to Container 440
# Zero-downtime deployment via NGINX reload
#
# Usage: ./deploy-frontend.sh [environment] [version]
#   environment: staging or production (default: staging)
#   version: Docker image tag (default: latest)
#############################################################################

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-staging}"
VERSION="${2:-latest}"
PROXMOX_HOST="${PROXMOX_HOST:-100.121.19.12}"
PROXMOX_USER="${PROXMOX_USER:-root}"
FRONTEND_CONTAINER=440
DEPLOY_DIR="/opt/zentoria-frontend"
REGISTRY="ghcr.io/ZentoriaAI"
IMAGE="zentoria-frontend"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=10

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
    echo "  Zentoria Frontend Deployment"
    echo "=========================================="
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "Container: $FRONTEND_CONTAINER"
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

    # Check container is running
    if ! ssh "${PROXMOX_USER}@${PROXMOX_HOST}" "pct status ${FRONTEND_CONTAINER}" | grep -q "running"; then
        log_error "Container ${FRONTEND_CONTAINER} is not running"
        exit 1
    fi

    log_success "Pre-flight checks passed"
}

# Validate build artifacts
validate_artifacts() {
    log_info "Validating build artifacts..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << EOF
        pct exec ${FRONTEND_CONTAINER} -- bash -c "
            # Check if previous build exists
            if [ ! -d /opt/zentoria-frontend/.next ]; then
                echo 'No previous build found, will build from scratch'
            else
                echo 'Previous build found at /opt/zentoria-frontend/.next'
            fi

            # Check image availability
            docker pull ${REGISTRY}/${IMAGE}:${VERSION} > /dev/null 2>&1
            if [ \$? -ne 0 ]; then
                echo 'Image not found: ${REGISTRY}/${IMAGE}:${VERSION}'
                exit 1
            fi
            echo 'Image validated'
        "
EOF

    if [ $? -ne 0 ]; then
        log_error "Artifact validation failed"
        exit 1
    fi

    log_success "Artifact validation passed"
}

# Backup current state
backup_current() {
    log_info "Backing up current deployment..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << 'EOF'
        pct exec 440 -- bash -c "
            mkdir -p /opt/zentoria-frontend/backups
            TIMESTAMP=$(date +%Y%m%d_%H%M%S)

            # Backup Next.js build
            if [ -d /opt/zentoria-frontend/.next ]; then
                cp -r /opt/zentoria-frontend/.next /opt/zentoria-frontend/backups/.next.${TIMESTAMP}
                echo 'Build directory backed up'
            fi

            # Backup package files
            cp /opt/zentoria-frontend/package.json /opt/zentoria-frontend/backups/package.json.${TIMESTAMP}

            # Backup environment
            cp /opt/zentoria-frontend/.env.local /opt/zentoria-frontend/backups/.env.local.${TIMESTAMP} 2>/dev/null || true

            echo 'Backup created: '${TIMESTAMP}
        "
EOF

    log_success "Backup completed"
}

# Deploy frontend
deploy_frontend() {
    log_info "Deploying frontend version $VERSION..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << EOF
        pct exec ${FRONTEND_CONTAINER} -- bash -c "
            cd ${DEPLOY_DIR}

            # Pull latest image
            echo 'Pulling image: ${REGISTRY}/${IMAGE}:${VERSION}'
            docker pull ${REGISTRY}/${IMAGE}:${VERSION}

            # Update docker-compose
            sed -i 's|image: .*${IMAGE}.*|image: ${REGISTRY}/${IMAGE}:${VERSION}|g' docker-compose.yml

            # Start new container (Next.js will rebuild if needed)
            echo 'Starting new frontend instance...'
            docker compose up -d --no-deps --no-build

            # Wait for service to be ready
            echo 'Waiting for frontend to be ready...'
            sleep 10

            # Verify build artifacts exist
            if [ ! -d ${DEPLOY_DIR}/.next ]; then
                echo 'Build artifacts not found'
                exit 1
            fi

            echo 'Frontend deployment initiated'
        "
EOF

    if [ $? -ne 0 ]; then
        log_error "Frontend deployment failed"
        return 1
    fi

    log_success "Frontend deployed"
    return 0
}

# Health check
health_check() {
    log_info "Running health checks..."

    local attempt=0
    local success=false

    while [ $attempt -lt $HEALTH_CHECK_RETRIES ]; do
        attempt=$((attempt + 1))

        if ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << EOF 2>/dev/null
            pct exec ${FRONTEND_CONTAINER} -- curl -s -f http://localhost:3000 > /dev/null 2>&1 || exit 1
            exit 0
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
        log_error "Health checks failed after $HEALTH_CHECK_RETRIES attempts"
        return 1
    fi

    return 0
}

# Verify static assets are served
verify_assets() {
    log_info "Verifying static assets..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << 'EOF'
        pct exec 440 -- bash -c "
            # Check for common static files
            curl -s -I http://localhost:3000/_next/static 2>/dev/null | grep -q '200\|301\|302' || {
                echo 'Static assets not accessible'
                exit 1
            }

            echo 'Static assets verified'
        "
EOF

    if [ $? -ne 0 ]; then
        log_error "Asset verification failed"
        return 1
    fi

    log_success "Assets verified"
    return 0
}

# Update NGINX configuration if needed
update_nginx_config() {
    log_info "Updating NGINX configuration..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << EOF
        pct exec 442 -- bash -c "
            # Check NGINX config
            grep -q 'frontend_container_440' /etc/nginx/conf.d/zentoria.conf || {
                echo 'NGINX upstream not found'
                exit 1
            }

            # Test config
            nginx -t || exit 1

            # Reload NGINX (zero-downtime)
            systemctl reload nginx || exit 1

            echo 'NGINX configuration updated'
        "
EOF

    if [ $? -ne 0 ]; then
        log_error "NGINX update failed"
        return 1
    fi

    log_success "NGINX configuration updated"
    return 0
}

# Rollback to previous version
rollback() {
    log_error "Rolling back frontend deployment..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << 'EOF'
        pct exec 440 -- bash -c "
            cd /opt/zentoria-frontend

            # Get previous backup
            LATEST_BACKUP=$(ls -t backups/.next.* 2>/dev/null | head -1)

            if [ -z \"$LATEST_BACKUP\" ]; then
                echo 'No backup found for rollback'
                exit 1
            fi

            echo 'Restoring from backup: '$LATEST_BACKUP

            # Restore build
            rm -rf .next
            cp -r \"$LATEST_BACKUP\" .next

            # Restart service
            docker compose up -d --no-deps

            # Wait for stabilization
            sleep 5

            # Verify
            if curl -s -f http://localhost:3000 > /dev/null; then
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

# Smoke tests
smoke_tests() {
    log_info "Running smoke tests..."

    ssh "${PROXMOX_USER}@${PROXMOX_HOST}" << 'EOF'
        pct exec 440 -- bash -c "
            # Test homepage
            curl -s -I http://localhost:3000 | grep -q '200' || {
                echo 'Homepage test failed'
                exit 1
            }

            # Test API integration
            curl -s http://localhost:3000/api/health 2>/dev/null | grep -q 'status' || {
                echo 'API integration test failed'
                exit 1
            }

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

# Main execution
main() {
    print_header

    preflight_checks
    validate_artifacts
    backup_current

    # Deploy
    if ! deploy_frontend; then
        log_error "Deployment failed"
        rollback
        exit 1
    fi

    # Health checks
    if ! health_check; then
        log_error "Health checks failed"
        rollback
        exit 1
    fi

    # Verify assets
    if ! verify_assets; then
        log_error "Asset verification failed"
        rollback
        exit 1
    fi

    # Smoke tests
    if ! smoke_tests; then
        log_error "Smoke tests failed"
        rollback
        exit 1
    fi

    # Update NGINX
    if ! update_nginx_config; then
        log_error "NGINX update failed"
        rollback
        exit 1
    fi

    log_success "Frontend deployment successful!"

    echo ""
    echo "Deployment Summary:"
    echo "  Environment: $ENVIRONMENT"
    echo "  Version: $VERSION"
    echo "  Container: $FRONTEND_CONTAINER"
    echo "  Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""

    exit 0
}

# Run main function
main "$@"
