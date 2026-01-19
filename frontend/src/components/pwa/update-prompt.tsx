'use client';

import { useEffect, useState } from 'react';
import { useHasUpdate } from './service-worker-provider';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';

interface UpdatePromptProps {
  autoShow?: boolean;
  position?: 'top' | 'bottom';
}

export function UpdatePrompt({ autoShow = true, position = 'bottom' }: UpdatePromptProps) {
  const { hasUpdate, update } = useHasUpdate();
  const [isVisible, setIsVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (hasUpdate && autoShow) {
      setIsVisible(true);
    }
  }, [hasUpdate, autoShow]);

  if (!isVisible) return null;

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await update();
    } catch (error) {
      console.error('Update failed:', error);
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  return (
    <div
      className={`
        fixed left-0 right-0 z-50 px-4
        ${position === 'top' ? 'top-0 pt-safe' : 'bottom-0 pb-safe'}
      `}
    >
      <div
        className={`
          mx-auto max-w-md bg-background border border-border rounded-lg shadow-lg
          p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300
          ${position === 'top' ? 'mt-4' : 'mb-4'}
        `}
      >
        <RefreshCw className="h-5 w-5 text-primary shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Update beschikbaar</p>
          <p className="text-xs text-muted-foreground">
            Een nieuwe versie is klaar om te installeren
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Sluiten</span>
          </Button>

          <Button
            size="sm"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="h-8"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Bezig...
              </>
            ) : (
              'Bijwerken'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
