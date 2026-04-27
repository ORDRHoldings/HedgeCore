import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from './helpers/auth';

test.describe('Settings Pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('settings general loads', async ({ page }) => {
    await navigateAuth(page, '/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Settings', { timeout: 10000 });
  });

  test('settings security loads', async ({ page }) => {
    await navigateAuth(page, '/settings?tab=security');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Security', { timeout: 10000 });
  });

  test('settings notifications loads', async ({ page }) => {
    await navigateAuth(page, '/settings?tab=notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Notification', { timeout: 10000 });
  });

  test('settings API config loads', async ({ page }) => {
    await navigateAuth(page, '/settings?tab=api_config');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('API', { timeout: 10000 });
  });

  test('legal entities settings loads', async ({ page }) => {
    await navigateAuth(page, '/settings/legal-entities');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Legal', { timeout: 10000 });
  });

  test('bank accounts settings loads', async ({ page }) => {
    await navigateAuth(page, '/settings/bank-accounts');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Bank', { timeout: 10000 });
  });

  test('bank connections settings loads', async ({ page }) => {
    await navigateAuth(page, '/settings/bank-connections');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Connection', { timeout: 10000 });
  });

  test('gl accounts settings loads', async ({ page }) => {
    await navigateAuth(page, '/settings/gl-accounts');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('GL', { timeout: 10000 });
  });

  test('notifications page loads and shows webhook UI', async ({ page }) => {
    await navigateAuth(page, '/settings/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Webhook', { timeout: 10000 });
  });
});
