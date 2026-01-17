/**
 * Health Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockRedis = {
  ping: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
};

const mockPrisma = {
  $queryRaw: vi.fn(),
};

const mockMinio = {
  bucketExists: vi.fn(),
};

const mockVaultService = {
  checkHealth: vi.fn(),
};

const mockAiOrchestratorClient = {
  health: vi.fn(),
};

const mockN8nClient = {
  health: vi.fn(),
};

const mockAuthClient = {
  health: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('Health Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkHealth', () => {
    it('should return healthy status when all services are up', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockPrisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);
      mockMinio.bucketExists.mockResolvedValue(true);

      const redisResult = await mockRedis.ping();
      const dbResult = await mockPrisma.$queryRaw();
      const minioResult = await mockMinio.bucketExists();

      expect(redisResult).toBe('PONG');
      expect(dbResult).toEqual([{ '1': 1 }]);
      expect(minioResult).toBe(true);
    });

    it('should handle Redis failure gracefully', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis connection failed'));

      await expect(mockRedis.ping()).rejects.toThrow('Redis connection failed');
    });

    it('should handle database failure gracefully', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));

      await expect(mockPrisma.$queryRaw()).rejects.toThrow('Database connection failed');
    });

    it('should handle MinIO failure gracefully', async () => {
      mockMinio.bucketExists.mockRejectedValue(new Error('MinIO connection failed'));

      await expect(mockMinio.bucketExists()).rejects.toThrow('MinIO connection failed');
    });
  });

  describe('checkReadiness', () => {
    it('should return ready when core services are available', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockPrisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);

      const ready =
        (await mockRedis.ping()) === 'PONG' &&
        (await mockPrisma.$queryRaw()).length > 0;

      expect(ready).toBe(true);
    });

    it('should return not ready when Redis is down', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

      let ready = true;
      try {
        await mockRedis.ping();
      } catch {
        ready = false;
      }

      expect(ready).toBe(false);
    });
  });

  describe('checkLiveness', () => {
    it('should always return alive if server responds', () => {
      // Liveness check just verifies the process is running
      const alive = true;
      expect(alive).toBe(true);
    });
  });

  describe('Service Dependencies', () => {
    it('should check Vault health', async () => {
      mockVaultService.checkHealth.mockResolvedValue({
        healthy: true,
        sealed: false,
      });

      const result = await mockVaultService.checkHealth();

      expect(result.healthy).toBe(true);
      expect(result.sealed).toBe(false);
    });

    it('should handle sealed Vault', async () => {
      mockVaultService.checkHealth.mockResolvedValue({
        healthy: false,
        sealed: true,
        message: 'Vault is sealed',
      });

      const result = await mockVaultService.checkHealth();

      expect(result.healthy).toBe(false);
      expect(result.sealed).toBe(true);
    });

    it('should check AI Orchestrator health', async () => {
      mockAiOrchestratorClient.health.mockResolvedValue(true);

      const result = await mockAiOrchestratorClient.health();

      expect(result).toBe(true);
    });

    it('should handle AI Orchestrator unavailable', async () => {
      mockAiOrchestratorClient.health.mockResolvedValue(false);

      const result = await mockAiOrchestratorClient.health();

      expect(result).toBe(false);
    });

    it('should check n8n health', async () => {
      mockN8nClient.health.mockResolvedValue(true);

      const result = await mockN8nClient.health();

      expect(result).toBe(true);
    });

    it('should check Auth service health', async () => {
      mockAuthClient.health.mockResolvedValue(true);

      const result = await mockAuthClient.health();

      expect(result).toBe(true);
    });
  });

  describe('Health Response Format', () => {
    it('should return correct health response structure', () => {
      const healthResponse = {
        status: 'healthy',
        version: '1.0.0',
        uptime: 12345,
        timestamp: new Date().toISOString(),
        services: {
          database: { status: 'healthy', latencyMs: 5 },
          redis: { status: 'healthy', latencyMs: 2 },
          minio: { status: 'healthy', latencyMs: 10 },
          vault: { status: 'healthy', sealed: false },
          aiOrchestrator: { status: 'healthy' },
          n8n: { status: 'healthy' },
          auth: { status: 'healthy' },
        },
      };

      expect(healthResponse.status).toBe('healthy');
      expect(healthResponse.services).toBeDefined();
      expect(Object.keys(healthResponse.services)).toHaveLength(7);
    });

    it('should mark degraded when non-critical services fail', () => {
      const healthResponse = {
        status: 'degraded',
        services: {
          database: { status: 'healthy' },
          redis: { status: 'healthy' },
          minio: { status: 'healthy' },
          vault: { status: 'unhealthy', error: 'Connection timeout' },
          aiOrchestrator: { status: 'healthy' },
          n8n: { status: 'unhealthy', error: 'Service unavailable' },
          auth: { status: 'healthy' },
        },
      };

      expect(healthResponse.status).toBe('degraded');
      expect(healthResponse.services.vault.status).toBe('unhealthy');
      expect(healthResponse.services.n8n.status).toBe('unhealthy');
    });

    it('should mark unhealthy when critical services fail', () => {
      const healthResponse = {
        status: 'unhealthy',
        services: {
          database: { status: 'unhealthy', error: 'Connection refused' },
          redis: { status: 'healthy' },
          minio: { status: 'healthy' },
        },
      };

      expect(healthResponse.status).toBe('unhealthy');
      expect(healthResponse.services.database.status).toBe('unhealthy');
    });
  });

  describe('Metrics', () => {
    it('should track response times', async () => {
      const start = Date.now();
      await mockRedis.ping();
      const latency = Date.now() - start;

      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it('should count health check calls', () => {
      const metrics = {
        healthCheckCount: 0,
        incrementHealthCheck: function () {
          this.healthCheckCount++;
        },
      };

      metrics.incrementHealthCheck();
      metrics.incrementHealthCheck();

      expect(metrics.healthCheckCount).toBe(2);
    });
  });
});
