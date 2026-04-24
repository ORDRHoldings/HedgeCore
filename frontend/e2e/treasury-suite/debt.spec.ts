import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

test.describe('Treasury Suite / Debt', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('debt page renders with maturity calendar', async ({ page }) => {
    await navigateAuth(page, '/debt');
    await expect(page.locator('text=DEBT FACILITIES')).toBeVisible();
    await expect(page.locator('text=MATURITY LADDER')).toBeVisible();
  });

  test('facility table or empty state renders', async ({ page }) => {
    await navigateAuth(page, '/debt');
    const table = page.locator('table').first();
    const emptyState = page.locator('text=No debt facilities');
    await expect(table.or(emptyState)).toBeVisible();
  });
});
