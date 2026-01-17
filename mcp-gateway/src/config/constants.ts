/**
 * Application Constants - CQ-004
 *
 * Centralized configuration constants to eliminate magic numbers.
 * All values can be overridden via environment variables.
 */

// ============================================================================
// Environment Helpers
// ============================================================================

const envInt = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
};

const envString = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

// ============================================================================
// Server Configuration
// ============================================================================

export const SERVER = {
  /** Default port for the API server */
  PORT: envInt('PORT', 4000),

  /** Base URL for constructing URLs */
  BASE_URL: envString('BASE_URL', 'http://localhost:4000'),

  /** Node environment */
  NODE_ENV: envString('NODE_ENV', 'development'),

  /** Enable strict input validation (blocks suspicious inputs) */
  STRICT_INPUT_VALIDATION: process.env.STRICT_INPUT_VALIDATION === 'true',
} as const;

// ============================================================================
// Timeout Configuration (in milliseconds)
// ============================================================================

export const TIMEOUTS = {
  /** Default HTTP client timeout */
  HTTP_CLIENT: envInt('HTTP_CLIENT_TIMEOUT_MS', 5000),

  /** Circuit breaker timeout */
  CIRCUIT_BREAKER: envInt('CIRCUIT_BREAKER_TIMEOUT_MS', 30000),

  /** Circuit breaker reset timeout (half-open state) */
  CIRCUIT_BREAKER_RESET: envInt('CIRCUIT_BREAKER_RESET_TIMEOUT_MS', 60000),

  /** AI command processing timeout */
  AI_PROCESSING: envInt('AI_PROCESSING_TIMEOUT_MS', 120000),

  /** WebSocket ping interval */
  WEBSOCKET_PING: envInt('WEBSOCKET_PING_INTERVAL_MS', 30000),

  /** Session expiry time */
  SESSION_TTL_SECONDS: envInt('SESSION_TTL_SECONDS', 86400), // 24 hours
} as const;

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

export const RATE_LIMITS = {
  /** Maximum requests per window */
  MAX_REQUESTS: envInt('RATE_LIMIT_MAX', 100),

  /** Rate limit window in milliseconds */
  WINDOW_MS: envInt('RATE_LIMIT_WINDOW_MS', 60000),

  /** API key creation rate limit */
  API_KEY_CREATION: {
    MAX_PER_HOUR: 5,
    WINDOW_SECONDS: 3600,
  },

  /** Login attempt rate limit */
  LOGIN_ATTEMPTS: {
    MAX_PER_WINDOW: 10,
    WINDOW_SECONDS: 900, // 15 minutes
  },

  /** File upload rate limit */
  FILE_UPLOAD: {
    MAX_PER_HOUR: 50,
    WINDOW_SECONDS: 3600,
  },

  /** AI command rate limit */
  AI_COMMANDS: {
    MAX_PER_MINUTE: 20,
    WINDOW_SECONDS: 60,
  },
} as const;

// ============================================================================
// Size Limits
// ============================================================================

export const SIZE_LIMITS = {
  /** Maximum file upload size in bytes */
  MAX_FILE_SIZE_BYTES: envInt('MAX_FILE_SIZE_MB', 100) * 1024 * 1024,

  /** Maximum WebSocket message size in bytes */
  MAX_WEBSOCKET_MESSAGE_BYTES: 1024 * 1024, // 1MB

  /** Maximum request body size in bytes */
  MAX_BODY_SIZE_BYTES: 10 * 1024 * 1024, // 10MB

  /** Maximum command length */
  MAX_COMMAND_LENGTH: 32000,

  /** Maximum system prompt length */
  MAX_SYSTEM_PROMPT_LENGTH: 4000,

  /** Maximum API key name length */
  MAX_API_KEY_NAME_LENGTH: 100,
} as const;

// ============================================================================
// Cache Configuration
// ============================================================================

export const CACHE = {
  /** API key cache TTL in seconds */
  API_KEY_TTL_SECONDS: envInt('API_KEY_CACHE_TTL_SECONDS', 300), // 5 minutes

  /** Session cache TTL in seconds */
  SESSION_TTL_SECONDS: envInt('SESSION_CACHE_TTL_SECONDS', 86400), // 24 hours

  /** Command result TTL in seconds */
  COMMAND_TTL_SECONDS: envInt('COMMAND_CACHE_TTL_SECONDS', 3600), // 1 hour

  /** Health check cache TTL in seconds */
  HEALTH_CHECK_TTL_SECONDS: envInt('HEALTH_CHECK_CACHE_TTL_SECONDS', 10),
} as const;

// ============================================================================
// Retry Configuration
// ============================================================================

export const RETRY = {
  /** Initial retry delay in milliseconds */
  INITIAL_DELAY_MS: 100,

  /** Maximum retry delay in milliseconds */
  MAX_DELAY_MS: 5000,

  /** Backoff multiplier */
  BACKOFF_MULTIPLIER: 2,

  /** Maximum number of retries */
  MAX_RETRIES: 3,
} as const;

// ============================================================================
// Bulkhead Configuration - PERF-009
// ============================================================================

