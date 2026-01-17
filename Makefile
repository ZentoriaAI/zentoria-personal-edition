# Zentoria Personal Edition - Makefile
# Version: 1.0
# Development convenience commands

.PHONY: help setup deploy verify backup logs shell-* clean

# Default target
.DEFAULT_GOAL := help

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

##@ General

help: ## Display this help message
	@echo "$(BLUE)Zentoria Personal Edition - Development Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(YELLOW)<target>$(NC)\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  $(BLUE)%-20s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(GREEN)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Setup & Deployment

setup: ## Initial setup (install dependencies)
	@echo "$(BLUE)Running initial setup...$(NC)"
	@bash infrastructure/scripts/00-config.sh
	@echo "$(GREEN)Setup completed$(NC)"

deploy: ## Full deployment (all phases)
	@echo "$(BLUE)Starting full deployment...$(NC)"
	@sudo bash infrastructure/deploy.sh full

deploy-quick: ## Quick deployment (minimal stack)
	@echo "$(BLUE)Starting quick deployment...$(NC)"
	@bash infrastructure/docs/QUICKSTART.md

phase-%: ## Deploy specific phase (e.g., make phase-1)
	@echo "$(BLUE)Deploying phase $*...$(NC)"
	@sudo bash infrastructure/deploy.sh phase $*

resume: ## Resume interrupted deployment
	@echo "$(BLUE)Resuming deployment...$(NC)"
	@sudo bash infrastructure/deploy.sh resume

##@ Verification & Testing

verify: ## Run all health checks
	@echo "$(BLUE)Running verification checks...$(NC)"
	@bash infrastructure/scripts/99-verify.sh

verify-db: ## Verify database connectivity
	@echo "$(BLUE)Verifying database...$(NC)"
	@pct exec 404 -- docker exec postgres psql -U zentoria -d zentoria_core -c "SELECT version();"

verify-redis: ## Verify Redis connectivity
	@echo "$(BLUE)Verifying Redis...$(NC)"
	@pct exec 410 -- docker exec redis redis-cli -a changeme123 ping

verify-api: ## Verify backend API
	@echo "$(BLUE)Verifying API...$(NC)"
	@curl -s http://api.zentoria.local/api/v1/health | jq .

verify-all: verify verify-db verify-redis verify-api ## Run all verification checks

##@ Backup & Restore

backup: ## Run full backup
	@echo "$(BLUE)Running full backup...$(NC)"
	@pct exec 416 -- bash /opt/zentoria/backup/scripts/backup-all.sh

backup-db: ## Backup database only
	@echo "$(BLUE)Backing up database...$(NC)"
	@pct exec 416 -- bash /opt/zentoria/backup/scripts/backup-db.sh

backup-verify: ## Verify backup integrity
	@echo "$(BLUE)Verifying backups...$(NC)"
	@pct exec 416 -- bash /opt/zentoria/backup/scripts/verify-backups.sh

restore-db: ## Restore database from backup
	@echo "$(YELLOW)WARNING: This will restore the database from latest backup$(NC)"
	@read -p "Continue? [y/N] " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		pct exec 416 -- bash /opt/zentoria/backup/scripts/restore-db.sh; \
	fi

##@ Logs & Monitoring

logs: ## View aggregated logs (Loki)
	@echo "$(BLUE)Opening Grafana Explore...$(NC)"
	@xdg-open http://logs.zentoria.local:3001/explore 2>/dev/null || open http://logs.zentoria.local:3001/explore 2>/dev/null

logs-backend: ## View backend logs
	@pct exec 401 -- pm2 logs --lines 50

logs-frontend: ## View frontend logs
	@pct exec 400 -- pm2 logs --lines 50

logs-db: ## View database logs
	@pct exec 404 -- docker-compose logs --tail 50 postgres

logs-redis: ## View Redis logs
	@pct exec 410 -- docker-compose logs --tail 50 redis

logs-ai: ## View AI orchestrator logs
	@pct exec 405 -- docker logs ollama --tail 50

grafana: ## Open Grafana dashboard
	@xdg-open http://logs.zentoria.local:3001 2>/dev/null || open http://logs.zentoria.local:3001 2>/dev/null

prometheus: ## Open Prometheus UI
	@xdg-open http://logs.zentoria.local:9090 2>/dev/null || open http://logs.zentoria.local:9090 2>/dev/null

##@ Container Management

shell-frontend: ## Shell into frontend container (400)
	@pct enter 400

shell-backend: ## Shell into backend container (401)
	@pct enter 401

