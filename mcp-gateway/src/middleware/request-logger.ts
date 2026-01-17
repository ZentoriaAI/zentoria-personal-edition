/**
 * Request Logging Middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger, createRequestLogger } from '../infrastructure/logger.js';

/**
 * Log incoming requests and response times
 */
export async function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = process.hrtime.bigint();

  // Create request-scoped logger
  const reqLogger = createRequestLogger(request.id, request.user?.id);

  // Log request start
  reqLogger.info(
    {
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    },
    'Request started'
  );

  // Add response hook to log completion
  reply.then(
    () => {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;

      const logData = {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: request.user?.id,
      };

      if (reply.statusCode >= 500) {
        reqLogger.error(logData, 'Request completed with error');
      } else if (reply.statusCode >= 400) {
        reqLogger.warn(logData, 'Request completed with client error');
      } else {
        reqLogger.info(logData, 'Request completed');
      }
    },
    (err) => {
      reqLogger.error({ err }, 'Request failed');
    }
  );
}

/**
 * Sensitive headers to redact in logs
 */
export const REDACTED_HEADERS = [
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
];

/**
 * Redact sensitive values from object
 */
export function redactSensitive<T extends Record<string, unknown>>(
  obj: T,
  keysToRedact: string[]
): T {
  const result = { ...obj };
  for (const key of keysToRedact) {
    if (key in result) {
      (result as Record<string, unknown>)[key] = '[REDACTED]';
    }
  }
  return result;
}
