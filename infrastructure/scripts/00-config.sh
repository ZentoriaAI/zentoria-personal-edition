#!/bin/bash
##############################################################################
# Zentoria Personal Edition - Configuration
# Shared configuration for all provisioning scripts
##############################################################################

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
warning() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Exit on error
set -e

##############################################################################
# PROXMOX CONFIGURATION
##############################################################################

PROXMOX_HOST="proxmox"                    # SSH alias or IP
PROXMOX_USER="root"
PROXMOX_NODE="pve"                        # Node name in Proxmox
PROXMOX_BRIDGE="vmbr40"                   # New bridge for 10.10.40.0/24
PROXMOX_TEMPLATE="local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst"

##############################################################################
# NETWORK CONFIGURATION
##############################################################################

NETWORK_BRIDGE="vmbr40"
NETWORK_SUBNET="10.10.40.0/24"
NETWORK_GATEWAY="10.10.40.1"
NETWORK_DNS="8.8.8.8 1.1.1.1"
NETWORK_DOMAIN="zentoria.local"

##############################################################################
# CONTAINER SPECIFICATIONS
##############################################################################

# Container definitions: VMID|Hostname|IP|RAM|CPU|Storage
# Format: vmid:hostname:ip:ram:cpu:storage:services
containers=(
  "400:zentoria-frontend:10.10.40.100:4:4:32:frontend,docker"
  "401:zentoria-backend:10.10.40.101:4:4:32:backend,docker"
  "402:zentoria-n8n:10.10.40.102:2:2:32:n8n,docker"
  "403:zentoria-vault:10.10.40.103:1:2:8:vault,docker"
  "404:zentoria-db:10.10.40.104:4:4:32:postgresql,docker"
  "405:zentoria-ai:10.10.40.105:16:8:64:ollama,docker"
  "406:zentoria-logs:10.10.40.106:4:4:64:elasticsearch,docker"
  "407:zentoria-files:10.10.40.107:2:2:128:minio,docker"
  "408:zentoria-proxy:10.10.40.108:1:2:8:nginx,docker"
  "409:zentoria-auth:10.10.40.109:2:2:16:keycloak,docker"
  "410:zentoria-redis:10.10.40.110:2:2:8:redis,docker"
  "412:zentoria-ocr:10.10.40.112:2:2:32:tesseract,docker"
  "413:zentoria-voice:10.10.40.113:8:4:32:whisper,docker"
  "416:zentoria-backup:10.10.40.116:1:2:16:rsync,docker"
  "418:zentoria-docs:10.10.40.118:2:2:16:docs,docker"
  "419:zentoria-embeddings:10.10.40.119:4:4:64:qdrant,docker"
  "423:zentoria-waf:10.10.40.123:1:2:8:modsecurity,docker"
)

##############################################################################
# CONTAINER CONFIGURATION
##############################################################################

# LXC container default settings
LXC_ROOT_PASSWORD="ZentriaP@ssw0rd2024"    # CHANGE THIS IN PRODUCTION!
LXC_SHELL="/bin/bash"
LXC_UNPRIVILEGED="1"                       # Unprivileged containers for security
LXC_NESTING="1"                            # Enable for Docker support

##############################################################################
# STORAGE CONFIGURATION
##############################################################################

STORAGE_LOCAL="local-lvm"                  # Proxmox storage pool
STORAGE_ROOTFS_SIZE="32GB"                 # Default rootfs size (override per container)
STORAGE_SHARED_MOUNT="/mnt/shared"         # Shared mount point

##############################################################################
# SERVICE CONFIGURATION
##############################################################################

# PostgreSQL
PG_VERSION="15"
PG_PORT="5432"
PG_USER="zentoria"
PG_PASSWORD="PgPass2024!"
PG_DB="zentoria_personal"
PG_BACKUP_DIR="/var/backups/postgresql"

# Redis
REDIS_PORT="6379"
REDIS_PASSWORD="RedisPass2024!"
REDIS_DATA_DIR="/var/lib/redis"

# Vault
VAULT_PORT="8200"
VAULT_DATA_DIR="/var/lib/vault"
VAULT_UNSEAL_KEY_FILE="/etc/vault/unseal-key"

# N8N
N8N_PORT="5678"
N8N_EDITOR_URL="http://n8n.zentoria.local:5678"
N8N_DATA_DIR="/var/lib/n8n"

# Ollama
OLLAMA_PORT="11434"
OLLAMA_DATA_DIR="/var/lib/ollama"
OLLAMA_MODELS="llama2 mistral neural-chat"

# Elasticsearch
ES_PORT="9200"
ES_DATA_DIR="/var/lib/elasticsearch"
ES_JAVA_OPTS="-Xms2g -Xmx2g"

