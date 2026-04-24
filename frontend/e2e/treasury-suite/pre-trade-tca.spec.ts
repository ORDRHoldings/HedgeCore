import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

test.describe('Treasury Suite / Pre-Trade TCA', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('TCA estimator page loads', async ({ page }) => {
    await navigateAuth(page, '/pre-trade-tca');
    await expect(page.locator('body')).toBeVisible();
    // Page heading or form should render (not error boundary)
    const errorBanner = page.locator('text=— Error').first();
    expect(await errorBanner.isVisible({ timeout: 500 }).catch(() => false))
      .toBe(false);
  });
});
