/**
 * Feature Flags API Routes
 *
 * Provides endpoints for managing and checking feature flags
 *
 * GET  /api/v1/features - List all features
 * GET  /api/v1/features/:flagName - Get feature flag
 * POST /api/v1/features/:flagName/check - Check if enabled for user
 * PUT  /api/v1/features/:flagName - Update feature flag (admin)
 * POST /api/v1/features - Create new flag (admin)
 * DELETE /api/v1/features/:flagName - Delete flag (admin)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getFeatureFlagsManager, FeatureFlag, RolloutResult } from '../infrastructure/feature-flags.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorization.js';

// Validation schemas
const checkFeatureSchema = z.object({
  userId: z.string().uuid(),
});

const updateFeatureSchema = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
  exceptionUsers: z.array(z.string().uuid()).optional(),
  blockedUsers: z.array(z.string().uuid()).optional(),
});

const createFeatureSchema = z.object({
  name: z.string().min(1).max(255),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.number().min(0).max(100).default(0),
  description: z.string().optional(),
});

export async function registerFeatureFlagsRoutes(fastify: FastifyInstance) {
  const featureFlags = getFeatureFlagsManager();

  /**
   * List all feature flags
   */
  fastify.get<{ Reply: Record<string, FeatureFlag> }>(
    '/api/v1/features',
    {
      onRequest: [requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const flags = featureFlags.getAllFlags();
        reply.send(flags);
      } catch (error) {
        reply.internalServerError('Failed to list feature flags');
      }
    }
  );

  /**
   * Get single feature flag
   */
  fastify.get<{ Params: { flagName: string } }>(
    '/api/v1/features/:flagName',
    {
      onRequest: [requireAuth],
    },
    async (request: FastifyRequest<{ Params: { flagName: string } }>, reply: FastifyReply) => {
      try {
        const { flagName } = request.params;
        const flag = featureFlags.getFlag(flagName);

        if (!flag) {
          return reply.notFound(`Feature flag not found: ${flagName}`);
        }

        reply.send(flag);
      } catch (error) {
        reply.internalServerError('Failed to get feature flag');
      }
    }
  );

  /**
   * Check if feature is enabled for user
   */
  fastify.post<{ Params: { flagName: string }; Body: z.infer<typeof checkFeatureSchema> }>(
    '/api/v1/features/:flagName/check',
    {
      onRequest: [requireAuth],
      schema: {
        body: checkFeatureSchema,
      },
    },
    async (
      request: FastifyRequest<{ Params: { flagName: string }; Body: z.infer<typeof checkFeatureSchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagName } = request.params;
        const { userId } = request.body;

        const result = featureFlags.isFeatureEnabled(flagName, userId);

        reply.send({
          flagName,
          userId,
          ...result,
        });
      } catch (error) {
        reply.internalServerError('Failed to check feature flag');
      }
    }
  );

  /**
   * Update feature flag (admin only)
   */
  fastify.put<{ Params: { flagName: string }; Body: z.infer<typeof updateFeatureSchema> }>(
    '/api/v1/features/:flagName',
    {
      onRequest: [requireAuth, requireRole(['admin', 'eigenaar'])],
      schema: {
        body: updateFeatureSchema,
      },
    },
    async (
      request: FastifyRequest<{ Params: { flagName: string }; Body: z.infer<typeof updateFeatureSchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagName } = request.params;
        const updates = request.body;

        const flag = await featureFlags.updateFlag(flagName, updates);

        reply.send({
          message: `Feature flag ${flagName} updated`,
          flag,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.notFound(error.message);
        }
        reply.internalServerError('Failed to update feature flag');
      }
    }
  );

  /**
   * Set feature rollout percentage
   */
  fastify.post<{
    Params: { flagName: string };
    Body: { rolloutPercentage: number };
  }>(
    '/api/v1/features/:flagName/rollout',
    {
      onRequest: [requireAuth, requireRole(['admin', 'eigenaar'])],
    },
    async (
      request: FastifyRequest<{
        Params: { flagName: string };
        Body: { rolloutPercentage: number };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagName } = request.params;
        const { rolloutPercentage } = request.body as { rolloutPercentage: number };

        if (rolloutPercentage < 0 || rolloutPercentage > 100) {
          return reply.badRequest('Rollout percentage must be between 0 and 100');
        }

        const flag = await featureFlags.setRolloutPercentage(flagName, rolloutPercentage);

        reply.send({
          message: `Rollout percentage for ${flagName} set to ${rolloutPercentage}%`,
          flag,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.notFound(error.message);
        }
        reply.internalServerError('Failed to set rollout percentage');
      }
    }
  );

  /**
   * Add exception user (always enabled)
   */
  fastify.post<{ Params: { flagName: string }; Body: { userId: string } }>(
    '/api/v1/features/:flagName/exceptions',
    {
      onRequest: [requireAuth, requireRole(['admin', 'eigenaar'])],
    },
    async (
      request: FastifyRequest<{ Params: { flagName: string }; Body: { userId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagName } = request.params;
        const { userId } = request.body;

        const flag = await featureFlags.addExceptionUser(flagName, userId);

        reply.send({
          message: `User ${userId} added to exceptions for ${flagName}`,
          flag,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.notFound(error.message);
        }
        reply.internalServerError('Failed to add exception user');
      }
    }
  );

  /**
   * Remove exception user
   */
  fastify.delete<{ Params: { flagName: string; userId: string } }>(
    '/api/v1/features/:flagName/exceptions/:userId',
    {
      onRequest: [requireAuth, requireRole(['admin', 'eigenaar'])],
    },
    async (
      request: FastifyRequest<{ Params: { flagName: string; userId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagName, userId } = request.params;

        const flag = await featureFlags.removeExceptionUser(flagName, userId);

        reply.send({
          message: `User ${userId} removed from exceptions for ${flagName}`,
          flag,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.notFound(error.message);
        }
        reply.internalServerError('Failed to remove exception user');
      }
    }
  );

  /**
   * Block user
   */
  fastify.post<{ Params: { flagName: string }; Body: { userId: string } }>(
    '/api/v1/features/:flagName/block',
    {
      onRequest: [requireAuth, requireRole(['admin', 'eigenaar'])],
    },
    async (
      request: FastifyRequest<{ Params: { flagName: string }; Body: { userId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagName } = request.params;
        const { userId } = request.body;

        const flag = await featureFlags.blockUser(flagName, userId);

        reply.send({
          message: `User ${userId} blocked from ${flagName}`,
          flag,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.notFound(error.message);
        }
        reply.internalServerError('Failed to block user');
      }
    }
  );

  /**
   * Unblock user
   */
  fastify.delete<{ Params: { flagName: string; userId: string } }>(
    '/api/v1/features/:flagName/blocked/:userId',
    {
      onRequest: [requireAuth, requireRole(['admin', 'eigenaar'])],
    },
    async (
      request: FastifyRequest<{ Params: { flagName: string; userId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagName, userId } = request.params;

        const flag = await featureFlags.unblockUser(flagName, userId);

        reply.send({
          message: `User ${userId} unblocked from ${flagName}`,
          flag,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.notFound(error.message);
        }
        reply.internalServerError('Failed to unblock user');
      }
    }
  );

  /**
   * Create new feature flag (admin only)
   */
  fastify.post<{ Body: z.infer<typeof createFeatureSchema> }>(
    '/api/v1/features',
    {
      onRequest: [requireAuth, requireRole(['admin', 'eigenaar'])],
      schema: {
        body: createFeatureSchema,
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof createFeatureSchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const flag = await featureFlags.createFlag(request.body);

        reply.status(201).send({
          message: `Feature flag ${flag.name} created`,
          flag,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          return reply.conflict(error.message);
        }
        reply.internalServerError('Failed to create feature flag');
      }
    }
  );

  /**
   * Delete feature flag (admin only)
   */
  fastify.delete<{ Params: { flagName: string } }>(
    '/api/v1/features/:flagName',
    {
      onRequest: [requireAuth, requireRole(['admin', 'eigenaar'])],
    },
    async (
      request: FastifyRequest<{ Params: { flagName: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { flagName } = request.params;

        await featureFlags.deleteFlag(flagName);

        reply.send({
          message: `Feature flag ${flagName} deleted`,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.notFound(error.message);
        }
        reply.internalServerError('Failed to delete feature flag');
      }
    }
  );
}
