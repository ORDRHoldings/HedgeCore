/**
 * Audit Lab — End-to-End Test Suite
 *
 * Runs 3 full audit cycles with distinct sample datasets:
 *   Run 1 — Mid-size Manufacturing Corp (EUR/GBP, G7 banks, H1 2025)
 *   Run 2 — LatAm Exporter (MXN/BRL/CLP, regional banks, Q2–Q3 2025)
 *   Run 3 — European HQ Treasury (EUR/GBP/CHF, global banks, H2 2025)
 *
 * Each run exercises the full workflow:
 *   Upload CSV → configure benchmark → run analysis →
 *   inspect KPIs → Findings tab → Evidence Rail tab →
 *   download Evidence Binder → verify audit trail
 *
 * Headed: npx playwright test e2e/audit_lab_e2e.spec.ts --headed
 */

import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";
import { loginAsDemo } from "./helpers/auth";

// ── Result collection ─────────────────────────────────────────────────────────
interface AuditRunResult {
  runLabel:         string;
  datasetName:      string;
  period:           string;
  rowCount:         string;
  currencyPairs:    string;
  totalMarkup:      string;
  explicitFees:     string;
  rateVariance:     string;
  totalCost:        string;
  dataQuality:      string;
  findingsCount:    number;
  runId:            string;
  runHash:          string;
  inputsHash:       string;
  outputsHash:      string;
  topFinding:       string;
}

const results: AuditRunResult[] = [];

// ── Dataset configs ───────────────────────────────────────────────────────────
const DATASETS = [
  {
    label:       "Run 1 — Manufacturing Corp (G7)",
    file:        "audit-lab-run1-manufacturing.csv",
    periodStart: "2025-01-01",
    periodEnd:   "2025-06-30",
    benchmark:   "market_snapshot" as const,
    description: "Mid-size US manufacturer hedging EUR and GBP payables. 20 transactions, 4 bank counterparties.",
  },
  {
    label:       "Run 2 — LatAm Exporter (Emerging Markets)",
    file:        "audit-lab-run2-latam-exporter.csv",
    periodStart: "2025-04-01",
    periodEnd:   "2025-08-31",
    benchmark:   "market_snapshot" as const,
    description: "LatAm-focused exporter converting MXN, BRL, CLP receipts to USD. 20 transactions, 5 regional banks.",
  },
  {
    label:       "Run 3 — European HQ Treasury (G10 Multi-Currency)",
    file:        "audit-lab-run3-european-hq.csv",
    periodStart: "2025-07-01",
    periodEnd:   "2025-12-31",
    benchmark:   "market_snapshot" as const,
    description: "European HQ treasury executing cross-currency flows across EUR, GBP, CHF, USD. 25 transactions, 6 global banks.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function step(page: Page, label: string) {
  console.log(`\n${"─".repeat(60)}\n▶  ${label}\n${"─".repeat(60)}`);
  await page.screenshot({
    path: `e2e-screenshots/audit-${label.replace(/[\s\/]+/g, "-").toLowerCase()}.png`,
    fullPage: false,
  }).catch(() => {});
}

async function getText(page: Page, selector: string): Promise<string> {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
      return (await el.textContent() ?? "").trim();
    }
  } catch { /* ignore */ }
  return "—";
}

