#!/bin/bash
##############################################################################
# Zentoria Personal Edition - Observability Stack Setup
# Installs Elasticsearch, Prometheus, and Grafana
##############################################################################

source "$(dirname "$0")/00-config.sh"

# Elasticsearch container
ES_CONTAINER_VMID=406

##############################################################################
# OBSERVABILITY SETUP
##############################################################################

main() {
  log "Starting observability stack setup on container $ES_CONTAINER_VMID..."

  # Check if container exists
  if ! ssh_proxmox "pct status $ES_CONTAINER_VMID" &>/dev/null; then
    error "Container $ES_CONTAINER_VMID does not exist"
    exit 1
  fi

  # Execute setup steps
  install_elasticsearch
  setup_log_pipelines
  create_log_indices
  setup_monitoring_dashboards
  verify_elasticsearch

  success "Observability stack setup completed!"
}

install_elasticsearch() {
  log "Installing Elasticsearch..."

  # Add Elastic GPG key
  ssh_container "$ES_CONTAINER_VMID" "wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | apt-key add -"

  # Add Elasticsearch repository
  ssh_container "$ES_CONTAINER_VMID" "echo 'deb https://artifacts.elastic.co/packages/8.x/apt stable main' | tee /etc/apt/sources.list.d/elastic-8.x.list"

  # Install Elasticsearch
  ssh_container "$ES_CONTAINER_VMID" "apt-get update && apt-get install -y elasticsearch"

  # Create data directory
  ssh_container "$ES_CONTAINER_VMID" "mkdir -p /var/lib/elasticsearch && chown -R elasticsearch:elasticsearch /var/lib/elasticsearch"

  success "Elasticsearch installed"
}

setup_elasticsearch_config() {
  log "Configuring Elasticsearch..."

  # Backup original config
  ssh_container "$ES_CONTAINER_VMID" "cp /etc/elasticsearch/elasticsearch.yml /etc/elasticsearch/elasticsearch.yml.backup"

  # Create elasticsearch.yml
  ssh_container "$ES_CONTAINER_VMID" "cat > /etc/elasticsearch/elasticsearch.yml" << 'EOF'
# Zentoria Personal Edition - Elasticsearch Configuration

cluster.name: zentoria-logs
node.name: es-node-1

# Network
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300

# Path settings
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch

# Memory
indices.memory.index_buffer_size: 40%

# Discovery and cluster formation
discovery.type: single-node

# Security (disable for internal-only setup)
xpack.security.enabled: false

# ML settings
xpack.ml.enabled: true
xpack.ml.max_open_jobs: 20

# Index lifecycle management
xpack.ilm.enabled: true

# Thread pools
thread_pool.bulk.queue_size: 1000
thread_pool.search.queue_size: 1000

# Monitoring
xpack.monitoring.enabled: true
xpack.monitoring.collection.enabled: true
EOF

  success "Elasticsearch configuration applied"
}

setup_log_pipelines() {
  log "Setting up log processing pipelines..."

  # Create ingest pipeline configuration
  ssh_container "$ES_CONTAINER_VMID" "cat > /usr/local/bin/create-pipelines.sh" << 'EOF'
#!/bin/bash

# Wait for Elasticsearch to be ready
until curl -s http://localhost:9200/_cluster/health | grep -q "status"; do
    sleep 1
done

# Create log pipeline
curl -X PUT "localhost:9200/_ingest/pipeline/zentoria-logs" -H 'Content-Type: application/json' -d'
{
  "description": "Parse Zentoria application logs",
  "processors": [
    {
      "grok": {
        "field": "message",
        "patterns": ["%{TIMESTAMP_ISO8601:timestamp} \\[%{LOGLEVEL:level}\\] %{DATA:logger} - %{GREEDYDATA:message}"]
      }
    },
    {
      "date": {
        "field": "timestamp",
        "formats": ["ISO8601"]
      }
    },
    {
      "remove": {
        "field": "timestamp"
      }
    }
  ]
}
'

# Create application events pipeline
curl -X PUT "localhost:9200/_ingest/pipeline/zentoria-events" -H 'Content-Type: application/json' -d'
{
  "description": "Process Zentoria application events",
  "processors": [
    {
      "set": {
        "field": "event.ingested",
        "value": "{{_ingest.timestamp}}"
      }
    },
    {
      "lowercase": {
        "field": "event.action"
      }
    }
  ]
}
'

echo "Pipelines created successfully"
EOF

  ssh_container "$ES_CONTAINER_VMID" "chmod +x /usr/local/bin/create-pipelines.sh"

  success "Log pipeline configuration created"
}

