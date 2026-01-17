/**
 * Vault Service
 *
 * Handles secret management via HashiCorp Vault (403)
 */

import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';

export interface VaultSecret {
  data: Record<string, string>;
  metadata: {
    created_time: string;
    version: number;
  };
}

export class VaultService {
  private readonly circuitBreaker: ContainerCradle['circuitBreaker'];
  private readonly redis: ContainerCradle['redis'];
  private readonly logger: ContainerCradle['logger'];

  private readonly vaultUrl: string;
  private readonly vaultToken: string;
  private readonly secretsPath: string;

  constructor({
    circuitBreaker,
    redis,
    logger,
  }: ContainerCradle) {
    this.circuitBreaker = circuitBreaker;
    this.redis = redis;
    this.logger = logger;

    this.vaultUrl = process.env.VAULT_URL || 'http://vault:8200';
    this.vaultToken = process.env.VAULT_TOKEN || '';
    this.secretsPath = process.env.VAULT_SECRETS_PATH || 'secret/data/mcp-gateway';
  }

  /**
   * Get a secret from Vault
   */
  async getSecret(key: string): Promise<string | null> {
    // Check cache first
    const cacheKey = `vault:${key}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (!this.vaultToken) {
      this.logger.warn('Vault token not configured');
      return null;
    }

    try {
      const secret = await this.circuitBreaker.execute(
        'vault',
        async () => {
          const response = await fetch(`${this.vaultUrl}/v1/${this.secretsPath}`, {
            headers: {
              'X-Vault-Token': this.vaultToken,
            },
          });

          if (!response.ok) {
            throw Errors.vaultError(response.status);
          }

          const data = await response.json() as {
            data: { data: Record<string, string> };
          };
          return data.data.data;
        },
        { timeout: 5000 }
      );

      const value = secret[key];
      if (value) {
        // Cache for 5 minutes
        await this.redis.setex(cacheKey, 300, value);
      }

      return value || null;
    } catch (err) {
      this.logger.error({ err, key }, 'Failed to get secret from Vault');
      return null;
    }
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(keys: string[]): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};

    // Check cache first for each key
    const uncachedKeys: string[] = [];
    for (const key of keys) {
      const cached = await this.redis.get(`vault:${key}`);
      if (cached) {
        result[key] = cached;
      } else {
        uncachedKeys.push(key);
      }
    }

    // If all keys were cached, return early
    if (uncachedKeys.length === 0) {
      return result;
    }

    // Fetch from Vault
    if (!this.vaultToken) {
      for (const key of uncachedKeys) {
        result[key] = null;
      }
      return result;
    }

    try {
      const secrets = await this.circuitBreaker.execute(
        'vault',
        async () => {
          const response = await fetch(`${this.vaultUrl}/v1/${this.secretsPath}`, {
            headers: {
              'X-Vault-Token': this.vaultToken,
            },
          });

          if (!response.ok) {
            throw Errors.vaultError(response.status);
          }

          const data = await response.json() as {
            data: { data: Record<string, string> };
          };
          return data.data.data;
        },
        { timeout: 5000 }
      );

      for (const key of uncachedKeys) {
        const value = secrets[key] || null;
        result[key] = value;

        if (value) {
          await this.redis.setex(`vault:${key}`, 300, value);
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to get secrets from Vault');
      for (const key of uncachedKeys) {
        result[key] = null;
      }
    }

    return result;
  }

  /**
   * Invalidate cached secrets
   */
  async invalidateCache(): Promise<void> {
    // Scan and delete all vault keys
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'vault:*',
        'COUNT',
        100
      );
      cursor = newCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');

    this.logger.info('Vault cache invalidated');
  }

  /**
   * Check Vault health
   */
  async checkHealth(): Promise<{ healthy: boolean; sealed?: boolean; message?: string }> {
    try {
      const response = await fetch(`${this.vaultUrl}/v1/sys/health`, {
        method: 'GET',
      });

      const data = await response.json() as {
        sealed: boolean;
        initialized: boolean;
      };

      return {
        healthy: !data.sealed && data.initialized,
        sealed: data.sealed,
      };
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }
}
