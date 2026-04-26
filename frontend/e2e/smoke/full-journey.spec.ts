import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

test.describe('Smoke / Full Journey', () => {
  test('login → hedge desk → report → logout', async ({ page }) => {
    // Login
    await loginAsDemo(page);
    await expect(page).toHaveURL(/dashboard|welcome/);

    // Navigate to hedge desk
    await navigateAuth(page, '/hedge-desk');
    await expect(page.locator('text=HEDGE DESK').or(page.locator('text=Hedge Desk'))).toBeVisible();

    // Navigate to reports
    await navigateAuth(page, '/reports');
    await expect(page.locator('text=REPORTS').or(page.locator('text=Reports'))).toBeVisible();

    // Logout
    await page.goto('/auth/logout');
    await expect(page).toHaveURL(/auth\/login/);
  });
});
