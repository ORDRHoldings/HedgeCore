# Regulatory Reporting Exports — Implementation Design

**Goal:** Complete the regulatory export surface by wiring two missing trade repository endpoints, adding a structured IFRS 9 / ASC 815 XML export service function, and extending the existing RegulatoryTab with a second "Hedge Accounting Evidence" section.

**Architecture:** All changes are additive. No new pages, no new nav entries, no frozen files touched. Two new backend endpoints wired in `v1_reports.py`, two new endpoints in `v1_hedge_effectiveness.py`, one new service function in `regulatory_export.py`, and `RegulatoryTab.tsx` extended in-place.

**Tech Stack:** FastAPI (Python), SQLAlchemy async, Next.js 15 App Router, TypeScript, `dashboardFetch`, inline styles with CSS variables.

---

## Current State

### What already works
- `regulatory_export.py` — 5 pure export functions: `export_isda_xml`, `export_finra_17a4`, `export_emir_xml`, `export_mifid_xml`, `export_dodd_frank`
- API endpoints wired: EMIR (`/{run_id}/emir`), MiFID II (`/{run_id}/mifid`), Dodd-Frank (`/{run_id}/dodd-frank`), Bank PDF (`/{run_id}/bank-pdf`), ZIP (`/export/zip/{run_id}`)
- Frontend `RegulatoryTab.tsx` — 5 format cards, calc-run selector, LEI status banner, download handler, wired into `reports/page.tsx`
- `v1_hedge_effectiveness.py` — full IFRS 9/ASC 815 effectiveness engine with JSON export at `/runs/{run_id}/export`
- `v1_regulatory_settings.py` — LEI configuration endpoints

### What is missing
1. `export_isda_xml` and `export_finra_17a4` exist in the service but have no API endpoints
2. Hedge effectiveness export is JSON only — no downloadable structured document
3. No IFRS 9 / ASC 815 cards or effectiveness run picker in `RegulatoryTab`

---

## File Map

| File | Change |
|------|--------|
| `backend/app/services/regulatory_export.py` | Add `export_ifrs9_xml()` |
| `backend/app/api/routes/v1_reports.py` | Add `GET /{run_id}/isda`, `GET /{run_id}/finra-17a4` |
| `backend/app/api/routes/v1_hedge_effectiveness.py` | Add `GET /runs/{run_id}/ifrs9-xml`, `GET /runs/{run_id}/asc815-xml` |
| `frontend/src/app/reports/components/tabs/RegulatoryTab.tsx` | Restructure into two sections, add 4 new cards |

---

## Task 1: `export_ifrs9_xml()` service function

**File:** `backend/app/services/regulatory_export.py`

Add a new pure function:

```python
def export_ifrs9_xml(
    run_data: dict,
    results: dict,
    periods: list[dict],
    *,
    standard: str = "IFRS_9",
) -> str:
```

**Parameters:**
- `run_data` — `run_id`, `dataset_name`, `currency_pair`, `hedge_type`, `methodology_version`, `generated_by`, `run_hash`, `inputs_hash`, `outputs_hash`
- `results` — `dollar_offset_ratio`, `regression_r_squared`, `regression_slope`, `overall_effective` (bool)
- `periods` — list of dicts with `period_start`, `period_end`, `hedged_change`, `instrument_change`, `ratio`, `effective` (bool)
- `standard` — `"IFRS_9"` or `"ASC_815"`

**Output XML structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<hedgeAccountingEvidence xmlns="urn:ordr:hedge-accounting:2024" standard="IFRS_9">
  <header>
    <runId>...</runId>
    <standard>IFRS_9</standard>          <!-- or ASC_815 -->
    <methodologyVersion>...</methodologyVersion>
    <generatedAt>...</generatedAt>
    <generatedBy>...</generatedBy>
    <runHash>...</runHash>
    <inputsHash>...</inputsHash>
    <outputsHash>...</outputsHash>
  </header>
  <hedgeDesignation>
    <datasetName>...</datasetName>
    <currencyPair>...</currencyPair>
    <hedgeType>...</hedgeType>           <!-- CASH_FLOW / FAIR_VALUE / NET_INVESTMENT -->
    <periodCount>N</periodCount>
  </hedgeDesignation>
  <effectivenessResults>
    <overallEffective>true</overallEffective>
    <dollarOffsetRatio>0.97</dollarOffsetRatio>
    <regressionRSquared>0.94</regressionRSquared>
    <regressionSlope>0.96</regressionSlope>
    <thresholdLower>0.80</thresholdLower>   <!-- IFRS 9: 80-125% / ASC 815: 80-125% -->
    <thresholdUpper>1.25</thresholdUpper>
  </effectivenessResults>
  <periods>
    <period seq="1">
      <periodStart>...</periodStart>
      <periodEnd>...</periodEnd>
      <hedgedItemChange>...</hedgedItemChange>
      <hedgingInstrumentChange>...</hedgingInstrumentChange>
      <offsetRatio>...</offsetRatio>
      <effective>true</effective>
    </period>
    <!-- ... -->
  </periods>
  <auditTrace>
    <runHash>...</runHash>
    <inputsHash>...</inputsHash>
    <outputsHash>...</outputsHash>
    <traceNote>SHA-256 hash chain. Verify via GET /v1/hedge-effectiveness/runs/{run_id}/export</traceNote>
  </auditTrace>
