# ADR-001: Dependency Injection Container Pattern

## Status
Accepted

## Date
2026-01-17

## Context

The AI Orchestrator (Python/FastAPI) and MCP Gateway (Node.js/Fastify) services both used global singletons for managing service instances:

```python
# Python - Before
_context_manager: ContextManager | None = None

async def get_context_manager() -> ContextManager:
    global _context_manager
    if _context_manager is None:
        _context_manager = ContextManager()
    return _context_manager
```

```typescript
// TypeScript - Before
let commandService: CommandService | null = null;

export function getCommandService(): CommandService {
  if (!commandService) {
    commandService = new CommandService(/* 8+ dependencies */);
  }
  return commandService;
}
```

### Problems with Global Singletons

1. **Testing Difficulty**: Hard to mock dependencies, no isolation between tests
2. **Hidden Dependencies**: Services implicitly depend on global state
3. **Lifecycle Management**: No coordinated startup/shutdown
4. **Constructor Explosion**: Services accumulated many constructor parameters (ARCH-001)
5. **Tight Coupling**: Services directly instantiated their dependencies

## Decision

Implement a centralized Dependency Injection (DI) Container pattern in both services:

### Python (AI Orchestrator)

Created `src/container.py` with a `Container` dataclass:

```python
@dataclass
class Container:
    _settings: Settings | None = None
    _llm_client: LLMClient | None = None
    _context_manager: ContextManager | None = None
    _rag_pipeline: RAGPipeline | None = None
    _command_router: CommandRouter | None = None

    async def get_llm_client(self) -> LLMClient:
        if self._llm_client is None:
            self._llm_client = LLMClient(settings=self.settings)
        return self._llm_client

    async def initialize(self) -> None:
        """Eagerly create and verify all services."""
        ...

    async def shutdown(self) -> None:
        """Close all services in reverse order."""
        ...
```

FastAPI dependency functions:
```python
async def get_llm_client() -> LLMClient:
    return await get_container().get_llm_client()

# Usage in routes
@router.post("/chat")
async def chat(llm: LLMClient = Depends(get_llm_client)):
    ...
```

### TypeScript (MCP Gateway)

Split CommandService into focused components (ARCH-001):
- `CommandProcessor`: Core AI command processing
- `FileContextLoader`: File context fetching
- `ResponseBuilder`: Response construction

Used Fastify's DI with `awilix`:
```typescript
container.register({
  commandProcessor: asClass(CommandProcessor).singleton(),
  fileContextLoader: asClass(FileContextLoader).singleton(),
  responseBuilder: asClass(ResponseBuilder).singleton(),
});
```

## Consequences

### Positive

1. **Testability**: Services can be easily mocked by injecting test doubles
2. **Explicit Dependencies**: All dependencies are visible in constructor/container
3. **Lifecycle Control**: Coordinated startup/shutdown with health checks
4. **Single Responsibility**: Split large services into focused components
5. **Framework Integration**: Works with FastAPI/Fastify dependency injection
6. **Backward Compatibility**: Old global functions emit deprecation warnings

### Negative

1. **Learning Curve**: Team needs to understand DI pattern
2. **Indirection**: Extra layer between consumer and service
3. **Migration Effort**: Existing code needs gradual migration
4. **Container Overhead**: Slight memory overhead for container bookkeeping

### Migration Path

1. Old global functions marked with `DeprecationWarning`
2. New code uses container imports: `from src.container import get_llm_client`
3. Gradual migration of existing consumers
4. Remove deprecated functions in next major version

## Files Changed

**Python (CQ-001):**
- `ai-orchestrator/src/container.py` (new)
- `ai-orchestrator/src/main.py`
- `ai-orchestrator/src/api/routes.py`
- `ai-orchestrator/src/core/context.py`
- `ai-orchestrator/src/core/llm.py`
- `ai-orchestrator/src/core/rag.py`
- `ai-orchestrator/src/core/router.py`

**TypeScript (ARCH-001):**
- `mcp-gateway/src/services/command-processor.ts` (new)
- `mcp-gateway/src/services/file-context-loader.ts` (new)
- `mcp-gateway/src/services/response-builder.ts` (new)
- `mcp-gateway/src/container.ts`

## References

- Issue: CQ-001 (Python), ARCH-001 (TypeScript)
- Pattern: [Dependency Injection](https://martinfowler.com/articles/injection.html)
- FastAPI: [Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)
