/**
 * Authentication utilities for Zentoria PE
 *
 * Handles API key storage and validation
 */

const API_KEY_STORAGE_KEY = 'zentoria_api_key';
const AUTH_COOKIE_NAME = 'zentoria_auth';

/**
 * Get stored API key from localStorage
 */
export function getStoredApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

/**
 * Store API key in localStorage and set auth cookie
 */
export function setStoredApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  // Set a cookie for middleware to detect (just presence, not the actual key)
  document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * Clear stored API key and auth cookie
 */
export function clearStoredApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0`;
}

/**
 * Check if user is authenticated (has stored API key)
 */
export function isAuthenticated(): boolean {
  return !!getStoredApiKey();
}

/**
 * Logout - clear auth and redirect to login
 */
export function logout(): void {
  clearStoredApiKey();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}
