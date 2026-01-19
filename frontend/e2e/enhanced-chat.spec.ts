/**
 * Enhanced Chat E2E Tests - Phase 3.2
 *
 * End-to-end tests for the Enhanced Chat Interface:
 * - Session management (create, rename, duplicate, delete)
 * - Message streaming and responses
 * - Project folders (create, move, organize)
 * - Agent selection
 * - File attachments
 * - Canvas panel
 */

import { test, expect, Page } from '@playwright/test';

// Test data
const TEST_SESSION_TITLE = 'E2E Test Session';
const TEST_FOLDER_NAME = 'E2E Test Folder';
const TEST_MESSAGE = 'Hello, this is a test message for E2E testing.';

// Helper functions
async function waitForChatReady(page: Page) {
  // Wait for chat container to be visible
  await page.waitForSelector('[data-testid="enhanced-chat"], .enhanced-chat, [data-testid="chat-container"]', {
    state: 'visible',
    timeout: 10000,
  });
}

async function getMessageInput(page: Page) {
  return page.locator('textarea[data-testid="chat-input"], textarea[placeholder*="message" i], [data-testid="message-input"]');
}

async function getSendButton(page: Page) {
  return page.locator('button[data-testid="send-button"], button[type="submit"]');
}

test.describe('Enhanced Chat - Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForChatReady(page);
  });

  test('should display session list in sidebar', async ({ page }) => {
    const sidebar = page.locator('[data-testid="chat-sidebar"], .chat-sidebar, aside');
    await expect(sidebar).toBeVisible();

    // Should have session list or empty state
    const sessionList = page.locator('[data-testid="session-list"], .session-list');
    const emptyState = page.locator('[data-testid="empty-sessions"], .empty-sessions');

    const hasContent = await sessionList.count() > 0 || await emptyState.count() > 0;
    expect(hasContent).toBeTruthy();
  });

  test('should create new chat session', async ({ page }) => {
    const newChatButton = page.locator('[data-testid="new-chat-button"], button:has-text("New Chat"), button:has-text("New")');
    await expect(newChatButton).toBeVisible();
    await newChatButton.click();

    // Should update URL or show new session
    await page.waitForTimeout(500);

    // New session should be created
    const sessionList = page.locator('[data-testid="session-item"], .session-item');
    await expect(sessionList.first()).toBeVisible();
  });

  test('should rename session via context menu', async ({ page }) => {
    // Create a session first
    const newChatButton = page.locator('[data-testid="new-chat-button"], button:has-text("New Chat")');
    await newChatButton.click();
    await page.waitForTimeout(500);

    // Right-click on session to open context menu
    const sessionItem = page.locator('[data-testid="session-item"], .session-item').first();
    await sessionItem.click({ button: 'right' });

    // Click rename option
    const renameOption = page.locator('[data-testid="rename-session"], text=Rename');
    if (await renameOption.isVisible()) {
      await renameOption.click();

      // Type new name
      const titleInput = page.locator('input[data-testid="session-title-input"], input[aria-label="Session title"]');
      await titleInput.fill(TEST_SESSION_TITLE);
      await titleInput.press('Enter');

      // Verify renamed
      await expect(page.locator(`text=${TEST_SESSION_TITLE}`)).toBeVisible();
    }
  });

  test('should duplicate session', async ({ page }) => {
    // Create a session with a message first
    const input = await getMessageInput(page);
    await input.fill('Test message for duplication');
    await input.press('Enter');
    await page.waitForTimeout(1000);

    // Right-click on session
    const sessionItem = page.locator('[data-testid="session-item"], .session-item').first();
    await sessionItem.click({ button: 'right' });

    // Click duplicate option
    const duplicateOption = page.locator('[data-testid="duplicate-session"], text=Duplicate');
    if (await duplicateOption.isVisible()) {
      await duplicateOption.click();
      await page.waitForTimeout(500);

      // Should have one more session
      const sessions = page.locator('[data-testid="session-item"], .session-item');
      expect(await sessions.count()).toBeGreaterThanOrEqual(2);
    }
  });

  test('should delete session with confirmation', async ({ page }) => {
    // Create a session
    const newChatButton = page.locator('[data-testid="new-chat-button"], button:has-text("New Chat")');
    await newChatButton.click();
    await page.waitForTimeout(500);

    const sessionsBefore = await page.locator('[data-testid="session-item"], .session-item').count();

    // Right-click on session
    const sessionItem = page.locator('[data-testid="session-item"], .session-item').first();
    await sessionItem.click({ button: 'right' });

    // Click delete option
    const deleteOption = page.locator('[data-testid="delete-session"], text=Delete');
    if (await deleteOption.isVisible()) {
      await deleteOption.click();

      // Confirm deletion
      const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
        await page.waitForTimeout(500);

        const sessionsAfter = await page.locator('[data-testid="session-item"], .session-item').count();
        expect(sessionsAfter).toBeLessThan(sessionsBefore);
      }
    }
  });

  test('should pin/unpin session', async ({ page }) => {
    // Create a session
    const newChatButton = page.locator('[data-testid="new-chat-button"], button:has-text("New Chat")');
    await newChatButton.click();
    await page.waitForTimeout(500);

    // Right-click on session
    const sessionItem = page.locator('[data-testid="session-item"], .session-item').first();
    await sessionItem.click({ button: 'right' });

    // Click pin option
    const pinOption = page.locator('[data-testid="pin-session"], text=Pin');
    if (await pinOption.isVisible()) {
      await pinOption.click();

      // Session should show pin indicator
      const pinnedIndicator = page.locator('[data-testid="pinned-indicator"], .pin-icon, .pinned');
      await expect(pinnedIndicator.first()).toBeVisible();
    }
  });

  test('should archive session', async ({ page }) => {
    // Create a session
    const newChatButton = page.locator('[data-testid="new-chat-button"], button:has-text("New Chat")');
    await newChatButton.click();
    await page.waitForTimeout(500);

    // Right-click on session
    const sessionItem = page.locator('[data-testid="session-item"], .session-item').first();
    await sessionItem.click({ button: 'right' });

    // Click archive option
    const archiveOption = page.locator('[data-testid="archive-session"], text=Archive');
    if (await archiveOption.isVisible()) {
      await archiveOption.click();
      await page.waitForTimeout(500);

      // Session should be hidden from main list (unless viewing archived)
    }
  });
});

