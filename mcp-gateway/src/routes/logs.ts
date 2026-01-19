/**
 * Logs Routes
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireScope } from '../middleware/auth.js';

export const logsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /api/v1/logs
   * List logs with filtering
   */
  fastify.get('/', {
    preHandler: requireScope('logs.read'),
    schema: {
      tags: ['Logs'],
      summary: 'List logs',
      description: 'Returns a paginated list of logs with optional filtering',
      querystring: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
          source: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          search: { type: 'string' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 50 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' },
                      level: { type: 'string' },
                      source: { type: 'string' },
                      message: { type: 'string' },
                      metadata: { type: 'object' },
                    },
                  },
                },
                total: { type: 'integer' },
                page: { type: 'integer' },
                pageSize: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { page = 1, pageSize = 50 } = request.query as { page?: number; pageSize?: number };

    // Return mock logs since logging infrastructure is not yet fully deployed
    // In production, this would query Loki or another log aggregation system
    const mockLogs = [
      {
        id: 'log_1',
        timestamp: new Date().toISOString(),
        level: 'info',
        source: 'api-gateway',
        message: 'Request processed successfully',
        metadata: { path: '/api/v1/health', method: 'GET' },
      },
      {
        id: 'log_2',
        timestamp: new Date(Date.now() - 60000).toISOString(),
        level: 'info',
        source: 'ai-orchestrator',
        message: 'AI chat request completed',
        metadata: { model: 'llama3.2:3b', tokens: 150 },
      },
      {
        id: 'log_3',
        timestamp: new Date(Date.now() - 120000).toISOString(),
        level: 'warn',
        source: 'api-gateway',
        message: 'Rate limit approaching threshold',
        metadata: { userId: 'user_1', remaining: 5 },
      },
    ];

    return reply.send({
      data: {
        items: mockLogs,
        total: mockLogs.length,
        page,
        pageSize,
        totalPages: 1,
      },
    });
  });

  /**
   * DELETE /api/v1/logs
   * Clear logs before a certain date
   */
  fastify.delete('/', {
    preHandler: requireScope('logs.delete'),
    schema: {
      tags: ['Logs'],
      summary: 'Clear logs',
      description: 'Clears logs before the specified date',
      querystring: {
        type: 'object',
        properties: {
          before: { type: 'string', format: 'date-time' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                deleted: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    // Mock response since logging infrastructure is not yet deployed
    return reply.send({
      data: {
        deleted: 0,
      },
    });
  });
};
