#!/bin/bash
# =============================================================================
# Zentoria Personal Edition - Qdrant Collection Initialization Script
# Container: 419 (zentoria-embeddings)
# Run this script after Qdrant is up and running
# =============================================================================

set -e

QDRANT_HOST="${QDRANT_HOST:-localhost}"
QDRANT_PORT="${QDRANT_PORT:-6333}"
QDRANT_URL="http://${QDRANT_HOST}:${QDRANT_PORT}"

echo "============================================="
echo "Zentoria Qdrant Collection Initialization"
echo "============================================="
echo "Qdrant URL: ${QDRANT_URL}"
echo ""

# Wait for Qdrant to be ready
echo "Waiting for Qdrant to be ready..."
until curl -s "${QDRANT_URL}/healthz" > /dev/null 2>&1; do
    echo "  Qdrant not ready, waiting 5 seconds..."
    sleep 5
done
echo "  Qdrant is ready!"
echo ""

# Function to create collection if it doesn't exist
create_collection() {
    local name=$1
    local config=$2

    echo "Creating collection: ${name}"

    # Check if collection exists
    if curl -s "${QDRANT_URL}/collections/${name}" | grep -q '"status":"ok"'; then
        echo "  Collection ${name} already exists, skipping..."
        return 0
    fi

    # Create collection
    response=$(curl -s -X PUT "${QDRANT_URL}/collections/${name}" \
        -H "Content-Type: application/json" \
        -d "${config}")

    if echo "$response" | grep -q '"status":"ok"'; then
        echo "  Collection ${name} created successfully!"
    else
        echo "  ERROR creating ${name}: ${response}"
        return 1
    fi
}

# Function to create payload index
create_index() {
    local collection=$1
    local field=$2
    local schema=$3

    echo "  Creating index on ${collection}.${field}"

    curl -s -X PUT "${QDRANT_URL}/collections/${collection}/index" \
        -H "Content-Type: application/json" \
        -d "{\"field_name\": \"${field}\", \"field_schema\": ${schema}}" > /dev/null
}

# =============================================================================
# CREATE COLLECTIONS
# =============================================================================

echo "============================================="
echo "Creating Collections"
echo "============================================="

# 1. Documents Collection (768 dimensions - nomic-embed-text)
create_collection "documents" '{
    "vectors": {
        "size": 768,
        "distance": "Cosine"
    },
    "optimizers_config": {
        "default_segment_number": 2,
        "memmap_threshold": 20000,
        "indexing_threshold": 20000,
        "flush_interval_sec": 5,
        "max_optimization_threads": 2
    },
    "hnsw_config": {
        "m": 16,
        "ef_construct": 100,
        "full_scan_threshold": 10000,
        "on_disk": true
    },
    "on_disk_payload": true
}'

# 2. Chat History Collection (768 dimensions - nomic-embed-text)
create_collection "chat_history" '{
    "vectors": {
        "size": 768,
        "distance": "Cosine"
    },
    "optimizers_config": {
        "default_segment_number": 2,
        "memmap_threshold": 10000,
        "indexing_threshold": 10000,
        "flush_interval_sec": 10,
        "max_optimization_threads": 1
    },
    "hnsw_config": {
        "m": 16,
        "ef_construct": 64,
        "full_scan_threshold": 5000,
        "on_disk": true
    },
    "on_disk_payload": true
}'

# 3. Code Collection (4096 dimensions - codellama)
create_collection "code" '{
    "vectors": {
        "size": 4096,
        "distance": "Cosine"
    },
    "optimizers_config": {
        "default_segment_number": 2,
        "memmap_threshold": 5000,
        "indexing_threshold": 5000,
        "flush_interval_sec": 10,
        "max_optimization_threads": 2
    },
    "hnsw_config": {
        "m": 24,
        "ef_construct": 128,
        "full_scan_threshold": 5000,
        "on_disk": true
    },
    "on_disk_payload": true
}'

# 4. Knowledge Collection (768 dimensions - nomic-embed-text)
create_collection "knowledge" '{
    "vectors": {
        "size": 768,
        "distance": "Cosine"
    },
    "optimizers_config": {
        "default_segment_number": 2,
        "memmap_threshold": 10000,
        "indexing_threshold": 10000,
        "flush_interval_sec": 10,
        "max_optimization_threads": 1
    },
    "hnsw_config": {
        "m": 16,
        "ef_construct": 100,
        "full_scan_threshold": 10000,
        "on_disk": true
    },
    "on_disk_payload": true
}'

echo ""
echo "============================================="
echo "Creating Payload Indexes"
echo "============================================="

# Documents indexes
echo "Indexing documents collection..."
create_index "documents" "file_id" '"uuid"'
create_index "documents" "chunk_index" '"integer"'
create_index "documents" "document_title" '"text"'
create_index "documents" "file_type" '"keyword"'
create_index "documents" "tags" '"keyword"'
create_index "documents" "created_at" '"datetime"'
create_index "documents" "content_hash" '"keyword"'

# Chat history indexes
echo "Indexing chat_history collection..."
create_index "chat_history" "conversation_id" '"uuid"'
create_index "chat_history" "message_id" '"uuid"'
create_index "chat_history" "user_id" '"uuid"'
create_index "chat_history" "role" '"keyword"'
create_index "chat_history" "message_timestamp" '"datetime"'

# Code indexes
echo "Indexing code collection..."
create_index "code" "file_id" '"uuid"'
create_index "code" "repository" '"keyword"'
create_index "code" "language" '"keyword"'
create_index "code" "function_name" '"keyword"'
create_index "code" "class_name" '"keyword"'
create_index "code" "content_hash" '"keyword"'
create_index "code" "file_path" '"text"'

# Knowledge indexes
echo "Indexing knowledge collection..."
create_index "knowledge" "source_type" '"keyword"'
create_index "knowledge" "source_id" '"keyword"'
create_index "knowledge" "category" '"keyword"'
create_index "knowledge" "subcategory" '"keyword"'
create_index "knowledge" "tags" '"keyword"'
create_index "knowledge" "is_latest" '"bool"'
create_index "knowledge" "version" '"integer"'
create_index "knowledge" "title" '"text"'

echo ""
echo "============================================="
echo "Verification"
echo "============================================="

# List all collections
echo "Collections created:"
curl -s "${QDRANT_URL}/collections" | python3 -c "import sys, json; data = json.load(sys.stdin); [print(f'  - {c[\"name\"]}') for c in data.get('result', {}).get('collections', [])]" 2>/dev/null || curl -s "${QDRANT_URL}/collections"

echo ""
echo "============================================="
echo "Qdrant initialization complete!"
echo "============================================="
