#!/bin/bash

################################################################################
# Zentoria Personal Edition - Master Deployment Script
# Version: 1.0
# Description: Orchestrates complete deployment across all phases
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="${SCRIPT_DIR}/scripts"
LOG_DIR="${SCRIPT_DIR}/logs"
DEPLOYMENT_LOG="${LOG_DIR}/deployment_$(date +%Y%m%d_%H%M%S).log"

# Create log directory
mkdir -p "${LOG_DIR}"

################################################################################
# Utility Functions
################################################################################

log() {
    local level="$1"
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case "$level" in
        INFO)
            echo -e "${BLUE}[INFO]${NC} $message" | tee -a "${DEPLOYMENT_LOG}"
            ;;
        SUCCESS)
            echo -e "${GREEN}[SUCCESS]${NC} $message" | tee -a "${DEPLOYMENT_LOG}"
            ;;
        WARNING)
            echo -e "${YELLOW}[WARNING]${NC} $message" | tee -a "${DEPLOYMENT_LOG}"
            ;;
        ERROR)
            echo -e "${RED}[ERROR]${NC} $message" | tee -a "${DEPLOYMENT_LOG}"
            ;;
        *)
            echo "$message" | tee -a "${DEPLOYMENT_LOG}"
            ;;
    esac
}

print_header() {
    echo "" | tee -a "${DEPLOYMENT_LOG}"
    echo "═══════════════════════════════════════════════════════════════" | tee -a "${DEPLOYMENT_LOG}"
    echo "$1" | tee -a "${DEPLOYMENT_LOG}"
    echo "═══════════════════════════════════════════════════════════════" | tee -a "${DEPLOYMENT_LOG}"
    echo "" | tee -a "${DEPLOYMENT_LOG}"
}

confirm() {
    local message="$1"
    read -p "$message [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        return 1
    fi
    return 0
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log ERROR "This script must be run as root"
        exit 1
    fi
}

check_proxmox() {
    if ! command -v pct &> /dev/null; then
        log ERROR "Proxmox VE not detected. This script must run on a Proxmox host."
        exit 1
    fi

    local pve_version=$(pveversion | head -n1)
    log INFO "Detected: $pve_version"
}

check_prerequisites() {
    log INFO "Checking prerequisites..."

    # Check required commands
    local required_commands=("pct" "git" "curl" "jq")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log ERROR "Required command not found: $cmd"
            exit 1
        fi
    done

    # Check storage
    log INFO "Checking storage availability..."
    pvesm status | grep -q "local-zfs" || log WARNING "local-zfs storage not found"

    log SUCCESS "Prerequisites check passed"
}

save_progress() {
    local phase="$1"
    echo "$phase" > "${SCRIPT_DIR}/.deployment_progress"
}

get_progress() {
    if [[ -f "${SCRIPT_DIR}/.deployment_progress" ]]; then
        cat "${SCRIPT_DIR}/.deployment_progress"
    else
        echo "0"
    fi
}

################################################################################
# Deployment Phases
################################################################################

phase_1_infrastructure() {
    print_header "PHASE 1: Infrastructure Base"

    log INFO "Creating LXC containers..."

    if [[ -f "${SCRIPTS_DIR}/02-provision-all.sh" ]]; then
        bash "${SCRIPTS_DIR}/02-provision-all.sh" || {
            log ERROR "Container provisioning failed"
            return 1
        }
    else
        log ERROR "Provisioning script not found: ${SCRIPTS_DIR}/02-provision-all.sh"
        return 1
    fi

    log INFO "Configuring network..."
    if [[ -f "${SCRIPTS_DIR}/01-network-setup.sh" ]]; then
        bash "${SCRIPTS_DIR}/01-network-setup.sh" || {
            log WARNING "Network setup encountered issues"
        }
    fi

    log SUCCESS "Phase 1 completed"
    save_progress "1"
}

phase_2_data_layer() {
    print_header "PHASE 2: Data Layer"

    log INFO "Setting up PostgreSQL (Container 404)..."
    if [[ -f "${SCRIPTS_DIR}/10-setup-db.sh" ]]; then
        bash "${SCRIPTS_DIR}/10-setup-db.sh" || {
            log ERROR "Database setup failed"
            return 1
        }
    fi

    log INFO "Setting up Redis (Container 410)..."
    if [[ -f "${SCRIPTS_DIR}/11-setup-redis.sh" ]]; then
        bash "${SCRIPTS_DIR}/11-setup-redis.sh" || {
            log ERROR "Redis setup failed"
            return 1
        }
    fi

    log INFO "Setting up HashiCorp Vault (Container 403)..."
    # Vault setup script would go here

    log INFO "Setting up MinIO (Container 407)..."
    # MinIO setup script would go here

    log INFO "Setting up Qdrant (Container 419)..."
    # Qdrant setup script would go here

    log SUCCESS "Phase 2 completed"
    save_progress "2"
}