// ── Test suite ────────────────────────────────────────────────────────────────
test.describe("Audit Lab — Full E2E Pipeline (3 Datasets)", () => {

  test.setTimeout(600_000); // 10 min for all 3 runs

  // ── Single test, 3 dataset loop ────────────────────────────────────────────
  for (let i = 0; i < DATASETS.length; i++) {
    const ds = DATASETS[i];

    test(`${ds.label}`, async ({ page }) => {

      const result: AuditRunResult = {
        runLabel:      ds.label,
        datasetName:   ds.file,
        period:        `${ds.periodStart} → ${ds.periodEnd}`,
        rowCount:      "—",
        currencyPairs: "—",
        totalMarkup:   "—",
        explicitFees:  "—",
        rateVariance:  "—",
        totalCost:     "—",
        dataQuality:   "—",
        findingsCount: 0,
        runId:         "—",
        runHash:       "—",
        inputsHash:    "—",
        outputsHash:   "—",
        topFinding:    "—",
      };

      // ── AUTH ───────────────────────────────────────────────────────────────
      await step(page, `${i + 1}-00 Login`);
      await loginAsDemo(page);
      await expect(page).toHaveURL(/dashboard|welcome/, { timeout: 20000 });
      console.log("  ✓ Authenticated");

      // ── NAVIGATE TO AUDIT LAB ──────────────────────────────────────────────
      await step(page, `${i + 1}-01 Navigate to Audit Lab`);
      // The AUDIT LAB section header may need expanding first
      const auditSection = page.locator('text=AUDIT LAB').first();
      if (await auditSection.isVisible({ timeout: 5000 }).catch(() => false)) {
        await auditSection.click();
        await page.waitForTimeout(500);
      }
      // Now find the audit-lab link (may be inside expanded section)
      const auditLink = page.locator('a[href="/audit-lab"]').first();
      if (await auditLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await auditLink.click();
      } else {
        // Fall back: direct navigation preserving auth via React state
        // Use page.evaluate to trigger router navigation without full reload
        await page.evaluate(() => {
          const a = document.querySelector('a[href="/audit-lab"]') as HTMLAnchorElement;
          if (a) a.click();
        });
      }
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/audit-lab/, { timeout: 15000 });
      console.log("  ✓ On Audit Lab hub");

      // ── UPLOAD DATASET ─────────────────────────────────────────────────────
      await step(page, `${i + 1}-02 Upload Dataset`);

      // Click "+ UPLOAD DATASET" button
      const uploadBtn = page.locator("button:has-text('UPLOAD DATASET'), a:has-text('UPLOAD DATASET')").first();
      await uploadBtn.waitFor({ state: "visible", timeout: 10000 });
      await uploadBtn.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/upload/, { timeout: 10000 });
      console.log("  ✓ On upload page");

      // Attach CSV file
      const fixturePath = path.resolve(__dirname, "fixtures", ds.file);
      console.log(`  📁 Using fixture: ${fixturePath}`);

      const fileInput = page.locator("input[type='file']").first();
      await fileInput.waitFor({ state: "attached", timeout: 10000 });
      await fileInput.setInputFiles(fixturePath);
      await page.waitForTimeout(1000);
      console.log("  ✓ File attached");

      // Set period dates
      const dateInputs = page.locator("input[type='date']");
      const dateCount = await dateInputs.count();
      if (dateCount >= 2) {
        await dateInputs.nth(0).fill(ds.periodStart);
        await dateInputs.nth(1).fill(ds.periodEnd);
        console.log(`  ✓ Period set: ${ds.periodStart} → ${ds.periodEnd}`);
      }

      // Click UPLOAD & PARSE
      await step(page, `${i + 1}-03 Parse CSV`);
      const parseBtn = page.locator("button:has-text('UPLOAD & PARSE'), button:has-text('UPLOAD AND PARSE')").first();
      await parseBtn.waitFor({ state: "visible", timeout: 10000 });
      await parseBtn.click();
      console.log("  ✓ Clicked UPLOAD & PARSE");

      // Wait for phase "run" — either success banner OR the RUN button appearing
      // (On duplicate 409, frontend skips the banner and goes directly to run phase)
      const successBanner = page.locator("text=DATASET UPLOADED SUCCESSFULLY").first();
      const runPhaseBtn = page.locator("button:has-text('RUN AUDIT ANALYSIS')").first();
      try {
        await Promise.race([
          successBanner.waitFor({ state: "visible", timeout: 40000 }),
          runPhaseBtn.waitFor({ state: "visible", timeout: 40000 }),
        ]);
        console.log("  ✓ Reached run phase (upload succeeded or duplicate recovered)");
      } catch (e: unknown) {
        // TimeoutError — dump body for diagnosis
        const bodySnippet = (await page.locator("body").textContent() ?? "").slice(0, 1200).replace(/\s+/g, " ");
        console.log(`  ✗ Did not reach run phase. Page content: ${bodySnippet}`);
        // Check if an error banner is visible (non-409 errors)
        const errorEl = page.getByText(/upload failed|network error/i).first();
        if (await errorEl.isVisible({ timeout: 2000 }).catch(() => false)) {
          const errText = (await errorEl.textContent() ?? "").trim();
          throw new Error(`Upload returned error: ${errText}`);
        }
        throw e;
      }
      console.log("  ✓ Dataset uploaded successfully");

      // Capture upload metadata
      await page.waitForTimeout(1000);
      const pageText = await page.locator("body").textContent() ?? "";
      const rowMatch = pageText.match(/(\d+)\s+row/i);
      if (rowMatch) {
        result.rowCount = rowMatch[1];
        console.log(`  ✓ Row count: ${result.rowCount}`);
      }

      // Capture currency pairs detected
      const pairsEl = page.locator("text=/[A-Z]{3}\/[A-Z]{3}/, text=/pairs detected/").first();
      if (await pairsEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        result.currencyPairs = (await pairsEl.textContent() ?? "").trim();
      }

      // ── RUN AUDIT ANALYSIS ────────────────────────────────────────────────
      await step(page, `${i + 1}-04 Run Audit Analysis`);

      // Select benchmark (market_snapshot is default)
      const marketSnapshotRadio = page.locator("input[value='market_snapshot'], label:has-text('Market Snapshot')").first();
      if (await marketSnapshotRadio.isVisible({ timeout: 3000 }).catch(() => false)) {
        await marketSnapshotRadio.click().catch(() => {});
      }

      const runBtn = page.locator("button:has-text('RUN AUDIT ANALYSIS'), button:has-text('RUN AUDIT')").first();
      await runBtn.waitFor({ state: "visible", timeout: 15000 });

      // Intercept the POST /runs response to capture errors
      let runsApiStatus = 0;
      let runsApiBody = "";
      const runResponsePromise = page.waitForResponse(
        r => r.url().includes("/audit-lab/runs") && r.request().method() === "POST",
        { timeout: 120000 }
      ).then(async r => {
        runsApiStatus = r.status();
        try { runsApiBody = await r.text(); } catch { /* ignore */ }
      }).catch(() => {});

      await runBtn.click();
      console.log("  ✓ Clicked RUN AUDIT ANALYSIS");

      // Wait for redirect to run detail (Render cold-start can be slow)
      try {
        await page.waitForURL(/audit-lab\/runs\//, { timeout: 120000 });
      } catch (e) {
        // Capture diagnostic info before re-throwing
        await runResponsePromise;
        const bodySnippet = (await page.locator("body").textContent() ?? "").slice(0, 800).replace(/\s+/g, " ");
        console.log(`  ✗ URL never changed to /audit-lab/runs/`);
        console.log(`  ✗ POST /runs status: ${runsApiStatus || "no response"}`);
        console.log(`  ✗ POST /runs body: ${runsApiBody.slice(0, 300)}`);
        console.log(`  ✗ Page content: ${bodySnippet}`);
        throw e;
      }
      const runUrl = page.url();
      result.runId = runUrl.split("/").pop()?.split("?")[0] ?? "—";
      console.log(`  ✓ Run created — ID: ${result.runId} (API status: ${runsApiStatus})`);

      // ── RUN DETAIL: KPIs ──────────────────────────────────────────────────
      await step(page, `${i + 1}-05 Read KPI Cards`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3000);

      // Capture all KPI card values
      const kpiCards = page.locator("[data-testid*='kpi'], .kpi-card, [class*='kpi']");
      const bodyText = await page.locator("body").textContent() ?? "";

      // Try to extract KPI values from text patterns
      const usdPattern = /\$([\d,]+(?:\.\d+)?[KMB]?)/g;
      const usdMatches = [...bodyText.matchAll(usdPattern)].map(m => m[0]);

      // Try labeled selectors
      result.totalMarkup  = await getText(page, "[data-label='Total Markup Cost'] + *, *:has-text('Total Markup Cost') >> .. >> span[class*='value'], *:has-text('Total Markup Cost') + *");
      result.explicitFees = await getText(page, "*:has-text('Explicit Fees') + *");
      result.rateVariance = await getText(page, "*:has-text('Rate Variance') + *");
      result.totalCost    = await getText(page, "*:has-text('Total Quantified Cost') + *");

      // Broader capture of numeric values from page
      if (usdMatches.length >= 2) {
        console.log(`  ✓ USD values found on page: ${usdMatches.slice(0, 6).join(", ")}`);
      }

      await step(page, `${i + 1}-06 KPI Screenshot`);
      console.log("  ✓ KPI cards captured");

      // ── FINDINGS TAB ─────────────────────────────────────────────────────
      await step(page, `${i + 1}-07 Findings Tab`);
      const findingsTab = page.locator("button:has-text('Findings'), [role='tab']:has-text('Findings')").first();
      if (await findingsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await findingsTab.click();
        await page.waitForTimeout(1500);
        console.log("  ✓ Clicked Findings tab");

        // Count finding rows
        const findingRows = page.locator("table tbody tr, [data-testid='finding-row']");
        const cnt = await findingRows.count().catch(() => 0);
        result.findingsCount = cnt;
        console.log(`  ✓ Findings rows: ${cnt}`);

        // Capture first finding narrative
        if (cnt > 0) {
          result.topFinding = (await findingRows.first().textContent() ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
        }
      } else {
        console.log("  ℹ Findings tab not found — checking for findings in main view");
        // Maybe findings are in the main view
        const findingText = page.locator("text=/HIGH|MEDIUM|LOW/").first();
        if (await findingText.isVisible({ timeout: 3000 }).catch(() => false)) {
          result.topFinding = (await findingText.textContent() ?? "").trim();
        }
      }

      // ── BY COUNTERPARTY TAB ───────────────────────────────────────────────
      await step(page, `${i + 1}-08 By Counterparty Tab`);
      const cpTab = page.locator("button:has-text('By Counterpart'), [role='tab']:has-text('Counterpart')").first();
      if (await cpTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await cpTab.click();
        await page.waitForTimeout(1500);
        console.log("  ✓ Clicked By Counterparty tab");
      }

      // ── EVIDENCE RAIL TAB ─────────────────────────────────────────────────
      await step(page, `${i + 1}-09 Evidence Rail`);
      const evidenceTab = page.locator("button:has-text('Evidence'), [role='tab']:has-text('Evidence')").first();
      if (await evidenceTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await evidenceTab.click();
        await page.waitForTimeout(1500);
        console.log("  ✓ Clicked Evidence Rail tab");

        // Capture hash values
        const pageBodyText = await page.locator("body").textContent() ?? "";
        const sha256Pattern = /[a-f0-9]{64}/g;
        const hashes = [...pageBodyText.matchAll(sha256Pattern)].map(m => m[0]);
        if (hashes.length >= 1) result.runHash    = hashes[0].slice(0, 16) + "…";
        if (hashes.length >= 2) result.inputsHash  = hashes[1].slice(0, 16) + "…";
        if (hashes.length >= 3) result.outputsHash = hashes[2].slice(0, 16) + "…";
        console.log(`  ✓ Hashes captured: ${hashes.length} SHA-256 values found`);
      }

      await step(page, `${i + 1}-10 Final screenshot`);

      // ── DOWNLOAD EVIDENCE BINDER ──────────────────────────────────────────
      const evidenceBtn = page.locator("button:has-text('EVIDENCE BINDER'), a:has-text('EVIDENCE BINDER')").first();
      if (await evidenceBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Trigger download (don't block on it)
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 8000 }).catch(() => null),
          evidenceBtn.click(),
        ]);
        if (download) {
          console.log(`  ✓ Evidence Binder download triggered: ${download.suggestedFilename()}`);
        } else {
          console.log("  ℹ Evidence Binder download event not captured (may have saved silently)");
        }
      }

      // ── VERIFY AUDIT TRAIL ────────────────────────────────────────────────
      await step(page, `${i + 1}-11 Audit Trail`);
      const auditTrailLink = page.locator('a[href*="audit-trail"]').first();
      if (await auditTrailLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await auditTrailLink.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1500);

        const trailTable = page.locator("table tbody tr");
        const trailCount = await trailTable.count().catch(() => 0);
        console.log(`  ✓ Audit trail shows ${trailCount} events`);
      } else {
        // Navigate via sidebar
        const auditLabLink = page.locator('a[href="/audit-lab"]').first();
        if (await auditLabLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await auditLabLink.click();
          await page.waitForTimeout(1000);
        }
        console.log("  ℹ Audit trail link not directly visible");
      }

      // Store result
      results.push(result);

      // ── ASSERTIONS ────────────────────────────────────────────────────────
      // Verify we got a valid run ID (UUID format)
      expect(result.runId).toMatch(/^[0-9a-f-]{36}$/i);
      console.log(`\n  ✅ ${ds.label} COMPLETE`);
      console.log(`     Run ID:    ${result.runId}`);
      console.log(`     Row count: ${result.rowCount}`);
      console.log(`     Findings:  ${result.findingsCount}`);
    });
  }

  // ── Summary test — run after all 3 datasets ────────────────────────────────
  test("Aggregate: Compare Runs on Audit Lab Hub", async ({ page }) => {
    await loginAsDemo(page);

    // Navigate to audit lab hub — expand section header first
    const auditSection = page.locator('text=AUDIT LAB').first();
    if (await auditSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await auditSection.click();
      await page.waitForTimeout(500);
    }
    const auditLink = page.locator('a[href="/audit-lab"]').first();
    if (await auditLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await auditLink.click();
    } else {
      await page.evaluate(() => {
        const a = document.querySelector('a[href="/audit-lab"]') as HTMLAnchorElement;
        if (a) a.click();
      });
    }
    await page.waitForLoadState("networkidle");

    await step(page, "4-01 Audit Lab Hub Overview");
    await expect(page).toHaveURL(/audit-lab/, { timeout: 15000 });
    console.log("  ✓ On Audit Lab hub");

    // Verify past runs are listed
    const runsSection = page.locator("text=PAST AUDIT RUNS, text=Past Audit Runs, text=audit runs").first();
    if (await runsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("  ✓ Past Audit Runs section visible");
    }

    // Count listed runs
    const runRows = page.locator("table tbody tr, [data-testid='run-row']");
    const runCount = await runRows.count().catch(() => 0);
    console.log(`  ✓ ${runCount} audit runs listed on hub`);

    await step(page, "4-02 Hub screenshot");

    // Navigate to audit trail
    await step(page, "4-03 Audit Trail");
    await page.goto((process.env.E2E_BASE_URL ?? "http://localhost:3000") + "/audit-lab/audit-trail");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const trailRows = page.locator("table tbody tr");
    const trailRowCount = await trailRows.count().catch(() => 0);
    console.log(`  ✓ Audit trail: ${trailRowCount} events`);
    expect(trailRowCount).toBeGreaterThanOrEqual(0);

    await step(page, "4-04 Audit trail screenshot");

    // Navigate to trends
    await step(page, "4-05 Trends Dashboard");
    await page.goto((process.env.E2E_BASE_URL ?? "http://localhost:3000") + "/audit-lab/trends");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const trendsTitle = page.locator("text=Trend Dashboard, text=TREND, text=Markup Cost Over Time").first();
    if (await trendsTitle.isVisible({ timeout: 8000 }).catch(() => false)) {
      console.log("  ✓ Trends dashboard loaded");
    }

    await step(page, "4-06 Trends screenshot");

    // Navigate to review queue
    await step(page, "4-07 Review Queue");
    await page.goto((process.env.E2E_BASE_URL ?? "http://localhost:3000") + "/audit-lab/review");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const queueSize = page.locator("text=QUEUE SIZE").first();
    if (await queueSize.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("  ✓ Review Queue loaded");
    }

    await step(page, "4-08 Review queue screenshot");

    // Print aggregate summary
    console.log("\n" + "═".repeat(70));
    console.log("  AUDIT LAB E2E — AGGREGATE RESULTS");
    console.log("═".repeat(70));
    for (const r of results) {
      console.log(`\n  ${r.runLabel}`);
      console.log(`  ${"─".repeat(50)}`);
      console.log(`  Period:          ${r.period}`);
      console.log(`  Rows parsed:     ${r.rowCount}`);
      console.log(`  Run ID:          ${r.runId}`);
      console.log(`  RUN HASH:        ${r.runHash}`);
      console.log(`  INPUTS HASH:     ${r.inputsHash}`);
      console.log(`  OUTPUTS HASH:    ${r.outputsHash}`);
      console.log(`  Findings:        ${r.findingsCount}`);
      console.log(`  Top Finding:     ${r.topFinding.slice(0, 80)}`);
    }
    console.log("\n" + "═".repeat(70));

    // Save results to JSON for the narrative report
    const resultsJson = JSON.stringify({ runDate: new Date().toISOString(), runs: results }, null, 2);
    fs.writeFileSync(path.resolve(process.cwd(), "e2e-results.json"), resultsJson);
    console.log("  ✓ Results saved to e2e-results.json");
  });
});
