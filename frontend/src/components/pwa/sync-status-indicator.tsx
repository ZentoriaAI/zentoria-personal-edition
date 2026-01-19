'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Cloud, CloudOff, AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getSyncStats,
  triggerSync,
  onServiceWorkerMessage,
  type SyncStats,
} from '@/lib/sw-registration';
import { useOnlineStatus } from './service-worker-provider';

type SyncState = 'idle' | 'syncing' | 'pending' | 'error' | 'success';

interface SyncStatusIndicatorProps {
  position?: 'top' | 'bottom' | 'inline';
  showDetails?: boolean;
  className?: string;
}

export function SyncStatusIndicator({
  position = 'inline',
  showDetails = false,
  className,
}: SyncStatusIndicatorProps) {
  const isOnline = useOnlineStatus();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refresh stats periodically
  const refreshStats = useCallback(async () => {
    try {
      const newStats = await getSyncStats();
      setStats(newStats);

      if (newStats) {
        if (newStats.syncing > 0) {
          setSyncState('syncing');
        } else if (newStats.pending > 0) {
          setSyncState('pending');
        } else if (newStats.failed > 0) {
          setSyncState('error');
        } else {
          setSyncState('idle');
        }
      }
    } catch (err) {
      console.error('[SyncStatus] Failed to get stats:', err);
    }
  }, []);

  // Initial load and periodic refresh
  useEffect(() => {
    refreshStats();

    const interval = setInterval(refreshStats, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, [refreshStats]);

  // Listen for SW messages
  useEffect(() => {
    const unsubscribe = onServiceWorkerMessage((event) => {
      const { type, payload } = event.data || {};

      switch (type) {
        case 'SYNC_STARTED':
          setSyncState('syncing');
          break;

        case 'SYNC_COMPLETE':
          setSyncState('success');
          setLastSync(new Date());
          setError(null);
          // Reset to idle after 3 seconds
          setTimeout(() => setSyncState('idle'), 3000);
          refreshStats();
          break;

        case 'SYNC_ERROR':
          setSyncState('error');
          setError(payload?.error || 'Sync failed');
          refreshStats();
          break;

        case 'MESSAGE_SYNCED':
          refreshStats();
          break;
      }
    });

    return unsubscribe;
  }, [refreshStats]);

  // Handle manual sync
  const handleManualSync = async () => {
    if (syncState === 'syncing' || !isOnline) return;

    try {
      setSyncState('syncing');
      await triggerSync();
    } catch (err) {
      console.error('[SyncStatus] Manual sync failed:', err);
      setSyncState('error');
      setError(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  // Don't show if no pending items and idle
  if (syncState === 'idle' && (!stats || stats.total === 0)) {
    return null;
  }

  const getIcon = () => {
    switch (syncState) {
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'pending':
        return <Cloud className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      case 'success':
        return <Check className="h-4 w-4" />;
      default:
        return isOnline ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />;
    }
  };

  const getMessage = () => {
    switch (syncState) {
      case 'syncing':
        return 'Synchroniseren...';
      case 'pending':
        return `${stats?.pending || 0} wachtend`;
      case 'error':
        return error || 'Sync mislukt';
      case 'success':
        return 'Gesynchroniseerd';
      default:
        return isOnline ? 'Online' : 'Offline';
    }
  };

  const getStyles = () => {
    switch (syncState) {
      case 'syncing':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'success':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      default:
        return isOnline
          ? 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
          : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20';
    }
  };

  // Inline version (for header/nav)
  if (position === 'inline') {
    return (
      <button
        onClick={handleManualSync}
        disabled={syncState === 'syncing' || !isOnline}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition-colors',
          'hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed',
          getStyles(),
          className
        )}
        title={showDetails && stats ? `Total: ${stats.total}, Pending: ${stats.pending}, Failed: ${stats.failed}` : getMessage()}
      >
        {getIcon()}
        <span>{getMessage()}</span>
        {(syncState === 'pending' || syncState === 'error') && isOnline && (
          <RefreshCw className="h-3 w-3 ml-1" />
        )}
      </button>
    );
  }

  // Fixed position version
  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-50 flex justify-center px-4',
        position === 'top' ? 'top-0 pt-safe' : 'bottom-0 pb-safe',
        className
      )}
    >
      <button
        onClick={handleManualSync}
        disabled={syncState === 'syncing' || !isOnline}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium shadow-lg border',
          'animate-in slide-in-from-top-4 duration-300 transition-colors',
          'hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed',
          position === 'top' ? 'mt-4' : 'mb-4',
          getStyles()
        )}
      >
        {getIcon()}
        <span>{getMessage()}</span>
        {showDetails && stats && stats.total > 0 && (
          <span className="text-xs opacity-70">
            ({stats.pending} wachtend
            {stats.failed > 0 && `, ${stats.failed} mislukt`})
          </span>
        )}
        {(syncState === 'pending' || syncState === 'error') && isOnline && (
          <RefreshCw className="h-4 w-4 ml-1" />
        )}
      </button>
    </div>
  );
}

/**
 * Compact sync status for header
 */
export function SyncStatusCompact({ className }: { className?: string }) {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      const stats = await getSyncStats();
      if (stats) {
        setPendingCount(stats.pending + stats.failed);
        setIsSyncing(stats.syncing > 0);
      }
    };

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = onServiceWorkerMessage((event) => {
      const { type } = event.data || {};
      if (type === 'SYNC_STARTED') setIsSyncing(true);
      if (type === 'SYNC_COMPLETE' || type === 'SYNC_ERROR') setIsSyncing(false);
    });
    return unsubscribe;
  }, []);

  // Don't show if nothing pending and online
  if (isOnline && pendingCount === 0 && !isSyncing) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
        isSyncing
          ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
          : !isOnline
          ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
          : pendingCount > 0
          ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
          : '',
        className
      )}
    >
      {isSyncing ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : !isOnline ? (
        <CloudOff className="h-3 w-3" />
      ) : pendingCount > 0 ? (
        <Cloud className="h-3 w-3" />
      ) : null}
      {isSyncing && <span>Syncing</span>}
      {!isOnline && !isSyncing && <span>Offline</span>}
      {isOnline && pendingCount > 0 && !isSyncing && <span>{pendingCount}</span>}
    </div>
  );
}

/**
 * Hook for sync status
 */
export function useSyncStatus() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const refresh = useCallback(async () => {
    const newStats = await getSyncStats();
    setStats(newStats);
    if (newStats) {
      setIsSyncing(newStats.syncing > 0);
    }
  }, []);

  const sync = useCallback(async () => {
    if (!isOnline) return;
    try {
      setIsSyncing(true);
      setError(null);
      await triggerSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      setIsSyncing(false);
    }
  }, [isOnline]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = onServiceWorkerMessage((event) => {
      const { type, payload } = event.data || {};
      if (type === 'SYNC_STARTED') setIsSyncing(true);
      if (type === 'SYNC_COMPLETE') {
        setIsSyncing(false);
        setLastSync(new Date());
        setError(null);
        refresh();
      }
      if (type === 'SYNC_ERROR') {
        setIsSyncing(false);
        setError(payload?.error || 'Sync failed');
        refresh();
      }
    });
    return unsubscribe;
  }, [refresh]);

  return {
    stats,
    isSyncing,
    lastSync,
    error,
    isOnline,
    refresh,
    sync,
    hasPending: (stats?.pending || 0) + (stats?.failed || 0) > 0,
  };
}
