'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, MessageSquare, FolderOpen, Settings, Menu, Key, Workflow, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
}

const mainNavItems: NavItem[] = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/chat', icon: MessageSquare, label: 'Chat' },
  { href: '/files', icon: FolderOpen, label: 'Bestanden' },
  { href: '/settings', icon: Settings, label: 'Instellingen' },
];

const moreNavItems: NavItem[] = [
  { href: '/keys', icon: Key, label: 'API Keys' },
  { href: '/workflows', icon: Workflow, label: 'Workflows' },
  { href: '/logs', icon: FileText, label: 'Logs' },
];

interface BottomNavProps {
  className?: string;
}

export function BottomNav({ className }: BottomNavProps) {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Don't render on desktop
  if (!isMobile) return null;

  // Check if any "more" item is active
  const isMoreActive = moreNavItems.some((item) => pathname === item.href);

  const handleHapticFeedback = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  return (
    <nav className={cn('bottom-nav', className)}>
      {mainNavItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={handleHapticFeedback}
            className={cn(
              'bottom-nav-item relative tap-highlight',
              isActive && 'active'
            )}
          >
            <Icon className="bottom-nav-icon" />
            <span className="bottom-nav-label">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className="bottom-nav-badge">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </Link>
        );
      })}

      {/* More menu */}
      <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <SheetTrigger asChild>
          <button
            onClick={handleHapticFeedback}
            className={cn(
              'bottom-nav-item relative tap-highlight',
              isMoreActive && 'active'
            )}
          >
            <Menu className="bottom-nav-icon" />
            <span className="bottom-nav-label">Meer</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="pb-safe">
          <SheetHeader>
            <SheetTitle>Meer opties</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-1">
            {moreNavItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    handleHapticFeedback();
                    setIsMoreOpen(false);
                  }}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                    'hover:bg-muted active:bg-muted/80',
                    isActive && 'bg-primary/10 text-primary'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

/**
 * Hook to detect if bottom nav is visible
 * Useful for adding bottom padding to content
 */
export function useBottomNav() {
  const [hasBottomNav, setHasBottomNav] = useState(false);

  useEffect(() => {
    const checkBottomNav = () => {
      setHasBottomNav(window.innerWidth < 768);
    };

    checkBottomNav();
    window.addEventListener('resize', checkBottomNav);
    return () => window.removeEventListener('resize', checkBottomNav);
  }, []);

  return hasBottomNav;
}
