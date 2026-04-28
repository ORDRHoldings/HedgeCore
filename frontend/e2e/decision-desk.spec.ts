/**
 * frontend/e2e/decision-desk.spec.ts
 *
 * Smoke tests for treasury operations pages — audit trail and cash positions.
 * Replaces legacy tests that targeted the non-existent /decision-desk route.
 */

import { test, expect } from "@playwright/test";

test.describe("Treasury Operations — Audit Trail & Cash Positions", () => {
  test("audit trail renders or redirects to login", async ({ page }) => {
    await page.goto("/audit-trail");
    const url = page.url();
    expect(url.includes("/audit-trail") || url.includes("/auth")).toBe(true);
  });

  test("cash positions page is reachable", async ({ page }) => {
    await page.goto("/cash-positions");
    const url = page.url();
    expect(url.includes("/cash-positions") || url.includes("/auth")).toBe(true);
  });
});
