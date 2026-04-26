import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers/auth';

test.describe('Auth / Login', () => {
  test('login page renders with theme-aware inputs', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('#login-user')).toBeVisible();
    await expect(page.locator('#login-pass')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Authenticate');
  });

  test('successful demo login redirects to dashboard', async ({ page }) => {
    await loginAsDemo(page);
    await expect(page).toHaveURL(/dashboard|welcome/);
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('invalid credentials show error banner', async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('#login-user', 'invalid');
    await page.fill('#login-pass', 'wrong');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=ACCESS DENIED')).toBeVisible({ timeout: 10000 });
  });

  test('autofill styles do not break input visibility', async ({ page }) => {
    await page.goto('/auth/login');
    const userInput = page.locator('#login-user');
    await userInput.fill('demo');
    const styles = await userInput.evaluate((el: HTMLInputElement) =>
      window.getComputedStyle(el).color
    );
    expect(styles).not.toBe('rgba(0, 0, 0, 0)');
  });
});
