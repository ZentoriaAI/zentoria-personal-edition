# NGINX Proxy Deployment Guide

Complete step-by-step guide for deploying NGINX reverse proxy in container 408.

## Prerequisites

- Docker & Docker Compose running
- Container 408 (zentoria-proxy) exists and is running
- All backend services (containers 400-419) are operational
- OpenSSL installed on deployment machine
- Admin access to container

## Phase 1: Certificate Generation

### Step 1.1: Generate Self-Signed Certificates

```bash
#!/bin/bash
cd infrastructure/nginx/ssl

# Make script executable
chmod +x generate-certificates.sh

# Generate certificates
./generate-certificates.sh generate

# Verify certificate was created
ls -la zentoria.crt zentoria.key dhparam.pem
```

**Output:**
```
-rw-r--r-- 1 user group 1234 Jan 16 12:00 zentoria.crt
-rw------- 1 user group 1789 Jan 16 12:00 zentoria.key
-rw-r--r-- 1 user group 1024 Jan 16 12:00 dhparam.pem
```

### Step 1.2: Verify Certificate

```bash
# Check certificate details
openssl x509 -in infrastructure/nginx/ssl/zentoria.crt -text -noout

# Verify certificate expiration
openssl x509 -enddate -noout -in infrastructure/nginx/ssl/zentoria.crt
# Output: notAfter=Jan 13 12:00:00 2036 GMT (10 years valid)

# Check SANs
openssl x509 -in infrastructure/nginx/ssl/zentoria.crt -text -noout | grep -A2 "Subject Alternative Name"
```

## Phase 2: Copy Configuration Files

### Step 2.1: Copy Main Configuration

```bash
# Copy main nginx.conf
docker cp infrastructure/nginx/nginx.conf zentoria-proxy:/etc/nginx/nginx.conf

# Verify copied
docker exec zentoria-proxy ls -la /etc/nginx/nginx.conf
```

### Step 2.2: Copy Modular Configurations

```bash
# Copy conf.d directory
docker cp infrastructure/nginx/conf.d/. zentoria-proxy:/etc/nginx/conf.d/

# Verify
docker exec zentoria-proxy ls -la /etc/nginx/conf.d/
```

**Expected files:**
- upstreams.conf
- security.conf
- rate-limits.conf
- crowdsec.conf

### Step 2.3: Copy Site Configurations

```bash
# Create sites-available directory if missing
docker exec zentoria-proxy mkdir -p /etc/nginx/sites-available
docker exec zentoria-proxy mkdir -p /etc/nginx/sites-enabled

# Copy site configurations
docker cp infrastructure/nginx/sites-available/. zentoria-proxy:/etc/nginx/sites-available/

# Verify
docker exec zentoria-proxy ls -la /etc/nginx/sites-available/
```

**Expected files:**
- 01-frontend.conf
- 02-backend.conf
- 03-n8n.conf
- 04-vault.conf
- 05-ai.conf
- 06-observability.conf
- 07-storage.conf
- 08-auth.conf
- 09-cache-rag.conf
- 10-docs.conf

### Step 2.4: Copy SSL Certificates

```bash
# Create SSL directory
docker exec zentoria-proxy mkdir -p /etc/nginx/ssl

# Copy certificate files
docker cp infrastructure/nginx/ssl/zentoria.crt zentoria-proxy:/etc/nginx/ssl/
docker cp infrastructure/nginx/ssl/zentoria.key zentoria-proxy:/etc/nginx/ssl/
docker cp infrastructure/nginx/ssl/dhparam.pem zentoria-proxy:/etc/nginx/ssl/

# Set proper permissions
docker exec zentoria-proxy chmod 644 /etc/nginx/ssl/zentoria.crt
docker exec zentoria-proxy chmod 600 /etc/nginx/ssl/zentoria.key
docker exec zentoria-proxy chmod 600 /etc/nginx/ssl/dhparam.pem
docker exec zentoria-proxy chown www-data:www-data /etc/nginx/ssl/*

# Verify
docker exec zentoria-proxy ls -la /etc/nginx/ssl/
```

