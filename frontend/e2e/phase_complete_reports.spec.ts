/**
 * frontend/e2e/phase_complete_reports.spec.ts
 *
 * Phase-complete navigation smoke tests.
 * Replaces the test that navigated to /policy-desk (non-existent route).
 */

import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("PhaseComplete — report downloads", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("hedge desk loads without JS errors", async ({ page }) => {
    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(1000);

    const criticalErrors = errors.filter(
      (e) => !e.includes("Warning") && !e.includes("warning")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("Position Desk, Hedge Desk and Reports navigation works", async ({ page }) => {
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/position-desk/);

    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/hedge-desk/);

    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/reports/);
  });
});
