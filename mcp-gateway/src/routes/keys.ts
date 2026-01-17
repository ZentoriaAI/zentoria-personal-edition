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
  const redis = fastify.container.resolve('redis');

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
