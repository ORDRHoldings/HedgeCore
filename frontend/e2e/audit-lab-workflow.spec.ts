/**
 * frontend/e2e/audit-lab-workflow.spec.ts
 *
 * Comprehensive E2E tests for the Audit Lab workflow.
 * All tests run without a live backend by intercepting API routes via
 * page.route() and returning mock responses that match production shapes.
 *
 * Coverage: 6 pages, 11 API endpoints, 48 tests.
 */

import { test, expect, type Page } from "@playwright/test";

/* ============================================================================
   MOCK DATA — matches actual API response shapes from backend routes
   ============================================================================ */

const DATASET_A = {
  id: "ds-aaaa-1111-2222-3333-444444444444",
  period_start: "2025-01-01",
  period_end: "2025-06-30",
  source_filename: "acme_fx_h1_2025.csv",
  source_hash:
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  row_count: 1247,
  currency_pairs: ["EURUSD", "GBPUSD", "USDJPY"],
  created_at: "2025-07-01T10:00:00Z",
};

const DATASET_B = {
  id: "ds-bbbb-5555-6666-7777-888888888888",
  period_start: "2025-07-01",
  period_end: "2025-12-31",
  source_filename: "acme_fx_h2_2025.csv",
  source_hash:
    "abc123def456789000000000000000000000000000000000000000000000000a",
  row_count: 983,
  currency_pairs: ["EURUSD", "USDMXN"],
  created_at: "2026-01-15T14:30:00Z",
};

const RUN_A_ID = "run-aaaa-0001-0002-0003-000000000001";
const RUN_B_ID = "run-bbbb-0004-0005-0006-000000000002";

const RUN_A = {
  run_id: RUN_A_ID,
  run_hash:
    "sha256:aabbccdd00112233445566778899aabbccddeeff00112233445566778899aabb",
  methodology_version: "2.4.0",
  status: "COMPLETED",
  created_at: "2025-07-02T12:00:00Z",
};

const RUN_B = {
  run_id: RUN_B_ID,
  run_hash:
    "sha256:11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
  methodology_version: "2.4.1",
  status: "RUNNING",
  created_at: "2026-01-16T09:00:00Z",
};

const RUN_DETAIL = {
  run_id: RUN_A_ID,
  dataset_id: DATASET_A.id,
  methodology_version: "2.4.0",
  run_hash:
    "sha256:aabbccdd00112233445566778899aabbccddeeff00112233445566778899aabb",
  inputs_hash:
    "sha256:11111111222222223333333344444444555555556666666677777777aaaaaaaa",
  outputs_hash:
    "sha256:eeeeeeeeffffffff0000000011111111222222223333333344444444bbbbbbbb",
  status: "COMPLETED",
  created_at: "2025-07-02T12:00:00Z",
  summary: {
    total_markup_usd: 142300,
    total_fees_usd: 8750,
    total_rate_variance_usd: 23100,
    total_unhedged_impact_usd: 23100,
    total_loss_usd: 174150,
    data_quality_score: 94.2,
    fee_confidence: "HIGH",
    markup_rejections_count: 3,
    outlier_count: 5,
    counterparty_count: 4,
    natural_hedge_count: 12,
  },
  findings: [
    {
      id: "f-001",
      finding_type: "MARKUP_EXCESS",
      currency_pair: "EURUSD",
      counterparty: "BigBank Corp",
      amount_usd: 45000,
      severity: "HIGH",
      narrative:
        "Markup on EUR/USD trades averaged 12.3 bps vs 4.1 bps market benchmark.",
      finding_hash: "fhash001",
      created_at: "2025-07-02T12:01:00Z",
    },
    {
      id: "f-002",
      finding_type: "FEE_OPACITY",
      currency_pair: "GBPUSD",
      counterparty: "MegaFX Ltd",
      amount_usd: 8200,
      severity: "MEDIUM",
      narrative:
        "Transfer fees not disclosed on 14 GBP/USD transactions totalling $8,200.",
      finding_hash: "fhash002",
      created_at: "2025-07-02T12:01:30Z",
    },
    {
      id: "f-003",
      finding_type: "RATE_ANOMALY",
      currency_pair: "USDJPY",
      counterparty: null,
      amount_usd: 1200,
      severity: "LOW",
      narrative: "Minor rate deviation on 3 JPY trades within tolerance band.",
      finding_hash: "fhash003",
      created_at: "2025-07-02T12:02:00Z",
    },
  ],
  markup_by_pair: { EURUSD: 78500, GBPUSD: 42000, USDJPY: 21800 },
  markup_by_counterparty: {
    "BigBank Corp": 82000,
    "MegaFX Ltd": 38300,
    "LocalFX Inc": 15000,
    "Broker Direct": 7000,
  },
  markup_by_month: {
    "2025-01": 22000,
    "2025-02": 18000,
    "2025-03": 31000,
    "2025-04": 25000,
    "2025-05": 27000,
    "2025-06": 19300,
  },
  rate_variance_results: [
    { pair: "EURUSD", variance_usd: 12000 },
    { pair: "USDJPY", variance_usd: 11100 },
  ],
  unhedged_results: [],
  counterparty_scores: [],
  natural_hedges: [],
  outlier_count: 5,
};

