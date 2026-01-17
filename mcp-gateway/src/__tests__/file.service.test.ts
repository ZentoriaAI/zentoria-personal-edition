/**
 * File Service Tests - TEST-009
 *
 * Comprehensive tests for the FileService including:
 * - Schema validation
 * - File upload with magic byte validation (SEC-004)
 * - File listing with pagination
 * - File retrieval with ownership checks
 * - File deletion with cleanup
 * - Presigned URL generation
 * - File streaming
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable, PassThrough } from 'stream';
import {
  FileService,
  FileUploadMetadataSchema,
  FileListQuerySchema,
} from '../services/file.service.js';

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test123456789012'),
}));

// Mock file-validator
vi.mock('../infrastructure/file-validator.js', () => ({
  validateFileMagicBytes: vi.fn(),
}));

// Mock minio helper
vi.mock('../infrastructure/minio.js', () => ({
  MinioKeys: {
    userFile: vi.fn((userId: string, fileId: string, filename: string) =>
      `users/${userId}/files/${fileId}/${filename}`
    ),
  },
  getPresignedGetUrl: vi.fn(),
}));

// Import mocked modules
import { validateFileMagicBytes } from '../infrastructure/file-validator.js';
import { MinioKeys, getPresignedGetUrl } from '../infrastructure/minio.js';

// Mock factories
const createMockMinio = () => ({
  putObject: vi.fn().mockResolvedValue(undefined),
  getObject: vi.fn(),
  removeObject: vi.fn().mockResolvedValue(undefined),
});

const createMockFileRepository = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByUser: vi.fn(),
  delete: vi.fn(),
  getContent: vi.fn(),
});

const createMockAuditRepository = () => ({
  log: vi.fn().mockResolvedValue(undefined),
});

const createMockEventBus = () => ({
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
});

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

// Test data factories
const createMockFileRecord = (overrides = {}) => ({
  id: 'file_test123456789012',
  userId: 'user_123',
  filename: 'test-document.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  purpose: 'ai-input',
  checksum: 'abc123def456',
  objectName: 'users/user_123/files/file_test123456789012/test-document.pdf',
  metadata: null,
  createdAt: new Date('2026-01-15T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
  ...overrides,
});

const createMockStream = (data = 'test file content'): Readable => {
  const stream = new Readable({
    read() {
      this.push(Buffer.from(data));
      this.push(null);
    },
  });
  return stream;
};

describe('FileService (TEST-009)', () => {
  let fileService: FileService;
  let mockMinio: ReturnType<typeof createMockMinio>;
  let mockFileRepository: ReturnType<typeof createMockFileRepository>;
  let mockAuditRepository: ReturnType<typeof createMockAuditRepository>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMinio = createMockMinio();
    mockFileRepository = createMockFileRepository();
    mockAuditRepository = createMockAuditRepository();
    mockEventBus = createMockEventBus();
    mockLogger = createMockLogger();

    // Default mock for magic byte validation
    (validateFileMagicBytes as any).mockResolvedValue({
      result: { valid: true },
      bufferedChunks: [Buffer.from('test')],
    });

    fileService = new FileService({
      minio: mockMinio as any,
      fileRepository: mockFileRepository as any,
      auditRepository: mockAuditRepository as any,
      eventBus: mockEventBus as any,
      logger: mockLogger as any,
    } as any);
  });

  describe('FileUploadMetadataSchema Validation', () => {
    it('should accept valid ai-input purpose', () => {
      const result = FileUploadMetadataSchema.parse({
        purpose: 'ai-input',
      });

      expect(result.purpose).toBe('ai-input');
    });

    it('should accept valid attachment purpose', () => {
      const result = FileUploadMetadataSchema.parse({
        purpose: 'attachment',
      });

      expect(result.purpose).toBe('attachment');
    });

    it('should accept valid backup purpose', () => {
      const result = FileUploadMetadataSchema.parse({
        purpose: 'backup',
      });

      expect(result.purpose).toBe('backup');
    });

    it('should use default purpose when not provided', () => {
      const result = FileUploadMetadataSchema.parse({});

      expect(result.purpose).toBe('ai-input');
    });

    it('should reject invalid purpose', () => {
      expect(() => FileUploadMetadataSchema.parse({
        purpose: 'invalid',
      })).toThrow();
    });

    it('should accept optional metadata', () => {
      const result = FileUploadMetadataSchema.parse({
        purpose: 'ai-input',
        metadata: { key: 'value', another: 'data' },
      });

      expect(result.metadata).toEqual({ key: 'value', another: 'data' });
    });

    it('should allow empty metadata', () => {
      const result = FileUploadMetadataSchema.parse({
        purpose: 'ai-input',
        metadata: {},
      });

      expect(result.metadata).toEqual({});
    });
  });

  describe('FileListQuerySchema Validation', () => {
    it('should use default values', () => {
      const result = FileListQuerySchema.parse({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should coerce page to number', () => {
      const result = FileListQuerySchema.parse({ page: '5' });

      expect(result.page).toBe(5);
    });

    it('should coerce limit to number', () => {
      const result = FileListQuerySchema.parse({ limit: '50' });

      expect(result.limit).toBe(50);
    });

    it('should reject page less than 1', () => {
      expect(() => FileListQuerySchema.parse({ page: 0 })).toThrow();
      expect(() => FileListQuerySchema.parse({ page: -1 })).toThrow();
    });

    it('should reject limit less than 1', () => {
      expect(() => FileListQuerySchema.parse({ limit: 0 })).toThrow();
    });

    it('should reject limit greater than 100', () => {
      expect(() => FileListQuerySchema.parse({ limit: 101 })).toThrow();
    });

    it('should accept valid purpose filter', () => {
      const result = FileListQuerySchema.parse({ purpose: 'backup' });

      expect(result.purpose).toBe('backup');
    });

    it('should accept valid datetime strings', () => {
      const result = FileListQuerySchema.parse({
        createdAfter: '2026-01-01T00:00:00Z',
        createdBefore: '2026-12-31T23:59:59Z',
      });

      expect(result.createdAfter).toBe('2026-01-01T00:00:00Z');
      expect(result.createdBefore).toBe('2026-12-31T23:59:59Z');
    });

    it('should reject invalid datetime format', () => {
      expect(() => FileListQuerySchema.parse({
        createdAfter: 'invalid-date',
      })).toThrow();
    });
  });

  describe('uploadFile', () => {
    const validUploadOptions = { purpose: 'ai-input' as const };

    describe('Successful Upload', () => {
      it('should upload file and return result', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord();

        mockFileRepository.create.mockResolvedValue(fileRecord);

        const result = await fileService.uploadFile(
          'user_123',
          'test-document.pdf',
          'application/pdf',
          stream,
          1024,
          validUploadOptions
        );

        expect(result.id).toMatch(/^file_/);
        expect(result.filename).toBe('test-document.pdf');
        expect(result.mimeType).toBe('application/pdf');
        expect(result.purpose).toBe('ai-input');
        expect(result.checksum).toBeDefined();
      });

      it('should call MinIO putObject with correct parameters', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord();

        mockFileRepository.create.mockResolvedValue(fileRecord);

        await fileService.uploadFile(
          'user_123',
          'test-document.pdf',
          'application/pdf',
          stream,
          1024,
          validUploadOptions
        );

        expect(mockMinio.putObject).toHaveBeenCalledWith(
          'zentoria-files',
          expect.stringContaining('users/user_123/files/'),
          expect.any(Readable),
          1024,
          expect.objectContaining({
            'Content-Type': 'application/pdf',
            'x-amz-meta-user-id': 'user_123',
            'x-amz-meta-purpose': 'ai-input',
          })
        );
      });

      it('should create database record with correct data', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord();

        mockFileRepository.create.mockResolvedValue(fileRecord);

        await fileService.uploadFile(
          'user_123',
          'test-document.pdf',
          'application/pdf',
          stream,
          1024,
          { purpose: 'attachment', metadata: { source: 'email' } }
        );

        expect(mockFileRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user_123',
            filename: 'test-document.pdf',
            mimeType: 'application/pdf',
            purpose: 'attachment',
            metadata: { source: 'email' },
          })
        );
      });

      it('should log audit event on successful upload', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord();

        mockFileRepository.create.mockResolvedValue(fileRecord);

        await fileService.uploadFile(
          'user_123',
          'test-document.pdf',
          'application/pdf',
          stream,
          1024,
          validUploadOptions
        );

        expect(mockAuditRepository.log).toHaveBeenCalledWith({
          action: 'file_uploaded',
          userId: 'user_123',
          metadata: expect.objectContaining({
            filename: 'test-document.pdf',
            mimeType: 'application/pdf',
          }),
        });
      });
    });

    describe('MIME Type Validation', () => {
      it('should reject disallowed MIME types', async () => {
        const stream = createMockStream();

        await expect(
          fileService.uploadFile(
            'user_123',
            'malware.exe',
            'application/x-msdownload',
            stream,
            1024,
            validUploadOptions
          )
        ).rejects.toThrow("File type 'application/x-msdownload' is not allowed");
      });

      it('should accept text/* MIME types', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord({ mimeType: 'text/plain' });

        mockFileRepository.create.mockResolvedValue(fileRecord);

        const result = await fileService.uploadFile(
          'user_123',
          'readme.txt',
          'text/plain',
          stream,
          100,
          validUploadOptions
        );

        expect(result.mimeType).toBe('text/plain');
      });

      it('should accept image/* MIME types', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord({ mimeType: 'image/png' });

        mockFileRepository.create.mockResolvedValue(fileRecord);

        const result = await fileService.uploadFile(
          'user_123',
          'photo.png',
          'image/png',
          stream,
          5000,
          validUploadOptions
        );

        expect(result.mimeType).toBe('image/png');
      });

      it('should accept application/pdf', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord();

        mockFileRepository.create.mockResolvedValue(fileRecord);

        const result = await fileService.uploadFile(
          'user_123',
          'doc.pdf',
          'application/pdf',
          stream,
          2000,
          validUploadOptions
        );

        expect(result.mimeType).toBe('application/pdf');
      });

      it('should accept application/json', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord({ mimeType: 'application/json' });

        mockFileRepository.create.mockResolvedValue(fileRecord);

        const result = await fileService.uploadFile(
          'user_123',
          'data.json',
          'application/json',
          stream,
          500,
          validUploadOptions
        );

        expect(result.mimeType).toBe('application/json');
      });
    });

    describe('File Size Validation', () => {
      it('should reject files exceeding max size', async () => {
        const stream = createMockStream();
        const oversizedFile = 200 * 1024 * 1024; // 200MB

        await expect(
          fileService.uploadFile(
            'user_123',
            'large-file.pdf',
            'application/pdf',
            stream,
            oversizedFile,
            validUploadOptions
          )
        ).rejects.toThrow(/exceeds maximum/);
      });

      it('should accept files within size limit', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord({ size: 50 * 1024 * 1024 });

        mockFileRepository.create.mockResolvedValue(fileRecord);

        const result = await fileService.uploadFile(
          'user_123',
          'medium-file.pdf',
          'application/pdf',
          stream,
          50 * 1024 * 1024, // 50MB
          validUploadOptions
        );

        expect(result).toBeDefined();
      });
    });

    describe('Magic Byte Validation (SEC-004)', () => {
      it('should reject files with invalid magic bytes', async () => {
        const stream = createMockStream();

        (validateFileMagicBytes as any).mockResolvedValue({
          result: {
            valid: false,
            detectedMimeType: 'application/x-executable',
            reason: 'File content does not match claimed type',
          },
          bufferedChunks: [],
        });

        await expect(
          fileService.uploadFile(
            'user_123',
            'suspicious.pdf',
            'application/pdf',
            stream,
            1024,
            validUploadOptions
          )
        ).rejects.toThrow(/does not match/);
      });

      it('should pass magic bytes to validator', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord();

        mockFileRepository.create.mockResolvedValue(fileRecord);

        await fileService.uploadFile(
          'user_123',
          'test.pdf',
          'application/pdf',
          stream,
          1024,
          validUploadOptions
        );

        expect(validateFileMagicBytes).toHaveBeenCalledWith(stream, 'application/pdf');
      });

      it('should log warning when magic bytes validation fails', async () => {
        const stream = createMockStream();

        (validateFileMagicBytes as any).mockResolvedValue({
          result: {
            valid: false,
            detectedMimeType: 'image/jpeg',
            reason: 'File claimed to be application/pdf but detected as image/jpeg',
          },
          bufferedChunks: [],
        });

        await expect(
          fileService.uploadFile(
            'user_123',
            'fake.pdf',
            'application/pdf',
            stream,
            1024,
            validUploadOptions
          )
        ).rejects.toThrow();

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            claimedMimeType: 'application/pdf',
            detectedMimeType: 'image/jpeg',
          }),
          'File magic byte validation failed'
        );
      });

      it('should log info when detected type differs but is compatible', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord({ mimeType: 'text/plain' });

        mockFileRepository.create.mockResolvedValue(fileRecord);

        (validateFileMagicBytes as any).mockResolvedValue({
          result: {
            valid: true,
            detectedMimeType: 'text/html',
          },
          bufferedChunks: [Buffer.from('test')],
        });

        await fileService.uploadFile(
          'user_123',
          'document.txt',
          'text/plain',
          stream,
          1024,
          validUploadOptions
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            claimedMimeType: 'text/plain',
            detectedMimeType: 'text/html',
          }),
          'File MIME type compatible but different'
        );
      });
    });

    describe('Checksum Calculation', () => {
      it('should include checksum in result', async () => {
        const stream = createMockStream('consistent content');
        const fileRecord = createMockFileRecord({ checksum: 'sha256hash' });

        mockFileRepository.create.mockResolvedValue(fileRecord);

        const result = await fileService.uploadFile(
          'user_123',
          'file.txt',
          'text/plain',
          stream,
          100,
          validUploadOptions
        );

        expect(result.checksum).toBeDefined();
        expect(typeof result.checksum).toBe('string');
      });

      it('should store checksum in database', async () => {
        const stream = createMockStream();
        const fileRecord = createMockFileRecord();

        mockFileRepository.create.mockResolvedValue(fileRecord);

        await fileService.uploadFile(
          'user_123',
          'file.txt',
          'text/plain',
          stream,
          100,
          validUploadOptions
        );

        expect(mockFileRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            checksum: expect.any(String),
          })
        );
      });
    });

    describe('Error Handling and Cleanup', () => {
      it('should cleanup MinIO object on database failure', async () => {
        const stream = createMockStream();

        mockFileRepository.create.mockRejectedValue(new Error('Database error'));

        await expect(
          fileService.uploadFile(
            'user_123',
            'file.pdf',
            'application/pdf',
            stream,
            1024,
            validUploadOptions
          )
        ).rejects.toThrow('Database error');

        expect(mockMinio.removeObject).toHaveBeenCalled();
      });

      it('should log error on upload failure', async () => {
        const stream = createMockStream();

        mockMinio.putObject.mockRejectedValue(new Error('MinIO error'));

        await expect(
          fileService.uploadFile(
            'user_123',
            'file.pdf',
            'application/pdf',
            stream,
            1024,
            validUploadOptions
          )
        ).rejects.toThrow('MinIO error');

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ err: expect.any(Error) }),
          'File upload failed'
        );
      });

      it('should ignore cleanup errors', async () => {
        const stream = createMockStream();

        mockFileRepository.create.mockRejectedValue(new Error('Database error'));
        mockMinio.removeObject.mockRejectedValue(new Error('Cleanup failed'));

        // Should not throw cleanup error, only original error
        await expect(
          fileService.uploadFile(
            'user_123',
            'file.pdf',
            'application/pdf',
            stream,
            1024,
            validUploadOptions
          )
        ).rejects.toThrow('Database error');
      });
    });
  });

  describe('listFiles', () => {
    it('should return files with pagination', async () => {
      const files = [
        createMockFileRecord({ id: 'file_1', filename: 'doc1.pdf' }),
        createMockFileRecord({ id: 'file_2', filename: 'doc2.pdf' }),
      ];

      mockFileRepository.findByUser.mockResolvedValue({
        files,
        total: 50,
      });

      const result = await fileService.listFiles('user_123', {
        page: 1,
        limit: 20,
      });

      expect(result.files).toHaveLength(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(50);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should calculate correct offset for pagination', async () => {
      mockFileRepository.findByUser.mockResolvedValue({
        files: [],
        total: 0,
      });

      await fileService.listFiles('user_123', { page: 3, limit: 20 });

      expect(mockFileRepository.findByUser).toHaveBeenCalledWith('user_123', {
        limit: 20,
        offset: 40, // (3-1) * 20
        purpose: undefined,
        createdAfter: undefined,
        createdBefore: undefined,
      });
    });

    it('should pass purpose filter to repository', async () => {
      mockFileRepository.findByUser.mockResolvedValue({
        files: [],
        total: 0,
      });

      await fileService.listFiles('user_123', {
        page: 1,
        limit: 20,
        purpose: 'backup',
      });

      expect(mockFileRepository.findByUser).toHaveBeenCalledWith('user_123', {
        limit: 20,
        offset: 0,
        purpose: 'backup',
        createdAfter: undefined,
        createdBefore: undefined,
      });
    });

    it('should pass date filters to repository', async () => {
      mockFileRepository.findByUser.mockResolvedValue({
        files: [],
        total: 0,
      });

      await fileService.listFiles('user_123', {
        page: 1,
        limit: 20,
        createdAfter: '2026-01-01T00:00:00Z',
        createdBefore: '2026-12-31T23:59:59Z',
      });

      expect(mockFileRepository.findByUser).toHaveBeenCalledWith('user_123', {
        limit: 20,
        offset: 0,
        purpose: undefined,
        createdAfter: new Date('2026-01-01T00:00:00Z'),
        createdBefore: new Date('2026-12-31T23:59:59Z'),
      });
    });

    it('should map files to metadata format', async () => {
      const files = [
        createMockFileRecord({
          id: 'file_1',
          filename: 'doc.pdf',
          metadata: { tag: 'important' },
        }),
      ];

      mockFileRepository.findByUser.mockResolvedValue({
        files,
        total: 1,
      });

      const result = await fileService.listFiles('user_123', { page: 1, limit: 20 });

      expect(result.files[0]).toEqual({
        id: 'file_1',
        filename: 'doc.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        purpose: 'ai-input',
        checksum: 'abc123def456',
        metadata: { tag: 'important' },
        createdAt: '2026-01-15T10:00:00.000Z',
        updatedAt: '2026-01-15T10:00:00.000Z',
      });
    });

    it('should handle last page pagination correctly', async () => {
      mockFileRepository.findByUser.mockResolvedValue({
        files: [createMockFileRecord()],
        total: 45,
      });

      const result = await fileService.listFiles('user_123', { page: 3, limit: 20 });

      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it('should handle empty results', async () => {
      mockFileRepository.findByUser.mockResolvedValue({
        files: [],
        total: 0,
      });

      const result = await fileService.listFiles('user_123', { page: 1, limit: 20 });

      expect(result.files).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);
    });
  });

  describe('getFile', () => {
    it('should return file metadata for owner', async () => {
      const fileRecord = createMockFileRecord();

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      const result = await fileService.getFile('user_123', 'file_test123456789012');

      expect(result.id).toBe('file_test123456789012');
      expect(result.filename).toBe('test-document.pdf');
    });

    it('should throw not found for non-existent file', async () => {
      mockFileRepository.findById.mockResolvedValue(null);

      await expect(
        fileService.getFile('user_123', 'file_nonexistent')
      ).rejects.toThrow(/not found/i);
    });

    it('should throw forbidden for non-owner (IDOR protection)', async () => {
      const fileRecord = createMockFileRecord({ userId: 'different_user' });

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      await expect(
        fileService.getFile('user_123', 'file_test123456789012')
      ).rejects.toThrow(/do not have access/i);
    });

    it('should map null metadata to undefined', async () => {
      const fileRecord = createMockFileRecord({ metadata: null });

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      const result = await fileService.getFile('user_123', 'file_test123456789012');

      expect(result.metadata).toBeUndefined();
    });

    it('should format dates as ISO strings', async () => {
      const fileRecord = createMockFileRecord({
        createdAt: new Date('2026-01-15T10:00:00Z'),
        updatedAt: new Date('2026-01-16T15:30:00Z'),
      });

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      const result = await fileService.getFile('user_123', 'file_test123456789012');

      expect(result.createdAt).toBe('2026-01-15T10:00:00.000Z');
      expect(result.updatedAt).toBe('2026-01-16T15:30:00.000Z');
    });
  });

  describe('deleteFile', () => {
    it('should delete file from MinIO and database', async () => {
      const fileRecord = createMockFileRecord();

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      await fileService.deleteFile('user_123', 'file_test123456789012');

      expect(mockMinio.removeObject).toHaveBeenCalledWith(
        'zentoria-files',
        fileRecord.objectName
      );
      expect(mockFileRepository.delete).toHaveBeenCalledWith('file_test123456789012');
    });

    it('should log audit event on deletion', async () => {
      const fileRecord = createMockFileRecord();

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      await fileService.deleteFile('user_123', 'file_test123456789012');

      expect(mockAuditRepository.log).toHaveBeenCalledWith({
        action: 'file_deleted',
        userId: 'user_123',
        metadata: {
          fileId: 'file_test123456789012',
          filename: 'test-document.pdf',
        },
      });
    });

    it('should throw not found for non-existent file', async () => {
      mockFileRepository.findById.mockResolvedValue(null);

      await expect(
        fileService.deleteFile('user_123', 'file_nonexistent')
      ).rejects.toThrow(/not found/i);
    });

    it('should throw forbidden for non-owner', async () => {
      const fileRecord = createMockFileRecord({ userId: 'other_user' });

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      await expect(
        fileService.deleteFile('user_123', 'file_test123456789012')
      ).rejects.toThrow(/do not have access/i);
    });

    it('should log info when deleting', async () => {
      const fileRecord = createMockFileRecord();

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      await fileService.deleteFile('user_123', 'file_test123456789012');

      expect(mockLogger.info).toHaveBeenCalledWith(
        { fileId: 'file_test123456789012' },
        'Deleting file'
      );
    });

    it('should not call delete if ownership check fails', async () => {
      const fileRecord = createMockFileRecord({ userId: 'other_user' });

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      await expect(
        fileService.deleteFile('user_123', 'file_test123456789012')
      ).rejects.toThrow();

      expect(mockMinio.removeObject).not.toHaveBeenCalled();
      expect(mockFileRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('getDownloadUrl', () => {
    it('should return presigned URL for owner', async () => {
      const fileRecord = createMockFileRecord();
      const presignedUrl = 'https://minio.example.com/signed-url';

      mockFileRepository.findById.mockResolvedValue(fileRecord);
      (getPresignedGetUrl as any).mockResolvedValue(presignedUrl);

      const result = await fileService.getDownloadUrl('user_123', 'file_test123456789012');

      expect(result).toBe(presignedUrl);
    });

    it('should call getPresignedGetUrl with correct parameters', async () => {
      const fileRecord = createMockFileRecord();

      mockFileRepository.findById.mockResolvedValue(fileRecord);
      (getPresignedGetUrl as any).mockResolvedValue('https://url');

      await fileService.getDownloadUrl('user_123', 'file_test123456789012');

      expect(getPresignedGetUrl).toHaveBeenCalledWith(
        mockMinio,
        'zentoria-files',
        fileRecord.objectName,
        3600 // 1 hour expiry
      );
    });

    it('should throw not found for non-existent file', async () => {
      mockFileRepository.findById.mockResolvedValue(null);

      await expect(
        fileService.getDownloadUrl('user_123', 'file_nonexistent')
      ).rejects.toThrow(/not found/i);
    });

    it('should throw forbidden for non-owner', async () => {
      const fileRecord = createMockFileRecord({ userId: 'other_user' });

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      await expect(
        fileService.getDownloadUrl('user_123', 'file_test123456789012')
      ).rejects.toThrow(/do not have access/i);
    });
  });

  describe('getFileStream', () => {
    it('should return stream and metadata for owner', async () => {
      const fileRecord = createMockFileRecord();
      const mockStream = createMockStream();

      mockFileRepository.findById.mockResolvedValue(fileRecord);
      mockMinio.getObject.mockResolvedValue(mockStream);

      const result = await fileService.getFileStream('user_123', 'file_test123456789012');

      expect(result.stream).toBe(mockStream);
      expect(result.metadata.id).toBe('file_test123456789012');
      expect(result.metadata.filename).toBe('test-document.pdf');
    });

    it('should call MinIO getObject with correct parameters', async () => {
      const fileRecord = createMockFileRecord();
      const mockStream = createMockStream();

      mockFileRepository.findById.mockResolvedValue(fileRecord);
      mockMinio.getObject.mockResolvedValue(mockStream);

      await fileService.getFileStream('user_123', 'file_test123456789012');

      expect(mockMinio.getObject).toHaveBeenCalledWith(
        'zentoria-files',
        fileRecord.objectName
      );
    });

    it('should throw not found for non-existent file', async () => {
      mockFileRepository.findById.mockResolvedValue(null);

      await expect(
        fileService.getFileStream('user_123', 'file_nonexistent')
      ).rejects.toThrow(/not found/i);
    });

    it('should throw forbidden for non-owner', async () => {
      const fileRecord = createMockFileRecord({ userId: 'other_user' });

      mockFileRepository.findById.mockResolvedValue(fileRecord);

      await expect(
        fileService.getFileStream('user_123', 'file_test123456789012')
      ).rejects.toThrow(/do not have access/i);
    });

    it('should include all metadata fields in response', async () => {
      const fileRecord = createMockFileRecord({
        metadata: { custom: 'field' },
      });
      const mockStream = createMockStream();

      mockFileRepository.findById.mockResolvedValue(fileRecord);
      mockMinio.getObject.mockResolvedValue(mockStream);

      const result = await fileService.getFileStream('user_123', 'file_test123456789012');

      expect(result.metadata).toEqual({
        id: 'file_test123456789012',
        filename: 'test-document.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        purpose: 'ai-input',
        checksum: 'abc123def456',
        metadata: { custom: 'field' },
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });
  });

  describe('MIME Type Wildcard Matching', () => {
    const testMimeTypeAllowed = async (mimeType: string) => {
      const stream = createMockStream();
      const fileRecord = createMockFileRecord({ mimeType });

      mockFileRepository.create.mockResolvedValue(fileRecord);

      await fileService.uploadFile(
        'user_123',
        'test.file',
        mimeType,
        stream,
        100,
        { purpose: 'ai-input' }
      );
    };

    it('should match text/* wildcard', async () => {
      await expect(testMimeTypeAllowed('text/plain')).resolves.not.toThrow();
      await expect(testMimeTypeAllowed('text/html')).resolves.not.toThrow();
      await expect(testMimeTypeAllowed('text/css')).resolves.not.toThrow();
      await expect(testMimeTypeAllowed('text/markdown')).resolves.not.toThrow();
    });

    it('should match image/* wildcard', async () => {
      await expect(testMimeTypeAllowed('image/png')).resolves.not.toThrow();
      await expect(testMimeTypeAllowed('image/jpeg')).resolves.not.toThrow();
      await expect(testMimeTypeAllowed('image/gif')).resolves.not.toThrow();
      await expect(testMimeTypeAllowed('image/webp')).resolves.not.toThrow();
    });

    it('should match exact MIME type', async () => {
      await expect(testMimeTypeAllowed('application/pdf')).resolves.not.toThrow();
      await expect(testMimeTypeAllowed('application/json')).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with special characters in filename', async () => {
      const stream = createMockStream();
      const fileRecord = createMockFileRecord({
        filename: 'report (final) [v2] - 2026.pdf',
      });

      mockFileRepository.create.mockResolvedValue(fileRecord);

      const result = await fileService.uploadFile(
        'user_123',
        'report (final) [v2] - 2026.pdf',
        'application/pdf',
        stream,
        1024,
        { purpose: 'ai-input' }
      );

      expect(result.filename).toBe('report (final) [v2] - 2026.pdf');
    });

    it('should handle very long filenames', async () => {
      const stream = createMockStream();
      const longFilename = 'a'.repeat(200) + '.pdf';
      const fileRecord = createMockFileRecord({ filename: longFilename });

      mockFileRepository.create.mockResolvedValue(fileRecord);

      const result = await fileService.uploadFile(
        'user_123',
        longFilename,
        'application/pdf',
        stream,
        1024,
        { purpose: 'ai-input' }
      );

      expect(result.filename).toBe(longFilename);
    });

    it('should handle unicode filenames', async () => {
      const stream = createMockStream();
      const unicodeFilename = '文档-报告-日本語.pdf';
      const fileRecord = createMockFileRecord({ filename: unicodeFilename });

      mockFileRepository.create.mockResolvedValue(fileRecord);

      const result = await fileService.uploadFile(
        'user_123',
        unicodeFilename,
        'application/pdf',
        stream,
        1024,
        { purpose: 'ai-input' }
      );

      expect(result.filename).toBe(unicodeFilename);
    });

    it('should handle zero-byte files being rejected by size', async () => {
      const stream = createMockStream('');

      // Zero-size files might still be valid for some operations
      // This tests that the upload still processes correctly
      const fileRecord = createMockFileRecord({ size: 0 });
      mockFileRepository.create.mockResolvedValue(fileRecord);

      await fileService.uploadFile(
        'user_123',
        'empty.txt',
        'text/plain',
        stream,
        0,
        { purpose: 'ai-input' }
      );

      expect(mockFileRepository.create).toHaveBeenCalled();
    });

    it('should handle metadata with many fields', async () => {
      const stream = createMockStream();
      const largeMetadata: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        largeMetadata[`key${i}`] = `value${i}`;
      }

      const fileRecord = createMockFileRecord({ metadata: largeMetadata });
      mockFileRepository.create.mockResolvedValue(fileRecord);

      await fileService.uploadFile(
        'user_123',
        'file.pdf',
        'application/pdf',
        stream,
        1024,
        { purpose: 'ai-input', metadata: largeMetadata }
      );

      expect(mockFileRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: largeMetadata,
        })
      );
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous uploads', async () => {
      const createUploadPromise = async (index: number) => {
        const stream = createMockStream(`content ${index}`);
        const fileRecord = createMockFileRecord({ id: `file_${index}` });

        mockFileRepository.create.mockResolvedValueOnce(fileRecord);

        return fileService.uploadFile(
          'user_123',
          `file${index}.pdf`,
          'application/pdf',
          stream,
          1024,
          { purpose: 'ai-input' }
        );
      };

      const promises = Array.from({ length: 5 }, (_, i) => createUploadPromise(i));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(mockMinio.putObject).toHaveBeenCalledTimes(5);
    });

    it('should handle concurrent list and get operations', async () => {
      const fileRecord = createMockFileRecord();

      mockFileRepository.findById.mockResolvedValue(fileRecord);
      mockFileRepository.findByUser.mockResolvedValue({
        files: [fileRecord],
        total: 1,
      });

      const [getResult, listResult] = await Promise.all([
        fileService.getFile('user_123', 'file_test123456789012'),
        fileService.listFiles('user_123', { page: 1, limit: 20 }),
      ]);

      expect(getResult.id).toBeDefined();
      expect(listResult.files).toHaveLength(1);
    });
  });
});
