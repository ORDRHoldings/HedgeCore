/**
 * E2E: Appearance & UX Settings — template selection + CSS variable persistence.
 */
import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

/** Inject auth tokens so the app thinks we're logged in. */
async function mockAuth(page: Page) {
  await page.addInitScript(() => {
    const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJlbWFpbCI6InRlc3RAb3Jkci5jb20iLCJleHAiOjk5OTk5OTk5OTksInJvbGUiOiJhZG1pbiJ9.fake";
    localStorage.setItem("ordr_access_token", fakeToken);
    localStorage.setItem("ordr_refresh_token", "fake-refresh");
    localStorage.setItem("ordr_user", JSON.stringify({
      id: "test-user-id",
      email: "test@ordr.com",
      role: "admin",
      company_id: "test-company",
    }));
  });

  // Mock auth refresh to prevent redirect
  await page.route("**/auth/refresh", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "fake", user: { id: "test-user-id", email: "test@ordr.com", role: "admin" } }) })
  );

  // Mock company settings
  await page.route("**/v1/company/settings", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ governance_mode: "solo", name: "Test Co", slug: "test-co" }) })
  );

  // Mock UI prefs
  await page.route("**/v1/ui/prefs", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ show_quickstart: false, quickstart_dismissed_at: null }) })
  );

  // Mock appearance prefs
  await page.route("**/v1/ui/appearance", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      theme_id: "ordr-default", mode_override: "dark", accent_id: "ruddy-blue",
      density: "standard", ui_font: "IBM Plex Sans", numeric_font: "IBM Plex Mono",
      base_font_size: 13, tabular_numerals: true, reduced_motion: false,
      high_contrast: false, color_plus_icon: true, template_id: null,
    }) })
  );
}

test.describe("Appearance & UX Settings", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test("navigates to appearance tab via URL", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    // Check the tab is active — look for "Appearance" text in the tab bar
    const tab = page.locator("button", { hasText: "Appearance" });
    await expect(tab).toBeVisible();
  });

  test("displays template cards", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    // All 3 templates should be visible
    await expect(page.locator("text=Trading Floor")).toBeVisible();
    await expect(page.locator("text=Treasury Ops")).toBeVisible();
    await expect(page.locator("text=Executive Review")).toBeVisible();
  });

  test("displays theme presets", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    await expect(page.locator("text=ORDR Default")).toBeVisible();
    await expect(page.locator("text=Institutional Obsidian")).toBeVisible();
    await expect(page.locator("text=Algorithmic Slate")).toBeVisible();
    await expect(page.locator("text=Executive Clarity")).toBeVisible();
  });

  test("displays live preview pane", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    // Preview should show KPI, table, alerts
    await expect(page.locator("text=LIVE PREVIEW")).toBeVisible();
  });

  test("selecting a template updates CSS variables", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    // Get initial bg-deep
    const initialBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim()
    );

    // Click Executive Review template (light theme)
    await page.locator("text=Executive Review").first().click();
    await page.waitForTimeout(500);

    // bg-deep should change to a light value
    const newBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim()
    );

    // The value should have changed (Executive Clarity uses #F4F6F9)
    expect(newBg).not.toBe(initialBg);
    expect(newBg).toBe("#F4F6F9");
  });

  test("template selection persists in localStorage", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    // Click Trading Floor template
    await page.locator("text=Trading Floor").first().click();
    await page.waitForTimeout(500);

    // Check localStorage
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("ordr_appearance");
      return raw ? JSON.parse(raw) : null;
    });

    expect(stored).not.toBeNull();
    expect(stored.templateId).toBe("trading-floor");
    expect(stored.themeId).toBe("institutional-obsidian");
    expect(stored.density).toBe("compact");
  });

  test("settings persist after page reload", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    // Set to Trading Floor
    await page.locator("text=Trading Floor").first().click();
    await page.waitForTimeout(500);

    // Reload
    await page.reload();
    await page.waitForTimeout(1500);

    // bg-deep should still be Institutional Obsidian (#121212)
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim()
    );
    expect(bg).toBe("#121212");
  });

  test("density toggle updates CSS variable", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    // Click Compact density
    await page.locator("button", { hasText: "Compact" }).click();
    await page.waitForTimeout(300);

    const scale = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--density-scale").trim()
    );
    expect(scale).toBe("0.85");
  });

  test("reduced motion adds CSS class", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    // Toggle reduced motion on by clicking Trading Floor (which has it ON)
    await page.locator("text=Trading Floor").first().click();
    await page.waitForTimeout(500);

    const hasClass = await page.evaluate(() =>
      document.documentElement.classList.contains("ordr-reduced-motion")
    );
    expect(hasClass).toBe(true);
  });

  test("curated accent colors shown (4 options)", async ({ page }) => {
    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1000);

    await expect(page.locator("text=Ruddy Blue")).toBeVisible();
    await expect(page.locator("text=Violet")).toBeVisible();
    await expect(page.locator("text=Emerald")).toBeVisible();
    await expect(page.locator("text=Amber")).toBeVisible();
  });
});
