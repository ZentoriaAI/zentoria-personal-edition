/**
 * Prisma Database Client
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

export async function createPrismaClient(): Promise<PrismaClient> {
  const prisma = new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });

  // Log queries in development
  if (process.env.NODE_ENV === 'development') {
    prisma.$on('query', (e) => {
      logger.debug(
        {
          query: e.query,
          params: e.params,
          duration: e.duration,
        },
        'Database query'
      );
    });
  }

  prisma.$on('error', (e) => {
    logger.error({ message: e.message, target: e.target }, 'Database error');
  });

  prisma.$on('warn', (e) => {
    logger.warn({ message: e.message, target: e.target }, 'Database warning');
  });

  // Test connection
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (err) {
    logger.error({ err }, 'Database connection failed');
    throw err;
  }

  return prisma;
}
