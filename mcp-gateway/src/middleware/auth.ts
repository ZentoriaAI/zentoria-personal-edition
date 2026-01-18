/**
 * Authentication Middleware
 *
 * Supports:
 * - JWT Bearer tokens (from Auth Service 409)
 * - API Keys (X-API-Key header)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AwilixContainer } from 'awilix';
import { logger } from '../infrastructure/logger.js';
import { ContainerCradle } from '../container.js';

/** Routes that don't require authentication */
const PUBLIC_ROUTES = [
  '/api/v1/health',
  '/api/v1/health/ready',
  '/api/v1/auth/refresh', // SEC-010: Refresh token endpoint is public
  '/docs',
  '/docs/',
  '/docs/json',
  '/docs/yaml',
];

/** Check if route is public */
function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => url === route || url.startsWith(route + '/')
  );
}

export function authMiddleware(container: AwilixContainer<ContainerCradle>) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Skip auth for public routes
    if (isPublicRoute(request.url)) {
      return;
    }

    const authHeader = request.headers.authorization;
    const apiKey = request.headers['x-api-key'] as string | undefined;

    // Try API key first
    if (apiKey) {
      const user = await validateApiKey(container, apiKey);
      if (user) {
        request.user = user;
        return;
      }
      return reply.status(401).send({
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid or expired API key',
          requestId: request.id,
        },
      });
    }

    // Try JWT Bearer token
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const user = await validateJwt(request);
        if (user) {
          request.user = user;
          return;
        }
      } catch (err) {
        logger.debug({ err }, 'JWT validation failed');
      }
      return reply.status(401).send({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired authentication token',
          requestId: request.id,
        },
      });
    }

    // No authentication provided
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide a Bearer token or API key.',
        requestId: request.id,
      },
    });
  };
}

/**
 * Validate API key and return user info
 */
async function validateApiKey(
  container: AwilixContainer<ContainerCradle>,
  apiKey: string
): Promise<FastifyRequest['user'] | null> {
  const { apiKeyService, auditRepository } = container.cradle;

  try {
    const keyData = await apiKeyService.validateKey(apiKey);
    if (!keyData) {
      return null;
    }

    // Log API key usage
    await auditRepository.log({
      action: 'api_key_used',
      userId: keyData.userId,
      metadata: {
        keyId: keyData.id,
        keyName: keyData.name,
      },
    });

    return {
      id: keyData.userId,
      email: keyData.userEmail,
      scopes: keyData.scopes,
      apiKeyId: keyData.id,
    };
  } catch (err) {
    logger.error({ err }, 'API key validation error');
    return null;
  }
}

/**
 * Validate JWT token and return user info
 * Uses request.jwtVerify() which reads token from Authorization header
 */
async function validateJwt(
  request: FastifyRequest
): Promise<FastifyRequest['user'] | null> {
  try {
    const decoded = await request.jwtVerify<{
      sub: string;
      email: string;
      scopes?: string[];
    }>();

    return {
      id: decoded.sub,
      email: decoded.email,
      scopes: decoded.scopes || ['ai.chat', 'files.read', 'files.write'],
    };
  } catch {
    return null;
  }
}

/**
 * Scope checking middleware factory
 *
 * Usage: server.addHook('preHandler', requireScope('files.write'))
 */
export function requireScope(...requiredScopes: string[]) {
  return async function checkScope(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          requestId: request.id,
        },
      });
    }

    const userScopes = request.user.scopes || [];

    // Admin scope grants all permissions
    if (userScopes.includes('admin')) {
      return;
    }

    const hasAllScopes = requiredScopes.every((scope) =>
      userScopes.includes(scope)
    );

    if (!hasAllScopes) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient permissions. Required scopes: ${requiredScopes.join(', ')}`,
          requestId: request.id,
        },
      });
    }
  };
}
