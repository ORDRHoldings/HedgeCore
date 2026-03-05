"""
backend/app/api/routes/v1_decision_desk.py

Decision Desk API — POST run, GET runs, GET packets.

Endpoints:
  POST /v1/decisions/run               — generate decision run
  GET  /v1/decisions/runs/{run_id}     — full run with proposals + packets
  GET  /v1/decisions/runs/{run_id}/packets — execution packets only
  GET  /v1/decisions/runs              — list decision runs

All endpoints: JWT required, tenant-scoped by company_id.
"""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.engine.decision_engine import (
    DecisionPolicyConfig,
    MarketSnapshotInput,
    PositionInput,
    run_decision_engine,
)
from app.models.user import User
from app.services import rbac_service

router = APIRouter(prefix="/v1/decisions", tags=["decision-desk"])


# ── Permission helper ──────────────────────────────────────────────────────────

async def _require(session: AsyncSession, user: User, codename: str) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if codename not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {codename}")


# ── Endpoint: Create decision run ─────────────────────────────────────────────

@router.post("/run")
async def create_decision_run(
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    await _require(session, current_user, "decisions.run")

    position_ids = body.get("position_ids", [])
    policy_revision_id = body.get("policy_revision_id")
    market_snapshot_id = body.get("market_snapshot_id")

    if not position_ids:
        raise HTTPException(status_code=422, detail="position_ids is required and must be non-empty.")

    company_id = str(current_user.company_id)

    # ── Load positions (tenant-scoped) ─────────────────────────────────────────
    placeholders = ", ".join(f":pid_{i}" for i in range(len(position_ids)))
    params: dict[str, Any] = {"cid": company_id}
    for i, pid in enumerate(position_ids):
        params[f"pid_{i}"] = str(pid)

    pos_rows = await session.execute(
        text(
            f"SELECT id, currency, amount, flow_type, execution_status, value_date "
            f"FROM positions "
            f"WHERE id IN ({placeholders}) AND company_id = :cid AND is_active = TRUE"
        ),
        params,
    )
    position_inputs = []
    for r in pos_rows.fetchall():
        value_date = r.value_date
        if isinstance(value_date, str):
            try:
                value_date = datetime.strptime(value_date, "%Y-%m-%d").date()
            except ValueError:
                value_date = None
        position_inputs.append(PositionInput(
            position_id=str(r.id),
            currency=r.currency,
            amount_local=float(r.amount),
            flow_type=r.flow_type,
            execution_status=r.execution_status,
            value_date=value_date,
        ))

    if not position_inputs:
        raise HTTPException(status_code=404, detail="No matching active positions found for this company.")

    # ── Load market snapshot ───────────────────────────────────────────────────
    if market_snapshot_id:
        snap_row = await session.execute(
            text(
                "SELECT id, market_snapshot_hash, provider, as_of, "
                "primary_currency, spot_rate "
                "FROM market_snapshots WHERE id = :sid AND company_id = :cid LIMIT 1"
            ),
            {"sid": market_snapshot_id, "cid": company_id},
        )
        snap = snap_row.fetchone()
        if not snap:
            raise HTTPException(status_code=404, detail="Market snapshot not found.")
    else:
        # Use latest snapshot for company
        snap_row = await session.execute(
            text(
                "SELECT id, market_snapshot_hash, provider, as_of, "
                "primary_currency, spot_rate "
                "FROM market_snapshots WHERE company_id = :cid "
                "ORDER BY as_of DESC LIMIT 1"
            ),
            {"cid": company_id},
        )
        snap = snap_row.fetchone()
        if not snap:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "NO_MARKET_SNAPSHOT",
                    "message": (
                        "No market snapshot available for this company. "
                        "Please capture a market snapshot via /v1/market-snapshots before running decisions."
                    ),
                },
            )

    market_snapshot = MarketSnapshotInput(
        snapshot_id=str(snap.id),
        snapshot_hash=snap.market_snapshot_hash,
        as_of=snap.as_of if isinstance(snap.as_of, datetime) else datetime.now(UTC),
        primary_currency=snap.primary_currency or "MXN",
        spot_rate=float(snap.spot_rate),
        provider=snap.provider or "market_snapshot",
    )

    # ── Load policy config ─────────────────────────────────────────────────────
    policy_config_raw: dict[str, Any] = {}
    if policy_revision_id:
        prow = await session.execute(
            text(
                "SELECT config FROM policy_revisions WHERE id = :pid LIMIT 1"
            ),
            {"pid": policy_revision_id},
        )
        prow_data = prow.fetchone()
        if prow_data and prow_data.config:
            policy_config_raw = (
                prow_data.config if isinstance(prow_data.config, dict)
                else {}
            )

    # Build DecisionPolicyConfig from JSONB or defaults
    policy = DecisionPolicyConfig(
        immediate_hedge_threshold_usd=float(
            policy_config_raw.get("immediate_hedge_threshold_usd", 1_000_000.0)
        ),
        staged_min_usd=float(
            policy_config_raw.get("staged_min_usd", 100_000.0)
        ),
        staging_window_months=int(
            policy_config_raw.get("staging_window_months", 3)
        ),
        premium_budget_pct=float(
            policy_config_raw.get("premium_budget_pct", 0.5)
        ),
        min_trade_size_usd=float(
            policy_config_raw.get("min_trade_size_usd",
                                  policy_config_raw.get("min_trade_size", 10_000.0))
        ),
        hedge_ratio_confirmed=float(
            policy_config_raw.get("hedge_ratios", {}).get("confirmed", 0.80)
        ),
        hedge_ratio_forecast=float(
            policy_config_raw.get("hedge_ratios", {}).get("forecast", 0.50)
        ),
        allowed_instruments=list(
            policy_config_raw.get("instruments", ["NDF", "FORWARD"])
        ),
        spread_bps=float(
            policy_config_raw.get("cost_assumptions", {}).get("spread_bps", 30.0)
        ),
        margin_pct=float(policy_config_raw.get("margin_pct", 3.0)),
    )

    # ── Run engine ─────────────────────────────────────────────────────────────
    run_id = str(uuid.uuid4())
    result = run_decision_engine(
        run_id=run_id,
        positions=position_inputs,
        policy=policy,
        market_snapshot=market_snapshot,
        policy_revision_id=policy_revision_id,
    )

    # ── Persist run ────────────────────────────────────────────────────────────
    trace_bundle = {
        "run_id": run_id,
        "events": [e.to_dict() for e in result.trace_events],
    }
    await session.execute(
        text(
            "INSERT INTO decision_runs "
            "(id, company_id, position_ids, policy_revision_id, market_snapshot_id, "
            " run_hash, inputs_hash, outputs_hash, trace_bundle, "
            " methodology_version, status, created_by, created_at) "
            "VALUES (:id, :cid, :pids, :prv, :msid, :rh, :ih, :oh, :tb, "
            " :mv, 'COMPLETED', :cb, NOW())"
        ),
        {
            "id": run_id,
            "cid": company_id,
            "pids": json.dumps([str(p.position_id) for p in position_inputs]),
            "prv": policy_revision_id,
            "msid": market_snapshot_id or str(snap.id),
            "rh": result.run_hash,
            "ih": result.inputs_hash,
            "oh": result.outputs_hash,
            "tb": json.dumps(trace_bundle),
            "mv": result.methodology_version,
            "cb": str(current_user.id),
        },
    )

    # ── Persist proposals ──────────────────────────────────────────────────────
    proposal_db_ids: dict[int, str] = {}
    for proposal in result.proposals:
        proposal_db_id = str(uuid.uuid4())
        proposal_db_ids[proposal.rank] = proposal_db_id
        await session.execute(
            text(
                "INSERT INTO decision_proposals "
                "(id, decision_run_id, company_id, rank, action, currency_pair, "
                " instrument, side, notional_amount, notional_currency, "
                " hedge_ratio_pct, residual_exposure, cost_estimate_usd, "
                " margin_proxy_usd, rationale, schedule, proposal_hash, created_at) "
                "VALUES (:id, :drid, :cid, :rank, :action, :cp, "
                " :instr, :side, :na, :nc, "
                " :hrp, :re, :ce, "
                " :mp, :rat, :sched, :ph, NOW())"
            ),
            {
                "id": proposal_db_id,
                "drid": run_id,
                "cid": company_id,
                "rank": proposal.rank,
                "action": proposal.action,
                "cp": proposal.currency_pair,
                "instr": proposal.instrument,
                "side": proposal.side,
                "na": proposal.notional_amount,
                "nc": proposal.notional_currency,
                "hrp": proposal.hedge_ratio_pct,
                "re": proposal.residual_exposure,
                "ce": proposal.cost_estimate_usd,
                "mp": proposal.margin_proxy_usd,
                "rat": proposal.rationale,
                "sched": json.dumps(proposal.schedule) if proposal.schedule else None,
                "ph": proposal.proposal_hash,
            },
        )

    # ── Persist packets ────────────────────────────────────────────────────────
    for packet in result.packets:
        prop_db_id = proposal_db_ids.get(packet.proposal_rank, str(uuid.uuid4()))
        await session.execute(
            text(
                "INSERT INTO execution_packets "
                "(id, decision_run_id, proposal_id, company_id, "
                " packet_json, ibkr_payload, ticket_text, packet_hash, created_at) "
                "VALUES (:id, :drid, :pid, :cid, "
                " :pj, :ibkr, :tt, :ph, NOW())"
            ),
            {
                "id": str(uuid.uuid4()),
                "drid": run_id,
                "pid": prop_db_id,
                "cid": company_id,
                "pj": json.dumps(packet.to_dict()),
                "ibkr": json.dumps(packet.ibkr_payload),
                "tt": packet.ticket_text,
                "ph": packet.packet_hash,
            },
        )

    await session.commit()

    return {
        "run_id": run_id,
        "run_hash": result.run_hash,
        "proposals": [p.to_dict() for p in result.proposals],
        "summary": {
            "total_hedge_usd": result.total_hedge_notional_usd,
            "residual_usd": result.total_residual_usd,
            "cost_usd": result.total_cost_usd,
            "position_count": len(position_inputs),
            "proposal_count": len(result.proposals),
        },
        "market_snapshot_id": str(snap.id),
        "policy_revision_id": policy_revision_id,
    }


