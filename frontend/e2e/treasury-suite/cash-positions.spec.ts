import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

test.describe('Treasury Suite / Cash Positions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('page loads with tab navigation', async ({ page }) => {
    await navigateAuth(page, '/cash-positions');
    await expect(page.locator('text=CONSOLIDATED')).toBeVisible();
    await expect(page.locator('text=BY ENTITY')).toBeVisible();
    await expect(page.locator('text=BY ACCOUNT')).toBeVisible();
  });

  test('table or empty state renders without error', async ({ page }) => {
    await navigateAuth(page, '/cash-positions');
    const table = page.locator('table').first();
    const emptyState = page.locator('text=No cash positions');
    await expect(table.or(emptyState)).toBeVisible();
  });
});