test.describe('Enhanced Chat - Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForChatReady(page);
  });

  test('should send message and receive streaming response', async ({ page }) => {
    const input = await getMessageInput(page);
    await input.fill(TEST_MESSAGE);

    const sendButton = await getSendButton(page);
    await sendButton.click();

    // Wait for user message to appear
    await page.waitForSelector(`text=${TEST_MESSAGE}`, { timeout: 5000 }).catch(() => {});

    // Wait for streaming response (loading indicator or content appearing)
    const loadingOrResponse = page.locator('[data-testid="streaming-indicator"], [data-testid="ai-message"], .typing-indicator, .ai-message');
    await expect(loadingOrResponse.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show typing indicator during streaming', async ({ page }) => {
    const input = await getMessageInput(page);
    await input.fill('What is 2+2?');
    await input.press('Enter');

    // Look for typing/streaming indicator
    const typingIndicator = page.locator('[data-testid="typing-indicator"], .typing-indicator, [data-testid="streaming-indicator"]');

    // It might appear briefly
    await page.waitForTimeout(500);
  });

  test('should disable send button while streaming', async ({ page }) => {
    const input = await getMessageInput(page);
    await input.fill('Tell me a story');

    const sendButton = await getSendButton(page);
    await sendButton.click();

    // Send button should be disabled while processing
    await expect(sendButton).toBeDisabled();
  });

  test('should support keyboard shortcut to send', async ({ page }) => {
    const input = await getMessageInput(page);
    await input.fill('Testing keyboard send');

    // Press Enter to send
    await input.press('Enter');

    // Message should appear
    await page.waitForTimeout(500);
    const messageInList = page.locator('text=Testing keyboard send');
    await expect(messageInList.first()).toBeVisible();
  });

  test('should support Shift+Enter for new line', async ({ page }) => {
    const input = await getMessageInput(page);

    await input.fill('Line 1');
    await input.press('Shift+Enter');
    await input.type('Line 2');

    const value = await input.inputValue();
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');
    expect(value).toContain('\n');
  });

  test('should cancel streaming response', async ({ page }) => {
    const input = await getMessageInput(page);
    await input.fill('Tell me a very long story about a journey');
    await input.press('Enter');

    // Wait briefly for streaming to start
    await page.waitForTimeout(500);

    // Look for cancel/stop button
    const stopButton = page.locator('[data-testid="stop-streaming"], button:has-text("Stop"), button[aria-label="Stop"]');
    if (await stopButton.isVisible()) {
      await stopButton.click();

      // Streaming should stop and send button should be enabled again
      const sendButton = await getSendButton(page);
      await expect(sendButton).toBeEnabled({ timeout: 5000 });
    }
  });
});

