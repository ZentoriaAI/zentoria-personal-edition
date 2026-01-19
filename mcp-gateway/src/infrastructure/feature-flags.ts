/**
 * Feature Flags Infrastructure
 *
 * Provides gradual feature rollout with:
 * - Percentage-based rollouts
 * - User-specific enabling/disabling
 * - A/B testing capabilities
 * - Environment-specific configuration
 * - Runtime flag updates
 */

import { Redis } from 'ioredis';
import { logger } from './logger.js';

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  exceptionUsers?: string[]; // Users always enabled
  blockedUsers?: string[]; // Users always disabled
}

export interface FeatureFlagConfig {
  [flagName: string]: FeatureFlag;
}

export interface RolloutResult {
  isEnabled: boolean;
  reason: 'disabled' | 'rollout' | 'exception' | 'blocked' | 'not_found';
  rolloutPercentage: number;
}

/**
 * Feature Flags Manager
 *
 * Manages feature flags with Redis caching and gradual rollouts
 */
export class FeatureFlagsManager {
  private redis: Redis;
  private localCache: Map<string, FeatureFlag> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes
  private lastCacheUpdate = 0;

  constructor(redis: Redis) {
    this.redis = redis;
    this.loadFlags();
  }

  /**
   * Load flags from Redis or use defaults
   */
  private async loadFlags(): Promise<void> {
    try {
      const flags = await this.redis.get('feature:flags:all');
      if (flags) {
        const parsed = JSON.parse(flags);
        Object.entries(parsed).forEach(([name, flag]) => {
          this.localCache.set(name, flag as FeatureFlag);
        });
      } else {
        // Initialize with default flags
        await this.initializeDefaultFlags();
      }
      this.lastCacheUpdate = Date.now();
    } catch (error) {
      logger.error({ error }, 'Failed to load feature flags');
      // Graceful degradation: all flags disabled
    }
  }

  /**
   * Initialize default feature flags
   */
  private async initializeDefaultFlags(): Promise<void> {
    const defaults: FeatureFlagConfig = {
      'chat-v2': {
        name: 'chat-v2',
        enabled: false,
        rolloutPercentage: 0,
        description: 'Chat V2 with improved UI and performance',
      },
      'rag-search': {
        name: 'rag-search',
        enabled: true,
        rolloutPercentage: 100,
        description: 'RAG-based semantic search',
      },
      'websocket-compression': {
        name: 'websocket-compression',
        enabled: false,
        rolloutPercentage: 0,
        description: 'WebSocket message compression',
      },
      'new-vector-db': {
        name: 'new-vector-db',
        enabled: false,
        rolloutPercentage: 0,
        description: 'Migration to new vector database',
      },
      'streaming-responses': {
        name: 'streaming-responses',
        enabled: true,
        rolloutPercentage: 50,
        description: 'Streaming API responses',
      },
    };

    for (const [name, flag] of Object.entries(defaults)) {
      this.localCache.set(name, flag);
    }

    await this.saveFlags();
  }

  /**
   * Save flags to Redis
   */
  private async saveFlags(): Promise<void> {
    try {
      const flags: FeatureFlagConfig = {};
      this.localCache.forEach((flag, name) => {
        flags[name] = flag;
      });
      await this.redis.set(
        'feature:flags:all',
        JSON.stringify(flags),
        'EX',
        24 * 60 * 60 // 24 hours
      );
    } catch (error) {
      logger.error({ error }, 'Failed to save feature flags');
    }
  }

  /**
   * Get a feature flag
   */
  getFlag(flagName: string): FeatureFlag | undefined {
    return this.localCache.get(flagName);
  }

  /**
   * Check if a feature is enabled for a user
   *
   * Uses deterministic rollout based on userId hash
   */
  isFeatureEnabled(flagName: string, userId: string): RolloutResult {
    const flag = this.localCache.get(flagName);

    if (!flag) {
      return {
        isEnabled: false,
        reason: 'not_found',
        rolloutPercentage: 0,
      };
    }

    // Check if user is explicitly blocked
    if (flag.blockedUsers?.includes(userId)) {
      return {
        isEnabled: false,
        reason: 'blocked',
        rolloutPercentage: flag.rolloutPercentage,
      };
    }

    // Check if user is in exception list
    if (flag.exceptionUsers?.includes(userId)) {
      return {
        isEnabled: true,
        reason: 'exception',
        rolloutPercentage: flag.rolloutPercentage,
      };
    }

    // Feature not enabled at all
    if (!flag.enabled) {
      return {
        isEnabled: false,
        reason: 'disabled',
        rolloutPercentage: flag.rolloutPercentage,
      };
    }

    // Check rollout percentage based on user hash
    const hash = this.hashUserId(userId);
    const isInRollout = hash % 100 < flag.rolloutPercentage;

    return {
      isEnabled: isInRollout,
      reason: 'rollout',
      rolloutPercentage: flag.rolloutPercentage,
    };
  }

