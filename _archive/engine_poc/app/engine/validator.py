"""Fail-closed validator with 21 rejection codes.

Any CRITICAL error halts the pipeline. Warnings are logged but non-blocking.
"""

from __future__ import annotations

import re
from datetime import date

from app.schemas.errors import Severity, ValidationErrorDetail
from app.schemas.hedges import HedgeRow
from app.schemas.market import MarketSnapshot
from app.schemas.policy import PolicyConfig
from app.schemas.results import ValidationReport
from app.schemas.trades import TradeRow

BUCKET_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
SPOT_MIN = 10.0
SPOT_MAX = 30.0
POINTS_ABS_MAX = 5.0


def validate_all(
    trades: list[TradeRow],
    hedges: list[HedgeRow],
    market: MarketSnapshot,
    policy: PolicyConfig,
) -> ValidationReport:
    errors: list[ValidationErrorDetail] = []
    warnings: list[str] = []

    errors.extend(_validate_trades(trades, market))
    errors.extend(_validate_hedges(hedges, market))
    errors.extend(_validate_market(market))
    errors.extend(_validate_policy(policy))
    errors.extend(_cross_validate(trades, hedges, market, policy))

    for e in errors:
        if e.severity == Severity.WARNING:
            warnings.append(f"{e.code}: {e.message}")

    has_critical = any(e.severity == Severity.CRITICAL for e in errors)
    return ValidationReport(
        status="FAIL" if has_critical else "PASS",
        errors=[e for e in errors if e.severity == Severity.CRITICAL],
        warnings=warnings,
    )


def _validate_trades(
    trades: list[TradeRow], market: MarketSnapshot
) -> list[ValidationErrorDetail]:
    errors: list[ValidationErrorDetail] = []

    # V-019: empty trades list
    if not trades:
        errors.append(
            ValidationErrorDetail(
                code="V-019",
                field="trades",
                message="Trades list is empty.",
                severity=Severity.CRITICAL,
            )
        )
        return errors

    seen_ids: set[str] = set()
    for i, t in enumerate(trades):
        prefix = f"trades[{i}]"

        # V-001: amount <= 0 (Pydantic enforces gt=0, but double-check raw data)
        if t.amount <= 0:
            errors.append(
                ValidationErrorDetail(
                    code="V-001",
                    field=f"{prefix}.amount",
                    message=f"Amount must be > 0, got {t.amount}.",
                    severity=Severity.CRITICAL,
                )
            )

        # V-002: currency != MXN (Pydantic Literal handles, but for raw dicts)
        if t.currency != "MXN":
            errors.append(
                ValidationErrorDetail(
                    code="V-002",
                    field=f"{prefix}.currency",
                    message=f"Currency must be MXN, got {t.currency}.",
                    severity=Severity.CRITICAL,
                )
            )

        # V-003: type not AR|AP
        if t.type not in ("AR", "AP"):
            errors.append(
                ValidationErrorDetail(
                    code="V-003",
                    field=f"{prefix}.type",
                    message=f"Type must be AR or AP, got {t.type}.",
                    severity=Severity.CRITICAL,
                )
            )

        # V-004: status not CONFIRMED|FORECAST
        if t.status not in ("CONFIRMED", "FORECAST"):
            errors.append(
                ValidationErrorDetail(
                    code="V-004",
                    field=f"{prefix}.status",
                    message=f"Status must be CONFIRMED or FORECAST, got {t.status}.",
                    severity=Severity.CRITICAL,
                )
            )

        # V-005: past value_date (WARNING only)
        if t.value_date < market.as_of.date():
            errors.append(
                ValidationErrorDetail(
                    code="V-005",
                    field=f"{prefix}.value_date",
                    message=f"Value date {t.value_date} is before market as_of {market.as_of.date()}.",
                    severity=Severity.WARNING,
                )
            )

        # V-006: duplicate record_id
        if t.record_id in seen_ids:
            errors.append(
                ValidationErrorDetail(
                    code="V-006",
                    field=f"{prefix}.record_id",
                    message=f"Duplicate record_id: {t.record_id}.",
                    severity=Severity.CRITICAL,
                )
            )
        seen_ids.add(t.record_id)

    return errors


def _validate_hedges(
    hedges: list[HedgeRow], market: MarketSnapshot
) -> list[ValidationErrorDetail]:
    errors: list[ValidationErrorDetail] = []
    seen_ids: set[str] = set()

    for i, h in enumerate(hedges):
        prefix = f"hedges[{i}]"

        # V-007: notional_mxn <= 0
        if h.notional_mxn <= 0:
            errors.append(
                ValidationErrorDetail(
                    code="V-007",
                    field=f"{prefix}.notional_mxn",
                    message=f"Notional must be > 0, got {h.notional_mxn}.",
                    severity=Severity.CRITICAL,
                )
            )

        # V-008: direction not in allowed set
        if h.direction not in ("SELL_MXN_BUY_USD", "BUY_MXN_SELL_USD"):
            errors.append(
                ValidationErrorDetail(
                    code="V-008",
                    field=f"{prefix}.direction",
                    message=f"Invalid direction: {h.direction}.",
                    severity=Severity.CRITICAL,
                )
            )

        # V-009: instrument not FWD|NDF
        if h.instrument not in ("FWD", "NDF"):
            errors.append(
                ValidationErrorDetail(
                    code="V-009",
                    field=f"{prefix}.instrument",
                    message=f"Instrument must be FWD or NDF, got {h.instrument}.",
                    severity=Severity.CRITICAL,
                )
            )

        # V-010: duplicate hedge_id
        if h.hedge_id in seen_ids:
            errors.append(
                ValidationErrorDetail(
                    code="V-010",
                    field=f"{prefix}.hedge_id",
                    message=f"Duplicate hedge_id: {h.hedge_id}.",
                    severity=Severity.CRITICAL,
                )
            )
        seen_ids.add(h.hedge_id)

    return errors


