'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

// Extend Window interface for the install prompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptProps {
  autoShow?: boolean;
  delay?: number; // ms to wait before showing
  position?: 'top' | 'bottom' | 'modal';
  onInstalled?: () => void;
  onDismissed?: () => void;
}

const DISMISS_KEY = 'zentoria-install-dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export function InstallPrompt({
  autoShow = true,
  delay = 30000, // Show after 30 seconds by default
  position = 'bottom',
  onInstalled,
  onDismissed,
}: InstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Check if already installed or dismissed
  const shouldShowPrompt = useCallback(() => {
    // Check if running as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return false;
    }

    // Check iOS standalone
    if ((navigator as Navigator & { standalone?: boolean }).standalone) {
      return false;
    }

    // Check if recently dismissed
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissedTime < DISMISS_DURATION) {
        return false;
      }
    }

    return true;
  }, []);

  useEffect(() => {
    // Detect iOS (no beforeinstallprompt support)
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
    setIsIOS(isIOSDevice);

    // Listen for the beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      if (autoShow && shouldShowPrompt()) {
        // Show after delay
        setTimeout(() => {
          setIsVisible(true);
        }, delay);
      }
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      console.log('[PWA] App installed');
      setIsVisible(false);
      setDeferredPrompt(null);
      onInstalled?.();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // For iOS, show after delay if should show
    if (isIOSDevice && autoShow && shouldShowPrompt()) {
      setTimeout(() => {
        setIsVisible(true);
      }, delay);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [autoShow, delay, shouldShowPrompt, onInstalled]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
        setIsVisible(false);
        onInstalled?.();
      } else {
        console.log('[PWA] User dismissed install prompt');
        onDismissed?.();
      }
    } catch (error) {
      console.error('[PWA] Install prompt failed:', error);
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    onDismissed?.();
  };

  if (!isVisible) return null;

  // iOS-specific instructions
  if (isIOS) {
    return (
      <InstallPromptIOSSheet onDismiss={handleDismiss} position={position} />
    );
  }

  // Standard install prompt
  if (position === 'modal') {
    return (
      <InstallPromptModal
        onInstall={handleInstall}
        onDismiss={handleDismiss}
        isInstalling={isInstalling}
      />
    );
  }

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-50 px-4',
        position === 'top' ? 'top-0 pt-safe' : 'bottom-0 pb-safe'
      )}
    >
      <div
        className={cn(
          'mx-auto max-w-md bg-background border border-border rounded-lg shadow-lg',
          'p-4 animate-in duration-300',
          position === 'top'
            ? 'mt-4 slide-in-from-top-4'
            : 'mb-4 slide-in-from-bottom-4'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 p-2 rounded-lg bg-primary/10">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">Installeer Zentoria</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Voeg toe aan je startscherm voor snelle toegang en offline gebruik
            </p>

            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleInstall}
                disabled={isInstalling}
                className="h-8"
              >
                {isInstalling ? (
                  'Installeren...'
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-1" />
                    Installeren
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="h-8"
              >
                Later
              </Button>
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="h-8 w-8 p-0 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * iOS-specific installation instructions (bottom sheet style)
 */
function InstallPromptIOSSheet({
  onDismiss,
  position,
}: {
  onDismiss: () => void;
  position: 'top' | 'bottom' | 'modal';
}) {
  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-50 px-4',
        position === 'top' ? 'top-0 pt-safe' : 'bottom-0 pb-safe'
      )}
    >
      <div
        className={cn(
          'mx-auto max-w-md bg-background border border-border rounded-lg shadow-lg',
          'p-4 animate-in slide-in-from-bottom-4 duration-300',
          position === 'top' ? 'mt-4' : 'mb-4'
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold">Installeer op iOS</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="h-8 w-8 p-0 -mr-2 -mt-2"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              1
            </div>
            <p>
              Tik op het{' '}
              <span className="inline-flex items-center justify-center w-5 h-5 bg-muted rounded">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L12 14M12 2L8 6M12 2L16 6M4 22H20M4 18H20" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </span>{' '}
              deelicoon onderaan
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              2
            </div>
            <p>Scroll en tik op &ldquo;Zet op beginscherm&rdquo;</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              3
            </div>
            <p>Tik op &ldquo;Voeg toe&rdquo;</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal-style install prompt
 */
function InstallPromptModal({
  onInstall,
  onDismiss,
  isInstalling,
}: {
  onInstall: () => void;
  onDismiss: () => void;
  isInstalling: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-background rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold mb-2">Installeer Zentoria</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Krijg snelle toegang vanaf je startscherm met offline ondersteuning en push notificaties.
          </p>

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={onInstall}
              disabled={isInstalling}
            >
              {isInstalling ? (
                'Installeren...'
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Installeer app
                </>
              )}
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              onClick={onDismiss}
            >
              Niet nu
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to manually trigger install prompt
 */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setCanInstall(false);

    return outcome === 'accepted';
  }, [deferredPrompt]);

  return { canInstall, install };
}
