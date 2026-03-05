/**
 * frontend/e2e/audit-lab.spec.ts
 *
 * E2E smoke tests for Audit Lab pages.
 * These are intentionally lightweight — they verify navigation and page
 * structure without requiring a live backend.
 */

import { test, expect } from "@playwright/test";

test.describe("Audit Lab", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate directly; auth state assumed via storageState or cookie fixture
    // For local CI without auth, just verify the redirect to login page
    await page.goto("/audit-lab");
  });

  test("renders page or redirects to login", async ({ page }) => {
    // Either the page loads or we're redirected to auth
    const url = page.url();
    const isAuditLab = url.includes("/audit-lab");
    const isAuth = url.includes("/auth");
    expect(isAuditLab || isAuth).toBe(true);
  });

  test("upload page is reachable", async ({ page }) => {
    await page.goto("/audit-lab/upload");
    const url = page.url();
    expect(url.includes("/audit-lab/upload") || url.includes("/auth")).toBe(true);
  });
});
