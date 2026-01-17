#!/bin/bash
##############################################################################
# Zentoria Personal Edition - Reverse Proxy Setup
# Installs and configures NGINX as reverse proxy in container 408
##############################################################################

source "$(dirname "$0")/00-config.sh"

# NGINX specific settings
NGINX_CONTAINER_VMID=408
NGINX_CONFIG_DIR="/etc/nginx"
NGINX_WWW_ROOT="/var/www"

##############################################################################
# NGINX SETUP
##############################################################################

main() {
  log "Starting NGINX reverse proxy setup on container $NGINX_CONTAINER_VMID..."

  # Check if container exists
  if ! ssh_proxmox "pct status $NGINX_CONTAINER_VMID" &>/dev/null; then
    error "Container $NGINX_CONTAINER_VMID does not exist"
    exit 1
  fi

  # Execute setup steps
  install_nginx
  configure_nginx
  setup_ssl
  configure_upstream_services
  setup_rate_limiting
  verify_nginx

  success "NGINX reverse proxy setup completed!"
}

install_nginx() {
  log "Installing NGINX..."

  # Install NGINX and certbot
  ssh_container "$NGINX_CONTAINER_VMID" "apt-get update && apt-get install -y \\
    nginx \\
    certbot \\
    python3-certbot-nginx \\
    curl \\
    wget"

  # Enable NGINX
  ssh_container "$NGINX_CONTAINER_VMID" "systemctl enable nginx"

  success "NGINX installed"
}

configure_nginx() {
  log "Configuring NGINX..."

  # Backup original config
  ssh_container "$NGINX_CONTAINER_VMID" "cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup"

  # Create main nginx.conf
  ssh_container "$NGINX_CONTAINER_VMID" "cat > $NGINX_CONFIG_DIR/nginx.conf" << 'EOF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log warn;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss
               application/rss+xml font/truetype font/opentype
               application/vnd.ms-fontobject image/svg+xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Include upstream backends
    include /etc/nginx/conf.d/upstreams.conf;

    # Include server blocks
    include /etc/nginx/sites-enabled/*;
}
EOF

  success "NGINX main configuration applied"
}

setup_ssl() {
  log "Setting up SSL certificates..."

  # Create SSL directories
  ssh_container "$NGINX_CONTAINER_VMID" "mkdir -p /etc/nginx/ssl && chmod 700 /etc/nginx/ssl"

  # Create self-signed certificate for initial setup
  ssh_container "$NGINX_CONTAINER_VMID" "openssl req -x509 -newkey rsa:4096 -keyout /etc/nginx/ssl/key.pem -out /etc/nginx/ssl/cert.pem -days 365 -nodes \\
    -subj '/C=NL/ST=Netherlands/L=The Hague/O=Zentoria/CN=zentoria.local'"

  # Create DH parameters for better security
  ssh_container "$NGINX_CONTAINER_VMID" "openssl dhparam -out /etc/nginx/ssl/dhparam.pem 2048"

  success "SSL certificates created"
}

configure_upstream_services() {
  log "Configuring upstream services..."

  # Create upstreams configuration
  ssh_container "$NGINX_CONTAINER_VMID" "cat > $NGINX_CONFIG_DIR/conf.d/upstreams.conf" << 'EOF'
# Zentoria Services Upstreams

upstream backend_api {
    server 10.10.40.101:8000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

upstream frontend_app {
    server 10.10.40.100:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

upstream n8n_service {
    server 10.10.40.102:5678 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

upstream ollama_service {
    server 10.10.40.105:11434 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

upstream elasticsearch_service {
    server 10.10.40.106:9200 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

upstream minio_service {
    server 10.10.40.107:9000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

upstream redis_service {
    server 10.10.40.110:6379 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

upstream keycloak_service {
    server 10.10.40.109:8080 max_fails=3 fail_timeout=30s;
    keepalive 32;
}
EOF

  success "Upstream services configured"
}

setup_rate_limiting() {
  log "Setting up rate limiting..."

  # Create rate limiting configuration
  ssh_container "$NGINX_CONTAINER_VMID" "cat > $NGINX_CONFIG_DIR/conf.d/rate-limiting.conf" << 'EOF'
# Rate limiting zones

# API rate limiting - 10 requests per second
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

# Authentication rate limiting - 5 requests per second
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/s;

# General rate limiting - 20 requests per second
limit_req_zone $binary_remote_addr zone=general_limit:10m rate=20r/s;

# Connection limiting
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
EOF

  success "Rate limiting configured"
}

configure_server_blocks() {
  log "Creating server blocks..."

  # Create sites-available directory if not exists
  ssh_container "$NGINX_CONTAINER_VMID" "mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled"

  # Main server block (frontend)
  ssh_container "$NGINX_CONTAINER_VMID" "cat > /etc/nginx/sites-available/frontend.conf" << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name zentoria.local *.zentoria.local;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name zentoria.local *.zentoria.local;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_dhparam /etc/nginx/ssl/dhparam.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

    # Frontend proxy
    location / {
        proxy_pass http://frontend_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}
EOF

  # API server block
  ssh_container "$NGINX_CONTAINER_VMID" "cat > /etc/nginx/sites-available/api.conf" << 'EOF'
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.zentoria.local;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # API proxy
    location / {
        limit_req zone=api_limit burst=20 nodelay;
        limit_conn conn_limit 10;

        proxy_pass http://backend_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
}
EOF

  # N8N server block
  ssh_container "$NGINX_CONTAINER_VMID" "cat > /etc/nginx/sites-available/n8n.conf" << 'EOF'
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name n8n.zentoria.local;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://n8n_service;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}
EOF

  # Enable sites
  ssh_container "$NGINX_CONTAINER_VMID" "ln -sf /etc/nginx/sites-available/frontend.conf /etc/nginx/sites-enabled/"
  ssh_container "$NGINX_CONTAINER_VMID" "ln -sf /etc/nginx/sites-available/api.conf /etc/nginx/sites-enabled/"
  ssh_container "$NGINX_CONTAINER_VMID" "ln -sf /etc/nginx/sites-available/n8n.conf /etc/nginx/sites-enabled/"

  success "Server blocks configured"
}

verify_nginx() {
  log "Verifying NGINX installation..."

  # Test configuration
  if ssh_container "$NGINX_CONTAINER_VMID" "nginx -t"; then
    success "NGINX configuration is valid"
  else
    error "NGINX configuration test failed"
    return 1
  fi

  # Start NGINX
  ssh_container "$NGINX_CONTAINER_VMID" "systemctl start nginx"

  # Check service status
  local status=$(ssh_container "$NGINX_CONTAINER_VMID" "systemctl is-active nginx")
  if [ "$status" = "active" ]; then
    success "NGINX service is active"
  else
    error "NGINX service is not active: $status"
    return 1
  fi

  # Check listening ports
  log "NGINX listening ports:"
  ssh_container "$NGINX_CONTAINER_VMID" "netstat -tlnp | grep nginx" | sed 's/^/  /'

  success "NGINX verification completed"
}

# Main execution
main "$@"
