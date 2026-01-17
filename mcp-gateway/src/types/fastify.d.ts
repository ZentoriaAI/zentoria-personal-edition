/**
 * Fastify type augmentations for Zentoria
 * This file properly extends Fastify types to avoid conflicts with @fastify/jwt
 */

import { AwilixContainer } from 'awilix';

declare module 'fastify' {
  interface FastifyInstance {
    container: AwilixContainer;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      scopes: string[];
      apiKeyId?: string;
    };
    user: {
      id: string;
      email: string;
      scopes: string[];
      apiKeyId?: string;
    };
  }
}
