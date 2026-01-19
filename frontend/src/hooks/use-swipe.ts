import { useRef, useEffect, useCallback, useState } from 'react';

export interface SwipeConfig {
  threshold?: number; // Minimum distance to trigger swipe (default: 50px)
  velocityThreshold?: number; // Minimum velocity to trigger swipe (default: 0.3)
  allowedDirections?: ('left' | 'right' | 'up' | 'down')[];
  preventScrollOnSwipe?: boolean;
}

export interface SwipeState {
  direction: 'left' | 'right' | 'up' | 'down' | null;
  distance: number;
  velocity: number;
  isSwiping: boolean;
}

export interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeStart?: () => void;
  onSwipeMove?: (state: SwipeState) => void;
  onSwipeEnd?: (state: SwipeState) => void;
}

const DEFAULT_CONFIG: SwipeConfig = {
  threshold: 50,
  velocityThreshold: 0.3,
  allowedDirections: ['left', 'right', 'up', 'down'],
  preventScrollOnSwipe: false,
};

export function useSwipe<T extends HTMLElement = HTMLElement>(
  handlers: SwipeHandlers,
  config: SwipeConfig = {}
) {
  const elementRef = useRef<T>(null);
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeState, setSwipeState] = useState<SwipeState>({
    direction: null,
    distance: 0,
    velocity: 0,
    isSwiping: false,
  });

  const getSwipeDirection = useCallback(
    (deltaX: number, deltaY: number): 'left' | 'right' | 'up' | 'down' | null => {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Determine primary direction
      if (absX > absY) {
        const direction = deltaX > 0 ? 'right' : 'left';
        return mergedConfig.allowedDirections?.includes(direction) ? direction : null;
      } else if (absY > absX) {
        const direction = deltaY > 0 ? 'down' : 'up';
        return mergedConfig.allowedDirections?.includes(direction) ? direction : null;
      }
      return null;
    },
    [mergedConfig.allowedDirections]
  );

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
      handlers.onSwipeStart?.();
      setSwipeState((prev) => ({ ...prev, isSwiping: true }));
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const direction = getSwipeDirection(deltaX, deltaY);
      const elapsed = Date.now() - touchStartRef.current.time;
      const velocity = elapsed > 0 ? distance / elapsed : 0;

      const newState: SwipeState = {
        direction,
        distance,
        velocity,
        isSwiping: true,
      };

      setSwipeState(newState);
      handlers.onSwipeMove?.(newState);

      // Prevent scroll if swiping horizontally
      if (
        mergedConfig.preventScrollOnSwipe &&
        direction &&
        (direction === 'left' || direction === 'right')
      ) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const direction = getSwipeDirection(deltaX, deltaY);
      const elapsed = Date.now() - touchStartRef.current.time;
      const velocity = elapsed > 0 ? distance / elapsed : 0;

      const finalState: SwipeState = {
        direction,
        distance,
        velocity,
        isSwiping: false,
      };

      setSwipeState(finalState);
      handlers.onSwipeEnd?.(finalState);

      // Check if swipe meets threshold
      const meetsThreshold =
        distance >= (mergedConfig.threshold || 50) ||
        velocity >= (mergedConfig.velocityThreshold || 0.3);

      if (meetsThreshold && direction) {
        // Trigger haptic feedback
        if ('vibrate' in navigator) {
          navigator.vibrate(10);
        }

        switch (direction) {
          case 'left':
            handlers.onSwipeLeft?.();
            break;
          case 'right':
            handlers.onSwipeRight?.();
            break;
          case 'up':
            handlers.onSwipeUp?.();
            break;
          case 'down':
            handlers.onSwipeDown?.();
            break;
        }
      }

      touchStartRef.current = null;
    };

    const handleTouchCancel = () => {
      touchStartRef.current = null;
      setSwipeState({
        direction: null,
        distance: 0,
        velocity: 0,
        isSwiping: false,
      });
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, {
      passive: !mergedConfig.preventScrollOnSwipe,
    });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [handlers, mergedConfig, getSwipeDirection]);

  return {
    ref: elementRef,
    swipeState,
  };
}

/**
 * Simplified hook for swipe-to-dismiss functionality
 */
export function useSwipeToDismiss(
  onDismiss: () => void,
  direction: 'left' | 'right' | 'down' = 'down'
) {
  const handlers: SwipeHandlers = {
    onSwipeLeft: direction === 'left' ? onDismiss : undefined,
    onSwipeRight: direction === 'right' ? onDismiss : undefined,
    onSwipeDown: direction === 'down' ? onDismiss : undefined,
  };

  return useSwipe(handlers, {
    allowedDirections: [direction],
    threshold: 100,
  });
}

/**
 * Hook for swipe navigation (left/right)
 */
export function useSwipeNavigation(
  onNavigateBack: () => void,
  onNavigateForward?: () => void
) {
  const handlers: SwipeHandlers = {
    onSwipeRight: onNavigateBack,
    onSwipeLeft: onNavigateForward,
  };

  return useSwipe(handlers, {
    allowedDirections: ['left', 'right'],
    threshold: 80,
    preventScrollOnSwipe: true,
  });
}
