'use client';

import { useRef, useEffect, useState, useCallback, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number; // Distance to trigger refresh (default: 80px)
  resistance?: number; // Pull resistance (default: 2.5)
  maxPull?: number; // Maximum pull distance (default: 150px)
  disabled?: boolean;
  className?: string;
}

type RefreshState = 'idle' | 'pulling' | 'ready' | 'refreshing';

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  resistance = 2.5,
  maxPull = 150,
  disabled = false,
  className,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RefreshState>('idle');
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);

  const handleRefresh = useCallback(async () => {
    setState('refreshing');

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate([20, 50, 20]);
    }

    try {
      await onRefresh();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      // Delay to show completion
      await new Promise((resolve) => setTimeout(resolve, 300));
      setState('idle');
      setPullDistance(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (state === 'refreshing') return;

      // Only start if at the top of the scroll container
      const scrollTop = container.scrollTop;
      if (scrollTop > 0) return;

      touchStartRef.current = {
        y: e.touches[0].clientY,
        scrollTop,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || state === 'refreshing') return;

      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartRef.current.y;

      // Only handle downward pull
      if (deltaY <= 0) {
        if (pullDistance > 0) {
          setPullDistance(0);
          setState('idle');
        }
        return;
      }

      // Apply resistance and clamp
      const adjustedDelta = Math.min(deltaY / resistance, maxPull);
      setPullDistance(adjustedDelta);

      // Update state based on pull distance
      if (adjustedDelta >= threshold) {
        setState('ready');
      } else {
        setState('pulling');
      }

      // Prevent default scroll behavior when pulling
      if (adjustedDelta > 0) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (!touchStartRef.current || state === 'refreshing') {
        touchStartRef.current = null;
        return;
      }

      touchStartRef.current = null;

      if (state === 'ready') {
        handleRefresh();
      } else {
        setState('idle');
        setPullDistance(0);
      }
    };

    const handleTouchCancel = () => {
      touchStartRef.current = null;
      setState('idle');
      setPullDistance(0);
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [disabled, handleRefresh, maxPull, pullDistance, resistance, state, threshold]);

  // Calculate indicator visibility and rotation
  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 180;
  const indicatorY = state === 'idle' ? -40 : Math.max(pullDistance - 30, 0);

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-y-auto', className)}
      style={{
        // Apply transform to content when pulling
        transform:
          state !== 'idle' && state !== 'refreshing'
            ? `translateY(${pullDistance * 0.5}px)`
            : undefined,
        transition: state === 'idle' ? 'transform 0.3s ease' : undefined,
      }}
    >
      {/* Pull indicator */}
      <div
        className={cn(
          'pull-to-refresh-indicator',
          (state === 'pulling' || state === 'ready') && 'visible',
          state === 'refreshing' && 'refreshing'
        )}
        style={{
          transform: `translateX(-50%) translateY(${indicatorY}px)`,
        }}
      >
        <RefreshCw
          style={{
            transform:
              state === 'refreshing' ? undefined : `rotate(${rotation}deg)`,
            transition: state === 'ready' ? 'transform 0.1s ease' : undefined,
          }}
          className={cn(state === 'ready' && 'text-primary')}
        />
      </div>

      {/* Content */}
      {children}
    </div>
  );
}

/**
 * Simple pull-to-refresh indicator that can be used standalone
 */
interface RefreshIndicatorProps {
  isRefreshing: boolean;
  progress?: number; // 0-1
  className?: string;
}

export function RefreshIndicator({
  isRefreshing,
  progress = 0,
  className,
}: RefreshIndicatorProps) {
  const rotation = progress * 180;

  return (
    <div
      className={cn(
        'flex items-center justify-center w-10 h-10 rounded-full',
        'bg-background border shadow-sm',
        className
      )}
    >
      <RefreshCw
        className={cn(
          'w-5 h-5 text-muted-foreground',
          isRefreshing && 'animate-spin'
        )}
        style={{
          transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
        }}
      />
    </div>
  );
}

/**
 * Hook for implementing custom pull-to-refresh
 */
export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  options: { threshold?: number; disabled?: boolean } = {}
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const { threshold = 80, disabled = false } = options;

  const handleRefresh = useCallback(async () => {
    if (disabled || isRefreshing) return;

    setIsRefreshing(true);
    setPullProgress(0);

    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [disabled, isRefreshing, onRefresh]);

  const handlePullProgress = useCallback(
    (distance: number) => {
      if (disabled || isRefreshing) return;
      setPullProgress(Math.min(distance / threshold, 1));
    },
    [disabled, isRefreshing, threshold]
  );

  const handlePullEnd = useCallback(
    (distance: number) => {
      if (disabled || isRefreshing) return;

      if (distance >= threshold) {
        handleRefresh();
      } else {
        setPullProgress(0);
      }
    },
    [disabled, handleRefresh, isRefreshing, threshold]
  );

  return {
    isRefreshing,
    pullProgress,
    handlePullProgress,
    handlePullEnd,
    triggerRefresh: handleRefresh,
  };
}
