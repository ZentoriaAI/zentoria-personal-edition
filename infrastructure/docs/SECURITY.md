# Zentoria Personal Edition - Security Documentation

**Version:** 1.0
**Last Updated:** January 2026
**Classification:** Internal

---

## Table of Contents

1. [Security Overview](#security-overview)
2. [Credential Management](#credential-management)
3. [SSL/TLS Certificates](#ssltls-certificates)
4. [Firewall Configuration](#firewall-configuration)
5. [Access Control](#access-control)
6. [Audit Logging](#audit-logging)
7. [Security Hardening](#security-hardening)
8. [Incident Response](#incident-response)

---

## Security Overview

### Defense-in-Depth Strategy

Zentoria implements multiple layers of security:

```
┌─────────────────────────────────────────────────────┐
│ Layer 7: User Authentication & Authorization       │
│   JWT tokens, API keys, scope-based permissions    │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│ Layer 6: Application Security                      │
│   Input validation, CSRF, XSS protection           │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│ Layer 5: API Security                              │
│   Rate limiting, API key validation, scopes        │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│ Layer 4: Web Application Firewall                  │
│   CrowdSec, Bot detection, Threat intelligence     │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│ Layer 3: Network Segmentation                      │
│   Firewall rules, Zone isolation                   │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│ Layer 2: Container Isolation                       │
│   LXC isolation, Resource limits                   │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│ Layer 1: Infrastructure Security                   │
│   Proxmox security, Host firewall                  │
└─────────────────────────────────────────────────────┘
```

### Security Principles

1. **Zero Trust:** Never trust, always verify
2. **Least Privilege:** Minimal access rights
3. **Defense in Depth:** Multiple security layers
4. **Secure by Default:** Secure configuration out-of-box
5. **Audit Everything:** Comprehensive logging

---

## Credential Management

### Password Requirements

**All passwords must meet:**
- Minimum 32 characters
- Mix of uppercase, lowercase, numbers, symbols
- No dictionary words
- Unique per service

**Generate secure passwords:**
```bash
# Generate 32-character password
openssl rand -base64 32

# Generate 64-character password
openssl rand -base64 64
```

### HashiCorp Vault Setup

**Initial Setup:**

```bash
# 1. Initialize Vault
pct exec 403 -- docker exec vault vault operator init -key-shares=5 -key-threshold=3

# OUTPUT (SAVE THIS SECURELY!):
# Unseal Key 1: <key1>
# Unseal Key 2: <key2>
# Unseal Key 3: <key3>
# Unseal Key 4: <key4>
# Unseal Key 5: <key5>
# Initial Root Token: <root-token>

# 2. Unseal Vault (requires 3 of 5 keys)
pct exec 403 -- docker exec vault vault operator unseal <key1>
pct exec 403 -- docker exec vault vault operator unseal <key2>
pct exec 403 -- docker exec vault vault operator unseal <key3>

# 3. Login with root token
pct exec 403 -- docker exec vault vault login <root-token>

# 4. Enable KV secrets engine
pct exec 403 -- docker exec vault vault secrets enable -path=zentoria kv-v2
```

**Store Secrets:**

```bash
# Database credentials
pct exec 403 -- docker exec vault vault kv put zentoria/db \
  user=zentoria \
  password="$(openssl rand -base64 32)" \
  admin_password="$(openssl rand -base64 32)"

# Redis password
pct exec 403 -- docker exec vault vault kv put zentoria/redis \
  password="$(openssl rand -base64 32)"

# MinIO credentials
pct exec 403 -- docker exec vault vault kv put zentoria/minio \
  root_user=minioadmin \
  root_password="$(openssl rand -base64 32)"

# JWT secrets
pct exec 403 -- docker exec vault vault kv put zentoria/jwt \
  secret_key="$(openssl rand -base64 64)" \
  refresh_secret="$(openssl rand -base64 64)"

# n8n encryption key
pct exec 403 -- docker exec vault vault kv put zentoria/n8n \
  encryption_key="$(openssl rand -base64 32)"
```

**Read Secrets:**

```bash
# Read database password
pct exec 403 -- docker exec vault vault kv get -field=password zentoria/db

# Read all database secrets
pct exec 403 -- docker exec vault vault kv get zentoria/db
```

**Rotate Secrets:**

```bash
# Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# Update in Vault
pct exec 403 -- docker exec vault vault kv put zentoria/db password="$NEW_PASSWORD"

# Update in database
pct exec 404 -- docker exec postgres psql -U postgres -c "ALTER USER zentoria PASSWORD '$NEW_PASSWORD';"

# Update in application .env
pct exec 401 -- sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$NEW_PASSWORD/" /opt/zentoria/backend/.env

# Restart application
pct exec 401 -- pm2 restart all
```

### Credential Storage Best Practices

**DO:**
- ✅ Store in HashiCorp Vault
- ✅ Use environment variables
- ✅ Rotate regularly (90 days)
- ✅ Use unique passwords per service
- ✅ Enable MFA where possible

**DON'T:**
- ❌ Store in code
- ❌ Store in Git
- ❌ Share passwords
- ❌ Reuse passwords
- ❌ Store in plaintext files

---

## SSL/TLS Certificates

### Let's Encrypt (Production)

**Setup:**

```bash
# 1. Install Certbot in proxy container
pct exec 408 -- apt install -y certbot python3-certbot-nginx

# 2. Obtain certificate
pct exec 408 -- certbot --nginx \
  -d zentoria.ai \
  -d *.zentoria.ai \
  --email admin@zentoria.ai \
  --agree-tos

# 3. Auto-renewal (already set up by certbot)
pct exec 408 -- systemctl list-timers | grep certbot

# 4. Test renewal
pct exec 408 -- certbot renew --dry-run
```

**Manual Renewal:**

```bash
pct exec 408 -- certbot renew
pct exec 408 -- nginx -s reload
```

### Self-Signed Certificates (Development)

**Generate:**

```bash
# Run generation script
bash infrastructure/nginx/ssl/generate-certificates.sh

# Or manually:
pct exec 408 -- bash << 'EOF'
mkdir -p /etc/nginx/ssl
cd /etc/nginx/ssl

# Generate private key
openssl genrsa -out zentoria.key 4096

# Generate certificate signing request
openssl req -new -key zentoria.key -out zentoria.csr \
  -subj "/C=NL/ST=Zuid-Holland/L=Den Haag/O=Zentoria/CN=*.zentoria.local"

# Generate self-signed certificate
openssl x509 -req -days 365 -in zentoria.csr -signkey zentoria.key -out zentoria.crt

# Set permissions
chmod 600 zentoria.key
chmod 644 zentoria.crt

EOF
```

**NGINX Configuration:**

```nginx
server {
    listen 443 ssl http2;
    server_name zentoria.local;

    ssl_certificate /etc/nginx/ssl/zentoria.crt;
    ssl_certificate_key /etc/nginx/ssl/zentoria.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # ... rest of config
}
```

### Certificate Monitoring

```bash
# Check certificate expiration
pct exec 408 -- openssl x509 -in /etc/nginx/ssl/zentoria.crt -noout -dates

# Check with certbot
pct exec 408 -- certbot certificates

# Set up expiration alerts in Grafana
# Alert when cert expires in < 30 days
```

---

## Firewall Configuration

### Proxmox Host Firewall

**Enable firewall:**

```bash
# Edit Proxmox firewall config
nano /etc/pve/firewall/cluster.fw
```

**Rules:**

```
[OPTIONS]
enable: 1

[RULES]
# Allow SSH
IN ACCEPT -p tcp -dport 22 -source <your-ip>

# Allow Proxmox Web UI
IN ACCEPT -p tcp -dport 8006 -source <your-ip>

# Block all other inbound
IN DROP -p tcp
IN DROP -p udp
```

### Container Firewall (iptables)

**Template script:**

```bash
#!/bin/bash
# /opt/zentoria/firewall-rules.sh

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X

# Default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Container-specific rules

# Proxy (408) - Allow external access
iptables -A INPUT -p tcp -s 0.0.0.0/0 -d 10.10.40.8 --dport 80 -j ACCEPT
iptables -A INPUT -p tcp -s 0.0.0.0/0 -d 10.10.40.8 --dport 443 -j ACCEPT

# Backend (401) - Only from proxy and frontend
iptables -A INPUT -p tcp -s 10.10.40.8 -d 10.10.40.1 --dport 4000 -j ACCEPT
iptables -A INPUT -p tcp -s 10.10.40.0 -d 10.10.40.1 --dport 4000 -j ACCEPT

# Database (404) - Only from backend and n8n
iptables -A INPUT -p tcp -s 10.10.40.1 -d 10.10.40.4 --dport 5432 -j ACCEPT
iptables -A INPUT -p tcp -s 10.10.40.2 -d 10.10.40.4 --dport 5432 -j ACCEPT
iptables -A INPUT -p tcp -s 10.10.40.1 -d 10.10.40.4 --dport 6432 -j ACCEPT
iptables -A INPUT -p tcp -s 10.10.40.2 -d 10.10.40.4 --dport 6432 -j ACCEPT

# Redis (410) - Only from backend and n8n
iptables -A INPUT -p tcp -s 10.10.40.1 -d 10.10.41.0 --dport 6379 -j ACCEPT
iptables -A INPUT -p tcp -s 10.10.40.2 -d 10.10.41.0 --dport 6379 -j ACCEPT

# Save rules
iptables-save > /etc/iptables/rules.v4
```

**Apply rules:**

```bash
# Copy to all containers
for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do
  pct push $ct /opt/zentoria/firewall-rules.sh /tmp/firewall-rules.sh
  pct exec $ct -- chmod +x /tmp/firewall-rules.sh
  pct exec $ct -- /tmp/firewall-rules.sh
done
```

### Port Security

**Exposed ports:**

| Port | Service | Exposure | Notes |
|------|---------|----------|-------|
| 80 | NGINX | External | Redirects to 443 |
| 443 | NGINX | External | SSL/TLS |
| 3000 | Frontend | Internal only | Via proxy |
| 4000 | Backend | Internal only | Via proxy |
| 5432 | PostgreSQL | Internal only | No external access |
| 6379 | Redis | Internal only | No external access |
| 8200 | Vault | Internal only | No external access |

**Verify closed ports:**

```bash
# From external network
nmap -p 1-65535 <proxmox-ip>

# Expected: Only 80, 443, 8006 (Proxmox UI) open
```

---

## Access Control

### User Roles

| Role | Permissions | Use Case |
|------|-------------|----------|
| **admin** | Full system access | System administrators |
| **developer** | Code deployment, logs | Development team |
| **operator** | Service management | Operations team |
| **viewer** | Read-only access | Monitoring, auditing |

### API Key Management

**Create API key:**

```bash
# In backend application
curl -X POST http://api.zentoria.local/api/v1/api-keys \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "automation-key",
    "scopes": ["files:read", "files:write", "ai:chat"],
    "expires_at": "2026-12-31T23:59:59Z"
  }'

# Response:
{
  "key": "znt_abc123...",
  "name": "automation-key",
  "scopes": ["files:read", "files:write", "ai:chat"],
  "created_at": "2026-01-16T12:00:00Z",
  "expires_at": "2026-12-31T23:59:59Z"
}
```

**Available scopes:**

```
files:read          # Read files
files:write         # Upload/modify files
files:delete        # Delete files
ai:chat             # Use AI chat
ai:models           # Manage AI models
workflows:read      # View workflows
workflows:write     # Create/modify workflows
workflows:execute   # Execute workflows
admin:all           # Full administrative access
```

**Revoke API key:**

```bash
curl -X DELETE http://api.zentoria.local/api/v1/api-keys/<key-id> \
  -H "Authorization: Bearer <jwt>"
```

**List API keys:**

```bash
curl http://api.zentoria.local/api/v1/api-keys \
  -H "Authorization: Bearer <jwt>"
```

### SSH Access

**Setup SSH keys (recommended):**

```bash
# Generate key pair
ssh-keygen -t ed25519 -C "zentoria-admin" -f ~/.ssh/zentoria_ed25519

# Copy to Proxmox host
ssh-copy-id -i ~/.ssh/zentoria_ed25519.pub root@proxmox

# Test
ssh -i ~/.ssh/zentoria_ed25519 root@proxmox
```

**Disable password authentication:**

```bash
# On Proxmox host
nano /etc/ssh/sshd_config

# Change:
PasswordAuthentication no
PermitRootLogin prohibit-password

# Restart SSH
systemctl restart sshd
```

---

## Audit Logging

### What to Log

**Security events:**
- Authentication attempts (success/failure)
- Authorization failures
- API key creation/revocation
- Configuration changes
- User account changes
- Privileged operations
- Data access (files, database)
- Network connections

### Audit Log Schema

```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id INTEGER,
  user_email VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  details JSONB,
  severity VARCHAR(20),
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  INDEX idx_audit_timestamp (timestamp),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_severity (severity)
);
```

### Query Audit Logs

```bash
make db-shell

# Recent failed logins
SELECT timestamp, user_email, ip_address, error_message
FROM audit_log
WHERE action = 'login' AND success = false
ORDER BY timestamp DESC LIMIT 20;

# API key usage
SELECT user_email, action, COUNT(*) as count
FROM audit_log
WHERE action LIKE 'api_key:%'
GROUP BY user_email, action
ORDER BY count DESC;

# Privileged operations
SELECT timestamp, user_email, action, resource_type, resource_id
FROM audit_log
WHERE severity = 'high' OR severity = 'critical'
ORDER BY timestamp DESC LIMIT 50;
```

### Export Audit Logs

```bash
# Export to CSV
make db-shell
\copy (SELECT * FROM audit_log WHERE timestamp > NOW() - INTERVAL '30 days') TO '/tmp/audit_log.csv' CSV HEADER;

# Export to JSON
pct exec 404 -- docker exec postgres psql -U zentoria -d zentoria_core \
  -c "COPY (SELECT row_to_json(t) FROM (SELECT * FROM audit_log WHERE timestamp > NOW() - INTERVAL '30 days') t) TO STDOUT" \
  > audit_log_$(date +%Y%m%d).json
```

---

## Security Hardening

### Container Hardening

**Disable root SSH:**

```bash
for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do
  pct exec $ct -- bash -c "
    sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
    systemctl restart sshd
  "
done
```

**Enable automatic security updates:**

```bash
for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do
  pct exec $ct -- apt install -y unattended-upgrades
  pct exec $ct -- dpkg-reconfigure -plow unattended-upgrades
done
```

**Set resource limits:**

```bash
# CPU limits
pct set 401 --cores 4 --cpulimit 3.5

# Memory limits
pct set 401 --memory 8192 --swap 0

# Disk I/O limits
pct set 401 --bwlimit read=100M,write=50M
```

### Application Hardening

**NGINX security headers:**

```nginx
# /etc/nginx/conf.d/security-headers.conf
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

**Rate limiting:**

```nginx
# /etc/nginx/conf.d/rate-limiting.conf
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=general:10m rate=100r/s;

server {
    location /api/v1/auth/login {
        limit_req zone=login burst=5 nodelay;
    }

    location /api/ {
        limit_req zone=api burst=20 nodelay;
    }

    location / {
        limit_req zone=general burst=200 nodelay;
    }
}
```

### Database Hardening

**PostgreSQL security:**

```bash
make db-shell

# Restrict network access
ALTER SYSTEM SET listen_addresses = 'localhost,10.10.40.4';

# Enable SSL
ALTER SYSTEM SET ssl = on;

# Disable superuser remote access
ALTER SYSTEM SET ssl_cert_file = '/var/lib/postgresql/server.crt';
ALTER SYSTEM SET ssl_key_file = '/var/lib/postgresql/server.key';

# Reload configuration
SELECT pg_reload_conf();

# Create read-only user for reporting
CREATE USER zentoria_readonly WITH PASSWORD '<password>';
GRANT CONNECT ON DATABASE zentoria_core TO zentoria_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO zentoria_readonly;
```

---

## Incident Response

### Security Incident Playbook

**1. Detection:**
- Monitor CrowdSec alerts
- Review failed authentication attempts
- Check for unusual API activity
- Review audit logs

**2. Containment:**
```bash
# Block suspicious IP
pct exec 423 -- docker exec crowdsec cscli decisions add \
  --ip <suspicious-ip> \
  --duration 24h \
  --reason "Security incident investigation"

# Revoke compromised API keys
curl -X DELETE http://api.zentoria.local/api/v1/api-keys/<key-id>

# Force logout all users
make redis-flush
```

**3. Investigation:**
```bash
# Review logs
make logs-backend | grep <suspicious-activity>

# Check database for unauthorized changes
make db-shell
SELECT * FROM audit_log WHERE timestamp > NOW() - INTERVAL '24 hours' ORDER BY timestamp DESC;

# Review file access
make db-shell
SELECT * FROM files WHERE accessed_at > NOW() - INTERVAL '24 hours';
```

**4. Recovery:**
```bash
# Rotate credentials
# Follow credential rotation procedure

# Restore from backup if needed
make restore-db

# Patch vulnerabilities
make update
```

**5. Post-Incident:**
- Document incident in detail
- Identify root cause
- Update procedures
- Implement preventive measures
- Conduct post-mortem review

---

## Security Checklist

### Initial Setup
- [ ] Change all default passwords
- [ ] Configure HashiCorp Vault
- [ ] Generate SSL certificates
- [ ] Configure firewall rules
- [ ] Enable audit logging
- [ ] Set up monitoring alerts
- [ ] Configure backup encryption
- [ ] Document emergency procedures

### Monthly Security Review
- [ ] Review audit logs
- [ ] Check for security updates
- [ ] Verify backup encryption
- [ ] Review user access
- [ ] Check SSL certificate expiration
- [ ] Review firewall rules
- [ ] Test incident response procedures

### Quarterly Security Audit
- [ ] Full security scan
- [ ] Penetration testing
- [ ] Review and update policies
- [ ] Credential rotation
- [ ] Disaster recovery test
- [ ] Security training refresher

---

## Compliance

### Data Protection

- All data encrypted at rest
- All data encrypted in transit (TLS 1.2+)
- Regular backups with encryption
- Access controls and audit logging
- Data retention policies enforced

### Privacy

- Minimal data collection
- User consent for tracking
- Right to data export
- Right to data deletion
- Privacy by design

---

## Support & Resources

**Security Issues:** security@zentoria.ai

**CVE Database:** https://cve.mitre.org/

**Security Tools:**
- CrowdSec: https://www.crowdsec.net/
- OWASP: https://owasp.org/
- SSL Labs: https://www.ssllabs.com/

---

**Document Version:** 1.0
**Last Security Audit:** January 2026
**Next Security Audit:** April 2026