/** Run detail variant with zero findings, used for "No findings" empty state */
const RUN_DETAIL_NO_FINDINGS = {
  ...RUN_DETAIL,
  run_id: "run-empty-findings-000000000000",
  findings: [],
};

const TRANSACTIONS_RESPONSE = {
  transactions: [
    {
      id: "txn-001",
      row_index: 1,
      trade_date: "2025-01-15",
      currency_sold: "EUR",
      currency_bought: "USD",
      amount_sold: 100000,
      amount_bought: 108500,
      effective_rate: 1.085,
      benchmark_rate: 1.0892,
      markup_cost_usd: 420,
      markup_direction: "ADVERSE",
      counterparty: "BigBank Corp",
    },
    {
      id: "txn-002",
      row_index: 2,
      trade_date: "2025-01-22",
      currency_sold: "GBP",
      currency_bought: "USD",
      amount_sold: 50000,
      amount_bought: 63250,
      effective_rate: 1.265,
      benchmark_rate: 1.2675,
      markup_cost_usd: 125,
      markup_direction: "ADVERSE",
      counterparty: "MegaFX Ltd",
    },
  ],
};

const COMPARE_RUNS = {
  runs: [
    {
      run_id: RUN_A_ID,
      created_at: "2025-07-02T12:00:00Z",
      status: "COMPLETED",
      methodology_version: "2.4.0",
      summary: {
        total_markup_usd: 142300,
        total_fees_usd: 8750,
        total_loss_usd: 174150,
        data_quality_score: 94.2,
      },
      markup_by_pair: { EURUSD: 78500, GBPUSD: 42000, USDJPY: 21800 },
    },
    {
      run_id: RUN_B_ID,
      created_at: "2026-01-16T09:00:00Z",
      status: "COMPLETED",
      methodology_version: "2.4.1",
      summary: {
        total_markup_usd: 98700,
        total_fees_usd: 6200,
        total_loss_usd: 121400,
        data_quality_score: 96.8,
      },
      markup_by_pair: { EURUSD: 54200, USDMXN: 44500 },
    },
  ],
};

const REVIEW_QUEUE = {
  items: [
    {
      id: "rq-001",
      row_index: 47,
      trade_date: "2025-03-12",
      value_date: "2025-03-14",
      currency_sold: "EUR",
      currency_bought: "USD",
      amount_sold: 250000,
      amount_bought: null,
      effective_rate: 1.082,
      counterparty: "UnknownFX",
      confidence: 0.35,
      flags: ["missing_amount_bought", "counterparty_not_matched"],
    },
    {
      id: "rq-002",
      row_index: 112,
      trade_date: "2025-05-08",
      value_date: "2025-05-10",
      currency_sold: "GBP",
      currency_bought: "USD",
      amount_sold: 75000,
      amount_bought: 93750,
      effective_rate: 1.25,
      counterparty: "BigBank Corp",
      confidence: 0.62,
      flags: ["rate_outlier"],
    },
    {
      id: "rq-003",
      row_index: 203,
      trade_date: "2025-06-20",
      value_date: "2025-06-22",
      currency_sold: "USD",
      currency_bought: "JPY",
      amount_sold: 500000,
      amount_bought: 72500000,
      effective_rate: 145.0,
      counterparty: "Broker Direct",
      confidence: 0.74,
      flags: ["value_date_mismatch"],
    },
  ],
};

const TRENDS_DATA = {
  trend_points: [
    { date: "2025-01", total_markup_usd: 22000, data_quality_score: 91.5 },
    { date: "2025-02", total_markup_usd: 18000, data_quality_score: 92.0 },
    { date: "2025-03", total_markup_usd: 31000, data_quality_score: 93.1 },
    { date: "2025-04", total_markup_usd: 25000, data_quality_score: 94.0 },
    { date: "2025-05", total_markup_usd: 27000, data_quality_score: 94.5 },
    { date: "2025-06", total_markup_usd: 19300, data_quality_score: 95.2 },
  ],
  counterparty_breakdown: [
    { counterparty: "BigBank Corp", total_markup_usd: 82000 },
    { counterparty: "MegaFX Ltd", total_markup_usd: 38300 },
    { counterparty: "LocalFX Inc", total_markup_usd: 15000 },
    { counterparty: "Broker Direct", total_markup_usd: 7000 },
  ],
};

