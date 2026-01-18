/**
 * File Management Routes
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { FileUploadMetadataSchema, FileListQuerySchema } from '../services/file.service.js';
import { requireScope } from '../middleware/auth.js';
import { Errors } from '../middleware/error-handler.js';

export const fileRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const fileService = fastify.container.resolve('fileService');

  /**
   * POST /api/v1/mcp/upload
   * Upload a file
   */
  fastify.post('/upload', {
    preHandler: requireScope('files.write'),
    schema: {
      tags: ['MCP', 'Files'],
      summary: 'Upload file for AI processing',
      description: 'Uploads a file to MinIO storage for use in AI commands',
      consumes: ['multipart/form-data'],
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            filename: { type: 'string' },
            size: { type: 'integer' },
            mimeType: { type: 'string' },
            purpose: { type: 'string' },
            checksum: { type: 'string' },
            createdAt: { type: 'string' },
            expiresAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const data = await request.file();
    if (!data) {
      throw Errors.badRequest('No file provided');
    }

    // Parse optional fields
    let purpose = 'ai-input';
    let metadata: Record<string, string> | undefined;

    // Get additional fields from multipart data
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'purpose') {
          purpose = part.value as string;
        } else if (part.fieldname === 'metadata') {
          try {
            metadata = JSON.parse(part.value as string);
          } catch {
            // Ignore invalid JSON
          }
        }
      }
    }

    const options = FileUploadMetadataSchema.parse({ purpose, metadata });

    // Note: Size is calculated during upload in FileService (tracks uploadedSize)
    // We pass 0 as initial hint since stream size isn't known upfront
    const result = await fileService.uploadFile(
      request.user.id,
      data.filename,
      data.mimetype,
      data.file,
      0,
      options
    );

    return reply.status(201).send(result);
  });

  /**
   * GET /api/v1/mcp/files
   * List uploaded files
   */
  fastify.get('/files', {
    preHandler: requireScope('files.read'),
    schema: {
      tags: ['Files'],
      summary: 'List uploaded files',
      description: 'Returns paginated list of files for the authenticated user',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          purpose: { type: 'string', enum: ['ai-input', 'attachment', 'backup'] },
          createdAfter: { type: 'string', format: 'date-time' },
          createdBefore: { type: 'string', format: 'date-time' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  filename: { type: 'string' },
                  size: { type: 'integer' },
                  mimeType: { type: 'string' },
                  purpose: { type: 'string' },
                  checksum: { type: 'string' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
                hasNext: { type: 'boolean' },
                hasPrev: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const query = FileListQuerySchema.parse(request.query);
    return fileService.listFiles(request.user.id, query);
  });

  /**
   * GET /api/v1/mcp/files/:fileId
   * Get file metadata
   */
  fastify.get('/files/:fileId', {
    preHandler: requireScope('files.read'),
    schema: {
      tags: ['Files'],
      summary: 'Get file metadata',
      description: 'Returns metadata for a specific file',
      params: {
        type: 'object',
        required: ['fileId'],
        properties: {
          fileId: { type: 'string', pattern: '^file_[a-zA-Z0-9]+$' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            filename: { type: 'string' },
            size: { type: 'integer' },
            mimeType: { type: 'string' },
            purpose: { type: 'string' },
            checksum: { type: 'string' },
            metadata: { type: 'object' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { fileId } = request.params as { fileId: string };
    return fileService.getFile(request.user.id, fileId);
  });

  /**
   * DELETE /api/v1/mcp/files/:fileId
   * Delete a file
   */
  fastify.delete('/files/:fileId', {
    preHandler: requireScope('files.delete'),
    schema: {
      tags: ['Files'],
      summary: 'Delete a file',
      description: 'Permanently deletes a file from storage',
      params: {
        type: 'object',
        required: ['fileId'],
        properties: {
          fileId: { type: 'string', pattern: '^file_[a-zA-Z0-9]+$' },
        },
      },
      response: {
        204: { type: 'null' },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { fileId } = request.params as { fileId: string };
    await fileService.deleteFile(request.user.id, fileId);
    return reply.status(204).send();
  });

  /**
   * GET /api/v1/mcp/files/:fileId/download
   * Download a file
   */
  fastify.get('/files/:fileId/download', {
    preHandler: requireScope('files.read'),
    schema: {
      tags: ['Files'],
      summary: 'Download a file',
      description: 'Returns the file content as a stream',
      params: {
        type: 'object',
        required: ['fileId'],
        properties: {
          fileId: { type: 'string', pattern: '^file_[a-zA-Z0-9]+$' },
        },
      },
      response: {
        200: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  }, async (request, reply) => {
    if (!request.user) {
      throw Errors.unauthorized();
    }

    const { fileId } = request.params as { fileId: string };
    const { stream, metadata } = await fileService.getFileStream(request.user.id, fileId);

    return reply
      .header('Content-Type', metadata.mimeType)
      .header('Content-Disposition', `attachment; filename="${metadata.filename}"`)
      .header('Content-Length', metadata.size)
      .send(stream);
  });
};
