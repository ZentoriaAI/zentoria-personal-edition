# Chat Service Layer Design

## Overview

This document defines the service layer architecture for the Enhanced Chat Interface.
Services follow the existing patterns from `CommandService`, `FileService`, and `ApiKeyService`.

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Routes Layer                             │
│  chat.ts  │  folders.ts  │  agents.ts  │  settings.ts           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        Service Layer                             │
│  ChatSessionService  │  ChatMessageService  │  FolderService    │
│  AgentService        │  SettingsService     │  AttachmentService│
│  CanvasService                                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      Repository Layer                            │
│  SessionRepository  │  MessageRepository  │  FolderRepository   │
│  AgentRepository    │  SettingsRepository │  CanvasRepository   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                     Infrastructure Layer                         │
│  Prisma (PostgreSQL)  │  Redis  │  MinIO  │  AI Orchestrator    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. ChatSessionService

Manages chat session lifecycle and metadata.

### Dependencies

```typescript
interface ChatSessionServiceDeps {
  sessionRepository: SessionRepository;
  messageRepository: MessageRepository;
  folderRepository: FolderRepository;
  agentRepository: AgentRepository;
  redis: RedisClient;
  auditRepository: AuditRepository;
  logger: Logger;
}
```

### Method Signatures

```typescript
export class ChatSessionService {
  constructor(deps: ChatSessionServiceDeps);

  /**
   * List sessions with pagination and filtering.
   * Uses Redis cache for frequently accessed sessions.
   */
  async listSessions(
    userId: string,
    options: ListSessionsOptions
  ): Promise<PaginatedResult<Session>>;

  /**
   * Get session by ID with optional message loading.
   * Validates ownership and caches result.
   */
  async getSession(
    userId: string,
    sessionId: string,
    options?: GetSessionOptions
  ): Promise<SessionWithMessages | null>;

  /**
   * Create a new session with optional initial message.
   * If initialMessage provided, also triggers AI response.
   */
  async createSession(
    userId: string,
    data: CreateSessionInput
  ): Promise<Session>;

  /**
   * Update session metadata (title, folder, agent, etc.).
   * Invalidates cache on update.
   */
  async updateSession(
    userId: string,
    sessionId: string,
    data: UpdateSessionInput
  ): Promise<Session>;

  /**
   * Delete session and all associated messages/attachments.
   * Permanent deletion.
   */
  async deleteSession(
    userId: string,
    sessionId: string
  ): Promise<void>;

  /**
   * Archive session (soft delete).
   */
  async archiveSession(
    userId: string,
    sessionId: string
  ): Promise<Session>;

  /**
   * Restore archived session.
   */
  async restoreSession(
    userId: string,
    sessionId: string
  ): Promise<Session>;

  /**
   * Duplicate session with all messages.
   */
  async duplicateSession(
    userId: string,
    sessionId: string,
    title?: string
  ): Promise<Session>;

  /**
   * Move session to folder.
   */
  async moveToFolder(
    userId: string,
    sessionId: string,
    folderId: string | null
  ): Promise<Session>;

  /**
   * Generate title from first message using AI.
   * Called automatically if autoGenerateTitle is enabled.
   */
  async generateTitle(
    userId: string,
    sessionId: string
  ): Promise<string>;

  /**
   * Get session statistics (token count, message count).
   */
  async getSessionStats(
    userId: string,
    sessionId: string
  ): Promise<SessionStats>;
}

// Types
interface ListSessionsOptions {
  page?: number;
  limit?: number;
  folderId?: string | null;
  search?: string;
  agentId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  includeArchived?: boolean;
}

interface GetSessionOptions {
  includeMessages?: boolean;
  messageLimit?: number;
  includeFolder?: boolean;
  includeAgent?: boolean;
}

interface CreateSessionInput {
  title?: string;
  folderId?: string | null;
  agentId?: string;
  model?: string;
  systemPrompt?: string;
  initialMessage?: string;
  metadata?: Record<string, unknown>;
}

interface UpdateSessionInput {
  title?: string;
  folderId?: string | null;
  agentId?: string | null;
  model?: string;
  systemPrompt?: string;
  isPinned?: boolean;
  metadata?: Record<string, unknown>;
}

interface SessionStats {
  messageCount: number;
  tokenCount: number;
  attachmentCount: number;
  lastMessageAt: Date | null;
}
```

---

## 2. ChatMessageService

Handles message creation, editing, and AI response generation.

### Dependencies