# MinIO
MINIO_PORT="9000"
MINIO_CONSOLE_PORT="9001"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="MinioSecret2024!"
MINIO_DATA_DIR="/var/lib/minio"

# Keycloak
KEYCLOAK_PORT="8080"
KEYCLOAK_ADMIN="admin"
KEYCLOAK_ADMIN_PASSWORD="KeycloakPass2024!"

# NGINX
NGINX_CONF_DIR="/etc/nginx"
NGINX_WWW_DIR="/var/www"

##############################################################################
# DOCKER CONFIGURATION
##############################################################################

DOCKER_VERSION="latest"
DOCKER_COMPOSE_VERSION="latest"
DOCKER_REGISTRY="docker.io"
DOCKER_NETWORK_NAME="zentoria-net"
DOCKER_NETWORK_SUBNET="172.20.0.0/16"

##############################################################################
# BACKUP CONFIGURATION
##############################################################################

BACKUP_ENABLED="1"
BACKUP_SCHEDULE="0 2 * * *"                # Daily at 2 AM
BACKUP_RETENTION_DAYS="30"
BACKUP_COMPRESSION="gzip"
BACKUP_DIR="/mnt/backup/zentoria"

##############################################################################
# MONITORING CONFIGURATION
##############################################################################

MONITORING_ENABLED="1"
PROMETHEUS_PORT="9090"
GRAFANA_PORT="3000"
GRAFANA_ADMIN_PASSWORD="GrafanaPass2024!"

##############################################################################
# SECURITY CONFIGURATION
##############################################################################

# SSH Configuration
SSH_PORT="22"
SSH_PERMIT_ROOT_LOGIN="no"
SSH_PASSWORD_AUTH="no"
SSH_PUBKEY_AUTH="yes"

# Firewall
UFW_ENABLED="1"
UFW_DEFAULT_POLICY="deny"

# SSL/TLS
SSL_CERT_DIR="/etc/ssl/certs/zentoria"
SSL_KEY_DIR="/etc/ssl/private"

##############################################################################
# FUNCTIONS
##############################################################################

# Check if running on Proxmox
check_proxmox() {
  if ! command -v pvesh &> /dev/null; then
    error "Not running on Proxmox. Please run on Proxmox host."
    exit 1
  fi
  success "Running on Proxmox"
}

# SSH to Proxmox host
ssh_proxmox() {
  ssh -o StrictHostKeyChecking=no "${PROXMOX_USER}@${PROXMOX_HOST}" "$@"
}

# SSH to container
ssh_container() {
  local vmid=$1
  shift
  ssh_proxmox "pct exec ${vmid} -- $@"
}

# Copy file to Proxmox
scp_to_proxmox() {
  local src=$1
  local dst=$2
  scp -o StrictHostKeyChecking=no "${src}" "${PROXMOX_USER}@${PROXMOX_HOST}:${dst}"
}

# Copy file from Proxmox
scp_from_proxmox() {
  local src=$1
  local dst=$2
  scp -o StrictHostKeyChecking=no "${PROXMOX_USER}@${PROXMOX_HOST}:${src}" "${dst}"
}

# Push file to container
push_to_container() {
  local vmid=$1
  local src=$2
  local dst=$3
  ssh_proxmox "pct push ${vmid} ${src} ${dst}"
}

# Parse container definition
parse_container_def() {
  local def=$1
  IFS=':' read -r vmid hostname ip ram cpu storage services <<< "$def"
  echo "$vmid:$hostname:$ip:$ram:$cpu:$storage:$services"
}

# Validate IP address
validate_ip() {
  local ip=$1
  if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    return 0
  else
    error "Invalid IP address: $ip"
    return 1
  fi
}

# Wait for container to be ready
wait_container_ready() {
  local vmid=$1
  local max_attempts=30
  local attempt=1

  while [ $attempt -le $max_attempts ]; do
    if ssh_proxmox "pct status ${vmid}" 2>/dev/null | grep -q "running"; then
      sleep 2
      if ssh_container "$vmid" "echo 'Container ready'" 2>/dev/null; then
        success "Container $vmid is ready"
        return 0
      fi
    fi

    warning "Waiting for container $vmid to be ready... ($attempt/$max_attempts)"
    sleep 2
    ((attempt++))
  done

  error "Container $vmid failed to become ready"
  return 1
}

# Cleanup function
cleanup() {
  log "Cleaning up..."
  # Add cleanup tasks here if needed
}

# Set up trap for cleanup on exit
trap cleanup EXIT

# Export functions
export -f ssh_proxmox ssh_container scp_to_proxmox scp_from_proxmox
export -f push_to_container parse_container_def validate_ip wait_container_ready
export -f log success warning error
