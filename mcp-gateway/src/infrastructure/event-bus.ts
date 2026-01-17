/**
 * Domain Event Bus - ARCH-002
 *
 * Redis-based pub/sub for domain events, enabling:
 * - Decoupled communication between services
 * - Event-driven architecture patterns
 * - Cross-cutting concerns (logging, analytics, notifications)
 *
 * Event naming convention: domain.entity.action
 * Examples: file.uploaded, command.processed, session.created
 */

import type { Redis } from 'ioredis';
import { logger } from './logger.js';

// ============================================================================
// Event Types
// ============================================================================

export type DomainEventType =
  // File events
  | 'file.uploaded'
  | 'file.deleted'
  | 'file.accessed'
  // Command events
  | 'command.submitted'
  | 'command.processed'
  | 'command.failed'
  // Session events
  | 'session.created'
  | 'session.expired'
  | 'session.terminated'
  // Auth events
  | 'auth.login'
  | 'auth.logout'
  | 'auth.token_refreshed'
  | 'auth.failed_attempt'
  // API Key events
  | 'apikey.created'
  | 'apikey.revoked'
  | 'apikey.used'
  // Workflow events
  | 'workflow.triggered'
  | 'workflow.completed'
  | 'workflow.failed'
  // System events
  | 'system.health_degraded'
  | 'system.circuit_opened'
  | 'system.circuit_closed';

export interface DomainEvent<T = unknown> {
  /** Unique event ID */
  id: string;
  /** Event type following domain.entity.action pattern */
  type: DomainEventType;
  /** Event payload data */
  data: T;
  /** ISO timestamp */
  timestamp: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** User ID if applicable */
  userId?: string;
  /** Source service/component */
  source: string;
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface FileUploadedEvent {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  userId: string;
}

export interface FileDeletedEvent {
  fileId: string;
  fileName: string;
  userId: string;
}

export interface CommandProcessedEvent {
  commandId: string;
  command: string;
  userId: string;
  processingTimeMs: number;
  success: boolean;
}

export interface SessionCreatedEvent {
  sessionId: string;
  userId: string;
  ipAddress?: string;
}

export interface AuthLoginEvent {
  userId: string;
  email: string;
  method: 'jwt' | 'apikey';
  ipAddress?: string;
}

export interface ApiKeyCreatedEvent {
  keyId: string;
  keyName: string;
  userId: string;
  scopes: string[];
}

export interface WorkflowTriggeredEvent {
  workflowId: string;
  name: string;
  userId: string;
  input?: Record<string, unknown>;
}

// ============================================================================
// Event Handler Type
// ============================================================================

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => void | Promise<void>;

// ============================================================================
// Event Bus Implementation
// ============================================================================

const EVENT_CHANNEL_PREFIX = 'zentoria:events:';
const ALL_EVENTS_CHANNEL = 'zentoria:events:*';

export class EventBus {
  private readonly publisher: Redis;
  private subscriber: Redis | null = null;
  private readonly handlers: Map<string, Set<EventHandler>> = new Map();
  private readonly source: string;
  private isSubscribed = false;

  constructor(redis: Redis, source: string = 'mcp-gateway') {
    this.publisher = redis;
    this.source = source;
  }

  /**
   * Publish a domain event
   */
  async publish<T>(
    type: DomainEventType,
    data: T,
    options?: { correlationId?: string; userId?: string }
  ): Promise<void> {
    const event: DomainEvent<T> = {
      id: crypto.randomUUID(),
      type,
      data,
      timestamp: new Date().toISOString(),
      correlationId: options?.correlationId,
      userId: options?.userId,
      source: this.source,
    };

    const channel = EVENT_CHANNEL_PREFIX + type;
    const message = JSON.stringify(event);

    try {
      await this.publisher.publish(channel, message);
      logger.debug({ eventType: type, eventId: event.id }, 'Domain event published');
    } catch (err) {
      logger.error({ err, eventType: type }, 'Failed to publish domain event');
      // Don't throw - event publishing should not break the main flow
    }
  }

  /**
   * Subscribe to specific event types
   */
  async subscribe<T>(
    eventTypes: DomainEventType | DomainEventType[],
    handler: EventHandler<T>
  ): Promise<void> {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    for (const type of types) {
      if (!this.handlers.has(type)) {
        this.handlers.set(type, new Set());
      }
      this.handlers.get(type)!.add(handler as EventHandler);
    }

    // Initialize subscriber if not already done
    if (!this.isSubscribed) {
      await this.initializeSubscriber();
    }

    // Subscribe to channels
    const channels = types.map((t) => EVENT_CHANNEL_PREFIX + t);
    await this.subscriber!.subscribe(...channels);

    logger.info({ eventTypes: types }, 'Subscribed to domain events');
  }

  /**
   * Subscribe to all domain events
   */
  async subscribeAll(handler: EventHandler): Promise<void> {
    if (!this.handlers.has('*')) {
      this.handlers.set('*', new Set());
    }
    this.handlers.get('*')!.add(handler);

    if (!this.isSubscribed) {
      await this.initializeSubscriber();
    }

    await this.subscriber!.psubscribe(ALL_EVENTS_CHANNEL);
    logger.info('Subscribed to all domain events');
  }

  /**
   * Unsubscribe from event types
   */
  async unsubscribe(eventTypes: DomainEventType | DomainEventType[]): Promise<void> {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    for (const type of types) {
      this.handlers.delete(type);
    }

    if (this.subscriber) {
      const channels = types.map((t) => EVENT_CHANNEL_PREFIX + t);
      await this.subscriber.unsubscribe(...channels);
    }
  }

  /**
   * Initialize the subscriber connection
   */
  private async initializeSubscriber(): Promise<void> {
    if (this.isSubscribed) return;

    // Create a duplicate connection for subscribing
    // (Redis requires separate connections for pub and sub)
    this.subscriber = this.publisher.duplicate();

    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('error', (err) => {
      logger.error({ err }, 'Event subscriber error');
    });

    this.isSubscribed = true;
    logger.info('Event bus subscriber initialized');
  }

  /**
   * Handle incoming message
   */
  private handleMessage(channel: string, message: string): void {
    try {
      const event = JSON.parse(message) as DomainEvent;
      const eventType = channel.replace(EVENT_CHANNEL_PREFIX, '');

      // Call type-specific handlers
      const typeHandlers = this.handlers.get(eventType);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          this.safeExecuteHandler(handler, event);
        }
      }

      // Call wildcard handlers
      const wildcardHandlers = this.handlers.get('*');
      if (wildcardHandlers) {
        for (const handler of wildcardHandlers) {
          this.safeExecuteHandler(handler, event);
        }
      }
    } catch (err) {
      logger.error({ err, channel }, 'Failed to process domain event');
    }
  }

  /**
   * Safely execute handler without breaking other handlers
   */
  private safeExecuteHandler(handler: EventHandler, event: DomainEvent): void {
    try {
      const result = handler(event);
      if (result instanceof Promise) {
        result.catch((err) => {
          logger.error({ err, eventType: event.type }, 'Event handler error');
        });
      }
    } catch (err) {
      logger.error({ err, eventType: event.type }, 'Event handler error');
    }
  }

  /**
   * Shutdown the event bus
   */
  async shutdown(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    this.handlers.clear();
    this.isSubscribed = false;
    logger.info('Event bus shut down');
  }
}

/**
 * Create event bus instance
 */
export function createEventBus(redis: Redis): EventBus {
  return new EventBus(redis);
}
