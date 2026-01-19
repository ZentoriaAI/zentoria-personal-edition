'use client';

import { useOnlineStatus } from './service-worker-provider';
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  position?: 'top' | 'bottom';
  showOnline?: boolean;
  className?: string;
}

export function OfflineIndicator({
  position = 'top',
  showOnline = false,
  className,
}: OfflineIndicatorProps) {
  const isOnline = useOnlineStatus();

  // Don't show if online and showOnline is false
  if (isOnline && !showOnline) return null;

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-50 flex justify-center px-4',
        position === 'top' ? 'top-0 pt-safe' : 'bottom-0 pb-safe',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium shadow-lg',
          'animate-in slide-in-from-top-4 duration-300',
          position === 'top' ? 'mt-4' : 'mb-4',
          isOnline
            ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
            : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
        )}
      >
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4" />
            <span>Online</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span>Offline - Beperkte functionaliteit</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Compact offline indicator for header/nav
 */
export function OfflineIndicatorCompact({ className }: { className?: string }) {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
        'bg-red-500/10 text-red-600 dark:text-red-400',
        'animate-pulse',
        className
      )}
    >
      <WifiOff className="h-3 w-3" />
      <span>Offline</span>
    </div>
  );
}
