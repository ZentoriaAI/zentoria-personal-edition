/**
 * Authentication Store
 *
 * Zustand store for authentication state management.
 * Handles token storage, refresh, and session tracking.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

// ============================
// Types
// ============================

export interface User {
  id: string;
  email?: string;
  name?: string;
  role: 'admin' | 'user';
  scopes: string[];
}

export interface AuthSession {
  id: string;
  userId: string;
  userAgent: string;
  ipAddress: string;
  lastActivity: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface AuthState {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  sessions: AuthSession[];
  lastRefresh: number | null;
  error: string | null;

  // Actions
  setAuthenticated: (authenticated: boolean) => void;
  setLoading: (loading: boolean) => void;
  setUser: (user: User | null) => void;
  setSessions: (sessions: AuthSession[]) => void;
  setLastRefresh: (timestamp: number) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  reset: () => void;
}

// ============================
// Initial State
// ============================

const initialState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  sessions: [],
  lastRefresh: null,
  error: null,
};

// ============================
// Store
// ============================

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,

      setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }),
      setLoading: (loading) => set({ isLoading: loading }),
      setUser: (user) => set({ user }),
      setSessions: (sessions) => set({ sessions }),
      setLastRefresh: (timestamp) => set({ lastRefresh: timestamp }),
      setError: (error) => set({ error }),

      logout: () => {
        // Clear auth state
        set({
          isAuthenticated: false,
          user: null,
          sessions: [],
          lastRefresh: null,
          error: null,
        });

        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('zentoria_api_key');
          // Remove auth cookie
          document.cookie = 'zentoria_auth=; path=/; max-age=0';
          // Redirect to login
          window.location.href = '/login';
        }
      },

      reset: () => set(initialState),
    }),
    {
      name: 'zentoria-auth',
      partialize: (state) => ({
        // Only persist minimal auth state
        isAuthenticated: state.isAuthenticated,
        lastRefresh: state.lastRefresh,
      }),
    }
  )
);

// ============================
// Selectors
// ============================

export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectUser = (state: AuthState) => state.user;
export const selectSessions = (state: AuthState) => state.sessions;
export const selectAuthLoading = (state: AuthState) => state.isLoading;
export const selectAuthError = (state: AuthState) => state.error;

// ============================
// Custom Hooks
// ============================

/**
 * Hook for auth state
 */
export const useAuth = () =>
  useAuthStore(
    useShallow((state) => ({
      isAuthenticated: state.isAuthenticated,
      isLoading: state.isLoading,
      user: state.user,
      error: state.error,
    }))
  );

/**
 * Hook for auth actions
 */
export const useAuthActions = () =>
  useAuthStore(
    useShallow((state) => ({
      setAuthenticated: state.setAuthenticated,
      setLoading: state.setLoading,
      setUser: state.setUser,
      setSessions: state.setSessions,
      setError: state.setError,
      logout: state.logout,
      reset: state.reset,
    }))
  );

/**
 * Hook for session management
 */
export const useAuthSessions = () =>
  useAuthStore(
    useShallow((state) => ({
      sessions: state.sessions,
      setSessions: state.setSessions,
    }))
  );
