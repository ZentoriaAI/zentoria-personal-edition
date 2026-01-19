/**
 * Chat API Client Tests
 *
 * Tests for the Enhanced Chat API client - sessions, messages, folders, settings, agents.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatApiClient } from './chat-api';

// Mock types
interface MockSession {
  id: string;
  title: string;
  userId: string;
  folderId: string | null;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  isPinned: boolean;
  isArchived: boolean;
}

interface MockMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

interface MockAgent {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  model: string;
  isActive: boolean;
}

interface MockFolder {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  parentId: string | null;
  sortOrder: number;
}

interface MockSettings {
  id: string;
  userId: string;
  defaultModel: string;
  defaultTemperature: number;
  theme: string;
}

// Mock data factories
const createMockSession = (overrides: Partial<MockSession> = {}): MockSession => ({
  id: 'sess_test123',
  title: 'Test Session',
  userId: 'user_test123',
  folderId: null,
  agentId: null,
  createdAt: '2026-01-18T10:00:00Z',
  updatedAt: '2026-01-18T10:00:00Z',
  lastMessageAt: '2026-01-18T10:30:00Z',
  messageCount: 5,
  isPinned: false,
  isArchived: false,
  ...overrides,
});

const createMockMessage = (overrides: Partial<MockMessage> = {}): MockMessage => ({
  id: 'msg_test123',
  sessionId: 'sess_test123',
  role: 'user',
  content: 'Hello, world!',
  createdAt: '2026-01-18T10:00:00Z',
  ...overrides,
});

const createMockAgent = (overrides: Partial<MockAgent> = {}): MockAgent => ({
  id: 'agent_test123',
  name: 'chat-agent',
  displayName: 'Chat Agent',
  description: 'General chat assistant',
  model: 'llama3.2:3b',
  isActive: true,
  ...overrides,
});

const createMockFolder = (overrides: Partial<MockFolder> = {}): MockFolder => ({
  id: 'folder_test123',
  name: 'Test Folder',
  description: null,
  color: '#6366f1',
  icon: 'folder',
  parentId: null,
  sortOrder: 0,
  ...overrides,
});

const createMockSettings = (overrides: Partial<MockSettings> = {}): MockSettings => ({
  id: 'settings_test123',
  userId: 'user_test123',
  defaultModel: 'llama3.2:3b',
  defaultTemperature: 0.7,
  theme: 'system',
  ...overrides,
});

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ChatApiClient', () => {
  let client: ChatApiClient;

  beforeEach(() => {
    vi.resetAllMocks();
    client = new ChatApiClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================
  // API Key Management
  // ============================

  describe('API Key Management', () => {
    it('should set API key and include in headers', async () => {
      const session = createMockSession();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(session),
      });

      client.setApiKey('test_api_key_123');
      await client.getSession('sess_test123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test_api_key_123',
          }),
        })
      );
    });

    it('should not include X-API-Key header when no key is set', async () => {
      const session = createMockSession();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(session),
      });

      // Create new client without default key
      const clientWithoutKey = new ChatApiClient();
      // @ts-expect-error - accessing private property for test
      clientWithoutKey.apiKey = null;

      await clientWithoutKey.getSession('sess_test123');

      const callHeaders = mockFetch.mock.calls[0][1]?.headers;
      expect(callHeaders).not.toHaveProperty('X-API-Key');
    });
  });

  // ============================
  // Error Handling
  // ============================

  describe('Error Handling', () => {
    it('should throw error with message from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid session ID' }),
      });

      await expect(client.getSession('invalid_id')).rejects.toThrow('Invalid session ID');
    });

    it('should throw error with error field from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Session not found' }),
      });

      await expect(client.getSession('nonexistent')).rejects.toThrow('Session not found');
    });

    it('should throw generic HTTP error when no message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(client.getSession('any_id')).rejects.toThrow('HTTP 500');
    });

    it('should handle JSON parse errors in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(client.getSession('any_id')).rejects.toThrow('HTTP 500');
    });
  });

  // ============================
  // Session Endpoints
  // ============================

  describe('Session Endpoints', () => {
    describe('getSessions', () => {
      it('should fetch sessions with default options', async () => {
        const response = {
          items: [createMockSession()],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(response),
        });

        const result = await client.getSessions();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions?'),
          expect.any(Object)
        );
        expect(result.items).toHaveLength(1);
      });

      it('should include query parameters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [], total: 0 }),
        });

        await client.getSessions({
          page: 2,
          pageSize: 10,
          folderId: 'folder_123',
          isArchived: true,
          search: 'test query',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });

        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('page=2');
        expect(url).toContain('pageSize=10');
        expect(url).toContain('folderId=folder_123');
        expect(url).toContain('isArchived=true');
        expect(url).toContain('search=test');
        expect(url).toContain('sortBy=createdAt');
        expect(url).toContain('sortOrder=desc');
      });

      it('should handle isArchived=false', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [], total: 0 }),
        });

        await client.getSessions({ isArchived: false });

        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('isArchived=false');
      });
    });

    describe('getSession', () => {
      it('should fetch single session by ID', async () => {
        const session = createMockSession({ id: 'sess_specific' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(session),
        });

        const result = await client.getSession('sess_specific');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions/sess_specific'),
          expect.any(Object)
        );
        expect(result.id).toBe('sess_specific');
      });
    });

    describe('createSession', () => {
      it('should create session with default options', async () => {
        const session = createMockSession();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(session),
        });

        const result = await client.createSession();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({}),
          })
        );
        expect(result.id).toBe(session.id);
      });

      it('should create session with custom options', async () => {
        const session = createMockSession({ title: 'Custom Title' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(session),
        });

        await client.createSession({
          title: 'Custom Title',
          folderId: 'folder_123',
          agentId: 'agent_456',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              title: 'Custom Title',
              folderId: 'folder_123',
              agentId: 'agent_456',
            }),
          })
        );
      });
    });

    describe('updateSession', () => {
      it('should update session with partial data', async () => {
        const session = createMockSession({ title: 'Updated Title' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(session),
        });

        const result = await client.updateSession('sess_test123', {
          title: 'Updated Title',
          isPinned: true,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions/sess_test123'),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({
              title: 'Updated Title',
              isPinned: true,
            }),
          })
        );
        expect(result.title).toBe('Updated Title');
      });

      it('should allow setting nullable fields to null', async () => {
        const session = createMockSession({ folderId: null });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(session),
        });

        await client.updateSession('sess_test123', {
          folderId: null,
          agentId: null,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              folderId: null,
              agentId: null,
            }),
          })
        );
      });
    });

    describe('deleteSession', () => {
      it('should delete session by ID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        await client.deleteSession('sess_to_delete');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions/sess_to_delete'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    describe('duplicateSession', () => {
      it('should duplicate session without messages by default', async () => {
        const session = createMockSession({ id: 'sess_new_copy' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(session),
        });

        const result = await client.duplicateSession('sess_original');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions/sess_original/duplicate'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ includeMessages: false }),
          })
        );
        expect(result.id).toBe('sess_new_copy');
      });

      it('should duplicate session with messages when specified', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockSession()),
        });

        await client.duplicateSession('sess_original', true);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({ includeMessages: true }),
          })
        );
      });
    });
  });

  // ============================
  // Message Endpoints
  // ============================

  describe('Message Endpoints', () => {
    describe('getMessages', () => {
      it('should fetch messages with default options', async () => {
        const response = {
          messages: [createMockMessage()],
          hasMore: false,
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(response),
        });

        const result = await client.getMessages('sess_test123');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions/sess_test123/messages?'),
          expect.any(Object)
        );
        expect(result.messages).toHaveLength(1);
        expect(result.hasMore).toBe(false);
      });

      it('should include pagination parameters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ messages: [], hasMore: false }),
        });

        await client.getMessages('sess_test123', {
          limit: 50,
          cursor: 'cursor_abc123',
          direction: 'before',
        });

        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('limit=50');
        expect(url).toContain('cursor=cursor_abc123');
        expect(url).toContain('direction=before');
      });
    });

    describe('sendMessage', () => {
      it('should send message and receive response', async () => {
        const response = {
          userMessage: createMockMessage({ role: 'user', content: 'Hello' }),
          assistantMessage: createMockMessage({ role: 'assistant', content: 'Hi there!' }),
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(response),
        });

        const result = await client.sendMessage('sess_test123', {
          content: 'Hello',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions/sess_test123/messages'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ content: 'Hello', stream: false }),
          })
        );
        expect(result.userMessage.content).toBe('Hello');
        expect(result.assistantMessage.content).toBe('Hi there!');
      });

      it('should include attachments when provided', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            userMessage: createMockMessage(),
            assistantMessage: createMockMessage({ role: 'assistant' }),
          }),
        });

        await client.sendMessage('sess_test123', {
          content: 'Check this file',
          attachmentIds: ['file_123', 'file_456'],
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              content: 'Check this file',
              attachmentIds: ['file_123', 'file_456'],
              stream: false,
            }),
          })
        );
      });
    });

    describe('streamMessage', () => {
      it('should handle streaming response chunks', async () => {
        const chunks: Array<{ type: string; content?: string }> = [];
        const mockReader = {
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"start","messageId":"msg_123"}\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"content","content":"Hello "}\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"content","content":"world!"}\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"complete"}\n'),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => mockReader,
          },
        });

        const onChunk = vi.fn((chunk: { type: string; content?: string }) => chunks.push(chunk));
        const onError = vi.fn();
        const onComplete = vi.fn();

        const abort = client.streamMessage(
          'sess_test123',
          { content: 'Hello' },
          onChunk,
          onError,
          onComplete
        );

        // Wait for async processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions/sess_test123/messages'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ content: 'Hello', stream: true }),
          })
        );

        expect(onChunk).toHaveBeenCalledTimes(4);
        expect(chunks[0]).toEqual({ type: 'start', messageId: 'msg_123' });
        expect(chunks[1]).toEqual({ type: 'content', content: 'Hello ' });
        expect(chunks[2]).toEqual({ type: 'content', content: 'world!' });
        expect(chunks[3]).toEqual({ type: 'complete' });
        expect(onComplete).toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();

        // Verify abort function returned
        expect(typeof abort).toBe('function');
      });

      it('should handle stream errors', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Server error' }),
        });

        const onChunk = vi.fn();
        const onError = vi.fn();
        const onComplete = vi.fn();

        client.streamMessage(
          'sess_test123',
          { content: 'Hello' },
          onChunk,
          onError,
          onComplete
        );

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        expect(onComplete).not.toHaveBeenCalled();
      });

      it('should handle missing response body', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: null,
        });

        const onChunk = vi.fn();
        const onError = vi.fn();
        const onComplete = vi.fn();

        client.streamMessage(
          'sess_test123',
          { content: 'Hello' },
          onChunk,
          onError,
          onComplete
        );

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
          message: 'No response body',
        }));
      });

      it('should abort stream when abort function called', async () => {
        const controller = new AbortController();
        vi.spyOn(global, 'AbortController').mockImplementation(() => controller);

        const mockReader = {
          read: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => mockReader,
          },
        });

        const abort = client.streamMessage(
          'sess_test123',
          { content: 'Hello' },
          vi.fn(),
          vi.fn(),
          vi.fn()
        );

        // Call abort
        abort();

        expect(controller.signal.aborted).toBe(true);
      });

      it('should not call onError for AbortError', async () => {
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';

        mockFetch.mockRejectedValueOnce(abortError);

        const onError = vi.fn();

        client.streamMessage(
          'sess_test123',
          { content: 'Hello' },
          vi.fn(),
          onError,
          vi.fn()
        );

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(onError).not.toHaveBeenCalled();
      });

      it('should handle malformed JSON chunks gracefully', async () => {
        const mockReader = {
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"start"}\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {invalid json}\n'),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"type":"complete"}\n'),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => mockReader,
          },
        });

        const chunks: Array<{ type: string }> = [];
        const onChunk = vi.fn((chunk: { type: string }) => chunks.push(chunk));
        const onError = vi.fn();

        client.streamMessage(
          'sess_test123',
          { content: 'Hello' },
          onChunk,
          onError,
          vi.fn()
        );

        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should skip malformed chunk
        expect(chunks).toHaveLength(2);
        expect(onError).not.toHaveBeenCalled();
      });
    });

    describe('editMessage', () => {
      it('should edit message content', async () => {
        const message = createMockMessage({ content: 'Updated content' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(message),
        });

        const result = await client.editMessage('sess_test123', 'msg_test456', 'Updated content');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions/sess_test123/messages/msg_test456'),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ content: 'Updated content' }),
          })
        );
        expect(result.content).toBe('Updated content');
      });
    });

    describe('deleteMessage', () => {
      it('should delete message by ID', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        await client.deleteMessage('sess_test123', 'msg_to_delete');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/sessions/sess_test123/messages/msg_to_delete'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });
  });

  // ============================
  // Agent Endpoints
  // ============================

  describe('Agent Endpoints', () => {
    describe('getAgents', () => {
      it('should fetch all active agents', async () => {
        const response = {
          agents: [
            createMockAgent({ name: 'chat-agent' }),
            createMockAgent({ name: 'code-agent', id: 'agent_code' }),
          ],
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(response),
        });

        const result = await client.getAgents();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/agents'),
          expect.any(Object)
        );
        expect(result.agents).toHaveLength(2);
      });
    });

    describe('getAgent', () => {
      it('should fetch single agent by ID', async () => {
        const agent = createMockAgent({ id: 'agent_specific' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(agent),
        });

        const result = await client.getAgent('agent_specific');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/chat/agents/agent_specific'),
          expect.any(Object)
        );
        expect(result.id).toBe('agent_specific');
      });
    });
  });

  // ============================
  // Folder Endpoints
  // ============================

  describe('Folder Endpoints', () => {
    describe('getFolderTree', () => {
      it('should fetch folder tree without archived folders', async () => {
        const response = {
          folders: [createMockFolder()],
          totalFolders: 1,
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(response),
        });

        const result = await client.getFolderTree();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringMatching(/\/folders\?(?!.*includeArchived)/),
          expect.any(Object)
        );
        expect(result.folders).toHaveLength(1);
      });

      it('should include archived folders when specified', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ folders: [] }),
        });

        await client.getFolderTree(true);

        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('includeArchived=true');
      });
    });

    describe('getFolder', () => {
      it('should fetch single folder by ID', async () => {
        const folder = createMockFolder({ id: 'folder_specific' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(folder),
        });

        const result = await client.getFolder('folder_specific');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/folders/folder_specific'),
          expect.any(Object)
        );
        expect(result.id).toBe('folder_specific');
      });
    });

    describe('createFolder', () => {
      it('should create folder with required fields', async () => {
        const folder = createMockFolder({ name: 'New Folder' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(folder),
        });

        const result = await client.createFolder({ name: 'New Folder' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/folders'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ name: 'New Folder' }),
          })
        );
        expect(result.name).toBe('New Folder');
      });

      it('should create folder with optional fields', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockFolder()),
        });

        await client.createFolder({
          name: 'Project Folder',
          description: 'Work projects',
          color: '#ff6b6b',
          icon: 'briefcase',
          parentId: 'folder_parent',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              name: 'Project Folder',
              description: 'Work projects',
              color: '#ff6b6b',
              icon: 'briefcase',
              parentId: 'folder_parent',
            }),
          })
        );
      });
    });

    describe('updateFolder', () => {
      it('should update folder with partial data', async () => {
        const folder = createMockFolder({ name: 'Renamed' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(folder),
        });

        const result = await client.updateFolder('folder_test123', {
          name: 'Renamed',
          color: '#3b82f6',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/folders/folder_test123'),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ name: 'Renamed', color: '#3b82f6' }),
          })
        );
        expect(result.name).toBe('Renamed');
      });
    });

    describe('deleteFolder', () => {
      it('should delete folder without moving sessions', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        await client.deleteFolder('folder_to_delete');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/folders/folder_to_delete?'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });

      it('should delete folder and move sessions to another folder', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        await client.deleteFolder('folder_to_delete', 'folder_destination');

        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('moveSessionsToFolder=folder_destination');
      });

      it('should delete folder and orphan sessions when null specified', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        await client.deleteFolder('folder_to_delete', null);

        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('moveSessionsToFolder=');
      });
    });

    describe('reorderFolders', () => {
      it('should reorder folders under parent', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        await client.reorderFolders('folder_parent', ['folder_1', 'folder_2', 'folder_3']);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/folders/reorder'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              parentId: 'folder_parent',
              folderIds: ['folder_1', 'folder_2', 'folder_3'],
            }),
          })
        );
      });

      it('should reorder root-level folders', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        await client.reorderFolders(null, ['folder_a', 'folder_b']);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              parentId: null,
              folderIds: ['folder_a', 'folder_b'],
            }),
          })
        );
      });
    });

    describe('moveSessionsToFolder', () => {
      it('should move sessions to folder', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        await client.moveSessionsToFolder('folder_dest', ['sess_1', 'sess_2', 'sess_3']);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/folders/folder_dest/move-sessions'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              sessionIds: ['sess_1', 'sess_2', 'sess_3'],
            }),
          })
        );
      });
    });
  });

  // ============================
  // Settings Endpoints
  // ============================

  describe('Settings Endpoints', () => {
    describe('getSettings', () => {
      it('should fetch user settings', async () => {
        const settings = createMockSettings();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(settings),
        });

        const result = await client.getSettings();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/settings'),
          expect.any(Object)
        );
        expect(result.defaultModel).toBe('llama3.2:3b');
      });
    });

    describe('updateSettings', () => {
      it('should update settings with partial data', async () => {
        const settings = createMockSettings({ theme: 'dark' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(settings),
        });

        const result = await client.updateSettings({
          theme: 'dark',
          defaultTemperature: 0.9,
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/settings'),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ theme: 'dark', defaultTemperature: 0.9 }),
          })
        );
        expect(result.theme).toBe('dark');
      });
    });

    describe('resetSettings', () => {
      it('should reset settings to defaults', async () => {
        const settings = createMockSettings();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(settings),
        });

        const result = await client.resetSettings();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/settings/reset'),
          expect.objectContaining({ method: 'POST' })
        );
        expect(result).toBeDefined();
      });
    });

    describe('getAvailableModels', () => {
      it('should fetch available models', async () => {
        const response = {
          models: [
            { id: 'llama3.2:3b', name: 'Llama 3.2', provider: 'ollama' },
            { id: 'codellama:7b', name: 'Code Llama', provider: 'ollama' },
          ],
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(response),
        });

        const result = await client.getAvailableModels();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/settings/models'),
          expect.any(Object)
        );
        expect(result.models).toHaveLength(2);
      });
    });

    describe('Custom Prompts', () => {
      it('should add custom prompt', async () => {
        const settings = createMockSettings();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(settings),
        });

        await client.addCustomPrompt({
          name: 'Code Review',
          content: 'Review this code: {{code}}',
          category: 'development',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/settings/prompts'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              name: 'Code Review',
              content: 'Review this code: {{code}}',
              category: 'development',
            }),
          })
        );
      });

      it('should remove custom prompt', async () => {
        const settings = createMockSettings();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(settings),
        });

        await client.removeCustomPrompt('prompt_to_delete');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/settings/prompts/prompt_to_delete'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    describe('Import/Export', () => {
      it('should export settings as blob', async () => {
        const mockBlob = new Blob(['{"settings": {}}'], { type: 'application/json' });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(mockBlob),
        });

        const result = await client.exportSettings();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/settings/export'),
          expect.objectContaining({
            headers: expect.any(Object),
          })
        );
        expect(result).toBeInstanceOf(Blob);
      });

      it('should throw error on export failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

        await expect(client.exportSettings()).rejects.toThrow('Failed to export settings');
      });

      it('should import settings from backup', async () => {
        const settings = createMockSettings();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(settings),
        });

        const backup = {
          settings: { theme: 'dark' },
          customPrompts: [],
        };

        const result = await client.importSettings(backup);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/settings/import'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(backup),
          })
        );
        expect(result).toBeDefined();
      });
    });
  });
});

// ============================
// Singleton Instance Tests
// ============================

describe('Chat API Singleton', () => {
  it('should export singleton instance', async () => {
    const { chatApi } = await import('./chat-api');

    expect(chatApi).toBeInstanceOf(ChatApiClient);
  });

  it('should maintain API key across calls', async () => {
    const { chatApi } = await import('./chat-api');

    chatApi.setApiKey('singleton_test_key');

    // Create mock for next call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ agents: [] }),
    });

    await chatApi.getAgents();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'singleton_test_key',
        }),
      })
    );
  });
});
