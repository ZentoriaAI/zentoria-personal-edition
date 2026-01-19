'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ContextMenuProps {
  children: React.ReactNode;
  menu: React.ReactNode;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

const ContextMenuContext = React.createContext<{
  state: ContextMenuState;
  close: () => void;
} | null>(null);

export function ContextMenu({ children, menu }: ContextMenuProps) {
  const [state, setState] = React.useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
  });

  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Calculate position to keep menu in viewport
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 300);

    setState({ isOpen: true, x, y });
  }, []);

  const close = React.useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Close on click outside
  React.useEffect(() => {
    if (state.isOpen) {
      const handleClick = () => close();
      const handleScroll = () => close();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
      };

      document.addEventListener('click', handleClick);
      document.addEventListener('scroll', handleScroll, true);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('click', handleClick);
        document.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [state.isOpen, close]);

  return (
    <ContextMenuContext.Provider value={{ state, close }}>
      <div onContextMenu={handleContextMenu} className="contents">
        {children}
      </div>
      {state.isOpen && (
        <div
          className="fixed z-[100] min-w-[180px] overflow-hidden rounded-lg border bg-[rgb(var(--popover))] text-[rgb(var(--popover-foreground))] shadow-lg animate-in fade-in-0 zoom-in-95"
          style={{ left: state.x, top: state.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu}
        </div>
      )}
    </ContextMenuContext.Provider>
  );
}

interface ContextMenuItemProps {
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
  shortcut?: string;
  icon?: React.ReactNode;
}

export function ContextMenuItem({
  onClick,
  disabled,
  destructive,
  children,
  shortcut,
  icon,
}: ContextMenuItemProps) {
  const context = React.useContext(ContextMenuContext);

  const handleClick = () => {
    if (disabled) return;
    onClick?.();
    context?.close();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-sm outline-none transition-colors',
        'hover:bg-light-hover dark:hover:bg-dark-hover',
        'focus-visible:bg-light-hover dark:focus-visible:bg-dark-hover',
        disabled && 'opacity-50 cursor-not-allowed',
        destructive && 'text-red-500 hover:text-red-600 hover:bg-red-500/10 dark:hover:bg-red-500/20'
      )}
    >
      {icon && <span className="w-4 h-4 flex items-center justify-center">{icon}</span>}
      <span className="flex-1 text-left">{children}</span>
      {shortcut && (
        <span className="ml-auto text-xs text-muted-foreground">{shortcut}</span>
      )}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div className="h-px bg-[rgb(var(--border))] my-1" />;
}

export function ContextMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      {children}
    </div>
  );
}
