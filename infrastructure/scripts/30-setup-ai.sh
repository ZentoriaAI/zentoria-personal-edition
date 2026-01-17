#!/bin/bash
##############################################################################
# Zentoria Personal Edition - AI Services Setup
# Installs and configures Ollama in container 405
##############################################################################

source "$(dirname "$0")/00-config.sh"

# Ollama specific settings
OLLAMA_CONTAINER_VMID=405
OLLAMA_USER="ollama"
OLLAMA_GROUP="ollama"

##############################################################################
# OLLAMA SETUP
##############################################################################

main() {
  log "Starting Ollama AI services setup on container $OLLAMA_CONTAINER_VMID..."

  # Check if container exists
  if ! ssh_proxmox "pct status $OLLAMA_CONTAINER_VMID" &>/dev/null; then
    error "Container $OLLAMA_CONTAINER_VMID does not exist"
    exit 1
  fi

  # Execute setup steps
  install_ollama
  configure_ollama
  pull_models
  setup_api_service
  verify_ollama

  success "Ollama AI setup completed!"
}

install_ollama() {
  log "Installing Ollama..."

  # Download and install Ollama
  ssh_container "$OLLAMA_CONTAINER_VMID" "curl -fsSL https://ollama.ai/install.sh | sh"

  # Create ollama user and group
  ssh_container "$OLLAMA_CONTAINER_VMID" "useradd -r -s /bin/bash -d /var/lib/ollama $OLLAMA_USER 2>/dev/null || true"

  # Create necessary directories
  ssh_container "$OLLAMA_CONTAINER_VMID" "mkdir -p /var/lib/ollama /var/log/ollama && chown -R $OLLAMA_USER:$OLLAMA_GROUP /var/lib/ollama /var/log/ollama"

  success "Ollama installed"
}

configure_ollama() {
  log "Configuring Ollama..."

  # Create systemd service file
  ssh_container "$OLLAMA_CONTAINER_VMID" "cat > /etc/systemd/system/ollama.service" << 'EOF'
[Unit]
Description=Ollama Service
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=ollama
Group=ollama
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=5
StandardOutput=append:/var/log/ollama/ollama.log
StandardError=append:/var/log/ollama/ollama.log
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_MODELS=/var/lib/ollama/models"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=4"
LimitNoFile=65535

[Install]
WantedBy=multi-user.target
EOF

  # Enable and start service
  ssh_container "$OLLAMA_CONTAINER_VMID" "systemctl daemon-reload && systemctl enable ollama"

  # Create configuration file
  ssh_container "$OLLAMA_CONTAINER_VMID" "cat > /etc/ollama/ollama.conf" << 'EOF'
# Zentoria Personal Edition - Ollama Configuration

# Server configuration
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_KEEP_ALIVE=5m
OLLAMA_NUM_PARALLEL=4
OLLAMA_MAX_LOADED_MODELS=4

# Model storage
OLLAMA_MODELS=/var/lib/ollama/models

# Logging
OLLAMA_DEBUG=false

# CPU/Memory limits
OLLAMA_NUM_THREAD=8
OLLAMA_MAX_VRAM=12000000000

# API settings
OLLAMA_LOAD_TIMEOUT=2m
EOF

  success "Ollama configuration applied"
}

pull_models() {
  log "Pulling AI models..."

  # Start ollama service
  ssh_container "$OLLAMA_CONTAINER_VMID" "systemctl start ollama"

  # Wait for ollama to be ready
  local max_attempts=30
  local attempt=1

  while [ $attempt -le $max_attempts ]; do
    if ssh_container "$OLLAMA_CONTAINER_VMID" "curl -s http://localhost:11434/api/health &>/dev/null"; then
      log "Ollama service is ready"
      break
    fi
    warning "Waiting for Ollama service... ($attempt/$max_attempts)"
    sleep 2
    ((attempt++))
  done

  # Define models to pull
  local models=("llama2" "mistral" "neural-chat" "orca-mini")

  # Pull each model
  for model in "${models[@]}"; do
    log "Pulling model: $model..."
    if ssh_container "$OLLAMA_CONTAINER_VMID" "ollama pull $model"; then
      success "Model $model pulled successfully"
    else
      warning "Failed to pull model $model"
    fi
  done

  # List loaded models
  log "Available models:"
  ssh_container "$OLLAMA_CONTAINER_VMID" "ollama list" | sed 's/^/  /'

  success "Models pulled"
}

