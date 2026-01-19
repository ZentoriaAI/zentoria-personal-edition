# Deployment Infrastructure Index

**Zentoria Personal Edition - Complete CI/CD & Deployment Setup**

## Navigation Guide

### Start Here
1. **[DEPLOYMENT-QUICK-REFERENCE.md](./DEPLOYMENT-QUICK-REFERENCE.md)** - Essential commands and quick reference
2. **[DEPLOYMENT-SUMMARY.md](./DEPLOYMENT-SUMMARY.md)** - Overview of all deliverables

### Main Documentation
3. **[DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)** - Step-by-step deployment procedures
4. **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete architecture and technical reference

### Implementation Files

#### Deployment Scripts
```
scripts/deploy/
├── deploy-backend.sh         # Backend (MCP Gateway) deployment
├── deploy-frontend.sh        # Frontend (Next.js) deployment
├── deploy.sh                 # Orchestrated all-in-one deployment
└── (All scripts with health checks, backups, rollback)

scripts/
└── health-check.sh          # Comprehensive service monitoring
```

#### GitHub Actions Workflows
```
.github/workflows/
├── ci.yml                    # Continuous Integration (enhanced)
├── deploy.yml                # Docker image building & pushing
└── deploy-proxmox.yml        # Proxmox deployment orchestration (NEW)
```

#### Feature Flags
```
mcp-gateway/src/
├── infrastructure/
│   └── feature-flags.ts      # Feature flags system
└── routes/
    └── feature-flags.ts      # Feature flags REST API

frontend/src/hooks/
└── use-feature-flag.ts       # React hooks for feature consumption
```

## Quick Navigation by Task

### I want to deploy now
→ See [DEPLOYMENT-QUICK-REFERENCE.md](./DEPLOYMENT-QUICK-REFERENCE.md) section "Essential Commands"

### I need step-by-step instructions
→ See [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)

### I need to understand the architecture
→ See [DEPLOYMENT.md](./DEPLOYMENT.md)

### I need to setup GitHub Actions
→ See [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) "GitHub Actions Setup"

### I need to use feature flags
→ See [DEPLOYMENT-QUICK-REFERENCE.md](./DEPLOYMENT-QUICK-REFERENCE.md) "Feature Flags API"

### I need to rollback a deployment
→ See [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) "Rollback Procedures"

### I need to troubleshoot
→ See [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) "Troubleshooting"

### I need to check system health
→ Run `./scripts/health-check.sh -v`

## File Purposes

### Documentation Files

| File | Purpose | When to Read |
|------|---------|--------------|
| DEPLOYMENT-INDEX.md (this) | Navigation guide | First time setup |
| DEPLOYMENT-QUICK-REFERENCE.md | Essential commands & quick lookup | Daily operations |
| DEPLOYMENT-SUMMARY.md | Overview of infrastructure | Understanding scope |
| DEPLOYMENT-GUIDE.md | Step-by-step procedures | Following procedures |
| DEPLOYMENT.md | Technical architecture | Deep understanding |

### Script Files

| Script | Purpose | Usage |
|--------|---------|-------|
| deploy-backend.sh | Deploy MCP Gateway to Container 441 | `./scripts/deploy/deploy-backend.sh [env] [version]` |
| deploy-frontend.sh | Deploy Next.js to Container 440 | `./scripts/deploy/deploy-frontend.sh [env] [version]` |
| deploy.sh | Deploy all services with orchestration | `./scripts/deploy/deploy.sh [env] [version]` |
| health-check.sh | Monitor all service health | `./scripts/health-check.sh [-v]` |

### Workflow Files

| Workflow | Trigger | Action |
|----------|---------|--------|
| ci.yml | Push/PR to main/develop | Run tests, lint, build Docker images |
| deploy.yml | Version tags (v*.*.*) | Build & push Docker images |
| deploy-proxmox.yml | Version tags (v*.*.*) | Deploy to Proxmox via SSH |

### Code Files

| File | Purpose | Type |
|------|---------|------|
| feature-flags.ts (infrastructure) | Feature flags system | TypeScript |
| feature-flags.ts (routes) | REST API endpoints | TypeScript |
| use-feature-flag.ts | React hooks | TypeScript |

## Key Concepts

### Deployment Strategies

1. **Rolling Update** (Default)
   - Old → New version transition
   - Zero-downtime via NGINX
   - Automatic rollback on failure

2. **Blue/Green** (Optional)
   - Two identical environments
   - Instant switchover
   - Easy rollback

3. **Canary** (Feature Flags)
   - Gradual rollout percentage
   - Monitor metrics
   - Automatic or manual promotion

### Service Architecture

```
Users
  ↓
Cloudflare (HTTPS)
  ↓
NGINX (Container 442)
  ├─→ Frontend (Container 440)
  ├─→ Backend (Container 441)
  └─→ AI Orchestrator (Container 444)

Backend Dependencies:
  ├─ PostgreSQL (Container 404)
  ├─ Redis (Container 410)
  └─ Qdrant (Container 443)
```

