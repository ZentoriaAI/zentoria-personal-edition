# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) documenting significant architectural decisions made in the Zentoria Personal Edition project.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision, including the context, the decision itself, and its consequences. ADRs provide a historical record of why certain decisions were made.

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](./ADR-001-dependency-injection-container.md) | Dependency Injection Container Pattern | Accepted | 2026-01-17 |
| [ADR-002](./ADR-002-opentelemetry-distributed-tracing.md) | OpenTelemetry for Distributed Tracing | Accepted | 2026-01-17 |
| [ADR-003](./ADR-003-redis-pubsub-domain-events.md) | Redis Pub/Sub for Domain Events | Accepted | 2026-01-17 |
| [ADR-004](./ADR-004-jwt-refresh-token-rotation.md) | JWT Refresh Token with Rotation | Accepted | 2026-01-17 |
| [ADR-005](./ADR-005-audit-log-encryption.md) | AES-256-GCM Audit Log Encryption | Accepted | 2026-01-17 |
| [ADR-006](./ADR-006-redis-tls-support.md) | Redis TLS/SSL Support | Accepted | 2026-01-17 |
| [ADR-007](./ADR-007-input-sanitization-prompt-injection.md) | Input Sanitization for Prompt Injection | Accepted | 2026-01-17 |

## ADR Template

```markdown
# ADR-XXX: Title

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult to do because of this change?
```

## Contributing

When making significant architectural decisions:

1. Create a new ADR using the template above
2. Number it sequentially (ADR-XXX)
3. Get team review before marking as "Accepted"
4. Update this README with the new entry

## References

- [Michael Nygard's ADR article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR GitHub organization](https://adr.github.io/)
