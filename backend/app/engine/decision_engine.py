"""
backend/app/engine/decision_engine.py

Decision Desk Engine — deterministic hedge action generation.

Given current positions + policy config + market snapshot, produces:
  - Ranked decision proposals (HEDGE_IMMEDIATE / HEDGE_STAGED / REDUCE_RATIO / NO_ACTION)
  - Execution packets with IBKR-format payloads

INVARIANTS:
  - No randomness. Identical inputs → identical outputs + identical hashes.
  - No live API calls. All data pre-loaded by caller.
  - Fail-closed: missing snapshot or policy → structured rejection.
  - All proposals and packets hashed with SHA-256.
  - Methodology version pinned to "1.0.0".
  - rationale field is a deterministic template string — never LLM-generated.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

METHODOLOGY_VERSION = "1.0.0"

# ── Internal hash helpers ──────────────────────────────────────────────────────

def _sha256_dict(d: dict) -> str:
    canonical = json.dumps(d, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ── Policy config for decision desk ──────────────────────────────────────────

@dataclass(frozen=True)
class DecisionPolicyConfig:
    """
    Decision-desk specific policy parameters.
    Extracted from policy JSONB config or provided directly.
    """
    immediate_hedge_threshold_usd: float = 1_000_000.0
    staged_min_usd: float = 100_000.0
    staging_window_months: int = 3
    premium_budget_pct: float = 0.5       # max cost as pct of notional
    min_trade_size_usd: float = 10_000.0
    hedge_ratio_confirmed: float = 0.80
    hedge_ratio_forecast: float = 0.50
    allowed_instruments: list[str] = field(default_factory=lambda: ["NDF", "FORWARD"])
    spread_bps: float = 30.0
    margin_pct: float = 3.0               # default margin proxy %
    # NDF-eligible currency pairs (non-deliverable)
    ndf_pairs: list[str] = field(default_factory=lambda: [
        "USDMXN", "USDBRL", "USDCLP", "USDCOP", "USDPEN",
        "USDKRW", "USDCNH", "USDTWD", "USDINR",
    ])


# ── Input types ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PositionInput:
    """Immutable snapshot of one position row."""
    position_id: str
    currency: str
    amount_local: float           # in currency (MXN, BRL, etc.)
    flow_type: str                # "AR" | "AP"
    execution_status: str
    value_date: date | None


@dataclass(frozen=True)
class MarketSnapshotInput:
    """Minimal market data needed for decision engine."""
    snapshot_id: str
    snapshot_hash: str
    as_of: datetime
    primary_currency: str
    spot_rate: float              # e.g. USDMXN = 17.50
    provider: str


# ── Trace infrastructure ───────────────────────────────────────────────────────

@dataclass
class DecisionTraceEvent:
    step: str
    timestamp: datetime
    detail: str
    data: dict[str, Any] | None = None

    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "timestamp": self.timestamp.isoformat(),
            "detail": self.detail,
            "data": self.data,
        }


# ── Proposal + packet types ───────────────────────────────────────────────────

@dataclass
class DecisionProposal:
    rank: int
    action: str                   # 'HEDGE_IMMEDIATE'|'HEDGE_STAGED'|'REDUCE_RATIO'|'NO_ACTION'
    currency_pair: str
    instrument: str
    side: str                     # 'BUY'|'SELL'
    notional_amount: float
    notional_currency: str
    hedge_ratio_pct: float
    residual_exposure: float
    cost_estimate_usd: float
    margin_proxy_usd: float
    rationale: str
    schedule: list[dict] | None   # for HEDGE_STAGED
    position_ids: list[str]
    proposal_hash: str

    def to_dict(self) -> dict:
        return {
            "rank": self.rank,
            "action": self.action,
            "currency_pair": self.currency_pair,
            "instrument": self.instrument,
            "side": self.side,
            "notional_amount": self.notional_amount,
            "notional_currency": self.notional_currency,
            "hedge_ratio_pct": self.hedge_ratio_pct,
            "residual_exposure": self.residual_exposure,
            "cost_estimate_usd": self.cost_estimate_usd,
            "margin_proxy_usd": self.margin_proxy_usd,
            "rationale": self.rationale,
            "schedule": self.schedule,
            "position_ids": self.position_ids,
            "proposal_hash": self.proposal_hash,
        }


@dataclass
class ExecutionPacket:
    proposal_rank: int
    currency_pair: str
    instrument: str
    side: str
    notional_amount: float
    notional_currency: str
    trade_date: str
    value_date: str
    cost_estimate_usd: float
    margin_proxy_usd: float
    ibkr_payload: dict
    ticket_text: str
    packet_hash: str

    def to_dict(self) -> dict:
        return {
            "proposal_rank": self.proposal_rank,
            "currency_pair": self.currency_pair,
            "instrument": self.instrument,
            "side": self.side,
            "notional_amount": self.notional_amount,
            "notional_currency": self.notional_currency,
            "trade_date": self.trade_date,
            "value_date": self.value_date,
            "cost_estimate_usd": self.cost_estimate_usd,
            "margin_proxy_usd": self.margin_proxy_usd,
            "ibkr_payload": self.ibkr_payload,
            "ticket_text": self.ticket_text,
            "packet_hash": self.packet_hash,
        }


# ── Engine result ─────────────────────────────────────────────────────────────

@dataclass
class DecisionEngineResult:
    methodology_version: str
    proposals: list[DecisionProposal]
    packets: list[ExecutionPacket]
    total_hedge_notional_usd: float
    total_residual_usd: float
    total_cost_usd: float
    inputs_hash: str
    outputs_hash: str
    run_hash: str
    trace_events: list[DecisionTraceEvent]


# ── Instrument selection ───────────────────────────────────────────────────────

def _select_instrument(
    currency_pair: str,
    policy: DecisionPolicyConfig,
    cost_usd: float,
    notional_usd: float,
) -> str:
    """
    Deterministic instrument selection:
    1. If pair is non-deliverable and NDF allowed → NDF
    2. If FORWARD allowed → FORWARD
    3. If cost exceeds threshold and OPTION allowed → OPTION
    4. Fallback: first in allowed list
    """
    pair_upper = currency_pair.upper()
    cost_pct = cost_usd / notional_usd if notional_usd > 0 else 0.0

    if "NDF" in policy.allowed_instruments and pair_upper in policy.ndf_pairs:
        return "NDF"
    if "FORWARD" in policy.allowed_instruments:
        return "FORWARD"
    if "OPTION" in policy.allowed_instruments and cost_pct > policy.premium_budget_pct / 100.0:
        return "OPTION"
    return policy.allowed_instruments[0] if policy.allowed_instruments else "FORWARD"


def _spot_to_usd(amount_local: float, currency: str, spot_rate: float) -> float:
    """Convert local currency amount to approximate USD."""
    if currency.upper() == "USD":
        return amount_local
    if spot_rate <= 0:
        return 0.0
    if spot_rate > 2.0:
        return amount_local / spot_rate
    return amount_local * spot_rate


# ── Value date computation ─────────────────────────────────────────────────────

def _compute_value_date(instrument: str, trade_date: date) -> date:
    """Deterministic value date: spot+2 for forwards/NDF, spot+30 for options."""
    if instrument in ("FORWARD", "NDF"):
        return trade_date + timedelta(days=2)
    return trade_date + timedelta(days=30)


# ── IBKR payload builder ───────────────────────────────────────────────────────

def _build_ibkr_payload(
    currency_pair: str,
    instrument: str,
    side: str,
    notional_amount: float,
    notional_currency: str,
    value_date: str,
) -> dict:
    """
    Broker-ready IBKR order payload.
    Format mirrors IBKR FX Forwards API contract structure.
    """
    base_ccy = currency_pair[:3] if len(currency_pair) == 6 else currency_pair[:3]
    quote_ccy = currency_pair[3:] if len(currency_pair) == 6 else currency_pair[3:]

    sec_type_map = {"NDF": "FXNDF", "FORWARD": "FXFWD", "OPTION": "FOP", "SWAP": "FXSWAP"}
    exchange_map = {"NDF": "IDEALPRO", "FORWARD": "IDEALPRO", "OPTION": "NASDAQOM", "SWAP": "IDEALPRO"}

    return {
        "symbol": f"{base_ccy}.{quote_ccy}",
        "secType": sec_type_map.get(instrument, "FXFWD"),
        "exchange": exchange_map.get(instrument, "IDEALPRO"),
        "currency": quote_ccy,
        "action": side,
        "totalQuantity": round(notional_amount, 2),
        "orderType": "MKT",
        "tif": "GTC",
        "lastTradeDateOrContractMonth": value_date.replace("-", ""),
        "multiplier": 1,
        "notes": f"ORDR Terminal — auto-generated {instrument} packet",
    }


# ── Core decision logic ────────────────────────────────────────────────────────

def _classify_exposure(
    net_exposure_usd: float,
    policy: DecisionPolicyConfig,
) -> str:
    """
    Deterministic action classification.
    abs(net_exposure_usd) used for threshold comparisons.
    """
    abs_exp = abs(net_exposure_usd)
    if abs_exp < policy.min_trade_size_usd:
        return "NO_ACTION"
    if abs_exp >= policy.immediate_hedge_threshold_usd:
        return "HEDGE_IMMEDIATE"
    if abs_exp >= policy.staged_min_usd:
        return "HEDGE_STAGED"
    return "NO_ACTION"


def _build_staged_schedule(
    notional: float,
    currency: str,
    trade_date: date,
    staging_months: int,
) -> list[dict]:
    """Deterministic equal-tranche staged schedule."""
    tranches = staging_months if staging_months > 0 else 1
    tranche_amount = round(notional / tranches, 2)
    schedule = []
    for i in range(tranches):
        tranche_date = date(
            trade_date.year + (trade_date.month + i - 1) // 12,
            (trade_date.month + i - 1) % 12 + 1,
            min(trade_date.day, 28),   # safe for all months
        )
        pct = round(100.0 / tranches, 4)
        schedule.append({
            "tranche": i + 1,
            "date": str(tranche_date),
            "amount": tranche_amount,
            "currency": currency,
            "pct": pct,
        })
    return schedule


def _build_rationale(
    action: str,
    currency_pair: str,
    net_exposure_usd: float,
    hedge_ratio_pct: float,
    instrument: str,
    threshold_label: str,
    threshold_value: float,
    notional: float,
    residual: float,
) -> str:
    """Deterministic rationale template string. Not LLM-generated."""
    return (
        f"{action}: {currency_pair} net exposure of "
        f"{abs(net_exposure_usd):,.0f} USD {threshold_label} "
        f"threshold of {threshold_value:,.0f} USD. "
        f"{instrument} selected per policy. "
        f"Hedge ratio {hedge_ratio_pct:.0f}% applied. "
        f"Hedge notional: {notional:,.0f} USD. "
        f"Residual: {residual:,.0f} USD."
    )


# ── Main engine entry point ───────────────────────────────────────────────────

def run_decision_engine(
    run_id: str,
    positions: list[PositionInput],
    policy: DecisionPolicyConfig,
    market_snapshot: MarketSnapshotInput,
    policy_revision_id: str | None = None,
) -> DecisionEngineResult:
    """
    Execute the full decision analysis deterministically.

    Step 1: Aggregate net exposure per currency pair.
    Step 2: Classify each pair into action tier.
    Step 3: Select instrument per policy.
    Step 4: Build ranked proposals (primary: abs exposure desc, tiebreaker: pair alpha).
    Step 5: Generate execution packets with IBKR payloads.
    Step 6: Compute hashes.
    """
    trace: list[DecisionTraceEvent] = []
    today = datetime.now(UTC).date()

    trace.append(DecisionTraceEvent(
        step="ENGINE_START",
        timestamp=datetime.now(UTC),
        detail=(
            f"Decision engine v{METHODOLOGY_VERSION} starting. "
            f"run_id={run_id} positions={len(positions)} "
            f"snapshot={market_snapshot.snapshot_id} "
            f"spot={market_snapshot.spot_rate}"
        ),
        data={
            "run_id": run_id,
            "position_count": len(positions),
            "snapshot_id": market_snapshot.snapshot_id,
            "spot_rate": market_snapshot.spot_rate,
            "methodology_version": METHODOLOGY_VERSION,
        },
    ))

    # ── Step 1: Aggregate net exposure per currency pair ──────────────────────
    pair_positions: dict[str, list[PositionInput]] = {}
    for pos in positions:
        ccy = pos.currency.upper()
        pair = f"USD{ccy}" if ccy != "USD" else "USDUSD"
        pair_positions.setdefault(pair, []).append(pos)

    pair_net_usd: dict[str, tuple[float, list[str]]] = {}
    for pair, pair_pos in pair_positions.items():
        net_local = 0.0
        pos_ids = []
        for pos in pair_pos:
            sign = 1.0 if pos.flow_type == "AR" else -1.0
            net_local += sign * pos.amount_local
            pos_ids.append(pos.position_id)
        net_usd = _spot_to_usd(net_local, pair[3:], market_snapshot.spot_rate)
        pair_net_usd[pair] = (net_usd, pos_ids)

    trace.append(DecisionTraceEvent(
        step="EXPOSURE_AGGREGATION",
        timestamp=datetime.now(UTC),
        detail=f"Aggregated {len(pair_net_usd)} currency pairs.",
        data={pair: {"net_usd": v[0], "position_count": len(v[1])}
              for pair, v in pair_net_usd.items()},
    ))

    # ── Step 2-4: Classify, instrument, rank ─────────────────────────────────
    raw_proposals: list[dict] = []

    for pair, (net_usd, pos_ids) in pair_net_usd.items():
        action = _classify_exposure(net_usd, policy)
        abs_exp_usd = abs(net_usd)

        if action == "NO_ACTION":
            # Still record with zero amounts for completeness
            raw_proposals.append({
                "action": "NO_ACTION",
                "currency_pair": pair,
                "instrument": "N/A",
                "side": "N/A",
                "notional_amount": 0.0,
                "notional_currency": "USD",
                "hedge_ratio_pct": 0.0,
                "residual_exposure": net_usd,
                "cost_estimate_usd": 0.0,
                "margin_proxy_usd": 0.0,
                "rationale": (
                    f"NO_ACTION: {pair} net exposure {abs_exp_usd:,.0f} USD "
                    f"is below min_trade_size {policy.min_trade_size_usd:,.0f} USD. "
                    "No action required."
                ),
                "schedule": None,
                "position_ids": pos_ids,
                "abs_exp_usd": abs_exp_usd,
            })
            continue

        # Determine hedge ratio
        # All positions considered "confirmed" for simplicity
        hedge_ratio = policy.hedge_ratio_confirmed
        hedge_notional_usd = abs_exp_usd * hedge_ratio
        residual_usd = net_usd * (1.0 - hedge_ratio)

        # Estimate cost (spread-based proxy)
        cost_usd = hedge_notional_usd * (policy.spread_bps / 10000.0)

        # Check if REDUCE_RATIO needed
        cost_pct = cost_usd / hedge_notional_usd if hedge_notional_usd > 0 else 0.0
        if cost_pct > policy.premium_budget_pct / 100.0:
            # Find largest ratio that fits budget
            max_notional = (policy.premium_budget_pct / 100.0) / (policy.spread_bps / 10000.0)
            max_notional = max_notional * abs_exp_usd
            hedge_ratio = min(hedge_ratio, max_notional / abs_exp_usd if abs_exp_usd > 0 else 0.0)
            hedge_notional_usd = abs_exp_usd * hedge_ratio
            cost_usd = hedge_notional_usd * (policy.spread_bps / 10000.0)
            residual_usd = net_usd * (1.0 - hedge_ratio)
            action = "REDUCE_RATIO"

        # Margin proxy
        margin_proxy_usd = hedge_notional_usd * (policy.margin_pct / 100.0)

        # Instrument selection
        instrument = _select_instrument(pair, policy, cost_usd, hedge_notional_usd)

        # Side: if net_usd > 0 (net AR / receivable) → sell local, buy USD → SELL
        #       if net_usd < 0 (net AP / payable)    → buy local, sell USD → BUY
        side = "SELL" if net_usd > 0 else "BUY"

        # Schedule for staged
        schedule = None
        if action == "HEDGE_STAGED":
            schedule = _build_staged_schedule(
                hedge_notional_usd, "USD", today, policy.staging_window_months
            )

        # Threshold label for rationale
        if action in ("HEDGE_IMMEDIATE", "REDUCE_RATIO"):
            thresh_label = "exceeds or meets immediate"
            thresh_val = policy.immediate_hedge_threshold_usd
        else:  # HEDGE_STAGED
            thresh_label = "falls within staged band above"
            thresh_val = policy.staged_min_usd

        rationale = _build_rationale(
            action=action,
            currency_pair=pair,
            net_exposure_usd=net_usd,
            hedge_ratio_pct=hedge_ratio * 100.0,
            instrument=instrument,
            threshold_label=thresh_label,
            threshold_value=thresh_val,
            notional=hedge_notional_usd,
            residual=abs(residual_usd),
        )

        raw_proposals.append({
            "action": action,
            "currency_pair": pair,
            "instrument": instrument,
            "side": side,
            "notional_amount": hedge_notional_usd,
            "notional_currency": "USD",
            "hedge_ratio_pct": hedge_ratio * 100.0,
            "residual_exposure": residual_usd,
            "cost_estimate_usd": cost_usd,
            "margin_proxy_usd": margin_proxy_usd,
            "rationale": rationale,
            "schedule": schedule,
            "position_ids": pos_ids,
            "abs_exp_usd": abs_exp_usd,
        })

    # ── Step 4: Deterministic ranking ─────────────────────────────────────────
    # Primary: abs exposure descending. Tiebreaker: currency pair alphabetical.
    raw_proposals.sort(key=lambda p: (-p["abs_exp_usd"], p["currency_pair"]))

    # ── Step 5: Build proposals + packets ─────────────────────────────────────
    proposals: list[DecisionProposal] = []
    packets: list[ExecutionPacket] = []
    total_hedge_usd = 0.0
    total_residual_usd = 0.0
    total_cost_usd = 0.0

    for rank, raw in enumerate(raw_proposals, start=1):
        # Proposal hash
        proposal_payload = {k: v for k, v in raw.items() if k != "abs_exp_usd"}
        proposal_payload["rank"] = rank
        proposal_hash = _sha256_dict(proposal_payload)

        proposal = DecisionProposal(
            rank=rank,
            action=raw["action"],
            currency_pair=raw["currency_pair"],
            instrument=raw["instrument"],
            side=raw["side"],
            notional_amount=raw["notional_amount"],
            notional_currency=raw["notional_currency"],
            hedge_ratio_pct=raw["hedge_ratio_pct"],
            residual_exposure=raw["residual_exposure"],
            cost_estimate_usd=raw["cost_estimate_usd"],
            margin_proxy_usd=raw["margin_proxy_usd"],
            rationale=raw["rationale"],
            schedule=raw["schedule"],
            position_ids=raw["position_ids"],
            proposal_hash=proposal_hash,
        )
        proposals.append(proposal)

        if raw["action"] != "NO_ACTION":
            total_hedge_usd += raw["notional_amount"]
            total_residual_usd += abs(raw["residual_exposure"])
            total_cost_usd += raw["cost_estimate_usd"]

            # Build execution packet
            value_dt = _compute_value_date(raw["instrument"], today)
            ibkr = _build_ibkr_payload(
                currency_pair=raw["currency_pair"],
                instrument=raw["instrument"],
                side=raw["side"],
                notional_amount=raw["notional_amount"],
                notional_currency=raw["notional_currency"],
                value_date=str(value_dt),
            )
            ticket_text = (
                f"{raw['action']} | {raw['currency_pair']} | {raw['instrument']} | "
                f"{raw['side']} {raw['notional_amount']:,.0f} {raw['notional_currency']} | "
                f"val {value_dt} | cost ~{raw['cost_estimate_usd']:,.0f} USD | "
                f"margin ~{raw['margin_proxy_usd']:,.0f} USD"
            )
            packet_payload = {
                "proposal_rank": rank,
                "currency_pair": raw["currency_pair"],
                "instrument": raw["instrument"],
                "side": raw["side"],
                "notional_amount": raw["notional_amount"],
                "notional_currency": raw["notional_currency"],
                "trade_date": str(today),
                "value_date": str(value_dt),
                "ibkr_payload": ibkr,
                "proposal_hash": proposal_hash,
            }
            packet_hash = _sha256_dict(packet_payload)

            packets.append(ExecutionPacket(
                proposal_rank=rank,
                currency_pair=raw["currency_pair"],
                instrument=raw["instrument"],
                side=raw["side"],
                notional_amount=raw["notional_amount"],
                notional_currency=raw["notional_currency"],
                trade_date=str(today),
                value_date=str(value_dt),
                cost_estimate_usd=raw["cost_estimate_usd"],
                margin_proxy_usd=raw["margin_proxy_usd"],
                ibkr_payload=ibkr,
                ticket_text=ticket_text,
                packet_hash=packet_hash,
            ))

    trace.append(DecisionTraceEvent(
        step="ENGINE_COMPLETE",
        timestamp=datetime.now(UTC),
        detail=(
            f"Decision engine complete. {len(proposals)} proposals, "
            f"{len(packets)} packets. "
            f"total_hedge_usd={total_hedge_usd:.2f} "
            f"total_cost_usd={total_cost_usd:.2f}"
        ),
        data={
            "proposal_count": len(proposals),
            "packet_count": len(packets),
            "total_hedge_notional_usd": total_hedge_usd,
            "total_residual_usd": total_residual_usd,
            "total_cost_usd": total_cost_usd,
        },
    ))

    # ── Step 6: Hashes ─────────────────────────────────────────────────────────
    inputs_raw = {
        "run_id": run_id,
        "position_ids": sorted(p.position_id for p in positions),
        "snapshot_id": market_snapshot.snapshot_id,
        "snapshot_hash": market_snapshot.snapshot_hash,
        "policy_revision_id": policy_revision_id,
        "policy_config": {
            "immediate_hedge_threshold_usd": policy.immediate_hedge_threshold_usd,
            "staged_min_usd": policy.staged_min_usd,
            "staging_window_months": policy.staging_window_months,
            "premium_budget_pct": policy.premium_budget_pct,
            "min_trade_size_usd": policy.min_trade_size_usd,
            "hedge_ratio_confirmed": policy.hedge_ratio_confirmed,
            "hedge_ratio_forecast": policy.hedge_ratio_forecast,
            "allowed_instruments": sorted(policy.allowed_instruments),
            "spread_bps": policy.spread_bps,
            "margin_pct": policy.margin_pct,
        },
        "methodology_version": METHODOLOGY_VERSION,
    }
    inputs_hash = _sha256_dict(inputs_raw)

    outputs_raw = {
        "proposal_count": len(proposals),
        "proposal_hashes": sorted(p.proposal_hash for p in proposals),
        "packet_count": len(packets),
        "packet_hashes": sorted(pk.packet_hash for pk in packets),
        "total_hedge_notional_usd": total_hedge_usd,
        "total_residual_usd": total_residual_usd,
        "total_cost_usd": total_cost_usd,
    }
    outputs_hash = _sha256_dict(outputs_raw)
    run_hash = _sha256_dict({"inputs_hash": inputs_hash, "outputs_hash": outputs_hash})

    return DecisionEngineResult(
        methodology_version=METHODOLOGY_VERSION,
        proposals=proposals,
        packets=packets,
        total_hedge_notional_usd=total_hedge_usd,
        total_residual_usd=total_residual_usd,
        total_cost_usd=total_cost_usd,
        inputs_hash=inputs_hash,
        outputs_hash=outputs_hash,
        run_hash=run_hash,
        trace_events=trace,
    )
