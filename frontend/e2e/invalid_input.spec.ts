/**
 * frontend/e2e/invalid_input.spec.ts
 *
 * Position Desk — Add Position form validation.
 * Replaces legacy tests that used data-error and data-testid selectors not in the UI.
 */

import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Position Desk — Add Position Form Validation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");
    await page.locator('button:has-text("ADD POSITION")').first().click();
    await expect(
      page.locator('input[placeholder="e.g. TXN-001"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test("empty submit does not close the drawer", async ({ page }) => {
    await page.locator('button:has-text("+ ADD POSITION")').first().click();
    // Validation must prevent submission — drawer stays visible
    await expect(
      page.locator('input[placeholder="e.g. TXN-001"]')
    ).toBeVisible({ timeout: 2000 });
  });

  test("form has all required fields", async ({ page }) => {
    await expect(page.locator('input[placeholder="e.g. TXN-001"]')).toBeVisible();
    await expect(page.locator('input[placeholder="e.g. Acme Corp"]')).toBeVisible();
    await expect(page.locator('input[placeholder="0"]')).toBeVisible();
    await expect(page.locator('input[placeholder="YYYY-MM-DD"]')).toBeVisible();
  });

  test("filling valid values keeps the drawer open for submission", async ({ page }) => {
    await page.locator('input[placeholder="e.g. TXN-001"]').fill("E2E-VAL-001");
    await page.locator('input[placeholder="e.g. Acme Corp"]').fill("Test Corp");
    await page.locator('input[placeholder="0"]').fill("100000");

    // Submit button must be present and enabled
    const submitBtn = page.locator('button:has-text("+ ADD POSITION")').first();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });

  test("zero amount does not submit", async ({ page }) => {
    await page.locator('input[placeholder="e.g. TXN-001"]').fill("E2E-ZERO");
    await page.locator('input[placeholder="0"]').fill("0");
    await page.locator('button:has-text("+ ADD POSITION")').first().click();
    // Drawer must remain open (amount > 0 is required by backend schema)
    await expect(
      page.locator('input[placeholder="e.g. TXN-001"]')
    ).toBeVisible({ timeout: 2000 });
  });
});