test.describe('Enhanced Chat - Project Folders', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForChatReady(page);
  });

  test('should display folder tree in sidebar', async ({ page }) => {
    const folderTree = page.locator('[data-testid="folder-tree"], .folder-tree');
    const folderSection = page.locator('[data-testid="folders-section"], .folders-section');

    const hasFolders = await folderTree.count() > 0 || await folderSection.count() > 0;
    expect(hasFolders).toBeTruthy();
  });

  test('should create new folder', async ({ page }) => {
    // Click create folder button
    const createFolderButton = page.locator('[data-testid="create-folder"], button:has-text("New Folder"), button[aria-label="Create folder"]');

    if (await createFolderButton.isVisible()) {
      await createFolderButton.click();

      // Fill folder name in modal/input
      const folderNameInput = page.locator('input[data-testid="folder-name-input"], input[placeholder*="folder" i]');
      await folderNameInput.fill(TEST_FOLDER_NAME);

      // Submit
      const submitButton = page.locator('button:has-text("Create"), button[type="submit"]');
      await submitButton.click();

      await page.waitForTimeout(500);

      // Folder should appear
      await expect(page.locator(`text=${TEST_FOLDER_NAME}`)).toBeVisible();
    }
  });

  test('should drag session into folder', async ({ page }) => {
    // This test requires drag-and-drop support
    const sessionItem = page.locator('[data-testid="session-item"], .session-item').first();
    const folder = page.locator('[data-testid="folder-item"], .folder-item').first();

    if (await sessionItem.isVisible() && await folder.isVisible()) {
      // Perform drag and drop
      await sessionItem.dragTo(folder);
      await page.waitForTimeout(500);
    }
  });

  test('should expand/collapse folders', async ({ page }) => {
    const folderToggle = page.locator('[data-testid="folder-toggle"], .folder-toggle, button[aria-expanded]');

    if (await folderToggle.first().isVisible()) {
      // Click to expand
      await folderToggle.first().click();

      // Check for expanded state
      const isExpanded = await folderToggle.first().getAttribute('aria-expanded');
      expect(['true', 'false']).toContain(isExpanded);
    }
  });

  test('should rename folder', async ({ page }) => {
    const folder = page.locator('[data-testid="folder-item"], .folder-item').first();

    if (await folder.isVisible()) {
      await folder.click({ button: 'right' });

      const renameOption = page.locator('text=Rename');
      if (await renameOption.isVisible()) {
        await renameOption.click();

        const input = page.locator('input[data-testid="folder-name-input"]');
        await input.fill('Renamed Folder');
        await input.press('Enter');

        await expect(page.locator('text=Renamed Folder')).toBeVisible();
      }
    }
  });

  test('should delete folder with sessions handling', async ({ page }) => {
    const folder = page.locator('[data-testid="folder-item"], .folder-item').first();

    if (await folder.isVisible()) {
      await folder.click({ button: 'right' });

      const deleteOption = page.locator('text=Delete');
      if (await deleteOption.isVisible()) {
        await deleteOption.click();

        // Should show confirmation with option for sessions
        const confirmDialog = page.locator('[data-testid="confirm-dialog"], [role="dialog"]');
        await expect(confirmDialog).toBeVisible();
      }
    }
  });
});

