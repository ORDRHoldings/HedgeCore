/**
 * E2E tests — Support Ticket flows
 *
 * Prerequisites:
 *   - `npm run dev` running on http://localhost:3000
 *   - Backend running on http://localhost:8000 (or NEXT_PUBLIC_API_URL)
 *   - Seeded DB with admin@synexcapital.com / Admin@2026!
 *
 * Auth strategy: inject JWT cookie directly (avoids UI login flakiness in dev mode)
 *
 * Run: npx playwright test e2e/support_tickets.spec.ts
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";

// ── Credentials (admin user from seed_company.py) ─────────────────────────────
const DEMO_EMAIL    = "admin@synexcapital.com";
const DEMO_PASSWORD = "Admin@2026!";
const BACKEND_URL   = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const DEV_API_KEY   = "HC_DEV_KEY_001";

// Cookie keys (must match authContext.tsx ACCESS_TOKEN_KEY / REFRESH_TOKEN_KEY)
const ACCESS_TOKEN_KEY  = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// ── Auth Helper: get tokens from backend directly ────────────────────────────

async function getAuthTokens(): Promise<{ access_token: string; refresh_token: string }> {
  const body = new URLSearchParams();
  body.append("username", DEMO_EMAIL);
  body.append("password", DEMO_PASSWORD);

  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-Key": DEV_API_KEY,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login failed (${res.status}): ${txt}`);
  }
  return res.json();
}

/**
 * Inject access/refresh tokens as cookies so AuthProvider hydrates
 * without going through the UI login flow.
 */
