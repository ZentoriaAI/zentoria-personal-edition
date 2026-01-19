/**
 * Enhanced Chat Store Tests
 *
 * Tests for the Enhanced Chat Interface Zustand store including:
 * - Session management
 * - Message handling with Map structure
 * - Folder state and expansion
 * - Agent selection
 * - Streaming state
 * - Canvas/artifacts management
 * - Selector functions (PERF-011)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useEnhancedChatStore,
  selectCurrentSession,
  selectCurrentMessages,
  selectFilteredSessions,
  selectStreamingState,
  selectInputState,
  selectFolderState,
  selectCanvasState,
  selectCurrentCanvases,
  selectAgents,
  selectCurrentAgent,
  selectSettings,
  useStreamingState,
  useInputState,
  useFolderState,
  useCanvasState,
  useEnhancedChatActions,
} from './enhanced-chat-store';
import type { ChatSession, EnhancedChatMessage, Agent, ProjectFolder, Canvas, UserSettings } from '@/types';

// ============================================================================
// Mock Data
// ============================================================================

const createMockSession = (overrides = {}): ChatSession => ({
  id: 'sess_test123',
  userId: 'user_1',
  folderId: null,
  agentId: 'agent_chat',
  title: 'Test Chat',
  summary: null,
  systemPrompt: null,
  model: 'llama3.2:3b',
  temperature: 0.7,
  contextWindow: 10,
  metadata: {},
  isPinned: false,
  isArchived: false,
  isDeleted: false,
  deletedAt: null,
  lastMessageAt: new Date().toISOString(),
  messageCount: 0,
  tokenCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  agent: null,
  ...overrides,
});

const createMockMessage = (overrides = {}): EnhancedChatMessage => ({
  id: 'msg_test123',
  sessionId: 'sess_test123',
  parentId: null,
  role: 'user',
  content: 'Test message',
  contentFormat: 'text',
  model: null,
  promptTokens: null,
  completionTokens: null,
  durationMs: null,
  toolCalls: null,
  toolResults: null,
  metadata: {},
  isEdited: false,
  editedAt: null,
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  attachments: [],
  ...overrides,
});

const createMockAgent = (overrides = {}): Agent => ({
  id: 'agent_chat',
  name: 'chat',
  displayName: 'Chat Agent',
  description: 'General assistant',
  systemPrompt: 'You are helpful.',
  model: 'llama3.2:3b',
  temperature: 0.7,
  maxTokens: 4096,
  capabilities: ['chat'],
  tools: [],
  metadata: {},
  isActive: true,
  isDefault: true,
  sortOrder: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockFolder = (overrides = {}): ProjectFolder => ({
  id: 'folder_test123',
  userId: 'user_1',
  name: 'Test Folder',
  description: null,
  color: '#6366f1',
  icon: 'folder',
  parentId: null,
  sortOrder: 0,
  metadata: {},
  isArchived: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  children: [],
  _count: { chatSessions: 0 },
  ...overrides,
});

const createMockCanvas = (overrides = {}): Canvas => ({
  id: 'canvas_test123',
  sessionId: 'sess_test123',
  messageId: 'msg_test123',
  title: 'Test Canvas',
  language: 'typescript',
  content: 'const x = 1;',
  contentType: 'code',
  metadata: {},
  isPinned: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockSettings = (overrides = {}): UserSettings => ({
  id: 'settings_1',
  userId: 'user_1',
  defaultAgentId: 'agent_chat',
  defaultModel: 'llama3.2:3b',
  defaultTemperature: 0.7,
  defaultMaxTokens: null,
  defaultSystemPrompt: null,
  contextWindow: 10,
  streamResponses: true,
  showTokenCounts: false,
  autoGenerateTitles: true,
  saveHistory: true,
  theme: 'dark',
  fontSize: 'medium',
  codeTheme: 'github-dark',
  sendOnEnter: true,
  enableSounds: false,
  enableNotifications: true,
  keyboardShortcuts: {},
  customPrompts: [],
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  // Reset store before each test
  const { reset } = useEnhancedChatStore.getState();
  reset();
});

// ============================================================================
// Session Management Tests
// ============================================================================

describe('Enhanced Chat Store - Session Management', () => {
  it('should initialize with default state', () => {
    const state = useEnhancedChatStore.getState();
    expect(state.currentSessionId).toBeNull();
    expect(state.sessions).toEqual([]);
    expect(state.sessionsLoading).toBe(false);
    expect(state.sessionsError).toBeNull();
  });

  it('should set current session', () => {
    const { setCurrentSession } = useEnhancedChatStore.getState();
    act(() => setCurrentSession('sess_123'));
    expect(useEnhancedChatStore.getState().currentSessionId).toBe('sess_123');
  });

  it('should set sessions', () => {
    const sessions = [createMockSession(), createMockSession({ id: 'sess_2' })];
    const { setSessions } = useEnhancedChatStore.getState();
    act(() => setSessions(sessions));
    expect(useEnhancedChatStore.getState().sessions).toHaveLength(2);
  });

  it('should add session to beginning of list', () => {
    const session1 = createMockSession({ id: 'sess_1', title: 'First' });
    const session2 = createMockSession({ id: 'sess_2', title: 'Second' });

    const { addSession } = useEnhancedChatStore.getState();
    act(() => addSession(session1));
    act(() => addSession(session2));

    const { sessions } = useEnhancedChatStore.getState();
    expect(sessions[0].id).toBe('sess_2');
    expect(sessions[1].id).toBe('sess_1');
  });

  it('should update session', () => {
    const session = createMockSession();
    const { setSessions, updateSession } = useEnhancedChatStore.getState();

    act(() => setSessions([session]));
    act(() => updateSession('sess_test123', { title: 'Updated Title' }));

    const { sessions } = useEnhancedChatStore.getState();
    expect(sessions[0].title).toBe('Updated Title');
  });

  it('should remove session and clean up related data', () => {
    const session = createMockSession();
    const message = createMockMessage();
    const canvas = createMockCanvas();

    const { setSessions, setMessages, setCanvases, setCurrentSession, removeSession } =
      useEnhancedChatStore.getState();

    act(() => {
      setSessions([session]);
      setMessages('sess_test123', [message]);
      setCanvases('sess_test123', [canvas]);
      setCurrentSession('sess_test123');
    });

    act(() => removeSession('sess_test123'));

    const state = useEnhancedChatStore.getState();
    expect(state.sessions).toHaveLength(0);
    expect(state.messages.get('sess_test123')).toBeUndefined();
    expect(state.canvases.get('sess_test123')).toBeUndefined();
    expect(state.currentSessionId).toBeNull();
  });

  it('should set sessions loading state', () => {
    const { setSessionsLoading } = useEnhancedChatStore.getState();
    act(() => setSessionsLoading(true));
    expect(useEnhancedChatStore.getState().sessionsLoading).toBe(true);
  });

  it('should set sessions error', () => {
    const { setSessionsError } = useEnhancedChatStore.getState();
    act(() => setSessionsError('Failed to load'));
    expect(useEnhancedChatStore.getState().sessionsError).toBe('Failed to load');
  });
});

// ============================================================================
// Message Management Tests
// ============================================================================

describe('Enhanced Chat Store - Message Management', () => {
  it('should set messages for a session', () => {
    const messages = [createMockMessage(), createMockMessage({ id: 'msg_2' })];
    const { setMessages } = useEnhancedChatStore.getState();

    act(() => setMessages('sess_test123', messages));

    const stored = useEnhancedChatStore.getState().messages.get('sess_test123');
    expect(stored).toHaveLength(2);
  });

  it('should add message to existing session', () => {
    const message1 = createMockMessage({ id: 'msg_1' });
    const message2 = createMockMessage({ id: 'msg_2' });
    const { setMessages, addMessage } = useEnhancedChatStore.getState();

    act(() => setMessages('sess_test123', [message1]));
    act(() => addMessage('sess_test123', message2));

    const stored = useEnhancedChatStore.getState().messages.get('sess_test123');
    expect(stored).toHaveLength(2);
  });

  it('should add message to new session', () => {
    const message = createMockMessage({ sessionId: 'sess_new' });
    const { addMessage } = useEnhancedChatStore.getState();

    act(() => addMessage('sess_new', message));

    const stored = useEnhancedChatStore.getState().messages.get('sess_new');
    expect(stored).toHaveLength(1);
  });

  it('should update message', () => {
    const message = createMockMessage();
    const { setMessages, updateMessage } = useEnhancedChatStore.getState();

    act(() => setMessages('sess_test123', [message]));
    act(() => updateMessage('sess_test123', 'msg_test123', { content: 'Updated content' }));

    const stored = useEnhancedChatStore.getState().messages.get('sess_test123');
    expect(stored?.[0].content).toBe('Updated content');
  });

  it('should remove message', () => {
    const messages = [createMockMessage({ id: 'msg_1' }), createMockMessage({ id: 'msg_2' })];
    const { setMessages, removeMessage } = useEnhancedChatStore.getState();

    act(() => setMessages('sess_test123', messages));
    act(() => removeMessage('sess_test123', 'msg_1'));

    const stored = useEnhancedChatStore.getState().messages.get('sess_test123');
    expect(stored).toHaveLength(1);
    expect(stored?.[0].id).toBe('msg_2');
  });
});

// ============================================================================
// Folder Management Tests
// ============================================================================

describe('Enhanced Chat Store - Folder Management', () => {
  it('should set folders', () => {
    const folders = [createMockFolder(), createMockFolder({ id: 'folder_2' })];
    const { setFolders } = useEnhancedChatStore.getState();

    act(() => setFolders(folders));

    expect(useEnhancedChatStore.getState().folders).toHaveLength(2);
  });

  it('should toggle folder expanded state', () => {
    const { toggleFolderExpanded } = useEnhancedChatStore.getState();

    act(() => toggleFolderExpanded('folder_1'));
    expect(useEnhancedChatStore.getState().expandedFolders.has('folder_1')).toBe(true);

    act(() => toggleFolderExpanded('folder_1'));
    expect(useEnhancedChatStore.getState().expandedFolders.has('folder_1')).toBe(false);
  });

  it('should set selected folder', () => {
    const { setSelectedFolder } = useEnhancedChatStore.getState();

    act(() => setSelectedFolder('folder_1'));
    expect(useEnhancedChatStore.getState().selectedFolderId).toBe('folder_1');

    act(() => setSelectedFolder(null));
    expect(useEnhancedChatStore.getState().selectedFolderId).toBeNull();
  });
});

// ============================================================================
// Agent Management Tests
// ============================================================================

describe('Enhanced Chat Store - Agent Management', () => {
  it('should set agents', () => {
    const agents = [createMockAgent(), createMockAgent({ id: 'agent_code', name: 'code' })];
    const { setAgents } = useEnhancedChatStore.getState();

    act(() => setAgents(agents));

    expect(useEnhancedChatStore.getState().agents).toHaveLength(2);
  });

  it('should set selected agent', () => {
    const { setSelectedAgent } = useEnhancedChatStore.getState();

    act(() => setSelectedAgent('agent_code'));
    expect(useEnhancedChatStore.getState().selectedAgentId).toBe('agent_code');
  });
});

// ============================================================================
// Input State Tests
// ============================================================================

describe('Enhanced Chat Store - Input State', () => {
  it('should set input value', () => {
    const { setInputValue } = useEnhancedChatStore.getState();

    act(() => setInputValue('Hello AI'));
    expect(useEnhancedChatStore.getState().inputValue).toBe('Hello AI');
  });

  it('should add and remove attachments', () => {
    const file1 = new File(['content1'], 'file1.txt', { type: 'text/plain' });
    const file2 = new File(['content2'], 'file2.txt', { type: 'text/plain' });
    const { addAttachment, removeAttachment, clearAttachments } = useEnhancedChatStore.getState();

    act(() => addAttachment(file1));
    act(() => addAttachment(file2));
    expect(useEnhancedChatStore.getState().pendingAttachments).toHaveLength(2);

    act(() => removeAttachment(0));
    expect(useEnhancedChatStore.getState().pendingAttachments).toHaveLength(1);
    expect(useEnhancedChatStore.getState().pendingAttachments[0].name).toBe('file2.txt');

    act(() => clearAttachments());
    expect(useEnhancedChatStore.getState().pendingAttachments).toHaveLength(0);
  });
});

// ============================================================================
// Streaming State Tests
// ============================================================================

describe('Enhanced Chat Store - Streaming State', () => {
  it('should manage streaming state', () => {
    const { setIsStreaming, setStreamingSessionId } = useEnhancedChatStore.getState();

    act(() => {
      setIsStreaming(true);
      setStreamingSessionId('sess_123');
    });

    const state = useEnhancedChatStore.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.streamingSessionId).toBe('sess_123');
  });

  it('should append and clear streaming content', () => {
    const { appendStreamingContent, clearStreamingContent } = useEnhancedChatStore.getState();

    act(() => appendStreamingContent('Hello'));
    act(() => appendStreamingContent(' World'));
    expect(useEnhancedChatStore.getState().streamingContent).toBe('Hello World');

    act(() => clearStreamingContent());
    expect(useEnhancedChatStore.getState().streamingContent).toBe('');
  });
});

// ============================================================================
// Canvas State Tests
// ============================================================================

describe('Enhanced Chat Store - Canvas State', () => {
  it('should manage canvas panel', () => {
    const canvas = createMockCanvas();
    const { setCanvasPanelOpen, setActiveCanvas } = useEnhancedChatStore.getState();

    act(() => setCanvasPanelOpen(true));
    expect(useEnhancedChatStore.getState().canvasPanelOpen).toBe(true);

    act(() => setActiveCanvas(canvas));
    expect(useEnhancedChatStore.getState().activeCanvas).toEqual(canvas);
  });

  it('should set canvases for session', () => {
    const canvases = [createMockCanvas(), createMockCanvas({ id: 'canvas_2' })];
    const { setCanvases } = useEnhancedChatStore.getState();

    act(() => setCanvases('sess_test123', canvases));

    const stored = useEnhancedChatStore.getState().canvases.get('sess_test123');
    expect(stored).toHaveLength(2);
  });

  it('should add canvas to session', () => {
    const canvas1 = createMockCanvas({ id: 'canvas_1' });
    const canvas2 = createMockCanvas({ id: 'canvas_2' });
    const { setCanvases, addCanvas } = useEnhancedChatStore.getState();

    act(() => setCanvases('sess_test123', [canvas1]));
    act(() => addCanvas('sess_test123', canvas2));

    const stored = useEnhancedChatStore.getState().canvases.get('sess_test123');
    expect(stored).toHaveLength(2);
  });

  it('should update canvas', () => {
    const canvas = createMockCanvas();
    const { setCanvases, updateCanvas } = useEnhancedChatStore.getState();

    act(() => setCanvases('sess_test123', [canvas]));
    act(() => updateCanvas('sess_test123', 'canvas_test123', { title: 'Updated Canvas' }));

    const stored = useEnhancedChatStore.getState().canvases.get('sess_test123');
    expect(stored?.[0].title).toBe('Updated Canvas');
  });
});

// ============================================================================
// Settings Tests
// ============================================================================

describe('Enhanced Chat Store - Settings', () => {
  it('should set settings', () => {
    const settings = createMockSettings();
    const { setSettings } = useEnhancedChatStore.getState();

    act(() => setSettings(settings));

    expect(useEnhancedChatStore.getState().settings).toEqual(settings);
  });

  it('should update settings', () => {
    const settings = createMockSettings();
    const { setSettings, updateSettings } = useEnhancedChatStore.getState();

    act(() => setSettings(settings));
    act(() => updateSettings({ theme: 'light', defaultTemperature: 0.5 }));

    const updated = useEnhancedChatStore.getState().settings;
    expect(updated?.theme).toBe('light');
    expect(updated?.defaultTemperature).toBe(0.5);
  });

  it('should not update settings if null', () => {
    const { updateSettings } = useEnhancedChatStore.getState();

    act(() => updateSettings({ theme: 'light' }));

    expect(useEnhancedChatStore.getState().settings).toBeNull();
  });
});

// ============================================================================
// UI State Tests
// ============================================================================

describe('Enhanced Chat Store - UI State', () => {
  it('should toggle sidebar collapsed', () => {
    const { setSidebarCollapsed } = useEnhancedChatStore.getState();

    act(() => setSidebarCollapsed(true));
    expect(useEnhancedChatStore.getState().sidebarCollapsed).toBe(true);
  });

  it('should toggle archived sessions view', () => {
    const { setShowArchivedSessions } = useEnhancedChatStore.getState();

    act(() => setShowArchivedSessions(true));
    expect(useEnhancedChatStore.getState().showArchivedSessions).toBe(true);
  });

  it('should set search query', () => {
    const { setSearchQuery } = useEnhancedChatStore.getState();

    act(() => setSearchQuery('hello'));
    expect(useEnhancedChatStore.getState().searchQuery).toBe('hello');
  });
});

// ============================================================================
// Selector Tests (PERF-011)
// ============================================================================

describe('Enhanced Chat Store - Selectors', () => {
  it('selectCurrentSession should return correct session', () => {
    const session = createMockSession();
    const { setSessions, setCurrentSession } = useEnhancedChatStore.getState();

    act(() => {
      setSessions([session]);
      setCurrentSession('sess_test123');
    });

    const result = selectCurrentSession(useEnhancedChatStore.getState());
    expect(result).toEqual(session);
  });

  it('selectCurrentSession should return null when no session selected', () => {
    const result = selectCurrentSession(useEnhancedChatStore.getState());
    expect(result).toBeNull();
  });

  it('selectCurrentMessages should return messages for current session', () => {
    const messages = [createMockMessage(), createMockMessage({ id: 'msg_2' })];
    const { setMessages, setCurrentSession } = useEnhancedChatStore.getState();

    act(() => {
      setMessages('sess_test123', messages);
      setCurrentSession('sess_test123');
    });

    const result = selectCurrentMessages(useEnhancedChatStore.getState());
    expect(result).toHaveLength(2);
  });

  it('selectFilteredSessions should filter by folder', () => {
    const sessions = [
      createMockSession({ id: 'sess_1', folderId: 'folder_1' }),
      createMockSession({ id: 'sess_2', folderId: null }),
      createMockSession({ id: 'sess_3', folderId: 'folder_1' }),
    ];
    const { setSessions, setSelectedFolder } = useEnhancedChatStore.getState();

    act(() => setSessions(sessions));
    act(() => setSelectedFolder('folder_1'));

    const result = selectFilteredSessions(useEnhancedChatStore.getState());
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.folderId === 'folder_1')).toBe(true);
  });

  it('selectFilteredSessions should filter unfiled sessions', () => {
    const sessions = [
      createMockSession({ id: 'sess_1', folderId: 'folder_1' }),
      createMockSession({ id: 'sess_2', folderId: null }),
    ];
    const { setSessions, setSelectedFolder } = useEnhancedChatStore.getState();

    act(() => setSessions(sessions));
    act(() => setSelectedFolder('unfiled'));

    const result = selectFilteredSessions(useEnhancedChatStore.getState());
    expect(result).toHaveLength(1);
    expect(result[0].folderId).toBeNull();
  });

  it('selectFilteredSessions should filter archived sessions', () => {
    const sessions = [
      createMockSession({ id: 'sess_1', isArchived: false }),
      createMockSession({ id: 'sess_2', isArchived: true }),
    ];
    const { setSessions } = useEnhancedChatStore.getState();

    act(() => setSessions(sessions));

    // Default hides archived
    let result = selectFilteredSessions(useEnhancedChatStore.getState());
    expect(result).toHaveLength(1);

    // Show archived
    const { setShowArchivedSessions } = useEnhancedChatStore.getState();
    act(() => setShowArchivedSessions(true));
    result = selectFilteredSessions(useEnhancedChatStore.getState());
    expect(result).toHaveLength(2);
  });

  it('selectFilteredSessions should filter by search', () => {
    const sessions = [
      createMockSession({ id: 'sess_1', title: 'Hello World' }),
      createMockSession({ id: 'sess_2', title: 'Goodbye' }),
    ];
    const { setSessions, setSearchQuery } = useEnhancedChatStore.getState();

    act(() => setSessions(sessions));
    act(() => setSearchQuery('hello'));

    const result = selectFilteredSessions(useEnhancedChatStore.getState());
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Hello World');
  });

  it('selectCurrentAgent should return default agent when none selected', () => {
    const agents = [
      createMockAgent({ id: 'agent_1', isDefault: false }),
      createMockAgent({ id: 'agent_2', isDefault: true }),
    ];
    const { setAgents } = useEnhancedChatStore.getState();

    act(() => setAgents(agents));

    const result = selectCurrentAgent(useEnhancedChatStore.getState());
    expect(result?.id).toBe('agent_2');
  });

  it('selectCurrentAgent should return selected agent', () => {
    const agents = [
      createMockAgent({ id: 'agent_1', isDefault: false }),
      createMockAgent({ id: 'agent_2', isDefault: true }),
    ];
    const { setAgents, setSelectedAgent } = useEnhancedChatStore.getState();

    act(() => {
      setAgents(agents);
      setSelectedAgent('agent_1');
    });

    const result = selectCurrentAgent(useEnhancedChatStore.getState());
    expect(result?.id).toBe('agent_1');
  });

  it('selectCurrentCanvases should return canvases for current session', () => {
    const canvases = [createMockCanvas(), createMockCanvas({ id: 'canvas_2' })];
    const { setCanvases, setCurrentSession } = useEnhancedChatStore.getState();

    act(() => {
      setCanvases('sess_test123', canvases);
      setCurrentSession('sess_test123');
    });

    const result = selectCurrentCanvases(useEnhancedChatStore.getState());
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// Custom Hook Tests
// ============================================================================

describe('Enhanced Chat Store - Custom Hooks', () => {
  it('useStreamingState should return streaming state', () => {
    const { result } = renderHook(() => useStreamingState());

    expect(result.current).toEqual({
      isStreaming: false,
      streamingContent: '',
      streamingSessionId: null,
    });
  });

  it('useInputState should return input state', () => {
    const { result } = renderHook(() => useInputState());

    expect(result.current).toEqual({
      inputValue: '',
      pendingAttachments: [],
    });
  });

  it('useFolderState should return folder state', () => {
    const { result } = renderHook(() => useFolderState());

    expect(result.current.folders).toEqual([]);
    expect(result.current.selectedFolderId).toBeNull();
  });

  it('useCanvasState should return canvas state', () => {
    const { result } = renderHook(() => useCanvasState());

    expect(result.current).toEqual({
      canvasPanelOpen: false,
      activeCanvas: null,
    });
  });

  it('useEnhancedChatActions should return action functions', () => {
    const { result } = renderHook(() => useEnhancedChatActions());

    expect(typeof result.current.setCurrentSession).toBe('function');
    expect(typeof result.current.addSession).toBe('function');
    expect(typeof result.current.addMessage).toBe('function');
    expect(typeof result.current.setIsStreaming).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });
});

// ============================================================================
// Reset Tests
// ============================================================================

describe('Enhanced Chat Store - Reset', () => {
  it('should reset all state to initial values', () => {
    const { setSessions, setMessages, setFolders, setAgents, setInputValue, setIsStreaming, reset } =
      useEnhancedChatStore.getState();

    // Set some state
    act(() => {
      setSessions([createMockSession()]);
      setMessages('sess_test123', [createMockMessage()]);
      setFolders([createMockFolder()]);
      setAgents([createMockAgent()]);
      setInputValue('test input');
      setIsStreaming(true);
    });

    // Reset
    act(() => reset());

    const state = useEnhancedChatStore.getState();
    expect(state.sessions).toEqual([]);
    expect(state.messages.size).toBe(0);
    expect(state.folders).toEqual([]);
    expect(state.agents).toEqual([]);
    expect(state.inputValue).toBe('');
    expect(state.isStreaming).toBe(false);
  });
});
