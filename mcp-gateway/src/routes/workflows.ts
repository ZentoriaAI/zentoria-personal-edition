/**
 * Workflow Routes
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { TriggerWorkflowSchema } from '../services/workflow.service.js';
import { requireScope } from '../middleware/auth.js';
import { Errors } from '../middleware/error-handler.js';

export const workflowRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const workflowService = fastify.container.resolve('workflowService');

  /**
   * GET /api/v1/workflows
   * List all workflows
   */
  fastify.get('/', {
    preHandler: requireScope('workflows.read'),
    schema: {
      tags: ['Workflows'],
      summary: 'List all workflows',
      description: 'Returns a list of all available workflows',
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  active: { type: 'boolean' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    // Return mock workflows since n8n is not yet deployed
    // This will be replaced with actual n8n API calls when n8n is set up
    const mockWorkflows = [
      {
        id: 'wf_1',
        name: 'Daily Backup',
        description: 'Automated daily backup workflow',
        active: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'wf_2',
        name: 'File Sync',
        description: 'Sync files to cloud storage',
        active: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    return reply.send({ data: mockWorkflows });
  });

  /**
   * GET /api/v1/workflows/executions
   * List workflow executions
   */
  fastify.get('/executions', {
    preHandler: requireScope('workflows.read'),
    schema: {
      tags: ['Workflows'],
      summary: 'List workflow executions',
      description: 'Returns a list of workflow executions',
      querystring: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
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
                      workflowId: { type: 'string' },
                      status: { type: 'string' },
                      startedAt: { type: 'string' },
                      finishedAt: { type: 'string' },
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
    // Return empty executions since n8n is not yet deployed
    return reply.send({
      data: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      },
    });
  });

  /**
   * POST /api/v1/workflows/trigger
   * Trigger a workflow (renamed from /workflow)
   */
  fastify.post('/trigger', {
    preHandler: requireScope('workflows.trigger'),
    schema: {
      tags: ['Workflows'],
      summary: 'Trigger n8n workflow',
      description: 'Triggers a workflow in n8n with the provided payload',
      body: {
        type: 'object',
        required: ['workflowId'],
        properties: {
          workflowId: { type: 'string' },
          payload: { type: 'object', additionalProperties: true },
          async: { type: 'boolean', default: true },
          webhookPath: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            executionId: { type: 'string' },
            status: { type: 'string', enum: ['success', 'error'] },
            data: { type: 'object' },
            startedAt: { type: 'string' },
            finishedAt: { type: 'string' },
          },
        },
        202: {
          type: 'object',
          properties: {
            executionId: { type: 'string' },
            status: { type: 'string', enum: ['queued', 'running'] },
            statusUrl: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const body = TriggerWorkflowSchema.parse(request.body);

    // Async by default
    if (body.async !== false) {
      const result = await workflowService.triggerAsync(request.user.id, body);
      return reply.status(202).send(result);
    }

    // Synchronous execution
    const result = await workflowService.triggerSync(request.user.id, body);
    return reply.send(result);
  });

  /**
   * GET /api/v1/workflows/:executionId
   * Get workflow execution status
   */
  fastify.get('/:executionId', {
    preHandler: requireScope('workflows.read'),
    schema: {
      tags: ['Workflows'],
      summary: 'Get workflow execution status',
      description: 'Returns the status of a workflow execution',
      params: {
        type: 'object',
        required: ['executionId'],
        properties: {
          executionId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            executionId: { type: 'string' },
            workflowId: { type: 'string' },
            status: {
              type: 'string',
              enum: ['queued', 'running', 'success', 'error', 'cancelled'],
            },
            progress: { type: 'number', minimum: 0, maximum: 100 },
            currentNode: { type: 'string' },
            data: { type: 'object' },
            error: { type: 'string' },
            startedAt: { type: 'string' },
            finishedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    const { executionId } = request.params as { executionId: string };
    return workflowService.getStatus(executionId);
  });

  /**
   * POST /api/v1/workflows/callback
   * Webhook callback from n8n for workflow completion
   * (Called by n8n, uses a shared secret for auth)
   */
  fastify.post('/callback', {
    schema: {
      tags: ['Workflows'],
      summary: 'Workflow completion callback',
      description: 'Called by n8n when a workflow completes',
      body: {
        type: 'object',
        required: ['executionId', 'status'],
        properties: {
          executionId: { type: 'string' },
          status: { type: 'string', enum: ['success', 'error'] },
          data: { type: 'object' },
          error: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            received: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    // Verify callback secret
    const callbackSecret = process.env.N8N_CALLBACK_SECRET;
    const providedSecret = request.headers['x-callback-secret'];

    if (callbackSecret && providedSecret !== callbackSecret) {
      throw Errors.unauthorized('Invalid callback secret');
    }

    const { executionId, status, data, error } = request.body as {
      executionId: string;
      status: 'success' | 'error';
      data?: Record<string, unknown>;
      error?: string;
    };

    await workflowService.handleCallback(executionId, status, data, error);
    return reply.send({ received: true });
  });
};
