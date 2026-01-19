/**
 * Enhanced Chat Store
 *
 * Zustand store for the Enhanced Chat Interface with:
 * - Session management with folders
 * - Agent selection
 * - Streaming state
 * - Canvas/artifacts panel
 *
 * Uses proper selector pattern (PERF-011) to prevent unnecessary re-renders.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type {
  ChatSession,
  EnhancedChatMessage,
  ProjectFolder,
  Agent,
  UserSettings,
  Canvas,
  StreamChunk,
} from '@/types';

// ============================
// State Types
// ============================

interface EnhancedChatState {
  // Sessions
  currentSessionId: string | null;
  sessions: ChatSession[];
  sessionsLoading: boolean;
  sessionsError: string | null;

  // Messages
  messages: Map<string, EnhancedChatMessage[]>;
  messagesLoading: boolean;
  messagesError: string | null;

  // Folders
  folders: ProjectFolder[];
  expandedFolders: Set<string>;
  selectedFolderId: string | null; // null = show all, 'unfiled' = unfiled only

  // Agents
  agents: Agent[];
  selectedAgentId: string | null;

  // Settings
  settings: UserSettings | null;

  // Input state
  inputValue: string;
  pendingAttachments: File[];

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;
  streamingSessionId: string | null;

  // Canvas/Artifacts panel
  canvasPanelOpen: boolean;
  activeCanvas: Canvas | null;
  canvases: Map<string, Canvas[]>; // sessionId -> canvases

  // UI state
  sidebarCollapsed: boolean;
  showArchivedSessions: boolean;
  searchQuery: string;

  // Actions
  setCurrentSession: (id: string | null) => void;
  setSessions: (sessions: ChatSession[]) => void;
  addSession: (session: ChatSession) => void;
  updateSession: (id: string, updates: Partial<ChatSession>) => void;
  removeSession: (id: string) => void;
  setSessionsLoading: (loading: boolean) => void;
  setSessionsError: (error: string | null) => void;

  setMessages: (sessionId: string, messages: EnhancedChatMessage[]) => void;
  addMessage: (sessionId: string, message: EnhancedChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<EnhancedChatMessage>) => void;
  removeMessage: (sessionId: string, messageId: string) => void;
  setMessagesLoading: (loading: boolean) => void;
  setMessagesError: (error: string | null) => void;

  setFolders: (folders: ProjectFolder[]) => void;
  toggleFolderExpanded: (folderId: string) => void;
  setSelectedFolder: (folderId: string | null) => void;

  setAgents: (agents: Agent[]) => void;
  setSelectedAgent: (agentId: string | null) => void;

  setSettings: (settings: UserSettings) => void;
  updateSettings: (updates: Partial<UserSettings>) => void;

  setInputValue: (value: string) => void;
  addAttachment: (file: File) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;

  setIsStreaming: (streaming: boolean) => void;
  setStreamingSessionId: (sessionId: string | null) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;

  setCanvasPanelOpen: (open: boolean) => void;
  setActiveCanvas: (canvas: Canvas | null) => void;
  setCanvases: (sessionId: string, canvases: Canvas[]) => void;
  addCanvas: (sessionId: string, canvas: Canvas) => void;
  updateCanvas: (sessionId: string, canvasId: string, updates: Partial<Canvas>) => void;

  setSidebarCollapsed: (collapsed: boolean) => void;
  setShowArchivedSessions: (show: boolean) => void;
  setSearchQuery: (query: string) => void;

  reset: () => void;
}

// ============================
// Initial State
// ============================

const initialState = {
  currentSessionId: null,
  sessions: [],
  sessionsLoading: false,
  sessionsError: null,

  messages: new Map(),
  messagesLoading: false,
  messagesError: null,

  folders: [],
  expandedFolders: new Set<string>(),
  selectedFolderId: null,

  agents: [],
  selectedAgentId: null,

  settings: null,

  inputValue: '',
  pendingAttachments: [],

  isStreaming: false,
  streamingContent: '',
  streamingSessionId: null,

  canvasPanelOpen: false,
  activeCanvas: null,
  canvases: new Map(),

  sidebarCollapsed: false,
  showArchivedSessions: false,
  searchQuery: '',
};

// ============================
// Store Implementation
// ============================

export const useEnhancedChatStore = create<EnhancedChatState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Session actions
      setCurrentSession: (id) => set({ currentSessionId: id }),

      setSessions: (sessions) => set({ sessions }),

      addSession: (session) =>
        set((state) => ({
          sessions: [session, ...state.sessions],
        })),

      updateSession: (id, updates) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      removeSession: (id) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          newMessages.delete(id);
          const newCanvases = new Map(state.canvases);
          newCanvases.delete(id);
          return {
            sessions: state.sessions.filter((s) => s.id !== id),
            messages: newMessages,
            canvases: newCanvases,
            currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
          };
        }),

      setSessionsLoading: (loading) => set({ sessionsLoading: loading }),
      setSessionsError: (error) => set({ sessionsError: error }),

      // Message actions
      setMessages: (sessionId, messages) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          newMessages.set(sessionId, messages);
          return { messages: newMessages };
        }),

      addMessage: (sessionId, message) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          const existing = newMessages.get(sessionId) || [];
          newMessages.set(sessionId, [...existing, message]);
          return { messages: newMessages };
        }),

      updateMessage: (sessionId, messageId, updates) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          const existing = newMessages.get(sessionId) || [];
          newMessages.set(
            sessionId,
            existing.map((m) => (m.id === messageId ? { ...m, ...updates } : m))
          );
          return { messages: newMessages };
        }),

      removeMessage: (sessionId, messageId) =>
        set((state) => {
          const newMessages = new Map(state.messages);
          const existing = newMessages.get(sessionId) || [];
          newMessages.set(
            sessionId,
            existing.filter((m) => m.id !== messageId)
          );
          return { messages: newMessages };
        }),

      setMessagesLoading: (loading) => set({ messagesLoading: loading }),
      setMessagesError: (error) => set({ messagesError: error }),

      // Folder actions
      setFolders: (folders) => set({ folders }),

      toggleFolderExpanded: (folderId) =>
        set((state) => {
          const newExpanded = new Set(state.expandedFolders);
          if (newExpanded.has(folderId)) {
            newExpanded.delete(folderId);
          } else {
            newExpanded.add(folderId);
          }
          return { expandedFolders: newExpanded };
        }),

      setSelectedFolder: (folderId) => set({ selectedFolderId: folderId }),

      // Agent actions
      setAgents: (agents) => set({ agents }),
      setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),

      // Settings actions
      setSettings: (settings) => set({ settings }),
      updateSettings: (updates) =>
        set((state) => ({
          settings: state.settings ? { ...state.settings, ...updates } : null,
        })),

      // Input actions
      setInputValue: (value) => set({ inputValue: value }),

      addAttachment: (file) =>
        set((state) => ({
          pendingAttachments: [...state.pendingAttachments, file],
        })),

      removeAttachment: (index) =>
        set((state) => ({
          pendingAttachments: state.pendingAttachments.filter((_, i) => i !== index),
        })),

      clearAttachments: () => set({ pendingAttachments: [] }),

      // Streaming actions
      setIsStreaming: (streaming) => set({ isStreaming: streaming }),
      setStreamingSessionId: (sessionId) => set({ streamingSessionId: sessionId }),

      appendStreamingContent: (content) =>
        set((state) => ({
          streamingContent: state.streamingContent + content,
        })),

      clearStreamingContent: () => set({ streamingContent: '' }),

      // Canvas actions
      setCanvasPanelOpen: (open) => set({ canvasPanelOpen: open }),
      setActiveCanvas: (canvas) => set({ activeCanvas: canvas }),

      setCanvases: (sessionId, canvases) =>
        set((state) => {
          const newCanvases = new Map(state.canvases);
          newCanvases.set(sessionId, canvases);
          return { canvases: newCanvases };
        }),

      addCanvas: (sessionId, canvas) =>
        set((state) => {
          const newCanvases = new Map(state.canvases);
          const existing = newCanvases.get(sessionId) || [];
          newCanvases.set(sessionId, [...existing, canvas]);
          return { canvases: newCanvases };
        }),

      updateCanvas: (sessionId, canvasId, updates) =>
        set((state) => {
          const newCanvases = new Map(state.canvases);
          const existing = newCanvases.get(sessionId) || [];
          newCanvases.set(
            sessionId,
            existing.map((c) => (c.id === canvasId ? { ...c, ...updates } : c))
          );
          return { canvases: newCanvases };
        }),

      // UI actions
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setShowArchivedSessions: (show) => set({ showArchivedSessions: show }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: 'zentoria-enhanced-chat',
      partialize: (state) => ({
        // Only persist UI preferences and recent session
        currentSessionId: state.currentSessionId,
        expandedFolders: Array.from(state.expandedFolders),
        selectedFolderId: state.selectedFolderId,
        sidebarCollapsed: state.sidebarCollapsed,
        canvasPanelOpen: state.canvasPanelOpen,
      }),
      onRehydrateStorage: () => (state) => {
        // Convert expandedFolders array back to Set
        if (state && Array.isArray((state as any).expandedFolders)) {
          state.expandedFolders = new Set((state as any).expandedFolders);
        }
      },
    }
  )
);

// ============================
// Selector Functions (PERF-011)
// ============================

// Stable empty arrays to prevent re-renders when returning empty results
const EMPTY_MESSAGES: EnhancedChatMessage[] = [];
const EMPTY_CANVASES: Canvas[] = [];

/** Select current session */
export const selectCurrentSession = (state: EnhancedChatState): ChatSession | null => {
  if (!state.currentSessionId) return null;
  return state.sessions.find((s) => s.id === state.currentSessionId) || null;
};

