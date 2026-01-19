'use client';

import { useState } from 'react';
import {
  X,
  Trash2,
  Download,
  FolderInput,
  Share2,
  Copy,
  CheckSquare,
  Square,
  MoreHorizontal,
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
import type { FileItem } from '@/types';

interface BatchToolbarProps {
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onMove?: () => void;
  onShare?: () => void;
  onCopy?: () => void;
  isDeleting?: boolean;
  className?: string;
}

export function BatchToolbar({
  selectedCount,
  totalCount,
  onClearSelection,
  onSelectAll,
  onDelete,
  onDownload,
  onMove,
  onShare,
  onCopy,
  isDeleting = false,
  className,
}: BatchToolbarProps) {
  const [showMoreActions, setShowMoreActions] = useState(false);

  if (selectedCount === 0) return null;

  const handleAction = (action: () => void) => {
    haptics.medium();
    action();
  };

  const handleMoreAction = (action: () => void) => {
    haptics.light();
    setShowMoreActions(false);
    action();
  };

  const allSelected = selectedCount === totalCount;

  return (
    <>
      {/* Floating toolbar */}
      <div
        className={cn(
          'fixed bottom-20 left-4 right-4 z-30', // Above bottom nav
          'bg-[rgb(var(--background))]/95 backdrop-blur-lg',
          'border rounded-2xl shadow-xl',
          'px-3 py-2',
          'animate-in slide-in-from-bottom-4 duration-300',
          'md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-auto md:min-w-[400px]',
          className
        )}
      >
        <div className="flex items-center gap-2">
          {/* Close / Clear */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              haptics.light();
              onClearSelection();
            }}
            className="shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Selection info */}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">
              {selectedCount} geselecteerd
            </span>
          </div>

          {/* Select all toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              haptics.light();
              if (allSelected) {
                onClearSelection();
              } else {
                onSelectAll();
              }
            }}
            title={allSelected ? 'Selectie wissen' : 'Alles selecteren'}
            className="shrink-0 hidden sm:flex"
          >
            {allSelected ? (
              <CheckSquare className="h-5 w-5 text-zentoria-500" />
            ) : (
              <Square className="h-5 w-5" />
            )}
          </Button>

          {/* Divider */}
          <div className="w-px h-6 bg-border" />

          {/* Quick actions */}
          <div className="flex items-center gap-1">
            {onShare && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleAction(onShare)}
                title="Delen"
                className="hidden sm:flex"
              >
                <Share2 className="h-5 w-5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleAction(onDownload)}
              title="Downloaden"
            >
              <Download className="h-5 w-5" />
            </Button>

            {onMove && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleAction(onMove)}
                title="Verplaatsen"
                className="hidden sm:flex"
              >
                <FolderInput className="h-5 w-5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleAction(onDelete)}
              disabled={isDeleting}
              title="Verwijderen"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-5 w-5" />
            </Button>

            {/* More actions (mobile) */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                haptics.light();
                setShowMoreActions(true);
              }}
              className="sm:hidden"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* More actions sheet (mobile) */}
      <Sheet open={showMoreActions} onOpenChange={setShowMoreActions}>
        <SheetContent side="bottom" className="pb-safe">
          <SheetHeader className="sr-only">
            <SheetTitle>Meer acties</SheetTitle>
          </SheetHeader>

          <div className="py-2 space-y-1">
            <ActionItem
              icon={allSelected ? CheckSquare : Square}
              label={allSelected ? 'Selectie wissen' : 'Alles selecteren'}
              onClick={() =>
                handleMoreAction(allSelected ? onClearSelection : onSelectAll)
              }
            />

            {onShare && (
              <ActionItem
                icon={Share2}
                label="Delen"
                onClick={() => handleMoreAction(onShare)}
              />
            )}

            <ActionItem
              icon={Download}
              label="Downloaden"
              onClick={() => handleMoreAction(onDownload)}
            />

            {onMove && (
              <ActionItem
                icon={FolderInput}
                label="Verplaatsen naar..."
                onClick={() => handleMoreAction(onMove)}
              />
            )}

            {onCopy && (
              <ActionItem
                icon={Copy}
                label="Pad kopiëren"
                onClick={() => handleMoreAction(onCopy)}
              />
            )}

            <div className="h-px bg-border my-2" />

            <ActionItem
              icon={Trash2}
              label="Verwijderen"
              onClick={() => handleMoreAction(onDelete)}
              destructive
              disabled={isDeleting}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

interface ActionItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

function ActionItem({
  icon: Icon,
  label,
  onClick,
  destructive,
  disabled,
}: ActionItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-3 text-left rounded-lg',
        'hover:bg-muted/50 active:bg-muted transition-colors',
        'touch-manipulation',
        destructive && 'text-destructive',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="flex-1">{label}</span>
    </button>
  );
}

/**
 * Empty selection state component
 */
interface EmptySelectionProps {
  onSelectAll: () => void;
}

export function EmptySelectionHint({ onSelectAll }: EmptySelectionProps) {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 md:hidden">
      <button
        onClick={() => {
          haptics.light();
          onSelectAll();
        }}
        className={cn(
          'flex items-center gap-2 px-4 py-2',
          'bg-muted/80 backdrop-blur-sm rounded-full',
          'text-sm text-muted-foreground',
          'hover:bg-muted transition-colors'
        )}
      >
        <CheckSquare className="h-4 w-4" />
        Tik om te selecteren
      </button>
    </div>
  );
}
