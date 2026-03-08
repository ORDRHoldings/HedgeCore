"""
backend/app/api/routes/v1_hedge_effectiveness.py

Hedge Effectiveness API -- IFRS 9 / ASC 815 compliance testing.

Endpoints:
  POST /v1/hedge-effectiveness/datasets           -- create dataset (JSON body)
  POST /v1/hedge-effectiveness/datasets/upload     -- CSV upload
  GET  /v1/hedge-effectiveness/datasets            -- list datasets
  POST /v1/hedge-effectiveness/assess              -- run effectiveness assessment
  GET  /v1/hedge-effectiveness/runs                -- list assessment runs
  GET  /v1/hedge-effectiveness/runs/{run_id}       -- full assessment report
  GET  /v1/hedge-effectiveness/runs/{run_id}/export -- evidence binder

All endpoints: JWT required, tenant-scoped by company_id.
"""
import csv
import hashlib
import io
import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.engine.hedge_effectiveness_engine import (
    EffectivenessConfig,
    EffectivenessPeriod,
    run_hedge_effectiveness,
)
from app.models.user import User
from app.services import rbac_service
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/hedge-effectiveness", tags=["hedge-effectiveness"])
# -- Permission helper -------------------------------------------------------

async def _require(session: AsyncSession, user: User, codename: str) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if codename not in perms and "calculate.run_production" not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {codename}")
# -- Request schemas ---------------------------------------------------------

class DatasetPeriod(BaseModel):
    period_date: str | None = None
    hedged_item_fv_change: float
    instrument_fv_change: float
class CreateDatasetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    currency_pair: str | None = None
    hedge_type: str = Field(default="cash_flow")
    designation_date: str | None = None
    periods: list[DatasetPeriod] = Field(..., min_length=2)
class AssessRequest(BaseModel):
    dataset_id: str
    standard: str = Field(default="ASC_815")
    method: str = Field(default="both")
# -- CSV parser --------------------------------------------------------------

def _parse_effectiveness_csv(raw_bytes: bytes) -> tuple[list[dict], list[str]]:
    """Parse CSV with columns: period_date, hedged_item_fv_change, instrument_fv_change."""
    content = raw_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        raise HTTPException(status_code=422, detail="CSV has no headers.")

    headers_lower = {h.strip().lower(): h for h in reader.fieldnames}

    # Map expected columns
    date_col = None
    hedged_col = None
    instrument_col = None
    for raw_h, orig_h in headers_lower.items():
        if raw_h in ("period_date", "date", "period", "observation_date"):
            date_col = orig_h
        elif raw_h in ("hedged_item_fv_change", "hedged_item", "hedged_change", "hedged", "hedged_fv"):
            hedged_col = orig_h
        elif raw_h in ("instrument_fv_change", "instrument_change", "instrument", "hedge_instrument", "instrument_fv"):
            instrument_col = orig_h

    if not hedged_col or not instrument_col:
        raise HTTPException(
            status_code=422,
            detail=(
                "CSV must contain columns for hedged item FV changes and "
                "instrument FV changes. Expected: hedged_item_fv_change, instrument_fv_change"
            ),
        )

    rows: list[dict] = []
    warnings: list[str] = []
    for i, raw_row in enumerate(reader):
        hedged_str = raw_row.get(hedged_col, "").strip().replace(",", "")
        instrument_str = raw_row.get(instrument_col, "").strip().replace(",", "")

        if not hedged_str or not instrument_str:
            warnings.append(f"Row {i}: missing FV change data, skipped")
            continue

        try:
            hedged_val = float(hedged_str)
            instrument_val = float(instrument_str)
        except ValueError:
            warnings.append(f"Row {i}: non-numeric FV change data, skipped")
            continue

        period_date = raw_row.get(date_col, "").strip() if date_col else None

        rows.append({
            "period_index": len(rows),
            "period_date": period_date if period_date else None,
            "hedged_item_fv_change": hedged_val,
            "instrument_fv_change": instrument_val,
        })

    if len(rows) < 2:
        raise HTTPException(status_code=422, detail="CSV must contain at least 2 valid data rows.")

    return rows, warnings
