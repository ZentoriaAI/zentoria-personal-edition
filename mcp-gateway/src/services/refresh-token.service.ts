/**
 * Refresh Token Service
 *
 * SEC-010: JWT refresh token implementation with token rotation
 *
 * Features:
 * - Opaque refresh tokens stored in Redis
 * - Token rotation on each refresh (old token invalidated)
 * - Automatic expiration (configurable, default 7 days)
 * - Token family tracking for security
 * - Revocation support (single token or all user tokens)
 */

import { randomBytes, createHash } from 'crypto';
import type { ContainerCradle } from '../container.js';

// Refresh token configuration
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7', 10);
const REFRESH_TOKEN_EXPIRY_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
const REFRESH_TOKEN_PREFIX = 'refresh:';
const USER_TOKENS_PREFIX = 'user:refresh:';
const TOKEN_FAMILY_PREFIX = 'family:';

export interface RefreshTokenData {
  userId: string;
  email: string;
  scopes: string[];
  familyId: string; // Token family for detecting reuse attacks
  createdAt: number;
  rotatedFrom?: string; // Previous token ID (if rotated)
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // Access token expiry in seconds
  refreshExpiresIn: number; // Refresh token expiry in seconds
}

export class RefreshTokenService {
  private readonly redis: ContainerCradle['redis'];
  private readonly logger: ContainerCradle['logger'];
  private readonly auditRepository: ContainerCradle['auditRepository'];

  constructor({ redis, logger, auditRepository }: ContainerCradle) {
    this.redis = redis;
    this.logger = logger;
    this.auditRepository = auditRepository;
  }

  /**
   * Generate a new refresh token
   */
  async createRefreshToken(
    userId: string,
    email: string,
    scopes: string[],
    familyId?: string
  ): Promise<{ token: string; tokenId: string; familyId: string }> {
    // Generate a cryptographically secure random token
    const tokenBytes = randomBytes(32);
    const token = tokenBytes.toString('base64url');

    // Create token ID (hash of token for storage key)
    const tokenId = this.hashToken(token);

    // Create or use existing token family
    const family = familyId || randomBytes(16).toString('hex');

    const tokenData: RefreshTokenData = {
      userId,
      email,
      scopes,
      familyId: family,
      createdAt: Date.now(),
    };

    // Store token in Redis with expiration
    const key = REFRESH_TOKEN_PREFIX + tokenId;
    await this.redis.setex(key, REFRESH_TOKEN_EXPIRY_SECONDS, JSON.stringify(tokenData));

    // Add token to user's token set (for revocation)
    const userKey = USER_TOKENS_PREFIX + userId;
    await this.redis.sadd(userKey, tokenId);
    await this.redis.expire(userKey, REFRESH_TOKEN_EXPIRY_SECONDS);

    this.logger.debug({ userId, tokenId: tokenId.slice(0, 8) }, 'Created refresh token');

    return { token, tokenId, familyId: family };
  }

