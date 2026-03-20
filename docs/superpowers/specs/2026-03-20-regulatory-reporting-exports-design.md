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
| `docs/architecture/API_CONTRACTS.md` | Add 4 new endpoint entries |

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

**Output XML structure** — uses prefixed namespace to match existing codebase convention:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ordr:hedgeAccountingEvidence xmlns:ordr="urn:ordr:hedge-accounting:2024" standard="IFRS_9">
  <ordr:header>
    <runId>...</runId>
    <standard>IFRS_9</standard>
    <methodologyVersion>...</methodologyVersion>
    <generatedAt>...</generatedAt>
    <generatedBy>...</generatedBy>
    <runHash>...</runHash>
    <inputsHash>...</inputsHash>
    <outputsHash>...</outputsHash>
  </ordr:header>
  <ordr:hedgeDesignation>
    <datasetName>...</datasetName>
    <currencyPair>...</currencyPair>
    <hedgeType>...</hedgeType>
    <periodCount>N</periodCount>
  </ordr:hedgeDesignation>
  <ordr:effectivenessResults>
    <overallEffective>true</overallEffective>
    <dollarOffsetRatio>0.97</dollarOffsetRatio>
    <regressionRSquared>0.94</regressionRSquared>
    <regressionSlope>0.96</regressionSlope>
    <thresholdLower>0.80</thresholdLower>
    <thresholdUpper>1.25</thresholdUpper>
  </ordr:effectivenessResults>
  <ordr:periods>
    <period seq="1">
      <periodStart>...</periodStart>
      <periodEnd>...</periodEnd>
      <hedgedItemChange>...</hedgedItemChange>
      <hedgingInstrumentChange>...</hedgingInstrumentChange>
      <offsetRatio>...</offsetRatio>
      <effective>true</effective>
    </period>
  </ordr:periods>
  <ordr:auditTrace>
    <!-- Intentionally mirrors <header> hashes for standalone trace verification -->
    <runHash>...</runHash>
    <inputsHash>...</inputsHash>
    <outputsHash>...</outputsHash>
    <traceNote>SHA-256 hash chain. Verify via GET /v1/hedge-effectiveness/runs/{run_id}/export</traceNote>
  </ordr:auditTrace>
</ordr:hedgeAccountingEvidence>
```

**Rules:**
- Pure function, no DB/IO
- Uses `_x()` and `_now_iso()` helpers already in the file
- Uses `ordr:` prefix to match existing codebase namespace convention (`isda:`, `emir:`, `mifid:`)
- `standard` appears in the root element attribute and inner `<standard>` tag
- `thresholdLower` / `thresholdUpper` are always `0.80` / `1.25` (same for IFRS 9 and ASC 815)
- `<auditTrace>` duplication of header hashes is intentional — enables standalone trace verification
- If `periods` is empty, emit `<ordr:periods/>` self-closing

---

## Task 2: ISDA + FINRA-17a4 endpoints in `v1_reports.py`

**File:** `backend/app/api/routes/v1_reports.py`

Update import (alongside existing regulatory imports):
```python
from app.services.regulatory_export import (
    export_emir_xml,
    export_mifid_xml,
    export_dodd_frank,
    export_isda_xml,      # ADD
    export_finra_17a4,    # ADD
)
```

**Endpoint 1 — ISDA XML:**
```python
@router.get("/{run_id}/isda")
async def download_isda(run_id, session, current_user):
    """GET /v1/reports/{run_id}/isda — ISDA XML trade confirmation. Requires reports.export."""
