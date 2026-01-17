/**
 * Fastify Server Configuration
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { AwilixContainer } from 'awilix';

import { logger } from './infrastructure/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { authMiddleware } from './middleware/auth.js';

// Routes
import { healthRoutes } from './routes/health.js';
import { mcpRoutes } from './routes/mcp.js';
import { fileRoutes } from './routes/files.js';
import { keyRoutes } from './routes/keys.js';
import { workflowRoutes } from './routes/workflows.js';
import { websocketRoutes } from './routes/websocket.js';
import { authRoutes } from './routes/auth.js'; // SEC-010

export async function createServer(container: AwilixContainer): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false, // We use custom pino logger
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: () => crypto.randomUUID(),
  });

  // Store container in server for access in routes
  server.decorate('container', container);

  // Register plugins
  await registerPlugins(server);

  // Register middleware
  server.addHook('onRequest', requestLogger);
  server.addHook('preHandler', authMiddleware(container));

  // Register error handler
  server.setErrorHandler(errorHandler);

  // Register routes
  await registerRoutes(server);

  return server;
}

async function registerPlugins(server: FastifyInstance): Promise<void> {
  // CORS
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  // Security headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // For Swagger UI
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // JWT
  await server.register(jwt, {
    secret: process.env.JWT_SECRET || 'development-secret-change-in-production',
    sign: {
      issuer: process.env.JWT_ISSUER || 'zentoria-auth',
      audience: process.env.JWT_AUDIENCE || 'zentoria-mcp',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    },
    verify: {
      issuer: process.env.JWT_ISSUER || 'zentoria-auth',
      audience: process.env.JWT_AUDIENCE || 'zentoria-mcp',
    },
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    errorResponseBuilder: (request, context) => ({
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Please retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
        requestId: request.id,
      },
    }),
    keyGenerator: (request) => {
      // Use API key or user ID if available, otherwise IP
      return request.user?.id || request.headers['x-api-key'] || request.ip;
    },
  });

  // File uploads
  await server.register(multipart, {
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10) * 1024 * 1024,
      files: 10,
    },
  });

  // WebSocket support
  await server.register(websocket, {
    options: {
      maxPayload: 1024 * 1024, // 1MB max message
    },
  });

  // OpenAPI documentation
  await server.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Zentoria MCP Gateway',
        version: '1.0.0',
        description: 'API Gateway for Zentoria Personal Edition',
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT || 4000}/api/v1`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  logger.info('Plugins registered');
}

async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Health routes (no auth required)
  await server.register(healthRoutes, { prefix: '/api/v1' });

  // Auth routes (SEC-010: refresh endpoint is public)
  await server.register(authRoutes, { prefix: '/api/v1/auth' });

  // API routes (auth required)
  await server.register(mcpRoutes, { prefix: '/api/v1/mcp' });
  await server.register(fileRoutes, { prefix: '/api/v1/mcp' });
  await server.register(keyRoutes, { prefix: '/api/v1/mcp' });
  await server.register(workflowRoutes, { prefix: '/api/v1/mcp' });

  // WebSocket routes
  await server.register(websocketRoutes, { prefix: '/ws' });

  logger.info('Routes registered');
}

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    container: AwilixContainer;
  }

  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      scopes: string[];
      apiKeyId?: string;
    };
  }
}