## Phase 3: Enable Site Configurations

### Step 3.1: Create Symlinks for Enabled Sites

```bash
# Create symlinks for all site configs
docker exec zentoria-proxy bash << 'EOF'
cd /etc/nginx/sites-enabled
for config in ../sites-available/*.conf; do
    ln -sf "$config" .
done
ls -la
EOF
```

**Output:** Should show symlinks to all .conf files

### Step 3.2: Create Log Directories

```bash
# Create log directory structure
docker exec zentoria-proxy bash << 'EOF'
mkdir -p /var/log/nginx
chmod 755 /var/log/nginx
chown -R www-data:www-data /var/log/nginx
EOF

# Verify
docker exec zentoria-proxy ls -la /var/log/nginx/
```

## Phase 4: Validate Configuration

### Step 4.1: Test NGINX Configuration Syntax

```bash
# Test configuration
docker exec zentoria-proxy nginx -t
```

**Expected output:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Step 4.2: Check for Configuration Errors

```bash
# If syntax errors found, check specific issues
docker exec zentoria-proxy nginx -T  # Show full config

# Check upstream definitions
docker exec zentoria-proxy grep -n "upstream" /etc/nginx/conf.d/upstreams.conf | head -20

# Verify all sites-available files are syntactically correct
for file in infrastructure/nginx/sites-available/*.conf; do
    docker exec zentoria-proxy nginx -c "$file" -t 2>&1 | grep -E "(error|fail)" || echo "✓ $(basename $file)"
done
```

## Phase 5: Start NGINX

### Step 5.1: Start or Reload NGINX

```bash
# If NGINX is already running, reload
docker exec zentoria-proxy nginx -s reload

# Or restart the entire container
docker restart zentoria-proxy

# Wait for service to be ready
sleep 2

# Check NGINX is running
docker exec zentoria-proxy ps aux | grep nginx
```

### Step 5.2: Verify NGINX Status

```bash
# Check process status
docker exec zentoria-proxy systemctl status nginx || service nginx status

# Check port bindings
docker exec zentoria-proxy netstat -tuln | grep -E "(80|443|8080)"
```

**Expected ports:**
- 80/tcp (HTTP redirect)
- 443/tcp (HTTPS)
- 8080/tcp (Status page)

## Phase 6: Test Connectivity

### Step 6.1: Test Upstream Connectivity

```bash
# Test backend services from proxy container
docker exec zentoria-proxy bash << 'EOF'
echo "Testing upstream connectivity..."

backends=(
    "zentoria-frontend:3000"
    "zentoria-backend:4000"
    "zentoria-backend:4001"
    "zentoria-n8n:5678"
    "zentoria-vault:8200"
    "zentoria-ai:5000"
    "zentoria-ai:11434"
    "zentoria-logs:3001"
    "zentoria-logs:9090"
    "zentoria-files:9000"
    "zentoria-files:9001"
    "zentoria-auth:9000"
    "zentoria-redis:8081"
    "zentoria-ocr:8000"
    "zentoria-voice:9300"
    "zentoria-docs:3002"
    "zentoria-docs:8080"
    "zentoria-embeddings:8100"
    "zentoria-embeddings:6333"
)

for backend in "${backends[@]}"; do
    if curl -s -m 2 http://$backend/health > /dev/null 2>&1; then
        echo "✓ $backend is accessible"
    else
        echo "✗ $backend is NOT accessible"
    fi
done
EOF
```

### Step 6.2: Test HTTPS Connectivity (Local)

```bash
# Test SSL certificate
docker exec zentoria-proxy openssl s_client -connect localhost:443 -servername ui.zentoria.local < /dev/null

# Test with curl (ignore self-signed warnings)
docker exec zentoria-proxy curl -k -v https://localhost/health
```

