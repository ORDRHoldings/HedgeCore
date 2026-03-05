from __future__ import annotations

import time
from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.api.schemas.hedge import HedgeRequest
from app.engine.audit_bundle import build_audit_bundle
from app.engine.decision_gate import decision_gate
from app.engine.recommend import recommend

ROUTER_TAG = "hedge"
router = APIRouter(prefix="/hedge", tags=[ROUTER_TAG])


# ---------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------
def _reject(
    *,
    reason: str,
    details: Mapping[str, Any] | None = None,
    status_code: int = 400,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "rejected",
            "reason": reason,
            "details": dict(details) if isinstance(details, Mapping) else {},
        },
    )


# ---------------------------------------------------------------------
# Main Hedge Endpoint (CANONICAL)
# ---------------------------------------------------------------------
@router.post("/run")
async def run_hedge(payload: HedgeRequest) -> JSONResponse:
    """
    HedgeCalc v1 - Canonical Hedge Run Endpoint

    STRICT FLOW (FAIL-CLOSED):
      1. Validate input via HedgeRequest
      2. Run recommend() -> deterministic hedge plan
      3. Run decision_gate() -> approve / reject
      4. Build audit_bundle() -> immutable audit artifact
      5. Return minimal, regulator-safe response

    HARD RULES:
      - No partial success
      - No mutation of inputs
      - No silent fallback
      - No secrets in response
    """
    t0 = time.perf_counter()

    # ------------------------------------------------------------
    # Stage 1: Recommendation Engine
    # ------------------------------------------------------------
    try:
        plan_out = recommend(
            payload.model_dump(),
            policy=payload.policy,
        )
    except Exception as e:
        return _reject(
            reason="recommendation_failed",
            details={"error": type(e).__name__},
            status_code=500,
        )

    if not isinstance(plan_out, dict) or "plan_id" not in plan_out:
        return _reject(
            reason="invalid_recommendation_output",
            status_code=500,
        )

    # ------------------------------------------------------------
    # Stage 2: Decision Gate
    # ------------------------------------------------------------
    try:
        decision_out = decision_gate(
            plan_out,
            policy=payload.policy,
        )
    except Exception as e:
        return _reject(
            reason="decision_gate_failed",
            details={"error": type(e).__name__},
            status_code=500,
        )

    if not isinstance(decision_out, dict) or "decision" not in decision_out:
        return _reject(
            reason="invalid_decision_output",
            status_code=500,
        )

    if decision_out.get("decision") != "approve":
        return JSONResponse(
            status_code=200,
            content={
                "status": "rejected",
                "plan_id": plan_out.get("plan_id"),
                "decision": decision_out,
            },
        )

    # ------------------------------------------------------------
    # Stage 3: Audit Bundle
    # ------------------------------------------------------------
    try:
        audit_out = build_audit_bundle(
            plan=plan_out,
            decision=decision_out,
            policy=payload.policy,
        )
    except Exception as e:
        return _reject(
            reason="audit_bundle_failed",
            details={"error": type(e).__name__},
            status_code=500,
        )

    if not isinstance(audit_out, dict) or "bundle_id" not in audit_out:
        return _reject(
            reason="invalid_audit_bundle",
            status_code=500,
        )

    # ------------------------------------------------------------
    # Final Response (Institutional-Safe)
    # ------------------------------------------------------------
    duration_ms = int((time.perf_counter() - t0) * 1000)

    return JSONResponse(
        status_code=200,
        content={
            "status": "approved",
            "plan_id": plan_out["plan_id"],
            "bundle_id": audit_out["bundle_id"],
            "decision": decision_out["decision"],
            "summary": plan_out.get("summary"),
            "meta": {
                "duration_ms": duration_ms,
                "engine": "HedgeCalc",
                "version": "v1",
            },
        },
    )


__all__ = ["router"]
