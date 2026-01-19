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
const DEFAULT_API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

class ApiClient {
  private client: AxiosInstance;
  private apiKey: string | null = null;

  constructor() {
    // Auto-initialize with API key from environment
    this.apiKey = DEFAULT_API_KEY || null;

    this.client = axios.create({
      baseURL: `${API_URL}/api/v1`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - use X-API-Key header for API key authentication
    this.client.interceptors.request.use(
      (config) => {
        if (this.apiKey) {
          config.headers['X-API-Key'] = this.apiKey;
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
  // Generic HTTP Methods
  // ============================

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }> {
    const response = await this.client.get<ApiResponse<T>>(url, config);
    return { data: response.data.data as T };
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<{ data: T }> {
    const response = await this.client.post<ApiResponse<T>>(url, data, config);
    return { data: response.data.data as T };
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<{ data: T }> {
    const response = await this.client.put<ApiResponse<T>>(url, data, config);
    return { data: response.data.data as T };
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }> {
    const response = await this.client.delete<ApiResponse<T>>(url, config);
    return { data: response.data.data as T };
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
  // Chat Endpoints (using MCP command endpoint)
  // ============================

  // Local storage for conversations (since backend doesn't have conversation management)
  private getLocalConversations(): Conversation[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem('zentoria_conversations');
    return stored ? JSON.parse(stored) : [];
  }

  private saveLocalConversations(conversations: Conversation[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('zentoria_conversations', JSON.stringify(conversations));
  }

  private getLocalMessages(conversationId: string): ChatMessage[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(`zentoria_messages_${conversationId}`);
    return stored ? JSON.parse(stored) : [];
  }

  private saveLocalMessages(conversationId: string, messages: ChatMessage[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`zentoria_messages_${conversationId}`, JSON.stringify(messages));
  }

  async getConversations(page = 1, pageSize = 20): Promise<PaginatedResponse<Conversation>> {
    const conversations = this.getLocalConversations();
    const start = (page - 1) * pageSize;
    const items = conversations.slice(start, start + pageSize);
    return {
      items,
      total: conversations.length,
      page,
      pageSize,
      totalPages: Math.ceil(conversations.length / pageSize),
    };
  }

  async getConversation(id: string): Promise<Conversation> {
    const conversations = this.getLocalConversations();
    const conv = conversations.find(c => c.id === id);
    if (!conv) throw new Error('Conversation not found');
    return conv;
  }

  async createConversation(title?: string, model?: string): Promise<Conversation> {
    const conversations = this.getLocalConversations();
    const newConv: Conversation = {
      id: `conv_${Date.now()}`,
      title: title || 'New Chat',
      model: model || 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
    conversations.unshift(newConv);
    this.saveLocalConversations(conversations);
    return newConv;
  }

  async deleteConversation(id: string): Promise<void> {
    const conversations = this.getLocalConversations();
    const filtered = conversations.filter(c => c.id !== id);
    this.saveLocalConversations(filtered);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`zentoria_messages_${id}`);
    }
  }

  async getMessages(
    conversationId: string,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<ChatMessage>> {
    const messages = this.getLocalMessages(conversationId);
    const start = (page - 1) * pageSize;
    const items = messages.slice(start, start + pageSize);
    return {
      items,
      total: messages.length,
      page,
      pageSize,
      totalPages: Math.ceil(messages.length / pageSize),
    };
  }

  async sendMessage(request: ChatRequest): Promise<ChatMessage> {
    // Send to MCP command endpoint
    // Convert conversationId to sessionId format (sess_xxx)
    const sessionId = request.conversationId ? `sess_${request.conversationId.replace('conv_', '')}` : undefined;
    const { data } = await this.client.post<ApiResponse<{ id: string; content: string; sessionId?: string }>>(
      '/mcp/command',
      { command: request.message, ...(sessionId ? { sessionId } : {}) }
    );

    // Create response message
    const responseMsg: ChatMessage = {
      id: data.data?.id || `msg_${Date.now()}`,
      conversationId: request.conversationId || '',
      role: 'assistant',
      content: data.data?.content || '',
      createdAt: new Date().toISOString(),
    };

    return responseMsg;
  }

  // Streaming chat - uses MCP command endpoint
  streamMessage(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): () => void {
    const controller = new AbortController();

    // First, save the user message locally
    if (request.conversationId) {
      const messages = this.getLocalMessages(request.conversationId);
      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_user`,
        conversationId: request.conversationId,
        role: 'user',
        content: request.message,
        createdAt: new Date().toISOString(),
      };
      messages.push(userMsg);
      this.saveLocalMessages(request.conversationId, messages);

      // Update conversation timestamp
      const conversations = this.getLocalConversations();
      const convIndex = conversations.findIndex(c => c.id === request.conversationId);
      if (convIndex >= 0) {
        conversations[convIndex].updatedAt = new Date().toISOString();
        conversations[convIndex].messageCount = messages.length;
        if (messages.length === 1) {
          conversations[convIndex].title = request.message.slice(0, 50) + (request.message.length > 50 ? '...' : '');
        }
        this.saveLocalConversations(conversations);
      }
    }

    // Send to MCP command endpoint (non-streaming since backend may not support streaming)
    // Convert conversationId to sessionId format (sess_xxx)
    const sessionId = request.conversationId ? `sess_${request.conversationId.replace('conv_', '')}` : undefined;

    fetch(`${API_URL}/api/v1/mcp/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
      },
      body: JSON.stringify({
        command: request.message,
        ...(sessionId ? { sessionId } : {})
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const content = data.content || data.data?.content || 'No response from AI';

        // Save assistant message locally
        if (request.conversationId) {
          const messages = this.getLocalMessages(request.conversationId);
          const assistantMsg: ChatMessage = {
            id: data.id || `msg_${Date.now()}_assistant`,
            conversationId: request.conversationId,
            role: 'assistant',
            content: content,
            createdAt: new Date().toISOString(),
          };
          messages.push(assistantMsg);
          this.saveLocalMessages(request.conversationId, messages);
        }

        // Simulate streaming by sending content in chunks
        const words = content.split(' ');
        let i = 0;
        const interval = setInterval(() => {
          if (i < words.length) {
            onChunk(words[i] + (i < words.length - 1 ? ' ' : ''));
            i++;
          } else {
            clearInterval(interval);
            onComplete();
          }
        }, 30);
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
  // File Endpoints (using /mcp prefix)
  // ============================

  async listFiles(path = '/', page = 1, pageSize = 50): Promise<PaginatedResponse<FileItem>> {
    const { data } = await this.client.get<ApiResponse<PaginatedResponse<FileItem>>>(
      '/mcp/files',
      { params: { path, page, pageSize } }
    );
    return data.data!;
  }

  async getFile(id: string): Promise<FileItem> {
    const { data } = await this.client.get<ApiResponse<FileItem>>(`/mcp/files/${id}`);
    return data.data!;
  }

  async createFolder(path: string, name: string): Promise<FileItem> {
    const { data } = await this.client.post<ApiResponse<FileItem>>('/mcp/files/folder', {
      path,
      name,
    });
    return data.data!;
  }

  async deleteFile(id: string): Promise<void> {
    await this.client.delete(`/mcp/files/${id}`);
  }

  async moveFile(id: string, newPath: string): Promise<FileItem> {
    const { data } = await this.client.patch<ApiResponse<FileItem>>(`/mcp/files/${id}/move`, {
      path: newPath,
    });
    return data.data!;
  }

  async renameFile(id: string, newName: string): Promise<FileItem> {
    const { data } = await this.client.patch<ApiResponse<FileItem>>(`/mcp/files/${id}/rename`, {
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
      '/mcp/upload',
      formData,
      config
    );
    return data.data!;
  }

  getFileDownloadUrl(id: string): string {
    return `${API_URL}/api/v1/mcp/files/${id}/download`;
  }

  getFileThumbnailUrl(id: string): string {
    return `${API_URL}/api/v1/mcp/files/${id}/thumbnail`;
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
