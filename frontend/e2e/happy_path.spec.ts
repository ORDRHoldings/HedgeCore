/**
 * frontend/e2e/happy_path.spec.ts
 *
 * Core navigation flow: position desk → hedge desk → reports.
 * Replaces legacy test that used non-existent /policy-desk and /execution-desk routes
 * and data-testid attributes not present in the current UI.
 */

import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("FX Treasury Platform — Core Navigation Flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("position desk → hedge desk → reports navigation flow", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/position-desk/);
    await expect(page.locator('button:has-text("ALL")').first()).toBeVisible({
      timeout: 8000,
    });

    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/hedge-desk/);

    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/reports/);
  });

  test("Add Position drawer form fields are all present", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    await page.locator('button:has-text("ADD POSITION")').first().click();

    await expect(
      page.locator('input[placeholder="e.g. TXN-001"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="e.g. Acme Corp"]')).toBeVisible();
    await expect(page.locator('input[placeholder="0"]')).toBeVisible();

    await page.locator('button:has-text("CLOSE")').first().click();
    await expect(
      page.locator('input[placeholder="e.g. TXN-001"]')
    ).not.toBeVisible({ timeout: 3000 });
  });

  test("submitting empty drawer form does not dismiss it", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    await page.locator('button:has-text("ADD POSITION")').first().click();
    await expect(
      page.locator('input[placeholder="e.g. TXN-001"]')
    ).toBeVisible({ timeout: 5000 });

    // Click submit with no required fields filled — drawer must stay open
    await page.locator('button:has-text("+ ADD POSITION")').first().click();
    await expect(
      page.locator('input[placeholder="e.g. TXN-001"]')
    ).toBeVisible({ timeout: 2000 });
  });
});