  /**
   * Hash user ID to deterministic value
   *
   * Ensures same user always gets same rollout result
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Update a feature flag
   */
  async updateFlag(
    flagName: string,
    updates: Partial<FeatureFlag>
  ): Promise<FeatureFlag> {
    const flag = this.localCache.get(flagName);

    if (!flag) {
      throw new Error(`Feature flag not found: ${flagName}`);
    }

    const updated = {
      ...flag,
      ...updates,
      updatedAt: new Date(),
    };

    this.localCache.set(flagName, updated);
    await this.saveFlags();

    // Invalidate caches
    await this.redis.del(`feature:flag:${flagName}`);

    logger.info(
      { flagName, updates },
      'Feature flag updated'
    );

    return updated;
  }

  /**
   * Enable/disable a feature globally
   */
  async setFeatureEnabled(
    flagName: string,
    enabled: boolean
  ): Promise<FeatureFlag> {
    return this.updateFlag(flagName, { enabled });
  }

  /**
   * Set rollout percentage
   */
  async setRolloutPercentage(
    flagName: string,
    percentage: number
  ): Promise<FeatureFlag> {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Rollout percentage must be between 0 and 100');
    }
    return this.updateFlag(flagName, { rolloutPercentage: percentage });
  }

  /**
   * Add user to exception list (always enabled)
   */
  async addExceptionUser(flagName: string, userId: string): Promise<FeatureFlag> {
    const flag = this.localCache.get(flagName);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagName}`);
    }

    const exceptions = flag.exceptionUsers || [];
    if (!exceptions.includes(userId)) {
      exceptions.push(userId);
    }

    return this.updateFlag(flagName, { exceptionUsers: exceptions });
  }

  /**
   * Remove user from exception list
   */
  async removeExceptionUser(flagName: string, userId: string): Promise<FeatureFlag> {
    const flag = this.localCache.get(flagName);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagName}`);
    }

    const exceptions = flag.exceptionUsers || [];
    const updated = exceptions.filter((id) => id !== userId);

    return this.updateFlag(flagName, { exceptionUsers: updated });
  }

  /**
   * Add user to blocked list (always disabled)
   */
  async blockUser(flagName: string, userId: string): Promise<FeatureFlag> {
    const flag = this.localCache.get(flagName);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagName}`);
    }

    const blocked = flag.blockedUsers || [];
    if (!blocked.includes(userId)) {
      blocked.push(userId);
    }

    return this.updateFlag(flagName, { blockedUsers: blocked });
  }

  /**
   * Remove user from blocked list
   */
  async unblockUser(flagName: string, userId: string): Promise<FeatureFlag> {
    const flag = this.localCache.get(flagName);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagName}`);
    }

    const blocked = flag.blockedUsers || [];
    const updated = blocked.filter((id) => id !== userId);

    return this.updateFlag(flagName, { blockedUsers: updated });
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): FeatureFlagConfig {
    const flags: FeatureFlagConfig = {};
    this.localCache.forEach((flag, name) => {
      flags[name] = flag;
    });
    return flags;
  }

  /**
   * Refresh cache from Redis
   */
  async refreshCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate > this.cacheExpiry) {
      await this.loadFlags();
    }
  }

  /**
   * Create a new feature flag
   */
  async createFlag(flag: FeatureFlag): Promise<FeatureFlag> {
    if (this.localCache.has(flag.name)) {
      throw new Error(`Feature flag already exists: ${flag.name}`);
    }

    const newFlag: FeatureFlag = {
      ...flag,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.localCache.set(flag.name, newFlag);
    await this.saveFlags();

    logger.info({ flagName: flag.name }, 'Feature flag created');

    return newFlag;
  }

  /**
   * Delete a feature flag
   */
  async deleteFlag(flagName: string): Promise<void> {
    if (!this.localCache.has(flagName)) {
      throw new Error(`Feature flag not found: ${flagName}`);
    }

    this.localCache.delete(flagName);
    await this.saveFlags();
    await this.redis.del(`feature:flag:${flagName}`);

    logger.info({ flagName }, 'Feature flag deleted');
  }
}

/**
 * Global feature flags instance
 */
let featureFlagsManager: FeatureFlagsManager;

/**
 * Initialize feature flags manager
 */
export function initializeFeatureFlags(redis: Redis): FeatureFlagsManager {
  featureFlagsManager = new FeatureFlagsManager(redis);
  return featureFlagsManager;
}

/**
 * Get feature flags manager instance
 */
export function getFeatureFlagsManager(): FeatureFlagsManager {
  if (!featureFlagsManager) {
    throw new Error('Feature flags manager not initialized');
  }
  return featureFlagsManager;
}

/**
 * Helper function: Check if feature is enabled for user
 */
export function isFeatureEnabled(flagName: string, userId: string): boolean {
  const manager = getFeatureFlagsManager();
  return manager.isFeatureEnabled(flagName, userId).isEnabled;
}

/**
 * Helper function: Get feature flag
 */
export function getFeatureFlag(flagName: string): FeatureFlag | undefined {
  const manager = getFeatureFlagsManager();
  return manager.getFlag(flagName);
}
