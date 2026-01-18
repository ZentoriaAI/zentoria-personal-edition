/**
 * Enhanced Chat API Client
 *
 * API client for the Enhanced Chat Interface endpoints.
 * Handles sessions, messages, folders, settings, and agents.
 */

import type {
  ApiResponse,
  PaginatedResponse,
  ChatSession,
  EnhancedChatMessage,
  ProjectFolder,
  FolderTree,
  Agent,
  UserSettings,
  AvailableModel,
  CustomPrompt,
  CreateSessionRequest,
  SendMessageRequest,
  StreamChunk,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://10.10.40.101:4000';
const DEFAULT_API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

class ChatApiClient {
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = DEFAULT_API_KEY || null;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
    };
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}/api/v1${path}`, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============================
  // Session Endpoints
  // ============================

  async getSessions(options: {
    page?: number;
    pageSize?: number;
    folderId?: string;
    isArchived?: boolean;
    search?: string;
    sortBy?: 'lastMessageAt' | 'createdAt' | 'title';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<PaginatedResponse<ChatSession>> {
    const params = new URLSearchParams();
    if (options.page) params.set('page', String(options.page));
    if (options.pageSize) params.set('pageSize', String(options.pageSize));
    if (options.folderId) params.set('folderId', options.folderId);
    if (options.isArchived !== undefined) params.set('isArchived', String(options.isArchived));
    if (options.search) params.set('search', options.search);
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.sortOrder) params.set('sortOrder', options.sortOrder);

    return this.fetch<PaginatedResponse<ChatSession>>(`/chat/sessions?${params}`);
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    return this.fetch<ChatSession>(`/chat/sessions/${sessionId}`);
  }

  async createSession(input: CreateSessionRequest = {}): Promise<ChatSession> {
    return this.fetch<ChatSession>('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateSession(
    sessionId: string,
    updates: Partial<{
      title: string;
      folderId: string | null;
      agentId: string | null;
      systemPrompt: string | null;
      model: string | null;
      temperature: number | null;
      isPinned: boolean;
      isArchived: boolean;
    }>
  ): Promise<ChatSession> {
    return this.fetch<ChatSession>(`/chat/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.fetch(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
  }

  async duplicateSession(sessionId: string, includeMessages = false): Promise<ChatSession> {
    return this.fetch<ChatSession>(`/chat/sessions/${sessionId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ includeMessages }),
    });
  }

  // ============================
  // Message Endpoints
  // ============================

  async getMessages(
    sessionId: string,
    options: {
      limit?: number;
      cursor?: string;
      direction?: 'before' | 'after';
    } = {}
  ): Promise<{ messages: EnhancedChatMessage[]; nextCursor?: string; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.direction) params.set('direction', options.direction);

    return this.fetch(`/chat/sessions/${sessionId}/messages?${params}`);
  }

  async sendMessage(
    sessionId: string,
    input: SendMessageRequest
  ): Promise<{ userMessage: EnhancedChatMessage; assistantMessage: EnhancedChatMessage }> {
    return this.fetch(`/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ ...input, stream: false }),
    });
  }

  // Streaming message with SSE
  streamMessage(
    sessionId: string,
    input: SendMessageRequest,
    onChunk: (chunk: StreamChunk) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): () => void {
    const controller = new AbortController();

    fetch(`${API_URL}/api/v1/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ...input, stream: true }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}`);
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
              try {
                const chunk = JSON.parse(line.slice(6)) as StreamChunk;
                onChunk(chunk);
              } catch {
                // Ignore malformed chunks
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

    return () => controller.abort();
  }

  async editMessage(
    sessionId: string,
    messageId: string,
    content: string
  ): Promise<EnhancedChatMessage> {
    return this.fetch(`/chat/sessions/${sessionId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    await this.fetch(`/chat/sessions/${sessionId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  // ============================
  // Agent Endpoints
  // ============================

  async getAgents(): Promise<{ agents: Agent[] }> {
    return this.fetch<{ agents: Agent[] }>('/chat/agents');
  }

  async getAgent(agentId: string): Promise<Agent> {
    return this.fetch<Agent>(`/chat/agents/${agentId}`);
  }

  // ============================
  // Folder Endpoints
  // ============================

  async getFolderTree(includeArchived = false): Promise<FolderTree> {
    const params = new URLSearchParams();
    if (includeArchived) params.set('includeArchived', 'true');
    return this.fetch<FolderTree>(`/folders?${params}`);
  }

  async getFolder(folderId: string): Promise<ProjectFolder> {
    return this.fetch<ProjectFolder>(`/folders/${folderId}`);
  }

  async createFolder(input: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    parentId?: string;
  }): Promise<ProjectFolder> {
    return this.fetch<ProjectFolder>('/folders', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateFolder(
    folderId: string,
    updates: Partial<{
      name: string;
      description: string | null;
      color: string;
      icon: string;
      parentId: string | null;
      isArchived: boolean;
    }>
  ): Promise<ProjectFolder> {
    return this.fetch<ProjectFolder>(`/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteFolder(folderId: string, moveSessionsToFolder?: string | null): Promise<void> {
    const params = new URLSearchParams();
    if (moveSessionsToFolder !== undefined) {
      params.set('moveSessionsToFolder', moveSessionsToFolder || '');
    }
    await this.fetch(`/folders/${folderId}?${params}`, { method: 'DELETE' });
  }

  async reorderFolders(parentId: string | null, folderIds: string[]): Promise<void> {
    await this.fetch('/folders/reorder', {
      method: 'POST',
      body: JSON.stringify({ parentId, folderIds }),
    });
  }

  async moveSessionsToFolder(folderId: string, sessionIds: string[]): Promise<void> {
    await this.fetch(`/folders/${folderId}/move-sessions`, {
      method: 'POST',
      body: JSON.stringify({ sessionIds }),
    });
  }

  // ============================
  // Settings Endpoints
  // ============================

  async getSettings(): Promise<UserSettings> {
    return this.fetch<UserSettings>('/settings');
  }

  async updateSettings(updates: Partial<Omit<UserSettings, 'id' | 'customPrompts'>>): Promise<UserSettings> {
    return this.fetch<UserSettings>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async resetSettings(): Promise<UserSettings> {
    return this.fetch<UserSettings>('/settings/reset', { method: 'POST' });
  }

  async getAvailableModels(): Promise<{ models: AvailableModel[] }> {
    return this.fetch<{ models: AvailableModel[] }>('/settings/models');
  }

  async addCustomPrompt(prompt: { name: string; content: string; category?: string }): Promise<UserSettings> {
    return this.fetch<UserSettings>('/settings/prompts', {
      method: 'POST',
      body: JSON.stringify(prompt),
    });
  }

  async removeCustomPrompt(promptId: string): Promise<UserSettings> {
    return this.fetch<UserSettings>(`/settings/prompts/${promptId}`, { method: 'DELETE' });
  }

  async exportSettings(): Promise<Blob> {
    const response = await fetch(`${API_URL}/api/v1/settings/export`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to export settings');
    }
    return response.blob();
  }

  async importSettings(backup: Record<string, unknown>): Promise<UserSettings> {
    return this.fetch<UserSettings>('/settings/import', {
      method: 'POST',
      body: JSON.stringify(backup),
    });
  }
}

// Export singleton instance
export const chatApi = new ChatApiClient();

// Export class for testing
export { ChatApiClient };
