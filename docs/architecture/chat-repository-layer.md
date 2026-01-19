# Chat Repository Layer Design

## Overview

This document defines the repository layer and database schema for the Enhanced Chat Interface.
Repositories follow the existing patterns from `FileRepository` and `ApiKeyRepository`.

---

## Prisma Schema Extensions

Add these models to `prisma/schema.prisma`:

```prisma
// =============================================================================
// CHAT SESSIONS
// =============================================================================

model ChatSession {
  id            String    @id
  userId        String    @map("user_id")
  title         String
  folderId      String?   @map("folder_id")
  agentId       String?   @map("agent_id")
  model         String?   // Override default model
  systemPrompt  String?   @map("system_prompt") @db.Text
  messageCount  Int       @default(0) @map("message_count")
  tokenCount    Int       @default(0) @map("token_count")
  isArchived    Boolean   @default(false) @map("is_archived")
  isPinned      Boolean   @default(false) @map("is_pinned")
  metadata      Json      @default("{}")
  lastMessageAt DateTime? @map("last_message_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  // Relations
  folder        ChatFolder?     @relation(fields: [folderId], references: [id], onDelete: SetNull)
  agent         ChatAgent?      @relation(fields: [agentId], references: [id], onDelete: SetNull)
  messages      ChatMessage[]

  // Indexes for common queries
  @@index([userId])
  @@index([userId, isArchived])
  @@index([userId, folderId])
  @@index([userId, updatedAt])
  @@index([userId, createdAt])
  @@index([userId, agentId])
  @@index([userId, lastMessageAt(sort: Desc)])

  // Full-text search on title
  @@index([title(ops: raw("gin_trgm_ops"))], type: Gin)

  @@map("chat_sessions")
}

// =============================================================================
// CHAT MESSAGES
// =============================================================================

model ChatMessage {
  id              String    @id
  sessionId       String    @map("session_id")
  role            String    // 'user' | 'assistant' | 'system'
  content         String    @db.Text
  model           String?   // Model used for assistant messages
  promptTokens    Int?      @map("prompt_tokens")
  completionTokens Int?     @map("completion_tokens")
  feedbackRating  String?   @map("feedback_rating") // 'positive' | 'negative'
  feedbackComment String?   @map("feedback_comment")
  parentId        String?   @map("parent_id") // For branching/edits
  versionNumber   Int       @default(1) @map("version_number")
  isDeleted       Boolean   @default(false) @map("is_deleted")
  metadata        Json      @default("{}")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  // Relations
  session         ChatSession       @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  parent          ChatMessage?      @relation("MessageVersions", fields: [parentId], references: [id])
  versions        ChatMessage[]     @relation("MessageVersions")
  attachments     MessageAttachment[]
  canvases        Canvas[]

  // Indexes
  @@index([sessionId])
  @@index([sessionId, createdAt])
  @@index([sessionId, isDeleted])
  @@index([parentId])

  @@map("chat_messages")
}

// =============================================================================
// MESSAGE ATTACHMENTS (Junction Table)
// =============================================================================

model MessageAttachment {
  id            String   @id @default(cuid())
  messageId     String   @map("message_id")
  attachmentId  String   @map("attachment_id")
  position      Int      @default(0) // Order in message
  createdAt     DateTime @default(now()) @map("created_at")

  // Relations
  message       ChatMessage   @relation(fields: [messageId], references: [id], onDelete: Cascade)
  attachment    Attachment    @relation(fields: [attachmentId], references: [id], onDelete: Cascade)

  @@unique([messageId, attachmentId])
  @@index([messageId])
  @@index([attachmentId])
  @@map("message_attachments")
}

// =============================================================================
// ATTACHMENTS
// =============================================================================

model Attachment {
  id            String    @id
  userId        String    @map("user_id")
  filename      String
  mimeType      String    @map("mime_type")
  size          Int       // bytes
  purpose       String    @default("chat-input")
  objectName    String    @map("object_name") // MinIO path
  checksum      String
  thumbnailPath String?   @map("thumbnail_path")
  metadata      Json      @default("{}")
  expiresAt     DateTime? @map("expires_at") // Optional expiry
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  // Relations
  messages      MessageAttachment[]

  @@index([userId])
  @@index([userId, createdAt])
  @@index([expiresAt])
  @@map("attachments")
}

// =============================================================================
// CANVAS (Code Blocks / Artifacts)
// =============================================================================

model Canvas {
  id          String   @id
  messageId   String   @map("message_id")
  type        String   // 'code' | 'markdown' | 'mermaid' | 'latex' | 'html'
  language    String?  // Programming language for code
  title       String?
  content     String   @db.Text
  version     Int      @default(1)
  isEditable  Boolean  @default(true) @map("is_editable")
  previewPath String?  @map("preview_path")
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // Relations
  message     ChatMessage     @relation(fields: [messageId], references: [id], onDelete: Cascade)
  versions    CanvasVersion[]

  @@index([messageId])
  @@map("canvases")
}

model CanvasVersion {
  id        String   @id @default(cuid())
  canvasId  String   @map("canvas_id")
  version   Int
  content   String   @db.Text
  createdBy String   @map("created_by") // 'user' | 'assistant'
  createdAt DateTime @default(now()) @map("created_at")

  // Relations
  canvas    Canvas @relation(fields: [canvasId], references: [id], onDelete: Cascade)

  @@unique([canvasId, version])
  @@index([canvasId])
  @@map("canvas_versions")
}

// =============================================================================
// CHAT FOLDERS
// =============================================================================

model ChatFolder {
  id            String    @id
  userId        String    @map("user_id")
  name          String
  color         String?
  icon          String?
  parentId      String?   @map("parent_id")
  position      Int       @default(0)
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  // Relations
  parent        ChatFolder?   @relation("FolderHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children      ChatFolder[]  @relation("FolderHierarchy")
  sessions      ChatSession[]

  @@index([userId])
  @@index([userId, parentId])
  @@index([parentId])
  @@map("chat_folders")
}

// =============================================================================
// CHAT AGENTS
// =============================================================================

model ChatAgent {
  id            String   @id
  name          String
  description   String   @db.Text
  icon          String?
  category      String   // 'general' | 'code' | 'writing' | 'analysis' | 'creative'
  capabilities  String[] // Array of capability tags
  defaultModel  String   @map("default_model")
  systemPrompt  String   @map("system_prompt") @db.Text
  isDefault     Boolean  @default(false) @map("is_default")
  isEnabled     Boolean  @default(true) @map("is_enabled")
  sortOrder     Int      @default(0) @map("sort_order")
  metadata      Json     @default("{}")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  // Relations
  sessions      ChatSession[]

  @@index([isEnabled])
  @@index([category])
  @@map("chat_agents")
}

// =============================================================================
// USER SETTINGS
// =============================================================================

model UserChatSettings {
  id                  String   @id @default(cuid())
  userId              String   @unique @map("user_id")
  defaultAgentId      String?  @map("default_agent_id")
  defaultModel        String   @default("claude-3-5-sonnet") @map("default_model")
  temperature         Float    @default(0.7)
  maxTokens           Int      @default(4096) @map("max_tokens")
  streamResponses     Boolean  @default(true) @map("stream_responses")
  showTokenCount      Boolean  @default(false) @map("show_token_count")
  autoGenerateTitle   Boolean  @default(true) @map("auto_generate_title")
  codeTheme           String   @default("github-dark") @map("code_theme")
  fontSize            String   @default("medium") @map("font_size")
  compactMode         Boolean  @default(false) @map("compact_mode")
  showTimestamps      Boolean  @default(true) @map("show_timestamps")
  enterToSend         Boolean  @default(true) @map("enter_to_send")
  customSystemPrompt  String?  @map("custom_system_prompt") @db.Text
  enabledAgents       String[] @map("enabled_agents")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  @@map("user_chat_settings")
}
```

