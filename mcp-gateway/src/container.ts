/**
 * Dependency Injection Container
 *
 * Uses Awilix for IoC container management
 */

import {
  createContainer as createAwilixContainer,
  asClass,
  asFunction,
  asValue,
  InjectionMode,
  AwilixContainer,
  Lifetime,
} from 'awilix';

import { logger } from './infrastructure/logger.js';
import { createRedisClient } from './infrastructure/redis.js';
import { createMinioClient } from './infrastructure/minio.js';
import { createPrismaClient } from './infrastructure/database.js';
import { createCircuitBreaker } from './infrastructure/circuit-breaker.js';
import { createEncryptionService, EncryptionService } from './infrastructure/encryption.js';
import { createEventBus, EventBus } from './infrastructure/event-bus.js'; // ARCH-002

// Services
import { AuthService } from './services/auth.service.js';
import { CommandProcessor } from './services/command-processor.js'; // ARCH-001: Refactored
import { FileService } from './services/file.service.js';
import { ApiKeyService } from './services/api-key.service.js';
import { EmailService } from './services/email.service.js';
import { WorkflowService } from './services/workflow.service.js';
import { VaultService } from './services/vault.service.js';
import { HealthService } from './services/health.service.js';
import { RefreshTokenService } from './services/refresh-token.service.js'; // SEC-010

// Repositories
import { ApiKeyRepository } from './repositories/api-key.repository.js';
import { FileRepository } from './repositories/file.repository.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { SessionRepository } from './repositories/session.repository.js';

// HTTP Clients
import { AuthClient } from './clients/auth.client.js';
import { AiOrchestratorClient } from './clients/ai-orchestrator.client.js';
import { N8nClient } from './clients/n8n.client.js';

export interface ContainerCradle {
  // Infrastructure
  logger: typeof logger;
  redis: Awaited<ReturnType<typeof createRedisClient>>;
  minio: Awaited<ReturnType<typeof createMinioClient>>;
  prisma: Awaited<ReturnType<typeof createPrismaClient>>;
  circuitBreaker: ReturnType<typeof createCircuitBreaker>;
  encryptionService: EncryptionService; // SEC-009: Audit log encryption
  eventBus: EventBus; // ARCH-002: Domain events

  // Services
  authService: AuthService;
  commandService: CommandProcessor; // ARCH-001: Refactored from CommandService
  fileService: FileService;
  apiKeyService: ApiKeyService;
  emailService: EmailService;
  workflowService: WorkflowService;
  vaultService: VaultService;
  healthService: HealthService;
  refreshTokenService: RefreshTokenService; // SEC-010: JWT refresh tokens

  // Repositories
  apiKeyRepository: ApiKeyRepository;
  fileRepository: FileRepository;
  auditRepository: AuditRepository;
  sessionRepository: SessionRepository;

  // HTTP Clients
  authClient: AuthClient;
  aiOrchestratorClient: AiOrchestratorClient;
  n8nClient: N8nClient;
}

export async function createContainer(): Promise<AwilixContainer<ContainerCradle>> {
  const container = createAwilixContainer<ContainerCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  // Register infrastructure
  const redis = await createRedisClient();
  const minio = await createMinioClient();
  const prisma = await createPrismaClient();
  const circuitBreaker = createCircuitBreaker();
  const encryptionService = createEncryptionService(); // SEC-009
  const eventBus = createEventBus(redis); // ARCH-002

  container.register({
    // Infrastructure (singletons)
    logger: asValue(logger),
    redis: asValue(redis),
    minio: asValue(minio),
    prisma: asValue(prisma),
    circuitBreaker: asValue(circuitBreaker),
    encryptionService: asValue(encryptionService), // SEC-009: Audit log encryption
    eventBus: asValue(eventBus), // ARCH-002: Domain events

    // HTTP Clients (singletons)
    authClient: asClass(AuthClient, { lifetime: Lifetime.SINGLETON }),
    aiOrchestratorClient: asClass(AiOrchestratorClient, { lifetime: Lifetime.SINGLETON }),
    n8nClient: asClass(N8nClient, { lifetime: Lifetime.SINGLETON }),

    // Repositories (singletons)
    apiKeyRepository: asClass(ApiKeyRepository, { lifetime: Lifetime.SINGLETON }),
    fileRepository: asClass(FileRepository, { lifetime: Lifetime.SINGLETON }),
    auditRepository: asClass(AuditRepository, { lifetime: Lifetime.SINGLETON }),
    sessionRepository: asClass(SessionRepository, { lifetime: Lifetime.SINGLETON }),

    // Services (singletons)
    authService: asClass(AuthService, { lifetime: Lifetime.SINGLETON }),
    commandService: asClass(CommandProcessor, { lifetime: Lifetime.SINGLETON }), // ARCH-001
    fileService: asClass(FileService, { lifetime: Lifetime.SINGLETON }),
    apiKeyService: asClass(ApiKeyService, { lifetime: Lifetime.SINGLETON }),
    emailService: asClass(EmailService, { lifetime: Lifetime.SINGLETON }),
    workflowService: asClass(WorkflowService, { lifetime: Lifetime.SINGLETON }),
    vaultService: asClass(VaultService, { lifetime: Lifetime.SINGLETON }),
    healthService: asClass(HealthService, { lifetime: Lifetime.SINGLETON }),
    refreshTokenService: asClass(RefreshTokenService, { lifetime: Lifetime.SINGLETON }), // SEC-010
  });

  logger.info('Dependency container created');

  return container;
}

export async function disposeContainer(container: AwilixContainer): Promise<void> {
  logger.info('Disposing container resources...');

  const cradle = container.cradle as ContainerCradle;

  // Shutdown event bus first (ARCH-002)
  await cradle.eventBus?.shutdown();

  // Close connections
  await cradle.redis?.quit();
  await cradle.prisma?.$disconnect();

  logger.info('Container resources disposed');
}
