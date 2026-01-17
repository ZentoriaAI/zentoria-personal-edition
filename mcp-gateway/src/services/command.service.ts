/**
 * Command Service
 *
 * Handles AI command processing via the AI Orchestrator (405)
 */

import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';
import {
  sanitizeInput,
  sanitizeSystemPrompt,
  logSuspiciousInput,
  type SanitizationResult,
} from '../infrastructure/input-sanitizer.js';

// Validation schemas
export const CommandRequestSchema = z.object({
  command: z.string().min(1).max(32000),
  sessionId: z.string().regex(/^sess_[a-zA-Z0-9]+$/).optional(),
  context: z.object({
    files: z.array(z.string()).max(10).optional(),
    previousMessages: z.number().min(0).max(50).default(10).optional(),
    systemPrompt: z.string().max(4000).optional(),
    variables: z.record(z.string()).optional(),
  }).optional(),
  options: z.object({
    model: z.enum(['claude-3-5-sonnet', 'claude-3-opus', 'gpt-4-turbo', 'gpt-4o']).default('claude-3-5-sonnet'),
    maxTokens: z.number().min(1).max(16384).default(4096).optional(),
    temperature: z.number().min(0).max(2).default(0.7).optional(),
    stream: z.boolean().default(false).optional(),
    async: z.boolean().default(false).optional(),
  }).optional(),
});

export type CommandRequest = z.infer<typeof CommandRequestSchema>;

export interface CommandResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  sessionId?: string;
  finishReason: 'stop' | 'max_tokens' | 'error';
  metadata?: Record<string, unknown>;
}

export interface AsyncCommandResponse {
  id: string;
  status: 'queued' | 'processing';
  estimatedCompletionMs?: number;
  pollingUrl: string;
  websocketUrl: string;
}

export class CommandService {
  private readonly aiOrchestratorClient: ContainerCradle['aiOrchestratorClient'];
  private readonly circuitBreaker: ContainerCradle['circuitBreaker'];
  private readonly redis: ContainerCradle['redis'];
  private readonly fileRepository: ContainerCradle['fileRepository'];
  private readonly auditRepository: ContainerCradle['auditRepository'];
  private readonly logger: ContainerCradle['logger'];

  constructor({
    aiOrchestratorClient,
    circuitBreaker,
    redis,
    fileRepository,
    auditRepository,
    logger,
  }: ContainerCradle) {
    this.aiOrchestratorClient = aiOrchestratorClient;
    this.circuitBreaker = circuitBreaker;
    this.redis = redis;
    this.fileRepository = fileRepository;
    this.auditRepository = auditRepository;
    this.logger = logger;
  }

  /**
   * Process a command synchronously
   */
  async processCommand(
    userId: string,
    request: CommandRequest
  ): Promise<CommandResponse> {
    const commandId = `cmd_${nanoid(16)}`;

    this.logger.info({ commandId, userId }, 'Processing command');

    // SEC-006: Sanitize input and detect prompt injection
    const sanitizedCommand = this.sanitizeCommand(userId, commandId, request.command);
    const sanitizedSystemPrompt = request.context?.systemPrompt
      ? sanitizeSystemPrompt(request.context.systemPrompt)
      : undefined;

    // Validate and fetch file contexts if provided
    let fileContexts: string[] = [];
    if (request.context?.files?.length) {
      fileContexts = await this.fetchFileContexts(userId, request.context.files);
    }

    // Build the payload for AI Orchestrator
    const payload = {
      id: commandId,
      userId,
      command: sanitizedCommand, // SEC-006: Use sanitized input
      sessionId: request.sessionId,
      fileContexts,
      systemPrompt: sanitizedSystemPrompt, // SEC-006: Use sanitized system prompt
      variables: request.context?.variables,
      previousMessages: request.context?.previousMessages ?? 10,
      model: request.options?.model ?? 'claude-3-5-sonnet',
      maxTokens: request.options?.maxTokens ?? 4096,
      temperature: request.options?.temperature ?? 0.7,
    };

    try {
      // Execute with circuit breaker protection
      const result = await this.circuitBreaker.execute(
        'ai-orchestrator',
        () => this.aiOrchestratorClient.processCommand(payload),
        { timeout: 120000 } // 2 minutes for AI processing
      );

      // Log audit
      await this.auditRepository.log({
        action: 'command_processed',
        userId,
        metadata: {
          commandId,
          model: payload.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        },
      });

      return {
        id: commandId,
        content: result.content,
        model: result.model,
        usage: result.usage,
        sessionId: request.sessionId,
        finishReason: result.finishReason,
        metadata: result.metadata,
      };
    } catch (err) {
      this.logger.error({ err, commandId }, 'Command processing failed');

      // Check if circuit is open
      const state = this.circuitBreaker.getState('ai-orchestrator');
      if (state === 'open') {
        throw Errors.serviceUnavailable('AI Orchestrator');
      }

      throw err;
    }
  }