# ── Endpoint: Get decision run ─────────────────────────────────────────────────

@router.get("/runs/{run_id}")
async def get_decision_run(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = str(current_user.company_id)

    run_row = await session.execute(
        text(
            "SELECT id, position_ids, policy_revision_id, market_snapshot_id, "
            "run_hash, inputs_hash, outputs_hash, trace_bundle, "
            "methodology_version, status, created_by, created_at "
            "FROM decision_runs WHERE id = :rid AND company_id = :cid LIMIT 1"
        ),
        {"rid": run_id, "cid": company_id},
    )
    row = run_row.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Decision run not found.")

    proposals_rows = await session.execute(
        text(
            "SELECT id, rank, action, currency_pair, instrument, side, "
            "notional_amount, notional_currency, hedge_ratio_pct, residual_exposure, "
            "cost_estimate_usd, margin_proxy_usd, rationale, schedule, "
            "proposal_hash, created_at "
            "FROM decision_proposals WHERE decision_run_id = :rid ORDER BY rank"
        ),
        {"rid": run_id},
    )
    proposals = []
    for p in proposals_rows.fetchall():
        proposals.append({
            "id": str(p.id),
            "rank": p.rank,
            "action": p.action,
            "currency_pair": p.currency_pair,
            "instrument": p.instrument,
            "side": p.side,
            "notional_amount": float(p.notional_amount) if p.notional_amount else 0.0,
            "notional_currency": p.notional_currency,
            "hedge_ratio_pct": float(p.hedge_ratio_pct) if p.hedge_ratio_pct else 0.0,
            "residual_exposure": float(p.residual_exposure) if p.residual_exposure else 0.0,
            "cost_estimate_usd": float(p.cost_estimate_usd) if p.cost_estimate_usd else 0.0,
            "margin_proxy_usd": float(p.margin_proxy_usd) if p.margin_proxy_usd else 0.0,
            "rationale": p.rationale,
            "schedule": p.schedule,
            "proposal_hash": p.proposal_hash,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    return {
        "run_id": str(row.id),
        "position_ids": row.position_ids or [],
        "policy_revision_id": str(row.policy_revision_id) if row.policy_revision_id else None,
        "market_snapshot_id": str(row.market_snapshot_id) if row.market_snapshot_id else None,
        "run_hash": row.run_hash,
        "inputs_hash": row.inputs_hash,
        "outputs_hash": row.outputs_hash,
        "methodology_version": row.methodology_version,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "proposals": proposals,
        "trace_bundle": row.trace_bundle,
    }


# ── Endpoint: Get execution packets ───────────────────────────────────────────

@router.get("/runs/{run_id}/packets")
async def get_decision_packets(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    company_id = str(current_user.company_id)

    # Verify tenant ownership
    run_check = await session.execute(
        text("SELECT id FROM decision_runs WHERE id = :rid AND company_id = :cid LIMIT 1"),
        {"rid": run_id, "cid": company_id},
    )
    if not run_check.fetchone():
        raise HTTPException(status_code=404, detail="Decision run not found.")

    packets_rows = await session.execute(
        text(
            "SELECT id, proposal_id, packet_json, ibkr_payload, "
            "ticket_text, packet_hash, created_at "
            "FROM execution_packets WHERE decision_run_id = :rid ORDER BY created_at"
        ),
        {"rid": run_id},
    )
    packets = []
    for pk in packets_rows.fetchall():
        packets.append({
            "id": str(pk.id),
            "proposal_id": str(pk.proposal_id),
            "packet_json": pk.packet_json if isinstance(pk.packet_json, dict) else {},
            "ibkr_payload": pk.ibkr_payload if isinstance(pk.ibkr_payload, dict) else {},
            "ticket_text": pk.ticket_text,
            "packet_hash": pk.packet_hash,
            "created_at": pk.created_at.isoformat() if pk.created_at else None,
        })

    return {
        "run_id": run_id,
        "packets": packets,
        "count": len(packets),
    }


# ── Endpoint: List decision runs ──────────────────────────────────────────────

@router.get("/runs")
async def list_decision_runs(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    await _require(session, current_user, "decisions.view")
    company_id = str(current_user.company_id)

    rows = await session.execute(
        text(
            "SELECT r.id, r.run_hash, r.methodology_version, r.status, r.created_at, "
            "COUNT(p.id) AS proposal_count, "
            "MODE() WITHIN GROUP (ORDER BY p.action) AS verdict "
            "FROM decision_runs r "
            "LEFT JOIN decision_proposals p ON p.decision_run_id = r.id "
            "WHERE r.company_id = :cid "
            "GROUP BY r.id "
            "ORDER BY r.created_at DESC LIMIT :lim"
        ),
        {"cid": company_id, "lim": limit},
    )
    items = []
    for r in rows.fetchall():
        items.append({
            "run_id": str(r.id),
            "run_hash": r.run_hash,
            "methodology_version": r.methodology_version,
            "status": r.status,
            "proposal_count": int(r.proposal_count or 0),
            "verdict": r.verdict or "NO_ACTION",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return items
