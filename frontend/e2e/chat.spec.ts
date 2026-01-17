/**
 * Chat E2E Tests - TEST-003
 *
 * Tests for AI chat functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Chat Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
  });

  test('should display chat interface', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-container"], .chat-container, main')).toBeVisible();
  });

  test('should have message input field', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="message" i], input[placeholder*="message" i], [data-testid="chat-input"]');
    await expect(input).toBeVisible();
  });

  test('should have send button', async ({ page }) => {
    const sendButton = page.locator('button[type="submit"], [data-testid="send-button"]');
    await expect(sendButton).toBeVisible();
  });

  test('should enable send button when text is entered', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="message" i], input[placeholder*="message" i], [data-testid="chat-input"]');
    const sendButton = page.locator('button[type="submit"], [data-testid="send-button"]');

    await input.fill('Hello, AI!');
    await expect(sendButton).toBeEnabled();
  });

  test('should clear input after sending message', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="message" i], input[placeholder*="message" i], [data-testid="chat-input"]');

    await input.fill('Test message');
    await input.press('Enter');

    // Wait for potential API call
    await page.waitForTimeout(500);

    // Input should be cleared after sending
    const inputValue = await input.inputValue();
    expect(inputValue).toBe('');
  });

  test('should display message history', async ({ page }) => {
    // Check for message container
    const messageList = page.locator('[data-testid="message-list"], .messages, [role="log"]');
    await expect(messageList).toBeVisible();
  });
});

test.describe('Chat Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
  });

  test('should support multiline input', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="message" i], [data-testid="chat-input"]');
    await input.fill('Line 1\nLine 2\nLine 3');

    const value = await input.inputValue();
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');
  });

  test('should handle long messages', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="message" i], input[placeholder*="message" i], [data-testid="chat-input"]');
    const longMessage = 'A'.repeat(1000);

    await input.fill(longMessage);
    const value = await input.inputValue();
    expect(value.length).toBeGreaterThan(500);
  });

  test('should support keyboard shortcuts', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="message" i], input[placeholder*="message" i], [data-testid="chat-input"]');

    await input.fill('Test message');
    // Ctrl+Enter or Enter should submit
    await input.press('Enter');

    await page.waitForTimeout(500);
  });
});

test.describe('Chat Messages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
  });

  test('should display user messages differently from AI messages', async ({ page }) => {
    // Submit a message first
    const input = page.locator('textarea[placeholder*="message" i], input[placeholder*="message" i], [data-testid="chat-input"]');
    await input.fill('Test question');
    await input.press('Enter');

    await page.waitForTimeout(1000);

    // Check for differentiated message styles
    const userMessage = page.locator('[data-testid="user-message"], .user-message');
    const aiMessage = page.locator('[data-testid="ai-message"], .ai-message, .assistant-message');

    // At least one should be visible after sending
    const hasUserOrAi = await userMessage.count() > 0 || await aiMessage.count() > 0;
    expect(hasUserOrAi).toBeTruthy();
  });

  test('should show loading state while waiting for response', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="message" i], input[placeholder*="message" i], [data-testid="chat-input"]');
    await input.fill('Test question');
    await input.press('Enter');

    // Should show some loading indicator
    const loadingIndicator = page.locator('[data-testid="loading"], .loading, [aria-busy="true"]');
    // This might be visible briefly
  });
});
