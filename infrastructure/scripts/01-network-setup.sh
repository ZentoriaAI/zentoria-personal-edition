#!/bin/bash
##############################################################################
# Zentoria Personal Edition - Network Setup
# Creates bridge, configures routing, and sets up firewall rules
##############################################################################

source "$(dirname "$0")/00-config.sh"

##############################################################################
# NETWORK SETUP
##############################################################################

main() {
  log "Starting network setup..."

  check_proxmox

  # 1. Create bridge
  create_bridge

  # 2. Configure routing
  configure_routing

  # 3. Setup NAT (if required)
  setup_nat

  # 4. Configure firewall rules
  setup_firewall

  # 5. Verify network
  verify_network

  success "Network setup completed successfully!"
}

create_bridge() {
  log "Creating network bridge: $PROXMOX_BRIDGE ($NETWORK_SUBNET)..."

  # Check if bridge already exists
  if ssh_proxmox "test -e /sys/class/net/$PROXMOX_BRIDGE"; then
    warning "Bridge $PROXMOX_BRIDGE already exists"
    return 0
  fi

  # Get network interface (typically vmbr0)
  local interfaces=$(ssh_proxmox "ip -o link show | grep -v 'LOOPBACK' | head -1 | cut -d: -f2 | xargs")
  log "Existing interfaces: $interfaces"

  # Read current network configuration
  local net_config=$(ssh_proxmox "cat /etc/network/interfaces")

  log "Current network configuration:"
  echo "$net_config" | sed 's/^/  /'

  # Backup current configuration
  log "Backing up network configuration..."
  ssh_proxmox "cp /etc/network/interfaces /etc/network/interfaces.backup.$(date +%s)"

  # Create bridge configuration
  log "Creating bridge configuration..."
  local bridge_config="auto $PROXMOX_BRIDGE
iface $PROXMOX_BRIDGE inet static
    address $NETWORK_GATEWAY
    netmask 255.255.255.0
    bridge_ports none
    bridge_stp off
    bridge_fd 0
    bridge_maxwait 0
"

  # Append to interfaces file
  ssh_proxmox "cat >> /etc/network/interfaces" << 'EOF'

# Zentoria Personal Edition Network Bridge
auto vmbr40
iface vmbr40 inet static
    address 10.10.40.1
    netmask 255.255.255.0
    bridge_ports none
    bridge_stp off
    bridge_fd 0
    bridge_maxwait 0
EOF

  success "Bridge $PROXMOX_BRIDGE created"
}

configure_routing() {
  log "Configuring routing..."

  # Enable IP forwarding
  ssh_proxmox "sysctl -w net.ipv4.ip_forward=1"
  ssh_proxmox "sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf"

  # Enable bridge netfilter
  ssh_proxmox "sysctl -w net.bridge.bridge-nf-call-iptables=1"
  ssh_proxmox "sysctl -w net.bridge.bridge-nf-call-ip6tables=1"

  # Add persistent settings
  ssh_proxmox "cat >> /etc/sysctl.conf" << 'EOF'

# Zentoria Personal Edition - Network Settings
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF

  success "Routing configured"
}

setup_nat() {
  log "Setting up NAT rules..."

  # Detect primary interface
  local primary_if=$(ssh_proxmox "ip route | grep default | awk '{print \$5}' | head -1")

  if [ -z "$primary_if" ]; then
    warning "Could not detect primary interface, skipping NAT setup"
    return 1
  fi

  log "Primary interface: $primary_if"

  # Create NAT rules
  ssh_proxmox "iptables -t nat -A POSTROUTING -s $NETWORK_SUBNET -o $primary_if -j MASQUERADE"

  # Save iptables rules
  ssh_proxmox "apt-get update && apt-get install -y iptables-persistent"
  ssh_proxmox "iptables-save > /etc/iptables/rules.v4"

  success "NAT rules configured for $primary_if"
}

setup_firewall() {
  log "Configuring firewall rules..."

  # Enable UFW if not already enabled
  if ! ssh_proxmox "ufw status | grep -q 'Status: active'"; then
    log "Enabling UFW..."
    ssh_proxmox "ufw --force enable"
  fi

  # Set default policies
  ssh_proxmox "ufw default deny incoming"
  ssh_proxmox "ufw default allow outgoing"

  # Allow essential services
  log "Setting up firewall rules..."

  # SSH
  ssh_proxmox "ufw allow 22/tcp"

  # HTTP/HTTPS for proxy
  ssh_proxmox "ufw allow 80/tcp"
  ssh_proxmox "ufw allow 443/tcp"

  # Proxmox Management
  ssh_proxmox "ufw allow 8006/tcp"

  # Container management ports
  ssh_proxmox "ufw allow from $NETWORK_SUBNET"

  # Docker ports (internal)
  ssh_proxmox "ufw allow from $NETWORK_SUBNET to any port 2375"

  success "Firewall rules configured"
}

verify_network() {
  log "Verifying network configuration..."

  # Check bridge exists
  if ssh_proxmox "test -e /sys/class/net/$PROXMOX_BRIDGE"; then
    success "Bridge $PROXMOX_BRIDGE exists"
  else
    error "Bridge $PROXMOX_BRIDGE not found"
    return 1
  fi

  # Check bridge IP
  local bridge_ip=$(ssh_proxmox "ip addr show $PROXMOX_BRIDGE | grep 'inet ' | awk '{print \$2}'")
  if [ -n "$bridge_ip" ]; then
    success "Bridge IP configured: $bridge_ip"
  else
    warning "Bridge IP not yet configured (will be after network restart)"
  fi

  # Check IP forwarding
  local ip_forward=$(ssh_proxmox "sysctl -n net.ipv4.ip_forward")
  if [ "$ip_forward" -eq 1 ]; then
    success "IP forwarding enabled"
  else
    warning "IP forwarding not enabled"
  fi

  log "Firewall status:"
  ssh_proxmox "ufw status" | sed 's/^/  /'

  log "Network configuration verification complete"
}

# Main execution
main "$@"
