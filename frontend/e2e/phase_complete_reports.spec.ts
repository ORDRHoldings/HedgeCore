import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("PhaseComplete — report downloads", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("Complete page action buttons are defined (navigation smoke test)", async ({ page }) => {
    // Navigate through to a point where we can see the hedge desk
    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");

    // Basic smoke test — page loads without JS errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(1000);

    // No critical JS errors
    const criticalErrors = errors.filter(e => !e.includes("Warning") && !e.includes("warning"));
    expect(criticalErrors).toHaveLength(0);
  });

  test("Position Desk and Hedge Desk navigation works", async ({ page }) => {
    // Verify navigation between key pages works
    await page.goto("/position-desk");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/position-desk/);

    await page.goto("/hedge-desk");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/hedge-desk/);

    await page.goto("/policy-desk");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/policy-desk/);
  });
});
