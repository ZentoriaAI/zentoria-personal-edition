#!/bin/bash
##############################################################################
# Zentoria Personal Edition - Master Provisioning Script
# Creates and configures all 17 LXC containers
##############################################################################

source "$(dirname "$0")/00-config.sh"

# Track provisioning progress
PROVISIONED_CONTAINERS=()
FAILED_CONTAINERS=()

##############################################################################
# MAIN PROVISIONING
##############################################################################

main() {
  log "Starting master container provisioning..."
  log "Total containers to provision: ${#containers[@]}"

  check_proxmox

  # Provision each container
  local count=0
  for container_def in "${containers[@]}"; do
    count=$((count + 1))
    provision_container "$container_def" "$count" "${#containers[@]}"
  done

  # Summary
  provisioning_summary

  success "Master provisioning completed!"
}

provision_container() {
  local def=$1
  local index=$2
  local total=$3

  # Parse container definition
  local vmid hostname ip ram cpu storage services
  IFS=':' read -r vmid hostname ip ram cpu storage services <<< "$def"

  log "[$index/$total] Provisioning: $hostname (VMID: $vmid, IP: $ip)"

  # Check if container already exists
  if container_exists "$vmid"; then
    warning "Container $vmid already exists, skipping creation"
    PROVISIONED_CONTAINERS+=("$vmid:$hostname:existing")
    return 0
  fi

  # Create container
  if create_container "$vmid" "$hostname" "$ip" "$ram" "$cpu" "$storage"; then
    PROVISIONED_CONTAINERS+=("$vmid:$hostname:created")

    # Wait for container to be ready
    if wait_container_ready "$vmid"; then
      # Run base setup
      run_base_setup "$vmid"

      # Install services
      install_services "$vmid" "$services"

      success "Container $vmid ($hostname) provisioned successfully"
    else
      error "Container $vmid failed to become ready"
      FAILED_CONTAINERS+=("$vmid:$hostname:timeout")
    fi
  else
    error "Failed to create container $vmid"
    FAILED_CONTAINERS+=("$vmid:$hostname:creation_failed")
  fi
}

container_exists() {
  local vmid=$1
  ssh_proxmox "pct list | grep -q '^$vmid'"
  return $?
}

create_container() {
  local vmid=$1
  local hostname=$2
  local ip=$3
  local ram=$4
  local cpu=$5
  local storage=$6

  log "Creating LXC container: $vmid ($hostname)..."

  # Validate inputs
  validate_ip "$ip" || return 1

  # Calculate storage size in MB
  local storage_mb=$((${storage%GB} * 1024))

  # Container creation command
  local create_cmd="pct create $vmid $PROXMOX_TEMPLATE \\
    --hostname $hostname \\
    --memory $((ram * 1024)) \\
    --cores $cpu \\
    --storage $STORAGE_LOCAL \\
    --rootfs $STORAGE_LOCAL:$storage_mb \\
    --net0 name=eth0,bridge=$PROXMOX_BRIDGE,ip=$ip/24,gw=$NETWORK_GATEWAY \\
    --nameserver $NETWORK_DNS \\
    --searchdomain $NETWORK_DOMAIN \\
    --unprivileged $LXC_UNPRIVILEGED \\
    --features nesting=$LXC_NESTING \\
    --ostype debian \\
    --password $LXC_ROOT_PASSWORD \\
    --osversion 12 \\
    --startup order=1,up=10"

  if ssh_proxmox "$create_cmd"; then
    success "Container $vmid created"

    # Start container
    if ssh_proxmox "pct start $vmid"; then
      success "Container $vmid started"
      return 0
    else
      error "Failed to start container $vmid"
      return 1
    fi
  else
    error "Failed to create container $vmid"
    return 1
  fi
}

