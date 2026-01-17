/**
 * MCP Core API Gateway - Entry Point
 *
 * Zentoria Personal Edition
 * Container 401 - Main API Gateway
 */

// ARCH-003: Initialize OpenTelemetry BEFORE other imports
// This is critical for auto-instrumentation to work correctly
import { initTelemetry, shutdownTelemetry } from './infrastructure/telemetry.js';
initTelemetry();

import 'dotenv/config';
import { createServer } from './server.js';
import { createContainer } from './container.js';
import { logger } from './infrastructure/logger.js';
import { gracefulShutdown } from './infrastructure/shutdown.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main(): Promise<void> {
  logger.info('Starting MCP Gateway...');

  // Create dependency injection container
  const container = await createContainer();

  // Create and configure Fastify server
  const server = await createServer(container);

  // Register graceful shutdown handlers
  gracefulShutdown(server, container);

  try {
    // Start the server
    await server.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT, host: HOST }, 'MCP Gateway is running');
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.fatal(err, 'Unhandled error during startup');
  process.exit(1);
});
