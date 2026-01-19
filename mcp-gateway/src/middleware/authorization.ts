/**
 * Authorization Middleware
 *
 * Provides role-based access control for protected routes
 */

import { FastifyRequest, FastifyReply } from 'fastify';

/** Valid roles in the system */
export type Role = 'admin' | 'eigenaar' | 'manager' | 'user';

/**
 * Require authentication middleware
 * Use this as a standalone auth check when no specific role is needed
 *
 * Usage: fastify.addHook('onRequest', requireAuth)
 */
export async function requireAuth(
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
}

/**
 * Role-based access control middleware factory
 *
 * Usage: server.addHook('onRequest', requireRole(['admin', 'eigenaar']))
 *
 * @param allowedRoles - Array of roles that have access to this route
 */
export function requireRole(allowedRoles: Role[]) {
  return async function checkRole(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // First check authentication
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

    // Admin scope grants all permissions (including role-based checks)
    if (userScopes.includes('admin')) {
      return;
    }

    // Check if user has any of the allowed roles in their scopes
    // Scopes can contain role names (e.g., 'eigenaar', 'manager')
    const hasAllowedRole = allowedRoles.some(
      (role) =>
        userScopes.includes(role) ||
        (role === 'admin' && userScopes.includes('admin'))
    );

    if (!hasAllowedRole) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
          requestId: request.id,
        },
      });
    }
  };
}

/**
 * Check if user has a specific role
 *
 * @param user - The user object from request
 * @param role - The role to check for
 */
export function hasRole(user: FastifyRequest['user'], role: Role): boolean {
  if (!user) return false;
  const scopes = user.scopes || [];
  return scopes.includes('admin') || scopes.includes(role);
}

/**
 * Check if user is admin
 */
export function isAdmin(user: FastifyRequest['user']): boolean {
  if (!user) return false;
  const scopes = user.scopes || [];
  return scopes.includes('admin') || scopes.includes('eigenaar');
}
