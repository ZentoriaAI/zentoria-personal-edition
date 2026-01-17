# Changelog

All notable changes to the Zentoria Personal Edition project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Phase 6 documentation improvements in progress

---

## [1.3.0] - 2026-01-17

### Added

#### Security Enhancements
- **SEC-006**: Input sanitization for prompt injection protection
  - 12+ detection patterns for injection attempts
  - Configurable strict mode (`STRICT_INPUT_VALIDATION`)
  - Audit logging for suspicious inputs
  - Risk level classification (low/medium/high)

- **SEC-008**: Redis TLS/SSL support
  - TLS encryption for Redis connections (Node.js and Python)
  - Mutual TLS (mTLS) support for high-security environments
  - Auto-detection for `rediss://` URLs
  - Configurable certificate verification

- **SEC-009**: Audit log encryption
  - AES-256-GCM encryption for sensitive fields
  - Encrypted: metadata, ipAddress, userAgent
  - Backward compatible with legacy unencrypted data
  - Key rotation support planned

- **SEC-010**: JWT refresh token with rotation
  - 7-day refresh tokens with automatic rotation
  - Token family tracking for theft detection
  - Session management endpoints
  - Redis-backed token storage

#### Architecture Improvements
- **ARCH-001**: Split CommandService into focused components
  - `CommandProcessor`: Core AI command processing
  - `FileContextLoader`: File context fetching with batching
  - `ResponseBuilder`: Response construction

- **ARCH-002**: Domain events via Redis Pub/Sub
  - Event bus infrastructure for cross-service communication
  - Events: file.*, command.*, session.*, auth.*, apikey.*, workflow.*, system.*
  - Typed event handlers with correlation IDs

- **ARCH-003**: OpenTelemetry distributed tracing
  - Full SDK integration with auto-instrumentation
  - Fastify, HTTP, Redis, PostgreSQL instrumentation
  - Log-trace correlation via Pino mixin
  - OTLP exporters for traces and metrics

- **CQ-001**: Python DI container pattern
  - Centralized dependency injection container
  - FastAPI `Depends()` integration
  - Proper lifecycle management (initialize/shutdown)
  - Deprecation warnings on old global singletons

#### Performance Optimizations
- **PERF-001**: Secondary Redis index for user sessions
  - O(1) session lookup vs O(n) SCAN pattern
  - `user:sessions:{userId}` SET index

- **PERF-002**: Batch file context fetching
  - `Promise.all()` for parallel file fetches
  - Eliminates N+1 query pattern

- **PERF-003**: Singleton WebSocket manager
  - Single connection shared across components
  - Reference counting for lifecycle
  - `useSyncExternalStore` for React 18

- **PERF-005**: Redis caching for API keys
  - 5-minute TTL for validated keys
  - Cache invalidation on revocation

- **PERF-008**: Fire-and-forget audit logging
  - Async audit writes don't block requests
  - Batched writes for efficiency

- **PERF-009**: Configurable bulkhead limits
  - Environment variable configuration
  - Per-service bulkhead settings (AI, Auth, n8n)

- **PERF-010**: Composite database index
  - `@@index([userId, createdAt])` on CommandHistory

- **PERF-011**: Zustand selector pattern fix
  - Proper selectors prevent unnecessary re-renders
  - `useShallow` hooks for shallow comparison

#### Documentation
- Architecture Decision Records (ADRs) for major decisions
- 7 ADRs covering DI, tracing, events, auth, encryption, TLS, sanitization

### Changed
- Moved all secrets from docker-compose to `.env` file (SEC-001)
- API key comparison now uses timing-safe comparison (SEC-005)
- File uploads validated with magic byte checking (SEC-004)
- Centralized configuration constants (CQ-004)

### Fixed
- API key rate limiting (5/hour per user) (SEC-003)
- Memory issue with full file buffering (PERF-004)

### Security
- All P0 and P1 security issues resolved
- OWASP Top 10 vulnerabilities addressed
- Input validation and sanitization throughout

---

## [1.2.0] - 2026-01-15

### Added

#### Testing Infrastructure
- **TEST-001**: Backend unit tests (411 tests)
  - Command service: 68 tests
  - File service: 53 tests
  - Session service: 42 tests
  - Audit service: 35 tests
  - API key service: 46 tests
  - Auth service: 38 tests

- **TEST-002**: Integration tests (52 tests)
  - Full API route coverage
  - Authentication flow testing
  - Error handling verification

- **TEST-003**: End-to-end tests (64 tests)
  - Playwright specs for all major flows
  - Navigation, chat, files, dashboard
  - Theme and accessibility testing

- **TEST-004** to **TEST-009**: Frontend tests (~423 tests)
  - Store tests (chat, file, app)
  - Hook tests (WebSocket, API)
  - Component tests (UI, layout)

### Changed
- Test coverage increased from 6% to ~80%
- Vitest configured for both backend and frontend
- Playwright configured for E2E testing

---

## [1.1.0] - 2026-01-10

### Added
- Initial container deployment (LXC 440-444)
- PostgreSQL with pgvector (LXC 404)
- Redis cache and pub/sub (LXC 410)
- Qdrant vector database (LXC 443)
- NGINX reverse proxy (LXC 442)
- AI Orchestrator with Ollama (LXC 444)
- Next.js frontend (LXC 440)
- Fastify MCP Gateway (LXC 441)

### Infrastructure
- NGINX routing configured
- Health check endpoints
- API key authentication
- File upload handling
- WebSocket support

---

## [1.0.0] - 2026-01-01

### Added
- Initial project setup
- Architecture planning
- Container specifications
- Database schema design
- API design documentation

---

## Issue Tracking

### Completed Issues by Version

| Version | P0 | P1 | P2 | P3 | Total |
|---------|----|----|----|----|-------|
| 1.3.0   | 0  | 15 | 12 | 0  | 27    |
| 1.2.0   | 3  | 0  | 4  | 0  | 7     |
| 1.1.0   | 5  | 0  | 0  | 0  | 5     |

### Remaining Issues

- **P2**: DOC-001 to DOC-007 (Documentation)
- **P3**: CQ-003, CQ-004, CQ-005 (Code quality)
- **P3**: ARCH-004, ARCH-005 (Architecture)

---

## Contributors

- **Zentoria Team** - Architecture and implementation
- **Claude Code** - AI-assisted development

---

[Unreleased]: https://github.com/zentoria/zentoria-mcp/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/zentoria/zentoria-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/zentoria/zentoria-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/zentoria/zentoria-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/zentoria/zentoria-mcp/releases/tag/v1.0.0
