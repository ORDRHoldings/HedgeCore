import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../../helpers/auth';

test.describe('Accounting / ERP Integration', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('ERP integration page renders tabs', async ({ page }) => {
    await navigateAuth(page, '/erp-integration');
    await expect(page.locator('text=SAP').or(page.locator('text=Oracle'))).toBeVisible();
    await expect(page.locator('text=NetSuite')).toBeVisible();
  });

  test('test connection and sync buttons are present', async ({ page }) => {
    await navigateAuth(page, '/erp-integration');
    await expect(page.locator('text=TEST CONNECTION').first()).toBeVisible();
    await expect(page.locator('text=SYNC NOW').first()).toBeVisible();
  });

  test('probe error state shows gracefully', async ({ page }) => {
    await navigateAuth(page, '/erp-integration');
    // Ensure page does not crash on probe 404
    await expect(page.locator('text=ERP CONNECTOR').or(page.locator('text=Connector'))).toBeVisible();
  });
});