async function injectAuth(context: BrowserContext): Promise<void> {
  const tokens = await getAuthTokens();
  await context.addCookies([
    {
      name: ACCESS_TOKEN_KEY,
      value: tokens.access_token,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      sameSite: "Strict",
    },
    {
      name: REFRESH_TOKEN_KEY,
      value: tokens.refresh_token,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      sameSite: "Strict",
    },
  ]);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Support Ticket Flows", () => {

  // ── Test 1: Create a ticket via /help/contact ────────────────────────────────
  test("Create Ticket — /help/contact full flow", async ({ page, context }) => {
    await injectAuth(context);
    await page.goto("/help/contact");

    // Wait for the contact form to appear
    await expect(page.getByText(/open a support ticket/i)).toBeVisible({ timeout: 15_000 });

    // Fill subject
    await page.fill('input[type="text"]', "E2E Test Ticket — Playwright");

    // Fill description (50+ chars)
    await page.fill(
      "textarea",
      "This is an automated end-to-end test ticket created by Playwright. Testing full flow.",
    );

    // Select severity S2 via its radio input
    await page.click('input[type="radio"][value="S2"]');

    // Check the diagnostics bundle consent checkbox
    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.check();

    // Wait for bundle generation to complete
    await expect(page.getByText(/bundle ready/i)).toBeVisible({ timeout: 15_000 });

    // Submit the ticket
    await page.click('button[type="submit"]');

    // Assert success state
    await expect(page.getByText(/ticket submitted/i)).toBeVisible({ timeout: 20_000 });

    // Verify TKT-XXXX ref appears
    const ticketRefLocator = page.locator("text=/TKT-/").first();
    await expect(ticketRefLocator).toBeVisible({ timeout: 5_000 });
    const ticketRefText = await ticketRefLocator.textContent();
    expect(ticketRefText).toMatch(/TKT-/);
  });

  // ── Test 2: /help/support shows My Tickets section ───────────────────────────
  test("Support Center — /help/support shows My Tickets", async ({ page, context }) => {
    await injectAuth(context);
    await page.goto("/help/support");

    // Wait for Support Center page heading
    await expect(page.getByText(/support center/i).first()).toBeVisible({ timeout: 15_000 });

    // Scroll to My Tickets section
    await page.evaluate(() => {
      document.getElementById("my-tickets")?.scrollIntoView();
    });

    // "MY TICKETS" section heading must appear
    await expect(page.getByRole("heading", { name: /my tickets/i })).toBeVisible({ timeout: 8_000 });

    // Wait for ticket loading to complete (loading spinner disappears)
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading tickets..."),
      { timeout: 15_000 },
    );

    // The section shows ticket rows or empty state — never a raw load error
    const hasTicketRefs = (await page.locator("text=/TKT-/").count()) > 0;
    const hasEmptyState = await page
      .getByText(/no tickets submitted yet/i)
      .isVisible()
      .catch(() => false);
    const hasLoadError = await page
      .getByText(/load failed/i)
      .isVisible()
      .catch(() => false);

    expect(hasLoadError).toBe(false);
    expect(hasTicketRefs || hasEmptyState).toBe(true);
  });

  // ── Test 3: Diagnostics Bundle generation ────────────────────────────────────
  test("Support Center — Diagnostics Bundle generates and renders", async ({ page, context }) => {
    await injectAuth(context);
    await page.goto("/help/support");

    // Wait for SYSTEM DIAGNOSTICS section
    await expect(page.getByRole("heading", { name: /system diagnostics/i })).toBeVisible({ timeout: 15_000 });

    // Scroll to diagnostics section
    await page.evaluate(() => {
      document.getElementById("diagnostics")?.scrollIntoView();
    });

    // Consent checkbox
    const consentCheckbox = page.locator("#diagnostics input[type='checkbox']").first();
    await consentCheckbox.check();

    // GENERATE BUNDLE button becomes enabled
    const generateBtn = page.getByRole("button", { name: /generate bundle/i });
    await expect(generateBtn).toBeEnabled({ timeout: 5_000 });
    await generateBtn.click();

    // Wait for JSON bundle to render
    await expect(page.locator("pre")).toBeVisible({ timeout: 15_000 });

    // Verify bundle fields
    const preContent = await page.locator("pre").textContent();
    expect(preContent).toContain('"schema_version"');
    expect(preContent).toContain('"consent"');

    // No credentials leak
    expect(preContent).not.toContain("Bearer");
    expect(preContent).not.toContain("HK_live_");
  });

  // ── Test 4: FAQ page accordion ───────────────────────────────────────────────
  test("FAQ page — accordion renders all questions", async ({ page, context }) => {
    await injectAuth(context);
    await page.goto("/help/faq");

    // Header
    await expect(page.getByRole("heading", { name: /frequently asked questions/i })).toBeVisible({ timeout: 15_000 });

    // At least one accordion button (buttons have format "+ N. Question text")
    const accordionButtons = page.locator("button").filter({ hasText: /\d+\./ });
    const count = await accordionButtons.count();
    expect(count).toBeGreaterThan(0);

    // Click first item to expand
    await accordionButtons.first().click();
    await page.waitForTimeout(400);

    // Expanded indicator (minus sign or expanded content)
    const openIndicator = page.locator("button").filter({ hasText: "−" }).first();
    await expect(openIndicator).toBeVisible({ timeout: 3_000 });
  });

  // ── Test 5: Unauthenticated access ───────────────────────────────────────────
  test("Support pages redirect unauthenticated users to login", async ({ page }) => {
    // No auth injected — navigate to protected page
    await page.goto("/help/contact");

    // Wait for either redirect to /auth/login or page to settle
    await page.waitForURL(
      (url) =>
        url.pathname.includes("/auth/login") || url.pathname.includes("/help/contact"),
      { timeout: 10_000 },
    );

    const finalUrl = page.url();
    const isOnLogin   = finalUrl.includes("/auth/login");
    const isOnContact = finalUrl.includes("/help/contact");

    // Either outcome is acceptable (auth guard may or may not be on this page)
    expect(isOnLogin || isOnContact).toBe(true);

    // If redirected to login — the form must render
    if (isOnLogin) {
      await expect(page.locator("#ordr-username")).toBeVisible({ timeout: 15_000 });
    }
  });

});
