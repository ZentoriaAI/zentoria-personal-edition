/**
 * File Repository
 *
 * PERF-004: Added file size limits to prevent memory issues with large files.
 */

import type { ContainerCradle } from '../container.js';
import { SIZE_LIMITS } from '../config/constants.js';

/**
 * PERF-004: Maximum file size for content retrieval (10MB)
 * Files larger than this should be downloaded via presigned URL instead.
 */
const MAX_CONTENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface FileRecord {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  purpose: string;
  checksum: string;
  objectName: string;
  metadata?: Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFileData {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  purpose: string;
  checksum: string;
  objectName: string;
  metadata?: Record<string, string>;
}

export interface FindFilesOptions {
  limit: number;
  offset: number;
  purpose?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export class FileRepository {
  private readonly prisma: ContainerCradle['prisma'];
  private readonly minio: ContainerCradle['minio'];
  private readonly logger: ContainerCradle['logger'];

  constructor({ prisma, minio, logger }: ContainerCradle) {
    this.prisma = prisma;
    this.minio = minio;
    this.logger = logger;
  }

  async create(data: CreateFileData): Promise<FileRecord> {
    const result = await this.prisma.file.create({
      data: {
        id: data.id,
        userId: data.userId,
        filename: data.filename,
        mimeType: data.mimeType,
        size: data.size,
        purpose: data.purpose,
        checksum: data.checksum,
        objectName: data.objectName,
        metadata: data.metadata || {},
      },
    });

    return this.mapToRecord(result);
  }

  async findById(id: string): Promise<FileRecord | null> {
    const result = await this.prisma.file.findUnique({
      where: { id },
    });

    return result ? this.mapToRecord(result) : null;
  }

  async findByUser(
    userId: string,
    options: FindFilesOptions
  ): Promise<{ files: FileRecord[]; total: number }> {
    const where = {
      userId,
      ...(options.purpose && { purpose: options.purpose }),
      ...(options.createdAfter && { createdAt: { gte: options.createdAfter } }),
      ...(options.createdBefore && { createdAt: { lte: options.createdBefore } }),
    };

    const [results, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        take: options.limit,
        skip: options.offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.file.count({ where }),
    ]);

    return {
      files: results.map(this.mapToRecord),
      total,
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.file.delete({
      where: { id },
    });
  }

  /**
   * PERF-004: Get file content with size limit
   *
   * Returns file content as a string for files under MAX_CONTENT_SIZE_BYTES (10MB).
   * For larger files, use getPresignedUrl() instead to stream directly.
   *
   * @param id - File ID
   * @returns File content as string, or null if file not found or too large
   */
  async getContent(id: string): Promise<string | null> {
    const file = await this.findById(id);
    if (!file) {
      return null;
    }

    // PERF-004: Check file size before loading into memory
    if (file.size > MAX_CONTENT_SIZE_BYTES) {
      this.logger.warn(
        { fileId: id, size: file.size, maxSize: MAX_CONTENT_SIZE_BYTES },
        'PERF-004: File too large for content retrieval, use presigned URL instead'
      );
      return null;
    }

    try {
      const bucket = process.env.MINIO_BUCKET || 'zentoria-files';
      const stream = await this.minio.getObject(bucket, file.objectName);

      const chunks: Buffer[] = [];
      let totalSize = 0;

      for await (const chunk of stream) {
        const buffer = Buffer.from(chunk);
        totalSize += buffer.length;

        // PERF-004: Safety check during streaming in case metadata was stale
        if (totalSize > MAX_CONTENT_SIZE_BYTES) {
          this.logger.warn(
            { fileId: id, totalSize, maxSize: MAX_CONTENT_SIZE_BYTES },
            'PERF-004: File exceeded size limit during streaming'
          );
          return null;
        }

        chunks.push(buffer);
      }

      return Buffer.concat(chunks).toString('utf-8');
    } catch (err) {
      this.logger.error({ err, fileId: id }, 'Failed to get file content');
      return null;
    }
  }

  /**
   * PERF-004: Get presigned URL for direct file download
   *
   * Use this for large files that exceed MAX_CONTENT_SIZE_BYTES.
   * The URL expires after the specified duration (default: 1 hour).
   *
   * @param id - File ID
   * @param expirySeconds - URL expiry time in seconds (default: 3600)
   * @returns Presigned URL or null if file not found
   */
  async getPresignedUrl(id: string, expirySeconds: number = 3600): Promise<string | null> {
    const file = await this.findById(id);
    if (!file) {
      return null;
    }

    try {
      const bucket = process.env.MINIO_BUCKET || 'zentoria-files';
      return await this.minio.presignedGetObject(bucket, file.objectName, expirySeconds);
    } catch (err) {
      this.logger.error({ err, fileId: id }, 'Failed to generate presigned URL');
      return null;
    }
  }

  /**
   * PERF-004: Check if file content can be retrieved directly
   *
   * @param id - File ID
   * @returns True if file exists and is under the size limit
   */
  async canGetContent(id: string): Promise<boolean> {
    const file = await this.findById(id);
    if (!file) {
      return false;
    }
    return file.size <= MAX_CONTENT_SIZE_BYTES;
  }

  private mapToRecord(data: {
    id: string;
    userId: string;
    filename: string;
    mimeType: string;
    size: number;
    purpose: string;
    checksum: string;
    objectName: string;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): FileRecord {
    return {
      id: data.id,
      userId: data.userId,
      filename: data.filename,
      mimeType: data.mimeType,
      size: data.size,
      purpose: data.purpose,
      checksum: data.checksum,
      objectName: data.objectName,
      metadata: data.metadata as Record<string, string> | null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
