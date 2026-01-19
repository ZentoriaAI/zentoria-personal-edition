# Deployment Quick Reference

**Zentoria Personal Edition v1.0.0**

## Essential Commands

### Deploy to Staging
```bash
./scripts/deploy/deploy.sh staging v1.0.0
```

### Deploy to Production
```bash
./scripts/deploy/deploy.sh production v1.0.0
```

### Health Check
```bash
./scripts/health-check.sh -v
```

### Create Release Tag
```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
# GitHub Actions deploys automatically
```

## GitHub Actions Workflows

### Trigger CI/CD
Push to `main` or `develop`:
```bash
git add .
git commit -m "feat: new feature"
git push origin main
# CI runs automatically
```

### Deploy to Proxmox (via GitHub Actions)
```bash
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0
# Actions builds images and deploys
# Manual approval required for production
```

### Monitor Deployment
https://github.com/ZentoriaAI/zentoria-mcp/actions

## Feature Flags API

### List All Flags
```bash
curl -H "X-API-Key: YOUR_KEY" https://ai.zentoria.ai/api/v1/features
```

### Get Single Flag
```bash
curl -H "X-API-Key: YOUR_KEY" https://ai.zentoria.ai/api/v1/features/chat-v2
```

### Check if Enabled for User
```bash
curl -X POST \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123"}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2/check
```

### Enable Flag (Admin)
```bash
curl -X PUT \
  -H "X-API-Key: ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2
```

### Set Rollout Percentage (Admin)
```bash
# 5% rollout
curl -X POST \
  -H "X-API-Key: ADMIN_KEY" \
  -d '{"rolloutPercentage": 5}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2/rollout

# 50% rollout
curl -X POST \
  -H "X-API-Key: ADMIN_KEY" \
  -d '{"rolloutPercentage": 50}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2/rollout

# 100% rollout (fully enabled)
curl -X POST \
  -H "X-API-Key: ADMIN_KEY" \
  -d '{"rolloutPercentage": 100}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2/rollout
```

## Container Management

### SSH to Container
```bash
ssh root@100.121.19.12 "pct exec [ID] -- bash"
```

### Check Container Status
```bash
ssh root@100.121.19.12 "pct status [ID]"
```

### View Logs
```bash
ssh root@100.121.19.12 "pct exec [ID] -- tail -f /var/log/..."
```

### Restart Container
```bash
ssh root@100.121.19.12 "pct restart [ID]"
```

## Service Endpoints

| Service | Container | URL | Port |
|---------|-----------|-----|------|
| Frontend | 440 | http://192.168.220.240:3000 | 3000 |
| Backend | 441 | http://192.168.220.241:3000 | 3000 |
| NGINX | 442 | http://192.168.220.242:80 | 80/443 |
| Qdrant | 443 | http://192.168.220.243:6333 | 6333 |
| PostgreSQL | 404 | 192.168.220.244:5432 | 5432 |
| Redis | 410 | 192.168.220.250:6379 | 6379 |
| AI | 444 | http://192.168.220.245:8000 | 8000 |

## Database Access

### PostgreSQL
```bash
ssh root@100.121.19.12 "pct exec 404 -- psql -U zentoria zentoria_main"
```

### Redis CLI
```bash
ssh root@100.121.19.12 "pct exec 410 -- redis-cli"
```

## Deployment Rollback

### Automatic (Script)
```bash
# If deployment fails, script auto-rollbacks
# No action needed
```

### Manual Backend Rollback
```bash
ssh root@100.121.19.12 << 'EOF'
  cd /opt/zentoria-api-full
  BACKUP=$(ls -t backups/docker-compose.yml.* 2>/dev/null | head -1)
  cp "$BACKUP" docker-compose.yml
  docker compose up -d --no-deps
  sleep 5
  curl -f http://localhost:3000/health || exit 1
EOF
```

### Manual Frontend Rollback
```bash
ssh root@100.121.19.12 << 'EOF'
  cd /opt/zentoria-frontend
  BACKUP=$(ls -t backups/.next.* 2>/dev/null | head -1)
  rm -rf .next
  cp -r "$BACKUP" .next
  docker compose up -d --no-deps
  sleep 5
  curl -f http://localhost:3000 || exit 1
EOF
```

## Health Checks

### Quick Status
```bash
./scripts/health-check.sh
```

### Detailed Status
```bash
./scripts/health-check.sh -v
```

### Manual Service Checks
```bash
# Frontend
ssh root@100.121.19.12 "pct exec 440 -- curl -s http://localhost:3000"

# Backend
ssh root@100.121.19.12 "pct exec 441 -- curl -s http://localhost:3000/health"

# Database
ssh root@100.121.19.12 "pct exec 404 -- psql -U zentoria zentoria_main -c 'SELECT 1'"

# Redis
ssh root@100.121.19.12 "pct exec 410 -- redis-cli ping"

# Qdrant
ssh root@100.121.19.12 "pct exec 443 -- curl -s http://localhost:6333/healthz"

# AI Orchestrator
ssh root@100.121.19.12 "pct exec 444 -- curl -s http://localhost:8000/api/v1/health"
```

## Application URLs

| Environment | Frontend | API | AI |
|-------------|----------|-----|-----|
| Production | https://ai.zentoria.ai | https://ai.zentoria.ai/api | https://ai.zentoria.ai/ai |
| Staging | https://staging.zentoria.ai | https://staging.zentoria.ai/api | https://staging.zentoria.ai/ai |

## Production Checklist

- [ ] Tests passing (CI green)
- [ ] Code reviewed
- [ ] No security issues
- [ ] Version bumped
- [ ] CHANGELOG updated
- [ ] Git tag created
- [ ] Deployment verified
- [ ] Feature flags configured
- [ ] Monitoring active
- [ ] Rollback plan ready

## Emergency Contacts

When deployment fails:

1. Check logs: `./scripts/health-check.sh -v`
2. Review errors: `ssh root@100.121.19.12 "pct exec 441 -- tail -100 /var/log/zentoria-api.log"`
3. Trigger rollback: Manual rollback commands above
4. Verify recovery: `./scripts/health-check.sh`
5. Notify team: Create GitHub issue with incident details

## Documentation Links

- **Full Architecture:** `DEPLOYMENT.md`
- **Step-by-Step Guide:** `DEPLOYMENT-GUIDE.md`
- **Detailed Summary:** `DEPLOYMENT-SUMMARY.md`
- **This Quick Reference:** `DEPLOYMENT-QUICK-REFERENCE.md`

## Common Issues

### Deployment Hangs
```bash
# Kill script and check container
ssh root@100.121.19.12 "pct exec 441 -- ps aux | grep docker"
ssh root@100.121.19.12 "pct exec 441 -- docker logs zentoria"
```

### Health Check Fails
```bash
# Restart container
ssh root@100.121.19.12 "pct restart 441"

# Check resources
ssh root@100.121.19.12 "pct exec 441 -- free -h && df -h"
```

### Database Connection Issues
```bash
# Check PostgreSQL
ssh root@100.121.19.12 "pct exec 404 -- systemctl status postgresql"

# Test connection
ssh root@100.121.19.12 "pct exec 441 -- npm run db:validate"
```

### Feature Flag Not Working
```bash
# Check Redis
ssh root@100.121.19.12 "pct exec 410 -- redis-cli get 'feature:flags:all'"

# Restart backend
ssh root@100.121.19.12 "pct restart 441"
```

---

**Last Updated:** January 18, 2026
**Version:** 1.0.0
**For Zentoria Personal Edition**
