/**
 * OpenTelemetry Instrumentation - ARCH-003
 *
 * Distributed tracing and metrics collection for the MCP Gateway.
 *
 * IMPORTANT: This module must be imported BEFORE any other imports
 * to ensure proper auto-instrumentation of libraries.
 *
 * Supports:
 * - OTLP HTTP/gRPC exporters (Jaeger, Zipkin, Grafana Tempo)
 * - Auto-instrumentation for Fastify, HTTP, Redis, PostgreSQL
 * - Custom spans for business operations
 * - Resource attributes for service identification
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { trace, context, SpanStatusCode, Span, SpanKind } from '@opentelemetry/api';

// ============================================================================
// Configuration
// ============================================================================

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'mcp-gateway';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '1.0.0';
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const OTEL_ENABLED = process.env.OTEL_ENABLED !== 'false';
const OTEL_EXPORTER_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
const OTEL_TRACES_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || `${OTEL_EXPORTER_ENDPOINT}/v1/traces`;
const OTEL_METRICS_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || `${OTEL_EXPORTER_ENDPOINT}/v1/metrics`;
const METRICS_EXPORT_INTERVAL_MS = parseInt(process.env.OTEL_METRICS_EXPORT_INTERVAL_MS || '60000', 10);

// ============================================================================
// SDK Instance
// ============================================================================

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK
 * Must be called before any other imports in the application
 */
export function initTelemetry(): NodeSDK | null {
  if (!OTEL_ENABLED) {
    console.log('[Telemetry] OpenTelemetry disabled via OTEL_ENABLED=false');
    return null;
  }

  if (sdk) {
    console.warn('[Telemetry] SDK already initialized');
    return sdk;
  }

  console.log(`[Telemetry] Initializing OpenTelemetry for ${SERVICE_NAME}...`);
  console.log(`[Telemetry] Exporter endpoint: ${OTEL_EXPORTER_ENDPOINT}`);

  // Resource attributes identify this service
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
    'service.instance.id': process.env.HOSTNAME || crypto.randomUUID(),
    'service.namespace': 'zentoria',
  });

  // Trace exporter (OTLP HTTP)
  const traceExporter = new OTLPTraceExporter({
    url: OTEL_TRACES_ENDPOINT,
    headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
  });

  // Metric exporter (OTLP HTTP)
  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: OTEL_METRICS_ENDPOINT,
      headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
    }),
    exportIntervalMillis: METRICS_EXPORT_INTERVAL_MS,
  });

  // Create SDK with auto-instrumentation
  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      // HTTP instrumentation (outgoing requests)
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => {
          // Ignore health check requests to reduce noise
          const url = request.url || '';
          return url.includes('/health') || url.includes('/metrics');
        },
        requestHook: (span, request) => {
          // Add custom attributes to HTTP spans
          span.setAttribute('http.request.headers.x-request-id', request.headers?.['x-request-id'] || '');
        },
      }),

      // Fastify instrumentation
      new FastifyInstrumentation({
        requestHook: (span, info) => {
          // Add route-specific attributes
          span.setAttribute('fastify.route', info.request.routeOptions?.url || 'unknown');
          span.setAttribute('fastify.request_id', info.request.id);
        },
      }),

      // Redis instrumentation
      new IORedisInstrumentation({
        dbStatementSerializer: (cmdName, cmdArgs) => {
          // Sanitize sensitive data in Redis commands
          if (cmdName.toLowerCase() === 'auth') {
            return 'AUTH [REDACTED]';
          }
          if (cmdName.toLowerCase() === 'set' && cmdArgs.length > 1) {
            return `SET ${cmdArgs[0]} [VALUE]`;
          }
          return `${cmdName} ${cmdArgs.slice(0, 2).join(' ')}${cmdArgs.length > 2 ? '...' : ''}`;
        },
      }),

      // PostgreSQL instrumentation
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
        addSqlCommenterCommentToQueries: true,
      }),

      // Auto-instrumentations for common libraries
      getNodeAutoInstrumentations({
        // Disable file system instrumentation (too noisy)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Disable DNS instrumentation (too noisy)
        '@opentelemetry/instrumentation-dns': { enabled: false },
        // Already configured above
        '@opentelemetry/instrumentation-http': { enabled: false },
        '@opentelemetry/instrumentation-fastify': { enabled: false },
        '@opentelemetry/instrumentation-ioredis': { enabled: false },
        '@opentelemetry/instrumentation-pg': { enabled: false },
      }),
    ],
  });

  // Start the SDK
  sdk.start();
  console.log('[Telemetry] OpenTelemetry SDK started');

  // Register shutdown handler
  process.on('SIGTERM', () => shutdownTelemetry());

  return sdk;
}