---

## Repository Implementations

### 1. SessionRepository

```typescript
/**
 * Chat Session Repository
 *
 * Handles CRUD operations for chat sessions.
 */

import type { ContainerCradle } from '../container.js';
import { PAGINATION } from '../config/constants.js';

export interface SessionRecord {
  id: string;
  userId: string;
  title: string;
  folderId: string | null;
  agentId: string | null;
  model: string | null;
  systemPrompt: string | null;
  messageCount: number;
  tokenCount: number;
  isArchived: boolean;
  isPinned: boolean;
  metadata: Record<string, unknown>;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionData {
  id: string;
  userId: string;
  title: string;
  folderId?: string | null;
  agentId?: string | null;
  model?: string;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
}

export interface FindSessionsOptions {
  page?: number;
  limit?: number;
  folderId?: string | null;
  search?: string;
  agentId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'lastMessageAt';
  sortOrder?: 'asc' | 'desc';
  includeArchived?: boolean;
}

export class SessionRepository {
  private readonly prisma: ContainerCradle['prisma'];
  private readonly logger: ContainerCradle['logger'];

  constructor({ prisma, logger }: ContainerCradle) {
    this.prisma = prisma;
    this.logger = logger;
  }

  async create(data: CreateSessionData): Promise<SessionRecord> {
    const result = await this.prisma.chatSession.create({
      data: {
        id: data.id,
        userId: data.userId,
        title: data.title,
        folderId: data.folderId,
        agentId: data.agentId,
        model: data.model,
        systemPrompt: data.systemPrompt,
        metadata: data.metadata || {},
      },
    });

    return this.mapToRecord(result);
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const result = await this.prisma.chatSession.findUnique({
      where: { id },
    });

    return result ? this.mapToRecord(result) : null;
  }

  async findByIdWithRelations(
    id: string,
    include: { folder?: boolean; agent?: boolean; messages?: boolean | { take: number } }
  ): Promise<SessionRecord & { folder?: any; agent?: any; messages?: any[] } | null> {
    const result = await this.prisma.chatSession.findUnique({
      where: { id },
      include: {
        folder: include.folder,
        agent: include.agent,
        messages: include.messages === true
          ? { orderBy: { createdAt: 'asc' } }
          : typeof include.messages === 'object'
            ? { orderBy: { createdAt: 'desc' }, take: include.messages.take }
            : false,
      },
    });

    return result ? { ...this.mapToRecord(result), ...result } : null;
  }

  async findByUser(
    userId: string,
    options: FindSessionsOptions = {}
  ): Promise<{ sessions: SessionRecord[]; total: number }> {
    const {
      page = 1,
      limit = PAGINATION.DEFAULT_PAGE_SIZE,
      folderId,
      search,
      agentId,
      createdAfter,
      createdBefore,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
      includeArchived = false,
    } = options;

    const where: any = {
      userId,
      ...(includeArchived ? {} : { isArchived: false }),
      ...(folderId !== undefined && { folderId }),
      ...(agentId && { agentId }),
      ...(createdAfter && { createdAt: { gte: createdAfter } }),
      ...(createdBefore && { createdAt: { lte: createdBefore } }),
    };

    // Full-text search on title
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [results, total] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        take: Math.min(limit, PAGINATION.MAX_PAGE_SIZE),
        skip: (page - 1) * limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.chatSession.count({ where }),
    ]);

    return {
      sessions: results.map(this.mapToRecord),
      total,
    };
  }

  async update(
    id: string,
    data: Partial<Omit<SessionRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<SessionRecord> {
    const result = await this.prisma.chatSession.update({
      where: { id },
      data,
    });

    return this.mapToRecord(result);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.chatSession.delete({
      where: { id },
    });
  }

  async incrementMessageCount(id: string, tokens: number): Promise<void> {
    await this.prisma.chatSession.update({
      where: { id },
      data: {
        messageCount: { increment: 1 },
        tokenCount: { increment: tokens },
        lastMessageAt: new Date(),
      },
    });
  }

  async moveToFolder(id: string, folderId: string | null): Promise<SessionRecord> {
    const result = await this.prisma.chatSession.update({
      where: { id },
      data: { folderId },
    });

    return this.mapToRecord(result);
  }

  async archive(id: string): Promise<SessionRecord> {
    const result = await this.prisma.chatSession.update({
      where: { id },
      data: { isArchived: true },
    });

    return this.mapToRecord(result);
  }

  async restore(id: string): Promise<SessionRecord> {
    const result = await this.prisma.chatSession.update({
      where: { id },
      data: { isArchived: false },
    });

    return this.mapToRecord(result);
  }

  private mapToRecord(data: any): SessionRecord {
    return {
      id: data.id,
      userId: data.userId,
      title: data.title,
      folderId: data.folderId,
      agentId: data.agentId,
      model: data.model,
      systemPrompt: data.systemPrompt,
      messageCount: data.messageCount,
      tokenCount: data.tokenCount,
      isArchived: data.isArchived,
      isPinned: data.isPinned,
      metadata: data.metadata as Record<string, unknown>,
      lastMessageAt: data.lastMessageAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
```

