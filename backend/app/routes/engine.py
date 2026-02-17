from fastapi import APIRouter, Request, HTTPException
from typing import Dict, Any
import time
import uuid
import hashlib
import json
import logging

router = APIRouter(prefix="/engine", tags=["Hedge Engine"])

logger = logging.getLogger("hedgecalc.engine")


def _hash_payload(payload: Any) -> str:
    try:
        raw = json.dumps(payload, sort_keys=True).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()
    except Exception:
        return "hash_error"


def _audit_log(event: Dict[str, Any]) -> None:
    """
    Immutable-style audit log.
    Append-only semantics enforced by convention.
    """
    logger.info(json.dumps(event))


@router.get("/health")
async def engine_health() -> Dict[str, str]:
    return {"status": "ok", "component": "hedge-engine"}


@router.get("/catalog")
async def get_catalog() -> Dict[str, Any]:
    """
    Returns hedge strategies and instrument catalog.
    v1: static placeholder, deterministic.
    """
    return {
        "strategies": {
            "R1_DELTA": ["index_futures", "protective_puts"],
            "R2_VEGA": ["vix_calls", "variance_spreads"],
            "R3_GAMMA": ["option_spreads"],
            "R4_THETA": ["calendar_spreads"],
            "R5_CORRELATION": ["pair_hedges"],
            "R6_CREDIT": ["credit_spreads"],
            "R7_LIQUIDITY": ["cash_buffer"],
            "R8_TAIL": ["crash_puts"]
        },
        "instruments": [
            {"id": "ES_FUT", "name": "S&P 500 Futures", "asset_class": "futures"},
            {"id": "SPX_PUT", "name": "SPX Put Option", "asset_class": "options"},
            {"id": "VIX_CALL", "name": "VIX Call", "asset_class": "volatility"}
        ]
    }


@router.post("/simulate")
async def simulate_engine(request: Request) -> Dict[str, Any]:
    start = time.time()
    request_id = str(uuid.uuid4())

    payload = await request.json()
    input_hash = _hash_payload(payload)

    try:
        # v1 deterministic placeholder
        result = {
            "unhedged_pnl": -10000,
            "hedged_pnl": -3500,
            "hedge_cost": 1200,
            "protection_pct": 65,
            "scenario": payload.get("scenario", "unknown")
        }

        output_hash = _hash_payload(result)

        _audit_log({
            "event": "engine_simulate",
            "request_id": request_id,
            "input_hash": input_hash,
            "output_hash": output_hash,
            "duration_ms": int((time.time() - start) * 1000),
        })

        return {
            "request_id": request_id,
            "result": result
        }

    except Exception as e:
        logger.exception("Simulation error")
        raise HTTPException(status_code=500, detail="Engine simulation failed")


@router.post("/recommend")
async def recommend_hedge(request: Request) -> Dict[str, Any]:
    start = time.time()
    request_id = str(uuid.uuid4())

    payload = await request.json()
    input_hash = _hash_payload(payload)

    try:
        recommendation = {
            "risk_code": "R1_DELTA",
            "strategy": "index_futures",
            "instrument": "ES_FUT",
            "size": 2,
            "estimated_cost": 800,
            "expected_protection_pct": 55
        }

        output_hash = _hash_payload(recommendation)

        _audit_log({
            "event": "engine_recommend",
            "request_id": request_id,
            "input_hash": input_hash,
            "output_hash": output_hash,
            "duration_ms": int((time.time() - start) * 1000),
        })

        return {
            "request_id": request_id,
            "recommendation": recommendation
        }

    except Exception:
        logger.exception("Recommendation error")
        raise HTTPException(status_code=500, detail="Engine recommendation failed")
