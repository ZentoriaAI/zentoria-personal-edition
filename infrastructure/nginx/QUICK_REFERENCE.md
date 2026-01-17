# NGINX Proxy Quick Reference

Fast lookup for common commands and configurations.

## Essential Commands

### Configuration Management

```bash
# Test configuration syntax
docker exec zentoria-proxy nginx -t

# Show full configuration (with defaults)
docker exec zentoria-proxy nginx -T

# Reload configuration (graceful)
docker exec zentoria-proxy nginx -s reload

# Stop NGINX
docker exec zentoria-proxy nginx -s stop

# Quit NGINX (finish current requests)
docker exec zentoria-proxy nginx -s quit

# Restart container
docker restart zentoria-proxy
```

### Certificate Management

```bash
# Generate certificates
infrastructure/nginx/ssl/generate-certificates.sh generate

# Check certificate expiration
docker exec zentoria-proxy openssl x509 -enddate -noout -in /etc/nginx/ssl/zentoria.crt

# Verify certificate & key match
openssl x509 -noout -modulus -in certificate.crt | openssl md5
openssl rsa -noout -modulus -in private.key | openssl md5

# View certificate details
docker exec zentoria-proxy openssl x509 -text -noout -in /etc/nginx/ssl/zentoria.crt
```

### Log Management

```bash
# Tail access logs
docker exec zentoria-proxy tail -f /var/log/nginx/access.log

# Tail error logs
docker exec zentoria-proxy tail -f /var/log/nginx/error.log

# View security events
docker exec zentoria-proxy tail -f /var/log/nginx/security.log

# Count requests by status code
docker exec zentoria-proxy awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c

# Find slow requests (> 1 second)
docker exec zentoria-proxy awk '$NF > 1 {print}' /var/log/nginx/access.log

# Check for rate limit responses
docker exec zentoria-proxy grep "429" /var/log/nginx/access.log | wc -l

# Analyze failed requests
docker exec zentoria-proxy grep -E " (40[1-4]|50[0-3]) " /var/log/nginx/access.log
```

### Service Testing

```bash
# Test health endpoint
curl -k https://api.zentoria.local/health

# Test WebSocket endpoint
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  https://ws.zentoria.local/socket

# Measure response time
curl -k -w "@-" -o /dev/null -s https://api.zentoria.local/health << 'EOF'
    time_namelookup:  %{time_namelookup}\n
    time_connect:     %{time_connect}\n
    time_appconnect:  %{time_appconnect}\n
    time_pretransfer: %{time_pretransfer}\n
    time_redirect:    %{time_redirect}\n
    time_starttransfer: %{time_starttransfer}\n
    ───────────────────────────
    time_total:       %{time_total}\n
EOF

# Load test
docker run -it --rm \
  -v /tmp:/tmp \
  --network zentoria_network \
  grafana/k6 run - << 'EOF'
import http from 'k6/http';
import { check } from 'k6';

export default function() {
  let res = http.get('https://api.zentoria.local/health');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
EOF
```

## Configuration Quick Snippets

### Rate Limiting

```nginx
# Add to specific location blocks
limit_req zone=api_limit burst=50 nodelay;
limit_conn conn_limit 50;

# Response status
limit_req_status 429;
```

### Proxy Configuration

```nginx
# Basic upstream proxy
proxy_pass http://upstream_name;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

### WebSocket Support

```nginx
# Add to location block handling WebSocket
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_connect_timeout 7d;
proxy_send_timeout 7d;
proxy_read_timeout 7d;
proxy_buffering off;
```

### Large File Upload

```nginx
# For upload endpoints
client_max_body_size 100M;
proxy_request_buffering off;
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
```

### Caching

```nginx
# Cache static assets
expires 1y;
add_header Cache-Control "public, immutable";

# No cache for API
add_header Cache-Control "no-store, no-cache, must-revalidate";
```

### Security Headers

```nginx
# Add to all responses
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## Common Configurations

### Add New Service

