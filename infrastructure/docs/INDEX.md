# Zentoria Personal Edition - Documentation Index

**Version:** 1.0
**Last Updated:** January 2026

---

## 📚 Documentation Overview

This directory contains comprehensive documentation for deploying, operating, and maintaining Zentoria Personal Edition.

---

## 🚀 Getting Started

### New User Path

1. **[QUICKSTART.md](./QUICKSTART.md)** - 30-minute minimal deployment
   - Quick setup for testing/evaluation
   - 6 core containers
   - Essential services only

2. **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Complete deployment guide
   - Pre-flight checklist
   - Full 7-phase deployment
   - Post-deployment verification
   - ~10-15 hours total time

3. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture
   - High-level architecture diagrams
   - Component interactions
   - Data flow diagrams
   - Network topology

---

## 📖 Core Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** | Master deployment documentation | DevOps, SysAdmins |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | System design and architecture | Architects, Developers |
| **[QUICKSTART.md](./QUICKSTART.md)** | Quick start guide (30 min) | Evaluators, New Users |
| **[RUNBOOK.md](./RUNBOOK.md)** | Operations procedures | Operators, On-Call |
| **[SECURITY.md](./SECURITY.md)** | Security documentation | Security Team, Admins |
| **[API_REFERENCE.md](./API_REFERENCE.md)** | API documentation | Developers, Integrators |

---

## 🛠️ By Role

### System Administrators

