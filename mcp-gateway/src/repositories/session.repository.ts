/**
 * Session Repository
 *
 * Manages conversation sessions for context continuity
 * Uses secondary Redis SET index for efficient user session lookups
 */

import { nanoid } from 'nanoid';
import type { ContainerCradle } from '../container.js';

export interface SessionData {
  id: string;
  userId: string;
  messages: SessionMessage[];
  context?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const SESSION_TTL_SECONDS = 3600 * 24; // 24 hours

/**
 * Redis key helpers for sessions
 */
const SessionKeys = {
  /** Primary session data key */
  session: (id: string) => `session:${id}`,

  /** Secondary index: SET of session IDs for a user (PERF-001) */
  userSessions: (userId: string) => `user:sessions:${userId}`,
};

export class SessionRepository {
  private readonly redis: ContainerCradle['redis'];
  private readonly logger: ContainerCradle['logger'];

  constructor({ redis, logger }: ContainerCradle) {
    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Create a new session
   */
  async create(userId: string, context?: Record<string, unknown>): Promise<SessionData> {
    const id = `sess_${nanoid(16)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

    const session: SessionData = {
      id,
      userId,
      messages: [],
      context,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    // Use pipeline for atomic operations
    const pipeline = this.redis.pipeline();

    // Store session data
    pipeline.setex(
      SessionKeys.session(id),
      SESSION_TTL_SECONDS,
      JSON.stringify(session)
    );

    // PERF-001: Add to user's session index
    pipeline.sadd(SessionKeys.userSessions(userId), id);
    // Set TTL on the index slightly longer than session to ensure cleanup
    pipeline.expire(SessionKeys.userSessions(userId), SESSION_TTL_SECONDS + 3600);

    await pipeline.exec();

    return session;
  }

  /**
   * Get a session by ID
   */
  async get(id: string): Promise<SessionData | null> {
    const data = await this.redis.get(SessionKeys.session(id));
    if (!data) {
      return null;
    }

    return JSON.parse(data) as SessionData;
  }

  /**
   * Add a message to a session
   */
  async addMessage(
    sessionId: string,
    message: Omit<SessionMessage, 'timestamp'>
  ): Promise<SessionData | null> {
    const session = await this.get(sessionId);
    if (!session) {
      return null;
    }

    const newMessage: SessionMessage = {
      ...message,
      timestamp: new Date().toISOString(),
    };

    session.messages.push(newMessage);
    session.updatedAt = new Date();

    // Refresh TTL
    await this.redis.setex(
      SessionKeys.session(sessionId),
      SESSION_TTL_SECONDS,
      JSON.stringify(session)
    );

    return session;
  }

  /**
   * Get recent messages from a session
   */
  async getRecentMessages(
    sessionId: string,
    count: number
  ): Promise<SessionMessage[]> {
    const session = await this.get(sessionId);
    if (!session) {
      return [];
    }

    return session.messages.slice(-count);
  }

  /**
   * Update session context
   */
  async updateContext(
    sessionId: string,
    context: Record<string, unknown>
  ): Promise<SessionData | null> {
    const session = await this.get(sessionId);
    if (!session) {
      return null;
    }

    session.context = { ...session.context, ...context };
    session.updatedAt = new Date();

    await this.redis.setex(
      SessionKeys.session(sessionId),
      SESSION_TTL_SECONDS,
      JSON.stringify(session)
    );

    return session;
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<void> {
    // Get session first to know the userId for index cleanup
    const session = await this.get(sessionId);

    const pipeline = this.redis.pipeline();

    // Delete session data
    pipeline.del(SessionKeys.session(sessionId));

    // PERF-001: Remove from user's session index
    if (session) {
      pipeline.srem(SessionKeys.userSessions(session.userId), sessionId);
    }

    await pipeline.exec();
  }

  /**
   * List user's active sessions
   * PERF-001: Uses secondary index for O(m) lookup where m = user's sessions
   * instead of O(n) scan where n = all sessions
   */
  async listByUser(userId: string): Promise<SessionData[]> {
    // Get session IDs from secondary index
    const sessionIds = await this.redis.smembers(SessionKeys.userSessions(userId));

    if (sessionIds.length === 0) {
      return [];
    }

    // Fetch all sessions in parallel using MGET
    const sessionKeys = sessionIds.map(id => SessionKeys.session(id));
    const sessionDataArray = await this.redis.mget(...sessionKeys);

    const sessions: SessionData[] = [];
    const expiredSessionIds: string[] = [];

    for (let i = 0; i < sessionDataArray.length; i++) {
      const data = sessionDataArray[i];
      const sessionId = sessionIds[i];

      if (data) {
        const session = JSON.parse(data) as SessionData;
        sessions.push(session);
      } else {
        // Session expired but still in index - mark for cleanup
        expiredSessionIds.push(sessionId);
      }
    }

    // Cleanup expired sessions from index (fire-and-forget)
    if (expiredSessionIds.length > 0) {
      this.redis.srem(SessionKeys.userSessions(userId), ...expiredSessionIds)
        .catch(err => this.logger.warn({ err }, 'Failed to cleanup expired sessions from index'));
    }

    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Count user's active sessions
   */
  async countByUser(userId: string): Promise<number> {
    return this.redis.scard(SessionKeys.userSessions(userId));
  }

  /**
   * Cleanup expired sessions from user's index
   * Can be run periodically via a background job
   */
  async cleanupUserIndex(userId: string): Promise<number> {
    const sessionIds = await this.redis.smembers(SessionKeys.userSessions(userId));
    const expiredIds: string[] = [];

    // Check which sessions still exist
    const sessionKeys = sessionIds.map(id => SessionKeys.session(id));
    if (sessionKeys.length === 0) {
      return 0;
    }

    const exists = await this.redis.mget(...sessionKeys);

    for (let i = 0; i < exists.length; i++) {
      if (!exists[i]) {
        expiredIds.push(sessionIds[i]);
      }
    }

    if (expiredIds.length > 0) {
      await this.redis.srem(SessionKeys.userSessions(userId), ...expiredIds);
    }

    return expiredIds.length;
  }
}
