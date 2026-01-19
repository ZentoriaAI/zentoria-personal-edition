/**
 * Haptic Feedback Utility
 *
 * Provides haptic feedback patterns for mobile interactions.
 * Falls back gracefully when vibration API is not available.
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'selection';

// Vibration patterns in milliseconds
const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [20, 50, 20],
  error: [50, 50, 50, 50, 50],
  warning: [30, 30, 30],
  selection: 5,
};

/**
 * Check if the Vibration API is supported
 */
export function isHapticsSupported(): boolean {
  return 'vibrate' in navigator;
}

/**
 * Trigger haptic feedback with a predefined pattern
 */
export function haptic(pattern: HapticPattern = 'light'): boolean {
  if (!isHapticsSupported()) {
    return false;
  }

  try {
    return navigator.vibrate(PATTERNS[pattern]);
  } catch (error) {
    console.warn('Haptic feedback failed:', error);
    return false;
  }
}

/**
 * Trigger haptic feedback with a custom pattern
 * @param pattern - Array of durations in ms [vibrate, pause, vibrate, pause, ...]
 */
export function hapticCustom(pattern: number | number[]): boolean {
  if (!isHapticsSupported()) {
    return false;
  }

  try {
    return navigator.vibrate(pattern);
  } catch (error) {
    console.warn('Haptic feedback failed:', error);
    return false;
  }
}

/**
 * Stop any ongoing vibration
 */
export function stopHaptic(): boolean {
  if (!isHapticsSupported()) {
    return false;
  }

  return navigator.vibrate(0);
}

// Named exports for convenience
export const haptics = {
  /** Light tap feedback - for navigation, minor interactions */
  light: () => haptic('light'),

  /** Medium feedback - for button presses */
  medium: () => haptic('medium'),

  /** Heavy feedback - for destructive actions, confirmations */
  heavy: () => haptic('heavy'),

  /** Success feedback - for completed actions */
  success: () => haptic('success'),

  /** Error feedback - for failed actions */
  error: () => haptic('error'),

  /** Warning feedback - for cautionary actions */
  warning: () => haptic('warning'),

  /** Selection feedback - for toggles, selections */
  selection: () => haptic('selection'),

  /** Check if haptics are supported */
  isSupported: isHapticsSupported,

  /** Stop any ongoing vibration */
  stop: stopHaptic,

  /** Custom pattern */
  custom: hapticCustom,
};

export default haptics;
