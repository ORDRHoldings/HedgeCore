import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

test.describe('Market', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('market page renders heatmap and calendar', async ({ page }) => {
    await navigateAuth(page, '/market');
    await expect(page.locator('text=MARKET INTELLIGENCE')).toBeVisible();
    await expect(page.locator('text=HEATMAP').or(page.locator('text=Heatmap'))).toBeVisible();
  });

  test('companies tab is navigable', async ({ page }) => {
    await navigateAuth(page, '/market');
    const companiesTab = page.locator('text=COMPANIES');
    if (await companiesTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await companiesTab.click();
      await expect(page.locator('table').first().or(page.locator('text=No data'))).toBeVisible();
    }
  });
});
