/**
 * WebSocket Routes for Real-time AI Responses
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { logger } from '../infrastructure/logger.js';

interface WebSocketClient {
  id: string;
  userId: string;
  ws: WebSocket;
  subscriptions: Set<string>;
}

const clients = new Map<string, WebSocketClient>();

export const websocketRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * WebSocket endpoint for command streaming
   * ws://localhost:4001/ws/command
   */
  fastify.get('/command', { websocket: true }, (connection, request) => {
    const clientId = `ws_${nanoid(12)}`;
    const ws = connection.socket;

    logger.info({ clientId }, 'WebSocket client connected');

    // Authenticate via query parameter or first message
    let authenticated = false;
    let userId: string | null = null;

    const client: WebSocketClient = {
      id: clientId,
      userId: '',
      ws,
      subscriptions: new Set(),
    };

    // Handle incoming messages
    ws.on('message', async (rawData: Buffer) => {
      try {
        const message = JSON.parse(rawData.toString());

        // Handle authentication
        if (message.type === 'auth') {
          const result = await handleAuth(fastify, message.token);
          if (result) {
            authenticated = true;
            userId = result.userId;
            client.userId = userId;
            clients.set(clientId, client);

            ws.send(JSON.stringify({
              type: 'auth_success',
              userId,
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'auth_error',
              error: 'Invalid token',
            }));
            ws.close(1008, 'Authentication failed');
          }
          return;
        }

        // Require authentication for all other messages
        if (!authenticated) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Not authenticated',
          }));
          return;
        }

        // Handle message types
        switch (message.type) {
          case 'subscribe':
            handleSubscribe(client, message.commandId);
            break;

          case 'unsubscribe':
            handleUnsubscribe(client, message.commandId);
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              error: `Unknown message type: ${message.type}`,
            }));
        }
      } catch (err) {
        logger.error({ err, clientId }, 'WebSocket message error');
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
        }));
      }
    });

    // Handle connection close
    ws.on('close', () => {
      logger.info({ clientId }, 'WebSocket client disconnected');
      clients.delete(clientId);
    });

    // Handle errors
    ws.on('error', (err) => {
      logger.error({ err, clientId }, 'WebSocket error');
      clients.delete(clientId);
    });

    // Send initial connection message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Send auth message with token to authenticate',
    }));
  });

  /**
   * WebSocket endpoint for command-specific streaming
   * ws://localhost:4001/ws/command/:commandId
   */
  fastify.get('/command/:commandId', { websocket: true }, (connection, request) => {
    const { commandId } = request.params as { commandId: string };
    const clientId = `ws_${nanoid(12)}`;
    const ws = connection.socket;

    logger.info({ clientId, commandId }, 'WebSocket client connected for command');

    let authenticated = false;

    ws.on('message', async (rawData: Buffer) => {
      try {
        const message = JSON.parse(rawData.toString());

        if (message.type === 'auth') {
          const result = await handleAuth(fastify, message.token);
          if (result) {
            authenticated = true;

            // Subscribe to this specific command
            const client: WebSocketClient = {
              id: clientId,
              userId: result.userId,
              ws,
              subscriptions: new Set([commandId]),
            };
            clients.set(clientId, client);

            ws.send(JSON.stringify({
              type: 'subscribed',
              commandId,
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'auth_error',
              error: 'Invalid token',
            }));
            ws.close(1008, 'Authentication failed');
          }
          return;
        }

        if (!authenticated) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Not authenticated',
          }));
        }
      } catch (err) {
        logger.error({ err, clientId }, 'WebSocket message error');
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });

    ws.on('error', (err) => {
      logger.error({ err, clientId }, 'WebSocket error');
      clients.delete(clientId);
    });

    ws.send(JSON.stringify({
      type: 'connected',
      commandId,
      message: 'Send auth message with token to authenticate and subscribe',
    }));
  });
};

/**
 * Authenticate WebSocket connection
 */
async function handleAuth(
  fastify: FastifyInstance,
  token: string
): Promise<{ userId: string } | null> {
  try {
    // Try API key first
    if (token.startsWith('znt_')) {
      const apiKeyService = fastify.container.resolve('apiKeyService');
      const keyData = await apiKeyService.validateKey(token);
      if (keyData) {
        return { userId: keyData.userId };
      }
    }

    // Try JWT
    const decoded = await fastify.jwt.verify<{ sub: string }>(token);
    return { userId: decoded.sub };
  } catch {
    return null;
  }
}

/**
 * Subscribe to command updates
 */
function handleSubscribe(client: WebSocketClient, commandId: string): void {
  client.subscriptions.add(commandId);
  client.ws.send(JSON.stringify({
    type: 'subscribed',
    commandId,
  }));
}

/**
 * Unsubscribe from command updates
 */
function handleUnsubscribe(client: WebSocketClient, commandId: string): void {
  client.subscriptions.delete(commandId);
  client.ws.send(JSON.stringify({
    type: 'unsubscribed',
    commandId,
  }));
}

/**
 * Broadcast message to clients subscribed to a command
 */
export function broadcastToCommand(commandId: string, message: unknown): void {
  const payload = JSON.stringify(message);

  for (const client of clients.values()) {
    if (client.subscriptions.has(commandId)) {
      try {
        client.ws.send(payload);
      } catch (err) {
        logger.error({ err, clientId: client.id }, 'Failed to send WebSocket message');
      }
    }
  }
}

/**
 * Send message to a specific user
 */
export function sendToUser(userId: string, message: unknown): void {
  const payload = JSON.stringify(message);

  for (const client of clients.values()) {
    if (client.userId === userId) {
      try {
        client.ws.send(payload);
      } catch (err) {
        logger.error({ err, clientId: client.id }, 'Failed to send WebSocket message');
      }
    }
  }
}
