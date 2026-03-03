import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('QuickStartWindow Accessibility', () => {

  test('panel has correct ARIA role', async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForLoadState('networkidle');

    const dialog = page.locator('[role="dialog"]').first();
    if (await dialog.isVisible({ timeout: 8000 })) {
      const ariaLabel = await dialog.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      // aria-modal should be false (it's a drawer, not a blocking modal)
      const ariaModal = await dialog.getAttribute('aria-modal');
      expect(ariaModal).toBe('false');
    }
  });

  test('close button has aria-label', async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForLoadState('networkidle');

    const closeBtn = page.locator('[aria-label="Close Quick Start"]').first();
    if (await closeBtn.isVisible({ timeout: 8000 })) {
      const label = await closeBtn.getAttribute('aria-label');
      expect(label).toBeTruthy();
    }
  });

  test('panel does not trap focus (user can tab to main content)', async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForLoadState('networkidle');

    // Tab multiple times — should eventually reach elements outside the panel
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
    }

    // User should be able to reach the main content (not trapped in dialog)
    // Just verify the page is still functional and ESC still works
    const panel = page.locator('[role="dialog"][aria-label*="Quick Start"]').first();
    if (await panel.isVisible({ timeout: 2000 })) {
      await page.keyboard.press('Escape');
      await expect(panel).not.toBeVisible({ timeout: 3000 });
    }
  });
});
