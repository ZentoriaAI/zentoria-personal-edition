'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Paperclip,
  Plus,
  MoreVertical,
  Bot,
  User,
  Copy,
  Check,
  Loader2,
  ImageIcon,
  FileText,
  X,
  Sparkles,
  Settings,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
  Pin,
  Archive,
  Edit3,
  Menu,
  Mic,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock, InlineCode } from '@/components/ui/code-block';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn, formatRelativeTime, copyToClipboard, getFileType, formatBytes } from '@/lib/utils';
import { chatApi } from '@/lib/chat-api';
import { haptics } from '@/lib/haptics';
import {
  useEnhancedChatStore,
  useStreamingState,
  useInputState,
  useCanvasState,
  selectCurrentSession,
  selectCurrentMessages,
  selectCurrentAgent,
} from '@/stores/enhanced-chat-store';
import { toast } from '@/stores/app-store';
import { FolderSidebar } from './folder-sidebar';
import { AgentSelector, AgentBadge } from './agent-selector';
import { CanvasPanel } from './canvas-panel';
import { MobileChatHeader, ChatFAB } from './mobile-chat-header';
import type { EnhancedChatMessage, ChatSession, Agent, Canvas } from '@/types';

// Custom hook for detecting mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Custom hook for keyboard-aware positioning
function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !('visualViewport' in window)) return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
      const heightDiff = window.innerHeight - viewport.height;
      setKeyboardHeight(heightDiff > 100 ? heightDiff : 0);
    };

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, []);

  return keyboardHeight;
}