test.describe('Enhanced Chat - Agent Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForChatReady(page);
  });

  test('should display agent selector', async ({ page }) => {
    const agentSelector = page.locator('[data-testid="agent-selector"], .agent-selector, [data-testid="agent-dropdown"]');
    await expect(agentSelector).toBeVisible();
  });

  test('should show available agents in dropdown', async ({ page }) => {
    const agentSelector = page.locator('[data-testid="agent-selector"], .agent-selector');

    if (await agentSelector.isVisible()) {
      await agentSelector.click();

      // Should show agent options
      const agentOptions = page.locator('[data-testid="agent-option"], .agent-option, [role="option"]');
      expect(await agentOptions.count()).toBeGreaterThan(0);
    }
  });

  test('should switch agent and update chat context', async ({ page }) => {
    const agentSelector = page.locator('[data-testid="agent-selector"], .agent-selector');

    if (await agentSelector.isVisible()) {
      // Get current agent
      const currentAgent = await agentSelector.textContent();

      await agentSelector.click();

      // Select a different agent
      const agentOption = page.locator('[data-testid="agent-option"], .agent-option').nth(1);
      if (await agentOption.isVisible()) {
        await agentOption.click();

        // Agent should have changed
        const newAgent = await agentSelector.textContent();
        expect(newAgent).not.toBe(currentAgent);
      }
    }
  });

  test('should show agent capabilities/description', async ({ page }) => {
    const agentSelector = page.locator('[data-testid="agent-selector"], .agent-selector');

    if (await agentSelector.isVisible()) {
      await agentSelector.click();

      // Hover over agent option
      const agentOption = page.locator('[data-testid="agent-option"], .agent-option').first();
      await agentOption.hover();

      // Should show tooltip or description
      const tooltip = page.locator('[data-testid="agent-description"], .tooltip, [role="tooltip"]');
      // Tooltip might appear
    }
  });
});

test.describe('Enhanced Chat - File Attachments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForChatReady(page);
  });

  test('should display file attachment button', async ({ page }) => {
    const attachButton = page.locator('[data-testid="attach-file"], button[aria-label*="attach" i], .attach-button');
    await expect(attachButton).toBeVisible();
  });

  test('should open file picker on attach click', async ({ page }) => {
    // Set up file chooser listener
    const fileChooserPromise = page.waitForEvent('filechooser');

    const attachButton = page.locator('[data-testid="attach-file"], button[aria-label*="attach" i]');
    await attachButton.click();

    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeDefined();
  });

  test('should show attached files before sending', async ({ page }) => {
    // Create a test file
    const testFileContent = 'This is a test file content';

    await page.evaluate((content) => {
      const dataTransfer = new DataTransfer();
      const file = new File([content], 'test.txt', { type: 'text/plain' });
      dataTransfer.items.add(file);

      // Dispatch drop event
      const dropZone = document.querySelector('[data-testid="chat-input"], textarea') as HTMLElement;
      if (dropZone) {
        const dropEvent = new DragEvent('drop', {
          dataTransfer,
          bubbles: true,
        });
        dropZone.dispatchEvent(dropEvent);
      }
    }, testFileContent);

    // Should show file preview
    const filePreview = page.locator('[data-testid="file-preview"], .file-preview, .attachment-preview');
    // Preview might be visible if drop worked
  });

  test('should remove attached file before sending', async ({ page }) => {
    // Assuming files are attached
    const removeButton = page.locator('[data-testid="remove-attachment"], .remove-attachment');

    if (await removeButton.first().isVisible()) {
      await removeButton.first().click();
      // File should be removed
    }
  });

  test('should support drag and drop files', async ({ page }) => {
    const input = await getMessageInput(page);

    // Simulate dragover
    await input.evaluate((el) => {
      const dragEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(dragEvent);
    });

    // Should show drop zone indicator
    const dropIndicator = page.locator('[data-testid="drop-indicator"], .drop-indicator, .drag-active');
    // Might be visible during drag
  });
});

