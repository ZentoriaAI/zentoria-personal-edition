/**
 * Command Response Builder - ARCH-001
 *
 * Responsible for building and formatting command responses.
 * Extracts response construction logic from CommandService for better separation of concerns.
 */

import { nanoid } from 'nanoid';
import { SECURITY } from '../config/constants.js';

export interface AIProcessingResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'max_tokens' | 'error';
  metadata?: Record<string, unknown>;
}

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

export interface CommandStatusResponse {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: CommandResponse;
  error?: string;
}

export class CommandResponseBuilder {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.BASE_URL || 'http://localhost:4000';
  }

  /**
   * Generate a unique command ID
   */
  generateCommandId(): string {
    return `${SECURITY.COMMAND_ID_PREFIX}${nanoid(16)}`;
  }

  /**
   * Build a synchronous command response from AI processing result
   */
  buildSyncResponse(
    commandId: string,
    result: AIProcessingResult,
    sessionId?: string
  ): CommandResponse {
    return {
      id: commandId,
      content: result.content,
      model: result.model,
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      },
      sessionId,
      finishReason: result.finishReason,
      metadata: result.metadata,
    };
  }

  /**
   * Build an async command response with polling/websocket URLs
   */
  buildAsyncResponse(
    commandId: string,
    estimatedCompletionMs: number = 30000
  ): AsyncCommandResponse {
    return {
      id: commandId,
      status: 'queued',
      estimatedCompletionMs,
      pollingUrl: `${this.baseUrl}/api/v1/mcp/command/${commandId}`,
      websocketUrl: `${this.baseUrl.replace('http', 'ws')}/ws/command/${commandId}`,
    };
  }

  /**
   * Build a command status response
   */
  buildStatusResponse(
    status: 'queued' | 'processing' | 'completed' | 'failed',
    result?: CommandResponse,
    error?: string
  ): CommandStatusResponse {
    return {
      status,
      result,
      error,
    };
  }

  /**
   * Build an error response for command processing failures
   */
  buildErrorResponse(
    commandId: string,
    errorMessage: string,
    sessionId?: string
  ): CommandResponse {
    return {
      id: commandId,
      content: '',
      model: 'error',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      sessionId,
      finishReason: 'error',
      metadata: {
        error: errorMessage,
      },
    };
  }

  /**
   * Build audit metadata for logging
   */
  buildAuditMetadata(
    commandId: string,
    model: string,
    result: AIProcessingResult
  ): Record<string, unknown> {
    return {
      commandId,
      model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    };
  }
}
