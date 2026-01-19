'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, BellRing, Settings, Loader2, AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getPushSubscription,
} from '@/lib/sw-registration';

type NotificationStatus = 'unsupported' | 'denied' | 'default' | 'granted' | 'subscribed';

interface NotificationSettingsProps {
  vapidPublicKey?: string;
  onSubscribe?: (subscription: PushSubscription) => Promise<void>;
  onUnsubscribe?: () => Promise<void>;
  className?: string;
}

/**
 * Push Notification Settings Component
 *
 * Handles notification permission requests and push subscription management.
 */
export function NotificationSettings({
  vapidPublicKey,
  onSubscribe,
  onUnsubscribe,
  className,
}: NotificationSettingsProps) {
  const [status, setStatus] = useState<NotificationStatus>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  // Check initial status
  useEffect(() => {
    const checkStatus = async () => {
      if (!isPushSupported()) {
        setStatus('unsupported');
        return;
      }

      const permission = getNotificationPermission();
      if (permission === 'denied') {
        setStatus('denied');
        return;
      }

      if (permission === 'granted') {
        const sub = await getPushSubscription();
        if (sub) {
          setSubscription(sub);
          setStatus('subscribed');
        } else {
          setStatus('granted');
        }
      } else {
        setStatus('default');
      }
    };

    checkStatus();
  }, []);

  // Request permission and subscribe
  const handleEnable = useCallback(async () => {
    if (!vapidPublicKey) {
      setError('VAPID key niet geconfigureerd');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request permission first
      const permission = await requestNotificationPermission();

      if (permission === 'denied') {
        setStatus('denied');
        setError('Notificaties geblokkeerd. Wijzig dit in je browser instellingen.');
        return;
      }

      if (permission !== 'granted') {
        setStatus('default');
        return;
      }

      // Subscribe to push
      const sub = await subscribeToPush(vapidPublicKey);

      if (sub) {
        setSubscription(sub);
        setStatus('subscribed');

        // Send subscription to server
        if (onSubscribe) {
          await onSubscribe(sub);
        }
      } else {
        setError('Kon niet abonneren op notificaties');
        setStatus('granted');
      }
    } catch (err) {
      console.error('[Notifications] Enable error:', err);
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setIsLoading(false);
    }
  }, [vapidPublicKey, onSubscribe]);

  // Unsubscribe
  const handleDisable = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const success = await unsubscribeFromPush();

      if (success) {
        setSubscription(null);
        setStatus('granted');

        if (onUnsubscribe) {
          await onUnsubscribe();
        }
      } else {
        setError('Kon niet uitschrijven');
      }
    } catch (err) {
      console.error('[Notifications] Disable error:', err);
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setIsLoading(false);
    }
  }, [onUnsubscribe]);

  const getStatusIcon = () => {
    switch (status) {
      case 'unsupported':
        return <BellOff className="h-5 w-5 text-gray-400" />;
      case 'denied':
        return <BellOff className="h-5 w-5 text-red-500" />;
      case 'subscribed':
        return <BellRing className="h-5 w-5 text-green-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'unsupported':
        return 'Niet ondersteund';
      case 'denied':
        return 'Geblokkeerd';
      case 'subscribed':
        return 'Ingeschakeld';
      case 'granted':
        return 'Toegestaan (niet actief)';
      default:
        return 'Uitgeschakeld';
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="font-medium">Push Notificaties</h3>
            <p className="text-sm text-muted-foreground">{getStatusText()}</p>
          </div>
        </div>

        {/* Toggle button */}
        {status !== 'unsupported' && status !== 'denied' && (
          <button
            onClick={status === 'subscribed' ? handleDisable : handleEnable}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              'flex items-center gap-2',
              status === 'subscribed'
                ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === 'subscribed' ? (
              <>
                <BellOff className="h-4 w-4" />
                Uitschakelen
              </>
            ) : (
              <>
                <Bell className="h-4 w-4" />
                Inschakelen
              </>
            )}
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Denied state - instructions */}
      {status === 'denied' && (
        <div className="p-4 rounded-lg bg-muted/50 space-y-2">
          <p className="text-sm text-muted-foreground">
            Notificaties zijn geblokkeerd in je browser. Om ze in te schakelen:
          </p>
          <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
            <li>Klik op het slot icoon in de adresbalk</li>
            <li>Zoek &quot;Notificaties&quot; in de site instellingen</li>
            <li>Wijzig naar &quot;Toestaan&quot;</li>
            <li>Vernieuw de pagina</li>
          </ol>
        </div>
      )}

      {/* Unsupported state */}
      {status === 'unsupported' && (
        <div className="p-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Push notificaties worden niet ondersteund in deze browser.
            Probeer een moderne browser zoals Chrome, Firefox of Safari.
          </p>
        </div>
      )}

      {/* Subscribed state - additional info */}
      {status === 'subscribed' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>Je ontvangt notificaties voor nieuwe berichten en updates.</span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact notification toggle for header
 */
export function NotificationToggle({ className }: { className?: string }) {
  const [status, setStatus] = useState<NotificationStatus>('default');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (!isPushSupported()) {
        setStatus('unsupported');
        return;
      }

      const permission = getNotificationPermission();
      if (permission === 'denied') {
        setStatus('denied');
      } else if (permission === 'granted') {
        const sub = await getPushSubscription();
        setStatus(sub ? 'subscribed' : 'granted');
      }
    };
    checkStatus();
  }, []);

  if (status === 'unsupported' || status === 'denied') {
    return null;
  }

  return (
    <button
      disabled={isLoading}
      className={cn(
        'p-2 rounded-lg transition-colors',
        status === 'subscribed'
          ? 'text-primary hover:bg-primary/10'
          : 'text-muted-foreground hover:bg-muted',
        'disabled:opacity-50',
        className
      )}
      title={status === 'subscribed' ? 'Notificaties actief' : 'Notificaties inschakelen'}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : status === 'subscribed' ? (
        <BellRing className="h-5 w-5" />
      ) : (
        <Bell className="h-5 w-5" />
      )}
    </button>
  );
}

/**
 * Hook for notification status
 */
export function useNotifications() {
  const [status, setStatus] = useState<NotificationStatus>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      if (!isPushSupported()) {
        setStatus('unsupported');
        return;
      }

      const permission = getNotificationPermission();
      if (permission === 'denied') {
        setStatus('denied');
      } else if (permission === 'granted') {
        const sub = await getPushSubscription();
        if (sub) {
          setSubscription(sub);
          setStatus('subscribed');
        } else {
          setStatus('granted');
        }
      }
    };
    checkStatus();
  }, []);

  const subscribe = useCallback(async (vapidKey: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'default');
        return null;
      }

      const sub = await subscribeToPush(vapidKey);
      if (sub) {
        setSubscription(sub);
        setStatus('subscribed');
      }
      return sub;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await unsubscribeFromPush();
      if (success) {
        setSubscription(null);
        setStatus('granted');
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    status,
    subscription,
    isLoading,
    error,
    isSupported: status !== 'unsupported',
    isEnabled: status === 'subscribed',
    isDenied: status === 'denied',
    subscribe,
    unsubscribe,
  };
}
