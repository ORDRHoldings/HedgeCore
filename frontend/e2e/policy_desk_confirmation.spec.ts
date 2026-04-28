/**
 * frontend/e2e/policy_desk_confirmation.spec.ts
 *
 * Position Desk — status filter tab interactions and navigation confirmations.
 * Replaces legacy tests that targeted the non-existent /policy-desk route.
 */

import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Position Desk — Status Tab Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("ALL filter tab is visible and clickable", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    const allTab = page.locator('button:has-text("ALL")').first();
    await expect(allTab).toBeVisible({ timeout: 8000 });
    await allTab.click();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/position-desk/);
  });

  test("NEEDS ACTION composite filter tab is present", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    const needsActionTab = page.locator('button:has-text("NEEDS ACTION")').first();
    await expect(needsActionTab).toBeVisible({ timeout: 8000 });
  });

  test("POLICY ASGND filter tab is present", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('button:has-text("POLICY ASGND")').first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("dashboard does not show stale PROCEED TO EXECUTION CTA", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=PROCEED TO EXECUTION")).not.toBeVisible({
      timeout: 3000,
    });
  });
});
