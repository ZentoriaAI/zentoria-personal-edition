# Zentoria Personal Edition - Deployment Infrastructure

## Overview

This document describes the complete deployment infrastructure for Zentoria Personal Edition, optimized for self-hosted Proxmox LXC containers.

**Target Infrastructure:**
- Frontend (LXC 440): Next.js at `192.168.220.240:3000`
- Backend (LXC 441): Fastify/MCP Gateway at `192.168.220.241:3000`
- NGINX (LXC 442): Reverse proxy at `192.168.220.242:80/443`
- AI (LXC 444): FastAPI at `192.168.220.245:8000`
- PostgreSQL (LXC 404): Database at `192.168.220.244:5432`
- Redis (LXC 410): Cache at `192.168.220.250:6379`
- Qdrant (LXC 443): Vector DB at `192.168.220.243:6333`

## Architecture

### CI/CD Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│                       GitHub Push/PR                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI                         │
├─────────────────────────────────────────────────────────────┤
│  • Lint & Type Check                                        │
│  • Unit Tests (448 backend + 458 frontend + 64 E2E)         │
│  • Coverage Reports                                         │
│  • Security Scanning (Trivy)                                │
│  • Docker Build Test (non-push)                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
                     Manual Tag: v*.*.*
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Build & Push Docker Images                      │
├─────────────────────────────────────────────────────────────┤
│  • ghcr.io/ZentoriaAI/zentoria-mcp-gateway:v*.*.*           │
│  • ghcr.io/ZentoriaAI/zentoria-frontend:v*.*.*              │
│  • ghcr.io/ZentoriaAI/zentoria-ai-orchestrator:v*.*.*       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│         Deploy to Proxmox (Manual Approval)                  │
├─────────────────────────────────────────────────────────────┤
│  1. Blue/Green deployment (old→new)                          │
│  2. Health checks (5 retries, 10s interval)                  │
│  3. Smoke tests                                              │
│  4. Auto-rollback on failure                                 │
│  5. Deployment notification                                  │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Strategies

#### Rolling Update (Default for Minor Changes)
```
Backend Container 441:
  Old Container (Running) → New Container (Starting) → Remove Old
  Downtime: ~5 seconds (NGINX health check interval)
```

#### Blue/Green Deployment (For Major Releases)
```
Backend: Container 441 (Blue) ⟷ Container 411 (Green, temporary)
  All traffic switches at NGINX level after health checks
  Instant rollback by reverting NGINX upstream
```

#### Canary Deployment (For Risky Changes)
```
5% traffic → New version → Monitor 10 min
25% traffic → If healthy, increase
100% traffic → If still healthy, complete
```

## Deployment Scripts

All scripts are in `/scripts/deploy/`:

### 1. Backend Deployment (`deploy-backend.sh`)
```bash
./scripts/deploy/deploy-backend.sh [environment] [tag]
```
- Pulls new image from ghcr.io
- Validates deployment manifest
- Performs blue/green swap or rolling update
- Runs health checks
- Rolls back on failure

### 2. Frontend Deployment (`deploy-frontend.sh`)
```bash
./scripts/deploy/deploy-frontend.sh [environment] [tag]
```
- Builds Next.js static assets
- Uploads to frontend container
- Validates new assets are served
- Updates NGINX configuration if needed
- Zero-downtime deployment via NGINX reload

### 3. Database Migrations (`deploy-db.sh`)
```bash
./scripts/deploy/deploy-db.sh [environment]
```
- Runs pending Prisma migrations
- Creates backups before migration
- Verifies schema integrity
- Rolls back on failure

### 4. All-in-One Deployment (`deploy.sh`)
```bash
./scripts/deploy/deploy.sh [environment] [tag]
```
- Coordinates all deployments
- Respects service dependencies (DB → Backend → Frontend)
- Handles feature flags activation
- Provides single command deployment

## GitHub Actions Workflows

### `ci.yml` - Continuous Integration
- **Triggers:** Push to main/develop, pull requests
- **Jobs:**
  - `mcp-gateway`: Build, lint, test backend (Container 441)
  - `frontend`: Build, lint, test frontend (Container 440)
  - `docker-build`: Test Docker build (all images)
  - `security`: Trivy vulnerability scanning
  - `ci-complete`: Aggregate status

**Required Secrets:**
- `CODECOV_TOKEN` (optional, for coverage reports)

### `deploy.yml` - Deployment Pipeline
- **Triggers:** Version tags (v*.*.*)
- **Jobs:**
  - `build-images`: Build and push to ghcr.io
  - `deploy`: Deploy to Proxmox (manual approval)
  - `notify`: Send deployment notifications

**Required Secrets:**
- `DEPLOY_SSH_KEY`: Private key for Proxmox access
- `DEPLOY_HOST`: Proxmox IP (192.168.220.173)
- `DEPLOY_USER`: SSH user (root)
- `DEPLOY_ENVIRONMENT`: Deployment environment (staging/production)

### `rollback.yml` - Rollback Pipeline
- **Triggers:** Manual workflow dispatch
- **Steps:**
  - Revert to previous version
  - Run health checks
  - Notify on completion

## Feature Flags

Feature flags allow gradual rollout of new features without deployment.

### Configuration

**File:** `/mcp-gateway/config/feature-flags.ts`

```typescript
export const featureFlags = {
  'chat-v2': { enabled: false, rolloutPercentage: 0 },
  'rag-search': { enabled: true, rolloutPercentage: 100 },
  'websocket-compression': { enabled: false, rolloutPercentage: 50 },
  'new-vector-db': { enabled: false, rolloutPercentage: 0 },
};
```

### Usage

