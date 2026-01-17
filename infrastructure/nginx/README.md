# Zentoria NGINX Reverse Proxy & API Gateway

Production-grade NGINX configuration for Zentoria Personal Edition reverse proxy and API gateway (Container 408).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        NGINX Proxy (408)                     │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         SSL/TLS Termination & Encryption              │   │
│  │  - TLS 1.2 & 1.3                                     │   │
│  │  - Self-signed or Let's Encrypt certificates         │   │
│  │  - OCSP Stapling                                     │   │
│  │  - DH Parameters (2048-bit)                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Security Headers & Policies                  │   │
│  │  - HSTS (1 year)                                     │   │
│  │  - CSP (Content Security Policy)                     │   │
│  │  - X-Frame-Options, X-Content-Type-Options          │   │
│  │  - Permissions-Policy (disable unnecessary features)│   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │      Rate Limiting & DDoS Protection                 │   │
│  │  - Request rate limits per endpoint                  │   │
│  │  - Connection limiting                               │   │
│  │  - Bot detection                                     │   │
│  │  - CrowdSec WAF integration                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │      Request Routing & Load Balancing                │   │
│  │  - Subdomain-based routing                           │   │
│  │  - Health checks                                     │   │
│  │  - Connection reuse                                  │   │
│  │  - Upstream failover                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │   Backend Service Upstreams (20 services)            │   │
│  │  - Frontend, Backend API, WebSockets                 │   │
│  │  - N8N, Vault, AI Services                           │   │
│  │  - Observability (Logs, Prometheus)                 │   │
│  │  - Storage (MinIO S3)                                │   │
│  │  - Auth (Keycloak)                                   │   │
│  │  - RAG & Embeddings                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
infrastructure/nginx/
├── nginx.conf                          # Main NGINX configuration
├── conf.d/
│   ├── upstreams.conf                 # Upstream service definitions
│   ├── security.conf                  # Security hardening
│   ├── rate-limits.conf               # Rate limiting rules
│   └── crowdsec.conf                  # CrowdSec WAF integration
├── sites-available/
│   ├── 01-frontend.conf               # Frontend (ui.zentoria.local)
│   ├── 02-backend.conf                # Backend API (api.zentoria.local)
│   ├── 03-n8n.conf                    # N8N Automation
│   ├── 04-vault.conf                  # HashiCorp Vault
│   ├── 05-ai.conf                     # AI Services (ai, ollama)
│   ├── 06-observability.conf          # Logs & Prometheus
│   ├── 07-storage.conf                # MinIO S3
│   ├── 08-auth.conf                   # Keycloak Auth
│   ├── 09-cache-rag.conf              # Redis, OCR, Voice, RAG
│   └── 10-docs.conf                   # Docs & Swagger
├── ssl/
│   ├── generate-certificates.sh       # SSL/TLS cert generation
│   ├── zentoria.crt                   # Certificate (generated)
│   ├── zentoria.key                   # Private key (generated)
│   ├── zentoria.csr                   # CSR (generated)
│   ├── dhparam.pem                    # DH parameters (generated)
│   └── san.conf                       # SAN configuration (generated)
└── README.md                           # This file
```

## Service Routing

| Subdomain | Backend Container | Internal Port | Purpose |
|-----------|------------------|---------------|---------|
| ui.zentoria.local | 400 (frontend) | 3000 | Web UI |
| api.zentoria.local | 401 (backend) | 4000 | REST API |
| ws.zentoria.local | 401 (backend) | 4001 | WebSocket |
| n8n.zentoria.local | 402 (n8n) | 5678 | Automation |
| vault.zentoria.local | 403 (vault) | 8200 | Secrets |
| ai.zentoria.local | 405 (ai) | 5000 | AI API |
| ollama.zentoria.local | 405 (ai) | 11434 | LLM Engine |
| logs.zentoria.local | 406 (logs) | 3001 | Loki Logs |
| prometheus.zentoria.local | 406 (logs) | 9090 | Metrics |
| files.zentoria.local | 407 (files) | 9001 | MinIO UI |
| s3.zentoria.local | 407 (files) | 9000 | S3 API |
| auth.zentoria.local | 409 (auth) | 9000 | Keycloak |
| redis.zentoria.local | 410 (redis) | 8081 | Redis UI |
| ocr.zentoria.local | 412 (ocr) | 8000 | OCR Service |
| voice.zentoria.local | 413 (voice) | 9300 | Voice/Audio |
| docs.zentoria.local | 418 (docs) | 3002 | Docs/Wiki |
| swagger.zentoria.local | 418 (docs) | 8080 | Swagger UI |
| rag.zentoria.local | 419 (embeddings) | 8100 | RAG Embeddings |
| qdrant.zentoria.local | 419 (embeddings) | 6333 | Qdrant DB |

## Quick Start

### 1. Generate SSL/TLS Certificates

```bash
# Make script executable
chmod +x infrastructure/nginx/ssl/generate-certificates.sh

