'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Paperclip,
  Plus,
  Trash2,
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
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock, InlineCode } from '@/components/ui/code-block'; // PERF-007
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { useChatStore } from '@/stores/chat-store';
import { toast } from '@/stores/app-store';
import { cn, formatRelativeTime, copyToClipboard, getFileType, formatBytes } from '@/lib/utils';
import type { ChatMessage, Conversation } from '@/types';

export default function ChatPage() {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    currentConversationId,
    setCurrentConversation,
    inputValue,
    setInputValue,
    isStreaming,
    setIsStreaming,
    streamingContent,
    appendStreamingContent,
    clearStreamingContent,
    pendingAttachments,
    addAttachment,
    removeAttachment,
    clearAttachments,
  } = useChatStore();

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch conversations
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiClient.getConversations(1, 50),
  });

  // Fetch messages for current conversation
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['messages', currentConversationId],
    queryFn: () => currentConversationId ? apiClient.getMessages(currentConversationId) : null,
    enabled: !!currentConversationId,
  });

  // Create conversation mutation
  const createConversation = useMutation({
    mutationFn: () => apiClient.createConversation(),
    onSuccess: (conversation) => {
      setCurrentConversation(conversation.id);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Delete conversation mutation
  const deleteConversation = useMutation({
    mutationFn: (id: string) => apiClient.deleteConversation(id),
    onSuccess: () => {
      setCurrentConversation(null);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversation deleted', variant: 'success' });
    },
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      let convId = currentConversationId;

      // Create new conversation if needed
      if (!convId) {
        const conv = await apiClient.createConversation();
        convId = conv.id;
        setCurrentConversation(conv.id);
      }

      // Use streaming
      return new Promise<void>((resolve, reject) => {
        setIsStreaming(true);
        clearStreamingContent();

        const abort = apiClient.streamMessage(
          { message, conversationId: convId!, stream: true },
          (chunk) => appendStreamingContent(chunk),
          (error) => {
            setIsStreaming(false);
            reject(error);
          },
          () => {
            setIsStreaming(false);
            queryClient.invalidateQueries({ queryKey: ['messages', convId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            resolve();
          }
        );
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to send message',
        description: error.message,
        variant: 'error',
      });
    },
  });

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.items, streamingContent]);

  // Handle send
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return;
    const message = inputValue.trim();
    setInputValue('');
    clearAttachments();
    sendMessage.mutate(message);
  }, [inputValue, isStreaming, sendMessage, setInputValue, clearAttachments]);

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

  const messages = messagesData?.items || [];
  const conversations = conversationsData?.items || [];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversation sidebar */}
      <Card className="w-64 shrink-0 hidden lg:flex flex-col">
        <div className="p-3 border-b">
          <Button
            className="w-full"
            onClick={() => createConversation.mutate()}
            disabled={createConversation.isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setCurrentConversation(conv.id)}
                className={cn(
                  'w-full text-left p-3 rounded-lg transition-colors group',
                  conv.id === currentConversationId
                    ? 'bg-zentoria-500/10 text-zentoria-500'
                    : 'hover:bg-light-hover dark:hover:bg-dark-hover'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate flex-1">{conv.title}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation.mutate(conv.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(conv.updatedAt)}
                </span>
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                No conversations yet
              </p>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Chat area */}
      <Card className="flex-1 flex flex-col">
        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 && !streamingContent ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-zentoria-500/10 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-8 w-8 text-zentoria-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Ask me anything! I can help with coding, analysis, writing, and much more.
                </p>
              </div>
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
                      conversationId: currentConversationId || '',
                      role: 'assistant',
                      content: streamingContent,
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

        {/* Input area */}
        <div className="p-4 border-t">
          <div className="flex gap-2 max-w-3xl mx-auto">
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
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="flex-1"
              disabled={isStreaming}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isStreaming}
            >
              {isStreaming ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Message bubble component
interface MessageBubbleProps {
  message: ChatMessage;
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
                  // PERF-007: Using lightweight CodeBlock instead of react-syntax-highlighter
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
          </div>
        )}
      </div>
    </div>
  );
}