</hedgeAccountingEvidence>
```

**Rules:**
- Pure function, no DB/IO
- Uses `_x()` and `_now_iso()` helpers already in the file
- `standard` appears in the root element attribute and `<standard>` tag
- `thresholdLower` / `thresholdUpper` are always `0.80` / `1.25` (same for IFRS 9 and ASC 815)
- If `periods` is empty, emit `<periods/>` self-closing

---

## Task 2: ISDA + FINRA-17a4 endpoints in `v1_reports.py`

**File:** `backend/app/api/routes/v1_reports.py`

Add import at top (alongside existing regulatory imports):
```python
from app.services.regulatory_export import (
    export_emir_xml,
    export_mifid_xml,
    export_dodd_frank,
    export_isda_xml,      # ADD
    export_finra_17a4,    # ADD
)
```

**Endpoint 1:**
```python
@router.get("/{run_id}/isda")
async def download_isda(run_id, session, current_user):
    """GET /v1/reports/{run_id}/isda — ISDA XML trade confirmation. Requires reports.export."""
```
- `await _require(session, current_user, "reports.export")`
- Fetch run via `_fetch_run`, positions via `_fetch_positions`
- Extract `buckets` from `run.run_envelope.hedge_plan.buckets`
- Call `export_isda_xml(run_data, buckets)` — `run_data` maps to `export_isda_xml` parameter shape (run_id, trade_date, value_date, counterparty, currency_base, currency_quote, notional, rate); populate from run envelope where available, default empty string otherwise
- Emit audit event via `_emit_report_audit(session, current_user, run_id, "isda")`
- Return `StreamingResponse` with `application/xml`, filename `isda-{run_id[:8]}.xml`

**Endpoint 2:**
```python
@router.get("/{run_id}/finra-17a4")
async def download_finra(run_id, session, current_user):
    """GET /v1/reports/{run_id}/finra-17a4 — FINRA 17a-4 immutable record. Requires reports.export."""
```
- Same auth pattern
- Build `findings` list from `run.run_envelope.get("findings", [])` — each finding needs `finding_id`, `timestamp`, `category`, `severity`, `description`; if `findings` is empty, pass `[]`
- Fetch last 10 audit event hashes as `hash_chain` (same pattern as Dodd-Frank endpoint)
- Call `export_finra_17a4(run_data, findings, hash_chain)`
- Return `text/plain`, filename `finra-17a4-{run_id[:8]}.txt`

---

## Task 3: IFRS 9 / ASC 815 endpoints in `v1_hedge_effectiveness.py`

**File:** `backend/app/api/routes/v1_hedge_effectiveness.py`

Add import:
```python
from app.services.regulatory_export import export_ifrs9_xml
```

**Helper** (private, add near bottom):
```python
def _build_ifrs9_run_data(run, ds, current_user) -> dict:
    return {
        "run_id": str(run.id),
        "dataset_name": ds.name,
        "currency_pair": ds.currency_pair or "",
        "hedge_type": ds.hedge_type or "",
        "methodology_version": run.methodology_version or "1.0",
        "generated_by": current_user.email,
        "run_hash": run.run_hash or "",
        "inputs_hash": run.inputs_hash or "",
        "outputs_hash": run.outputs_hash or "",
    }
```

**Endpoint 1:**
```python
@router.get("/runs/{run_id}/ifrs9-xml")
async def export_ifrs9(run_id, session, current_user):
    """GET /v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml — IFRS 9 evidence XML."""
```
- Fetch `HedgeEffectivenessRun` + `HedgeEffectivenessDataset` (same join as existing `/export` endpoint)
- Extract `periods` from `run.report_json.get("periods", [])`
- Extract `results` from run ORM fields: `dollar_offset_ratio`, `regression_r_squared`, `regression_slope`, `overall_effective`
- Call `export_ifrs9_xml(run_data, results, periods, standard="IFRS_9")`
- Return `StreamingResponse`, `application/xml`, filename `ifrs9-evidence-{run_id[:8]}.xml`

**Endpoint 2:**
```python
@router.get("/runs/{run_id}/asc815-xml")
async def export_asc815(run_id, session, current_user):
    """GET /v1/hedge-effectiveness/runs/{run_id}/asc815-xml — ASC 815 evidence XML."""
