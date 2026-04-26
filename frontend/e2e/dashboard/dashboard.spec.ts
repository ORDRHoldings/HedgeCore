import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('KPI cards render', async ({ page }) => {
    await navigateAuth(page, '/dashboard');
    await expect(page.locator('text=Net Exposure')).toBeVisible();
    await expect(page.locator('text=Hedge Ratio')).toBeVisible();
  });

  test('FX rates widget renders', async ({ page }) => {
    await navigateAuth(page, '/dashboard');
    await expect(page.locator('text=EUR/USD')).toBeVisible();
  });

  test('sidebar navigation links work', async ({ page }) => {
    await navigateAuth(page, '/dashboard');
    await page.click('a[href*="/hedge-desk"]');
    await expect(page).toHaveURL(/hedge-desk/);
  });
});
