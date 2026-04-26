# Regulatory Reporting Exports Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ISDA XML, FINRA 17a-4, IFRS 9 XML, and ASC 815 XML downloads to the Reports Studio regulatory tab, backed by new service and route functions.

**Architecture:** New pure service function `export_ifrs9_xml` in the existing `regulatory_export.py`. Two new endpoints in `v1_reports.py` (ISDA, FINRA-17a4) mirroring the EMIR/MiFID/Dodd-Frank pattern. Two new endpoints in `v1_hedge_effectiveness.py` (IFRS9 XML, ASC815 XML). `RegulatoryTab.tsx` extended with ISDA + FINRA-17a4 cards in the existing trade-repository section and a new hedge-accounting section (IFRS9 + ASC815).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, Next.js 15.5, TypeScript 5.9, pytest

---

## Chunk 1: Service layer — export_ifrs9_xml

### Task 1: Add `export_ifrs9_xml` to `regulatory_export.py`

**Files:**
- Modify: `backend/app/services/regulatory_export.py`
- Test: `backend/tests/test_regulatory_export.py`

- [ ] **Step 1: Write failing tests**

Add this class at the bottom of `backend/tests/test_regulatory_export.py`, after `TestExportDoddFrank`:

```python
# ---------------------------------------------------------------------------
# IFRS 9 / ASC 815 XML tests
# ---------------------------------------------------------------------------

def _sample_eff_run_data() -> dict:
    return {
        "run_id": "eff-run-001",
        "standard": "IFRS_9",
        "hedge_type": "cash_flow",
        "currency_pair": "EUR/USD",
        "designation_date": "2026-01-01",
        "methodology_version": "1.0.0",
        "overall_effective": True,
        "dollar_offset_ratio": 0.978,
        "dollar_offset_effective": True,
        "regression_r_squared": 0.9923,
        "regression_slope": -0.995,
        "regression_effective": True,
        "run_hash": "abc123def456",
        "inputs_hash": "aaabbbccc111",
        "outputs_hash": "ddd222eee333",
        "dataset_name": "Q1 2026 EUR hedges",
        "generated_by": "audit_lab",
        "report_date": "2026-03-20",
    }


def _sample_eff_periods() -> list[dict]:
    return [
        {
            "period_index": 0,
            "period_date": "2026-01-31",
            "hedged_item_fv_change": -12500.0,
            "instrument_fv_change": 12250.0,
        },
        {
            "period_index": 1,
            "period_date": "2026-02-28",
            "hedged_item_fv_change": -8300.0,
            "instrument_fv_change": 8125.0,
        },
    ]


from app.services.regulatory_export import export_ifrs9_xml


class TestExportIfrs9Xml:
    def test_valid_xml(self) -> None:
        """Output must be well-formed XML."""
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        parseable = xml.replace("ordr:", "").replace("xmlns:ordr=", "xmlns=")
        ET.fromstring(parseable)

    def test_namespace_prefix(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert 'xmlns:ordr="urn:ordr:hedge-effectiveness:2024"' in xml

    def test_header_fields(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert "<runId>eff-run-001</runId>" in xml
        assert "<standard>IFRS_9</standard>" in xml
        assert "<hedgeType>cash_flow</hedgeType>" in xml
        assert "<currencyPair>EUR/USD</currencyPair>" in xml
        assert "<designationDate>2026-01-01</designationDate>" in xml
        assert "<methodologyVersion>1.0.0</methodologyVersion>" in xml
        assert "<generatedAt>" in xml

    def test_hedge_designation(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert "<datasetName>Q1 2026 EUR hedges</datasetName>" in xml

    def test_effectiveness_results(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert "<overallEffective>true</overallEffective>" in xml
        assert "<dollarOffsetRatio>0.978</dollarOffsetRatio>" in xml
        assert "<dollarOffsetEffective>true</dollarOffsetEffective>" in xml
        assert "<regressionRSquared>0.9923</regressionRSquared>" in xml
        assert "<regressionSlope>-0.995</regressionSlope>" in xml
        assert "<regressionEffective>true</regressionEffective>" in xml

    def test_periods_present(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert xml.count("<period seq=") == 2
        assert "<periodDate>2026-01-31</periodDate>" in xml
        assert "<hedgedItemFvChange>-12500.0</hedgedItemFvChange>" in xml
        assert "<instrumentFvChange>12250.0</instrumentFvChange>" in xml

    def test_empty_periods(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, [])
        parseable = xml.replace("ordr:", "").replace("xmlns:ordr=", "xmlns=")
        ET.fromstring(parseable)
        assert "<periods>" in xml
        assert "<period seq=" not in xml

    def test_audit_trace(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, [])
        assert "<runHash>abc123def456</runHash>" in xml
        assert "<inputsHash>aaabbbccc111</inputsHash>" in xml
        assert "<outputsHash>ddd222eee333</outputsHash>" in xml

    def test_missing_keys_default(self) -> None:
        xml = export_ifrs9_xml({}, {}, [])
        parseable = xml.replace("ordr:", "").replace("xmlns:ordr=", "xmlns=")
        ET.fromstring(parseable)
        assert "<runId></runId>" in xml

    def test_xml_escaping(self) -> None:
        run = _sample_eff_run_data()
        run["dataset_name"] = "Hedge & <Special>"
        xml = export_ifrs9_xml(run, {}, [])
        assert "Hedge &amp; &lt;Special&gt;" in xml

    def test_asc815_standard(self) -> None:
        """standard kwarg is honoured — affects header only."""
        xml = export_ifrs9_xml(
            _sample_eff_run_data(), {}, [], standard="ASC_815"
        )
        assert "<standard>ASC_815</standard>" in xml
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_regulatory_export.py::TestExportIfrs9Xml -x -q --tb=short
```

