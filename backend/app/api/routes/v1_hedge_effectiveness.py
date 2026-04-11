"""
backend/app/api/routes/v1_hedge_effectiveness.py

Hedge Effectiveness API -- IFRS 9 / ASC 815 compliance testing.

Endpoints:
  POST /v1/hedge-effectiveness/datasets                  -- create dataset (JSON body)
  POST /v1/hedge-effectiveness/datasets/upload            -- CSV upload
  GET  /v1/hedge-effectiveness/datasets/{dataset_id}      -- dataset detail + periods
  GET  /v1/hedge-effectiveness/datasets                   -- list datasets
  PATCH /v1/hedge-effectiveness/datasets/{dataset_id}     -- update metadata
  POST /v1/hedge-effectiveness/datasets/{dataset_id}/clone -- clone dataset
  POST /v1/hedge-effectiveness/assess                     -- run effectiveness assessment
  GET  /v1/hedge-effectiveness/runs                       -- list assessment runs
  GET  /v1/hedge-effectiveness/runs/{run_id}              -- full assessment report
  GET  /v1/hedge-effectiveness/runs/{run_id}/export       -- evidence binder
  POST /v1/hedge-effectiveness/runs/batch-delete          -- delete runs by ID list

All endpoints: JWT required, tenant-scoped by company_id.
"""
import csv
import hashlib
import io
import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.engine.hedge_effectiveness_engine import (
    EffectivenessConfig,
    EffectivenessPeriod,
    run_hedge_effectiveness,
)
from app.models.hedge_effectiveness import HedgeEffectivenessDataset, HedgeEffectivenessRun
from app.models.user import User
from app.services import rbac_service
from app.services.audit_emit import emit_audit
from app.services.regulatory_export import export_ifrs9_xml

router = APIRouter(prefix="/v1/hedge-effectiveness", tags=["hedge-effectiveness"])
# -- Permission helper -------------------------------------------------------

async def _require(session: AsyncSession, user: User, codename: str) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if codename not in perms and "calculate.run_production" not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {codename}")


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


async def _fetch_eff_run_and_dataset(
    session: AsyncSession,
    run_id: str,
    company_id,
) -> tuple[HedgeEffectivenessRun, HedgeEffectivenessDataset]:
    """Fetch HedgeEffectivenessRun + dataset, tenant-scoped. Raises 404 if not found."""
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
class BatchDeleteRunsRequest(BaseModel):
    run_ids: list[str] = Field(..., min_length=1, max_length=50)
class UpdateDatasetRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    currency_pair: str | None = None
    designation_date: str | None = None
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

    company_id = current_user.company_id

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

    dataset = HedgeEffectivenessDataset(
        id=uuid.uuid4(),
        company_id=company_id,
        name=body.name,
        description=body.description,
        currency_pair=body.currency_pair,
        hedge_type=body.hedge_type,
        designation_date=body.designation_date,
        source="manual",
        period_count=len(periods_data),
        data_json=periods_data,
        source_hash=source_hash,
        created_by=current_user.id,
        created_at=datetime.now(UTC),
    )
    session.add(dataset)
    await session.commit()

    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"Hedge effectiveness dataset created: {body.name} ({len(periods_data)} periods)",
        entity_type="hedge_effectiveness_dataset",
        entity_id=str(dataset.id),
        payload={
            "name": body.name,
            "period_count": len(periods_data),
            "currency_pair": body.currency_pair,
            "source_hash": source_hash,
        },
    )

    return {
        "dataset_id": str(dataset.id),
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

    company_id = current_user.company_id
    data_json_str = json.dumps(rows, sort_keys=True, default=str)
    source_hash = hashlib.sha256(raw_bytes).hexdigest()

    dataset = HedgeEffectivenessDataset(
        id=uuid.uuid4(),
        company_id=company_id,
        name=name.strip() or (file.filename or "upload.csv"),
        description=description.strip() or None,
        currency_pair=currency_pair.strip() or None,
        hedge_type=hedge_type.strip() or "cash_flow",
        designation_date=designation_date.strip() or None,
        source="csv_upload",
        period_count=len(rows),
        data_json=rows,
        source_hash=source_hash,
        created_by=current_user.id,
        created_at=datetime.now(UTC),
    )
    session.add(dataset)
    await session.commit()

    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"Hedge effectiveness CSV uploaded: {len(rows)} periods",
        entity_type="hedge_effectiveness_dataset",
        entity_id=str(dataset.id),
        payload={
            "period_count": len(rows),
            "source_hash": source_hash,
            "filename": file.filename,
        },
    )

    return {
        "dataset_id": str(dataset.id),
        "period_count": len(rows),
        "source_hash": source_hash,
        "parse_warnings": warnings[:50],
    }
# -- Endpoint: Get dataset (with period data) --------------------------------

