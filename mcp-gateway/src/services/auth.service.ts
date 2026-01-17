/**
 * Auth Service
 *
 * Handles JWT validation and user lookup via Auth Service (409)
 */

import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';

export interface UserInfo {
  id: string;
  email: string;
  name?: string;
  scopes: string[];
  roles?: string[];
  metadata?: Record<string, unknown>;
}

export class AuthService {
  private readonly authClient: ContainerCradle['authClient'];
  private readonly circuitBreaker: ContainerCradle['circuitBreaker'];
  private readonly redis: ContainerCradle['redis'];
  private readonly logger: ContainerCradle['logger'];

  constructor({
    authClient,
    circuitBreaker,
    redis,
    logger,
  }: ContainerCradle) {
    this.authClient = authClient;
    this.circuitBreaker = circuitBreaker;
    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Validate a JWT token and return user info
   */
  async validateToken(token: string): Promise<UserInfo | null> {
    // Check cache first
    const cacheKey = `token:${this.hashToken(token)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as UserInfo;
    }

    try {
      const result = await this.circuitBreaker.execute(
        'auth-service',
        () => this.authClient.validateToken(token),
        { timeout: 5000 }
      );

      if (!result.valid) {
        return null;
      }

      const userInfo: UserInfo = {
        id: result.userId,
        email: result.email,
        name: result.name,
        scopes: result.scopes || [],
        roles: result.roles,
        metadata: result.metadata,
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(userInfo));

      return userInfo;
    } catch (err) {
      this.logger.error({ err }, 'Token validation failed');

      // Check circuit state
      const state = this.circuitBreaker.getState('auth-service');
      if (state === 'open') {
        throw Errors.serviceUnavailable('Auth service');
      }

      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<UserInfo | null> {
    // Check cache first
    const cacheKey = `user:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as UserInfo;
    }

    try {
      const result = await this.circuitBreaker.execute(
        'auth-service',
        () => this.authClient.getUser(userId),
        { timeout: 5000 }
      );

      if (!result) {
        return null;
      }

      const userInfo: UserInfo = {
        id: result.id,
        email: result.email,
        name: result.name,
        scopes: result.scopes || [],
        roles: result.roles,
        metadata: result.metadata,
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(userInfo));

      return userInfo;
    } catch (err) {
      this.logger.error({ err, userId }, 'Get user failed');
      return null;
    }
  }

  /**
   * Invalidate cached user data
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.redis.del(`user:${userId}`);
  }

  /**
   * Hash token for cache key (don't store raw tokens)
   */
  private hashToken(token: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  }
}
