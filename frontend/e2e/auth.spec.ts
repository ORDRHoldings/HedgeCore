import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Authentication Flow', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Logo and branding
    await expect(page.locator('img[alt="ORDR Terminal"]')).toBeVisible();
    await expect(page.locator('text=Institutional FX Hedge Governance')).toBeVisible();

    // Input fields
    await expect(page.locator('#login-user')).toBeVisible();
    await expect(page.locator('#login-pass')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Labels
    await expect(page.locator('text=Terminal ID')).toBeVisible();
    await expect(page.locator('text=Access Key')).toBeVisible();
  });

  test('login with demo credentials succeeds', async ({ page }) => {
    await loginAsDemo(page);
    // Should redirect to dashboard or welcome
    await expect(page).toHaveURL(/dashboard|welcome/);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.locator('#login-user').fill('invalid_user');
    await page.locator('#login-pass').fill('invalid_pass');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=ACCESS DENIED')).toBeVisible({ timeout: 10000 });
  });

  test('logout redirects to login', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/auth/logout');
    await expect(page).toHaveURL('/auth/login');
  });
});