### Feature Flag Workflow

```
0% Rollout
  ↓ (Monitor, fix issues)
5% Rollout (test with small group)
  ↓ (Monitor metrics)
25% Rollout (early adopters)
  ↓ (Monitor metrics)
50% Rollout (half user base)
  ↓ (Monitor metrics)
100% Rollout (all users)
  ↓ (Feature fully enabled)
```

## Setup Checklist

- [ ] Read [DEPLOYMENT-QUICK-REFERENCE.md](./DEPLOYMENT-QUICK-REFERENCE.md)
- [ ] Make scripts executable: `chmod +x scripts/deploy/*.sh scripts/health-check.sh`
- [ ] Add GitHub Secrets (PROXMOX_HOST, PROXMOX_USER, PROXMOX_SSH_KEY)
- [ ] Test health check: `./scripts/health-check.sh`
- [ ] Create first tag: `git tag -a v1.0.0 -m "Release 1.0.0"`
- [ ] Push tag: `git push origin v1.0.0`
- [ ] Monitor GitHub Actions
- [ ] Verify deployment: `./scripts/health-check.sh -v`

## Common Operations

### Daily Operations
```bash
# Check system health
./scripts/health-check.sh

# View logs
ssh root@100.121.19.12 "pct exec 441 -- tail -f /var/log/zentoria-api.log"
```

### Deploying Code
```bash
# Create release
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# Monitor deployment
# → https://github.com/ZentoriaAI/zentoria-mcp/actions
```

### Rolling Back
```bash
# If automated rollback doesn't work
./scripts/deploy/deploy.sh production v0.9.0  # Deploy previous version
```

### Managing Features
```bash
# Enable new feature for 5% of users
curl -X POST https://ai.zentoria.ai/api/v1/features/chat-v2/rollout \
  -H "X-API-Key: ADMIN_KEY" \
  -d '{"rolloutPercentage": 5}'

# Increase to 50%
curl -X POST https://ai.zentoria.ai/api/v1/features/chat-v2/rollout \
  -H "X-API-Key: ADMIN_KEY" \
  -d '{"rolloutPercentage": 50}'

# Full rollout
curl -X POST https://ai.zentoria.ai/api/v1/features/chat-v2/rollout \
  -H "X-API-Key: ADMIN_KEY" \
  -d '{"rolloutPercentage": 100}'
```

## Deployment Checklist

Before deploying to production, verify:
- [ ] All tests passing
- [ ] Code reviewed
- [ ] No security issues
- [ ] Staging deployment successful
- [ ] Health checks pass
- [ ] Database backups current
- [ ] Rollback plan documented
- [ ] Team notified

## Support Matrix

| Issue | Solution | Reference |
|-------|----------|-----------|
| Deployment fails | Run health check, check logs | DEPLOYMENT-GUIDE.md |
| Feature flag not working | Restart backend, check Redis | DEPLOYMENT-QUICK-REFERENCE.md |
| Container won't start | Check logs, restart container | DEPLOYMENT-GUIDE.md |
| Database migrations fail | Check status, review pending migrations | DEPLOYMENT-GUIDE.md |
| Network connectivity issues | Check container IPs, test ping | DEPLOYMENT-GUIDE.md |
| Need to rollback | Follow manual rollback procedure | DEPLOYMENT-GUIDE.md |

## Statistics

| Metric | Value |
|--------|-------|
| Documentation lines | ~1,400 |
| Script lines | ~1,400 |
| Infrastructure code | ~600 |
| Test coverage | 448 backend + 458 frontend |
| Total lines of content | 3,900+ |

## Version Information

- **Version:** 1.0.0
- **Created:** January 18, 2026
- **Status:** Production Ready
- **Target:** Zentoria Personal Edition
- **Platform:** Proxmox VE with LXC Containers

## Quick Links

- **GitHub Repository:** https://github.com/ZentoriaAI/zentoria-mcp
- **Main App:** https://ai.zentoria.ai
- **API:** https://ai.zentoria.ai/api
- **AI:** https://ai.zentoria.ai/ai

## Next Steps

1. **Setup Phase:** Configure GitHub secrets, make scripts executable
2. **Testing Phase:** Deploy to staging, verify health checks
3. **Production Phase:** Create release tag, deploy with approval
4. **Monitoring Phase:** Watch metrics, adjust feature flags as needed
5. **Optimization Phase:** Fine-tune deployment parameters based on metrics

---

**Navigation:**
- [Home](./README.md)
- [Deployment Quick Reference](./DEPLOYMENT-QUICK-REFERENCE.md)
- [Deployment Guide](./DEPLOYMENT-GUIDE.md)
- [Full Documentation](./DEPLOYMENT.md)
