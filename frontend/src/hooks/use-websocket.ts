'use client';

/**
 * WebSocket Hook with Singleton Pattern
 *
 * PERF-003: Single WebSocket connection shared across all components
 * to prevent multiple connections when using multiple hooks.
 */

import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://10.10.40.101:4000';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// ============================================================================
// Singleton WebSocket Manager
// ============================================================================

type StatusListener = (status: ConnectionStatus) => void;
type EventCallback = (...args: unknown[]) => void;

class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private socket: Socket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private statusListeners: Set<StatusListener> = new Set();
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private refCount = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private constructor() {}

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Increment reference count and connect if needed
   */
  acquire(): void {
    this.refCount++;
    if (this.refCount === 1 && !this.socket) {
      this.connect();
    }
  }

  /**
   * Decrement reference count and disconnect when no more users
   */
  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0 && this.socket) {
      this.disconnect();
    }
  }

  /**
   * Connect to WebSocket server
   */
  private connect(): void {
    if (this.socket?.connected) return;

    this.setStatus('connecting');

    this.socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
    });

    this.socket.on('disconnect', () => {
      this.setStatus('disconnected');
    });

    this.socket.on('connect_error', () => {
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.setStatus('error');
      }
    });

    // Re-register all event listeners when reconnecting
    this.socket.on('connect', () => {
      this.eventListeners.forEach((callbacks, event) => {
        callbacks.forEach((callback) => {
          this.socket?.on(event, callback);
        });
      });
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  private disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.setStatus('disconnected');
    this.eventListeners.clear();
  }

  /**
   * Force reconnect (useful after auth changes)
   */
  forceReconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.connect();
    }
  }

  /**
   * Update status and notify listeners
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusListeners.forEach((listener) => listener(status));
    }
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get socket instance (for advanced use)
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Subscribe to status changes
   */
  subscribeToStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * Emit an event
   */
  emit(event: string, data?: unknown): void {
    this.socket?.emit(event, data);
  }

  /**
   * Subscribe to an event
   */
  on(event: string, callback: EventCallback): void {
    // Track in our map for reconnection handling
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    // Also register on socket if connected
    this.socket?.on(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, callback?: EventCallback): void {
    if (callback) {
      this.eventListeners.get(event)?.delete(callback);
      this.socket?.off(event, callback);
    } else {
      this.eventListeners.delete(event);
      this.socket?.off(event);
    }
  }
}

// Get singleton instance
const getManager = () => WebSocketManager.getInstance();

// ============================================================================
// React Hooks
// ============================================================================

interface UseWebSocketOptions {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  socket: Socket | null;
  status: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data?: unknown) => void;
  on: (event: string, callback: EventCallback) => void;
  off: (event: string, callback?: EventCallback) => void;
}

/**
 * Main WebSocket hook using singleton manager
 *
 * PERF-003: All components share a single WebSocket connection
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { onConnect, onDisconnect, onError, autoConnect = true } = options;
  const managerRef = useRef(getManager());
  const callbacksRef = useRef({ onConnect, onDisconnect, onError });

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = { onConnect, onDisconnect, onError };
  }, [onConnect, onDisconnect, onError]);

  // Subscribe to status using useSyncExternalStore for proper React 18 support
  const status = useSyncExternalStore(
    useCallback((callback) => managerRef.current.subscribeToStatus(callback), []),
    () => managerRef.current.getStatus(),
    () => 'disconnected' as ConnectionStatus // SSR fallback
  );

  // Handle lifecycle callbacks
  useEffect(() => {
    const manager = managerRef.current;
    let prevStatus: ConnectionStatus = manager.getStatus();

    const unsubscribe = manager.subscribeToStatus((newStatus) => {
      if (newStatus === 'connected' && prevStatus !== 'connected') {
        callbacksRef.current.onConnect?.();
      } else if (newStatus === 'disconnected' && prevStatus === 'connected') {
        callbacksRef.current.onDisconnect?.();
      } else if (newStatus === 'error') {
        callbacksRef.current.onError?.(new Error('WebSocket connection failed'));
      }
      prevStatus = newStatus;
    });

    return unsubscribe;
  }, []);

  // Auto-connect/disconnect based on component lifecycle
  useEffect(() => {
    const manager = managerRef.current;

    if (autoConnect) {
      manager.acquire();
    }

    return () => {
      if (autoConnect) {
        manager.release();
      }
    };
  }, [autoConnect]);

  const connect = useCallback(() => {
    managerRef.current.acquire();
  }, []);

  const disconnect = useCallback(() => {
    managerRef.current.release();
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    managerRef.current.emit(event, data);
  }, []);

  const on = useCallback((event: string, callback: EventCallback) => {
    managerRef.current.on(event, callback);
  }, []);

  const off = useCallback((event: string, callback?: EventCallback) => {
    managerRef.current.off(event, callback);
  }, []);

  return {
    socket: managerRef.current.getSocket(),
    status,
    connect,
    disconnect,
    emit,
    on,
    off,
  };
}

// ============================================================================
// Specialized Hooks (all share the singleton connection)
// ============================================================================

/**
 * Hook for real-time system health updates
 */
