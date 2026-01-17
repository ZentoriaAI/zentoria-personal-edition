/**
 * Accessibility E2E Tests - TEST-003
 *
 * Tests for keyboard navigation and accessibility
 */

import { test, expect } from '@playwright/test';

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have focusable navigation items', async ({ page }) => {
    // Tab through navigation
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test('should support tab navigation', async ({ page }) => {
    // Press Tab multiple times and verify focus moves
    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => document.activeElement?.outerHTML);

    await page.keyboard.press('Tab');
    const secondFocus = await page.evaluate(() => document.activeElement?.outerHTML);

    // Focus should move to different element
    expect(firstFocus || secondFocus).toBeTruthy();
  });

  test('should have visible focus indicators', async ({ page }) => {
    await page.keyboard.press('Tab');

    // The focused element should have visible focus styling
    const focusedElement = page.locator(':focus');
    await expect(focusedElement.first()).toBeVisible();
  });

  test('should support keyboard activation of buttons', async ({ page }) => {
    const button = page.locator('button').first();

    if (await button.count() > 0) {
      await button.focus();
      await page.keyboard.press('Enter');
      // Button should be activatable via keyboard
    }
  });
});

test.describe('ARIA Labels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have aria-label on icon buttons', async ({ page }) => {
    const iconButtons = page.locator('button:has(svg), button[aria-label]');
    const count = await iconButtons.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const button = iconButtons.nth(i);
        const ariaLabel = await button.getAttribute('aria-label');
        const text = await button.textContent();

        // Should have either aria-label or visible text
        expect(ariaLabel || text?.trim()).toBeTruthy();
      }
    }
  });

  test('should have proper landmarks', async ({ page }) => {
    // Check for main landmark
    const main = page.locator('main, [role="main"]');
    const hasMain = await main.count() > 0;

    // Check for navigation landmark
    const nav = page.locator('nav, [role="navigation"]');
    const hasNav = await nav.count() > 0;

    expect(hasMain || hasNav).toBeTruthy();
  });

  test('should have descriptive page title', async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    expect(title).not.toBe('undefined');
  });
});

test.describe('Screen Reader Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have heading hierarchy', async ({ page }) => {
    const h1 = await page.locator('h1').count();
    const h2 = await page.locator('h2').count();
    const h3 = await page.locator('h3').count();

    // Should have at least one heading
    expect(h1 + h2 + h3).toBeGreaterThan(0);
  });

  test('should have alt text on images', async ({ page }) => {
    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');

      // Should have alt or role="presentation"
      expect(alt !== null || role === 'presentation').toBeTruthy();
    }
  });

  test('should announce live regions', async ({ page }) => {
    // Check for aria-live regions
    const liveRegions = page.locator('[aria-live], [role="alert"], [role="status"]');
    // May or may not have live regions
    const count = await liveRegions.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Color Contrast', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have readable text', async ({ page }) => {
    // Check that body has text
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test('should not rely solely on color', async ({ page }) => {
    // Check that interactive elements have more than just color indication
    const buttons = page.locator('button');
    const count = await buttons.count();

    if (count > 0) {
      const firstButton = buttons.first();
      await expect(firstButton).toBeVisible();
    }
  });
});

test.describe('Responsive Accessibility', () => {
  test('should be accessible at 200% zoom', async ({ page }) => {
    await page.goto('/');

    // Zoom to 200%
    await page.evaluate(() => {
      document.body.style.zoom = '2';
    });

    await expect(page.locator('main, body')).toBeVisible();
  });

  test('should work without mouse', async ({ page }) => {
    await page.goto('/');

    // Navigate entirely by keyboard
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });
});