### 2. MessageRepository

```typescript
/**
 * Chat Message Repository
 *
 * Handles CRUD operations for chat messages with cursor-based pagination.
 */

import type { ContainerCradle } from '../container.js';

export interface MessageRecord {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  feedbackRating: 'positive' | 'negative' | null;
  feedbackComment: string | null;
  parentId: string | null;
  versionNumber: number;
  isDeleted: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageData {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface FindMessagesOptions {
  cursor?: string;
  limit?: number;
  direction?: 'before' | 'after';
  includeDeleted?: boolean;
}

export class MessageRepository {
  private readonly prisma: ContainerCradle['prisma'];
  private readonly logger: ContainerCradle['logger'];

  constructor({ prisma, logger }: ContainerCradle) {
    this.prisma = prisma;
    this.logger = logger;
  }

  async create(data: CreateMessageData): Promise<MessageRecord> {
    const result = await this.prisma.chatMessage.create({
      data: {
        id: data.id,
        sessionId: data.sessionId,
        role: data.role,
        content: data.content,
        model: data.model,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        parentId: data.parentId,
        metadata: data.metadata || {},
      },
    });

    return this.mapToRecord(result);
  }

  async findById(id: string): Promise<MessageRecord | null> {
    const result = await this.prisma.chatMessage.findUnique({
      where: { id },
    });

    return result ? this.mapToRecord(result) : null;
  }

  async findByIdWithRelations(
    id: string,
    include: { attachments?: boolean; canvases?: boolean }
  ): Promise<MessageRecord & { attachments?: any[]; canvases?: any[] } | null> {
    const result = await this.prisma.chatMessage.findUnique({
      where: { id },
      include: {
        attachments: include.attachments
          ? { include: { attachment: true }, orderBy: { position: 'asc' } }
          : false,
        canvases: include.canvases
          ? { orderBy: { createdAt: 'asc' } }
          : false,
      },
    });

    return result ? { ...this.mapToRecord(result), ...result } : null;
  }

  /**
   * Cursor-based pagination for messages.
   *
   * - direction='before': Get messages older than cursor (scrolling up)
   * - direction='after': Get messages newer than cursor (scrolling down)
   */
  async findBySession(
    sessionId: string,
    options: FindMessagesOptions = {}
  ): Promise<{
    messages: MessageRecord[];
    hasMore: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
  }> {
    const {
      cursor,
      limit = 50,
      direction = 'before',
      includeDeleted = false,
    } = options;

    const where: any = {
      sessionId,
      ...(includeDeleted ? {} : { isDeleted: false }),
    };

    // If cursor provided, add cursor condition
    if (cursor) {
      const cursorMessage = await this.prisma.chatMessage.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (cursorMessage) {
        where.createdAt = direction === 'before'
          ? { lt: cursorMessage.createdAt }
          : { gt: cursorMessage.createdAt };
      }
    }

    // Fetch one extra to determine hasMore
    const results = await this.prisma.chatMessage.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: direction === 'before' ? 'desc' : 'asc' },
      include: {
        attachments: { include: { attachment: true }, orderBy: { position: 'asc' } },
        canvases: { orderBy: { createdAt: 'asc' } },
      },
    });

    const hasMore = results.length > limit;
    const messages = results.slice(0, limit);

    // Reverse for 'before' to get chronological order
    if (direction === 'before') {
      messages.reverse();
    }

    return {
      messages: messages.map(this.mapToRecord),
      hasMore,
      nextCursor: hasMore && messages.length > 0
        ? messages[messages.length - 1].id
        : null,
      prevCursor: messages.length > 0 ? messages[0].id : null,
    };
  }

  async update(
    id: string,
    data: Partial<Omit<MessageRecord, 'id' | 'sessionId' | 'createdAt' | 'updatedAt'>>
  ): Promise<MessageRecord> {
    const result = await this.prisma.chatMessage.update({
      where: { id },
      data,
    });

    return this.mapToRecord(result);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.chatMessage.update({
      where: { id },
      data: {
        isDeleted: true,
        content: '[deleted]',
      },
    });
  }

  async setFeedback(
    id: string,
    rating: 'positive' | 'negative',
    comment?: string
  ): Promise<void> {
    await this.prisma.chatMessage.update({
      where: { id },
      data: {
        feedbackRating: rating,
        feedbackComment: comment,
      },
    });
  }

  async createVersion(
    originalId: string,
    newContent: string
  ): Promise<MessageRecord> {
    // Get original message
    const original = await this.prisma.chatMessage.findUnique({
      where: { id: originalId },
    });

    if (!original) {
      throw new Error(`Message ${originalId} not found`);
    }

    // Get next version number
    const maxVersion = await this.prisma.chatMessage.aggregate({
      where: {
        OR: [
          { id: originalId },
          { parentId: originalId },
        ],
      },
      _max: { versionNumber: true },
    });

    const newVersion = (maxVersion._max.versionNumber || 0) + 1;

    // Create new version
    const result = await this.prisma.chatMessage.create({
      data: {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        sessionId: original.sessionId,
        role: original.role,
        content: newContent,
        parentId: originalId,
        versionNumber: newVersion,
        metadata: {},
      },
    });

    return this.mapToRecord(result);
  }

  async getVersions(messageId: string): Promise<MessageRecord[]> {
    const results = await this.prisma.chatMessage.findMany({
      where: {
        OR: [
          { id: messageId },
          { parentId: messageId },
        ],
      },
      orderBy: { versionNumber: 'asc' },
    });

    return results.map(this.mapToRecord);
  }

  async countBySession(sessionId: string): Promise<number> {
    return this.prisma.chatMessage.count({
      where: { sessionId, isDeleted: false },
    });
  }

  private mapToRecord(data: any): MessageRecord {
    return {
      id: data.id,
      sessionId: data.sessionId,
      role: data.role as 'user' | 'assistant' | 'system',
      content: data.content,
      model: data.model,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      feedbackRating: data.feedbackRating as 'positive' | 'negative' | null,
      feedbackComment: data.feedbackComment,
      parentId: data.parentId,
      versionNumber: data.versionNumber,
      isDeleted: data.isDeleted,
      metadata: data.metadata as Record<string, unknown>,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
```

