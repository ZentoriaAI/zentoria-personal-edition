/**
 * Rate Limiter Infrastructure
 *
 * Redis-based rate limiting with sliding window algorithm
 */

import type Redis from 'ioredis';
import { RedisKeys } from './redis.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetMs: number;
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
}

/**
 * Check and update rate limit for a given key
 *
 * Uses Redis sorted set with timestamps for sliding window rate limiting.
 * More accurate than simple counter approach.
 */
export async function checkRateLimit(
  redis: Redis,
  identifier: string,
  action: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = RedisKeys.rateLimit(`${action}:${identifier}`);
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const windowStart = now - windowMs;

  // Use Redis pipeline for atomic operations
  const pipeline = redis.pipeline();

  // Remove expired entries
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Count current requests in window
  pipeline.zcard(key);

  // Add current request
  pipeline.zadd(key, now, `${now}:${Math.random()}`);

  // Set expiry
  pipeline.expire(key, config.windowSeconds + 1);

  const results = await pipeline.exec();

  if (!results) {
    // Redis error, fail open (allow the request)
    return {
      allowed: true,
      remaining: config.limit - 1,
      limit: config.limit,
      resetMs: windowMs,
    };
  }

  // Get count from ZCARD result (index 1, result at index 1)
  const currentCount = (results[1][1] as number) || 0;

  if (currentCount >= config.limit) {
    // Over limit - remove the request we just added
    await redis.zremrangebyscore(key, now, now);

    // Get the oldest entry to calculate reset time
    const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const resetMs = oldest.length >= 2
      ? Math.max(0, parseInt(oldest[1], 10) + windowMs - now)
      : windowMs;

    return {
      allowed: false,
      remaining: 0,
      limit: config.limit,
      resetMs,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, config.limit - currentCount - 1),
    limit: config.limit,
    resetMs: windowMs,
  };
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
  redis: Redis,
  identifier: string,
  action: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = RedisKeys.rateLimit(`${action}:${identifier}`);
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const windowStart = now - windowMs;

  // Remove expired and count
  await redis.zremrangebyscore(key, 0, windowStart);
  const currentCount = await redis.zcard(key);

  return {
    allowed: currentCount < config.limit,
    remaining: Math.max(0, config.limit - currentCount),
    limit: config.limit,
    resetMs: windowMs,
  };
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitConfigs = {
  /** API key creation: 5 per hour per user */
  apiKeyCreation: {
    limit: 5,
    windowSeconds: 3600, // 1 hour
  },

  /** Login attempts: 10 per 15 minutes per IP */
  loginAttempts: {
    limit: 10,
    windowSeconds: 900, // 15 minutes
  },

  /** Password reset: 3 per hour per email */
  passwordReset: {
    limit: 3,
    windowSeconds: 3600, // 1 hour
  },

  /** File uploads: 100 per hour per user */
  fileUpload: {
    limit: 100,
    windowSeconds: 3600, // 1 hour
  },

  /** AI commands: 60 per minute per user */
  aiCommand: {
    limit: 60,
    windowSeconds: 60, // 1 minute
  },
} as const;