Expected: `ImportError` or `AttributeError` — `export_ifrs9_xml` does not exist yet.

- [ ] **Step 3: Implement `export_ifrs9_xml`**

Add this block to `backend/app/services/regulatory_export.py` just before the `# Internal helpers` section (after the Dodd-Frank function):

```python
# ---------------------------------------------------------------------------
# IFRS 9 / ASC 815 Hedge Effectiveness XML export
# ---------------------------------------------------------------------------

def export_ifrs9_xml(
    run_data: dict,
    results: dict,
    periods: list[dict],
    *,
    standard: str = "IFRS_9",
) -> str:
    """Generate IFRS 9 / ASC 815 hedge effectiveness evidence XML.

    Parameters
    ----------
    run_data : dict
        Assessment run metadata.  Expected keys:
          run_id, standard, hedge_type, currency_pair, designation_date,
          methodology_version, overall_effective, dollar_offset_ratio,
          dollar_offset_effective, regression_r_squared, regression_slope,
          regression_effective, run_hash, inputs_hash, outputs_hash,
          dataset_name, generated_by, report_date.
    results : dict
        Top-level effectiveness result dict (may be empty — data pulled from
        run_data for compatibility with the route layer).
    periods : list[dict]
        Per-period data points.  Each dict should contain:
          period_index, period_date, hedged_item_fv_change,
          instrument_fv_change.
    standard : str
        Override the accounting standard label (default "IFRS_9").

    Returns
    -------
    str
        Well-formed XML string for the hedge effectiveness evidence binder.
    """
    generated_at = _now_iso()
    used_standard = standard or run_data.get("standard", "IFRS_9")

    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ordr:hedgeEffectivenessReport xmlns:ordr="urn:ordr:hedge-effectiveness:2024">',
        "  <ordr:header>",
        f"    <runId>{_x(run_data.get('run_id', ''))}</runId>",
        f"    <standard>{_x(used_standard)}</standard>",
        f"    <hedgeType>{_x(run_data.get('hedge_type', ''))}</hedgeType>",
        f"    <currencyPair>{_x(run_data.get('currency_pair', ''))}</currencyPair>",
        f"    <designationDate>{_x(run_data.get('designation_date', ''))}</designationDate>",
        f"    <methodologyVersion>{_x(run_data.get('methodology_version', ''))}</methodologyVersion>",
        f"    <generatedAt>{generated_at}</generatedAt>",
        f"    <reportDate>{_x(run_data.get('report_date', generated_at[:10]))}</reportDate>",
        f"    <generatedBy>{_x(run_data.get('generated_by', ''))}</generatedBy>",
        "  </ordr:header>",
        "  <ordr:hedgeDesignation>",
        f"    <datasetName>{_x(run_data.get('dataset_name', ''))}</datasetName>",
        "  </ordr:hedgeDesignation>",
        "  <ordr:effectivenessResults>",
        f"    <overallEffective>{str(bool(run_data.get('overall_effective'))).lower()}</overallEffective>",
        f"    <dollarOffsetRatio>{_x(str(run_data.get('dollar_offset_ratio', '')))}</dollarOffsetRatio>",
        f"    <dollarOffsetEffective>{str(bool(run_data.get('dollar_offset_effective'))).lower()}</dollarOffsetEffective>",
        f"    <regressionRSquared>{_x(str(run_data.get('regression_r_squared', '')))}</regressionRSquared>",
        f"    <regressionSlope>{_x(str(run_data.get('regression_slope', '')))}</regressionSlope>",
        f"    <regressionEffective>{str(bool(run_data.get('regression_effective'))).lower()}</regressionEffective>",
        "  </ordr:effectivenessResults>",
        "  <ordr:periods>",
    ]

    for i, p in enumerate(periods, 1):
        lines.append(f'    <period seq="{i}">')
        lines.append(f"      <periodDate>{_x(p.get('period_date', ''))}</periodDate>")
        lines.append(f"      <hedgedItemFvChange>{_x(str(p.get('hedged_item_fv_change', '')))}</hedgedItemFvChange>")
        lines.append(f"      <instrumentFvChange>{_x(str(p.get('instrument_fv_change', '')))}</instrumentFvChange>")
        lines.append("    </period>")

    lines.append("  </ordr:periods>")
    lines.append("  <ordr:auditTrace>")
    lines.append(f"    <runHash>{_x(run_data.get('run_hash', ''))}</runHash>")
    lines.append(f"    <inputsHash>{_x(run_data.get('inputs_hash', ''))}</inputsHash>")
    lines.append(f"    <outputsHash>{_x(run_data.get('outputs_hash', ''))}</outputsHash>")
    lines.append("  </ordr:auditTrace>")
    lines.append("</ordr:hedgeEffectivenessReport>")

    return "\n".join(lines)
```