/** Select current session ID */
export const selectCurrentSessionId = (state: EnhancedChatState): string | null => {
  return state.currentSessionId;
};

/** Select messages for current session */
export const selectCurrentMessages = (state: EnhancedChatState): EnhancedChatMessage[] => {
  if (!state.currentSessionId) return EMPTY_MESSAGES;
  return state.messages.get(state.currentSessionId) || EMPTY_MESSAGES;
};

/** Select messages by session ID */
export const selectMessagesBySession = (sessionId: string) => (state: EnhancedChatState): EnhancedChatMessage[] => {
  return state.messages.get(sessionId) || EMPTY_MESSAGES;
};

/** Select filtered sessions (by folder, search, archived) */
export const selectFilteredSessions = (state: EnhancedChatState): ChatSession[] => {
  let filtered = state.sessions;

  // Filter by archived status
  if (!state.showArchivedSessions) {
    filtered = filtered.filter((s) => !s.isArchived);
  }

  // Filter by folder
  if (state.selectedFolderId === 'unfiled') {
    filtered = filtered.filter((s) => !s.folderId);
  } else if (state.selectedFolderId) {
    filtered = filtered.filter((s) => s.folderId === state.selectedFolderId);
  }

  // Filter by search
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.agent?.displayName.toLowerCase().includes(query)
    );
  }

  return filtered;
};