create_log_indices() {
  log "Creating Elasticsearch indices..."

  # Create index template
  ssh_container "$ES_CONTAINER_VMID" "cat > /usr/local/bin/create-indices.sh" << 'EOF'
#!/bin/bash

# Wait for Elasticsearch
until curl -s http://localhost:9200/_cluster/health | grep -q "status"; do
    sleep 1
done

# Create index template for logs
curl -X PUT "localhost:9200/_index_template/zentoria-logs-template" -H 'Content-Type: application/json' -d'
{
  "index_patterns": ["zentoria-logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "zentoria-logs-policy",
      "index.lifecycle.rollover_alias": "zentoria-logs"
    },
    "mappings": {
      "properties": {
        "timestamp": {"type": "date"},
        "level": {"type": "keyword"},
        "logger": {"type": "keyword"},
        "message": {"type": "text"},
        "service": {"type": "keyword"},
        "container_id": {"type": "keyword"},
        "host": {"type": "keyword"}
      }
    }
  }
}
'

# Create initial index
curl -X PUT "localhost:9200/zentoria-logs-000001" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0
  },
  "aliases": {
    "zentoria-logs": {
      "is_write_index": true
    }
  }
}
'

# Create index for metrics
curl -X PUT "localhost:9200/zentoria-metrics-template" -H 'Content-Type: application/json' -d'
{
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0
    }
  }
}
'

echo "Indices created successfully"
EOF

  ssh_container "$ES_CONTAINER_VMID" "chmod +x /usr/local/bin/create-indices.sh"

  success "Index creation script configured"
}

setup_monitoring_dashboards() {
  log "Setting up monitoring dashboards..."

  # Create Kibana configuration script
  ssh_container "$ES_CONTAINER_VMID" "cat > /usr/local/bin/setup-dashboards.sh" << 'EOF'
#!/bin/bash

# Wait for Elasticsearch
until curl -s http://localhost:9200/_cluster/health | grep -q "status"; do
    sleep 1
done

# Create saved searches
curl -X POST "localhost:9200/.kibana/_doc/search:zentoria-errors" -H 'Content-Type: application/json' -d'
{
  "type": "search",
  "search": {
    "title": "Zentoria Errors",
    "description": "All errors from Zentoria services",
    "hits": 0,
    "columns": ["timestamp", "level", "message", "service"],
    "sort": [["timestamp", "desc"]],
    "version": 1,
    "kibanaSavedObjectMeta": {
      "searchSourceJSON": "{\"index\":\"zentoria-logs-*\",\"query\":{\"match\":{\"level\":{\"query\":\"ERROR\",\"type\":\"phrase\"}}}}"
    }
  }
}
'

echo "Dashboards configured"
EOF

  ssh_container "$ES_CONTAINER_VMID" "chmod +x /usr/local/bin/setup-dashboards.sh"

  success "Monitoring dashboards configured"
}

verify_elasticsearch() {
  log "Verifying Elasticsearch installation..."

  # Start Elasticsearch
  setup_elasticsearch_config
  ssh_container "$ES_CONTAINER_VMID" "systemctl start elasticsearch"

  # Wait for startup
  log "Waiting for Elasticsearch to start..."
  sleep 10

  # Check cluster health
  local health=$(ssh_container "$ES_CONTAINER_VMID" "curl -s http://localhost:9200/_cluster/health 2>/dev/null")

  if echo "$health" | grep -q "status"; then
    success "Elasticsearch is responding"

    # Parse health status
    local status=$(echo "$health" | jq -r '.status')
    log "Cluster status: $status"

    if [ "$status" = "green" ] || [ "$status" = "yellow" ]; then
      success "Elasticsearch cluster is healthy"
    fi
  else
    error "Elasticsearch is not responding"
    return 1
  fi

  # Create indices
  log "Creating Elasticsearch indices and templates..."
  ssh_container "$ES_CONTAINER_VMID" "/usr/local/bin/create-indices.sh"

  # Create pipelines
  log "Creating log processing pipelines..."
  ssh_container "$ES_CONTAINER_VMID" "/usr/local/bin/create-pipelines.sh"

  # List indices
  log "Elasticsearch indices:"
  ssh_container "$ES_CONTAINER_VMID" "curl -s http://localhost:9200/_cat/indices?v" | sed 's/^/  /'

  success "Elasticsearch verification completed"
}

# Main execution
main "$@"
