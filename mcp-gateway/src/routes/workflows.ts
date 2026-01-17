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
   * POST /api/v1/mcp/workflow
   * Trigger a workflow
   */
  fastify.post('/workflow', {
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
   * GET /api/v1/mcp/workflow/:executionId
   * Get workflow execution status
   */
  fastify.get('/workflow/:executionId', {
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
   * POST /api/v1/mcp/workflow/callback
   * Webhook callback from n8n for workflow completion
   * (Called by n8n, uses a shared secret for auth)
   */
  fastify.post('/workflow/callback', {
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