Also add `export_ifrs9_xml` to the module docstring at the top of the file (the line that reads `Provides five serialisation helpers:`).

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_regulatory_export.py -x -q --tb=short
```

Expected: All existing tests pass + all new `TestExportIfrs9Xml` tests pass (no failures).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/regulatory_export.py backend/tests/test_regulatory_export.py
git commit -m "feat(regulatory): add export_ifrs9_xml service function (IFRS 9 / ASC 815)"
```

---

## Chunk 2: Backend routes — ISDA + FINRA-17a4

### Task 2: Add ISDA and FINRA-17a4 endpoints to `v1_reports.py`

**Files:**
- Modify: `backend/app/api/routes/v1_reports.py`
- Test: `backend/tests/test_regulatory_export.py` (smoke tests via existing service — no new route tests needed; route wiring tested via integration)

- [ ] **Step 1: Write smoke test confirming import path works**

Add this to `backend/tests/test_regulatory_export.py` (at top-level, not inside a class):

```python
def test_isda_export_via_public_api() -> None:
    """Confirm export_isda_xml produces a full ISDA-namespace XML document."""
    xml = export_isda_xml(_sample_run(), _sample_transactions())
    assert xml.startswith("<?xml")
    assert 'xmlns:isda=' in xml
    assert "<runId>run-001</runId>" in xml
```

