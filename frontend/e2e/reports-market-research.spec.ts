import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from './helpers/auth';

test.describe('Reports, Market & Research', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('reports studio loads', async ({ page }) => {
    await navigateAuth(page, '/reports');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Report', { timeout: 10000 });
  });

  test('market intelligence loads', async ({ page }) => {
    await navigateAuth(page, '/market-intelligence');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Market', { timeout: 10000 });
  });

  test('sandbox loads', async ({ page }) => {
    await navigateAuth(page, '/sandbox');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Simulation', { timeout: 10000, ignoreCase: true });
  });

  test('scenario studio loads', async ({ page }) => {
    await navigateAuth(page, '/scenario-studio');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Scenario', { timeout: 10000 });
  });

  test('methodology loads', async ({ page }) => {
    await navigateAuth(page, '/methodology');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Methodology', { timeout: 10000 });
  });
});