@router.get("/datasets/{dataset_id}")
async def get_dataset(
    dataset_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    GET /v1/hedge-effectiveness/datasets/{dataset_id}

    Returns dataset metadata plus the full period data array.
    Used by the period data viewer in the frontend.
    """
    company_id = current_user.company_id
    try:
        uuid_id = uuid.UUID(dataset_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid dataset_id.")
    stmt = select(HedgeEffectivenessDataset).where(
        HedgeEffectivenessDataset.id == uuid_id,
        HedgeEffectivenessDataset.company_id == company_id,
    )
    result = await session.execute(stmt)
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    data = ds.data_json if isinstance(ds.data_json, list) else (
        json.loads(ds.data_json) if isinstance(ds.data_json, str) else []
    )
    return {
        "id": str(ds.id),
        "name": ds.name,
        "description": ds.description,
        "currency_pair": ds.currency_pair,
        "hedge_type": ds.hedge_type,
        "designation_date": ds.designation_date,
        "source": ds.source,
        "period_count": ds.period_count,
        "source_hash": ds.source_hash,
        "created_at": ds.created_at.isoformat() if ds.created_at else None,
        "periods": data,
    }
# -- Endpoint: List datasets ------------------------------------------------

@router.get("/datasets")
async def list_datasets(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = current_user.company_id
    stmt = (
        select(HedgeEffectivenessDataset)
        .where(HedgeEffectivenessDataset.company_id == company_id)
        .order_by(HedgeEffectivenessDataset.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    datasets = result.scalars().all()

    items = []
    for ds in datasets:
        items.append({
            "id": str(ds.id),
            "name": ds.name,
            "description": ds.description,
            "currency_pair": ds.currency_pair,
            "hedge_type": ds.hedge_type,
            "designation_date": ds.designation_date,
            "source": ds.source,
            "period_count": ds.period_count,
            "source_hash": ds.source_hash,
            "created_at": ds.created_at.isoformat() if ds.created_at else None,
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

    company_id = current_user.company_id

    # Load dataset
    stmt = (
        select(HedgeEffectivenessDataset)
        .where(
            HedgeEffectivenessDataset.id == uuid.UUID(body.dataset_id),
            HedgeEffectivenessDataset.company_id == company_id,
        )
    )
    result = await session.execute(stmt)
    ds = result.scalar_one_or_none()
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
        designation_date=ds.designation_date,
    )

    # Run engine
    eff_result = run_hedge_effectiveness(
        dataset_id=body.dataset_id,
        periods=periods,
        config=config,
    )

    # Persist run (WORM)
    do_ratio = eff_result.dollar_offset.dollar_offset_ratio if eff_result.dollar_offset else None
    do_effective = eff_result.dollar_offset.is_effective if eff_result.dollar_offset else None
    reg_r2 = eff_result.regression.regression_r_squared if eff_result.regression else None
    reg_slope = eff_result.regression.regression_slope if eff_result.regression else None
    reg_effective = eff_result.regression.is_effective if eff_result.regression else None
    reg_method = eff_result.regression.method if eff_result.regression else None

    report_json = eff_result.to_dict()
    trace_bundle = {
        "run_id": str(uuid.uuid4()),
        "events": [e.to_dict() for e in eff_result.trace_events],
    }

    run = HedgeEffectivenessRun(
        id=uuid.uuid4(),
        company_id=company_id,
        dataset_id=uuid.UUID(body.dataset_id),
        methodology_version=eff_result.methodology_version,
        standard=eff_result.standard,
        method_requested=body.method,
        dollar_offset_ratio=do_ratio,
        dollar_offset_effective=do_effective,
        regression_r_squared=reg_r2,
        regression_slope=reg_slope,
        regression_effective=reg_effective,
        regression_method=reg_method,
        overall_effective=eff_result.overall_effective,
        run_hash=eff_result.run_hash,
        inputs_hash=eff_result.inputs_hash,
        outputs_hash=eff_result.outputs_hash,
        report_json=report_json,
        trace_bundle=trace_bundle,
        status="COMPLETED",
        created_by=current_user.id,
        created_at=datetime.now(UTC),
    )
    session.add(run)
    await session.commit()

    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=(
            f"Hedge effectiveness assessment: "
            f"{'EFFECTIVE' if eff_result.overall_effective else 'INEFFECTIVE'} "
            f"under {eff_result.standard}"
            + (f" (dollar-offset: {do_ratio:.4f})" if do_ratio else "")
        ),
        entity_type="hedge_effectiveness_run",
        entity_id=str(run.id),
        payload={
            "run_hash": eff_result.run_hash,
            "dataset_id": body.dataset_id,
            "standard": eff_result.standard,
            "overall_effective": eff_result.overall_effective,
            "dollar_offset_ratio": do_ratio,
            "regression_r_squared": reg_r2,
        },
    )

    return {
        "run_id": str(run.id),
        "run_hash": eff_result.run_hash,
        "overall_effective": eff_result.overall_effective,
        "standard": eff_result.standard,
        "dollar_offset": eff_result.dollar_offset.to_dict() if eff_result.dollar_offset else None,
        "regression": eff_result.regression.to_dict() if eff_result.regression else None,
        "determination_narrative": eff_result.determination_narrative,
        "compliance_notes": eff_result.compliance_notes,
    }
# -- Endpoint: List runs ----------------------------------------------------

@router.get("/runs")
async def list_runs(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    company_id = current_user.company_id

    stmt = (
        select(HedgeEffectivenessRun, HedgeEffectivenessDataset.name, HedgeEffectivenessDataset.currency_pair)
        .join(HedgeEffectivenessDataset, HedgeEffectivenessDataset.id == HedgeEffectivenessRun.dataset_id)
        .where(HedgeEffectivenessRun.company_id == company_id)
        .order_by(HedgeEffectivenessRun.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    rows = result.all()

    items = []
    for run, dataset_name, currency_pair in rows:
        items.append({
            "run_id": str(run.id),
            "dataset_id": str(run.dataset_id),
            "dataset_name": dataset_name,
            "currency_pair": currency_pair,
            "methodology_version": run.methodology_version,
            "standard": run.standard,
            "method_requested": run.method_requested,
            "dollar_offset_ratio": float(run.dollar_offset_ratio) if run.dollar_offset_ratio is not None else None,
            "dollar_offset_effective": run.dollar_offset_effective,
            "regression_r_squared": float(run.regression_r_squared) if run.regression_r_squared is not None else None,
            "regression_slope": float(run.regression_slope) if run.regression_slope is not None else None,
            "regression_effective": run.regression_effective,
            "overall_effective": run.overall_effective,
            "run_hash": run.run_hash,
            "status": run.status,
            "created_at": run.created_at.isoformat() if run.created_at else None,
        })
    return items
# -- Endpoint: Get run detail -----------------------------------------------

@router.get("/runs/{run_id}")
async def get_run(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = current_user.company_id

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

    run, ds = row

    report = run.report_json if isinstance(run.report_json, dict) else (
        json.loads(run.report_json) if isinstance(run.report_json, str) else {}
    )

    return {
        "run_id": str(run.id),
        "dataset_id": str(run.dataset_id),
        "dataset_name": ds.name,
        "currency_pair": ds.currency_pair,
        "hedge_type": ds.hedge_type,
        "designation_date": ds.designation_date,
        "period_count": ds.period_count,
        "methodology_version": run.methodology_version,
        "standard": run.standard,
        "method_requested": run.method_requested,
        "dollar_offset_ratio": float(run.dollar_offset_ratio) if run.dollar_offset_ratio is not None else None,
        "dollar_offset_effective": run.dollar_offset_effective,
        "regression_r_squared": float(run.regression_r_squared) if run.regression_r_squared is not None else None,
        "regression_slope": float(run.regression_slope) if run.regression_slope is not None else None,
        "regression_effective": run.regression_effective,
        "regression_method": run.regression_method,
        "overall_effective": run.overall_effective,
        "run_hash": run.run_hash,
        "inputs_hash": run.inputs_hash,
        "outputs_hash": run.outputs_hash,
        "status": run.status,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "report": report,
        "trace_bundle": run.trace_bundle,
    }
# -- Endpoint: Export evidence binder ----------------------------------------

@router.get("/runs/{run_id}/export")
async def export_run(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = current_user.company_id

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

    run, ds = row

    report = run.report_json if isinstance(run.report_json, dict) else (
        json.loads(run.report_json) if isinstance(run.report_json, str) else {}
    )

    return {
        "manifest_version": "1.0.0",
        "generated_at": datetime.now(UTC).isoformat(),
        "run_type": "hedge_effectiveness",
        "run_id": run_id,
        "run_hash": run.run_hash,
        "inputs_hash": run.inputs_hash,
        "outputs_hash": run.outputs_hash,
        "methodology_version": run.methodology_version,
        "standard": run.standard,
        "overall_effective": run.overall_effective,
        "dataset": {
            "id": str(run.dataset_id),
            "name": ds.name,
            "hash": ds.source_hash,
            "currency_pair": ds.currency_pair,
            "hedge_type": ds.hedge_type,
            "period_count": ds.period_count,
        },
        "results": {
            "dollar_offset_ratio": float(run.dollar_offset_ratio) if run.dollar_offset_ratio is not None else None,
            "regression_r_squared": float(run.regression_r_squared) if run.regression_r_squared is not None else None,
            "regression_slope": float(run.regression_slope) if run.regression_slope is not None else None,
        },
        "report": report,
        "trace_bundle": run.trace_bundle,
    }
# -- Endpoint: Download IFRS 9 XML ------------------------------------------

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
# -- Endpoint: Download ASC 815 XML -----------------------------------------

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
# -- Endpoint: Batch delete runs --------------------------------------------

@router.post("/runs/batch-delete")
async def batch_delete_runs(
    body: BatchDeleteRunsRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    POST /v1/hedge-effectiveness/runs/batch-delete

    Delete one or more assessment runs by ID (tenant-scoped).
    Uses POST /batch-delete instead of DELETE with body to avoid HTTP proxy stripping.
    Requires: hedge_effectiveness.run
    """
    await _require(session, current_user, "hedge_effectiveness.run")
    company_id = current_user.company_id
    deleted = 0
    for rid in body.run_ids:
        try:
            uuid_id = uuid.UUID(rid)
        except ValueError:
            continue
        stmt = select(HedgeEffectivenessRun).where(
            HedgeEffectivenessRun.id == uuid_id,
            HedgeEffectivenessRun.company_id == company_id,
        )
        result = await session.execute(stmt)
        run = result.scalar_one_or_none()
        if run:
            await session.delete(run)
            deleted += 1
    await session.commit()
    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"Batch deleted {deleted} hedge effectiveness assessment runs",
        entity_type="hedge_effectiveness_run",
        entity_id="batch",
        payload={"run_ids": body.run_ids, "deleted": deleted},
    )
    return {"deleted": deleted}
