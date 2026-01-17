/**
 * Command Processor - ARCH-001
 *
 * Orchestrates AI command processing by coordinating:
 * - Input sanitization (SEC-006)
 * - File context loading (PERF-002)
 * - AI orchestrator communication
 * - Response building
 * - Audit logging
 *
 * This is the main entry point for command processing, replacing
 * the monolithic CommandService with a more modular architecture.
 */

import { z } from 'zod';
import type { ContainerCradle } from '../container.js';
import { Errors } from '../middleware/error-handler.js';
import { SIZE_LIMITS, TIMEOUTS } from '../config/constants.js';
import {
  sanitizeInput,
  sanitizeSystemPrompt,
  logSuspiciousInput,
} from '../infrastructure/input-sanitizer.js';
import { FileContextLoader } from './file-context-loader.js';
import {
  CommandResponseBuilder,
  type CommandResponse,
  type AsyncCommandResponse,
  type AIProcessingResult,
} from './command-response-builder.js';

// ============================================================================
// Validation Schemas
// ============================================================================

export const CommandRequestSchema = z.object({
  command: z.string().min(1).max(SIZE_LIMITS.MAX_COMMAND_LENGTH),
  sessionId: z
    .string()
    .regex(/^sess_[a-zA-Z0-9]+$/)
    .optional(),
  context: z
    .object({
      files: z.array(z.string()).max(10).optional(),
      previousMessages: z.number().min(0).max(50).default(10).optional(),
      systemPrompt: z.string().max(SIZE_LIMITS.MAX_SYSTEM_PROMPT_LENGTH).optional(),
      variables: z.record(z.string()).optional(),
    })
    .optional(),
  options: z
    .object({
      model: z
        .enum(['claude-3-5-sonnet', 'claude-3-opus', 'gpt-4-turbo', 'gpt-4o'])
        .default('claude-3-5-sonnet'),
      maxTokens: z.number().min(1).max(16384).default(4096).optional(),
      temperature: z.number().min(0).max(2).default(0.7).optional(),
      stream: z.boolean().default(false).optional(),
      async: z.boolean().default(false).optional(),
    })
    .optional(),
});

export type CommandRequest = z.infer<typeof CommandRequestSchema>;

// ============================================================================
// Command Processor
// ============================================================================

export interface CommandProcessorDeps {
  aiOrchestratorClient: ContainerCradle['aiOrchestratorClient'];
  circuitBreaker: ContainerCradle['circuitBreaker'];
  redis: ContainerCradle['redis'];
  fileRepository: ContainerCradle['fileRepository'];
  auditRepository: ContainerCradle['auditRepository'];
  logger: ContainerCradle['logger'];
}

export class CommandProcessor {
  private readonly aiOrchestratorClient: CommandProcessorDeps['aiOrchestratorClient'];
  private readonly circuitBreaker: CommandProcessorDeps['circuitBreaker'];
  private readonly redis: CommandProcessorDeps['redis'];
  private readonly auditRepository: CommandProcessorDeps['auditRepository'];
  private readonly logger: CommandProcessorDeps['logger'];

  private readonly fileContextLoader: FileContextLoader;
  private readonly responseBuilder: CommandResponseBuilder;

  constructor(deps: CommandProcessorDeps) {
    this.aiOrchestratorClient = deps.aiOrchestratorClient;
    this.circuitBreaker = deps.circuitBreaker;
    this.redis = deps.redis;
    this.auditRepository = deps.auditRepository;
    this.logger = deps.logger;

    // Initialize sub-services
    this.fileContextLoader = new FileContextLoader({
      fileRepository: deps.fileRepository,
      logger: deps.logger,
    });
    this.responseBuilder = new CommandResponseBuilder();
  }

  /**
   * Process a command synchronously
   */
  async processCommand(userId: string, request: CommandRequest): Promise<CommandResponse> {
    const commandId = this.responseBuilder.generateCommandId();

    this.logger.info({ commandId, userId }, 'Processing command');

    // SEC-006: Sanitize input
    const sanitizedCommand = this.sanitizeAndValidate(userId, commandId, request.command);
    const sanitizedSystemPrompt = request.context?.systemPrompt
      ? sanitizeSystemPrompt(request.context.systemPrompt)
      : undefined;

    // Load file contexts if provided
    const fileContexts = await this.loadFileContexts(userId, request.context?.files);

    // Build AI orchestrator payload
    const payload = this.buildAIPayload(
      commandId,
      userId,
      sanitizedCommand,
      sanitizedSystemPrompt,
      fileContexts,
      request
    );

    try {
      // Execute with circuit breaker protection
      const result = await this.executeWithCircuitBreaker(payload);

      // Log audit
      await this.logAudit('command_processed', userId, commandId, payload.model, result);

      return this.responseBuilder.buildSyncResponse(commandId, result, request.sessionId);
    } catch (err) {
      this.logger.error({ err, commandId }, 'Command processing failed');
      this.handleProcessingError(err);
      throw err;
    }
  }

