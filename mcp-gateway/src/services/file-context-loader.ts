/**
 * File Context Loader - ARCH-001
 *
 * Responsible for loading file contexts for AI command processing.
 * Extracts file fetching logic from CommandService for better separation of concerns.
 */

import type { ContainerCradle } from '../container.js';

export interface FileContext {
  fileId: string;
  filename: string;
  content: string;
}

export interface FileContextLoaderDeps {
  fileRepository: ContainerCradle['fileRepository'];
  logger: ContainerCradle['logger'];
}

export class FileContextLoader {
  private readonly fileRepository: FileContextLoaderDeps['fileRepository'];
  private readonly logger: FileContextLoaderDeps['logger'];

  constructor({ fileRepository, logger }: FileContextLoaderDeps) {
    this.fileRepository = fileRepository;
    this.logger = logger;
  }

  /**
   * PERF-002: Fetch file contents for context injection using batched operations
   *
   * Uses Promise.all to fetch metadata in parallel, then fetches content
   * for valid files in parallel.
   *
   * @param userId - The user requesting the files
   * @param fileIds - Array of file IDs to load
   * @returns Array of formatted context strings for AI consumption
   */
  async loadFileContexts(userId: string, fileIds: string[]): Promise<string[]> {
    if (fileIds.length === 0) {
      return [];
    }

    // PERF-002: Batch fetch all file metadata in parallel
    const fileMetadata = await this.fetchFileMetadata(fileIds);

    // Filter to valid, accessible, text-based files
    const validFiles = this.filterValidFiles(fileMetadata, userId);

    if (validFiles.length === 0) {
      return [];
    }

    // PERF-002: Batch fetch all file contents in parallel
    const fileContents = await this.fetchFileContents(validFiles);

    // Build context strings
    return this.buildContextStrings(fileContents);
  }

  /**
   * Fetch metadata for all files in parallel
   */
  private async fetchFileMetadata(
    fileIds: string[]
  ): Promise<Array<{ fileId: string; file: Awaited<ReturnType<typeof this.fileRepository.findById>> | null; error: unknown }>> {
    const filePromises = fileIds.map((fileId) =>
      this.fileRepository
        .findById(fileId)
        .then((file) => ({ fileId, file, error: null }))
        .catch((error) => ({ fileId, file: null, error }))
    );

    return Promise.all(filePromises);
  }

  /**
   * Filter files to only valid, accessible, text-based files
   */
  private filterValidFiles(
    fileResults: Array<{ fileId: string; file: Awaited<ReturnType<typeof this.fileRepository.findById>> | null; error: unknown }>,
    userId: string
  ): Array<{ fileId: string; file: NonNullable<Awaited<ReturnType<typeof this.fileRepository.findById>>> }> {
    const validFiles: Array<{ fileId: string; file: NonNullable<Awaited<ReturnType<typeof this.fileRepository.findById>>> }> = [];

    for (const { fileId, file, error } of fileResults) {
      if (error) {
        this.logger.warn({ fileId, error }, 'Error fetching file metadata');
        continue;
      }

      if (!file) {
        this.logger.warn({ fileId }, 'File not found for context');
        continue;
      }

      if (file.userId !== userId) {
        this.logger.warn({ fileId, userId }, 'File access denied');
        continue;
      }

      // Only include text-based files
      if (!this.isTextFile(file.mimeType)) {
        this.logger.info({ fileId, mimeType: file.mimeType }, 'Skipping non-text file');
        continue;
      }

      validFiles.push({ fileId, file });
    }

    return validFiles;
  }

  /**
   * Check if a file is text-based and suitable for AI context
   */
  private isTextFile(mimeType: string): boolean {
    return (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/yaml' ||
      mimeType === 'application/javascript' ||
      mimeType === 'application/typescript'
    );
  }

  /**
   * Fetch content for all valid files in parallel
   */
  private async fetchFileContents(
    validFiles: Array<{ fileId: string; file: { filename: string } }>
  ): Promise<Array<{ fileId: string; filename: string; content: string | null; error: unknown }>> {
    const contentPromises = validFiles.map(({ fileId, file }) =>
      this.fileRepository
        .getContent(fileId)
        .then((content) => ({
          fileId,
          filename: file.filename,
          content,
          error: null,
        }))
        .catch((error) => ({
          fileId,
          filename: file.filename,
          content: null,
          error,
        }))
    );

    return Promise.all(contentPromises);
  }

  /**
   * Build formatted context strings for AI consumption
   */
  private buildContextStrings(
    contentResults: Array<{ fileId: string; filename: string; content: string | null; error: unknown }>
  ): string[] {
    const contexts: string[] = [];

    for (const { fileId, filename, content, error } of contentResults) {
      if (error) {
        this.logger.warn({ fileId, error }, 'Error fetching file content');
        continue;
      }

      if (content) {
        contexts.push(this.formatFileContext(filename, content));
      }
    }

    return contexts;
  }

  /**
   * Format a single file's content for AI context injection
   */
  private formatFileContext(filename: string, content: string): string {
    return `--- File: ${filename} ---\n${content}\n--- End File ---`;
  }
}
