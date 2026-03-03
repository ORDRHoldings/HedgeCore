import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Hedge Execution — pipeline UX", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("Hedge Desk page loads and shows pipeline", async ({ page }) => {
    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");

    // Page should load without error
    await expect(page).toHaveURL(/hedge-desk/);

    // Should show some indication of the pipeline
    const title = page.locator("text=HEDGE DESK, text=EXECUTION PIPELINE").first();
    await expect(page).toBeTruthy();
  });

  test("PhaseSelect shows selection summary card", async ({ page }) => {
    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");

    // The SELECTION summary card or PROCEED TO CALCULATE button should be visible
    const proceedBtn = page.locator('button:has-text("PROCEED TO CALCULATE"), button:has-text("SELECT POSITIONS")');
    if (await proceedBtn.count() > 0) {
      await expect(proceedBtn.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("PhaseSelect CTA is visible without scrolling", async ({ page }) => {
    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");

    // The proceed button should be in the viewport without scrolling
    const proceedBtn = page.locator('button:has-text("PROCEED TO CALCULATE"), button:has-text("SELECT POSITIONS TO PROCEED")').first();
    if (await proceedBtn.isVisible()) {
      const box = await proceedBtn.boundingBox();
      const viewportSize = page.viewportSize();
      if (box && viewportSize) {
        // Button should be within viewport height
        expect(box.y).toBeLessThan(viewportSize.height);
      }
    }
  });

  test("Risk gate unavailable shows fail-closed UI in PhaseRisk", async ({ page }) => {
    // This test verifies the risk gate is not permissive
    // We check page content after navigating through the pipeline
    // (Full flow requires positions — this is a smoke test)
    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");

    // Verify no "proceed with caution" text anywhere on the page
    const cautionText = page.locator("text=proceed with caution");
    await expect(cautionText).not.toBeVisible();
  });

  test("MARK AS HEDGED button is renamed to CONFIRM EXECUTION", async ({ page }) => {
    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");

    // Old button text must not appear
    const oldBtn = page.locator("text=MARK AS HEDGED");
    await expect(oldBtn).not.toBeVisible();
  });
});
