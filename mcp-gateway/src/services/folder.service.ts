/**
 * Folder Service
 *
 * Handles project folder management for organizing chat sessions.
 * Supports nested folder hierarchy with drag-drop reordering.
 */

import { z } from 'zod';
import type { Prisma, ProjectFolder } from '@prisma/client';
import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';
import { CACHE } from '../config/constants.js';

// ============================================================================
// Types and Schemas
// ============================================================================

export const CreateFolderSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
  parentId: z.string().cuid().optional(),
});

export const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
  parentId: z.string().cuid().nullable().optional(),
  isArchived: z.boolean().optional(),
});

export const ReorderFoldersSchema = z.object({
  folderIds: z.array(z.string().cuid()),
});

export type CreateFolderInput = z.infer<typeof CreateFolderSchema>;
export type UpdateFolderInput = z.infer<typeof UpdateFolderSchema>;
export type ReorderFoldersInput = z.infer<typeof ReorderFoldersSchema>;

export interface FolderWithChildren extends ProjectFolder {
  children?: FolderWithChildren[];
  _count?: { chatSessions: number };
}

export interface FolderTree {
  folders: FolderWithChildren[];
  total: number;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class FolderService {
  private readonly prisma: ContainerCradle['prisma'];
  private readonly redis: ContainerCradle['redis'];
  private readonly auditRepository: ContainerCradle['auditRepository'];
  private readonly logger: ContainerCradle['logger'];

  constructor({
    prisma,
    redis,
    auditRepository,
    logger,
  }: ContainerCradle) {
    this.prisma = prisma;
    this.redis = redis;
    this.auditRepository = auditRepository;
    this.logger = logger;
  }

  /**
   * Create a new folder
   */
  async createFolder(
    userId: string,
    input: CreateFolderInput
  ): Promise<FolderWithChildren> {
    // Validate parent folder if provided
    if (input.parentId) {
      const parent = await this.prisma.projectFolder.findFirst({
        where: { id: input.parentId, userId, isArchived: false },
      });
      if (!parent) {
        throw Errors.notFound('Parent folder', input.parentId);
      }

      // Prevent deep nesting (max 3 levels)
      const depth = await this.getFolderDepth(input.parentId);
      if (depth >= 3) {
        throw Errors.badRequest('Maximum folder nesting depth is 3 levels');
      }
    }

    // Get next sort order
    const maxOrder = await this.prisma.projectFolder.aggregate({
      where: { userId, parentId: input.parentId || null },
      _max: { sortOrder: true },
    });

    const folder = await this.prisma.projectFolder.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
        color: input.color,
        icon: input.icon,
        parentId: input.parentId,
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
      },
      include: {
        _count: { select: { chatSessions: true } },
      },
    });

    await this.invalidateFolderCache(userId);

    await this.auditRepository.logAsync({
      action: 'folder_created',
      userId,
      metadata: { folderId: folder.id, parentId: input.parentId },
    });

    return folder as FolderWithChildren;
  }

  /**
   * Get folder tree for a user
   */
  async getFolderTree(
    userId: string,
    options: { includeArchived?: boolean } = {}
  ): Promise<FolderTree> {
    const { includeArchived = false } = options;

    const cacheKey = `folders:${userId}:tree:${includeArchived}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const where: Prisma.ProjectFolderWhereInput = { userId };
    if (!includeArchived) {
      where.isArchived = false;
    }

    const folders = await this.prisma.projectFolder.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { chatSessions: true } },
      },
    });

    // Build tree structure
    const tree = this.buildFolderTree(folders as FolderWithChildren[]);

    const result: FolderTree = {
      folders: tree,
      total: folders.length,
    };

    await this.redis.setex(cacheKey, CACHE.FOLDER_TTL_SECONDS, JSON.stringify(result));

    return result;
  }

  /**
   * Get a single folder
   */
  async getFolder(userId: string, folderId: string): Promise<FolderWithChildren> {
    const folder = await this.prisma.projectFolder.findFirst({
      where: { id: folderId, userId },
      include: {
        children: {
          where: { isArchived: false },
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: { select: { chatSessions: true } },
          },
        },
        _count: { select: { chatSessions: true } },
      },
    });

    if (!folder) {
      throw Errors.notFound('Folder', folderId);
    }

    return folder as FolderWithChildren;
  }

  /**
   * Update a folder
   */
  async updateFolder(
    userId: string,
    folderId: string,
    input: UpdateFolderInput
  ): Promise<FolderWithChildren> {
    const existing = await this.getFolder(userId, folderId);

    // Validate new parent if changing
    if (input.parentId !== undefined) {
      if (input.parentId === folderId) {
        throw Errors.badRequest('Cannot set folder as its own parent');
      }

      if (input.parentId !== null) {
        const parent = await this.prisma.projectFolder.findFirst({
          where: { id: input.parentId, userId, isArchived: false },
        });
        if (!parent) {
          throw Errors.notFound('Parent folder', input.parentId);
        }

        // Check for circular reference
        if (await this.isDescendant(folderId, input.parentId)) {
          throw Errors.badRequest('Cannot create circular folder hierarchy');
        }

        // Check depth
        const depth = await this.getFolderDepth(input.parentId);
        if (depth >= 3) {
          throw Errors.badRequest('Maximum folder nesting depth is 3 levels');
        }
      }
    }

    const folder = await this.prisma.projectFolder.update({
      where: { id: folderId },
      data: input,
      include: {
        _count: { select: { chatSessions: true } },
      },
    });

    await this.invalidateFolderCache(userId);

    await this.auditRepository.logAsync({
      action: 'folder_updated',
      userId,
      metadata: { folderId, changes: Object.keys(input) },
    });

    return folder as FolderWithChildren;
  }

  /**
   * Delete a folder
   */
  async deleteFolder(
    userId: string,
    folderId: string,
    options: { moveSessionsToFolder?: string | null } = {}
  ): Promise<void> {
    const folder = await this.getFolder(userId, folderId);

    const { moveSessionsToFolder } = options;

    // Move or orphan sessions
    if (moveSessionsToFolder !== undefined) {
      await this.prisma.chatSession.updateMany({
        where: { folderId, userId },
        data: { folderId: moveSessionsToFolder },
      });
    }

    // Move child folders to parent
    await this.prisma.projectFolder.updateMany({
      where: { parentId: folderId },
      data: { parentId: folder.parentId },
    });

    // Delete folder
    await this.prisma.projectFolder.delete({
      where: { id: folderId },
    });

    await this.invalidateFolderCache(userId);

    await this.auditRepository.logAsync({
      action: 'folder_deleted',
      userId,
      metadata: { folderId },
    });
  }

  /**
   * Reorder folders at the same level
   */
  async reorderFolders(
    userId: string,
    parentId: string | null,
    input: ReorderFoldersInput
  ): Promise<void> {
    // Validate all folders belong to user and same parent
    const folders = await this.prisma.projectFolder.findMany({
      where: {
        id: { in: input.folderIds },
        userId,
        parentId,
      },
    });

    if (folders.length !== input.folderIds.length) {
      throw Errors.badRequest('Invalid folder IDs provided');
    }

    // Update sort orders
    await Promise.all(
      input.folderIds.map((folderId, index) =>
        this.prisma.projectFolder.update({
          where: { id: folderId },
          data: { sortOrder: index },
        })
      )
    );

    await this.invalidateFolderCache(userId);
  }

  /**
   * Move sessions between folders
   */
  async moveSessionsToFolder(
    userId: string,
    sessionIds: string[],
    targetFolderId: string | null
  ): Promise<void> {
    // Validate target folder
    if (targetFolderId) {
      const folder = await this.prisma.projectFolder.findFirst({
        where: { id: targetFolderId, userId, isArchived: false },
      });
      if (!folder) {
        throw Errors.notFound('Folder', targetFolderId);
      }
    }

    // Validate sessions belong to user
    const sessions = await this.prisma.chatSession.findMany({
      where: { id: { in: sessionIds }, userId },
    });

    if (sessions.length !== sessionIds.length) {
      throw Errors.badRequest('Invalid session IDs provided');
    }

    await this.prisma.chatSession.updateMany({
      where: { id: { in: sessionIds } },
      data: { folderId: targetFolderId },
    });

    await this.invalidateFolderCache(userId);

    await this.auditRepository.logAsync({
      action: 'sessions_moved',
      userId,
      metadata: { sessionIds, targetFolderId },
    });
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private buildFolderTree(folders: FolderWithChildren[]): FolderWithChildren[] {
    const map = new Map<string, FolderWithChildren>();
    const roots: FolderWithChildren[] = [];

    // First pass: create map
    for (const folder of folders) {
      folder.children = [];
      map.set(folder.id, folder);
    }

    // Second pass: build tree
    for (const folder of folders) {
      if (folder.parentId && map.has(folder.parentId)) {
        map.get(folder.parentId)!.children!.push(folder);
      } else {
        roots.push(folder);
      }
    }

    return roots;
  }

  private async getFolderDepth(folderId: string): Promise<number> {
    let depth = 0;
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await this.prisma.projectFolder.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      if (folder?.parentId) {
        depth++;
        currentId = folder.parentId;
      } else {
        break;
      }
    }

    return depth;
  }

  private async isDescendant(
    ancestorId: string,
    potentialDescendantId: string
  ): Promise<boolean> {
    let currentId: string | null = potentialDescendantId;

    while (currentId) {
      if (currentId === ancestorId) {
        return true;
      }
      const folder = await this.prisma.projectFolder.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = folder?.parentId || null;
    }

    return false;
  }

  private async invalidateFolderCache(userId: string): Promise<void> {
    const keys = await this.redis.keys(`folders:${userId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
