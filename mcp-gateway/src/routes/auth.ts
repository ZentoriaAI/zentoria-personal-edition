/**
 * Authentication Routes
 *
 * SEC-010: JWT refresh token endpoints
 *
 * Endpoints:
 * - POST /api/v1/auth/refresh - Exchange refresh token for new token pair
 * - POST /api/v1/auth/logout - Revoke current refresh token
 * - POST /api/v1/auth/logout-all - Revoke all user refresh tokens
 * - GET /api/v1/auth/sessions - List active sessions (token count)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ContainerCradle } from '../container.js';

interface RefreshBody {
  refreshToken: string;
}

interface LogoutBody {
  refreshToken?: string; // Optional: specific token to revoke
}

export async function authRoutes(server: FastifyInstance): Promise<void> {
  const { refreshTokenService, auditRepository } = server.container.cradle as ContainerCradle;

  /**
   * POST /api/v1/auth/refresh
   *
   * Exchange a valid refresh token for a new access token and refresh token.
   * The old refresh token is invalidated (token rotation).
   */
  server.post<{ Body: RefreshBody }>(
    '/refresh',
    {
      schema: {
        description: 'Exchange refresh token for new token pair',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string', description: 'Current refresh token' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              tokenType: { type: 'string', enum: ['Bearer'] },
              expiresIn: { type: 'number', description: 'Access token expiry in seconds' },
              refreshExpiresIn: { type: 'number', description: 'Refresh token expiry in seconds' },
            },
          },
          401: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
      const { refreshToken } = request.body;

      if (!refreshToken) {
        return reply.status(400).send({
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'Refresh token is required',
            requestId: request.id,
          },
        });
      }

      const tokenPair = await refreshTokenService.rotateRefreshToken(refreshToken, server);

      if (!tokenPair) {
        return reply.status(401).send({
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid or expired refresh token',
            requestId: request.id,
          },
        });
      }

      return reply.send({
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        tokenType: 'Bearer',
        expiresIn: tokenPair.expiresIn,
        refreshExpiresIn: tokenPair.refreshExpiresIn,
      });
    }
  );

  /**
   * POST /api/v1/auth/logout
   *
   * Revoke the specified refresh token (or token from body).
   * Requires authentication.
   */
  server.post<{ Body: LogoutBody }>(
    '/logout',
    {
      schema: {
        description: 'Revoke refresh token',
        tags: ['auth'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        body: {
          type: 'object',
          properties: {
            refreshToken: { type: 'string', description: 'Refresh token to revoke' },
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
        },
      },
    },
    async (request: FastifyRequest<{ Body: LogoutBody }>, reply: FastifyReply) => {
      // Auth required for this endpoint
      if (!request.user) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            requestId: request.id,
          },
        });
      }

      const { refreshToken } = request.body || {};

      if (refreshToken) {
        const revoked = await refreshTokenService.revokeToken(refreshToken);
        if (!revoked) {
          return reply.status(404).send({
            error: {
              code: 'TOKEN_NOT_FOUND',
              message: 'Refresh token not found or already revoked',
              requestId: request.id,
            },
          });
        }
      }

      // Log logout
      auditRepository.logAsync({
        action: 'user_logout',
        userId: request.user.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    }
  );

  /**
   * POST /api/v1/auth/logout-all
   *
   * Revoke all refresh tokens for the current user (logout from all devices).
   * Requires authentication.
   */
  server.post(
    '/logout-all',
    {
      schema: {
        description: 'Revoke all refresh tokens for user',
        tags: ['auth'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              revokedCount: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            requestId: request.id,
          },
        });
      }

      const count = await refreshTokenService.revokeAllUserTokens(request.user.id);

      return reply.send({
        success: true,
        message: `Logged out from all devices`,
        revokedCount: count,
      });
    }
  );

  /**
   * GET /api/v1/auth/sessions
   *
   * Get count of active sessions (refresh tokens) for current user.
   * Requires authentication.
   */
  server.get(
    '/sessions',
    {
      schema: {
        description: 'Get active session count',
        tags: ['auth'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              activeSessions: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            requestId: request.id,
          },
        });
      }

      const count = await refreshTokenService.getUserTokenCount(request.user.id);

      return reply.send({
        activeSessions: count,
      });
    }
  );

  /**
   * POST /api/v1/auth/token
   *
   * Generate initial token pair (login).
   * This is typically called after user authentication via external service.
   * Requires existing JWT (from auth service) or API key with admin scope.
   */
  server.post(
    '/token',
    {
      schema: {
        description: 'Generate token pair for authenticated user',
        tags: ['auth'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              tokenType: { type: 'string', enum: ['Bearer'] },
              expiresIn: { type: 'number' },
              refreshExpiresIn: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            requestId: request.id,
          },
        });
      }

      // Generate refresh token
      const { token: refreshToken } = await refreshTokenService.createRefreshToken(
        request.user.id,
        request.user.email,
        request.user.scopes
      );

      // Generate access token
      const accessToken = server.jwt.sign({
        sub: request.user.id,
        email: request.user.email,
        scopes: request.user.scopes,
      });

      const accessExpiresIn = parseInt(process.env.JWT_EXPIRES_IN?.replace(/[^\d]/g, '') || '3600', 10);
      const refreshExpiresIn = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7', 10) * 24 * 60 * 60;

      // Log token generation
      auditRepository.logAsync({
        action: 'token_pair_generated',
        userId: request.user.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: accessExpiresIn,
        refreshExpiresIn,
      });
    }
  );
}
