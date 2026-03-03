import type { Page } from '@playwright/test';

export async function loginAsDemo(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.fill('[aria-label="Terminal ID"], input[autocomplete="username"]', 'demo');
  await page.fill('input[type="password"]', 'demo');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}
