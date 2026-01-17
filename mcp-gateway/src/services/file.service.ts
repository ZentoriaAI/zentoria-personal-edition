/**
 * File Service
 *
 * Handles file upload, storage, and retrieval via MinIO
 */

import { nanoid } from 'nanoid';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { z } from 'zod';
import type { Client as MinioClient } from 'minio';
import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';
import { MinioKeys, getPresignedGetUrl } from '../infrastructure/minio.js';
import { validateFileMagicBytes } from '../infrastructure/file-validator.js';
import type { EventBus, FileUploadedEvent, FileDeletedEvent } from '../infrastructure/event-bus.js'; // ARCH-002

// Validation schemas
export const FileUploadMetadataSchema = z.object({
  purpose: z.enum(['ai-input', 'attachment', 'backup']).default('ai-input'),
  metadata: z.record(z.string()).optional(),
});

export const FileListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  purpose: z.enum(['ai-input', 'attachment', 'backup']).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
});

export interface FileUploadResult {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  purpose: string;
  checksum: string;
  createdAt: string;
  expiresAt?: string;
}

export interface FileMetadata {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  purpose: string;
  checksum: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface FileListResult {
  files: FileMetadata[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const ALLOWED_MIME_TYPES = (process.env.ALLOWED_MIME_TYPES || 'application/pdf,image/*,text/*,application/json')
  .split(',')
  .map(t => t.trim());

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10) * 1024 * 1024;

export class FileService {
  private readonly minio: MinioClient;
  private readonly fileRepository: ContainerCradle['fileRepository'];
  private readonly auditRepository: ContainerCradle['auditRepository'];
  private readonly logger: ContainerCradle['logger'];
  private readonly eventBus: EventBus; // ARCH-002
  private readonly bucket: string;

  constructor({
    minio,
    fileRepository,
    auditRepository,
    logger,
    eventBus,
  }: ContainerCradle) {
    this.minio = minio;
    this.fileRepository = fileRepository;
    this.auditRepository = auditRepository;
    this.logger = logger;
    this.eventBus = eventBus; // ARCH-002
    this.bucket = process.env.MINIO_BUCKET || 'zentoria-files';
  }

  /**
   * Upload a file to MinIO storage
   *
   * SEC-004: Validates magic bytes against claimed MIME type.
   * ARCH-002: Publishes file.uploaded domain event on success.
   *
   * @param userId - The unique identifier of the uploading user
   * @param filename - The original filename
   * @param mimeType - The claimed MIME type of the file
   * @param stream - Readable stream of the file content
   * @param size - Expected file size in bytes
   * @param options - Upload options including purpose and metadata
   * @returns Upload result with file ID, checksum, and metadata
   * @throws {AppError} BAD_REQUEST if MIME type is not allowed
   * @throws {AppError} BAD_REQUEST if file size exceeds maximum
   * @throws {AppError} BAD_REQUEST if magic bytes don't match claimed type
   */
  async uploadFile(
    userId: string,
    filename: string,
    mimeType: string,
    stream: Readable,
    size: number,
    options: z.infer<typeof FileUploadMetadataSchema>
  ): Promise<FileUploadResult> {
    // Validate mime type
    if (!this.isAllowedMimeType(mimeType)) {
      throw Errors.badRequest(`File type '${mimeType}' is not allowed`);
    }

    // Validate size
    if (size > MAX_FILE_SIZE) {
      throw Errors.badRequest(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const fileId = `file_${nanoid(16)}`;
    const objectName = MinioKeys.userFile(userId, fileId, filename);

    this.logger.info({ fileId, filename, size, mimeType }, 'Starting file upload');

    // SEC-004: Validate magic bytes against claimed MIME type
    const { result: validationResult, bufferedChunks } = await validateFileMagicBytes(stream, mimeType);

    if (!validationResult.valid) {
      this.logger.warn({
        fileId,
        filename,
        claimedMimeType: mimeType,
        detectedMimeType: validationResult.detectedMimeType,
        reason: validationResult.reason,
      }, 'File magic byte validation failed');

      throw Errors.badRequest(validationResult.reason || 'File content does not match claimed type');
    }

    // Log if detected type differs from claimed (but is compatible)
    if (validationResult.detectedMimeType && validationResult.detectedMimeType !== mimeType) {
      this.logger.info({
        fileId,
        claimedMimeType: mimeType,
        detectedMimeType: validationResult.detectedMimeType,
      }, 'File MIME type compatible but different');
    }

    // Calculate checksum while uploading
    const hash = createHash('sha256');
    const checksumStream = new Readable({
      read() {},
    });

    let uploadedSize = 0;

    // Push buffered chunks first (from magic byte validation)
    for (const chunk of bufferedChunks) {
      hash.update(chunk);
      uploadedSize += chunk.length;
      checksumStream.push(chunk);
    }

    // Continue with rest of stream
    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      uploadedSize += chunk.length;
      checksumStream.push(chunk);
    });

    stream.on('end', () => {
      checksumStream.push(null);
    });

    stream.on('error', (err) => {
      checksumStream.destroy(err);
    });

    // Resume stream if it was paused during validation
    stream.resume();

    try {
      // Upload to MinIO
      await this.minio.putObject(
        this.bucket,
        objectName,
        checksumStream,
        size,
        {
          'Content-Type': mimeType,
          'x-amz-meta-user-id': userId,
          'x-amz-meta-file-id': fileId,
          'x-amz-meta-purpose': options.purpose,
        }
      );

      const checksum = hash.digest('hex');

      // Store metadata in database
      const fileRecord = await this.fileRepository.create({
        id: fileId,
        userId,
        filename,
        mimeType,
        size: uploadedSize,
        purpose: options.purpose,
        checksum,
        objectName,
        metadata: options.metadata,
      });

      // Log audit
      await this.auditRepository.log({
        action: 'file_uploaded',
        userId,
        metadata: {
          fileId,
          filename,
          size: uploadedSize,
          mimeType,
        },
      });

      // ARCH-002: Publish domain event
      await this.eventBus.publish<FileUploadedEvent>('file.uploaded', {
        fileId,
        fileName: filename,
        mimeType,
        size: uploadedSize,
        userId,
      }, { userId });

      this.logger.info({ fileId, checksum }, 'File upload completed');

      return {
        id: fileId,
        filename,
        size: uploadedSize,
        mimeType,
        purpose: options.purpose,
        checksum,
        createdAt: fileRecord.createdAt.toISOString(),
      };
    } catch (err) {
      this.logger.error({ err, fileId }, 'File upload failed');

      // Cleanup on failure
      try {
        await this.minio.removeObject(this.bucket, objectName);
      } catch {
        // Ignore cleanup errors
      }

      throw err;
    }
  }

  /**
   * List files for a user with pagination and filtering
   *
   * @param userId - The unique identifier of the user
   * @param query - Query parameters for filtering and pagination
   * @returns Paginated list of file metadata
   */
  async listFiles(
    userId: string,
    query: z.infer<typeof FileListQuerySchema>
  ): Promise<FileListResult> {
    const { page, limit, purpose, createdAfter, createdBefore } = query;
    const offset = (page - 1) * limit;

    const { files, total } = await this.fileRepository.findByUser(userId, {
      limit,
      offset,
      purpose,
      createdAfter: createdAfter ? new Date(createdAfter) : undefined,
      createdBefore: createdBefore ? new Date(createdBefore) : undefined,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      files: files.map(this.mapToMetadata),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get file metadata by ID
   *
   * @param userId - The unique identifier of the requesting user
   * @param fileId - The unique identifier of the file
   * @returns File metadata including checksum and timestamps
   * @throws {AppError} NOT_FOUND if the file doesn't exist
   * @throws {AppError} FORBIDDEN if the user doesn't own the file
   */
  async getFile(userId: string, fileId: string): Promise<FileMetadata> {
    const file = await this.fileRepository.findById(fileId);

    if (!file) {
      throw Errors.notFound('File', fileId);
    }

    if (file.userId !== userId) {
      throw Errors.forbidden('You do not have access to this file');
    }

    return this.mapToMetadata(file);
  }

  /**
   * Delete a file from storage
   *
   * Removes the file from MinIO and deletes the database record.
   * ARCH-002: Publishes file.deleted domain event on success.
   *
   * @param userId - The unique identifier of the requesting user
   * @param fileId - The unique identifier of the file to delete
   * @throws {AppError} NOT_FOUND if the file doesn't exist
   * @throws {AppError} FORBIDDEN if the user doesn't own the file
   */
  async deleteFile(userId: string, fileId: string): Promise<void> {
    const file = await this.fileRepository.findById(fileId);

    if (!file) {
      throw Errors.notFound('File', fileId);
    }

    if (file.userId !== userId) {
      throw Errors.forbidden('You do not have access to this file');
    }

    this.logger.info({ fileId }, 'Deleting file');

    // Delete from MinIO
    await this.minio.removeObject(this.bucket, file.objectName);

    // Delete from database
    await this.fileRepository.delete(fileId);

    // Log audit
    await this.auditRepository.log({
      action: 'file_deleted',
      userId,
      metadata: {
        fileId,
        filename: file.filename,
      },
    });

    // ARCH-002: Publish domain event
    await this.eventBus.publish<FileDeletedEvent>('file.deleted', {
      fileId,
      fileName: file.filename,
      userId,
    }, { userId });
  }

  /**
   * Get a presigned download URL for a file
   *
   * The URL is valid for 1 hour.
   *
   * @param userId - The unique identifier of the requesting user
   * @param fileId - The unique identifier of the file
   * @returns Presigned URL for downloading the file
   * @throws {AppError} NOT_FOUND if the file doesn't exist
   * @throws {AppError} FORBIDDEN if the user doesn't own the file
   */
  async getDownloadUrl(userId: string, fileId: string): Promise<string> {
    const file = await this.fileRepository.findById(fileId);

    if (!file) {
      throw Errors.notFound('File', fileId);
    }

    if (file.userId !== userId) {
      throw Errors.forbidden('You do not have access to this file');
    }

    return getPresignedGetUrl(this.minio, this.bucket, file.objectName, 3600);
  }

  /**
   * Get a readable stream of file content
   *
   * @param userId - The unique identifier of the requesting user
   * @param fileId - The unique identifier of the file
   * @returns Object containing the readable stream and file metadata
   * @throws {AppError} NOT_FOUND if the file doesn't exist
   * @throws {AppError} FORBIDDEN if the user doesn't own the file
   */
  async getFileStream(userId: string, fileId: string): Promise<{
    stream: Readable;
    metadata: FileMetadata;
  }> {
    const file = await this.fileRepository.findById(fileId);

    if (!file) {
      throw Errors.notFound('File', fileId);
    }

    if (file.userId !== userId) {
      throw Errors.forbidden('You do not have access to this file');
    }

    const stream = await this.minio.getObject(this.bucket, file.objectName);

    return {
      stream,
      metadata: this.mapToMetadata(file),
    };
  }

  /**
   * Check if mime type is allowed
   */
  private isAllowedMimeType(mimeType: string): boolean {
    return ALLOWED_MIME_TYPES.some(pattern => {
      if (pattern.endsWith('/*')) {
        return mimeType.startsWith(pattern.slice(0, -1));
      }
      return pattern === mimeType;
    });
  }

  /**
   * Map database record to API response
   */
  private mapToMetadata(file: {
    id: string;
    filename: string;
    size: number;
    mimeType: string;
    purpose: string;
    checksum: string;
    metadata?: Record<string, string> | null;
    createdAt: Date;
    updatedAt: Date;
  }): FileMetadata {
    return {
      id: file.id,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
      purpose: file.purpose,
      checksum: file.checksum,
      metadata: file.metadata || undefined,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    };
  }
}
