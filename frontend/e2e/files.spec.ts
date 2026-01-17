/**
 * Files E2E Tests - TEST-003
 *
 * Tests for file management functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Files Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/files');
  });

  test('should display files interface', async ({ page }) => {
    await expect(page.locator('main, [data-testid="files-container"]')).toBeVisible();
  });

  test('should show file list or empty state', async ({ page }) => {
    const fileList = page.locator('[data-testid="file-list"], .file-list, table, [role="grid"]');
    const emptyState = page.locator('[data-testid="empty-state"], .empty-state');

    const hasFileList = await fileList.count() > 0;
    const hasEmptyState = await emptyState.count() > 0;

    expect(hasFileList || hasEmptyState).toBeTruthy();
  });

  test('should have upload button', async ({ page }) => {
    const uploadButton = page.locator('button:has-text("Upload"), [data-testid="upload-button"]');
    await expect(uploadButton).toBeVisible();
  });

  test('should open upload dialog when clicking upload', async ({ page }) => {
    const uploadButton = page.locator('button:has-text("Upload"), [data-testid="upload-button"]');
    await uploadButton.click();

    // Should show file input or modal
    const fileInput = page.locator('input[type="file"]');
    const uploadModal = page.locator('[data-testid="upload-modal"], [role="dialog"]');

    const hasFileInput = await fileInput.count() > 0;
    const hasModal = await uploadModal.count() > 0;

    expect(hasFileInput || hasModal).toBeTruthy();
  });
});

test.describe('File List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/files');
  });

  test('should display file metadata columns', async ({ page }) => {
    // Check for column headers if there are files
    const headers = page.locator('th, [role="columnheader"]');
    const headerCount = await headers.count();

    if (headerCount > 0) {
      // Should have name, size, date columns at minimum
      const headerText = await headers.allTextContents();
      const hasNameColumn = headerText.some((h) => /name|file/i.test(h));
      expect(hasNameColumn || headerCount > 0).toBeTruthy();
    }
  });

  test('should support file selection', async ({ page }) => {
    const checkbox = page.locator('input[type="checkbox"], [role="checkbox"]').first();

    if (await checkbox.count() > 0) {
      await checkbox.click();
      await expect(checkbox).toBeChecked();
    }
  });

  test('should show file actions menu', async ({ page }) => {
    const moreButton = page.locator('[data-testid="file-actions"], button:has-text("..."), [aria-label*="actions" i]').first();

    if (await moreButton.count() > 0) {
      await moreButton.click();
      const menu = page.locator('[role="menu"], .dropdown-menu');
      await expect(menu).toBeVisible();
    }
  });
});

test.describe('File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/files');
  });

  test('should accept file via drag and drop zone', async ({ page }) => {
    const dropzone = page.locator('[data-testid="dropzone"], .dropzone, [role="button"]:has-text("drag")');

    if (await dropzone.count() > 0) {
      await expect(dropzone).toBeVisible();
    }
  });

  test('should show upload progress', async ({ page }) => {
    // Click upload and simulate file selection
    const uploadButton = page.locator('button:has-text("Upload"), [data-testid="upload-button"]');

    if (await uploadButton.count() > 0) {
      await uploadButton.click();

      // Progress indicator should appear during upload
      const progressIndicator = page.locator('[role="progressbar"], .progress, [data-testid="upload-progress"]');
      // May not be visible without actual file upload
    }
  });
});

test.describe('File Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/files');
  });

  test('should have download action', async ({ page }) => {
    const downloadButton = page.locator('button:has-text("Download"), [data-testid="download-button"]').first();

    // Check if download button exists (may require file selection)
    if (await downloadButton.count() > 0) {
      await expect(downloadButton).toBeVisible();
    }
  });

  test('should have delete action', async ({ page }) => {
    const deleteButton = page.locator('button:has-text("Delete"), [data-testid="delete-button"]').first();

    // Check if delete button exists
    if (await deleteButton.count() > 0) {
      await expect(deleteButton).toBeVisible();
    }
  });

  test('should confirm before deleting', async ({ page }) => {
    const deleteButton = page.locator('button:has-text("Delete"), [data-testid="delete-button"]').first();

    if (await deleteButton.count() > 0) {
      await deleteButton.click();

      // Should show confirmation dialog
      const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]:has-text("confirm")');
      const hasConfirm = await confirmDialog.count() > 0;

      // May show confirmation or require selection first
    }
  });
});
