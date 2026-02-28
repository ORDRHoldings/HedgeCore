# Test Plan — ORDR Terminal
**Review Date**: 2026-02-27
**Coverage**: Manual + Automated (Playwright E2E)

---

## Part A — Manual Test Matrix

### MT-01: Authentication

| ID | Test Case | Steps | Expected Result | Pass? |
|----|-----------|-------|----------------|-------|
| MT-01-01 | Valid login | Navigate to `/auth/login`, enter demo/demo, submit | Redirect to `/dashboard`; user name + ADMIN badge visible in AppTopBar | ☐ |
| MT-01-02 | Invalid credentials | Enter demo/wrong, submit | Error message displayed inline; no redirect | ☐ |
| MT-01-03 | Session expiry | Wait 30min (or mock expired token), attempt API call | Redirect to `/auth/login` | ☐ |
| MT-01-04 | Sign out | Click "Sign Out" in top bar | Redirect to `/auth/login`; token cleared from storage | ☐ |
| MT-01-05 | Direct URL without auth | Navigate directly to `/position-desk` without login | Redirect to `/auth/login` | ☐ |
| MT-01-06 | Refresh token | Wait 25min, perform action | New access token issued without re-login | ☐ |

---

### MT-02: Position Creation

| ID | Test Case | Steps | Expected Result | Pass? |
|----|-----------|-------|----------------|-------|
| MT-02-01 | Create valid AP position | Position Desk → Add Exposure Line → fill all fields → submit | Row appears in table with status NEW; `ingested_at` populated | ☐ |
| MT-02-02 | Create valid AR position | Same but Flow = AR | Row appears in table | ☐ |
| MT-02-03 | Create Forecast position | Status = Forecast | Row appears; status badge differs from Confirmed | ☐ |
| MT-02-04 | Blank Record ID | Submit form with empty Record ID | Validation error shown inline; no submit | ☐ |
| MT-02-05 | Invalid date format | Enter "not-a-date" in Value Date | Validation error; no submit | ☐ |
| MT-02-06 | Non-numeric amount | Enter "abc" in Amount field | Validation error; no submit | ☐ |
| MT-02-07 | Zero amount | Enter 0 in Amount field | Validation error (must be > 0); no submit | ☐ |
| MT-02-08 | Add 5+ positions | Add 2 AP MXN, 2 AR EUR, 1 Forecast USD | All 5 appear in table; status filters work | ☐ |
| MT-02-09 | Delete position | Click delete icon on a NEW position | Position removed from table; audit event emitted | ☐ |

---

### MT-03: Bulk Ingestion

| ID | Test Case | Steps | Expected Result | Pass? |
|----|-----------|-------|----------------|-------|
| MT-03-01 | Upload valid CSV | Upload CSV / XLSX → upload 5-row CSV → confirm | 5 positions created; import history shows run | ☐ |
| MT-03-02 | Upload malformed CSV | Upload CSV with missing required columns | Error message with column name; no partial import | ☐ |
| MT-03-03 | Upload CSV with invalid dates | CSV row has date "2025-13-45" | Row-level error in import summary; other rows proceed | ☐ |
| MT-03-04 | Import history audit | After CSV import, view Import History | Import run log shows filename, row count, timestamp, status | ☐ |

---

### MT-04: Policy Assignment

| ID | Test Case | Steps | Expected Result | Pass? |
|----|-----------|-------|----------------|-------|
| MT-04-01 | Assign active policy to one position | Policy Desk → select 1 position → assign active policy | Position status changes to POLICY_ASSIGNED; Policy ID chip appears | ☐ |
| MT-04-02 | Bulk assign to multiple | Select 3 positions → assign same policy | All 3 show POLICY_ASSIGNED | ☐ |
| MT-04-03 | Assign when no active policy | Navigate to Policy Desk with no active policy | Warning shown: "No active policy — select one first" | ☐ |
| MT-04-04 | Policy version visible | Check Policy ID chip after assignment | Shows policy_instance_id; clicking copies to clipboard | ☐ |
| MT-04-05 | AI recommendation | Use AI Recommendation tab | Recommendation appears with reasoning; can be accepted or ignored | ☐ |

---

### MT-05: Execution Pipeline

