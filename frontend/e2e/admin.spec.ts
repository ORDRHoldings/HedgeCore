/**
 * e2e/admin.spec.ts
 *
 * Admin Hub E2E tests.
 * Uses demo/demo credentials (is_superuser=true).
 */
import { test, expect } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

test.describe("Admin Hub — Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/admin");
    await page.waitForSelector('button:has-text("OPERATIONS")', { timeout: 15_000 });
  });

  test("renders 8 tabs in tab bar", async ({ page }) => {
    for (const label of [
      "OPERATIONS",
      "USERS",
      "TENANTS",
      "ROLES",
      "API KEYS",
      "METRICS",
      "CONFIG",
      "DEVOPS",
    ]) {
      await expect(page.locator(`button:has-text("${label}")`).first()).toBeVisible();
    }
  });

  test("tab click updates URL — USERS", async ({ page }) => {
    await page.locator('button:has-text("USERS")').first().click();
    await expect(page).toHaveURL(/tab=users/, { timeout: 5_000 });
  });

  test("tab click updates URL — METRICS", async ({ page }) => {
    await page.locator('button:has-text("METRICS")').first().click();
    await expect(page).toHaveURL(/tab=metrics/, { timeout: 5_000 });
  });
});

test.describe("Admin Hub — Operations Tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/admin?tab=operations");
  });

  test("SERVICE STATUS section renders", async ({ page }) => {
    await expect(page.locator("text=SERVICE STATUS")).toBeVisible({ timeout: 20_000 });
  });

  test("DATABASE TABLES section renders", async ({ page }) => {
    await expect(page.locator("text=DATABASE TABLES")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Admin Hub — Users Tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/admin?tab=users");
  });

  test("renders table or empty state", async ({ page }) => {
    await page.locator("table").or(page.locator("text=No users")).first().waitFor({ timeout: 15_000 });
    const hasTable = (await page.locator("table").count()) > 0;
    const hasEmpty = (await page.locator("text=No users").count()) > 0;
    expect(hasTable || hasEmpty).toBe(true);
  });

  test("row click opens edit drawer", async ({ page }) => {
    await page.waitForSelector("table", { timeout: 15_000 });
    const rows = page.locator("tbody tr");
    const rowCount = await rows.count();
    if (rowCount > 0) {
      await rows.first().click();
      await expect(page.locator("text=EDIT USER")).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe("Admin Hub — Tenants Tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/admin?tab=tenants");
  });

  test("renders tenant list or empty state", async ({ page }) => {
    await page.locator("table").or(page.locator("text=No tenants")).first().waitFor({ timeout: 15_000 });
  });

  test("CREATE TENANT button opens modal", async ({ page }) => {
    const createBtn = page
      .locator("button")
      .filter({ hasText: /CREATE TENANT|CREATE/ })
      .first();
    await createBtn.waitFor({ timeout: 10_000 });
    await createBtn.click();
    await expect(
      page.locator("text=NEW TENANT").or(page.locator("text=Create Tenant")).first()
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
  });
});

test.describe("Admin Hub — Config Tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/admin?tab=config");
  });

  test("FEATURE FLAGS section renders", async ({ page }) => {
    await expect(page.locator("text=FEATURE FLAGS")).toBeVisible({ timeout: 15_000 });
  });

  test("MAINTENANCE MODE section renders", async ({ page }) => {
    await expect(page.locator("text=MAINTENANCE MODE").first()).toBeVisible({ timeout: 15_000 });
  });

  test("IN-MEMORY badge visible", async ({ page }) => {
    await expect(page.locator("text=IN-MEMORY").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Admin Hub — Metrics Tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/admin?tab=metrics");
  });

  test("KPI cards and period selector render", async ({ page }) => {
    await expect(
      page.locator("button:has-text('30d'), button:has-text('30D')").first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("CONVERSION FUNNEL section renders", async ({ page }) => {
    await expect(page.locator("text=CONVERSION FUNNEL")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Admin Hub — DevOps Tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/admin?tab=devops");
  });

  test("SPRINT section renders", async ({ page }) => {
    await expect(page.locator("text=SPRINT").first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Admin Hub — Auth Gate", () => {
  test("superuser can access admin hub", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/admin");
    await expect(
      page.locator('button:has-text("OPERATIONS")')
    ).toBeVisible({ timeout: 15_000 });
  });
});
