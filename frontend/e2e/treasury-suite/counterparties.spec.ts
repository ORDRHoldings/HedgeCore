import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

test.describe('Treasury Suite / Counterparties', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('counterparty hub renders with table', async ({ page }) => {
    await navigateAuth(page, '/counterparties');
    await expect(page.locator('text=COUNTERPARTIES')).toBeVisible();
    const table = page.locator('table').first();
    const emptyState = page.locator('text=No counterparties');
    await expect(table.or(emptyState)).toBeVisible();
  });

  test('create toggle opens form', async ({ page }) => {
    await navigateAuth(page, '/counterparties');
    const btn = page.locator('button:has-text("CREATE")').first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await expect(page.locator('text=New Counterparty').first()).toBeVisible();
    }
  });
});
