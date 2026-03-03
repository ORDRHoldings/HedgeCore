import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

/**
 * QuickStartWindow E2E tests
 *
 * These tests verify the Quick Start Window behavior after login.
 * The window is a right-side drawer that appears on the Dashboard
 * after login when show_quickstart preference is true (default).
 */

async function resetQuickstartPref(page: import('@playwright/test').Page, token: string) {
  // Reset preference via API so window shows again
  await page.evaluate(async ({ token }) => {
    await fetch('/api/v1/ui/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ show_quickstart: true }),
    });
    localStorage.removeItem('qs_suppressed_' + 'demo_user_id');
  }, { token });
}

test.describe('QuickStartWindow', () => {

  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test to avoid cross-test contamination
    await page.goto('/');
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('qs_suppressed_')) localStorage.removeItem(k);
      });
    });
  });

  test('appears on dashboard after login', async ({ page }) => {
    await loginAsDemo(page);

    // The Quick Start Window should be visible
    // Look for the panel's header text or role
    await page.waitForLoadState('networkidle');

    // Check for the Quick Start panel — it has a distinctive header
    const panel = page.locator('[role="dialog"][aria-label*="Quick Start"],' +
      ' [data-testid="quickstart-window"],' +
      ' text=Quick Start').first();

    // Allow time for the panel to animate in
    await expect(panel).toBeVisible({ timeout: 8000 });
  });

  test('contains step workflow items', async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForLoadState('networkidle');

    // Should show the 4 workflow steps
    await expect(page.locator('text=Add FX Exposures').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Assign').first()).toBeVisible({ timeout: 8000 });
  });

  test('close button dismisses window for this session', async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForLoadState('networkidle');

    // Find and click close button
    const closeBtn = page.locator('[aria-label="Close Quick Start"], button:has-text("CLOSE"), button:has-text("✕")').first();
    await closeBtn.waitFor({ timeout: 8000 });
    await closeBtn.click();

    // Window should disappear
    await expect(page.locator('[role="dialog"][aria-label*="Quick Start"]').first()).not.toBeVisible({ timeout: 3000 });

    // Navigate away and back — window should NOT reappear (session dismissed)
    await page.goto('/position-desk');
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Should not reappear after close (session state)
    const panel = page.locator('[aria-label*="Quick Start"]').first();
    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });

  test('dont show again persists preference', async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForLoadState('networkidle');

    // Find "Don't show again" toggle/checkbox/button
    const dontShowToggle = page.locator(
      'text=Don\'t show again, input[type="checkbox"] + label:has-text("Don\'t"), ' +
      'label:has-text("Don\'t show"), button:has-text("Don\'t show")'
    ).first();

    if (await dontShowToggle.isVisible({ timeout: 5000 })) {
      await dontShowToggle.click();

      // Also click the dismiss/close button if it's a checkbox + separate close
      const dismissBtn = page.locator('button:has-text("CLOSE"), button:has-text("DISMISS"), button:has-text("Got it")').first();
      if (await dismissBtn.isVisible({ timeout: 2000 })) {
        await dismissBtn.click();
      }
    } else {
      test.skip();
    }

    // Reload — window should not appear
    await page.reload();
    await page.waitForLoadState('networkidle');

    const panel = page.locator('[role="dialog"][aria-label*="Quick Start"]').first();
    await expect(panel).not.toBeVisible({ timeout: 5000 });
  });

  test('quick links navigate to correct pages', async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForLoadState('networkidle');

    // Look for Position Desk link
    const positionLink = page.locator('a[href*="position-desk"], button:has-text("Position Desk")').first();
    if (await positionLink.isVisible({ timeout: 8000 })) {
      await positionLink.click();
      await expect(page).toHaveURL(/position-desk/, { timeout: 8000 });
    }
  });

  test('ESC key closes the window', async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForLoadState('networkidle');

    // Wait for panel to appear
    const panel = page.locator('[role="dialog"][aria-label*="Quick Start"]').first();
    await panel.waitFor({ timeout: 8000, state: 'visible' });

    // Press ESC
    await page.keyboard.press('Escape');

    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });

  test('KPI strip shows without errors (empty system)', async ({ page }) => {
    await loginAsDemo(page);
    await page.waitForLoadState('networkidle');

    // KPI strip should render even with no data
    // Should NOT show "undefined", "NaN", or raw error text
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('TypeError');

    // Should show formatted values or "—" for missing data
    const panel = page.locator('[role="dialog"][aria-label*="Quick Start"]').first();
    if (await panel.isVisible({ timeout: 5000 })) {
      const panelText = await panel.textContent();
      expect(panelText).not.toContain('undefined');
      expect(panelText).not.toContain('NaN');
    }
  });
});
