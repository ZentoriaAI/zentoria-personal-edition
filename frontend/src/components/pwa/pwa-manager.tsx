'use client';

import { UpdatePrompt } from './update-prompt';
import { OfflineIndicator } from './offline-indicator';
import { InstallPrompt } from './install-prompt';
import { SyncStatusIndicator } from './sync-status-indicator';

interface PWAManagerProps {
  showUpdatePrompt?: boolean;
  showOfflineIndicator?: boolean;
  showInstallPrompt?: boolean;
  showSyncStatus?: boolean;
  installPromptDelay?: number;
  syncStatusPosition?: 'top' | 'bottom';
}

/**
 * PWA Manager Component
 *
 * Centralized component that manages all PWA UI elements.
 * Include this once in your app (typically in AppShell or layout).
 */
export function PWAManager({
  showUpdatePrompt = true,
  showOfflineIndicator = true,
  showInstallPrompt = true,
  showSyncStatus = true,
  installPromptDelay = 60000, // Show install prompt after 1 minute
  syncStatusPosition = 'bottom',
}: PWAManagerProps) {
  return (
    <>
      {showUpdatePrompt && <UpdatePrompt position="bottom" />}
      {showOfflineIndicator && <OfflineIndicator position="top" />}
      {showSyncStatus && <SyncStatusIndicator position={syncStatusPosition} showDetails />}
      {showInstallPrompt && (
        <InstallPrompt
          autoShow
          delay={installPromptDelay}
          position="bottom"
        />
      )}
    </>
  );
}