| ID | Test Case | Steps | Expected Result | Pass? |
|----|-----------|-------|----------------|-------|
| MT-05-01 | Step 1: Select positions | Execution Desk → select 2 POLICY_ASSIGNED positions | "Proceed to Calculate" button enabled | ☐ |
| MT-05-02 | Step 2: Run calculation | Click Calculate | Run result appears: run_id, hedge plan, validation PASS | ☐ |
| MT-05-03 | Step 3: Risk check passes | All checks within policy limits | All checks GREEN; "Proceed to Execute" enabled | ☐ |
| MT-05-04 | Step 4: Execute | Click Execute | Positions marked HEDGED; run_id chip shows in Position Desk | ☐ |
| MT-05-05 | Back navigation | In Step 3, click Back | Returns to Step 2 without re-running calculation | ☐ |
| MT-05-06 | Execute with 0 READY positions | No POLICY_ASSIGNED positions exist | Step 1 shows empty state with CTA to Policy Desk | ☐ |
| MT-05-07 | Verify Run Viewer | After execution, go to Run Viewer with run_id | TraceLite trace + RunEnvelope hash chain visible | ☐ |

---

### MT-06: Report Generation + Export

| ID | Test Case | Steps | Expected Result | Pass? |
|----|-----------|-------|----------------|-------|
| MT-06-01 | Generate Hedge Plan Report | Reports → select run → generate | Hedge schedule with positions, notional, instruments rendered | ☐ |
| MT-06-02 | Export to CSV | Export Hedge Plan → CSV | CSV downloads; columns match Position Desk table labels | ☐ |
| MT-06-03 | Export to JSON | Export → JSON | Structured JSON with run_id, positions, hedges, metadata | ☐ |
| MT-06-04 | Committee Pack structure | Reports → Committee Pack | Contains: cover, hedge summary, effectiveness, risk, approvals | ☐ |
| MT-06-05 | AI Report Builder | Reports → AI Builder → set goal → generate | Outline generated with sections bound to real run data; no invented numbers | ☐ |
| MT-06-06 | Save report | Generate report → Save | Appears in Saved Reports list with timestamp | ☐ |
| MT-06-07 | Preset library | Browse presets → select one | Report generated with correct structure | ☐ |

---

### MT-07: Governance Views

| ID | Test Case | Steps | Expected Result | Pass? |
|----|-----------|-------|----------------|-------|
| MT-07-01 | Audit trail shows backend events | Governance → Audit Trail | Events loaded from `GET /v1/audit`; shown with hash chain | ☐ |
| MT-07-02 | Chain integrity verification | Click "Verify Chain" | Calls backend verify endpoint; shows is_intact: true | ☐ |
| MT-07-03 | Filter audit by run_id | Enter a run_id in filter | Only events for that run shown | ☐ |
| MT-07-04 | Run Viewer by ID | Navigate to `/run-viewer?id=<run_id>` | TraceLite trace + RunEnvelope visible; policy pin shown | ☐ |
| MT-07-05 | Position lineage | Navigate to `/lineage?position=<id>` | 5-node graph: Position → Policy → Revision → Run → Proposal | ☐ |
| MT-07-06 | Access Control users | Governance → Access Control | Current user listed; role and branch shown | ☐ |
| MT-07-07 | Permission matrix | Access Control → Permission Matrix | Roles × permissions grid loaded (from API, not hardcoded) | ☐ |

---

### MT-08: Settings Persistence

| ID | Test Case | Steps | Expected Result | Pass? |
|----|-----------|-------|----------------|-------|
| MT-08-01 | Save org settings | Settings → General → change org name → save | Org name persists on refresh | ☐ |
| MT-08-02 | Save API key | Settings → API & Keys → enter Alpha Vantage key → save | Key saved (masked display); used in FX Rates fetch | ☐ |
| MT-08-03 | Policy limit change | Settings → Policy Limits → change hedge ratio max → save | New limit reflected in Execution Desk risk check | ☐ |
| MT-08-04 | Hash navigation | Click "Policy Limits" from Settings menu | Settings page scrolls to/activates Policy Limits section | ☐ |
| MT-08-05 | Notification threshold | Settings → Notifications → set email alert | Alert config saved; shown in notification list | ☐ |

---

## Part B — Playwright E2E Tests

### Test 1: Happy Path — Position → Hedge → Report

