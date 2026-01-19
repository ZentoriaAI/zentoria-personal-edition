/**
 * Service Worker Registration Helper
 *
 * Handles service worker lifecycle including:
 * - Registration
 * - Update detection
 * - Communication with SW
 * - Cache management
 */

export interface SWRegistrationConfig {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: Error) => void;
  onOffline?: () => void;
  onOnline?: () => void;
}

export interface CacheStatus {
  version: string;
  caches: Record<string, number>;
  timestamp: string;
}

// Store the registration for later use
let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Check if service workers are supported
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator;
}

/**
 * Register the service worker
 */
export async function registerServiceWorker(
  config: SWRegistrationConfig = {}
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    console.log('[SW] Service workers not supported');
    return null;
  }

  // Only register in production or if explicitly enabled
  const isDev = process.env.NODE_ENV === 'development';
  const forceEnabled = process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

  if (isDev && !forceEnabled) {
    console.log('[SW] Service worker disabled in development');
    return null;
  }

  try {
    // Register the service worker
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    swRegistration = registration;
    console.log('[SW] Registration successful, scope:', registration.scope);

    // Handle successful registration
    if (registration.installing) {
      console.log('[SW] Service worker installing');
    } else if (registration.waiting) {
      console.log('[SW] Service worker waiting');
      config.onUpdate?.(registration);
    } else if (registration.active) {
      console.log('[SW] Service worker active');
      config.onSuccess?.(registration);
    }

    // Listen for update events
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available
            console.log('[SW] New content available');
            config.onUpdate?.(registration);
          }
        });
      }
    });

    // Set up online/offline listeners
    setupNetworkListeners(config);

    // Check for updates periodically (every hour)
    setInterval(() => {
      registration.update().catch(console.error);
    }, 60 * 60 * 1000);

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    config.onError?.(error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Unregister all service workers
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    for (const registration of registrations) {
      await registration.unregister();
      console.log('[SW] Unregistered service worker');
    }

    swRegistration = null;
    return true;
  } catch (error) {
    console.error('[SW] Unregister failed:', error);
    return false;
  }
}

/**
 * Get the current service worker registration
 */
export function getRegistration(): ServiceWorkerRegistration | null {
  return swRegistration;
}

/**
 * Tell the waiting service worker to skip waiting and activate
 */
export async function skipWaiting(): Promise<void> {
  if (!swRegistration?.waiting) {
    console.log('[SW] No waiting service worker');
    return;
  }

  swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });

  // Wait for the new service worker to take control
  return new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] New service worker activated');
      resolve();
    }, { once: true });
  });
}

/**
 * Clear all caches managed by the service worker
 */
export async function clearCache(): Promise<void> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    console.log('[SW] No active service worker');
    return;
  }

  controller.postMessage({ type: 'CLEAR_CACHE' });
  console.log('[SW] Cache clear requested');
}

/**
 * Get the current cache status
 */
export async function getCacheStatus(): Promise<CacheStatus | null> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    return null;
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    controller.postMessage(
      { type: 'GET_CACHE_STATUS' },
      [channel.port2]
    );

    // Timeout after 5 seconds
    setTimeout(() => resolve(null), 5000);
  });
}

/**
 * Pre-cache specific URLs
 */
export async function cacheUrls(urls: string[]): Promise<void> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    console.log('[SW] No active service worker');
    return;
  }

  controller.postMessage({
    type: 'CACHE_URLS',
    payload: { urls },
  });
}

/**
 * Setup network status listeners
 */
function setupNetworkListeners(config: SWRegistrationConfig): void {
  const updateOnlineStatus = () => {
    if (navigator.onLine) {
      console.log('[SW] Network online');
      config.onOnline?.();
    } else {
      console.log('[SW] Network offline');
      config.onOffline?.();
    }
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Initial check
  if (!navigator.onLine) {
    config.onOffline?.();
  }
}

/**
 * Check if app is running as installed PWA
 */
export function isRunningAsPWA(): boolean {
  // Check display-mode media query
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // Check iOS standalone mode
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }

  // Check if launched from home screen (Android)
  if (document.referrer.startsWith('android-app://')) {
    return true;
  }

  return false;
}

/**
 * Check if the app can be installed
 */
export function canBeInstalled(): boolean {
  // Check for beforeinstallprompt support (Chromium)
  // This is typically checked by storing the event
  return 'BeforeInstallPromptEvent' in window || isServiceWorkerSupported();
}

