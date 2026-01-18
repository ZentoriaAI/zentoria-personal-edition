/**
 * Chat Routes
 *
 * Handles chat sessions, messages, and streaming endpoints.
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  CreateSessionSchema,
  UpdateSessionSchema,
  SendMessageSchema,
  EditMessageSchema,
} from '../services/chat.service.js';
import { requireScope } from '../middleware/auth.js';
import { Errors } from '../middleware/error-handler.js';

export const chatRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const chatService = fastify.container.resolve('chatService');

  // ==========================================================================
  // Session Endpoints
  // ==========================================================================

  /**
   * GET /api/v1/chat/sessions
   * List chat sessions with pagination
   */
  fastify.get('/sessions', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'List chat sessions',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          folderId: { type: 'string' },
          isArchived: { type: 'boolean', default: false },
          search: { type: 'string' },
          sortBy: { type: 'string', enum: ['lastMessageAt', 'createdAt', 'title'] },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const query = request.query as Record<string, unknown>;

    const result = await chatService.getSessions(request.user.id, {
      page: query.page as number,
      pageSize: query.pageSize as number,
      folderId: query.folderId as string | undefined,
      isArchived: query.isArchived as boolean,
      search: query.search as string | undefined,
      sortBy: query.sortBy as 'lastMessageAt' | 'createdAt' | 'title' | undefined,
      sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
    });

    return reply.send(result);
  });

  /**
   * POST /api/v1/chat/sessions
   * Create a new chat session
   */
  fastify.post('/sessions', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Create chat session',
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          folderId: { type: 'string' },
          agentId: { type: 'string' },
          systemPrompt: { type: 'string', maxLength: 10000 },
          model: { type: 'string' },
          temperature: { type: 'number', minimum: 0, maximum: 2 },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const body = CreateSessionSchema.parse(request.body);
    const session = await chatService.createSession(request.user.id, body);

    return reply.status(201).send(session);
  });

  /**
   * GET /api/v1/chat/sessions/:sessionId
   * Get a single session
   */
  fastify.get('/sessions/:sessionId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Get chat session',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { sessionId } = request.params as { sessionId: string };
    const session = await chatService.getSession(request.user.id, sessionId);

    return reply.send(session);
  });

  /**
   * PATCH /api/v1/chat/sessions/:sessionId
   * Update a session
   */
  fastify.patch('/sessions/:sessionId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Update chat session',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          folderId: { type: ['string', 'null'] },
          agentId: { type: ['string', 'null'] },
          systemPrompt: { type: ['string', 'null'], maxLength: 10000 },
          model: { type: ['string', 'null'] },
          temperature: { type: ['number', 'null'], minimum: 0, maximum: 2 },
          isPinned: { type: 'boolean' },
          isArchived: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { sessionId } = request.params as { sessionId: string };
    const body = UpdateSessionSchema.parse(request.body);
    const session = await chatService.updateSession(request.user.id, sessionId, body);

    return reply.send(session);
  });

  /**
   * DELETE /api/v1/chat/sessions/:sessionId
   * Delete a session
   */
  fastify.delete('/sessions/:sessionId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Delete chat session',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { sessionId } = request.params as { sessionId: string };
    await chatService.deleteSession(request.user.id, sessionId);

    return reply.status(204).send();
  });

  /**
   * POST /api/v1/chat/sessions/:sessionId/duplicate
   * Duplicate a session
   */
  fastify.post('/sessions/:sessionId/duplicate', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Duplicate chat session',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          includeMessages: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as { includeMessages?: boolean };
    const session = await chatService.duplicateSession(
      request.user.id,
      sessionId,
      body.includeMessages
    );

    return reply.status(201).send(session);
  });

  // ==========================================================================
  // Message Endpoints
  // ==========================================================================

  /**
   * GET /api/v1/chat/sessions/:sessionId/messages
   * Get messages for a session
   */
  fastify.get('/sessions/:sessionId/messages', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Get session messages',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          cursor: { type: 'string' },
          direction: { type: 'string', enum: ['before', 'after'], default: 'before' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { sessionId } = request.params as { sessionId: string };
    const query = request.query as { limit?: number; cursor?: string; direction?: 'before' | 'after' };

    const result = await chatService.getMessages(request.user.id, sessionId, query);

    return reply.send(result);
  });

  /**
   * POST /api/v1/chat/sessions/:sessionId/messages
   * Send a message (sync)
   */
  fastify.post('/sessions/:sessionId/messages', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Send message',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 32000 },
          attachmentIds: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          parentId: { type: 'string' },
          stream: { type: 'boolean', default: true },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { sessionId } = request.params as { sessionId: string };
    const body = SendMessageSchema.parse(request.body);

    // If streaming is requested, use SSE
    if (body.stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      let isConnectionClosed = false;

      // Monitor for client disconnect to prevent memory leaks (BUG-005)
      request.raw.on('close', () => {
        isConnectionClosed = true;
      });

      try {
        for await (const chunk of chatService.streamMessage(request.user.id, sessionId, body)) {
          if (isConnectionClosed) break; // Stop if client disconnected
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      } catch (err) {
        if (!isConnectionClosed) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`);
        }
      }

      if (!isConnectionClosed) {
        reply.raw.end();
      }
      return;
    }

    // Sync response
    const result = await chatService.sendMessage(request.user.id, sessionId, body);
    return reply.send(result);
  });

  /**
   * PATCH /api/v1/chat/sessions/:sessionId/messages/:messageId
   * Edit a message
   */
  fastify.patch('/sessions/:sessionId/messages/:messageId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Edit message',
      params: {
        type: 'object',
        required: ['sessionId', 'messageId'],
        properties: {
          sessionId: { type: 'string' },
          messageId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 32000 },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { sessionId, messageId } = request.params as { sessionId: string; messageId: string };
    const body = EditMessageSchema.parse(request.body);

    const message = await chatService.editMessage(request.user.id, sessionId, messageId, body);

    return reply.send(message);
  });

  /**
   * DELETE /api/v1/chat/sessions/:sessionId/messages/:messageId
   * Delete a message
   */
  fastify.delete('/sessions/:sessionId/messages/:messageId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Delete message',
      params: {
        type: 'object',
        required: ['sessionId', 'messageId'],
        properties: {
          sessionId: { type: 'string' },
          messageId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { sessionId, messageId } = request.params as { sessionId: string; messageId: string };
    await chatService.deleteMessage(request.user.id, sessionId, messageId);

    return reply.status(204).send();
  });

  // ==========================================================================
  // Agent Endpoints
  // ==========================================================================

  /**
   * GET /api/v1/chat/agents
   * List available agents
   */
  fastify.get('/agents', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'List agents',
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const agents = await chatService.getAgents();
    return reply.send({ agents });
  });

  /**
   * GET /api/v1/chat/agents/:agentId
   * Get a single agent
   */
  fastify.get('/agents/:agentId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Chat'],
      summary: 'Get agent',
      params: {
        type: 'object',
        required: ['agentId'],
        properties: {
          agentId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { agentId } = request.params as { agentId: string };
    const agent = await chatService.getAgent(agentId);

    return reply.send(agent);
  });
};
