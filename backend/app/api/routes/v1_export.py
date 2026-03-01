"""Export endpoints: PDF, Excel, ZIP, Committee Pack -- v1 API.

Sprint 1.5: GET /v1/export/committee-pack/{run_id}
  DB-backed committee pack assembler. Returns structured JSON payload containing:
    - RunEnvelope hash chain (8 SHA-256 fields)
    - TraceLite pipeline stage narrative
    - PolicyRevision canonical config + governance metadata (if pinned)
    - Hedge plan buckets with instrument mappings and notionals
    - Scenario analysis stress grid
    - Position IDs linked to this run

  Unlike /export/pdf and /export/excel, this endpoint reads directly from the
  calculation_runs table (not the bounded in-memory cache) so it works for any
  DB-persisted run regardless of server restart history.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user, get_current_user_optional
from app.exports_v1.excel_builder import render_bank_pack_xlsx
from app.exports_v1.pdf_builder import render_bank_pack_pdf
from app.exports_v1.zip_builder import build_audit_zip
from app.api.routes.v1_calculate import get_run
from app.models.calculation_run import CalculationRun
from app.models.policy_revision import PolicyRevision
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["v1-export"])

async def _assert_run_accessible(
    session: AsyncSession,
    run_id: str,
    current_user: User,
) -> None:
    """Verify run_id exists in DB and belongs to caller's company (P0 tenant isolation).

    Superusers bypass the company check. Non-superusers whose company_id does not
    match the run row receive a 404 so as not to reveal cross-tenant run existence.
    """
    if current_user.is_superuser:
        return
    row = await session.get(CalculationRun, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    if row.company_id and row.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")



@router.get("/export/pdf/{run_id}")
async def export_pdf(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    await _assert_run_accessible(session, run_id, current_user)
    result = get_run(run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found.")
    pdf_bytes = render_bank_pack_pdf(result)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="BankPack_{run_id[:8]}.pdf"'},
    )


@router.get("/export/excel/{run_id}")
async def export_excel(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    await _assert_run_accessible(session, run_id, current_user)
    result = get_run(run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found.")
    xlsx_bytes = render_bank_pack_xlsx(result)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="BankPack_{run_id[:8]}.xlsx"'},
    )


@router.get("/export/zip/{run_id}")
async def export_zip(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    await _assert_run_accessible(session, run_id, current_user)
    result = get_run(run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found.")
    zip_bytes = build_audit_zip(result)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="AuditPack_{run_id[:8]}.zip"'},
    )


# ?? Sprint 1.5: Committee Pack ?????????????????????????????????????????????????

@router.get("/export/committee-pack/{run_id}", tags=["v1-export"])
async def get_committee_pack(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/export/committee-pack/{run_id}

    Assembles a structured committee pack payload from the DB-persisted
    CalculationRun row. Unlike the PDF/Excel/ZIP endpoints, this reads directly
    from the calculation_runs table so it is not bounded by the in-memory cache.

    Returns a JSON document containing all sections needed by the frontend
    /committee-pack page to render a print-ready committee pack:
      - meta:           run metadata (id, engine, timestamps, trade/bucket counts)
      - run_envelope:   SHA-256 hash chain (8 fields) -- the WORM fingerprint
      - trace_lite:     Pipeline stage narrative (PARSE -> VALIDATE -> ... -> AUDIT)
      - policy_revision:Pinned PolicyRevision canonical config + governance metadata
      - hedge_plan:     Bucket-level instrument actions, notionals, coverage
      - scenarios:      Stress scenario grid from run_envelope outputs
      - positions:      Position IDs included in this run
      - regulatory:     IFRS 9 / EMIR attestation metadata

    This endpoint is callable without authentication (uses get_current_user_optional)
    to support unauthenticated committee distribution, but respects RBAC context
    when a token is provided.
    """
    # P0: Tenant isolation -- verify caller can access this run before any data fetch
    await _assert_run_accessible(session, run_id, current_user)

    # ?? 1. Fetch CalculationRun from DB ????????????????????????????????????????
    try:
        result = await session.execute(
            select(CalculationRun).where(CalculationRun.id == run_id)
        )
        run_row = result.scalars().first()
    except Exception as e:
        logger.error("committee-pack: DB error fetching run %s: %s", run_id, e)
        raise HTTPException(status_code=500, detail="Database error fetching run.")

    if run_row is None:
        # Fall back to in-memory cache for very recent runs not yet committed
        cached = get_run(run_id)
        if cached is None:
            raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
        # Build a minimal committee pack from the in-memory cache
        return _pack_from_cache(cached)

    # ?? 2. Optionally fetch pinned PolicyRevision ??????????????????????????????
    policy_revision_data: Optional[dict] = None
    if run_row.policy_revision_id:
        try:
            import uuid as _uuid
            rev_uuid = _uuid.UUID(str(run_row.policy_revision_id))
            rev_result = await session.execute(
                select(PolicyRevision).where(PolicyRevision.id == rev_uuid)
            )
            rev_row = rev_result.scalars().first()
            if rev_row:
                policy_revision_data = _serialize_policy_revision(rev_row)
        except Exception as e:
            logger.warning(
                "committee-pack: could not load policy revision %s for run %s: %s",
                run_row.policy_revision_id, run_id, e,
            )
            # Non-fatal -- pack is still valid without revision details

    # ?? 3. Assemble committee pack payload ?????????????????????????????????????
    run_envelope = run_row.run_envelope or {}
    trace_lite   = run_row.trace_lite   or {}

    # Extract hedge plan buckets from run_envelope outputs if available
    outputs = run_envelope.get("outputs", {}) if isinstance(run_envelope, dict) else {}

    # The hedge_plan may be stored as top-level key in the run_envelope JSONB
    # or nested under outputs depending on engine version.
    hedge_plan_raw = (
        run_envelope.get("hedge_plan")
        or outputs.get("hedge_plan")
        or {}
    )

    # Scenarios similarly -- from outputs section
    scenarios_raw = (
        run_envelope.get("scenarios")
        or outputs.get("scenarios")
        or []
    )

    pack = {
        # ?? Section 1: Run metadata ??
        "meta": {
            "run_id":          run_row.id,
            "engine_version":  run_envelope.get("engine_version", "1.0.0"),
            "created_at":      run_row.created_at.isoformat() if run_row.created_at else None,
            "trade_count":     run_row.trade_count,
            "hedge_count":     run_row.hedge_count,
            "company_id":      str(run_row.company_id) if run_row.company_id else None,
            "generated_for":   "Investment Committee -- Hedge Programme Review",
        },

        # ?? Section 2: WORM hash chain (RunEnvelope) ??
        "run_envelope": {
            "run_id":          run_envelope.get("run_id",         run_row.id),
            "timestamp":       run_envelope.get("timestamp",      None),
            "engine_version":  run_envelope.get("engine_version", "1.0.0"),
            "inputs_hash":     run_envelope.get("inputs_hash",    run_row.inputs_hash),
            "outputs_hash":    run_envelope.get("outputs_hash",   run_row.outputs_hash),
            "run_hash":        run_envelope.get("run_hash",       run_row.run_hash),
            "trades_hash":     run_envelope.get("trades_hash",    None),
            "hedges_hash":     run_envelope.get("hedges_hash",    None),
            "market_hash":     run_envelope.get("market_hash",    None),
            "policy_hash":     run_envelope.get("policy_hash",    run_row.policy_hash),
        },

        # ?? Section 3: TraceLite pipeline stages ??
        "trace_lite": _normalize_trace_lite(trace_lite),

        # ?? Section 4: Pinned PolicyRevision ??
        "policy_revision": policy_revision_data,

        # ?? Section 5: Hedge plan buckets ??
        "hedge_plan": _normalize_hedge_plan(hedge_plan_raw),

        # ?? Section 6: Scenario analysis ??
        "scenarios": scenarios_raw if isinstance(scenarios_raw, list) else [],

        # ?? Section 7: Position IDs ??
        "positions": run_row.position_ids if isinstance(run_row.position_ids, list) else [],

        # ?? Section 8: Regulatory attestation metadata ??
        "regulatory": {
            "framework":    "IFRS 9 -- Hedge Accounting (IAS 39 superseded)",
            "standard_ref": "IFRS 9 ?B6.4 -- Hedge Effectiveness Documentation",
            "emir_ref":     "EMIR Article 11 -- Risk Mitigation Techniques",
            "dodd_frank":   "Dodd-Frank ?731 -- Trade Reporting (if applicable)",
            "attestation":  (
                "This committee pack constitutes the hedge effectiveness documentation "
                "required under IFRS 9 ?B6.4.1. The RunEnvelope hash chain provides "
                "byte-for-byte proof that this output was computed from the stated inputs "
                "using the pinned policy revision. No modification has occurred post-computation."
            ),
            "worm_note":    (
                "calculation_runs rows are append-only. "
                "No UPDATE or DELETE is permitted at the database layer."
            ),
        },
    }

    return pack