```typescript
interface ChatMessageServiceDeps {
  messageRepository: MessageRepository;
  sessionRepository: SessionRepository;
  attachmentRepository: AttachmentRepository;
  canvasService: CanvasService;
  aiOrchestratorClient: AiOrchestratorClient;
  circuitBreaker: CircuitBreaker;
  redis: RedisClient;
  eventBus: EventBus;
  auditRepository: AuditRepository;
  logger: Logger;
}
```

### Method Signatures

```typescript
export class ChatMessageService {
  constructor(deps: ChatMessageServiceDeps);

  /**
   * List messages with cursor-based pagination.
   * Supports loading messages before/after a cursor.
   */
  async listMessages(
    userId: string,
    sessionId: string,
    options: ListMessagesOptions
  ): Promise<CursorPaginatedResult<Message>>;

  /**
   * Get single message by ID.
   */
  async getMessage(
    userId: string,
    sessionId: string,
    messageId: string
  ): Promise<Message | null>;

  /**
   * Send a user message and trigger AI response.
   *
   * For streaming mode:
   * 1. Create user message
   * 2. Create placeholder assistant message
   * 3. Emit 'message:streaming:start' event
   * 4. Return immediately with WebSocket URL
   * 5. Stream response via WebSocket
   * 6. Update message when complete
   *
   * For sync mode:
   * 1. Create user message
   * 2. Wait for AI response
   * 3. Create assistant message
   * 4. Return both messages
   */
  async sendMessage(
    userId: string,
    sessionId: string,
    input: SendMessageInput
  ): Promise<SendMessageResult>;

  /**
   * Edit a user message and optionally regenerate response.
   * Creates a new version, preserving history.
   */
  async editMessage(
    userId: string,
    sessionId: string,
    messageId: string,
    input: EditMessageInput
  ): Promise<EditMessageResult>;

  /**
   * Delete a message (soft delete).
   * Content is cleared but metadata preserved.
   */
  async deleteMessage(
    userId: string,
    sessionId: string,
    messageId: string
  ): Promise<void>;

  /**
   * Regenerate AI response for a message.
   * Only works on assistant messages.
   */
  async regenerateMessage(
    userId: string,
    sessionId: string,
    messageId: string,
    options?: RegenerateOptions
  ): Promise<Message | StreamingResponse>;

  /**
   * Submit feedback for an AI message.
   */
  async submitFeedback(
    userId: string,
    sessionId: string,
    messageId: string,
    feedback: MessageFeedback
  ): Promise<void>;

  /**
   * Get conversation context for AI.
   * Builds context from recent messages and attachments.
   */
  async buildContext(
    sessionId: string,
    options: BuildContextOptions
  ): Promise<ConversationContext>;

  /**
   * Process streaming response from AI Orchestrator.
   * Extracts code blocks into canvases.
   */
  async processStreamChunk(
    messageId: string,
    chunk: StreamChunk
  ): Promise<ProcessedChunk>;
}

// Types
interface ListMessagesOptions {
  cursor?: string;
  limit?: number;
  direction?: 'before' | 'after';
}

interface SendMessageInput {
  content: string;
  attachmentIds?: string[];
  stream?: boolean;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

interface SendMessageResult {
  userMessage: Message;
  assistantMessage?: Message;  // Only for sync mode
  streamingResponse?: StreamingResponse;  // Only for stream mode
}

interface StreamingResponse {
  messageId: string;
  sessionId: string;
  websocketUrl: string;
}

interface EditMessageInput {
  content: string;
  regenerateResponse?: boolean;
}

interface EditMessageResult {
  editedMessage: Message;
  newResponse?: Message;
  previousVersionId: string;
}

interface RegenerateOptions {
  stream?: boolean;
  model?: string;
}

interface BuildContextOptions {
  maxMessages?: number;
  maxTokens?: number;
  includeSystemPrompt?: boolean;
  includeAttachments?: boolean;
}

interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  attachmentContexts: string[];
  tokenCount: number;
}

interface StreamChunk {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  usage?: TokenUsage;
}

interface ProcessedChunk {
  content: string;
  canvases?: Canvas[];
  isComplete: boolean;
}
```

---

## 3. FolderService

Manages project folder hierarchy.

### Dependencies

```typescript
interface FolderServiceDeps {
  folderRepository: FolderRepository;
  sessionRepository: SessionRepository;
  redis: RedisClient;
  auditRepository: AuditRepository;
  logger: Logger;
}
```

### Method Signatures

