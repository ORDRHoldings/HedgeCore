/**
 * frontend/e2e/rejection_path.spec.ts
 *
 * Position Desk — REJECTED lifecycle status smoke tests.
 * Replaces legacy tests that used non-existent data-action and data-testid selectors.
 */

import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Position Desk — Rejection Tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("REJECTED filter tab is visible and clickable", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    const rejectedTab = page.locator('button:has-text("REJECTED")').first();
    await expect(rejectedTab).toBeVisible({ timeout: 8000 });

    await rejectedTab.click();
    await page.waitForTimeout(500);

    // Filter is client-side — URL stays on position-desk
    await expect(page).toHaveURL(/position-desk/);
  });

  test("position desk shows lifecycle status indicators", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    // NEEDS ACTION composite tab is always visible regardless of position count
    await expect(
      page.locator('button:has-text("NEEDS ACTION")').first()
    ).toBeVisible({ timeout: 8000 });
  });
});