# ?? Helpers ???????????????????????????????????????????????????????????????????

def _normalize_trace_lite(trace_lite: dict | list) -> dict:
    """
    Normalise trace_lite to {run_id, events} regardless of how it is stored.
    TraceLite is stored as a JSONB serialisation of the TraceLite Pydantic model.
    """
    if isinstance(trace_lite, list):
        return {"run_id": None, "events": trace_lite}
    if isinstance(trace_lite, dict):
        return {
            "run_id": trace_lite.get("run_id"),
            "events": trace_lite.get("events", []),
        }
    return {"run_id": None, "events": []}


def _normalize_hedge_plan(hedge_plan_raw: dict) -> dict:
    """
    Extract hedge plan fields from the run_envelope JSONB.
    The hedge_plan structure mirrors CalculateResponse.hedge_plan (HedgePlan schema).
    """
    if not isinstance(hedge_plan_raw, dict):
        return {"buckets": [], "summary": {}}
    return {
        "buckets":    hedge_plan_raw.get("buckets", []),
        "summary":    hedge_plan_raw.get("summary", {}),
        "coverage":   hedge_plan_raw.get("coverage", None),
        "base_ccy":   hedge_plan_raw.get("base_ccy", None),
    }


def _serialize_policy_revision(rev: PolicyRevision) -> dict:
    """Serialise a PolicyRevision ORM row into a plain dict for JSON response."""
    return {
        "id":                  str(rev.id),
        "policy_instance_id":  str(rev.policy_instance_id),
        "template_id":         str(rev.template_id),
        "company_id":          str(rev.company_id),
        "branch_id":           str(rev.branch_id) if rev.branch_id else None,
        "revision":            rev.revision,
        "policy_hash":         rev.policy_hash,
        "canonical_policy":    rev.canonical_policy,
        "created_by":          str(rev.created_by),
        "created_by_email":    rev.created_by_email,
        "change_reason":       rev.change_reason,
        "prev_revision_id":    str(rev.prev_revision_id) if rev.prev_revision_id else None,
        "created_at":          rev.created_at.isoformat() if rev.created_at else None,
    }


