"""
backend/app/api/routes/v1_audit_lab.py

Audit Lab API — POST upload, POST run, GET runs, GET export.

Endpoints:
  POST /v1/audit-lab/datasets/upload  — multipart CSV upload
  POST /v1/audit-lab/runs             — execute audit analysis
  GET  /v1/audit-lab/runs/{run_id}    — full report
  GET  /v1/audit-lab/runs/{run_id}/export  — evidence binder
  GET  /v1/audit-lab/datasets         — list datasets

All endpoints: JWT required, tenant-scoped by company_id.
"""
import csv
import hashlib
import io
import json
import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.engine.audit_engine import (
    AuditTransactionInput,
    BenchmarkConfig,
    BenchmarkEntry,
    run_audit_engine,
)
from app.models.user import User
from app.schemas_v1.audit_lab import (
    AuditRunCreateResponse,
    AuditRunDetailResponse,
    AuditRunExportResponse,
    AuditRunListItem,
    DatasetListResponse,
    DatasetUploadResponse,
)
from app.services import rbac_service
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/audit-lab", tags=["audit-lab"])
# ── Permission helper ──────────────────────────────────────────────────────────

async def _require(session: AsyncSession, user: User, codename: str) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if codename not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {codename}")
# ── CSV parser ─────────────────────────────────────────────────────────────────

_FIELD_ALIASES: dict[str, list[str]] = {
    "trade_date":       ["trade_date", "tradedate", "date", "value_date", "trade date"],
    "value_date":       ["value_date", "valuedate", "settlement_date"],
    "currency_sold":    ["currency_sold", "sold_ccy", "sell_ccy", "from_currency", "ccy_sold"],
    "currency_bought":  ["currency_bought", "bought_ccy", "buy_ccy", "to_currency", "ccy_bought"],
    "amount_sold":      ["amount_sold", "sell_amount", "from_amount", "notional_sold", "amount sold"],
    "amount_bought":    ["amount_bought", "buy_amount", "to_amount", "notional_bought", "amount bought"],
    "counterparty":     ["counterparty", "bank", "cp", "dealer", "counter_party"],
    "fee_amount":       ["fee_amount", "fee", "fees", "commission", "service_charge"],
    "fee_currency":     ["fee_currency", "fee_ccy", "commission_currency"],
    "reference":        ["reference", "ref", "transaction_id", "txn_id", "deal_ref"],
}
def _normalize_headers(headers: list[str]) -> dict[str, str]:
    """Map raw CSV headers to canonical field names."""
    raw_lower = {h.strip().lower(): h for h in headers}
    mapping: dict[str, str] = {}  # canonical -> raw header
    for canonical, aliases in _FIELD_ALIASES.items():
        for alias in aliases:
            if alias in raw_lower:
                mapping[canonical] = raw_lower[alias]
                break
    return mapping
def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None
def _parse_float(s: str | None) -> float | None:
    if s is None:
        return None
    s = s.strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None
def _row_canonical(row_data: dict) -> str:
    return json.dumps(row_data, sort_keys=True, default=str)
def _row_hash(row_data: dict) -> str:
    return hashlib.sha256(_row_canonical(row_data).encode("utf-8")).hexdigest()
def _parse_csv(
    raw_bytes: bytes,
) -> tuple[list[dict], list[str], set[str]]:
    """
    Parse CSV into list of raw row dicts.
    Returns (rows, warnings, currency_pairs_detected).
    """
    text_content = raw_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text_content))
    if reader.fieldnames is None:
        raise HTTPException(status_code=422, detail="CSV has no headers.")

    header_map = _normalize_headers(list(reader.fieldnames))
    rows = []
    warnings = []
    currency_pairs: set[str] = set()

    for i, raw_row in enumerate(reader):
        def get(field: str, _row: dict = raw_row) -> str | None:  # noqa: B008
            h = header_map.get(field)
            return _row.get(h, "").strip() if h else None

        trade_date_str = get("trade_date")
        currency_sold = get("currency_sold")
        currency_bought = get("currency_bought")
        amount_sold_str = get("amount_sold")
        amount_bought_str = get("amount_bought")

        amount_sold = _parse_float(amount_sold_str)
        amount_bought = _parse_float(amount_bought_str)
        effective_rate = None
        if amount_sold and amount_bought and amount_sold != 0:
            effective_rate = amount_bought / amount_sold

        row_warnings = []
        if not trade_date_str:
            row_warnings.append(f"Row {i}: missing trade_date")
        if not currency_sold or not currency_bought:
            row_warnings.append(f"Row {i}: missing currency_sold or currency_bought")

        row_data = {
            "row_index": i,
            "trade_date": trade_date_str,
            "value_date": get("value_date"),
            "currency_sold": currency_sold,
            "currency_bought": currency_bought,
            "amount_sold": amount_sold,
            "amount_bought": amount_bought,
            "effective_rate": effective_rate,
            "counterparty": get("counterparty"),
            "fee_amount": _parse_float(get("fee_amount")),
            "fee_currency": get("fee_currency"),
            "reference": get("reference"),
            "parse_warnings": row_warnings,
        }
        rows.append(row_data)
        warnings.extend(row_warnings)

        if currency_sold and currency_bought:
            currency_pairs.add(f"{currency_sold.upper()}{currency_bought.upper()}")

    return rows, warnings, currency_pairs
# ── Endpoint: Upload dataset ───────────────────────────────────────────────────

