# NGINX Configuration - Files Manifest

Complete inventory of all NGINX reverse proxy configuration files for Zentoria Personal Edition.

**Created:** 2026-01-16
**Container:** 408 (zentoria-proxy)
**Version:** 1.0.0

## Directory Structure

```
infrastructure/nginx/
├── nginx.conf                          (Master configuration)
├── conf.d/
│   ├── upstreams.conf                 (20 upstream definitions)
│   ├── security.conf                  (Security hardening)
│   ├── rate-limits.conf               (Rate limiting rules)
│   └── crowdsec.conf                  (CrowdSec WAF integration)
├── sites-available/
│   ├── 01-frontend.conf               (Frontend UI routing)
│   ├── 02-backend.conf                (Backend API routing)
│   ├── 03-n8n.conf                    (N8N automation)
│   ├── 04-vault.conf                  (HashiCorp Vault)
│   ├── 05-ai.conf                     (AI & Ollama services)
│   ├── 06-observability.conf          (Loki & Prometheus)
│   ├── 07-storage.conf                (MinIO S3 storage)
│   ├── 08-auth.conf                   (Keycloak authentication)
│   ├── 09-cache-rag.conf              (Redis, OCR, Voice, RAG)
│   └── 10-docs.conf                   (Documentation services)
├── ssl/
│   ├── generate-certificates.sh       (Certificate generation script)
│   ├── zentoria.crt                   (SSL certificate - generated)
│   ├── zentoria.key                   (Private key - generated)
│   ├── zentoria.csr                   (CSR - generated)
│   ├── dhparam.pem                    (DH parameters - generated)
│   └── san.conf                       (SAN config - generated)
├── README.md                           (Comprehensive documentation)
├── DEPLOYMENT.md                       (Step-by-step deployment guide)
├── QUICK_REFERENCE.md                  (Command reference)
└── FILES_MANIFEST.md                   (This file)
```

## File Descriptions

### Core Configuration

#### `nginx.conf` (Main Configuration)
**Size:** ~3.5 KB
**Purpose:** Master NGINX configuration file
**Contains:**
- User/worker process settings
- Event loop configuration
- HTTP core settings
- Logging configuration
- GZIP compression settings
- Rate limiting zones
- Security variables
- Module includes

**Key Sections:**
- Worker process optimization (auto-tuned)
- Event model optimization (epoll)
- Connection handling (4096 per worker)
- Logging format with performance metrics
- Upstream inclusion
- Security configuration inclusion
- Rate limiting zones inclusion

**Modifies:** None directly (includes other configs)

### Configuration Modules (conf.d/)

#### `conf.d/upstreams.conf` (Upstream Definitions)
**Size:** ~4.2 KB
**Purpose:** Define all backend service upstreams for load balancing
**Contains:** 19 upstream definitions

**Upstreams Defined:**
1. `zentoria_frontend` - Frontend UI (container 400:3000)
2. `zentoria_backend` - Backend API (container 401:4000)
3. `zentoria_backend_ws` - WebSocket (container 401:4001)
4. `zentoria_n8n` - N8N Automation (container 402:5678)
5. `zentoria_vault` - HashiCorp Vault (container 403:8200)
6. `zentoria_ai` - AI API (container 405:5000)
7. `zentoria_ollama` - Ollama LLM (container 405:11434)
8. `zentoria_logs` - Loki Logs (container 406:3001)
9. `zentoria_prometheus` - Prometheus (container 406:9090)
10. `zentoria_minio_api` - MinIO S3 API (container 407:9000)
11. `zentoria_minio_ui` - MinIO Console (container 407:9001)
12. `zentoria_auth` - Keycloak (container 409:9000)
13. `zentoria_redis` - Redis Commander (container 410:8081)
14. `zentoria_ocr` - OCR Service (container 412:8000)
15. `zentoria_voice` - Voice/Audio (container 413:9300)
16. `zentoria_docs` - Documentation (container 418:3002)
17. `zentoria_swagger` - Swagger UI (container 418:8080)
18. `zentoria_embeddings` - RAG Embeddings (container 419:8100)
19. `zentoria_qdrant` - Qdrant Vector DB (container 419:6333)

**Features:**
- Health check configuration
- Failover settings (max_fails=3, fail_timeout=10s)
- Connection keepalive (32 per upstream)
- Zone allocation for connection tracking

#### `conf.d/security.conf` (Security Hardening)
**Size:** ~3.8 KB
**Purpose:** Centralized security configuration and hardening rules
**Contains:**

**Security Headers:**
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- X-Frame-Options: SAMEORIGIN
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: Disable unnecessary features
- HSTS: 1 year max-age with preload
- CSP: Strict content security policy