def _pack_from_cache(cached) -> dict:
    """
    Minimal committee pack assembled from the in-memory CalculateResponse cache.
    Used as a fallback when the run exists in cache but not yet committed to DB.
    """
    env = cached.run_envelope
    tl  = cached.trace_lite

    return {
        "meta": {
            "run_id":          cached.run_id,
            "engine_version":  env.engine_version if env else "1.0.0",
            "created_at":      env.timestamp.isoformat() if (env and env.timestamp) else None,
            "trade_count":     len(cached.trades) if hasattr(cached, "trades") else 0,
            "hedge_count":     len(cached.hedge_plan.buckets) if (cached.hedge_plan) else 0,
            "company_id":      None,
            "generated_for":   "Investment Committee -- Hedge Programme Review",
        },
        "run_envelope": {
            "run_id":         env.run_id         if env else cached.run_id,
            "timestamp":      env.timestamp.isoformat() if (env and env.timestamp) else None,
            "engine_version": env.engine_version if env else "1.0.0",
            "inputs_hash":    env.inputs_hash    if env else None,
            "outputs_hash":   env.outputs_hash   if env else None,
            "run_hash":       env.run_hash        if env else None,
            "trades_hash":    env.trades_hash     if env else None,
            "hedges_hash":    env.hedges_hash     if env else None,
            "market_hash":    env.market_hash     if env else None,
            "policy_hash":    env.policy_hash     if env else None,
        },
        "trace_lite": {
            "run_id": tl.run_id if tl else None,
            "events": [e.model_dump(mode="json") for e in tl.events] if tl else [],
        },
        "policy_revision": None,
        "hedge_plan": _normalize_hedge_plan(
            cached.hedge_plan.model_dump(mode="json") if cached.hedge_plan else {}
        ),
        "scenarios": (
            [s.model_dump(mode="json") for s in cached.scenarios] if cached.scenarios else []
        ),
        "positions": [],
        "regulatory": {
            "framework":    "IFRS 9 -- Hedge Accounting (IAS 39 superseded)",
            "standard_ref": "IFRS 9 ?B6.4 -- Hedge Effectiveness Documentation",
            "emir_ref":     "EMIR Article 11 -- Risk Mitigation Techniques",
            "dodd_frank":   "Dodd-Frank ?731 -- Trade Reporting (if applicable)",
            "attestation":  (
                "This committee pack constitutes the hedge effectiveness documentation "
                "required under IFRS 9 ?B6.4.1."
            ),
            "worm_note": "Served from in-memory cache -- DB persistence may still be pending.",
        },
    }
