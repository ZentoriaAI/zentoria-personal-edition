import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================
// Theme Store
// ============================

interface ThemeState {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'zentoria-theme' }
  )
);

// ============================
// Sidebar Store
// ============================

interface SidebarState {
  isOpen: boolean;
  isCollapsed: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isOpen: true,
      isCollapsed: false,
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      setOpen: (isOpen) => set({ isOpen }),
      setCollapsed: (isCollapsed) => set({ isCollapsed }),
    }),
    { name: 'zentoria-sidebar' }
  )
);

// ============================
// Toast Store
// ============================

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2, 11);
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    // Auto remove after duration
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}));

// Helper function
export const toast = (options: Omit<Toast, 'id'>) => {
  useToastStore.getState().addToast(options);
};

// ============================
// Command Palette Store
// ============================

interface CommandPaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

// ============================
// UI Preferences Store
// ============================

interface UIPreferences {
  fileViewMode: 'grid' | 'list';
  chatFontSize: 'small' | 'medium' | 'large';
  showTimestamps: boolean;
  animationsEnabled: boolean;
}

interface UIPreferencesState extends UIPreferences {
  setPreference: <K extends keyof UIPreferences>(key: K, value: UIPreferences[K]) => void;
  resetPreferences: () => void;
}

const defaultPreferences: UIPreferences = {
  fileViewMode: 'grid',
  chatFontSize: 'medium',
  showTimestamps: true,
  animationsEnabled: true,
};

export const useUIPreferencesStore = create<UIPreferencesState>()(
  persist(
    (set) => ({
      ...defaultPreferences,
      setPreference: (key, value) => set({ [key]: value }),
      resetPreferences: () => set(defaultPreferences),
    }),
    { name: 'zentoria-ui-prefs' }
  )
);