  /**
   * Queue a command for async processing
   */
  async queueCommand(userId: string, request: CommandRequest): Promise<AsyncCommandResponse> {
    const commandId = this.responseBuilder.generateCommandId();

    this.logger.info({ commandId, userId }, 'Queueing command for async processing');

    // Store command in Redis for processing
    const commandData = {
      id: commandId,
      userId,
      request,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };

    await this.redis.setex(`command:${commandId}`, 3600, JSON.stringify(commandData));

    // Publish to queue for worker processing
    await this.redis.lpush('command:queue', commandId);

    // Log audit
    await this.auditRepository.log({
      action: 'command_queued',
      userId,
      metadata: { commandId },
    });

    return this.responseBuilder.buildAsyncResponse(commandId);
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
    return this.responseBuilder.buildStatusResponse(command.status, command.result, command.error);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * SEC-006: Sanitize command input and detect prompt injection
   */
  private sanitizeAndValidate(userId: string, commandId: string, command: string): string {
    const strictMode = process.env.STRICT_INPUT_VALIDATION === 'true';

    const result = sanitizeInput(command, {
      maxLength: SIZE_LIMITS.MAX_COMMAND_LENGTH,
      stripHtml: true,
      normalizeUnicode: true,
      detectInjection: true,
      strictMode,
    });

    // Log suspicious patterns
    logSuspiciousInput(this.logger, userId, command, result);

    // Block high-risk inputs in strict mode
    if (result.shouldBlock) {
      this.handleBlockedInput(commandId, userId, result);
    }

    // Log high-risk inputs for monitoring
    if (result.riskLevel === 'high' && !result.shouldBlock) {
      this.logHighRiskInput(commandId, userId, result);
    }

    return result.sanitized;
  }

  /**
   * Handle blocked input (SEC-006)
   */
  private handleBlockedInput(
    commandId: string,
    userId: string,
    result: ReturnType<typeof sanitizeInput>
  ): never {
    this.logger.warn(
      { commandId, userId, patterns: result.suspiciousPatterns },
      'SEC-006: Blocking suspicious input'
    );

    this.auditRepository.logAsync({
      action: 'command_blocked',
      userId,
      metadata: {
        commandId,
        riskLevel: result.riskLevel,
        patterns: result.suspiciousPatterns,
      },
    });

    throw Errors.badRequest(
      'Your message contains patterns that cannot be processed. Please rephrase your request.'
    );
  }

  /**
   * Log high-risk input for monitoring
   */
  private logHighRiskInput(
    commandId: string,
    userId: string,
    result: ReturnType<typeof sanitizeInput>
  ): void {
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

  /**
   * Load file contexts for the command
   */
  private async loadFileContexts(
    userId: string,
    fileIds?: string[]
  ): Promise<string[]> {
    if (!fileIds?.length) {
      return [];
    }
    return this.fileContextLoader.loadFileContexts(userId, fileIds);
  }

  /**
   * Build the payload for AI Orchestrator
   */
  private buildAIPayload(
    commandId: string,
    userId: string,
    command: string,
    systemPrompt: string | undefined,
    fileContexts: string[],
    request: CommandRequest
  ): {
    id: string;
    userId: string;
    command: string;
    sessionId?: string;
    fileContexts: string[];
    systemPrompt?: string;
    variables?: Record<string, string>;
    previousMessages: number;
    model: string;
    maxTokens: number;
    temperature: number;
  } {
    return {
      id: commandId,
      userId,
      command,
      sessionId: request.sessionId,
      fileContexts,
      systemPrompt,
      variables: request.context?.variables,
      previousMessages: request.context?.previousMessages ?? 10,
      model: request.options?.model ?? 'claude-3-5-sonnet',
      maxTokens: request.options?.maxTokens ?? 4096,
      temperature: request.options?.temperature ?? 0.7,
    };
  }

  /**
   * Execute command with circuit breaker protection
   */
  private async executeWithCircuitBreaker(
    payload: ReturnType<typeof this.buildAIPayload>
  ): Promise<AIProcessingResult> {
    return this.circuitBreaker.execute(
      'ai-orchestrator',
      () => this.aiOrchestratorClient.processCommand(payload),
      { timeout: TIMEOUTS.AI_PROCESSING }
    );
  }

  /**
   * Log audit entry for processed command
   */
  private async logAudit(
    action: string,
    userId: string,
    commandId: string,
    model: string,
    result: AIProcessingResult
  ): Promise<void> {
    await this.auditRepository.log({
      action,
      userId,
      metadata: this.responseBuilder.buildAuditMetadata(commandId, model, result),
    });
  }

  /**
   * Handle processing errors
   */
  private handleProcessingError(err: unknown): void {
    const state = this.circuitBreaker.getState('ai-orchestrator');
    if (state === 'open') {
      throw Errors.serviceUnavailable('AI Orchestrator');
    }
  }
}
