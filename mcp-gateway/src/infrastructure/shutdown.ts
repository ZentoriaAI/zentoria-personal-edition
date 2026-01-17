/**
 * Graceful Shutdown Handler
 */

import { FastifyInstance } from 'fastify';
import { AwilixContainer } from 'awilix';
import { logger } from './logger.js';
import { disposeContainer } from '../container.js';
import { shutdownTelemetry } from './telemetry.js'; // ARCH-003

const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds max for graceful shutdown

export function gracefulShutdown(
  server: FastifyInstance,
  container: AwilixContainer
): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

    // Set a timeout for forced shutdown
    const forceShutdown = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // Stop accepting new requests
      logger.info('Closing HTTP server...');
      await server.close();
      logger.info('HTTP server closed');

      // Dispose container resources (DB connections, Redis, etc.)
      logger.info('Disposing container resources...');
      await disposeContainer(container);
      logger.info('Container resources disposed');

      // ARCH-003: Flush and shutdown OpenTelemetry
      logger.info('Shutting down telemetry...');
      await shutdownTelemetry();
      logger.info('Telemetry shut down');

      // Clear the timeout
      clearTimeout(forceShutdown);

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      clearTimeout(forceShutdown);
      process.exit(1);
    }
  };

  // Register signal handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason, promise }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });
}