**Initial Setup:**
1. [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Full deployment
2. [SECURITY.md](./SECURITY.md) - Security hardening
3. [RUNBOOK.md](./RUNBOOK.md) - Daily operations

**Ongoing:**
- [RUNBOOK.md](./RUNBOOK.md) - Service management, troubleshooting
- [SECURITY.md](./SECURITY.md) - Security maintenance

### Developers

**Building:**
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
2. [API_REFERENCE.md](./API_REFERENCE.md) - API documentation
3. [QUICKSTART.md](./QUICKSTART.md) - Local dev environment

**Deploying:**
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Deployment procedures

### Operations Team

**Daily:**
- [RUNBOOK.md](./RUNBOOK.md) - Daily health checks, service management

**Incidents:**
- [RUNBOOK.md](./RUNBOOK.md#incident-response) - Incident response
- [SECURITY.md](./SECURITY.md#incident-response) - Security incidents

**Maintenance:**
- [RUNBOOK.md](./RUNBOOK.md#maintenance-procedures) - Weekly/monthly tasks

### Security Team

**Setup:**
- [SECURITY.md](./SECURITY.md) - Complete security documentation

**Audit:**
- [SECURITY.md](./SECURITY.md#audit-logging) - Audit logging
- [SECURITY.md](./SECURITY.md#security-checklist) - Security checklist

---

## 📋 By Task

### Deployment Tasks

| Task | Document | Section |
|------|----------|---------|
| Initial setup | [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Pre-Flight Checklist |
| Quick evaluation | [QUICKSTART.md](./QUICKSTART.md) | All |
| Full production | [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | All phases |
| Container provisioning | [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Phase 1 |
| Database setup | [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Phase 2 |
| Security hardening | [SECURITY.md](./SECURITY.md) | Security Hardening |

### Operations Tasks

| Task | Document | Section |
|------|----------|---------|
| Start/stop services | [RUNBOOK.md](./RUNBOOK.md) | Service Management |
| Check health | [RUNBOOK.md](./RUNBOOK.md) | Daily Operations |
| View logs | [RUNBOOK.md](./RUNBOOK.md) | Logs & Monitoring |
| Backup database | [RUNBOOK.md](./RUNBOOK.md) | Maintenance Procedures |
| Restore from backup | [RUNBOOK.md](./RUNBOOK.md) | Emergency Procedures |

### Troubleshooting Tasks

| Issue | Document | Section |
|-------|----------|---------|
| High CPU usage | [RUNBOOK.md](./RUNBOOK.md) | Troubleshooting |
| Database issues | [RUNBOOK.md](./RUNBOOK.md) | Troubleshooting |
| Network connectivity | [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Troubleshooting |
| Security incident | [SECURITY.md](./SECURITY.md) | Incident Response |
| Service down | [RUNBOOK.md](./RUNBOOK.md) | Incident Response |

### Security Tasks

| Task | Document | Section |
|------|----------|---------|
| Generate passwords | [SECURITY.md](./SECURITY.md) | Credential Management |
| Setup Vault | [SECURITY.md](./SECURITY.md) | Credential Management |
| SSL certificates | [SECURITY.md](./SECURITY.md) | SSL/TLS Certificates |
| Firewall rules | [SECURITY.md](./SECURITY.md) | Firewall Configuration |
| Audit logs | [SECURITY.md](./SECURITY.md) | Audit Logging |

### Development Tasks

| Task | Document | Section |
|------|----------|---------|
| Understand architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) | All |
| API integration | [API_REFERENCE.md](./API_REFERENCE.md) | All |
| Authentication | [API_REFERENCE.md](./API_REFERENCE.md) | Authentication |
| Local dev setup | [QUICKSTART.md](./QUICKSTART.md) | All |

---

## 🔧 Quick Reference

### Common Commands

```bash
# Deployment
make deploy              # Full deployment
make deploy-quick        # Quick deployment
make phase-1             # Deploy phase 1 only

# Verification
make verify              # All health checks
make verify-db           # Database check
make verify-api          # API check

# Operations
make start               # Start all containers
make stop                # Stop all containers
make restart             # Restart all containers
make logs                # View logs

# Database
make db-shell            # PostgreSQL CLI
make db-dump             # Backup database
make redis-shell         # Redis CLI

# Monitoring
make grafana             # Open Grafana
make prometheus          # Open Prometheus
make logs-backend        # Backend logs

# Maintenance
make backup              # Run backups
make update              # Update all containers
make cleanup             # Clean up resources
```

### File Locations

```
infrastructure/
├── docs/                           # Documentation (you are here)
│   ├── INDEX.md                    # This file
│   ├── DEPLOYMENT_GUIDE.md         # Master deployment guide
│   ├── ARCHITECTURE.md             # System architecture
│   ├── QUICKSTART.md               # Quick start guide
│   ├── RUNBOOK.md                  # Operations runbook
│   ├── SECURITY.md                 # Security documentation
│   └── API_REFERENCE.md            # API documentation
├── scripts/                        # Deployment scripts
│   ├── 00-config.sh                # Configuration
│   ├── 01-network-setup.sh         # Network setup
│   ├── 02-provision-all.sh         # Create containers
│   ├── 10-setup-db.sh              # Database setup
│   ├── 11-setup-redis.sh           # Redis setup
│   ├── 20-setup-proxy.sh           # NGINX setup
│   ├── 30-setup-ai.sh              # AI setup
│   ├── 40-setup-observability.sh   # Monitoring setup
│   └── 99-verify.sh                # Verification
├── docker/                         # Docker Compose files
├── nginx/                          # NGINX configs
├── monitoring/                     # Prometheus/Grafana configs
├── backup/                         # Backup system
└── deploy.sh                       # Master deployment script
```

---

## 📊 Documentation Map

```
Zentoria Documentation
│
├─ Getting Started
│  ├─ QUICKSTART.md          (30 min, minimal stack)
│  └─ DEPLOYMENT_GUIDE.md    (Full production deployment)
│
├─ Architecture & Design
│  └─ ARCHITECTURE.md        (System design, data flows, topology)
│
├─ Operations
│  ├─ RUNBOOK.md             (Daily ops, troubleshooting, incidents)
│  └─ SECURITY.md            (Security procedures, credentials)
│
└─ Development
   └─ API_REFERENCE.md       (API docs, authentication, examples)
```

---

## 🎯 Decision Tree

### "I want to..."

**...get started quickly**
→ [QUICKSTART.md](./QUICKSTART.md)

**...deploy to production**
→ [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

**...understand the architecture**
→ [ARCHITECTURE.md](./ARCHITECTURE.md)

**...manage daily operations**
→ [RUNBOOK.md](./RUNBOOK.md)

**...secure the system**
→ [SECURITY.md](./SECURITY.md)

**...integrate with the API**
→ [API_REFERENCE.md](./API_REFERENCE.md)

**...troubleshoot an issue**
→ [RUNBOOK.md#troubleshooting](./RUNBOOK.md#troubleshooting)

**...respond to a security incident**
→ [SECURITY.md#incident-response](./SECURITY.md#incident-response)

**...restore from backup**
→ [RUNBOOK.md#emergency-procedures](./RUNBOOK.md#emergency-procedures)

---

## 📚 Additional Resources

### Project Root Documentation

- `../CLAUDE.md` - Project instructions for AI
- `../README.md` - Project overview
- `../LICENSE` - License information

### Backup Documentation

- `../backup/00-START-HERE.md` - Backup system overview
- `../backup/ARCHITECTURE.md` - Backup architecture
- `../backup/IMPLEMENTATION_GUIDE.md` - Backup setup
- `../backup/DISASTER_RECOVERY.md` - DR procedures

### Docker Documentation

- `../docker/DEPLOYMENT.md` - Docker deployment guide
- `../docker/FILES_MANIFEST.md` - Docker files reference

### Database Documentation

- `../../database/DATABASE_ARCHITECTURE.md` - Database schema
- `../../database/config/*.md` - Database configuration guides

---

## 🔄 Documentation Maintenance

### Review Schedule

| Document | Review Frequency | Last Review | Next Review |
|----------|-----------------|-------------|-------------|
| DEPLOYMENT_GUIDE.md | Quarterly | 2026-01 | 2026-04 |
| ARCHITECTURE.md | Quarterly | 2026-01 | 2026-04 |
| QUICKSTART.md | Quarterly | 2026-01 | 2026-04 |
| RUNBOOK.md | Monthly | 2026-01 | 2026-02 |
| SECURITY.md | Monthly | 2026-01 | 2026-02 |
| API_REFERENCE.md | As needed | 2026-01 | - |

### Contribution Guidelines

**To update documentation:**

1. Edit the relevant markdown file
2. Update "Last Updated" date
3. Add entry to changelog (if applicable)
4. Submit pull request
5. Request review from documentation team

---

## 📞 Support

### Documentation Issues

- **Missing content:** Create issue with "docs" label
- **Incorrect information:** Create issue with "docs-bug" label
- **Improvement suggestions:** Create issue with "docs-enhancement" label

### Getting Help

**General Support:** support@zentoria.ai

**Security Issues:** security@zentoria.ai

**Documentation Team:** docs@zentoria.ai

---

## 📝 Changelog

### January 2026 - Initial Release

- Created complete documentation set
- 6 core documents covering all aspects
- Deployment, operations, security, and API documentation
- Quick start guide for evaluation
- Comprehensive runbook for operations

---

## 🎓 Learning Path

### Level 1: Beginner

1. Read [QUICKSTART.md](./QUICKSTART.md)
2. Deploy minimal stack
3. Explore the UI
4. Read [ARCHITECTURE.md](./ARCHITECTURE.md) overview

### Level 2: Intermediate

1. Read [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
2. Deploy full production stack
3. Read [RUNBOOK.md](./RUNBOOK.md)
4. Practice daily operations

### Level 3: Advanced

1. Read [SECURITY.md](./SECURITY.md)
2. Implement security hardening
3. Read [API_REFERENCE.md](./API_REFERENCE.md)
4. Build integrations
5. Contribute to documentation

---

## ✅ Quick Checklist

### Before Deployment
- [ ] Read QUICKSTART.md or DEPLOYMENT_GUIDE.md
- [ ] Check hardware requirements
- [ ] Prepare credentials
- [ ] Review network requirements

### After Deployment
- [ ] Complete post-deployment verification
- [ ] Change all default passwords
- [ ] Configure backups
- [ ] Set up monitoring alerts
- [ ] Review SECURITY.md

### Ongoing
- [ ] Daily health checks (RUNBOOK.md)
- [ ] Weekly backups
- [ ] Monthly security reviews
- [ ] Quarterly documentation updates

---

**Welcome to Zentoria Personal Edition!**

This documentation is your guide to deploying, operating, and maintaining your AI Control Plane. Start with the QUICKSTART guide if you're new, or dive into the DEPLOYMENT_GUIDE for production setup.

For questions or support, reach out to support@zentoria.ai.

---

**Document Version:** 1.0
**Contributors:** Zentoria Documentation Team
**Last Updated:** January 2026
