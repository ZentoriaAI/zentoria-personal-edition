import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import type {
  ApiResponse,
  PaginatedResponse,
  SystemHealth,
  SystemMetrics,
  Conversation,
  ChatMessage,
  ChatRequest,
  FileItem,
  FileUploadProgress,
  Workflow,
  WorkflowExecution,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  SystemSettings,
  LogEntry,
  LogFilter,
} from '@/types';

// ============================
// API Client Configuration
// ============================

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://10.10.40.101:4000';

class ApiClient {
  private client: AxiosInstance;
  private apiKey: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_URL}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (this.apiKey) {
          config.headers.Authorization = `Bearer ${this.apiKey}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiResponse>) => {
        const message = error.response?.data?.error || error.message || 'Network error';
        console.error(`API Error: ${message}`);
        return Promise.reject(new Error(message));
      }
    );
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  clearApiKey() {
    this.apiKey = null;
  }

  // ============================
  // Health Endpoints
  // ============================

  async getHealth(): Promise<SystemHealth> {
    const { data } = await this.client.get<ApiResponse<SystemHealth>>('/health');
    return data.data!;
  }

  async getMetrics(): Promise<SystemMetrics> {
    const { data } = await this.client.get<ApiResponse<SystemMetrics>>('/health/metrics');
    return data.data!;
  }

  // ============================
  // Chat Endpoints
  // ============================

  async getConversations(page = 1, pageSize = 20): Promise<PaginatedResponse<Conversation>> {
    const { data } = await this.client.get<ApiResponse<PaginatedResponse<Conversation>>>(
      '/chat/conversations',
      { params: { page, pageSize } }
    );
    return data.data!;
  }

  async getConversation(id: string): Promise<Conversation> {
    const { data } = await this.client.get<ApiResponse<Conversation>>(
      `/chat/conversations/${id}`
    );
    return data.data!;
  }

  async createConversation(title?: string, model?: string): Promise<Conversation> {
    const { data } = await this.client.post<ApiResponse<Conversation>>(
      '/chat/conversations',
      { title, model }
    );
    return data.data!;
  }

  async deleteConversation(id: string): Promise<void> {
    await this.client.delete(`/chat/conversations/${id}`);
  }

  async getMessages(
    conversationId: string,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<ChatMessage>> {
    const { data } = await this.client.get<ApiResponse<PaginatedResponse<ChatMessage>>>(
      `/chat/conversations/${conversationId}/messages`,
      { params: { page, pageSize } }
    );
    return data.data!;
  }

  async sendMessage(request: ChatRequest): Promise<ChatMessage> {
    const { data } = await this.client.post<ApiResponse<ChatMessage>>(
      '/chat/messages',
      request
    );
    return data.data!;
  }

  // Streaming chat - returns EventSource-like interface
  streamMessage(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): () => void {
    const controller = new AbortController();

    fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                onComplete();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  onChunk(parsed.content);
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }

        onComplete();
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          onError(error);
        }
      });

    // Return abort function
    return () => controller.abort();
  }

  // ============================
  // File Endpoints
  // ============================

  async listFiles(path = '/', page = 1, pageSize = 50): Promise<PaginatedResponse<FileItem>> {
    const { data } = await this.client.get<ApiResponse<PaginatedResponse<FileItem>>>(
      '/files',
      { params: { path, page, pageSize } }
    );
    return data.data!;
  }

  async getFile(id: string): Promise<FileItem> {
    const { data } = await this.client.get<ApiResponse<FileItem>>(`/files/${id}`);
    return data.data!;
  }

  async createFolder(path: string, name: string): Promise<FileItem> {
    const { data } = await this.client.post<ApiResponse<FileItem>>('/files/folder', {
      path,
      name,
    });
    return data.data!;
  }

  async deleteFile(id: string): Promise<void> {
    await this.client.delete(`/files/${id}`);
  }

  async moveFile(id: string, newPath: string): Promise<FileItem> {
    const { data } = await this.client.patch<ApiResponse<FileItem>>(`/files/${id}/move`, {
      path: newPath,
    });
    return data.data!;
  }

  async renameFile(id: string, newName: string): Promise<FileItem> {
    const { data } = await this.client.patch<ApiResponse<FileItem>>(`/files/${id}/rename`, {
      name: newName,
    });
    return data.data!;
  }

  // Upload with progress
  async uploadFile(
    file: File,
    path: string,
    onProgress?: (progress: number) => void
  ): Promise<FileItem> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    const config: AxiosRequestConfig = {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    };

    const { data } = await this.client.post<ApiResponse<FileItem>>(
      '/files/upload',
      formData,
      config
    );
    return data.data!;
  }

  getFileDownloadUrl(id: string): string {
    return `${API_URL}/api/files/${id}/download`;
  }

  getFileThumbnailUrl(id: string): string {
    return `${API_URL}/api/files/${id}/thumbnail`;
  }

  // ============================
  // Workflow Endpoints
  // ============================

  async listWorkflows(): Promise<Workflow[]> {
    const { data } = await this.client.get<ApiResponse<Workflow[]>>('/workflows');
    return data.data!;
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const { data } = await this.client.get<ApiResponse<Workflow>>(`/workflows/${id}`);
    return data.data!;
  }

  async activateWorkflow(id: string): Promise<Workflow> {
    const { data } = await this.client.post<ApiResponse<Workflow>>(
      `/workflows/${id}/activate`
    );
    return data.data!;
  }

  async deactivateWorkflow(id: string): Promise<Workflow> {
    const { data } = await this.client.post<ApiResponse<Workflow>>(
      `/workflows/${id}/deactivate`
    );
    return data.data!;
  }

  async triggerWorkflow(id: string, inputData?: Record<string, unknown>): Promise<WorkflowExecution> {
    const { data } = await this.client.post<ApiResponse<WorkflowExecution>>(
      `/workflows/${id}/trigger`,
      { data: inputData }
    );
    return data.data!;
  }

  async getWorkflowExecutions(
    workflowId?: string,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedResponse<WorkflowExecution>> {
    const { data } = await this.client.get<ApiResponse<PaginatedResponse<WorkflowExecution>>>(
      '/workflows/executions',
      { params: { workflowId, page, pageSize } }
    );
    return data.data!;
  }

  // ============================
  // API Key Endpoints
  // ============================

  async listApiKeys(): Promise<ApiKey[]> {
    const { data } = await this.client.get<ApiResponse<ApiKey[]>>('/keys');
    return data.data!;
  }

  async createApiKey(request: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    const { data } = await this.client.post<ApiResponse<CreateApiKeyResponse>>(
      '/keys',
      request
    );
    return data.data!;
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.client.delete(`/keys/${id}`);
  }

  async getApiKeyUsage(id: string): Promise<{ date: string; count: number }[]> {
    const { data } = await this.client.get<ApiResponse<{ date: string; count: number }[]>>(
      `/keys/${id}/usage`
    );
    return data.data!;
  }

  // ============================
  // Settings Endpoints
  // ============================

  async getSettings(): Promise<SystemSettings> {
    const { data } = await this.client.get<ApiResponse<SystemSettings>>('/settings');
    return data.data!;
  }

  async updateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    const { data } = await this.client.patch<ApiResponse<SystemSettings>>(
      '/settings',
      settings
    );
    return data.data!;
  }

  // ============================
  // Logs Endpoints
  // ============================

  async getLogs(filter: LogFilter = {}): Promise<PaginatedResponse<LogEntry>> {
    const { data } = await this.client.get<ApiResponse<PaginatedResponse<LogEntry>>>(
      '/logs',
      { params: filter }
    );
    return data.data!;
  }

  async clearLogs(before?: string): Promise<{ deleted: number }> {
    const { data } = await this.client.delete<ApiResponse<{ deleted: number }>>('/logs', {
      params: { before },
    });
    return data.data!;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export { ApiClient };
