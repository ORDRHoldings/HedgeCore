/**
 * E2E: Theme System — persistence, URL switching, contrast, accessibility.
 */
import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function mockAuth(page: Page) {
  await page.addInitScript(() => {
    const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJlbWFpbCI6InRlc3RAb3Jkci5jb20iLCJleHAiOjk5OTk5OTk5OTksInJvbGUiOiJhZG1pbiJ9.fake";
    localStorage.setItem("ordr_access_token", fakeToken);
    localStorage.setItem("ordr_refresh_token", "fake-refresh");
    localStorage.setItem("ordr_user", JSON.stringify({
      id: "test-user-id", email: "test@ordr.com", role: "admin", company_id: "test-company",
    }));
  });
  await page.route("**/auth/refresh", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "fake", user: { id: "test-user-id", email: "test@ordr.com", role: "admin" } }) })
  );
  await page.route("**/v1/company/settings", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ governance_mode: "solo", name: "Test Co", slug: "test-co" }) })
  );
  await page.route("**/v1/ui/**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ show_quickstart: false }) })
  );
}

test.describe("Theme Persistence", () => {
  test("theme survives page reload via localStorage", async ({ page }) => {
    await mockAuth(page);

    // Set theme via localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem("ordr_appearance", JSON.stringify({
        themeId: "institutional-obsidian",
        modeOverride: "dark",
        accentId: "ruddy-blue",
        density: "compact",
        uiFont: "IBM Plex Sans",
        numericFont: "IBM Plex Mono",
        baseFontSize: 13,
        tabularNumerals: true,
        reducedMotion: false,
        highContrast: false,
        colorPlusIcon: true,
        templateId: "trading-floor",
      }));
    });

    await page.goto(`${BASE}/settings?tab=appearance`);
    await page.waitForTimeout(1500);

    // Verify bg-deep is Obsidian (#121212)
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim()
    );
    expect(bg).toBe("#121212");

    // Reload and verify persistence
    await page.reload();
    await page.waitForTimeout(1500);

    const bgAfter = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim()
    );
    expect(bgAfter).toBe("#121212");
  });

  test("density persists after reload", async ({ page }) => {
    await mockAuth(page);
    await page.addInitScript(() => {
      localStorage.setItem("ordr_appearance", JSON.stringify({
        themeId: "ordr-default",
        modeOverride: "dark",
        accentId: "ruddy-blue",
        density: "spacious",
        uiFont: "IBM Plex Sans",
        numericFont: "IBM Plex Mono",
        baseFontSize: 14,
        tabularNumerals: true,
        reducedMotion: false,
        highContrast: false,
        colorPlusIcon: true,
        templateId: null,
      }));
    });

    await page.goto(BASE);
    await page.waitForTimeout(1000);

    const scale = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--density-scale").trim()
    );
    expect(scale).toBe("1.2");
  });
});

test.describe("URL Theme Switching", () => {
  test("?theme= param applies theme from URL", async ({ page }) => {
    await page.goto(`${BASE}?theme=executive-clarity`);
    await page.waitForTimeout(1500);

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim()
    );
    expect(bg).toBe("#F4F6F9");
  });

  test("?theme=X&variant=Y sets both", async ({ page }) => {
    await page.goto(`${BASE}?theme=algorithmic-slate&variant=dark`);
    await page.waitForTimeout(1500);

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim()
    );
    expect(bg).toBe("#2E2E2E");

    const variant = await page.evaluate(() =>
      document.documentElement.getAttribute("data-variant")
    );
    expect(variant).toBe("dark");
  });

  test("invalid theme param falls back to stored/default", async ({ page }) => {
    await page.goto(`${BASE}?theme=nonexistent`);
    await page.waitForTimeout(1500);

    // Should fall back to ordr-default
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim()
    );
    expect(bg).toBe("#111827");
  });
});

test.describe("Data Attributes", () => {
  test("html has data-theme attribute", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1000);

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme).toBeTruthy();
  });

  test("html has data-variant attribute", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1000);

    const variant = await page.evaluate(() =>
      document.documentElement.getAttribute("data-variant")
    );
    expect(["dark", "light"]).toContain(variant);
  });

  test("data-density reflects setting", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("ordr_appearance", JSON.stringify({
        themeId: "ordr-default", modeOverride: "dark", accentId: "ruddy-blue",
        density: "compact", uiFont: "IBM Plex Sans", numericFont: "IBM Plex Mono",
        baseFontSize: 13, tabularNumerals: true, reducedMotion: false,
        highContrast: false, colorPlusIcon: true, templateId: null,
      }));
    });
    await page.goto(BASE);
    await page.waitForTimeout(1000);

    const density = await page.evaluate(() =>
      document.documentElement.getAttribute("data-density")
    );
    expect(density).toBe("compact");
  });
});

test.describe("Contrast Validation", () => {
  test("themes.json is accessible", async ({ page }) => {
    const res = await page.goto(`${BASE}/themes.json`);
    expect(res?.status()).toBe(200);
    const json = await res?.json();
    expect(json.presets).toBeDefined();
    expect(Object.keys(json.presets).length).toBe(4);
  });

  test("tokens.css is accessible", async ({ page }) => {
    const res = await page.goto(`${BASE}/tokens.css`);
    expect(res?.status()).toBe(200);
    const text = await res?.text();
    expect(text).toContain("data-theme");
    expect(text).toContain("--bg-deep");
  });

  test("all theme presets have valid text contrast", async ({ page }) => {
    const res = await page.goto(`${BASE}/themes.json`);
    const json = await res?.json();

    function hexToRgb(hex: string): [number,number,number] {
      const h = hex.replace("#","");
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    }
    function lum(hex: string): number {
      const [r,g,b] = hexToRgb(hex).map(c => { const s=c/255; return s<=0.04045?s/12.92:Math.pow((s+0.055)/1.055,2.4); });
      return 0.2126*r+0.7152*g+0.0722*b;
    }
    function ratio(a: string, b: string): number {
      const l1=lum(a), l2=lum(b);
      return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    }

    for (const [id, preset] of Object.entries(json.presets) as [string, any][]) {
      const c = preset.colors;
      // text-primary on bg-deep must pass AA (4.5:1)
      const r = ratio(c.textPrimary, c.bgDeep);
      expect(r, `${id}: text-primary on bg-deep = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test.describe("Accessibility", () => {
  test("skip-to-content link exists", async ({ page }) => {
    await page.goto(BASE);
    const skip = page.locator("a[href='#main-content']");
    await expect(skip).toBeAttached();
  });

  test("main-content landmark exists", async ({ page }) => {
    await page.goto(BASE);
    const main = page.locator("#main-content");
    await expect(main).toBeAttached();
  });

  test("focus ring uses accent color", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(500);

    const outline = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return style.getPropertyValue("--accent-blue").trim();
    });
    expect(outline).toBeTruthy();
    expect(outline).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

test.describe("OG Meta Tags", () => {
  test("has og:title", async ({ page }) => {
    await page.goto(BASE);
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
    expect(ogTitle).toContain("ORDR Terminal");
  });

  test("has og:description", async ({ page }) => {
    await page.goto(BASE);
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute("content");
    expect(ogDesc).toBeTruthy();
    expect(ogDesc!.length).toBeGreaterThan(20);
  });

  test("has og:image", async ({ page }) => {
    await page.goto(BASE);
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogImage).toContain("og-image");
  });

  test("has twitter:card", async ({ page }) => {
    await page.goto(BASE);
    const card = await page.locator('meta[name="twitter:card"]').getAttribute("content");
    expect(card).toBe("summary_large_image");
  });
});
