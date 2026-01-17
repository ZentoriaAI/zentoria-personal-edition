# NGINX Deployment Verification Checklist

**Zentoria Personal Edition - Container 408 (zentoria-proxy)**
**Version:** 1.0.0
**Created:** 2026-01-16

---

## Pre-Deployment Verification

### File Integrity Check

- [ ] All 20 files present (run: `ls -la infrastructure/nginx/ && ls -la infrastructure/nginx/conf.d/ && ls -la infrastructure/nginx/sites-available/`)
- [ ] Configuration files readable (all .conf files)
- [ ] Script is executable (`ssl/generate-certificates.sh` has +x)
- [ ] No file corruption (sizes reasonable, no 0 KB files)
- [ ] Documentation complete (6 markdown files present)

**Quick Check:**
```bash
cd infrastructure/nginx
find . -type f | wc -l  # Should be 20
du -sh .                # Should be ~188 KB
```

### Documentation Review

- [ ] Read INDEX.md (5 min)
- [ ] Read IMPLEMENTATION_SUMMARY.md (5 min)
- [ ] Skimmed README.md (for reference)
- [ ] Bookmarked QUICK_REFERENCE.md
- [ ] Reviewed DEPLOYMENT.md step 1-3

---

## Certificate Generation

### Self-Signed Certificate Setup

```bash
# Step 1: Navigate to SSL directory
cd infrastructure/nginx/ssl

# Step 2: Make script executable
chmod +x generate-certificates.sh
✓ Verify: ls -la generate-certificates.sh (should show -rwx...)

# Step 3: Generate certificates
./generate-certificates.sh generate
✓ Should output:
  [+] Generated private key
  [+] Generated CSR
  [+] Generated certificate
  [+] Set certificate permissions

# Step 4: Verify certificates created
ls -la zentoria.crt zentoria.key dhparam.pem
✓ All three files present
✓ .crt is readable (644 or 644)
✓ .key is restricted (600)
✓ .pem is restricted (600)
```

### Certificate Verification

```bash
# Verify certificate details
openssl x509 -text -noout -in zentoria.crt | grep -E "Subject:|Issuer:|Not Before:|Not After:"
✓ Should show:
  - Subject: CN=zentoria.local
  - Issuer: Self-signed
  - Validity: 10 years (3650 days)

# Check SANs included
openssl x509 -text -noout -in zentoria.crt | grep -A2 "Subject Alternative Name"
✓ Should list all 21 .local domains

# Verify DH parameters
ls -la dhparam.pem
✓ Should be ~1 KB, not empty
```

### Checklist

- [ ] `generate-certificates.sh` is executable
- [ ] `zentoria.crt` exists and is readable
- [ ] `zentoria.key` exists and is restricted (600)
- [ ] `dhparam.pem` exists and is restricted (600)
- [ ] `san.conf` generated
- [ ] Certificate expires in 10 years
- [ ] All SANs included in certificate
- [ ] Certificate and key modulus match

---

## File Deployment

### Copy Configuration to Container

```bash
# Verify container exists
docker ps | grep zentoria-proxy
✓ Container should be running

# Copy main configuration
docker cp infrastructure/nginx/nginx.conf zentoria-proxy:/etc/nginx/
✓ Verify: docker exec zentoria-proxy ls -la /etc/nginx/nginx.conf

# Copy conf.d modules
docker cp infrastructure/nginx/conf.d/. zentoria-proxy:/etc/nginx/conf.d/
✓ Verify: docker exec zentoria-proxy ls -la /etc/nginx/conf.d/
✓ Should show: upstreams.conf, security.conf, rate-limits.conf, crowdsec.conf

# Copy site configurations
docker cp infrastructure/nginx/sites-available/. zentoria-proxy:/etc/nginx/sites-available/
✓ Verify: docker exec zentoria-proxy ls -la /etc/nginx/sites-available/
✓ Should show: 10 .conf files (01-frontend through 10-docs)
```

### Copy SSL Certificates

