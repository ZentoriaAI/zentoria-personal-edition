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

// ============================
// Enhanced Chat Interface Types
// ============================

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  model: string;
  systemPrompt?: string;
  temperature: number;
  maxTokens?: number;
  capabilities: string[];
  icon?: string;
  color?: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface ProjectFolder {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  sortOrder: number;
  isArchived: boolean;
  children?: ProjectFolder[];
  sessionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  folderId?: string;
  agentId?: string;
  agent?: Agent;
  folder?: ProjectFolder;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  messageCount: number;
  tokenCount: number;
  isPinned: boolean;
  isArchived: boolean;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnhancedChatMessage {
  id: string;
  sessionId: string;
  parentId?: string;
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  tokenCount?: number;
  isEdited: boolean;
  editedAt?: string;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    duration?: number;
    finishReason?: string;
  };
  createdAt: string;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  type: 'file' | 'image' | 'code' | 'canvas';
  fileId?: string;
  canvasId?: string;
  name: string;
  mimeType?: string;
  size?: number;
  url?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface Canvas {
  id: string;
  sessionId: string;
  title: string;
  type: 'code' | 'document' | 'diagram' | 'preview' | 'artifact';
  content: string;
  language?: string;
  metadata?: {
    lineCount?: number;
    wordCount?: number;
    lastCursorPosition?: number;
  };
  versions?: CanvasVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface CanvasVersion {
  id: string;
  canvasId: string;
  content: string;
  changeDescription?: string;
  createdAt: string;
}

export interface UserSettings {
  id: string;
  defaultAgentId?: string;
  defaultAgent?: Agent;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens?: number;
  defaultSystemPrompt?: string;
  contextWindow: number;
  streamResponses: boolean;
  showTokenCounts: boolean;
  autoGenerateTitles: boolean;
  saveHistory: boolean;
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  codeTheme: string;
  sendOnEnter: boolean;
  enableSounds: boolean;
  enableNotifications: boolean;
  keyboardShortcuts: Record<string, string>;
  customPrompts: CustomPrompt[];
}

export interface CustomPrompt {
  id: string;
  name: string;
  content: string;
  category?: string;
}

export interface StreamChunk {
  type: 'start' | 'content' | 'done' | 'error' | 'title';
  content?: string;
  messageId?: string;
  sessionId?: string;
  title?: string;
  error?: string;
  tokenCount?: number;
}

export interface CreateSessionRequest {
  title?: string;
  folderId?: string;
  agentId?: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
}

export interface SendMessageRequest {
  content: string;
  attachmentIds?: string[];
  parentId?: string;
  stream?: boolean;
}

export interface FolderTree {
  folders: ProjectFolder[];
  unfiledCount: number;
}

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  description?: string;
}
