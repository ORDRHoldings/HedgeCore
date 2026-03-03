import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Full Hedge Pipeline — Happy Path', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('creates position, assigns policy, executes, views report', async ({ page }) => {
    // Step 1: Create a position
    await page.goto('/position-desk');
    await page.click('text=Add Exposure Line');
    await page.fill('[name="record_id"]', 'E2E-001');
    await page.fill('[name="entity"]', 'Test Corp');
    await page.selectOption('[name="currency"]', 'MXN');
    await page.fill('[name="amount"]', '500000');
    await page.selectOption('[name="flow_type"]', 'AP');
    await page.fill('[name="value_date"]', '2026-06-30');
    await page.selectOption('[name="status"]', 'Confirmed');
    await page.click('[data-testid="submit-position"]');

    await expect(page.locator('text=E2E-001')).toBeVisible();
    await expect(page.locator('[data-status="NEW"]').first()).toBeVisible();

    // Step 2: Assign policy via Policy Desk
    await page.goto('/policy-desk');
    await page.check('[data-record-id="E2E-001"]');
    await page.click('text=Assign Active Policy');
    await page.click('[data-testid="confirm-assign"]');
    await expect(page.locator('text=Policy Assigned')).toBeVisible();

    // Step 3: Run Execution Pipeline
    await page.goto('/execution-desk');
    await expect(page.locator('[data-status="POLICY_ASSIGNED"]')).toBeVisible();
    await page.check('[data-record-id="E2E-001"]');
    await page.click('[data-testid="proceed-to-calculate"]');

    await page.click('[data-testid="run-calculation"]');
    await expect(page.locator('[data-testid="run-id"]')).toBeVisible({ timeout: 10000 });
    await page.click('[data-testid="approve-plan"]');

    await expect(page.locator('[data-testid="all-checks-pass"]')).toBeVisible();
    await page.click('[data-testid="proceed-to-execute"]');

    await page.click('[data-testid="execute-tickets"]');
    await expect(page.locator('text=HEDGED')).toBeVisible();

    // Step 4: Generate report
    await page.goto('/reports');
    await page.click('[data-testid="select-run"]');
    await page.click('[data-testid="generate-report"]');
    await expect(page.locator('[data-testid="report-preview"]')).toBeVisible();
  });
});
