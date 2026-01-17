# Contributing to Zentoria Personal Edition

Thank you for your interest in contributing to Zentoria! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Documentation](#documentation)

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Be kind, constructive, and professional in all interactions.

---

## Getting Started

### Prerequisites

- **Node.js** 20+ (for MCP Gateway and Frontend)
- **Python** 3.11+ (for AI Orchestrator)
- **Docker** and **Docker Compose**
- **pnpm** (preferred) or npm
- **Git**

### First-Time Setup

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/zentoria-mcp.git
   cd zentoria-mcp
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/zentoria/zentoria-mcp.git
   ```

4. **Install dependencies**:
   ```bash
   # MCP Gateway
   cd mcp-gateway
   pnpm install

   # Frontend
   cd ../frontend
   pnpm install

   # AI Orchestrator
   cd ../ai-orchestrator
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```

5. **Set up environment**:
   ```bash
   # Copy example env files
   cp mcp-gateway/.env.example mcp-gateway/.env
   cp ai-orchestrator/.env.example ai-orchestrator/.env
   cp frontend/.env.example frontend/.env.local
   ```

---

## Development Setup

### Running Services Locally

**Using Docker Compose (Recommended)**:
```bash
docker-compose -f docker-compose.dev.yml up -d
```

**Manual Start**:
```bash
# Terminal 1: MCP Gateway
cd mcp-gateway
pnpm dev

# Terminal 2: Frontend
cd frontend
pnpm dev

# Terminal 3: AI Orchestrator
cd ai-orchestrator
uvicorn src.main:create_app --factory --reload --port 8000
```

### Database Setup

```bash
# Run migrations
cd mcp-gateway
pnpm prisma migrate dev

# Seed database (optional)
pnpm prisma db seed
```

### Running Tests

```bash
# Backend tests
cd mcp-gateway
pnpm test

# Frontend tests
cd frontend
pnpm test

# E2E tests
cd frontend
pnpm test:e2e
```

---

## Project Structure

```
zentoria-mcp/
├── mcp-gateway/           # Node.js/Fastify backend
│   ├── src/
│   │   ├── routes/        # API route handlers
│   │   ├── services/      # Business logic
│   │   ├── repositories/  # Data access layer
│   │   ├── infrastructure/ # Cross-cutting concerns
│   │   └── __tests__/     # Test files
│   └── prisma/            # Database schema
│
├── frontend/              # Next.js frontend
│   ├── src/
│   │   ├── app/           # Next.js app router
│   │   ├── components/    # React components
│   │   ├── stores/        # Zustand stores
│   │   ├── hooks/         # Custom hooks
│   │   └── lib/           # Utilities
│   └── e2e/               # Playwright E2E tests
│
├── ai-orchestrator/       # Python/FastAPI AI service
│   ├── src/
│   │   ├── api/           # API routes
│   │   ├── core/          # Core modules
│   │   ├── agents/        # AI agents
│   │   └── config.py      # Configuration
│   └── tests/             # Test files
│
├── infrastructure/        # Deployment configs
│   ├── docs/              # Documentation
│   ├── docker/            # Docker configs
│   ├── nginx/             # NGINX configs
│   └── scripts/           # Deployment scripts
│
├── docs/                  # Project documentation
│   └── adr/               # Architecture Decision Records
│
└── database/              # Database documentation
```

---

## Coding Standards

### TypeScript (MCP Gateway & Frontend)

- **Style**: Follow ESLint configuration
- **Types**: Prefer explicit types over `any`
- **Imports**: Use absolute imports with `@/` prefix
- **Naming**: camelCase for variables/functions, PascalCase for classes/types

```typescript
// Good
import { UserService } from '@/services/user.service.js';

interface UserCreateInput {
  name: string;
  email: string;
}

async function createUser(input: UserCreateInput): Promise<User> {
  // ...
}

// Bad
import { UserService } from '../../../services/user.service';

async function createUser(input: any) {
  // ...
}
```

### Python (AI Orchestrator)

- **Style**: Follow PEP 8, use Black for formatting
- **Types**: Use type hints (Python 3.11+ syntax)
- **Imports**: Standard library → third-party → local
- **Naming**: snake_case for variables/functions, PascalCase for classes

```python
# Good
from typing import Any
from collections.abc import AsyncIterator

import structlog
from fastapi import Depends

from src.core.models import Message
from src.container import get_llm_client

async def process_message(
    message: str,
    context: list[Message] | None = None,
) -> AsyncIterator[str]:
    """Process a message and stream the response."""
    ...
```

### React (Frontend)

- **Components**: Functional components with hooks
- **State**: Zustand for global state, React state for local
- **Styling**: Tailwind CSS
- **Testing**: React Testing Library

```tsx
// Good
'use client';

import { useState } from 'react';
import { useChatStore, selectMessages } from '@/stores/chat-store';

interface ChatInputProps {
  onSubmit: (message: string) => void;
}

export function ChatInput({ onSubmit }: ChatInputProps) {
  const [value, setValue] = useState('');
  const messages = useChatStore(selectMessages);
  // ...
}
```

---

## Testing Requirements

### Coverage Targets

| Package | Minimum Coverage |
|---------|------------------|
| mcp-gateway | 80% |
| frontend | 70% |
| ai-orchestrator | 70% |

### Test Types

1. **Unit Tests**: Test individual functions/components
2. **Integration Tests**: Test API endpoints
3. **E2E Tests**: Test user flows

### Writing Tests

```typescript
// mcp-gateway test example
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileService } from '../services/file.service.js';