**SSL/TLS Settings:**
- Protocol: TLS 1.2 & 1.3 only
- Cipher suites: ECDHE, ChaCha20, DHE
- Session cache: 10MB, 10m timeout
- OCSP Stapling: Enabled
- DH Parameters: 2048-bit

**Request Limits:**
- Client body timeout: 10s
- Client header timeout: 10s
- Send timeout: 10s
- Keep-alive: 5s + 5s

**Additional:**
- Server tokens: Hidden
- Directory listing: Disabled
- IP spoofing protection
- Bot detection mapping

#### `conf.d/rate-limits.conf` (Rate Limiting)
**Size:** ~3.2 KB
**Purpose:** Define rate limiting zones and rules
**Contains:** 6 rate limiting zones

**Zones:**
1. `api_limit` - 100 req/sec (general API)
2. `api_strict` - 10 req/sec (auth/security)
3. `api_file_upload` - 5 req/min (large uploads)
4. `login_limit` - 5 req/min (login attempts)
5. `token_refresh` - 20 req/min (token refresh)
6. `search_limit` - 30 req/min (search queries)

**Features:**
- Internal IP bypass (no rate limit)
- Burst protection
- Bot limiting
- Slow request detection
- Cache optimization

#### `conf.d/crowdsec.conf` (CrowdSec WAF)
**Size:** ~4.5 KB
**Purpose:** Integrate CrowdSec threat intelligence system
**Contains:**

**Features:**
- CrowdSec bouncer configuration
- Lua module integration (optional)
- Attack pattern detection
- Whitelist configuration
- Manual ban/allow rules
- Request logging for analysis

**Attack Patterns Detected:**
- Path traversal (../)
- SQL injection
- XSS attacks
- Admin scanning
- Sensitive file access
- CVE exploitation

**Whitelist:**
- Internal networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Major search engines
- Custom IPs

### Site Configurations (sites-available/)

#### `sites-available/01-frontend.conf` (Frontend UI)
**Size:** ~2.8 KB
**Service:** ui.zentoria.local
**Port:** 443 (HTTPS)
**Upstream:** zentoria-frontend:3000

**Features:**
- HTTP → HTTPS redirect
- Static asset caching (1 year)
- Service worker special handling
- API proxy passthrough
- WebSocket support
- SPA fallback routing
- Error page handling

**Rate Limit:** 20 burst

#### `sites-available/02-backend.conf` (Backend API)
**Size:** ~4.6 KB
**Service:** api.zentoria.local
**Port:** 443 (HTTPS)
**Upstreams:** zentoria-backend:4000, zentoria-backend:4001

**Features:**
- REST API routing
- WebSocket proxy (separate location)
- File upload handling
- Authentication endpoints
- Token refresh endpoint
- CORS header support
- Large file buffering

**Rate Limits:**
- API: 50 burst
- Login: 2 burst (strict)
- Upload: burst 2 (strict)

#### `sites-available/03-n8n.conf` (N8N Automation)
**Size:** ~2.4 KB
**Service:** n8n.zentoria.local
**Port:** 443 (HTTPS)
**Upstream:** zentoria-n8n:5678

**Features:**
- N8N UI routing
- WebSocket support
- Webhook endpoints
- API passthrough
- File upload
- 300s timeout for workflows

**Rate Limit:** 30 burst

#### `sites-available/04-vault.conf` (HashiCorp Vault)
**Size:** ~3.1 KB
**Service:** vault.zentoria.local
**Port:** 443 (HTTPS)
**Upstream:** zentoria-vault:8200

**Features:**
- Vault API routing (/v1/)
- Authentication endpoints
- Secret engine routing
- Token header passthrough
- Strict rate limiting
- No response caching

**Rate Limit:** 10 burst (API), 5 burst (auth)

#### `sites-available/05-ai.conf` (AI Services)
**Size:** ~4.8 KB
**Services:**
- ai.zentoria.local (AI API, container 405:5000)
- ollama.zentoria.local (Ollama LLM, container 405:11434)

**Features:**
- Long inference timeouts (600s)
- Streaming endpoint support
- Model download/push (1 hour timeout)
- Large request buffering
- Server-Sent Events support
- Request streaming (no buffering)

**Special Endpoints:**
- `/api/v1/inference` - 600s timeout
- `/api/v1/stream` - SSE streaming
- `/api/v1/upload` - 300s timeout (upload)
- `/api/generate` - 600s timeout (Ollama)
- `/api/pull` - 3600s timeout (model download)

#### `sites-available/06-observability.conf` (Logs & Prometheus)
**Size:** ~4.2 KB
**Services:**
- logs.zentoria.local (Loki, container 406:3001)
- prometheus.zentoria.local (Prometheus, container 406:9090)

