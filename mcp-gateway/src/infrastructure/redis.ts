/**
 * Redis Client Configuration
 *
 * SEC-008: TLS Support
 * - Set REDIS_TLS=true to enable TLS
 * - Use rediss:// URL scheme for automatic TLS
 * - Optionally set REDIS_TLS_CA_CERT for custom CA
 * - Set REDIS_TLS_REJECT_UNAUTHORIZED=false for self-signed certs (dev only)
 */

import Redis, { RedisOptions } from 'ioredis';
import { readFileSync } from 'fs';
import { logger } from './logger.js';
import { Errors } from '../middleware/error-handler.js';

/**
 * Build TLS options for Redis connection
 */
function buildTlsOptions(): RedisOptions['tls'] | undefined {
  const redisUrl = process.env.REDIS_URL || '';
  const tlsEnabled = process.env.REDIS_TLS === 'true' || redisUrl.startsWith('rediss://');

  if (!tlsEnabled) {
    return undefined;
  }

  logger.info('Redis TLS enabled');

  const tlsOptions: RedisOptions['tls'] = {
    // Reject unauthorized certs by default (secure)
    rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
  };

  // Load custom CA certificate if provided
  const caCertPath = process.env.REDIS_TLS_CA_CERT;
  if (caCertPath) {
    try {
      tlsOptions.ca = readFileSync(caCertPath, 'utf-8');
      logger.info({ path: caCertPath }, 'Loaded Redis TLS CA certificate');
    } catch (err) {
      logger.error({ err, path: caCertPath }, 'Failed to load Redis TLS CA certificate');
      throw Errors.redisTlsError(`Failed to load CA certificate: ${caCertPath}`);
    }
  }

  // Load client certificate if provided (mutual TLS)
  const clientCertPath = process.env.REDIS_TLS_CERT;
  const clientKeyPath = process.env.REDIS_TLS_KEY;
  if (clientCertPath && clientKeyPath) {
    try {
      tlsOptions.cert = readFileSync(clientCertPath, 'utf-8');
      tlsOptions.key = readFileSync(clientKeyPath, 'utf-8');
      logger.info('Loaded Redis TLS client certificate for mutual TLS');
    } catch (err) {
      logger.error({ err }, 'Failed to load Redis TLS client certificate');
      throw Errors.redisTlsError('Failed to load client certificate');
    }
  }

  return tlsOptions;
}

export async function createRedisClient(): Promise<Redis> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisPassword = process.env.REDIS_PASSWORD;
  const tlsOptions = buildTlsOptions();

  const client = new Redis(redisUrl, {
    password: redisPassword || undefined,
    tls: tlsOptions,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error('Redis connection failed after 10 retries');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 100, 3000);
      logger.warn({ times, delay }, 'Retrying Redis connection');
      return delay;
    },
    lazyConnect: true,
  });

  client.on('connect', () => {
    logger.info('Redis connected');
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Redis error');
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  // Connect
  try {
    await client.connect();
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Redis');
    throw err;
  }

  return client;
}

/**
 * Redis key prefixes for different data types
 */
export const RedisKeys = {
  session: (id: string) => `session:${id}`,
  apiKey: (key: string) => `apikey:${key}`,
  rateLimit: (key: string) => `ratelimit:${key}`,
  cache: (key: string) => `cache:${key}`,
  lock: (key: string) => `lock:${key}`,
  pubsub: {
    commandResult: 'pubsub:command:result',
    fileUpload: 'pubsub:file:upload',
    workflow: 'pubsub:workflow',
  },
} as const;
