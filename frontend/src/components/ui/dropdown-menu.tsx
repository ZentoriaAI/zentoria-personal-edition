'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check } from 'lucide-react';

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

export function DropdownMenu({ trigger, children, align = 'end' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    if (isOpen) {
      const handleClick = (e: MouseEvent) => {
        if (
          triggerRef.current?.contains(e.target as Node) ||
          menuRef.current?.contains(e.target as Node)
        ) {
          return;
        }
        setIsOpen(false);
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false);
      };

      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('mousedown', handleClick);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen]);

  return (
    <div className="relative inline-block">
      <div ref={triggerRef} onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>
      {isOpen && (
        <div
          ref={menuRef}
          className={cn(
            'absolute z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border bg-[rgb(var(--popover))] text-[rgb(var(--popover-foreground))] shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
            align === 'start' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            align === 'end' && 'right-0'
          )}
        >
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<{ onClose?: () => void }>, {
                  onClose: () => setIsOpen(false),
                })
              : child
          )}
        </div>
      )}
    </div>
  );
}

interface DropdownMenuItemProps {
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: () => void;
}

export function DropdownMenuItem({
  onClick,
  disabled,
  selected,
  children,
  icon,
  onClose,
}: DropdownMenuItemProps) {
  const handleClick = () => {
    if (disabled) return;
    onClick?.();
    onClose?.();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-sm outline-none transition-colors',
        'hover:bg-light-hover dark:hover:bg-dark-hover',
        disabled && 'opacity-50 cursor-not-allowed',
        selected && 'bg-zentoria-500/10 text-zentoria-500'
      )}
    >
      {icon && <span className="w-4 h-4 flex items-center justify-center">{icon}</span>}
      <span className="flex-1 text-left">{children}</span>
      {selected && <Check className="w-4 h-4" />}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="h-px bg-[rgb(var(--border))] my-1" />;
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      {children}
    </div>
  );
}