/** Select streaming state */
export const selectStreamingState = (state: EnhancedChatState) => ({
  isStreaming: state.isStreaming,
  streamingContent: state.streamingContent,
  streamingSessionId: state.streamingSessionId,
});

/** Select input state */
export const selectInputState = (state: EnhancedChatState) => ({
  inputValue: state.inputValue,
  pendingAttachments: state.pendingAttachments,
});

/** Select folder state */
export const selectFolderState = (state: EnhancedChatState) => ({
  folders: state.folders,
  expandedFolders: state.expandedFolders,
  selectedFolderId: state.selectedFolderId,
});

/** Select canvas state */
export const selectCanvasState = (state: EnhancedChatState) => ({
  canvasPanelOpen: state.canvasPanelOpen,
  activeCanvas: state.activeCanvas,
});

/** Select current canvases */
export const selectCurrentCanvases = (state: EnhancedChatState): Canvas[] => {
  if (!state.currentSessionId) return EMPTY_CANVASES;
  return state.canvases.get(state.currentSessionId) || EMPTY_CANVASES;
};

/** Select agents list */
export const selectAgents = (state: EnhancedChatState): Agent[] => state.agents;

/** Select current/selected agent */
export const selectCurrentAgent = (state: EnhancedChatState): Agent | null => {
  const agentId = state.selectedAgentId;
  if (!agentId) return state.agents.find((a) => a.isDefault) || null;
  return state.agents.find((a) => a.id === agentId) || null;
};

/** Select settings */
export const selectSettings = (state: EnhancedChatState): UserSettings | null => state.settings;

// ============================
// Custom Hooks with Shallow Comparison
// ============================

/** Hook for streaming state */
export const useStreamingState = () =>
  useEnhancedChatStore(useShallow(selectStreamingState));

/** Hook for input state */
export const useInputState = () =>
  useEnhancedChatStore(useShallow(selectInputState));

/** Hook for folder state */
export const useFolderState = () =>
  useEnhancedChatStore(useShallow(selectFolderState));

/** Hook for canvas state */
export const useCanvasState = () =>
  useEnhancedChatStore(useShallow(selectCanvasState));

/** Hook for actions only (no state subscription) */
export const useEnhancedChatActions = () =>
  useEnhancedChatStore(
    useShallow((state) => ({
      setCurrentSession: state.setCurrentSession,
      setSessions: state.setSessions,
      addSession: state.addSession,
      updateSession: state.updateSession,
      removeSession: state.removeSession,
      setSessionsLoading: state.setSessionsLoading,
      setSessionsError: state.setSessionsError,
      setMessages: state.setMessages,
      addMessage: state.addMessage,
      updateMessage: state.updateMessage,
      removeMessage: state.removeMessage,
      setMessagesLoading: state.setMessagesLoading,
      setMessagesError: state.setMessagesError,
      setFolders: state.setFolders,
      toggleFolderExpanded: state.toggleFolderExpanded,
      setSelectedFolder: state.setSelectedFolder,
      setAgents: state.setAgents,
      setSelectedAgent: state.setSelectedAgent,
      setSettings: state.setSettings,
      updateSettings: state.updateSettings,
      setInputValue: state.setInputValue,
      addAttachment: state.addAttachment,
      removeAttachment: state.removeAttachment,
      clearAttachments: state.clearAttachments,
      setIsStreaming: state.setIsStreaming,
      setStreamingSessionId: state.setStreamingSessionId,
      appendStreamingContent: state.appendStreamingContent,
      clearStreamingContent: state.clearStreamingContent,
      setCanvasPanelOpen: state.setCanvasPanelOpen,
      setActiveCanvas: state.setActiveCanvas,
      setCanvases: state.setCanvases,
      addCanvas: state.addCanvas,
      updateCanvas: state.updateCanvas,
      setSidebarCollapsed: state.setSidebarCollapsed,
      setShowArchivedSessions: state.setShowArchivedSessions,
      setSearchQuery: state.setSearchQuery,
      reset: state.reset,
    }))
  );