run_base_setup() {
  local vmid=$1

  log "Running base setup for container $vmid..."

  # Wait for network
  ssh_container "$vmid" "until ping -c 1 8.8.8.8 &> /dev/null; do sleep 1; done"

  # Update system
  log "Updating system packages..."
  ssh_container "$vmid" "apt-get update && apt-get upgrade -y"

  # Install base packages
  log "Installing base packages..."
  ssh_container "$vmid" "apt-get install -y \\
    curl wget git vim nano \\
    net-tools iputils-ping dnsutils \\
    htop iotop tmux screen \\
    openssh-client openssh-server \\
    ca-certificates apt-transport-https \\
    gnupg lsb-release \\
    sudo systemctl \\
    jq yq \\
    build-essential python3 python3-pip \\
    locales"

  # Configure locale
  ssh_container "$vmid" "echo 'en_US.UTF-8 UTF-8' >> /etc/locale.gen && locale-gen"

  # Set timezone
  ssh_container "$vmid" "timedatectl set-timezone UTC"

  # Configure SSH
  configure_ssh "$vmid"

  # Create standard directories
  ssh_container "$vmid" "mkdir -p \\
    /opt/zentoria \\
    /var/log/zentoria \\
    /var/lib/zentoria \\
    /mnt/data \\
    /mnt/backups"

  # Set permissions
  ssh_container "$vmid" "chmod 755 /opt/zentoria /var/lib/zentoria"

  success "Base setup completed for container $vmid"
}

configure_ssh() {
  local vmid=$1

  log "Configuring SSH for container $vmid..."

  # Create SSH directory
  ssh_container "$vmid" "mkdir -p /root/.ssh && chmod 700 /root/.ssh"

  # Disable password authentication
  ssh_container "$vmid" "sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config"

  # Enable key authentication
  ssh_container "$vmid" "sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config"

  # Restart SSH
  ssh_container "$vmid" "systemctl restart ssh"

  success "SSH configured for container $vmid"
}

install_services() {
  local vmid=$1
  local services=$2

  log "Installing services for container $vmid: $services"

  # Split services by comma
  IFS=',' read -ra service_array <<< "$services"

  for service in "${service_array[@]}"; do
    service=$(echo "$service" | xargs)  # trim whitespace

    case "$service" in
      docker)
        install_docker "$vmid"
        ;;
      postgresql)
        log "Deferring PostgreSQL setup to container 404"
        ;;
      redis)
        log "Deferring Redis setup to container 410"
        ;;
      vault)
        log "Deferring Vault setup to container 403"
        ;;
      *)
        log "Service $service will be installed via docker-compose"
        ;;
    esac
  done

  success "Services installed for container $vmid"
}

install_docker() {
  local vmid=$1

  log "Installing Docker in container $vmid..."

  # Add Docker GPG key
  ssh_container "$vmid" "curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg"

  # Add Docker repository
  ssh_container "$vmid" "echo \\
    'deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian \\
    $(ssh_container $vmid lsb_release -cs) stable' | tee /etc/apt/sources.list.d/docker.list > /dev/null"

  # Install Docker
  ssh_container "$vmid" "apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin"

  # Install Docker Compose (standalone)
  ssh_container "$vmid" "curl -L 'https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)' -o /usr/local/bin/docker-compose"
  ssh_container "$vmid" "chmod +x /usr/local/bin/docker-compose"

  # Start Docker
  ssh_container "$vmid" "systemctl start docker && systemctl enable docker"

  # Verify installation
  if ssh_container "$vmid" "docker --version"; then
    success "Docker installed in container $vmid"
  else
    error "Docker installation failed in container $vmid"
    return 1
  fi
}

provisioning_summary() {
  local total_containers=${#containers[@]}
  local provisioned=${#PROVISIONED_CONTAINERS[@]}
  local failed=${#FAILED_CONTAINERS[@]}

  log ""
  log "========== PROVISIONING SUMMARY =========="
  log "Total containers: $total_containers"
  log "Provisioned: $provisioned"
  log "Failed: $failed"

  if [ ${#PROVISIONED_CONTAINERS[@]} -gt 0 ]; then
    log ""
    log "Provisioned containers:"
    for entry in "${PROVISIONED_CONTAINERS[@]}"; do
      IFS=':' read -r vmid hostname status <<< "$entry"
      echo "  ✓ $vmid ($hostname) - $status"
    done
  fi

  if [ ${#FAILED_CONTAINERS[@]} -gt 0 ]; then
    log ""
    log "Failed containers:"
    for entry in "${FAILED_CONTAINERS[@]}"; do
      IFS=':' read -r vmid hostname reason <<< "$entry"
      echo "  ✗ $vmid ($hostname) - $reason"
    done
  fi

  log "========================================="
}

# Main execution
main "$@"
