/**
 * Health Check Routes
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const healthService = fastify.container.resolve('healthService');

  /**
   * GET /api/v1/health
   * Full health check with dependency status
   */
  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check endpoint',
      description: 'Returns service health status and dependency states',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string' },
            uptime: { type: 'integer' },
            dependencies: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['healthy', 'unhealthy', 'unknown'] },
                  latencyMs: { type: 'integer' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            dependencies: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const health = await healthService.getHealth();

    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    return reply.status(statusCode).send(health);
  });

  /**
   * GET /api/v1/health/ready
   * Kubernetes readiness probe
   */
  fastify.get('/health/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness check',
      description: 'Checks if all critical dependencies are ready',
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            checks: {
              type: 'object',
              additionalProperties: { type: 'boolean' },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            checks: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const readiness = await healthService.getReadiness();

    const statusCode = readiness.ready ? 200 : 503;
    return reply.status(statusCode).send(readiness);
  });

  /**
   * GET /api/v1/health/live
   * Kubernetes liveness probe (simple)
   */
  fastify.get('/health/live', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness check',
      description: 'Simple check that service is running',
      response: {
        200: {
          type: 'object',
          properties: {
            alive: { type: 'boolean' },
          },
        },
      },
    },
  }, async () => {
    return { alive: true };
  });
};
