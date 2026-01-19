/**
 * Zentoria Personal Edition - Service Worker
 * Version: 1.1.0
 *
 * Caching Strategies:
 * - Static assets: Cache-first (CSS, JS, images, fonts)
 * - API responses: Network-first with cache fallback
 * - Pages: Stale-while-revalidate
 * - Chat messages: IndexedDB for offline access
 *
 * Features:
 * - Background sync for offline message queue
 * - Push notifications support
 * - IndexedDB offline storage
 */

const CACHE_VERSION = 'v1.1.0';
const STATIC_CACHE = `zentoria-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `zentoria-dynamic-${CACHE_VERSION}`;
const API_CACHE = `zentoria-api-${CACHE_VERSION}`;
const OFFLINE_DB_NAME = 'zentoria-offline';
const OFFLINE_DB_VERSION = 1;
const PENDING_MESSAGES_STORE = 'pending-messages';
const PENDING_ACTIONS_STORE = 'pending-actions';

// Static assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/offline',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// API endpoints to cache (network-first)
const API_ROUTES = [
  '/api/v1/health',
  '/api/v1/mcp/files',
  '/api/v1/chat/sessions',
  '/api/v1/chat/agents',
];

// Static asset patterns (cache-first)
const STATIC_PATTERNS = [
  /\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/i,
  /\/_next\/static\//,
  /\/icons\//,
];

// Install event - precache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Precache complete, activating immediately');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Precache failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old versioned caches
              return name.startsWith('zentoria-') &&
                     !name.includes(CACHE_VERSION);
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - apply caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Skip browser extensions and chrome-extension URLs
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return;
  }

  // Determine caching strategy based on request type
  if (isApiRequest(url)) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
  } else if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
  } else if (isPageRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
  }
});

// Check if request is an API call
function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

// Check if request is for a static asset
function isStaticAsset(url) {
  return STATIC_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

// Check if request is for a page (HTML navigation)
function isPageRequest(request) {
  return request.mode === 'navigate' ||
         request.headers.get('accept')?.includes('text/html');
}

/**
 * Cache-first strategy
 * Best for: Static assets (JS, CSS, images, fonts)
 */
async function cacheFirstStrategy(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      // Return cached version immediately
      // Update cache in background (optional refresh)
      refreshCache(request, cacheName);
      return cachedResponse;
    }

    // Not in cache, fetch from network
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first failed:', error);
    return caches.match('/offline');
  }
}

/**
 * Network-first strategy
 * Best for: API responses, user data
 */
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);

    // Only cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);

    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Return a JSON error response for API calls
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'No cached data available',
        offline: true
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Stale-while-revalidate strategy
 * Best for: Pages, dynamic content that can be slightly stale
 */
async function staleWhileRevalidate(request, cacheName) {
  const cachedResponse = await caches.match(request);

  // Start network fetch in parallel
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        caches.open(cacheName)
          .then((cache) => cache.put(request, networkResponse.clone()));
      }
      return networkResponse;
    })
    .catch(() => null);

  // Return cached response immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }

  // Wait for network if no cache
  const networkResponse = await fetchPromise;

  if (networkResponse) {
    return networkResponse;
  }

  // Fallback to offline page
  return caches.match('/offline');
}

/**
 * Background cache refresh (for cache-first with background update)
 */
async function refreshCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, networkResponse);
    }
  } catch (error) {
    // Silently fail - we already have cached version
  }
}

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.keys().then((names) =>
          Promise.all(names.map((name) => caches.delete(name)))
        )
      );
      break;

    case 'GET_CACHE_STATUS':
      event.waitUntil(
        getCacheStatus().then((status) => {
          event.ports[0]?.postMessage(status);
        })
      );
      break;

    case 'CACHE_URLS':
      if (payload?.urls && Array.isArray(payload.urls)) {
        event.waitUntil(
          caches.open(DYNAMIC_CACHE)
            .then((cache) => cache.addAll(payload.urls))
        );
      }
      break;

    // Offline message queue commands
    case 'QUEUE_MESSAGE':
      if (payload) {
        event.waitUntil(
          addPendingMessage(payload).then((id) => {
            event.ports[0]?.postMessage({ success: true, id });
            // Request sync when online
            if (self.registration.sync) {
              self.registration.sync.register('sync-pending-messages');
            }
          }).catch((error) => {
            event.ports[0]?.postMessage({ success: false, error: error.message });
          })
        );
      }
      break;

    case 'GET_SYNC_STATS':
      event.waitUntil(
        getSyncStats().then((stats) => {
          event.ports[0]?.postMessage(stats);
        }).catch((error) => {
          event.ports[0]?.postMessage({ error: error.message });
        })
      );
      break;

    case 'TRIGGER_SYNC':
      event.waitUntil(
        (async () => {
          if (self.registration.sync) {
            await self.registration.sync.register('sync-pending-messages');
            event.ports[0]?.postMessage({ success: true });
          } else {
            // Fallback: sync immediately
            await syncPendingMessages();
            event.ports[0]?.postMessage({ success: true });
          }
        })().catch((error) => {
          event.ports[0]?.postMessage({ success: false, error: error.message });
        })
      );
      break;

    case 'CLEAR_PENDING':
      event.waitUntil(
        (async () => {
          const db = await openDatabase();
          const tx = db.transaction(PENDING_MESSAGES_STORE, 'readwrite');
          const store = tx.objectStore(PENDING_MESSAGES_STORE);
          await store.clear();
          event.ports[0]?.postMessage({ success: true });
        })().catch((error) => {
          event.ports[0]?.postMessage({ success: false, error: error.message });
        })
      );
      break;

    default:
      console.log('[SW] Unknown message type:', type);
  }
});

/**
 * Get cache status for debugging
 */
async function getCacheStatus() {
  const cacheNames = await caches.keys();
  const status = {};

  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    status[name] = keys.length;
  }

  return {
    version: CACHE_VERSION,
    caches: status,
    timestamp: new Date().toISOString(),
  };
}

// ============================
// IndexedDB Helper Functions
// ============================

/**
 * Open the IndexedDB database
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store for pending chat messages
      if (!db.objectStoreNames.contains(PENDING_MESSAGES_STORE)) {
        const msgStore = db.createObjectStore(PENDING_MESSAGES_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        msgStore.createIndex('sessionId', 'sessionId', { unique: false });
        msgStore.createIndex('timestamp', 'timestamp', { unique: false });
        msgStore.createIndex('status', 'status', { unique: false });
      }

      // Store for pending actions (file uploads, etc.)
      if (!db.objectStoreNames.contains(PENDING_ACTIONS_STORE)) {
        const actionStore = db.createObjectStore(PENDING_ACTIONS_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        actionStore.createIndex('type', 'type', { unique: false });
        actionStore.createIndex('timestamp', 'timestamp', { unique: false });
        actionStore.createIndex('status', 'status', { unique: false });
      }
    };
  });
}

/**
 * Add a pending message to the queue
 */
async function addPendingMessage(message) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_MESSAGES_STORE);

    const item = {
      ...message,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
    };

    const request = store.add(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all pending messages
 */
async function getPendingMessages() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(PENDING_MESSAGES_STORE);
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update message status
 */
async function updateMessageStatus(id, status, error = null) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_MESSAGES_STORE);

    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (item) {
        item.status = status;
        item.lastAttempt = Date.now();
        if (error) item.error = error;
        if (status === 'pending') item.retryCount = (item.retryCount || 0) + 1;

        const putRequest = store.put(item);
        putRequest.onsuccess = () => resolve(item);
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve(null);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Remove a synced message from the queue
 */
async function removePendingMessage(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_MESSAGES_STORE);

    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get sync statistics
 */
async function getSyncStats() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(PENDING_MESSAGES_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result;
      resolve({
        total: all.length,
        pending: all.filter((m) => m.status === 'pending').length,
        syncing: all.filter((m) => m.status === 'syncing').length,
        failed: all.filter((m) => m.status === 'failed').length,
      });
    };
    request.onerror = () => reject(request.error);
  });
}

// ============================
// Background Sync
// ============================

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);

  if (event.tag === 'sync-pending-messages') {
    event.waitUntil(syncPendingMessages());
  } else if (event.tag === 'sync-pending-actions') {
    event.waitUntil(syncPendingActions());
  }
});

/**
 * Sync pending messages when back online
 */
async function syncPendingMessages() {
  console.log('[SW] Syncing pending messages...');

  // Notify clients that sync started
  await notifyClients({ type: 'SYNC_STARTED', payload: { timestamp: Date.now() } });

  try {
    const messages = await getPendingMessages();
    console.log(`[SW] Found ${messages.length} pending messages`);

    let synced = 0;
    let failed = 0;

    for (const message of messages) {
      try {
        // Update status to syncing
        await updateMessageStatus(message.id, 'syncing');

        // Send to server
        const response = await fetch('/api/v1/chat/sessions/' + message.sessionId + '/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': message.apiKey || '',
          },
          body: JSON.stringify({
            content: message.content,
            attachmentIds: message.attachmentIds || [],
            offlineId: message.offlineId,
          }),
        });

        if (response.ok) {
          // Remove from queue on success
          await removePendingMessage(message.id);
          synced++;

          // Notify client of successful sync
          await notifyClients({
            type: 'MESSAGE_SYNCED',
            payload: {
              offlineId: message.offlineId,
              sessionId: message.sessionId,
              serverResponse: await response.json(),
            },
          });
        } else {
          // Mark as failed if server error
          const errorText = await response.text();
          await updateMessageStatus(message.id, 'failed', errorText);
          failed++;
        }
      } catch (error) {
        console.error('[SW] Failed to sync message:', message.id, error);
        await updateMessageStatus(message.id, 'failed', error.message);
        failed++;
      }
    }

    // Notify clients of sync completion
    await notifyClients({
      type: 'SYNC_COMPLETE',
      payload: { timestamp: Date.now(), synced, failed, total: messages.length },
    });

    console.log(`[SW] Sync complete. Synced: ${synced}, Failed: ${failed}`);
  } catch (error) {
    console.error('[SW] Sync error:', error);
    await notifyClients({
      type: 'SYNC_ERROR',
      payload: { error: error.message, timestamp: Date.now() },
    });
    throw error; // Re-throw to let the browser retry
  }
}

/**
 * Sync pending actions (file uploads, etc.)
 */
async function syncPendingActions() {
  console.log('[SW] Syncing pending actions...');
  // Placeholder for future implementation
  // Similar pattern to syncPendingMessages
}

/**
 * Notify all clients
 */
async function notifyClients(message) {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage(message);
  });
}

// Push notification handler (for future use)
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};

  const options = {
    body: data.body || 'New notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
    },
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Zentoria Personal',
      options
    )
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if not
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

console.log('[SW] Service worker loaded, version:', CACHE_VERSION);