@router.post("/datasets/upload", response_model=DatasetUploadResponse)
async def upload_audit_dataset(
    file: UploadFile = File(...),
    period_start: str = Form(...),
    period_end: str = Form(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require(session, current_user, "audit.upload")

    MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=422, detail="Empty file.")
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )

    source_hash = hashlib.sha256(raw_bytes).hexdigest()
    company_id = str(current_user.company_id)

    # Dedup check
    existing = await session.execute(
        text(
            "SELECT id FROM audit_datasets "
            "WHERE company_id = :cid AND source_hash = :h LIMIT 1"
        ),
        {"cid": company_id, "h": source_hash},
    )
    if existing.fetchone():
        raise HTTPException(
            status_code=409,
            detail={
                "error": "duplicate_dataset",
                "message": "A dataset with identical content (same SHA-256) already exists.",
                "source_hash": source_hash,
            },
        )

    # Parse — dispatch by file type
    filename = (file.filename or "upload.csv").lower()
    if filename.endswith((".xlsx", ".xls")):
        try:
            from app.services.audit_lab_parsers import parse_xlsx
            rows, warnings, currency_pairs = parse_xlsx(raw_bytes)
        except ImportError:
            raise HTTPException(status_code=422, detail="XLSX parsing requires openpyxl.")
    elif filename.endswith(".pdf"):
        try:
            from app.services.audit_lab_parsers import parse_pdf
            rows, warnings, currency_pairs = parse_pdf(raw_bytes)
        except ImportError:
            raise HTTPException(status_code=422, detail="PDF parsing requires pdfplumber.")
    elif filename.endswith((".txt", ".mt300", ".mt320", ".swift")):
        from app.services.audit_lab_parsers import parse_swift_mt
        raw_text = raw_bytes.decode("utf-8", errors="replace")
        rows, warnings, currency_pairs = parse_swift_mt(raw_text)
    else:
        rows, warnings, currency_pairs = _parse_csv(raw_bytes)
    if not rows:
        raise HTTPException(status_code=422, detail="File parsed to zero rows.")

    # Validate period dates
    pstart = _parse_date(period_start)
    pend = _parse_date(period_end)
    if not pstart or not pend:
        raise HTTPException(status_code=422, detail="Invalid period_start or period_end date.")
    if pend < pstart:
        raise HTTPException(status_code=422, detail="period_end must be >= period_start.")

    # Insert dataset
    dataset_id = str(uuid.uuid4())
    try:
        await session.execute(
            text(
                "INSERT INTO audit_datasets "
                "(id, company_id, period_start, period_end, source_filename, source_hash, "
                " row_count, currency_pairs, created_by, created_at) "
                "VALUES (CAST(:id AS uuid), CAST(:cid AS uuid), CAST(:ps AS date), CAST(:pe AS date), "
                " :fn, :sh, :rc, CAST(:cp AS jsonb), CAST(:cb AS uuid), NOW())"
            ),
            {
                "id": dataset_id,
                "cid": company_id,
                "ps": str(pstart),
                "pe": str(pend),
                "fn": file.filename or "upload.csv",
                "sh": source_hash,
                "rc": len(rows),
                "cp": json.dumps(sorted(currency_pairs)),
                "cb": str(current_user.id),
            },
        )

        # Insert transactions (batch)
        txn_params = []
        for row in rows:
            txn_params.append({
                "id": str(uuid.uuid4()),
                "did": dataset_id,
                "cid": company_id,
                "ri": row["row_index"],
                "td": row["trade_date"],
                "vd": row["value_date"] or None,
                "cs": row["currency_sold"],
                "cb": row["currency_bought"],
                "as_": row["amount_sold"],
                "ab": row["amount_bought"],
                "er": row["effective_rate"],
                "cp": row["counterparty"],
                "fa": row["fee_amount"],
                "fc": row["fee_currency"],
                "ref": row["reference"],
                "rh": _row_hash(row),
                "pw": json.dumps(row["parse_warnings"] or []),
            })
        if txn_params:
            await session.execute(
                text(
                    "INSERT INTO audit_transactions "
                    "(id, dataset_id, company_id, row_index, trade_date, value_date, "
                    " currency_sold, currency_bought, amount_sold, amount_bought, "
                    " effective_rate, counterparty, fee_amount, fee_currency, reference, "
                    " row_hash, parse_warnings, created_at) "
                    "VALUES (CAST(:id AS uuid), CAST(:did AS uuid), CAST(:cid AS uuid), :ri, "
                    " CAST(:td AS date), CAST(:vd AS date), :cs, :cb, :as_, :ab, "
                    " :er, :cp, :fa, :fc, :ref, :rh, CAST(:pw AS jsonb), NOW())"
                ),
                txn_params,
            )

        await session.commit()
    except Exception as exc:
        await session.rollback()
        import logging as _logging
        _logging.getLogger(__name__).error("audit_dataset insert failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Dataset insert failed: {type(exc).__name__}: {exc}")

    # PLAN-02a: audit event for dataset upload
    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=(
            f"Audit dataset uploaded: {len(rows)} rows, "
            f"{len(currency_pairs)} pair(s): {', '.join(sorted(currency_pairs))}"
        ),
        entity_type="audit_dataset",
        entity_id=dataset_id,
        payload={
            "row_count": len(rows),
            "currency_pairs": sorted(currency_pairs),
            "source_hash": source_hash,
            "filename": file.filename or "upload.csv",
        },
    )

    return {
        "dataset_id": dataset_id,
        "row_count": len(rows),
        "currency_pairs_detected": sorted(currency_pairs),
        "period_start": str(pstart),
        "period_end": str(pend),
        "source_hash": source_hash,
        "parse_warnings": warnings[:50],  # cap at 50 for response size
    }
# ── Endpoint: Create run ───────────────────────────────────────────────────────

