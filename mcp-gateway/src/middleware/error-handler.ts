/**
 * Global Error Handler
 *
 * Provides consistent error responses and logging
 */

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../infrastructure/logger.js';

/**
 * Application-specific error class
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * Common error factory functions - CQ-003 Standardized Error Messages
 */
export const Errors = {
  // ============================================================================
  // Client Errors (4xx)
  // ============================================================================

  badRequest: (message: string, details?: Record<string, unknown>) =>
    new AppError('BAD_REQUEST', message, 400, details),

  unauthorized: (message = 'Authentication required') =>
    new AppError('UNAUTHORIZED', message, 401),

  forbidden: (message = 'Insufficient permissions') =>
    new AppError('FORBIDDEN', message, 403),

  notFound: (resource: string, id?: string) =>
    new AppError(
      'NOT_FOUND',
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      404
    ),

  conflict: (message: string) =>
    new AppError('CONFLICT', message, 409),

  rateLimited: (retryAfter: number) =>
    new AppError('RATE_LIMITED', `Too many requests. Retry after ${retryAfter} seconds.`, 429, {
      retryAfter,
    }),

  validation: (errors: ValidationErrorItem[]) =>
    new AppError('VALIDATION_ERROR', 'Request validation failed', 400, {
      validationErrors: errors,
    }),

  // ============================================================================
  // Server Errors (5xx)
  // ============================================================================

  internal: (message = 'An unexpected error occurred') =>
    new AppError('INTERNAL_ERROR', message, 500),

  serviceUnavailable: (service: string) =>
    new AppError('SERVICE_UNAVAILABLE', `${service} is currently unavailable`, 503),

  // ============================================================================
  // Service-Specific Errors - CQ-003
  // ============================================================================

  // AI Orchestrator errors
  aiServiceError: (statusCode: number, detail?: string) =>
    new AppError(
      'AI_SERVICE_ERROR',
      detail ? `AI service error (${statusCode}): ${detail}` : `AI service error (${statusCode})`,
      502,
      { upstreamStatus: statusCode }
    ),

  aiServiceTimeout: () =>
    new AppError('AI_SERVICE_TIMEOUT', 'AI processing timed out', 504),

  // Vault errors
  vaultError: (statusCode: number) =>
    new AppError('VAULT_ERROR', `Vault service error (${statusCode})`, 502, {
      upstreamStatus: statusCode,
    }),

  vaultUnavailable: () =>
    new AppError('VAULT_UNAVAILABLE', 'Secrets vault is unavailable', 503),

  // n8n Workflow errors
  workflowError: (statusCode: number, detail?: string) =>
    new AppError(
      'WORKFLOW_ERROR',
      detail ? `Workflow error (${statusCode}): ${detail}` : `Workflow execution failed (${statusCode})`,
      502,
      { upstreamStatus: statusCode }
    ),

  workflowNotFound: (workflowId: string) =>
    new AppError('WORKFLOW_NOT_FOUND', `Workflow '${workflowId}' not found`, 404),

  // Redis errors
  redisConnectionError: (detail?: string) =>
    new AppError(
      'REDIS_CONNECTION_ERROR',
      detail || 'Failed to connect to Redis',
      503
    ),

  redisTlsError: (detail: string) =>
    new AppError('REDIS_TLS_ERROR', `Redis TLS configuration error: ${detail}`, 500),

  // Encryption errors
  encryptionError: (detail?: string) =>
    new AppError('ENCRYPTION_ERROR', detail || 'Encryption operation failed', 500),

  decryptionError: (detail?: string) =>
    new AppError('DECRYPTION_ERROR', detail || 'Decryption failed - data may be corrupted', 500),

  // File errors
  fileUploadError: (detail?: string) =>
    new AppError('FILE_UPLOAD_ERROR', detail || 'File upload failed', 400),

  fileTooLarge: (maxSizeMB: number) =>
    new AppError('FILE_TOO_LARGE', `File exceeds maximum size of ${maxSizeMB}MB`, 413),

  invalidFileType: (mimeType: string) =>
    new AppError('INVALID_FILE_TYPE', `File type '${mimeType}' is not allowed`, 415),

  fileMagicByteMismatch: () =>
    new AppError('FILE_VALIDATION_ERROR', 'File content does not match declared type', 400),

  // Input sanitization errors
  suspiciousInput: (riskLevel: string) =>
    new AppError(
      'SUSPICIOUS_INPUT',
      'Input contains potentially malicious content',
      400,
      { riskLevel }
    ),

  // API Key errors
  invalidApiKey: () =>
    new AppError('INVALID_API_KEY', 'Invalid or expired API key', 401),

  apiKeyRevoked: () =>
    new AppError('API_KEY_REVOKED', 'API key has been revoked', 401),

  insufficientScopes: (required: string[]) =>
    new AppError('INSUFFICIENT_SCOPES', 'API key lacks required permissions', 403, {
      requiredScopes: required,
    }),

  // Session errors
  sessionExpired: () =>
    new AppError('SESSION_EXPIRED', 'Session has expired', 401),

  sessionInvalid: () =>
    new AppError('SESSION_INVALID', 'Invalid session', 401),

  // Database errors
  databaseError: (detail?: string) =>
    new AppError('DATABASE_ERROR', detail || 'Database operation failed', 500),

  uniqueConstraintViolation: (field: string) =>
    new AppError('DUPLICATE_ENTRY', `${field} already exists`, 409),
};

interface ValidationErrorItem {
  field: string;
  message: string;
  code?: string;
}

/**
 * Format Zod validation errors
 */
function formatZodError(error: ZodError): ValidationErrorItem[] {
  return error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
    code: e.code,
  }));
}

/**
 * Global error handler for Fastify
 */
export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id;

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationErrors = formatZodError(error);
    logger.warn({ requestId, validationErrors }, 'Validation error');

    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        validationErrors,
        requestId,
      },
    });
    return;
  }

  // Handle application errors
  if (error instanceof AppError) {
    const logLevel = error.statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel](
      { requestId, code: error.code, statusCode: error.statusCode },
      error.message
    );

    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
        requestId,
      },
    });
    return;
  }

  // Handle Fastify errors (validation, rate limit, etc.)
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    const statusCode = error.statusCode;
    const code = error.code || 'FASTIFY_ERROR';

    if (statusCode >= 500) {
      logger.error({ requestId, err: error }, 'Server error');
    } else {
      logger.warn({ requestId, code, statusCode }, error.message);
    }

    reply.status(statusCode).send({
      error: {
        code,
        message: error.message,
        requestId,
      },
    });
    return;
  }

  // Handle unknown errors
  logger.error({ requestId, err: error }, 'Unhandled error');

  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error.message,
      requestId,
    },
  });
}
