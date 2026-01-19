'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  MoreVertical,
  Trash2,
  Pin,
  Archive,
  Edit3,
  Copy,
  Share2,
  MessageSquarePlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { AgentBadge } from './agent-selector';
import type { ChatSession, Agent } from '@/types';

interface MobileChatHeaderProps {
  session: ChatSession | null;
  agent: Agent | null;
  onBack: () => void;
  onNewChat: () => void;
  onTogglePin?: () => void;
  onToggleArchive?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onDuplicate?: () => void;
  className?: string;
}

export function MobileChatHeader({
  session,
  agent,
  onBack,
  onNewChat,
  onTogglePin,
  onToggleArchive,
  onRename,
  onDelete,
  onShare,
  onDuplicate,
  className,
}: MobileChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleAction = (action?: () => void) => {
    haptics.light();
    setMenuOpen(false);
    action?.();
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-30 bg-[rgb(var(--background))]/95 backdrop-blur-md border-b',
        'h-14 flex items-center justify-between px-2 gap-2',
        'pt-safe',
        className
      )}
    >
      {/* Left - Back button and title */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            haptics.light();
            onBack();
          }}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        {session ? (
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-sm truncate">{session.title}</h1>
            {(session.agent || agent) && (
              <AgentBadge agent={session.agent || agent!} size="sm" />
            )}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-sm">Nieuw gesprek</h1>
            {agent && <AgentBadge agent={agent} size="sm" />}
          </div>
        )}
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-1">
        {/* New chat button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            haptics.light();
            onNewChat();
          }}
        >
          <MessageSquarePlus className="h-5 w-5" />
        </Button>

        {/* More options */}
        {session && (
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => haptics.light()}
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="pb-safe">
              <SheetHeader className="sr-only">
                <SheetTitle>Chat opties</SheetTitle>
              </SheetHeader>

              {/* Session info */}
              <div className="px-4 py-3 border-b">
                <h3 className="font-medium truncate">{session.title}</h3>
                {session.agent && (
                  <p className="text-sm text-muted-foreground">
                    {session.agent.displayName}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {session.messageCount} berichten
                </p>
              </div>

              {/* Actions */}
              <div className="py-2">
                {onTogglePin && (
                  <ActionItem
                    icon={Pin}
                    label={session.isPinned ? 'Losmaken' : 'Vastzetten'}
                    onClick={() => handleAction(onTogglePin)}
                  />
                )}

                {onRename && (
                  <ActionItem
                    icon={Edit3}
                    label="Hernoemen"
                    onClick={() => handleAction(onRename)}
                  />
                )}

                {onDuplicate && (
                  <ActionItem
                    icon={Copy}
                    label="Dupliceren"
                    onClick={() => handleAction(onDuplicate)}
                  />
                )}

                {onShare && (
                  <ActionItem
                    icon={Share2}
                    label="Delen"
                    onClick={() => handleAction(onShare)}
                  />
                )}

                {onToggleArchive && (
                  <ActionItem
                    icon={Archive}
                    label={session.isArchived ? 'Uit archief halen' : 'Archiveren'}
                    onClick={() => handleAction(onToggleArchive)}
                  />
                )}
              </div>

              {/* Destructive actions */}
              {onDelete && (
                <div className="py-2 border-t">
                  <ActionItem
                    icon={Trash2}
                    label="Verwijderen"
                    onClick={() => handleAction(onDelete)}
                    destructive
                  />
                </div>
              )}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </header>
  );
}

interface ActionItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

function ActionItem({ icon: Icon, label, onClick, destructive }: ActionItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-3 text-left',
        'hover:bg-muted/50 active:bg-muted transition-colors',
        'touch-manipulation',
        destructive && 'text-destructive'
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="flex-1">{label}</span>
    </button>
  );
}

/**
 * Floating Action Button for creating new chats
 */
interface ChatFABProps {
  onClick: () => void;
  className?: string;
}

export function ChatFAB({ onClick, className }: ChatFABProps) {
  return (
    <Button
      onClick={() => {
        haptics.medium();
        onClick();
      }}
      className={cn(
        'fixed z-40 w-14 h-14 rounded-full shadow-lg',
        'bg-zentoria-500 hover:bg-zentoria-600 text-white',
        'bottom-20 right-4', // Above bottom nav
        'mb-safe',
        className
      )}
    >
      <MessageSquarePlus className="h-6 w-6" />
    </Button>
  );
}
