/**
 * Chat Store Tests - TEST-004
 *
 * Comprehensive tests for the useChatStore Zustand store including:
 * - Conversation management
 * - Message management
 * - Input state
 * - Streaming state
 * - Attachments
 * - Selectors (PERF-011)
 * - Persistence
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import {
  useChatStore,
  selectCurrentMessages,
  selectCurrentConversation,
  selectConversationById,
  selectMessagesByConversation,
  selectStreamingState,
  selectInputState,
  selectConversations,
  selectCurrentConversationId,
} from './chat-store';
import type { Conversation, ChatMessage } from '@/types';

// Test data factories
const createMockConversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: `conv_${Math.random().toString(36).slice(2, 10)}`,
  title: 'Test Conversation',
  model: 'claude-3-5-sonnet',
  messageCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `msg_${Math.random().toString(36).slice(2, 10)}`,
  conversationId: 'conv_default',
  role: 'user',
  content: 'Test message',
  createdAt: new Date().toISOString(),
  ...overrides,
});

const createMockFile = (name: string = 'test.txt', size: number = 1024): File => {
  return new File(['test content'], name, { type: 'text/plain' });
};

describe('useChatStore (TEST-004)', () => {
  beforeEach(() => {
    // Reset the store before each test
    act(() => {
      useChatStore.getState().reset();
    });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useChatStore.getState();

      expect(state.currentConversationId).toBeNull();
      expect(state.conversations).toEqual([]);
      expect(state.messages.size).toBe(0);
      expect(state.inputValue).toBe('');
      expect(state.isStreaming).toBe(false);
      expect(state.streamingContent).toBe('');
      expect(state.pendingAttachments).toEqual([]);
    });
  });

  describe('Conversation Management', () => {
    describe('setCurrentConversation', () => {
      it('should set current conversation ID', () => {
        act(() => {
          useChatStore.getState().setCurrentConversation('conv_123');
        });

        expect(useChatStore.getState().currentConversationId).toBe('conv_123');
      });

      it('should allow setting null', () => {
        act(() => {
          useChatStore.getState().setCurrentConversation('conv_123');
          useChatStore.getState().setCurrentConversation(null);
        });

        expect(useChatStore.getState().currentConversationId).toBeNull();
      });
    });

    describe('setConversations', () => {
      it('should set conversations array', () => {
        const conversations = [
          createMockConversation({ id: 'conv_1' }),
          createMockConversation({ id: 'conv_2' }),
        ];

        act(() => {
          useChatStore.getState().setConversations(conversations);
        });

        expect(useChatStore.getState().conversations).toEqual(conversations);
      });

      it('should replace existing conversations', () => {
        const initial = [createMockConversation({ id: 'conv_old' })];
        const updated = [createMockConversation({ id: 'conv_new' })];

        act(() => {
          useChatStore.getState().setConversations(initial);
          useChatStore.getState().setConversations(updated);
        });

        expect(useChatStore.getState().conversations).toEqual(updated);
      });
    });

    describe('addConversation', () => {
      it('should add conversation to the beginning', () => {
        const existing = createMockConversation({ id: 'conv_1' });
        const newConv = createMockConversation({ id: 'conv_2' });

        act(() => {
          useChatStore.getState().setConversations([existing]);
          useChatStore.getState().addConversation(newConv);
        });

        const conversations = useChatStore.getState().conversations;
        expect(conversations[0].id).toBe('conv_2');
        expect(conversations[1].id).toBe('conv_1');
      });

      it('should handle adding to empty list', () => {
        const conv = createMockConversation();

        act(() => {
          useChatStore.getState().addConversation(conv);
        });

        expect(useChatStore.getState().conversations).toHaveLength(1);
      });
    });

    describe('updateConversation', () => {
      it('should update specific conversation', () => {
        const conv = createMockConversation({ id: 'conv_1', title: 'Original' });

        act(() => {
          useChatStore.getState().setConversations([conv]);
          useChatStore.getState().updateConversation('conv_1', { title: 'Updated' });
        });

        expect(useChatStore.getState().conversations[0].title).toBe('Updated');
      });

      it('should not affect other conversations', () => {
        const conv1 = createMockConversation({ id: 'conv_1', title: 'Title 1' });
        const conv2 = createMockConversation({ id: 'conv_2', title: 'Title 2' });

        act(() => {
          useChatStore.getState().setConversations([conv1, conv2]);
          useChatStore.getState().updateConversation('conv_1', { title: 'Updated' });
        });

        expect(useChatStore.getState().conversations[1].title).toBe('Title 2');
      });

      it('should handle non-existent conversation gracefully', () => {
        const conv = createMockConversation({ id: 'conv_1' });

        act(() => {
          useChatStore.getState().setConversations([conv]);
          useChatStore.getState().updateConversation('conv_999', { title: 'Updated' });
        });

        expect(useChatStore.getState().conversations[0].id).toBe('conv_1');
      });
    });

    describe('removeConversation', () => {
      it('should remove conversation from list', () => {
        const conv1 = createMockConversation({ id: 'conv_1' });
        const conv2 = createMockConversation({ id: 'conv_2' });

        act(() => {
          useChatStore.getState().setConversations([conv1, conv2]);
          useChatStore.getState().removeConversation('conv_1');
        });

        const conversations = useChatStore.getState().conversations;
        expect(conversations).toHaveLength(1);
        expect(conversations[0].id).toBe('conv_2');
      });

      it('should clear current conversation if removed', () => {
        const conv = createMockConversation({ id: 'conv_1' });

        act(() => {
          useChatStore.getState().setConversations([conv]);
          useChatStore.getState().setCurrentConversation('conv_1');
          useChatStore.getState().removeConversation('conv_1');
        });

        expect(useChatStore.getState().currentConversationId).toBeNull();
      });

      it('should not clear current conversation if different one removed', () => {
        const conv1 = createMockConversation({ id: 'conv_1' });
        const conv2 = createMockConversation({ id: 'conv_2' });

        act(() => {
          useChatStore.getState().setConversations([conv1, conv2]);
          useChatStore.getState().setCurrentConversation('conv_1');
          useChatStore.getState().removeConversation('conv_2');
        });

        expect(useChatStore.getState().currentConversationId).toBe('conv_1');
      });

      it('should remove associated messages', () => {
        const conv = createMockConversation({ id: 'conv_1' });
        const messages = [createMockMessage({ conversationId: 'conv_1' })];

        act(() => {
          useChatStore.getState().setConversations([conv]);
          useChatStore.getState().setMessages('conv_1', messages);
          useChatStore.getState().removeConversation('conv_1');
        });

        expect(useChatStore.getState().messages.has('conv_1')).toBe(false);
      });
    });
  });

  describe('Message Management', () => {
    describe('setMessages', () => {
      it('should set messages for a conversation', () => {
        const messages = [
          createMockMessage({ id: 'msg_1', conversationId: 'conv_1' }),
          createMockMessage({ id: 'msg_2', conversationId: 'conv_1' }),
        ];

        act(() => {
          useChatStore.getState().setMessages('conv_1', messages);
        });

        expect(useChatStore.getState().messages.get('conv_1')).toEqual(messages);
      });

      it('should replace existing messages', () => {
        const initial = [createMockMessage({ id: 'msg_old', conversationId: 'conv_1' })];
        const updated = [createMockMessage({ id: 'msg_new', conversationId: 'conv_1' })];

        act(() => {
          useChatStore.getState().setMessages('conv_1', initial);
          useChatStore.getState().setMessages('conv_1', updated);
        });

        expect(useChatStore.getState().messages.get('conv_1')).toEqual(updated);
      });

      it('should not affect other conversations', () => {
        const messages1 = [createMockMessage({ conversationId: 'conv_1' })];
        const messages2 = [createMockMessage({ conversationId: 'conv_2' })];

        act(() => {
          useChatStore.getState().setMessages('conv_1', messages1);
          useChatStore.getState().setMessages('conv_2', messages2);
        });

        expect(useChatStore.getState().messages.get('conv_1')).toEqual(messages1);
        expect(useChatStore.getState().messages.get('conv_2')).toEqual(messages2);
      });
    });

    describe('addMessage', () => {
      it('should add message to existing conversation', () => {
        const existing = createMockMessage({ id: 'msg_1', conversationId: 'conv_1' });
        const newMsg = createMockMessage({ id: 'msg_2', conversationId: 'conv_1' });

        act(() => {
          useChatStore.getState().setMessages('conv_1', [existing]);
          useChatStore.getState().addMessage('conv_1', newMsg);
        });

        const messages = useChatStore.getState().messages.get('conv_1');
        expect(messages).toHaveLength(2);
        expect(messages?.[1].id).toBe('msg_2');
      });

      it('should create new array for new conversation', () => {
        const msg = createMockMessage({ conversationId: 'conv_new' });

        act(() => {
          useChatStore.getState().addMessage('conv_new', msg);
        });

        expect(useChatStore.getState().messages.get('conv_new')).toEqual([msg]);
      });
    });

    describe('updateMessage', () => {
      it('should update specific message', () => {
        const msg = createMockMessage({ id: 'msg_1', conversationId: 'conv_1', content: 'Original' });

        act(() => {
          useChatStore.getState().setMessages('conv_1', [msg]);
          useChatStore.getState().updateMessage('conv_1', 'msg_1', { content: 'Updated' });
        });

        const messages = useChatStore.getState().messages.get('conv_1');
        expect(messages?.[0].content).toBe('Updated');
      });

      it('should not affect other messages', () => {
        const msg1 = createMockMessage({ id: 'msg_1', conversationId: 'conv_1', content: 'Content 1' });
        const msg2 = createMockMessage({ id: 'msg_2', conversationId: 'conv_1', content: 'Content 2' });

        act(() => {
          useChatStore.getState().setMessages('conv_1', [msg1, msg2]);
          useChatStore.getState().updateMessage('conv_1', 'msg_1', { content: 'Updated' });
        });

        const messages = useChatStore.getState().messages.get('conv_1');
        expect(messages?.[1].content).toBe('Content 2');
      });

      it('should handle non-existent message gracefully', () => {
        const msg = createMockMessage({ id: 'msg_1', conversationId: 'conv_1' });

        act(() => {
          useChatStore.getState().setMessages('conv_1', [msg]);
          useChatStore.getState().updateMessage('conv_1', 'msg_999', { content: 'Updated' });
        });

        expect(useChatStore.getState().messages.get('conv_1')).toHaveLength(1);
      });
    });
  });

  describe('Input State', () => {
    describe('setInputValue', () => {
      it('should set input value', () => {
        act(() => {
          useChatStore.getState().setInputValue('Hello, AI!');
        });

        expect(useChatStore.getState().inputValue).toBe('Hello, AI!');
      });

      it('should handle empty string', () => {
        act(() => {
          useChatStore.getState().setInputValue('Some text');
          useChatStore.getState().setInputValue('');
        });

        expect(useChatStore.getState().inputValue).toBe('');
      });
    });
  });

  describe('Streaming State', () => {
    describe('setIsStreaming', () => {
      it('should set streaming flag', () => {
        act(() => {
          useChatStore.getState().setIsStreaming(true);
        });

        expect(useChatStore.getState().isStreaming).toBe(true);
      });

      it('should toggle streaming flag', () => {
        act(() => {
          useChatStore.getState().setIsStreaming(true);
          useChatStore.getState().setIsStreaming(false);
        });

        expect(useChatStore.getState().isStreaming).toBe(false);
      });
    });

    describe('appendStreamingContent', () => {
      it('should append content to streaming buffer', () => {
        act(() => {
          useChatStore.getState().appendStreamingContent('Hello');
          useChatStore.getState().appendStreamingContent(' World');
        });

        expect(useChatStore.getState().streamingContent).toBe('Hello World');
      });

      it('should handle empty strings', () => {
        act(() => {
          useChatStore.getState().appendStreamingContent('Test');
          useChatStore.getState().appendStreamingContent('');
        });

        expect(useChatStore.getState().streamingContent).toBe('Test');
      });
    });

    describe('clearStreamingContent', () => {
      it('should clear streaming content', () => {
        act(() => {
          useChatStore.getState().appendStreamingContent('Some content');
          useChatStore.getState().clearStreamingContent();
        });

        expect(useChatStore.getState().streamingContent).toBe('');
      });
    });
  });

  describe('Attachments', () => {
    describe('addAttachment', () => {
      it('should add file to attachments', () => {
        const file = createMockFile('doc.pdf');

        act(() => {
          useChatStore.getState().addAttachment(file);
        });

        expect(useChatStore.getState().pendingAttachments).toHaveLength(1);
        expect(useChatStore.getState().pendingAttachments[0].name).toBe('doc.pdf');
      });

      it('should add multiple attachments', () => {
        const file1 = createMockFile('doc1.pdf');
        const file2 = createMockFile('doc2.pdf');

        act(() => {
          useChatStore.getState().addAttachment(file1);
          useChatStore.getState().addAttachment(file2);
        });

        expect(useChatStore.getState().pendingAttachments).toHaveLength(2);
      });
    });

    describe('removeAttachment', () => {
      it('should remove attachment by index', () => {
        const file1 = createMockFile('doc1.pdf');
        const file2 = createMockFile('doc2.pdf');

        act(() => {
          useChatStore.getState().addAttachment(file1);
          useChatStore.getState().addAttachment(file2);
          useChatStore.getState().removeAttachment(0);
        });

        const attachments = useChatStore.getState().pendingAttachments;
        expect(attachments).toHaveLength(1);
        expect(attachments[0].name).toBe('doc2.pdf');
      });

      it('should handle out of bounds index', () => {
        const file = createMockFile();

        act(() => {
          useChatStore.getState().addAttachment(file);
          useChatStore.getState().removeAttachment(5);
        });

        expect(useChatStore.getState().pendingAttachments).toHaveLength(1);
      });
    });

    describe('clearAttachments', () => {
      it('should clear all attachments', () => {
        act(() => {
          useChatStore.getState().addAttachment(createMockFile('doc1.pdf'));
          useChatStore.getState().addAttachment(createMockFile('doc2.pdf'));
          useChatStore.getState().clearAttachments();
        });

        expect(useChatStore.getState().pendingAttachments).toEqual([]);
      });
    });
  });

  describe('Reset', () => {
    it('should reset all state to initial values', () => {
      const conv = createMockConversation({ id: 'conv_1' });
      const msg = createMockMessage({ conversationId: 'conv_1' });

      act(() => {
        useChatStore.getState().setConversations([conv]);
        useChatStore.getState().setCurrentConversation('conv_1');
        useChatStore.getState().setMessages('conv_1', [msg]);
        useChatStore.getState().setInputValue('Test input');
        useChatStore.getState().setIsStreaming(true);
        useChatStore.getState().appendStreamingContent('Streaming');
        useChatStore.getState().addAttachment(createMockFile());
        useChatStore.getState().reset();
      });

      const state = useChatStore.getState();
      expect(state.currentConversationId).toBeNull();
      expect(state.conversations).toEqual([]);
      expect(state.messages.size).toBe(0);
      expect(state.inputValue).toBe('');
      expect(state.isStreaming).toBe(false);
      expect(state.streamingContent).toBe('');
      expect(state.pendingAttachments).toEqual([]);
    });
  });

  describe('Selectors (PERF-011)', () => {
    describe('selectCurrentMessages', () => {
      it('should return empty array when no current conversation', () => {
        const result = selectCurrentMessages(useChatStore.getState());
        expect(result).toEqual([]);
      });

      it('should return messages for current conversation', () => {
        const messages = [createMockMessage({ conversationId: 'conv_1' })];

        act(() => {
          useChatStore.getState().setCurrentConversation('conv_1');
          useChatStore.getState().setMessages('conv_1', messages);
        });

        const result = selectCurrentMessages(useChatStore.getState());
        expect(result).toEqual(messages);
      });

      it('should return empty array when conversation has no messages', () => {
        act(() => {
          useChatStore.getState().setCurrentConversation('conv_1');
        });

        const result = selectCurrentMessages(useChatStore.getState());
        expect(result).toEqual([]);
      });
    });

    describe('selectCurrentConversation', () => {
      it('should return null when no current conversation', () => {
        const result = selectCurrentConversation(useChatStore.getState());
        expect(result).toBeNull();
      });

      it('should return current conversation object', () => {
        const conv = createMockConversation({ id: 'conv_1', title: 'My Chat' });

        act(() => {
          useChatStore.getState().setConversations([conv]);
          useChatStore.getState().setCurrentConversation('conv_1');
        });

        const result = selectCurrentConversation(useChatStore.getState());
        expect(result?.id).toBe('conv_1');
        expect(result?.title).toBe('My Chat');
      });

      it('should return null when current ID not found', () => {
        act(() => {
          useChatStore.getState().setCurrentConversation('conv_nonexistent');
        });

        const result = selectCurrentConversation(useChatStore.getState());
        expect(result).toBeNull();
      });
    });

    describe('selectConversationById', () => {
      it('should return conversation by ID', () => {
        const conv = createMockConversation({ id: 'conv_1' });

        act(() => {
          useChatStore.getState().setConversations([conv]);
        });

        const selector = selectConversationById('conv_1');
        const result = selector(useChatStore.getState());
        expect(result?.id).toBe('conv_1');
      });

      it('should return null for non-existent ID', () => {
        const selector = selectConversationById('conv_999');
        const result = selector(useChatStore.getState());
        expect(result).toBeNull();
      });
    });

    describe('selectMessagesByConversation', () => {
      it('should return messages for conversation', () => {
        const messages = [createMockMessage({ conversationId: 'conv_1' })];

        act(() => {
          useChatStore.getState().setMessages('conv_1', messages);
        });

        const selector = selectMessagesByConversation('conv_1');
        const result = selector(useChatStore.getState());
        expect(result).toEqual(messages);
      });

      it('should return empty array for conversation without messages', () => {
        const selector = selectMessagesByConversation('conv_empty');
        const result = selector(useChatStore.getState());
        expect(result).toEqual([]);
      });
    });

    describe('selectStreamingState', () => {
      it('should return streaming state object', () => {
        act(() => {
          useChatStore.getState().setIsStreaming(true);
          useChatStore.getState().appendStreamingContent('Content');
        });

        const result = selectStreamingState(useChatStore.getState());
        expect(result).toEqual({
          isStreaming: true,
          streamingContent: 'Content',
        });
      });
    });

    describe('selectInputState', () => {
      it('should return input state object', () => {
        const file = createMockFile();

        act(() => {
          useChatStore.getState().setInputValue('Hello');
          useChatStore.getState().addAttachment(file);
        });

        const result = selectInputState(useChatStore.getState());
        expect(result.inputValue).toBe('Hello');
        expect(result.pendingAttachments).toHaveLength(1);
      });
    });

    describe('selectConversations', () => {
      it('should return conversations array', () => {
        const conversations = [
          createMockConversation({ id: 'conv_1' }),
          createMockConversation({ id: 'conv_2' }),
        ];

        act(() => {
          useChatStore.getState().setConversations(conversations);
        });

        const result = selectConversations(useChatStore.getState());
        expect(result).toEqual(conversations);
      });
    });

    describe('selectCurrentConversationId', () => {
      it('should return current conversation ID', () => {
        act(() => {
          useChatStore.getState().setCurrentConversation('conv_123');
        });

        const result = selectCurrentConversationId(useChatStore.getState());
        expect(result).toBe('conv_123');
      });

      it('should return null when no current conversation', () => {
        const result = selectCurrentConversationId(useChatStore.getState());
        expect(result).toBeNull();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid state updates', () => {
      act(() => {
        for (let i = 0; i < 100; i++) {
          useChatStore.getState().appendStreamingContent(`chunk${i}`);
        }
      });

      expect(useChatStore.getState().streamingContent).toContain('chunk99');
    });

    it('should handle messages with special characters', () => {
      const msg = createMockMessage({
        content: 'Test with emoji 🎉 and <script>alert("xss")</script>',
      });

      act(() => {
        useChatStore.getState().setMessages('conv_1', [msg]);
      });

      const messages = useChatStore.getState().messages.get('conv_1');
      expect(messages?.[0].content).toContain('🎉');
      expect(messages?.[0].content).toContain('<script>');
    });

    it('should handle very long conversations list', () => {
      const conversations = Array.from({ length: 100 }, (_, i) =>
        createMockConversation({ id: `conv_${i}` })
      );

      act(() => {
        useChatStore.getState().setConversations(conversations);
      });

      expect(useChatStore.getState().conversations).toHaveLength(100);
    });

    it('should handle concurrent operations', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            act(() => {
              useChatStore.getState().addConversation(createMockConversation({ id: `conv_${i}` }));
            });
            resolve();
          })
        );
      }

      await Promise.all(promises);

      expect(useChatStore.getState().conversations.length).toBeGreaterThanOrEqual(1);
    });
  });
});