shell-db: ## Shell into database container (404)
	@pct enter 404

shell-ai: ## Shell into AI container (405)
	@pct enter 405

shell-proxy: ## Shell into proxy container (408)
	@pct enter 408

list: ## List all Zentoria containers
	@echo "$(BLUE)Zentoria Containers:$(NC)"
	@pct list | grep zentoria || echo "No containers found"

status: ## Show deployment status
	@bash infrastructure/deploy.sh status

start: ## Start all containers
	@echo "$(BLUE)Starting all containers...$(NC)"
	@for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do \
		pct start $$ct 2>/dev/null && echo "Started $$ct" || true; \
	done

stop: ## Stop all containers
	@echo "$(YELLOW)Stopping all containers...$(NC)"
	@for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do \
		pct stop $$ct 2>/dev/null && echo "Stopped $$ct" || true; \
	done

restart: stop start ## Restart all containers

##@ Database Operations

db-shell: ## PostgreSQL shell
	@pct exec 404 -- docker exec -it postgres psql -U zentoria -d zentoria_core

db-dump: ## Create database dump
	@echo "$(BLUE)Creating database dump...$(NC)"
	@pct exec 404 -- docker exec postgres pg_dump -U zentoria zentoria_core > /tmp/zentoria_dump_$$(date +%Y%m%d_%H%M%S).sql
	@echo "$(GREEN)Dump created in /tmp/$(NC)"

db-restore: ## Restore database from dump
	@echo "$(YELLOW)Restoring database...$(NC)"
	@read -p "Enter dump file path: " dump_file; \
	pct push 404 $$dump_file /tmp/dump.sql; \
	pct exec 404 -- docker exec -i postgres psql -U zentoria zentoria_core < /tmp/dump.sql

redis-shell: ## Redis CLI
	@pct exec 410 -- docker exec -it redis redis-cli -a changeme123

redis-flush: ## Flush Redis cache (WARNING: destroys all data)
	@echo "$(YELLOW)WARNING: This will flush all Redis data$(NC)"
	@read -p "Continue? [y/N] " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		pct exec 410 -- docker exec redis redis-cli -a changeme123 FLUSHALL; \
	fi

##@ Development

dev-frontend: ## Start frontend in dev mode
	@pct exec 400 -- bash -c "cd /opt/zentoria/frontend && pm2 restart all || npm run dev"

dev-backend: ## Start backend in dev mode
	@pct exec 401 -- bash -c "cd /opt/zentoria/backend && pm2 restart all || npm run dev"

build-frontend: ## Build frontend
	@pct exec 400 -- bash -c "cd /opt/zentoria/frontend && npm run build"

build-backend: ## Build backend
	@pct exec 401 -- bash -c "cd /opt/zentoria/backend && npm run build"

lint: ## Run linters
	@echo "$(BLUE)Running linters...$(NC)"
	@pct exec 401 -- bash -c "cd /opt/zentoria/backend && npm run lint"
	@pct exec 400 -- bash -c "cd /opt/zentoria/frontend && npm run lint"

test: ## Run tests
	@echo "$(BLUE)Running tests...$(NC)"
	@pct exec 401 -- bash -c "cd /opt/zentoria/backend && npm test"
	@pct exec 400 -- bash -c "cd /opt/zentoria/frontend && npm test"

##@ AI Operations

ai-models: ## List installed AI models
	@pct exec 405 -- docker exec ollama ollama list

ai-pull: ## Pull AI model (e.g., make ai-pull MODEL=llama3.2)
	@echo "$(BLUE)Pulling model: $(MODEL)$(NC)"
	@pct exec 405 -- docker exec ollama ollama pull $(MODEL)

ai-remove: ## Remove AI model (e.g., make ai-remove MODEL=llama3.2)
	@echo "$(YELLOW)Removing model: $(MODEL)$(NC)"
	@pct exec 405 -- docker exec ollama ollama rm $(MODEL)

ai-test: ## Test AI inference
	@echo "$(BLUE)Testing AI inference...$(NC)"
	@curl -X POST http://10.10.40.5:11434/api/generate \
		-H "Content-Type: application/json" \
		-d '{"model": "llama3.2:latest", "prompt": "Hello, how are you?", "stream": false}'

##@ Security

ssl-cert: ## Generate SSL certificates
	@echo "$(BLUE)Generating SSL certificates...$(NC)"
	@bash infrastructure/nginx/ssl/generate-certificates.sh