### Step 6.3: Update Local /etc/hosts

```bash
# Add entries to your local /etc/hosts for testing
# (Windows: C:\Windows\System32\drivers\etc\hosts)
# (Linux/Mac: /etc/hosts)

cat << 'EOF' >> /etc/hosts
127.0.0.1   ui.zentoria.local
127.0.0.1   api.zentoria.local
127.0.0.1   ws.zentoria.local
127.0.0.1   n8n.zentoria.local
127.0.0.1   vault.zentoria.local
127.0.0.1   ai.zentoria.local
127.0.0.1   ollama.zentoria.local
127.0.0.1   logs.zentoria.local
127.0.0.1   prometheus.zentoria.local
127.0.0.1   files.zentoria.local
127.0.0.1   s3.zentoria.local
127.0.0.1   auth.zentoria.local
127.0.0.1   redis.zentoria.local
127.0.0.1   ocr.zentoria.local
127.0.0.1   voice.zentoria.local
127.0.0.1   docs.zentoria.local
127.0.0.1   swagger.zentoria.local
127.0.0.1   rag.zentoria.local
127.0.0.1   qdrant.zentoria.local
EOF
```

### Step 6.4: Test Service Accessibility

```bash
# Test each service via HTTPS
services=(
    "https://ui.zentoria.local"
    "https://api.zentoria.local/health"
    "https://n8n.zentoria.local/health"
    "https://vault.zentoria.local/v1/sys/health"
    "https://files.zentoria.local/health"
    "https://auth.zentoria.local/health"
)

for service in "${services[@]}"; do
    response=$(curl -k -s -o /dev/null -w "%{http_code}" "$service")
    if [[ $response =~ ^[2-3][0-9]{2}$ ]]; then
        echo "✓ $service → HTTP $response"
    else
        echo "✗ $service → HTTP $response (FAILED)"
    fi
done
```

## Phase 7: Monitoring & Verification

### Step 7.1: Check Access Logs

```bash
# Tail access logs
docker exec zentoria-proxy tail -f /var/log/nginx/access.log

# View security events
docker exec zentoria-proxy tail -f /var/log/nginx/security.log

# Check for errors
docker exec zentoria-proxy tail -f /var/log/nginx/error.log
```

### Step 7.2: Monitor Performance

```bash
# Check NGINX status page (internal only)
docker exec zentoria-proxy curl http://localhost:8080/nginx_status
```

**Output shows:**
```
Active connections: 15
server accepts handled requests
 1234 1234 5678
Reading: 2 Writing: 3 Waiting: 10
```

### Step 7.3: Verify Rate Limiting

```bash
# Send rapid requests to trigger rate limit
for i in {1..150}; do
    curl -k https://api.zentoria.local/health &
done

# Check for 429 responses in logs
docker exec zentoria-proxy grep -c "429" /var/log/nginx/api-access.log
```

## Phase 8: Production Hardening

### Step 8.1: Enable CrowdSec WAF

```bash
# Deploy CrowdSec container
docker run -d --name zentoria-waf \
  -e COLLECTIONS="crowdsecurity/sshd crowdsecurity/nginx-http-cve crowdsecurity/web-application-firewall" \
  -v /etc/crowdsec:/etc/crowdsec \
  -v /var/lib/crowdsec:/var/lib/crowdsec \
  -p 6000:6000 \
  crowdsecurity/crowdsec:latest

# Create bouncer key
docker exec zentoria-waf cscli bouncer add nginx-bouncer

# Configure NGINX to use bouncer (modify crowdsec.conf)
```

### Step 8.2: Setup Let's Encrypt (Production)

```bash
# Generate Let's Encrypt certificate
infrastructure/nginx/ssl/generate-certificates.sh letsencrypt

# Certbot will guide through verification
# After successful generation, update NGINX:
# ssl_certificate /etc/letsencrypt/live/zentoria.local/fullchain.pem;
# ssl_certificate_key /etc/letsencrypt/live/zentoria.local/privkey.key;

# Test automatic renewal
infrastructure/nginx/ssl/generate-certificates.sh renew
```

