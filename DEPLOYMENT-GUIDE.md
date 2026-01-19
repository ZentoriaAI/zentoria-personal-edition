# Deployment Guide - Zentoria Personal Edition

Complete step-by-step guide for deploying Zentoria Personal Edition to Proxmox infrastructure.

## Table of Contents

1. [Quick Start](#quick-start)
2. [GitHub Actions Setup](#github-actions-setup)
3. [Manual Deployment](#manual-deployment)
4. [Feature Flags](#feature-flags)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)
7. [Production Checklist](#production-checklist)

## Quick Start

### One-Command Deployment

```bash
# Deploy version to staging
./scripts/deploy/deploy.sh staging v1.0.0

# Deploy to production
./scripts/deploy/deploy.sh production v1.0.0
```

### GitHub Actions (Recommended for CI/CD)

```bash
# 1. Tag your release
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# 2. GitHub Actions automatically:
#    - Runs full CI pipeline
#    - Builds Docker images
#    - Pushes to ghcr.io
#    - Deploys to production (requires approval)
#    - Creates GitHub Release
```

## GitHub Actions Setup

### Prerequisites

1. **SSH Access to Proxmox**
   - Generate Ed25519 key pair: `ssh-keygen -t ed25519`
   - Copy public key to `~/.ssh/authorized_keys` on Proxmox host
   - Store private key securely

2. **GitHub Secrets**

   Go to **Settings → Secrets and variables → Actions** and add:

   ```
   PROXMOX_HOST        = 100.121.19.12 (or your Proxmox IP)
   PROXMOX_USER        = root
   PROXMOX_SSH_KEY     = (private key content)
   API_URL             = https://ai.zentoria.ai/api (optional)
   WS_URL              = wss://ai.zentoria.ai/ws (optional)
   ```

### Creating a Release

```bash
# 1. Update version in package.json files
vim mcp-gateway/package.json
vim frontend/package.json

# 2. Update CHANGELOG.md
# Add your changes under [Unreleased] section

# 3. Create git commit
git add .
git commit -m "chore: release v1.0.0"

# 4. Create tag
git tag -a v1.0.0 -m "Release v1.0.0"

# 5. Push to GitHub
git push origin main
git push origin v1.0.0

# 6. Monitor deployment in GitHub Actions
# URL: https://github.com/ZentoriaAI/zentoria-mcp/actions
```

### Workflow Files

- **`ci.yml`** - Runs on every push/PR
  - Tests, linting, type checking
  - Docker build validation
  - Security scanning

- **`deploy-proxmox.yml`** - Runs on version tags
  - Builds Docker images
  - Pushes to ghcr.io
  - Deploys to Proxmox
  - Creates GitHub Release

## Manual Deployment

### Backend Deployment

```bash
# Deploy to staging
./scripts/deploy/deploy-backend.sh staging v1.0.0

# Deploy to production
./scripts/deploy/deploy-backend.sh production v1.0.0

# What it does:
# 1. Validates Proxmox connection
# 2. Checks container health
# 3. Backs up current deployment
# 4. Pulls new image from ghcr.io
# 5. Restarts service with new version
# 6. Runs health checks (30 retries, 10s interval)
# 7. Runs smoke tests
# 8. Updates NGINX upstream
# 9. Final verification
```

### Frontend Deployment

```bash
# Deploy to staging
./scripts/deploy/deploy-frontend.sh staging v1.0.0

# Deploy to production
./scripts/deploy/deploy-frontend.sh production v1.0.0

# What it does:
# 1. Pre-flight checks
# 2. Validates build artifacts
# 3. Backs up current deployment
# 4. Pulls new image
# 5. Restarts Next.js service
# 6. Runs health checks
# 7. Verifies static assets
# 8. Updates NGINX
# 9. Smoke tests
```

### All-in-One Deployment

```bash
# Deploys backend, frontend, runs migrations, tests
./scripts/deploy/deploy.sh staging v1.0.0

# What it does:
# 1. Pre-flight checks
# 2. Database backups
# 3. Database migrations
# 4. Backend deployment
# 5. Frontend deployment
# 6. Feature flag configuration
# 7. Integration tests
# 8. End-to-end verification
# 9. Automatic rollback on failure
```

## Feature Flags

### Configuration

Feature flags are stored in `/mcp-gateway/config/feature-flags.ts` and cached in Redis.

Default flags:
- `chat-v2`: Chat UI improvements (0% rollout)
- `rag-search`: Semantic search (100% rollout)
- `websocket-compression`: Message compression (0% rollout)
- `new-vector-db`: Vector DB migration (0% rollout)
- `streaming-responses`: Streaming responses (50% rollout)

### Checking Status

```bash
# Check all flags
curl -H "X-API-Key: YOUR_API_KEY" https://ai.zentoria.ai/api/v1/features

# Check single flag
curl -H "X-API-Key: YOUR_API_KEY" https://ai.zentoria.ai/api/v1/features/chat-v2

# Check if enabled for user
curl -X POST \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123"}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2/check
```

### Enabling Features

```bash
# Enable feature globally
curl -X PUT \
  -H "X-API-Key: ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2

# Set rollout percentage (5% of users)
curl -X POST \
  -H "X-API-Key: ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 5}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2/rollout

# Add exception user (always enabled)
curl -X POST \
  -H "X-API-Key: ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123"}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2/exceptions

# Block user
curl -X POST \
  -H "X-API-Key: ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-456"}' \
  https://ai.zentoria.ai/api/v1/features/chat-v2/block
```

### Frontend Usage

```typescript
// Check if feature is enabled
import { useFeatureFlag } from '@/hooks/use-feature-flag';

function MyComponent() {
  const { isEnabled, isLoading } = useFeatureFlag('chat-v2', userId);

  if (isLoading) return <Loading />;
  if (isEnabled) return <ChatV2 />;
  return <ChatV1 />;
}

// Feature gate component
import { FeatureGate } from '@/hooks/use-feature-flag';

function App() {
  return (
    <FeatureGate flagName="chat-v2" userId={userId} fallback={<ChatV1 />}>
      <ChatV2 />
    </FeatureGate>
  );
}

// Admin panel
import { useFeatureFlagAdmin } from '@/hooks/use-feature-flag';

function AdminPanel() {
  const { setRollout, updateFlag } = useFeatureFlagAdmin();

  const handleEnable = async () => {
    await setRollout('chat-v2', 10); // 10% rollout
  };

  return <button onClick={handleEnable}>Enable chat-v2 (10%)</button>;
}
```

## Rollback Procedures

### Automatic Rollback

Triggered automatically on:
- Health check failures (3 consecutive failures)
- Error rate spike (> 5% errors)
- API latency spike (p99 > 2000ms)

The deployment script will:
1. Stop new container
2. Restore previous version from backup
3. Restart service
4. Verify health
5. Alert operators

### Manual Rollback - Backend

```bash
# Rollback backend to previous version
ssh root@100.121.19.12 << 'EOF'
  cd /opt/zentoria-api-full
  LATEST_BACKUP=$(ls -t backups/docker-compose.yml.* 2>/dev/null | head -1)
  cp "$LATEST_BACKUP" docker-compose.yml
  docker compose up -d --no-deps
  sleep 5

  # Verify
  curl -f http://localhost:3000/health || {
    echo "Rollback verification failed"
    exit 1
  }

  echo "Rollback successful"
EOF
```

### Manual Rollback - Frontend

```bash
ssh root@100.121.19.12 << 'EOF'
  cd /opt/zentoria-frontend
  LATEST_BACKUP=$(ls -t backups/.next.* 2>/dev/null | head -1)
  rm -rf .next
  cp -r "$LATEST_BACKUP" .next
  docker compose up -d --no-deps
  sleep 5

  # Verify
  curl -f http://localhost:3000 || {
    echo "Rollback verification failed"
    exit 1
  }

  echo "Rollback successful"
EOF
```

### Rollback via GitHub Actions

```bash
# Workflow dispatch for rollback (in GitHub Actions)
# 1. Go to Actions tab
# 2. Select "Rollback" workflow
# 3. Click "Run workflow"
# 4. Select version to rollback to
# 5. Confirm and execute
```

## Troubleshooting

### Health Checks Failing

```bash
# Check backend logs
ssh root@100.121.19.12 "pct exec 441 -- tail -100 /var/log/zentoria-api.log"

# Check backend status
ssh root@100.121.19.12 "pct exec 441 -- curl -v http://localhost:3000/health"

# Check database connection
ssh root@100.121.19.12 "pct exec 404 -- psql -U zentoria zentoria_main -c 'SELECT 1'"

# Check Redis connection
ssh root@100.121.19.12 "pct exec 410 -- redis-cli ping"
```

### Database Migration Failures

```bash
# Check migration status
ssh root@100.121.19.12 "pct exec 441 -- npx prisma migrate status"

# View pending migrations
ssh root@100.121.19.12 "pct exec 441 -- ls prisma/migrations/"

# Rollback last migration (emergency)
ssh root@100.121.19.12 "pct exec 441 -- npx prisma migrate resolve --rolled-back"

# Reset database (WARNING: destructive)
ssh root@100.121.19.12 "pct exec 441 -- npx prisma migrate reset --force"
```

### Container Issues

```bash
# Check container status
ssh root@100.121.19.12 "pct status 441"

# Restart container
ssh root@100.121.19.12 "pct restart 441"

# Check container logs
ssh root@100.121.19.12 "pct logs 441"

# Access container shell
ssh root@100.121.19.12 "pct exec 441 -- bash"
```

### NGINX Issues

```bash
# Test NGINX config
ssh root@100.121.19.12 "pct exec 442 -- nginx -t"

# Reload NGINX
ssh root@100.121.19.12 "pct exec 442 -- systemctl reload nginx"

# Check NGINX logs
ssh root@100.121.19.12 "pct exec 442 -- tail -100 /var/log/nginx/error.log"

# Check upstream
ssh root@100.121.19.12 "pct exec 442 -- grep -A 5 'upstream' /etc/nginx/conf.d/zentoria.conf"
```

## Production Checklist

Before deploying to production:

### Code & Tests
- [ ] All tests passing (CI green)
- [ ] Code review completed
- [ ] No critical security issues
- [ ] No performance regressions
- [ ] E2E tests pass

### Release
- [ ] Version number bumped (semver)
- [ ] CHANGELOG updated
- [ ] Git tag created
- [ ] Release notes written

### Infrastructure
- [ ] Staging deployment successful
- [ ] Smoke tests pass on staging
- [ ] Database backups current
- [ ] All containers healthy
- [ ] Redis/Cache operational

### Feature Flags
- [ ] Risky features gated
- [ ] Rollout percentage configured
- [ ] Exception users defined
- [ ] Monitoring dashboards ready

### Deployment
- [ ] SSH key configured
- [ ] GitHub secrets updated
- [ ] NGINX config validated
- [ ] Rollback plan documented
- [ ] On-call engineer notified

### Post-Deployment
- [ ] Health checks pass
- [ ] Smoke tests pass
- [ ] Error rate normal
- [ ] Latency acceptable
- [ ] Users report OK

## Deployment Metrics

Monitor these metrics after deployment:

| Metric | Target | Alert |
|--------|--------|-------|
| API response time p99 | < 500ms | > 2000ms |
| Frontend FCP | < 2s | > 5s |
| Error rate | < 0.1% | > 1% |
| Uptime | 99.9% | < 99% |
| Database connections | Normal | > 90% |
| Redis memory | Normal | > 90% |

Access logs:
```bash
ssh root@100.121.19.12 "pct exec 441 -- tail -f /var/log/zentoria-api.log"
ssh root@100.121.19.12 "pct exec 440 -- tail -f /var/log/zentoria-frontend.log"
ssh root@100.121.19.12 "pct exec 442 -- tail -f /var/log/nginx/access.log"
```

## Need Help?

1. Check [DEPLOYMENT.md](./DEPLOYMENT.md) for architecture details
2. Review [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines
3. Check [STATUS.md](./STATUS.md) for system status
4. Run health checks: `./scripts/health-check.sh`

---

**Last Updated:** January 18, 2026
**Version:** 1.0.0