# -- Endpoint: Create dataset (JSON) ----------------------------------------

@router.post("/datasets")
async def create_dataset(
    body: CreateDatasetRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require(session, current_user, "hedge_effectiveness.run")

    company_id = str(current_user.company_id)
    dataset_id = str(uuid.uuid4())

    periods_data = []
    for i, p in enumerate(body.periods):
        periods_data.append({
            "period_index": i,
            "period_date": p.period_date,
            "hedged_item_fv_change": p.hedged_item_fv_change,
            "instrument_fv_change": p.instrument_fv_change,
        })

    data_json = json.dumps(periods_data, sort_keys=True, default=str)
    source_hash = hashlib.sha256(data_json.encode("utf-8")).hexdigest()

    await session.execute(
        text(
            "INSERT INTO hedge_effectiveness_datasets "
            "(id, company_id, name, description, currency_pair, hedge_type, "
            " designation_date, source, period_count, data_json, source_hash, "
            " created_by, created_at) "
            "VALUES (:id, :cid, :name, :desc, :pair, :ht, :dd, 'manual', "
            " :pc, :dj, :sh, :cb, NOW())"
        ),
        {
            "id": dataset_id,
            "cid": company_id,
            "name": body.name,
            "desc": body.description,
            "pair": body.currency_pair,
            "ht": body.hedge_type,
            "dd": body.designation_date,
            "pc": len(periods_data),
            "dj": data_json,
            "sh": source_hash,
            "cb": str(current_user.id),
        },
    )
    await session.commit()

    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"Hedge effectiveness dataset created: {body.name} ({len(periods_data)} periods)",
        entity_type="hedge_effectiveness_dataset",
        entity_id=dataset_id,
        payload={
            "name": body.name,
            "period_count": len(periods_data),
            "currency_pair": body.currency_pair,
            "source_hash": source_hash,
        },
    )

    return {
        "dataset_id": dataset_id,
        "name": body.name,
        "period_count": len(periods_data),
        "currency_pair": body.currency_pair,
        "source_hash": source_hash,
    }
# -- Endpoint: Upload dataset (CSV) -----------------------------------------

@router.post("/datasets/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    currency_pair: str = Form(default=""),
    hedge_type: str = Form(default="cash_flow"),
    designation_date: str = Form(default=""),
    description: str = Form(default=""),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require(session, current_user, "hedge_effectiveness.run")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=422, detail="Empty file.")

    rows, warnings = _parse_effectiveness_csv(raw_bytes)

    company_id = str(current_user.company_id)
    dataset_id = str(uuid.uuid4())
    data_json = json.dumps(rows, sort_keys=True, default=str)
    source_hash = hashlib.sha256(raw_bytes).hexdigest()

    await session.execute(
        text(
            "INSERT INTO hedge_effectiveness_datasets "
            "(id, company_id, name, description, currency_pair, hedge_type, "
            " designation_date, source, period_count, data_json, source_hash, "
            " created_by, created_at) "
            "VALUES (:id, :cid, :name, :desc, :pair, :ht, :dd, 'csv_upload', "
            " :pc, :dj, :sh, :cb, NOW())"
        ),
        {
            "id": dataset_id,
            "cid": company_id,
            "name": name.strip() or (file.filename or "upload.csv"),
            "desc": description.strip() or None,
            "pair": currency_pair.strip() or None,
            "ht": hedge_type.strip() or "cash_flow",
            "dd": designation_date.strip() or None,
            "pc": len(rows),
            "dj": data_json,
            "sh": source_hash,
            "cb": str(current_user.id),
        },
    )
    await session.commit()

    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"Hedge effectiveness CSV uploaded: {len(rows)} periods",
        entity_type="hedge_effectiveness_dataset",
        entity_id=dataset_id,
        payload={
            "period_count": len(rows),
            "source_hash": source_hash,
            "filename": file.filename,
        },
    )

    return {
        "dataset_id": dataset_id,
        "period_count": len(rows),
        "source_hash": source_hash,
        "parse_warnings": warnings[:50],
    }
