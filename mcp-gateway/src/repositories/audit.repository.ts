/**
 * Audit Repository
 *
 * Logs all operations for compliance and debugging
 *
 * SEC-009: Sensitive fields (metadata, ipAddress, userAgent) are encrypted at rest
 * using AES-256-GCM encryption. The encryption is transparent - data is encrypted
 * on write and decrypted on read.
 */

import type { ContainerCradle } from '../container.js';
import type { EncryptionService } from '../infrastructure/encryption.js';

export interface AuditLogEntry {
  id: string;
  action: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface LogAuditData {
  action: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditRepository {
  private readonly prisma: ContainerCradle['prisma'];
  private readonly logger: ContainerCradle['logger'];
  private readonly redis: ContainerCradle['redis'];
  private readonly encryptionService: EncryptionService; // SEC-009

  // PERF-008: Batch queue for fire-and-forget audit logs
  private batchQueue: LogAuditData[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_INTERVAL_MS = 1000;

  constructor({ prisma, logger, redis, encryptionService }: ContainerCradle) {
    this.prisma = prisma;
    this.logger = logger;
    this.redis = redis;
    this.encryptionService = encryptionService; // SEC-009
  }

  /**
   * SEC-009: Encrypt sensitive fields before storage
   *
   * Metadata is stored as a JSON object with _enc marker for encrypted data.
   * This maintains compatibility with Prisma's Json type while allowing
   * transparent encryption/decryption.
   */
  private encryptSensitiveFields(data: LogAuditData): {
    metadata: Record<string, unknown>;
    ipAddress: string | null;
    userAgent: string | null;
  } {
    // Encrypt metadata - wrap in object with _enc marker
    let encryptedMetadata: Record<string, unknown> = {};
    if (data.metadata && Object.keys(data.metadata).length > 0) {
      if (this.encryptionService.isEnabled()) {
        // Store encrypted data with marker
        encryptedMetadata = {
          _enc: this.encryptionService.encryptJson(data.metadata),
        };
      } else {
        // Encryption disabled - store as plain JSON
        encryptedMetadata = data.metadata;
      }
    }

    return {
      metadata: encryptedMetadata,
      // Encrypt IP address
      ipAddress: data.ipAddress
        ? this.encryptionService.encryptString(data.ipAddress)
        : null,
      // Encrypt user agent
      userAgent: data.userAgent
        ? this.encryptionService.encryptString(data.userAgent)
        : null,
    };
  }

  /**
   * SEC-009: Decrypt sensitive fields after retrieval
   *
   * Handles both legacy unencrypted data and new encrypted data.
   * Encrypted metadata has _enc marker, legacy data is plain JSON.
   */
  private decryptSensitiveFields(record: {
    metadata: unknown;
    ipAddress: string | null;
    userAgent: string | null;
  }): {
    metadata: Record<string, unknown> | undefined;
    ipAddress: string | undefined;
    userAgent: string | undefined;
  } {
    let decryptedMetadata: Record<string, unknown> | undefined;

    if (record.metadata && typeof record.metadata === 'object' && record.metadata !== null) {
      const meta = record.metadata as Record<string, unknown>;

      if ('_enc' in meta && typeof meta._enc === 'string') {
        // Encrypted metadata - decrypt it
        try {
          decryptedMetadata = this.encryptionService.decryptJson(meta._enc);
        } catch {
          // Decryption failed - log and return empty
          this.logger.warn('Failed to decrypt audit metadata');
          decryptedMetadata = {};
        }
      } else {
        // Legacy unencrypted data - return as-is
        decryptedMetadata = meta;
      }
    }

    return {
      metadata: decryptedMetadata,
      ipAddress: record.ipAddress
        ? this.encryptionService.decryptString(record.ipAddress)
        : undefined,
      userAgent: record.userAgent
        ? this.encryptionService.decryptString(record.userAgent)
        : undefined,
    };
  }

  /**
   * Log an audit entry (awaited - use when audit log is critical)
   */
  async log(data: LogAuditData): Promise<void> {
    try {
      // SEC-009: Encrypt sensitive fields
      const encrypted = this.encryptSensitiveFields(data);

      await this.prisma.auditLog.create({
        data: {
          action: data.action,
          userId: data.userId,
          metadata: encrypted.metadata,
          ipAddress: encrypted.ipAddress,
          userAgent: encrypted.userAgent,
        },
      });
    } catch (err) {
      // Don't fail operations due to audit logging errors
      this.logger.error({ err, action: data.action }, 'Failed to write audit log');
    }
  }

  /**
   * PERF-008: Fire-and-forget audit logging
   *
   * Does not block the calling code. Batches writes for efficiency.
   * Use this for non-critical audit entries where latency matters.
   */
  logAsync(data: LogAuditData): void {
    // Add to batch queue
    this.batchQueue.push(data);

    // Flush immediately if batch is full
    if (this.batchQueue.length >= this.BATCH_SIZE) {
      this.flushBatch();
      return;
    }

    // Set timer for batch flush if not already set
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.BATCH_INTERVAL_MS);
    }
  }

  /**
   * Flush batched audit logs to database
   */
  private flushBatch(): void {
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Get current batch and reset queue
    const batch = this.batchQueue;
    this.batchQueue = [];

    if (batch.length === 0) {
      return;
    }

    // SEC-009: Encrypt sensitive fields for each entry
    const encryptedBatch = batch.map(entry => {
      const encrypted = this.encryptSensitiveFields(entry);
      return {
        action: entry.action,
        userId: entry.userId,
        metadata: encrypted.metadata,
        ipAddress: encrypted.ipAddress,
        userAgent: encrypted.userAgent,
      };
    });

    // Write batch to database (fire-and-forget)
    this.prisma.auditLog.createMany({
      data: encryptedBatch,
    })
      .then(() => {
        this.logger.debug({ count: batch.length }, 'Flushed audit log batch');
      })
      .catch((err) => {
        this.logger.error({ err, count: batch.length }, 'Failed to flush audit log batch');
      });
  }

  /**
   * Force flush any pending audit logs (call on shutdown)
   */
  async shutdown(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batchQueue.length > 0) {
      const batch = this.batchQueue;
      this.batchQueue = [];

      // SEC-009: Encrypt sensitive fields for each entry
      const encryptedBatch = batch.map(entry => {
        const encrypted = this.encryptSensitiveFields(entry);
        return {
          action: entry.action,
          userId: entry.userId,
          metadata: encrypted.metadata,
          ipAddress: encrypted.ipAddress,
          userAgent: encrypted.userAgent,
        };
      });

      try {
        await this.prisma.auditLog.createMany({
          data: encryptedBatch,
        });
        this.logger.info({ count: batch.length }, 'Flushed remaining audit logs on shutdown');
      } catch (err) {
        this.logger.error({ err, count: batch.length }, 'Failed to flush audit logs on shutdown');
      }
    }
  }

  /**
   * Query audit logs
   */
  async query(options: {
    userId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const where = {
      ...(options.userId && { userId: options.userId }),
      ...(options.action && { action: options.action }),
      ...(options.startDate || options.endDate
        ? {
            createdAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    const [results, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        take: options.limit || 100,
        skip: options.offset || 0,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // SEC-009: Decrypt sensitive fields
    return {
      entries: results.map((r) => {
        const decrypted = this.decryptSensitiveFields({
          metadata: r.metadata,
          ipAddress: r.ipAddress,
          userAgent: r.userAgent,
        });

        return {
          id: r.id,
          action: r.action,
          userId: r.userId || undefined,
          metadata: decrypted.metadata,
          ipAddress: decrypted.ipAddress,
          userAgent: decrypted.userAgent,
          createdAt: r.createdAt,
        };
      }),
      total,
    };
  }
}