```typescript
// tests/e2e/happy_path.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Full Hedge Pipeline — Happy Path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('[name="email"]', 'demo@demo.com');
    await page.fill('[name="password"]', 'demo');
    await page.click('[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('creates position, assigns policy, executes, views report', async ({ page }) => {
    // Step 1: Create a position
    await page.goto('/position-desk');
    await page.click('text=Add Exposure Line');
    await page.fill('[name="record_id"]', 'E2E-001');
    await page.fill('[name="entity"]', 'Test Corp');
    await page.selectOption('[name="currency"]', 'MXN');
    await page.fill('[name="amount"]', '500000');
    await page.selectOption('[name="flow_type"]', 'AP');
    await page.fill('[name="value_date"]', '2026-06-30');
    await page.selectOption('[name="status"]', 'Confirmed');
    await page.click('[data-testid="submit-position"]');

    // Verify position appears in table
    await expect(page.locator('text=E2E-001')).toBeVisible();
    await expect(page.locator('[data-status="NEW"]').first()).toBeVisible();

    // Step 2: Assign policy via Policy Desk
    await page.goto('/policy-desk');
    await page.check('[data-record-id="E2E-001"]');
    await page.click('text=Assign Active Policy');
    await page.click('[data-testid="confirm-assign"]');
    await expect(page.locator('text=Policy Assigned')).toBeVisible();

    // Step 3: Run Execution Pipeline
    await page.goto('/execution-desk');
    await expect(page.locator('[data-status="POLICY_ASSIGNED"]')).toBeVisible();
    await page.check('[data-record-id="E2E-001"]');
    await page.click('[data-testid="proceed-to-calculate"]');

    // Calculate
    await page.click('[data-testid="run-calculation"]');
    await expect(page.locator('[data-testid="run-id"]')).toBeVisible({ timeout: 10000 });
    await page.click('[data-testid="approve-plan"]');

    // Risk Check
    await expect(page.locator('[data-testid="all-checks-pass"]')).toBeVisible();
    await page.click('[data-testid="proceed-to-execute"]');

    // Execute
    await page.click('[data-testid="execute-tickets"]');
    await expect(page.locator('text=HEDGED')).toBeVisible();

    // Step 4: Generate report
    await page.goto('/reports');
    await page.click('[data-testid="select-run"]');
    await page.click('[data-testid="generate-report"]');
    await expect(page.locator('[data-testid="report-preview"]')).toBeVisible();
  });
});
```

---

### Test 2: Invalid Input — Position Validation

```typescript
// tests/e2e/invalid_input.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Position Desk — Invalid Input Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('[name="email"]', 'demo@demo.com');
    await page.fill('[name="password"]', 'demo');
    await page.click('[type="submit"]');
    await page.goto('/position-desk');
    await page.click('text=Add Exposure Line');
  });

  test('shows error for blank Record ID', async ({ page }) => {
    await page.fill('[name="amount"]', '100000');
    await page.click('[data-testid="submit-position"]');
    await expect(page.locator('[data-error="record_id"]')).toBeVisible();
    await expect(page.locator('[data-error="record_id"]')).toContainText('required');
  });

  test('shows error for invalid date', async ({ page }) => {
    await page.fill('[name="record_id"]', 'TXN-BAD-DATE');
    await page.fill('[name="amount"]', '100000');
    await page.fill('[name="value_date"]', 'not-a-date');
    await page.click('[data-testid="submit-position"]');
    await expect(page.locator('[data-error="value_date"]')).toBeVisible();
  });

  test('shows error for non-numeric amount', async ({ page }) => {
    await page.fill('[name="record_id"]', 'TXN-BAD-AMT');
    await page.fill('[name="amount"]', 'one million');
    await page.click('[data-testid="submit-position"]');
    await expect(page.locator('[data-error="amount"]')).toBeVisible();
  });

  test('shows error for zero amount', async ({ page }) => {
    await page.fill('[name="record_id"]', 'TXN-ZERO');
    await page.fill('[name="amount"]', '0');
    await page.click('[data-testid="submit-position"]');
    await expect(page.locator('[data-error="amount"]')).toContainText('greater than 0');
  });
});
```

---

### Test 3: Rejection Path