# Generate self-signed certificates (development)
infrastructure/nginx/ssl/generate-certificates.sh generate

# Generate DH parameters (already included above)
# For Let's Encrypt (production):
infrastructure/nginx/ssl/generate-certificates.sh letsencrypt
```

### 2. Copy Configuration to Container

```bash
# Copy nginx configs to proxy container
docker cp infrastructure/nginx/nginx.conf zentoria-proxy:/etc/nginx/
docker cp infrastructure/nginx/conf.d zentoria-proxy:/etc/nginx/
docker cp infrastructure/nginx/sites-available zentoria-proxy:/etc/nginx/
docker cp infrastructure/nginx/ssl zentoria-proxy:/etc/nginx/

# Set proper permissions
docker exec zentoria-proxy chown -R www-data:www-data /etc/nginx/ssl
docker exec zentoria-proxy chmod 600 /etc/nginx/ssl/*.key
```

### 3. Enable Configurations

```bash
# Create sites-enabled symlinks
docker exec zentoria-proxy bash -c 'cd /etc/nginx/sites-enabled && for f in ../sites-available/*.conf; do ln -sf "$f" . || true; done'

# Test NGINX configuration
docker exec zentoria-proxy nginx -t

# Reload NGINX
docker exec zentoria-proxy nginx -s reload
```

### 4. Update /etc/hosts for Local Development

```bash
# On your local machine, add to /etc/hosts
127.0.0.1   zentoria.local
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
```

### 5. Verify Services

```bash
# Check NGINX status
docker exec zentoria-proxy nginx -s status

# Test proxy functionality
curl -k https://ui.zentoria.local
curl -k https://api.zentoria.local/health

# View logs
docker logs zentoria-proxy
docker exec zentoria-proxy tail -f /var/log/nginx/access.log
docker exec zentoria-proxy tail -f /var/log/nginx/error.log
docker exec zentoria-proxy tail -f /var/log/nginx/security.log
```

## Security Features

### SSL/TLS Encryption

- **TLS 1.2 & 1.3** - Modern encryption protocols
- **Strong Ciphers** - Elliptic Curve & ChaCha20-Poly1305
- **OCSP Stapling** - Improved certificate validation
- **DH Parameters** - Perfect Forward Secrecy support
- **Session Caching** - Improved performance

### Security Headers

- **HSTS** (1 year) - Force HTTPS for future connections
- **CSP** (Content Security Policy) - Prevent XSS attacks
- **X-Frame-Options** - Clickjacking protection
- **X-Content-Type-Options** - MIME type sniffing prevention
- **Referrer-Policy** - Control referrer information
- **Permissions-Policy** - Disable unnecessary browser features
- **Cross-Origin Policies** - Prevent cross-origin attacks

### Rate Limiting

```
API Endpoints:        100 req/sec, burst 50
Login/Auth:           5 req/min, burst 2
File Upload:          5 req/min, burst 2
Search:               30 req/min, burst 20
AI Inference:         30 req/min (longer timeouts)
Ollama Models:        20 req/min
```

### Protection Features

- **DDoS Protection** - Slow client detection, connection limiting
- **Bot Detection** - User-agent filtering
- **Request Size Limiting** - 100MB max for uploads
- **Timeout Protection** - Client/server timeout enforcement
- **IP Spoofing Protection** - X-Forwarded-For validation
- **CrowdSec WAF** - Distributed threat intelligence

## Performance Optimization

### Compression

- **GZIP** - Enabled for text, JSON, JavaScript
- **Compression Level** - 6 (balance speed/ratio)
- **Minimum Size** - 1KB

### Caching

- **Static Assets** - 1 year expiration
- **Service Worker** - No-cache (always fresh)
- **API Responses** - No caching (no-store)
- **Docs** - 1 hour expiration

### Connection Optimization

- **Keepalive** - 65 seconds timeout
- **Worker Connections** - Auto-tuned (up to 4096 per worker)
- **Connection Reuse** - HTTP/1.1 persistent connections
- **Upstream Keepalive** - 32 connections per upstream

### Buffering

- **Response Buffering** - Enabled for most endpoints
- **Request Buffering** - Disabled for uploads (streaming)
- **Large File Support** - Up to 2GB temp storage

## Monitoring & Logging

### Log Files

```
/var/log/nginx/
├── access.log           # All requests
├── error.log            # NGINX errors
├── security.log         # Security events (4xx, 5xx)
├── ui-access.log        # Frontend requests
├── api-access.log       # Backend API requests
├── crowdsec-attacks.log # Attack patterns detected
├── blocked-requests.log # Blocked requests
└── cert-renewal.log     # Certificate renewal log
```

### Metrics & Health Checks

```bash
# NGINX status (internal only)
http://localhost:8080/nginx_status

# Health checks (per service)
https://ui.zentoria.local/health
https://api.zentoria.local/health
https://vault.zentoria.local/v1/sys/health
# etc.
```

### Prometheus Metrics

Available at: `https://prometheus.zentoria.local/metrics`

Key metrics:
- `nginx_requests_total` - Total requests
- `nginx_requests_duration_seconds` - Request latency
- `nginx_connections_active` - Active connections
- `nginx_upstream_requests_total` - Upstream requests

## CrowdSec Integration

CrowdSec provides distributed threat intelligence and automatic blocking.

### Setup

```bash
# Deploy CrowdSec container
docker run -d --name zentoria-waf \
  -v /etc/crowdsec:/etc/crowdsec \
  -v /var/lib/crowdsec:/var/lib/crowdsec \
  -p 6000:6000 \
  crowdsecurity/crowdsec:latest

# Register NGINX bouncer
docker exec zentoria-waf cscli bouncer add nginx-bouncer

# Deploy bouncer
docker run -d --name nginx-bouncer \
  -e BOUNCER_URL=http://zentoria-waf:6000 \
  -e BOUNCER_KEY=<bouncer_key> \
  crowdsecurity/nginx-bouncer:latest
```

### Features

- **Attack Detection** - Path traversal, SQLi, XSS, CVEs
- **Automatic Bans** - IP-based blocking
- **CAPTCHA Challenges** - Optional challenge responses
- **Custom Scenarios** - Define security rules
- **Whitelist Management** - Trusted IPs, search engines

### Monitoring CrowdSec

```bash
# List active decisions
docker exec zentoria-waf cscli decisions list

# View logs
docker logs zentoria-waf

# Ban statistics
docker exec zentoria-waf cscli metrics

# Unban IP
docker exec zentoria-waf cscli decisions delete -i <IP>
```

## Troubleshooting

### NGINX Won't Start

```bash
# Check configuration syntax
docker exec zentoria-proxy nginx -t

# View detailed error
docker logs zentoria-proxy

# Check permissions
docker exec zentoria-proxy ls -la /etc/nginx/
docker exec zentoria-proxy ls -la /etc/nginx/ssl/
```

### SSL Certificate Errors

```bash
# Verify certificate
docker exec zentoria-proxy openssl x509 -in /etc/nginx/ssl/zentoria.crt -text -noout

# Check certificate expiration
docker exec zentoria-proxy openssl x509 -enddate -noout -in /etc/nginx/ssl/zentoria.crt

# Verify key matches certificate
docker exec zentoria-proxy openssl x509 -noout -modulus -in /etc/nginx/ssl/zentoria.crt | openssl md5
docker exec zentoria-proxy openssl rsa -noout -modulus -in /etc/nginx/ssl/zentoria.key | openssl md5
```

### Service Not Reachable

```bash
# Check upstream connectivity
docker exec zentoria-proxy curl -v http://zentoria-frontend:3000/health
docker exec zentoria-proxy curl -v http://zentoria-backend:4000/health

# Verify DNS resolution
docker exec zentoria-proxy nslookup zentoria-frontend
docker exec zentoria-proxy nslookup zentoria-backend

# Check port bindings
docker port zentoria-proxy
docker port zentoria-frontend
```

### High Latency/Timeouts

```bash
# Check upstream health
docker exec zentoria-proxy curl -v http://backend-ip:port/health

# Increase upstream timeouts in sites-available configs
proxy_connect_timeout 30s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;

# Reload configuration
docker exec zentoria-proxy nginx -s reload
```

### Rate Limiting Too Aggressive

```bash
# Adjust rate limits in conf.d/rate-limits.conf
limit_req_zone $limit_api zone=api_limit:10m rate=150r/s;  # Increase rate

# Reload configuration
docker exec zentoria-proxy nginx -s reload
```

## Production Deployment

### Let's Encrypt Setup

```bash
# Install Let's Encrypt certificates
docker exec zentoria-proxy certbot certonly \
  --webroot -w /var/www/html \
  -d zentoria.local \
  -d ui.zentoria.local \
  -d api.zentoria.local \
  -d "*.zentoria.local"

# Update nginx.conf to point to Let's Encrypt certs
ssl_certificate /etc/letsencrypt/live/zentoria.local/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/zentoria.local/privkey.pem;
```

### Auto-Renewal

```bash
# Setup automatic renewal via cron
docker exec zentoria-proxy /etc/nginx/ssl/generate-certificates.sh letsencrypt

# Test renewal
docker exec zentoria-proxy /etc/nginx/ssl/generate-certificates.sh renew
```

### Backup & Restore

```bash
# Backup configuration
tar czf nginx-backup-$(date +%Y%m%d).tar.gz infrastructure/nginx/

# Backup certificates
tar czf nginx-certs-backup-$(date +%Y%m%d).tar.gz infrastructure/nginx/ssl/

# Restore from backup
tar xzf nginx-backup-YYYYMMDD.tar.gz -C infrastructure/
```

## Performance Tuning

### Worker Process Optimization

```nginx
# Auto-tune based on CPU cores
worker_processes auto;

# Increase file descriptors
worker_rlimit_nofile 65535;

# Optimize event processing
worker_connections 4096;
use epoll;
multi_accept on;
```

### Memory Optimization

```nginx
# Reduce buffer sizes for small responses
client_body_buffer_size 10M;
client_header_buffer_size 4k;
large_client_header_buffers 4 32k;

# Optimize proxy buffers
proxy_buffer_size 4k;
proxy_buffers 8 4k;
proxy_busy_buffers_size 8k;
```

### Network Optimization

```nginx
# Enable TCP optimizations
tcp_nopush on;
tcp_nodelay on;

# Reuse connections
keepalive_timeout 65;
```

## References

- [NGINX Documentation](https://nginx.org/en/docs/)
- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
- [Mozilla SSL Configuration](https://ssl-config.mozilla.org/)
- [CrowdSec Documentation](https://docs.crowdsec.net/)
- [Let's Encrypt](https://letsencrypt.org/)

## License

All configurations are part of Zentoria Personal Edition.
