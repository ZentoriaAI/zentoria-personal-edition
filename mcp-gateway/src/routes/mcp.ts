/**
 * MCP Command Routes
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CommandRequestSchema } from '../services/command-processor.js'; // ARCH-001
import { SendEmailSchema } from '../services/email.service.js';
import { requireScope } from '../middleware/auth.js';
import { Errors } from '../middleware/error-handler.js';

export const mcpRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const commandService = fastify.container.resolve('commandService');
  const emailService = fastify.container.resolve('emailService');

  /**
   * POST /api/v1/mcp/command
   * Process an AI command
   */
  fastify.post('/command', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['MCP'],
      summary: 'Process AI command',
      description: 'Sends a command to the AI Orchestrator for processing',
      body: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string', minLength: 1, maxLength: 32000 },
          sessionId: { type: 'string', pattern: '^sess_[a-zA-Z0-9]+$' },
          context: {
            type: 'object',
            properties: {
              files: { type: 'array', items: { type: 'string' }, maxItems: 10 },
              previousMessages: { type: 'integer', minimum: 0, maximum: 50 },
              systemPrompt: { type: 'string', maxLength: 4000 },
              variables: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
          options: {
            type: 'object',
            properties: {
              model: {
                type: 'string',
                enum: ['claude-3-5-sonnet', 'claude-3-opus', 'gpt-4-turbo', 'gpt-4o'],
              },
              maxTokens: { type: 'integer', minimum: 1, maximum: 16384 },
              temperature: { type: 'number', minimum: 0, maximum: 2 },
              stream: { type: 'boolean' },
              async: { type: 'boolean' },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            model: { type: 'string' },
            usage: {
              type: 'object',
              properties: {
                promptTokens: { type: 'integer' },
                completionTokens: { type: 'integer' },
                totalTokens: { type: 'integer' },
              },
            },
            sessionId: { type: 'string' },
            finishReason: { type: 'string', enum: ['stop', 'max_tokens', 'error'] },
          },
        },
        202: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: ['queued', 'processing'] },
            estimatedCompletionMs: { type: 'integer' },
            pollingUrl: { type: 'string' },
            websocketUrl: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const body = CommandRequestSchema.parse(request.body);

    // Check if async processing is requested
    if (body.options?.async) {
      const result = await commandService.queueCommand(request.user.id, body);
      return reply.status(202).send(result);
    }

    // Synchronous processing
    const result = await commandService.processCommand(request.user.id, body);
    return reply.send(result);
  });

  /**
   * GET /api/v1/mcp/command/:commandId
   * Get async command status
   */
  fastify.get('/command/:commandId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['MCP'],
      summary: 'Get command status',
      description: 'Returns the status of an async command',
      params: {
        type: 'object',
        required: ['commandId'],
        properties: {
          commandId: { type: 'string', pattern: '^cmd_[a-zA-Z0-9]+$' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['queued', 'processing', 'completed', 'failed'] },
            result: { type: 'object' },
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    const { commandId } = request.params as { commandId: string };
    return commandService.getCommandStatus(commandId);
  });

  /**
   * POST /api/v1/mcp/email
   * Send an email
   */
  fastify.post('/email', {
    preHandler: requireScope('email.send'),
    schema: {
      tags: ['MCP'],
      summary: 'Send email',
      description: 'Sends an email through the configured SMTP service',
      body: {
        type: 'object',
        required: ['to', 'subject'],
        properties: {
          to: {
            oneOf: [
              { type: 'string', format: 'email' },
              { type: 'array', items: { type: 'string', format: 'email' }, maxItems: 50 },
            ],
          },
          cc: { type: 'array', items: { type: 'string', format: 'email' }, maxItems: 50 },
          bcc: { type: 'array', items: { type: 'string', format: 'email' }, maxItems: 50 },
          subject: { type: 'string', minLength: 1, maxLength: 998 },
          body: { type: 'string', maxLength: 1000000 },
          htmlBody: { type: 'string', maxLength: 2000000 },
          attachments: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          replyTo: { type: 'string', format: 'email' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: ['sent', 'queued', 'failed'] },
            messageId: { type: 'string' },
            sentAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const body = SendEmailSchema.parse(request.body);
    return emailService.send(request.user.id, body);
  });
};