const MOCK_USER = {
  id: "user-e2e-test-001",
  email: "demo@ordr.dev",
  full_name: "E2E Test User",
  job_title: "Tester",
  is_active: true,
  is_superuser: false,
  company: { id: "comp-001", name: "Test Corp", slug: "test-corp" },
  branch: { id: "br-001", name: "HQ", code: "HQ" },
  department: null,
  roles: ["treasury_analyst"],
  permissions: [
    "position_read",
    "position_write",
    "audit_lab_read",
    "audit_lab_write",
  ],
  hierarchy_level: 5,
  plan_tier: "enterprise",
};

/* ============================================================================
   SETUP HELPERS — Auth mock + API route interception
   ============================================================================ */

/**
 * Seed authentication state so the AuthProvider resolves immediately.
 * Mocks /auth/refresh and /auth/me to return a valid user session.
 */
async function seedAuth(page: Page) {
  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "e2e-mock-jwt-token",
        user: MOCK_USER,
      }),
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_USER),
    });
  });
}

/**
 * Mock all Audit Lab GET endpoints with populated data.
 * POST endpoints for upload/run-create are mocked per-test when needed.
 */
async function mockAuditLabAPIs(page: Page) {
  await page.route("**/api/v1/audit-lab/datasets", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [DATASET_A, DATASET_B] }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route("**/api/v1/audit-lab/runs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [RUN_A, RUN_B] }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(`**/api/v1/audit-lab/runs/${RUN_A_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RUN_DETAIL),
    });
  });

  await page.route(
    `**/api/v1/audit-lab/runs/${RUN_A_ID}/transactions`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(TRANSACTIONS_RESPONSE),
      });
    },
  );

  await page.route(
    `**/api/v1/audit-lab/runs/${RUN_A_ID}/export`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ evidence: "binder_data" }),
      });
    },
  );

  await page.route("**/api/v1/audit-lab/compare*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(COMPARE_RUNS),
    });
  });

  await page.route("**/api/v1/audit-lab/review-queue", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(REVIEW_QUEUE),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(
    "**/api/v1/audit-lab/review-queue/*/resolve",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "resolved" }),
      });
    },
  );

  await page.route("**/api/v1/audit-lab/trends", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(TRENDS_DATA),
    });
  });
}

/* ============================================================================
   1. NAVIGATION & PAGE LOAD (tests 1-9)
   ============================================================================ */

