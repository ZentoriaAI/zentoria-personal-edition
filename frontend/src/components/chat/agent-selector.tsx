'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Code,
  FileText,
  Search,
  Workflow,
  Sparkles,
  ChevronDown,
  Check,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { chatApi } from '@/lib/chat-api';
import {
  useEnhancedChatStore,
  selectAgents,
  selectCurrentAgent,
} from '@/stores/enhanced-chat-store';
import type { Agent } from '@/types';

interface AgentSelectorProps {
  onSelect?: (agent: Agent) => void;
  onOpenSettings?: () => void;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

// Agent icon mapping
const agentIcons: Record<string, React.ReactNode> = {
  chat: <Bot className="h-4 w-4" />,
  code: <Code className="h-4 w-4" />,
  file: <FileText className="h-4 w-4" />,
  search: <Search className="h-4 w-4" />,
  workflow: <Workflow className="h-4 w-4" />,
  creative: <Sparkles className="h-4 w-4" />,
};

export function AgentSelector({
  onSelect,
  onOpenSettings,
  size = 'md',
  showLabel = true,
}: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const agents = useEnhancedChatStore(selectAgents);
  const currentAgent = useEnhancedChatStore(selectCurrentAgent);
  const setSelectedAgent = useEnhancedChatStore((state) => state.setSelectedAgent);

  // Fetch agents
  useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const data = await chatApi.getAgents();
      // Use getState() to avoid creating dependency on setter
      useEnhancedChatStore.getState().setAgents(data.agents);
      return data.agents;
    },
  });

  const handleSelect = (agent: Agent) => {
    setSelectedAgent(agent.id);
    setIsOpen(false);
    onSelect?.(agent);
  };

  const sizeClasses = {
    sm: 'h-7 text-xs',
    md: 'h-9 text-sm',
    lg: 'h-11 text-base',
  };

  const iconSizeClasses = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        className={cn(
          'justify-between min-w-[140px]',
          sizeClasses[size]
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'flex items-center justify-center rounded',
              iconSizeClasses[size]
            )}
            style={{ color: currentAgent?.color || undefined }}
          >
            {currentAgent ? agentIcons[currentAgent.name] || <Bot className={iconSizeClasses[size]} /> : <Bot className={iconSizeClasses[size]} />}
          </span>
          {showLabel && (
            <span className="truncate">
              {currentAgent?.displayName || 'Select Agent'}
            </span>
          )}
        </span>
        <ChevronDown className={cn('ml-2', iconSizeClasses[size])} />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1 w-72 bg-light-surface dark:bg-dark-elevated rounded-lg shadow-xl border z-50">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-medium">Select Agent</span>
              {onOpenSettings && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenSettings();
                  }}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Agent list */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent)}
                  className={cn(
                    'w-full flex items-start gap-3 p-2 rounded-lg transition-colors text-left',
                    currentAgent?.id === agent.id
                      ? 'bg-zentoria-500/10'
                      : 'hover:bg-light-hover dark:hover:bg-dark-hover'
                  )}
                >
                  {/* Icon */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: agent.color ? `${agent.color}20` : 'var(--light-hover)',
                      color: agent.color || 'var(--zentoria-500)',
                    }}
                  >
                    {agentIcons[agent.name] || <Bot className="h-4 w-4" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {agent.displayName}
                      </span>
                      {agent.isDefault && (
                        <Badge variant="secondary" className="text-xs h-4">
                          Default
                        </Badge>
                      )}
                      {currentAgent?.id === agent.id && (
                        <Check className="h-4 w-4 text-zentoria-500 ml-auto" />
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {agent.description}
                      </p>
                    )}
                    {/* Capabilities */}
                    {agent.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {agent.capabilities.slice(0, 3).map((cap) => (
                          <Badge
                            key={cap}
                            variant="outline"
                            className="text-[10px] h-4 px-1"
                          >
                            {cap}
                          </Badge>
                        ))}
                        {agent.capabilities.length > 3 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1"
                          >
                            +{agent.capabilities.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}

              {agents.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No agents available
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t">
              <p className="text-xs text-muted-foreground">
                Model: {currentAgent?.model || 'default'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Compact agent badge for display
interface AgentBadgeProps {
  agent: Agent;
  size?: 'sm' | 'md';
}

export function AgentBadge({ agent, size = 'md' }: AgentBadgeProps) {
  const iconSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full',
        textSizeClasses[size]
      )}
      style={{
        backgroundColor: agent.color ? `${agent.color}15` : 'var(--light-surface)',
        color: agent.color || 'var(--zentoria-500)',
      }}
    >
      <span className={iconSizeClasses[size]}>
        {agentIcons[agent.name] || <Bot className={iconSizeClasses[size]} />}
      </span>
      <span className="font-medium">{agent.displayName}</span>
    </div>
  );
}