### 3. FolderRepository

```typescript
/**
 * Chat Folder Repository
 *
 * Handles CRUD operations for chat folders with hierarchy support.
 */

import type { ContainerCradle } from '../container.js';

export interface FolderRecord {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFolderData {
  id: string;
  userId: string;
  name: string;
  color?: string;
  icon?: string;
  parentId?: string | null;
  position?: number;
}

export class FolderRepository {
  private readonly prisma: ContainerCradle['prisma'];
  private readonly logger: ContainerCradle['logger'];

  constructor({ prisma, logger }: ContainerCradle) {
    this.prisma = prisma;
    this.logger = logger;
  }

  async create(data: CreateFolderData): Promise<FolderRecord> {
    // Get max position for siblings
    const maxPosition = await this.prisma.chatFolder.aggregate({
      where: {
        userId: data.userId,
        parentId: data.parentId ?? null,
      },
      _max: { position: true },
    });

    const position = data.position ?? (maxPosition._max.position ?? -1) + 1;

    const result = await this.prisma.chatFolder.create({
      data: {
        id: data.id,
        userId: data.userId,
        name: data.name,
        color: data.color,
        icon: data.icon,
        parentId: data.parentId,
        position,
      },
    });

    return this.mapToRecord(result);
  }

  async findById(id: string): Promise<FolderRecord | null> {
    const result = await this.prisma.chatFolder.findUnique({
      where: { id },
    });

    return result ? this.mapToRecord(result) : null;
  }

  async findByIdWithRelations(
    id: string,
    include: { children?: boolean; sessions?: boolean; _count?: boolean }
  ): Promise<FolderRecord & { children?: any[]; sessions?: any[]; _count?: any } | null> {
    const result = await this.prisma.chatFolder.findUnique({
      where: { id },
      include: {
        children: include.children ? { orderBy: { position: 'asc' } } : false,
        sessions: include.sessions ? { orderBy: { updatedAt: 'desc' } } : false,
        _count: include._count ? { select: { sessions: true } } : false,
      },
    });

    return result ? { ...this.mapToRecord(result), ...result } : null;
  }

  async findByUser(userId: string): Promise<FolderRecord[]> {
    const results = await this.prisma.chatFolder.findMany({
      where: { userId },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
    });

    return results.map(this.mapToRecord);
  }

  async findByUserWithCounts(userId: string): Promise<(FolderRecord & { sessionCount: number })[]> {
    const results = await this.prisma.chatFolder.findMany({
      where: { userId },
      include: { _count: { select: { sessions: true } } },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
    });

    return results.map(r => ({
      ...this.mapToRecord(r),
      sessionCount: r._count.sessions,
    }));
  }

  async update(
    id: string,
    data: Partial<Omit<FolderRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<FolderRecord> {
    const result = await this.prisma.chatFolder.update({
      where: { id },
      data,
    });

    return this.mapToRecord(result);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.chatFolder.delete({
      where: { id },
    });
  }

  async move(id: string, parentId: string | null, position: number): Promise<FolderRecord> {
    const result = await this.prisma.chatFolder.update({
      where: { id },
      data: { parentId, position },
    });

    return this.mapToRecord(result);
  }

  async reorder(userId: string, parentId: string | null, folderIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      folderIds.map((id, index) =>
        this.prisma.chatFolder.update({
          where: { id },
          data: { position: index },
        })
      )
    );
  }

  /**
   * Get all descendant folder IDs (for circular reference detection).
   */
  async getDescendantIds(folderId: string): Promise<string[]> {
    const descendants: string[] = [];
    const queue = [folderId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = await this.prisma.chatFolder.findMany({
        where: { parentId: currentId },
        select: { id: true },
      });

      for (const child of children) {
        descendants.push(child.id);
        queue.push(child.id);
      }
    }

    return descendants;
  }

  /**
   * Get folder path (breadcrumb).
   */
  async getPath(folderId: string): Promise<FolderRecord[]> {
    const path: FolderRecord[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await this.findById(currentId);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parentId;
    }

    return path;
  }

  private mapToRecord(data: any): FolderRecord {
    return {
      id: data.id,
      userId: data.userId,
      name: data.name,
      color: data.color,
      icon: data.icon,
      parentId: data.parentId,
      position: data.position,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
```

