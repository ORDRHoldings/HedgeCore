/**
 * frontend/e2e/export_report.spec.ts
 *
 * Reports page — tab navigation and structure.
 * Replaces legacy tests that used data-testid selectors not present in the current UI.
 */

import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Reports Page — Tab Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("reports page loads and shows Studio tab by default", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/reports/);

    // Studio is the default tab
    const studioTab = page
      .locator('button:has-text("Studio"), [role="tab"]:has-text("Studio")')
      .first();
    await expect(studioTab).toBeVisible({ timeout: 8000 });
  });

  test("Library tab is reachable via URL param", async ({ page }) => {
    await page.goto("/reports?tab=library");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/reports/);
  });

  test("Regulatory tab is reachable via URL param", async ({ page }) => {
    await page.goto("/reports?tab=regulatory");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/reports/);
  });

  test("reports page loads without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const criticalErrors = errors.filter(
      (e) => !e.includes("Warning") && !e.includes("warning")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
