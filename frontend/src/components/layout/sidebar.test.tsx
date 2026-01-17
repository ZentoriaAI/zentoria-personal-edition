/**
 * Sidebar Component Test Suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './sidebar';
import { useSidebarStore } from '@/stores/app-store';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Reset stores before each test
beforeEach(() => {
  useSidebarStore.setState({ isOpen: true, isCollapsed: false });
});

describe('Sidebar', () => {
  it('renders the sidebar', () => {
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('has fixed positioning', () => {
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('fixed');
    expect(screen.getByRole('complementary')).toHaveClass('top-0');
    expect(screen.getByRole('complementary')).toHaveClass('left-0');
  });

  it('has high z-index', () => {
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('z-50');
  });

  it('has full height', () => {
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('h-full');
  });

  it('has border right', () => {
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('border-r');
  });

  it('has transition animation', () => {
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('transition-all');
    expect(screen.getByRole('complementary')).toHaveClass('duration-300');
  });
});

describe('Sidebar - Branding', () => {
  it('renders Zentoria logo', () => {
    render(<Sidebar />);

    expect(screen.getByText('Zentoria')).toBeInTheDocument();
  });

  it('logo links to homepage', () => {
    render(<Sidebar />);

    const logoLink = screen.getByText('Zentoria').closest('a');
    expect(logoLink).toHaveAttribute('href', '/');
  });

  it('hides logo text when collapsed', () => {
    useSidebarStore.setState({ isCollapsed: true });
    render(<Sidebar />);

    expect(screen.queryByText('Zentoria')).not.toBeInTheDocument();
  });

  it('still shows logo icon when collapsed', () => {
    useSidebarStore.setState({ isCollapsed: true });
    render(<Sidebar />);

    // Logo icon container should still be present
    const logoContainer = document.querySelector('.bg-zentoria-500');
    expect(logoContainer).toBeInTheDocument();
  });
});

describe('Sidebar - Navigation Links', () => {
  const navItems = [
    { name: 'Dashboard', href: '/' },
    { name: 'Chat', href: '/chat' },
    { name: 'Files', href: '/files' },
    { name: 'Workflows', href: '/workflows' },
    { name: 'API Keys', href: '/keys' },
    { name: 'Settings', href: '/settings' },
    { name: 'Logs', href: '/logs' },
  ];

  it('renders all navigation items', () => {
    render(<Sidebar />);

    navItems.forEach(({ name }) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });

  it('all navigation items are links', () => {
    render(<Sidebar />);

    navItems.forEach(({ name, href }) => {
      const link = screen.getByText(name).closest('a');
      expect(link).toHaveAttribute('href', href);
    });
  });

  it('highlights active route', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/chat');

    render(<Sidebar />);

    const chatLink = screen.getByText('Chat').closest('a');
    expect(chatLink).toHaveClass('sidebar-item-active');
  });

  it('does not highlight inactive routes', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/');

    render(<Sidebar />);

    const chatLink = screen.getByText('Chat').closest('a');
    expect(chatLink).not.toHaveClass('sidebar-item-active');
  });

  it('hides nav item text when collapsed', () => {
    useSidebarStore.setState({ isCollapsed: true });
    render(<Sidebar />);

    // Text should not be visible (icons still present)
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
  });

  it('shows tooltips for nav items when collapsed', () => {
    useSidebarStore.setState({ isCollapsed: true });
    render(<Sidebar />);

    const navLinks = screen.getAllByRole('link');
    // Skip the logo link
    const dashboardLink = navLinks.find((link) => link.getAttribute('title') === 'Dashboard');
    expect(dashboardLink).toBeInTheDocument();
  });

  it('closes mobile sidebar when nav item is clicked', () => {
    useSidebarStore.setState({ isOpen: true, isCollapsed: false });
    render(<Sidebar />);

    const dashboardLink = screen.getByText('Dashboard').closest('a');
    fireEvent.click(dashboardLink!);

    expect(useSidebarStore.getState().isOpen).toBe(false);
  });
});

describe('Sidebar - Mobile Overlay', () => {
  it('shows overlay when sidebar is open', () => {
    useSidebarStore.setState({ isOpen: true });
    render(<Sidebar />);

    // Overlay has lg:hidden class and bg-black/50
    const overlay = document.querySelector('.bg-black\\/50');
    expect(overlay).toBeInTheDocument();
  });

  it('hides overlay when sidebar is closed', () => {
    useSidebarStore.setState({ isOpen: false });
    render(<Sidebar />);

    const overlay = document.querySelector('.bg-black\\/50');
    expect(overlay).not.toBeInTheDocument();
  });

  it('closes sidebar when overlay is clicked', () => {
    useSidebarStore.setState({ isOpen: true });
    render(<Sidebar />);

    const overlay = document.querySelector('.bg-black\\/50');
    fireEvent.click(overlay!);

    expect(useSidebarStore.getState().isOpen).toBe(false);
  });

  it('overlay covers entire screen', () => {
    useSidebarStore.setState({ isOpen: true });
    render(<Sidebar />);

    const overlay = document.querySelector('.bg-black\\/50');
    expect(overlay).toHaveClass('fixed');
    expect(overlay).toHaveClass('inset-0');
    expect(overlay).toHaveClass('z-40');
  });
});

describe('Sidebar - Mobile Close Button', () => {
  it('renders mobile close button', () => {
    render(<Sidebar />);

    const closeButtons = screen.getAllByRole('button');
    const mobileCloseButton = closeButtons.find((btn) =>
      btn.classList.contains('lg:hidden')
    );

    expect(mobileCloseButton).toBeInTheDocument();
  });

  it('closes sidebar when mobile close button is clicked', () => {
    useSidebarStore.setState({ isOpen: true });
    render(<Sidebar />);

    const closeButtons = screen.getAllByRole('button');
    const mobileCloseButton = closeButtons.find((btn) =>
      btn.classList.contains('lg:hidden')
    );

    fireEvent.click(mobileCloseButton!);

    expect(useSidebarStore.getState().isOpen).toBe(false);
  });
});

describe('Sidebar - Desktop Collapse Button', () => {
  it('renders desktop collapse button', () => {
    render(<Sidebar />);

    const collapseButtons = screen.getAllByRole('button');
    const desktopCollapseButton = collapseButtons.find((btn) =>
      btn.classList.contains('lg:flex')
    );

    expect(desktopCollapseButton).toBeInTheDocument();
  });

  it('toggles collapsed state when collapse button is clicked', () => {
    useSidebarStore.setState({ isCollapsed: false });
    render(<Sidebar />);

    const collapseButtons = screen.getAllByRole('button');
    const desktopCollapseButton = collapseButtons.find((btn) =>
      btn.classList.contains('lg:flex')
    );

    fireEvent.click(desktopCollapseButton!);

    expect(useSidebarStore.getState().isCollapsed).toBe(true);
  });

  it('toggles collapsed state back when clicked again', () => {
    useSidebarStore.setState({ isCollapsed: true });
    render(<Sidebar />);

    const collapseButtons = screen.getAllByRole('button');
    const desktopCollapseButton = collapseButtons.find((btn) =>
      btn.classList.contains('lg:flex')
    );

    fireEvent.click(desktopCollapseButton!);

    expect(useSidebarStore.getState().isCollapsed).toBe(false);
  });

  it('rotates chevron icon when collapsed', () => {
    useSidebarStore.setState({ isCollapsed: true });
    render(<Sidebar />);

    const chevron = document.querySelector('.rotate-180');
    expect(chevron).toBeInTheDocument();
  });

  it('chevron is not rotated when expanded', () => {
    useSidebarStore.setState({ isCollapsed: false });
    render(<Sidebar />);

    // Should not have rotate-180 class
    const chevrons = document.querySelectorAll('.transition-transform');
    const rotatedChevron = Array.from(chevrons).find((el) =>
      el.classList.contains('rotate-180')
    );
    expect(rotatedChevron).toBeUndefined();
  });
});

describe('Sidebar - Width', () => {
  it('has full width when expanded', () => {
    useSidebarStore.setState({ isCollapsed: false });
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('lg:w-64');
  });

  it('has narrow width when collapsed', () => {
    useSidebarStore.setState({ isCollapsed: true });
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('lg:w-16');
  });

  it('has consistent mobile width', () => {
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('w-64');
  });
});

describe('Sidebar - Mobile Visibility', () => {
  it('is translated off-screen when closed on mobile', () => {
    useSidebarStore.setState({ isOpen: false });
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('-translate-x-full');
  });

  it('is visible when open on mobile', () => {
    useSidebarStore.setState({ isOpen: true });
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('translate-x-0');
  });

  it('is always visible on desktop', () => {
    render(<Sidebar />);

    expect(screen.getByRole('complementary')).toHaveClass('lg:translate-x-0');
  });
});

describe('Sidebar - Footer', () => {
  it('shows footer when expanded', () => {
    useSidebarStore.setState({ isCollapsed: false });
    render(<Sidebar />);

    expect(screen.getByText('Personal Edition')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('shows ZP initials in footer', () => {
    useSidebarStore.setState({ isCollapsed: false });
    render(<Sidebar />);

    expect(screen.getByText('ZP')).toBeInTheDocument();
  });

  it('hides footer when collapsed', () => {
    useSidebarStore.setState({ isCollapsed: true });
    render(<Sidebar />);

    expect(screen.queryByText('Personal Edition')).not.toBeInTheDocument();
    expect(screen.queryByText('v1.0.0')).not.toBeInTheDocument();
  });

  it('footer is positioned at bottom', () => {
    useSidebarStore.setState({ isCollapsed: false });
    render(<Sidebar />);

    const footer = screen.getByText('Personal Edition').closest('.absolute');
    expect(footer).toHaveClass('bottom-0');
    expect(footer).toHaveClass('left-0');
    expect(footer).toHaveClass('right-0');
  });

  it('footer has border top', () => {
    useSidebarStore.setState({ isCollapsed: false });
    render(<Sidebar />);

    const footer = screen.getByText('Personal Edition').closest('.border-t');
    expect(footer).toBeInTheDocument();
  });
});

describe('Sidebar - Header', () => {
  it('has fixed header height', () => {
    render(<Sidebar />);

    const header = document.querySelector('.h-16.border-b');
    expect(header).toBeInTheDocument();
  });

  it('header has border bottom', () => {
    render(<Sidebar />);

    const header = document.querySelector('.h-16.border-b');
    expect(header).toHaveClass('border-b');
  });
});