### 4. SettingsRepository

```typescript
/**
 * User Chat Settings Repository
 */

import type { ContainerCradle } from '../container.js';

export interface SettingsRecord {
  id: string;
  userId: string;
  defaultAgentId: string | null;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  streamResponses: boolean;
  showTokenCount: boolean;
  autoGenerateTitle: boolean;
  codeTheme: string;
  fontSize: string;
  compactMode: boolean;
  showTimestamps: boolean;
  enterToSend: boolean;
  customSystemPrompt: string | null;
  enabledAgents: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_SETTINGS: Omit<SettingsRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
  defaultAgentId: null,
  defaultModel: 'claude-3-5-sonnet',
  temperature: 0.7,
  maxTokens: 4096,
  streamResponses: true,
  showTokenCount: false,
  autoGenerateTitle: true,
  codeTheme: 'github-dark',
  fontSize: 'medium',
  compactMode: false,
  showTimestamps: true,
  enterToSend: true,
  customSystemPrompt: null,
  enabledAgents: [],
};

export class SettingsRepository {
  private readonly prisma: ContainerCradle['prisma'];
  private readonly logger: ContainerCradle['logger'];

  constructor({ prisma, logger }: ContainerCradle) {
    this.prisma = prisma;
    this.logger = logger;
  }

  async findByUserId(userId: string): Promise<SettingsRecord | null> {
    const result = await this.prisma.userChatSettings.findUnique({
      where: { userId },
    });

    return result ? this.mapToRecord(result) : null;
  }

  async getOrCreate(userId: string): Promise<SettingsRecord> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;

    const result = await this.prisma.userChatSettings.create({
      data: {
        userId,
        ...DEFAULT_SETTINGS,
      },
    });

    return this.mapToRecord(result);
  }

  async update(
    userId: string,
    data: Partial<Omit<SettingsRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<SettingsRecord> {
    const result = await this.prisma.userChatSettings.upsert({
      where: { userId },
      create: {
        userId,
        ...DEFAULT_SETTINGS,
        ...data,
      },
      update: data,
    });

    return this.mapToRecord(result);
  }

  async reset(userId: string): Promise<SettingsRecord> {
    const result = await this.prisma.userChatSettings.upsert({
      where: { userId },
      create: {
        userId,
        ...DEFAULT_SETTINGS,
      },
      update: DEFAULT_SETTINGS,
    });

    return this.mapToRecord(result);
  }

  getDefaults(): Omit<SettingsRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'> {
    return { ...DEFAULT_SETTINGS };
  }

  private mapToRecord(data: any): SettingsRecord {
    return {
      id: data.id,
      userId: data.userId,
      defaultAgentId: data.defaultAgentId,
      defaultModel: data.defaultModel,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      streamResponses: data.streamResponses,
      showTokenCount: data.showTokenCount,
      autoGenerateTitle: data.autoGenerateTitle,
      codeTheme: data.codeTheme,
      fontSize: data.fontSize,
      compactMode: data.compactMode,
      showTimestamps: data.showTimestamps,
      enterToSend: data.enterToSend,
      customSystemPrompt: data.customSystemPrompt,
      enabledAgents: data.enabledAgents,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
```

---

## Database Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| `chat_sessions` | `(userId)` | User's sessions |
| `chat_sessions` | `(userId, isArchived)` | Active sessions filter |
| `chat_sessions` | `(userId, folderId)` | Sessions by folder |
| `chat_sessions` | `(userId, updatedAt)` | Recent sessions |
| `chat_sessions` | `(userId, lastMessageAt DESC)` | Sort by activity |
| `chat_sessions` | `(title)` GIN | Full-text search |
| `chat_messages` | `(sessionId)` | Messages by session |
| `chat_messages` | `(sessionId, createdAt)` | Cursor pagination |
| `chat_messages` | `(sessionId, isDeleted)` | Active messages |
| `chat_folders` | `(userId)` | User's folders |
| `chat_folders` | `(userId, parentId)` | Folder hierarchy |
| `attachments` | `(userId)` | User's attachments |
| `attachments` | `(expiresAt)` | Cleanup job |

---

## Migrations

Run migrations after adding schema:

```bash
npx prisma migrate dev --name add_chat_models
npx prisma generate
```