export function EnhancedChat() {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store state
  const currentSession = useEnhancedChatStore(selectCurrentSession);
  const messages = useEnhancedChatStore(selectCurrentMessages);
  const currentAgent = useEnhancedChatStore(selectCurrentAgent);
  const { isStreaming, streamingContent } = useStreamingState();
  const { inputValue, pendingAttachments } = useInputState();
  const { canvasPanelOpen } = useCanvasState();

  const {
    setCurrentSession,
    addSession,
    updateSession,
    removeSession,
    setMessages,
    addMessage,
    setInputValue,
    addAttachment,
    removeAttachment,
    clearAttachments,
    setIsStreaming,
    setStreamingSessionId,
    appendStreamingContent,
    clearStreamingContent,
    setCanvasPanelOpen,
    setActiveCanvas,
    addCanvas,
  } = useEnhancedChatStore();

  const sidebarCollapsed = useEnhancedChatStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useEnhancedChatStore((state) => state.setSidebarCollapsed);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Mobile-specific state
  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false); // When a session is selected on mobile

  // Fetch messages when session changes
  const { isLoading: messagesLoading } = useQuery({
    queryKey: ['messages', currentSession?.id],
    queryFn: async () => {
      if (!currentSession?.id) return { messages: [] };
      const data = await chatApi.getMessages(currentSession.id);
      setMessages(currentSession.id, data.messages);
      return data;
    },
    enabled: !!currentSession?.id,
  });

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: () =>
      chatApi.createSession({
        agentId: currentAgent?.id,
      }),
    onSuccess: (session) => {
      addSession(session);
      setCurrentSession(session.id);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create chat', description: error.message, variant: 'error' });
    },
  });

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => chatApi.deleteSession(sessionId),
    onSuccess: () => {
      if (currentSession) {
        removeSession(currentSession.id);
      }
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast({ title: 'Chat deleted', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete chat', description: error.message, variant: 'error' });
    },
  });

  // Update session mutation
  const updateSessionMutation = useMutation({
    mutationFn: ({ sessionId, updates }: { sessionId: string; updates: Partial<ChatSession> }) =>
      chatApi.updateSession(sessionId, updates),
    onSuccess: (session) => {
      updateSession(session.id, session);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      let sessionId = currentSession?.id;

      // Create session if needed
      if (!sessionId) {
        const session = await chatApi.createSession({ agentId: currentAgent?.id });
        addSession(session);
        setCurrentSession(session.id);
        sessionId = session.id;
      }

      setIsStreaming(true);
      setStreamingSessionId(sessionId);
      clearStreamingContent();

      let fullContent = '';

      return new Promise<void>((resolve, reject) => {
        const abort = chatApi.streamMessage(
          sessionId!,
          { content, stream: true },
          (chunk) => {
            if (chunk.type === 'content' && chunk.content) {
              appendStreamingContent(chunk.content);
              fullContent += chunk.content;
            } else if (chunk.type === 'title' && chunk.title) {
              updateSession(sessionId!, { title: chunk.title });
            } else if (chunk.type === 'error') {
              reject(new Error(chunk.error));
            }
          },
          (error) => {
            setIsStreaming(false);
            setStreamingSessionId(null);
            reject(error);
          },
          () => {
            setIsStreaming(false);
            setStreamingSessionId(null);
            clearStreamingContent();
            queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
            queryClient.invalidateQueries({ queryKey: ['sessions'] });

            // Extract canvases from response
            extractCanvases(fullContent, sessionId!);

            resolve();
          }
        );
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to send message', description: error.message, variant: 'error' });
    },
  });

  // Extract code blocks as canvases
  const extractCanvases = useCallback(
    (content: string, sessionId: string) => {
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
      let match;
      let index = 0;

      while ((match = codeBlockRegex.exec(content)) !== null) {
        const language = match[1] || 'plaintext';
        const code = match[2].trim();

        if (code.length > 50) {
          // Only create canvas for substantial code
          const canvas: Canvas = {
            id: `canvas_${Date.now()}_${index}`,
            sessionId,
            title: `Code ${index + 1}`,
            type: 'code',
            content: code,
            language,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          addCanvas(sessionId, canvas);
          index++;
        }
      }

      // Open canvas panel if canvases were extracted
      if (index > 0) {
        setCanvasPanelOpen(true);
      }
    },
    [addCanvas, setCanvasPanelOpen]
  );

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Handle send
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return;
    const content = inputValue.trim();
    setInputValue('');
    clearAttachments();
    sendMessageMutation.mutate(content);
  }, [inputValue, isStreaming, sendMessageMutation, setInputValue, clearAttachments]);

  // Handle file select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => addAttachment(file));
    e.target.value = '';
  };

  // Copy message
  const handleCopy = async (content: string, id: string) => {
    await copyToClipboard(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Key handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle mobile session selection
  const handleMobileSelectSession = useCallback((id: string) => {
    setCurrentSession(id);
    setMobileSidebarOpen(false);
    setShowMobileChat(true);
  }, [setCurrentSession]);

  // Handle mobile back navigation
  const handleMobileBack = useCallback(() => {
    setShowMobileChat(false);
  }, []);

  // Handle mobile new chat
  const handleMobileNewChat = useCallback(() => {
    haptics.medium();
    createSessionMutation.mutate();
    setShowMobileChat(true);
  }, [createSessionMutation]);

  return (
    <div className={cn(
      'flex',
      isMobile ? 'h-[calc(100vh-var(--header-height,3.5rem)-var(--bottom-nav-height,0px))]' : 'h-[calc(100vh-4rem)]'
    )}>
      {/* Desktop Folder sidebar */}
      {!isMobile && !sidebarCollapsed && (
        <Card className="w-64 shrink-0 hidden lg:flex flex-col">
          <FolderSidebar
            onNewSession={() => createSessionMutation.mutate()}
            onSelectSession={(id) => setCurrentSession(id)}
            onNewFolder={() => setShowNewFolderModal(true)}
          />
        </Card>
      )}

      {/* Mobile Sidebar Sheet */}
      {isMobile && (
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-xs p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Chat sessies</SheetTitle>
            </SheetHeader>
            <FolderSidebar
              onNewSession={() => {
                createSessionMutation.mutate();
                setMobileSidebarOpen(false);
                setShowMobileChat(true);
              }}
              onSelectSession={handleMobileSelectSession}
              onNewFolder={() => {
                setMobileSidebarOpen(false);
                setShowNewFolderModal(true);
              }}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Main chat area */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        isMobile && !showMobileChat && 'hidden',
        isMobile && showMobileChat && 'absolute inset-0 z-20 bg-background'
      )}>
        {/* Mobile Header */}
        {isMobile && (
          <MobileChatHeader
            session={currentSession}
            agent={currentAgent}
            onBack={handleMobileBack}
            onNewChat={handleMobileNewChat}
            onTogglePin={() => {
              if (currentSession) {
                updateSessionMutation.mutate({
                  sessionId: currentSession.id,
                  updates: { isPinned: !currentSession.isPinned },
                });
              }
            }}
            onToggleArchive={() => {
              if (currentSession) {
                updateSessionMutation.mutate({
                  sessionId: currentSession.id,
                  updates: { isArchived: !currentSession.isArchived },
                });
              }
            }}
            onDelete={() => {
              if (currentSession) {
                deleteSessionMutation.mutate(currentSession.id);
                setShowMobileChat(false);
              }
            }}
          />
        )}

        {/* Desktop Header */}
        {!isMobile && (
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                className="lg:hidden"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                {sidebarCollapsed ? (
                  <PanelRightOpen className="h-4 w-4" />
                ) : (
                  <PanelRightClose className="h-4 w-4" />
                )}
              </Button>

              {currentSession ? (
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="font-semibold truncate">{currentSession.title}</h2>
                  {currentSession.agent && (
                    <AgentBadge agent={currentSession.agent} size="sm" />
                  )}
                </div>
              ) : (
                <h2 className="font-semibold">New Chat</h2>
              )}
            </div>

            <div className="flex items-center gap-2">
              <AgentSelector
                onSelect={(agent) => {
                  if (currentSession) {
                    updateSessionMutation.mutate({
                      sessionId: currentSession.id,
                      updates: { agentId: agent.id },
                    });
                  }
                }}
                onOpenSettings={() => setShowSettingsModal(true)}
                size="sm"
              />

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCanvasPanelOpen(!canvasPanelOpen)}
              >
                {canvasPanelOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>

              {currentSession && (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShowSessionMenu(!showSessionMenu)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>

                  {showSessionMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowSessionMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 w-48 bg-light-surface dark:bg-dark-elevated rounded-lg shadow-lg border z-50 py-1">
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-light-hover dark:hover:bg-dark-hover"
                          onClick={() => {
                            setShowSessionMenu(false);
                            updateSessionMutation.mutate({
                              sessionId: currentSession.id,
                              updates: { isPinned: !currentSession.isPinned },
                            });
                          }}
                        >
                          <Pin className="h-4 w-4" />
                          {currentSession.isPinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-light-hover dark:hover:bg-dark-hover"
                          onClick={() => {
                            setShowSessionMenu(false);
                            updateSessionMutation.mutate({
                              sessionId: currentSession.id,
                              updates: { isArchived: !currentSession.isArchived },
                            });
                          }}
                        >
                          <Archive className="h-4 w-4" />
                          {currentSession.isArchived ? 'Unarchive' : 'Archive'}
                        </button>
                        <div className="h-px bg-border my-1" />
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10"
                          onClick={() => {
                            setShowSessionMenu(false);
                            deleteSessionMutation.mutate(currentSession.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 && !streamingContent ? (
              <EmptyState onNewChat={() => createSessionMutation.mutate()} />
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onCopy={handleCopy}
                    copied={copiedId === msg.id}
                  />
                ))}
                {streamingContent && (
                  <MessageBubble
                    message={{
                      id: 'streaming',
                      sessionId: currentSession?.id || '',
                      role: 'assistant',
                      content: streamingContent,
                      isEdited: false,
                      createdAt: new Date().toISOString(),
                    }}
                    streaming
                  />
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex gap-2 flex-wrap">
              {pendingAttachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 bg-light-surface dark:bg-dark-elevated rounded-lg"
                >
                  {getFileType(file.name) === 'image' ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm truncate max-w-[150px]">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5"
                    onClick={() => removeAttachment(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input area - keyboard aware on mobile */}
        <div
          className={cn(
            'p-4 border-t bg-background',
            isMobile && 'pb-safe'
          )}
          style={isMobile && keyboardHeight > 0 ? { paddingBottom: `${keyboardHeight}px` } : undefined}
        >
          <div className="flex gap-2 max-w-3xl mx-auto items-end">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                haptics.light();
                fileInputRef.current?.click();
              }}
              className="shrink-0"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isMobile ? "Bericht..." : "Type your message..."}
              className={cn(
                'flex-1 min-h-[44px] max-h-32 px-4 py-2 rounded-lg border',
                'bg-light-surface dark:bg-dark-elevated resize-none',
                'focus:outline-none focus:ring-2 focus:ring-zentoria-500',
                'touch-manipulation'
              )}
              disabled={isStreaming}
              rows={1}
            />
            <Button
              onClick={() => {
                haptics.medium();
                handleSend();
              }}
              disabled={!inputValue.trim() || isStreaming}
              className="shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile session list view (shown when not in chat) */}
      {isMobile && !showMobileChat && (
        <div className="flex-1 flex flex-col bg-background">
          {/* Mobile header for session list */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b px-4 py-3 pt-safe">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold">Chat</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  haptics.light();
                  setMobileSidebarOpen(true);
                }}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Session list content */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              <FolderSidebar
                onNewSession={handleMobileNewChat}
                onSelectSession={handleMobileSelectSession}
                onNewFolder={() => setShowNewFolderModal(true)}
              />
            </div>
          </ScrollArea>

          {/* Floating Action Button */}
          <ChatFAB onClick={handleMobileNewChat} />
        </div>
      )}

      {/* Canvas panel - desktop only for now */}
      {!isMobile && <CanvasPanel />}
    </div>
  );
}

// Empty state
function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-zentoria-500/10 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="h-8 w-8 text-zentoria-500" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-6">
        Ask me anything! I can help with coding, analysis, writing, and much more.
      </p>
      <Button onClick={onNewChat}>
        <Plus className="mr-2 h-4 w-4" />
        New Chat
      </Button>
    </div>
  );
}

// Message bubble
interface MessageBubbleProps {
  message: EnhancedChatMessage;
  onCopy?: (content: string, id: string) => void;
  copied?: boolean;
  streaming?: boolean;
}

function MessageBubble({ message, onCopy, copied, streaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-zentoria-500' : 'bg-dark-elevated'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-zentoria-500" />
        )}
      </div>
      <div
        className={cn(
          'flex-1 max-w-[85%] group',
          isUser && 'flex justify-end'
        )}
      >
        <div
          className={cn(
            'px-4 py-3',
            isUser ? 'message-user' : 'message-ai'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-zentoria">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeString = String(children).replace(/\n$/, '');
                    const isInline = !match && !codeString.includes('\n');
                    return !isInline && match ? (
                      <CodeBlock code={codeString} language={match[1]} />
                    ) : (
                      <InlineCode className={className}>{children}</InlineCode>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {streaming && (
                <span className="inline-flex gap-1 ml-1 typing-indicator">
                  <span className="w-1.5 h-1.5 bg-zentoria-500 rounded-full" />
                  <span className="w-1.5 h-1.5 bg-zentoria-500 rounded-full" />
                  <span className="w-1.5 h-1.5 bg-zentoria-500 rounded-full" />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-light-hover dark:bg-dark-hover rounded-lg text-sm"
              >
                <FileText className="h-4 w-4" />
                <span className="truncate max-w-[150px]">{attachment.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {!isUser && !streaming && onCopy && (
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onCopy(message.content, message.id)}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
            {message.isEdited && (
              <span className="text-xs text-muted-foreground ml-2">(edited)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