security-scan: ## Run security scan
	@echo "$(BLUE)Running security scan...$(NC)"
	@echo "$(YELLOW)Not implemented yet$(NC)"

firewall-rules: ## Show firewall rules
	@echo "$(BLUE)Current firewall rules:$(NC)"
	@iptables -L -n -v | grep zentoria || echo "No rules found"

##@ Maintenance

update: ## Update all containers
	@echo "$(BLUE)Updating all containers...$(NC)"
	@for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do \
		echo "Updating container $$ct..."; \
		pct exec $$ct -- bash -c "apt update && apt upgrade -y" 2>/dev/null || true; \
	done

update-docker: ## Update Docker images
	@echo "$(BLUE)Updating Docker images...$(NC)"
	@pct exec 404 -- docker-compose pull && docker-compose up -d
	@pct exec 410 -- docker-compose pull && docker-compose up -d

cleanup: ## Clean up unused resources
	@echo "$(BLUE)Cleaning up unused resources...$(NC)"
	@for ct in 404 410 405; do \
		pct exec $$ct -- docker system prune -f 2>/dev/null || true; \
	done

disk-usage: ## Show disk usage per container
	@echo "$(BLUE)Disk usage by container:$(NC)"
	@for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do \
		name=$$(pct config $$ct | grep hostname | cut -d' ' -f2); \
		usage=$$(pct exec $$ct -- df -h / | tail -1 | awk '{print $$3 "/" $$2 " (" $$5 ")"}' 2>/dev/null); \
		echo "$$ct ($$name): $$usage"; \
	done

##@ Cleanup & Rollback

clean: ## Stop and remove all containers (WARNING)
	@echo "$(YELLOW)WARNING: This will destroy all Zentoria containers$(NC)"
	@read -p "Continue? [y/N] " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		make stop; \
		for ct in 400 401 402 403 404 405 406 407 408 409 410 412 413 416 418 419 423; do \
			pct destroy $$ct 2>/dev/null && echo "Destroyed $$ct" || true; \
		done; \
	fi

rollback-%: ## Rollback specific phase (e.g., make rollback-3)
	@echo "$(YELLOW)Rolling back phase $*...$(NC)"
	@sudo bash infrastructure/deploy.sh rollback $*

##@ Documentation

docs: ## Open documentation
	@echo "$(BLUE)Opening documentation...$(NC)"
	@xdg-open infrastructure/docs/DEPLOYMENT_GUIDE.md 2>/dev/null || \
		open infrastructure/docs/DEPLOYMENT_GUIDE.md 2>/dev/null || \
		cat infrastructure/docs/DEPLOYMENT_GUIDE.md

docs-serve: ## Serve documentation locally
	@echo "$(BLUE)Starting documentation server...$(NC)"
	@cd infrastructure/docs && python3 -m http.server 8000

##@ Troubleshooting

troubleshoot: ## Run troubleshooting diagnostics
	@echo "$(BLUE)Running diagnostics...$(NC)"
	@echo ""
	@echo "Container Status:"
	@make list
	@echo ""
	@echo "Network Connectivity:"
	@pct exec 401 -- ping -c 2 10.10.40.4 2>/dev/null && echo "Backend -> DB: OK" || echo "Backend -> DB: FAIL"
	@pct exec 401 -- ping -c 2 10.10.41.0 2>/dev/null && echo "Backend -> Redis: OK" || echo "Backend -> Redis: FAIL"
	@echo ""
	@echo "Service Health:"
	@make verify-all

debug: ## Enable debug mode
	@echo "$(YELLOW)Enabling debug mode...$(NC)"
	@pct exec 401 -- bash -c "sed -i 's/LOG_LEVEL=.*/LOG_LEVEL=debug/' /opt/zentoria/backend/.env"
	@pct exec 401 -- pm2 restart all

##@ Utilities

config: ## Show current configuration
	@echo "$(BLUE)Current Configuration:$(NC)"
	@cat infrastructure/scripts/00-config.sh

version: ## Show version information
	@echo "$(BLUE)Zentoria Personal Edition$(NC)"
	@echo "Version: 1.0"
	@echo "Proxmox: $$(pveversion | head -n1)"
	@echo "Deployment Phase: $$(cat infrastructure/.deployment_progress 2>/dev/null || echo '0')"

dashboard: ## Open main dashboard
	@xdg-open http://zentoria.local 2>/dev/null || open http://zentoria.local 2>/dev/null

watch: ## Watch container status (updates every 2 seconds)
	@watch -n 2 "pct list | grep zentoria"
