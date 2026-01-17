/**
 * Health Service
 *
 * Monitors service health and dependencies
 */

import type { ContainerCradle } from '../container.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  dependencies: Record<string, DependencyHealth>;
}

export interface DependencyHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  latencyMs?: number;
  message?: string;
}

export interface ReadinessStatus {
  ready: boolean;
  checks: Record<string, boolean>;
}

const startTime = Date.now();

export class HealthService {
  private readonly redis: ContainerCradle['redis'];
  private readonly prisma: ContainerCradle['prisma'];
  private readonly minio: ContainerCradle['minio'];
  private readonly circuitBreaker: ContainerCradle['circuitBreaker'];
  private readonly emailService: ContainerCradle['emailService'];
  private readonly logger: ContainerCradle['logger'];

  constructor({
    redis,
    prisma,
    minio,
    circuitBreaker,
    emailService,
    logger,
  }: ContainerCradle) {
    this.redis = redis;
    this.prisma = prisma;
    this.minio = minio;
    this.circuitBreaker = circuitBreaker;
    this.emailService = emailService;
    this.logger = logger;
  }

  /**
   * Get full health status
   */
  async getHealth(): Promise<HealthStatus> {
    const dependencies: Record<string, DependencyHealth> = {};

    // Check each dependency in parallel
    const checks = await Promise.allSettled([
      this.checkRedis(),
      this.checkDatabase(),
      this.checkMinio(),
      this.checkEmail(),
    ]);

    dependencies.redis = checks[0].status === 'fulfilled' ? checks[0].value : { status: 'unhealthy', message: 'Check failed' };
    dependencies.database = checks[1].status === 'fulfilled' ? checks[1].value : { status: 'unhealthy', message: 'Check failed' };
    dependencies.minio = checks[2].status === 'fulfilled' ? checks[2].value : { status: 'unhealthy', message: 'Check failed' };
    dependencies.email = checks[3].status === 'fulfilled' ? checks[3].value : { status: 'unknown', message: 'Check failed' };

    // Add circuit breaker states
    const circuitStates = this.circuitBreaker.getAllStates();
    for (const [name, state] of Object.entries(circuitStates)) {
      dependencies[`circuit:${name}`] = {
        status: state === 'closed' ? 'healthy' : state === 'open' ? 'unhealthy' : 'unknown',
        message: `Circuit ${state}`,
      };
    }

    // Determine overall status
    const unhealthyCount = Object.values(dependencies).filter(
      d => d.status === 'unhealthy'
    ).length;

    let status: HealthStatus['status'];
    if (unhealthyCount === 0) {
      status = 'healthy';
    } else if (unhealthyCount <= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      dependencies,
    };
  }

  /**
   * Get readiness status (for Kubernetes probes)
   */
  async getReadiness(): Promise<ReadinessStatus> {
    const checks: Record<string, boolean> = {};

    // Only check critical dependencies
    const [redis, database] = await Promise.allSettled([
      this.checkRedis(),
      this.checkDatabase(),
    ]);

    checks.redis = redis.status === 'fulfilled' && redis.value.status === 'healthy';
    checks.database = database.status === 'fulfilled' && database.value.status === 'healthy';

    const ready = Object.values(checks).every(Boolean);

    return { ready, checks };
  }

  /**
   * Check Redis health
   */
  private async checkRedis(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  /**
   * Check Database health
   */
  private async checkDatabase(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  /**
   * Check MinIO health
   */
  private async checkMinio(): Promise<DependencyHealth> {
    const start = Date.now();
    const bucket = process.env.MINIO_BUCKET || 'zentoria-files';
    try {
      await this.minio.bucketExists(bucket);
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  /**
   * Check Email service health
   */
  private async checkEmail(): Promise<DependencyHealth> {
    const start = Date.now();
    const result = await this.emailService.checkHealth();
    return {
      status: result.healthy ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - start,
      message: result.message,
    };
  }
}
