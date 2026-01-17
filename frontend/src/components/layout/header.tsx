'use client';

import { usePathname } from 'next/navigation';
import { Menu, Search, Moon, Sun, Monitor, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSidebarStore, useThemeStore, useCommandPaletteStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/chat': 'AI Chat',
  '/files': 'File Browser',
  '/workflows': 'Workflows',
  '/keys': 'API Keys',
  '/settings': 'Settings',
  '/logs': 'System Logs',
};

export function Header() {
  const pathname = usePathname();
  const { setOpen } = useSidebarStore();
  const { theme, setTheme } = useThemeStore();
  const { open: openCommandPalette } = useCommandPaletteStore();

  const title = pageTitles[pathname] || 'Zentoria';

  const cycleTheme = () => {
    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <header className="sticky top-0 z-30 h-16 bg-[rgb(var(--background))]/80 backdrop-blur-md border-b">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Left side */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>

        {/* Center - Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Input
              placeholder="Search... (Ctrl+K)"
              className="pl-10 bg-light-surface dark:bg-dark-elevated"
              onClick={openCommandPalette}
              readOnly
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">Ctrl</span>K
            </kbd>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-zentoria-500 rounded-full" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="h-5 w-5" />
          </Button>

          <div className="hidden sm:flex items-center gap-2 ml-2 pl-2 border-l">
            <div className="w-8 h-8 rounded-full bg-zentoria-500 flex items-center justify-center">
              <span className="text-sm font-medium text-white">U</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
