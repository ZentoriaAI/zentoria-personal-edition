/**
 * Structured Logger using Pino
 *
 * ARCH-003: Includes OpenTelemetry trace context for log-trace correlation
 */

import pino from 'pino';
import { trace } from '@opentelemetry/api';

const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';

export const logger = pino({
  level: logLevel,
  base: {
    service: 'mcp-gateway',
    version: process.env.npm_package_version || '1.0.0',
    env: nodeEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  // ARCH-003: Add mixin to inject trace context into every log entry
  mixin() {
    const span = trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        traceFlags: spanContext.traceFlags,
      };
    }
    return {};
  },
  ...(nodeEnv === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname,service,version,env,traceFlags',
          },
        },
      }
    : {}),
});

/**
 * Create a child logger with additional context
 */
export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

/**
 * Request-scoped logger factory
 */
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({
    requestId,
    ...(userId && { userId }),
  });
}
