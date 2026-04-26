import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../../helpers/auth';

test.describe('Accounting / Accounting Connection', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('accounting connection page renders platforms', async ({ page }) => {
    await navigateAuth(page, '/accounting-connection');
    await expect(page.locator('text=ACCOUNTING SYSTEMS')).toBeVisible();
    await expect(page.locator('text=QuickBooks')).toBeVisible();
    await expect(page.locator('text=Xero')).toBeVisible();
  });

  test('selecting a system shows configuration panel', async ({ page }) => {
    await navigateAuth(page, '/accounting-connection');
    await page.click('text=QuickBooks Online');
    await expect(page.locator('text=CONFIGURATION')).toBeVisible();
    await expect(page.locator('text=CONNECT QUICKBOOKS')).toBeVisible();
  });
});
