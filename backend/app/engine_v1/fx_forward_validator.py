"""A27: FX Forward Consistency Validator.

Ensures no-arbitrage consistency in forward curve.

Formula:
    theoretical_forward = spot ? (1 + r_domestic - r_foreign)
    deviation = abs(actual_forward - theoretical_forward) / spot

Enforcement:
- deviation > soft_tolerance -> R4 integrity WARNING in waterfall
- deviation > hard_tolerance -> Block STAGING submission

Executed pre-kernel in sandbox_calculate(). Does NOT modify kernel.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ForwardArbitrageCheck:
    """Single forward point arbitrage check."""

    bucket: str
    actual_forward: float
    theoretical_forward: float
    deviation: float
    deviation_pct: float
    status: str  # "OK", "WARNING", "VIOLATION"

    def to_dict(self) -> dict:
        return {
            "bucket": self.bucket,
            "actual_forward": self.actual_forward,
            "theoretical_forward": self.theoretical_forward,
            "deviation": self.deviation,
            "deviation_pct": self.deviation_pct,
            "status": self.status,
        }


@dataclass
class ForwardValidationResult:
    """Result of forward curve consistency validation."""

    checks: list[ForwardArbitrageCheck] = field(default_factory=list)
    all_consistent: bool = True
    has_warnings: bool = False
    has_violations: bool = False
    max_deviation_pct: float = 0.0
    violation_buckets: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "checks": [c.to_dict() for c in self.checks],
            "all_consistent": self.all_consistent,
            "has_warnings": self.has_warnings,
            "has_violations": self.has_violations,
            "max_deviation_pct": self.max_deviation_pct,
            "violation_buckets": self.violation_buckets,
        }


# Tenor to month mapping
_BUCKET_TO_MONTHS: dict[str, int] = {}

def _bucket_to_months(bucket: str) -> int:
    """Estimate months from bucket string."""
    try:
        parts = bucket.split("-")
        return int(parts[1]) if len(parts) >= 2 else 3
    except (ValueError, IndexError):
        return 3


def _months_to_tenor(months: int) -> str:
    if months <= 1:
        return "1M"
    if months <= 3:
        return "3M"
    if months <= 6:
        return "6M"
    return "12M"


def validate_forward_consistency(
    market: dict[str, Any],
    policy: dict[str, Any],
    pair: str = "USDMXN",
) -> ForwardValidationResult:
    """Validate no-arbitrage consistency of forward points.

    Parameters
    ----------
    market : dict
        ExtendedMarketSnapshot as dict.
    policy : dict
        ExtendedPolicyConfig as dict. Uses tolerance thresholds.

    Returns
    -------
    ForwardValidationResult
    """
    if pair == "USDMXN":
        spot = market.get("spot_usdmxn", 17.15)
    else:
        fx_rates = market.get("fx_rates", {})
        spot = fx_rates.get(pair, 0.0)
        if spot <= 0:
            return ForwardValidationResult()

    pair_fwd_points = market.get("pair_forward_points", {})
    if pair in pair_fwd_points:
        fwd_points = pair_fwd_points[pair]
    elif pair == "USDMXN":
        fwd_points = market.get("forward_points_by_month", {})
    else:
        fwd_points = {}
    interest_curves = market.get("interest_curves", {})

    soft_tol = policy.get("forward_arbitrage_soft_tolerance", 0.005)
    hard_tol = policy.get("forward_arbitrage_hard_tolerance", 0.02)

    # Derive domestic/foreign currencies from pair
    domestic = pair[:3]  # USD
    foreign = pair[3:]   # MXN

    dom_curve = interest_curves.get(domestic, {})
    fgn_curve = interest_curves.get(foreign, {})

    checks: list[ForwardArbitrageCheck] = []
    violations: list[str] = []
    has_warnings = False
    has_violations = False
    max_dev = 0.0

    for bucket, actual_pts in fwd_points.items():
        months = _bucket_to_months(bucket)
        tenor = _months_to_tenor(months)
        time_frac = months / 12.0

        r_dom = dom_curve.get(tenor, 0.0) / 100.0
        r_fgn = fgn_curve.get(tenor, 0.0) / 100.0

        # Theoretical forward = spot ? (1 + r_foreign ? T) / (1 + r_domestic ? T)
        # Forward points = theoretical_forward - spot
        theoretical_forward = spot * (1 + r_fgn * time_frac) / (1 + r_dom * time_frac)
        theoretical_pts = theoretical_forward - spot

        deviation = abs(actual_pts - theoretical_pts)
        deviation_pct = deviation / spot if spot > 0 else 0.0
        max_dev = max(max_dev, deviation_pct)

        if deviation_pct > hard_tol:
            status = "VIOLATION"
            has_violations = True
            violations.append(bucket)
        elif deviation_pct > soft_tol:
            status = "WARNING"
            has_warnings = True
        else:
            status = "OK"

        checks.append(ForwardArbitrageCheck(
            bucket=bucket,
            actual_forward=actual_pts,
            theoretical_forward=theoretical_pts,
            deviation=deviation,
            deviation_pct=deviation_pct,
            status=status,
        ))

    return ForwardValidationResult(
        checks=checks,
        all_consistent=not has_warnings and not has_violations,
        has_warnings=has_warnings,
        has_violations=has_violations,
        max_deviation_pct=max_dev,
        violation_buckets=violations,
    )
