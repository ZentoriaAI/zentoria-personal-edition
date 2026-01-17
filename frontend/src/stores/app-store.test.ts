/**
 * App Store Test Suite
 * Tests for all Zustand stores: Theme, Sidebar, Toast, CommandPalette, UIPreferences
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import {
  useThemeStore,
  useSidebarStore,
  useToastStore,
  toast,
  useCommandPaletteStore,
  useUIPreferencesStore,
} from './app-store';

// Reset all stores before each test
beforeEach(() => {
  // Clear localStorage to reset persisted stores
  localStorage.clear();

  // Reset store states
  useThemeStore.setState({ theme: 'dark' });
  useSidebarStore.setState({ isOpen: true, isCollapsed: false });
  useToastStore.setState({ toasts: [] });
  useCommandPaletteStore.setState({ isOpen: false });
  useUIPreferencesStore.setState({
    fileViewMode: 'grid',
    chatFontSize: 'medium',
    showTimestamps: true,
    animationsEnabled: true,
  });
});

// ============================
// Theme Store Tests
// ============================

describe('useThemeStore', () => {
  it('has default theme of dark', () => {
    const { theme } = useThemeStore.getState();
    expect(theme).toBe('dark');
  });

  it('can set theme to light', () => {
    const { setTheme } = useThemeStore.getState();

    act(() => {
      setTheme('light');
    });

    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('can set theme to system', () => {
    const { setTheme } = useThemeStore.getState();

    act(() => {
      setTheme('system');
    });

    expect(useThemeStore.getState().theme).toBe('system');
  });

  it('can cycle through all themes', () => {
    const { setTheme } = useThemeStore.getState();

    act(() => {
      setTheme('light');
    });
    expect(useThemeStore.getState().theme).toBe('light');

    act(() => {
      setTheme('dark');
    });
    expect(useThemeStore.getState().theme).toBe('dark');

    act(() => {
      setTheme('system');
    });
    expect(useThemeStore.getState().theme).toBe('system');
  });
});

// ============================
// Sidebar Store Tests
// ============================

describe('useSidebarStore', () => {
  it('has default state of open and not collapsed', () => {
    const { isOpen, isCollapsed } = useSidebarStore.getState();
    expect(isOpen).toBe(true);
    expect(isCollapsed).toBe(false);
  });

  it('can toggle sidebar open state', () => {
    const { toggle } = useSidebarStore.getState();

    expect(useSidebarStore.getState().isOpen).toBe(true);

    act(() => {
      toggle();
    });
    expect(useSidebarStore.getState().isOpen).toBe(false);

    act(() => {
      toggle();
    });
    expect(useSidebarStore.getState().isOpen).toBe(true);
  });

  it('can set open state directly', () => {
    const { setOpen } = useSidebarStore.getState();

    act(() => {
      setOpen(false);
    });
    expect(useSidebarStore.getState().isOpen).toBe(false);

    act(() => {
      setOpen(true);
    });
    expect(useSidebarStore.getState().isOpen).toBe(true);
  });

  it('can set collapsed state', () => {
    const { setCollapsed } = useSidebarStore.getState();

    act(() => {
      setCollapsed(true);
    });
    expect(useSidebarStore.getState().isCollapsed).toBe(true);

    act(() => {
      setCollapsed(false);
    });
    expect(useSidebarStore.getState().isCollapsed).toBe(false);
  });

  it('maintains separate open and collapsed states', () => {
    const { setOpen, setCollapsed } = useSidebarStore.getState();

    act(() => {
      setOpen(false);
      setCollapsed(true);
    });

    const state = useSidebarStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.isCollapsed).toBe(true);
  });
});

// ============================
// Toast Store Tests
// ============================

describe('useToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with empty toasts array', () => {
    const { toasts } = useToastStore.getState();
    expect(toasts).toEqual([]);
  });

  it('can add a toast', () => {
    const { addToast } = useToastStore.getState();

    act(() => {
      addToast({ title: 'Test Toast' });
    });

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('Test Toast');
    expect(toasts[0].id).toBeDefined();
  });

  it('can add toast with all properties', () => {
    const { addToast } = useToastStore.getState();

    act(() => {
      addToast({
        title: 'Success!',
        description: 'Operation completed',
        variant: 'success',
        duration: 3000,
      });
    });

    const { toasts } = useToastStore.getState();
    expect(toasts[0].title).toBe('Success!');
    expect(toasts[0].description).toBe('Operation completed');
    expect(toasts[0].variant).toBe('success');
  });

  it('can remove a toast by id', () => {
    const { addToast, removeToast } = useToastStore.getState();

    act(() => {
      addToast({ title: 'Toast 1', duration: 0 });
      addToast({ title: 'Toast 2', duration: 0 });
    });

    const id = useToastStore.getState().toasts[0].id;

    act(() => {
      removeToast(id);
    });

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('Toast 2');
  });

  it('can clear all toasts', () => {
    const { addToast, clearToasts } = useToastStore.getState();

    act(() => {
      addToast({ title: 'Toast 1', duration: 0 });
      addToast({ title: 'Toast 2', duration: 0 });
      addToast({ title: 'Toast 3', duration: 0 });
    });

    expect(useToastStore.getState().toasts).toHaveLength(3);

    act(() => {
      clearToasts();
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-removes toast after default duration', () => {
    const { addToast } = useToastStore.getState();

    act(() => {
      addToast({ title: 'Auto Remove' });
    });

    expect(useToastStore.getState().toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-removes toast after custom duration', () => {
    const { addToast } = useToastStore.getState();

    act(() => {
      addToast({ title: 'Quick Toast', duration: 1000 });
    });

    expect(useToastStore.getState().toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does not auto-remove when duration is 0', () => {
    const { addToast } = useToastStore.getState();

    act(() => {
      addToast({ title: 'Persistent Toast', duration: 0 });
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('generates unique IDs for each toast', () => {
    const { addToast } = useToastStore.getState();

    act(() => {
      addToast({ title: 'Toast 1', duration: 0 });
      addToast({ title: 'Toast 2', duration: 0 });
      addToast({ title: 'Toast 3', duration: 0 });
    });

    const { toasts } = useToastStore.getState();
    const ids = toasts.map((t) => t.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(3);
  });
});

describe('toast helper function', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds toast via helper function', () => {
    act(() => {
      toast({ title: 'Helper Toast' });
    });

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('Helper Toast');
  });

  it('supports all toast variants via helper', () => {
    const variants = ['default', 'success', 'error', 'warning', 'info'] as const;

    act(() => {
      variants.forEach((variant) => {
        toast({ title: `${variant} toast`, variant, duration: 0 });
      });
    });

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(5);
    variants.forEach((variant, index) => {
      expect(toasts[index].variant).toBe(variant);
    });
  });
});

// ============================
// Command Palette Store Tests
// ============================

describe('useCommandPaletteStore', () => {
  it('starts closed', () => {
    const { isOpen } = useCommandPaletteStore.getState();
    expect(isOpen).toBe(false);
  });

  it('can open command palette', () => {
    const { open } = useCommandPaletteStore.getState();

    act(() => {
      open();
    });

    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
  });

  it('can close command palette', () => {
    useCommandPaletteStore.setState({ isOpen: true });
    const { close } = useCommandPaletteStore.getState();

    act(() => {
      close();
    });

    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it('can toggle command palette', () => {
    const { toggle } = useCommandPaletteStore.getState();

    expect(useCommandPaletteStore.getState().isOpen).toBe(false);

    act(() => {
      toggle();
    });
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);

    act(() => {
      toggle();
    });
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });
});

// ============================
// UI Preferences Store Tests
// ============================

describe('useUIPreferencesStore', () => {
  it('has correct default preferences', () => {
    const state = useUIPreferencesStore.getState();
    expect(state.fileViewMode).toBe('grid');
    expect(state.chatFontSize).toBe('medium');
    expect(state.showTimestamps).toBe(true);
    expect(state.animationsEnabled).toBe(true);
  });

  it('can set fileViewMode preference', () => {
    const { setPreference } = useUIPreferencesStore.getState();

    act(() => {
      setPreference('fileViewMode', 'list');
    });

    expect(useUIPreferencesStore.getState().fileViewMode).toBe('list');
  });

  it('can set chatFontSize preference', () => {
    const { setPreference } = useUIPreferencesStore.getState();

    act(() => {
      setPreference('chatFontSize', 'large');
    });
    expect(useUIPreferencesStore.getState().chatFontSize).toBe('large');

    act(() => {
      setPreference('chatFontSize', 'small');
    });
    expect(useUIPreferencesStore.getState().chatFontSize).toBe('small');
  });

  it('can set showTimestamps preference', () => {
    const { setPreference } = useUIPreferencesStore.getState();

    act(() => {
      setPreference('showTimestamps', false);
    });

    expect(useUIPreferencesStore.getState().showTimestamps).toBe(false);
  });

  it('can set animationsEnabled preference', () => {
    const { setPreference } = useUIPreferencesStore.getState();

    act(() => {
      setPreference('animationsEnabled', false);
    });

    expect(useUIPreferencesStore.getState().animationsEnabled).toBe(false);
  });

  it('can reset all preferences to defaults', () => {
    const { setPreference, resetPreferences } = useUIPreferencesStore.getState();

    // Change all preferences
    act(() => {
      setPreference('fileViewMode', 'list');
      setPreference('chatFontSize', 'large');
      setPreference('showTimestamps', false);
      setPreference('animationsEnabled', false);
    });

    // Verify changes
    let state = useUIPreferencesStore.getState();
    expect(state.fileViewMode).toBe('list');
    expect(state.chatFontSize).toBe('large');
    expect(state.showTimestamps).toBe(false);
    expect(state.animationsEnabled).toBe(false);

    // Reset
    act(() => {
      resetPreferences();
    });

    // Verify reset
    state = useUIPreferencesStore.getState();
    expect(state.fileViewMode).toBe('grid');
    expect(state.chatFontSize).toBe('medium');
    expect(state.showTimestamps).toBe(true);
    expect(state.animationsEnabled).toBe(true);
  });

  it('maintains other preferences when setting one', () => {
    const { setPreference } = useUIPreferencesStore.getState();

    act(() => {
      setPreference('fileViewMode', 'list');
    });

    const state = useUIPreferencesStore.getState();
    expect(state.fileViewMode).toBe('list');
    // Other preferences should remain unchanged
    expect(state.chatFontSize).toBe('medium');
    expect(state.showTimestamps).toBe(true);
    expect(state.animationsEnabled).toBe(true);
  });
});