```bash
# Create SSL directory if missing
docker exec zentoria-proxy mkdir -p /etc/nginx/ssl

# Copy certificate files
docker cp infrastructure/nginx/ssl/zentoria.crt zentoria-proxy:/etc/nginx/ssl/
docker cp infrastructure/nginx/ssl/zentoria.key zentoria-proxy:/etc/nginx/ssl/
docker cp infrastructure/nginx/ssl/dhparam.pem zentoria-proxy:/etc/nginx/ssl/
docker cp infrastructure/nginx/ssl/san.conf zentoria-proxy:/etc/nginx/ssl/

# Verify copied
docker exec zentoria-proxy ls -la /etc/nginx/ssl/
✓ Should show all four files

# Set permissions
docker exec zentoria-proxy chmod 644 /etc/nginx/ssl/zentoria.crt
docker exec zentoria-proxy chmod 600 /etc/nginx/ssl/zentoria.key
docker exec zentoria-proxy chmod 600 /etc/nginx/ssl/dhparam.pem
docker exec zentoria-proxy chown -R www-data:www-data /etc/nginx/ssl/

# Verify permissions
docker exec zentoria-proxy ls -la /etc/nginx/ssl/
✓ Permissions should be:
  -rw-r--r-- zentoria.crt
  -rw------- zentoria.key
  -rw------- dhparam.pem
```

### Checklist

- [ ] nginx.conf copied to `/etc/nginx/`
- [ ] All conf.d files copied
- [ ] All sites-available files copied
- [ ] SSL certificates copied (3 files)
- [ ] Permissions set correctly
- [ ] Ownership is www-data:www-data

---

## Configuration Validation

### NGINX Syntax Check

```bash
# Test main configuration
docker exec zentoria-proxy nginx -t
✓ Output should be:
  nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
  nginx: configuration file /etc/nginx/nginx.conf test is successful

# If errors appear, check:
docker exec zentoria-proxy nginx -T | head -50  # Show full config
docker logs zentoria-proxy | tail -20             # Check container logs
```

### Module Verification

```bash
# Verify all modules loaded
docker exec zentoria-proxy nginx -T | grep "include"
✓ Should show includes for:
  - conf.d/upstreams.conf
  - conf.d/security.conf
  - conf.d/rate-limits.conf
  - conf.d/crowdsec.conf
  - sites-enabled/*.conf (when symlinks created)

# Count upstreams
docker exec zentoria-proxy grep -c "^upstream" /etc/nginx/conf.d/upstreams.conf
✓ Should return: 19

# Count rate limit zones
docker exec zentoria-proxy grep -c "limit_req_zone" /etc/nginx/conf.d/rate-limits.conf
✓ Should return: 6
```

### Checklist

- [ ] nginx -t passes with no errors
- [ ] No warning messages
- [ ] All includes are correct
- [ ] 19 upstreams defined
- [ ] 6 rate limit zones defined
- [ ] Security headers configured
- [ ] SSL paths correct

---

## Enable Site Configurations

### Create Symlinks

```bash
# Create symlinks for all sites
docker exec zentoria-proxy bash -c 'cd /etc/nginx/sites-enabled && for f in ../sites-available/*.conf; do ln -sf "$f" . || true; done'

# Verify symlinks
docker exec zentoria-proxy ls -la /etc/nginx/sites-enabled/
✓ Should show 10 symlinks (01-frontend → 10-docs)

# Count symlinks
docker exec zentoria-proxy ls -la /etc/nginx/sites-enabled/ | wc -l
✓ Should be 10 files (plus . and ..)

# Test configuration again
docker exec zentoria-proxy nginx -t
✓ Still should pass
```

### Checklist

- [ ] sites-enabled directory created
- [ ] All 10 symlinks created
- [ ] No dangling symlinks
- [ ] nginx -t still passes

---

## Start & Reload NGINX

### Start or Reload Service

```bash
# Check if NGINX is running
docker exec zentoria-proxy ps aux | grep nginx
✓ Should show nginx master and worker processes

# Option 1: If already running, reload gracefully
docker exec zentoria-proxy nginx -s reload
✓ Output should be clean (no errors in logs)

# Option 2: If not running, start it
docker exec zentoria-proxy systemctl start nginx
# OR
docker restart zentoria-proxy

# Wait a moment for startup
sleep 2

# Verify NGINX is running
docker exec zentoria-proxy ps aux | grep "nginx: master"
✓ Should show master process
```

### Check Port Bindings