test.describe("Audit Lab -- Navigation & Page Load", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await mockAuditLabAPIs(page);
  });

  test("1: hub page loads with datasets and runs panels", async ({ page }) => {
    await page.goto("/audit-lab");
    await expect(page.locator("text=FX Transaction Audit")).toBeVisible({
      timeout: 15000,
    });
    // Both section headers should be present
    await expect(page.locator("text=Uploaded Datasets")).toBeVisible();
    await expect(page.locator("text=Past Audit Runs")).toBeVisible();
  });

  test("2: hub page shows 'No datasets uploaded yet' when empty", async ({
    page,
  }) => {
    // Override with empty datasets
    await page.route("**/api/v1/audit-lab/datasets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    });
    await page.route("**/api/v1/audit-lab/runs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    });

    await page.goto("/audit-lab");
    await expect(
      page.locator("text=No datasets uploaded yet."),
    ).toBeVisible({ timeout: 15000 });
  });

  test("3: hub page shows 'No audit runs yet' when empty", async ({
    page,
  }) => {
    await page.route("**/api/v1/audit-lab/datasets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    });
    await page.route("**/api/v1/audit-lab/runs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    });

    await page.goto("/audit-lab");
    await expect(
      page.locator("text=No audit runs yet"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("4: upload page loads with correct 3-step indicator", async ({
    page,
  }) => {
    await page.goto("/audit-lab/upload");
    await expect(page.locator("text=Upload CSV")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator("text=Configure & Run")).toBeVisible();
    await expect(page.locator("text=Done")).toBeVisible();
  });

  test("5: upload page shows drop zone for CSV", async ({ page }) => {
    await page.goto("/audit-lab/upload");
    await expect(
      page.locator("text=Drag & drop CSV file here"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("6: run detail page loads with KPI cards", async ({ page }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator("text=Explicit Fees")).toBeVisible();
    await expect(page.locator("text=Rate Variance")).toBeVisible();
    await expect(page.locator("text=Total Quantified Cost")).toBeVisible();
  });

  test("7: compare page loads with comparison table", async ({ page }) => {
    await page.goto(
      `/audit-lab/compare?run_ids=${RUN_A_ID},${RUN_B_ID}`,
    );
    await expect(page.locator("text=Run Comparison")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator("text=Markup by Currency Pair"),
    ).toBeVisible();
  });

  test("8: review page loads with filter tabs", async ({ page }) => {
    await page.goto("/audit-lab/review");
    await expect(page.locator("text=Review Queue")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator("button", { hasText: /^All/ }),
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: /Low/ }),
    ).toBeVisible();
  });

  test("9: trends page loads with chart containers", async ({ page }) => {
    await page.goto("/audit-lab/trends");
    await expect(page.locator("text=Trend Dashboard")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator("text=Markup Cost Over Time"),
    ).toBeVisible();
    await expect(
      page.locator("text=Data Quality Trend"),
    ).toBeVisible();
    await expect(page.locator("text=Counterparty Mix")).toBeVisible();
  });
});

/* ============================================================================
   2. HUB PAGE LINKS (tests 10-13)
   ============================================================================ */

test.describe("Audit Lab -- Hub Page Links", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await mockAuditLabAPIs(page);
  });

  test("10: UPLOAD DATASET button links to /audit-lab/upload", async ({
    page,
  }) => {
    await page.goto("/audit-lab");
    const uploadLink = page.locator("a", { hasText: "UPLOAD DATASET" });
    await expect(uploadLink).toBeVisible({ timeout: 15000 });
    await expect(uploadLink).toHaveAttribute("href", "/audit-lab/upload");
  });

  test("11: dataset RUN AUDIT links to /audit-lab/upload?dataset_id={id}", async ({
    page,
  }) => {
    await page.goto("/audit-lab");
    const runAuditLink = page
      .locator("a", { hasText: "RUN AUDIT" })
      .first();
    await expect(runAuditLink).toBeVisible({ timeout: 15000 });
    await expect(runAuditLink).toHaveAttribute(
      "href",
      `/audit-lab/upload?dataset_id=${DATASET_A.id}`,
    );
  });

  test("12: run card links to /audit-lab/runs/{run_id}", async ({ page }) => {
    await page.goto("/audit-lab");
    const runLink = page
      .locator(`a[href="/audit-lab/runs/${RUN_A_ID}"]`)
      .first();
    await expect(runLink).toBeVisible({ timeout: 15000 });
  });

  test("13: run cards show methodology version and status badge", async ({
    page,
  }) => {
    await page.goto("/audit-lab");

    // RUN_A: v2.4.0, COMPLETED
    await expect(page.locator("text=v2.4.0").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator("text=COMPLETED").first()).toBeVisible();

    // RUN_B: v2.4.1, RUNNING
    await expect(page.locator("text=RUNNING").first()).toBeVisible();
  });
});

/* ============================================================================
   3. UPLOAD FLOW (tests 14-17)
   ============================================================================ */

test.describe("Audit Lab -- Upload Flow", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await mockAuditLabAPIs(page);
  });

  test("14: upload page skips to phase 2 when dataset_id in URL", async ({
    page,
  }) => {
    await page.goto(
      `/audit-lab/upload?dataset_id=${DATASET_A.id}`,
    );

    // Phase 2 content: dataset ID shown, run button visible
    await expect(page.locator(`text=${DATASET_A.id}`)).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator("button", { hasText: "RUN AUDIT ANALYSIS" }),
    ).toBeVisible();

    // Phase 1 content should NOT be visible (no drop zone)
    await expect(
      page.locator("text=Drag & drop CSV file here"),
    ).not.toBeVisible();
  });

  test("15: upload page shows benchmark source toggle", async ({ page }) => {
    await page.goto(
      `/audit-lab/upload?dataset_id=${DATASET_A.id}`,
    );

    await expect(
      page.locator("button", { hasText: "Market Snapshot" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("button", { hasText: "Budget Rate" }),
    ).toBeVisible();
  });

  test("16: budget rate input appears when Budget Rate is selected", async ({
    page,
  }) => {
    await page.goto(
      `/audit-lab/upload?dataset_id=${DATASET_A.id}`,
    );

    // Initially market_snapshot is selected -- no budget rate input
    await expect(
      page.locator("text=Budget Rate (CCY/USD)"),
    ).not.toBeVisible({ timeout: 5000 });

    // Click Budget Rate toggle
    await page.locator("button", { hasText: "Budget Rate" }).click();

    // Budget rate input appears
    await expect(
      page.locator("text=Budget Rate (CCY/USD)"),
    ).toBeVisible();
    await expect(
      page.locator('input[placeholder="e.g. 0.060"]'),
    ).toBeVisible();
  });

  test("17: upload button is disabled when no file selected", async ({
    page,
  }) => {
    await page.goto("/audit-lab/upload");
    const uploadBtn = page.locator("button", { hasText: "UPLOAD & PARSE" });
    await expect(uploadBtn).toBeVisible({ timeout: 15000 });
    await expect(uploadBtn).toBeDisabled();
  });
});

/* ============================================================================
   4. RUN DETAIL (tests 18-25)
   ============================================================================ */

test.describe("Audit Lab -- Run Detail", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await mockAuditLabAPIs(page);
  });

  test("18: KPI cards display formatted values (fmt function)", async ({
    page,
  }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    // Total markup: $142,300 (fmt formats as currency with no decimals)
    await expect(page.locator("text=$142,300")).toBeVisible();
    // Explicit fees: $8,750
    await expect(page.locator("text=$8,750")).toBeVisible();
    // Total quantified cost: $174,150
    await expect(page.locator("text=$174,150")).toBeVisible();
    // Rate variance: $23,100
    await expect(page.locator("text=$23,100")).toBeVisible();
  });

  test("19: severity badges have correct colors (SevColor mapping)", async ({
    page,
  }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    // All three severity levels visible as badges
    await expect(
      page.locator("span", { hasText: "HIGH" }).first(),
    ).toBeVisible();
    await expect(
      page.locator("span", { hasText: "MEDIUM" }).first(),
    ).toBeVisible();
    await expect(
      page.locator("span", { hasText: "LOW" }).first(),
    ).toBeVisible();
  });

  test("20: tab switching works across all 5 tabs", async ({ page }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    // Default tab: findings
    await expect(page.locator("text=MARKUP_EXCESS")).toBeVisible();

    // Switch to pairs tab
    await page.locator("button", { hasText: "By Pair" }).click();
    await expect(
      page.locator("th", { hasText: "Currency Pair" }),
    ).toBeVisible();

    // Switch to counterparties tab
    await page
      .locator("button", { hasText: "By Counterparty" })
      .click();
    await expect(
      page.locator("td", { hasText: "BigBank Corp" }),
    ).toBeVisible();

    // Switch to transactions tab
    await page
      .locator("button", { hasText: "Transactions" })
      .click();
    // Transactions lazy-load, so wait for the content
    await expect(
      page.locator("td", { hasText: "2025-01-15" }),
    ).toBeVisible({ timeout: 10000 });

    // Switch to evidence tab
    await page
      .locator("button", { hasText: "Evidence Rail" })
      .click();
    await expect(
      page.locator("text=SHA-256 Evidence Chain"),
    ).toBeVisible();
  });

  test("21: transactions tab loads lazily on switch", async ({ page }) => {
    let txnRequested = false;

    // Override the transactions route to track when it's called
    await page.route(
      `**/api/v1/audit-lab/runs/${RUN_A_ID}/transactions`,
      async (route) => {
        txnRequested = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(TRANSACTIONS_RESPONSE),
        });
      },
    );

    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    // On initial load, transactions endpoint should NOT have been called
    expect(txnRequested).toBe(false);

    // Now switch to transactions tab
    await page
      .locator("button", { hasText: "Transactions" })
      .click();

    // Wait for data to load
    await expect(
      page.locator("td", { hasText: "2025-01-15" }),
    ).toBeVisible({ timeout: 10000 });

    // Now it should have been requested
    expect(txnRequested).toBe(true);
  });

  test("22: evidence tab shows SHA-256 hashes", async ({ page }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    await page
      .locator("button", { hasText: "Evidence Rail" })
      .click();

    await expect(
      page.locator("text=SHA-256 Evidence Chain"),
    ).toBeVisible();
    await expect(page.locator("text=RUN HASH")).toBeVisible();
    await expect(page.locator("text=INPUTS HASH")).toBeVisible();
    await expect(page.locator("text=OUTPUTS HASH")).toBeVisible();
    await expect(page.locator("text=DATASET ID")).toBeVisible();

    // Actual hash values present
    await expect(
      page.locator(`text=${RUN_DETAIL.run_hash}`),
    ).toBeVisible();
    await expect(
      page.locator(`text=${RUN_DETAIL.inputs_hash}`),
    ).toBeVisible();
    await expect(
      page.locator(`text=${RUN_DETAIL.outputs_hash}`),
    ).toBeVisible();
  });

  test("23: export buttons exist and are clickable", async ({ page }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    const evidenceBtn = page.locator("button", {
      hasText: "EVIDENCE BINDER",
    });
    const boardBtn = page.locator("button", {
      hasText: "BOARD SUMMARY",
    });
    const xlsxBtn = page.locator("button", { hasText: "XLSX DATA" });

    await expect(evidenceBtn).toBeVisible();
    await expect(evidenceBtn).toBeEnabled();
    await expect(boardBtn).toBeVisible();
    await expect(boardBtn).toBeEnabled();
    await expect(xlsxBtn).toBeVisible();
    await expect(xlsxBtn).toBeEnabled();
  });

  test("24: findings table has correct columns", async ({ page }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    const headers = page.locator("th");
    await expect(headers.filter({ hasText: "Type" }).first()).toBeVisible();
    await expect(headers.filter({ hasText: "Pair" }).first()).toBeVisible();
    await expect(
      headers.filter({ hasText: "Severity" }).first(),
    ).toBeVisible();
    await expect(
      headers.filter({ hasText: "Narrative" }).first(),
    ).toBeVisible();

    // Finding data rows
    await expect(page.locator("text=MARKUP_EXCESS")).toBeVisible();
    await expect(page.locator("text=FEE_OPACITY")).toBeVisible();
    await expect(page.locator("text=RATE_ANOMALY")).toBeVisible();
  });

  test("25: empty findings shows 'No findings' message", async ({ page }) => {
    const emptyRunId = RUN_DETAIL_NO_FINDINGS.run_id;

    // Route for the empty-findings run
    await page.route(
      `**/api/v1/audit-lab/runs/${emptyRunId}`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(RUN_DETAIL_NO_FINDINGS),
        });
      },
    );

    await page.goto(`/audit-lab/runs/${emptyRunId}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    // The findings tab should show "No findings." when the array is empty
    await expect(page.locator("text=No findings.")).toBeVisible();
  });
});

/* ============================================================================
   5. COMPARE PAGE (tests 26-30)
   ============================================================================ */

test.describe("Audit Lab -- Compare Page", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
  });

  test("26: requires run_ids in URL, shows error without them", async ({
    page,
  }) => {
    await mockAuditLabAPIs(page);
    await page.goto("/audit-lab/compare");
    await expect(
      page.locator("text=No run_ids provided"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("27: shows 2+ run identification cards", async ({ page }) => {
    await mockAuditLabAPIs(page);
    await page.goto(
      `/audit-lab/compare?run_ids=${RUN_A_ID},${RUN_B_ID}`,
    );

    await expect(page.locator("text=Run 1").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator("text=Run 2").first()).toBeVisible();

    // Truncated run IDs visible
    await expect(
      page.locator(`text=${RUN_A_ID.slice(0, 12)}`).first(),
    ).toBeVisible();
    await expect(
      page.locator(`text=${RUN_B_ID.slice(0, 12)}`).first(),
    ).toBeVisible();
  });

  test("28: shows 4 KPI comparison cards with deltas", async ({ page }) => {
    await mockAuditLabAPIs(page);
    await page.goto(
      `/audit-lab/compare?run_ids=${RUN_A_ID},${RUN_B_ID}`,
    );

    await expect(
      page.locator("text=Total Markup Cost"),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Total Fees")).toBeVisible();
    await expect(
      page.locator("text=Total Quantified Cost"),
    ).toBeVisible();
    await expect(
      page.locator("text=Data Quality Score"),
    ).toBeVisible();
  });

  test("29: shows markup by pair comparison table", async ({ page }) => {
    await mockAuditLabAPIs(page);
    await page.goto(
      `/audit-lab/compare?run_ids=${RUN_A_ID},${RUN_B_ID}`,
    );

    await expect(
      page.locator("text=Markup by Currency Pair"),
    ).toBeVisible({ timeout: 15000 });

    // All unique pairs from both runs
    await expect(
      page.locator("td", { hasText: "EURUSD" }),
    ).toBeVisible();
    await expect(
      page.locator("td", { hasText: "GBPUSD" }),
    ).toBeVisible();
    await expect(
      page.locator("td", { hasText: "USDMXN" }),
    ).toBeVisible();
    await expect(
      page.locator("td", { hasText: "USDJPY" }),
    ).toBeVisible();

    // Delta column header
    await expect(
      page.locator("th", { hasText: "Delta" }),
    ).toBeVisible();
  });

  test("30: delta indicators show correct arrows and colors", async ({
    page,
  }) => {
    await mockAuditLabAPIs(page);
    await page.goto(
      `/audit-lab/compare?run_ids=${RUN_A_ID},${RUN_B_ID}`,
    );

    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    // Markup decreased from $142,300 to $98,700 -- down arrow expected
    // Fees decreased from $8,750 to $6,200 -- down arrow expected
    // Quality score increased from 94.2 to 96.8 -- up arrow expected
    // Unicode arrows: \u2193 (down) and \u2191 (up)
    const arrows = page.locator(
      "span:has-text('\u2193'), span:has-text('\u2191')",
    );
    await expect(arrows.first()).toBeVisible({ timeout: 5000 });
  });
});

/* ============================================================================
   6. REVIEW QUEUE (tests 31-37)
   ============================================================================ */

test.describe("Audit Lab -- Review Queue", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await mockAuditLabAPIs(page);
  });

  test("31: filter tabs show correct counts", async ({ page }) => {
    await page.goto("/audit-lab/review");
    await expect(page.locator("text=QUEUE SIZE")).toBeVisible({
      timeout: 15000,
    });

    // rq-001: 0.35 (35%) -> low
    // rq-002: 0.62 (62%) -> medium
    // rq-003: 0.74 (74%) -> acceptable
    await expect(
      page.locator("button", { hasText: "All (3)" }),
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: /Low.*\(1\)/ }),
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: /Medium.*\(1\)/ }),
    ).toBeVisible();
    await expect(
      page.locator("button", { hasText: /Acceptable.*\(1\)/ }),
    ).toBeVisible();
  });

  test("32: All tab shows all items", async ({ page }) => {
    await page.goto("/audit-lab/review");
    await expect(page.locator("text=QUEUE SIZE")).toBeVisible({
      timeout: 15000,
    });

    // All three rows should be visible (default is All tab)
    await expect(page.locator("text=35.0%")).toBeVisible();
    await expect(page.locator("text=62.0%")).toBeVisible();
    await expect(page.locator("text=74.0%")).toBeVisible();

    // 3 approve buttons = 3 rows
    await expect(
      page.locator("button", { hasText: "APPROVE" }),
    ).toHaveCount(3);
  });

  test("33: Low tab filters to confidence < 50%", async ({ page }) => {
    await page.goto("/audit-lab/review");
    await expect(page.locator("text=QUEUE SIZE")).toBeVisible({
      timeout: 15000,
    });

    // Click Low tab
    await page
      .locator("button", { hasText: /Low.*<50%/ })
      .click();

    // Only rq-001 (35%) should show
    await expect(
      page.locator("button", { hasText: "APPROVE" }),
    ).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator("text=35.0%")).toBeVisible();

    // Other confidence values should not be visible
    await expect(page.locator("text=62.0%")).not.toBeVisible();
    await expect(page.locator("text=74.0%")).not.toBeVisible();
  });

  test("34: approve button optimistically removes item", async ({ page }) => {
    await page.goto("/audit-lab/review");
    await expect(page.locator("text=QUEUE SIZE")).toBeVisible({
      timeout: 15000,
    });

    // Initially 3 items
    await expect(page.locator("text=35.0%")).toBeVisible();

    // Click APPROVE on the first item
    await page
      .locator("button", { hasText: "APPROVE" })
      .first()
      .click();

    // Item should disappear (optimistic removal)
    await expect(page.locator("text=35.0%")).not.toBeVisible({
      timeout: 5000,
    });

    // 2 remaining
    await expect(
      page.locator("button", { hasText: "APPROVE" }),
    ).toHaveCount(2);
  });

  test("35: reject button optimistically removes item", async ({ page }) => {
    await page.goto("/audit-lab/review");
    await expect(page.locator("text=QUEUE SIZE")).toBeVisible({
      timeout: 15000,
    });

    // Click REJECT on the first item
    await page
      .locator("button", { hasText: "REJECT" })
      .first()
      .click();

    // 2 remaining
    await expect(
      page.locator("button", { hasText: "REJECT" }),
    ).toHaveCount(2, { timeout: 5000 });
  });

  test("36: empty queue shows success message", async ({ page }) => {
    // Override with empty queue
    await page.route("**/api/v1/audit-lab/review-queue", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/audit-lab/review");
    await expect(
      page.locator(
        "text=No transactions require review",
      ),
    ).toBeVisible({ timeout: 15000 });
  });

  test("37: KPI bar shows queue size, avg confidence, resolved count", async ({
    page,
  }) => {
    await page.goto("/audit-lab/review");

    await expect(page.locator("text=QUEUE SIZE")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator("text=AVG CONFIDENCE")).toBeVisible();
    await expect(page.locator("text=RESOLVED (SESSION)")).toBeVisible();

    // Queue size should be 3
    // Find the KPI value "3" near QUEUE SIZE
    await expect(page.locator("text=3").first()).toBeVisible();
  });
});

/* ============================================================================
   7. TRENDS PAGE (tests 38-40)
   ============================================================================ */

test.describe("Audit Lab -- Trends Page", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
  });

  test("38: shows 3 chart containers", async ({ page }) => {
    await mockAuditLabAPIs(page);
    await page.goto("/audit-lab/trends");

    await expect(
      page.locator("text=Markup Cost Over Time"),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("text=Data Quality Trend"),
    ).toBeVisible();
    await expect(page.locator("text=Counterparty Mix")).toBeVisible();
  });

  test("39: shows 'No trend data' placeholder when empty", async ({
    page,
  }) => {
    await page.route("**/api/v1/audit-lab/trends", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trend_points: [],
          counterparty_breakdown: [],
        }),
      });
    });

    await page.goto("/audit-lab/trends");

    await expect(
      page.locator("text=No trend data available yet"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("40: breadcrumb links back to /audit-lab", async ({ page }) => {
    await mockAuditLabAPIs(page);
    await page.goto("/audit-lab/trends");
    await expect(page.locator("text=Trend Dashboard")).toBeVisible({
      timeout: 15000,
    });

    const crumb = page.locator('a:has-text("AUDIT LAB")').first();
    await expect(crumb).toHaveAttribute("href", "/audit-lab");
  });
});

/* ============================================================================
   8. CROSS-PAGE NAVIGATION (tests 41-42)
   ============================================================================ */

test.describe("Audit Lab -- Cross-Page Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await mockAuditLabAPIs(page);
  });

  test("41: hub -> upload -> back to hub via breadcrumb", async ({ page }) => {
    await page.goto("/audit-lab");
    await expect(page.locator("text=FX Transaction Audit")).toBeVisible({
      timeout: 15000,
    });

    // Navigate to upload page
    await page.locator("a", { hasText: "UPLOAD DATASET" }).click();
    await expect(
      page.locator("text=Upload FX Transaction Dataset"),
    ).toBeVisible({ timeout: 15000 });

    // Breadcrumb AUDIT LAB link should point back to hub
    const crumb = page.locator('a:has-text("AUDIT LAB")').first();
    await expect(crumb).toHaveAttribute("href", "/audit-lab");
  });

  test("42: hub -> run detail -> back to hub via breadcrumb", async ({
    page,
  }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(
      page.locator("text=Audit Analysis Report"),
    ).toBeVisible({ timeout: 15000 });

    // Breadcrumb AUDIT LAB link should point back to hub
    const crumb = page.locator('a:has-text("AUDIT LAB")').first();
    await expect(crumb).toHaveAttribute("href", "/audit-lab");
  });
});

/* ============================================================================
   9. ADDITIONAL WORKFLOW TESTS (tests 43-48)
   ============================================================================ */

test.describe("Audit Lab -- Extended Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await mockAuditLabAPIs(page);
  });

  test("43: upload phase transition from upload to run after successful upload", async ({
    page,
  }) => {
    await page.route("**/api/v1/audit-lab/datasets/upload", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          dataset_id: "ds-new-upload-id",
          row_count: 500,
          currency_pairs_detected: ["EURUSD", "GBPUSD"],
        }),
      });
    });

    await page.goto("/audit-lab/upload");

    // Attach a file via the hidden input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_fx_data.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n2025-01-01,EUR,USD,100000,108500",
      ),
    });

    const uploadBtn = page.locator("button", { hasText: "UPLOAD & PARSE" });
    await expect(uploadBtn).toBeEnabled({ timeout: 5000 });
    await uploadBtn.click();

    // Phase 2: dataset ID and success banner visible
    await expect(page.locator("text=ds-new-upload-id")).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.locator("text=DATASET UPLOADED SUCCESSFULLY"),
    ).toBeVisible();
  });

  test("44: redirect to /audit-lab/runs/{run_id} after successful run", async ({
    page,
  }) => {
    const newRunId = "run-new-0000-0000-0000-000000000099";

    await page.route("**/api/v1/audit-lab/runs", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ run_id: newRunId }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        });
      }
    });

    await page.route(
      `**/api/v1/audit-lab/runs/${newRunId}`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...RUN_DETAIL,
            run_id: newRunId,
          }),
        });
      },
    );

    await page.goto(
      `/audit-lab/upload?dataset_id=${DATASET_A.id}`,
    );

    await page
      .locator("button", { hasText: "RUN AUDIT ANALYSIS" })
      .click();

    await page.waitForURL(`**/audit-lab/runs/${newRunId}`, {
      timeout: 15000,
    });
    expect(page.url()).toContain(`/audit-lab/runs/${newRunId}`);
  });

  test("45: datasets panel shows currency pair badges and row counts", async ({
    page,
  }) => {
    await page.goto("/audit-lab");

    // Dataset A data
    await expect(
      page.locator(`text=${DATASET_A.source_filename}`),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=1247 rows")).toBeVisible();
    await expect(page.locator("text=EURUSD").first()).toBeVisible();
    await expect(page.locator("text=GBPUSD")).toBeVisible();
    await expect(page.locator("text=USDJPY")).toBeVisible();

    // Dataset B data
    await expect(
      page.locator(`text=${DATASET_B.source_filename}`),
    ).toBeVisible();
    await expect(page.locator("text=983 rows")).toBeVisible();
    await expect(page.locator("text=USDMXN")).toBeVisible();
  });

  test("46: findings tab shows count in tab label", async ({ page }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    await expect(
      page.locator("button", { hasText: "Findings (3)" }),
    ).toBeVisible();
  });

  test("47: evidence tab shows disclaimer about reference baselines", async ({
    page,
  }) => {
    await page.goto(`/audit-lab/runs/${RUN_A_ID}`);
    await expect(page.locator("text=Total Markup Cost")).toBeVisible({
      timeout: 15000,
    });

    await page
      .locator("button", { hasText: "Evidence Rail" })
      .click();

    await expect(
      page.locator("text=DISCLAIMER"),
    ).toBeVisible();
    await expect(
      page.locator("text=reference-baseline analytical what-ifs"),
    ).toBeVisible();
  });

  test("48: review queue medium tab filters to confidence 50-70%", async ({
    page,
  }) => {
    await page.goto("/audit-lab/review");
    await expect(page.locator("text=QUEUE SIZE")).toBeVisible({
      timeout: 15000,
    });

    // Click Medium tab
    await page
      .locator("button", { hasText: /Medium.*50-70%/ })
      .click();

    // Only rq-002 (62%) should show
    await expect(
      page.locator("button", { hasText: "APPROVE" }),
    ).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator("text=62.0%")).toBeVisible();

    // Others should not be visible
    await expect(page.locator("text=35.0%")).not.toBeVisible();
    await expect(page.locator("text=74.0%")).not.toBeVisible();
  });
});