/**
 * Listen for messages from the service worker
 */
export function onServiceWorkerMessage(
  handler: (event: MessageEvent) => void
): () => void {
  if (!isServiceWorkerSupported()) {
    return () => {};
  }

  navigator.serviceWorker.addEventListener('message', handler);

  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}

/**
 * Send a message to the service worker
 */
export async function sendMessageToSW(message: unknown): Promise<unknown> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    throw new Error('No active service worker');
  }

  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data);
      }
    };

    channel.port1.onmessageerror = () => {
      reject(new Error('Message error'));
    };

    controller.postMessage(message, [channel.port2]);

    // Timeout after 10 seconds
    setTimeout(() => reject(new Error('Message timeout')), 10000);
  });
}

/**
 * Request persistent storage
 * This ensures cached data isn't evicted under storage pressure
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    console.log('[SW] Persistent storage not supported');
    return false;
  }

  try {
    const isPersisted = await navigator.storage.persisted();

    if (isPersisted) {
      console.log('[SW] Storage already persistent');
      return true;
    }

    const result = await navigator.storage.persist();
    console.log('[SW] Persistent storage:', result ? 'granted' : 'denied');
    return result;
  } catch (error) {
    console.error('[SW] Persistent storage error:', error);
    return false;
  }
}

/**
 * Get storage usage estimate
 */
export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  percent: number;
} | null> {
  if (!navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percent = quota > 0 ? (usage / quota) * 100 : 0;

    return { usage, quota, percent };
  } catch (error) {
    console.error('[SW] Storage estimate error:', error);
    return null;
  }
}

// ============================
// Offline Message Queue
// ============================

export interface PendingMessage {
  sessionId: string;
  content: string;
  offlineId: string;
  apiKey?: string;
  attachmentIds?: string[];
}

export interface SyncStats {
  total: number;
  pending: number;
  syncing: number;
  failed: number;
}

/**
 * Queue a message for offline sync
 */
export async function queueOfflineMessage(message: PendingMessage): Promise<{ success: boolean; id?: number; error?: string }> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    throw new Error('No active service worker');
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    controller.postMessage(
      { type: 'QUEUE_MESSAGE', payload: message },
      [channel.port2]
    );

    // Timeout after 5 seconds
    setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000);
  });
}

/**
 * Get sync statistics
 */
export async function getSyncStats(): Promise<SyncStats | null> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    return null;
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    controller.postMessage(
      { type: 'GET_SYNC_STATS' },
      [channel.port2]
    );

    // Timeout after 5 seconds
    setTimeout(() => resolve(null), 5000);
  });
}

/**
 * Trigger manual sync
 */
export async function triggerSync(): Promise<{ success: boolean; error?: string }> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    throw new Error('No active service worker');
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    controller.postMessage(
      { type: 'TRIGGER_SYNC' },
      [channel.port2]
    );

    // Timeout after 30 seconds
    setTimeout(() => resolve({ success: false, error: 'Timeout' }), 30000);
  });
}

/**
 * Clear all pending messages
 */
export async function clearPendingMessages(): Promise<{ success: boolean; error?: string }> {
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    throw new Error('No active service worker');
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    controller.postMessage(
      { type: 'CLEAR_PENDING' },
      [channel.port2]
    );

    // Timeout after 5 seconds
    setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000);
  });
}

// ============================
// Push Notifications
// ============================

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return 'PushManager' in window && 'Notification' in window;
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('[SW] Notifications not supported');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[SW] Notification permission:', permission);
    return permission;
  } catch (error) {
    console.error('[SW] Notification permission error:', error);
    return 'denied';
  }
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    console.log('[SW] Push not supported');
    return null;
  }

  if (getNotificationPermission() !== 'granted') {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.log('[SW] Notification permission denied');
      return null;
    }
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Convert VAPID key
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });

    console.log('[SW] Push subscription:', subscription);
    return subscription;
  } catch (error) {
    console.error('[SW] Push subscription error:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      console.log('[SW] Unsubscribed from push');
      return true;
    }

    return false;
  } catch (error) {
    console.error('[SW] Push unsubscribe error:', error);
    return false;
  }
}

/**
 * Get current push subscription
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('[SW] Get subscription error:', error);
    return null;
  }
}

/**
 * Convert a base64 string to Uint8Array (for VAPID key)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
