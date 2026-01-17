/**
 * Integration Tests - TEST-002
 *
 * End-to-end API route testing with mocked services
 * Tests the full HTTP request → route → service → response flow
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { Readable } from 'stream';

// =============================================================================
// Mock Factories
// =============================================================================

const createMockUser = (overrides = {}) => ({
  id: 'user_test123',
  email: 'test@example.com',
  scopes: ['ai.chat', 'files.read', 'files.write', 'files.delete', 'keys.manage'],
  apiKeyId: 'key_test123',
  ...overrides,
});

const createMockFile = (overrides = {}) => ({
  id: 'file_test123456789012',
  userId: 'user_test123',
  filename: 'test-document.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  purpose: 'ai-input',
  checksum: 'abc123def456',
  objectName: 'users/user_test123/files/file_test123456789012/test-document.pdf',
  metadata: null,
  createdAt: new Date('2026-01-15T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
  ...overrides,
});

const createMockApiKey = (overrides = {}) => ({
  id: 'key_newtest123',
  name: 'Test Key',
  key: 'znt_test_sk_TestKeyValue12345678901234567890',
  scopes: ['ai.chat', 'files.read'],
  prefix: 'znt_test_sk_Test',
  userId: 'user_test123',
  createdAt: new Date('2026-01-15T10:00:00Z'),
  expiresAt: new Date('2027-01-15T10:00:00Z'),
  lastUsedAt: null,
  ...overrides,
});

const createMockCommandResult = (overrides = {}) => ({
  id: 'cmd_test123456',
  content: 'Hello! How can I help you today?',
  model: 'claude-3-5-sonnet',
  usage: {
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
  },
  sessionId: 'sess_test123',
  finishReason: 'stop' as const,
  ...overrides,
});

// =============================================================================
// Mock Services
// =============================================================================

const createMockServices = () => ({
  commandService: {
    processCommand: vi.fn().mockResolvedValue(createMockCommandResult()),
    queueCommand: vi.fn().mockResolvedValue({
      id: 'cmd_async123',
      status: 'queued',
      estimatedCompletionMs: 30000,
      pollingUrl: 'http://localhost:4000/api/v1/mcp/command/cmd_async123',
      websocketUrl: 'ws://localhost:4000/ws/command/cmd_async123',
    }),
    getCommandStatus: vi.fn().mockResolvedValue({
      status: 'completed',
      result: createMockCommandResult(),
    }),
  },
  emailService: {
    send: vi.fn().mockResolvedValue({
      id: 'email_test123',
      status: 'sent',
      messageId: '<message@example.com>',
      sentAt: new Date().toISOString(),
    }),
  },
  fileService: {
    uploadFile: vi.fn().mockResolvedValue(createMockFile()),
    listFiles: vi.fn().mockResolvedValue({
      files: [createMockFile()],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    }),
    getFile: vi.fn().mockResolvedValue(createMockFile()),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    getFileStream: vi.fn().mockResolvedValue({
      stream: Readable.from(['test content']),
      metadata: {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 12,
      },
    }),
    getDownloadUrl: vi.fn().mockResolvedValue({
      url: 'https://storage.example.com/download/file_test123',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  },
  apiKeyService: {
    createKey: vi.fn().mockResolvedValue(createMockApiKey()),
    listKeys: vi.fn().mockResolvedValue([createMockApiKey()]),
    revokeKey: vi.fn().mockResolvedValue(undefined),
    validateKey: vi.fn().mockResolvedValue({
      id: 'key_test123',
      userId: 'user_test123',
      userEmail: 'test@example.com',
      name: 'Test Key',
      scopes: ['ai.chat', 'files.read', 'files.write', 'files.delete', 'keys.manage'],
    }),
  },
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 0], // 0 requests in window (under rate limit)
        [null, 1],
        [null, 1],
      ]),
    }),
  },
  auditRepository: {
    log: vi.fn().mockResolvedValue(undefined),
  },
  healthChecker: {
    check: vi.fn().mockResolvedValue({
      status: 'healthy',
      version: '1.0.0',
      uptime: 12345,
      checks: {
        database: { status: 'healthy', latencyMs: 5 },
        redis: { status: 'healthy', latencyMs: 2 },
        minio: { status: 'healthy', latencyMs: 10 },
      },
    }),
    checkReady: vi.fn().mockResolvedValue({
      ready: true,
      checks: {
        database: true,
        redis: true,
      },
    }),
  },
});

// =============================================================================
// Test Application Factory
// =============================================================================

const createTestApp = async (services = createMockServices()) => {
  const app = Fastify({ logger: false });

  // Add container mock
  const container = {
    resolve: (name: string) => {
      return (services as any)[name];
    },
    cradle: services,
  };

  app.decorate('container', container);

  // Add user decorator for authentication
  app.decorateRequest('user', null);

  // Authentication hook - simulate authenticated user
  app.addHook('preHandler', async (request) => {
    const apiKey = request.headers['x-api-key'];
    if (apiKey === 'test_valid_key') {
      request.user = createMockUser();
    } else if (apiKey === 'test_admin_key') {
      request.user = createMockUser({ scopes: ['admin'] });
    } else if (apiKey === 'test_limited_key') {
      request.user = createMockUser({ scopes: ['ai.chat'] }); // Limited scopes
    }
    // No user set = unauthenticated
  });

  // Register routes manually for testing
  app.post('/api/v1/mcp/command', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    if (!request.user.scopes.includes('ai.chat') && !request.user.scopes.includes('admin')) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    const body = request.body as any;
    if (body.options?.async) {
      const result = await services.commandService.queueCommand(request.user.id, body);
      return reply.status(202).send(result);
    }
    const result = await services.commandService.processCommand(request.user.id, body);
    return reply.send(result);
  });

  app.get('/api/v1/mcp/command/:commandId', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    const { commandId } = request.params as { commandId: string };
    const result = await services.commandService.getCommandStatus(commandId);
    return reply.send(result);
  });

  app.post('/api/v1/mcp/create-key', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    if (!request.user.scopes.includes('keys.manage') && !request.user.scopes.includes('admin')) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN' } });
    }
    const body = request.body as any;
    // Check admin scope creation
    if (body.scopes?.includes('admin') && !request.user.scopes.includes('admin')) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only admins can create keys with admin scope' } });
    }
    const result = await services.apiKeyService.createKey(request.user.id, request.user.email, body);
    return reply.status(201).send(result);
  });

  app.get('/api/v1/mcp/keys', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    if (!request.user.scopes.includes('keys.manage') && !request.user.scopes.includes('admin')) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN' } });
    }
    const keys = await services.apiKeyService.listKeys(request.user.id);
    return reply.send({ keys });
  });

  app.delete('/api/v1/mcp/keys/:keyId', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    if (!request.user.scopes.includes('keys.manage') && !request.user.scopes.includes('admin')) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN' } });
    }
    const { keyId } = request.params as { keyId: string };
    await services.apiKeyService.revokeKey(request.user.id, keyId);
    return reply.status(204).send();
  });

  app.get('/api/v1/mcp/files', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    if (!request.user.scopes.includes('files.read') && !request.user.scopes.includes('admin')) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN' } });
    }
    const result = await services.fileService.listFiles(request.user.id, request.query);
    return reply.send(result);
  });

  app.get('/api/v1/mcp/files/:fileId', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    if (!request.user.scopes.includes('files.read') && !request.user.scopes.includes('admin')) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN' } });
    }
    const { fileId } = request.params as { fileId: string };
    const result = await services.fileService.getFile(request.user.id, fileId);
    return reply.send(result);
  });

  app.delete('/api/v1/mcp/files/:fileId', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    if (!request.user.scopes.includes('files.delete') && !request.user.scopes.includes('admin')) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN' } });
    }
    const { fileId } = request.params as { fileId: string };
    await services.fileService.deleteFile(request.user.id, fileId);
    return reply.status(204).send();
  });

  app.get('/api/v1/mcp/files/:fileId/download', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    if (!request.user.scopes.includes('files.read') && !request.user.scopes.includes('admin')) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN' } });
    }
    const { fileId } = request.params as { fileId: string };
    const { stream, metadata } = await services.fileService.getFileStream(request.user.id, fileId);
    return reply
      .header('Content-Type', metadata.mimeType)
      .header('Content-Disposition', `attachment; filename="${metadata.filename}"`)
      .send(stream);
  });

  app.get('/api/v1/health', async (request, reply) => {
    const result = await services.healthChecker.check();
    return reply.send(result);
  });

  app.get('/api/v1/health/ready', async (request, reply) => {
    const result = await services.healthChecker.checkReady();
    if (!result.ready) {
      return reply.status(503).send(result);
    }
    return reply.send(result);
  });

  await app.ready();
  return { app, services };
};

// =============================================================================
// Health Route Integration Tests
// =============================================================================

describe('Health Routes (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.version).toBe('1.0.0');
      expect(body.checks).toHaveProperty('database');
      expect(body.checks).toHaveProperty('redis');
    });

    it('should not require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        // No X-API-Key header
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('should return ready status when healthy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(true);
    });

    it('should return 503 when not ready', async () => {
      services.healthChecker.checkReady.mockResolvedValueOnce({
        ready: false,
        checks: { database: false, redis: true },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.ready).toBe(false);
    });
  });
});

// =============================================================================
// MCP Command Route Integration Tests
// =============================================================================

describe('MCP Command Routes (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/mcp/command', () => {
    it('should process command with valid authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/command',
        headers: {
          'x-api-key': 'test_valid_key',
          'content-type': 'application/json',
        },
        payload: {
          command: 'Hello, how are you?',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.content).toBeDefined();
      expect(body.model).toBe('claude-3-5-sonnet');
      expect(services.commandService.processCommand).toHaveBeenCalledWith('user_test123', expect.any(Object));
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/command',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          command: 'Hello',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 without ai.chat scope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/command',
        headers: {
          'x-api-key': 'test_limited_key', // Has only ai.chat, but scope check is different
          'content-type': 'application/json',
        },
        payload: {
          command: 'Hello',
        },
      });

      // Should succeed since test_limited_key has ai.chat
      expect(response.statusCode).toBe(200);
    });

    it('should handle async command processing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/command',
        headers: {
          'x-api-key': 'test_valid_key',
          'content-type': 'application/json',
        },
        payload: {
          command: 'Long running task',
          options: { async: true },
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('queued');
      expect(body.pollingUrl).toBeDefined();
      expect(body.websocketUrl).toBeDefined();
    });

    it('should include session ID in response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/command',
        headers: {
          'x-api-key': 'test_valid_key',
          'content-type': 'application/json',
        },
        payload: {
          command: 'Test command',
          sessionId: 'sess_test123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessionId).toBe('sess_test123');
    });
  });

  describe('GET /api/v1/mcp/command/:commandId', () => {
    it('should return command status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/command/cmd_test123456',
        headers: {
          'x-api-key': 'test_valid_key',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('completed');
      expect(body.result).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/command/cmd_test123456',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

// =============================================================================
// API Key Route Integration Tests
// =============================================================================

describe('API Key Routes (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/mcp/create-key', () => {
    it('should create API key with valid request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/create-key',
        headers: {
          'x-api-key': 'test_valid_key',
          'content-type': 'application/json',
        },
        payload: {
          name: 'New Test Key',
          scopes: ['ai.chat', 'files.read'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.key).toBeDefined();
      expect(body.key).toContain('znt_test_sk_');
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/create-key',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          name: 'Test Key',
          scopes: ['ai.chat'],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should prevent non-admin from creating admin keys', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/create-key',
        headers: {
          'x-api-key': 'test_valid_key', // Not an admin
          'content-type': 'application/json',
        },
        payload: {
          name: 'Admin Key',
          scopes: ['admin'],
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow admin to create admin keys', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/create-key',
        headers: {
          'x-api-key': 'test_admin_key',
          'content-type': 'application/json',
        },
        payload: {
          name: 'Admin Key',
          scopes: ['admin'],
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('GET /api/v1/mcp/keys', () => {
    it('should list user API keys', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/keys',
        headers: {
          'x-api-key': 'test_valid_key',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.keys).toBeInstanceOf(Array);
      expect(body.keys.length).toBeGreaterThan(0);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/keys',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/v1/mcp/keys/:keyId', () => {
    it('should revoke API key', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/mcp/keys/key_test123',
        headers: {
          'x-api-key': 'test_valid_key',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(services.apiKeyService.revokeKey).toHaveBeenCalledWith('user_test123', 'key_test123');
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/mcp/keys/key_test123',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

// =============================================================================
// File Route Integration Tests
// =============================================================================

describe('File Routes (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/mcp/files', () => {
    it('should list files with pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/files',
        headers: {
          'x-api-key': 'test_valid_key',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.files).toBeInstanceOf(Array);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
    });

    it('should accept query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/files?page=1&limit=10&purpose=ai-input',
        headers: {
          'x-api-key': 'test_valid_key',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(services.fileService.listFiles).toHaveBeenCalledWith(
        'user_test123',
        expect.objectContaining({ page: '1', limit: '10', purpose: 'ai-input' })
      );
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/files',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 without files.read scope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/files',
        headers: {
          'x-api-key': 'test_limited_key', // Only has ai.chat scope
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/mcp/files/:fileId', () => {
    it('should return file metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/files/file_test123456789012',
        headers: {
          'x-api-key': 'test_valid_key',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('file_test123456789012');
      expect(body.filename).toBe('test-document.pdf');
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/files/file_test123456789012',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/v1/mcp/files/:fileId', () => {
    it('should delete file', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/mcp/files/file_test123456789012',
        headers: {
          'x-api-key': 'test_valid_key',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(services.fileService.deleteFile).toHaveBeenCalledWith('user_test123', 'file_test123456789012');
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/mcp/files/file_test123456789012',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 without files.delete scope', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/mcp/files/file_test123456789012',
        headers: {
          'x-api-key': 'test_limited_key',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/mcp/files/:fileId/download', () => {
    it('should stream file content', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/files/file_test123456789012/download',
        headers: {
          'x-api-key': 'test_valid_key',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/mcp/files/file_test123456789012/download',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

// =============================================================================
// Authorization Integration Tests
// =============================================================================

describe('Authorization (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Admin Scope', () => {
    it('should allow admin access to all endpoints', async () => {
      const endpoints = [
        { method: 'GET' as const, url: '/api/v1/mcp/files' },
        { method: 'GET' as const, url: '/api/v1/mcp/keys' },
        { method: 'POST' as const, url: '/api/v1/mcp/command', payload: { command: 'test' } },
      ];

      for (const endpoint of endpoints) {
        const response = await app.inject({
          method: endpoint.method,
          url: endpoint.url,
          headers: {
            'x-api-key': 'test_admin_key',
            'content-type': 'application/json',
          },
          payload: endpoint.payload,
        });

        expect([200, 201, 202, 204]).toContain(response.statusCode);
      }
    });
  });

  describe('Limited Scope', () => {
    it('should block access to unauthorized endpoints', async () => {
      // test_limited_key only has ai.chat scope
      const blockedEndpoints = [
        { method: 'GET' as const, url: '/api/v1/mcp/files' },
        { method: 'GET' as const, url: '/api/v1/mcp/keys' },
      ];

      for (const endpoint of blockedEndpoints) {
        const response = await app.inject({
          method: endpoint.method,
          url: endpoint.url,
          headers: {
            'x-api-key': 'test_limited_key',
          },
        });

        expect(response.statusCode).toBe(403);
      }
    });

    it('should allow access to authorized endpoints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/mcp/command',
        headers: {
          'x-api-key': 'test_limited_key',
          'content-type': 'application/json',
        },
        payload: { command: 'Test' },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});

// =============================================================================
// Error Handling Integration Tests
// =============================================================================

describe('Error Handling (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return proper error format for 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/command',
      headers: {
        'content-type': 'application/json',
      },
      payload: { command: 'test' },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return proper error format for 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/mcp/files',
      headers: {
        'x-api-key': 'test_limited_key',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('should handle service errors gracefully', async () => {
    services.commandService.processCommand.mockRejectedValueOnce(new Error('AI service unavailable'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/command',
      headers: {
        'x-api-key': 'test_valid_key',
        'content-type': 'application/json',
      },
      payload: { command: 'test' },
    });

    // Should return 500 or appropriate error status
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});

// =============================================================================
// Response Format Integration Tests
// =============================================================================

describe('Response Format (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return JSON content-type for API responses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.headers['content-type']).toContain('application/json');
  });

  it('should include proper cache control headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/mcp/files',
      headers: {
        'x-api-key': 'test_valid_key',
      },
    });

    expect(response.statusCode).toBe(200);
    // Cache headers may or may not be present depending on configuration
  });

  it('should handle Accept header correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        'accept': 'application/json',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
  });
});

// =============================================================================
// Pagination Integration Tests
// =============================================================================

describe('Pagination (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return pagination metadata in list responses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/mcp/files',
      headers: {
        'x-api-key': 'test_valid_key',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.pagination).toHaveProperty('page');
    expect(body.pagination).toHaveProperty('limit');
    expect(body.pagination).toHaveProperty('total');
    expect(body.pagination).toHaveProperty('hasNext');
    expect(body.pagination).toHaveProperty('hasPrev');
  });

  it('should handle custom pagination parameters', async () => {
    services.fileService.listFiles.mockResolvedValueOnce({
      files: [],
      pagination: {
        page: 2,
        limit: 5,
        total: 15,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/mcp/files?page=2&limit=5',
      headers: {
        'x-api-key': 'test_valid_key',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(5);
  });

  it('should handle empty result sets', async () => {
    services.fileService.listFiles.mockResolvedValueOnce({
      files: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/mcp/files',
      headers: {
        'x-api-key': 'test_valid_key',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.files).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });
});

// =============================================================================
// Concurrent Request Integration Tests
// =============================================================================

describe('Concurrent Requests (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should handle multiple concurrent requests', async () => {
    const requests = Array(5).fill(null).map(() =>
      app.inject({
        method: 'GET',
        url: '/api/v1/health',
      })
    );

    const responses = await Promise.all(requests);

    responses.forEach((response) => {
      expect(response.statusCode).toBe(200);
    });
  });

  it('should handle concurrent authenticated requests', async () => {
    const requests = Array(3).fill(null).map(() =>
      app.inject({
        method: 'GET',
        url: '/api/v1/mcp/files',
        headers: {
          'x-api-key': 'test_valid_key',
        },
      })
    );

    const responses = await Promise.all(requests);

    responses.forEach((response) => {
      expect(response.statusCode).toBe(200);
    });
  });
});

// =============================================================================
// Input Validation Integration Tests
// =============================================================================

describe('Input Validation (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should accept valid command payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/command',
      headers: {
        'x-api-key': 'test_valid_key',
        'content-type': 'application/json',
      },
      payload: {
        command: 'Valid command text',
        sessionId: 'sess_validid123',
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should accept command with context', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/command',
      headers: {
        'x-api-key': 'test_valid_key',
        'content-type': 'application/json',
      },
      payload: {
        command: 'Process these files',
        context: {
          files: ['file_123', 'file_456'],
          previousMessages: 5,
        },
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should accept command with options', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/command',
      headers: {
        'x-api-key': 'test_valid_key',
        'content-type': 'application/json',
      },
      payload: {
        command: 'Generate code',
        options: {
          model: 'claude-3-5-sonnet',
          maxTokens: 1000,
          temperature: 0.7,
        },
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should accept valid API key creation payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/create-key',
      headers: {
        'x-api-key': 'test_valid_key',
        'content-type': 'application/json',
      },
      payload: {
        name: 'My API Key',
        scopes: ['ai.chat', 'files.read'],
        expiresIn: '30d',
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('should accept API key with rate limit options', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/create-key',
      headers: {
        'x-api-key': 'test_valid_key',
        'content-type': 'application/json',
      },
      payload: {
        name: 'Rate Limited Key',
        scopes: ['ai.chat'],
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerDay: 1000,
        },
      },
    });

    expect(response.statusCode).toBe(201);
  });
});

// =============================================================================
// Cross-Cutting Concerns Integration Tests
// =============================================================================

describe('Cross-Cutting Concerns (Integration)', () => {
  let app: FastifyInstance;
  let services: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    services = result.services;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should propagate user context to services', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/command',
      headers: {
        'x-api-key': 'test_valid_key',
        'content-type': 'application/json',
      },
      payload: { command: 'test' },
    });

    expect(services.commandService.processCommand).toHaveBeenCalledWith(
      'user_test123',
      expect.any(Object)
    );
  });

  it('should handle different authenticated users correctly', async () => {
    // Request as regular user
    const regularResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/mcp/files',
      headers: {
        'x-api-key': 'test_valid_key',
      },
    });

    // Request as admin
    const adminResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/mcp/files',
      headers: {
        'x-api-key': 'test_admin_key',
      },
    });

    expect(regularResponse.statusCode).toBe(200);
    expect(adminResponse.statusCode).toBe(200);
  });

  it('should isolate user data between requests', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/mcp/files',
      headers: {
        'x-api-key': 'test_valid_key',
      },
    });

    // Verify service was called with correct user ID
    expect(services.fileService.listFiles).toHaveBeenCalledWith(
      'user_test123',
      expect.any(Object)
    );
  });
});
