'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Copy,
  Edit3,
  Trash2,
  Reply,
  Forward,
  Pin,
  MoreHorizontal,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface MessageAction {
  id: string;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface MessageActionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messageContent: string;
  isOwnMessage: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onPin?: () => void;
}

export function MessageActionsDrawer({
  isOpen,
  onClose,
  messageContent,
  isOwnMessage,
  onEdit,
  onDelete,
  onCopy,
  onReply,
  onForward,
  onPin,
}: MessageActionsDrawerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    haptics.light();
    try {
      await navigator.clipboard.writeText(messageContent);
      setCopied(true);
      onCopy?.();
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
      haptics.error();
    }
  }, [messageContent, onCopy, onClose]);

  const handleAction = (action: () => void, close: boolean = true) => {
    haptics.light();
    action();
    if (close) onClose();
  };

  const actions: MessageAction[] = [
    {
      id: 'copy',
      icon: copied ? Check : Copy,
      label: copied ? 'Gekopieerd!' : 'Kopiëren',
      onClick: handleCopy,
    },
    {
      id: 'reply',
      icon: Reply,
      label: 'Beantwoorden',
      onClick: () => handleAction(onReply || (() => {})),
      disabled: !onReply,
    },
    ...(isOwnMessage
      ? [
          {
            id: 'edit',
            icon: Edit3,
            label: 'Bewerken',
            onClick: () => handleAction(onEdit || (() => {})),
            disabled: !onEdit,
          },
        ]
      : []),
    {
      id: 'forward',
      icon: Forward,
      label: 'Doorsturen',
      onClick: () => handleAction(onForward || (() => {})),
      disabled: !onForward,
    },
    {
      id: 'pin',
      icon: Pin,
      label: 'Vastpinnen',
      onClick: () => handleAction(onPin || (() => {})),
      disabled: !onPin,
    },
    ...(isOwnMessage
      ? [
          {
            id: 'delete',
            icon: Trash2,
            label: 'Verwijderen',
            onClick: () => handleAction(onDelete || (() => {})),
            destructive: true,
            disabled: !onDelete,
          },
        ]
      : []),
  ].filter((action) => !action.disabled);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="pb-safe">
        <SheetHeader className="sr-only">
          <SheetTitle>Bericht opties</SheetTitle>
        </SheetHeader>

        {/* Message preview */}
        <div className="px-4 py-3 border-b">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {messageContent}
          </p>
        </div>

        {/* Actions grid */}
        <div className="grid grid-cols-4 gap-2 p-4">
          {actions.map((action) => (
            <ActionButton
              key={action.id}
              icon={action.icon}
              label={action.label}
              onClick={action.onClick}
              destructive={action.destructive}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface ActionButtonProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

function ActionButton({ icon: Icon, label, onClick, destructive }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 p-3 rounded-xl',
        'hover:bg-muted/50 active:bg-muted transition-colors',
        'touch-manipulation',
        destructive && 'text-destructive'
      )}
    >
      <div
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center',
          destructive
            ? 'bg-destructive/10'
            : 'bg-muted'
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

/**
 * Swipeable Message Wrapper
 * Wraps a message component to add swipe-to-reveal actions
 */
interface SwipeableMessageProps {
  children: React.ReactNode;
  isOwnMessage: boolean;
  onSwipeAction: () => void;
  className?: string;
}

export function SwipeableMessage({
  children,
  isOwnMessage,
  onSwipeAction,
  className,
}: SwipeableMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);

  const SWIPE_THRESHOLD = 60;
  const MAX_SWIPE = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = startX.current;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;

    // Swipe direction based on message ownership
    // Own messages: swipe left to reveal actions (negative diff)
    // Other messages: swipe right to reveal actions (positive diff)
    const swipeDirection = isOwnMessage ? -1 : 1;
    const adjustedDiff = diff * swipeDirection;

    if (adjustedDiff > 0) {
      // Apply resistance after threshold
      const resistedDiff = adjustedDiff > MAX_SWIPE
        ? MAX_SWIPE + (adjustedDiff - MAX_SWIPE) * 0.2
        : adjustedDiff;
      setTranslateX(resistedDiff * swipeDirection);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);

    const swipeAmount = Math.abs(translateX);
    if (swipeAmount > SWIPE_THRESHOLD) {
      haptics.medium();
      onSwipeAction();
    }

    // Reset position with animation
    setTranslateX(0);
  };

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Background action indicator */}
      <div
        className={cn(
          'absolute inset-y-0 flex items-center px-4',
          isOwnMessage ? 'right-0' : 'left-0',
          'text-muted-foreground'
        )}
      >
        <MoreHorizontal
          className={cn(
            'h-5 w-5 transition-opacity',
            Math.abs(translateX) > SWIPE_THRESHOLD / 2
              ? 'opacity-100'
              : 'opacity-50'
          )}
        />
      </div>

      {/* Swipeable content */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        className="relative bg-[rgb(var(--background))]"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Long Press Handler Hook
 * Detects long press to trigger actions drawer
 */
export function useLongPress(
  callback: () => void,
  { threshold = 500 }: { threshold?: number } = {}
) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const isLongPress = useRef(false);

  const start = useCallback(() => {
    isLongPress.current = false;
    timeoutRef.current = setTimeout(() => {
      isLongPress.current = true;
      haptics.medium();
      callback();
    }, threshold);
  }, [callback, threshold]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const onClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isLongPress.current) {
      e.preventDefault();
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onClick,
  };
}
