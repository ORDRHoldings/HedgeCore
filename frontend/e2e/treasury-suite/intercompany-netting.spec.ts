import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

test.describe('Treasury Suite / intercompany-netting', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('page loads without error boundary', async ({ page }) => {
    await navigateAuth(page, '/intercompany-netting');
    await expect(page.locator('body')).toBeVisible();
    const errorBanner = page.locator('text=— Error').first();
    expect(await errorBanner.isVisible({ timeout: 500 }).catch(() => false))
      .toBe(false);
  });
});
