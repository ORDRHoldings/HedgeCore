"""Audit module: builds RunEnvelope (SHA-256 hashes) and TraceLite."""

from __future__ import annotations

from datetime import datetime, timezone

from app.engine_v1.hasher import sha256_of_dict, sha256_of_list
from app.schemas_v1.results import RunEnvelope, TraceLite, TraceEvent


def build_run_envelope(
    run_id: str,
    trades_raw: list[dict],
    hedges_raw: list[dict],
    market_raw: dict,
    policy_raw: dict,
    outputs_raw: dict,
) -> RunEnvelope:
    trades_hash = sha256_of_list(trades_raw)
    hedges_hash = sha256_of_list(hedges_raw)
    market_hash = sha256_of_dict(market_raw)
    policy_hash = sha256_of_dict(policy_raw)

    inputs_combined = {
        "trades": trades_raw,
        "hedges": hedges_raw,
        "market": market_raw,
        "policy": policy_raw,
    }
    inputs_hash = sha256_of_dict(inputs_combined)
    outputs_hash = sha256_of_dict(outputs_raw)

    return RunEnvelope(
        run_id=run_id,
        timestamp=datetime.now(timezone.utc),
        engine_version="1.0.0",
        inputs_hash=inputs_hash,
        outputs_hash=outputs_hash,
        trades_hash=trades_hash,
        hedges_hash=hedges_hash,
        market_hash=market_hash,
        policy_hash=policy_hash,
    )


def build_trace_lite(
    run_id: str,
    events: list[TraceEvent],
) -> TraceLite:
    return TraceLite(run_id=run_id, events=events)
