# ADR-003: Redis Pub/Sub for Domain Events

## Status
Accepted

## Date
2026-01-17

## Context

The MCP Gateway service needed a way to communicate state changes across different parts of the system:

1. **Audit logging**: Actions like file uploads, API key creation, authentication events
2. **Real-time updates**: Notify clients when files change or workflows complete
3. **Cross-service communication**: AI Orchestrator needs to know about file context changes
4. **Decoupling**: Services shouldn't directly call each other for notifications

### Requirements

- **At-least-once delivery**: Events should be delivered reliably
- **Low latency**: Real-time notifications for UI updates
- **Simple**: No need for event sourcing or complex messaging
- **Infrastructure reuse**: Use existing Redis instance

## Decision

Implement a domain event system using Redis Pub/Sub with a typed event bus.

### Event Categories

```typescript
type DomainEventType =
  // File events
  | 'file.uploaded'
  | 'file.deleted'
  | 'file.updated'
  // Command events
  | 'command.started'
  | 'command.completed'
  | 'command.failed'
  // Session events
  | 'session.created'
  | 'session.expired'
  // Auth events
  | 'auth.login'
  | 'auth.logout'
  | 'auth.failed'
  // API Key events
  | 'apikey.created'
  | 'apikey.revoked'
  // Workflow events
  | 'workflow.triggered'
  | 'workflow.completed'
  // System events
  | 'system.health.degraded'
  | 'system.health.restored';
```

### Event Bus Implementation

```typescript
// event-bus.ts
interface DomainEvent<T = unknown> {
  id: string;
  type: DomainEventType;
  timestamp: string;
  correlationId?: string;
  payload: T;
  metadata: {
    service: string;
    version: string;
    userId?: string;
  };
}

class EventBus {
  private redis: Redis;
  private subscriber: Redis;
  private handlers: Map<string, Set<EventHandler>>;

  async publish<T>(type: DomainEventType, payload: T): Promise<void> {
    const event: DomainEvent<T> = {
      id: generateId(),
      type,
      timestamp: new Date().toISOString(),
      payload,
      metadata: { service: 'mcp-gateway', version: '1.0.0' },
    };

    await this.redis.publish(`events:${type}`, JSON.stringify(event));
    logger.debug('Event published', { type, id: event.id });
  }

  subscribe(type: DomainEventType, handler: EventHandler): void {
    // Subscribe to Redis channel and invoke handler
  }
}
```

### Usage in Services

```typescript
// file.service.ts
async uploadFile(file: MultipartFile): Promise<FileRecord> {
  const record = await this.repository.create(file);

  // Publish domain event
  await this.eventBus.publish('file.uploaded', {
    fileId: record.id,
    filename: record.filename,
    size: record.size,
    uploadedBy: record.userId,
  });

  return record;
}
```

### Event Consumers

```typescript
// Audit consumer
eventBus.subscribe('file.uploaded', async (event) => {
  await auditRepository.log({
    action: 'file.upload',
    resourceId: event.payload.fileId,
    userId: event.payload.uploadedBy,
  });
});

// WebSocket consumer
eventBus.subscribe('file.uploaded', async (event) => {
  wsManager.broadcast('file:new', event.payload);
});
```

## Consequences

### Positive

1. **Decoupling**: Services don't directly depend on each other
2. **Extensibility**: Easy to add new event consumers
3. **Audit trail**: All events can be logged centrally
4. **Real-time updates**: WebSocket clients receive instant notifications
5. **Infrastructure reuse**: Uses existing Redis instance
6. **Type safety**: Full TypeScript typing for events

### Negative

1. **At-least-once semantics**: Consumers must handle duplicate events
2. **No persistence**: Events are lost if no subscriber is listening
3. **No replay**: Cannot replay past events (unlike event sourcing)
4. **Redis dependency**: System relies on Redis availability

### Future Improvements

For mission-critical events, consider:
- **Redis Streams**: For persistent, replayable events
- **Dead letter queue**: For failed event processing
- **Event store**: For full event sourcing if needed

## Files Changed

- `mcp-gateway/src/infrastructure/event-bus.ts` (new)
- `mcp-gateway/src/services/file.service.ts`
- `mcp-gateway/src/services/auth.service.ts`
- `mcp-gateway/src/services/api-key.service.ts`
- `mcp-gateway/src/container.ts`

## References

- Issue: ARCH-002
- [Redis Pub/Sub](https://redis.io/docs/manual/pubsub/)
- [Domain Events Pattern](https://docs.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation)