export const BULKHEAD = {
  /** Default maximum concurrent requests */
  DEFAULT_MAX_CONCURRENT: envInt('BULKHEAD_MAX_CONCURRENT', 10),

  /** Default maximum queue size */
  DEFAULT_MAX_QUEUE: envInt('BULKHEAD_MAX_QUEUE', 100),

  /** Per-service bulkhead configuration (overrides defaults) */
  SERVICES: {
    /** AI Orchestrator - may need higher limits for streaming */
    AI_ORCHESTRATOR: {
      MAX_CONCURRENT: envInt('BULKHEAD_AI_MAX_CONCURRENT', 20),
      MAX_QUEUE: envInt('BULKHEAD_AI_MAX_QUEUE', 200),
    },
    /** Auth service - typically fast, lower concurrency OK */
    AUTH: {
      MAX_CONCURRENT: envInt('BULKHEAD_AUTH_MAX_CONCURRENT', 10),
      MAX_QUEUE: envInt('BULKHEAD_AUTH_MAX_QUEUE', 50),
    },
    /** n8n workflow service - workflows can be slow */
    N8N: {
      MAX_CONCURRENT: envInt('BULKHEAD_N8N_MAX_CONCURRENT', 5),
      MAX_QUEUE: envInt('BULKHEAD_N8N_MAX_QUEUE', 50),
    },
    /** Default for unknown services */
    DEFAULT: {
      MAX_CONCURRENT: envInt('BULKHEAD_MAX_CONCURRENT', 10),
      MAX_QUEUE: envInt('BULKHEAD_MAX_QUEUE', 100),
    },
  },
} as const;

// ============================================================================
// Pagination Defaults
// ============================================================================

export const PAGINATION = {
  /** Default page size */
  DEFAULT_PAGE_SIZE: 20,

  /** Maximum page size */
  MAX_PAGE_SIZE: 100,

  /** Default offset */
  DEFAULT_OFFSET: 0,
} as const;

// ============================================================================
// Audit Configuration
// ============================================================================

export const AUDIT = {
  /** Batch size for fire-and-forget audit logging */
  BATCH_SIZE: 50,

  /** Batch interval in milliseconds */
  BATCH_INTERVAL_MS: 1000,

  /** Maximum audit log entries to keep */
  MAX_ENTRIES: 10000,
} as const;

// ============================================================================
// Service URLs (with defaults)
// ============================================================================

export const SERVICE_URLS = {
  AUTH: envString('AUTH_SERVICE_URL', 'http://auth-service:4009'),
  AI_ORCHESTRATOR: envString('AI_ORCHESTRATOR_URL', 'http://ai-orchestrator:4005'),
  N8N: envString('N8N_URL', 'http://n8n:5678'),
  REDIS: envString('REDIS_URL', 'redis://localhost:6379'),
  DATABASE: envString('DATABASE_URL', 'postgresql://localhost:5432/zentoria'),
  MINIO: envString('MINIO_ENDPOINT', 'localhost:9000'),
} as const;

// ============================================================================
// File Upload Configuration
// ============================================================================

export const FILE_UPLOAD = {
  /** Allowed MIME types */
  ALLOWED_MIME_TYPES: (
    envString('ALLOWED_MIME_TYPES', 'application/pdf,image/*,text/*,application/json')
  ).split(',').map(t => t.trim()),

  /** MinIO bucket name */
  BUCKET_NAME: envString('MINIO_BUCKET', 'zentoria-files'),

  /** Presigned URL expiry in seconds */
  PRESIGNED_URL_EXPIRY_SECONDS: 3600,

  /** Maximum files per context */
  MAX_FILES_PER_CONTEXT: 10,
} as const;

// ============================================================================
// WebSocket Configuration
// ============================================================================

export const WEBSOCKET = {
  /** Path for WebSocket connections */
  PATH: '/ws',

  /** Maximum reconnection attempts */
  MAX_RECONNECT_ATTEMPTS: 5,

  /** Reconnection delay in milliseconds */
  RECONNECT_DELAY_MS: 1000,

  /** Maximum reconnection delay in milliseconds */
  MAX_RECONNECT_DELAY_MS: 5000,
} as const;

// ============================================================================
// Security Configuration
// ============================================================================

export const SECURITY = {
  /** API key prefix for test environment */
  API_KEY_PREFIX_TEST: 'znt_test_sk_',

  /** API key prefix for production environment */
  API_KEY_PREFIX_PROD: 'znt_live_sk_',

  /** API key minimum length */
  API_KEY_MIN_LENGTH: 32,

  /** API key lookup prefix length */
  API_KEY_PREFIX_LENGTH: 12,

  /** Session ID prefix */
  SESSION_ID_PREFIX: 'sess_',

  /** Command ID prefix */
  COMMAND_ID_PREFIX: 'cmd_',

  /** File ID prefix */
  FILE_ID_PREFIX: 'file_',
} as const;

// ============================================================================
// Export All
// ============================================================================

export const CONFIG = {
  SERVER,
  TIMEOUTS,
  RATE_LIMITS,
  SIZE_LIMITS,
  CACHE,
  RETRY,
  BULKHEAD,
  PAGINATION,
  AUDIT,
  SERVICE_URLS,
  FILE_UPLOAD,
  WEBSOCKET,
  SECURITY,
} as const;

export default CONFIG;
