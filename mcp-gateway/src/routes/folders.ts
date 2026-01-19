/**
 * Folder Routes
 *
 * Handles project folder management for organizing chat sessions.
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  CreateFolderSchema,
  UpdateFolderSchema,
  ReorderFoldersSchema,
} from '../services/folder.service.js';
import { requireScope } from '../middleware/auth.js';
import { Errors } from '../middleware/error-handler.js';

export const folderRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const folderService = fastify.container.resolve('folderService');

  /**
   * GET /api/v1/folders
   * Get folder tree
   */
  fastify.get('/', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Folders'],
      summary: 'Get folder tree',
      querystring: {
        type: 'object',
        properties: {
          includeArchived: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const query = request.query as { includeArchived?: boolean };
    const result = await folderService.getFolderTree(request.user.id, {
      includeArchived: query.includeArchived,
    });

    return reply.send(result);
  });

  /**
   * POST /api/v1/folders
   * Create a folder
   */
  fastify.post('/', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Folders'],
      summary: 'Create folder',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          icon: { type: 'string', maxLength: 50 },
          parentId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const body = CreateFolderSchema.parse(request.body);
    const folder = await folderService.createFolder(request.user.id, body);

    return reply.status(201).send(folder);
  });

  /**
   * GET /api/v1/folders/:folderId
   * Get a single folder
   */
  fastify.get('/:folderId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Folders'],
      summary: 'Get folder',
      params: {
        type: 'object',
        required: ['folderId'],
        properties: {
          folderId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { folderId } = request.params as { folderId: string };
    const folder = await folderService.getFolder(request.user.id, folderId);

    return reply.send(folder);
  });

  /**
   * PATCH /api/v1/folders/:folderId
   * Update a folder
   */
  fastify.patch('/:folderId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Folders'],
      summary: 'Update folder',
      params: {
        type: 'object',
        required: ['folderId'],
        properties: {
          folderId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: ['string', 'null'], maxLength: 500 },
          color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          icon: { type: 'string', maxLength: 50 },
          parentId: { type: ['string', 'null'] },
          isArchived: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { folderId } = request.params as { folderId: string };
    const body = UpdateFolderSchema.parse(request.body);
    const folder = await folderService.updateFolder(request.user.id, folderId, body);

    return reply.send(folder);
  });

  /**
   * DELETE /api/v1/folders/:folderId
   * Delete a folder
   */
  fastify.delete('/:folderId', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Folders'],
      summary: 'Delete folder',
      params: {
        type: 'object',
        required: ['folderId'],
        properties: {
          folderId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          moveSessionsToFolder: { type: ['string', 'null'] },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { folderId } = request.params as { folderId: string };
    const query = request.query as { moveSessionsToFolder?: string | null };

    await folderService.deleteFolder(request.user.id, folderId, {
      moveSessionsToFolder: query.moveSessionsToFolder,
    });

    return reply.status(204).send();
  });

  /**
   * POST /api/v1/folders/reorder
   * Reorder folders at the same level
   */
  fastify.post('/reorder', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Folders'],
      summary: 'Reorder folders',
      body: {
        type: 'object',
        required: ['folderIds'],
        properties: {
          parentId: { type: ['string', 'null'] },
          folderIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const body = request.body as { parentId?: string | null; folderIds: string[] };
    const input = ReorderFoldersSchema.parse({ folderIds: body.folderIds });

    await folderService.reorderFolders(request.user.id, body.parentId || null, input);

    return reply.status(204).send();
  });

  /**
   * POST /api/v1/folders/:folderId/move-sessions
   * Move sessions to a folder
   */
  fastify.post('/:folderId/move-sessions', {
    preHandler: requireScope('ai.chat'),
    schema: {
      tags: ['Folders'],
      summary: 'Move sessions to folder',
      params: {
        type: 'object',
        required: ['folderId'],
        properties: {
          folderId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['sessionIds'],
        properties: {
          sessionIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { folderId } = request.params as { folderId: string };
    const body = request.body as { sessionIds: string[] };

    // Use null for unfiled, otherwise the folderId
    const targetFolder = folderId === 'unfiled' ? null : folderId;

    await folderService.moveSessionsToFolder(request.user.id, body.sessionIds, targetFolder);

    return reply.status(204).send();
  });
};
