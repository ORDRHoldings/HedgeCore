/**
 * frontend/e2e/position_persistence.spec.ts
 *
 * Position Desk — UI surface smoke tests.
 * Replaces legacy tests that used the non-existent /input route.
 */

import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Position Desk — UI Surface", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("position desk loads and displays all status filter tabs", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/position-desk/);

    // All expected status filter tabs must be visible
    await expect(page.locator('button:has-text("ALL")').first()).toBeVisible({
      timeout: 8000,
    });
    await expect(page.locator('button:has-text("NEW")').first()).toBeVisible();
    await expect(page.locator('button:has-text("HEDGED")').first()).toBeVisible();
    await expect(page.locator('button:has-text("REJECTED")').first()).toBeVisible();
  });

  test("Add Position drawer opens, shows all fields, and closes", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    await page.locator('button:has-text("ADD POSITION")').first().click();

    await expect(
      page.locator('input[placeholder="e.g. TXN-001"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="e.g. Acme Corp"]')).toBeVisible();
    await expect(page.locator('input[placeholder="0"]')).toBeVisible();
    await expect(page.locator('input[placeholder="YYYY-MM-DD"]')).toBeVisible();

    await page.locator('button:has-text("CLOSE")').first().click();
    await expect(
      page.locator('input[placeholder="e.g. TXN-001"]')
    ).not.toBeVisible({ timeout: 3000 });
  });

  test("navigating away and back to position desk preserves the page", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/position-desk/);
    await expect(page.locator('button:has-text("ALL")').first()).toBeVisible({
      timeout: 8000,
    });
  });
});
