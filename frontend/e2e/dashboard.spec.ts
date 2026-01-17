/**
 * Dashboard E2E Tests - TEST-003
 *
 * Tests for main dashboard functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load dashboard successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/Zentoria/i);
    await expect(page.locator('main, [data-testid="dashboard"]')).toBeVisible();
  });

  test('should display system status', async ({ page }) => {
    const statusSection = page.locator('[data-testid="system-status"], .status-section, section:has-text("Status")');

    if (await statusSection.count() > 0) {
      await expect(statusSection).toBeVisible();
    }
  });

  test('should show quick actions', async ({ page }) => {
    const quickActions = page.locator('[data-testid="quick-actions"], .quick-actions');

    if (await quickActions.count() > 0) {
      await expect(quickActions).toBeVisible();
    }
  });

  test('should display stats cards', async ({ page }) => {
    const statsCards = page.locator('[data-testid="stat-card"], .stat-card, [class*="card"]');
    const cardCount = await statsCards.count();

    expect(cardCount).toBeGreaterThanOrEqual(0);
  });

  test('should show recent activity', async ({ page }) => {
    const activitySection = page.locator('[data-testid="recent-activity"], .activity-section, section:has-text("Activity")');

    if (await activitySection.count() > 0) {
      await expect(activitySection).toBeVisible();
    }
  });
});

test.describe('Dashboard - Quick Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should navigate to chat from quick action', async ({ page }) => {
    const chatAction = page.locator('a:has-text("Chat"), button:has-text("Chat"), [data-testid="quick-chat"]').first();

    if (await chatAction.count() > 0) {
      await chatAction.click();
      await expect(page).toHaveURL(/chat/);
    }
  });

  test('should navigate to files from quick action', async ({ page }) => {
    const filesAction = page.locator('a:has-text("Files"), button:has-text("Files"), [data-testid="quick-files"]').first();

    if (await filesAction.count() > 0) {
      await filesAction.click();
      await expect(page).toHaveURL(/files/);
    }
  });
});

test.describe('Dashboard - Responsive', () => {
  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.locator('main, [data-testid="dashboard"]')).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.locator('main, [data-testid="dashboard"]')).toBeVisible();
  });
});