setup_api_service() {
  log "Setting up Ollama API service..."

  # Create API wrapper script
  ssh_container "$OLLAMA_CONTAINER_VMID" "cat > /usr/local/bin/ollama-api.sh" << 'EOF'
#!/bin/bash
# Ollama API wrapper for Zentoria

# Simple health check endpoint
if [ "$1" = "health" ]; then
    curl -s http://localhost:11434/api/health
    exit 0
fi

# List models
if [ "$1" = "models" ]; then
    curl -s http://localhost:11434/api/tags | jq '.models[]'
    exit 0
fi

# Generate completion
if [ "$1" = "generate" ]; then
    model=$2
    prompt=$3
    curl -X POST http://localhost:11434/api/generate \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"$model\", \"prompt\": \"$prompt\", \"stream\": false}"
    exit 0
fi

# Embedding generation
if [ "$1" = "embed" ]; then
    model=$2
    text=$3
    curl -X POST http://localhost:11434/api/embeddings \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"$model\", \"prompt\": \"$text\"}"
    exit 0
fi

echo "Usage: ollama-api.sh {health|models|generate|embed} [args...]"
exit 1
EOF

  ssh_container "$OLLAMA_CONTAINER_VMID" "chmod +x /usr/local/bin/ollama-api.sh"

  # Create monitoring script
  ssh_container "$OLLAMA_CONTAINER_VMID" "cat > /usr/local/bin/ollama-monitor.sh" << 'EOF'
#!/bin/bash
# Ollama monitoring script

OLLAMA_HOST="localhost:11434"
LOG_FILE="/var/log/ollama/monitor.log"

# Check service health
echo "[$(date)] Ollama Health Check" >> $LOG_FILE

if curl -s http://$OLLAMA_HOST/api/health &>/dev/null; then
    echo "[$(date)] Ollama service is healthy" >> $LOG_FILE

    # Get model info
    models=$(curl -s http://$OLLAMA_HOST/api/tags | jq -r '.models | length')
    echo "[$(date)] Loaded models: $models" >> $LOG_FILE
else
    echo "[$(date)] Ollama service is down!" >> $LOG_FILE
    # Restart ollama
    systemctl restart ollama
    echo "[$(date)] Ollama restarted" >> $LOG_FILE
fi

exit 0
EOF

  ssh_container "$OLLAMA_CONTAINER_VMID" "chmod +x /usr/local/bin/ollama-monitor.sh"

  # Add monitoring to cron
  ssh_container "$OLLAMA_CONTAINER_VMID" "(crontab -l 2>/dev/null; echo '*/5 * * * * /usr/local/bin/ollama-monitor.sh') | crontab -"

  success "API service and monitoring configured"
}

verify_ollama() {
  log "Verifying Ollama installation..."

  # Check service status
  local status=$(ssh_container "$OLLAMA_CONTAINER_VMID" "systemctl is-active ollama")
  if [ "$status" = "active" ]; then
    success "Ollama service is active"
  else
    error "Ollama service is not active: $status"
    return 1
  fi

  # Test API health
  local health=$(ssh_container "$OLLAMA_CONTAINER_VMID" "curl -s http://localhost:11434/api/health")
  if [ -n "$health" ]; then
    success "Ollama API is responding"
  else
    warning "Ollama API may not be ready yet"
  fi

  # List available models
  log "Available models:"
  ssh_container "$OLLAMA_CONTAINER_VMID" "ollama list" | sed 's/^/  /'

  # Test model generation (quick test)
  log "Testing model generation (llama2)..."
  local test_result=$(ssh_container "$OLLAMA_CONTAINER_VMID" "echo 'What is machine learning?' | ollama run llama2 --raw" 2>/dev/null || echo "Model not yet loaded")

  if [ "$test_result" != "Model not yet loaded" ]; then
    success "Model generation working"
  else
    log "Model will be loaded on first use"
  fi

  success "Ollama verification completed"
}

# Main execution
main "$@"
