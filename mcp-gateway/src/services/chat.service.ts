/**
 * Chat Service
 *
 * Handles chat session and message management with AI integration.
 * Provides full CRUD operations for conversations, messages, folders, and agents.
 */

import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { Prisma, ChatSession, ChatMessage, Agent } from '@prisma/client';
import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';
import { CACHE, TIMEOUTS } from '../config/constants.js';
import {
  sanitizeInput,
  sanitizeSystemPrompt,
  logSuspiciousInput,
} from '../infrastructure/input-sanitizer.js';

// ============================================================================
// Types and Schemas
// ============================================================================

export const CreateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  folderId: z.string().cuid().optional(),
  agentId: z.string().cuid().optional(),
  systemPrompt: z.string().max(10000).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const UpdateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  folderId: z.string().cuid().nullable().optional(),
  agentId: z.string().cuid().nullable().optional(),
  systemPrompt: z.string().max(10000).nullable().optional(),
  model: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(32000),
  attachmentIds: z.array(z.string()).max(10).optional(),
  parentId: z.string().cuid().optional(),
  stream: z.boolean().default(true).optional(),
});

export const EditMessageSchema = z.object({
  content: z.string().min(1).max(32000),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type EditMessageInput = z.infer<typeof EditMessageSchema>;

export interface SessionWithDetails extends ChatSession {
  agent?: Agent | null;
  _count?: { messages: number };
  lastMessage?: { content: string; role: string; createdAt: Date } | null;
}

export interface MessageWithDetails extends ChatMessage {
  attachments?: Array<{
    id: string;
    fileId: string;
    displayName: string | null;
    metadata: Prisma.JsonValue;
  }>;
}

export interface PaginatedSessions {
  sessions: SessionWithDetails[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PaginatedMessages {
  messages: MessageWithDetails[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface StreamChunk {
  type: 'content' | 'done' | 'error' | 'tool_call' | 'canvas';
  content?: string;
  messageId?: string;
  error?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  canvas?: {
    id: string;
    title: string;
    language: string;
    content: string;
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

// ============================================================================
// Service Implementation
// ============================================================================

export class ChatService {
  private readonly prisma: ContainerCradle['prisma'];
  private readonly redis: ContainerCradle['redis'];
  private readonly aiOrchestratorClient: ContainerCradle['aiOrchestratorClient'];
  private readonly auditRepository: ContainerCradle['auditRepository'];
  private readonly logger: ContainerCradle['logger'];

  constructor({
    prisma,
    redis,
    aiOrchestratorClient,
    auditRepository,
    logger,
  }: ContainerCradle) {
    this.prisma = prisma;
    this.redis = redis;
    this.aiOrchestratorClient = aiOrchestratorClient;
    this.auditRepository = auditRepository;
    this.logger = logger;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Create a new chat session
   */
  async createSession(
    userId: string,
    input: CreateSessionInput
  ): Promise<SessionWithDetails> {
    const sessionId = `sess_${nanoid(16)}`;

    // Validate folder and agent exist if provided
    if (input.folderId) {
      const folder = await this.prisma.projectFolder.findFirst({
        where: { id: input.folderId, userId, isArchived: false },
      });
      if (!folder) {
        throw Errors.notFound('Folder', input.folderId);
      }
    }

    if (input.agentId) {
      const agent = await this.prisma.agent.findFirst({
        where: { id: input.agentId, isActive: true },
      });
      if (!agent) {
        throw Errors.notFound('Agent', input.agentId);
      }
    }

    // Get default agent if none specified
    let agentId = input.agentId;
    if (!agentId) {
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId },
      });
      agentId = settings?.defaultAgentId || undefined;

      // Fallback to system default agent
      if (!agentId) {
        const defaultAgent = await this.prisma.agent.findFirst({
          where: { isDefault: true, isActive: true },
        });
        agentId = defaultAgent?.id;
      }
    }

    const session = await this.prisma.chatSession.create({
      data: {
        id: sessionId,
        userId,
        title: input.title || 'New Chat',
        folderId: input.folderId,
        agentId,
        systemPrompt: input.systemPrompt,
        model: input.model,
        temperature: input.temperature,
      },
      include: {
        agent: true,
      },
    });

    // Invalidate cache
    await this.invalidateSessionsCache(userId);

    // Audit log
    await this.auditRepository.logAsync({
      action: 'session_created',
      userId,
      metadata: { sessionId, agentId, folderId: input.folderId },
    });

    return session as SessionWithDetails;
  }

  /**
   * Get sessions with pagination and filtering
   */
  async getSessions(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      folderId?: string | null;
      isArchived?: boolean;
      search?: string;
      sortBy?: 'lastMessageAt' | 'createdAt' | 'title';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<PaginatedSessions> {
    const {
      page = 1,
      pageSize = 20,
      folderId,
      isArchived = false,
      search,
      sortBy = 'lastMessageAt',
      sortOrder = 'desc',
    } = options;

    const cacheKey = `sessions:${userId}:${JSON.stringify(options)}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const where: Prisma.ChatSessionWhereInput = {
      userId,
      isDeleted: false,
      isArchived,
    };

    if (folderId !== undefined) {
      where.folderId = folderId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [sessions, total] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        orderBy: [
          { isPinned: 'desc' },
          { [sortBy]: sortOrder },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          agent: true,
          _count: { select: { messages: true } },
          messages: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
        },
      }),
      this.prisma.chatSession.count({ where }),
    ]);

    // Transform to include lastMessage
    const sessionsWithDetails: SessionWithDetails[] = sessions.map((s) => ({
      ...s,
      lastMessage: s.messages[0] || null,
      messages: undefined,
    }));

    const result: PaginatedSessions = {
      sessions: sessionsWithDetails as SessionWithDetails[],
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, CACHE.SESSION_TTL_SECONDS, JSON.stringify(result));

    return result;
  }

  /**
   * Get a single session with full details
   */
  async getSession(
    userId: string,
    sessionId: string
  ): Promise<SessionWithDetails> {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId, isDeleted: false },
      include: {
        agent: true,
        _count: { select: { messages: true } },
      },
    });

    if (!session) {
      throw Errors.notFound('Session', sessionId);
    }

    return session as SessionWithDetails;
  }

  /**
   * Update a session
   */
  async updateSession(
    userId: string,
    sessionId: string,
    input: UpdateSessionInput
  ): Promise<SessionWithDetails> {
    const existing = await this.getSession(userId, sessionId);

    // Validate new folder if changing
    if (input.folderId !== undefined && input.folderId !== null) {
      const folder = await this.prisma.projectFolder.findFirst({
        where: { id: input.folderId, userId, isArchived: false },
      });
      if (!folder) {
        throw Errors.notFound('Folder', input.folderId);
      }
    }

    // Validate new agent if changing
    if (input.agentId !== undefined && input.agentId !== null) {
      const agent = await this.prisma.agent.findFirst({
        where: { id: input.agentId, isActive: true },
      });
      if (!agent) {
        throw Errors.notFound('Agent', input.agentId);
      }
    }

    const session = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: input,
      include: {
        agent: true,
        _count: { select: { messages: true } },
      },
    });

    // Invalidate caches
    await this.invalidateSessionsCache(userId);
    await this.redis.del(`session:${sessionId}`);

    // Audit log
    await this.auditRepository.logAsync({
      action: 'session_updated',
      userId,
      metadata: { sessionId, changes: Object.keys(input) },
    });

    return session as SessionWithDetails;
  }

  /**
   * Soft delete a session
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const existing = await this.getSession(userId, sessionId);

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // Invalidate caches
    await this.invalidateSessionsCache(userId);
    await this.redis.del(`session:${sessionId}`);
    await this.redis.del(`messages:${sessionId}:*`);

    // Audit log
    await this.auditRepository.logAsync({
      action: 'session_deleted',
      userId,
      metadata: { sessionId },
    });
  }

  /**
   * Duplicate a session (optionally with messages)
   */
  async duplicateSession(
    userId: string,
    sessionId: string,
    includeMessages: boolean = false
  ): Promise<SessionWithDetails> {
    const original = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId, isDeleted: false },
      include: {
        messages: includeMessages
          ? { where: { isDeleted: false }, orderBy: { createdAt: 'asc' } }
          : false,
      },
    });

    if (!original) {
      throw Errors.notFound('Session', sessionId);
    }

    const newSessionId = `sess_${nanoid(16)}`;
    const newSession = await this.prisma.chatSession.create({
      data: {
        id: newSessionId,
        userId,
        title: `${original.title} (Copy)`,
        folderId: original.folderId,
        agentId: original.agentId,
        systemPrompt: original.systemPrompt,
        model: original.model,
        temperature: original.temperature,
        contextWindow: original.contextWindow,
        metadata: original.metadata,
      },
      include: { agent: true },
    });

    // Copy messages if requested
    if (includeMessages && original.messages) {
      const messageIdMap = new Map<string, string>();

      for (const msg of original.messages) {
        const newMsgId = `msg_${nanoid(16)}`;
        messageIdMap.set(msg.id, newMsgId);

        await this.prisma.chatMessage.create({
          data: {
            id: newMsgId,
            sessionId: newSessionId,
            parentId: msg.parentId ? messageIdMap.get(msg.parentId) : null,
            role: msg.role,
            content: msg.content,
            contentFormat: msg.contentFormat,
            model: msg.model,
            metadata: msg.metadata,
          },
        });
      }

      // Update message count
      await this.prisma.chatSession.update({
        where: { id: newSessionId },
        data: { messageCount: original.messages.length },
      });
    }

    // Invalidate cache
    await this.invalidateSessionsCache(userId);

    return newSession as SessionWithDetails;
  }

  // ==========================================================================
  // Message Management
  // ==========================================================================

  /**
   * Get messages for a session with cursor pagination
   */
  async getMessages(
    userId: string,
    sessionId: string,
    options: {
      limit?: number;
      cursor?: string;
      direction?: 'before' | 'after';
    } = {}
  ): Promise<PaginatedMessages> {
    const { limit = 50, cursor, direction = 'before' } = options;

    // Verify session access
    await this.getSession(userId, sessionId);

    const where: Prisma.ChatMessageWhereInput = {
      sessionId,
      isDeleted: false,
    };

    if (cursor) {
      where.createdAt = direction === 'before'
        ? { lt: new Date(cursor) }
        : { gt: new Date(cursor) };
    }

    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: direction === 'before' ? 'desc' : 'asc' },
      take: limit + 1, // Fetch one extra to check hasMore
      include: {
        attachments: {
          select: {
            id: true,
            fileId: true,
            displayName: true,
            metadata: true,
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, -1) : messages;

    // Reverse if fetching before cursor
    if (direction === 'before') {
      items.reverse();
    }

    return {
      messages: items as MessageWithDetails[],
      hasMore,
      nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : undefined,
    };
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(
    userId: string,
    sessionId: string,
    input: SendMessageInput
  ): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
    const session = await this.getSession(userId, sessionId);

    // Sanitize input
    const sanitized = sanitizeInput(input.content, {
      maxLength: 32000,
      stripHtml: true,
      normalizeUnicode: true,
      detectInjection: true,
    });

    if (sanitized.shouldBlock) {
      throw Errors.badRequest('Message contains patterns that cannot be processed.');
    }

    // Create user message
    const userMsgId = `msg_${nanoid(16)}`;
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        id: userMsgId,
        sessionId,
        parentId: input.parentId,
        role: 'user',
        content: sanitized.sanitized,
        contentFormat: 'text',
      },
    });

    // Attach files if provided
    if (input.attachmentIds?.length) {
      await this.prisma.messageAttachment.createMany({
        data: input.attachmentIds.map((fileId) => ({
          messageId: userMsgId,
          fileId,
        })),
      });
    }

    // Get context messages
    const contextMessages = await this.prisma.chatMessage.findMany({
      where: {
        sessionId,
        isDeleted: false,
        id: { not: userMsgId },
      },
      orderBy: { createdAt: 'desc' },
      take: session.contextWindow,
      select: { role: true, content: true },
    });

    // Build AI request
    const agent = session.agent;
    const systemPrompt = session.systemPrompt || agent?.systemPrompt;
    const model = session.model || agent?.model || 'llama3.2:3b';
    const temperature = session.temperature ?? agent?.temperature ?? 0.7;

    const startTime = Date.now();

    // Call AI Orchestrator
    const aiResponse = await this.aiOrchestratorClient.processCommand({
      id: `cmd_${nanoid(16)}`,
      userId,
      command: sanitized.sanitized,
      sessionId,
      systemPrompt: systemPrompt ? sanitizeSystemPrompt(systemPrompt) : undefined,
      previousMessages: contextMessages.length,
      model,
      temperature,
      maxTokens: agent?.maxTokens || 4096,
    });

    const durationMs = Date.now() - startTime;

    // Create assistant message
    const assistantMsgId = `msg_${nanoid(16)}`;
    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        id: assistantMsgId,
        sessionId,
        parentId: userMsgId,
        role: 'assistant',
        content: aiResponse.content,
        contentFormat: 'markdown',
        model: aiResponse.model,
        promptTokens: aiResponse.usage.promptTokens,
        completionTokens: aiResponse.usage.completionTokens,
        durationMs,
        metadata: aiResponse.metadata || {},
      },
    });

    // Update session stats
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        lastMessageAt: new Date(),
        messageCount: { increment: 2 },
        tokenCount: {
          increment: aiResponse.usage.promptTokens + aiResponse.usage.completionTokens,
        },
      },
    });

    // Auto-generate title if first message
    if (session.messageCount === 0 && session.title === 'New Chat') {
      this.generateSessionTitle(userId, sessionId, sanitized.sanitized);
    }

    // Invalidate caches
    await this.invalidateSessionsCache(userId);
    await this.redis.del(`messages:${sessionId}:*`);

    return { userMessage, assistantMessage };
  }

  /**
   * Stream a message response
   */
  async *streamMessage(
    userId: string,
    sessionId: string,
    input: SendMessageInput
  ): AsyncGenerator<StreamChunk> {
    const session = await this.getSession(userId, sessionId);

    // Sanitize input
    const sanitized = sanitizeInput(input.content, {
      maxLength: 32000,
      stripHtml: true,
      normalizeUnicode: true,
      detectInjection: true,
    });

    if (sanitized.shouldBlock) {
      yield { type: 'error', error: 'Message contains patterns that cannot be processed.' };
      return;
    }

    // Create user message
    const userMsgId = `msg_${nanoid(16)}`;
    await this.prisma.chatMessage.create({
      data: {
        id: userMsgId,
        sessionId,
        parentId: input.parentId,
        role: 'user',
        content: sanitized.sanitized,
        contentFormat: 'text',
      },
    });

    // Create placeholder assistant message
    const assistantMsgId = `msg_${nanoid(16)}`;
    await this.prisma.chatMessage.create({
      data: {
        id: assistantMsgId,
        sessionId,
        parentId: userMsgId,
        role: 'assistant',
        content: '',
        contentFormat: 'markdown',
      },
    });

    // Build AI request
    const agent = session.agent;
    const systemPrompt = session.systemPrompt || agent?.systemPrompt;
    const model = session.model || agent?.model || 'llama3.2:3b';

    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      // Stream from AI Orchestrator
      const stream = this.aiOrchestratorClient.streamChat({
        message: sanitized.sanitized,
        sessionId,
        userId,
        systemPrompt,
        model,
        temperature: session.temperature ?? agent?.temperature ?? 0.7,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content') {
          fullContent += chunk.content;
          yield { type: 'content', content: chunk.content, messageId: assistantMsgId };
        } else if (chunk.type === 'tool_call') {
          yield { type: 'tool_call', toolCall: chunk.toolCall };
        } else if (chunk.type === 'canvas') {
          // Extract code blocks as canvas
          yield { type: 'canvas', canvas: chunk.canvas };
        } else if (chunk.type === 'usage') {
          promptTokens = chunk.usage!.promptTokens;
          completionTokens = chunk.usage!.completionTokens;
        }
      }

      // Update assistant message with final content
      await this.prisma.chatMessage.update({
        where: { id: assistantMsgId },
        data: {
          content: fullContent,
          model,
          promptTokens,
          completionTokens,
        },
      });

      // Update session stats
      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: {
          lastMessageAt: new Date(),
          messageCount: { increment: 2 },
          tokenCount: { increment: promptTokens + completionTokens },
        },
      });

      yield {
        type: 'done',
        messageId: assistantMsgId,
        usage: { promptTokens, completionTokens },
      };
    } catch (err) {
      this.logger.error({ err, sessionId }, 'Stream error');

      // Update message with error state
      await this.prisma.chatMessage.update({
        where: { id: assistantMsgId },
        data: {
          content: '[Error: Failed to generate response]',
          metadata: { error: true },
        },
      });

      yield { type: 'error', error: 'Failed to generate response' };
    }

    // Invalidate caches
    await this.invalidateSessionsCache(userId);
  }

  /**
   * Edit a message
   */
  async editMessage(
    userId: string,
    sessionId: string,
    messageId: string,
    input: EditMessageInput
  ): Promise<ChatMessage> {
    await this.getSession(userId, sessionId);

    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, sessionId, isDeleted: false },
    });

    if (!message) {
      throw Errors.notFound('Message', messageId);
    }

    // Only allow editing user messages
    if (message.role !== 'user') {
      throw Errors.badRequest('Cannot edit assistant messages');
    }

    // Sanitize input
    const sanitized = sanitizeInput(input.content, {
      maxLength: 32000,
      stripHtml: true,
      normalizeUnicode: true,
    });

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content: sanitized.sanitized,
        isEdited: true,
        editedAt: new Date(),
        metadata: {
          ...(message.metadata as object),
          previousContent: message.content,
        },
      },
    });

    await this.redis.del(`messages:${sessionId}:*`);

    return updated;
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    userId: string,
    sessionId: string,
    messageId: string
  ): Promise<void> {
    await this.getSession(userId, sessionId);

    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, sessionId, isDeleted: false },
    });

    if (!message) {
      throw Errors.notFound('Message', messageId);
    }

    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        content: '[Message deleted]',
      },
    });

    // Update session message count
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { messageCount: { decrement: 1 } },
    });

    await this.redis.del(`messages:${sessionId}:*`);
  }

  // ==========================================================================
  // Agents
  // ==========================================================================

  /**
   * Get all active agents
   */
  async getAgents(): Promise<Agent[]> {
    const cacheKey = 'agents:active';

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const agents = await this.prisma.agent.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    await this.redis.setex(cacheKey, CACHE.AGENT_TTL_SECONDS, JSON.stringify(agents));

    return agents;
  }

  /**
   * Get a single agent
   */
  async getAgent(agentId: string): Promise<Agent> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw Errors.notFound('Agent', agentId);
    }

    return agent;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async invalidateSessionsCache(userId: string): Promise<void> {
    const keys = await this.redis.keys(`sessions:${userId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private async generateSessionTitle(
    userId: string,
    sessionId: string,
    firstMessage: string
  ): Promise<void> {
    try {
      // Use AI to generate a title
      const response = await this.aiOrchestratorClient.processCommand({
        id: `title_${nanoid(8)}`,
        userId,
        command: `Generate a short (3-5 words) title for a conversation that starts with: "${firstMessage.slice(0, 200)}"`,
        model: 'llama3.2:3b',
        maxTokens: 30,
        temperature: 0.5,
      });

      const title = response.content.trim().replace(/["']/g, '').slice(0, 100);

      if (title) {
        await this.prisma.chatSession.update({
          where: { id: sessionId },
          data: { title },
        });
        await this.invalidateSessionsCache(userId);
      }
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'Failed to generate session title');
    }
  }
}
