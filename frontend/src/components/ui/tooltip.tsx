'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delay?: number;
  className?: string;
}

export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  delay = 300,
  className,
}: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout>();

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  const alignClasses = {
    start: side === 'top' || side === 'bottom' ? 'left-0' : 'top-0',
    center: side === 'top' || side === 'bottom' ? 'left-1/2 -translate-x-1/2' : 'top-1/2 -translate-y-1/2',
    end: side === 'top' || side === 'bottom' ? 'right-0' : 'bottom-0',
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={cn(
            'absolute z-50 px-3 py-2 text-xs font-medium rounded-lg',
            'bg-dark-bg text-white dark:bg-light-bg dark:text-dark-bg',
            'shadow-lg whitespace-nowrap',
            'animate-in fade-in-0 zoom-in-95',
            positionClasses[side],
            alignClasses[align],
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}

// File info tooltip with more detailed content
interface FileInfoTooltipProps {
  children: React.ReactNode;
  name: string;
  type: string;
  size?: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  formatBytes?: (bytes: number) => string;
  formatDate?: (date: Date | string) => string;
}

export function FileInfoTooltip({
  children,
  name,
  type,
  size,
  createdAt,
  updatedAt,
  formatBytes = (b) => `${(b / 1024).toFixed(1)} KB`,
  formatDate = (d) => new Date(d).toLocaleDateString(),
}: FileInfoTooltipProps) {
  const content = (
    <div className="space-y-1 min-w-[180px] max-w-[280px]">
      <p className="font-medium truncate">{name}</p>
      <div className="text-[10px] opacity-75 space-y-0.5">
        <p>Type: {type}</p>
        {size !== undefined && <p>Size: {formatBytes(size)}</p>}
        {createdAt && <p>Created: {formatDate(createdAt)}</p>}
        {updatedAt && <p>Modified: {formatDate(updatedAt)}</p>}
      </div>
    </div>
  );

  return (
    <Tooltip content={content} side="right" align="start" delay={500}>
      {children}
    </Tooltip>
  );
}