**Features:**
- Query endpoint optimization
- Health check endpoints
- Metrics scraping
- Configuration endpoint
- Service discovery
- Target management

**Special Timeouts:**
- Query operations: 120s
- Metrics scrape: 10s
- Configuration: 10s

#### `sites-available/07-storage.conf` (MinIO S3)
**Size:** ~5.3 KB
**Services:**
- files.zentoria.local (MinIO UI, container 407:9001)
- s3.zentoria.local (S3 API, container 407:9000)

**Features:**
- Console UI routing
- S3 API compatibility
- Large file support (100MB+)
- Multipart upload
- GET request caching
- WebSocket support (console)
- Streaming uploads

**Special Endpoints:**
- `/?uploads` - Multipart upload
- `/health` - Health check
- Static assets - 1h cache

#### `sites-available/08-auth.conf` (Keycloak)
**Size:** ~3.6 KB
**Service:** auth.zentoria.local
**Port:** 443 (HTTPS)
**Upstream:** zentoria-auth:9000

**Features:**
- Admin console routing
- OAuth/OpenID endpoints
- Account management
- User info endpoints
- Token endpoints
- Static asset caching

**Special Routes:**
- `/admin/` - Admin console
- `/auth/realms/*/protocol/` - OAuth endpoints
- `/account/` - User account management

#### `sites-available/09-cache-rag.conf` (Specialized Services)
**Size:** ~5.7 KB
**Services:**
- redis.zentoria.local (Redis Commander, 410:8081)
- ocr.zentoria.local (OCR Service, 412:8000)
- voice.zentoria.local (Voice/Audio, 413:9300)
- rag.zentoria.local (Embeddings, 419:8100)
- qdrant.zentoria.local (Vector DB, 419:6333)

**Features by Service:**

**Redis:**
- Standard proxy, 20 rate limit

**OCR:**
- Document upload: 50M max
- OCR processing: 300s timeout
- Stream processing

**Voice:**
- Speech-to-Text: 120s timeout
- Text-to-Speech: 120s timeout
- Audio upload: 300s timeout

**RAG:**
- Embedding generation: 120s
- Vector search: 120s, strict rate limit
- Search queries: special rate limit

**Qdrant:**
- Collections operations: 60s
- Point search: 120s, strict rate limit
- Large collection support

#### `sites-available/10-docs.conf` (Documentation)
**Size:** ~3.9 KB
**Services:**
- docs.zentoria.local (Docs/Wiki, 418:3002)
- swagger.zentoria.local (Swagger UI, 418:8080)

**Features:**
- Static asset caching (1 year)
- API definition caching (30m)
- Search endpoint support
- OpenAPI spec caching
- Try-it-out endpoint

**Caching:**
- JS/CSS/Images: 1 year
- Swagger definitions: 30m
- OpenAPI spec: 1h

### SSL/TLS Files

#### `ssl/generate-certificates.sh` (Certificate Generation)
**Size:** ~6.2 KB
**Type:** Bash script (executable)
**Purpose:** Generate SSL/TLS certificates

**Commands:**
- `generate` - Self-signed certificates (default)
- `letsencrypt` - Setup Let's Encrypt automation
- `renew` - Manual certificate renewal
- `verify` - Verify certificate validity
- `info` - Display certificate information

**Features:**
- Multi-domain SAN support
- DH parameter generation
- Auto-renewal setup
- Cron job integration
- Renewal verification

#### `ssl/zentoria.crt` (SSL Certificate)
**Type:** X.509 certificate (PEM format)
**Generated:** Yes (run script)
**Size:** ~1.5 KB
**Validity:** 10 years (3650 days)
**Permissions:** 644 (readable by www-data)

**SANs Include:** 21 domains (.local subdomains)

#### `ssl/zentoria.key` (Private Key)
**Type:** RSA private key (PEM format)
**Generated:** Yes (run script)
**Size:** ~1.7 KB
**Permissions:** 600 (readable only by www-data)
**Encryption:** None (plaintext key)

#### `ssl/dhparam.pem` (DH Parameters)
**Type:** Diffie-Hellman parameters
**Generated:** Yes (run script)
**Size:** ~1 KB
**Bit Length:** 2048 bits
**Purpose:** Perfect Forward Secrecy
**Permissions:** 600

#### `ssl/san.conf` (SAN Configuration)
**Type:** OpenSSL config file
**Generated:** Yes (by generate script)
**Size:** ~0.5 KB
**Purpose:** Define Subject Alternative Names
**Includes:** All 21 .local subdomains

### Documentation Files

#### `README.md` (Main Documentation)
**Size:** ~12 KB
**Contents:**
- Architecture overview
- Directory structure
- Service routing table
- Quick start guide
- Security features
- Performance optimization
- Monitoring & logging
- CrowdSec integration
- Troubleshooting
- Production deployment
- Performance tuning
- References

