/**
 * Utils Test Suite
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cn,
  formatBytes,
  formatRelativeTime,
  formatDate,
  formatTime,
  formatDuration,
  truncate,
  generateId,
  getFileExtension,
  getFileType,
  debounce,
  sleep,
  isMobile,
  getInitials,
  parseErrorMessage,
} from './utils';

describe('cn', () => {
  it('merges tailwind classes correctly', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active')).toBe('base active');
    expect(cn('base', false && 'active')).toBe('base');
  });
});

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 Bytes');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('respects decimal places', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 1)).toBe('1.5 KB');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-16T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats just now', () => {
    const date = new Date('2026-01-16T11:59:30Z');
    expect(formatRelativeTime(date)).toBe('Just now');
  });

  it('formats minutes', () => {
    const date = new Date('2026-01-16T11:45:00Z');
    expect(formatRelativeTime(date)).toBe('15m ago');
  });

  it('formats hours', () => {
    const date = new Date('2026-01-16T09:00:00Z');
    expect(formatRelativeTime(date)).toBe('3h ago');
  });

  it('formats days', () => {
    const date = new Date('2026-01-14T12:00:00Z');
    expect(formatRelativeTime(date)).toBe('2d ago');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(45000)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(300000)).toBe('5m 0s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3700000)).toBe('1h 1m');
    expect(formatDuration(7200000)).toBe('2h 0m');
  });
});

describe('truncate', () => {
  it('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
    expect(truncate('this is a long string', 12)).toBe('this is a...');
  });

  it('handles edge cases', () => {
    expect(truncate('', 5)).toBe('');
    expect(truncate('abc', 3)).toBe('abc');
  });
});

describe('generateId', () => {
  it('generates unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('generates IDs with prefix', () => {
    const id = generateId('user');
    expect(id.startsWith('user_')).toBe(true);
  });

  it('generates IDs without prefix', () => {
    const id = generateId();
    expect(id).not.toContain('_');
  });
});

describe('getFileExtension', () => {
  it('extracts extension', () => {
    expect(getFileExtension('document.pdf')).toBe('pdf');
    expect(getFileExtension('image.PNG')).toBe('png');
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
  });

  it('handles no extension', () => {
    expect(getFileExtension('README')).toBe('');
  });
});

describe('getFileType', () => {
  it('identifies images', () => {
    expect(getFileType('photo.jpg')).toBe('image');
    expect(getFileType('logo.png')).toBe('image');
    expect(getFileType('icon.svg')).toBe('image');
  });

  it('identifies videos', () => {
    expect(getFileType('movie.mp4')).toBe('video');
    expect(getFileType('clip.webm')).toBe('video');
  });

  it('identifies audio', () => {
    expect(getFileType('song.mp3')).toBe('audio');
    expect(getFileType('sound.wav')).toBe('audio');
  });

  it('identifies documents', () => {
    expect(getFileType('report.pdf')).toBe('document');
    expect(getFileType('data.csv')).toBe('document');
    expect(getFileType('notes.txt')).toBe('document');
  });

  it('identifies code files', () => {
    expect(getFileType('app.tsx')).toBe('code');
    expect(getFileType('script.py')).toBe('code');
    expect(getFileType('styles.css')).toBe('code');
  });

  it('identifies archives', () => {
    expect(getFileType('backup.zip')).toBe('archive');
    expect(getFileType('package.tar.gz')).toBe('archive');
  });

  it('returns other for unknown types', () => {
    expect(getFileType('file.xyz')).toBe('other');
    expect(getFileType('noextension')).toBe('other');
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces function calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on each call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('sleep', () => {
  it('resolves after specified time', async () => {
    vi.useFakeTimers();

    const start = Date.now();
    const promise = sleep(100);

    vi.advanceTimersByTime(100);
    await promise;

    vi.useRealTimers();
    // Just verify the promise resolves
    expect(true).toBe(true);
  });
});

describe('isMobile', () => {
  it('returns false for desktop user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      configurable: true,
    });
    expect(isMobile()).toBe(false);
  });
});

describe('getInitials', () => {
  it('gets initials from full name', () => {
    expect(getInitials('John Doe')).toBe('JD');
    expect(getInitials('Jane Smith')).toBe('JS');
  });

  it('handles single name', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('handles multiple names', () => {
    expect(getInitials('John James Doe')).toBe('JJ');
  });

  it('converts to uppercase', () => {
    expect(getInitials('john doe')).toBe('JD');
  });
});

describe('parseErrorMessage', () => {
  it('parses Error objects', () => {
    expect(parseErrorMessage(new Error('Test error'))).toBe('Test error');
  });

  it('parses strings', () => {
    expect(parseErrorMessage('String error')).toBe('String error');
  });

  it('parses objects with message property', () => {
    expect(parseErrorMessage({ message: 'Object error' })).toBe('Object error');
  });

  it('returns default message for unknown types', () => {
    expect(parseErrorMessage(null)).toBe('An unexpected error occurred');
    expect(parseErrorMessage(123)).toBe('An unexpected error occurred');
  });
});