```
- Identical to above, `standard="ASC_815"`, filename `asc815-evidence-{run_id[:8]}.xml`

---

## Task 4: `RegulatoryTab.tsx` — extend with two sections

**File:** `frontend/src/app/reports/components/tabs/RegulatoryTab.tsx`

### State additions
```typescript
const [effRuns, setEffRuns] = useState<RunOption[]>([]);
const [selectedEffRun, setSelectedEffRun] = useState<string>("");
const [effLoading, setEffLoading] = useState(true);
```

### Data fetch additions
`fetchEffRuns` — `GET /v1/hedge-effectiveness/runs`:
```typescript
const fetchEffRuns = useCallback(async () => {
  setEffLoading(true);
  try {
    const res = await dashboardFetch("/v1/hedge-effectiveness/runs", token);
    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.items ?? [];
      setEffRuns(items.map((r) => ({
        id: r.id,
        label: `${r.id.slice(0, 8)} — ${r.standard ?? ""} ${r.overall_effective ? "✓" : "✗"} ${r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}`,
      })));
    }
  } catch { setEffRuns([]); }
  finally { setEffLoading(false); }
}, [token]);
```

Add `fetchEffRuns()` to the `useEffect`.

### FORMAT_CARDS update
Add to existing array:
```typescript
{
  id: "isda",
  title: "ISDA XML",
  description: "ISDA trade confirmation envelope for FX derivative documentation",
  format: "XML",
  formatColor: T.accent,
  endpoint: (runId) => `/v1/reports/${runId}/isda`,
  filename: (runId) => `isda-confirmation-${runId.slice(0, 8)}.xml`,
  icon: FileCode2,
},
{
  id: "finra-17a4",
  title: "FINRA 17a-4",
  description: "Immutable record format with SHA-256 hash chain for SEC/FINRA compliance",
  format: "TXT",
  formatColor: T.warn,
  endpoint: (runId) => `/v1/reports/${runId}/finra-17a4`,
  filename: (runId) => `finra-17a4-${runId.slice(0, 8)}.txt`,
  icon: FileText,
},
```

### New `EFF_FORMAT_CARDS` constant
```typescript
const EFF_FORMAT_CARDS = [
  {
    id: "ifrs9",
    title: "IFRS 9 Evidence",
    description: "Hedge accounting evidence XML — designation, effectiveness ratios, period results, audit trace",
    format: "XML",
    endpoint: (runId: string) => `/v1/hedge-effectiveness/runs/${runId}/ifrs9-xml`,
    filename: (runId: string) => `ifrs9-evidence-${runId.slice(0, 8)}.xml`,
  },
  {
    id: "asc815",
    title: "ASC 815 Evidence",
    description: "US GAAP hedge accounting evidence XML — same structure, ASC 815 standard flag",
    format: "XML",
    endpoint: (runId: string) => `/v1/hedge-effectiveness/runs/${runId}/asc815-xml`,
    filename: (runId: string) => `asc815-evidence-${runId.slice(0, 8)}.xml`,
  },
];
```

### Layout structure
```
<div>                                    ← outer wrapper
  {LEI status banner}                    ← unchanged

  <SectionHeader>TRADE REPOSITORY FILINGS</SectionHeader>
  {calc run selector}                    ← unchanged
  <div grid>                             ← 7 cards (existing 5 + ISDA + FINRA)
    {FORMAT_CARDS.map(...)}
  </div>

  <Divider />                            ← <hr> with section label

  <SectionHeader>HEDGE ACCOUNTING EVIDENCE</SectionHeader>
  {eff run selector}                     ← new, loads from /hedge-effectiveness/runs
  {effRuns.length === 0 && !effLoading
    ? <EmptyState "No effectiveness assessments — run one at /hedge-effectiveness" />
    : <div grid>{EFF_FORMAT_CARDS.map(...)}</div>
  }

  {disclaimer}                           ← unchanged, moved to bottom
</div>
```

The `handleDownload` function is reused for both sections — pass `card.endpoint(selectedEffRun)` for eff cards. Add a second download state `downloadingEff` to avoid collision with `downloading`.

---

## Testing

**Backend:**
- `test_regulatory_export.py` — unit test `export_ifrs9_xml()` with sample data: verify root element has `standard` attribute, verify `<overallEffective>` tag present, verify periods serialised
- `test_v1_reports_regulatory.py` — smoke test ISDA and FINRA-17a4 endpoints return 200 with correct content-type (mock `_fetch_run` and service calls)
- `test_v1_hedge_effectiveness_export.py` — smoke test IFRS9 and ASC815 endpoints return 200

**Frontend:**
- TypeScript check: `npx tsc --noEmit`
- Build check: `npx next build`

---

## Completion Criteria

- [ ] `export_ifrs9_xml()` passes unit tests
- [ ] All 4 new endpoints return correct content-type and filename headers
- [ ] ISDA and FINRA-17a4 endpoints require `reports.export` permission and emit audit events
- [ ] IFRS9/ASC815 endpoints are tenant-scoped (company_id filter on run fetch)
- [ ] `RegulatoryTab` shows 7 trade repository cards + 2 hedge accounting cards
- [ ] Effectiveness run selector loads from live API with standard + pass/fail label
- [ ] Empty state shown when no effectiveness runs exist
- [ ] `npx tsc --noEmit` clean
- [ ] `npx next build` clean
