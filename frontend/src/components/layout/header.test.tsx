/**
 * Header Component Test Suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './header';
import {
  useSidebarStore,
  useThemeStore,
  useCommandPaletteStore,
} from '@/stores/app-store';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

// Reset stores before each test
beforeEach(() => {
  useThemeStore.setState({ theme: 'dark' });
  useSidebarStore.setState({ isOpen: true, isCollapsed: false });
  useCommandPaletteStore.setState({ isOpen: false });
});

describe('Header', () => {
  it('renders the header', () => {
    render(<Header />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('has sticky positioning', () => {
    render(<Header />);

    expect(screen.getByRole('banner')).toHaveClass('sticky');
    expect(screen.getByRole('banner')).toHaveClass('top-0');
  });

  it('has high z-index', () => {
    render(<Header />);

    expect(screen.getByRole('banner')).toHaveClass('z-30');
  });

  it('has backdrop blur effect', () => {
    render(<Header />);

    expect(screen.getByRole('banner')).toHaveClass('backdrop-blur-md');
  });

  it('has border bottom', () => {
    render(<Header />);

    expect(screen.getByRole('banner')).toHaveClass('border-b');
  });
});

describe('Header - Page Title', () => {
  it('displays Dashboard title for root path', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/');

    render(<Header />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('displays AI Chat title for /chat path', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/chat');

    render(<Header />);

    expect(screen.getByRole('heading', { name: 'AI Chat' })).toBeInTheDocument();
  });

  it('displays File Browser title for /files path', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/files');

    render(<Header />);

    expect(screen.getByRole('heading', { name: 'File Browser' })).toBeInTheDocument();
  });

  it('displays Workflows title for /workflows path', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/workflows');

    render(<Header />);

    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeInTheDocument();
  });

  it('displays API Keys title for /keys path', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/keys');

    render(<Header />);

    expect(screen.getByRole('heading', { name: 'API Keys' })).toBeInTheDocument();
  });

  it('displays Settings title for /settings path', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/settings');

    render(<Header />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('displays System Logs title for /logs path', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/logs');

    render(<Header />);

    expect(screen.getByRole('heading', { name: 'System Logs' })).toBeInTheDocument();
  });

  it('displays Zentoria for unknown paths', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/unknown');

    render(<Header />);

    expect(screen.getByRole('heading', { name: 'Zentoria' })).toBeInTheDocument();
  });
});

describe('Header - Mobile Menu Button', () => {
  it('renders mobile menu button', () => {
    render(<Header />);

    // Menu button is hidden on lg screens but present in DOM
    const menuButtons = screen.getAllByRole('button');
    const mobileMenuButton = menuButtons.find((btn) =>
      btn.classList.contains('lg:hidden')
    );

    expect(mobileMenuButton).toBeInTheDocument();
  });

  it('opens sidebar when mobile menu button is clicked', () => {
    // Start with closed sidebar
    useSidebarStore.setState({ isOpen: false });

    render(<Header />);

    const menuButtons = screen.getAllByRole('button');
    const mobileMenuButton = menuButtons.find((btn) =>
      btn.classList.contains('lg:hidden')
    );

    fireEvent.click(mobileMenuButton!);

    expect(useSidebarStore.getState().isOpen).toBe(true);
  });
});

describe('Header - Search Input', () => {
  it('renders search input', () => {
    render(<Header />);

    expect(screen.getByPlaceholderText(/Search/i)).toBeInTheDocument();
  });

  it('shows keyboard shortcut hint', () => {
    render(<Header />);

    expect(screen.getByText('Ctrl')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('search input is readonly', () => {
    render(<Header />);

    const searchInput = screen.getByPlaceholderText(/Search/i);
    expect(searchInput).toHaveAttribute('readonly');
  });

  it('opens command palette when search is clicked', () => {
    render(<Header />);

    const searchInput = screen.getByPlaceholderText(/Search/i);
    fireEvent.click(searchInput);

    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
  });
});

describe('Header - Notification Bell', () => {
  it('renders notification bell button', () => {
    render(<Header />);

    // Bell button has a notification indicator
    const buttons = screen.getAllByRole('button');
    const bellButton = buttons.find((btn) =>
      btn.querySelector('.bg-zentoria-500.rounded-full')
    );

    expect(bellButton).toBeInTheDocument();
  });

  it('shows notification indicator dot', () => {
    render(<Header />);

    // Find the notification dot
    const notificationDot = document.querySelector('.bg-zentoria-500.rounded-full');
    expect(notificationDot).toBeInTheDocument();
    expect(notificationDot).toHaveClass('w-2');
    expect(notificationDot).toHaveClass('h-2');
  });
});

describe('Header - Theme Toggle', () => {
  it('renders theme toggle button', () => {
    render(<Header />);

    // Theme button has title attribute
    const themeButton = screen.getByTitle(/Theme:/i);
    expect(themeButton).toBeInTheDocument();
  });

  it('shows current theme in title', () => {
    useThemeStore.setState({ theme: 'dark' });
    render(<Header />);

    expect(screen.getByTitle('Theme: dark')).toBeInTheDocument();
  });

  it('cycles theme from light to dark on click', () => {
    useThemeStore.setState({ theme: 'light' });
    render(<Header />);

    const themeButton = screen.getByTitle('Theme: light');
    fireEvent.click(themeButton);

    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('cycles theme from dark to system on click', () => {
    useThemeStore.setState({ theme: 'dark' });
    render(<Header />);

    const themeButton = screen.getByTitle('Theme: dark');
    fireEvent.click(themeButton);

    expect(useThemeStore.getState().theme).toBe('system');
  });

  it('cycles theme from system to light on click', () => {
    useThemeStore.setState({ theme: 'system' });
    render(<Header />);

    const themeButton = screen.getByTitle('Theme: system');
    fireEvent.click(themeButton);

    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('full cycle through all themes', () => {
    useThemeStore.setState({ theme: 'light' });
    const { rerender } = render(<Header />);

    // light -> dark
    fireEvent.click(screen.getByTitle('Theme: light'));
    expect(useThemeStore.getState().theme).toBe('dark');

    rerender(<Header />);

    // dark -> system
    fireEvent.click(screen.getByTitle('Theme: dark'));
    expect(useThemeStore.getState().theme).toBe('system');

    rerender(<Header />);

    // system -> light
    fireEvent.click(screen.getByTitle('Theme: system'));
    expect(useThemeStore.getState().theme).toBe('light');
  });
});

describe('Header - User Avatar', () => {
  it('renders user avatar section', () => {
    render(<Header />);

    // User avatar shows "U" initial
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  it('user avatar is hidden on small screens', () => {
    render(<Header />);

    const avatarContainer = screen.getByText('U').closest('.hidden.sm\\:flex');
    expect(avatarContainer).toBeInTheDocument();
  });

  it('user avatar has zentoria brand color', () => {
    render(<Header />);

    const avatar = screen.getByText('U').parentElement;
    expect(avatar).toHaveClass('bg-zentoria-500');
  });

  it('user avatar is circular', () => {
    render(<Header />);

    const avatar = screen.getByText('U').parentElement;
    expect(avatar).toHaveClass('rounded-full');
  });
});

describe('Header - Layout', () => {
  it('has fixed height', () => {
    render(<Header />);

    expect(screen.getByRole('banner')).toHaveClass('h-16');
  });

  it('has proper padding', () => {
    render(<Header />);

    const innerContainer = screen.getByRole('banner').querySelector('.px-4');
    expect(innerContainer).toBeInTheDocument();
  });

  it('has flex layout with space-between', () => {
    render(<Header />);

    const innerContainer = screen.getByRole('banner').querySelector('.flex');
    expect(innerContainer).toHaveClass('justify-between');
    expect(innerContainer).toHaveClass('items-center');
  });
});