```typescript
export class FolderService {
  constructor(deps: FolderServiceDeps);

  /**
   * List all folders as flat list or tree.
   * Uses Redis cache for folder tree.
   */
  async listFolders(
    userId: string,
    options?: ListFoldersOptions
  ): Promise<FolderListResult>;

  /**
   * Get folder with children and session count.
   */
  async getFolder(
    userId: string,
    folderId: string
  ): Promise<FolderWithDetails | null>;

  /**
   * Create a new folder.
   */
  async createFolder(
    userId: string,
    input: CreateFolderInput
  ): Promise<Folder>;

  /**
   * Update folder metadata.
   */
  async updateFolder(
    userId: string,
    folderId: string,
    input: UpdateFolderInput
  ): Promise<Folder>;

  /**
   * Delete folder.
   * Sessions are moved to unfiled unless deleteContents is true.
   */
  async deleteFolder(
    userId: string,
    folderId: string,
    deleteContents?: boolean
  ): Promise<void>;

  /**
   * Move folder to new parent.
   * Handles circular reference prevention.
   */
  async moveFolder(
    userId: string,
    folderId: string,
    parentId: string | null,
    position?: number
  ): Promise<Folder>;

  /**
   * Reorder folders within a parent.
   */
  async reorderFolders(
    userId: string,
    parentId: string | null,
    folderIds: string[]
  ): Promise<void>;

  /**
   * Build folder tree structure.
   * Cached in Redis with user-specific key.
   */
  async buildFolderTree(
    userId: string
  ): Promise<FolderTreeNode[]>;
}

// Types
interface ListFoldersOptions {
  flat?: boolean;
  includeSessionCount?: boolean;
}

interface FolderListResult {
  folders: Folder[];
  tree?: FolderTreeNode[];
}

interface CreateFolderInput {
  name: string;
  color?: string;
  icon?: string;
  parentId?: string | null;
  position?: number;
}

interface UpdateFolderInput {
  name?: string;
  color?: string;
  icon?: string;
  position?: number;
}

interface FolderWithDetails extends Folder {
  sessions: Session[];
  children: Folder[];
  path: string[];  // Breadcrumb path
}

interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
}
```

---

## 4. AgentService

Manages AI agent configuration and selection.

### Dependencies

```typescript
interface AgentServiceDeps {
  agentRepository: AgentRepository;
  redis: RedisClient;
  logger: Logger;
}
```

### Method Signatures

```typescript
export class AgentService {
  constructor(deps: AgentServiceDeps);

  /**
   * List all available agents.
   * Filters by enabled status and user preferences.
   */
  async listAgents(
    userId?: string
  ): Promise<Agent[]>;

  /**
   * Get agent by ID.
   */
  async getAgent(
    agentId: string
  ): Promise<Agent | null>;

  /**
   * Get default agent for user.
   */
  async getDefaultAgent(
    userId: string
  ): Promise<Agent>;

  /**
   * Build system prompt for agent.
   * Combines agent base prompt with user customizations.
   */
  async buildSystemPrompt(
    agentId: string,
    userPrompt?: string,
    context?: Record<string, string>
  ): Promise<string>;

  /**
   * Get agent capabilities.
   */
  async getAgentCapabilities(
    agentId: string
  ): Promise<string[]>;

  /**
   * Check if agent supports a capability.
   */
  async hasCapability(
    agentId: string,
    capability: string
  ): Promise<boolean>;
}
```

---

## 5. SettingsService

Manages user chat preferences.

### Dependencies

```typescript
interface SettingsServiceDeps {
  settingsRepository: SettingsRepository;
  redis: RedisClient;
  auditRepository: AuditRepository;
  logger: Logger;
}
```

### Method Signatures

```typescript
export class SettingsService {
  constructor(deps: SettingsServiceDeps);

  /**
   * Get user settings.
   * Returns defaults merged with user overrides.
   */
  async getSettings(
    userId: string
  ): Promise<UserSettings>;

  /**
   * Update user settings.
   * Partial update supported.
   */
  async updateSettings(
    userId: string,
    input: UpdateSettingsInput
  ): Promise<UserSettings>;

  /**
   * Reset settings to defaults.
   */
  async resetSettings(
    userId: string
  ): Promise<UserSettings>;

  /**
   * Get specific setting value.
   */
  async getSetting<K extends keyof UserSettings>(
    userId: string,
    key: K
  ): Promise<UserSettings[K]>;

  /**
   * Get default settings.
   */
  getDefaultSettings(): UserSettings;
}

// Types
interface UserSettings {
  defaultAgentId: string | null;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  streamResponses: boolean;
  showTokenCount: boolean;
  autoGenerateTitle: boolean;
  codeTheme: CodeTheme;
  fontSize: FontSize;
  compactMode: boolean;
  showTimestamps: boolean;
  enterToSend: boolean;
  customSystemPrompt: string | null;
  enabledAgents: string[];
}

type CodeTheme = 'github-dark' | 'github-light' | 'monokai' | 'dracula' | 'one-dark';
type FontSize = 'small' | 'medium' | 'large';

interface UpdateSettingsInput extends Partial<UserSettings> {}
```

