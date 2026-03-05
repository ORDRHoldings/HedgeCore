"""Fail-closed validator with 24 rejection codes.

Any CRITICAL error halts the pipeline. Warnings are logged but non-blocking.

Multi-currency support: V-002 now validates against the full FUTURES_CURRENCIES
allowlist instead of enforcing MXN-only. V-011 uses per-currency spot ranges
instead of the legacy MXN-only [10, 30] band.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from app.schemas_v1.errors import Severity, ValidationErrorDetail
from app.schemas_v1.hedges import HedgeRow
from app.schemas_v1.market import MarketSnapshot
from app.schemas_v1.policy import PolicyConfig
from app.schemas_v1.results import ValidationReport
from app.schemas_v1.trades import TradeRow, FUTURES_CURRENCIES

BUCKET_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Per-currency spot validation ranges.
# Keys are ISO 4217 currency codes; ranges represent realistic 5-year bounds.
# For PRICE_CCY (EUR, GBP, AUD, NZD, CHF) the spot field holds CCY/USD.
# For all others it holds USD/CCY.
_SPOT_RANGES: dict[str, tuple[float, float]] = {
    # Americas
    "MXN": (10.0,    30.0),
    "BRL": (4.0,     7.0),
    "CLP": (700.0,   1100.0),
    "COP": (3500.0,  5000.0),
    "PEN": (3.4,     4.5),
    "CAD": (1.20,    1.50),
    # Europe
    "EUR": (0.75,    1.30),
    "GBP": (0.70,    1.45),
    "CHF": (0.85,    1.20),
    "SEK": (9.0,     12.0),
    "NOK": (9.0,     12.5),
    "DKK": (6.5,     8.0),
    "HUF": (320.0,   430.0),
    "PLN": (3.7,     5.0),
    "CZK": (21.0,    26.0),
    "TRY": (20.0,    50.0),
    # Asia-Pacific
    "JPY": (100.0,   165.0),
    "AUD": (0.55,    0.90),
    "NZD": (0.50,    0.80),
    "SGD": (1.25,    1.45),
    "KRW": (1200.0,  1500.0),
    "CNH": (6.5,     8.0),
    "TWD": (29.0,    34.0),
    "INR": (75.0,    90.0),
    # Africa / Middle East
    "ZAR": (14.0,    22.0),
    "ILS": (3.3,     4.2),
}

# Permissive fallback for any listed currency not in the table above
_DEFAULT_SPOT_RANGE: tuple[float, float] = (0.0001, 100_000.0)


def _spot_range(currency: str) -> tuple[float, float]:
    return _SPOT_RANGES.get(currency, _DEFAULT_SPOT_RANGE)


# Currencies where the spot field holds CCY/USD (1 CCY > 1 USD in market convention)
_PRICE_CCY = {"EUR", "GBP", "AUD", "NZD", "CHF"}


def _to_usd_equivalent(amount: float, currency: str, spot: float) -> float:
    """Convert a local-currency amount to rough USD equivalent using the spot rate.

    For PRICE_CCY (e.g. EUR/USD = 1.0850):  USD = amount * spot
    For USD/CCY  (e.g. USD/JPY = 149.80):   USD = amount / spot
    Returns 0 if spot is zero to avoid division by zero.
    """
    if spot <= 0:
        return 0.0
    if currency in _PRICE_CCY:
        return amount * spot
    return amount / spot


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
    errors.extend(_validate_market(market, trades))
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

        # V-002: currency must be a supported futures-listed code.
        # MXN, EUR, JPY, BRL, ZAR, TRY and all other FUTURES_CURRENCIES are valid.
        if t.currency not in FUTURES_CURRENCIES:
            errors.append(
                ValidationErrorDetail(
                    code="V-002",
                    field=f"{prefix}.currency",
                    message=(
                        f"Currency '{t.currency}' is not a supported futures-listed currency. "
                        f"Accepted: {', '.join(sorted(FUTURES_CURRENCIES))}."
                    ),
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


def _validate_market(
    market: MarketSnapshot,
    trades: list[TradeRow] | None = None,
) -> list[ValidationErrorDetail]:
    errors: list[ValidationErrorDetail] = []

    spot = market.spot_usdmxn  # field name kept for schema compat; holds generic spot

    # V-011: spot out of range (per-currency using USD-equivalent weighting)
    # Priority 1: use provider_metadata.primary_currency if explicitly set --
    #             this is the authoritative override for multi-currency fixtures.
    # Priority 2: dominant by USD-equivalent amount (JPY/BRL raw numbers are large
    #             and would incorrectly dominate without conversion).
    dominant_ccy = "MXN"
    meta_ccy: str | None = None
    if market.provider_metadata:
        meta_ccy = market.provider_metadata.get("primary_currency") or None
    if meta_ccy and meta_ccy in FUTURES_CURRENCIES:
        dominant_ccy = meta_ccy
    elif trades:
        usd_totals: dict[str, float] = {}
        for t in trades:
            usd_eq = _to_usd_equivalent(abs(t.amount), t.currency, spot)
            usd_totals[t.currency] = usd_totals.get(t.currency, 0.0) + usd_eq
        if usd_totals:
            dominant_ccy = max(usd_totals, key=lambda c: usd_totals[c])

    spot_min, spot_max = _spot_range(dominant_ccy)

    if spot <= 0 or not (spot_min <= spot <= spot_max):
        errors.append(
            ValidationErrorDetail(
                code="V-011",
                field="market.spot_usdmxn",
                message=(
                    f"Spot for {dominant_ccy} must be in ({spot_min}..{spot_max}), "
                    f"got {spot}."
                ),
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
            # V-021: forward points sanity -- reject pips-like entry errors.
            # Threshold is 50% of spot per bucket: legitimate high-carry currencies
            # (TRY, BRL) can have monthly points of several full rate units, but
            # nobody should have forward points > half the spot rate in a single month.
            points_max = max(spot * 0.50, 5.0)  # at least 5.0 for near-zero spots
            if abs(val) >= points_max:
                errors.append(
                    ValidationErrorDetail(
                        code="V-021",
                        field=f"market.forward_points_by_month[{key}]",
                        message=(
                            f"Forward points abs({val}) >= {points_max:.2f} "
                            f"(50% of spot {spot}). Reject pips-like values."
                        ),
                        severity=Severity.CRITICAL,
                    )
                )

    # V-022: market data quality gate — hard kill switch in production.
    import os as _os
    data_class: str | None = (market.provider_metadata or {}).get("data_class")
    if data_class == "INDICATIVE_FALLBACK":
        _env = _os.getenv("ENV", "development").lower()
        _allow_override = _os.getenv("ALLOW_INDICATIVE_FALLBACK", "").lower() in ("1", "true", "yes")
        if _env == "production" and not _allow_override:
            raise RuntimeError(
                "FATAL: Indicative fallback data detected in production environment. "
                "Hedge calculations require live market data. "
                "Set ALLOW_INDICATIVE_FALLBACK=true to override (NOT RECOMMENDED)."
            )
        errors.append(
            ValidationErrorDetail(
                code="V-022",
                field="market.provider_metadata.data_class",
                message=(
                    "Market data is INDICATIVE_FALLBACK (no live feed configured). "
                    "Results are for indicative purposes only. "
                    "Configure a live market data source before production execution."
                ),
                severity=Severity.WARNING,
            )
        )

    # V-023: snapshot staleness guard — warn if as_of is > 24h behind wall-clock.
    # Stale snapshots can embed outdated spot/forward points and produce
    # systematically biased hedge plans without any other validation signal.
    _MAX_SNAPSHOT_AGE_HOURS = 24
    as_of_aware = market.as_of
    if as_of_aware.tzinfo is None:
        as_of_aware = as_of_aware.replace(tzinfo=timezone.utc)
    snapshot_age = datetime.now(timezone.utc) - as_of_aware
    if snapshot_age > timedelta(hours=_MAX_SNAPSHOT_AGE_HOURS):
        hours_old = snapshot_age.total_seconds() / 3600.0
        errors.append(
            ValidationErrorDetail(
                code="V-023",
                field="market.as_of",
                message=(
                    f"Market snapshot is {hours_old:.1f}h old "
                    f"(as_of={market.as_of.isoformat()}, threshold={_MAX_SNAPSHOT_AGE_HOURS}h). "
                    "Refresh market data before submitting for production execution."
                ),
                severity=Severity.WARNING,
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

    # V-024: synthetic/indicative proxy production gate.
    # When market data_class is INDICATIVE_FALLBACK and the policy does NOT
    # explicitly allow indicative proxy (allow_indicative_proxy=False, the
    # default), reject with CRITICAL to prevent production runs on stale/fake
    # rates. This is a hard, fail-closed gate.
    _data_class: str | None = (market.provider_metadata or {}).get("data_class")
    if _data_class == "INDICATIVE_FALLBACK" and not getattr(policy, "allow_indicative_proxy", False):
        errors.append(
            ValidationErrorDetail(
                code="V-024",
                field="market.provider_metadata.data_class",
                message=(
                    "Production execution rejected: market data is INDICATIVE_FALLBACK "
                    "and policy.allow_indicative_proxy=False (default). "
                    "Either configure a live market data source (FINNHUB_API_KEY) "
                    "or set policy.allow_indicative_proxy=True for sandbox/demo workflows."
                ),
                severity=Severity.CRITICAL,
            )
        )

    return errors
