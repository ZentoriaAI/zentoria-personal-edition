/**
 * File Context Loader Tests - ARCH-001
 *
 * Tests for the FileContextLoader service that handles
 * loading file contexts for AI command processing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileContextLoader } from '../services/file-context-loader.js';

// Mock file repository
const createMockFileRepository = () => ({
  findById: vi.fn(),
  getContent: vi.fn(),
});

// Mock logger
const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe('FileContextLoader (ARCH-001)', () => {
  let fileContextLoader: FileContextLoader;
  let mockFileRepository: ReturnType<typeof createMockFileRepository>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockFileRepository = createMockFileRepository();
    mockLogger = createMockLogger();

    fileContextLoader = new FileContextLoader({
      fileRepository: mockFileRepository as any,
      logger: mockLogger as any,
    });
  });

  describe('loadFileContexts', () => {
    describe('Empty Input', () => {
      it('should return empty array for empty fileIds', async () => {
        const result = await fileContextLoader.loadFileContexts('user123', []);

        expect(result).toEqual([]);
        expect(mockFileRepository.findById).not.toHaveBeenCalled();
      });

      it('should not call repository for empty array', async () => {
        await fileContextLoader.loadFileContexts('user123', []);

        expect(mockFileRepository.findById).toHaveBeenCalledTimes(0);
        expect(mockFileRepository.getContent).toHaveBeenCalledTimes(0);
      });
    });

    describe('File Metadata Fetching', () => {
      it('should fetch metadata for all file IDs in parallel', async () => {
        const fileIds = ['file1', 'file2', 'file3'];
        mockFileRepository.findById.mockResolvedValue(null);

        await fileContextLoader.loadFileContexts('user123', fileIds);

        expect(mockFileRepository.findById).toHaveBeenCalledTimes(3);
        expect(mockFileRepository.findById).toHaveBeenCalledWith('file1');
        expect(mockFileRepository.findById).toHaveBeenCalledWith('file2');
        expect(mockFileRepository.findById).toHaveBeenCalledWith('file3');
      });

      it('should handle metadata fetch errors gracefully', async () => {
        mockFileRepository.findById
          .mockRejectedValueOnce(new Error('Database error'))
          .mockResolvedValueOnce({
            id: 'file2',
            userId: 'user123',
            filename: 'test.txt',
            mimeType: 'text/plain',
          });
        mockFileRepository.getContent.mockResolvedValue('file content');

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
          'file2',
        ]);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ fileId: 'file1' }),
          'Error fetching file metadata'
        );
        expect(result).toHaveLength(1);
      });

      it('should skip files not found', async () => {
        mockFileRepository.findById
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'file2',
            userId: 'user123',
            filename: 'test.txt',
            mimeType: 'text/plain',
          });
        mockFileRepository.getContent.mockResolvedValue('file content');

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
          'file2',
        ]);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ fileId: 'file1' }),
          'File not found for context'
        );
        expect(result).toHaveLength(1);
      });
    });

    describe('Access Control', () => {
      it('should deny access to files owned by different user', async () => {
        mockFileRepository.findById.mockResolvedValue({
          id: 'file1',
          userId: 'other_user',
          filename: 'test.txt',
          mimeType: 'text/plain',
        });

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
        ]);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ fileId: 'file1', userId: 'user123' }),
          'File access denied'
        );
        expect(result).toHaveLength(0);
      });

      it('should allow access to files owned by the user', async () => {
        mockFileRepository.findById.mockResolvedValue({
          id: 'file1',
          userId: 'user123',
          filename: 'test.txt',
          mimeType: 'text/plain',
        });
        mockFileRepository.getContent.mockResolvedValue('file content');

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
        ]);

        expect(result).toHaveLength(1);
      });
    });

    describe('File Type Filtering', () => {
      const textMimeTypes = [
        'text/plain',
        'text/html',
        'text/css',
        'text/javascript',
        'text/markdown',
        'application/json',
        'application/xml',
        'application/yaml',
        'application/javascript',
        'application/typescript',
      ];

      const nonTextMimeTypes = [
        'image/png',
        'image/jpeg',
        'application/pdf',
        'application/zip',
        'audio/mp3',
        'video/mp4',
        'application/octet-stream',
      ];

      it.each(textMimeTypes)(
        'should include text-based files (%s)',
        async (mimeType) => {
          mockFileRepository.findById.mockResolvedValue({
            id: 'file1',
            userId: 'user123',
            filename: 'test.txt',
            mimeType,
          });
          mockFileRepository.getContent.mockResolvedValue('content');

          const result = await fileContextLoader.loadFileContexts('user123', [
            'file1',
          ]);

          expect(result).toHaveLength(1);
        }
      );

      it.each(nonTextMimeTypes)(
        'should skip non-text files (%s)',
        async (mimeType) => {
          mockFileRepository.findById.mockResolvedValue({
            id: 'file1',
            userId: 'user123',
            filename: 'file.bin',
            mimeType,
          });

          const result = await fileContextLoader.loadFileContexts('user123', [
            'file1',
          ]);

          expect(mockLogger.info).toHaveBeenCalledWith(
            expect.objectContaining({ fileId: 'file1', mimeType }),
            'Skipping non-text file'
          );
          expect(result).toHaveLength(0);
        }
      );
    });

    describe('Content Fetching', () => {
      it('should fetch content for valid files in parallel', async () => {
        const files = [
          { id: 'file1', userId: 'user123', filename: 'a.txt', mimeType: 'text/plain' },
          { id: 'file2', userId: 'user123', filename: 'b.txt', mimeType: 'text/plain' },
        ];

        mockFileRepository.findById
          .mockResolvedValueOnce(files[0])
          .mockResolvedValueOnce(files[1]);
        mockFileRepository.getContent
          .mockResolvedValueOnce('content A')
          .mockResolvedValueOnce('content B');

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
          'file2',
        ]);

        expect(mockFileRepository.getContent).toHaveBeenCalledTimes(2);
        expect(result).toHaveLength(2);
      });

      it('should handle content fetch errors gracefully', async () => {
        mockFileRepository.findById.mockResolvedValue({
          id: 'file1',
          userId: 'user123',
          filename: 'test.txt',
          mimeType: 'text/plain',
        });
        mockFileRepository.getContent.mockRejectedValue(
          new Error('Storage error')
        );

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
        ]);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ fileId: 'file1' }),
          'Error fetching file content'
        );
        expect(result).toHaveLength(0);
      });

      it('should skip files with null content', async () => {
        mockFileRepository.findById.mockResolvedValue({
          id: 'file1',
          userId: 'user123',
          filename: 'test.txt',
          mimeType: 'text/plain',
        });
        mockFileRepository.getContent.mockResolvedValue(null);

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
        ]);

        expect(result).toHaveLength(0);
      });
    });

    describe('Context Formatting', () => {
      it('should format file content with filename headers', async () => {
        mockFileRepository.findById.mockResolvedValue({
          id: 'file1',
          userId: 'user123',
          filename: 'example.txt',
          mimeType: 'text/plain',
        });
        mockFileRepository.getContent.mockResolvedValue('Hello, World!');

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
        ]);

        expect(result).toHaveLength(1);
        expect(result[0]).toBe(
          '--- File: example.txt ---\nHello, World!\n--- End File ---'
        );
      });

      it('should preserve file content exactly', async () => {
        const content = 'Line 1\nLine 2\n  Indented line\n\nEmpty line above';
        mockFileRepository.findById.mockResolvedValue({
          id: 'file1',
          userId: 'user123',
          filename: 'test.txt',
          mimeType: 'text/plain',
        });
        mockFileRepository.getContent.mockResolvedValue(content);

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
        ]);

        expect(result[0]).toContain(content);
      });

      it('should format multiple files correctly', async () => {
        mockFileRepository.findById
          .mockResolvedValueOnce({
            id: 'file1',
            userId: 'user123',
            filename: 'first.txt',
            mimeType: 'text/plain',
          })
          .mockResolvedValueOnce({
            id: 'file2',
            userId: 'user123',
            filename: 'second.txt',
            mimeType: 'text/plain',
          });
        mockFileRepository.getContent
          .mockResolvedValueOnce('First content')
          .mockResolvedValueOnce('Second content');

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
          'file2',
        ]);

        expect(result).toHaveLength(2);
        expect(result[0]).toContain('first.txt');
        expect(result[0]).toContain('First content');
        expect(result[1]).toContain('second.txt');
        expect(result[1]).toContain('Second content');
      });
    });

    describe('Edge Cases', () => {
      it('should handle files with special characters in filename', async () => {
        mockFileRepository.findById.mockResolvedValue({
          id: 'file1',
          userId: 'user123',
          filename: 'file with spaces & special-chars_2024.txt',
          mimeType: 'text/plain',
        });
        mockFileRepository.getContent.mockResolvedValue('content');

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
        ]);

        expect(result[0]).toContain('file with spaces & special-chars_2024.txt');
      });

      it('should handle empty file content', async () => {
        mockFileRepository.findById.mockResolvedValue({
          id: 'file1',
          userId: 'user123',
          filename: 'empty.txt',
          mimeType: 'text/plain',
        });
        mockFileRepository.getContent.mockResolvedValue('');

        const result = await fileContextLoader.loadFileContexts('user123', [
          'file1',
        ]);

        // Empty string is falsy, so it should be skipped
        expect(result).toHaveLength(0);
      });

      it('should handle large number of files', async () => {
        const fileIds = Array.from({ length: 10 }, (_, i) => `file${i}`);
        const mockFile = (id: string) => ({
          id,
          userId: 'user123',
          filename: `${id}.txt`,
          mimeType: 'text/plain',
        });

        mockFileRepository.findById.mockImplementation((id) =>
          Promise.resolve(mockFile(id))
        );
        mockFileRepository.getContent.mockResolvedValue('content');

        const result = await fileContextLoader.loadFileContexts(
          'user123',
          fileIds
        );

        expect(result).toHaveLength(10);
        expect(mockFileRepository.findById).toHaveBeenCalledTimes(10);
        expect(mockFileRepository.getContent).toHaveBeenCalledTimes(10);
      });

      it('should handle mixed valid and invalid files', async () => {
        mockFileRepository.findById
          .mockResolvedValueOnce({
            id: 'valid1',
            userId: 'user123',
            filename: 'valid.txt',
            mimeType: 'text/plain',
          })
          .mockResolvedValueOnce(null) // Not found
          .mockResolvedValueOnce({
            id: 'wrong_user',
            userId: 'other',
            filename: 'other.txt',
            mimeType: 'text/plain',
          })
          .mockResolvedValueOnce({
            id: 'binary',
            userId: 'user123',
            filename: 'image.png',
            mimeType: 'image/png',
          })
          .mockResolvedValueOnce({
            id: 'valid2',
            userId: 'user123',
            filename: 'valid2.txt',
            mimeType: 'text/plain',
          });

        mockFileRepository.getContent
          .mockResolvedValueOnce('content 1')
          .mockResolvedValueOnce('content 2');

        const result = await fileContextLoader.loadFileContexts('user123', [
          'valid1',
          'notfound',
          'wrong_user',
          'binary',
          'valid2',
        ]);

        expect(result).toHaveLength(2);
        expect(result[0]).toContain('valid.txt');
        expect(result[1]).toContain('valid2.txt');
      });
    });

    describe('Performance (PERF-002)', () => {
      it('should fetch metadata in parallel, not sequentially', async () => {
        const delay = 50;
        const fileIds = ['file1', 'file2', 'file3'];

        mockFileRepository.findById.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    id: 'file',
                    userId: 'user123',
                    filename: 'test.txt',
                    mimeType: 'text/plain',
                  }),
                delay
              )
            )
        );
        mockFileRepository.getContent.mockResolvedValue('content');

        const start = Date.now();
        await fileContextLoader.loadFileContexts('user123', fileIds);
        const duration = Date.now() - start;

        // If parallel, should take ~delay ms; if sequential, ~delay * 3 ms
        expect(duration).toBeLessThan(delay * 2);
      });

      it('should fetch content in parallel, not sequentially', async () => {
        const delay = 50;
        const fileIds = ['file1', 'file2', 'file3'];

        mockFileRepository.findById.mockImplementation((id) =>
          Promise.resolve({
            id,
            userId: 'user123',
            filename: `${id}.txt`,
            mimeType: 'text/plain',
          })
        );
        mockFileRepository.getContent.mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve('content'), delay))
        );

        const start = Date.now();
        await fileContextLoader.loadFileContexts('user123', fileIds);
        const duration = Date.now() - start;

        // If parallel, should take ~delay ms; if sequential, ~delay * 3 ms
        expect(duration).toBeLessThan(delay * 2);
      });
    });
  });
});