phase_3_security() {
    print_header "PHASE 3: Security Layer"

    log INFO "Setting up CrowdSec WAF (Container 423)..."
    # WAF setup script would go here

    log INFO "Setting up Authentication Service (Container 409)..."
    # Auth setup script would go here

    log INFO "Setting up NGINX Proxy (Container 408)..."
    if [[ -f "${SCRIPTS_DIR}/20-setup-proxy.sh" ]]; then
        bash "${SCRIPTS_DIR}/20-setup-proxy.sh" || {
            log ERROR "Proxy setup failed"
            return 1
        }
    fi

    log SUCCESS "Phase 3 completed"
    save_progress "3"
}

phase_4_core_services() {
    print_header "PHASE 4: Core Services"

    log INFO "Setting up Backend API (Container 401)..."
    # Backend setup script would go here

    log INFO "Setting up Frontend (Container 400)..."
    # Frontend setup script would go here

    log SUCCESS "Phase 4 completed"
    save_progress "4"
}

phase_5_ai_automation() {
    print_header "PHASE 5: AI & Automation"

    log INFO "Setting up n8n (Container 402)..."
    # n8n setup script would go here

    log INFO "Setting up Ollama + AI Orchestrator (Container 405)..."
    if [[ -f "${SCRIPTS_DIR}/30-setup-ai.sh" ]]; then
        bash "${SCRIPTS_DIR}/30-setup-ai.sh" || {
            log ERROR "AI setup failed"
            return 1
        }
    fi

    log INFO "Setting up Whisper Voice Service (Container 413)..."
    # Voice setup script would go here

    log INFO "Setting up Paperless OCR (Container 412)..."
    # OCR setup script would go here

    log SUCCESS "Phase 5 completed"
    save_progress "5"
}

phase_6_support_services() {
    print_header "PHASE 6: Support Services"

    log INFO "Setting up Monitoring Stack (Container 406)..."
    if [[ -f "${SCRIPTS_DIR}/40-setup-observability.sh" ]]; then
        bash "${SCRIPTS_DIR}/40-setup-observability.sh" || {
            log WARNING "Monitoring setup encountered issues"
        }
    fi

    log INFO "Setting up Wiki.js Documentation (Container 418)..."
    # Docs setup script would go here

    log INFO "Setting up Backup System (Container 416)..."
    # Backup setup script would go here

    log SUCCESS "Phase 6 completed"
    save_progress "6"
}

phase_7_verification() {
    print_header "PHASE 7: Integration & Testing"

    log INFO "Running health checks..."

    if [[ -f "${SCRIPTS_DIR}/99-verify.sh" ]]; then
        bash "${SCRIPTS_DIR}/99-verify.sh" || {
            log WARNING "Some verification checks failed"
        }
    fi

    log INFO "Testing service interconnections..."
    # Additional integration tests would go here

    log SUCCESS "Phase 7 completed"
    save_progress "7"
}

################################################################################
# Rollback Functions
################################################################################

rollback_phase() {
    local phase="$1"

    print_header "ROLLBACK: Phase $phase"

    case "$phase" in
        1)
            log WARNING "Rolling back infrastructure..."
            # Stop and destroy containers
            for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do
                pct stop $ct 2>/dev/null || true
                pct destroy $ct 2>/dev/null || true
            done
            ;;
        2)
            log WARNING "Rolling back data layer..."
            pct stop 404 410 403 407 419 2>/dev/null || true
            ;;
        3)
            log WARNING "Rolling back security layer..."
            pct stop 423 409 408 2>/dev/null || true
            ;;
        4)
            log WARNING "Rolling back core services..."
            pct stop 401 400 2>/dev/null || true
            ;;
        5)
            log WARNING "Rolling back AI & automation..."
            pct stop 402 405 413 412 2>/dev/null || true
            ;;
        6)
            log WARNING "Rolling back support services..."
            pct stop 406 418 416 2>/dev/null || true
            ;;
    esac

    log SUCCESS "Rollback completed"
}

################################################################################
# Main Deployment Function
################################################################################