### Step 8.3: Create Backup

```bash
# Backup current configuration
tar czf nginx-config-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
    infrastructure/nginx/

# Backup certificates
tar czf nginx-certs-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
    infrastructure/nginx/ssl/

echo "Backups created successfully"
```

## Phase 9: Troubleshooting

### Issue: NGINX Won't Start

```bash
# Check configuration syntax
docker exec zentoria-proxy nginx -t

# View full error
docker logs zentoria-proxy

# Check if port 80/443 is already in use
docker exec zentoria-proxy netstat -tuln | grep -E "(80|443)"
```

### Issue: SSL Certificate Errors

```bash
# Verify certificate matches key
cert_modulus=$(docker exec zentoria-proxy openssl x509 -noout -modulus -in /etc/nginx/ssl/zentoria.crt | openssl md5)
key_modulus=$(docker exec zentoria-proxy openssl rsa -noout -modulus -in /etc/nginx/ssl/zentoria.key | openssl md5)

if [[ "$cert_modulus" == "$key_modulus" ]]; then
    echo "✓ Certificate and key match"
else
    echo "✗ Certificate and key DO NOT match"
fi
```

### Issue: Upstream Services Not Reachable

```bash
# Test DNS resolution from container
docker exec zentoria-proxy nslookup zentoria-frontend

# Check Docker network
docker network inspect zentoria_network

# Verify service is running
docker ps | grep zentoria-frontend
```

### Issue: Rate Limiting Too Aggressive

```bash
# Temporarily increase rate limits for debugging
docker exec zentoria-proxy sed -i 's/rate=100r\/s/rate=1000r\/s/g' /etc/nginx/conf.d/rate-limits.conf

# Reload NGINX
docker exec zentoria-proxy nginx -s reload

# Monitor requests
docker exec zentoria-proxy tail -f /var/log/nginx/api-access.log | grep "429"
```

## Rollback Procedure

If configuration deployment fails:

```bash
# Restore from backup
tar xzf nginx-config-backup-YYYYMMDD-HHMMSS.tar.gz -C /

# Copy restored config to container
docker cp nginx.conf zentoria-proxy:/etc/nginx/

# Test and reload
docker exec zentoria-proxy nginx -t
docker exec zentoria-proxy nginx -s reload
```

## Success Checklist

- [ ] Certificates generated and copied
- [ ] All configuration files deployed
- [ ] NGINX configuration validates (nginx -t)
- [ ] NGINX service started successfully
- [ ] All upstream services accessible
- [ ] HTTPS working for all services
- [ ] Rate limiting functioning
- [ ] Security headers present
- [ ] Access logs being written
- [ ] Performance acceptable
- [ ] Backups created
- [ ] Monitoring in place

## Next Steps

1. Monitor logs for the first 24 hours
2. Configure CrowdSec for production
3. Setup certificate auto-renewal
4. Implement additional monitoring/alerting
5. Document any custom configurations
6. Schedule regular security audits

## Support & Logs

```bash
# Collect diagnostic information
docker exec zentoria-proxy bash << 'EOF'
echo "=== NGINX Version ===" && nginx -v
echo "=== Configuration Test ===" && nginx -t
echo "=== Active Processes ===" && ps aux | grep nginx
echo "=== Port Bindings ===" && netstat -tuln | grep -E "(80|443|8080)"
echo "=== Recent Errors ===" && tail -20 /var/log/nginx/error.log
echo "=== Certificate Info ===" && openssl x509 -enddate -noout -in /etc/nginx/ssl/zentoria.crt
EOF

# Save to file for analysis
docker exec zentoria-proxy bash > /tmp/nginx-diagnostics.log 2>&1
```