**Backend:**
```typescript
import { isFeatureEnabled } from '@/lib/feature-flags';

if (isFeatureEnabled('chat-v2', userId)) {
  // Use new chat implementation
} else {
  // Use legacy implementation
}
```

**Frontend:**
```typescript
import { useFeatureFlag } from '@/hooks/use-feature-flag';

const { isEnabled, rolloutPercentage } = useFeatureFlag('rag-search');
```

### Activation Flow

1. **Enable flag** in configuration (0% rollout)
2. **Increase rollout** (5% → 25% → 50% → 100%)
3. **Monitor metrics** (error rate, latency, user satisfaction)
4. **Complete rollout** or revert on issues

## Monitoring & Observability

### Health Checks

Each service exposes `/health` endpoint:

```bash
# Backend
curl https://ai.zentoria.ai/api/v1/health
# { "status": "ok", "version": "1.0.0", "timestamp": "2026-01-18T..." }

# Frontend (via NGINX)
curl https://ai.zentoria.ai/health
# { "status": "up" }

# AI Orchestrator
curl https://ai.zentoria.ai/ai/v1/health
# { "status": "ok", "models": ["llama3.2:3b", ...] }
```

### Deployment Metrics

| Metric | Target | Critical |
|--------|--------|----------|
| API latency p99 | < 500ms | > 2000ms |
| Frontend FCP | < 2s | > 5s |
| Error rate | < 0.1% | > 1% |
| Uptime | 99.9% | < 99% |

### Logs

All deployments are logged:
- NGINX: `/var/log/nginx/error.log` (LXC 442)
- Backend: `/var/log/zentoria-api.log` (LXC 441)
- Frontend: `/var/log/zentoria-frontend.log` (LXC 440)

Access logs:
```bash
ssh root@100.121.19.12 "pct exec 442 -- tail -f /var/log/nginx/access.log"
ssh root@100.121.19.12 "pct exec 441 -- tail -f /var/log/zentoria-api.log"
```

## Rollback Procedures

### Automatic Rollback
Triggered on:
- Health check failures (3 consecutive failures)
- Error rate spike (> 5% within 1 minute)
- API latency spike (p99 > 2 seconds)

**Process:**
1. Detect anomaly
2. Stop new container
3. Revert NGINX upstream
4. Wait for drain (configurable)
5. Verify health
6. Alert operators

### Manual Rollback
```bash
# Rollback backend to previous version
./scripts/deploy/rollback-backend.sh

# Rollback frontend
./scripts/deploy/rollback-frontend.sh

# Rollback all services
./scripts/deploy/rollback.sh
```

## Environment Configuration

### Local Development
```bash
cp .env.example .env
# Set ENVIRONMENT=development
npm run dev
```

### Staging
- URL: `https://staging.zentoria.ai`
- Database: `zentoria_main` (staging replica)
- Features: All enabled (100% rollout)
- Purpose: Final validation before production

### Production
- URL: `https://ai.zentoria.ai`
- Database: `zentoria_main` (production)
- Features: Controlled rollout
- Purpose: Live user environment

## Security Considerations

### Secrets Management

**In GitHub Actions:**
- `DEPLOY_SSH_KEY`: Ed25519 private key for Proxmox SSH
- `GITHUB_TOKEN`: Automatic token for ghcr.io

**In Proxmox Containers:**
- Environment variables in `.env` files (not in git)
- Database credentials in PostgreSQL
- API keys in Redis (encrypted)

### Network Security

- NGINX enforces HTTPS (redirect HTTP → HTTPS)
- Container-to-container communication via internal network
- SSH access limited to Tailscale (VPN)
- Rate limiting on all API endpoints

### Deployment Access

- Only `main` branch can be tagged
- Deployment requires manual approval (GitHub environment)
- All deployments logged in audit trail
- Rollback requires SSH key + manual confirmation

## Troubleshooting

### Health Check Failures

```bash
# Check backend health
ssh root@100.121.19.12 "pct exec 441 -- curl -s localhost:3000/health | jq"

# Check frontend health
ssh root@100.121.19.12 "pct exec 440 -- curl -s localhost:3000/health | jq"

# Check NGINX routing
ssh root@100.121.19.12 "pct exec 442 -- nginx -t"
```

### Database Migration Issues

```bash
# Check migration status
ssh root@100.121.19.12 "pct exec 441 -- npx prisma migrate status"

# Verify schema
ssh root@100.121.19.12 "pct exec 404 -- psql -U zentoria zentoria_main -c \"\d\""

# Rollback last migration
ssh root@100.121.19.12 "pct exec 441 -- npx prisma migrate resolve --rolled-back"
```

### Performance Issues After Deployment

```bash
# Check resource usage
ssh root@100.121.19.12 "pct exec 441 -- free -h && df -h"

# Check running processes
ssh root@100.121.19.12 "pct exec 441 -- ps aux | grep node"

# Check error logs
ssh root@100.121.19.12 "pct exec 441 -- tail -100 /var/log/zentoria-api.log | grep ERROR"
```

## Deployment Checklist

Before deploying to production:

- [ ] All tests passing (CI green)
- [ ] Code review approved
- [ ] Changelog updated
- [ ] Version number bumped (semver)
- [ ] Git tag created (v*.*.*)
- [ ] Docker images built successfully
- [ ] Staging deployment successful
- [ ] Smoke tests pass
- [ ] Feature flags configured
- [ ] Rollback plan documented
- [ ] On-call engineer notified
- [ ] Deployment window approved

## Related Documents

- `CLAUDE.md` - Project configuration
- `STATUS.md` - Current implementation status
- `.github/workflows/ci.yml` - CI pipeline
- `.github/workflows/deploy.yml` - Deployment pipeline
- `/scripts/deploy/` - Deployment scripts