def _validate_market(market: MarketSnapshot) -> list[ValidationErrorDetail]:
    errors: list[ValidationErrorDetail] = []

    # V-011: spot out of range
    if market.spot_usdmxn <= 0 or not (SPOT_MIN <= market.spot_usdmxn <= SPOT_MAX):
        errors.append(
            ValidationErrorDetail(
                code="V-011",
                field="market.spot_usdmxn",
                message=f"Spot must be in ({SPOT_MIN}..{SPOT_MAX}), got {market.spot_usdmxn}.",
                severity=Severity.CRITICAL,
            )
        )

    # V-012: empty forward_points
    if not market.forward_points_by_month:
        errors.append(
            ValidationErrorDetail(
                code="V-012",
                field="market.forward_points_by_month",
                message="Forward points map is empty.",
                severity=Severity.CRITICAL,
            )
        )
    else:
        for key, val in market.forward_points_by_month.items():
            # V-013: key format
            if not BUCKET_RE.match(key):
                errors.append(
                    ValidationErrorDetail(
                        code="V-013",
                        field=f"market.forward_points_by_month[{key}]",
                        message=f"Key must be YYYY-MM format, got '{key}'.",
                        severity=Severity.CRITICAL,
                    )
                )
            # V-021: points sanity (abs < 5.0)
            if abs(val) >= POINTS_ABS_MAX:
                errors.append(
                    ValidationErrorDetail(
                        code="V-021",
                        field=f"market.forward_points_by_month[{key}]",
                        message=f"Forward points abs({val}) >= {POINTS_ABS_MAX}. Reject pips-like values.",
                        severity=Severity.CRITICAL,
                    )
                )

    return errors


def _validate_policy(policy: PolicyConfig) -> list[ValidationErrorDetail]:
    errors: list[ValidationErrorDetail] = []

    # V-016: hedge ratios out of range (Pydantic enforces 0..1, but belt+suspenders)
    if not (0 <= policy.hedge_ratios.confirmed <= 1.0):
        errors.append(
            ValidationErrorDetail(
                code="V-016",
                field="policy.hedge_ratios.confirmed",
                message=f"Confirmed ratio must be 0..1, got {policy.hedge_ratios.confirmed}.",
                severity=Severity.CRITICAL,
            )
        )
    if not (0 <= policy.hedge_ratios.forecast <= 1.0):
        errors.append(
            ValidationErrorDetail(
                code="V-016",
                field="policy.hedge_ratios.forecast",
                message=f"Forecast ratio must be 0..1, got {policy.hedge_ratios.forecast}.",
                severity=Severity.CRITICAL,
            )
        )

    # V-017: min_trade_size_usd < 0
    if policy.min_trade_size_usd < 0:
        errors.append(
            ValidationErrorDetail(
                code="V-017",
                field="policy.min_trade_size_usd",
                message=f"min_trade_size_usd must be >= 0, got {policy.min_trade_size_usd}.",
                severity=Severity.CRITICAL,
            )
        )

    # V-018: spread_bps < 0
    if policy.cost_assumptions.spread_bps < 0:
        errors.append(
            ValidationErrorDetail(
                code="V-018",
                field="policy.cost_assumptions.spread_bps",
                message=f"spread_bps must be >= 0, got {policy.cost_assumptions.spread_bps}.",
                severity=Severity.CRITICAL,
            )
        )

    return errors


def _cross_validate(
    trades: list[TradeRow],
    hedges: list[HedgeRow],
    market: MarketSnapshot,
    policy: PolicyConfig,
) -> list[ValidationErrorDetail]:
    errors: list[ValidationErrorDetail] = []
    fwd_buckets = set(market.forward_points_by_month.keys())

    # V-014: trade bucket missing forward points
    for i, t in enumerate(trades):
        bucket = t.value_date.strftime("%Y-%m")
        if bucket not in fwd_buckets:
            errors.append(
                ValidationErrorDetail(
                    code="V-014",
                    field=f"trades[{i}].value_date",
                    message=f"Trade bucket {bucket} has no forward points entry.",
                    severity=Severity.CRITICAL,
                )
            )

    # V-015: hedge bucket missing forward points (WARNING)
    for i, h in enumerate(hedges):
        bucket = h.value_date.strftime("%Y-%m")
        if bucket not in fwd_buckets:
            errors.append(
                ValidationErrorDetail(
                    code="V-015",
                    field=f"hedges[{i}].value_date",
                    message=f"Hedge bucket {bucket} has no forward points entry.",
                    severity=Severity.WARNING,
                )
            )

    return errors
