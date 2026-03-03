import { test, expect } from '@playwright/test';

test.describe('Position Rejection Path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('[name="email"]', 'demo@demo.com');
    await page.fill('[name="password"]', 'demo');
    await page.click('[type="submit"]');
  });

  test('can reject a position with reason and reopen it', async ({ page }) => {
    await page.goto('/position-desk');

    const firstNewRow = page.locator('[data-status="NEW"]').first();
    await firstNewRow.locator('[data-action="reject"]').click();

    await expect(page.locator('[data-testid="rejection-reason-dialog"]')).toBeVisible();
    await page.fill('[data-testid="rejection-reason-input"]', 'Hedge not required — exposure settled');
    await page.click('[data-testid="confirm-reject"]');

    const rejectedRow = page.locator('[data-record-id]').filter({ has: page.locator('[data-status="REJECTED"]') }).first();
    await expect(rejectedRow).toBeVisible();

    await rejectedRow.locator('[data-status="REJECTED"]').hover();
    await expect(page.locator('[data-testid="rejection-reason-tooltip"]')).toContainText('Hedge not required');

    await rejectedRow.locator('[data-action="reopen"]').click();
    await expect(rejectedRow.locator('[data-status="NEW"]')).toBeVisible();
  });
});
