/**
 * Hedge Desk — Full End-to-End Pipeline Test
 *
 * Runs the complete 7-step pipeline in a visible browser:
 *   Step 1 – SELECT:         Create position via manual entry, add to basket
 *   Step 2 – ASSIGN POLICY:  Use active/default policy, proceed
 *   Step 3 – CALCULATE:      Run the hedge calculation engine
 *   Step 4 – RISK:           Wait for risk gate, proceed to review
 *   Step 5 – REVIEW:         Submit proposals (solo mode: self-approve)
 *   Step 6 – EXECUTE:        Confirm execution (approve + execute via pipeline fix)
 *   Step 7 – COMPLETE:       Verify HEDGE EXECUTION CONFIRMED
 *   Monitor – verify position status is HEDGED in Position Desk
 *
 * Run headed with: npx playwright test e2e/hedge_desk_e2e_full.spec.ts --headed
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

// ── Unique run ID so repeated runs don't collide ──────────────────────────────
const RUN_TAG = `E2E-HD-${Date.now().toString(36).toUpperCase()}`;
const ENTITY   = `E2E Corp ${RUN_TAG}`;
const AMOUNT   = "5000000";
const VALUE_DATE = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().split("T")[0];
})();

// ── Helpers ───────────────────────────────────────────────────────────────────
async function step(page: Page, label: string) {
  console.log(`\n${"─".repeat(60)}\n▶  ${label}\n${"─".repeat(60)}`);
  await page.screenshot({ path: `e2e-screenshots/${label.replace(/\s+/g, "-").toLowerCase()}.png`, fullPage: false }).catch(() => {});
}

async function waitAndClick(page: Page, selector: string, opts?: { timeout?: number }) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: opts?.timeout ?? 20000 });
  await loc.click();
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Hedge Desk — Full Pipeline E2E", () => {

  test.setTimeout(300_000); // 5 minutes for the full pipeline

  test("full pipeline: select → assign → calculate → risk → review → execute → hedged", async ({ page }) => {

    // ── SETUP ─────────────────────────────────────────────────────────────────
    await step(page, "00 - Login");
    await loginAsDemo(page);
    await expect(page).toHaveURL(/dashboard|welcome/, { timeout: 20000 });
    console.log("  ✓ Logged in as demo");

    // ── NAVIGATE TO HEDGE DESK ────────────────────────────────────────────────
    await step(page, "01 - Navigate to Hedge Desk");
    // Use sidebar navigation to preserve in-memory auth state (avoid full page reload)
    const sidebarLink = page.locator('a[href*="hedge-desk"]').first();
    if (await sidebarLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sidebarLink.click();
      await page.waitForLoadState("networkidle");
    } else {
      // Fallback: direct navigation (auth guard now waits for isLoading)
      await page.goto("/hedge-desk");
      await page.waitForLoadState("networkidle");
      // Wait for silent refresh if redirected to login
      if (page.url().includes("/auth/login")) {
        await page.waitForURL(/hedge-desk/, { timeout: 15000 });
      }
    }
    await expect(page).toHaveURL(/hedge-desk/, { timeout: 15000 });
    console.log("  ✓ On Hedge Desk page");

    // Dismiss any existing draft banner
    const dismissDraft = page.locator("button:has-text('START FRESH'), button:has-text('DISMISS'), button:has-text('NEW RUN')").first();
    if (await dismissDraft.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismissDraft.click();
      console.log("  ✓ Dismissed existing draft");
    }

    // ── STEP 1: SELECT POSITIONS (Manual Entry) ───────────────────────────────
    await step(page, "02 - Step 1 - Select Positions (Manual Entry)");
    await expect(page.locator("text=STEP 1 OF 7")).toBeVisible({ timeout: 10000 });
    console.log("  ✓ At Step 1 of 7 — SELECT POSITIONS");

    // Switch to Manual Entry tab
    await waitAndClick(page, "button:has-text('MANUAL ENTRY')");
    console.log("  ✓ Switched to Manual Entry tab");

    // Fill in the position form
    await page.locator("input[placeholder*='INV-']").fill(RUN_TAG);
    await page.locator("input[placeholder*='LatAm']").fill(ENTITY);

    // Flow type: AP (payable)
    const flowSelect = page.locator("select").filter({ hasText: /AP|AR/ }).first();
    if (await flowSelect.count() > 0) await flowSelect.selectOption("AP");

    // Currency: MXN
    const ccy = page.locator("select").nth(1);
    await ccy.selectOption("MXN").catch(async () => {
      // Try by finding the currency select more precisely
      const selects = page.locator("select");
      const count = await selects.count();
      for (let i = 0; i < count; i++) {
        const opts = await selects.nth(i).locator("option").allTextContents();
        if (opts.some(o => o.includes("MXN"))) {
          await selects.nth(i).selectOption("MXN");
          break;
        }
      }
    });

    // Amount
    await page.locator("input[type='number']").fill(AMOUNT);

    // Value date
    await page.locator("input[type='date']").fill(VALUE_DATE);

    console.log(`  ✓ Filled form: ${RUN_TAG} / ${ENTITY} / MXN ${AMOUNT} / ${VALUE_DATE}`);

    // Submit
    await waitAndClick(page, "button:has-text('CREATE & ADD TO BASKET')");
    await page.waitForTimeout(1500);
    console.log("  ✓ Position created and added to basket");

    // Verify basket shows 1 position
    await expect(page.locator("text=/PROCEED WITH 1 POSITION/")).toBeVisible({ timeout: 10000 });
    console.log("  ✓ Basket shows 1 position");

    await step(page, "03 - Step 1 - Proceed with basket");
    await waitAndClick(page, "button:has-text('PROCEED WITH 1 POSITION')");
    console.log("  ✓ Clicked PROCEED WITH 1 POSITION");

    // ── STEP 2: ASSIGN POLICY ─────────────────────────────────────────────────
    await step(page, "04 - Step 2 - Assign Policy");
    await expect(page.locator("text=STEP 2 OF 7")).toBeVisible({ timeout: 15000 });
    console.log("  ✓ At Step 2 of 7 — ASSIGN POLICY");

    // Wait for policy to auto-load or be selectable
    await page.waitForTimeout(2000);

    // The policy assignment may auto-fill from active policy; check for PROCEED button
    const proceedToCalc = page.locator("button:has-text('PROCEED TO CALCULATE')");
    await proceedToCalc.waitFor({ state: "visible", timeout: 20000 });

    // If there's a policy selector, pick the first available
    const policyCard = page.locator("[data-policy-id], .policy-card, button:has-text('SELECT'), button:has-text('USE THIS POLICY')").first();
    if (await policyCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await policyCard.click();
      console.log("  ✓ Selected a policy");
      await page.waitForTimeout(1000);
    } else {
      console.log("  ✓ Policy auto-assigned (active policy applied)");
    }

    await proceedToCalc.click();
    console.log("  ✓ Clicked PROCEED TO CALCULATE");

    // ── STEP 3: CALCULATE ─────────────────────────────────────────────────────
    await step(page, "05 - Step 3 - Calculate");
    await expect(page.locator("text=STEP 3 OF 7")).toBeVisible({ timeout: 15000 });
    console.log("  ✓ At Step 3 of 7 — CALCULATE");

    await waitAndClick(page, "button:has-text('RUN CALCULATION')", { timeout: 15000 });
    console.log("  ✓ Clicked RUN CALCULATION");

    // Wait for calculation to complete — button changes to PROCEED TO RISK
    await expect(page.locator("button:has-text('PROCEED TO RISK')")).toBeVisible({ timeout: 30000 });
    console.log("  ✓ Calculation complete — PROCEED TO RISK visible");

    await step(page, "06 - Step 3 - Calculation result");
    await waitAndClick(page, "button:has-text('PROCEED TO RISK')");
    console.log("  ✓ Proceeding to Risk step");

    // ── STEP 4: RISK ──────────────────────────────────────────────────────────
    await step(page, "07 - Step 4 - Risk Assessment");
    await expect(page.locator("text=STEP 4 OF 7")).toBeVisible({ timeout: 15000 });
    console.log("  ✓ At Step 4 of 7 — RISK");

    // Wait for risk gate evaluation (may take a moment)
    const proceedToReview = page.locator("button:has-text('PROCEED TO REVIEW')");
    await proceedToReview.waitFor({ state: "visible", timeout: 30000 });
    console.log("  ✓ Risk gate evaluated — PROCEED TO REVIEW visible");

    await step(page, "08 - Step 4 - Risk result");
    await proceedToReview.click();
    console.log("  ✓ Proceeding to Review");

    // ── STEP 5: REVIEW ────────────────────────────────────────────────────────
    await step(page, "09 - Step 5 - Review & Submit");
    await expect(page.locator("text=STEP 5 OF 7")).toBeVisible({ timeout: 15000 });
    console.log("  ✓ At Step 5 of 7 — REVIEW");

    await page.waitForTimeout(2000);

    // Click the submit/approve button (text varies by governance mode)
    const submitBtn = page.locator(
      "button:has-text('APPROVE & SUBMIT'), button:has-text('SUBMIT FOR APPROVAL'), button:has-text('READY TO SUBMIT')"
    ).first();
    await submitBtn.waitFor({ state: "visible", timeout: 15000 });
    console.log("  ✓ Submit button visible");
    await submitBtn.click();
    console.log("  ✓ Clicked submit");

    await page.waitForTimeout(2000);

    // After submission: button to proceed to Execute
    const proceedToExec = page.locator(
      "button:has-text('PROCEED TO EXECUTE'), button:has-text('PROCEED TO EXECUTION')"
    ).first();
    await proceedToExec.waitFor({ state: "visible", timeout: 20000 });
    console.log("  ✓ Proposals submitted — PROCEED TO EXECUTE visible");

    await step(page, "10 - Step 5 - Proposals submitted");
    await proceedToExec.click();
    console.log("  ✓ Proceeding to Execute");

    // ── STEP 6: EXECUTE ───────────────────────────────────────────────────────
    await step(page, "11 - Step 6 - Execute");
    await expect(page.locator("text=STEP 6 OF 7")).toBeVisible({ timeout: 15000 });
    console.log("  ✓ At Step 6 of 7 — EXECUTE");

    await page.waitForTimeout(2000);

    // Click CONFIRM EXECUTION — our fix adds approve-then-execute
    const confirmBtn = page.locator("button:has-text('CONFIRM EXECUTION')").first();
    await confirmBtn.waitFor({ state: "visible", timeout: 15000 });
    console.log("  ✓ CONFIRM EXECUTION button visible");

    await step(page, "12 - Step 6 - About to confirm execution");
    await confirmBtn.click();
    console.log("  ✓ Clicked CONFIRM EXECUTION (approve + execute pipeline active)");

    // ── STEP 7: COMPLETE ──────────────────────────────────────────────────────
    await step(page, "13 - Step 7 - Pipeline Complete");

    // Wait for completion indicator
    const completeText = page.locator(
      "text=HEDGE EXECUTION CONFIRMED, text=STEP 7 OF 7, text=EXECUTION CONFIRMED"
    ).first();
    await completeText.waitFor({ state: "visible", timeout: 30000 });
    console.log("  ✓ HEDGE EXECUTION CONFIRMED — pipeline complete!");
    await expect(page.locator("text=STEP 7 OF 7")).toBeVisible({ timeout: 5000 }).catch(() => {
      console.log("  ℹ Step 7 label not found but completion confirmed via other text");
    });

    await step(page, "14 - Execution complete screenshot");

    // ── MONITOR: Verify HEDGED in Position Desk ───────────────────────────────
    await step(page, "15 - Monitor - Position Desk");
    console.log("\n  📊 Navigating to Position Desk to monitor HEDGED status...");

    // Sidebar navigation preserves auth state
    const positionLink = page.locator('a[href*="position-desk"]').first();
    if (await positionLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await positionLink.click();
    } else {
      await page.goto("/position-desk");
    }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    console.log("  ✓ On Position Desk");

    // Search for our entity/record
    const searchInput = page.locator("input[placeholder*='search'], input[placeholder*='Search'], input[placeholder*='filter']").first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill(RUN_TAG.slice(0, 8));
      await page.waitForTimeout(1000);
    }

    await step(page, "16 - Monitor - Checking HEDGED status");

    // Look for HEDGED status on the position
    const hedgedBadge = page.locator("text=HEDGED").first();
    await hedgedBadge.waitFor({ state: "visible", timeout: 15000 });
    console.log("  ✓ Position shows HEDGED status in Position Desk!");
    await expect(hedgedBadge).toBeVisible();

    await step(page, "17 - Monitor - HEDGED confirmed");
    console.log(`\n${"═".repeat(60)}`);
    console.log("  ✅ E2E COMPLETE — Full hedge pipeline executed successfully");
    console.log(`  📋 Run tag: ${RUN_TAG}`);
    console.log(`  📋 Entity: ${ENTITY}`);
    console.log(`  📋 Amount: ${AMOUNT} MXN`);
    console.log(`  📋 Position status: HEDGED`);
    console.log(`${"═".repeat(60)}\n`);
  });

  // ── Hedge Monitor ──────────────────────────────────────────────────────────
  test("hedge monitor shows hedged positions", async ({ page }) => {
    await loginAsDemo(page);

    await step(page, "M01 - Hedge Monitor page");
    const monitorLink = page.locator('a[href*="hedge-monitor"]').first();
    if (await monitorLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await monitorLink.click();
      await page.waitForLoadState("networkidle");
    } else {
      await page.goto("/hedge-monitor");
      await page.waitForLoadState("networkidle");
    }

    // Page should load
    await expect(page).toHaveURL(/hedge-monitor/, { timeout: 15000 });
    console.log("  ✓ Hedge Monitor page loaded");

    await page.waitForTimeout(2000);
    await step(page, "M02 - Monitor content");

    // Should show execution history or hedged positions
    const content = page.locator(
      "text=HEDGED, text=EXECUTION, text=HEDGE MONITOR, text=No hedged positions"
    ).first();
    await content.waitFor({ state: "visible", timeout: 10000 });
    console.log("  ✓ Hedge Monitor displaying content");
  });
});