  /**
   * Queue a command for async processing
   */
  async queueCommand(
    userId: string,
    request: CommandRequest
  ): Promise<AsyncCommandResponse> {
    const commandId = `cmd_${nanoid(16)}`;

    this.logger.info({ commandId, userId }, 'Queueing command for async processing');

    // Store command in Redis for processing
    const commandData = {
      id: commandId,
      userId,
      request,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };

    await this.redis.setex(
      `command:${commandId}`,
      3600, // 1 hour TTL
      JSON.stringify(commandData)
    );

    // Publish to queue for worker processing
    await this.redis.lpush('command:queue', commandId);

    // Log audit
    await this.auditRepository.log({
      action: 'command_queued',
      userId,
      metadata: { commandId },
    });

    const baseUrl = process.env.BASE_URL || 'http://localhost:4000';

    return {
      id: commandId,
      status: 'queued',
      estimatedCompletionMs: 30000,
      pollingUrl: `${baseUrl}/api/v1/mcp/command/${commandId}`,
      websocketUrl: `${baseUrl.replace('http', 'ws')}/ws/command/${commandId}`,
    };
  }

  /**
   * Get status of an async command
   */
  async getCommandStatus(commandId: string): Promise<{
    status: 'queued' | 'processing' | 'completed' | 'failed';
    result?: CommandResponse;
    error?: string;
  }> {
    const data = await this.redis.get(`command:${commandId}`);
    if (!data) {
      throw Errors.notFound('Command', commandId);
    }

    const command = JSON.parse(data);
    return {
      status: command.status,
      result: command.result,
      error: command.error,
    };
  }

  /**
   * PERF-002: Fetch file contents for context injection using batched operations
   *
   * Uses Promise.all to fetch metadata in parallel, then fetches content
   * for valid files in parallel.
   */
  private async fetchFileContexts(
    userId: string,
    fileIds: string[]
  ): Promise<string[]> {
    if (fileIds.length === 0) {
      return [];
    }

    // PERF-002: Batch fetch all file metadata in parallel
    const filePromises = fileIds.map(fileId =>
      this.fileRepository.findById(fileId)
        .then(file => ({ fileId, file, error: null }))
        .catch(error => ({ fileId, file: null, error }))
    );

    const fileResults = await Promise.all(filePromises);

    // Filter to valid, accessible, text-based files
    const validFiles = fileResults.filter(({ fileId, file, error }) => {
      if (error) {
        this.logger.warn({ fileId, error }, 'Error fetching file metadata');
        return false;
      }

      if (!file) {
        this.logger.warn({ fileId }, 'File not found for context');
        return false;
      }

      if (file.userId !== userId) {
        this.logger.warn({ fileId, userId }, 'File access denied');
        return false;
      }

      // Only include text-based files
      const isTextFile = file.mimeType.startsWith('text/') ||
                        file.mimeType === 'application/json' ||
                        file.mimeType === 'application/xml' ||
                        file.mimeType === 'application/yaml';

      if (!isTextFile) {
        this.logger.info({ fileId, mimeType: file.mimeType }, 'Skipping non-text file');
        return false;
      }

      return true;
    });

    if (validFiles.length === 0) {
      return [];
    }

    // PERF-002: Batch fetch all file contents in parallel
    const contentPromises = validFiles.map(({ fileId, file }) =>
      this.fileRepository.getContent(fileId)
        .then(content => ({
          fileId,
          filename: file!.filename,
          content,
          error: null,
        }))
        .catch(error => ({
          fileId,
          filename: file!.filename,
          content: null,
          error,
        }))
    );

    const contentResults = await Promise.all(contentPromises);

    // Build context strings
    const contexts: string[] = [];
    for (const { fileId, filename, content, error } of contentResults) {
      if (error) {
        this.logger.warn({ fileId, error }, 'Error fetching file content');
        continue;
      }

      if (content) {
        contexts.push(`--- File: ${filename} ---\n${content}\n--- End File ---`);
      }
    }

    return contexts;
  }

  /**
   * SEC-006: Sanitize command input and detect prompt injection
   *
   * Sanitizes user input, detects potential prompt injection patterns,
   * and logs suspicious activity for security review.
   */
  private sanitizeCommand(
    userId: string,
    commandId: string,
    command: string
  ): string {
    // Enable strict mode based on environment
    const strictMode = process.env.STRICT_INPUT_VALIDATION === 'true';

    const result = sanitizeInput(command, {
      maxLength: 32000,
      stripHtml: true,
      normalizeUnicode: true,
      detectInjection: true,
      strictMode,
    });

    // Log suspicious patterns for security review
    logSuspiciousInput(this.logger, userId, command, result);

    // Block high-risk inputs in strict mode
    if (result.shouldBlock) {
      this.logger.warn(
        { commandId, userId, patterns: result.suspiciousPatterns },
        'SEC-006: Blocking suspicious input'
      );

      // Log to audit for security review
      this.auditRepository.logAsync({
        action: 'command_blocked',
        userId,
        metadata: {
          commandId,
          riskLevel: result.riskLevel,
          patterns: result.suspiciousPatterns,
          inputPreview: command.slice(0, 100),
        },
      });

      throw Errors.badRequest(
        'Your message contains patterns that cannot be processed. Please rephrase your request.'
      );
    }

    // Log high-risk inputs even if not blocked (for monitoring)
    if (result.riskLevel === 'high' && !result.shouldBlock) {
      this.auditRepository.logAsync({
        action: 'command_high_risk',
        userId,
        metadata: {
          commandId,
          riskLevel: result.riskLevel,
          patterns: result.suspiciousPatterns,
          wasModified: result.wasModified,
        },
      });
    }

    return result.sanitized;
  }
}