```
- `await _require(session, current_user, "reports.export")`
- Fetch run via `_fetch_run(session, run_id, current_user.company_id)` — 404 if not found
- Fetch positions via `_fetch_positions(session, run.position_ids or [], current_user.company_id)`
- Build `run_data` via `await _build_reg_run_data(run, current_user, run_id, session)` — provides `run_id`, `trade_date`, `value_date`, `reporting_entity_lei`, etc. Then supplement with ISDA-specific keys that `export_isda_xml` reads from `run_data` (`counterparty`, `currency_base`, `currency_quote`, `notional`, `rate`):
  ```python
  run_data = await _build_reg_run_data(run, current_user, run_id, session)
  envelope = run.run_envelope or {}
  hedge_plan = envelope.get("hedge_plan") or {}
  buckets = hedge_plan.get("buckets", [])
  # Supplement with ISDA trade-level keys from run envelope
  run_data["counterparty"] = run_data.get("counterparty_lei", "")
  run_data["currency_base"] = hedge_plan.get("base_currency", "")
  run_data["currency_quote"] = hedge_plan.get("quote_currency", "USD")
  run_data["notional"] = str(hedge_plan.get("total_notional", ""))
  run_data["rate"] = str(hedge_plan.get("blended_rate", ""))
  ```
- Build `transactions` by mapping hedge plan buckets to ISDA transaction shape. The `export_isda_xml` second parameter is `transactions: list[dict]` expecting keys `transaction_id`, `direction`, `currency`, `amount`, `rate`, `value_date`. Map from `buckets`:
  ```python
  transactions = [
      {
          "transaction_id": str(b.get("position_id", ""))[:12] or f"TXN-{i}",
          "direction": "BUY" if float(b.get("hedge_notional", 0) or 0) >= 0 else "SELL",
          "currency": b.get("currency", ""),
          "amount": str(abs(float(b.get("hedge_notional", 0) or 0))),
          "rate": str(b.get("hedge_rate", "")),
          "value_date": b.get("value_date", ""),
      }
      for i, b in enumerate(buckets)
  ]
  ```
  Note: if the run envelope does not contain these keys, the fields default to empty string — structurally valid XML, semantically incomplete. This is acceptable for v1 since the platform does not yet have a structured counterparty registry.
- Call `export_isda_xml(run_data, transactions)`
- Emit: `await _emit_report_audit(session, current_user, run_id, "isda")`
- Return `StreamingResponse(io.BytesIO(content.encode()), media_type="application/xml")`, filename `isda-{run_id[:8]}.xml`

**Endpoint 2 — FINRA 17a-4:**
```python
@router.get("/{run_id}/finra-17a4")
async def download_finra(run_id, session, current_user):
    """GET /v1/reports/{run_id}/finra-17a4 — FINRA 17a-4 immutable record. Requires reports.export."""
```
- Same auth + fetch pattern
- `run_data` via `_build_reg_run_data` — relevant keys used by `export_finra_17a4`: `run_id`, `generated_by`, `report_date`
- `findings` from `(run.run_envelope or {}).get("findings", [])` — each must have `finding_id`, `timestamp`, `category`, `severity`, `description`; pass `[]` if absent
- `hash_chain` — last 10 audit event hashes (same pattern as Dodd-Frank endpoint)
- Call `export_finra_17a4(run_data, findings, hash_chain)`
- Emit: `await _emit_report_audit(session, current_user, run_id, "finra-17a4")`
- Return `text/plain`, filename `finra-17a4-{run_id[:8]}.txt`

---

## Task 3: IFRS 9 / ASC 815 endpoints in `v1_hedge_effectiveness.py`

**File:** `backend/app/api/routes/v1_hedge_effectiveness.py`

Add import:
```python
from app.services.regulatory_export import export_ifrs9_xml
```

**Helper** (pure mapping function, no async needed):
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

**Shared fetch pattern** (both endpoints use this exact query — tenant isolation via `company_id`):
```python
stmt = (
    select(HedgeEffectivenessRun, HedgeEffectivenessDataset)
    .join(HedgeEffectivenessDataset, HedgeEffectivenessDataset.id == HedgeEffectivenessRun.dataset_id)
    .where(
        HedgeEffectivenessRun.id == uuid.UUID(run_id),
        HedgeEffectivenessRun.company_id == company_id,  # REQUIRED — tenant scope
    )
)
result = await session.execute(stmt)
row = result.one_or_none()
if not row:
    raise HTTPException(status_code=404, detail="Assessment run not found.")
run, ds = row
```

**Endpoint 1 — IFRS 9:**
```python
@router.get("/runs/{run_id}/ifrs9-xml")
async def export_ifrs9(run_id, session, current_user):
    """GET /v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml — IFRS 9 evidence XML."""
