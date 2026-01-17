/**
 * Command Response Builder Tests - ARCH-001
 *
 * Tests for the CommandResponseBuilder service that handles
 * response construction for AI command processing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CommandResponseBuilder,
  type AIProcessingResult,
} from '../services/command-response-builder.js';

describe('CommandResponseBuilder (ARCH-001)', () => {
  let builder: CommandResponseBuilder;

  beforeEach(() => {
    builder = new CommandResponseBuilder('http://localhost:4000');
  });

  describe('generateCommandId', () => {
    it('should generate unique command IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(builder.generateCommandId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate IDs with cmd_ prefix', () => {
      const id = builder.generateCommandId();
      expect(id).toMatch(/^cmd_/);
    });

    it('should generate IDs of consistent length', () => {
      const id1 = builder.generateCommandId();
      const id2 = builder.generateCommandId();
      expect(id1.length).toBe(id2.length);
    });

    it('should generate IDs with alphanumeric characters after prefix', () => {
      const id = builder.generateCommandId();
      const suffix = id.slice(4); // Remove "cmd_" prefix
      expect(suffix).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });

  describe('buildSyncResponse', () => {
    const mockResult: AIProcessingResult = {
      content: 'Hello, how can I help you?',
      model: 'claude-3-5-sonnet',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      finishReason: 'stop',
      metadata: { custom: 'data' },
    };

    it('should build response with all required fields', () => {
      const response = builder.buildSyncResponse(
        'cmd_123',
        mockResult,
        'sess_456'
      );

      expect(response.id).toBe('cmd_123');
      expect(response.content).toBe('Hello, how can I help you?');
      expect(response.model).toBe('claude-3-5-sonnet');
      expect(response.sessionId).toBe('sess_456');
      expect(response.finishReason).toBe('stop');
    });

    it('should include usage information', () => {
      const response = builder.buildSyncResponse('cmd_123', mockResult);

      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });

    it('should include metadata when provided', () => {
      const response = builder.buildSyncResponse('cmd_123', mockResult);

      expect(response.metadata).toEqual({ custom: 'data' });
    });

    it('should handle undefined sessionId', () => {
      const response = builder.buildSyncResponse('cmd_123', mockResult);

      expect(response.sessionId).toBeUndefined();
    });

    it('should handle undefined metadata', () => {
      const resultWithoutMetadata: AIProcessingResult = {
        ...mockResult,
        metadata: undefined,
      };
      const response = builder.buildSyncResponse(
        'cmd_123',
        resultWithoutMetadata
      );

      expect(response.metadata).toBeUndefined();
    });

    it('should preserve all finish reasons', () => {
      const finishReasons: Array<'stop' | 'max_tokens' | 'error'> = [
        'stop',
        'max_tokens',
        'error',
      ];

      for (const finishReason of finishReasons) {
        const result = { ...mockResult, finishReason };
        const response = builder.buildSyncResponse('cmd_123', result);
        expect(response.finishReason).toBe(finishReason);
      }
    });
  });

  describe('buildAsyncResponse', () => {
    it('should build async response with correct structure', () => {
      const response = builder.buildAsyncResponse('cmd_123');

      expect(response.id).toBe('cmd_123');
      expect(response.status).toBe('queued');
      expect(response.pollingUrl).toBeDefined();
      expect(response.websocketUrl).toBeDefined();
    });

    it('should include default estimated completion time', () => {
      const response = builder.buildAsyncResponse('cmd_123');

      expect(response.estimatedCompletionMs).toBe(30000);
    });

    it('should allow custom estimated completion time', () => {
      const response = builder.buildAsyncResponse('cmd_123', 60000);

      expect(response.estimatedCompletionMs).toBe(60000);
    });

    it('should generate correct polling URL', () => {
      const response = builder.buildAsyncResponse('cmd_123');

      expect(response.pollingUrl).toBe(
        'http://localhost:4000/api/v1/mcp/command/cmd_123'
      );
    });

    it('should generate correct websocket URL', () => {
      const response = builder.buildAsyncResponse('cmd_123');

      expect(response.websocketUrl).toBe(
        'ws://localhost:4000/ws/command/cmd_123'
      );
    });

    it('should handle HTTPS base URL', () => {
      const httpsBuilder = new CommandResponseBuilder('https://api.example.com');
      const response = httpsBuilder.buildAsyncResponse('cmd_123');

      expect(response.pollingUrl).toBe(
        'https://api.example.com/api/v1/mcp/command/cmd_123'
      );
      expect(response.websocketUrl).toBe(
        'wss://api.example.com/ws/command/cmd_123'
      );
    });
  });

  describe('buildStatusResponse', () => {
    it('should build status response for queued command', () => {
      const response = builder.buildStatusResponse('queued');

      expect(response.status).toBe('queued');
      expect(response.result).toBeUndefined();
      expect(response.error).toBeUndefined();
    });

    it('should build status response for processing command', () => {
      const response = builder.buildStatusResponse('processing');

      expect(response.status).toBe('processing');
    });

    it('should build status response for completed command', () => {
      const result = {
        id: 'cmd_123',
        content: 'Response',
        model: 'claude-3-5-sonnet',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop' as const,
      };

      const response = builder.buildStatusResponse('completed', result);

      expect(response.status).toBe('completed');
      expect(response.result).toEqual(result);
    });

    it('should build status response for failed command', () => {
      const response = builder.buildStatusResponse(
        'failed',
        undefined,
        'Processing error occurred'
      );

      expect(response.status).toBe('failed');
      expect(response.error).toBe('Processing error occurred');
    });

    it('should handle all valid status values', () => {
      const statuses: Array<'queued' | 'processing' | 'completed' | 'failed'> = [
        'queued',
        'processing',
        'completed',
        'failed',
      ];

      for (const status of statuses) {
        const response = builder.buildStatusResponse(status);
        expect(response.status).toBe(status);
      }
    });
  });

  describe('buildErrorResponse', () => {
    it('should build error response with correct structure', () => {
      const response = builder.buildErrorResponse(
        'cmd_123',
        'An error occurred',
        'sess_456'
      );

      expect(response.id).toBe('cmd_123');
      expect(response.content).toBe('');
      expect(response.model).toBe('error');
      expect(response.sessionId).toBe('sess_456');
      expect(response.finishReason).toBe('error');
    });

    it('should include error message in metadata', () => {
      const response = builder.buildErrorResponse(
        'cmd_123',
        'Database connection failed'
      );

      expect(response.metadata).toEqual({
        error: 'Database connection failed',
      });
    });

    it('should set zero token usage', () => {
      const response = builder.buildErrorResponse('cmd_123', 'Error');

      expect(response.usage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });

    it('should handle undefined sessionId', () => {
      const response = builder.buildErrorResponse('cmd_123', 'Error');

      expect(response.sessionId).toBeUndefined();
    });
  });

  describe('buildAuditMetadata', () => {
    const mockResult: AIProcessingResult = {
      content: 'Response',
      model: 'claude-3-5-sonnet',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      },
      finishReason: 'stop',
    };

    it('should include command ID', () => {
      const metadata = builder.buildAuditMetadata(
        'cmd_123',
        'claude-3-5-sonnet',
        mockResult
      );

      expect(metadata.commandId).toBe('cmd_123');
    });

    it('should include model name', () => {
      const metadata = builder.buildAuditMetadata(
        'cmd_123',
        'gpt-4-turbo',
        mockResult
      );

      expect(metadata.model).toBe('gpt-4-turbo');
    });

    it('should include token counts', () => {
      const metadata = builder.buildAuditMetadata(
        'cmd_123',
        'claude-3-5-sonnet',
        mockResult
      );

      expect(metadata.promptTokens).toBe(100);
      expect(metadata.completionTokens).toBe(200);
    });

    it('should not include total tokens (derived field)', () => {
      const metadata = builder.buildAuditMetadata(
        'cmd_123',
        'claude-3-5-sonnet',
        mockResult
      );

      expect(metadata).not.toHaveProperty('totalTokens');
    });
  });

  describe('Constructor and Base URL', () => {
    it('should use provided base URL', () => {
      const customBuilder = new CommandResponseBuilder(
        'https://custom.api.com'
      );
      const response = customBuilder.buildAsyncResponse('cmd_123');

      expect(response.pollingUrl).toContain('https://custom.api.com');
    });

    it('should use default base URL when not provided', () => {
      // Save original env
      const originalEnv = process.env.BASE_URL;

      // Clear env
      delete process.env.BASE_URL;

      const defaultBuilder = new CommandResponseBuilder();
      const response = defaultBuilder.buildAsyncResponse('cmd_123');

      expect(response.pollingUrl).toContain('http://localhost:4000');

      // Restore env
      process.env.BASE_URL = originalEnv;
    });

    it('should use BASE_URL env variable when no argument provided', () => {
      const originalEnv = process.env.BASE_URL;
      process.env.BASE_URL = 'https://env.example.com';

      const envBuilder = new CommandResponseBuilder();
      const response = envBuilder.buildAsyncResponse('cmd_123');

      expect(response.pollingUrl).toContain('https://env.example.com');

      process.env.BASE_URL = originalEnv;
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content in result', () => {
      const result: AIProcessingResult = {
        content: '',
        model: 'claude-3-5-sonnet',
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        finishReason: 'stop',
      };

      const response = builder.buildSyncResponse('cmd_123', result);
      expect(response.content).toBe('');
    });

    it('should handle very long content', () => {
      const longContent = 'a'.repeat(100000);
      const result: AIProcessingResult = {
        content: longContent,
        model: 'claude-3-5-sonnet',
        usage: { promptTokens: 100, completionTokens: 50000, totalTokens: 50100 },
        finishReason: 'stop',
      };

      const response = builder.buildSyncResponse('cmd_123', result);
      expect(response.content.length).toBe(100000);
    });

    it('should handle special characters in command ID', () => {
      const response = builder.buildAsyncResponse('cmd_abc-123_xyz');

      expect(response.pollingUrl).toContain('cmd_abc-123_xyz');
    });

    it('should handle empty error message', () => {
      const response = builder.buildErrorResponse('cmd_123', '');

      expect(response.metadata?.error).toBe('');
    });

    it('should handle zero token usage in result', () => {
      const result: AIProcessingResult = {
        content: 'Response',
        model: 'claude-3-5-sonnet',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
      };

      const response = builder.buildSyncResponse('cmd_123', result);
      expect(response.usage.totalTokens).toBe(0);
    });
  });
});