```bash
# Verify ports 80, 443, 8080 are bound
docker exec zentoria-proxy netstat -tuln | grep -E "(80|443|8080)"
✓ Should show:
  tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN
  tcp        0      0 0.0.0.0:443             0.0.0.0:*               LISTEN
  tcp        0      0 0.0.0.0:8080            0.0.0.0:*               LISTEN

# For IPv6 as well
docker exec zentoria-proxy netstat -tuln | grep -E ":::(80|443|8080)"
✓ Should show similar IPv6 bindings
```

### Checklist

- [ ] nginx -s reload executed successfully
- [ ] No errors in docker logs
- [ ] Port 80 listening
- [ ] Port 443 listening
- [ ] Port 8080 listening (internal status)
- [ ] Both IPv4 and IPv6

---

## Test Connectivity

### Update Local /etc/hosts

```bash
# Add entries to hosts file
# Windows: C:\Windows\System32\drivers\etc\hosts
# Linux/Mac: /etc/hosts

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

### Test Container Connectivity

```bash
# Test from inside container
docker exec zentoria-proxy bash << 'EOF'
echo "Testing upstream connectivity..."
curl -m 2 http://zentoria-frontend:3000/health 2>/dev/null && echo "✓ Frontend OK" || echo "✗ Frontend FAIL"
curl -m 2 http://zentoria-backend:4000/health 2>/dev/null && echo "✓ Backend OK" || echo "✗ Backend FAIL"
curl -m 2 http://zentoria-n8n:5678/health 2>/dev/null && echo "✓ N8N OK" || echo "✗ N8N FAIL"
curl -m 2 http://zentoria-vault:8200/v1/sys/health 2>/dev/null && echo "✓ Vault OK" || echo "✗ Vault FAIL"
curl -m 2 http://zentoria-files:9001/health 2>/dev/null && echo "✓ MinIO OK" || echo "✗ MinIO FAIL"
EOF
```

### Test HTTPS Access (Local)

```bash
# Test SSL certificate
docker exec zentoria-proxy openssl s_client -connect localhost:443 -servername ui.zentoria.local < /dev/null
✓ Should show certificate chain

# Test with curl from container
docker exec zentoria-proxy curl -k https://localhost/health
✓ Should return 200 or redirect

# Test proxy is working
docker exec zentoria-proxy curl -k -H "Host: api.zentoria.local" https://localhost/health
✓ Should proxy to backend
```

### Test External Access

```bash
# From your local machine
curl -k https://api.zentoria.local/health
✓ Should return 200 or service-specific response

# Measure response time
curl -k -w "@-" -o /dev/null -s https://api.zentoria.local/health << 'EOF'
time_total: %{time_total}\n
EOF

# Check SSL certificate
openssl s_client -connect api.zentoria.local:443 < /dev/null | openssl x509 -noout -dates
✓ Should show certificate dates
```

### Checklist

- [ ] Updated /etc/hosts with all 19 domains
- [ ] Container upstreams connectivity verified
- [ ] HTTPS working (self-signed cert accepted)
- [ ] SSL certificate valid
- [ ] Response times acceptable
- [ ] No certificate errors
- [ ] All major services responding

---

## Verify Security Headers

### Check Security Headers

```bash
# Check HSTS header
curl -k -i https://api.zentoria.local/health | grep "Strict-Transport-Security"
✓ Should show: Strict-Transport-Security: max-age=31536000

# Check CSP header
curl -k -i https://api.zentoria.local/health | grep "Content-Security-Policy"
✓ Should show CSP header

# Check all security headers
curl -k -i https://api.zentoria.local/health | grep -E "(X-Frame-Options|X-Content-Type-Options|X-XSS-Protection|Referrer-Policy)"
✓ Should show 4+ headers
```

### Checklist

- [ ] HSTS header present
- [ ] CSP header present
- [ ] X-Frame-Options present
- [ ] X-Content-Type-Options present
- [ ] X-XSS-Protection present
- [ ] Referrer-Policy present

---

## Monitor Logs

### Check Access Logs

```bash
# View recent access logs
docker exec zentoria-proxy tail -20 /var/log/nginx/access.log
✓ Should show recent requests with 200/2xx status codes

# Check error log
docker exec zentoria-proxy tail -20 /var/log/nginx/error.log
✓ Should be mostly empty (no errors)