- [ ] **Step 2: Run to confirm it passes (it should — function already exists)**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_regulatory_export.py::test_isda_export_via_public_api -x -q --tb=short
```

Expected: PASS.

- [ ] **Step 3: Update the import block in `v1_reports.py`**

Locate this block near the top of `backend/app/api/routes/v1_reports.py`:

```python
from app.services.regulatory_export import (
    export_emir_xml,
    export_mifid_xml,
    export_dodd_frank,
)
```

Replace with:

```python
from app.services.regulatory_export import (
    export_dodd_frank,
    export_emir_xml,
    export_finra_17a4,
    export_isda_xml,
    export_mifid_xml,
)
```

- [ ] **Step 4: Add ISDA endpoint**

Add the following function to `backend/app/api/routes/v1_reports.py` after the `download_emir` function (after line ~815, before `@router.get("/{run_id}/mifid")`):

```python
@router.get("/{run_id}/isda")
async def download_isda(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/isda

    Generate ISDA-format XML trade confirmation for the given calculation run.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    run_data = await _build_reg_run_data(run, current_user, run_id, session)

    # Supplement with envelope fields expected by export_isda_xml
    envelope = run.run_envelope or {}
    run_data.setdefault("counterparty", envelope.get("counterparty", ""))
    run_data.setdefault("currency_base", envelope.get("currency_base", ""))
    run_data.setdefault("currency_quote", envelope.get("currency_quote", ""))
    run_data.setdefault("notional", envelope.get("notional", ""))
    run_data.setdefault("rate", envelope.get("rate", ""))

    # Build transaction list from hedge buckets
    hedge_plan = envelope.get("hedge_plan") or {}
    buckets: list[dict] = hedge_plan.get("buckets", [])
    transactions = [
        {
            "transaction_id": b.get("position_id", f"txn-{i}"),
            "direction": "BUY" if float(b.get("hedge_notional", 0) or 0) >= 0 else "SELL",
            "currency": b.get("currency", ""),
            "amount": abs(float(b.get("hedge_notional", 0) or 0)),
            "rate": b.get("hedge_rate", ""),
            "value_date": b.get("value_date", ""),
        }
        for i, b in enumerate(buckets, 1)
    ]

    content = export_isda_xml(run_data, transactions)

    await _emit_report_audit(session, current_user, run_id, "isda")
    logger.info("RPT-09: ISDA export run=%s user=%s", run_id, current_user.email)

    filename = f"isda-confirmation-{run_id[:8]}.xml"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/xml; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 5: Add FINRA 17a-4 endpoint**

Add the following function immediately after the ISDA endpoint (before `@router.get("/{run_id}/mifid")`):

```python
@router.get("/{run_id}/finra-17a4")
async def download_finra_17a4(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/finra-17a4

    Generate FINRA Rule 17a-4 immutable record for the given calculation run.
    Pipe-delimited text format with SHA-256 hash chain.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    run_data = await _build_reg_run_data(run, current_user, run_id, session)

    # Derive findings from run envelope audit flags
    envelope = run.run_envelope or {}
    findings_raw: list[dict] = (envelope.get("audit_flags") or [])
    findings = [
        {
            "finding_id": f.get("flag_id", f"F-{i:03d}"),
            "timestamp": f.get("timestamp", run_data.get("report_date", "")),
            "category": f.get("category", "AUDIT_FINDING"),
            "severity": f.get("severity", "INFO"),
            "description": f.get("description", ""),
        }
        for i, f in enumerate(findings_raw, 1)
    ]

    # Build hash chain from recent audit events
    from sqlalchemy import select as sa_select
    hash_q = (
        sa_select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == current_user.company_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(10)
    )
    hash_rows = (await session.execute(hash_q)).scalars().all()
    hash_chain = list(reversed(hash_rows)) if hash_rows else []

    content = export_finra_17a4(run_data, findings, hash_chain)

    await _emit_report_audit(session, current_user, run_id, "finra-17a4")
    logger.info("RPT-09: FINRA 17a-4 export run=%s user=%s", run_id, current_user.email)

    filename = f"finra-17a4-{run_id[:8]}.txt"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 6: Verify the file lints and imports are clean**

```bash
cd backend && python -c "from app.api.routes.v1_reports import router; print('OK')"
```

Expected: `OK` with no errors.

- [ ] **Step 7: Run full test suite to confirm no regressions**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
```

Expected: Same pass count as before (approximately 2725+), 0 failures.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/routes/v1_reports.py backend/tests/test_regulatory_export.py
git commit -m "feat(reports): add GET /{run_id}/isda and /{run_id}/finra-17a4 endpoints"
```

---

## Chunk 3: Backend routes — IFRS9 + ASC815

### Task 3: Add IFRS9 and ASC815 endpoints to `v1_hedge_effectiveness.py`

**Files:**
- Modify: `backend/app/api/routes/v1_hedge_effectiveness.py`

- [ ] **Step 1: Write failing smoke test**

Add this function to `backend/tests/test_regulatory_export.py`:

```python
def test_ifrs9_xml_round_trip() -> None:
    """export_ifrs9_xml with full run_data produces parseable XML with all key fields."""
    xml = export_ifrs9_xml(
        _sample_eff_run_data(),
        {},
        _sample_eff_periods(),
        standard="IFRS_9",
    )
    parseable = xml.replace("ordr:", "").replace("xmlns:ordr=", "xmlns=")
    root = ET.fromstring(parseable)
    assert root is not None
    assert "eff-run-001" in xml
    assert "<overallEffective>true</overallEffective>" in xml
    assert xml.count("<period seq=") == 2
```

- [ ] **Step 2: Run to confirm it passes**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_regulatory_export.py::test_ifrs9_xml_round_trip -x -q --tb=short
```

Expected: PASS.

- [ ] **Step 3: Add `export_ifrs9_xml` import to `v1_hedge_effectiveness.py`**

Locate this import near line 39 of `backend/app/api/routes/v1_hedge_effectiveness.py`:

```python
from app.services.audit_emit import emit_audit
```

Add below it:

```python
from app.services.regulatory_export import export_ifrs9_xml
```

- [ ] **Step 4: Add `_build_ifrs9_run_data` helper**

Add this helper function after the `_require` function (after ~line 49) in `v1_hedge_effectiveness.py`:

```python
def _build_ifrs9_run_data(
    run: HedgeEffectivenessRun,
    ds: HedgeEffectivenessDataset,
    current_user: User,
) -> dict:
    """Build run_data dict for export_ifrs9_xml from ORM objects."""
    return {
        "run_id": str(run.id),
        "standard": run.standard or "IFRS_9",
        "hedge_type": ds.hedge_type or "",
        "currency_pair": ds.currency_pair or "",
        "designation_date": ds.designation_date or "",
        "methodology_version": run.methodology_version or "",
        "overall_effective": run.overall_effective,
        "dollar_offset_ratio": float(run.dollar_offset_ratio) if run.dollar_offset_ratio is not None else None,
        "dollar_offset_effective": run.dollar_offset_effective,
        "regression_r_squared": float(run.regression_r_squared) if run.regression_r_squared is not None else None,
        "regression_slope": float(run.regression_slope) if run.regression_slope is not None else None,
        "regression_effective": run.regression_effective,
        "run_hash": run.run_hash or "",
        "inputs_hash": run.inputs_hash or "",
        "outputs_hash": run.outputs_hash or "",
        "dataset_name": ds.name or "",
        "generated_by": current_user.email,
        "report_date": datetime.now(UTC).strftime("%Y-%m-%d"),
    }
```

- [ ] **Step 5: Add `_fetch_eff_run_and_dataset` helper**

Add this helper directly after `_build_ifrs9_run_data`:

```python
async def _fetch_eff_run_and_dataset(
    session: AsyncSession,
    run_id: str,
    company_id,
) -> tuple[HedgeEffectivenessRun, HedgeEffectivenessDataset]:
    """Fetch HedgeEffectivenessRun + dataset, scoped to company_id. Raises 404 if not found."""
    stmt = (
        select(HedgeEffectivenessRun, HedgeEffectivenessDataset)
        .join(HedgeEffectivenessDataset, HedgeEffectivenessDataset.id == HedgeEffectivenessRun.dataset_id)
        .where(
            HedgeEffectivenessRun.id == uuid.UUID(run_id),
            HedgeEffectivenessRun.company_id == company_id,
        )
    )
    result = await session.execute(stmt)
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Assessment run not found.")
    return row
```

- [ ] **Step 6: Add IFRS9 XML endpoint**

Add this endpoint after the `export_run` endpoint (after ~line 580) in `v1_hedge_effectiveness.py`:

```python
@router.get("/runs/{run_id}/ifrs9-xml")
async def download_ifrs9_xml(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml

    Download IFRS 9 hedge effectiveness evidence as XML.
    Includes assessment results, periods, and audit trace hashes.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run, ds = await _fetch_eff_run_and_dataset(
        session, run_id, current_user.company_id
    )

    run_data = _build_ifrs9_run_data(run, ds, current_user)

    # Extract periods from stored dataset
    data = ds.data_json if isinstance(ds.data_json, list) else (
        json.loads(ds.data_json) if isinstance(ds.data_json, str) else []
    )
    periods = [
        {
            "period_index": p.get("period_index", i),
            "period_date": p.get("period_date", ""),
            "hedged_item_fv_change": float(p.get("hedged_item_fv_change", 0)),
            "instrument_fv_change": float(p.get("instrument_fv_change", 0)),
        }
        for i, p in enumerate(data)
    ]

    content = export_ifrs9_xml(run_data, {}, periods, standard="IFRS_9")

    await emit_audit(
        session=session,
        user=current_user,
        event_type="REGULATORY_EXPORT",
        description=f"IFRS 9 XML export for effectiveness run {run_id[:8]}",
        entity_type="hedge_effectiveness_run",
        entity_id=run_id,
        payload={"format": "ifrs9_xml", "run_id": run_id},
    )

    filename = f"ifrs9-evidence-{run_id[:8]}.xml"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/xml; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

Note: `StreamingResponse` and `io` must be imported. Add to the imports section:

```python
import io

from fastapi.responses import StreamingResponse
```

(Check if already present — if so skip.)

- [ ] **Step 7: Add ASC 815 XML endpoint**

Add immediately after the IFRS9 endpoint:

```python
@router.get("/runs/{run_id}/asc815-xml")
async def download_asc815_xml(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/hedge-effectiveness/runs/{run_id}/asc815-xml

    Download ASC 815 hedge effectiveness evidence as XML.
    Same structure as IFRS 9 export but labelled ASC_815.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run, ds = await _fetch_eff_run_and_dataset(
        session, run_id, current_user.company_id
    )

    run_data = _build_ifrs9_run_data(run, ds, current_user)
    run_data["standard"] = "ASC_815"

    data = ds.data_json if isinstance(ds.data_json, list) else (
        json.loads(ds.data_json) if isinstance(ds.data_json, str) else []
    )
    periods = [
        {
            "period_index": p.get("period_index", i),
            "period_date": p.get("period_date", ""),
            "hedged_item_fv_change": float(p.get("hedged_item_fv_change", 0)),
            "instrument_fv_change": float(p.get("instrument_fv_change", 0)),
        }
        for i, p in enumerate(data)
    ]

    content = export_ifrs9_xml(run_data, {}, periods, standard="ASC_815")

    await emit_audit(
        session=session,
        user=current_user,
        event_type="REGULATORY_EXPORT",
        description=f"ASC 815 XML export for effectiveness run {run_id[:8]}",
        entity_type="hedge_effectiveness_run",
        entity_id=run_id,
        payload={"format": "asc815_xml", "run_id": run_id},
    )

    filename = f"asc815-evidence-{run_id[:8]}.xml"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/xml; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 8: Verify import health**

```bash
cd backend && python -c "from app.api.routes.v1_hedge_effectiveness import router; print('OK')"
```

Expected: `OK`.

- [ ] **Step 9: Run full test suite**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
```

Expected: All pass, 0 failures.

- [ ] **Step 10: Commit**

```bash
git add backend/app/api/routes/v1_hedge_effectiveness.py backend/tests/test_regulatory_export.py
git commit -m "feat(hedge-effectiveness): add /ifrs9-xml and /asc815-xml download endpoints"
```

---

## Chunk 4: Frontend — RegulatoryTab extension

### Task 4: Extend `RegulatoryTab.tsx` with ISDA, FINRA-17a4, and hedge accounting exports

**Files:**
- Modify: `frontend/src/app/reports/components/tabs/RegulatoryTab.tsx`

- [ ] **Step 1: Plan the diff**

The current file has 5 format cards (EMIR, MiFID II, Dodd-Frank, Bank PDF, Audit ZIP). We need to:
1. Add ISDA and FINRA-17a4 cards to `FORMAT_CARDS` (2 new trade-repository cards)
2. Add a new `EffFormatCard` interface (separate from `FormatCard` to satisfy TypeScript)
3. Add `EFF_FORMAT_CARDS` constant (IFRS9, ASC815)
4. Add state: `effRuns`, `selectedEffRun`, `effLoading`, `downloadingEff`
5. Add `fetchEffRuns` function reading `r.run_id` from `/v1/hedge-effectiveness/runs`
6. Add `handleEffDownload` function
7. Add a second section below the existing section with a divider

- [ ] **Step 2: Add `EffFormatCard` interface and `EFF_FORMAT_CARDS` constant**

In `frontend/src/app/reports/components/tabs/RegulatoryTab.tsx`, add after the existing `FormatCard` interface definition and `FORMAT_CARDS` array:

```tsx
interface EffFormatCard {
  id: string;
  title: string;
  description: string;
  format: string;
  formatColor: string;
  endpoint: (runId: string) => string;
  filename: (runId: string) => string;
  icon: typeof FileCode2;
}

const EFF_FORMAT_CARDS: EffFormatCard[] = [
  {
    id: "ifrs9",
    title: "IFRS 9 Evidence XML",
    description: "Hedge effectiveness evidence binder under IAS 39 / IFRS 9 with audit trace hashes",
    format: "XML",
    formatColor: T.accent,
    endpoint: (runId) => `/v1/hedge-effectiveness/runs/${runId}/ifrs9-xml`,
    filename: (runId) => `ifrs9-evidence-${runId.slice(0, 8)}.xml`,
    icon: FileCode2,
  },
  {
    id: "asc815",
    title: "ASC 815 Evidence XML",
    description: "Hedge effectiveness evidence binder under US GAAP ASC 815 with audit trace hashes",
    format: "XML",
    formatColor: T.accent,
    endpoint: (runId) => `/v1/hedge-effectiveness/runs/${runId}/asc815-xml`,
    filename: (runId) => `asc815-evidence-${runId.slice(0, 8)}.xml`,
    icon: FileCode2,
  },
];
```

- [ ] **Step 3: Add ISDA and FINRA-17a4 cards to `FORMAT_CARDS`**

In the existing `FORMAT_CARDS` array, add these two entries before the `bank-pdf` card:

```tsx
  {
    id: "isda",
    title: "ISDA Trade Confirmation",
    description: "ISDA-format XML trade confirmation envelope with transaction legs",
    format: "XML",
    formatColor: T.accent,
    endpoint: (runId) => `/v1/reports/${runId}/isda`,
    filename: (runId) => `isda-confirmation-${runId.slice(0, 8)}.xml`,
    icon: FileCode2,
  },
  {
    id: "finra-17a4",
    title: "FINRA Rule 17a-4",
    description: "Immutable audit record with SHA-256 hash chain for books-and-records compliance",
    format: "TXT",
    formatColor: T.warn,
    endpoint: (runId) => `/v1/reports/${runId}/finra-17a4`,
    filename: (runId) => `finra-17a4-${runId.slice(0, 8)}.txt`,
    icon: FileText,
  },
```

- [ ] **Step 4: Add state variables and `fetchEffRuns`**

In the `RegulatoryTab` component body, add after the existing state declarations:

```tsx
  const [effRuns, setEffRuns] = useState<RunOption[]>([]);
  const [selectedEffRun, setSelectedEffRun] = useState<string>("");
  const [effLoading, setEffLoading] = useState(true);
  const [downloadingEff, setDownloadingEff] = useState<string | null>(null);
```

Add this callback after `fetchLeiStatus`:

```tsx
  const fetchEffRuns = useCallback(async () => {
    setEffLoading(true);
    try {
      const res = await dashboardFetch("/v1/hedge-effectiveness/runs?limit=50", token);
      if (res.ok) {
        const data = await res.json();
        const items: Array<{ run_id?: string; standard?: string; created_at?: string }> =
          Array.isArray(data) ? data : data.items ?? [];
        setEffRuns(
          items.map((r) => {
            const id = r.run_id ?? "";
            const std = r.standard ?? "";
            const date = r.created_at
              ? new Date(r.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "";
            return {
              id,
              label: `${id.slice(0, 8)}${std ? ` [${std}]` : ""}${date ? ` - ${date}` : ""}`,
            };
          }),
        );
      }
    } catch {
      setEffRuns([]);
    } finally {
      setEffLoading(false);
    }
  }, [token]);
```

Update `useEffect` to also call `fetchEffRuns`:

```tsx
  useEffect(() => {
    fetchRuns();
    fetchLeiStatus();
    fetchEffRuns();
  }, [fetchRuns, fetchLeiStatus, fetchEffRuns]);
```

- [ ] **Step 5: Add `handleEffDownload`**

Add after `handleDownload`:

```tsx
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
    } catch {
      // silently handle
    } finally {
      setDownloadingEff(null);
    }
  };
```

- [ ] **Step 6: Add hedge accounting section to JSX**

Add this block inside the return, after the existing `{/* Disclaimer */}` block (before the closing `</div>`):

```tsx
      {/* Hedge Accounting Evidence */}
      <hr style={{ border: "none", borderTop: `1px solid ${T.rim}`, margin: "32px 0" }} />

      <div style={{ marginBottom: 16 }}>
        <span style={{
          fontFamily: T.fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          color: T.tertiary,
        }}>
          HEDGE ACCOUNTING EVIDENCE — IFRS 9 / ASC 815
        </span>
      </div>

      {/* Effectiveness run selector */}
      <div style={{ marginBottom: 24, maxWidth: 420 }}>
        <label
          style={{
            display: "block",
            fontFamily: T.fontMono,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase" as const,
            color: T.tertiary,
            marginBottom: 8,
          }}
        >
          SELECT EFFECTIVENESS RUN
        </label>
        <select
          value={selectedEffRun}
          onChange={(e) => setSelectedEffRun(e.target.value)}
          disabled={effLoading}
          style={{
            width: "100%",
            fontFamily: T.fontMono,
            fontSize: 13,
            color: T.primary,
            background: T.bgPanel,
            border: `1px solid ${T.rim}`,
            borderRadius: 6,
            padding: "10px 14px",
            outline: "none",
            cursor: "pointer",
            appearance: "auto" as const,
          }}
        >
          <option value="">
            {effLoading ? "Loading runs..." : "-- Select an effectiveness run --"}
          </option>
          {effRuns.map((run) => (
            <option key={run.id} value={run.id}>
              {run.label}
            </option>
          ))}
        </select>
      </div>

      {/* Effectiveness format cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {EFF_FORMAT_CARDS.map((card) => {
          const isHovered = hoveredCard === card.id;
          const isDisabled = !selectedEffRun;
          const isDownloading = downloadingEff === card.id;
          const CardIcon = card.icon;

          return (
            <div
              key={card.id}
              onMouseEnter={() => setHoveredCard(card.id)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                background: T.bgPanel,
                border: `1px solid ${isHovered && !isDisabled ? T.accent : T.rim}`,
                borderRadius: 6,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                transition: "border-color 0.15s",
                opacity: isDisabled ? 0.6 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CardIcon size={20} color={T.secondary} />
                <span
                  style={{
                    fontFamily: T.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: card.formatColor,
                    background: T.bgSub,
                    border: `1px solid ${T.soft}`,
                    borderRadius: 3,
                    padding: "3px 8px",
                  }}
                >
                  {card.format}
                </span>
              </div>
              <span style={{ fontFamily: T.fontUI, fontSize: 14, fontWeight: 700, color: T.primary }}>
                {card.title}
              </span>
              <span style={{ fontFamily: T.fontUI, fontSize: 12, color: T.secondary, lineHeight: 1.5 }}>
                {card.description}
              </span>
              <button
                onClick={() => handleEffDownload(card)}
                disabled={isDisabled || isDownloading}
                style={{
                  marginTop: "auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontFamily: T.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase" as const,
                  color: isDisabled ? T.disabled : T.primary,
                  background: T.bgSub,
                  border: `1px solid ${isDisabled ? T.soft : T.rim}`,
                  borderRadius: 4,
                  padding: "8px 16px",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                }}
              >
                <Download size={13} />
                {isDownloading ? "DOWNLOADING..." : "DOWNLOAD"}
              </button>
            </div>
          );
        })}
      </div>
```

- [ ] **Step 7: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to `RegulatoryTab.tsx`. Fix any type errors before proceeding.

- [ ] **Step 8: Next.js build check**

```bash
cd frontend && npx next build 2>&1 | tail -20
```

Expected: Build completes successfully. No TypeScript errors, no import errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/reports/components/tabs/RegulatoryTab.tsx
git commit -m "feat(reports): extend RegulatoryTab with ISDA, FINRA-17a4, IFRS9, ASC815 exports"
```

---

## Chunk 5: Documentation update

### Task 5: Update `API_CONTRACTS.md`

**Files:**
- Modify: `docs/architecture/API_CONTRACTS.md`

- [ ] **Step 1: Read the current regulatory section**

```bash
grep -n "EMIR\|MiFID\|Dodd-Frank\|regulatory\|RPT-09" docs/architecture/API_CONTRACTS.md | head -20
```

- [ ] **Step 2: Add new endpoint entries**

Find the RPT-09 section in `docs/architecture/API_CONTRACTS.md` and add entries for the new endpoints. The new entries should follow the same format as existing ones:

```
GET  /v1/reports/{run_id}/isda
  Auth:    JWT required
  Perm:    reports.export
  Returns: application/xml (ISDA trade confirmation XML)
  Notes:   Transaction list built from hedge_plan.buckets in run_envelope.

GET  /v1/reports/{run_id}/finra-17a4
  Auth:    JWT required
  Perm:    reports.export
  Returns: text/plain (FINRA 17a-4 pipe-delimited with SHA-256 hash chain)
  Notes:   Findings derived from audit_flags in run_envelope; hash chain from recent audit events.

GET  /v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml
  Auth:    JWT required
  Perm:    reports.export
  Returns: application/xml (IFRS 9 hedge effectiveness evidence XML)
  Notes:   Includes dollar-offset ratio, regression stats, per-period data, and audit hashes.

GET  /v1/hedge-effectiveness/runs/{run_id}/asc815-xml
  Auth:    JWT required
  Perm:    reports.export
  Returns: application/xml (ASC 815 hedge effectiveness evidence XML)
  Notes:   Same structure as ifrs9-xml with standard label overridden to ASC_815.
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/API_CONTRACTS.md
git commit -m "docs(api): document ISDA, FINRA-17a4, IFRS9, ASC815 export endpoints"
```

---

## Final Validation

- [ ] **Run complete backend test suite**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -q --tb=short
```

Expected: All pass, 0 failures.

- [ ] **Run frontend build**

```bash
cd frontend && npx next build 2>&1 | tail -10
```

Expected: Build succeeds.