1. Define upstream in `conf.d/upstreams.conf`:
```nginx
upstream new_service {
    zone new_service 64k;
    server container-name:port max_fails=3 fail_timeout=10s;
    keepalive 32;
}
```

2. Create site config in `sites-available/XX-newservice.conf`:
```nginx
server {
    listen 443 ssl http2;
    server_name newservice.zentoria.local;
    ssl_certificate /etc/nginx/ssl/zentoria.crt;
    ssl_certificate_key /etc/nginx/ssl/zentoria.key;

    location / {
        proxy_pass http://new_service;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

3. Enable and reload:
```bash
docker exec zentoria-proxy ln -sf ../sites-available/XX-newservice.conf /etc/nginx/sites-enabled/
docker exec zentoria-proxy nginx -t && nginx -s reload
```

### Block IP Address

```bash
# Add to security.conf or specific location
echo "deny 192.168.1.100;" >> /etc/nginx/conf.d/security.conf
docker exec zentoria-proxy nginx -s reload
```

### Increase Timeout for Specific Endpoint

```nginx
location /api/v1/heavy-operation {
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;

    proxy_pass http://upstream_service;
}
```

### Enable Basic Authentication

```nginx
location /admin/ {
    auth_basic "Admin Area";
    auth_basic_user_file /etc/nginx/.htpasswd;

    proxy_pass http://upstream_service;
}
```

Generate htpasswd:
```bash
docker exec zentoria-proxy bash -c "echo -n 'user:' > /etc/nginx/.htpasswd && openssl passwd -apr1 >> /etc/nginx/.htpasswd"
```

## Monitoring & Analytics

### Request Statistics

```bash
# Top request paths
docker exec zentoria-proxy awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10

# Top client IPs
docker exec zentoria-proxy awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10

# Requests per hour
docker exec zentoria-proxy awk '{print $4}' /var/log/nginx/access.log | cut -d: -f1-2 | sort | uniq -c

# Average response time
docker exec zentoria-proxy awk '{sum+=$NF; count++} END {print "Average: " sum/count "s"}' /var/log/nginx/access.log

# Largest responses
docker exec zentoria-proxy awk '{print $10, $7}' /var/log/nginx/access.log | sort -rn | head -10
```

### Error Analysis

```bash
# Count 4xx errors
docker exec zentoria-proxy grep -c " 4[0-9][0-9] " /var/log/nginx/access.log

# Count 5xx errors
docker exec zentoria-proxy grep -c " 5[0-9][0-9] " /var/log/nginx/access.log

# Most common errors
docker exec zentoria-proxy grep -oE " [45][0-9][0-9] " /var/log/nginx/access.log | sort | uniq -c | sort -rn
```

## Rate Limiting Zones

```
Zone                  Rate              Burst   Use Case
api_limit            100 req/sec        50     General API endpoints
api_strict           10 req/sec         5      Auth, security endpoints
api_file_upload      5 req/min          2      Large file uploads
login_limit          5 req/min          2      Login attempts
token_refresh        20 req/min         10     Token refresh
search_limit         30 req/min         20     Search queries
```

## Service URLs

| Service | URL | Port |
|---------|-----|------|
| Frontend | https://ui.zentoria.local | 443 |
| API | https://api.zentoria.local | 443 |
| WebSocket | https://ws.zentoria.local | 443 |
| N8N | https://n8n.zentoria.local | 443 |
| Vault | https://vault.zentoria.local | 443 |
| AI | https://ai.zentoria.local | 443 |
| Ollama | https://ollama.zentoria.local | 443 |
| Logs | https://logs.zentoria.local | 443 |
| Prometheus | https://prometheus.zentoria.local | 443 |
| MinIO UI | https://files.zentoria.local | 443 |
| S3 API | https://s3.zentoria.local | 443 |
| Auth | https://auth.zentoria.local | 443 |
| Redis | https://redis.zentoria.local | 443 |
| OCR | https://ocr.zentoria.local | 443 |
| Voice | https://voice.zentoria.local | 443 |
| Docs | https://docs.zentoria.local | 443 |
| Swagger | https://swagger.zentoria.local | 443 |
| RAG | https://rag.zentoria.local | 443 |
| Qdrant | https://qdrant.zentoria.local | 443 |

## Status Codes

```
2xx  Success
  200  OK
  201  Created
  204  No Content