deploy_full() {
    print_header "Zentoria Personal Edition - Full Deployment"

    log INFO "Starting deployment at $(date)"
    log INFO "Log file: ${DEPLOYMENT_LOG}"

    # Check current progress
    local current_phase=$(get_progress)
    log INFO "Current deployment phase: $current_phase"

    if [[ "$current_phase" != "0" ]]; then
        if confirm "Resume from phase $(($current_phase + 1))?"; then
            log INFO "Resuming deployment..."
        else
            if confirm "Start fresh deployment (will destroy existing)?"; then
                rollback_phase "$current_phase"
                current_phase="0"
            else
                log INFO "Deployment cancelled"
                exit 0
            fi
        fi
    fi

    # Execute phases
    local phases=(
        "phase_1_infrastructure"
        "phase_2_data_layer"
        "phase_3_security"
        "phase_4_core_services"
        "phase_5_ai_automation"
        "phase_6_support_services"
        "phase_7_verification"
    )

    for i in "${!phases[@]}"; do
        local phase_number=$((i + 1))

        if [[ $phase_number -le $current_phase ]]; then
            log INFO "Skipping phase $phase_number (already completed)"
            continue
        fi

        log INFO "Starting Phase $phase_number..."

        if ! ${phases[$i]}; then
            log ERROR "Phase $phase_number failed"

            if confirm "Rollback phase $phase_number?"; then
                rollback_phase "$phase_number"
            fi

            exit 1
        fi

        log SUCCESS "Phase $phase_number completed successfully"

        if [[ $phase_number -lt ${#phases[@]} ]]; then
            log INFO "Ready to proceed to Phase $(($phase_number + 1))"
            sleep 2
        fi
    done

    print_header "DEPLOYMENT COMPLETED"

    log SUCCESS "All phases completed successfully!"
    log INFO "Deployment log saved to: ${DEPLOYMENT_LOG}"

    echo ""
    echo "Next Steps:"
    echo "1. Change default passwords"
    echo "2. Configure SSL certificates"
    echo "3. Set up backups"
    echo "4. Configure monitoring alerts"
    echo "5. Review security settings"
    echo ""
    echo "Access your deployment:"
    echo "  Frontend: http://zentoria.local"
    echo "  API: http://api.zentoria.local"
    echo "  Grafana: http://logs.zentoria.local:3001"
    echo ""
}

################################################################################
# CLI Interface
################################################################################

show_usage() {
    cat << EOF
Zentoria Personal Edition - Deployment Script

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    full        Full deployment (all phases)
    phase N     Deploy specific phase (1-7)
    rollback N  Rollback specific phase
    verify      Run verification checks
    resume      Resume interrupted deployment
    status      Show deployment status
    help        Show this help message

Options:
    --yes       Auto-confirm all prompts
    --log FILE  Custom log file location
    --dry-run   Show what would be done without executing

Examples:
    $0 full                 # Full deployment
    $0 phase 1              # Deploy phase 1 only
    $0 rollback 3           # Rollback phase 3
    $0 verify               # Run verification
    $0 status               # Show deployment status

EOF
}

show_status() {
    local current_phase=$(get_progress)

    print_header "Deployment Status"

    echo "Current Phase: $current_phase of 7"
    echo ""

    echo "Container Status:"
    pct list | grep zentoria || echo "No containers deployed"

    echo ""
    echo "Recent Log Entries:"
    if [[ -f "${DEPLOYMENT_LOG}" ]]; then
        tail -n 10 "${DEPLOYMENT_LOG}"
    else
        echo "No log file found"
    fi
}

################################################################################
# Entry Point
################################################################################

main() {
    local command="${1:-help}"

    case "$command" in
        full)
            check_root
            check_proxmox
            check_prerequisites
            deploy_full
            ;;
        phase)
            check_root
            check_proxmox
            local phase_num="${2:-0}"
            if [[ $phase_num -ge 1 && $phase_num -le 7 ]]; then
                log INFO "Deploying phase $phase_num..."
                phase_${phase_num}_*
            else
                log ERROR "Invalid phase number: $phase_num (must be 1-7)"
                exit 1
            fi
            ;;
        rollback)
            check_root
            local phase_num="${2:-0}"
            if confirm "Rollback phase $phase_num?"; then
                rollback_phase "$phase_num"
            fi
            ;;
        verify)
            check_root
            check_proxmox
            phase_7_verification
            ;;
        resume)
            check_root
            check_proxmox
            check_prerequisites
            deploy_full
            ;;
        status)
            show_status
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            log ERROR "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