/**
 * Shutdown OpenTelemetry SDK gracefully
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;

  console.log('[Telemetry] Shutting down OpenTelemetry SDK...');
  try {
    await sdk.shutdown();
    console.log('[Telemetry] SDK shut down successfully');
  } catch (err) {
    console.error('[Telemetry] Error shutting down SDK:', err);
  }
  sdk = null;
}

// ============================================================================
// Tracing Helpers
// ============================================================================

/**
 * Get the tracer for creating custom spans
 */
export function getTracer(name: string = SERVICE_NAME) {
  return trace.getTracer(name, SERVICE_VERSION);
}

/**
 * Create a child span for a synchronous operation
 */
export function withSpan<T>(
  name: string,
  fn: (span: Span) => T,
  options?: {
    attributes?: Record<string, string | number | boolean>;
    kind?: SpanKind;
  }
): T {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, { kind: options?.kind }, (span) => {
    if (options?.attributes) {
      span.setAttributes(options.attributes);
    }
    try {
      const result = fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}

/**
 * Create a child span for an async operation
 */
export async function withSpanAsync<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    attributes?: Record<string, string | number | boolean>;
    kind?: SpanKind;
  }
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, { kind: options?.kind }, async (span) => {
    if (options?.attributes) {
      span.setAttributes(options.attributes);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}

/**
 * Add event to current span
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set attribute on current span
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Set error on current span
 */
export function setSpanError(error: Error): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
  }
}

/**
 * Get current trace ID for logging correlation
 */
export function getTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (span) {
    return span.spanContext().traceId;
  }
  return undefined;
}

/**
 * Get current span ID for logging correlation
 */
export function getSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  if (span) {
    return span.spanContext().spanId;
  }
  return undefined;
}

// ============================================================================
// Business Operation Spans
// ============================================================================

/**
 * Create span for AI command processing
 */
export function traceAiCommand<T>(
  command: string,
  userId: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpanAsync('ai.command.process', fn, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'ai.command': command.substring(0, 100), // Truncate for safety
      'user.id': userId,
      'ai.provider': 'ollama',
    },
  });
}

/**
 * Create span for file operations
 */
export function traceFileOperation<T>(
  operation: 'upload' | 'download' | 'delete' | 'list',
  fileId: string | undefined,
  userId: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpanAsync(`file.${operation}`, fn, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'file.operation': operation,
      'file.id': fileId || 'unknown',
      'user.id': userId,
    },
  });
}

/**
 * Create span for authentication operations
 */
export function traceAuth<T>(
  operation: 'validate' | 'refresh' | 'logout',
  userId: string | undefined,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpanAsync(`auth.${operation}`, fn, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'auth.operation': operation,
      'user.id': userId || 'anonymous',
    },
  });
}

/**
 * Create span for workflow execution
 */
export function traceWorkflow<T>(
  workflowId: string,
  workflowName: string,
  userId: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpanAsync('workflow.execute', fn, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'workflow.id': workflowId,
      'workflow.name': workflowName,
      'user.id': userId,
    },
  });
}

/**
 * Create span for external service calls
 */
export function traceExternalCall<T>(
  service: string,
  operation: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpanAsync(`external.${service}.${operation}`, fn, {
    kind: SpanKind.CLIENT,
    attributes: {
      'external.service': service,
      'external.operation': operation,
    },
  });
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse OTEL headers from environment variable
 * Format: "key1=value1,key2=value2"
 */
function parseHeaders(headersEnv?: string): Record<string, string> {
  if (!headersEnv) return {};

  const headers: Record<string, string> = {};
  const pairs = headersEnv.split(',');

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join('=').trim();
    }
  }

  return headers;
}

// Re-export OpenTelemetry API for convenience
export { trace, context, SpanStatusCode, SpanKind };
export type { Span };
