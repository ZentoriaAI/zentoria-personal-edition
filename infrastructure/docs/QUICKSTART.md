# Zentoria Personal Edition - Quick Start Guide

**Get up and running in 30 minutes**

---

## Overview

This guide will get you a minimal viable Zentoria deployment for testing and evaluation. For production deployment, see the full [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

### What You'll Deploy

**Minimal Stack (6 containers):**
- Frontend (400)
- Backend (401)
- Database (404)
- Redis (410)
- Proxy (408)
- AI (405)

**Time Required:** ~30 minutes

---

## Prerequisites

✅ **Hardware:**
- 16 GB RAM minimum
- 100 GB disk space
- 8 CPU cores

✅ **Software:**
- Proxmox VE 7.4+ or 8.x
- Root access to Proxmox host
- Internet connection

✅ **Network:**
- Available IP range (10.10.40.0/24)
- DNS or /etc/hosts access

---

## Step 1: Prepare Environment (5 min)

### 1.1 Clone Repository

```bash
# On your local machine
cd /tmp
git clone https://github.com/zentoria/zentoria-mcp.git
cd zentoria-mcp

# Copy to Proxmox host
scp -r infrastructure/ root@proxmox:/tmp/zentoria-infra
```

### 1.2 SSH to Proxmox

```bash
ssh root@proxmox
cd /tmp/zentoria-infra
```

### 1.3 Configure Settings

```bash
cd scripts
nano 00-config.sh

# Change these values:
STORAGE_POOL="local-zfs"    # Your Proxmox storage
TEMPLATE_ID="9000"          # Ubuntu 24.04 template (create if needed)
```

---

## Step 2: Create Containers (10 min)

### 2.1 Create Ubuntu Template (if needed)

```bash
# Download Ubuntu cloud image
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img

# Create template
qm create 9000 --name ubuntu-24.04-template --memory 2048 --net0 virtio,bridge=vmbr0
qm importdisk 9000 noble-server-cloudimg-amd64.img local-zfs
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-zfs:vm-9000-disk-0
qm set 9000 --boot c --bootdisk scsi0
qm set 9000 --serial0 socket --vga serial0
qm template 9000

# Clean up
rm noble-server-cloudimg-amd64.img
```

### 2.2 Create Core Containers

```bash
cd /tmp/zentoria-infra/scripts

# Create only essential containers
./create-container.sh 400 zentoria-frontend 2 4096 40
./create-container.sh 401 zentoria-backend 4 8192 60
./create-container.sh 404 zentoria-db 4 16384 200
./create-container.sh 405 zentoria-ai 8 32768 150
./create-container.sh 408 zentoria-proxy 2 4096 40
./create-container.sh 410 zentoria-redis 2 8192 40

# Verify all started
pct list | grep zentoria
```

**Expected Output:**
```
400  zentoria-frontend    running
401  zentoria-backend     running
404  zentoria-db          running
405  zentoria-ai          running
408  zentoria-proxy       running
410  zentoria-redis       running
```

---

## Step 3: Setup Database (5 min)

### 3.1 Install Docker in Container 404

```bash
pct exec 404 -- bash << 'EOF'
apt update && apt upgrade -y
apt install -y docker.io docker-compose
systemctl enable docker
systemctl start docker
mkdir -p /opt/zentoria/db/{data,backups,scripts}
EOF
```

### 3.2 Create Docker Compose

```bash
pct exec 404 -- bash << 'EOF'
cat > /opt/zentoria/db/docker-compose.yml << 'DOCKER'
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: postgres
    environment:
      POSTGRES_USER: zentoria
      POSTGRES_PASSWORD: changeme123
      POSTGRES_DB: zentoria_core
    volumes:
      - /opt/zentoria/db/data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U zentoria"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgbouncer:
    image: pgbouncer/pgbouncer:latest
    container_name: pgbouncer
    environment:
      DATABASES: zentoria_core=host=postgres port=5432 dbname=zentoria_core
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 1000
      DEFAULT_POOL_SIZE: 25
    ports:
      - "6432:6432"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
DOCKER

cd /opt/zentoria/db
docker-compose up -d
EOF
```

### 3.3 Verify Database

```bash
pct exec 404 -- docker exec postgres psql -U zentoria -d zentoria_core -c "SELECT version();"
```

---

## Step 4: Setup Redis (2 min)

```bash
pct exec 410 -- bash << 'EOF'
apt update && apt install -y docker.io docker-compose
systemctl enable docker && systemctl start docker
mkdir -p /opt/zentoria/redis/{data,config}

cat > /opt/zentoria/redis/docker-compose.yml << 'DOCKER'
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: redis
    command: redis-server --requirepass changeme123 --maxmemory 8gb --maxmemory-policy allkeys-lru
    volumes:
      - /opt/zentoria/redis/data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "changeme123", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
DOCKER

cd /opt/zentoria/redis
docker-compose up -d
EOF

# Verify
pct exec 410 -- docker exec redis redis-cli -a changeme123 ping
```

---

## Step 5: Setup Backend (5 min)

### 5.1 Install Dependencies

```bash
pct exec 401 -- bash << 'EOF'
apt update && apt install -y curl git nodejs npm
npm install -g n pm2
n stable
hash -r
EOF
```

### 5.2 Clone and Build Backend

```bash
# Copy backend code to container
scp -r mcp-gateway/ root@proxmox:/tmp/
pct push 401 /tmp/mcp-gateway /opt/zentoria/backend

pct exec 401 -- bash << 'EOF'
cd /opt/zentoria/backend

# Install dependencies
npm install

# Create .env
cat > .env << 'ENV'
NODE_ENV=development
PORT=4000
WS_PORT=4001

DATABASE_URL=postgresql://zentoria:changeme123@10.10.40.4:6432/zentoria_core
REDIS_URL=redis://:changeme123@10.10.41.0:6379

JWT_SECRET=dev_secret_change_in_production
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

AI_ORCHESTRATOR_URL=http://10.10.40.5:5000
OLLAMA_URL=http://10.10.40.5:11434

LOG_LEVEL=info
ENV

# Build
npm run build

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
EOF
```

### 5.3 Verify Backend

```bash
pct exec 401 -- curl http://localhost:4000/api/v1/health
```

---

## Step 6: Setup Frontend (3 min)

```bash
pct exec 400 -- bash << 'EOF'
apt update && apt install -y curl git nodejs npm
npm install -g n pm2
n stable
hash -r
EOF

# Copy frontend code
scp -r frontend/ root@proxmox:/tmp/
pct push 400 /tmp/frontend /opt/zentoria/frontend

pct exec 400 -- bash << 'EOF'
cd /opt/zentoria/frontend

npm install

cat > .env.local << 'ENV'
NEXT_PUBLIC_API_URL=http://10.10.40.1:4000
NEXT_PUBLIC_WS_URL=ws://10.10.40.1:4001
ENV

npm run build

pm2 start npm --name "zentoria-frontend" -- start
pm2 save
EOF
```

---

## Step 7: Setup NGINX Proxy (2 min)

```bash
pct exec 408 -- bash << 'EOF'
apt update && apt install -y nginx

cat > /etc/nginx/sites-available/zentoria << 'NGINX'
# Frontend
server {
    listen 80;
    server_name zentoria.local;

    location / {
        proxy_pass http://10.10.40.0:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Backend API
server {
    listen 80;
    server_name api.zentoria.local;

    location / {
        proxy_pass http://10.10.40.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# WebSocket
server {
    listen 80;
    server_name ws.zentoria.local;

    location / {
        proxy_pass http://10.10.40.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX

ln -s /etc/nginx/sites-available/zentoria /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
EOF
```

---

## Step 8: Setup AI (Optional, 5 min)

```bash
pct exec 405 -- bash << 'EOF'
apt update && apt install -y curl

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull model (will take a few minutes)
ollama pull llama3.2:latest

# Verify
ollama list
EOF
```

---

## Step 9: Configure DNS (2 min)

### Option A: Local /etc/hosts (Quick)

```bash
# On your local machine
sudo nano /etc/hosts

# Add these lines:
10.10.40.8  zentoria.local
10.10.40.8  api.zentoria.local
10.10.40.8  ws.zentoria.local
```

### Option B: Proxmox Host DNS

```bash
# On Proxmox host
nano /etc/hosts

# Add:
10.10.40.8  zentoria.local api.zentoria.local ws.zentoria.local
```

---

## Step 10: Verify Installation (2 min)

### Health Checks

```bash
# From Proxmox host or local machine

# 1. Database
curl -s http://10.10.40.4:5432 && echo "DB: OK" || echo "DB: FAIL"

# 2. Redis
redis-cli -h 10.10.41.0 -a changeme123 ping

# 3. Backend API
curl http://api.zentoria.local/api/v1/health

# 4. Frontend
curl -I http://zentoria.local

# 5. AI (if installed)
curl http://10.10.40.5:11434/api/tags
```

### Access the UI

Open browser: `http://zentoria.local`

**Default Credentials:**
- Email: admin@zentoria.local
- Password: admin (change immediately!)

---

## Next Steps

### Essential Configuration

1. **Change Passwords:**
   ```bash
   # Database
   pct exec 404 -- docker exec postgres psql -U zentoria -d zentoria_core \
     -c "ALTER USER zentoria PASSWORD 'new_secure_password';"

   # Redis
   pct exec 410 -- docker exec redis redis-cli -a changeme123 \
     CONFIG SET requirepass new_secure_password
   ```

2. **Generate JWT Secret:**
   ```bash
   openssl rand -base64 64
   # Update in /opt/zentoria/backend/.env
   ```

3. **Create Admin User:**
   - Go to http://zentoria.local/setup
   - Complete first-time setup wizard

### Optional Services

**Add n8n (Workflows):**
```bash
./create-container.sh 402 zentoria-n8n 4 8192 80
# Follow n8n setup guide
```

**Add Monitoring:**
```bash
./create-container.sh 406 zentoria-logs 2 8192 100
# Follow observability setup guide
```

**Add File Storage:**
```bash
./create-container.sh 407 zentoria-files 2 4096 500
# Follow MinIO setup guide
```

### Production Hardening

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for:
- SSL/TLS certificates
- Firewall rules
- Security hardening
- Backup configuration
- Monitoring setup

---

## Troubleshooting

### Container won't start

```bash
pct status 401
journalctl -u pve-container@401 -n 50

# Common fix: increase memory
pct set 401 --memory 8192
pct start 401
```

### Database connection failed

```bash
# Check PostgreSQL logs
pct exec 404 -- docker logs postgres --tail 50

# Test connection
pct exec 401 -- psql -h 10.10.40.4 -U zentoria -d zentoria_core -c "SELECT 1"

# Common fix: wrong IP or password
```

### Backend not starting

```bash
pct exec 401 -- pm2 logs

# Check .env file
pct exec 401 -- cat /opt/zentoria/backend/.env

# Restart
pct exec 401 -- pm2 restart all
```

### Can't access UI

```bash
# Check NGINX
pct exec 408 -- nginx -t
pct exec 408 -- systemctl status nginx

# Check DNS
ping zentoria.local

# Check frontend
pct exec 400 -- pm2 logs
```

---

## Quick Reference

### Container Access

```bash
# SSH to container
pct enter 401

# Execute command
pct exec 401 -- command

# View logs
pct exec 401 -- journalctl -f
```

### Service Management

```bash
# Backend
pct exec 401 -- pm2 status
pct exec 401 -- pm2 restart all
pct exec 401 -- pm2 logs

# Database
pct exec 404 -- docker-compose ps
pct exec 404 -- docker-compose logs -f

# NGINX
pct exec 408 -- systemctl status nginx
pct exec 408 -- nginx -t
pct exec 408 -- systemctl reload nginx
```

### Database Operations

```bash
# Connect to PostgreSQL
pct exec 404 -- docker exec -it postgres psql -U zentoria -d zentoria_core

# Backup
pct exec 404 -- docker exec postgres pg_dump -U zentoria zentoria_core > backup.sql

# Restore
pct exec 404 -- docker exec -i postgres psql -U zentoria zentoria_core < backup.sql
```

---

## Clean Up

To remove everything:

```bash
# Stop containers
pct stop 400 401 404 405 408 410

# Delete containers
pct destroy 400
pct destroy 401
pct destroy 404
pct destroy 405
pct destroy 408
pct destroy 410

# Clean up storage
rm -rf /tmp/zentoria-infra
```

---

## Support

- **Full Documentation:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Issues:** GitHub Issues
- **Email:** support@zentoria.ai

---

**Congratulations!** 🎉

You now have a minimal Zentoria deployment running. For production use, please follow the complete deployment guide with security hardening, monitoring, and backup configuration.
