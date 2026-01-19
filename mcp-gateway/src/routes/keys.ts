/**
 * API Key Management Routes
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateApiKeySchema } from '../services/api-key.service.js';
import { requireScope } from '../middleware/auth.js';
import { Errors } from '../middleware/error-handler.js';
import { checkRateLimit, RateLimitConfigs } from '../infrastructure/rate-limiter.js';

export const keyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const apiKeyService = fastify.container.resolve('apiKeyService');
  const apiKeyRepository = fastify.container.resolve('apiKeyRepository');
  const emailService = fastify.container.resolve('emailService');
  const redis = fastify.container.resolve('redis');
  const logger = fastify.container.resolve('logger');

  /**
   * POST /api/v1/mcp/forgot-key
   * Request a new API key via email (public endpoint)
   */
  fastify.post('/forgot-key', {
    schema: {
      tags: ['Auth'],
      summary: 'Request new API key via email',
      description: 'Sends a new API key to the specified email address. Rate limited to 3 requests per hour per email.',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        429: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                retryAfterMs: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body as { email: string };
    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: 3 requests per hour per email
    const rateLimitKey = `forgot-key:${normalizedEmail}`;
    const rateLimitResult = await checkRateLimit(
      redis,
      rateLimitKey,
      'forgot-key',
      { limit: 3, windowMs: 3600000 } // 3 per hour
    );

    if (!rateLimitResult.allowed) {
      reply.header('X-RateLimit-Limit', rateLimitResult.limit.toString());
      reply.header('X-RateLimit-Remaining', '0');
      reply.header('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetMs / 1000).toString());
      reply.header('Retry-After', Math.ceil(rateLimitResult.resetMs / 1000).toString());

      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfterMs: rateLimitResult.resetMs,
        },
      });
    }

    // Look up existing user by email
    const existingKey = await apiKeyRepository.findByEmail(normalizedEmail);

    if (!existingKey) {
      // Don't reveal if email exists or not (security)
      logger.info({ email: normalizedEmail }, 'Forgot key request for unknown email');
      return reply.send({
        success: true,
        message: 'If an account exists with this email, a new API key has been sent.',
      });
    }

    // Generate new API key with standard scopes
    const newKey = await apiKeyService.createKey(
      existingKey.userId,
      normalizedEmail,
      {
        name: 'Recovery Key',
        scopes: ['files.read', 'files.write', 'ai.chat', 'keys.manage'],
        expiresIn: '90d', // 90 days
      }
    );

    // Send email with new key
    try {
      await emailService.send(existingKey.userId, {
        to: normalizedEmail,
        subject: 'Your New Zentoria API Key',
        body: `Hello,

You requested a new API key for Zentoria.

Your new API key is:
${newKey.key}

This key has the following permissions:
- Read and write files
- AI chat
- Manage API keys

The key will expire in 90 days.

IMPORTANT: Keep this key secure. Do not share it with anyone.

If you did not request this key, please contact support immediately.

Best regards,
Zentoria Team`,
        htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .key-box { background: #1f2937; color: #10b981; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 20px 0; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .scopes { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .scope-item { display: inline-block; background: #e5e7eb; padding: 5px 10px; margin: 5px; border-radius: 20px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔑 Your New API Key</h1>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>You requested a new API key for Zentoria. Here it is:</p>

      <div class="key-box">${newKey.key}</div>

      <div class="scopes">
        <strong>Permissions:</strong><br>
        <span class="scope-item">📁 Read & Write Files</span>
        <span class="scope-item">🤖 AI Chat</span>
        <span class="scope-item">🔑 Manage Keys</span>
      </div>

      <p><strong>Expires:</strong> ${newKey.expiresAt || 'In 90 days'}</p>

      <div class="warning">
        <strong>⚠️ Important:</strong> Keep this key secure. Do not share it with anyone. If you did not request this key, please contact support immediately.
      </div>

      <p>Best regards,<br>Zentoria Team</p>
    </div>
  </div>
</body>
</html>`,
      });

      logger.info({ email: normalizedEmail, keyId: newKey.id }, 'Recovery key sent via email');
    } catch (err) {
      logger.error({ err, email: normalizedEmail }, 'Failed to send recovery email');
      throw Errors.internal('Failed to send email. Please try again later.');
    }

    return reply.send({
      success: true,
      message: 'If an account exists with this email, a new API key has been sent.',
    });
  });

  /**
   * POST /api/v1/mcp/create-key
   * Create a new API key
   */
  fastify.post('/create-key', {
    preHandler: requireScope('keys.manage'),
    schema: {
      tags: ['Auth'],
      summary: 'Create API key',
      description: 'Creates a new API key with specified scopes. Rate limited to 5 keys per hour per user.',
      body: {
        type: 'object',
        required: ['name', 'scopes'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          scopes: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'files.read',
                'files.write',
                'files.delete',
                'ai.chat',
                'ai.complete',
                'workflows.trigger',
                'workflows.read',
                'email.send',
                'keys.manage',
                'admin',
              ],
            },
            minItems: 1,
          },
          expiresIn: {
            type: 'string',
            pattern: '^(\\d+)(d|w|m|y)$',
            description: 'Expiration period (e.g., "30d", "1y")',
          },
          rateLimit: {
            type: 'object',
            properties: {
              requestsPerMinute: { type: 'integer', minimum: 1, maximum: 1000 },
              requestsPerDay: { type: 'integer', minimum: 1, maximum: 100000 },
            },
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            key: { type: 'string', description: 'The API key (only shown once)' },
            name: { type: 'string' },
            scopes: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string' },
            expiresAt: { type: 'string' },
          },
        },
        429: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                retryAfterMs: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    // SEC-003: Rate limit API key creation (5 per hour per user)
    const rateLimitResult = await checkRateLimit(
      redis,
      request.user.id,
      'api-key-creation',
      RateLimitConfigs.apiKeyCreation
    );

    if (!rateLimitResult.allowed) {
      reply.header('X-RateLimit-Limit', rateLimitResult.limit.toString());
      reply.header('X-RateLimit-Remaining', '0');
      reply.header('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetMs / 1000).toString());
      reply.header('Retry-After', Math.ceil(rateLimitResult.resetMs / 1000).toString());

      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `API key creation rate limit exceeded. Maximum ${rateLimitResult.limit} keys per hour.`,
          retryAfterMs: rateLimitResult.resetMs,
        },
      });
    }

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', rateLimitResult.limit.toString());
    reply.header('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    reply.header('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetMs / 1000).toString());

    const body = CreateApiKeySchema.parse(request.body);

    // Check if user can create keys with admin scope
    if (body.scopes.includes('admin') && !request.user.scopes.includes('admin')) {
      throw Errors.forbidden('Only admins can create keys with admin scope');
    }

    const result = await apiKeyService.createKey(
      request.user.id,
      request.user.email,
      body
    );

    return reply.status(201).send(result);
  });

  /**
   * GET /api/v1/mcp/keys
   * List API keys
   */
  fastify.get('/keys', {
    preHandler: requireScope('keys.manage'),
    schema: {
      tags: ['Auth'],
      summary: 'List API keys',
      description: 'Returns all API keys for the authenticated user',
      response: {
        200: {
          type: 'object',
          properties: {
            keys: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  scopes: { type: 'array', items: { type: 'string' } },
                  prefix: { type: 'string' },
                  lastUsedAt: { type: 'string' },
                  createdAt: { type: 'string' },
                  expiresAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const keys = await apiKeyService.listKeys(request.user.id);
    return { keys };
  });

  /**
   * DELETE /api/v1/mcp/keys/:keyId
   * Revoke an API key
   */
  fastify.delete('/keys/:keyId', {
    preHandler: requireScope('keys.manage'),
    schema: {
      tags: ['Auth'],
      summary: 'Revoke API key',
      description: 'Permanently revokes an API key',
      params: {
        type: 'object',
        required: ['keyId'],
        properties: {
          keyId: { type: 'string', pattern: '^key_[a-zA-Z0-9]+$' },
        },
      },
      response: {
        204: { type: 'null' },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { keyId } = request.params as { keyId: string };
    await apiKeyService.revokeKey(request.user.id, keyId);
    return reply.status(204).send();
  });
};