@router.post("/runs", response_model=AuditRunCreateResponse)
async def create_audit_run(
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require(session, current_user, "audit.run")

    dataset_id = body.get("dataset_id")
    benchmark_config_raw = body.get("benchmark_config", {})
    if not dataset_id:
        raise HTTPException(status_code=422, detail="dataset_id is required.")

    company_id = str(current_user.company_id)

    # Load dataset (tenant-scoped)
    ds_row = await session.execute(
        text(
            "SELECT id, period_start, period_end, row_count "
            "FROM audit_datasets WHERE id = :id AND company_id = :cid LIMIT 1"
        ),
        {"id": dataset_id, "cid": company_id},
    )
    ds = ds_row.fetchone()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    period_start = ds.period_start
    period_end = ds.period_end

    # Load transactions
    txn_rows = await session.execute(
        text(
            "SELECT id, row_index, trade_date, value_date, currency_sold, "
            "currency_bought, amount_sold, amount_bought, effective_rate, "
            "counterparty, fee_amount, fee_currency, reference, row_hash "
            "FROM audit_transactions WHERE dataset_id = :did ORDER BY row_index"
        ),
        {"did": dataset_id},
    )
    transactions = []
    for r in txn_rows.fetchall():
        transactions.append(AuditTransactionInput(
            row_id=str(r.id),
            row_hash=r.row_hash,
            row_index=r.row_index,
            trade_date=r.trade_date if isinstance(r.trade_date, date) else (_parse_date(str(r.trade_date)) if r.trade_date else None),
            value_date=r.value_date if isinstance(r.value_date, date) else (_parse_date(str(r.value_date)) if r.value_date else None),
            currency_sold=r.currency_sold,
            currency_bought=r.currency_bought,
            amount_sold=float(r.amount_sold) if r.amount_sold is not None else None,
            amount_bought=float(r.amount_bought) if r.amount_bought is not None else None,
            effective_rate=float(r.effective_rate) if r.effective_rate is not None else None,
            counterparty=r.counterparty,
            fee_amount=float(r.fee_amount) if r.fee_amount is not None else None,
            fee_currency=r.fee_currency,
            reference=r.reference,
        ))

    # Convert period dates for engine + benchmark filtering
    period_start_d = period_start if isinstance(period_start, date) else (
        datetime.strptime(str(period_start), "%Y-%m-%d").date()
    )
    period_end_d = period_end if isinstance(period_end, date) else (
        datetime.strptime(str(period_end), "%Y-%m-%d").date()
    )

    # Load benchmarks from market_snapshots (filtered by date range ±30 days)
    buffer_start = period_start_d - timedelta(days=30)
    buffer_end = period_end_d + timedelta(days=30)
    # Try with bid/ask columns; fall back without if columns don't exist (e.g. SQLite)
    try:
        snap_rows = await session.execute(
            text(
                "SELECT id, market_snapshot_hash, provider, as_of, "
                "primary_currency, spot_rate, bid_rate, ask_rate, fetched_at "
                "FROM market_snapshots WHERE company_id = :cid "
                "AND as_of >= :start AND as_of <= :end ORDER BY as_of"
            ),
            {"cid": company_id, "start": str(buffer_start), "end": str(buffer_end)},
        )
        _has_bid_ask = True
    except Exception:
        snap_rows = await session.execute(
            text(
                "SELECT id, market_snapshot_hash, provider, as_of, "
                "primary_currency, spot_rate, fetched_at "
                "FROM market_snapshots WHERE company_id = :cid "
                "AND as_of >= :start AND as_of <= :end ORDER BY as_of"
            ),
            {"cid": company_id, "start": str(buffer_start), "end": str(buffer_end)},
        )
        _has_bid_ask = False
    benchmarks: list[BenchmarkEntry] = []
    for s in snap_rows.fetchall():
        if not s.primary_currency:
            continue  # skip snapshots with null currency (fail-closed)
        ccy = s.primary_currency.upper()
        pair = f"USD{ccy}" if ccy != "USD" else "USDUSD"
        as_of_date = s.as_of.date() if hasattr(s.as_of, "date") else s.as_of
        fetched_at = s.fetched_at if isinstance(s.fetched_at, datetime) else datetime.now(UTC)
        benchmarks.append(BenchmarkEntry(
            snapshot_id=str(s.id),
            snapshot_hash=s.market_snapshot_hash,
            as_of=as_of_date,
            currency_pair=pair,
            mid_rate=float(s.spot_rate),
            provider=s.provider or "market_snapshot",
            fetched_at=fetched_at,
            bid_rate=float(s.bid_rate) if _has_bid_ask and s.bid_rate is not None else None,
            ask_rate=float(s.ask_rate) if _has_bid_ask and s.ask_rate is not None else None,
        ))

    # Build benchmark config
    bsource = benchmark_config_raw.get("benchmark_source", "market_snapshot")
    budget_rate = benchmark_config_raw.get("budget_rate")
    bconfig = BenchmarkConfig(
        benchmark_source=bsource,
        budget_rate=float(budget_rate) if budget_rate is not None else None,
    )

    # Run engine
    result = run_audit_engine(
        dataset_id=dataset_id,
        transactions=transactions,
        benchmarks=benchmarks,
        config=bconfig,
        period_start=period_start_d,
        period_end=period_end_d,
    )

    # Persist run
    run_id = str(uuid.uuid4())
    trace_bundle = {
        "run_id": run_id,
        "events": [e.to_dict() for e in result.trace_events],
    }
    await session.execute(
        text(
            "INSERT INTO audit_runs "
            "(id, company_id, dataset_id, methodology_version, benchmark_config, "
            " run_hash, inputs_hash, outputs_hash, trace_bundle, status, "
            " created_by, created_at) "
            "VALUES (:id, :cid, :did, :mv, :bc, :rh, :ih, :oh, :tb, 'COMPLETED', "
            " :cb, NOW())"
        ),
        {
            "id": run_id,
            "cid": company_id,
            "did": dataset_id,
            "mv": result.methodology_version,
            "bc": json.dumps(benchmark_config_raw),
            "rh": result.run_hash,
            "ih": result.inputs_hash,
            "oh": result.outputs_hash,
            "tb": json.dumps(trace_bundle),
            "cb": str(current_user.id),
        },
    )

    # Persist findings
    def _sev(amount_usd: float) -> str:
        if amount_usd >= 10_000:
            return "HIGH"
        if amount_usd >= 1_000:
            return "MEDIUM"
        if amount_usd > 0:
            return "LOW"
        return "INFO"

    # Markup findings aggregated by pair
    for pair, pair_usd in result.markup_by_pair.items():
        pair_findings = [f for f in result.markup_findings if f.currency_pair == pair]
        evidence = [f.to_dict() for f in pair_findings]
        finding_hash = hashlib.sha256(
            json.dumps({"pair": pair, "amount_usd": pair_usd, "evidence": evidence},
                       sort_keys=True, default=str).encode()
        ).hexdigest()
        await session.execute(
            text(
                "INSERT INTO audit_findings "
                "(id, run_id, company_id, finding_type, currency_pair, counterparty, "
                " amount_usd, severity, narrative, evidence, finding_hash, created_at) "
                "VALUES (:id, :rid, :cid, 'MARKUP', :cp, NULL, "
                " :amt, :sev, :nar, :ev, :fh, NOW())"
            ),
            {
                "id": str(uuid.uuid4()),
                "rid": run_id,
                "cid": company_id,
                "cp": pair,
                "amt": pair_usd,
                "sev": _sev(pair_usd),
                "nar": (
                    f"Bank markup cost for {pair}: USD {pair_usd:,.2f} "
                    f"across {len(pair_findings)} transactions. "
                    f"[methodology v{result.methodology_version}]"
                ),
                "ev": json.dumps(evidence),
                "fh": finding_hash,
            },
        )

    # Fee findings
    if result.total_fees_usd > 0:
        fee_evidence = [f.to_dict() for f in result.fee_findings]
        fee_hash = hashlib.sha256(
            json.dumps({"fees": result.total_fees_usd}, sort_keys=True).encode()
        ).hexdigest()
        confidence_note = (
            "" if result.fee_confidence == "HIGH"
            else f" LOW CONFIDENCE: only {result.data_quality_score:.1f}% of rows had fee data."
        )
        await session.execute(
            text(
                "INSERT INTO audit_findings "
                "(id, run_id, company_id, finding_type, currency_pair, counterparty, "
                " amount_usd, severity, narrative, evidence, finding_hash, created_at) "
                "VALUES (:id, :rid, :cid, 'FEE', NULL, NULL, "
                " :amt, :sev, :nar, :ev, :fh, NOW())"
            ),
            {
                "id": str(uuid.uuid4()),
                "rid": run_id,
                "cid": company_id,
                "amt": result.total_fees_usd,
                "sev": _sev(result.total_fees_usd),
                "nar": (
                    f"Explicit fees extracted: USD {result.total_fees_usd:,.2f} "
                    f"from {len(result.fee_findings)} transactions.{confidence_note}"
                ),
                "ev": json.dumps(fee_evidence),
                "fh": fee_hash,
            },
        )

    # Rate variance findings (formerly "unhedged impact")
    for rv in result.rate_variance_results:
        rv_hash = hashlib.sha256(
            json.dumps(rv.to_dict(), sort_keys=True, default=str).encode()
        ).hexdigest()
        sev = _sev(abs(rv.rate_variance_usd)) if rv.status == "COMPUTED" else "INFO"
        await session.execute(
            text(
                "INSERT INTO audit_findings "
                "(id, run_id, company_id, finding_type, currency_pair, counterparty, "
                " amount_usd, severity, narrative, evidence, finding_hash, created_at) "
                "VALUES (:id, :rid, :cid, 'RATE_VARIANCE', :cp, NULL, "
                " :amt, :sev, :nar, :ev, :fh, NOW())"
            ),
            {
                "id": str(uuid.uuid4()),
                "rid": run_id,
                "cid": company_id,
                "cp": rv.currency_pair,
                "amt": rv.rate_variance_usd,
                "sev": sev,
                "nar": rv.narrative,
                "ev": json.dumps(rv.to_dict()),
                "fh": rv_hash,
            },
        )

    # Persist outlier findings
    if result.outlier_results:
        outliers = [o for o in result.outlier_results if o.get("is_outlier")]
        if outliers:
            outlier_evidence = result.outlier_results
            outlier_hash = hashlib.sha256(
                json.dumps(outlier_evidence, sort_keys=True, default=str).encode()
            ).hexdigest()
            await session.execute(
                text(
                    "INSERT INTO audit_findings "
                    "(id, run_id, company_id, finding_type, currency_pair, counterparty, "
                    " amount_usd, severity, narrative, evidence, finding_hash, created_at) "
                    "VALUES (:id, :rid, :cid, 'OUTLIER', NULL, NULL, "
                    " 0, :sev, :nar, :ev, :fh, NOW())"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "rid": run_id,
                    "cid": company_id,
                    "sev": "HIGH" if len(outliers) >= 3 else "MEDIUM",
                    "nar": f"{len(outliers)} outlier transactions detected via z-score analysis (threshold: 2.0).",
                    "ev": json.dumps(outlier_evidence),
                    "fh": outlier_hash,
                },
            )

    # Persist report
    report_json = {
        "run_id": run_id,
        "methodology_version": result.methodology_version,
        "summary": {
            "total_markup_usd": result.total_markup_usd,
            "total_fees_usd": result.total_fees_usd,
            "total_rate_variance_usd": result.total_rate_variance_usd,
            "total_unhedged_impact_usd": result.total_rate_variance_usd,  # backward compat
            "total_loss_usd": result.total_loss_usd,
            "data_quality_score": result.data_quality_score,
            "fee_confidence": result.fee_confidence,
            "markup_rejections_count": len(result.markup_rejections),
            "total_favorable_usd": result.total_favorable_usd,
            "total_adverse_usd": result.total_adverse_usd,
            "outlier_count": sum(1 for o in (result.outlier_results or []) if o.get("is_outlier")),
            "counterparty_count": len(result.counterparty_scores or []),
            "natural_hedge_count": len(result.natural_hedge_results or []),
        },
        "markup_by_pair": result.markup_by_pair,
        "markup_by_counterparty": result.markup_by_counterparty,
        "markup_by_month": result.markup_by_month,
        "rate_variance_results": [u.to_dict() for u in result.rate_variance_results],
        "unhedged_results": [u.to_dict() for u in result.rate_variance_results],  # backward compat
        "markup_rejections": [r.to_dict() for r in result.markup_rejections],
        "counterparty_scores": [
            {"counterparty": s.counterparty, "avg_markup_bps": s.avg_markup_bps,
             "total_cost_usd": s.total_cost_usd, "trade_count": s.trade_count,
             "pct_favorable": s.pct_favorable, "composite_score": s.composite_score}
            for s in (result.counterparty_scores or [])
        ],
        "natural_hedges": [
            {"pair": nh.currency_pair, "date": nh.date,
             "gross_buy": nh.gross_buy, "gross_sell": nh.gross_sell,
             "net": nh.net, "savings_usd": nh.savings_estimate_usd}
            for nh in (result.natural_hedge_results or [])
        ],
    }
    report_hash = hashlib.sha256(
        json.dumps(report_json, sort_keys=True, default=str).encode()
    ).hexdigest()
    await session.execute(
        text(
            "INSERT INTO audit_reports "
            "(id, run_id, company_id, report_json, report_hash, created_at) "
            "VALUES (:id, :rid, :cid, :rj, :rh, NOW())"
        ),
        {
            "id": str(uuid.uuid4()),
            "rid": run_id,
            "cid": company_id,
            "rj": json.dumps(report_json),
            "rh": report_hash,
        },
    )

    await session.commit()

    # PLAN-02b: audit event for audit run creation
    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=(
            f"Audit lab run completed: markup USD {result.total_markup_usd:,.2f}, "
            f"fees USD {result.total_fees_usd:,.2f}, "
            f"data quality {result.data_quality_score:.1f}%"
        ),
        entity_type="audit_run",
        entity_id=run_id,
        payload={
            "run_hash": result.run_hash,
            "dataset_id": dataset_id,
            "methodology_version": result.methodology_version,
            "total_markup_usd": result.total_markup_usd,
            "total_fees_usd": result.total_fees_usd,
            "total_loss_usd": result.total_loss_usd,
            "data_quality_score": result.data_quality_score,
        },
    )

    return {
        "run_id": run_id,
        "run_hash": result.run_hash,
        "summary": {
            "total_markup_usd": result.total_markup_usd,
            "total_fees_usd": result.total_fees_usd,
            "total_unhedged_impact_usd": result.total_unhedged_impact_usd,
            "total_loss_usd": result.total_loss_usd,
            "data_quality_score": result.data_quality_score,
            "fee_confidence": result.fee_confidence,
        },
    }
