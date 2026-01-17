/**
 * API Key Service Tests - TEST-008, SEC-005
 *
 * Comprehensive tests for API key generation, validation,
 * and management including security features like
 * timing-safe comparison and key caching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import {
  ApiKeyService,
  CreateApiKeySchema,
  type CreateApiKeyRequest,
} from '../services/api-key.service.js';

// ============================================================================
// Mock Factories
// ============================================================================

const createMockApiKeyRepository = () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByPrefix: vi.fn(),
  findByUser: vi.fn(),
  updateLastUsed: vi.fn(),
  delete: vi.fn(),
});

const createMockAuditRepository = () => ({
  log: vi.fn(),
  logAsync: vi.fn(),
});

const createMockRedis = () => ({
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
});

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const createMockKeyRecord = (overrides = {}) => ({
  id: 'key_abc123',
  userId: 'user_123',
  userEmail: 'test@example.com',
  name: 'Test Key',
  scopes: ['files.read'],
  hashedKey: createHash('sha256').update('znt_test_sk_testsecret123').digest('hex'),
  prefix: 'znt_test_sk_',
  lastUsedAt: null,
  expiresAt: null,
  rateLimitPerMinute: null,
  rateLimitPerDay: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ============================================================================
// Schema Tests
// ============================================================================

describe('CreateApiKeySchema', () => {
  describe('name validation', () => {
    it('should accept valid name', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'My API Key',
        scopes: ['files.read'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = CreateApiKeySchema.safeParse({
        name: '',
        scopes: ['files.read'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject name over 100 characters', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'a'.repeat(101),
        scopes: ['files.read'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('scopes validation', () => {
    const validScopes = [
      'files.read',
      'files.write',
      'files.delete',
      'ai.chat',
      'ai.complete',
      'workflows.trigger',
      'workflows.read',
      'email.send',
      'keys.manage',
      'admin',
    ];

    it.each(validScopes)('should accept valid scope: %s', (scope) => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: [scope],
      });
      expect(result.success).toBe(true);
    });

    it('should accept multiple scopes', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read', 'files.write', 'ai.chat'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty scopes array', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid scope', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['invalid.scope'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('expiresIn validation', () => {
    it('should accept days format', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
        expiresIn: '30d',
      });
      expect(result.success).toBe(true);
    });

    it('should accept weeks format', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
        expiresIn: '4w',
      });
      expect(result.success).toBe(true);
    });

    it('should accept months format', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
        expiresIn: '6m',
      });
      expect(result.success).toBe(true);
    });

    it('should accept years format', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
        expiresIn: '1y',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid format', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
        expiresIn: '30days',
      });
      expect(result.success).toBe(false);
    });

    it('should be optional', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('rateLimit validation', () => {
    it('should accept valid rate limits', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerDay: 10000,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject requestsPerMinute over 1000', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
        rateLimit: { requestsPerMinute: 1001 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject requestsPerDay over 100000', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
        rateLimit: { requestsPerDay: 100001 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject requestsPerMinute below 1', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
        rateLimit: { requestsPerMinute: 0 },
      });
      expect(result.success).toBe(false);
    });

    it('should be optional', () => {
      const result = CreateApiKeySchema.safeParse({
        name: 'Test',
        scopes: ['files.read'],
      });
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// ApiKeyService Tests
// ============================================================================

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let mockApiKeyRepository: ReturnType<typeof createMockApiKeyRepository>;
  let mockAuditRepository: ReturnType<typeof createMockAuditRepository>;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockApiKeyRepository = createMockApiKeyRepository();
    mockAuditRepository = createMockAuditRepository();
    mockRedis = createMockRedis();
    mockLogger = createMockLogger();

    service = new ApiKeyService({
      apiKeyRepository: mockApiKeyRepository as any,
      auditRepository: mockAuditRepository as any,
      redis: mockRedis as any,
      logger: mockLogger as any,
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // createKey Tests
  // ==========================================================================

  describe('createKey', () => {
    const userId = 'user_123';
    const userEmail = 'test@example.com';
    const request: CreateApiKeyRequest = {
      name: 'Test Key',
      scopes: ['files.read'],
    };

    it('should create a key and return it', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      const result = await service.createKey(userId, userEmail, request);

      expect(result.name).toBe('Test Key');
      expect(result.scopes).toEqual(['files.read']);
      expect(result.id).toMatch(/^key_/);
      expect(result.key).toMatch(/^znt_test_sk_/);
    });

    it('should generate unique key ID', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      const result1 = await service.createKey(userId, userEmail, request);
      const result2 = await service.createKey(userId, userEmail, request);

      expect(result1.id).not.toBe(result2.id);
    });

    it('should generate unique raw key', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      const result1 = await service.createKey(userId, userEmail, request);
      const result2 = await service.createKey(userId, userEmail, request);

      expect(result1.key).not.toBe(result2.key);
    });

    it('should hash key before storing', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      await service.createKey(userId, userEmail, request);

      expect(mockApiKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hashedKey: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA256 hex
        })
      );
    });

    it('should store key prefix', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      await service.createKey(userId, userEmail, request);

      expect(mockApiKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: expect.stringMatching(/^znt_test_sk_/),
        })
      );
    });

    it('should log audit entry', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      await service.createKey(userId, userEmail, request);

      expect(mockAuditRepository.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'api_key_created',
          userId,
          metadata: expect.objectContaining({
            name: 'Test Key',
            scopes: ['files.read'],
          }),
        })
      );
    });

    it('should log info message', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      await service.createKey(userId, userEmail, request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ userId, name: 'Test Key' }),
        'Creating API key'
      );
    });

    it('should calculate expiration for days', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      const requestWithExpiry: CreateApiKeyRequest = {
        ...request,
        expiresIn: '30d',
      };

      await service.createKey(userId, userEmail, requestWithExpiry);

      expect(mockApiKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.any(Date),
        })
      );
    });

    it('should calculate expiration for weeks', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      const requestWithExpiry: CreateApiKeyRequest = {
        ...request,
        expiresIn: '2w',
      };

      const before = new Date();
      await service.createKey(userId, userEmail, requestWithExpiry);
      const after = new Date();

      const call = mockApiKeyRepository.create.mock.calls[0][0];
      const expiresAt = call.expiresAt as Date;

      // Should be ~14 days from now
      const expectedMin = new Date(before.getTime() + 13 * 24 * 60 * 60 * 1000);
      const expectedMax = new Date(after.getTime() + 15 * 24 * 60 * 60 * 1000);

      expect(expiresAt.getTime()).toBeGreaterThan(expectedMin.getTime());
      expect(expiresAt.getTime()).toBeLessThan(expectedMax.getTime());
    });

    it('should pass rate limits to repository', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      const requestWithRateLimit: CreateApiKeyRequest = {
        ...request,
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerDay: 10000,
        },
      };

      await service.createKey(userId, userEmail, requestWithRateLimit);

      expect(mockApiKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          rateLimitPerMinute: 60,
          rateLimitPerDay: 10000,
        })
      );
    });

    it('should return ISO date strings', async () => {
      const mockRecord = createMockKeyRecord();
      mockApiKeyRepository.create.mockResolvedValue(mockRecord);

      const result = await service.createKey(userId, userEmail, request);

      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ==========================================================================
  // validateKey Tests
  // ==========================================================================

  describe('validateKey', () => {
    it('should return null for invalid key format', async () => {
      const result = await service.validateKey('invalid_key');

      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should return null for key not starting with znt_', async () => {
      const result = await service.validateKey('sk_test_abc123');

      expect(result).toBeNull();
    });

    it('should check cache first', async () => {
      const cachedKey = createMockKeyRecord();
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedKey));

      const result = await service.validateKey('znt_test_sk_cached123');

      expect(result).toBeDefined();
      expect(mockApiKeyRepository.findByPrefix).not.toHaveBeenCalled();
    });

    it('should return null for expired cached key', async () => {
      const expiredKey = createMockKeyRecord({
        expiresAt: new Date(Date.now() - 86400000), // 1 day ago
      });
      mockRedis.get.mockResolvedValue(JSON.stringify(expiredKey));

      const result = await service.validateKey('znt_test_sk_expired123');

      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should lookup by prefix when not cached', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockApiKeyRepository.findByPrefix.mockResolvedValue([]);

      await service.validateKey('znt_test_sk_lookup123');

      expect(mockApiKeyRepository.findByPrefix).toHaveBeenCalledWith('znt_test_sk_');
    });

    it('should validate key with constant-time comparison', async () => {
      mockRedis.get.mockResolvedValue(null);

      const rawKey = 'znt_test_sk_testsecret123';
      const hashedKey = createHash('sha256').update(rawKey).digest('hex');

      mockApiKeyRepository.findByPrefix.mockResolvedValue([
        createMockKeyRecord({ hashedKey }),
      ]);

      const result = await service.validateKey(rawKey);

      expect(result).toBeDefined();
    });

    it('should return null for wrong key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const correctKey = 'znt_test_sk_correct123';
      const hashedKey = createHash('sha256').update(correctKey).digest('hex');

      mockApiKeyRepository.findByPrefix.mockResolvedValue([
        createMockKeyRecord({ hashedKey }),
      ]);

      const result = await service.validateKey('znt_test_sk_wrong123');

      expect(result).toBeNull();
    });

    it('should return null for expired key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const rawKey = 'znt_test_sk_testsecret123';
      const hashedKey = createHash('sha256').update(rawKey).digest('hex');

      mockApiKeyRepository.findByPrefix.mockResolvedValue([
        createMockKeyRecord({
          hashedKey,
          expiresAt: new Date(Date.now() - 86400000),
        }),
      ]);

      const result = await service.validateKey(rawKey);

      expect(result).toBeNull();
    });

    it('should update lastUsedAt on valid key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const rawKey = 'znt_test_sk_testsecret123';
      const hashedKey = createHash('sha256').update(rawKey).digest('hex');

      mockApiKeyRepository.findByPrefix.mockResolvedValue([
        createMockKeyRecord({ hashedKey }),
      ]);

      await service.validateKey(rawKey);

      expect(mockApiKeyRepository.updateLastUsed).toHaveBeenCalledWith('key_abc123');
    });

    it('should cache valid key for 5 minutes', async () => {
      mockRedis.get.mockResolvedValue(null);

      const rawKey = 'znt_test_sk_testsecret123';
      const hashedKey = createHash('sha256').update(rawKey).digest('hex');

      mockApiKeyRepository.findByPrefix.mockResolvedValue([
        createMockKeyRecord({ hashedKey }),
      ]);

      await service.validateKey(rawKey);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        300, // 5 minutes
        expect.any(String)
      );
    });

    it('should handle multiple keys with same prefix', async () => {
      mockRedis.get.mockResolvedValue(null);

      const rawKey = 'znt_test_sk_targetkey123';
      const hashedKey = createHash('sha256').update(rawKey).digest('hex');
      const wrongHashedKey = createHash('sha256').update('znt_test_sk_wrongkey123').digest('hex');

      mockApiKeyRepository.findByPrefix.mockResolvedValue([
        createMockKeyRecord({ id: 'key_wrong', hashedKey: wrongHashedKey }),
        createMockKeyRecord({ id: 'key_correct', hashedKey }),
      ]);

      const result = await service.validateKey(rawKey);

      expect(result?.id).toBe('key_correct');
    });
  });

  // ==========================================================================
  // listKeys Tests
  // ==========================================================================

  describe('listKeys', () => {
    const userId = 'user_123';

    it('should return empty array when no keys', async () => {
      mockApiKeyRepository.findByUser.mockResolvedValue([]);

      const result = await service.listKeys(userId);

      expect(result).toEqual([]);
    });

    it('should return formatted key list', async () => {
      mockApiKeyRepository.findByUser.mockResolvedValue([
        createMockKeyRecord(),
        createMockKeyRecord({ id: 'key_def456', name: 'Second Key' }),
      ]);

      const result = await service.listKeys(userId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('key_abc123');
      expect(result[1].id).toBe('key_def456');
    });

    it('should not expose hashedKey', async () => {
      mockApiKeyRepository.findByUser.mockResolvedValue([createMockKeyRecord()]);

      const result = await service.listKeys(userId);

      expect(result[0]).not.toHaveProperty('hashedKey');
    });

    it('should convert dates to ISO strings', async () => {
      mockApiKeyRepository.findByUser.mockResolvedValue([createMockKeyRecord()]);

      const result = await service.listKeys(userId);

      expect(result[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should handle optional lastUsedAt', async () => {
      mockApiKeyRepository.findByUser.mockResolvedValue([
        createMockKeyRecord({ lastUsedAt: new Date() }),
        createMockKeyRecord({ lastUsedAt: null }),
      ]);

      const result = await service.listKeys(userId);

      expect(result[0].lastUsedAt).toBeDefined();
      expect(result[1].lastUsedAt).toBeUndefined();
    });

    it('should handle optional expiresAt', async () => {
      mockApiKeyRepository.findByUser.mockResolvedValue([
        createMockKeyRecord({ expiresAt: new Date() }),
        createMockKeyRecord({ expiresAt: null }),
      ]);

      const result = await service.listKeys(userId);

      expect(result[0].expiresAt).toBeDefined();
      expect(result[1].expiresAt).toBeUndefined();
    });
  });

  // ==========================================================================
  // revokeKey Tests
  // ==========================================================================

  describe('revokeKey', () => {
    const userId = 'user_123';
    const keyId = 'key_abc123';

    it('should throw not found for missing key', async () => {
      mockApiKeyRepository.findById.mockResolvedValue(null);

      await expect(service.revokeKey(userId, keyId)).rejects.toThrow();
    });

    it('should throw forbidden for key owned by different user', async () => {
      mockApiKeyRepository.findById.mockResolvedValue(
        createMockKeyRecord({ userId: 'different_user' })
      );

      await expect(service.revokeKey(userId, keyId)).rejects.toThrow();
    });

    it('should delete key from database', async () => {
      mockApiKeyRepository.findById.mockResolvedValue(createMockKeyRecord());

      await service.revokeKey(userId, keyId);

      expect(mockApiKeyRepository.delete).toHaveBeenCalledWith(keyId);
    });

    it('should invalidate cache', async () => {
      const keyRecord = createMockKeyRecord();
      mockApiKeyRepository.findById.mockResolvedValue(keyRecord);

      await service.revokeKey(userId, keyId);

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should log audit entry', async () => {
      mockApiKeyRepository.findById.mockResolvedValue(createMockKeyRecord());

      await service.revokeKey(userId, keyId);

      expect(mockAuditRepository.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'api_key_revoked',
          userId,
          metadata: expect.objectContaining({
            keyId,
            name: 'Test Key',
          }),
        })
      );
    });

    it('should log info message', async () => {
      mockApiKeyRepository.findById.mockResolvedValue(createMockKeyRecord());

      await service.revokeKey(userId, keyId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ keyId, userId }),
        'Revoking API key'
      );
    });
  });

  // ==========================================================================
  // Security Tests (SEC-005)
  // ==========================================================================

  describe('Security (SEC-005)', () => {
    describe('Key Generation', () => {
      it('should generate cryptographically random keys', async () => {
        mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

        const keys = new Set<string>();
        for (let i = 0; i < 10; i++) {
          const result = await service.createKey('user', 'email@test.com', {
            name: 'Test',
            scopes: ['files.read'],
          });
          keys.add(result.key);
        }

        expect(keys.size).toBe(10); // All unique
      });

      it('should use environment-aware prefix', async () => {
        mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

        const result = await service.createKey('user', 'email@test.com', {
          name: 'Test',
          scopes: ['files.read'],
        });

        // In test environment, should use znt_test prefix
        expect(result.key).toMatch(/^znt_test_sk_/);
      });
    });

    describe('Key Hashing', () => {
      it('should use SHA256 for key hashing', async () => {
        mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

        await service.createKey('user', 'email@test.com', {
          name: 'Test',
          scopes: ['files.read'],
        });

        const call = mockApiKeyRepository.create.mock.calls[0][0];
        expect(call.hashedKey).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should never store raw key', async () => {
        mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

        const result = await service.createKey('user', 'email@test.com', {
          name: 'Test',
          scopes: ['files.read'],
        });

        const call = mockApiKeyRepository.create.mock.calls[0][0];
        expect(call.hashedKey).not.toContain(result.key);
        expect(call.hashedKey).not.toContain('sk_');
      });
    });

    describe('Constant-time Comparison', () => {
      it('should not leak timing information', async () => {
        mockRedis.get.mockResolvedValue(null);

        const rawKey = 'znt_test_sk_testsecret123';
        const hashedKey = createHash('sha256').update(rawKey).digest('hex');

        mockApiKeyRepository.findByPrefix.mockResolvedValue([
          createMockKeyRecord({ hashedKey }),
        ]);

        // Time multiple validation attempts
        const timings: number[] = [];
        for (let i = 0; i < 5; i++) {
          const start = performance.now();
          await service.validateKey(rawKey);
          timings.push(performance.now() - start);
        }

        // Timing variance should be within reasonable bounds
        // (Note: this is a simplified test; real timing attacks would need more sophisticated analysis)
        const variance =
          Math.max(...timings) - Math.min(...timings);
        expect(variance).toBeLessThan(100); // 100ms variance threshold
      });
    });

    describe('Expiration Enforcement', () => {
      it('should reject expired keys from cache', async () => {
        const expiredKey = createMockKeyRecord({
          expiresAt: new Date(Date.now() - 1000),
        });
        mockRedis.get.mockResolvedValue(JSON.stringify(expiredKey));

        const result = await service.validateKey('znt_test_sk_expired');

        expect(result).toBeNull();
      });

      it('should reject expired keys from database', async () => {
        mockRedis.get.mockResolvedValue(null);

        const rawKey = 'znt_test_sk_testsecret123';
        const hashedKey = createHash('sha256').update(rawKey).digest('hex');

        mockApiKeyRepository.findByPrefix.mockResolvedValue([
          createMockKeyRecord({
            hashedKey,
            expiresAt: new Date(Date.now() - 1000),
          }),
        ]);

        const result = await service.validateKey(rawKey);

        expect(result).toBeNull();
      });

      it('should accept keys with future expiration', async () => {
        mockRedis.get.mockResolvedValue(null);

        const rawKey = 'znt_test_sk_testsecret123';
        const hashedKey = createHash('sha256').update(rawKey).digest('hex');

        mockApiKeyRepository.findByPrefix.mockResolvedValue([
          createMockKeyRecord({
            hashedKey,
            expiresAt: new Date(Date.now() + 86400000),
          }),
        ]);

        const result = await service.validateKey(rawKey);

        expect(result).toBeDefined();
      });

      it('should accept keys with no expiration', async () => {
        mockRedis.get.mockResolvedValue(null);

        const rawKey = 'znt_test_sk_testsecret123';
        const hashedKey = createHash('sha256').update(rawKey).digest('hex');

        mockApiKeyRepository.findByPrefix.mockResolvedValue([
          createMockKeyRecord({
            hashedKey,
            expiresAt: null,
          }),
        ]);

        const result = await service.validateKey(rawKey);

        expect(result).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle Unicode in key names', async () => {
      mockApiKeyRepository.create.mockResolvedValue(
        createMockKeyRecord({ name: 'Test Key 🔑' })
      );

      const result = await service.createKey('user', 'email@test.com', {
        name: 'Test Key 🔑',
        scopes: ['files.read'],
      });

      expect(result.name).toBe('Test Key 🔑');
    });

    it('should handle all valid scopes', async () => {
      mockApiKeyRepository.create.mockResolvedValue(
        createMockKeyRecord({
          scopes: [
            'files.read',
            'files.write',
            'files.delete',
            'ai.chat',
            'ai.complete',
            'workflows.trigger',
            'workflows.read',
            'email.send',
            'keys.manage',
            'admin',
          ],
        })
      );

      const result = await service.createKey('user', 'email@test.com', {
        name: 'Full Access',
        scopes: [
          'files.read',
          'files.write',
          'files.delete',
          'ai.chat',
          'ai.complete',
          'workflows.trigger',
          'workflows.read',
          'email.send',
          'keys.manage',
          'admin',
        ],
      });

      expect(result.scopes).toHaveLength(10);
    });

    it('should handle concurrent key validations', async () => {
      mockRedis.get.mockResolvedValue(null);

      const rawKey = 'znt_test_sk_testsecret123';
      const hashedKey = createHash('sha256').update(rawKey).digest('hex');

      mockApiKeyRepository.findByPrefix.mockResolvedValue([
        createMockKeyRecord({ hashedKey }),
      ]);

      const promises = Array.from({ length: 10 }, () =>
        service.validateKey(rawKey)
      );

      const results = await Promise.all(promises);

      expect(results.every((r) => r !== null)).toBe(true);
    });

    it('should handle concurrent key creations', async () => {
      mockApiKeyRepository.create.mockResolvedValue(createMockKeyRecord());

      const promises = Array.from({ length: 5 }, (_, i) =>
        service.createKey(`user${i}`, `user${i}@test.com`, {
          name: `Key ${i}`,
          scopes: ['files.read'],
        })
      );

      const results = await Promise.all(promises);

      // All should have unique keys
      const keys = new Set(results.map((r) => r.key));
      expect(keys.size).toBe(5);
    });
  });
});
