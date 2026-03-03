import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Position Desk — Invalid Input Validation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/position-desk');
    await page.click('text=Add Exposure Line');
  });

  test('shows error for blank Record ID', async ({ page }) => {
    await page.fill('[name="amount"]', '100000');
    await page.click('[data-testid="submit-position"]');
    await expect(page.locator('[data-error="record_id"]')).toBeVisible();
    await expect(page.locator('[data-error="record_id"]')).toContainText('required');
  });

  test('shows error for invalid date', async ({ page }) => {
    await page.fill('[name="record_id"]', 'TXN-BAD-DATE');
    await page.fill('[name="amount"]', '100000');
    await page.fill('[name="value_date"]', 'not-a-date');
    await page.click('[data-testid="submit-position"]');
    await expect(page.locator('[data-error="value_date"]')).toBeVisible();
  });

  test('shows error for non-numeric amount', async ({ page }) => {
    await page.fill('[name="record_id"]', 'TXN-BAD-AMT');
    await page.fill('[name="amount"]', 'one million');
    await page.click('[data-testid="submit-position"]');
    await expect(page.locator('[data-error="amount"]')).toBeVisible();
  });

  test('shows error for zero amount', async ({ page }) => {
    await page.fill('[name="record_id"]', 'TXN-ZERO');
    await page.fill('[name="amount"]', '0');
    await page.click('[data-testid="submit-position"]');
    await expect(page.locator('[data-error="amount"]')).toContainText('greater than 0');
  });
});
