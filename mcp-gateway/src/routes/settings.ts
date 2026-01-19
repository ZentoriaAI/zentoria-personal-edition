/**
 * Settings Routes
 *
 * Handles user settings for AI preferences and configuration.
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UpdateSettingsSchema } from '../services/settings.service.js';
import { requireScope } from '../middleware/auth.js';
import { Errors } from '../middleware/error-handler.js';

export const settingsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const settingsService = fastify.container.resolve('settingsService');

  /**
   * GET /api/v1/settings
   * Get user settings
   */
  fastify.get('/', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Settings'],
      summary: 'Get user settings',
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            defaultAgentId: { type: ['string', 'null'] },
            defaultModel: { type: 'string' },
            defaultTemperature: { type: 'number' },
            defaultMaxTokens: { type: ['integer', 'null'] },
            defaultSystemPrompt: { type: ['string', 'null'] },
            contextWindow: { type: 'integer' },
            streamResponses: { type: 'boolean' },
            showTokenCounts: { type: 'boolean' },
            autoGenerateTitles: { type: 'boolean' },
            saveHistory: { type: 'boolean' },
            theme: { type: 'string' },
            fontSize: { type: 'string' },
            codeTheme: { type: 'string' },
            sendOnEnter: { type: 'boolean' },
            enableSounds: { type: 'boolean' },
            enableNotifications: { type: 'boolean' },
            keyboardShortcuts: { type: 'object' },
            customPrompts: { type: 'array' },
            agent: {
              type: ['object', 'null'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                displayName: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const settings = await settingsService.getSettings(request.user.id);
    return reply.send(settings);
  });

  /**
   * PATCH /api/v1/settings
   * Update user settings
   */
  fastify.patch('/', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Settings'],
      summary: 'Update user settings',
      body: {
        type: 'object',
        properties: {
          defaultAgentId: { type: ['string', 'null'] },
          defaultModel: { type: 'string' },
          defaultTemperature: { type: 'number', minimum: 0, maximum: 2 },
          defaultMaxTokens: { type: ['integer', 'null'], minimum: 1, maximum: 16384 },
          defaultSystemPrompt: { type: ['string', 'null'], maxLength: 10000 },
          contextWindow: { type: 'integer', minimum: 1, maximum: 100 },
          streamResponses: { type: 'boolean' },
          showTokenCounts: { type: 'boolean' },
          autoGenerateTitles: { type: 'boolean' },
          saveHistory: { type: 'boolean' },
          theme: { type: 'string', enum: ['light', 'dark', 'system'] },
          fontSize: { type: 'string', enum: ['small', 'medium', 'large'] },
          codeTheme: { type: 'string' },
          sendOnEnter: { type: 'boolean' },
          enableSounds: { type: 'boolean' },
          enableNotifications: { type: 'boolean' },
          keyboardShortcuts: { type: 'object' },
          customPrompts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'name', 'content'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                content: { type: 'string' },
                category: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const body = UpdateSettingsSchema.parse(request.body);
    const settings = await settingsService.updateSettings(request.user.id, body);

    return reply.send(settings);
  });

  /**
   * POST /api/v1/settings/reset
   * Reset settings to defaults
   */
  fastify.post('/reset', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Settings'],
      summary: 'Reset settings to defaults',
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const settings = await settingsService.resetSettings(request.user.id);
    return reply.send(settings);
  });

  /**
   * GET /api/v1/settings/models
   * Get available models
   */
  fastify.get('/models', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Settings'],
      summary: 'Get available models',
      response: {
        200: {
          type: 'object',
          properties: {
            models: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  provider: { type: 'string' },
                  contextWindow: { type: 'integer' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const models = await settingsService.getAvailableModels();
    return reply.send({ models });
  });

  /**
   * POST /api/v1/settings/prompts
   * Add a custom prompt
   */
  fastify.post('/prompts', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Settings'],
      summary: 'Add custom prompt',
      body: {
        type: 'object',
        required: ['name', 'content'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          content: { type: 'string', minLength: 1, maxLength: 10000 },
          category: { type: 'string', maxLength: 50 },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const body = request.body as { name: string; content: string; category?: string };
    const settings = await settingsService.addCustomPrompt(request.user.id, body);

    return reply.status(201).send(settings);
  });

  /**
   * DELETE /api/v1/settings/prompts/:promptId
   * Remove a custom prompt
   */
  fastify.delete('/prompts/:promptId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Settings'],
      summary: 'Remove custom prompt',
      params: {
        type: 'object',
        required: ['promptId'],
        properties: {
          promptId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { promptId } = request.params as { promptId: string };
    const settings = await settingsService.removeCustomPrompt(request.user.id, promptId);

    return reply.send(settings);
  });

  /**
   * GET /api/v1/settings/export
   * Export settings for backup
   */
  fastify.get('/export', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Settings'],
      summary: 'Export settings',
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const backup = await settingsService.exportSettings(request.user.id);

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', 'attachment; filename="zentoria-settings.json"');

    return reply.send(backup);
  });

  /**
   * POST /api/v1/settings/import
   * Import settings from backup
   */
  fastify.post('/import', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Settings'],
      summary: 'Import settings',
      body: {
        type: 'object',
        required: ['version', 'settings'],
        properties: {
          version: { type: 'string' },
          exportedAt: { type: 'string' },
          settings: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const backup = request.body as Record<string, unknown>;
    const settings = await settingsService.importSettings(request.user.id, backup);

    return reply.send(settings);
  });
};
