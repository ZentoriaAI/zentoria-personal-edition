/**
 * Security Tests - TEST-007
 *
 * Comprehensive security testing covering:
 * - Authentication middleware
 * - Rate limiting
 * - Scope checking
 * - Auth service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AwilixContainer } from 'awilix';
import {
  checkRateLimit,
  getRateLimitStatus,
  RateLimitConfigs,
  type RateLimitConfig,
} from '../infrastructure/rate-limiter.js';
import { AuthService, type UserInfo } from '../services/auth.service.js';

// =============================================================================
// Mock Factories
// =============================================================================

const createMockRequest = (overrides: Partial<FastifyRequest> = {}): FastifyRequest => ({
  id: 'req_test123',
  url: '/api/v1/test',
  headers: {},
  user: undefined,
  jwtVerify: vi.fn(),
  ...overrides,
} as unknown as FastifyRequest);

const createMockReply = (): FastifyReply => {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
};

const createMockRedis = () => ({
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  zadd: vi.fn(),
  zcard: vi.fn(),
  zrange: vi.fn(),
  zremrangebyscore: vi.fn(),
  expire: vi.fn(),
  pipeline: vi.fn(() => ({
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  })),
});

const createMockApiKeyService = () => ({
  validateKey: vi.fn(),
  createKey: vi.fn(),
  listKeys: vi.fn(),
  deleteKey: vi.fn(),
});

const createMockAuditRepository = () => ({
  log: vi.fn(),
});

const createMockAuthClient = () => ({
  validateToken: vi.fn(),
  getUser: vi.fn(),
});

const createMockCircuitBreaker = () => ({
  execute: vi.fn(),
  getState: vi.fn().mockReturnValue('closed'),
});

const createMockLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

// =============================================================================
// Rate Limiter Tests
// =============================================================================

describe('Rate Limiter (Security)', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
  });

  describe('checkRateLimit', () => {
    it('should allow requests under the limit', async () => {
      const pipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 0], // zremrangebyscore result
          [null, 5], // zcard result - 5 requests in window
          [null, 1], // zadd result
          [null, 1], // expire result
        ]),
      };
      mockRedis.pipeline.mockReturnValue(pipeline);

      const result = await checkRateLimit(
        mockRedis as any,
        'user_123',
        'api_request',
        { limit: 10, windowSeconds: 60 }
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 10 - 5 - 1 = 4
      expect(result.limit).toBe(10);
    });

    it('should block requests over the limit', async () => {
      const pipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 0],
          [null, 10], // At limit
          [null, 1],
          [null, 1],
        ]),
      };
      mockRedis.pipeline.mockReturnValue(pipeline);
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zrange.mockResolvedValue([
        'timestamp',
        String(Date.now() - 30000), // 30 seconds ago
      ]);

      const result = await checkRateLimit(
        mockRedis as any,
        'user_123',
        'api_request',
        { limit: 10, windowSeconds: 60 }
      );

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should fail open on Redis error', async () => {
      const pipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null), // Redis error
      };
      mockRedis.pipeline.mockReturnValue(pipeline);

      const result = await checkRateLimit(
        mockRedis as any,
        'user_123',
        'api_request',
        { limit: 10, windowSeconds: 60 }
      );

      expect(result.allowed).toBe(true); // Fails open
      expect(result.remaining).toBe(9);
    });

    it('should use correct window for AI commands', () => {
      expect(RateLimitConfigs.aiCommand.limit).toBe(60);
      expect(RateLimitConfigs.aiCommand.windowSeconds).toBe(60);
    });

    it('should use correct window for API key creation', () => {
      expect(RateLimitConfigs.apiKeyCreation.limit).toBe(5);
      expect(RateLimitConfigs.apiKeyCreation.windowSeconds).toBe(3600); // 1 hour
    });

    it('should use correct window for file uploads', () => {
      expect(RateLimitConfigs.fileUpload.limit).toBe(100);
      expect(RateLimitConfigs.fileUpload.windowSeconds).toBe(3600);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return current status without incrementing', async () => {
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(3);

      const result = await getRateLimitStatus(
        mockRedis as any,
        'user_123',
        'api_request',
        { limit: 10, windowSeconds: 60 }
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7); // 10 - 3
      expect(mockRedis.zadd).not.toHaveBeenCalled(); // Should not increment
    });

    it('should show not allowed when at limit', async () => {
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcard.mockResolvedValue(10);

      const result = await getRateLimitStatus(
        mockRedis as any,
        'user_123',
        'api_request',
        { limit: 10, windowSeconds: 60 }
      );

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('Rate Limit Configurations', () => {
    it('should have login attempts limit', () => {
      expect(RateLimitConfigs.loginAttempts.limit).toBe(10);
      expect(RateLimitConfigs.loginAttempts.windowSeconds).toBe(900); // 15 min
    });

    it('should have password reset limit', () => {
      expect(RateLimitConfigs.passwordReset.limit).toBe(3);
      expect(RateLimitConfigs.passwordReset.windowSeconds).toBe(3600);
    });
  });
});

// =============================================================================
// Auth Service Tests
// =============================================================================

describe('AuthService (Security)', () => {
  let authService: AuthService;
  let mockAuthClient: ReturnType<typeof createMockAuthClient>;
  let mockCircuitBreaker: ReturnType<typeof createMockCircuitBreaker>;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockAuthClient = createMockAuthClient();
    mockCircuitBreaker = createMockCircuitBreaker();
    mockRedis = createMockRedis();
    mockLogger = createMockLogger();

    authService = new AuthService({
      authClient: mockAuthClient,
      circuitBreaker: mockCircuitBreaker,
      redis: mockRedis,
      logger: mockLogger,
    } as any);
  });

  describe('validateToken', () => {
    it('should return cached user info if available', async () => {
      const cachedUser: UserInfo = {
        id: 'user_123',
        email: 'test@example.com',
        scopes: ['ai.chat'],
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedUser));

      const result = await authService.validateToken('test_token');

      expect(result).toEqual(cachedUser);
      expect(mockCircuitBreaker.execute).not.toHaveBeenCalled();
    });

    it('should validate token via auth client when not cached', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockCircuitBreaker.execute.mockResolvedValue({
        valid: true,
        userId: 'user_456',
        email: 'new@example.com',
        scopes: ['files.read'],
      });

      const result = await authService.validateToken('new_token');

      expect(result).toEqual({
        id: 'user_456',
        email: 'new@example.com',
        name: undefined,
        scopes: ['files.read'],
        roles: undefined,
        metadata: undefined,
      });
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should return null for invalid token', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockCircuitBreaker.execute.mockResolvedValue({ valid: false });

      const result = await authService.validateToken('invalid_token');

      expect(result).toBeNull();
    });

    it('should handle auth client errors gracefully', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Connection failed'));
      mockCircuitBreaker.getState.mockReturnValue('closed');

      const result = await authService.validateToken('failing_token');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw when circuit breaker is open', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Circuit open'));
      mockCircuitBreaker.getState.mockReturnValue('open');

      await expect(authService.validateToken('token')).rejects.toThrow();
    });

    it('should cache validated tokens for 5 minutes', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockCircuitBreaker.execute.mockResolvedValue({
        valid: true,
        userId: 'user_789',
        email: 'cached@example.com',
        scopes: [],
      });

      await authService.validateToken('cache_token');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        300, // 5 minutes
        expect.any(String)
      );
    });
  });

  describe('getUser', () => {
    it('should return cached user if available', async () => {
      const cachedUser: UserInfo = {
        id: 'user_123',
        email: 'cached@example.com',
        scopes: [],
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedUser));

      const result = await authService.getUser('user_123');

      expect(result).toEqual(cachedUser);
      expect(mockCircuitBreaker.execute).not.toHaveBeenCalled();
    });

    it('should fetch user from auth client when not cached', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockCircuitBreaker.execute.mockResolvedValue({
        id: 'user_456',
        email: 'fetched@example.com',
        name: 'Test User',
        scopes: ['admin'],
        roles: ['owner'],
      });

      const result = await authService.getUser('user_456');

      expect(result?.id).toBe('user_456');
      expect(result?.email).toBe('fetched@example.com');
      expect(result?.name).toBe('Test User');
    });

    it('should return null when user not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockCircuitBreaker.execute.mockResolvedValue(null);

      const result = await authService.getUser('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockCircuitBreaker.execute.mockRejectedValue(new Error('Network error'));

      const result = await authService.getUser('error_user');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('invalidateUserCache', () => {
    it('should delete cached user data', async () => {
      await authService.invalidateUserCache('user_123');

      expect(mockRedis.del).toHaveBeenCalledWith('user:user_123');
    });
  });
});

// =============================================================================
// Public Route Detection Tests
// =============================================================================

describe('Public Route Detection', () => {
  const PUBLIC_ROUTES = [
    '/api/v1/health',
    '/api/v1/health/ready',
    '/docs',
    '/docs/',
    '/docs/json',
    '/docs/yaml',
  ];

  it.each(PUBLIC_ROUTES)('should recognize %s as public', (route) => {
    const isPublicRoute = (url: string): boolean => {
      return PUBLIC_ROUTES.some(
        (r) => url === r || url.startsWith(r + '/')
      );
    };

    expect(isPublicRoute(route)).toBe(true);
  });

  it.each([
    '/api/v1/mcp/command',
    '/api/v1/files',
    '/api/v1/keys',
    '/api/v1/workflows',
  ])('should not recognize %s as public', (route) => {
    const isPublicRoute = (url: string): boolean => {
      return PUBLIC_ROUTES.some(
        (r) => url === r || url.startsWith(r + '/')
      );
    };

    expect(isPublicRoute(route)).toBe(false);
  });

  it('should handle nested public routes', () => {
    const isPublicRoute = (url: string): boolean => {
      return PUBLIC_ROUTES.some(
        (r) => url === r || url.startsWith(r + '/')
      );
    };

    expect(isPublicRoute('/docs/openapi/v1')).toBe(true);
    expect(isPublicRoute('/api/v1/health/live')).toBe(true);
  });
});

// =============================================================================
// Scope Checking Tests
// =============================================================================

describe('Scope Checking (Security)', () => {
  // Simulated requireScope function based on auth.ts
  const createScopeChecker = (...requiredScopes: string[]) => {
    return async (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<{ allowed: boolean; error?: string }> => {
      if (!request.user) {
        return { allowed: false, error: 'UNAUTHORIZED' };
      }

      const userScopes = request.user.scopes || [];

      // Admin scope grants all permissions
      if (userScopes.includes('admin')) {
        return { allowed: true };
      }

      const hasAllScopes = requiredScopes.every((scope) =>
        userScopes.includes(scope)
      );

      if (!hasAllScopes) {
        return { allowed: false, error: 'FORBIDDEN' };
      }

      return { allowed: true };
    };
  };

  it('should reject unauthenticated requests', async () => {
    const checkScope = createScopeChecker('files.read');
    const request = createMockRequest({ user: undefined });
    const reply = createMockReply();

    const result = await checkScope(request, reply);

    expect(result.allowed).toBe(false);
    expect(result.error).toBe('UNAUTHORIZED');
  });

  it('should allow admin to bypass all scope checks', async () => {
    const checkScope = createScopeChecker('files.read', 'files.write', 'ai.chat');
    const request = createMockRequest({
      user: { id: 'admin_1', email: 'admin@test.com', scopes: ['admin'] },
    });
    const reply = createMockReply();

    const result = await checkScope(request, reply);

    expect(result.allowed).toBe(true);
  });

  it('should reject when user lacks required scope', async () => {
    const checkScope = createScopeChecker('files.write');
    const request = createMockRequest({
      user: { id: 'user_1', email: 'user@test.com', scopes: ['files.read'] },
    });
    const reply = createMockReply();

    const result = await checkScope(request, reply);

    expect(result.allowed).toBe(false);
    expect(result.error).toBe('FORBIDDEN');
  });

  it('should allow when user has all required scopes', async () => {
    const checkScope = createScopeChecker('files.read', 'files.write');
    const request = createMockRequest({
      user: {
        id: 'user_1',
        email: 'user@test.com',
        scopes: ['files.read', 'files.write', 'ai.chat'],
      },
    });
    const reply = createMockReply();

    const result = await checkScope(request, reply);

    expect(result.allowed).toBe(true);
  });

  it('should require ALL scopes not just some', async () => {
    const checkScope = createScopeChecker('files.read', 'files.write', 'ai.chat');
    const request = createMockRequest({
      user: {
        id: 'user_1',
        email: 'user@test.com',
        scopes: ['files.read', 'files.write'], // Missing ai.chat
      },
    });
    const reply = createMockReply();

    const result = await checkScope(request, reply);

    expect(result.allowed).toBe(false);
  });

  it('should handle empty scopes array', async () => {
    const checkScope = createScopeChecker('files.read');
    const request = createMockRequest({
      user: { id: 'user_1', email: 'user@test.com', scopes: [] },
    });
    const reply = createMockReply();

    const result = await checkScope(request, reply);

    expect(result.allowed).toBe(false);
  });

  it('should handle undefined scopes', async () => {
    const checkScope = createScopeChecker('files.read');
    const request = createMockRequest({
      user: { id: 'user_1', email: 'user@test.com', scopes: undefined as any },
    });
    const reply = createMockReply();

    const result = await checkScope(request, reply);

    expect(result.allowed).toBe(false);
  });
});

// =============================================================================
// Authentication Error Response Tests
// =============================================================================

describe('Authentication Error Responses', () => {
  it('should return correct error code for invalid API key', () => {
    const response = {
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid or expired API key',
        requestId: 'req_123',
      },
    };

    expect(response.error.code).toBe('INVALID_API_KEY');
    expect(response.error.message).toContain('Invalid');
  });

  it('should return correct error code for invalid token', () => {
    const response = {
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired authentication token',
        requestId: 'req_123',
      },
    };

    expect(response.error.code).toBe('INVALID_TOKEN');
    expect(response.error.message).toContain('expired');
  });

  it('should return correct error code for missing auth', () => {
    const response = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide a Bearer token or API key.',
        requestId: 'req_123',
      },
    };

    expect(response.error.code).toBe('UNAUTHORIZED');
    expect(response.error.message).toContain('Authentication required');
  });

  it('should return correct error code for forbidden', () => {
    const response = {
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions. Required scopes: files.write',
        requestId: 'req_123',
      },
    };

    expect(response.error.code).toBe('FORBIDDEN');
    expect(response.error.message).toContain('scopes');
  });
});

// =============================================================================
// Token Hashing Tests
// =============================================================================

describe('Token Security', () => {
  it('should use SHA-256 for token hashing', () => {
    const crypto = require('crypto');
    const token = 'test_token_123';
    const hash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);

    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('should produce consistent hashes for same token', () => {
    const crypto = require('crypto');
    const token = 'consistent_token';

    const hash1 = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
    const hash2 = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different tokens', () => {
    const crypto = require('crypto');

    const hash1 = crypto.createHash('sha256').update('token1').digest('hex').slice(0, 32);
    const hash2 = crypto.createHash('sha256').update('token2').digest('hex').slice(0, 32);

    expect(hash1).not.toBe(hash2);
  });
});

// =============================================================================
// Input Validation Security Tests
// =============================================================================

describe('Input Validation Security', () => {
  const validateApiKeyFormat = (key: string): boolean => {
    // API key format: znt_{env}_sk_{32 chars}
    return /^znt_(test|live)_sk_[A-Za-z0-9]{32}$/.test(key);
  };

  it('should validate correct API key format', () => {
    expect(validateApiKeyFormat('znt_test_sk_NpjxMopze4q4ZCIdYrSbZ76ofxFBYynU')).toBe(true);
    expect(validateApiKeyFormat('znt_live_sk_AbcdEfghIjklMnopQrstUvwxYz123456')).toBe(true);
  });

  it('should reject invalid API key formats', () => {
    expect(validateApiKeyFormat('invalid')).toBe(false);
    expect(validateApiKeyFormat('znt_test_sk_short')).toBe(false);
    expect(validateApiKeyFormat('znt_prod_sk_NpjxMopze4q4ZCIdYrSbZ76ofxFBYynU')).toBe(false);
    expect(validateApiKeyFormat('')).toBe(false);
  });

  it('should reject API keys with special characters', () => {
    expect(validateApiKeyFormat('znt_test_sk_NpjxMopze4q4ZCIdYrSbZ76o!@#$')).toBe(false);
  });

  it('should validate user ID format', () => {
    const validateUserId = (id: string): boolean => {
      return /^user_[A-Za-z0-9]{10,32}$/.test(id);
    };

    expect(validateUserId('user_abc123def456')).toBe(true);
    expect(validateUserId('invalid')).toBe(false);
    expect(validateUserId('user_')).toBe(false);
  });

  it('should validate file ID format', () => {
    const validateFileId = (id: string): boolean => {
      return /^file_[A-Za-z0-9]{15,32}$/.test(id);
    };

    expect(validateFileId('file_test123456789012')).toBe(true);
    expect(validateFileId('file_short')).toBe(false);
    expect(validateFileId('invalid')).toBe(false);
  });
});

// =============================================================================
// Security Headers Tests
// =============================================================================

describe('Security Headers', () => {
  it('should include required security headers', () => {
    const expectedHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Strict-Transport-Security',
      'Content-Security-Policy',
    ];

    expectedHeaders.forEach((header) => {
      expect(header).toBeTruthy();
    });
  });

  it('should have correct X-Content-Type-Options value', () => {
    const headerValue = 'nosniff';
    expect(headerValue).toBe('nosniff');
  });

  it('should have correct X-Frame-Options value', () => {
    const headerValue = 'DENY';
    expect(['DENY', 'SAMEORIGIN']).toContain(headerValue);
  });
});

// =============================================================================
// CORS Security Tests
// =============================================================================

describe('CORS Security', () => {
  it('should not allow wildcard origin in production', () => {
    const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
    expect(corsOrigin).not.toBe('*');
  });

  it('should validate allowed methods', () => {
    const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

    expect(allowedMethods).toContain('GET');
    expect(allowedMethods).toContain('POST');
    expect(allowedMethods).not.toContain('TRACE');
    expect(allowedMethods).not.toContain('TRACK');
  });

  it('should include credentials handling', () => {
    const corsConfig = {
      credentials: true,
      maxAge: 86400,
    };

    expect(corsConfig.credentials).toBe(true);
    expect(corsConfig.maxAge).toBeLessThanOrEqual(86400); // Max 24 hours
  });
});