#### `DEPLOYMENT.md` (Deployment Guide)
**Size:** ~14 KB
**Contents:**
- Prerequisites
- Phase-by-phase deployment
- Certificate generation
- Configuration copying
- Site enabling
- Validation procedures
- Testing connectivity
- Monitoring setup
- Production hardening
- Troubleshooting guide
- Rollback procedures
- Success checklist

#### `QUICK_REFERENCE.md` (Quick Lookup)
**Size:** ~10 KB
**Contents:**
- Essential commands
- Certificate management
- Log management
- Service testing
- Configuration snippets
- Common configurations
- Monitoring & analytics
- Rate limiting reference
- Service URLs table
- Status code reference
- NGINX directives
- Emergency commands
- Performance tuning
- Troubleshooting quick guide

#### `FILES_MANIFEST.md` (This File)
**Size:** ~8 KB
**Purpose:** Complete inventory and description of all files

## Statistics

| Category | Count | Total Size |
|----------|-------|-----------|
| Configuration Files | 13 | ~45 KB |
| Certificate Files | 5 | ~5 KB |
| Documentation | 4 | ~44 KB |
| **Total** | **22** | **~94 KB** |

### Configuration Files

| Type | Count | Files |
|------|-------|-------|
| Main | 1 | nginx.conf |
| Modules | 4 | upstreams.conf, security.conf, rate-limits.conf, crowdsec.conf |
| Sites | 10 | 01-frontend.conf through 10-docs.conf |

## Installation Checklist

- [ ] Copy `nginx.conf` to `/etc/nginx/`
- [ ] Copy `conf.d/*.conf` to `/etc/nginx/conf.d/`
- [ ] Copy `sites-available/*.conf` to `/etc/nginx/sites-available/`
- [ ] Run `ssl/generate-certificates.sh generate`
- [ ] Copy `ssl/zentoria.crt` to `/etc/nginx/ssl/`
- [ ] Copy `ssl/zentoria.key` to `/etc/nginx/ssl/`
- [ ] Copy `ssl/dhparam.pem` to `/etc/nginx/ssl/`
- [ ] Set file permissions correctly
- [ ] Create `sites-enabled` symlinks
- [ ] Test configuration with `nginx -t`
- [ ] Reload NGINX with `nginx -s reload`
- [ ] Verify all services accessible
- [ ] Check logs in `/var/log/nginx/`

## Deployment Commands

```bash
# Copy all files to container
docker cp infrastructure/nginx/nginx.conf zentoria-proxy:/etc/nginx/
docker cp infrastructure/nginx/conf.d/. zentoria-proxy:/etc/nginx/conf.d/
docker cp infrastructure/nginx/sites-available/. zentoria-proxy:/etc/nginx/sites-available/
docker cp infrastructure/nginx/ssl/zentoria.crt zentoria-proxy:/etc/nginx/ssl/
docker cp infrastructure/nginx/ssl/zentoria.key zentoria-proxy:/etc/nginx/ssl/
docker cp infrastructure/nginx/ssl/dhparam.pem zentoria-proxy:/etc/nginx/ssl/

# Enable sites and reload
docker exec zentoria-proxy bash -c 'cd /etc/nginx/sites-enabled && for f in ../sites-available/*.conf; do ln -sf "$f" .; done'
docker exec zentoria-proxy nginx -t && docker exec zentoria-proxy nginx -s reload
```

## Version History

**v1.0.0 (2026-01-16)**
- Initial release
- 19 upstream services configured
- 10 site configurations
- Complete security hardening
- Rate limiting zones
- CrowdSec WAF integration
- Self-signed certificate support
- Let's Encrypt automation support
- Comprehensive documentation

## File Modifications

Files that should be customized per environment:
- `conf.d/rate-limits.conf` - Adjust rate limiting per needs
- `sites-available/*.conf` - Modify service timeouts if needed
- `ssl/generate-certificates.sh` - Update domain list for production
- Individual site configs - Adjust backend container IPs if different network

Files that should NOT be modified:
- `nginx.conf` - Master configuration
- `conf.d/upstreams.conf` - Upstream definitions (only if adding services)
- `conf.d/security.conf` - Security hardening
- `conf.d/crowdsec.conf` - WAF configuration

## Support & Resources

- **NGINX Documentation:** https://nginx.org/en/docs/
- **Security Hardening:** https://owasp.org/www-project-secure-headers/
- **SSL/TLS Configuration:** https://ssl-config.mozilla.org/
- **CrowdSec Documentation:** https://docs.crowdsec.net/
- **Let's Encrypt:** https://letsencrypt.org/

## License

All configuration files are part of Zentoria Personal Edition.