export function useSystemHealth() {
  const [health, setHealth] = useState<unknown>(null);
  const { on, off, status } = useWebSocket();

  useEffect(() => {
    const handleHealthUpdate = (data: unknown) => {
      setHealth(data);
    };

    on('health:update', handleHealthUpdate);

    return () => {
      off('health:update', handleHealthUpdate);
    };
  }, [on, off]);

  return { health, connectionStatus: status };
}

/**
 * Hook for real-time workflow execution updates
 */
export function useWorkflowUpdates(workflowId?: string) {
  const [executions, setExecutions] = useState<unknown[]>([]);
  const { on, off, emit, status } = useWebSocket();

  useEffect(() => {
    if (workflowId) {
      emit('workflow:subscribe', { workflowId });
    }

    const handleExecutionUpdate = (data: unknown) => {
      setExecutions((prev) => [data, ...prev].slice(0, 50));
    };

    on('workflow:execution', handleExecutionUpdate);

    return () => {
      if (workflowId) {
        emit('workflow:unsubscribe', { workflowId });
      }
      off('workflow:execution', handleExecutionUpdate);
    };
  }, [workflowId, on, off, emit]);

  return { executions, connectionStatus: status };
}

/**
 * Hook for real-time log streaming
 */
export function useLogStream(filter?: { level?: string; source?: string }) {
  const [logs, setLogs] = useState<unknown[]>([]);
  const { on, off, emit, status } = useWebSocket();

  useEffect(() => {
    emit('logs:subscribe', filter);

    const handleLog = (data: unknown) => {
      setLogs((prev) => [data, ...prev].slice(0, 100));
    };

    on('logs:entry', handleLog);

    return () => {
      emit('logs:unsubscribe');
      off('logs:entry', handleLog);
    };
  }, [filter, on, off, emit]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, clearLogs, connectionStatus: status };
}

/**
 * Hook for real-time chat/command updates
 */
export function useChatUpdates(sessionId?: string) {
  const [messages, setMessages] = useState<unknown[]>([]);
  const { on, off, emit, status } = useWebSocket();

  useEffect(() => {
    if (sessionId) {
      emit('chat:join', { sessionId });
    }

    const handleMessage = (data: unknown) => {
      setMessages((prev) => [...prev, data]);
    };

    const handleChunk = (data: unknown) => {
      const chunkData = data as { chunk: string; messageId: string };
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1] as { id?: string; content?: string } | undefined;
        if (lastMessage && lastMessage.id === chunkData.messageId) {
          return [
            ...prev.slice(0, -1),
            { ...lastMessage, content: (lastMessage.content || '') + chunkData.chunk },
          ];
        }
        return prev;
      });
    };

    on('chat:message', handleMessage);
    on('chat:chunk', handleChunk);

    return () => {
      if (sessionId) {
        emit('chat:leave', { sessionId });
      }
      off('chat:message', handleMessage);
      off('chat:chunk', handleChunk);
    };
  }, [sessionId, on, off, emit]);

  const sendMessage = useCallback(
    (content: string) => {
      emit('chat:send', { sessionId, content });
    },
    [emit, sessionId]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, sendMessage, clearMessages, connectionStatus: status };
}

// Export manager for advanced use cases
export { WebSocketManager };
