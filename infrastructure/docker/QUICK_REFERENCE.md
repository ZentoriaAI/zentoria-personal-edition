# Zentoria Docker - Quick Reference

Fast reference for common Docker Compose commands and operations.

## Quick Start (5 minutes)

```bash
cd infrastructure/docker

# 1. Configure environment
cp envs/.env.example .env
nano .env  # Edit passwords and settings

# 2. Create network
docker network create zentoria --subnet 172.20.0.0/16

# 3. Start all services
docker-compose up -d

# 4. Check status
docker-compose ps

# 5. Access services
# Browser: http://localhost
# Grafana: http://localhost:3000 (admin/changeme)
# n8n: http://localhost:5678
# MinIO: http://localhost:9001
```

---

## Essential Commands

### Service Control

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d postgres
docker-compose up -d nginx

# Stop all services
docker-compose down

# Restart service
docker-compose restart postgres

# View status
docker-compose ps

# View logs
docker-compose logs -f postgres
docker-compose logs -f --tail=100

# Follow multiple services
docker-compose logs -f postgres redis
```

### Database Operations

```bash
# PostgreSQL shell
docker-compose exec postgres psql -U zentoria -d zentoria_core

# List databases
docker-compose exec postgres psql -U zentoria -l

# Backup database
docker-compose exec postgres pg_dump -U zentoria zentoria_core > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U zentoria -d zentoria_core

# View connection stats
docker-compose exec pgbouncer psql -U zentoria -p 6432 -d pgbouncer -c "SHOW STATS"
```

### Redis Operations

```bash
# Redis CLI
docker-compose exec redis redis-cli -a changeme

# Ping Redis
docker-compose exec redis redis-cli -a changeme ping

# Check memory
docker-compose exec redis redis-cli -a changeme INFO memory

# Clear all data
docker-compose exec redis redis-cli -a changeme FLUSHALL

# Monitor operations (in Redis CLI)
MONITOR

# Check key count
DBSIZE
```

### Container Management

```bash
# Execute command in container
docker-compose exec postgres bash

# View environment variables
docker-compose exec postgres env | grep POSTGRES

# Check resource usage
docker stats

# Container stats
docker-compose stats

# Remove stopped containers
docker container prune

# Remove dangling volumes
docker volume prune
```

---

## Service Ports

| Service | Port | Type |
|---------|------|------|
| NGINX | 80, 443 | Reverse Proxy |
| PostgreSQL | 5432 | Database |
| PgBouncer | 6432 | Connection Pool |
| Redis | 6379 | Cache |
| Redis Insight | 5540 | UI |
| Prometheus | 9090 | Metrics |
| Grafana | 3000 | Dashboards |
| Loki | 3100 | Logs |
| n8n | 5678 | Automation |
| MinIO | 9000 | Storage API |
| MinIO Console | 9001 | Storage UI |
| Ollama | 11434 | LLM API |
| Open WebUI | 8080 | LLM UI |
| Qdrant | 6333 | Vector DB |
| Paperless | 8000 | OCR |
| Whisper | 8005 | Speech-to-Text |
| Piper | 8006 | Text-to-Speech |
| Auth | 8008 | Authentication |
| ModSecurity | 8009 | WAF |
| Swagger | 8010 | API Docs |
| Redoc | 8011 | API Docs |
| Wiki.js | 3001 | Documentation |
| Vault | 8200 | Secrets |

---

## Troubleshooting

### Service won't start

```bash
# Check logs
docker-compose logs postgres

# Check port availability
lsof -i :5432

# Reset service
docker-compose down postgres
docker volume rm zentoria_postgres_data
docker-compose up -d postgres
```

### Out of memory

```bash
# Check usage
docker system df

# Clean up
docker-compose down -v
docker system prune -a

# Increase limits in .env
REDIS_MAXMEMORY=512mb
```

### Connection refused

```bash
# Verify service is running
docker-compose ps postgres

# Check network
docker network ls
docker-compose ps

# Restart network
docker-compose down
docker network rm zentoria
docker-compose up -d
```

### Slow database

```bash
# Check connection pool
docker-compose exec pgbouncer psql -U zentoria -p 6432 -d pgbouncer -c "SHOW STATS"

# View active queries
docker-compose exec postgres psql -U zentoria -d zentoria_core -c \
  "SELECT pid, usename, query FROM pg_stat_activity"

# Kill slow query
docker-compose exec postgres psql -U zentoria -d zentoria_core -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query_start < now() - interval '5 minutes'"
```

---

## Useful One-Liners

```bash
# Restart all services
docker-compose down && docker-compose up -d

# View all logs (last 100 lines)
docker-compose logs --tail=100

# Monitor services in real-time
watch -n 1 'docker-compose ps'

# Backup all volumes
for vol in $(docker volume ls -q | grep zentoria); do
  docker run --rm -v $vol:/data -v /backup:/backup \
  alpine tar czf /backup/$vol.tar.gz -C /data .
done

# Get service IP addresses
docker-compose ps -q | xargs -I {} docker inspect {} -f '{{.Name}}: {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'