---

## 6. AttachmentService

Handles file attachments for messages.

### Dependencies

```typescript
interface AttachmentServiceDeps {
  attachmentRepository: AttachmentRepository;
  fileService: FileService;
  minio: MinioClient;
  redis: RedisClient;
  auditRepository: AuditRepository;
  logger: Logger;
}
```

### Method Signatures

```typescript
export class AttachmentService {
  constructor(deps: AttachmentServiceDeps);

  /**
   * Upload attachment.
   * Validates file type, generates preview, stores in MinIO.
   */
  async uploadAttachment(
    userId: string,
    file: MultipartFile,
    purpose?: AttachmentPurpose
  ): Promise<Attachment>;

  /**
   * Get attachment metadata.
   */
  async getAttachment(
    userId: string,
    attachmentId: string
  ): Promise<Attachment | null>;

  /**
   * Delete attachment.
   * Removes from MinIO and database.
   */
  async deleteAttachment(
    userId: string,
    attachmentId: string
  ): Promise<void>;

  /**
   * Get presigned download URL.
   */
  async getDownloadUrl(
    userId: string,
    attachmentId: string,
    expirySeconds?: number
  ): Promise<DownloadUrlResult>;

  /**
   * Get attachment preview.
   * Generates thumbnail for images, first page for PDFs.
   */
  async getPreview(
    userId: string,
    attachmentId: string,
    size?: PreviewSize
  ): Promise<Buffer | null>;

  /**
   * Get attachment content for AI context.
   * Extracts text from documents, describes images.
   */
  async getContentForContext(
    attachmentId: string
  ): Promise<string>;

  /**
   * Link attachment to message.
   */
  async linkToMessage(
    attachmentId: string,
    messageId: string
  ): Promise<void>;

  /**
   * Validate attachment can be used.
   * Checks ownership and expiry.
   */
  async validateAttachment(
    userId: string,
    attachmentId: string
  ): Promise<boolean>;
}

// Types
type AttachmentPurpose = 'chat-input' | 'code-context' | 'document-reference';
type PreviewSize = 'thumbnail' | 'small' | 'medium' | 'large';

interface DownloadUrlResult {
  url: string;
  expiresAt: Date;
}
```

---

## 7. CanvasService

Manages code blocks and artifacts extracted from AI responses.

### Dependencies

```typescript
interface CanvasServiceDeps {
  canvasRepository: CanvasRepository;
  redis: RedisClient;
  logger: Logger;
}
```

### Method Signatures

```typescript
export class CanvasService {
  constructor(deps: CanvasServiceDeps);

  /**
   * Get canvas by ID.
   */
  async getCanvas(
    userId: string,
    canvasId: string
  ): Promise<Canvas | null>;

  /**
   * Update canvas content (user edit).
   * Creates new version, preserves history.
   */
  async updateCanvas(
    userId: string,
    canvasId: string,
    content: string,
    language?: string
  ): Promise<Canvas>;

  /**
   * Get canvas version history.
   */
  async getVersions(
    canvasId: string
  ): Promise<CanvasVersion[]>;

  /**
   * Restore canvas to specific version.
   */
  async restoreVersion(
    userId: string,
    canvasId: string,
    version: number
  ): Promise<Canvas>;

  /**
   * Extract canvases from message content.
   * Parses markdown code blocks and creates canvas records.
   */
  async extractFromContent(
    messageId: string,
    content: string
  ): Promise<Canvas[]>;

  /**
   * Generate preview for canvas.
   * Renders HTML/Mermaid to image.
   */
  async generatePreview(
    canvasId: string
  ): Promise<string | null>;

  /**
   * Merge canvas content into message.
   * Used when user edits canvas to update message.
   */
  async mergeIntoMessage(
    canvasId: string
  ): Promise<void>;
}

// Types
interface Canvas {
  id: string;
  messageId: string;
  type: CanvasType;
  language?: string;
  title?: string;
  content: string;
  version: number;
  isEditable: boolean;
  previewUrl?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

type CanvasType = 'code' | 'markdown' | 'mermaid' | 'latex' | 'html';

interface CanvasVersion {
  version: number;
  content: string;
  createdAt: Date;
  createdBy: 'user' | 'assistant';
}
```