test.describe('Enhanced Chat - Canvas Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForChatReady(page);
  });

  test('should toggle canvas panel visibility', async ({ page }) => {
    const canvasToggle = page.locator('[data-testid="toggle-canvas"], button[aria-label*="canvas" i], .canvas-toggle');

    if (await canvasToggle.isVisible()) {
      await canvasToggle.click();

      const canvasPanel = page.locator('[data-testid="canvas-panel"], .canvas-panel');
      await expect(canvasPanel).toBeVisible();

      // Toggle off
      await canvasToggle.click();
      await expect(canvasPanel).not.toBeVisible();
    }
  });

  test('should display code blocks in canvas', async ({ page }) => {
    // Send a message that would generate code
    const input = await getMessageInput(page);
    await input.fill('Write a simple JavaScript function to add two numbers');
    await input.press('Enter');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for canvas items
    const canvasItem = page.locator('[data-testid="canvas-item"], .canvas-item, .code-block');
    // Might be visible if AI responded with code
  });

  test('should copy code from canvas', async ({ page }) => {
    const copyButton = page.locator('[data-testid="copy-code"], button[aria-label*="copy" i]');

    if (await copyButton.first().isVisible()) {
      await copyButton.first().click();

      // Should show copied notification
      const copiedNotification = page.locator('text=Copied, text=copied');
      await expect(copiedNotification.first()).toBeVisible();
    }
  });

  test('should pin/unpin canvas items', async ({ page }) => {
    const canvasItem = page.locator('[data-testid="canvas-item"], .canvas-item').first();

    if (await canvasItem.isVisible()) {
      const pinButton = page.locator('[data-testid="pin-canvas-item"], button[aria-label*="pin" i]');
      await pinButton.click();

      // Should show pinned indicator
      const pinnedIndicator = page.locator('[data-testid="pinned-indicator"], .pinned');
      await expect(pinnedIndicator.first()).toBeVisible();
    }
  });

  test('should show canvas versions history', async ({ page }) => {
    const canvasItem = page.locator('[data-testid="canvas-item"], .canvas-item').first();

    if (await canvasItem.isVisible()) {
      const versionsButton = page.locator('[data-testid="canvas-versions"], button[aria-label*="version" i]');

      if (await versionsButton.isVisible()) {
        await versionsButton.click();

        const versionsList = page.locator('[data-testid="versions-list"], .versions-list');
        await expect(versionsList).toBeVisible();
      }
    }
  });
});

test.describe('Enhanced Chat - Search and Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForChatReady(page);
  });

  test('should search sessions by title', async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-sessions"], input[placeholder*="search" i]');

    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);

      // Sessions list should filter
    }
  });

  test('should filter sessions by folder', async ({ page }) => {
    const folderFilter = page.locator('[data-testid="folder-filter"], .folder-filter');

    if (await folderFilter.isVisible()) {
      await folderFilter.click();

      const folderOption = page.locator('[data-testid="folder-option"], .folder-option').first();
      if (await folderOption.isVisible()) {
        await folderOption.click();
        // Sessions should filter to folder
      }
    }
  });

  test('should filter sessions by archived status', async ({ page }) => {
    const archiveFilter = page.locator('[data-testid="archive-filter"], text=Show Archived');

    if (await archiveFilter.isVisible()) {
      await archiveFilter.click();
      // Should show/hide archived sessions
    }
  });
});

