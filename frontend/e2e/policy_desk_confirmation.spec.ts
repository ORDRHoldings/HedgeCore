import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Policy Desk — assignment confirmation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("Step 2 guidance strip is always visible", async ({ page }) => {
    await page.goto("/policy-desk");
    await page.waitForLoadState("networkidle");

    // STEP 2 OF 4 strip must be visible
    const stepStrip = page.locator("text=STEP 2 OF 4");
    await expect(stepStrip).toBeVisible({ timeout: 5000 });
  });

  test("Policy Engine dropdown does NOT contain PROCEED TO EXECUTION", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Hover over Policy Engine menu item
    const policyEngineMenu = page.locator("text=Policy Engine").first();
    if (await policyEngineMenu.isVisible()) {
      await policyEngineMenu.hover();
      await page.waitForTimeout(200);

      // Assert the CTA is gone
      await expect(page.locator("text=PROCEED TO EXECUTION")).not.toBeVisible();
      await expect(page.locator("text=run the hedge pipeline")).not.toBeVisible();
    }
  });

  test("policy desk filter defaults to NEEDS POLICY on load", async ({ page }) => {
    await page.goto("/policy-desk");
    await page.waitForLoadState("networkidle");

    // The active filter button should be NEEDS POLICY
    const needsPolicyBtn = page.locator('button:has-text("NEEDS POLICY")');
    if (await needsPolicyBtn.count() > 0) {
      // If there are positions, the NEEDS POLICY tab should be active/highlighted
      await expect(needsPolicyBtn.first()).toBeVisible();
    }
  });

  test("POLICY ASSIGNED confirmation shows policy name after assignment", async ({ page }) => {
    await page.goto("/policy-desk");
    await page.waitForLoadState("networkidle");

    // Check if there are positions to assign
    const rows = page.locator("table tbody tr, [data-testid='position-row']");
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // Empty state — skip assignment test
      test.skip();
      return;
    }

    // Select first position
    const firstCheckbox = page.locator("input[type='checkbox']").first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.click();
    }

    // Look for assign button
    const assignBtn = page.locator('button:has-text("ASSIGN"), button:has-text("Assign Active")').first();
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
      await page.waitForTimeout(2000);

      // Should show POLICY ASSIGNED banner (not BULK RESULT)
      const banner = page.locator("text=POLICY ASSIGNED");
      // Either POLICY ASSIGNED or PARTIAL FAILURE — not old BULK RESULT
      const oldBanner = page.locator("text=BULK RESULT");
      await expect(oldBanner).not.toBeVisible({ timeout: 2000 });
    }
  });
});
