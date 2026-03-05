/**
 * frontend/e2e/decision-desk.spec.ts
 *
 * E2E smoke tests for Decision Desk pages.
 */

import { test, expect } from "@playwright/test";

test.describe("Decision Desk", () => {
  test("renders page or redirects to login", async ({ page }) => {
    await page.goto("/decision-desk");
    const url = page.url();
    const isDecisionDesk = url.includes("/decision-desk");
    const isAuth = url.includes("/auth");
    expect(isDecisionDesk || isAuth).toBe(true);
  });

  test("run detail page is reachable with valid UUID", async ({ page }) => {
    const fakeRunId = "00000000-0000-0000-0000-000000000001";
    await page.goto(`/decision-desk/runs/${fakeRunId}`);
    const url = page.url();
    expect(url.includes("/decision-desk") || url.includes("/auth")).toBe(true);
  });
});