```typescript
// tests/e2e/rejection_path.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Position Rejection Path', () => {
  test('can reject a position with reason and reopen it', async ({ page }) => {
    // Pre-condition: at least one NEW position exists
    await page.goto('/position-desk');

    // Select a NEW position and reject it
    const firstNewRow = page.locator('[data-status="NEW"]').first();
    await firstNewRow.locator('[data-action="reject"]').click();

    // Confirm rejection reason dialog appears
    await expect(page.locator('[data-testid="rejection-reason-dialog"]')).toBeVisible();
    await page.fill('[data-testid="rejection-reason-input"]', 'Hedge not required — exposure settled');
    await page.click('[data-testid="confirm-reject"]');

    // Verify status changed to REJECTED
    const rejectedRow = page.locator('[data-record-id]').filter({ has: page.locator('[data-status="REJECTED"]') }).first();
    await expect(rejectedRow).toBeVisible();

    // Verify rejection reason tooltip
    await rejectedRow.locator('[data-status="REJECTED"]').hover();
    await expect(page.locator('[data-testid="rejection-reason-tooltip"]')).toContainText('Hedge not required');

    // Reopen the rejected position
    await rejectedRow.locator('[data-action="reopen"]').click();
    await expect(rejectedRow.locator('[data-status="NEW"]')).toBeVisible();
  });
});
```

---

### Test 4: Export Report

```typescript
// tests/e2e/export_report.spec.ts
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Report Export', () => {
  test('exports Hedge Plan Report as CSV', async ({ page }) => {
    await page.goto('/reports');

    // Select a saved run or generate one
    await page.click('[data-testid="select-run"]');
    await page.click('[data-testid="run-option"]').first();

    // Generate report
    await page.click('[data-testid="generate-hedge-plan"]');
    await expect(page.locator('[data-testid="report-preview"]')).toBeVisible();

    // Export as CSV
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-csv"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/hedge.*\.csv$/i);

    // Verify file has content (not empty)
    const filePath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(filePath);
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('record_id');
    expect(content.split('\n').length).toBeGreaterThan(1);
  });

  test('exports Committee Pack JSON', async ({ page }) => {
    await page.goto('/committee-pack');

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-json"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.json$/i);

    const filePath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(filePath);
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Verify audit fields
    expect(data).toHaveProperty('run_id');
    expect(data).toHaveProperty('generated_by');
    expect(data).toHaveProperty('generated_at');
  });
});
```

---

## Part C — Test Configuration

### Playwright Config (`playwright.config.ts`)

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { channel: 'chrome' } },
  ],
  reporter: [
    ['html', { outputFolder: 'test-results' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  retries: 1,
  timeout: 30000,
});
```

### Environment Setup

```bash
# Install Playwright
cd frontend && npm install -D @playwright/test && npx playwright install chromium

# Run all E2E tests (local)
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test

# Run specific test file
npx playwright test tests/e2e/happy_path.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui
```

---

## Part D — Acceptance Criteria: "Demo-Ready Institutional Prototype"

The product is considered demo-ready when ALL of the following are met:

### Navigation
- [ ] All 42 nav sub-items resolve to working pages (no 404s)
- [ ] "ORDR Terminal" brand appears consistently on all pages
- [ ] Workflow breadcrumb navigates to correct pages

### Core Workflow
- [ ] Position can be created (manual), edited, and deleted
- [ ] CSV import creates positions with full import history entry
- [ ] Policy can be assigned to one or multiple positions in one action
- [ ] Execution Desk runs 4-step pipeline end-to-end
- [ ] Positions correctly transition to HEDGED after execution
- [ ] Rejected positions can be reopened

### Governance
- [ ] Audit Trail shows events from backend `GET /v1/audit` (not localStorage)
- [ ] Chain integrity check calls backend `GET /v1/audit/chain/verify`
- [ ] Run Viewer shows TraceLite + RunEnvelope with all hashes
- [ ] Position Lineage shows 5-node provenance graph
- [ ] 4-eyes approval: same user cannot propose AND approve (error shown)

### Reports
- [ ] Hedge Plan Report generates from a real calculation run
- [ ] Committee Pack renders with at minimum: cover, summary, hedge schedule
- [ ] At least one export format (CSV or JSON) works without error
- [ ] AI Report Builder shows disclaimer; no numbers are hallucinated

### Settings
- [ ] Alpha Vantage API key can be entered and persists
- [ ] Policy limits are editable and reflected in execution risk check

### UX Polish
- [ ] Empty states exist for all major tables/lists (positions, runs, policies, audit events)
- [ ] Error states show actionable messages (not "undefined" or generic 500)
- [ ] Loading states (spinners) shown during all async operations
- [ ] No console errors in a standard happy-path walkthrough