  /**
   * Validate and rotate a refresh token
   *
   * Returns new token pair if valid, null if invalid
   * Implements token rotation: each refresh invalidates the old token
   */
  async rotateRefreshToken(
    token: string,
    server: { jwt: { sign: (payload: object) => string } }
  ): Promise<TokenPair | null> {
    const tokenId = this.hashToken(token);
    const key = REFRESH_TOKEN_PREFIX + tokenId;

    // Get token data atomically
    const dataStr = await this.redis.get(key);
    if (!dataStr) {
      this.logger.warn({ tokenId: tokenId.slice(0, 8) }, 'Refresh token not found or expired');
      return null;
    }

    let tokenData: RefreshTokenData;
    try {
      tokenData = JSON.parse(dataStr);
    } catch {
      this.logger.error({ tokenId: tokenId.slice(0, 8) }, 'Invalid refresh token data');
      await this.redis.del(key);
      return null;
    }

    // Invalidate old token immediately (token rotation)
    await this.redis.del(key);

    // Remove old token from user's set
    const userKey = USER_TOKENS_PREFIX + tokenData.userId;
    await this.redis.srem(userKey, tokenId);

    // Create new refresh token in the same family
    const { token: newRefreshToken, tokenId: newTokenId } = await this.createRefreshToken(
      tokenData.userId,
      tokenData.email,
      tokenData.scopes,
      tokenData.familyId
    );

    // Update the new token with rotation info
    const newKey = REFRESH_TOKEN_PREFIX + newTokenId;
    const newTokenData: RefreshTokenData = {
      ...tokenData,
      createdAt: Date.now(),
      rotatedFrom: tokenId,
    };
    await this.redis.setex(newKey, REFRESH_TOKEN_EXPIRY_SECONDS, JSON.stringify(newTokenData));

    // Generate new access token
    const accessToken = server.jwt.sign({
      sub: tokenData.userId,
      email: tokenData.email,
      scopes: tokenData.scopes,
    });

    // Log token rotation
    this.auditRepository.logAsync({
      action: 'refresh_token_rotated',
      userId: tokenData.userId,
      metadata: {
        oldTokenId: tokenId.slice(0, 8),
        newTokenId: newTokenId.slice(0, 8),
        familyId: tokenData.familyId,
      },
    });

    const accessExpiresIn = parseInt(process.env.JWT_EXPIRES_IN?.replace(/[^\d]/g, '') || '3600', 10);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: accessExpiresIn,
      refreshExpiresIn: REFRESH_TOKEN_EXPIRY_SECONDS,
    };
  }

  /**
   * Revoke a specific refresh token
   */
  async revokeToken(token: string): Promise<boolean> {
    const tokenId = this.hashToken(token);
    const key = REFRESH_TOKEN_PREFIX + tokenId;

    const dataStr = await this.redis.get(key);
    if (!dataStr) {
      return false;
    }

    const tokenData: RefreshTokenData = JSON.parse(dataStr);

    // Delete the token
    await this.redis.del(key);

    // Remove from user's token set
    const userKey = USER_TOKENS_PREFIX + tokenData.userId;
    await this.redis.srem(userKey, tokenId);

    // Log revocation
    this.auditRepository.logAsync({
      action: 'refresh_token_revoked',
      userId: tokenData.userId,
      metadata: {
        tokenId: tokenId.slice(0, 8),
        familyId: tokenData.familyId,
      },
    });

    this.logger.debug({ userId: tokenData.userId, tokenId: tokenId.slice(0, 8) }, 'Refresh token revoked');

    return true;
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices)
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    const userKey = USER_TOKENS_PREFIX + userId;
    const tokenIds = await this.redis.smembers(userKey);

    if (tokenIds.length === 0) {
      return 0;
    }

    // Delete all tokens
    const tokenKeys = tokenIds.map((id) => REFRESH_TOKEN_PREFIX + id);
    await this.redis.del(...tokenKeys);

    // Clear user's token set
    await this.redis.del(userKey);

    // Log revocation
    this.auditRepository.logAsync({
      action: 'all_refresh_tokens_revoked',
      userId,
      metadata: {
        count: tokenIds.length,
      },
    });

    this.logger.info({ userId, count: tokenIds.length }, 'All user refresh tokens revoked');

    return tokenIds.length;
  }

  /**
   * Revoke all tokens in a token family (used when detecting token reuse)
   */
  async revokeFamilyTokens(familyId: string, userId: string): Promise<void> {
    const userKey = USER_TOKENS_PREFIX + userId;
    const tokenIds = await this.redis.smembers(userKey);

    for (const tokenId of tokenIds) {
      const key = REFRESH_TOKEN_PREFIX + tokenId;
      const dataStr = await this.redis.get(key);
      if (dataStr) {
        const tokenData: RefreshTokenData = JSON.parse(dataStr);
        if (tokenData.familyId === familyId) {
          await this.redis.del(key);
          await this.redis.srem(userKey, tokenId);
        }
      }
    }

    this.auditRepository.logAsync({
      action: 'token_family_revoked',
      userId,
      metadata: { familyId },
    });

    this.logger.warn({ userId, familyId }, 'Token family revoked (possible token reuse attack)');
  }

  /**
   * Get all active token count for a user
   */
  async getUserTokenCount(userId: string): Promise<number> {
    const userKey = USER_TOKENS_PREFIX + userId;
    return this.redis.scard(userKey);
  }

  /**
   * Hash token for storage key (SHA-256)
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