---

## Service Registration

Add services to the Awilix container in `container.ts`:

```typescript
import { ChatSessionService } from './services/chat-session.service.js';
import { ChatMessageService } from './services/chat-message.service.js';
import { FolderService } from './services/folder.service.js';
import { AgentService } from './services/agent.service.js';
import { SettingsService } from './services/settings.service.js';
import { AttachmentService } from './services/attachment.service.js';
import { CanvasService } from './services/canvas.service.js';

// Add to ContainerCradle interface
export interface ContainerCradle {
  // ... existing services ...

  // Chat Services
  chatSessionService: ChatSessionService;
  chatMessageService: ChatMessageService;
  folderService: FolderService;
  agentService: AgentService;
  settingsService: SettingsService;
  attachmentService: AttachmentService;
  canvasService: CanvasService;
}

// Register in createContainer()
container.register({
  // ... existing registrations ...

  // Chat Services
  chatSessionService: asClass(ChatSessionService, { lifetime: Lifetime.SINGLETON }),
  chatMessageService: asClass(ChatMessageService, { lifetime: Lifetime.SINGLETON }),
  folderService: asClass(FolderService, { lifetime: Lifetime.SINGLETON }),
  agentService: asClass(AgentService, { lifetime: Lifetime.SINGLETON }),
  settingsService: asClass(SettingsService, { lifetime: Lifetime.SINGLETON }),
  attachmentService: asClass(AttachmentService, { lifetime: Lifetime.SINGLETON }),
  canvasService: asClass(CanvasService, { lifetime: Lifetime.SINGLETON }),
});
```

---

## Error Handling

Services use the existing `Errors` factory from `error-handler.ts`:

```typescript
// Add new error types to Errors object
export const Errors = {
  // ... existing errors ...

  // Chat-specific errors
  sessionNotFound: (sessionId: string) =>
    new AppError('SESSION_NOT_FOUND', `Session '${sessionId}' not found`, 404),

  messageNotFound: (messageId: string) =>
    new AppError('MESSAGE_NOT_FOUND', `Message '${messageId}' not found`, 404),

  folderNotFound: (folderId: string) =>
    new AppError('FOLDER_NOT_FOUND', `Folder '${folderId}' not found`, 404),

  agentNotFound: (agentId: string) =>
    new AppError('AGENT_NOT_FOUND', `Agent '${agentId}' not found`, 404),

  cannotEditAssistantMessage: () =>
    new AppError('CANNOT_EDIT', 'Cannot edit assistant messages', 400),

  cannotRegenerateUserMessage: () =>
    new AppError('CANNOT_REGENERATE', 'Cannot regenerate user messages', 400),

  circularFolderReference: () =>
    new AppError('CIRCULAR_REFERENCE', 'Cannot move folder into its own descendant', 400),

  sessionArchived: (sessionId: string) =>
    new AppError('SESSION_ARCHIVED', `Session '${sessionId}' is archived`, 400),

  attachmentExpired: (attachmentId: string) =>
    new AppError('ATTACHMENT_EXPIRED', `Attachment '${attachmentId}' has expired`, 410),

  streamingInProgress: (sessionId: string) =>
    new AppError('STREAMING_IN_PROGRESS', `Session '${sessionId}' has streaming in progress`, 409),
};
```

---

## Audit Logging

All services log significant operations:

```typescript
// Session operations
auditRepository.logAsync({
  action: 'session_created',
  userId,
  metadata: { sessionId, title, folderId },
});

auditRepository.logAsync({
  action: 'session_deleted',
  userId,
  metadata: { sessionId },
});

// Message operations
auditRepository.logAsync({
  action: 'message_sent',
  userId,
  metadata: { sessionId, messageId, hasAttachments },
});

auditRepository.logAsync({
  action: 'message_edited',
  userId,
  metadata: { sessionId, messageId, previousVersionId },
});

// AI operations
auditRepository.logAsync({
  action: 'ai_response_generated',
  userId,
  metadata: { sessionId, messageId, model, tokens },
});
```
