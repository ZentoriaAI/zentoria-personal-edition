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
   * GET /api/v1/health/metrics
   * System metrics for dashboard
   */
  fastify.get('/health/metrics', {
    schema: {
      tags: ['Health'],
      summary: 'System metrics',
      description: 'Returns system metrics for dashboard display',
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                cpu: {
                  type: 'object',
                  properties: {
                    usage: { type: 'number' },
                    cores: { type: 'integer' },
                  },
                },
                memory: {
                  type: 'object',
                  properties: {
                    used: { type: 'integer' },
                    total: { type: 'integer' },
                    percentage: { type: 'number' },
                  },
                },
                disk: {
                  type: 'object',
                  properties: {
                    used: { type: 'integer' },
                    total: { type: 'integer' },
                    percentage: { type: 'number' },
                  },
                },
                network: {
                  type: 'object',
                  properties: {
                    bytesIn: { type: 'integer' },
                    bytesOut: { type: 'integer' },
                  },
                },
                requests: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    perMinute: { type: 'number' },
                  },
                },
                uptime: { type: 'integer' },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    // Return mock metrics - in production this would gather real system stats
    const metrics = {
      cpu: {
        usage: Math.random() * 30 + 10, // 10-40%
        cores: 4,
      },
      memory: {
        used: Math.floor(Math.random() * 4000000000) + 2000000000, // 2-6 GB
        total: 8000000000, // 8 GB
        percentage: Math.random() * 40 + 30, // 30-70%
      },
      disk: {
        used: Math.floor(Math.random() * 100000000000) + 50000000000, // 50-150 GB
        total: 500000000000, // 500 GB
        percentage: Math.random() * 20 + 10, // 10-30%
      },
      network: {
        bytesIn: Math.floor(Math.random() * 1000000000),
        bytesOut: Math.floor(Math.random() * 500000000),
      },
      requests: {
        total: Math.floor(Math.random() * 10000) + 1000,
        perMinute: Math.random() * 50 + 10,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    return reply.send({ data: metrics });
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