# -- Endpoint: Update dataset metadata --------------------------------------

@router.patch("/datasets/{dataset_id}")
async def update_dataset_metadata(
    dataset_id: str,
    body: UpdateDatasetRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    PATCH /v1/hedge-effectiveness/datasets/{dataset_id}

    Update editable metadata on an existing dataset: name, description,
    currency_pair, designation_date. Period data is immutable.
    Requires: hedge_effectiveness.run
    """
    await _require(session, current_user, "hedge_effectiveness.run")
    company_id = current_user.company_id
    try:
        uuid_id = uuid.UUID(dataset_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid dataset_id.")
    stmt = select(HedgeEffectivenessDataset).where(
        HedgeEffectivenessDataset.id == uuid_id,
        HedgeEffectivenessDataset.company_id == company_id,
    )
    result = await session.execute(stmt)
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    if body.name is not None:
        ds.name = body.name
    if body.description is not None:
        ds.description = body.description or None
    if body.currency_pair is not None:
        ds.currency_pair = body.currency_pair or None
    if body.designation_date is not None:
        ds.designation_date = body.designation_date or None
    await session.commit()
    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"Dataset metadata updated: {ds.name}",
        entity_type="hedge_effectiveness_dataset",
        entity_id=dataset_id,
        payload={"name": ds.name, "currency_pair": ds.currency_pair, "designation_date": ds.designation_date},
    )
    return {"dataset_id": dataset_id, "updated": True}
# -- Endpoint: Clone dataset ------------------------------------------------

@router.post("/datasets/{dataset_id}/clone")
async def clone_dataset(
    dataset_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    POST /v1/hedge-effectiveness/datasets/{dataset_id}/clone

    Duplicates an existing dataset (same period data, '(Copy)' name suffix).
    Produces a new independent dataset UUID — the clone can be freely edited
    without affecting the source.
    Requires: hedge_effectiveness.run
    """
    await _require(session, current_user, "hedge_effectiveness.run")
    company_id = current_user.company_id
    try:
        uuid_id = uuid.UUID(dataset_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid dataset_id.")
    stmt = select(HedgeEffectivenessDataset).where(
        HedgeEffectivenessDataset.id == uuid_id,
        HedgeEffectivenessDataset.company_id == company_id,
    )
    result = await session.execute(stmt)
    src = result.scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    data = src.data_json if isinstance(src.data_json, list) else (
        json.loads(src.data_json) if isinstance(src.data_json, str) else []
    )

    clone = HedgeEffectivenessDataset(
        id=uuid.uuid4(),
        company_id=company_id,
        name=f"{src.name} (Copy)",
        description=src.description,
        currency_pair=src.currency_pair,
        hedge_type=src.hedge_type,
        designation_date=src.designation_date,
        source=src.source,
        period_count=src.period_count,
        data_json=data,
        source_hash=src.source_hash,
        created_by=current_user.id,
        created_at=datetime.now(UTC),
    )
    session.add(clone)
    await session.commit()

    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"Dataset cloned: {src.name} -> {clone.name}",
        entity_type="hedge_effectiveness_dataset",
        entity_id=str(clone.id),
        payload={"source_id": dataset_id, "name": clone.name, "period_count": src.period_count},
    )

    return {
        "dataset_id": str(clone.id),
        "name": clone.name,
        "period_count": clone.period_count,
    }
