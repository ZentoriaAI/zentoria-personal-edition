'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  registerServiceWorker,
  skipWaiting,
  clearCache,
  getCacheStatus,
  isRunningAsPWA,
  requestPersistentStorage,
  getStorageEstimate,
  type CacheStatus,
  type SWRegistrationConfig,
} from '@/lib/sw-registration';

interface ServiceWorkerContextValue {
  // Status
  isRegistered: boolean;
  isOnline: boolean;
  hasUpdate: boolean;
  isPWA: boolean;

  // Cache info
  cacheStatus: CacheStatus | null;
  storageEstimate: { usage: number; quota: number; percent: number } | null;

  // Actions
  update: () => Promise<void>;
  clearAllCache: () => Promise<void>;
  refreshCacheStatus: () => Promise<void>;
}

const ServiceWorkerContext = createContext<ServiceWorkerContextValue | null>(null);

interface ServiceWorkerProviderProps {
  children: ReactNode;
  onUpdate?: () => void;
  onOffline?: () => void;
  onOnline?: () => void;
}

export function ServiceWorkerProvider({
  children,
  onUpdate,
  onOffline,
  onOnline,
}: ServiceWorkerProviderProps) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<{
    usage: number;
    quota: number;
    percent: number;
  } | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Register service worker on mount
  useEffect(() => {
    // Check if running as PWA
    setIsPWA(isRunningAsPWA());

    // Set initial online status
    setIsOnline(navigator.onLine);

    const config: SWRegistrationConfig = {
      onSuccess: (reg) => {
        console.log('[PWA] Service worker registered successfully');
        setIsRegistered(true);
        setRegistration(reg);
      },
      onUpdate: (reg) => {
        console.log('[PWA] Update available');
        setHasUpdate(true);
        setRegistration(reg);
        onUpdate?.();
      },
      onError: (error) => {
        console.error('[PWA] Service worker registration failed:', error);
        setIsRegistered(false);
      },
      onOffline: () => {
        console.log('[PWA] App is offline');
        setIsOnline(false);
        onOffline?.();
      },
      onOnline: () => {
        console.log('[PWA] App is online');
        setIsOnline(true);
        onOnline?.();
      },
    };

    registerServiceWorker(config).then((reg) => {
      if (reg) {
        setRegistration(reg);
        setIsRegistered(true);
      }
    });

    // Request persistent storage
    requestPersistentStorage();

    // Get initial storage estimate
    getStorageEstimate().then(setStorageEstimate);
  }, [onUpdate, onOffline, onOnline]);

  // Update action - activate waiting service worker
  const update = useCallback(async () => {
    if (!hasUpdate) return;

    try {
      await skipWaiting();
      setHasUpdate(false);
      // Reload the page to use the new service worker
      window.location.reload();
    } catch (error) {
      console.error('[PWA] Update failed:', error);
    }
  }, [hasUpdate]);

  // Clear all caches
  const clearAllCache = useCallback(async () => {
    try {
      await clearCache();
      // Refresh cache status after clearing
      const status = await getCacheStatus();
      setCacheStatus(status);
    } catch (error) {
      console.error('[PWA] Clear cache failed:', error);
    }
  }, []);

  // Refresh cache status
  const refreshCacheStatus = useCallback(async () => {
    const status = await getCacheStatus();
    setCacheStatus(status);

    const estimate = await getStorageEstimate();
    setStorageEstimate(estimate);
  }, []);

  const value: ServiceWorkerContextValue = {
    isRegistered,
    isOnline,
    hasUpdate,
    isPWA,
    cacheStatus,
    storageEstimate,
    update,
    clearAllCache,
    refreshCacheStatus,
  };

  return (
    <ServiceWorkerContext.Provider value={value}>
      {children}
    </ServiceWorkerContext.Provider>
  );
}

/**
 * Hook to access service worker context
 */
export function useServiceWorker(): ServiceWorkerContextValue {
  const context = useContext(ServiceWorkerContext);

  if (!context) {
    throw new Error('useServiceWorker must be used within ServiceWorkerProvider');
  }

  return context;
}

/**
 * Hook to check if the app is online
 */
export function useOnlineStatus(): boolean {
  const { isOnline } = useServiceWorker();
  return isOnline;
}

/**
 * Hook to check if an update is available
 */
export function useHasUpdate(): { hasUpdate: boolean; update: () => Promise<void> } {
  const { hasUpdate, update } = useServiceWorker();
  return { hasUpdate, update };
}

/**
 * Hook to check if running as installed PWA
 */
export function useIsPWA(): boolean {
  const { isPWA } = useServiceWorker();
  return isPWA;
}
