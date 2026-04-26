import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

test.describe('Governance Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('audit-trail page renders', async ({ page }) => {
    await navigateAuth(page, '/audit-trail');
    await expect(page.locator('text=AUDIT TRAIL').or(page.locator('text=Audit Trail'))).toBeVisible();
    await expect(page.locator('table').first().or(page.locator('text=No audit'))).toBeVisible();
  });

  test('ledger page renders', async ({ page }) => {
    await navigateAuth(page, '/ledger');
    await expect(page.locator('text=LEDGER').or(page.locator('text=Ledger'))).toBeVisible();
  });

  test('staging page renders 4-eyes queue', async ({ page }) => {
    await navigateAuth(page, '/staging');
    await expect(page.locator('text=STAGING').or(page.locator('text=Staging'))).toBeVisible();
  });
});
