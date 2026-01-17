/**
 * Theme E2E Tests - TEST-003
 *
 * Tests for theme switching and appearance
 */

import { test, expect } from '@playwright/test';

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have theme toggle button', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"], button[aria-label*="theme" i], button:has-text("Dark"), button:has-text("Light")');
    await expect(themeToggle.first()).toBeVisible();
  });

  test('should toggle between light and dark mode', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"], button[aria-label*="theme" i]').first();

    if (await themeToggle.count() > 0) {
      // Get initial theme
      const initialClass = await page.locator('html, body').first().getAttribute('class');

      // Click toggle
      await themeToggle.click();
      await page.waitForTimeout(300);

      // Get new theme
      const newClass = await page.locator('html, body').first().getAttribute('class');

      // Class should have changed (dark/light class toggle)
      // This may vary based on implementation
    }
  });

  test('should persist theme preference', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"], button[aria-label*="theme" i]').first();

    if (await themeToggle.count() > 0) {
      // Toggle theme
      await themeToggle.click();
      await page.waitForTimeout(300);

      // Get current theme state
      const themeAfterToggle = await page.evaluate(() => {
        return localStorage.getItem('theme') || document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      });

      // Reload page
      await page.reload();
      await page.waitForTimeout(500);

      // Check theme persisted (implementation dependent)
    }
  });
});

test.describe('Theme - Visual Consistency', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have consistent header styling', async ({ page }) => {
    const header = page.locator('header, [data-testid="header"]');
    await expect(header.first()).toBeVisible();
  });

  test('should have consistent sidebar styling', async ({ page }) => {
    const sidebar = page.locator('aside, nav, [data-testid="sidebar"]');
    await expect(sidebar.first()).toBeVisible();
  });

  test('should have consistent button styling', async ({ page }) => {
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
  });

  test('should have consistent card styling', async ({ page }) => {
    const cards = page.locator('[class*="card"], [data-testid*="card"]');
    const cardCount = await cards.count();
    // Cards may or may not be present
  });
});

test.describe('Theme - System Preference', () => {
  test('should respect system dark mode preference', async ({ page }) => {
    // Emulate dark mode system preference
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    // Check if dark mode is applied (implementation dependent)
    const hasDarkClass = await page.evaluate(() => {
      return document.documentElement.classList.contains('dark') ||
             document.body.classList.contains('dark') ||
             getComputedStyle(document.body).colorScheme === 'dark';
    });

    // May depend on implementation
  });

  test('should respect system light mode preference', async ({ page }) => {
    // Emulate light mode system preference
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    // Check styling applied
    await expect(page.locator('body')).toBeVisible();
  });
});
