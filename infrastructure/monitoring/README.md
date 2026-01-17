# Zentoria Personal Edition - Monitoring Stack

Comprehensive observability infrastructure for the Zentoria Personal Edition platform.

## Overview

This monitoring stack provides complete observability for all 17 Zentoria containers:

| Component | Port | Purpose |
|-----------|------|---------|
| Prometheus | 9090 | Metrics collection and alerting |
| Grafana | 3000 | Visualization and dashboards |
| Loki | 3100 | Log aggregation |
| Promtail | 9080 | Log shipping |
| AlertManager | 9093 | Alert routing and notifications |

## Architecture

```
                                    +------------------+
                                    |    Grafana       |
                                    |    (Port 3000)   |
                                    +--------+---------+
                                             |
                    +------------------------+------------------------+
                    |                        |                        |
           +--------v--------+      +--------v--------+      +--------v--------+
           |   Prometheus    |      |      Loki       |      |  AlertManager   |
           |   (Port 9090)   |      |   (Port 3100)   |      |   (Port 9093)   |
           +--------+--------+      +--------+--------+      +-----------------+
                    |                        |
    +---------------+---------------+        |
    |               |               |        |
+---v---+       +---v---+       +---v---+    |
|Node   |       |cAdvisor|      |Service|    |
|Export |       |       |       |Metrics|    |
+-------+       +-------+       +-------+    |
                                             |
                                    +--------v--------+
                                    |    Promtail     |
                                    |   (Port 9080)   |
                                    +-----------------+
                                             |
                              +--------------+--------------+
                              |              |              |
                         Container      System         Application
                           Logs          Logs            Logs
```

## Directory Structure

```
infrastructure/monitoring/
├── prometheus/
│   ├── prometheus.yml              # Main Prometheus configuration
│   └── rules/
│       ├── recording_rules.yml     # Pre-computed metrics
│       └── alert_rules.yml         # Alert definitions
├── grafana/
│   ├── grafana.ini                 # Grafana server configuration
│   └── provisioning/
│       ├── datasources/
│       │   └── datasources.yml     # Auto-configure data sources
│       └── dashboards/
│           ├── dashboards.yml      # Dashboard provisioning config
│           └── json/
│               ├── system-overview.json
│               ├── api-performance.json
│               ├── ai/
│               │   └── ai-usage.json
│               └── infrastructure/
│                   ├── database-performance.json
│                   ├── file-storage.json
│                   └── workflow-status.json
├── loki/
│   └── loki-config.yml             # Log storage and retention
├── promtail/
│   └── promtail-config.yml         # Log collection and parsing
├── alertmanager/
│   ├── alertmanager.yml            # Alert routing configuration
│   └── templates/
│       ├── email.tmpl              # Email notification template
│       └── slack.tmpl              # Slack notification template
└── README.md                       # This file
```

## Monitored Services

### Container Scrape Targets

| Container | VMID | Metrics Endpoint | Service Type |
|-----------|------|------------------|--------------|
| frontend | 400 | :3000/metrics | Next.js App |
| backend | 401 | :4000/metrics | API Server |
| n8n | 402 | :5678/metrics | Workflow Engine |
| vault | 403 | :8200/v1/sys/metrics | Secrets Manager |
| db | 404 | :9187 (postgres_exporter) | PostgreSQL |
| ai | 405 | :5000/metrics | Ollama LLM |
| logs | 406 | :9090/metrics | Prometheus Self |
| files | 407 | :9000/minio/v2/metrics | MinIO Storage |
| proxy | 408 | :9113 (nginx_exporter) | Nginx Proxy |
| auth | 409 | :9000/metrics | Authentik SSO |
| redis | 410 | :9121 (redis_exporter) | Redis Cache |
| ocr | 412 | :8000/metrics | OCR Service |
| voice | 413 | :9300/metrics | STT Service |
| backup | 416 | :8400/metrics | Backup Service |
| docs | 418 | :3002/metrics | Documentation |
| embeddings | 419 | :8100/metrics | Vector Embeddings |
| waf | 423 | :6060/metrics | Web App Firewall |

## Dashboards

### 1. System Overview
- Service health status grid (all 17 containers)
- Overall health gauge
- CPU/Memory/Disk usage graphs
- Network I/O metrics
- Active alerts panel

### 2. API Performance
- Request rate (total and by method)
- Error rate tracking
- Latency percentiles (P50, P95, P99)
- Status code distribution
- Top endpoints table

