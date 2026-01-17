# Zentoria AI Orchestrator

AI Orchestrator service for Zentoria Personal Edition. Routes AI commands to appropriate agents, manages context, and handles RAG-powered document search.

## Features

- **Multi-Agent Architecture**: 8 specialized agents for different tasks
- **Intent-Based Routing**: Automatic routing based on message content
- **RAG Pipeline**: Document indexing and retrieval-augmented generation
- **Conversation Memory**: Short-term (Redis) and long-term (Qdrant) memory
- **Streaming Support**: SSE and WebSocket for real-time responses
- **Ollama Integration**: Local LLM support with multiple models

## Agents

| Agent | Purpose | Model |
|-------|---------|-------|
| **Chat** | General conversation and Q&A | llama3.2:8b |
| **Code** | Code generation and review | codellama:7b |
| **File** | File operations via MCP | llama3.2:8b |
| **Mail** | Email sending and management | llama3.2:8b |
| **Key** | API key management | llama3.2:8b |
| **Workflow** | n8n workflow triggers | llama3.2:8b |
| **Security** | Permission and access control | llama3.2:8b |
| **Search** | RAG-powered document search | llama3.2:8b |

## Quick Start

### Prerequisites

- Python 3.11+
- Ollama with models (llama3.2:8b, codellama:7b, nomic-embed-text)
- Redis (for conversation memory)
- Qdrant (for vector storage)

### Installation

```bash
# Clone and enter directory
cd ai-orchestrator

# Install uv (if not installed)
pip install uv

# Create virtual environment and install dependencies
uv venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uv pip install -e ".[dev]"

# Copy environment file
cp .env.example .env
# Edit .env with your configuration
```

### Running

```bash
# Development mode
python -m src.main

# Or with uvicorn directly
uvicorn src.main:create_app --factory --reload --port 8080
```

### Docker

```bash
# Build and run with docker-compose
docker-compose up -d

# Or build manually
docker build -t zentoria-ai-orchestrator .
docker run -p 8080:8080 zentoria-ai-orchestrator
```

## API Endpoints

### Chat

```bash
# Basic chat
curl -X POST http://localhost:8080/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how are you?"}'

# Chat with specific agent
curl -X POST http://localhost:8080/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a Python function", "agent": "code"}'

# Streaming (SSE)
curl -X POST http://localhost:8080/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me a story"}'
```

### Commands

```bash
# Direct command execution
curl -X POST http://localhost:8080/api/v1/command \
  -H "Content-Type: application/json" \
  -d '{"command": "list files in /home", "agent": "file"}'
```

### Embeddings

```bash
# Generate embeddings
curl -X POST http://localhost:8080/api/v1/embed \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Hello world", "Test text"]}'
```

### Document Search (RAG)

```bash
# Index a document
curl -X POST http://localhost:8080/api/v1/index \
  -H "Content-Type: application/json" \
  -d '{"doc_id": "my-doc", "content": "Document content here..."}'

# Search documents
curl -X POST http://localhost:8080/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "find information about..."}'

# Delete document
curl -X DELETE http://localhost:8080/api/v1/index/my-doc
```

### Context Management

```bash
# Get conversation context
curl http://localhost:8080/api/v1/context/{session_id}

# Clear context
curl -X DELETE http://localhost:8080/api/v1/context/{session_id}
```

### Agents

```bash
# List all agents
curl http://localhost:8080/api/v1/agents

# Invoke specific agent
curl -X POST http://localhost:8080/api/v1/agents/code \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a hello world function"}'
```

### Health Check

```bash
curl http://localhost:8080/api/v1/health
```

## WebSocket

Connect to `/api/v1/ws/chat` for real-time bidirectional communication:

```javascript
const ws = new WebSocket('ws://localhost:8080/api/v1/ws/chat');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};

ws.send(JSON.stringify({
  message: "Hello",
  stream: true
}));
```

## Configuration

Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | 0.0.0.0 | Server host |
| `PORT` | 8080 | Server port |
| `DEBUG` | false | Enable debug mode |
| `OLLAMA_BASE_URL` | http://localhost:11434 | Ollama API URL |
| `QDRANT_URL` | http://10.10.40.119:6333 | Qdrant URL |
| `REDIS_URL` | redis://10.10.40.110:6379 | Redis URL |
| `MCP_BASE_URL` | http://10.10.40.101:4000 | Backend MCP URL |

See `.env.example` for all options.

## Development

```bash
# Run tests
pytest

# Run tests with coverage
pytest --cov=src --cov-report=term-missing

# Lint and format
ruff check .
ruff format .

# Type checking
mypy src
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FastAPI Application                   │
├─────────────────────────────────────────────────────────┤
│  /api/v1/chat  │  /api/v1/command  │  /api/v1/ws/chat  │
├─────────────────────────────────────────────────────────┤
│                    Command Router                        │
│         (Intent Detection & Agent Selection)             │
├─────────────────────────────────────────────────────────┤
│   Agents                                                 │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│   │ Chat │ │ Code │ │ File │ │ Mail │ │ Key  │         │
│   └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │
│   ┌────────┐ ┌──────────┐ ┌────────┐                    │
│   │Workflow│ │ Security │ │ Search │                    │
│   └────────┘ └──────────┘ └────────┘                    │
├─────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ LLM Client│  │Context Manager│  │ RAG Pipeline │     │
│  │  (Ollama) │  │    (Redis)   │  │   (Qdrant)   │     │
│  └───────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## License

MIT
