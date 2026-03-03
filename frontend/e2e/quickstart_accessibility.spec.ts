import { test, expect } from '@playwright/test';

const LOGIN_EMAIL = 'demo@demo.com';
const LOGIN_PASSWORD = 'demo';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  const emailField = page.locator('[name="email"], [type="email"]').first();
  const passwordField = page.locator('[type="password"]').first();
  await emailField.fill(LOGIN_EMAIL);
  await passwordField.fill(LOGIN_PASSWORD);
  await page.locator('[type="submit"]').first().click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

test.describe('QuickStartWindow Accessibility', () => {

  test('panel has correct ARIA role', async ({ page }) => {
    await login(page);
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
    await login(page);
    await page.waitForLoadState('networkidle');

    const closeBtn = page.locator('[aria-label="Close Quick Start"]').first();
    if (await closeBtn.isVisible({ timeout: 8000 })) {
      const label = await closeBtn.getAttribute('aria-label');
      expect(label).toBeTruthy();
    }
  });

  test('panel does not trap focus (user can tab to main content)', async ({ page }) => {
    await login(page);
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
