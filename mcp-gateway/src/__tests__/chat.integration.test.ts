/**
 * Chat Integration Tests
 *
 * Tests for Enhanced Chat Interface API endpoints including:
 * - Chat Sessions (CRUD, duplicate)
 * - Messages (send, edit, delete, pagination)
 * - Streaming responses
 * - Agents
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { createContainer, asValue, asClass } from 'awilix';
import type { ChatSession, ChatMessage, Agent } from '@prisma/client';
import { errorHandler } from '../middleware/error-handler.js';

// ============================================================================
// CUID-like ID Generator for Tests
// ============================================================================

// Generate valid CUID-like IDs for Zod validation (format: c + 24 lowercase alphanumeric)
const generateTestCuid = (prefix = '') => {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let id = 'c';
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return prefix ? `${prefix}_${id}` : id;
};

// Pre-generated test CUIDs for consistent testing
const TEST_IDS = {
  user: generateTestCuid(),
  session: generateTestCuid(),
  session2: generateTestCuid(),
  duplicateSession: generateTestCuid(),
  message: generateTestCuid(),
  assistantMessage: generateTestCuid(),
  agent: generateTestCuid(),
  codeAgent: generateTestCuid(),
  folder1: generateTestCuid(),
  folder2: generateTestCuid(),
  folder3: generateTestCuid(),
  parentFolder: generateTestCuid(),
  childFolder: generateTestCuid(),
  newFolder: generateTestCuid(),
  file1: generateTestCuid(),
  file2: generateTestCuid(),
  apiKey: generateTestCuid(),
  prompt: generateTestCuid(),
  settings: generateTestCuid(),
};

// ============================================================================
// Mock Data Factories
// ============================================================================

const createMockUser = (overrides = {}) => ({
  id: TEST_IDS.user,
  email: 'test@example.com',
  name: 'Test User',
  scopes: ['ai.chat'],
  ...overrides,
});

const createMockSession = (overrides = {}): ChatSession => ({
  id: TEST_IDS.session,
  userId: TEST_IDS.user,
  folderId: null,
  agentId: TEST_IDS.agent,
  title: 'Test Chat',
  summary: null,
  systemPrompt: null,
  model: 'llama3.2:3b',
  temperature: 0.7,
  contextWindow: 10,
  metadata: {},
  isPinned: false,
  isArchived: false,
  isDeleted: false,
  deletedAt: null,
  lastMessageAt: new Date(),
  messageCount: 0,
  tokenCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockMessage = (overrides = {}): ChatMessage => ({
  id: TEST_IDS.message,
  sessionId: TEST_IDS.session,
  parentId: null,
  role: 'user',
  content: 'Test message content',
  contentFormat: 'text',
  model: null,
  promptTokens: null,
  completionTokens: null,
  durationMs: null,
  toolCalls: null,
  toolResults: null,
  metadata: {},
  isEdited: false,
  editedAt: null,
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockAgent = (overrides = {}): Agent => ({
  id: TEST_IDS.agent,
  name: 'chat',
  displayName: 'Chat Agent',
  description: 'General conversation assistant',
  systemPrompt: 'You are a helpful assistant.',
  model: 'llama3.2:3b',
  temperature: 0.7,
  maxTokens: 4096,
  capabilities: ['chat', 'general'],
  tools: [],
  metadata: {},
  isActive: true,
  isDefault: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ============================================================================
// Mock Services
// ============================================================================

const createMockChatService = () => ({
  getSessions: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  duplicateSession: vi.fn(),
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  streamMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  getAgents: vi.fn(),
  getAgent: vi.fn(),
});

const createMockFolderService = () => ({
  getFolderTree: vi.fn(),
  createFolder: vi.fn(),
  getFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
  reorderFolders: vi.fn(),
  moveSessionsToFolder: vi.fn(),
});

const createMockSettingsService = () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  resetSettings: vi.fn(),
  getAvailableModels: vi.fn(),
  addCustomPrompt: vi.fn(),
  removeCustomPrompt: vi.fn(),
  exportSettings: vi.fn(),
  importSettings: vi.fn(),
});

const createMockApiKeyService = () => ({
  validateKey: vi.fn(),
  hasScope: vi.fn().mockReturnValue(true),
});

const createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

// ============================================================================
// Test App Factory
// ============================================================================

async function createTestApp(
  mockChatService = createMockChatService(),
  mockFolderService = createMockFolderService(),
  mockSettingsService = createMockSettingsService()
) {
  const app = Fastify({ logger: false });

  const mockApiKeyService = createMockApiKeyService();
  mockApiKeyService.validateKey.mockResolvedValue({
    valid: true,
    apiKey: {
      id: TEST_IDS.apiKey,
      userId: TEST_IDS.user,
      userEmail: 'test@example.com',
      name: 'Test Key',
      scopes: ['ai.chat'],
      prefix: 'znt_test_sk_',
      rateLimitPerMinute: 100,
      rateLimitPerDay: 10000,
    },
  });

  // Create container with mocks
  const container = createContainer();
  container.register({
    chatService: asValue(mockChatService),
    folderService: asValue(mockFolderService),
    settingsService: asValue(mockSettingsService),
    apiKeyService: asValue(mockApiKeyService),
    logger: asValue(createMockLogger()),
  });

  // Add container to app
  app.decorate('container', container);

  // Mock auth middleware - sets user if API key is present
  app.addHook('preHandler', async (request) => {
    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      request.user = createMockUser();
    }
  });

  // Register global error handler (converts Zod errors to 400)
  app.setErrorHandler(errorHandler);

  // Import and register routes
  const { chatRoutes } = await import('../routes/chat.js');
  const { folderRoutes } = await import('../routes/folders.js');
  const { settingsRoutes } = await import('../routes/settings.js');

  await app.register(chatRoutes, { prefix: '/api/v1/chat' });
  await app.register(folderRoutes, { prefix: '/api/v1/folders' });
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' });

  return { app, mockChatService, mockFolderService, mockSettingsService };
}

// ============================================================================
// Session Tests
// ============================================================================

describe('Chat Sessions API', () => {
  let app: FastifyInstance;
  let mockChatService: ReturnType<typeof createMockChatService>;

  beforeEach(async () => {
    const result = await createTestApp();
    app = result.app;
    mockChatService = result.mockChatService;
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /api/v1/chat/sessions', () => {
    it('should return paginated sessions', async () => {
      const mockSessions = [createMockSession(), createMockSession({ id: TEST_IDS.session2 })];
      mockChatService.getSessions.mockResolvedValue({
        sessions: mockSessions,
        total: 2,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/sessions',
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessions).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.hasMore).toBe(false);
    });

    it('should filter by folderId', async () => {
      mockChatService.getSessions.mockResolvedValue({
        sessions: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });

      await app.inject({
        method: 'GET',
        url: `/api/v1/chat/sessions?folderId=${TEST_IDS.folder1}`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(mockChatService.getSessions).toHaveBeenCalledWith(
        TEST_IDS.user,
        expect.objectContaining({ folderId: TEST_IDS.folder1 })
      );
    });

    it('should support search parameter', async () => {
      mockChatService.getSessions.mockResolvedValue({
        sessions: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });

      await app.inject({
        method: 'GET',
        url: '/api/v1/chat/sessions?search=test',
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(mockChatService.getSessions).toHaveBeenCalledWith(
        TEST_IDS.user,
        expect.objectContaining({ search: 'test' })
      );
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/sessions',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/chat/sessions', () => {
    it('should create a new session', async () => {
      const mockSession = createMockSession();
      mockChatService.createSession.mockResolvedValue(mockSession);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/sessions',
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { title: 'New Chat' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(mockSession.id);
      expect(body.title).toBe('Test Chat');
    });

    it('should create session with agent and folder', async () => {
      const mockSession = createMockSession({ folderId: TEST_IDS.folder1, agentId: TEST_IDS.codeAgent });
      mockChatService.createSession.mockResolvedValue(mockSession);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/sessions',
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: {
          title: 'Code Session',
          folderId: TEST_IDS.folder1,
          agentId: TEST_IDS.codeAgent,
          temperature: 0.5,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockChatService.createSession).toHaveBeenCalledWith(
        TEST_IDS.user,
        expect.objectContaining({
          title: 'Code Session',
          folderId: TEST_IDS.folder1,
          agentId: TEST_IDS.codeAgent,
          temperature: 0.5,
        })
      );
    });
  });

  describe('GET /api/v1/chat/sessions/:sessionId', () => {
    it('should return a single session', async () => {
      const mockSession = createMockSession();
      mockChatService.getSession.mockResolvedValue(mockSession);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(TEST_IDS.session);
    });

    it('should return 404 for non-existent session', async () => {
      mockChatService.getSession.mockRejectedValue({
        statusCode: 404,
        message: 'Session not found',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/sessions/${generateTestCuid()}`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/chat/sessions/:sessionId', () => {
    it('should update session title', async () => {
      const mockSession = createMockSession({ title: 'Updated Title' });
      mockChatService.updateSession.mockResolvedValue(mockSession);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { title: 'Updated Title' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Updated Title');
    });

    it('should update session isPinned', async () => {
      const mockSession = createMockSession({ isPinned: true });
      mockChatService.updateSession.mockResolvedValue(mockSession);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { isPinned: true },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isPinned).toBe(true);
    });
  });

  describe('DELETE /api/v1/chat/sessions/:sessionId', () => {
    it('should delete a session', async () => {
      mockChatService.deleteSession.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(204);
      expect(mockChatService.deleteSession).toHaveBeenCalledWith(TEST_IDS.user, TEST_IDS.session);
    });
  });

  describe('POST /api/v1/chat/sessions/:sessionId/duplicate', () => {
    it('should duplicate a session without messages', async () => {
      const mockSession = createMockSession({ id: TEST_IDS.duplicateSession, title: 'Test Chat (Copy)' });
      mockChatService.duplicateSession.mockResolvedValue(mockSession);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}/duplicate`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { includeMessages: false },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.title).toContain('Copy');
    });

    it('should duplicate a session with messages', async () => {
      const mockSession = createMockSession({ id: TEST_IDS.duplicateSession, messageCount: 5 });
      mockChatService.duplicateSession.mockResolvedValue(mockSession);

      await app.inject({
        method: 'POST',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}/duplicate`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { includeMessages: true },
      });

      expect(mockChatService.duplicateSession).toHaveBeenCalledWith(
        TEST_IDS.user,
        TEST_IDS.session,
        true
      );
    });
  });
});

// ============================================================================
// Message Tests
// ============================================================================

describe('Chat Messages API', () => {
  let app: FastifyInstance;
  let mockChatService: ReturnType<typeof createMockChatService>;

  beforeEach(async () => {
    const result = await createTestApp();
    app = result.app;
    mockChatService = result.mockChatService;
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /api/v1/chat/sessions/:sessionId/messages', () => {
    it('should return messages with cursor pagination', async () => {
      const mockMessages = [
        createMockMessage({ role: 'user', content: 'Hello' }),
        createMockMessage({ id: TEST_IDS.assistantMessage, role: 'assistant', content: 'Hi there!' }),
      ];
      mockChatService.getMessages.mockResolvedValue({
        messages: mockMessages,
        hasMore: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}/messages`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.messages).toHaveLength(2);
    });

    it('should support cursor and limit', async () => {
      mockChatService.getMessages.mockResolvedValue({
        messages: [],
        hasMore: false,
      });

      await app.inject({
        method: 'GET',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}/messages?limit=10&cursor=2024-01-01T00:00:00Z`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(mockChatService.getMessages).toHaveBeenCalledWith(
        TEST_IDS.user,
        TEST_IDS.session,
        expect.objectContaining({
          limit: 10,
          cursor: '2024-01-01T00:00:00Z',
        })
      );
    });
  });

  describe('POST /api/v1/chat/sessions/:sessionId/messages', () => {
    it('should send a message (sync mode)', async () => {
      const userMessage = createMockMessage({ role: 'user', content: 'Hello AI' });
      const assistantMessage = createMockMessage({
        id: TEST_IDS.assistantMessage,
        role: 'assistant',
        content: 'Hello! How can I help you?',
      });
      mockChatService.sendMessage.mockResolvedValue({ userMessage, assistantMessage });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}/messages`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { content: 'Hello AI', stream: false },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userMessage.content).toBe('Hello AI');
      expect(body.assistantMessage.role).toBe('assistant');
    });

    it('should validate content is not empty', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}/messages`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { content: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should support attachments', async () => {
      const userMessage = createMockMessage({ role: 'user' });
      const assistantMessage = createMockMessage({ role: 'assistant' });
      mockChatService.sendMessage.mockResolvedValue({ userMessage, assistantMessage });

      await app.inject({
        method: 'POST',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}/messages`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: {
          content: 'Check this file',
          attachmentIds: [TEST_IDS.file1, TEST_IDS.file2],
          stream: false,
        },
      });

      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        TEST_IDS.user,
        TEST_IDS.session,
        expect.objectContaining({
          attachmentIds: [TEST_IDS.file1, TEST_IDS.file2],
        })
      );
    });
  });

  describe('PATCH /api/v1/chat/sessions/:sessionId/messages/:messageId', () => {
    it('should edit a message', async () => {
      const editedMessage = createMockMessage({
        content: 'Edited content',
        isEdited: true,
      });
      mockChatService.editMessage.mockResolvedValue(editedMessage);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}/messages/${TEST_IDS.message}`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { content: 'Edited content' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.content).toBe('Edited content');
      expect(body.isEdited).toBe(true);
    });
  });

  describe('DELETE /api/v1/chat/sessions/:sessionId/messages/:messageId', () => {
    it('should delete a message', async () => {
      mockChatService.deleteMessage.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/chat/sessions/${TEST_IDS.session}/messages/${TEST_IDS.message}`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(204);
      expect(mockChatService.deleteMessage).toHaveBeenCalledWith(
        TEST_IDS.user,
        TEST_IDS.session,
        TEST_IDS.message
      );
    });
  });
});

// ============================================================================
// Agent Tests
// ============================================================================

describe('Chat Agents API', () => {
  let app: FastifyInstance;
  let mockChatService: ReturnType<typeof createMockChatService>;

  beforeEach(async () => {
    const result = await createTestApp();
    app = result.app;
    mockChatService = result.mockChatService;
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /api/v1/chat/agents', () => {
    it('should return all active agents', async () => {
      const mockAgents = [
        createMockAgent(),
        createMockAgent({ id: TEST_IDS.codeAgent, name: 'code', displayName: 'Code Agent' }),
      ];
      mockChatService.getAgents.mockResolvedValue(mockAgents);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/agents',
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.agents).toHaveLength(2);
    });
  });

  describe('GET /api/v1/chat/agents/:agentId', () => {
    it('should return a single agent', async () => {
      const mockAgent = createMockAgent();
      mockChatService.getAgent.mockResolvedValue(mockAgent);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/agents/${TEST_IDS.agent}`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(TEST_IDS.agent);
      expect(body.name).toBe('chat');
    });
  });
});

// ============================================================================
// Folder Tests
// ============================================================================

describe('Folders API', () => {
  let app: FastifyInstance;
  let mockFolderService: ReturnType<typeof createMockFolderService>;

  beforeEach(async () => {
    const result = await createTestApp();
    app = result.app;
    mockFolderService = result.mockFolderService;
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /api/v1/folders', () => {
    it('should return folder tree', async () => {
      mockFolderService.getFolderTree.mockResolvedValue({
        folders: [
          { id: TEST_IDS.folder1, name: 'Work', children: [], _count: { chatSessions: 5 } },
          { id: TEST_IDS.folder2, name: 'Personal', children: [], _count: { chatSessions: 3 } },
        ],
        total: 2,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/folders',
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.folders).toHaveLength(2);
      expect(body.total).toBe(2);
    });
  });

  describe('POST /api/v1/folders', () => {
    it('should create a folder', async () => {
      mockFolderService.createFolder.mockResolvedValue({
        id: TEST_IDS.newFolder,
        name: 'New Folder',
        color: '#6366f1',
        icon: 'folder',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/folders',
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { name: 'New Folder' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('New Folder');
    });

    it('should create nested folder', async () => {
      mockFolderService.createFolder.mockResolvedValue({
        id: TEST_IDS.childFolder,
        name: 'Child Folder',
        parentId: TEST_IDS.parentFolder,
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/folders',
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { name: 'Child Folder', parentId: TEST_IDS.parentFolder },
      });

      expect(mockFolderService.createFolder).toHaveBeenCalledWith(
        TEST_IDS.user,
        expect.objectContaining({ parentId: TEST_IDS.parentFolder })
      );
    });
  });

  describe('PATCH /api/v1/folders/:folderId', () => {
    it('should update folder', async () => {
      mockFolderService.updateFolder.mockResolvedValue({
        id: TEST_IDS.folder1,
        name: 'Updated Name',
        color: '#ff0000',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/folders/${TEST_IDS.folder1}`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { name: 'Updated Name', color: '#ff0000' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('DELETE /api/v1/folders/:folderId', () => {
    it('should delete folder', async () => {
      mockFolderService.deleteFolder.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/folders/${TEST_IDS.folder1}`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('POST /api/v1/folders/reorder', () => {
    it('should reorder folders', async () => {
      mockFolderService.reorderFolders.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/folders/reorder',
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: {
          folderIds: [TEST_IDS.folder2, TEST_IDS.folder1, TEST_IDS.folder3],
        },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('POST /api/v1/folders/:folderId/move-sessions', () => {
    it('should move sessions to folder', async () => {
      mockFolderService.moveSessionsToFolder.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/folders/${TEST_IDS.folder1}/move-sessions`,
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: {
          sessionIds: [TEST_IDS.session, TEST_IDS.session2],
        },
      });

      expect(response.statusCode).toBe(204);
      expect(mockFolderService.moveSessionsToFolder).toHaveBeenCalledWith(
        TEST_IDS.user,
        [TEST_IDS.session, TEST_IDS.session2],
        TEST_IDS.folder1
      );
    });
  });
});

// ============================================================================
// Settings Tests
// ============================================================================

describe('Settings API', () => {
  let app: FastifyInstance;
  let mockSettingsService: ReturnType<typeof createMockSettingsService>;

  beforeEach(async () => {
    const result = await createTestApp();
    app = result.app;
    mockSettingsService = result.mockSettingsService;
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /api/v1/settings', () => {
    it('should return user settings', async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        id: TEST_IDS.settings,
        userId: TEST_IDS.user,
        defaultModel: 'llama3.2:3b',
        defaultTemperature: 0.7,
        theme: 'dark',
        streamResponses: true,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings',
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.defaultModel).toBe('llama3.2:3b');
      expect(body.theme).toBe('dark');
    });
  });

  describe('PATCH /api/v1/settings', () => {
    it('should update settings', async () => {
      mockSettingsService.updateSettings.mockResolvedValue({
        id: TEST_IDS.settings,
        defaultTemperature: 0.5,
        theme: 'light',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/settings',
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { defaultTemperature: 0.5, theme: 'light' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/settings/reset', () => {
    it('should reset settings to defaults', async () => {
      mockSettingsService.resetSettings.mockResolvedValue({
        id: TEST_IDS.settings,
        defaultModel: 'llama3.2:3b',
        defaultTemperature: 0.7,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings/reset',
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/settings/models', () => {
    it('should return available models', async () => {
      mockSettingsService.getAvailableModels.mockResolvedValue([
        { id: 'llama3.2:3b', name: 'Llama 3.2 3B', provider: 'ollama' },
        { id: 'codellama:7b', name: 'Code Llama 7B', provider: 'ollama' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/models',
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.models).toHaveLength(2);
    });
  });

  describe('POST /api/v1/settings/prompts', () => {
    it('should add custom prompt', async () => {
      mockSettingsService.addCustomPrompt.mockResolvedValue({
        id: TEST_IDS.settings,
        customPrompts: [{ id: TEST_IDS.prompt, name: 'Test Prompt', content: 'Be helpful' }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings/prompts',
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: { name: 'Test Prompt', content: 'Be helpful' },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('DELETE /api/v1/settings/prompts/:promptId', () => {
    it('should remove custom prompt', async () => {
      mockSettingsService.removeCustomPrompt.mockResolvedValue({
        id: TEST_IDS.settings,
        customPrompts: [],
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/settings/prompts/${TEST_IDS.prompt}`,
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/settings/export', () => {
    it('should export settings', async () => {
      mockSettingsService.exportSettings.mockResolvedValue({
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        settings: { theme: 'dark' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/export',
        headers: { 'x-api-key': 'znt_test_sk_validkey123' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-disposition']).toContain('zentoria-settings.json');
    });
  });

  describe('POST /api/v1/settings/import', () => {
    it('should import settings', async () => {
      mockSettingsService.importSettings.mockResolvedValue({
        id: TEST_IDS.settings,
        theme: 'dark',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings/import',
        headers: {
          'x-api-key': 'znt_test_sk_validkey123',
          'content-type': 'application/json',
        },
        payload: {
          version: '1.0.0',
          settings: { theme: 'dark' },
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});

// ============================================================================
// Authorization Tests
// ============================================================================

describe('Chat API Authorization', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const result = await createTestApp();
    app = result.app;
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('should reject GET requests without API key', async () => {
    // Only test GET endpoints since POST/PUT/PATCH will fail schema validation first
    const endpoints = [
      { method: 'GET', url: '/api/v1/chat/sessions' },
      { method: 'GET', url: '/api/v1/chat/agents' },
      { method: 'GET', url: '/api/v1/folders' },
      { method: 'GET', url: '/api/v1/settings' },
    ];

    for (const endpoint of endpoints) {
      const response = await app.inject({
        method: endpoint.method as 'GET',
        url: endpoint.url,
      });

      expect(response.statusCode).toBe(401);
    }
  });

  it('should reject POST requests without API key (with valid body)', async () => {
    // POST endpoints need a valid body to pass schema validation
    const endpoints = [
      { method: 'POST', url: '/api/v1/chat/sessions', body: { title: 'Test' } },
      { method: 'POST', url: '/api/v1/folders', body: { name: 'Test Folder' } },
    ];

    for (const endpoint of endpoints) {
      const response = await app.inject({
        method: 'POST',
        url: endpoint.url,
        headers: { 'content-type': 'application/json' },
        payload: endpoint.body,
      });

      expect(response.statusCode).toBe(401);
    }
  });
});
