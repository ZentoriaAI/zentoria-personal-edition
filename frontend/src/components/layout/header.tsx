'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Search,
  Moon,
  Sun,
  Monitor,
  Bell,
  MoreVertical,
  Key,
  FileText,
  Settings,
  HelpCircle,
  LogOut,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useSidebarStore, useThemeStore, useCommandPaletteStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/chat': 'AI Chat',
  '/files': 'Bestanden',
  '/workflows': 'Workflows',
  '/keys': 'API Keys',
  '/settings': 'Instellingen',
  '/logs': 'Logs',
};

interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  href?: string;
  badge?: string | number;
  destructive?: boolean;
}

function MenuItem({ icon: Icon, label, onClick, badge, destructive }: MenuItemProps) {
  return (
    <button
      onClick={() => {
        haptics.light();
        onClick?.();
      }}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-3 text-left',
        'hover:bg-muted/50 active:bg-muted transition-colors',
        'touch-manipulation',
        destructive && 'text-destructive'
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="px-2 py-0.5 text-xs rounded-full bg-zentoria-500 text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

export function Header() {
  const pathname = usePathname();
  const { setOpen } = useSidebarStore();
  const { theme, setTheme } = useThemeStore();
  const { open: openCommandPalette } = useCommandPaletteStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const title = pageTitles[pathname] || 'Zentoria';

  const cycleTheme = () => {
    haptics.selection();
    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const themeLabel = theme === 'light' ? 'Licht' : theme === 'dark' ? 'Donker' : 'Systeem';

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 bg-[rgb(var(--background))]/80 backdrop-blur-md border-b pt-safe">
      <div className="flex items-center justify-between h-full px-3 md:px-4 lg:px-6">
        {/* Left side - Menu + Title */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          {/* Desktop sidebar toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex lg:hidden shrink-0"
            onClick={() => {
              haptics.light();
              setOpen(true);
            }}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <h1 className="text-base md:text-lg font-semibold truncate">{title}</h1>
        </div>

        {/* Center - Search (desktop only) */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Input
              placeholder="Zoeken... (Ctrl+K)"
              className="pl-10 bg-light-surface dark:bg-dark-elevated"
              onClick={openCommandPalette}
              readOnly
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">Ctrl</span>K
            </kbd>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1 md:gap-2">
          {/* Mobile search button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => {
              haptics.light();
              openCommandPalette();
            }}
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Notifications - visible on all screens */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => haptics.light()}
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-zentoria-500 rounded-full" />
          </Button>

          {/* Theme toggle - desktop only */}
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            className="hidden md:flex"
          >
            <ThemeIcon className="h-5 w-5" />
          </Button>

          {/* User avatar - desktop only */}
          <div className="hidden md:flex items-center gap-2 ml-2 pl-2 border-l">
            <div className="w-8 h-8 rounded-full bg-zentoria-500 flex items-center justify-center">
              <span className="text-sm font-medium text-white">U</span>
            </div>
          </div>

          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => haptics.light()}
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="pb-safe">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              {/* User info */}
              <div className="flex items-center gap-3 px-4 py-3 border-b">
                <div className="w-10 h-10 rounded-full bg-zentoria-500 flex items-center justify-center">
                  <span className="text-base font-medium text-white">U</span>
                </div>
                <div>
                  <div className="font-medium">Gebruiker</div>
                  <div className="text-sm text-muted-foreground">gebruiker@zentoria.ai</div>
                </div>
              </div>

              {/* Quick actions */}
              <div className="py-2">
                <MenuItem
                  icon={ThemeIcon}
                  label={`Thema: ${themeLabel}`}
                  onClick={cycleTheme}
                />
                <MenuItem
                  icon={User}
                  label="Profiel"
                  onClick={() => setMenuOpen(false)}
                />
                <MenuItem
                  icon={Key}
                  label="API Keys"
                  onClick={() => setMenuOpen(false)}
                />
                <MenuItem
                  icon={FileText}
                  label="Logs"
                  onClick={() => setMenuOpen(false)}
                />
                <MenuItem
                  icon={Settings}
                  label="Instellingen"
                  onClick={() => setMenuOpen(false)}
                />
              </div>

              {/* Secondary actions */}
              <div className="py-2 border-t">
                <MenuItem
                  icon={HelpCircle}
                  label="Help & Support"
                  onClick={() => setMenuOpen(false)}
                />
                <MenuItem
                  icon={LogOut}
                  label="Uitloggen"
                  onClick={() => setMenuOpen(false)}
                  destructive
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
