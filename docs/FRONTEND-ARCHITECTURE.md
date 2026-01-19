# Frontend Component Architecture - Enhanced Chat Interface

> Zentoria Personal Edition - Frontend Design Specification
> Version: 2.0.0 | Last Updated: January 2026

---

## Table of Contents

1. [Component Tree Diagram](#1-component-tree-diagram)
2. [Zustand Store Designs](#2-zustand-store-designs)
3. [Component Specifications](#3-component-specifications)
4. [Storybook Stories Structure](#4-storybook-stories-structure)
5. [Accessibility Requirements](#5-accessibility-requirements)
6. [Responsive Design](#6-responsive-design)

---

## 1. Component Tree Diagram

### Full Application Hierarchy

```
App (layout.tsx)
|
+-- Providers (providers.tsx)
|   +-- ThemeProvider
|   +-- QueryClientProvider
|   +-- ToastProvider
|
+-- AppShell
    |
    +-- Sidebar (Enhanced)
    |   +-- SidebarHeader
    |   |   +-- Logo
    |   |   +-- CollapseButton
    |   |
    |   +-- SidebarNav
    |   |   +-- NavItem (Dashboard)
    |   |   +-- NavItem (Chat) [active]
    |   |   +-- NavItem (Files)
    |   |   +-- NavItem (Workflows)
    |   |   +-- NavItem (API Keys)
    |   |   +-- NavItem (Settings)
    |   |   +-- NavItem (Logs)
    |   |
    |   +-- ChatSidebar (NEW - Feature 2)
    |   |   +-- SidebarSearch
    |   |   +-- FolderTree
    |   |   |   +-- FolderNode (recursive)
    |   |   |   |   +-- FolderIcon
    |   |   |   |   +-- FolderName
    |   |   |   |   +-- SessionList
    |   |   |   |       +-- SessionItem (draggable)
    |   |   |   |           +-- SessionIcon
    |   |   |   |           +-- SessionTitle
    |   |   |   |           +-- SessionTimestamp
    |   |   |   |           +-- SessionActions
    |   |   |
    |   |   +-- QuickActions
    |   |       +-- NewChatButton
    |   |       +-- NewFolderButton
    |   |
    |   +-- SidebarFooter
    |       +-- UserBadge
    |       +-- VersionInfo
    |
    +-- Header
    |   +-- MobileMenuButton
    |   +-- Breadcrumb
    |   +-- CommandPaletteButton
    |   +-- ThemeToggle
    |
    +-- Main Content (varies by page)
```

### Chat Page Component Tree (Enhanced)

```
ChatPage (/chat/page.tsx)
|
+-- ChatLayout
    |
    +-- ChatHeader (NEW - Feature 3)
    |   +-- ConversationTitle (editable)
    |   +-- AgentSelector (dropdown)
    |   |   +-- AgentOption
    |   |   |   +-- AgentIcon
    |   |   |   +-- AgentName
    |   |   |   +-- AgentDescription
    |   |   +-- AgentBadge (current selection)
    |   +-- ModelIndicator
    |   +-- ChatActions
    |       +-- ShareButton
    |       +-- ExportButton
    |       +-- SettingsButton
    |
    +-- ChatContainer
    |   |
    |   +-- MessageArea (Feature 1 - Enhanced)
    |   |   +-- ScrollArea
    |   |   |   +-- MessageList
    |   |   |   |   +-- MessageGroup (grouped by date)
    |   |   |   |   |   +-- DateDivider
    |   |   |   |   |   +-- MessageBubble (enhanced)
    |   |   |   |   |       +-- MessageAvatar
    |   |   |   |   |       +-- MessageContent
    |   |   |   |   |       |   +-- MarkdownRenderer (Feature 1)
    |   |   |   |   |       |   |   +-- CodeBlock (syntax highlighted)
    |   |   |   |   |       |   |   +-- InlineCode
    |   |   |   |   |       |   |   +-- Table
    |   |   |   |   |       |   |   +-- Link
    |   |   |   |   |       |   |   +-- Image
    |   |   |   |   |       |   |   +-- List
    |   |   |   |   |       |   +-- StreamingIndicator
    |   |   |   |   |       +-- MessageMeta
    |   |   |   |   |       |   +-- Timestamp
    |   |   |   |   |       |   +-- TokenCount
    |   |   |   |   |       +-- MessageActions
    |   |   |   |   |           +-- CopyButton
    |   |   |   |   |           +-- RegenerateButton
    |   |   |   |   |           +-- EditButton
    |   |   |   |   |           +-- SendToCanvasButton
    |   |   |   |   +-- StreamingMessage (when active)
    |   |   |   +-- ScrollToBottom
    |   |   +-- EmptyState
    |   |
    |   +-- CanvasPanel (NEW - Feature 5)
    |       +-- CanvasHeader
    |       |   +-- TabList
    |       |   |   +-- CanvasTab (multiple)
    |       |   +-- CanvasActions
    |       |       +-- SplitViewToggle
    |       |       +-- CloseButton
    |       +-- CanvasContent
    |       |   +-- CodePreview
    |       |   |   +-- CodeEditor (read-only)
    |       |   |   +-- CopyCodeButton
    |       |   |   +-- RunCodeButton
    |       |   +-- FilePreview
    |       |   |   +-- ImageViewer
    |       |   |   +-- PdfViewer
    |       |   |   +-- DocumentViewer
    |       |   +-- ArtifactRenderer
    |       |       +-- MermaidDiagram
    |       |       +-- HtmlPreview
    |       |       +-- JsonViewer
    |       +-- CanvasFooter
    |           +-- ArtifactInfo
    |           +-- DownloadButton
    |
    +-- ChatInputArea
        +-- AttachmentPreview (Feature 4)
        |   +-- AttachmentList
        |   |   +-- AttachmentItem
        |   |       +-- AttachmentThumbnail
        |   |       +-- AttachmentName
        |   |       +-- AttachmentSize
        |   |       +-- RemoveButton
        |   +-- DropZone (visible when dragging)
        |
        +-- InputToolbar
        |   +-- AttachButton
        |   +-- VoiceInputButton (future)
        |   +-- FormatButton (future)
        |
        +-- TextInput
        |   +-- AutoResizeTextarea
        |   +-- CharacterCount
        |
        +-- SendButton
        |   +-- SendIcon / LoadingSpinner
        |
        +-- StopButton (when streaming)
```

### Settings Page Component Tree (Enhanced - Feature 6)

```
SettingsPage (/settings/page.tsx)
|
+-- SettingsHeader
|   +-- PageTitle
|   +-- SaveActions
|       +-- DiscardButton
|       +-- SaveButton
|
+-- SettingsTabs
    |
    +-- GeneralTab
    |   +-- GeneralSettings (existing)
    |
    +-- AITab (ENHANCED - Feature 6)
    |   +-- AISettingsCard
    |       +-- AgentSelector (NEW)
    |       |   +-- AgentGrid
    |       |   |   +-- AgentCard (selectable)
    |       |   |       +-- AgentIcon
    |       |   |       +-- AgentName
    |       |   |       +-- AgentCapabilities
    |       |   +-- AgentConfigPanel
    |       |       +-- AgentSettings (per-agent)
    |       |
    |       +-- ModelSelector (NEW)
    |       |   +-- ModelDropdown
    |       |   |   +-- ModelOption
    |       |   |       +-- ModelName
    |       |   |       +-- ModelProvider
    |       |   |       +-- ModelCost
    |       |   +-- ModelInfo
    |       |       +-- ContextWindow
    |       |       +-- TokenPricing
    |       |
    |       +-- TemperatureSlider
    |       +-- MaxTokensInput
    |       +-- SystemPromptEditor
    |           +-- Textarea
    |           +-- TemplateSelector
    |
    +-- StorageTab
    |   +-- StorageSettings (existing)
    |
    +-- AppearanceTab
    |   +-- AppearanceSettings (existing)
    |
    +-- NotificationsTab
        +-- NotificationSettings (existing)
```

---

## 2. Zustand Store Designs

### 2.1 Enhanced Chat Store

**File:** `src/stores/chat-store.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { Conversation, ChatMessage, Agent, Folder } from '@/types';

// ============================
// Types
// ============================

interface ChatFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  createdAt: string;
}

interface EnhancedConversation extends Conversation {
  folderId: string | null;
  agentId: string;
  pinnedAt: string | null;
  archived: boolean;
}

// ============================
// Chat Store State
// ============================

interface ChatState {
  // Current conversation
  currentConversationId: string | null;
  conversations: EnhancedConversation[];
  messages: Map<string, ChatMessage[]>;

  // Folders (Feature 2)
  folders: ChatFolder[];
  expandedFolders: Set<string>;

  // Input state
  inputValue: string;
  isStreaming: boolean;
  streamingContent: string;

  // Attachments (Feature 4)
  pendingAttachments: File[];
  uploadProgress: Map<string, number>;

  // Canvas/Artifacts (Feature 5)
  canvasItems: CanvasItem[];
  activeCanvasTab: string | null;
  isCanvasOpen: boolean;

  // Agent selection (Feature 3)
  selectedAgentId: string;

  // UI State
  searchQuery: string;
  sortBy: 'date' | 'name' | 'agent';

  // Actions
  setCurrentConversation: (id: string | null) => void;
  setConversations: (conversations: EnhancedConversation[]) => void;
  addConversation: (conversation: EnhancedConversation) => void;
  updateConversation: (id: string, updates: Partial<EnhancedConversation>) => void;
  removeConversation: (id: string) => void;
  moveConversationToFolder: (conversationId: string, folderId: string | null) => void;

  // Folder actions (Feature 2)
  addFolder: (folder: ChatFolder) => void;
  updateFolder: (id: string, updates: Partial<ChatFolder>) => void;
  removeFolder: (id: string) => void;
  toggleFolderExpanded: (id: string) => void;
  reorderFolder: (id: string, newOrder: number) => void;

  // Message actions
  setMessages: (conversationId: string, messages: ChatMessage[]) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;

  // Input actions
  setInputValue: (value: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;

  // Attachment actions (Feature 4)
  addAttachment: (file: File) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  setUploadProgress: (fileId: string, progress: number) => void;

  // Canvas actions (Feature 5)
  addCanvasItem: (item: CanvasItem) => void;
  removeCanvasItem: (id: string) => void;
  setActiveCanvasTab: (id: string | null) => void;
  toggleCanvas: () => void;

  // Agent actions (Feature 3)
  setSelectedAgent: (agentId: string) => void;

  // Search & Sort
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: 'date' | 'name' | 'agent') => void;

  reset: () => void;
}

// ============================
// Canvas Item Type (Feature 5)
// ============================

interface CanvasItem {
  id: string;
  type: 'code' | 'file' | 'mermaid' | 'html' | 'json';
  title: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  messageId?: string;
}

// ============================
// Store Implementation
// ============================

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentConversationId: null,
      conversations: [],
      messages: new Map(),
      folders: [],
      expandedFolders: new Set(),
      inputValue: '',
      isStreaming: false,
      streamingContent: '',
      pendingAttachments: [],
      uploadProgress: new Map(),
      canvasItems: [],
      activeCanvasTab: null,
      isCanvasOpen: false,
      selectedAgentId: 'chat',
      searchQuery: '',
      sortBy: 'date',

      // Conversation actions
      setCurrentConversation: (id) => set({ currentConversationId: id }),

      setConversations: (conversations) => set({ conversations }),

      addConversation: (conversation) =>
        set((state) => ({
          conversations: [conversation, ...state.conversations],
        })),

      updateConversation: (id, updates) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      removeConversation: (id) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          newMessages.delete(id);
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: newMessages,
            currentConversationId:
              state.currentConversationId === id ? null : state.currentConversationId,
          };
        }),

      moveConversationToFolder: (conversationId, folderId) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, folderId } : c
          ),
        })),

      // Folder actions (Feature 2)
      addFolder: (folder) =>
        set((state) => ({
          folders: [...state.folders, folder],
        })),

      updateFolder: (id, updates) =>
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        })),

      removeFolder: (id) =>
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
          // Move conversations from deleted folder to root
          conversations: state.conversations.map((c) =>
            c.folderId === id ? { ...c, folderId: null } : c
          ),
        })),

      toggleFolderExpanded: (id) =>
        set((state) => {
          const newExpanded = new Set(state.expandedFolders);
          if (newExpanded.has(id)) {
            newExpanded.delete(id);
          } else {
            newExpanded.add(id);
          }
          return { expandedFolders: newExpanded };
        }),

      reorderFolder: (id, newOrder) =>
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, order: newOrder } : f
          ),
        })),

      // Message actions
      setMessages: (conversationId, messages) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          newMessages.set(conversationId, messages);
          return { messages: newMessages };
        }),

      addMessage: (conversationId, message) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          const existing = newMessages.get(conversationId) || [];
          newMessages.set(conversationId, [...existing, message]);
          return { messages: newMessages };
        }),

      updateMessage: (conversationId, messageId, updates) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          const existing = newMessages.get(conversationId) || [];
          newMessages.set(
            conversationId,
            existing.map((m) => (m.id === messageId ? { ...m, ...updates } : m))
          );
          return { messages: newMessages };
        }),

      deleteMessage: (conversationId, messageId) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          const existing = newMessages.get(conversationId) || [];
          newMessages.set(
            conversationId,
            existing.filter((m) => m.id !== messageId)
          );
          return { messages: newMessages };
        }),

      // Input actions
      setInputValue: (value) => set({ inputValue: value }),
      setIsStreaming: (streaming) => set({ isStreaming: streaming }),
      appendStreamingContent: (content) =>
        set((state) => ({
          streamingContent: state.streamingContent + content,
        })),
      clearStreamingContent: () => set({ streamingContent: '' }),

      // Attachment actions (Feature 4)
      addAttachment: (file) =>
        set((state) => ({
          pendingAttachments: [...state.pendingAttachments, file],
        })),

      removeAttachment: (index) =>
        set((state) => ({
          pendingAttachments: state.pendingAttachments.filter((_, i) => i !== index),
        })),

      clearAttachments: () => set({ pendingAttachments: [], uploadProgress: new Map() }),

      setUploadProgress: (fileId, progress) =>
        set((state) => {
          const newProgress = new Map(state.uploadProgress);
          newProgress.set(fileId, progress);
          return { uploadProgress: newProgress };
        }),

      // Canvas actions (Feature 5)
      addCanvasItem: (item) =>
        set((state) => ({
          canvasItems: [...state.canvasItems, item],
          activeCanvasTab: item.id,
          isCanvasOpen: true,
        })),

      removeCanvasItem: (id) =>
        set((state) => {
          const newItems = state.canvasItems.filter((i) => i.id !== id);
          return {
            canvasItems: newItems,
            activeCanvasTab: newItems.length > 0 ? newItems[newItems.length - 1].id : null,
            isCanvasOpen: newItems.length > 0,
          };
        }),

      setActiveCanvasTab: (id) => set({ activeCanvasTab: id }),

      toggleCanvas: () =>
        set((state) => ({ isCanvasOpen: !state.isCanvasOpen })),

      // Agent actions (Feature 3)
      setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),

      // Search & Sort
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSortBy: (sort) => set({ sortBy: sort }),

      reset: () =>
        set({
          currentConversationId: null,
          conversations: [],
          messages: new Map(),
          folders: [],
          expandedFolders: new Set(),
          inputValue: '',
          isStreaming: false,
          streamingContent: '',
          pendingAttachments: [],
          uploadProgress: new Map(),
          canvasItems: [],
          activeCanvasTab: null,
          isCanvasOpen: false,
          selectedAgentId: 'chat',
          searchQuery: '',
          sortBy: 'date',
        }),
    }),
    {
      name: 'zentoria-chat-v2',
      partialize: (state) => ({
        conversations: state.conversations.slice(0, 50),
        folders: state.folders,
        selectedAgentId: state.selectedAgentId,
        sortBy: state.sortBy,
      }),
    }
  )
);

// ============================
// Selector Functions (PERF-011)
// ============================

/** Select messages for the current conversation */
export const selectCurrentMessages = (state: ChatState): ChatMessage[] => {
  if (!state.currentConversationId) return [];
  return state.messages.get(state.currentConversationId) || [];
};

/** Select the current conversation object */
export const selectCurrentConversation = (state: ChatState): EnhancedConversation | null => {
  if (!state.currentConversationId) return null;
  return state.conversations.find((c) => c.id === state.currentConversationId) || null;
};

/** Select conversations in a specific folder */
export const selectConversationsByFolder = (folderId: string | null) => (state: ChatState) => {
  return state.conversations
    .filter((c) => c.folderId === folderId && !c.archived)
    .sort((a, b) => {
      switch (state.sortBy) {
        case 'name':
          return a.title.localeCompare(b.title);
        case 'agent':
          return a.agentId.localeCompare(b.agentId);
        case 'date':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
};

/** Select filtered conversations (search) */
export const selectFilteredConversations = (state: ChatState) => {
  if (!state.searchQuery) return state.conversations;
  const query = state.searchQuery.toLowerCase();
  return state.conversations.filter((c) =>
    c.title.toLowerCase().includes(query) ||
    c.lastMessage?.toLowerCase().includes(query)
  );
};

/** Select folders sorted by order */
export const selectSortedFolders = (state: ChatState) => {
  return [...state.folders].sort((a, b) => a.order - b.order);
};

/** Select streaming state */
export const selectStreamingState = (state: ChatState) => ({
  isStreaming: state.isStreaming,
  streamingContent: state.streamingContent,
});

/** Select canvas state */
export const selectCanvasState = (state: ChatState) => ({
  canvasItems: state.canvasItems,
  activeCanvasTab: state.activeCanvasTab,
  isCanvasOpen: state.isCanvasOpen,
});

/** Select attachment state */
export const selectAttachmentState = (state: ChatState) => ({
  pendingAttachments: state.pendingAttachments,
  uploadProgress: state.uploadProgress,
});

// ============================
// Custom Hooks with Shallow Comparison
// ============================

export const useStreamingState = () =>
  useChatStore(useShallow(selectStreamingState));

export const useCanvasState = () =>
  useChatStore(useShallow(selectCanvasState));

export const useAttachmentState = () =>
  useChatStore(useShallow(selectAttachmentState));

export const useChatActions = () =>
  useChatStore(
    useShallow((state) => ({
      setCurrentConversation: state.setCurrentConversation,
      addConversation: state.addConversation,
      updateConversation: state.updateConversation,
      removeConversation: state.removeConversation,
      moveConversationToFolder: state.moveConversationToFolder,
      addFolder: state.addFolder,
      updateFolder: state.updateFolder,
      removeFolder: state.removeFolder,
      toggleFolderExpanded: state.toggleFolderExpanded,
      addMessage: state.addMessage,
      updateMessage: state.updateMessage,
      deleteMessage: state.deleteMessage,
      setInputValue: state.setInputValue,
      setIsStreaming: state.setIsStreaming,
      appendStreamingContent: state.appendStreamingContent,
      clearStreamingContent: state.clearStreamingContent,
      addAttachment: state.addAttachment,
      removeAttachment: state.removeAttachment,
      clearAttachments: state.clearAttachments,
      addCanvasItem: state.addCanvasItem,
      removeCanvasItem: state.removeCanvasItem,
      setActiveCanvasTab: state.setActiveCanvasTab,
      toggleCanvas: state.toggleCanvas,
      setSelectedAgent: state.setSelectedAgent,
      reset: state.reset,
    }))
  );

export const useFolderActions = () =>
  useChatStore(
    useShallow((state) => ({
      addFolder: state.addFolder,
      updateFolder: state.updateFolder,
      removeFolder: state.removeFolder,
      toggleFolderExpanded: state.toggleFolderExpanded,
      reorderFolder: state.reorderFolder,
      expandedFolders: state.expandedFolders,
    }))
  );
```

### 2.2 Agent Store (Feature 3 & 6)

**File:** `src/stores/agent-store.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

// ============================
// Types
// ============================

interface Agent {
  id: string;
  name: string;
  description: string;
  icon: string;
  capabilities: string[];
  defaultModel: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  isActive: boolean;
  color: string;
}

interface Model {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'local' | 'ollama';
  contextWindow: number;
  inputPrice?: number;  // per 1M tokens
  outputPrice?: number; // per 1M tokens
  capabilities: ('chat' | 'code' | 'vision' | 'function-calling')[];
  isAvailable: boolean;
}

// ============================
// Agent Store State
// ============================

interface AgentState {
  // Available agents
  agents: Agent[];

  // Available models
  models: Model[];

  // Per-agent settings override
  agentSettings: Map<string, Partial<Agent>>;

  // Default selections
  defaultAgentId: string;
  defaultModelId: string;

  // Actions
  setAgents: (agents: Agent[]) => void;
  setModels: (models: Model[]) => void;
  updateAgentSettings: (agentId: string, settings: Partial<Agent>) => void;
  setDefaultAgent: (agentId: string) => void;
  setDefaultModel: (modelId: string) => void;
  getAgentById: (id: string) => Agent | undefined;
  getModelById: (id: string) => Model | undefined;
  getEffectiveAgentSettings: (agentId: string) => Agent | undefined;
}

// ============================
// Default Agents
// ============================

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'chat',
    name: 'Chat Agent',
    description: 'General conversation and assistance',
    icon: 'message-square',
    capabilities: ['conversation', 'research', 'writing'],
    defaultModel: 'llama3.2:3b',
    isActive: true,
    color: '#FF6B35',
  },
  {
    id: 'code',
    name: 'Code Agent',
    description: 'Code generation, review, and debugging',
    icon: 'code',
    capabilities: ['code-generation', 'debugging', 'refactoring'],
    defaultModel: 'codellama:7b',
    systemPrompt: 'You are an expert programmer. Help with coding tasks.',
    temperature: 0.3,
    isActive: true,
    color: '#10B981',
  },
  {
    id: 'file',
    name: 'File Agent',
    description: 'File management and analysis',
    icon: 'folder',
    capabilities: ['file-analysis', 'organization', 'search'],
    defaultModel: 'llama3.2:3b',
    isActive: true,
    color: '#3B82F6',
  },
  {
    id: 'search',
    name: 'Search Agent',
    description: 'Semantic search across documents',
    icon: 'search',
    capabilities: ['semantic-search', 'retrieval', 'summarization'],
    defaultModel: 'nomic-embed-text',
    isActive: true,
    color: '#8B5CF6',
  },
  {
    id: 'workflow',
    name: 'Workflow Agent',
    description: 'Automation and workflow management',
    icon: 'workflow',
    capabilities: ['automation', 'scheduling', 'integration'],
    defaultModel: 'llama3.2:3b',
    isActive: false,
    color: '#F59E0B',
  },
];

// ============================
// Default Models
// ============================

const DEFAULT_MODELS: Model[] = [
  {
    id: 'llama3.2:3b',
    name: 'Llama 3.2 3B',
    provider: 'ollama',
    contextWindow: 128000,
    capabilities: ['chat'],
    isAvailable: true,
  },
  {
    id: 'codellama:7b',
    name: 'CodeLlama 7B',
    provider: 'ollama',
    contextWindow: 16384,
    capabilities: ['chat', 'code'],
    isAvailable: true,
  },
  {
    id: 'nomic-embed-text',
    name: 'Nomic Embed Text',
    provider: 'ollama',
    contextWindow: 8192,
    capabilities: ['chat'],
    isAvailable: true,
  },
];

// ============================
// Store Implementation
// ============================

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: DEFAULT_AGENTS,
      models: DEFAULT_MODELS,
      agentSettings: new Map(),
      defaultAgentId: 'chat',
      defaultModelId: 'llama3.2:3b',

      setAgents: (agents) => set({ agents }),

      setModels: (models) => set({ models }),

      updateAgentSettings: (agentId, settings) =>
        set((state) => {
          const newSettings = new Map(state.agentSettings);
          const existing = newSettings.get(agentId) || {};
          newSettings.set(agentId, { ...existing, ...settings });
          return { agentSettings: newSettings };
        }),

      setDefaultAgent: (agentId) => set({ defaultAgentId: agentId }),

      setDefaultModel: (modelId) => set({ defaultModelId: modelId }),

      getAgentById: (id) => get().agents.find((a) => a.id === id),

      getModelById: (id) => get().models.find((m) => m.id === id),

      getEffectiveAgentSettings: (agentId) => {
        const { agents, agentSettings } = get();
        const baseAgent = agents.find((a) => a.id === agentId);
        if (!baseAgent) return undefined;

        const overrides = agentSettings.get(agentId) || {};
        return { ...baseAgent, ...overrides };
      },
    }),
    {
      name: 'zentoria-agents',
      partialize: (state) => ({
        agentSettings: Object.fromEntries(state.agentSettings),
        defaultAgentId: state.defaultAgentId,
        defaultModelId: state.defaultModelId,
      }),
    }
  )
);

// ============================
// Selectors
// ============================

export const selectActiveAgents = (state: AgentState) =>
  state.agents.filter((a) => a.isActive);

export const selectAvailableModels = (state: AgentState) =>
  state.models.filter((m) => m.isAvailable);

export const selectDefaultAgent = (state: AgentState) =>
  state.agents.find((a) => a.id === state.defaultAgentId);

export const selectDefaultModel = (state: AgentState) =>
  state.models.find((m) => m.id === state.defaultModelId);

// ============================
// Custom Hooks
// ============================

export const useAgentActions = () =>
  useAgentStore(
    useShallow((state) => ({
      updateAgentSettings: state.updateAgentSettings,
      setDefaultAgent: state.setDefaultAgent,
      setDefaultModel: state.setDefaultModel,
    }))
  );

export const useCurrentAgent = (agentId: string) =>
  useAgentStore((state) => state.getEffectiveAgentSettings(agentId));
```

### 2.3 Settings Store Enhancement (Feature 6)

**File:** `src/stores/settings-store.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { SystemSettings } from '@/types';

// ============================
// AI Settings Type (Enhanced)
// ============================

interface AISettings {
  defaultModel: string;
  defaultAgent: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  streamingEnabled: boolean;
  autoTitleGeneration: boolean;
  saveHistory: boolean;
  ragEnabled: boolean;
  embeddingModel: string;
}

// ============================
// Settings Store State
// ============================

interface SettingsState {
  // System settings (API-backed)
  systemSettings: SystemSettings | null;
  isLoading: boolean;
  hasChanges: boolean;

  // Local AI settings (persisted locally)
  aiSettings: AISettings;

  // Pending changes (not yet saved)
  pendingChanges: Partial<SystemSettings>;

  // Actions
  setSystemSettings: (settings: SystemSettings) => void;
  updatePendingChange: <T extends keyof SystemSettings>(
    section: T,
    key: keyof SystemSettings[T],
    value: unknown
  ) => void;
  clearPendingChanges: () => void;
  setLoading: (loading: boolean) => void;

  // AI Settings actions
  updateAISettings: (updates: Partial<AISettings>) => void;
  resetAISettings: () => void;

  // Getters
  getValue: <T extends keyof SystemSettings>(
    section: T,
    key: keyof SystemSettings[T]
  ) => unknown;
}

// ============================
// Default AI Settings
// ============================

const DEFAULT_AI_SETTINGS: AISettings = {
  defaultModel: 'llama3.2:3b',
  defaultAgent: 'chat',
  temperature: 0.7,
  maxTokens: 4096,
  streamingEnabled: true,
  autoTitleGeneration: true,
  saveHistory: true,
  ragEnabled: true,
  embeddingModel: 'nomic-embed-text',
};

// ============================
// Store Implementation
// ============================

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      systemSettings: null,
      isLoading: false,
      hasChanges: false,
      aiSettings: DEFAULT_AI_SETTINGS,
      pendingChanges: {},

      setSystemSettings: (settings) =>
        set({
          systemSettings: settings,
          pendingChanges: {},
          hasChanges: false,
        }),

      updatePendingChange: (section, key, value) =>
        set((state) => ({
          pendingChanges: {
            ...state.pendingChanges,
            [section]: {
              ...((state.pendingChanges as Record<string, Record<string, unknown>>)[section] ||
                  (state.systemSettings as Record<string, Record<string, unknown>>)?.[section] || {}),
              [key]: value,
            },
          },
          hasChanges: true,
        })),

      clearPendingChanges: () =>
        set({
          pendingChanges: {},
          hasChanges: false,
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      updateAISettings: (updates) =>
        set((state) => ({
          aiSettings: { ...state.aiSettings, ...updates },
        })),

      resetAISettings: () =>
        set({ aiSettings: DEFAULT_AI_SETTINGS }),

      getValue: (section, key) => {
        const { pendingChanges, systemSettings } = get();
        const pending = (pendingChanges as Record<string, Record<string, unknown>>)?.[section];
        const original = (systemSettings as Record<string, Record<string, unknown>>)?.[section];

        if (pending?.[key as string] !== undefined) {
          return pending[key as string];
        }
        return original?.[key as string];
      },
    }),
    {
      name: 'zentoria-settings',
      partialize: (state) => ({
        aiSettings: state.aiSettings,
      }),
    }
  )
);

// ============================
// Selectors
// ============================

export const selectAISettings = (state: SettingsState) => state.aiSettings;

export const selectHasChanges = (state: SettingsState) => state.hasChanges;

export const selectPendingChanges = (state: SettingsState) => state.pendingChanges;

// ============================
// Custom Hooks
// ============================

export const useAISettings = () =>
  useSettingsStore(useShallow(selectAISettings));

export const useSettingsActions = () =>
  useSettingsStore(
    useShallow((state) => ({
      setSystemSettings: state.setSystemSettings,
      updatePendingChange: state.updatePendingChange,
      clearPendingChanges: state.clearPendingChanges,
      updateAISettings: state.updateAISettings,
      resetAISettings: state.resetAISettings,
      getValue: state.getValue,
    }))
  );
```

---

## 3. Component Specifications

### 3.1 Enhanced Chat Components

#### MessageBubble (Enhanced)

**File:** `src/components/chat/message-bubble.tsx`

```typescript
interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onCopy?: (content: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
  onSendToCanvas?: (content: string, type: CanvasItem['type']) => void;
  showTimestamp?: boolean;
  showActions?: boolean;
}

// Features:
// - Avatar (user or AI agent icon)
// - Markdown rendering with syntax highlighting
// - Streaming indicator with animated dots
// - Copy, edit, regenerate actions
// - Send code blocks to canvas
// - Token count display
// - Timestamp (optional)
// - Message metadata (model, duration)
```

#### AgentSelector (Feature 3)

**File:** `src/components/chat/agent-selector.tsx`

```typescript
interface AgentSelectorProps {
  value: string;
  onChange: (agentId: string) => void;
  disabled?: boolean;
  showDescription?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

// Features:
// - Dropdown with agent cards
// - Agent icon, name, description
// - Capabilities badges
// - Current selection badge in header
// - Keyboard navigation
// - Search/filter agents
```

#### FileDropZone (Feature 4)

**File:** `src/components/chat/file-drop-zone.tsx`

```typescript
interface FileDropZoneProps {
  onDrop: (files: File[]) => void;
  accept?: string[];
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  children: React.ReactNode;
}

// Features:
// - Visual feedback on drag over
// - File type validation
// - Size validation
// - Multiple file support
// - Preview generation
// - Progress indicators
```

#### CanvasPanel (Feature 5)

**File:** `src/components/chat/canvas-panel.tsx`

```typescript
interface CanvasPanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: CanvasItem[];
  activeTabId: string | null;
  onTabChange: (id: string) => void;
  onItemRemove: (id: string) => void;
}

// Features:
// - Tabbed interface
// - Code preview with syntax highlighting
// - File preview (images, PDFs)
// - Mermaid diagram rendering
// - HTML preview (sandboxed)
// - JSON tree viewer
// - Copy/download actions
// - Resizable width
```

### 3.2 Sidebar Components (Feature 2)

#### FolderTree

**File:** `src/components/sidebar/folder-tree.tsx`

```typescript
interface FolderTreeProps {
  folders: ChatFolder[];
  conversations: EnhancedConversation[];
  expandedFolders: Set<string>;
  currentConversationId: string | null;
  onFolderToggle: (folderId: string) => void;
  onFolderCreate: (parentId: string | null) => void;
  onFolderRename: (folderId: string, name: string) => void;
  onFolderDelete: (folderId: string) => void;
  onConversationSelect: (id: string) => void;
  onConversationMove: (conversationId: string, folderId: string | null) => void;
}

// Features:
// - Recursive folder rendering
// - Expand/collapse animation
// - Drag-drop conversations
// - Context menu (rename, delete)
// - Folder icons with state
// - Conversation count badges
```

#### SessionItem (Draggable)

**File:** `src/components/sidebar/session-item.tsx`

```typescript
interface SessionItemProps {
  conversation: EnhancedConversation;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: (e: DragEvent) => void;
}

// Features:
// - Drag handle
// - Agent icon badge
// - Title with truncation
// - Relative timestamp
// - Hover actions (delete, rename)
// - Active state styling
// - Drag preview
```

### 3.3 Settings Components (Feature 6)

#### AgentConfigPanel

**File:** `src/components/settings/agent-config-panel.tsx`

```typescript
interface AgentConfigPanelProps {
  agent: Agent;
  settings: Partial<Agent>;
  onSettingsChange: (settings: Partial<Agent>) => void;
  availableModels: Model[];
}

// Features:
// - Agent icon and description
// - Model selector dropdown
// - Temperature slider
// - Max tokens input
// - System prompt editor
// - Template presets
// - Reset to defaults
```

#### ModelSelector

**File:** `src/components/settings/model-selector.tsx`

```typescript
interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  models: Model[];
  showDetails?: boolean;
}

// Features:
// - Model dropdown with search
// - Provider badges
// - Context window info
// - Pricing info (if applicable)
// - Availability indicator
// - Capability badges
```

---

## 4. Storybook Stories Structure

### Directory Structure

```
frontend/
+-- .storybook/
|   +-- main.ts
|   +-- preview.ts
|   +-- preview-head.html
|
+-- src/
    +-- stories/
        +-- Introduction.mdx
        +-- Changelog.mdx
        |
        +-- components/
        |   +-- ui/
        |   |   +-- Button.stories.tsx
        |   |   +-- Badge.stories.tsx
        |   |   +-- Card.stories.tsx
        |   |   +-- Input.stories.tsx
        |   |   +-- Dialog.stories.tsx
        |   |   +-- Tabs.stories.tsx
        |   |   +-- ScrollArea.stories.tsx
        |   |
        |   +-- chat/
        |   |   +-- MessageBubble.stories.tsx
        |   |   +-- AgentSelector.stories.tsx
        |   |   +-- FileDropZone.stories.tsx
        |   |   +-- CanvasPanel.stories.tsx
        |   |   +-- ChatInput.stories.tsx
        |   |   +-- StreamingMessage.stories.tsx
        |   |
        |   +-- sidebar/
        |   |   +-- FolderTree.stories.tsx
        |   |   +-- SessionItem.stories.tsx
        |   |   +-- ChatSidebar.stories.tsx
        |   |
        |   +-- settings/
        |       +-- AgentConfigPanel.stories.tsx
        |       +-- ModelSelector.stories.tsx
        |       +-- SettingsForm.stories.tsx
        |
        +-- pages/
            +-- ChatPage.stories.tsx
            +-- SettingsPage.stories.tsx
            +-- DashboardPage.stories.tsx
```

### Story Template

```typescript
// src/stories/components/chat/MessageBubble.stories.tsx

import type { Meta, StoryObj } from '@storybook/react';
import { MessageBubble } from '@/components/chat/message-bubble';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof MessageBubble> = {
  title: 'Components/Chat/MessageBubble',
  component: MessageBubble,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Displays a single chat message with markdown support, actions, and streaming.',
      },
    },
  },
  argTypes: {
    message: {
      description: 'The message object to display',
    },
    isStreaming: {
      control: 'boolean',
      description: 'Shows streaming indicator',
    },
    showTimestamp: {
      control: 'boolean',
      description: 'Show message timestamp',
    },
    showActions: {
      control: 'boolean',
      description: 'Show action buttons on hover',
    },
  },
};

export default meta;
type Story = StoryObj<typeof MessageBubble>;

// User message
export const UserMessage: Story = {
  args: {
    message: {
      id: '1',
      conversationId: 'conv_1',
      role: 'user',
      content: 'Hello, how can you help me today?',
      createdAt: new Date().toISOString(),
    },
    showTimestamp: true,
    showActions: true,
  },
};

// AI message with markdown
export const AIMessageWithMarkdown: Story = {
  args: {
    message: {
      id: '2',
      conversationId: 'conv_1',
      role: 'assistant',
      content: `# Hello!

I can help you with:

- **Coding** - Write, review, and debug code
- **Analysis** - Analyze data and documents
- **Writing** - Draft emails, documents, and more

Here's a code example:

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

Let me know what you need!`,
      createdAt: new Date().toISOString(),
      metadata: {
        model: 'llama3.2:3b',
        tokensUsed: 156,
        duration: 2.3,
      },
    },
    showTimestamp: true,
    showActions: true,
  },
};

// Streaming message
export const StreamingMessage: Story = {
  args: {
    message: {
      id: '3',
      conversationId: 'conv_1',
      role: 'assistant',
      content: 'I am currently processing your request...',
      createdAt: new Date().toISOString(),
    },
    isStreaming: true,
  },
};

// Interactive test
export const CopyAction: Story = {
  ...AIMessageWithMarkdown,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Hover to show actions
    const bubble = canvas.getByRole('article');
    await userEvent.hover(bubble);

    // Click copy button
    const copyButton = canvas.getByRole('button', { name: /copy/i });
    await userEvent.click(copyButton);

    // Verify copied state
    await expect(canvas.getByRole('button', { name: /copied/i })).toBeInTheDocument();
  },
};
```

### Storybook Configuration

```typescript
// .storybook/main.ts
import type { StorybookConfig } from '@storybook/nextjs';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
    '@storybook/addon-designs',
  ],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  staticDirs: ['../public'],
};

export default config;
```

```typescript
// .storybook/preview.ts
import type { Preview } from '@storybook/react';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#08080f' },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[rgb(var(--background))] text-[rgb(var(--foreground))] p-4">
        <Story />
      </div>
    ),
  ],
};

export default preview;
```

---

## 5. Accessibility Requirements

### WCAG 2.1 AA Compliance Checklist

#### 5.1 Perceivable

| Requirement | Implementation |
|-------------|----------------|
| **1.1.1 Non-text Content** | Alt text on all images; ARIA labels on icons |
| **1.3.1 Info and Relationships** | Semantic HTML; proper heading hierarchy; form labels |
| **1.3.2 Meaningful Sequence** | Logical DOM order; skip links |
| **1.4.1 Use of Color** | Never rely solely on color; icons + text |
| **1.4.3 Contrast (Minimum)** | 4.5:1 for text; 3:1 for large text |
| **1.4.4 Resize Text** | Support up to 200% zoom |
| **1.4.10 Reflow** | No horizontal scroll at 320px width |
| **1.4.11 Non-text Contrast** | 3:1 for UI components |

#### 5.2 Operable

| Requirement | Implementation |
|-------------|----------------|
| **2.1.1 Keyboard** | All interactive elements keyboard accessible |
| **2.1.2 No Keyboard Trap** | Focus can be moved away from any component |
| **2.4.1 Bypass Blocks** | Skip to main content link |
| **2.4.3 Focus Order** | Logical tab order |
| **2.4.6 Headings and Labels** | Descriptive headings and form labels |
| **2.4.7 Focus Visible** | Clear focus indicators (2px outline) |
| **2.5.3 Label in Name** | Accessible name includes visible label |

#### 5.3 Understandable

| Requirement | Implementation |
|-------------|----------------|
| **3.1.1 Language of Page** | `lang` attribute on `<html>` |
| **3.2.1 On Focus** | No unexpected context changes |
| **3.2.2 On Input** | No unexpected context changes |
| **3.3.1 Error Identification** | Clear error messages |
| **3.3.2 Labels or Instructions** | Form fields have labels |

#### 5.4 Robust

| Requirement | Implementation |
|-------------|----------------|
| **4.1.1 Parsing** | Valid HTML |
| **4.1.2 Name, Role, Value** | ARIA attributes where needed |

### Component-Specific Accessibility

#### Chat Interface

```typescript
// MessageBubble accessibility
<article
  role="article"
  aria-label={`${message.role === 'user' ? 'Your' : 'Assistant'} message`}
  aria-describedby={`message-time-${message.id}`}
>
  <div aria-hidden="true">{/* Avatar */}</div>
  <div role="region" aria-live={isStreaming ? 'polite' : 'off'}>
    {content}
  </div>
  <time id={`message-time-${message.id}`} dateTime={message.createdAt}>
    {formattedTime}
  </time>
</article>

// Chat input accessibility
<form role="form" aria-label="Send message">
  <label htmlFor="chat-input" className="sr-only">
    Type your message
  </label>
  <textarea
    id="chat-input"
    aria-describedby="chat-input-hint"
    aria-invalid={hasError}
    aria-errormessage={hasError ? 'chat-input-error' : undefined}
  />
  <span id="chat-input-hint" className="sr-only">
    Press Enter to send, Shift+Enter for new line
  </span>
  <button
    type="submit"
    aria-label={isStreaming ? 'Stop generation' : 'Send message'}
    aria-busy={isStreaming}
  >
    {isStreaming ? <StopIcon /> : <SendIcon aria-hidden="true" />}
  </button>
</form>
```

#### Agent Selector

```typescript
<div role="listbox" aria-label="Select AI agent" aria-activedescendant={`agent-${selectedId}`}>
  {agents.map((agent) => (
    <div
      key={agent.id}
      id={`agent-${agent.id}`}
      role="option"
      aria-selected={agent.id === selectedId}
      aria-describedby={`agent-desc-${agent.id}`}
    >
      <span>{agent.name}</span>
      <span id={`agent-desc-${agent.id}`} className="sr-only">
        {agent.description}
      </span>
    </div>
  ))}
</div>
```

#### Folder Tree

```typescript
<nav aria-label="Chat folders">
  <ul role="tree" aria-label="Conversation folders">
    {folders.map((folder) => (
      <li
        key={folder.id}
        role="treeitem"
        aria-expanded={isExpanded}
        aria-selected={isSelected}
        aria-level={level}
      >
        <button
          aria-label={`${folder.name} folder, ${conversationCount} conversations`}
          onClick={handleToggle}
        >
          {folder.name}
        </button>
        {isExpanded && (
          <ul role="group" aria-label={`${folder.name} contents`}>
            {/* Nested items */}
          </ul>
        )}
      </li>
    ))}
  </ul>
</nav>
```

### Keyboard Navigation Map

| Component | Key | Action |
|-----------|-----|--------|
| **Chat Input** | Enter | Send message |
| | Shift+Enter | New line |
| | Escape | Cancel/clear |
| | Ctrl+/ | Open command palette |
| **Message List** | ArrowUp/Down | Navigate messages |
| | Tab | Move to actions |
| | c | Copy message |
| | e | Edit message |
| | r | Regenerate |
| **Agent Selector** | ArrowUp/Down | Navigate options |
| | Enter/Space | Select agent |
| | Escape | Close dropdown |
| **Folder Tree** | ArrowUp/Down | Navigate folders |
| | ArrowRight | Expand folder |
| | ArrowLeft | Collapse folder |
| | Enter | Select item |
| | F2 | Rename |
| | Delete | Delete (with confirm) |
| **Canvas Panel** | Tab | Switch tabs |
| | Escape | Close panel |
| | Ctrl+C | Copy content |

### Focus Management

```typescript
// Custom hook for focus management
function useFocusTrap(containerRef: RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, isActive]);
}
```

---

## 6. Responsive Design

### Breakpoints

```typescript
// tailwind.config.js extension
const breakpoints = {
  'xs': '320px',   // Small phones
  'sm': '640px',   // Large phones
  'md': '768px',   // Tablets
  'lg': '1024px',  // Small laptops
  'xl': '1280px',  // Desktops
  '2xl': '1536px', // Large screens
};
```

### Layout Behavior by Breakpoint

#### Mobile (320px - 639px)

```
+---------------------------+
| Header (sticky)           |
+---------------------------+
|                           |
|    Messages (full)        |
|                           |
+---------------------------+
| Input Area                |
+---------------------------+
| Bottom Nav (Sidebar btn)  |
+---------------------------+

- Sidebar: Drawer overlay (left)
- Canvas: Full-screen overlay
- Agent selector: Full-width dropdown
- Message actions: Bottom sheet
```

#### Tablet (640px - 1023px)

```
+-------+-------------------+
| Side  |                   |
| bar   |    Messages       |
| (col- |                   |
| laps- |                   |
| ible) |                   |
|       +-------------------+
|       | Input Area        |
+-------+-------------------+

- Sidebar: Collapsible (icon-only mode)
- Canvas: Slide-in panel (right, 50% width)
- Agent selector: Dropdown in header
- Folders: Collapsible with icons
```

#### Desktop (1024px+)

```
+--------+------------------+----------+
|        |                  |          |
| Side-  |    Messages      | Canvas   |
| bar    |                  | Panel    |
| (full) |                  | (split)  |
|        |                  |          |
|        +------------------+          |
|        | Input Area       |          |
+--------+------------------+----------+

- Sidebar: Full width (256px)
- Canvas: Split view (30-50% width, resizable)
- Agent selector: Full dropdown with descriptions
- Folders: Full tree view with drag-drop
```

### Responsive Component Examples

#### ChatLayout (Responsive)

```tsx
function ChatLayout({ children }: { children: React.ReactNode }) {
  const { isCanvasOpen, canvasItems } = useCanvasState();
  const isMobile = useMediaQuery('(max-width: 639px)');
  const isTablet = useMediaQuery('(min-width: 640px) and (max-width: 1023px)');

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 lg:gap-4">
      {/* Chat sidebar - desktop only */}
      <ChatSidebar className="hidden lg:flex w-64 shrink-0" />

      {/* Main chat area */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        isCanvasOpen && !isMobile && 'lg:flex-[2]'
      )}>
        <ChatHeader />
        <MessageArea />
        <ChatInputArea />
      </div>

      {/* Canvas panel */}
      {isCanvasOpen && (
        <>
          {/* Mobile: Full overlay */}
          {isMobile && (
            <Sheet open={isCanvasOpen} onOpenChange={toggleCanvas}>
              <SheetContent side="bottom" className="h-[80vh]">
                <CanvasPanel items={canvasItems} />
              </SheetContent>
            </Sheet>
          )}

          {/* Tablet: Side panel */}
          {isTablet && (
            <Sheet open={isCanvasOpen} onOpenChange={toggleCanvas}>
              <SheetContent side="right" className="w-[50%]">
                <CanvasPanel items={canvasItems} />
              </SheetContent>
            </Sheet>
          )}

          {/* Desktop: Split view */}
          {!isMobile && !isTablet && (
            <ResizablePanel
              defaultSize={35}
              minSize={25}
              maxSize={50}
              className="hidden lg:block"
            >
              <CanvasPanel items={canvasItems} />
            </ResizablePanel>
          )}
        </>
      )}

      {/* Mobile sidebar drawer */}
      <MobileSidebarDrawer className="lg:hidden" />
    </div>
  );
}
```

#### MessageBubble (Responsive)

```tsx
function MessageBubble({ message, ...props }: MessageBubbleProps) {
  const isMobile = useMediaQuery('(max-width: 639px)');

  return (
    <div className={cn(
      'flex gap-2 sm:gap-3',
      message.role === 'user' && 'flex-row-reverse'
    )}>
      {/* Avatar - smaller on mobile */}
      <Avatar className="w-7 h-7 sm:w-8 sm:h-8 shrink-0">
        {/* ... */}
      </Avatar>

      {/* Content bubble */}
      <div className={cn(
        'max-w-[90%] sm:max-w-[85%] lg:max-w-[75%]',
        message.role === 'user' ? 'message-user' : 'message-ai'
      )}>
        <MarkdownContent content={message.content} />

        {/* Actions - different on mobile */}
        {isMobile ? (
          <MobileActionSheet message={message} />
        ) : (
          <HoverActions message={message} />
        )}
      </div>
    </div>
  );
}
```

### Touch Interactions

```typescript
// Swipe gesture hook for mobile
function useSwipeGesture(onSwipeLeft?: () => void, onSwipeRight?: () => void) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && onSwipeLeft) onSwipeLeft();
    if (isRightSwipe && onSwipeRight) onSwipeRight();
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}

// Usage in SessionItem for swipe-to-delete
function SessionItem({ conversation, onDelete }: SessionItemProps) {
  const [showDelete, setShowDelete] = useState(false);

  const swipeHandlers = useSwipeGesture(
    () => setShowDelete(true),  // Swipe left to reveal delete
    () => setShowDelete(false)  // Swipe right to hide
  );

  return (
    <div {...swipeHandlers} className="relative overflow-hidden">
      <div className={cn(
        'transition-transform',
        showDelete && '-translate-x-20'
      )}>
        {/* Session content */}
      </div>
      <button
        className="absolute right-0 top-0 bottom-0 w-20 bg-red-500 text-white"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}
```

### CSS Custom Properties for Responsive Values

```css
/* globals.css */
:root {
  /* Spacing */
  --spacing-page-x: 1rem;
  --spacing-page-y: 1rem;
  --spacing-card: 1rem;

  /* Sizes */
  --sidebar-width: 0px;
  --header-height: 3.5rem;
  --input-height: 3rem;

  /* Chat */
  --message-max-width: 90%;
  --avatar-size: 1.75rem;
}

@media (min-width: 640px) {
  :root {
    --spacing-page-x: 1.5rem;
    --spacing-page-y: 1.5rem;
    --spacing-card: 1.5rem;
    --message-max-width: 85%;
    --avatar-size: 2rem;
  }
}

@media (min-width: 768px) {
  :root {
    --sidebar-width: 4rem; /* Collapsed */
    --header-height: 4rem;
  }
}

@media (min-width: 1024px) {
  :root {
    --sidebar-width: 16rem; /* Full */
    --spacing-page-x: 2rem;
    --spacing-page-y: 2rem;
    --message-max-width: 75%;
    --avatar-size: 2.25rem;
  }
}
```

---

## Appendix: File Structure

```
frontend/src/
|
+-- app/
|   +-- chat/
|   |   +-- page.tsx              # Enhanced chat page
|   |   +-- layout.tsx            # Chat-specific layout
|   +-- settings/
|   |   +-- page.tsx              # Enhanced settings page
|   +-- layout.tsx                # Root layout
|   +-- providers.tsx             # Context providers
|   +-- globals.css               # Global styles
|
+-- components/
|   +-- ui/                       # Base UI components (shadcn)
|   |   +-- button.tsx
|   |   +-- input.tsx
|   |   +-- dialog.tsx
|   |   +-- tabs.tsx
|   |   +-- scroll-area.tsx
|   |   +-- dropdown-menu.tsx
|   |   +-- sheet.tsx
|   |   +-- resizable.tsx
|   |   +-- tooltip.tsx
|   |
|   +-- chat/                     # Chat-specific components
|   |   +-- message-bubble.tsx
|   |   +-- message-list.tsx
|   |   +-- chat-input.tsx
|   |   +-- chat-header.tsx
|   |   +-- agent-selector.tsx
|   |   +-- file-drop-zone.tsx
|   |   +-- attachment-preview.tsx
|   |   +-- streaming-message.tsx
|   |   +-- canvas-panel.tsx
|   |   +-- code-preview.tsx
|   |   +-- markdown-renderer.tsx
|   |
|   +-- sidebar/                  # Sidebar components
|   |   +-- chat-sidebar.tsx
|   |   +-- folder-tree.tsx
|   |   +-- folder-node.tsx
|   |   +-- session-item.tsx
|   |   +-- sidebar-search.tsx
|   |
|   +-- settings/                 # Settings components
|   |   +-- agent-config-panel.tsx
|   |   +-- model-selector.tsx
|   |   +-- settings-form.tsx
|   |
|   +-- layout/                   # Layout components
|       +-- app-shell.tsx
|       +-- sidebar.tsx
|       +-- header.tsx
|       +-- mobile-nav.tsx
|
+-- stores/                       # Zustand stores
|   +-- chat-store.ts             # Enhanced chat store
|   +-- agent-store.ts            # Agent/model store
|   +-- settings-store.ts         # Settings store
|   +-- app-store.ts              # Theme, sidebar, toast
|   +-- file-store.ts             # File management
|
+-- hooks/                        # Custom hooks
|   +-- use-chat.ts               # Chat mutations/queries
|   +-- use-agents.ts             # Agent queries
|   +-- use-settings.ts           # Settings mutations
|   +-- use-websocket.ts          # WebSocket connection
|   +-- use-media-query.ts        # Responsive hooks
|   +-- use-focus-trap.ts         # Accessibility
|   +-- use-swipe-gesture.ts      # Touch interactions
|
+-- lib/                          # Utilities
|   +-- api-client.ts             # API client
|   +-- utils.ts                  # Utility functions
|   +-- constants.ts              # Constants
|
+-- types/                        # TypeScript types
|   +-- index.ts                  # Shared types
|   +-- chat.ts                   # Chat types
|   +-- agent.ts                  # Agent types
|
+-- stories/                      # Storybook stories
    +-- components/
    +-- pages/
    +-- Introduction.mdx
```

---

## Implementation Priority

| Phase | Features | Estimated Effort |
|-------|----------|------------------|
| **Phase 1** | Enhanced MessageBubble, Markdown, Code highlighting | 2-3 days |
| **Phase 2** | Agent Selector (UI + store) | 1-2 days |
| **Phase 3** | File Attachments (drag-drop, preview, upload) | 2-3 days |
| **Phase 4** | Folder Tree Sidebar | 3-4 days |
| **Phase 5** | Canvas/Artifacts Panel | 3-4 days |
| **Phase 6** | Settings Page (Agent/Model persistence) | 2 days |
| **Phase 7** | Accessibility audit + fixes | 2 days |
| **Phase 8** | Responsive polish + testing | 2 days |
| **Phase 9** | Storybook documentation | 2-3 days |

**Total Estimated Effort:** 19-25 days

---

*Document generated for Zentoria Personal Edition v2.0.0*
*Architecture designed following React 19, Next.js 15, and WCAG 2.1 AA standards*