3xx  Redirection
  301  Moved Permanently
  302  Found
  304  Not Modified

4xx  Client Error
  400  Bad Request
  401  Unauthorized
  403  Forbidden
  404  Not Found
  429  Too Many Requests (Rate Limited)

5xx  Server Error
  500  Internal Server Error
  502  Bad Gateway (upstream unavailable)
  503  Service Unavailable
  504  Gateway Timeout
```

## Useful NGINX Directives

| Directive | Purpose |
|-----------|---------|
| `proxy_pass` | Route to upstream server |
| `proxy_set_header` | Modify request headers |
| `proxy_cache` | Enable caching |
| `proxy_buffering` | Buffer responses |
| `limit_req` | Rate limiting |
| `auth_basic` | Basic authentication |
| `ssl_certificate` | SSL certificate path |
| `add_header` | Add response headers |
| `rewrite` | URL rewriting |
| `try_files` | Fallback file resolution |
| `location` | Route matching |
| `upstream` | Load balancing group |
| `server_name` | Domain matching |
| `listen` | Port binding |

## Emergency Commands

```bash
# Stop all traffic immediately
docker exec zentoria-proxy nginx -s stop

# Restart NGINX
docker restart zentoria-proxy

# Clear all logs
docker exec zentoria-proxy bash -c 'cat /dev/null > /var/log/nginx/access.log'

# Emergency security: Block all IPs except localhost
docker exec zentoria-proxy bash << 'EOF'
cat > /etc/nginx/conf.d/emergency-block.conf << 'INNER'
deny all;
allow 127.0.0.1;
allow ::1;
INNER
nginx -s reload
EOF

# Monitor in real-time
docker exec zentoria-proxy tail -f /var/log/nginx/error.log

# Check disk usage (if logs are full)
docker exec zentoria-proxy du -sh /var/log/nginx/
```

## Performance Tuning

```bash
# Check worker processes
docker exec zentoria-proxy grep "worker_processes" /etc/nginx/nginx.conf

# Adjust worker connections
docker exec zentoria-proxy sed -i 's/worker_connections [0-9]*/worker_connections 8192/' /etc/nginx/nginx.conf

# Check current connections
docker exec zentoria-proxy ss -tuln | grep -E "(80|443)" | awk '{print $1, $2, $3, $4}'

# Monitor connections in real-time
docker exec zentoria-proxy watch 'ss -tuln | grep -E "(80|443)"'
```

## Troubleshooting Quick Guide

| Problem | Command | Fix |
|---------|---------|-----|
| NGINX won't start | `nginx -t` | Fix syntax errors |
| Service unreachable | `curl -v https://service.zentoria.local` | Check upstream |
| SSL errors | `openssl x509 -text -noout -in cert.crt` | Verify certificate |
| High latency | `curl -w` (timing) | Check upstream health |
| Rate limiting too strict | `grep 429 access.log` | Increase limits |
| High memory usage | `ps aux \| grep nginx` | Reduce buffers |
| Logs too large | `du -sh /var/log/nginx/` | Rotate/truncate |

## Files Reference

| File | Purpose | Edit? |
|------|---------|-------|
| `nginx.conf` | Main config | Yes |
| `conf.d/upstreams.conf` | Upstream defs | Yes |
| `conf.d/security.conf` | Security headers | Yes |
| `conf.d/rate-limits.conf` | Rate limits | Yes |
| `sites-available/*.conf` | Service configs | Yes |
| `ssl/zentoria.crt` | SSL cert | No |
| `ssl/zentoria.key` | SSL key | No |
| `/var/log/nginx/access.log` | Access logs | View only |
| `/var/log/nginx/error.log` | Error logs | View only |