# ── Endpoint: List runs ────────────────────────────────────────────────────────

@router.get("/runs", response_model=list[AuditRunListItem])
async def list_audit_runs(
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    company_id = str(current_user.company_id)

    rows = await session.execute(
        text(
            "SELECT r.id, r.dataset_id, r.methodology_version, "
            "r.run_hash, r.inputs_hash, r.outputs_hash, r.status, r.created_at, "
            "rp.report_json "
            "FROM audit_runs r "
            "LEFT JOIN audit_reports rp ON rp.run_id = r.id "
            "WHERE r.company_id = :cid "
            "ORDER BY r.created_at DESC "
            "LIMIT :lim"
        ),
        {"cid": company_id, "lim": limit},
    )
    result = []
    for row in rows.fetchall():
        report = row.report_json if isinstance(row.report_json, dict) else {}
        summary = report.get("summary", {})
        result.append({
            "run_id": str(row.id),
            "dataset_id": str(row.dataset_id),
            "methodology_version": row.methodology_version,
            "run_hash": row.run_hash,
            "inputs_hash": row.inputs_hash,
            "outputs_hash": row.outputs_hash,
            "status": row.status,
            "markup_total_usd": float(summary.get("total_markup_usd", 0.0)),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        })
    return result
# ── Endpoint: Get run ──────────────────────────────────────────────────────────

@router.get("/runs/{run_id}", response_model=AuditRunDetailResponse)
async def get_audit_run(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = str(current_user.company_id)

    run_row = await session.execute(
        text(
            "SELECT r.id, r.dataset_id, r.methodology_version, r.benchmark_config, "
            "r.run_hash, r.inputs_hash, r.outputs_hash, r.trace_bundle, "
            "r.status, r.created_at, r.created_by, "
            "rp.report_json, rp.report_hash "
            "FROM audit_runs r "
            "LEFT JOIN audit_reports rp ON rp.run_id = r.id "
            "WHERE r.id = :rid AND r.company_id = :cid LIMIT 1"
        ),
        {"rid": run_id, "cid": company_id},
    )
    row = run_row.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Audit run not found.")

    findings_rows = await session.execute(
        text(
            "SELECT id, finding_type, currency_pair, counterparty, amount_usd, "
            "severity, narrative, evidence, finding_hash, created_at "
            "FROM audit_findings WHERE run_id = :rid ORDER BY amount_usd DESC"
        ),
        {"rid": run_id},
    )
    findings = []
    for f in findings_rows.fetchall():
        findings.append({
            "id": str(f.id),
            "finding_type": f.finding_type,
            "currency_pair": f.currency_pair,
            "counterparty": f.counterparty,
            "amount_usd": float(f.amount_usd),
            "severity": f.severity,
            "narrative": f.narrative,
            "evidence": f.evidence if isinstance(f.evidence, list) else [],
            "finding_hash": f.finding_hash,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })

    report = row.report_json if isinstance(row.report_json, dict) else {}

    return {
        "run_id": str(row.id),
        "dataset_id": str(row.dataset_id),
        "methodology_version": row.methodology_version,
        "benchmark_config": row.benchmark_config,
        "run_hash": row.run_hash,
        "inputs_hash": row.inputs_hash,
        "outputs_hash": row.outputs_hash,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "summary": report.get("summary", {}),
        "findings": findings,
        "markup_by_pair": report.get("markup_by_pair", {}),
        "markup_by_counterparty": report.get("markup_by_counterparty", {}),
        "markup_by_month": report.get("markup_by_month", {}),
        "rate_variance_results": report.get("rate_variance_results", report.get("unhedged_results", [])),
        "unhedged_results": report.get("unhedged_results", []),
        "counterparty_scores": report.get("counterparty_scores", []),
        "natural_hedges": report.get("natural_hedges", []),
        "outlier_count": report.get("summary", {}).get("outlier_count", 0),
        "trace_bundle": row.trace_bundle,
        "report_hash": row.report_hash,
    }
# ── Endpoint: Export evidence binder ──────────────────────────────────────────

@router.get("/runs/{run_id}/export", response_model=AuditRunExportResponse)
async def export_audit_run(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = str(current_user.company_id)

    run_row = await session.execute(
        text(
            "SELECT r.id, r.dataset_id, r.methodology_version, r.run_hash, "
            "r.inputs_hash, r.outputs_hash, r.trace_bundle, r.created_at, "
            "d.source_hash as dataset_hash, rp.report_hash, rp.report_json "
            "FROM audit_runs r "
            "JOIN audit_datasets d ON d.id = r.dataset_id "
            "LEFT JOIN audit_reports rp ON rp.run_id = r.id "
            "WHERE r.id = :rid AND r.company_id = :cid LIMIT 1"
        ),
        {"rid": run_id, "cid": company_id},
    )
    row = run_row.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Audit run not found.")

    findings_rows = await session.execute(
        text(
            "SELECT finding_type, amount_usd, finding_hash "
            "FROM audit_findings WHERE run_id = :rid"
        ),
        {"rid": run_id},
    )
    findings_list = findings_rows.fetchall()
    findings_count = len(findings_list)
    findings_total_usd = sum(float(f.amount_usd) for f in findings_list)

    report = row.report_json if isinstance(row.report_json, dict) else {}
    summary = report.get("summary", {})

    return {
        "manifest_version": "1.0.0",
        "generated_at": datetime.now(UTC).isoformat(),
        "run_type": "audit_lab",
        "run_id": run_id,
        "run_hash": row.run_hash,
        "inputs_hash": row.inputs_hash,
        "outputs_hash": row.outputs_hash,
        "methodology_version": row.methodology_version,
        "artifacts": [
            {"type": "dataset", "id": str(row.dataset_id), "hash": row.dataset_hash},
            {"type": "trace_bundle", "hash": hashlib.sha256(
                json.dumps(row.trace_bundle, sort_keys=True, default=str).encode()
            ).hexdigest()},
        ],
        "findings_count": findings_count,
        "findings_total_usd": findings_total_usd,
        "summary": summary,
        "trace_bundle": row.trace_bundle,
    }
# ── Endpoint: List datasets ────────────────────────────────────────────────────

@router.get("/datasets", response_model=DatasetListResponse)
async def list_audit_datasets(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = str(current_user.company_id)

    rows = await session.execute(
        text(
            "SELECT id, period_start, period_end, source_filename, source_hash, "
            "row_count, currency_pairs, created_at "
            "FROM audit_datasets WHERE company_id = :cid "
            "ORDER BY created_at DESC LIMIT :lim"
        ),
        {"cid": company_id, "lim": limit},
    )
    items = []
    for r in rows.fetchall():
        items.append({
            "id": str(r.id),
            "period_start": str(r.period_start),
            "period_end": str(r.period_end),
            "source_filename": r.source_filename,
            "source_hash": r.source_hash,
            "row_count": r.row_count,
            "currency_pairs": r.currency_pairs or [],
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return {"items": items, "total": len(items)}
# ── Endpoint: Transaction drill-down (Item 13) ───────────────────────────────

@router.get("/runs/{run_id}/transactions")
async def get_run_transactions(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return all transactions for a run's dataset with finding evidence joined."""
    company_id = str(current_user.company_id)

    # Verify run exists and get dataset_id
    run_row = await session.execute(
        text(
            "SELECT dataset_id FROM audit_runs "
            "WHERE id = :rid AND company_id = :cid LIMIT 1"
        ),
        {"rid": run_id, "cid": company_id},
    )
    run = run_row.fetchone()
    if not run:
        raise HTTPException(status_code=404, detail="Audit run not found.")

    # Load transactions
    txn_rows = await session.execute(
        text(
            "SELECT id, row_index, trade_date, value_date, currency_sold, "
            "currency_bought, amount_sold, amount_bought, effective_rate, "
            "counterparty, fee_amount, fee_currency, reference, row_hash "
            "FROM audit_transactions WHERE dataset_id = :did ORDER BY row_index"
        ),
        {"did": str(run.dataset_id)},
    )

    # Load markup findings evidence for this run (keyed by row_id)
    findings_rows = await session.execute(
        text(
            "SELECT evidence FROM audit_findings "
            "WHERE run_id = :rid AND finding_type = 'MARKUP'"
        ),
        {"rid": run_id},
    )
    # Build row_id → finding evidence map
    evidence_by_row: dict[str, dict] = {}
    for f in findings_rows.fetchall():
        ev = f.evidence if isinstance(f.evidence, list) else []
        for item in ev:
            if isinstance(item, dict) and "row_id" in item:
                evidence_by_row[item["row_id"]] = item

    transactions = []
    for r in txn_rows.fetchall():
        ev = evidence_by_row.get(str(r.id), {})
        transactions.append({
            "id": str(r.id),
            "row_index": r.row_index,
            "trade_date": str(r.trade_date) if r.trade_date else None,
            "value_date": str(r.value_date) if r.value_date else None,
            "currency_sold": r.currency_sold,
            "currency_bought": r.currency_bought,
            "amount_sold": float(r.amount_sold) if r.amount_sold is not None else None,
            "amount_bought": float(r.amount_bought) if r.amount_bought is not None else None,
            "effective_rate": float(r.effective_rate) if r.effective_rate is not None else None,
            "counterparty": r.counterparty,
            "fee_amount": float(r.fee_amount) if r.fee_amount is not None else None,
            "fee_currency": r.fee_currency,
            "reference": r.reference,
            "row_hash": r.row_hash,
            "benchmark_rate": ev.get("benchmark_rate"),
            "markup_per_unit": ev.get("markup_per_unit"),
            "markup_cost_usd": ev.get("markup_cost_usd"),
            "markup_direction": ev.get("markup_direction"),
            "spread_classification": ev.get("spread_classification"),
        })

    return {"transactions": transactions, "total": len(transactions)}
# ── Endpoint: Compare runs (Item 19) ─────────────────────────────────────────

@router.get("/compare")
async def compare_audit_runs(
    run_ids: str = Query(..., description="Comma-separated run IDs"),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Load 2+ runs for side-by-side comparison."""
    company_id = str(current_user.company_id)
    ids = [rid.strip() for rid in run_ids.split(",") if rid.strip()]
    if len(ids) < 2:
        raise HTTPException(status_code=422, detail="At least 2 run_ids required.")

    runs = []
    for rid in ids[:5]:  # cap at 5
        run_row = await session.execute(
            text(
                "SELECT r.id, r.dataset_id, r.methodology_version, r.run_hash, "
                "r.inputs_hash, r.outputs_hash, r.status, r.created_at, "
                "rp.report_json, rp.report_hash "
                "FROM audit_runs r "
                "LEFT JOIN audit_reports rp ON rp.run_id = r.id "
                "WHERE r.id = :rid AND r.company_id = :cid LIMIT 1"
            ),
            {"rid": rid, "cid": company_id},
        )
        row = run_row.fetchone()
        if not row:
            continue
        report = row.report_json if isinstance(row.report_json, dict) else {}
        runs.append({
            "run_id": str(row.id),
            "dataset_id": str(row.dataset_id),
            "methodology_version": row.methodology_version,
            "run_hash": row.run_hash,
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "summary": report.get("summary", {}),
            "markup_by_pair": report.get("markup_by_pair", {}),
            "markup_by_counterparty": report.get("markup_by_counterparty", {}),
            "markup_by_month": report.get("markup_by_month", {}),
        })

    return {"runs": runs, "count": len(runs)}
# ── Endpoint: Exposure gap analysis (Item 31) ────────────────────────────────

@router.get("/runs/{run_id}/exposure-gaps")
async def get_exposure_gaps(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Cross-reference audit transactions with positions for gap analysis."""
    company_id = str(current_user.company_id)

    # Verify run + get dataset
    run_row = await session.execute(
        text("SELECT dataset_id FROM audit_runs WHERE id = :rid AND company_id = :cid LIMIT 1"),
        {"rid": run_id, "cid": company_id},
    )
    run = run_row.fetchone()
    if not run:
        raise HTTPException(status_code=404, detail="Audit run not found.")

    # Aggregate audit volume by pair (normalized to canonical sorted key)
    audit_vol = await session.execute(
        text(
            "SELECT currency_sold, currency_bought, "
            "ABS(COALESCE(amount_sold, 0)) AS abs_amount "
            "FROM audit_transactions WHERE dataset_id = :did "
            "AND currency_sold IS NOT NULL AND currency_bought IS NOT NULL"
        ),
        {"did": str(run.dataset_id)},
    )

    audit_map: dict[str, dict] = {}
    for r in audit_vol.fetchall():
        pair = "".join(sorted([r.currency_sold.upper(), r.currency_bought.upper()]))
        entry = audit_map.setdefault(pair, {"volume": 0.0, "count": 0})
        entry["volume"] += float(r.abs_amount)
        entry["count"] += 1

    # Aggregate position volume by pair (normalized to canonical sorted key)
    position_vol = await session.execute(
        text(
            "SELECT base_currency, quote_currency, "
            "ABS(COALESCE(notional, 0)) AS abs_notional "
            "FROM positions WHERE company_id = :cid "
            "AND base_currency IS NOT NULL AND quote_currency IS NOT NULL"
        ),
        {"cid": company_id},
    )

    position_map: dict[str, dict] = {}
    for r in position_vol.fetchall():
        pair = "".join(sorted([r.base_currency.upper(), r.quote_currency.upper()]))
        entry = position_map.setdefault(pair, {"volume": 0.0, "count": 0})
        entry["volume"] += float(r.abs_notional)
        entry["count"] += 1

    all_pairs = set(audit_map.keys()) | set(position_map.keys())
    gaps = []
    for pair in sorted(all_pairs):
        a = audit_map.get(pair, {"volume": 0, "count": 0})
        p = position_map.get(pair, {"volume": 0, "count": 0})
        gap_ratio = (a["volume"] / p["volume"]) if p["volume"] > 0 else None
        gaps.append({
            "pair": pair,
            "audit_volume": a["volume"],
            "audit_count": a["count"],
            "position_volume": p["volume"],
            "position_count": p["count"],
            "gap_ratio": gap_ratio,
        })

    return {"gaps": gaps}
# ── Endpoint: Trends (Item 35) ───────────────────────────────────────────────

@router.get("/trends")
async def get_audit_trends(
    limit: int = Query(20, ge=2, le=100),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Period-over-period trend data across multiple runs."""
    company_id = str(current_user.company_id)

    rows = await session.execute(
        text(
            "SELECT r.id, r.created_at, r.methodology_version, "
            "rp.report_json "
            "FROM audit_runs r "
            "LEFT JOIN audit_reports rp ON rp.run_id = r.id "
            "WHERE r.company_id = :cid "
            "ORDER BY r.created_at ASC LIMIT :lim"
        ),
        {"cid": company_id, "lim": limit},
    )

    trend_points = []
    for row in rows.fetchall():
        report = row.report_json if isinstance(row.report_json, dict) else {}
        summary = report.get("summary", {})
        trend_points.append({
            "run_id": str(row.id),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "methodology_version": row.methodology_version,
            "total_markup_usd": float(summary.get("total_markup_usd", 0)),
            "total_fees_usd": float(summary.get("total_fees_usd", 0)),
            "total_loss_usd": float(summary.get("total_loss_usd", 0)),
            "data_quality_score": float(summary.get("data_quality_score", 0)),
            "markup_by_pair": report.get("markup_by_pair", {}),
            "markup_by_counterparty": report.get("markup_by_counterparty", {}),
        })

    # Aggregate counterparty breakdown across all runs
    cp_totals: dict[str, float] = {}
    for tp in trend_points:
        for cp, val in tp.get("markup_by_counterparty", {}).items():
            cp_totals[cp] = cp_totals.get(cp, 0.0) + float(val)
    counterparty_breakdown = [
        {"counterparty": cp, "total_markup_usd": v}
        for cp, v in sorted(cp_totals.items(), key=lambda x: abs(x[1]), reverse=True)
    ]

    return {"trend_points": trend_points, "count": len(trend_points),
            "counterparty_breakdown": counterparty_breakdown}
# ── Endpoint: Audit trail (Item 38) ──────────────────────────────────────────

@router.get("/audit-trail")
async def get_audit_trail(
    limit: int = Query(100, ge=1, le=500),
    entity_type: str | None = Query(None),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Query audit_events filtered to audit lab entities."""
    company_id = str(current_user.company_id)

    query = (
        "SELECT id, event_type, description, entity_type, entity_id, "
        "actor_id, actor_email, created_at, event_hash "
        "FROM audit_events WHERE company_id = :cid "
        "AND entity_type IN ('audit_dataset', 'audit_run') "
    )
    params: dict = {"cid": company_id, "lim": limit}
    if entity_type:
        query += "AND entity_type = :et "
        params["et"] = entity_type
    query += "ORDER BY created_at DESC LIMIT :lim"

    rows = await session.execute(text(query), params)
    events = []
    for r in rows.fetchall():
        events.append({
            "id": str(r.id),
            "event_type": r.event_type,
            "description": r.description,
            "entity_type": r.entity_type,
            "entity_id": str(r.entity_id) if r.entity_id else None,
            "actor_email": r.actor_email,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "event_hash": r.event_hash[:12] + "..." if r.event_hash else None,
        })

    return {"events": events, "total": len(events)}
# ── Endpoint: Review queue (Item 40) ─────────────────────────────────────────

@router.get("/review-queue")
async def get_review_queue(
    run_id: str = Query(None, description="Filter by specific run"),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return transactions flagged for human review (low confidence parse results)."""
    await _require(session, current_user, "audit.review")
    company_id = str(current_user.company_id)

    # Build query — optionally filter by run_id's dataset
    if run_id:
        run_row = await session.execute(
            text(
                "SELECT dataset_id FROM audit_runs "
                "WHERE id = :rid AND company_id = :cid LIMIT 1"
            ),
            {"rid": run_id, "cid": company_id},
        )
        run = run_row.fetchone()
        if not run:
            raise HTTPException(status_code=404, detail="Audit run not found.")
        txn_rows = await session.execute(
            text(
                "SELECT id, dataset_id, row_index, trade_date, value_date, "
                "currency_sold, currency_bought, amount_sold, amount_bought, "
                "effective_rate, counterparty, fee_amount, fee_currency, "
                "reference, row_hash, parse_warnings "
                "FROM audit_transactions WHERE dataset_id = :did ORDER BY row_index"
            ),
            {"did": str(run.dataset_id)},
        )
    else:
        txn_rows = await session.execute(
            text(
                "SELECT id, dataset_id, row_index, trade_date, value_date, "
                "currency_sold, currency_bought, amount_sold, amount_bought, "
                "effective_rate, counterparty, fee_amount, fee_currency, "
                "reference, row_hash, parse_warnings "
                "FROM audit_transactions WHERE company_id = :cid ORDER BY row_index"
            ),
            {"cid": company_id},
        )

    # Filter in Python for SQLite compat — look for parse_warnings with confidence < 0.8
    items = []
    for r in txn_rows.fetchall():
        pw = r.parse_warnings
        if isinstance(pw, str):
            try:
                pw = json.loads(pw)
            except (json.JSONDecodeError, TypeError):
                pw = None

        # Determine confidence and flags
        confidence = 1.0
        flags: list[str] = []

        if isinstance(pw, dict):
            confidence = float(pw.get("confidence", 1.0))
            flags = pw.get("flags", [])
            if pw.get("excluded"):
                continue  # skip already-excluded transactions
        elif isinstance(pw, list) and len(pw) > 0:
            # parse_warnings is a list of warning strings — lower confidence per warning
            flags = pw
            confidence = max(0.1, 1.0 - 0.15 * len(pw))

        if confidence >= 0.8 and not flags:
            continue  # no issues, skip

        items.append({
            "id": str(r.id),
            "dataset_id": str(r.dataset_id),
            "row_index": r.row_index,
            "trade_date": str(r.trade_date) if r.trade_date else None,
            "value_date": str(r.value_date) if r.value_date else None,
            "currency_sold": r.currency_sold,
            "currency_bought": r.currency_bought,
            "amount_sold": float(r.amount_sold) if r.amount_sold is not None else None,
            "amount_bought": float(r.amount_bought) if r.amount_bought is not None else None,
            "effective_rate": float(r.effective_rate) if r.effective_rate is not None else None,
            "counterparty": r.counterparty,
            "fee_amount": float(r.fee_amount) if r.fee_amount is not None else None,
            "fee_currency": r.fee_currency,
            "reference": r.reference,
            "row_hash": r.row_hash,
            "confidence": confidence,
            "flags": flags,
        })

    return {"items": items, "total": len(items)}


@router.post("/review-queue/{transaction_id}/resolve")
async def resolve_review_item(
    transaction_id: str,
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Resolve a flagged transaction: approve, reject, or request correction.

    WORM semantics: original transaction is never mutated.  Resolution is
    recorded as a new entry appended to the parse_warnings JSONB field.
    """
    await _require(session, current_user, "audit.review")
    company_id = str(current_user.company_id)

    action = body.get("action")
    if action not in ("approve", "reject", "correct"):
        raise HTTPException(status_code=422, detail="action must be approve, reject, or correct.")

    # Load transaction
    txn_row = await session.execute(
        text(
            "SELECT id, parse_warnings FROM audit_transactions "
            "WHERE id = :tid AND company_id = :cid LIMIT 1"
        ),
        {"tid": transaction_id, "cid": company_id},
    )
    txn = txn_row.fetchone()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    pw = txn.parse_warnings
    if isinstance(pw, str):
        try:
            pw = json.loads(pw)
        except (json.JSONDecodeError, TypeError):
            pw = {}

    # Build resolution record (append-only — WORM-safe metadata annotation)
    resolution = {
        "action": action,
        "resolved_by": str(current_user.id),
        "resolved_at": datetime.now(UTC).isoformat(),
    }

    if action == "approve":
        resolution["note"] = "Human-reviewed and approved."
    elif action == "reject":
        resolution["note"] = "Excluded by reviewer."
        resolution["excluded"] = True
    elif action == "correct":
        corrections = body.get("corrections", {})
        resolution["note"] = "Correction requested (original preserved)."
        resolution["corrections"] = corrections

    # Store resolution inside parse_warnings as JSONB
    if isinstance(pw, list):
        new_pw = {"original_warnings": pw, "resolution": resolution}
    elif isinstance(pw, dict):
        new_pw = {**pw, "resolution": resolution}
    else:
        new_pw = {"resolution": resolution}

    if action == "reject":
        new_pw["excluded"] = True

    await session.execute(
        text(
            "UPDATE audit_transactions SET parse_warnings = :pw "
            "WHERE id = :tid AND company_id = :cid"
        ),
        {"pw": json.dumps(new_pw), "tid": transaction_id, "cid": company_id},
    )
    await session.commit()

    return {"transaction_id": transaction_id, "action": action, "status": "resolved"}

# ── Endpoint: Schedule CRUD (Item 39) ────────────────────────────────────────

@router.post("/schedules")
async def create_audit_schedule(
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require(session, current_user, "audit.schedule")
    from app.services.audit_scheduler import create_schedule
    sched = create_schedule(
        company_id=str(current_user.company_id),
        dataset_id=body.get("dataset_id", ""),
        benchmark_config=body.get("benchmark_config", {}),
        cron_expression=body.get("cron_expression", "0 0 * * 1"),
        created_by=str(current_user.id),
    )
    return {
        "id": sched.id,
        "dataset_id": sched.dataset_id,
        "cron_expression": sched.cron_expression,
        "enabled": sched.enabled,
        "created_at": sched.created_at.isoformat(),
    }

@router.get("/schedules")
async def list_audit_schedules(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    from app.services.audit_scheduler import get_schedules
    schedules = get_schedules(str(current_user.company_id))
    return {
        "schedules": [
            {
                "id": s.id,
                "dataset_id": s.dataset_id,
                "cron_expression": s.cron_expression,
                "enabled": s.enabled,
                "created_at": s.created_at.isoformat(),
                "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
            }
            for s in schedules
        ],
    }

@router.delete("/schedules/{schedule_id}")
async def delete_audit_schedule(
    schedule_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require(session, current_user, "audit.schedule")
    from app.services.audit_scheduler import delete_schedule
    deleted = delete_schedule(schedule_id, str(current_user.company_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    return {"deleted": True}
# ── Endpoint: Regulatory export (Item 37) ────────────────────────────────────

@router.get("/runs/{run_id}/export/regulatory")
async def export_regulatory(
    run_id: str,
    format: str = Query("isda", regex="^(isda|finra_17a4)$"),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Generate regulatory-format export for a run."""
    company_id = str(current_user.company_id)

    run_row = await session.execute(
        text(
            "SELECT r.id, r.run_hash, r.methodology_version, r.created_at, "
            "rp.report_json "
            "FROM audit_runs r "
            "LEFT JOIN audit_reports rp ON rp.run_id = r.id "
            "WHERE r.id = :rid AND r.company_id = :cid LIMIT 1"
        ),
        {"rid": run_id, "cid": company_id},
    )
    row = run_row.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Audit run not found.")

    report = row.report_json if isinstance(row.report_json, dict) else {}
    summary = report.get("summary", {})

    # Load findings
    findings_rows = await session.execute(
        text(
            "SELECT id, finding_type, currency_pair, amount_usd, severity, "
            "narrative, finding_hash, created_at "
            "FROM audit_findings WHERE run_id = :rid"
        ),
        {"rid": run_id},
    )
    findings_raw = findings_rows.fetchall()

    from app.services.regulatory_export import export_finra_17a4, export_isda_xml

    if format == "isda":
        # Load the run's dataset to get period dates
        ds_row = await session.execute(
            text(
                "SELECT d.period_start, d.period_end "
                "FROM audit_datasets d "
                "JOIN audit_runs r ON r.dataset_id = d.id "
                "WHERE r.id = :rid LIMIT 1"
            ),
            {"rid": run_id},
        )
        ds = ds_row.fetchone()

        # Load actual transactions from the dataset (same pattern as get_run_transactions)
        txn_rows = await session.execute(
            text(
                "SELECT t.id, t.trade_date, t.value_date, t.currency_sold, "
                "t.currency_bought, t.amount_sold, t.amount_bought, "
                "t.effective_rate, t.counterparty, t.reference "
                "FROM audit_transactions t "
                "JOIN audit_runs r ON r.dataset_id = t.dataset_id "
                "WHERE r.id = :rid ORDER BY t.row_index"
            ),
            {"rid": run_id},
        )

        # Build run_data with proper trade dates from dataset
        run_data = {
            "run_id": str(row.id),
            "trade_date": str(ds.period_start) if ds else "",
            "value_date": str(ds.period_end) if ds else "",
            "counterparty": "",  # aggregated — no single counterparty
            "currency_base": "",
            "currency_quote": "",
            "notional": "",
            "rate": "",
        }

        # Map transactions to ISDA trade leg format
        transactions = []
        for t in txn_rows.fetchall():
            amt_sold = float(t.amount_sold) if t.amount_sold is not None else 0
            amt_bought = float(t.amount_bought) if t.amount_bought is not None else 0
            # Sell leg
            if amt_sold:
                transactions.append({
                    "transaction_id": str(t.id) + "-SELL",
                    "direction": "SELL",
                    "currency": t.currency_sold or "",
                    "amount": amt_sold,
                    "rate": float(t.effective_rate) if t.effective_rate is not None else "",
                    "value_date": str(t.value_date) if t.value_date else str(t.trade_date) if t.trade_date else "",
                })
            # Buy leg
            if amt_bought:
                transactions.append({
                    "transaction_id": str(t.id) + "-BUY",
                    "direction": "BUY",
                    "currency": t.currency_bought or "",
                    "amount": amt_bought,
                    "rate": float(t.effective_rate) if t.effective_rate is not None else "",
                    "value_date": str(t.value_date) if t.value_date else str(t.trade_date) if t.trade_date else "",
                })

        # Build audit summary data for the ISDA export
        audit_summary = {
            "total_markup_usd": summary.get("total_markup_usd", 0),
            "total_loss_usd": summary.get("total_loss_usd", 0),
            "methodology_version": row.methodology_version,
            "findings_count": len(findings_raw),
            "findings_total_usd": sum(float(f.amount_usd) for f in findings_raw),
        }

        content = export_isda_xml(run_data, transactions, audit_summary=audit_summary)
        return {"format": "isda_xml", "content": content}
    else:
        # FINRA 17a-4: use findings with proper field mappings
        findings = []
        for f in findings_raw:
            findings.append({
                "finding_id": str(f.id),
                "timestamp": f.created_at.isoformat() if f.created_at else "",
                "category": f.finding_type,
                "severity": f.severity,
                "description": f.narrative or "",
            })

        run_data = {
            "run_id": str(row.id),
            "run_hash": row.run_hash,
            "methodology_version": row.methodology_version,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "generated_by": "audit_lab",
            "report_date": row.created_at.isoformat()[:10] if row.created_at else None,
        }
        hashes = [f.finding_hash for f in findings_raw]
        content = export_finra_17a4(run_data, findings, hashes)
        return {"format": "finra_17a4", "content": content}
