/**
 * Navigation E2E Tests - TEST-003
 *
 * Tests for page navigation and routing
 */

import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the dashboard page', async ({ page }) => {
    await expect(page).toHaveTitle(/Zentoria/i);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('should navigate to chat page', async ({ page }) => {
    // Click on chat link in sidebar
    await page.click('a[href="/chat"], [data-testid="nav-chat"]');
    await expect(page).toHaveURL(/\/chat/);
  });

  test('should navigate to files page', async ({ page }) => {
    await page.click('a[href="/files"], [data-testid="nav-files"]');
    await expect(page).toHaveURL(/\/files/);
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.click('a[href="/settings"], [data-testid="nav-settings"]');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('should show sidebar navigation', async ({ page }) => {
    await expect(page.locator('nav, [role="navigation"]')).toBeVisible();
  });

  test('should have working back navigation', async ({ page }) => {
    await page.click('a[href="/chat"], [data-testid="nav-chat"]');
    await expect(page).toHaveURL(/\/chat/);
    await page.goBack();
    await expect(page).toHaveURL('/');
  });
});

test.describe('Navigation - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should show mobile menu toggle', async ({ page }) => {
    await page.goto('/');
    const mobileMenuToggle = page.locator('[data-testid="mobile-menu-toggle"], button[aria-label*="menu" i]');
    await expect(mobileMenuToggle).toBeVisible();
  });

  test('should open mobile menu when toggled', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="mobile-menu-toggle"], button[aria-label*="menu" i]');
    await expect(page.locator('nav, [role="navigation"]')).toBeVisible();
  });
});
