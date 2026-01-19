'use client';

import { Sidebar } from './sidebar';
import { Header } from './header';
import { BottomNav, useBottomNav } from './bottom-nav';
import { useSidebarStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { PWAManager } from '@/components/pwa';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebarStore();
  const hasBottomNav = useBottomNav();

  return (
    <div className="min-h-screen bg-[rgb(var(--background))]">
      {/* Desktop sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div
        className={cn(
          'transition-all duration-300',
          // Desktop: add left padding for sidebar
          isCollapsed ? 'lg:pl-16' : 'lg:pl-64',
          // Mobile: no left padding
          'md:pl-0'
        )}
      >
        <Header />
        <main
          className={cn(
            'p-4 lg:p-6',
            // Add bottom padding when bottom nav is visible
            hasBottomNav && 'pb-nav'
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />

      {/* PWA components */}
      <PWAManager />
    </div>
  );
}
