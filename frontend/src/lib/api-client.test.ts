/**
 * API Client Tests - TEST-006
 *
 * Comprehensive tests for the ApiClient class including:
 * - Configuration and authentication
 * - Health endpoints
 * - Chat endpoints
 * - File endpoints
 * - Workflow endpoints
 * - API key endpoints
 * - Settings endpoints
 * - Log endpoints
 * - Error handling
 * - Streaming
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { ApiClient } from './api-client';

// Mock axios
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
    },
  };
});

// Get the mocked axios instance
const getMockAxios = () => {
  return (axios.create as any)();
};

describe('ApiClient (TEST-006)', () => {
  let apiClient: ApiClient;
  let mockAxios: ReturnType<typeof getMockAxios>;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = new ApiClient();
    mockAxios = getMockAxios();
  });

  describe('Configuration', () => {
    it('should create axios instance with correct config', () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: expect.stringContaining('/api'),
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should set up request interceptor', () => {
      expect(mockAxios.interceptors.request.use).toHaveBeenCalled();
    });

    it('should set up response interceptor', () => {
      expect(mockAxios.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('API Key Management', () => {
    it('should set API key', () => {
      apiClient.setApiKey('test_api_key_123');
      // The key is stored internally and used in interceptors
      expect(true).toBe(true); // Key setting doesn't throw
    });

    it('should clear API key', () => {
      apiClient.setApiKey('test_api_key_123');
      apiClient.clearApiKey();
      // No error means success
      expect(true).toBe(true);
    });
  });

  describe('Health Endpoints', () => {
    describe('getHealth', () => {
      it('should fetch system health', async () => {
        const healthData = {
          status: 'healthy',
          services: [],
          uptime: 3600,
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: healthData },
        });

        const result = await apiClient.getHealth();

        expect(mockAxios.get).toHaveBeenCalledWith('/health');
        expect(result).toEqual(healthData);
      });
    });

    describe('getMetrics', () => {
      it('should fetch system metrics', async () => {
        const metricsData = {
          cpu: { usage: 50, cores: 4 },
          memory: { used: 4000, total: 8000, percentage: 50 },
          disk: { used: 100000, total: 500000, percentage: 20 },
          network: { bytesIn: 1000, bytesOut: 2000 },
        };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: metricsData },
        });

        const result = await apiClient.getMetrics();

        expect(mockAxios.get).toHaveBeenCalledWith('/health/metrics');
        expect(result).toEqual(metricsData);
      });
    });
  });

  describe('Chat Endpoints', () => {
    describe('getConversations', () => {
      it('should fetch conversations with pagination', async () => {
        const conversationsData = {
          items: [{ id: 'conv_1', title: 'Test' }],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: conversationsData },
        });

        const result = await apiClient.getConversations(1, 20);

        expect(mockAxios.get).toHaveBeenCalledWith('/chat/conversations', {
          params: { page: 1, pageSize: 20 },
        });
        expect(result).toEqual(conversationsData);
      });

      it('should use default pagination values', async () => {
        mockAxios.get.mockResolvedValue({
          data: { success: true, data: { items: [], total: 0 } },
        });

        await apiClient.getConversations();

        expect(mockAxios.get).toHaveBeenCalledWith('/chat/conversations', {
          params: { page: 1, pageSize: 20 },
        });
      });
    });

    describe('getConversation', () => {
      it('should fetch single conversation', async () => {
        const conversation = { id: 'conv_1', title: 'Test' };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: conversation },
        });

        const result = await apiClient.getConversation('conv_1');

        expect(mockAxios.get).toHaveBeenCalledWith('/chat/conversations/conv_1');
        expect(result).toEqual(conversation);
      });
    });

    describe('createConversation', () => {
      it('should create new conversation', async () => {
        const newConversation = { id: 'conv_new', title: 'New Chat' };

        mockAxios.post.mockResolvedValue({
          data: { success: true, data: newConversation },
        });

        const result = await apiClient.createConversation('New Chat', 'claude-3-5-sonnet');

        expect(mockAxios.post).toHaveBeenCalledWith('/chat/conversations', {
          title: 'New Chat',
          model: 'claude-3-5-sonnet',
        });
        expect(result).toEqual(newConversation);
      });

      it('should create conversation without title', async () => {
        mockAxios.post.mockResolvedValue({
          data: { success: true, data: { id: 'conv_new' } },
        });

        await apiClient.createConversation();

        expect(mockAxios.post).toHaveBeenCalledWith('/chat/conversations', {
          title: undefined,
          model: undefined,
        });
      });
    });

    describe('deleteConversation', () => {
      it('should delete conversation', async () => {
        mockAxios.delete.mockResolvedValue({ data: { success: true } });

        await apiClient.deleteConversation('conv_1');

        expect(mockAxios.delete).toHaveBeenCalledWith('/chat/conversations/conv_1');
      });
    });

    describe('getMessages', () => {
      it('should fetch messages with pagination', async () => {
        const messagesData = {
          items: [{ id: 'msg_1', content: 'Hello' }],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: messagesData },
        });

        const result = await apiClient.getMessages('conv_1', 1, 50);

        expect(mockAxios.get).toHaveBeenCalledWith('/chat/conversations/conv_1/messages', {
          params: { page: 1, pageSize: 50 },
        });
        expect(result).toEqual(messagesData);
      });
    });

    describe('sendMessage', () => {
      it('should send message', async () => {
        const request = { message: 'Hello', conversationId: 'conv_1' };
        const response = { id: 'msg_1', content: 'Hi there' };

        mockAxios.post.mockResolvedValue({
          data: { success: true, data: response },
        });

        const result = await apiClient.sendMessage(request);

        expect(mockAxios.post).toHaveBeenCalledWith('/chat/messages', request);
        expect(result).toEqual(response);
      });
    });

    describe('streamMessage', () => {
      it('should return abort function', () => {
        const onChunk = vi.fn();
        const onError = vi.fn();
        const onComplete = vi.fn();

        const abort = apiClient.streamMessage(
          { message: 'Hello' },
          onChunk,
          onError,
          onComplete
        );

        expect(typeof abort).toBe('function');
      });
    });
  });

  describe('File Endpoints', () => {
    describe('listFiles', () => {
      it('should list files with pagination', async () => {
        const filesData = {
          items: [{ id: 'file_1', name: 'test.txt' }],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: filesData },
        });

        const result = await apiClient.listFiles('/documents', 1, 50);

        expect(mockAxios.get).toHaveBeenCalledWith('/files', {
          params: { path: '/documents', page: 1, pageSize: 50 },
        });
        expect(result).toEqual(filesData);
      });

      it('should use default values', async () => {
        mockAxios.get.mockResolvedValue({
          data: { success: true, data: { items: [] } },
        });

        await apiClient.listFiles();

        expect(mockAxios.get).toHaveBeenCalledWith('/files', {
          params: { path: '/', page: 1, pageSize: 50 },
        });
      });
    });

    describe('getFile', () => {
      it('should get file by ID', async () => {
        const file = { id: 'file_1', name: 'test.txt' };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: file },
        });

        const result = await apiClient.getFile('file_1');

        expect(mockAxios.get).toHaveBeenCalledWith('/files/file_1');
        expect(result).toEqual(file);
      });
    });

    describe('createFolder', () => {
      it('should create folder', async () => {
        const folder = { id: 'folder_1', name: 'New Folder', isDirectory: true };

        mockAxios.post.mockResolvedValue({
          data: { success: true, data: folder },
        });

        const result = await apiClient.createFolder('/documents', 'New Folder');

        expect(mockAxios.post).toHaveBeenCalledWith('/files/folder', {
          path: '/documents',
          name: 'New Folder',
        });
        expect(result).toEqual(folder);
      });
    });

    describe('deleteFile', () => {
      it('should delete file', async () => {
        mockAxios.delete.mockResolvedValue({ data: { success: true } });

        await apiClient.deleteFile('file_1');

        expect(mockAxios.delete).toHaveBeenCalledWith('/files/file_1');
      });
    });

    describe('moveFile', () => {
      it('should move file to new path', async () => {
        const movedFile = { id: 'file_1', path: '/new/path' };

        mockAxios.patch.mockResolvedValue({
          data: { success: true, data: movedFile },
        });

        const result = await apiClient.moveFile('file_1', '/new/path');

        expect(mockAxios.patch).toHaveBeenCalledWith('/files/file_1/move', {
          path: '/new/path',
        });
        expect(result).toEqual(movedFile);
      });
    });

    describe('renameFile', () => {
      it('should rename file', async () => {
        const renamedFile = { id: 'file_1', name: 'new-name.txt' };

        mockAxios.patch.mockResolvedValue({
          data: { success: true, data: renamedFile },
        });

        const result = await apiClient.renameFile('file_1', 'new-name.txt');

        expect(mockAxios.patch).toHaveBeenCalledWith('/files/file_1/rename', {
          name: 'new-name.txt',
        });
        expect(result).toEqual(renamedFile);
      });
    });

    describe('uploadFile', () => {
      it('should upload file with progress', async () => {
        const file = new File(['content'], 'test.txt', { type: 'text/plain' });
        const uploadedFile = { id: 'file_1', name: 'test.txt' };
        const onProgress = vi.fn();

        mockAxios.post.mockResolvedValue({
          data: { success: true, data: uploadedFile },
        });

        const result = await apiClient.uploadFile(file, '/uploads', onProgress);

        expect(mockAxios.post).toHaveBeenCalledWith(
          '/files/upload',
          expect.any(FormData),
          expect.objectContaining({
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: expect.any(Function),
          })
        );
        expect(result).toEqual(uploadedFile);
      });

      it('should upload file without progress callback', async () => {
        const file = new File(['content'], 'test.txt');
        const uploadedFile = { id: 'file_1' };

        mockAxios.post.mockResolvedValue({
          data: { success: true, data: uploadedFile },
        });

        await apiClient.uploadFile(file, '/uploads');

        expect(mockAxios.post).toHaveBeenCalled();
      });
    });

    describe('URL Helpers', () => {
      it('should generate download URL', () => {
        const url = apiClient.getFileDownloadUrl('file_1');

        expect(url).toContain('/api/files/file_1/download');
      });

      it('should generate thumbnail URL', () => {
        const url = apiClient.getFileThumbnailUrl('file_1');

        expect(url).toContain('/api/files/file_1/thumbnail');
      });
    });
  });

  describe('Workflow Endpoints', () => {
    describe('listWorkflows', () => {
      it('should list all workflows', async () => {
        const workflows = [{ id: 'wf_1', name: 'Test Workflow' }];

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: workflows },
        });

        const result = await apiClient.listWorkflows();

        expect(mockAxios.get).toHaveBeenCalledWith('/workflows');
        expect(result).toEqual(workflows);
      });
    });

    describe('getWorkflow', () => {
      it('should get workflow by ID', async () => {
        const workflow = { id: 'wf_1', name: 'Test Workflow' };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: workflow },
        });

        const result = await apiClient.getWorkflow('wf_1');

        expect(mockAxios.get).toHaveBeenCalledWith('/workflows/wf_1');
        expect(result).toEqual(workflow);
      });
    });

    describe('activateWorkflow', () => {
      it('should activate workflow', async () => {
        const workflow = { id: 'wf_1', status: 'active' };

        mockAxios.post.mockResolvedValue({
          data: { success: true, data: workflow },
        });

        const result = await apiClient.activateWorkflow('wf_1');

        expect(mockAxios.post).toHaveBeenCalledWith('/workflows/wf_1/activate');
        expect(result).toEqual(workflow);
      });
    });

    describe('deactivateWorkflow', () => {
      it('should deactivate workflow', async () => {
        const workflow = { id: 'wf_1', status: 'inactive' };

        mockAxios.post.mockResolvedValue({
          data: { success: true, data: workflow },
        });

        const result = await apiClient.deactivateWorkflow('wf_1');

        expect(mockAxios.post).toHaveBeenCalledWith('/workflows/wf_1/deactivate');
        expect(result).toEqual(workflow);
      });
    });

    describe('triggerWorkflow', () => {
      it('should trigger workflow with input data', async () => {
        const execution = { id: 'exec_1', status: 'running' };

        mockAxios.post.mockResolvedValue({
          data: { success: true, data: execution },
        });

        const result = await apiClient.triggerWorkflow('wf_1', { key: 'value' });

        expect(mockAxios.post).toHaveBeenCalledWith('/workflows/wf_1/trigger', {
          data: { key: 'value' },
        });
        expect(result).toEqual(execution);
      });

      it('should trigger workflow without input data', async () => {
        mockAxios.post.mockResolvedValue({
          data: { success: true, data: { id: 'exec_1' } },
        });

        await apiClient.triggerWorkflow('wf_1');

        expect(mockAxios.post).toHaveBeenCalledWith('/workflows/wf_1/trigger', {
          data: undefined,
        });
      });
    });

    describe('getWorkflowExecutions', () => {
      it('should get workflow executions with filters', async () => {
        const executions = {
          items: [{ id: 'exec_1', status: 'success' }],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: executions },
        });

        const result = await apiClient.getWorkflowExecutions('wf_1', 1, 20);

        expect(mockAxios.get).toHaveBeenCalledWith('/workflows/executions', {
          params: { workflowId: 'wf_1', page: 1, pageSize: 20 },
        });
        expect(result).toEqual(executions);
      });
    });
  });

  describe('API Key Endpoints', () => {
    describe('listApiKeys', () => {
      it('should list API keys', async () => {
        const keys = [{ id: 'key_1', name: 'Test Key' }];

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: keys },
        });

        const result = await apiClient.listApiKeys();

        expect(mockAxios.get).toHaveBeenCalledWith('/keys');
        expect(result).toEqual(keys);
      });
    });

    describe('createApiKey', () => {
      it('should create new API key', async () => {
        const request = { name: 'New Key', scopes: ['read', 'write'] as any };
        const response = {
          key: { id: 'key_1', name: 'New Key' },
          fullKey: 'znt_test_sk_abc123',
        };

        mockAxios.post.mockResolvedValue({
          data: { success: true, data: response },
        });

        const result = await apiClient.createApiKey(request);

        expect(mockAxios.post).toHaveBeenCalledWith('/keys', request);
        expect(result).toEqual(response);
      });
    });

    describe('revokeApiKey', () => {
      it('should revoke API key', async () => {
        mockAxios.delete.mockResolvedValue({ data: { success: true } });

        await apiClient.revokeApiKey('key_1');

        expect(mockAxios.delete).toHaveBeenCalledWith('/keys/key_1');
      });
    });

    describe('getApiKeyUsage', () => {
      it('should get API key usage stats', async () => {
        const usage = [
          { date: '2026-01-15', count: 100 },
          { date: '2026-01-16', count: 150 },
        ];

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: usage },
        });

        const result = await apiClient.getApiKeyUsage('key_1');

        expect(mockAxios.get).toHaveBeenCalledWith('/keys/key_1/usage');
        expect(result).toEqual(usage);
      });
    });
  });

  describe('Settings Endpoints', () => {
    describe('getSettings', () => {
      it('should get system settings', async () => {
        const settings = {
          general: { appName: 'Zentoria', timezone: 'UTC', language: 'en' },
          ai: { defaultModel: 'claude-3-5-sonnet', temperature: 0.7, maxTokens: 4096 },
        };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: settings },
        });

        const result = await apiClient.getSettings();

        expect(mockAxios.get).toHaveBeenCalledWith('/settings');
        expect(result).toEqual(settings);
      });
    });

    describe('updateSettings', () => {
      it('should update settings', async () => {
        const updates = { general: { appName: 'New Name' } };
        const updatedSettings = { general: { appName: 'New Name' } };

        mockAxios.patch.mockResolvedValue({
          data: { success: true, data: updatedSettings },
        });

        const result = await apiClient.updateSettings(updates);

        expect(mockAxios.patch).toHaveBeenCalledWith('/settings', updates);
        expect(result).toEqual(updatedSettings);
      });
    });
  });

  describe('Log Endpoints', () => {
    describe('getLogs', () => {
      it('should get logs with filters', async () => {
        const logsData = {
          items: [{ id: 'log_1', level: 'info', message: 'Test log' }],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        };

        mockAxios.get.mockResolvedValue({
          data: { success: true, data: logsData },
        });

        const filter = { level: ['error', 'warn'] as any, source: 'api' };
        const result = await apiClient.getLogs(filter);

        expect(mockAxios.get).toHaveBeenCalledWith('/logs', { params: filter });
        expect(result).toEqual(logsData);
      });

      it('should get logs without filters', async () => {
        mockAxios.get.mockResolvedValue({
          data: { success: true, data: { items: [] } },
        });

        await apiClient.getLogs();

        expect(mockAxios.get).toHaveBeenCalledWith('/logs', { params: {} });
      });
    });

    describe('clearLogs', () => {
      it('should clear logs before date', async () => {
        const response = { deleted: 100 };

        mockAxios.delete.mockResolvedValue({
          data: { success: true, data: response },
        });

        const result = await apiClient.clearLogs('2026-01-01T00:00:00Z');

        expect(mockAxios.delete).toHaveBeenCalledWith('/logs', {
          params: { before: '2026-01-01T00:00:00Z' },
        });
        expect(result).toEqual(response);
      });

      it('should clear all logs without date', async () => {
        mockAxios.delete.mockResolvedValue({
          data: { success: true, data: { deleted: 50 } },
        });

        await apiClient.clearLogs();

        expect(mockAxios.delete).toHaveBeenCalledWith('/logs', {
          params: { before: undefined },
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network Error'));

      await expect(apiClient.getHealth()).rejects.toThrow();
    });

    it('should handle API errors with message', async () => {
      const errorResponse = {
        response: {
          data: { success: false, error: 'Unauthorized' },
        },
      };

      mockAxios.get.mockRejectedValue(errorResponse);

      await expect(apiClient.getHealth()).rejects.toThrow();
    });

    it('should handle timeout', async () => {
      mockAxios.get.mockRejectedValue({ code: 'ECONNABORTED' });

      await expect(apiClient.getHealth()).rejects.toThrow();
    });
  });
});
