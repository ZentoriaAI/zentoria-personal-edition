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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.220.242/api';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

class ApiClient {
  private client: AxiosInstance;
  private apiKey: string = API_KEY;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - always add API key
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
      (error: AxiosError<{ error?: { message?: string } }>) => {
        const message = error.response?.data?.error?.message || error.message || 'Network error';
        console.error(`API Error: ${message}`);
        return Promise.reject(new Error(message));
      }
    );
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  clearApiKey() {
    this.apiKey = '';
  }

  // ============================
  // Health Endpoints
  // ============================

  async getHealth(): Promise<SystemHealth> {
    const { data } = await this.client.get('/v1/health');
    // Transform backend response to expected format
    return {
      status: data.status,
      timestamp: data.timestamp,
      version: data.version,
      uptime: data.uptime,
      services: Object.entries(data.dependencies || {}).map(([name, dep]: [string, any]) => ({
        name,
        status: dep.status,
        latency: dep.latencyMs,
        lastCheck: data.timestamp || new Date().toISOString(),
        details: dep.message ? { message: dep.message } : undefined,
      })),
    };
  }

  async getMetrics(): Promise<SystemMetrics> {
    // Backend doesn't have a metrics endpoint yet, return mock data
    return {
      cpu: { usage: Math.random() * 30 + 10, cores: 4 },
      memory: {
        used: 4 * 1024 * 1024 * 1024,
        total: 16 * 1024 * 1024 * 1024,
        percentage: 25,
      },
      disk: {
        used: 100 * 1024 * 1024 * 1024,
        total: 500 * 1024 * 1024 * 1024,
        percentage: 20,
      },
      network: {
        bytesIn: 0,
        bytesOut: 0,
      },
    };
  }

  // ============================
  // Chat Endpoints (using MCP command)
  // ============================

  // Store conversations in localStorage for now (backend doesn't have conversation management)
  private getStoredConversations(): Conversation[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem('zentoria_conversations');
    return stored ? JSON.parse(stored) : [];
  }

  private saveConversations(conversations: Conversation[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('zentoria_conversations', JSON.stringify(conversations));
  }

  async getConversations(page = 1, pageSize = 20): Promise<PaginatedResponse<Conversation>> {
    const conversations = this.getStoredConversations();
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
    const conversations = this.getStoredConversations();
    const conv = conversations.find(c => c.id === id);
    if (!conv) throw new Error('Conversation not found');
    return conv;
  }

  async createConversation(title?: string, model?: string): Promise<Conversation> {
    const conversations = this.getStoredConversations();
    const newConv: Conversation = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title || 'New Conversation',
      model: model || 'default',
      messageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    conversations.unshift(newConv);
    this.saveConversations(conversations);
    return newConv;
  }

  async deleteConversation(id: string): Promise<void> {
    const conversations = this.getStoredConversations().filter(c => c.id !== id);
    this.saveConversations(conversations);
    // Also delete messages
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`zentoria_messages_${id}`);
    }
  }

  private getStoredMessages(conversationId: string): ChatMessage[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(`zentoria_messages_${conversationId}`);
    return stored ? JSON.parse(stored) : [];
  }

  private saveMessages(conversationId: string, messages: ChatMessage[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`zentoria_messages_${conversationId}`, JSON.stringify(messages));
  }

  async getMessages(
    conversationId: string,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<ChatMessage>> {
    const messages = this.getStoredMessages(conversationId);
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
    // Add user message to local storage
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      conversationId: request.conversationId || '',
      role: 'user',
      content: request.message,
      createdAt: new Date().toISOString(),
    };

    if (request.conversationId) {
      const messages = this.getStoredMessages(request.conversationId);
      messages.push(userMessage);
      this.saveMessages(request.conversationId, messages);
    }

    // Send to AI via MCP command endpoint
    const { data } = await this.client.post('/v1/mcp/command', {
      command: request.message,
      sessionId: request.conversationId,
    });

    // Create assistant message
    const assistantMessage: ChatMessage = {
      id: `msg_${Date.now()}_assistant`,
      conversationId: request.conversationId || '',
      role: 'assistant',
      content: data.content || data.response || 'No response',
      createdAt: new Date().toISOString(),
    };

    if (request.conversationId) {
      const messages = this.getStoredMessages(request.conversationId);
      messages.push(assistantMessage);
      this.saveMessages(request.conversationId, messages);

      // Update conversation
      const conversations = this.getStoredConversations();
      const conv = conversations.find(c => c.id === request.conversationId);
      if (conv) {
        conv.messageCount = messages.length;
        conv.lastMessage = request.message.substring(0, 100);
        conv.updatedAt = new Date().toISOString();
        this.saveConversations(conversations);
      }
    }

    return assistantMessage;
  }

  // Streaming chat
  streamMessage(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): () => void {
    const controller = new AbortController();

    // Add user message first
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      conversationId: request.conversationId || '',
      role: 'user',
      content: request.message,
      createdAt: new Date().toISOString(),
    };

    if (request.conversationId) {
      const messages = this.getStoredMessages(request.conversationId);
      messages.push(userMessage);
      this.saveMessages(request.conversationId, messages);
    }

    // Use non-streaming endpoint and simulate streaming
    fetch(`${API_URL}/v1/mcp/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        command: request.message,
        sessionId: request.conversationId,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const content = data.content || data.response || 'No response';

        // Simulate streaming by sending chunks
        const words = content.split(' ');
        let index = 0;

        const interval = setInterval(() => {
          if (index < words.length) {
            onChunk(words[index] + (index < words.length - 1 ? ' ' : ''));
            index++;
          } else {
            clearInterval(interval);

            // Save assistant message
            if (request.conversationId) {
              const assistantMessage: ChatMessage = {
                id: `msg_${Date.now()}_assistant`,
                conversationId: request.conversationId,
                role: 'assistant',
                content,
                createdAt: new Date().toISOString(),
              };
              const messages = this.getStoredMessages(request.conversationId);
              messages.push(assistantMessage);
              this.saveMessages(request.conversationId, messages);

              // Update conversation
              const conversations = this.getStoredConversations();
              const conv = conversations.find(c => c.id === request.conversationId);
              if (conv) {
                conv.messageCount = messages.length;
                conv.lastMessage = request.message.substring(0, 100);
                conv.updatedAt = new Date().toISOString();
                this.saveConversations(conversations);
              }
            }

            onComplete();
          }
        }, 30); // 30ms per word for smooth streaming effect
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          onError(error);
        }
      });

    return () => controller.abort();
  }

  // ============================
  // File Endpoints (using /v1/mcp/files)
  // ============================

  async listFiles(path = '/', page = 1, pageSize = 50): Promise<PaginatedResponse<FileItem>> {
    const { data } = await this.client.get('/v1/mcp/files', {
      params: { page, limit: pageSize },
    });

    // Transform backend response to expected format
    const files = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.filename,
      size: f.size,
      type: this.getFileTypeFromMime(f.mimeType),
      mimeType: f.mimeType,
      path: path,
      isDirectory: false,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt || f.createdAt,
    }));

    return {
      items: files,
      total: data.pagination?.total || files.length,
      page: data.pagination?.page || page,
      pageSize: data.pagination?.limit || pageSize,
      totalPages: data.pagination?.totalPages || 1,
    };
  }

  private getFileTypeFromMime(mime: string): 'image' | 'video' | 'audio' | 'document' | 'code' | 'archive' | 'other' {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.includes('pdf') || mime.includes('document') || mime.includes('text/')) return 'document';
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('compressed')) return 'archive';
    if (mime.includes('javascript') || mime.includes('json') || mime.includes('xml')) return 'code';
    return 'other';
  }

  async getFile(id: string): Promise<FileItem> {
    const { data } = await this.client.get(`/v1/mcp/files/${id}`);
    return {
      id: data.id,
      name: data.filename,
      size: data.size,
      type: this.getFileTypeFromMime(data.mimeType),
      mimeType: data.mimeType,
      path: '/',
      isDirectory: false,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt || data.createdAt,
    };
  }

  async createFolder(path: string, name: string): Promise<FileItem> {
    // Backend doesn't support folders, return mock
    return {
      id: `folder_${Date.now()}`,
      name,
      size: 0,
      type: 'other',
      mimeType: 'inode/directory',
      path,
      isDirectory: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async deleteFile(id: string): Promise<void> {
    await this.client.delete(`/v1/mcp/files/${id}`);
  }

  async moveFile(id: string, newPath: string): Promise<FileItem> {
    // Backend doesn't support move, return current file
    return this.getFile(id);
  }

  async renameFile(id: string, newName: string): Promise<FileItem> {
    // Backend doesn't support rename, return current file
    return this.getFile(id);
  }

  async uploadFile(
    file: File,
    path: string,
    onProgress?: (progress: number) => void
  ): Promise<FileItem> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'ai-input');

    const config: AxiosRequestConfig = {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    };

    const { data } = await this.client.post('/v1/mcp/upload', formData, config);

    return {
      id: data.id,
      name: data.filename,
      size: data.size,
      type: this.getFileTypeFromMime(data.mimeType),
      mimeType: data.mimeType,
      path,
      isDirectory: false,
      createdAt: data.createdAt,
      updatedAt: data.createdAt,
    };
  }

  getFileDownloadUrl(id: string): string {
    return `${API_URL}/v1/mcp/files/${id}/download`;
  }

  getFileThumbnailUrl(id: string): string {
    return `${API_URL}/v1/mcp/files/${id}/download`;
  }

  // ============================
  // Workflow Endpoints
  // ============================

  async listWorkflows(): Promise<Workflow[]> {
    // Backend doesn't have list workflows, return empty
    // In the future, integrate with n8n API
    return [];
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const { data } = await this.client.get(`/v1/mcp/workflow/${id}`);
    return {
      id: data.workflowId || id,
      name: data.name || 'Workflow',
      description: '',
      status: data.status === 'success' ? 'active' : data.status === 'error' ? 'error' : 'inactive',
      runCount: 0,
      errorCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async activateWorkflow(id: string): Promise<Workflow> {
    return this.getWorkflow(id);
  }

  async deactivateWorkflow(id: string): Promise<Workflow> {
    return this.getWorkflow(id);
  }

  async triggerWorkflow(id: string, inputData?: Record<string, unknown>): Promise<WorkflowExecution> {
    const { data } = await this.client.post('/v1/mcp/workflow', {
      workflowId: id,
      payload: inputData,
      async: true,
    });

    return {
      id: data.executionId,
      workflowId: id,
      workflowName: 'Workflow',
      status: data.status === 'success' ? 'success' : data.status === 'error' ? 'failed' : 'running',
      startedAt: new Date().toISOString(),
    };
  }

  async getWorkflowExecutions(
    workflowId?: string,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedResponse<WorkflowExecution>> {
    // Backend doesn't have executions list
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
    };
  }

  // ============================
  // API Key Endpoints (using /v1/mcp/keys)
  // ============================

  async listApiKeys(): Promise<ApiKey[]> {
    const { data } = await this.client.get('/v1/mcp/keys');
    return (data.keys || []).map((k: any) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.prefix,
      scopes: k.scopes,
      usageCount: 0,
      lastUsed: k.lastUsedAt,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
    }));
  }

  async createApiKey(request: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    const { data } = await this.client.post('/v1/mcp/create-key', {
      name: request.name,
      scopes: this.mapScopesToBackend(request.scopes),
      expiresIn: request.expiresIn ? `${request.expiresIn}d` : undefined,
    });

    return {
      key: {
        id: data.id,
        name: data.name,
        keyPrefix: data.key.substring(0, 20) + '...',
        scopes: request.scopes,
        usageCount: 0,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
      },
      fullKey: data.key,
    };
  }

  private mapScopesToBackend(scopes: string[]): string[] {
    const scopeMap: Record<string, string[]> = {
      'full': ['admin'],
      'read': ['files.read', 'workflows.read'],
      'write': ['files.write', 'files.delete'],
      'chat': ['ai.chat', 'ai.complete'],
      'files': ['files.read', 'files.write', 'files.delete'],
      'workflows': ['workflows.trigger', 'workflows.read'],
    };

    const backendScopes = new Set<string>();
    for (const scope of scopes) {
      const mapped = scopeMap[scope];
      if (mapped) {
        mapped.forEach(s => backendScopes.add(s));
      } else {
        backendScopes.add(scope);
      }
    }
    return Array.from(backendScopes);
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.client.delete(`/v1/mcp/keys/${id}`);
  }

  async getApiKeyUsage(id: string): Promise<{ date: string; count: number }[]> {
    // Backend doesn't track usage
    return [];
  }

  // ============================
  // Settings Endpoints (localStorage-based for now)
  // ============================

  async getSettings(): Promise<SystemSettings> {
    if (typeof window === 'undefined') {
      return this.getDefaultSettings();
    }
    const stored = localStorage.getItem('zentoria_settings');
    return stored ? JSON.parse(stored) : this.getDefaultSettings();
  }

  private getDefaultSettings(): SystemSettings {
    return {
      general: {
        appName: 'Zentoria Personal',
        timezone: 'Europe/Amsterdam',
        language: 'nl',
      },
      ai: {
        defaultModel: 'local',
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: 'You are a helpful assistant.',
      },
      storage: {
        maxFileSize: 104857600,
        allowedTypes: ['jpg', 'png', 'pdf', 'doc', 'xlsx', 'txt'],
        retentionDays: 365,
      },
      notifications: {
        enabled: false,
        email: '',
        webhookUrl: '',
      },
    };
  }

  async updateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    const current = await this.getSettings();
    const updated = {
      general: { ...current.general, ...settings.general },
      ai: { ...current.ai, ...settings.ai },
      storage: { ...current.storage, ...settings.storage },
      notifications: { ...current.notifications, ...settings.notifications },
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('zentoria_settings', JSON.stringify(updated));
    }
    return updated;
  }

  // ============================
  // Logs Endpoints (localStorage-based for now)
  // ============================

  async getLogs(filter: LogFilter = {}): Promise<PaginatedResponse<LogEntry>> {
    if (typeof window === 'undefined') {
      return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };
    }

    const stored = localStorage.getItem('zentoria_logs');
    let logs: LogEntry[] = stored ? JSON.parse(stored) : [];

    // Apply filters
    if (filter.level) {
      const levels = Array.isArray(filter.level) ? filter.level : [filter.level];
      logs = logs.filter(l => levels.includes(l.level));
    }
    if (filter.search) {
      const search = filter.search.toLowerCase();
      logs = logs.filter(l =>
        l.message.toLowerCase().includes(search) ||
        l.source.toLowerCase().includes(search)
      );
    }

    const page = filter.page || 1;
    const pageSize = filter.pageSize || 50;
    const start = (page - 1) * pageSize;
    const items = logs.slice(start, start + pageSize);

    return {
      items,
      total: logs.length,
      page,
      pageSize,
      totalPages: Math.ceil(logs.length / pageSize),
    };
  }

  async clearLogs(before?: string): Promise<{ deleted: number }> {
    if (typeof window === 'undefined') {
      return { deleted: 0 };
    }
    const stored = localStorage.getItem('zentoria_logs');
    const logs: LogEntry[] = stored ? JSON.parse(stored) : [];
    const count = logs.length;
    localStorage.removeItem('zentoria_logs');
    return { deleted: count };
  }

  // Utility to add a log entry
  addLog(level: 'debug' | 'info' | 'warn' | 'error', message: string, source: string, metadata?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem('zentoria_logs');
    const logs: LogEntry[] = stored ? JSON.parse(stored) : [];

    logs.unshift({
      id: `log_${Date.now()}`,
      level,
      message,
      source,
      timestamp: new Date().toISOString(),
      metadata,
    });

    // Keep only last 1000 logs
    if (logs.length > 1000) {
      logs.splice(1000);
    }

    localStorage.setItem('zentoria_logs', JSON.stringify(logs));
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export { ApiClient };
