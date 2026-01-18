/**
 * AI Orchestrator HTTP Client
 *
 * Communicates with AI Orchestrator Service (Container 405)
 */

import type { ContainerCradle } from '../container.js';

export interface ProcessCommandPayload {
  id: string;
  userId: string;
  command: string;
  sessionId?: string;
  fileContexts?: string[];
  systemPrompt?: string;
  variables?: Record<string, string>;
  previousMessages?: number;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface CommandResult {
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

export class AiOrchestratorClient {
  private readonly baseUrl: string;
  private readonly logger: ContainerCradle['logger'];

  constructor({ logger }: ContainerCradle) {
    this.baseUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ai-orchestrator:4005';
    this.logger = logger;
  }

  /**
   * Process an AI command via the /chat endpoint
   */
  async processCommand(payload: ProcessCommandPayload): Promise<CommandResult> {
    this.logger.debug({ commandId: payload.id }, 'Sending command to AI Orchestrator');

    // Transform payload to AI Orchestrator ChatRequest format
    const chatPayload = {
      message: payload.command,
      session_id: payload.sessionId,
      user_id: payload.userId,
      stream: false,
      use_rag: false,
      agent: 'chat',  // Force chat agent to avoid SearchAgent routing
      context: {
        command_id: payload.id,
        file_contexts: payload.fileContexts,
        system_prompt: payload.systemPrompt,
        variables: payload.variables,
        previous_messages: payload.previousMessages,
        model: payload.model,
        max_tokens: payload.maxTokens,
        temperature: payload.temperature,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN || '',
      },
      body: JSON.stringify(chatPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        { status: response.status, error },
        'AI Orchestrator request failed'
      );
      throw new Error(`AI Orchestrator error: ${response.status} - ${error}`);
    }

    // Transform ChatResponse to CommandResult format
    const chatResponse = await response.json() as {
      message: string;
      session_id?: string;
      sources?: unknown[];
      metadata?: Record<string, unknown>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    return {
      content: chatResponse.message,
      model: payload.model,
      usage: {
        promptTokens: chatResponse.usage?.prompt_tokens || 0,
        completionTokens: chatResponse.usage?.completion_tokens || 0,
        totalTokens: chatResponse.usage?.total_tokens || 0,
      },
      finishReason: 'stop',
      metadata: chatResponse.metadata,
    };
  }

  /**
   * Process command with streaming
   */
  async *processCommandStream(
    payload: ProcessCommandPayload
  ): AsyncGenerator<{ type: 'chunk' | 'done' | 'error'; content?: string; usage?: CommandResult['usage'] }> {
    // Transform payload to AI Orchestrator ChatRequest format
    const chatPayload = {
      message: payload.command,
      session_id: payload.sessionId,
      user_id: payload.userId,
      stream: true,
      use_rag: false,
      agent: 'chat',  // Force chat agent to avoid SearchAgent routing
      context: {
        command_id: payload.id,
        file_contexts: payload.fileContexts,
        system_prompt: payload.systemPrompt,
        variables: payload.variables,
        previous_messages: payload.previousMessages,
        model: payload.model,
        max_tokens: payload.maxTokens,
        temperature: payload.temperature,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN || '',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(chatPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      yield { type: 'error', content: error };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', content: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE format
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              yield { type: 'done' };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              yield { type: 'chunk', content: parsed.content, usage: parsed.usage };
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/models`, {
      method: 'GET',
      headers: {
        'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN || '',
      },
    });

    if (!response.ok) {
      return ['claude-3-5-sonnet']; // Default fallback
    }

    const data = await response.json() as { models: string[] };
    return data.models;
  }

  /**
   * Check service health
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