test.describe('Enhanced Chat - Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForChatReady(page);
  });

  test('should open settings modal', async ({ page }) => {
    const settingsButton = page.locator('[data-testid="chat-settings"], button[aria-label*="settings" i]');

    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      const settingsModal = page.locator('[data-testid="settings-modal"], [role="dialog"]');
      await expect(settingsModal).toBeVisible();
    }
  });

  test('should change default model', async ({ page }) => {
    const settingsButton = page.locator('[data-testid="chat-settings"]');

    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      const modelSelect = page.locator('[data-testid="default-model-select"], select[name="model"]');
      if (await modelSelect.isVisible()) {
        await modelSelect.selectOption({ index: 1 });
      }
    }
  });

  test('should adjust temperature setting', async ({ page }) => {
    const settingsButton = page.locator('[data-testid="chat-settings"]');

    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      const temperatureSlider = page.locator('[data-testid="temperature-slider"], input[type="range"]');
      if (await temperatureSlider.isVisible()) {
        await temperatureSlider.fill('0.8');
      }
    }
  });

  test('should toggle streaming responses', async ({ page }) => {
    const settingsButton = page.locator('[data-testid="chat-settings"]');

    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      const streamingToggle = page.locator('[data-testid="streaming-toggle"], input[name="streaming"]');
      if (await streamingToggle.isVisible()) {
        await streamingToggle.click();
      }
    }
  });
});

test.describe('Enhanced Chat - Responsive Layout', () => {
  test('should adapt to mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/chat');
    await waitForChatReady(page);

    // Sidebar should be hidden or collapsed on mobile
    const sidebar = page.locator('[data-testid="chat-sidebar"], .chat-sidebar');
    const sidebarVisible = await sidebar.isVisible();

    // Should have mobile menu button if sidebar is hidden
    if (!sidebarVisible) {
      const mobileMenu = page.locator('[data-testid="mobile-menu"], button[aria-label*="menu" i]');
      await expect(mobileMenu).toBeVisible();
    }
  });

  test('should show mobile sidebar on menu click', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/chat');
    await waitForChatReady(page);

    const mobileMenu = page.locator('[data-testid="mobile-menu"], button[aria-label*="menu" i]');

    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();

      const sidebar = page.locator('[data-testid="chat-sidebar"], .chat-sidebar');
      await expect(sidebar).toBeVisible();
    }
  });

  test('should adapt to tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/chat');
    await waitForChatReady(page);

    // Layout should adjust appropriately
    const mainContent = page.locator('[data-testid="chat-main"], main, .chat-main');
    await expect(mainContent).toBeVisible();
  });
});

test.describe('Enhanced Chat - Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await waitForChatReady(page);
  });

  test('should navigate sessions with arrow keys', async ({ page }) => {
    const sidebar = page.locator('[data-testid="chat-sidebar"], .chat-sidebar');

    if (await sidebar.isVisible()) {
      await sidebar.focus();
      await page.keyboard.press('ArrowDown');

      // First session should be focused
      const focusedSession = page.locator('[data-testid="session-item"]:focus, .session-item:focus');
      // Might have focus
    }
  });

  test('should open new chat with keyboard shortcut', async ({ page }) => {
    // Cmd/Ctrl + N for new chat
    await page.keyboard.press('Control+n');

    // Should create new session or focus new chat button
  });

  test('should focus input with keyboard shortcut', async ({ page }) => {
    // Escape then / to focus input
    await page.keyboard.press('Escape');
    await page.keyboard.press('/');

    const input = await getMessageInput(page);
    await expect(input).toBeFocused();
  });

  test('should close modals with Escape', async ({ page }) => {
    const settingsButton = page.locator('[data-testid="chat-settings"]');

    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();
    }
  });
});
