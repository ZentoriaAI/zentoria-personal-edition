// ============================
// Common Types
// ============================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================
// System Health Types
// ============================

export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  latency?: number;
  lastCheck: string;
  details?: Record<string, unknown>;
}

export interface SystemHealth {
  status: ServiceStatus;
  services: ServiceHealth[];
  uptime: number;
  version: string;
  timestamp: string;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
  };
}

// ============================
// Chat Types
// ============================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  attachments?: FileAttachment[];
  metadata?: {
    model?: string;
    tokensUsed?: number;
    duration?: number;
  };
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messageCount: number;
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  model?: string;
  attachments?: string[]; // File IDs
  stream?: boolean;
}

export interface ChatStreamChunk {
  type: 'start' | 'token' | 'end' | 'error';
  content?: string;
  messageId?: string;
  conversationId?: string;
  error?: string;
}

// ============================
// File Types
// ============================

export type FileType = 'image' | 'video' | 'audio' | 'document' | 'code' | 'archive' | 'other';

export interface FileAttachment {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  type: FileType;
  thumbnail?: string;
  createdAt: string;
}

export interface FileItem extends FileAttachment {
  isDirectory: boolean;
  parentId?: string;
  children?: FileItem[];
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    encoding?: string;
  };
  updatedAt: string;
}

export interface FileUploadProgress {
  fileId: string;
  name: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

// ============================
// Workflow Types
// ============================

export type WorkflowStatus = 'active' | 'inactive' | 'error' | 'paused';

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  tags?: string[];
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  errorCount: number;
  avgDuration?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'running' | 'success' | 'failed' | 'waiting';
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  error?: string;
  data?: Record<string, unknown>;
}

// ============================
// API Key Types
// ============================

export type ApiKeyScope = 'full' | 'read' | 'write' | 'chat' | 'files' | 'workflows';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string; // First 8 chars
  scopes: ApiKeyScope[];
  lastUsed?: string;
  usageCount: number;
  expiresAt?: string;
  createdAt: string;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: ApiKeyScope[];
  expiresIn?: number; // Days
}

export interface CreateApiKeyResponse {
  key: ApiKey;
  fullKey: string; // Only shown once
}

// ============================
// Settings Types
// ============================

export interface SystemSettings {
  general: {
    appName: string;
    timezone: string;
    language: string;
  };
  ai: {
    defaultModel: string;
    temperature: number;
    maxTokens: number;
    systemPrompt?: string;
  };
  storage: {
    maxFileSize: number; // Bytes
    allowedTypes: string[];
    retentionDays: number;
  };
  notifications: {
    enabled: boolean;
    email?: string;
    webhookUrl?: string;
  };
}

// ============================
// Log Types
// ============================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  source: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface LogFilter {
  level?: LogLevel[];
  source?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}
