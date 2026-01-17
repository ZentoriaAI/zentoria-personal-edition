/**
 * API Key Service
 *
 * Handles API key generation, validation, and management
 */

import { nanoid } from 'nanoid';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';
import { RedisKeys } from '../infrastructure/redis.js';

// Validation schemas
export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum([
    'files.read',
    'files.write',
    'files.delete',
    'ai.chat',
    'ai.complete',
    'workflows.trigger',
    'workflows.read',
    'email.send',
    'keys.manage',
    'admin',
  ])).min(1),
  expiresIn: z.string().regex(/^(\d+)(d|w|m|y)$/).optional(),
  rateLimit: z.object({
    requestsPerMinute: z.number().min(1).max(1000).optional(),
    requestsPerDay: z.number().min(1).max(100000).optional(),
  }).optional(),
});

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeySchema>;

export interface ApiKeyData {
  id: string;
  userId: string;
  userEmail: string;
  name: string;
  scopes: string[];
  hashedKey: string;
  prefix: string;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ApiKeyResponse {
  id: string;
  key: string;
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt?: string;
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  scopes: string[];
  prefix: string;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

// Key format: znt_live_sk_<random>
const KEY_PREFIX = process.env.NODE_ENV === 'production' ? 'znt_live' : 'znt_test';

export class ApiKeyService {
  private readonly apiKeyRepository: ContainerCradle['apiKeyRepository'];
  private readonly auditRepository: ContainerCradle['auditRepository'];
  private readonly redis: ContainerCradle['redis'];
  private readonly logger: ContainerCradle['logger'];

  constructor({
    apiKeyRepository,
    auditRepository,
    redis,
    logger,
  }: ContainerCradle) {
    this.apiKeyRepository = apiKeyRepository;
    this.auditRepository = auditRepository;
    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Create a new API key for a user
   *
   * @param userId - The unique identifier of the user creating the key
   * @param userEmail - The email address of the user for audit purposes
   * @param request - The key creation request containing name, scopes, and optional expiration
   * @returns The created API key data including the raw key (only returned once)
   * @throws {AppError} If the duration format is invalid
   */
  async createKey(
    userId: string,
    userEmail: string,
    request: CreateApiKeyRequest
  ): Promise<ApiKeyResponse> {
    const keyId = `key_${nanoid(16)}`;

    // Generate secure random key
    const secretPart = randomBytes(24).toString('base64url');
    const rawKey = `${KEY_PREFIX}_sk_${secretPart}`;

    // Hash for storage (never store raw key)
    const hashedKey = this.hashKey(rawKey);

    // Store first 8 chars for identification
    const prefix = rawKey.slice(0, 12);

    // Calculate expiration
    let expiresAt: Date | undefined;
    if (request.expiresIn) {
      expiresAt = this.calculateExpiration(request.expiresIn);
    }

    this.logger.info({ keyId, userId, name: request.name }, 'Creating API key');

    // Store in database
    const key = await this.apiKeyRepository.create({
      id: keyId,
      userId,
      userEmail,
      name: request.name,
      scopes: request.scopes,
      hashedKey,
      prefix,
      expiresAt,
      rateLimitPerMinute: request.rateLimit?.requestsPerMinute,
      rateLimitPerDay: request.rateLimit?.requestsPerDay,
    });

    // Log audit
    await this.auditRepository.log({
      action: 'api_key_created',
      userId,
      metadata: {
        keyId,
        name: request.name,
        scopes: request.scopes,
      },
    });

    return {
      id: keyId,
      key: rawKey, // Only returned once!
      name: request.name,
      scopes: request.scopes,
      createdAt: key.createdAt.toISOString(),
      expiresAt: expiresAt?.toISOString(),
    };
  }

  /**
   * Validate an API key and return associated data
   *
   * Uses Redis caching with 5-minute TTL for performance.
   * SEC-005: Uses constant-time comparison to prevent timing attacks.
   *
   * @param rawKey - The raw API key string (e.g., "znt_live_sk_...")
   * @returns The API key data if valid and not expired, null otherwise
   */
  async validateKey(rawKey: string): Promise<ApiKeyData | null> {
    // Check format
    if (!rawKey.startsWith('znt_')) {
      return null;
    }

    // Check cache first
    const cacheKey = RedisKeys.apiKey(this.hashKey(rawKey));
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached) as ApiKeyData;
      // Check expiration
      if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
        await this.redis.del(cacheKey);
        return null;
      }
      return data;
    }

    // Look up by prefix (first 12 chars)
    const prefix = rawKey.slice(0, 12);
    const keys = await this.apiKeyRepository.findByPrefix(prefix);

    for (const key of keys) {
      // Constant-time comparison
      const hashedInput = this.hashKey(rawKey);
      if (this.secureCompare(hashedInput, key.hashedKey)) {
        // Check expiration
        if (key.expiresAt && key.expiresAt < new Date()) {
          return null;
        }

        // Update last used
        await this.apiKeyRepository.updateLastUsed(key.id);

        // Cache for 5 minutes
        await this.redis.setex(cacheKey, 300, JSON.stringify(key));

        return key;
      }
    }

    return null;
  }

  /**
   * List all API keys for a user
   *
   * @param userId - The unique identifier of the user
   * @returns Array of API key metadata (without the actual key values)
   */
  async listKeys(userId: string): Promise<ApiKeyListItem[]> {
    const keys = await this.apiKeyRepository.findByUser(userId);

    return keys.map(key => ({
      id: key.id,
      name: key.name,
      scopes: key.scopes,
      prefix: key.prefix,
      lastUsedAt: key.lastUsedAt?.toISOString(),
      createdAt: key.createdAt.toISOString(),
      expiresAt: key.expiresAt?.toISOString(),
    }));
  }

  /**
   * Revoke an API key
   *
   * Deletes the key from the database and invalidates the Redis cache.
   *
   * @param userId - The unique identifier of the user revoking the key
   * @param keyId - The unique identifier of the API key to revoke
   * @throws {AppError} NOT_FOUND if the key doesn't exist
   * @throws {AppError} FORBIDDEN if the user doesn't own the key
   */
  async revokeKey(userId: string, keyId: string): Promise<void> {
    const key = await this.apiKeyRepository.findById(keyId);

    if (!key) {
      throw Errors.notFound('API key', keyId);
    }

    if (key.userId !== userId) {
      throw Errors.forbidden('You do not have permission to revoke this key');
    }

    this.logger.info({ keyId, userId }, 'Revoking API key');

    // Delete from database
    await this.apiKeyRepository.delete(keyId);

    // Invalidate cache
    const cacheKey = RedisKeys.apiKey(key.hashedKey);
    await this.redis.del(cacheKey);

    // Log audit
    await this.auditRepository.log({
      action: 'api_key_revoked',
      userId,
      metadata: {
        keyId,
        name: key.name,
      },
    });
  }

  /**
   * Hash an API key for storage
   */
  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * Constant-time string comparison
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Calculate expiration date from duration string
   */
  private calculateExpiration(duration: string): Date {
    const match = duration.match(/^(\d+)(d|w|m|y)$/);
    if (!match) {
      throw Errors.badRequest('Invalid duration format');
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const now = new Date();
    switch (unit) {
      case 'd':
        now.setDate(now.getDate() + value);
        break;
      case 'w':
        now.setDate(now.getDate() + value * 7);
        break;
      case 'm':
        now.setMonth(now.getMonth() + value);
        break;
      case 'y':
        now.setFullYear(now.getFullYear() + value);
        break;
    }

    return now;
  }
}