# -- Endpoint: List datasets ------------------------------------------------

@router.get("/datasets")
async def list_datasets(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = str(current_user.company_id)
    rows = await session.execute(
        text(
            "SELECT id, name, description, currency_pair, hedge_type, "
            "designation_date, source, period_count, source_hash, created_at "
            "FROM hedge_effectiveness_datasets WHERE company_id = :cid "
            "ORDER BY created_at DESC LIMIT :lim"
        ),
        {"cid": company_id, "lim": limit},
    )
    items = []
    for r in rows.fetchall():
        items.append({
            "id": str(r.id),
            "name": r.name,
            "description": r.description,
            "currency_pair": r.currency_pair,
            "hedge_type": r.hedge_type,
            "designation_date": str(r.designation_date) if r.designation_date else None,
            "source": r.source,
            "period_count": r.period_count,
            "source_hash": r.source_hash,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return {"items": items, "total": len(items)}
# -- Endpoint: Run assessment -----------------------------------------------

@router.post("/assess")
async def run_assessment(
    body: AssessRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require(session, current_user, "hedge_effectiveness.run")

    company_id = str(current_user.company_id)

    # Load dataset
    ds_row = await session.execute(
        text(
            "SELECT id, name, currency_pair, hedge_type, designation_date, "
            "period_count, data_json "
            "FROM hedge_effectiveness_datasets "
            "WHERE id = :id AND company_id = :cid LIMIT 1"
        ),
        {"id": body.dataset_id, "cid": company_id},
    )
    ds = ds_row.fetchone()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    # Parse periods from stored data
    data = ds.data_json if isinstance(ds.data_json, list) else json.loads(ds.data_json)
    periods = [
        EffectivenessPeriod(
            period_index=p.get("period_index", i),
            period_date=p.get("period_date"),
            hedged_item_fv_change=float(p["hedged_item_fv_change"]),
            instrument_fv_change=float(p["instrument_fv_change"]),
        )
        for i, p in enumerate(data)
    ]

    config = EffectivenessConfig(
        standard=body.standard,
        method=body.method,
        hedge_type=ds.hedge_type or "cash_flow",
        currency_pair=ds.currency_pair,
        designation_date=str(ds.designation_date) if ds.designation_date else None,
    )

    # Run engine
    result = run_hedge_effectiveness(
        dataset_id=body.dataset_id,
        periods=periods,
        config=config,
    )

    # Persist run (WORM)
    run_id = str(uuid.uuid4())

    report_json = result.to_dict()
    trace_bundle = {
        "run_id": run_id,
        "events": [e.to_dict() for e in result.trace_events],
    }

    do_ratio = result.dollar_offset.dollar_offset_ratio if result.dollar_offset else None
    do_effective = result.dollar_offset.is_effective if result.dollar_offset else None
    reg_r2 = result.regression.regression_r_squared if result.regression else None
    reg_slope = result.regression.regression_slope if result.regression else None
    reg_effective = result.regression.is_effective if result.regression else None
    reg_method = result.regression.method if result.regression else None

    await session.execute(
        text(
            "INSERT INTO hedge_effectiveness_runs "
            "(id, company_id, dataset_id, methodology_version, standard, "
            " method_requested, dollar_offset_ratio, dollar_offset_effective, "
            " regression_r_squared, regression_slope, regression_effective, "
            " regression_method, overall_effective, run_hash, inputs_hash, "
            " outputs_hash, report_json, trace_bundle, status, "
            " created_by, created_at) "
            "VALUES (:id, :cid, :did, :mv, :std, :meth, :dor, :doe, "
            " :rr2, :rsl, :re, :rm, :oe, :rh, :ih, :oh, :rj, :tb, "
            " 'COMPLETED', :cb, NOW())"
        ),
        {
            "id": run_id,
            "cid": company_id,
            "did": body.dataset_id,
            "mv": result.methodology_version,
            "std": result.standard,
            "meth": body.method,
            "dor": do_ratio,
            "doe": do_effective,
            "rr2": reg_r2,
            "rsl": reg_slope,
            "re": reg_effective,
            "rm": reg_method,
            "oe": result.overall_effective,
            "rh": result.run_hash,
            "ih": result.inputs_hash,
            "oh": result.outputs_hash,
            "rj": json.dumps(report_json, default=str),
            "tb": json.dumps(trace_bundle, default=str),
            "cb": str(current_user.id),
        },
    )
    await session.commit()

    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=(
            f"Hedge effectiveness assessment: "
            f"{'EFFECTIVE' if result.overall_effective else 'INEFFECTIVE'} "
            f"under {result.standard} "
            f"(dollar-offset: {do_ratio:.4f})" if do_ratio else
            f"Hedge effectiveness assessment: "
            f"{'EFFECTIVE' if result.overall_effective else 'INEFFECTIVE'} "
            f"under {result.standard}"
        ),
        entity_type="hedge_effectiveness_run",
        entity_id=run_id,
        payload={
            "run_hash": result.run_hash,
            "dataset_id": body.dataset_id,
            "standard": result.standard,
            "overall_effective": result.overall_effective,
            "dollar_offset_ratio": do_ratio,
            "regression_r_squared": reg_r2,
        },
    )

    return {
        "run_id": run_id,
        "run_hash": result.run_hash,
        "overall_effective": result.overall_effective,
        "standard": result.standard,
        "dollar_offset": result.dollar_offset.to_dict() if result.dollar_offset else None,
        "regression": result.regression.to_dict() if result.regression else None,
        "determination_narrative": result.determination_narrative,
        "compliance_notes": result.compliance_notes,
    }
# -- Endpoint: List runs ----------------------------------------------------

@router.get("/runs")
async def list_runs(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    company_id = str(current_user.company_id)

    rows = await session.execute(
        text(
            "SELECT r.id, r.dataset_id, r.methodology_version, r.standard, "
            "r.method_requested, r.dollar_offset_ratio, r.dollar_offset_effective, "
            "r.regression_r_squared, r.regression_slope, r.regression_effective, "
            "r.overall_effective, r.run_hash, r.status, r.created_at, "
            "d.name as dataset_name, d.currency_pair "
            "FROM hedge_effectiveness_runs r "
            "JOIN hedge_effectiveness_datasets d ON d.id = r.dataset_id "
            "WHERE r.company_id = :cid "
            "ORDER BY r.created_at DESC LIMIT :lim"
        ),
        {"cid": company_id, "lim": limit},
    )
    result = []
    for row in rows.fetchall():
        result.append({
            "run_id": str(row.id),
            "dataset_id": str(row.dataset_id),
            "dataset_name": row.dataset_name,
            "currency_pair": row.currency_pair,
            "methodology_version": row.methodology_version,
            "standard": row.standard,
            "method_requested": row.method_requested,
            "dollar_offset_ratio": float(row.dollar_offset_ratio) if row.dollar_offset_ratio is not None else None,
            "dollar_offset_effective": row.dollar_offset_effective,
            "regression_r_squared": float(row.regression_r_squared) if row.regression_r_squared is not None else None,
            "regression_slope": float(row.regression_slope) if row.regression_slope is not None else None,
            "regression_effective": row.regression_effective,
            "overall_effective": row.overall_effective,
            "run_hash": row.run_hash,
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        })
    return result
# -- Endpoint: Get run detail -----------------------------------------------

@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = str(current_user.company_id)

    row = await session.execute(
        text(
            "SELECT r.id, r.dataset_id, r.methodology_version, r.standard, "
            "r.method_requested, r.dollar_offset_ratio, r.dollar_offset_effective, "
            "r.regression_r_squared, r.regression_slope, r.regression_effective, "
            "r.regression_method, r.overall_effective, r.run_hash, r.inputs_hash, "
            "r.outputs_hash, r.report_json, r.trace_bundle, r.status, "
            "r.created_at, r.created_by, "
            "d.name as dataset_name, d.currency_pair, d.hedge_type, "
            "d.designation_date, d.period_count, d.data_json "
            "FROM hedge_effectiveness_runs r "
            "JOIN hedge_effectiveness_datasets d ON d.id = r.dataset_id "
            "WHERE r.id = :rid AND r.company_id = :cid LIMIT 1"
        ),
        {"rid": run_id, "cid": company_id},
    )
    r = row.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Assessment run not found.")

    report = r.report_json if isinstance(r.report_json, dict) else (
        json.loads(r.report_json) if isinstance(r.report_json, str) else {}
    )

    return {
        "run_id": str(r.id),
        "dataset_id": str(r.dataset_id),
        "dataset_name": r.dataset_name,
        "currency_pair": r.currency_pair,
        "hedge_type": r.hedge_type,
        "designation_date": str(r.designation_date) if r.designation_date else None,
        "period_count": r.period_count,
        "methodology_version": r.methodology_version,
        "standard": r.standard,
        "method_requested": r.method_requested,
        "dollar_offset_ratio": float(r.dollar_offset_ratio) if r.dollar_offset_ratio is not None else None,
        "dollar_offset_effective": r.dollar_offset_effective,
        "regression_r_squared": float(r.regression_r_squared) if r.regression_r_squared is not None else None,
        "regression_slope": float(r.regression_slope) if r.regression_slope is not None else None,
        "regression_effective": r.regression_effective,
        "regression_method": r.regression_method,
        "overall_effective": r.overall_effective,
        "run_hash": r.run_hash,
        "inputs_hash": r.inputs_hash,
        "outputs_hash": r.outputs_hash,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "report": report,
        "trace_bundle": r.trace_bundle,
    }
# -- Endpoint: Export evidence binder ----------------------------------------

@router.get("/runs/{run_id}/export")
async def export_run(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = str(current_user.company_id)

    row = await session.execute(
        text(
            "SELECT r.id, r.dataset_id, r.methodology_version, r.standard, "
            "r.run_hash, r.inputs_hash, r.outputs_hash, r.overall_effective, "
            "r.dollar_offset_ratio, r.regression_r_squared, r.regression_slope, "
            "r.trace_bundle, r.report_json, r.created_at, "
            "d.name as dataset_name, d.source_hash as dataset_hash, "
            "d.currency_pair, d.hedge_type, d.period_count "
            "FROM hedge_effectiveness_runs r "
            "JOIN hedge_effectiveness_datasets d ON d.id = r.dataset_id "
            "WHERE r.id = :rid AND r.company_id = :cid LIMIT 1"
        ),
        {"rid": run_id, "cid": company_id},
    )
    r = row.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Assessment run not found.")

    report = r.report_json if isinstance(r.report_json, dict) else (
        json.loads(r.report_json) if isinstance(r.report_json, str) else {}
    )

    return {
        "manifest_version": "1.0.0",
        "generated_at": datetime.now(UTC).isoformat(),
        "run_type": "hedge_effectiveness",
        "run_id": run_id,
        "run_hash": r.run_hash,
        "inputs_hash": r.inputs_hash,
        "outputs_hash": r.outputs_hash,
        "methodology_version": r.methodology_version,
        "standard": r.standard,
        "overall_effective": r.overall_effective,
        "dataset": {
            "id": str(r.dataset_id),
            "name": r.dataset_name,
            "hash": r.dataset_hash,
            "currency_pair": r.currency_pair,
            "hedge_type": r.hedge_type,
            "period_count": r.period_count,
        },
        "results": {
            "dollar_offset_ratio": float(r.dollar_offset_ratio) if r.dollar_offset_ratio is not None else None,
            "regression_r_squared": float(r.regression_r_squared) if r.regression_r_squared is not None else None,
            "regression_slope": float(r.regression_slope) if r.regression_slope is not None else None,
        },
        "report": report,
        "trace_bundle": r.trace_bundle,
    }
