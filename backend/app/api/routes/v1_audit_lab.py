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
from __future__ import annotations

import csv
import hashlib
import io
import json
import uuid
from datetime import UTC, date, datetime

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
from app.services import rbac_service

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

@router.post("/datasets/upload")
async def upload_audit_dataset(
    file: UploadFile = File(...),
    period_start: str = Form(...),
    period_end: str = Form(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require(session, current_user, "audit.upload")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=422, detail="Empty file.")

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

    # Parse
    rows, warnings, currency_pairs = _parse_csv(raw_bytes)
    if not rows:
        raise HTTPException(status_code=422, detail="CSV parsed to zero rows.")

    # Validate period dates
    pstart = _parse_date(period_start)
    pend = _parse_date(period_end)
    if not pstart or not pend:
        raise HTTPException(status_code=422, detail="Invalid period_start or period_end date.")
    if pend < pstart:
        raise HTTPException(status_code=422, detail="period_end must be >= period_start.")

    # Insert dataset
    dataset_id = str(uuid.uuid4())
    await session.execute(
        text(
            "INSERT INTO audit_datasets "
            "(id, company_id, period_start, period_end, source_filename, source_hash, "
            " row_count, currency_pairs, created_by, created_at) "
            "VALUES (:id, :cid, :ps, :pe, :fn, :sh, :rc, :cp, :cb, NOW())"
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

    # Insert transactions
    for row in rows:
        txn_id = str(uuid.uuid4())
        rh = _row_hash(row)
        await session.execute(
            text(
                "INSERT INTO audit_transactions "
                "(id, dataset_id, company_id, row_index, trade_date, value_date, "
                " currency_sold, currency_bought, amount_sold, amount_bought, "
                " effective_rate, counterparty, fee_amount, fee_currency, reference, "
                " row_hash, parse_warnings, created_at) "
                "VALUES (:id, :did, :cid, :ri, :td, :vd, :cs, :cb, :as_, :ab, "
                " :er, :cp, :fa, :fc, :ref, :rh, :pw, NOW())"
            ),
            {
                "id": txn_id,
                "did": dataset_id,
                "cid": company_id,
                "ri": row["row_index"],
                "td": row["trade_date"],
                "vd": row["value_date"],
                "cs": row["currency_sold"],
                "cb": row["currency_bought"],
                "as_": row["amount_sold"],
                "ab": row["amount_bought"],
                "er": row["effective_rate"],
                "cp": row["counterparty"],
                "fa": row["fee_amount"],
                "fc": row["fee_currency"],
                "ref": row["reference"],
                "rh": rh,
                "pw": json.dumps(row["parse_warnings"]),
            },
        )

    await session.commit()

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

@router.post("/runs")
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

    # Load benchmarks from market_snapshots
    snap_rows = await session.execute(
        text(
            "SELECT id, market_snapshot_hash, provider, as_of, "
            "primary_currency, spot_rate, fetched_at "
            "FROM market_snapshots WHERE company_id = :cid ORDER BY as_of"
        ),
        {"cid": company_id},
    )
    benchmarks: list[BenchmarkEntry] = []
    for s in snap_rows.fetchall():
        ccy = (s.primary_currency or "MXN").upper()
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
        ))

    # Build benchmark config
    bsource = benchmark_config_raw.get("benchmark_source", "market_snapshot")
    budget_rate = benchmark_config_raw.get("budget_rate")
    bconfig = BenchmarkConfig(
        benchmark_source=bsource,
        budget_rate=float(budget_rate) if budget_rate is not None else None,
    )

    # Run engine
    period_start_d = period_start if isinstance(period_start, date) else (
        datetime.strptime(str(period_start), "%Y-%m-%d").date()
    )
    period_end_d = period_end if isinstance(period_end, date) else (
        datetime.strptime(str(period_end), "%Y-%m-%d").date()
    )

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

    # Unhedged impact findings
    for uh in result.unhedged_results:
        uh_hash = hashlib.sha256(
            json.dumps(uh.to_dict(), sort_keys=True, default=str).encode()
        ).hexdigest()
        sev = _sev(abs(uh.unhedged_impact_usd)) if uh.status == "COMPUTED" else "INFO"
        await session.execute(
            text(
                "INSERT INTO audit_findings "
                "(id, run_id, company_id, finding_type, currency_pair, counterparty, "
                " amount_usd, severity, narrative, evidence, finding_hash, created_at) "
                "VALUES (:id, :rid, :cid, 'UNHEDGED_IMPACT', :cp, NULL, "
                " :amt, :sev, :nar, :ev, :fh, NOW())"
            ),
            {
                "id": str(uuid.uuid4()),
                "rid": run_id,
                "cid": company_id,
                "cp": uh.currency_pair,
                "amt": uh.unhedged_impact_usd,
                "sev": sev,
                "nar": uh.narrative,
                "ev": json.dumps(uh.to_dict()),
                "fh": uh_hash,
            },
        )

    # Persist report
    report_json = {
        "run_id": run_id,
        "methodology_version": result.methodology_version,
        "summary": {
            "total_markup_usd": result.total_markup_usd,
            "total_fees_usd": result.total_fees_usd,
            "total_unhedged_impact_usd": result.total_unhedged_impact_usd,
            "total_loss_usd": result.total_loss_usd,
            "data_quality_score": result.data_quality_score,
            "fee_confidence": result.fee_confidence,
            "markup_rejections_count": len(result.markup_rejections),
        },
        "markup_by_pair": result.markup_by_pair,
        "markup_by_counterparty": result.markup_by_counterparty,
        "markup_by_month": result.markup_by_month,
        "unhedged_results": [u.to_dict() for u in result.unhedged_results],
        "markup_rejections": [r.to_dict() for r in result.markup_rejections],
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


# ── Endpoint: Get run ──────────────────────────────────────────────────────────

@router.get("/runs/{run_id}")
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
        "unhedged_results": report.get("unhedged_results", []),
        "trace_bundle": row.trace_bundle,
        "report_hash": row.report_hash,
    }


# ── Endpoint: Export evidence binder ──────────────────────────────────────────

@router.get("/runs/{run_id}/export")
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

@router.get("/datasets")
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