### 3. AI Usage (Ollama)
- Ollama service status
- Inference requests per minute
- Token generation speed
- GPU memory utilization
- Model-specific metrics
- OCR/Voice/Embeddings service status

### 4. Database Performance
- PostgreSQL connection monitoring
- Cache hit ratio tracking
- Transaction rates
- Tuple operations
- Redis memory and hit rate
- Top Redis commands

### 5. File Storage (MinIO)
- Storage capacity and usage
- Object count trends
- S3 API request rates
- Traffic throughput
- Bucket statistics table

### 6. Workflow Status (n8n)
- Active workflow count
- Execution rate and success rate
- Duration percentiles
- Top workflows by execution
- Error rate by workflow
- Node type statistics

## Alert Categories

### Critical Alerts (Immediate Response)
- Service downtime (ServiceDown)
- Vault sealed (VaultSealed)
- Database unreachable (PostgreSQLDown)
- Authentication failure (AuthServiceDown)
- Critical resource usage (>95%)

### Warning Alerts (Standard Response)
- High resource usage (>85%)
- Elevated error rates (>5%)
- Slow response times (P95 > 2s)
- Low cache hit ratios
- Approaching capacity limits

### SLO Alerts (Business Impact)
- Error budget burn rate
- Availability below target
- Latency SLI breaches

### Security Alerts (Priority)
- High failed login rate
- WAF block spikes
- Certificate expiration

## Log Retention Policies

| Log Type | Retention Period |
|----------|------------------|
| Frontend logs | 7 days |
| Backend logs | 14 days |
| Database logs | 30 days |
| Security logs (auth, vault, waf) | 90 days |
| Error logs (all sources) | 30 days |
| Warning logs | 14 days |
| Default | 31 days |

## Configuration Environment Variables

Set these environment variables before deployment:

```bash
# SMTP Configuration
SMTP_PASSWORD=your_smtp_password

# Slack Integration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

# PagerDuty (optional)
PAGERDUTY_SERVICE_KEY=your_service_key

# Grafana Database (optional)
POSTGRES_GRAFANA_PASSWORD=your_db_password

# Vault Token (for metrics)
# Place in /etc/prometheus/vault_token
```

## Deployment

### Docker Compose (Recommended)

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus:/etc/prometheus
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    volumes:
      - ./grafana/grafana.ini:/etc/grafana/grafana.ini
      - ./grafana/provisioning:/etc/grafana/provisioning
      - grafana_data:/var/lib/grafana
    ports:
      - "3000:3000"

  loki:
    image: grafana/loki:latest
    volumes:
      - ./loki:/etc/loki
      - loki_data:/loki
    command:
      - '-config.file=/etc/loki/loki-config.yml'
    ports:
      - "3100:3100"

  promtail:
    image: grafana/promtail:latest
    volumes:
      - ./promtail:/etc/promtail
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    command:
      - '-config.file=/etc/promtail/promtail-config.yml'

  alertmanager:
    image: prom/alertmanager:latest
    volumes:
      - ./alertmanager:/etc/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
    ports:
      - "9093:9093"

volumes:
  prometheus_data:
  grafana_data:
  loki_data:
```

## Access URLs

| Service | URL | Default Credentials |
|---------|-----|---------------------|
| Grafana | http://localhost:3000 | admin / zentoria_admin |
| Prometheus | http://localhost:9090 | N/A |
| AlertManager | http://localhost:9093 | N/A |
| Loki | http://localhost:3100 | N/A |

## Maintenance

### Prometheus Data Cleanup
```bash
# Check TSDB status
curl -s localhost:9090/api/v1/status/tsdb | jq

# Trigger compaction
curl -X POST localhost:9090/-/compact
```

### Loki Compaction
Automatic via compactor configuration (every 10 minutes).

### Grafana Backup
```bash
# Export dashboards
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "http://localhost:3000/api/dashboards/uid/zentoria-system-overview" | jq
```

## Troubleshooting

### No Metrics from Container
1. Verify container is exposing metrics endpoint
2. Check network connectivity from Prometheus
3. Review Prometheus targets page (/targets)

### Alerts Not Firing
1. Check AlertManager is receiving alerts (/api/v1/alerts)
2. Verify routing rules match alert labels
3. Test notification channels

### High Cardinality Warnings
1. Review recording rules for label reduction
2. Consider relabeling in Prometheus config
3. Check for unbounded label values

### Loki Query Timeout
1. Reduce query time range
2. Add more specific label selectors
3. Check Loki resource allocation