```
- Fetch run+dataset using shared pattern above (company_id from `current_user.company_id`)
- `results = { "dollar_offset_ratio": run.dollar_offset_ratio, "regression_r_squared": run.regression_r_squared, "regression_slope": run.regression_slope, "overall_effective": run.overall_effective }`
- `report = run.report_json if isinstance(run.report_json, dict) else json.loads(run.report_json or "{}")`
- `periods = report.get("periods", [])`
- Call `export_ifrs9_xml(_build_ifrs9_run_data(run, ds, current_user), results, periods, standard="IFRS_9")`
- Emit audit using the existing `emit_audit` signature from `app.services.audit_emit`:
  ```python
  await emit_audit(
      session=session,
      user=current_user,
      event_type="SYSTEM",
      description=f"Regulatory export: ifrs9-xml run_id={run_id}",
      entity_type="hedge_effectiveness_run",
      entity_id=run_id,
      payload={"format": "ifrs9-xml"},
  )
  ```
- Return `StreamingResponse`, `application/xml`, filename `ifrs9-evidence-{run_id[:8]}.xml`

**Endpoint 2 — ASC 815:**
- Identical to above, `standard="ASC_815"`, filename `asc815-evidence-{run_id[:8]}.xml`
- Audit description: `f"Regulatory export: asc815-xml run_id={run_id}"`, payload `{"format": "asc815-xml"}`

---

## Task 4: `RegulatoryTab.tsx` — extend with two sections

**File:** `frontend/src/app/reports/components/tabs/RegulatoryTab.tsx`

### Interface additions
Define a separate interface for hedge accounting cards (avoids TypeScript error from missing `formatColor`/`icon` on `FormatCard`):
```typescript
interface EffFormatCard {
  id: string;
  title: string;
  description: string;
  format: string;
  formatColor: string;   // always T.accent for XML
  endpoint: (runId: string) => string;
  filename: (runId: string) => string;
  icon: typeof FileCode2;
}
```

### State additions
```typescript
const [effRuns, setEffRuns] = useState<RunOption[]>([]);
const [selectedEffRun, setSelectedEffRun] = useState<string>("");
const [effLoading, setEffLoading] = useState(true);
const [downloadingEff, setDownloadingEff] = useState<string | null>(null);
```

### Data fetch — `fetchEffRuns`
```typescript
const fetchEffRuns = useCallback(async () => {
  setEffLoading(true);
  try {
    const res = await dashboardFetch("/v1/hedge-effectiveness/runs", token);
    if (res.ok) {
      const data = await res.json();
      const items: Array<{ run_id?: string; standard?: string; overall_effective?: boolean; created_at?: string }> =
        Array.isArray(data) ? data : data.items ?? [];
      setEffRuns(
        items.map((r) => {
          const id = r.run_id ?? "";   // API returns run_id, not id
          const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : "";
          const pass = r.overall_effective ? "✓ PASS" : "✗ FAIL";
          return { id, label: `${id.slice(0, 8)} — ${r.standard ?? ""} ${pass} ${date}` };
        }),
      );
    }
  } catch { setEffRuns([]); }
  finally { setEffLoading(false); }
}, [token]);
```

Add `fetchEffRuns()` to the existing `useEffect`.

### `FORMAT_CARDS` additions (2 new entries, appended to existing array)
```typescript
{
  id: "isda",
  title: "ISDA XML",
  description: "ISDA trade confirmation envelope for FX derivative documentation",
  format: "XML",
  formatColor: T.accent,
  endpoint: (runId) => `/v1/reports/${runId}/isda`,
  filename: (runId) => `isda-${runId.slice(0, 8)}.xml`,   // matches backend Content-Disposition
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

### `EFF_FORMAT_CARDS` constant
```typescript
const EFF_FORMAT_CARDS: EffFormatCard[] = [
  {
    id: "ifrs9",
    title: "IFRS 9 Evidence",
    description: "Hedge accounting evidence XML — designation, effectiveness ratios, period results, audit trace",
    format: "XML",
    formatColor: T.accent,
    endpoint: (runId) => `/v1/hedge-effectiveness/runs/${runId}/ifrs9-xml`,
    filename: (runId) => `ifrs9-evidence-${runId.slice(0, 8)}.xml`,
    icon: FileCode2,
  },
  {
    id: "asc815",
    title: "ASC 815 Evidence",
    description: "US GAAP hedge accounting evidence XML — same structure, ASC 815 standard flag",
    format: "XML",
    formatColor: T.accent,
    endpoint: (runId) => `/v1/hedge-effectiveness/runs/${runId}/asc815-xml`,
    filename: (runId) => `asc815-evidence-${runId.slice(0, 8)}.xml`,
    icon: FileCode2,
  },
];
```

### `handleEffDownload` function (separate from existing `handleDownload`)
```typescript
const handleEffDownload = async (card: EffFormatCard) => {
  if (!selectedEffRun) return;
  setDownloadingEff(card.id);
  try {
    const res = await dashboardFetch(card.endpoint(selectedEffRun), token);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = card.filename(selectedEffRun);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  } catch { /* silent */ }
  finally { setDownloadingEff(null); }
};
```

### Layout structure
```
<div>
  {LEI status banner}                         ← unchanged

  {/* Section 1 */}
  <SectionLabel>TRADE REPOSITORY FILINGS</SectionLabel>
  {calc run selector}                         ← unchanged (selectedRun)
  <div grid>                                  ← 7 cards
    {FORMAT_CARDS.map(card => (
      <FormatCardUI card={card}
        isDisabled={!selectedRun}
        isDownloading={downloading === card.id}
        onDownload={() => handleDownload(card)} />
    ))}
  </div>

  {/* Divider */}
  <hr style={{ margin: "32px 0", borderColor: T.rim }} />

  {/* Section 2 */}
  <SectionLabel>HEDGE ACCOUNTING EVIDENCE</SectionLabel>
  {eff run selector}                          ← new (selectedEffRun)
    disabled={effLoading}, opacity 0.6 while effLoading
  {effLoading
    ? null   ← selector shows "Loading..." already
    : effRuns.length === 0
      ? <EmptyState link="/hedge-effectiveness" />
      : <div grid>
          {EFF_FORMAT_CARDS.map(card => (
            <EffCardUI card={card}
              isDisabled={!selectedEffRun}
              isDownloading={downloadingEff === card.id}
              onDownload={() => handleEffDownload(card)} />
          ))}
        </div>
  }

  {disclaimer}                                ← unchanged, at bottom
</div>
```

---

## Task 5: Update `API_CONTRACTS.md`

**File:** `docs/architecture/API_CONTRACTS.md`

Add entries for all 4 new endpoints:

| Endpoint | Method | Auth | Permission | Response |
|----------|--------|------|------------|----------|
| `/v1/reports/{run_id}/isda` | GET | JWT | `reports.export` | `application/xml` — ISDA trade confirmation |
| `/v1/reports/{run_id}/finra-17a4` | GET | JWT | `reports.export` | `text/plain` — FINRA 17a-4 immutable record |
| `/v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml` | GET | JWT | tenant-scoped | `application/xml` — IFRS 9 evidence binder |
| `/v1/hedge-effectiveness/runs/{run_id}/asc815-xml` | GET | JWT | tenant-scoped | `application/xml` — ASC 815 evidence binder |

---

## Testing

**Backend — unit tests:**
- `backend/tests/services/test_regulatory_export.py` — test `export_ifrs9_xml()`:
  - Verify root element tag contains `ordr:hedgeAccountingEvidence`
  - Verify `standard="IFRS_9"` attribute on root element
  - Verify `<overallEffective>` tag present
  - Verify period count matches input list length
  - Verify `standard="ASC_815"` when passed explicitly

**Backend — route smoke tests:**
- `backend/tests/api/test_v1_reports_regulatory.py` — ISDA + FINRA-17a4:
  - Mock `_fetch_run` to return a fake run, mock service functions
  - Assert status 200, correct content-type header, content-disposition filename
  - Assert 404 when run not found

- `backend/tests/api/test_v1_hedge_effectiveness_export.py` — IFRS9 + ASC815:
  - Same pattern — mock DB query, assert 200 + content-type

**Frontend:**
- `npx tsc --noEmit` — must pass clean
- `npx next build` — must pass clean

---

## Completion Criteria

- [ ] `export_ifrs9_xml()` passes unit tests (IFRS_9 and ASC_815 variants)
- [ ] All 4 new endpoints return correct content-type and filename headers
- [ ] ISDA and FINRA-17a4 endpoints require `reports.export` permission and emit audit events
- [ ] IFRS9/ASC815 endpoints are tenant-scoped via `company_id` WHERE clause
- [ ] IFRS9/ASC815 endpoints emit audit events via `emit_audit`
- [ ] `RegulatoryTab` shows 7 trade repository cards + 2 hedge accounting cards
- [ ] Effectiveness run selector reads `run_id` field from API response (not `id`)
- [ ] Eff cards use `EffFormatCard` interface — `npx tsc --noEmit` clean
- [ ] Empty state shown when no effectiveness runs exist
- [ ] Cards visually disabled (opacity 0.6) while `effLoading` is true
- [ ] Frontend and backend filenames consistent for ISDA (`isda-{run_id[:8]}.xml`)
- [ ] `API_CONTRACTS.md` updated with 4 new endpoint entries
- [ ] `npx next build` clean
