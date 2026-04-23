import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from './helpers/auth';

test.describe('Accounting & ERP Pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('accounting connection page loads', async ({ page }) => {
    await navigateAuth(page, '/accounting-connection');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Accounting', { timeout: 10000 });
  });

  test('ERP integration page loads', async ({ page }) => {
    await navigateAuth(page, '/erp-integration');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('ERP', { timeout: 10000 });
  });

  test('ledger page loads', async ({ page }) => {
    await navigateAuth(page, '/ledger');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Ledger', { timeout: 10000 });
  });

  test('GL accounts settings loads', async ({ page }) => {
    await navigateAuth(page, '/settings/gl-accounts');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('GL', { timeout: 10000 });
  });
});