# Check all health statuses
docker-compose ps | grep -E "STATUS|Up"

# Stream all logs from all services
docker-compose logs -f --all

# Total size of all containers
docker system df

# List all environment variables in a service
docker-compose config | grep -A 50 "environment:"
```

---

## Development Overrides

Enable development features:

```bash
# Copy development override
cp docker-compose.override.yaml.example docker-compose.override.yaml

# Includes:
# - MailHog (email testing on port 8025)
# - pgAdmin (database UI on port 5050)
# - Adminer (database management on port 8081)
# - Additional debug logging
# - Exposed service ports

# Start with development features
docker-compose up -d

# Access pgAdmin
# Browser: http://localhost:5050
# Email: admin@zentoria.ai
# Password: admin

# Access MailHog
# Browser: http://localhost:8025
```

---

## Environment Variable Examples

```bash
# Production secrets
DB_PASSWORD=<generate-strong-password>
REDIS_PASSWORD=<generate-strong-password>
JWT_SECRET_KEY=<generate-strong-password>
N8N_ENCRYPTION_KEY=<generate-strong-password>

# Service configuration
OLLAMA_MODEL=mistral
WHISPER_MODEL=base
EMBEDDING_MODEL=all-MiniLM-L6-v2

# Performance tuning
REDIS_MAXMEMORY=512mb
PGBOUNCER_MAX_CLIENT_CONN=1000
NGINX_WORKERS=4

# Logging
LOG_LEVEL=info
GRAFANA_LOG_LEVEL=info
PROMETHEUS_RETENTION=15d

# Features
LANGUAGE_DETECTION=true
AUTO_BACKUP=true
ALERT_ENABLED=true
```

---

## Backup & Restore

```bash
# Full database backup
docker-compose exec postgres pg_dump -U zentoria zentoria_core | gzip > backup.sql.gz

# Restore from backup
gunzip < backup.sql.gz | docker-compose exec -T postgres psql -U zentoria -d zentoria_core

# Backup specific table
docker-compose exec postgres pg_dump -U zentoria -t table_name zentoria_core > table.sql

# Backup all volumes
docker run --rm \
  -v zentoria_postgres_data:/postgres \
  -v zentoria_redis_data:/redis \
  -v zentoria_minio_data_1:/minio \
  -v /backup:/backup \
  alpine tar czf /backup/full.tar.gz /postgres /redis /minio

# Restore volumes
docker run --rm \
  -v zentoria_postgres_data:/postgres \
  -v zentoria_redis_data:/redis \
  -v zentoria_minio_data_1:/minio \
  -v /backup:/backup \
  alpine tar xzf /backup/full.tar.gz -C /
```

---

## Performance Tips

```bash
# Enable aggressive caching
redis-cli -a changeme CONFIG SET maxmemory-policy allkeys-lfu

# Optimize PostgreSQL
docker-compose exec postgres psql -U zentoria -d zentoria_core -c \
  "ALTER SYSTEM SET shared_buffers = '512MB';
   ALTER SYSTEM SET effective_cache_size = '2GB';
   ALTER SYSTEM SET maintenance_work_mem = '256MB';
   SELECT pg_reload_conf();"

# Monitor real-time metrics
docker stats --no-stream

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

---

## Scaling

```bash
# Scale n8n workers
docker-compose up -d --scale n8n-worker=5

# Scale specific service
docker-compose up -d --scale embedding-service=3

# View scaled services
docker-compose ps | grep worker
```

---

## Cleanup

```bash
# Remove all Zentoria services
docker-compose down

# Remove all data
docker-compose down -v

# Full cleanup (remove images too)
docker-compose down -v --remove-orphans
docker system prune -a

# Selective cleanup
docker-compose down postgres
docker volume rm zentoria_postgres_data
```

---

## Common Tasks

| Task | Command |
|------|---------|
| Restart PostgreSQL | `docker-compose restart postgres` |
| View PostgreSQL logs | `docker-compose logs postgres -f` |
| Enter PostgreSQL shell | `docker-compose exec postgres psql -U zentoria` |
| Backup database | `docker-compose exec postgres pg_dump -U zentoria zentoria_core > db.sql` |
| Restart Redis | `docker-compose restart redis` |
| Clear Redis cache | `docker-compose exec redis redis-cli -a changeme FLUSHALL` |
| View n8n logs | `docker-compose logs n8n -f` |
| Restart all services | `docker-compose down && docker-compose up -d` |
| Check service status | `docker-compose ps` |
| View real-time metrics | `docker stats` |
| Export Prometheus data | `curl http://localhost:9090/api/v1/query?query=up` |
| Check certificate expiry | `docker-compose exec certbot certificates` |

---

## Getting Help

```bash
# View docker-compose help
docker-compose --help

# View compose file structure
docker-compose config

# Validate compose file
docker-compose config --quiet

# View service dependencies
docker-compose config --resolve-image-digests

# Dry run (show what would happen)
docker-compose up --no-start

# Interactive shell in service
docker-compose run --rm postgres bash
```

---

For more detailed information, see [DEPLOYMENT.md](./DEPLOYMENT.md)
