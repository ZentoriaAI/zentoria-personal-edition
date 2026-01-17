import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { Conversation, ChatMessage } from '@/types';

// ============================
// Chat Store
// ============================

interface ChatState {
  // Current conversation
  currentConversationId: string | null;
  conversations: Conversation[];
  messages: Map<string, ChatMessage[]>; // conversationId -> messages

  // Input state
  inputValue: string;
  isStreaming: boolean;
  streamingContent: string;

  // Attachments
  pendingAttachments: File[];

  // Actions
  setCurrentConversation: (id: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;

  setMessages: (conversationId: string, messages: ChatMessage[]) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => void;

  setInputValue: (value: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;

  addAttachment: (file: File) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;

  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      currentConversationId: null,
      conversations: [],
      messages: new Map(),
      inputValue: '',
      isStreaming: false,
      streamingContent: '',
      pendingAttachments: [],

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

      setInputValue: (value) => set({ inputValue: value }),

      setIsStreaming: (streaming) => set({ isStreaming: streaming }),

      appendStreamingContent: (content) =>
        set((state) => ({
          streamingContent: state.streamingContent + content,
        })),

      clearStreamingContent: () => set({ streamingContent: '' }),

      addAttachment: (file) =>
        set((state) => ({
          pendingAttachments: [...state.pendingAttachments, file],
        })),

      removeAttachment: (index) =>
        set((state) => ({
          pendingAttachments: state.pendingAttachments.filter((_, i) => i !== index),
        })),

      clearAttachments: () => set({ pendingAttachments: [] }),

      reset: () =>
        set({
          currentConversationId: null,
          conversations: [],
          messages: new Map(),
          inputValue: '',
          isStreaming: false,
          streamingContent: '',
          pendingAttachments: [],
        }),
    }),
    {
      name: 'zentoria-chat',
      partialize: (state) => ({
        conversations: state.conversations.slice(0, 20), // Only persist recent conversations
      }),
    }
  )
);

// ============================
// Selector Functions (PERF-011)
// ============================

/**
 * PERF-011: Proper Zustand selector pattern
 *
 * Use these selectors with useChatStore() to subscribe to specific state:
 *   const messages = useChatStore(selectCurrentMessages);
 *   const conversation = useChatStore(selectCurrentConversation);
 *
 * This ensures components only re-render when their subscribed state changes.
 */

/** Select messages for the current conversation */
export const selectCurrentMessages = (state: ChatState): ChatMessage[] => {
  if (!state.currentConversationId) return [];
  return state.messages.get(state.currentConversationId) || [];
};

/** Select the current conversation object */
export const selectCurrentConversation = (state: ChatState): Conversation | null => {
  if (!state.currentConversationId) return null;
  return state.conversations.find((c) => c.id === state.currentConversationId) || null;
};

/** Select conversation by ID */
export const selectConversationById = (id: string) => (state: ChatState): Conversation | null => {
  return state.conversations.find((c) => c.id === id) || null;
};

/** Select messages by conversation ID */
export const selectMessagesByConversation = (id: string) => (state: ChatState): ChatMessage[] => {
  return state.messages.get(id) || [];
};

/** Select streaming state */
export const selectStreamingState = (state: ChatState) => ({
  isStreaming: state.isStreaming,
  streamingContent: state.streamingContent,
});

/** Select input state */
export const selectInputState = (state: ChatState) => ({
  inputValue: state.inputValue,
  pendingAttachments: state.pendingAttachments,
});

/** Select conversation list only */
export const selectConversations = (state: ChatState): Conversation[] => state.conversations;

/** Select current conversation ID only */
export const selectCurrentConversationId = (state: ChatState): string | null =>
  state.currentConversationId;

// ============================
// Custom Hooks with Shallow Comparison
// ============================

/**
 * Hook for streaming state with shallow comparison
 * Prevents re-renders when other state changes
 */
export const useStreamingState = () =>
  useChatStore(useShallow(selectStreamingState));

/**
 * Hook for input state with shallow comparison
 */
export const useInputState = () =>
  useChatStore(useShallow(selectInputState));

/**
 * Hook for conversation actions only (no state subscription)
 * Use when you only need to dispatch actions
 */
export const useChatActions = () =>
  useChatStore(
    useShallow((state) => ({
      setCurrentConversation: state.setCurrentConversation,
      addConversation: state.addConversation,
      updateConversation: state.updateConversation,
      removeConversation: state.removeConversation,
      addMessage: state.addMessage,
      updateMessage: state.updateMessage,
      setInputValue: state.setInputValue,
      setIsStreaming: state.setIsStreaming,
      appendStreamingContent: state.appendStreamingContent,
      clearStreamingContent: state.clearStreamingContent,
      addAttachment: state.addAttachment,
      removeAttachment: state.removeAttachment,
      clearAttachments: state.clearAttachments,
      reset: state.reset,
    }))
  );