describe('FileService', () => {
  let service: FileService;

  beforeEach(() => {
    service = new FileService({
      repository: mockRepository,
      validator: mockValidator,
    });
  });

  describe('uploadFile', () => {
    it('should validate file type before upload', async () => {
      const file = createMockFile({ type: 'application/exe' });

      await expect(service.uploadFile(file)).rejects.toThrow('Invalid file type');
    });

    it('should store file and return record', async () => {
      const file = createMockFile({ type: 'application/pdf' });

      const result = await service.uploadFile(file);

      expect(result.id).toBeDefined();
      expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        filename: file.filename,
      }));
    });
  });
});
```

---

## Pull Request Process

### Before Submitting

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following coding standards

3. **Write/update tests** for your changes

4. **Run all tests**:
   ```bash
   pnpm test
   ```

5. **Run linting**:
   ```bash
   pnpm lint
   ```

6. **Update documentation** if needed

### PR Requirements

- **Title**: Clear, descriptive title
- **Description**: Explain what and why
- **Tests**: All tests passing
- **Lint**: No linting errors
- **Docs**: Update relevant documentation

### PR Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed

## Related Issues
Closes #123

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
```

### Review Process

1. Submit PR with completed checklist
2. Wait for CI checks to pass
3. Address review feedback
4. Squash commits if requested
5. Merge after approval

---

## Issue Guidelines

### Reporting Bugs

Use the bug report template:

```markdown
**Describe the bug**
Clear description of what the bug is.

**To Reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment**
- OS: [e.g., Ubuntu 22.04]
- Browser: [e.g., Chrome 120]
- Version: [e.g., 1.3.0]
```

### Feature Requests

Use the feature request template:

```markdown
**Is your feature request related to a problem?**
Description of the problem.

**Describe the solution you'd like**
Clear description of what you want.

**Describe alternatives you've considered**
Other solutions you've thought about.

**Additional context**
Any other context or screenshots.
```

---

## Documentation

### When to Update Docs

- Adding new features
- Changing API endpoints
- Modifying configuration
- Updating architecture

### Documentation Locations

| Type | Location |
|------|----------|
| API Reference | `infrastructure/docs/API_REFERENCE.md` |
| Architecture | `infrastructure/docs/ARCHITECTURE.md` |
| ADRs | `docs/adr/` |
| Deployment | `infrastructure/docs/DEPLOYMENT_GUIDE.md` |
| Testing | `docs/TESTING.md` |

### ADR Guidelines

When making significant architectural decisions:

1. Create a new ADR in `docs/adr/`
2. Use the template format
3. Get team review
4. Update ADR README

---

## Questions?

- **General**: Open a discussion on GitHub
- **Security**: Email security@zentoria.ai
- **Support**: Email support@zentoria.ai

Thank you for contributing!