# Check security log
docker exec zentoria-proxy tail -20 /var/log/nginx/security.log
✓ May be empty or show blocked requests
```

### Checklist

- [ ] Access logs being written
- [ ] No error log entries for proxy
- [ ] Status codes are 200/2xx for normal requests
- [ ] Rate limiting not triggering unnecessarily (no 429s)
- [ ] No TLS errors in logs

---

## Performance Verification

### Check Resource Usage

```bash
# Monitor NGINX process
docker exec zentoria-proxy ps aux | grep nginx
✓ Master process + worker processes (usually 1-4)

# Check memory usage
docker exec zentoria-proxy ps aux | grep nginx | awk '{sum+=$6} END {print "Total Memory (KB):", sum}'
✓ Should be reasonable (typically 10-50 MB)

# Check CPU usage
docker exec zentoria-proxy top -b -n 1 | grep nginx
✓ CPU usage should be low at idle
```

### Test Response Times

```bash
# Test multiple services
for service in api ui n8n vault ai; do
  echo "Testing $service..."
  curl -k -w "Time: %{time_total}s\n" -o /dev/null -s https://${service}.zentoria.local/health
done

✓ Times should be < 100ms for local services
```

### Checklist

- [ ] Worker processes running
- [ ] Memory usage reasonable
- [ ] CPU usage low at idle
- [ ] Response times < 100ms local
- [ ] No connection errors

---

## Rate Limiting Verification

### Test Rate Limiting

```bash
# Send multiple rapid requests to trigger rate limit
for i in {1..150}; do
  curl -k https://api.zentoria.local/health &
done
wait

# Check for 429 responses
docker exec zentoria-proxy grep "429" /var/log/nginx/access.log | wc -l
✓ Should show some 429 responses if limit exceeded

# View rate limiting stats
docker exec zentoria-proxy grep "429" /var/log/nginx/access.log | head -5
✓ Shows which endpoints were rate-limited
```

### Checklist

- [ ] Rate limiting zones active
- [ ] 429 responses logged
- [ ] Limits are appropriate (not too strict)
- [ ] API requests not continuously blocked
- [ ] File uploads still work

---

## Final Verification

### Complete Checklist

#### Infrastructure
- [ ] Container 408 running
- [ ] All configuration files deployed
- [ ] SSL certificates installed
- [ ] File permissions correct
- [ ] NGINX syntax valid
- [ ] Site symlinks created

#### Services
- [ ] 19 upstream services defined
- [ ] All services responding on health endpoints
- [ ] Frontend accessible
- [ ] Backend API accessible
- [ ] WebSocket working
- [ ] SSL working

#### Security
- [ ] 8+ security headers present
- [ ] TLS 1.2 & 1.3 enabled
- [ ] HSTS configured
- [ ] CSP configured
- [ ] Rate limiting active
- [ ] No certificate warnings

#### Performance
- [ ] Worker processes running
- [ ] Memory usage acceptable
- [ ] Response times < 100ms
- [ ] Caching working
- [ ] Compression working
- [ ] Connections pooling

#### Monitoring
- [ ] Access logs written
- [ ] Error logs clean
- [ ] Security logs created
- [ ] Prometheus metrics available
- [ ] Status page accessible

---

## Success Criteria

All of the following must be true for successful deployment:

✓ All 20 files present and accessible
✓ NGINX configuration passes syntax check (nginx -t)
✓ NGINX service started and running
✓ Ports 80, 443, 8080 listening
✓ All 19 upstreams defined
✓ SSL certificate valid and correct
✓ All services return successful responses
✓ Security headers present
✓ Logs being written
✓ Rate limiting active
✓ No errors in logs
✓ Response times acceptable

---

## Troubleshooting Quick Links

| Issue | Check | Solution |
|-------|-------|----------|
| nginx -t fails | Syntax error in config | Review error message, check quotes/braces |
| Service unreachable | Upstream connectivity | Verify container IP and port in upstreams.conf |
| SSL certificate error | Certificate validity | Regenerate with generate-certificates.sh |
| High latency | Response time | Check upstream service health, increase timeout |
| Rate limiting | Too many 429s | Adjust limits in conf.d/rate-limits.conf |
| Memory usage | Process count | Adjust worker_processes in nginx.conf |

---

## Sign-Off

Date Completed: _______________
Tested By: _______________
Notes: _______________

✓ DEPLOYMENT COMPLETE AND VERIFIED
