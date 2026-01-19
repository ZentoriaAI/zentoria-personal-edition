'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);

    // Try to fetch the home page
    try {
      const response = await fetch('/', { cache: 'no-store' });
      if (response.ok) {
        window.location.href = '/';
      }
    } catch (error) {
      console.log('Still offline');
    }

    setIsRetrying(false);
  };

  // If we're online, redirect to home
  useEffect(() => {
    if (isOnline) {
      // Small delay to ensure connection is stable
      const timeout = setTimeout(() => {
        window.location.href = '/';
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [isOnline]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Offline Icon */}
        <div className="mx-auto w-24 h-24 rounded-full bg-muted flex items-center justify-center">
          <WifiOff className="w-12 h-12 text-muted-foreground" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Geen internetverbinding</h1>
          <p className="text-muted-foreground">
            Je bent momenteel offline. Controleer je internetverbinding en probeer het opnieuw.
          </p>
        </div>

        {/* Status indicator */}
        {isOnline && (
          <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">Verbinding hersteld, doorsturen...</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={handleRetry}
            disabled={isRetrying}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Proberen...' : 'Opnieuw proberen'}
          </Button>

          <Button variant="outline" asChild>
            <Link href="/" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Ga naar home
            </Link>
          </Button>
        </div>

        {/* Cached content hint */}
        <div className="pt-6 border-t">
          <h2 className="text-sm font-medium mb-2">Wat je nog steeds kunt doen:</h2>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Bekijk eerder bezochte pagina&apos;s uit cache</li>
            <li>• Bekijk opgeslagen chatgesprekken</li>
            <li>• Werk offline aan conceptberichten</li>
          </ul>
        </div>

        {/* Tips */}
        <div className="text-xs text-muted-foreground">
          <p>
            Tip: Zodra je weer online bent, worden je wijzigingen automatisch gesynchroniseerd.
          </p>
        </div>
      </div>
    </div>
  );
}
