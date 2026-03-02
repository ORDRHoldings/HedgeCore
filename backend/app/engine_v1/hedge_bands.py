"""A12: Hedge Band Logic.

Enforces institutional hedge ratio bands per bucket.
Violations are flagged as R6 POLICY_VIOLATION in waterfall.

Pure computational -- accepts injectable band configuration via PolicyConfig.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class BandViolation:
    """Single hedge band violation."""

    bucket: str
    confidence: str          # "confirmed" or "forecast"
    effective_ratio: float
    band_min: float
    band_max: float
    violation_type: str      # "UNDER_HEDGED" or "OVER_HEDGED"
    severity: str            # "WARNING" or "CRITICAL"

    def to_dict(self) -> dict:
        return {
            "bucket": self.bucket,
            "confidence": self.confidence,
            "effective_ratio": self.effective_ratio,
            "band_min": self.band_min,
            "band_max": self.band_max,
            "violation_type": self.violation_type,
            "severity": self.severity,
        }


@dataclass
class HedgeBandResult:
    """Result of hedge band enforcement check."""

    violations: list[BandViolation] = field(default_factory=list)
    buckets_checked: int = 0
    buckets_compliant: int = 0
    all_compliant: bool = True

    def to_dict(self) -> dict:
        return {
            "violations": [v.to_dict() for v in self.violations],
            "buckets_checked": self.buckets_checked,
            "buckets_compliant": self.buckets_compliant,
            "all_compliant": self.all_compliant,
        }


def check_hedge_bands(
    bucket_results: list[dict],
    policy: dict[str, Any],
) -> HedgeBandResult:
    """Enforce hedge ratio bands per bucket.

    Parameters
    ----------
    bucket_results : list[dict]
        Per-bucket results from kernel. Each has:
        - 'bucket': str (YYYY-MM)
        - 'confidence': str ('confirmed' or 'forecast')
        - 'hedge_position_mxn': float (existing hedge notional)
        - 'commercial_exposure_mxn': float (underlying exposure)
        Or equivalently action_mxn, gross_exposure_mxn fields.
    policy : dict
        ExtendedPolicyConfig as dict. Uses 'hedge_bands'.

    Returns
    -------
    HedgeBandResult
    """
    bands: dict[str, list[float]] = policy.get("hedge_bands", {})
    if not bands:
        # No bands configured -- everything compliant
        return HedgeBandResult(
            buckets_checked=len(bucket_results),
            buckets_compliant=len(bucket_results),
            all_compliant=True,
        )

    violations: list[BandViolation] = []
    checked = 0
    compliant = 0

    for bucket in bucket_results:
        bucket_id = bucket.get("bucket", "unknown")
        confidence = bucket.get("confidence", "confirmed")

        band = bands.get(confidence)
        if not band or len(band) < 2:
            compliant += 1
            checked += 1
            continue

        band_min = band[0]
        band_max = band[1]

        # Get exposure and hedge values
        hedge_pos = abs(
            bucket.get("hedge_position_local", 0.0) or
            bucket.get("hedge_position_mxn", 0.0) or
            bucket.get("action_local", 0.0) or
            bucket.get("action_mxn", 0.0) or 0.0
        )
        exposure = abs(
            bucket.get("commercial_exposure_local", 0.0) or
            bucket.get("commercial_exposure_mxn", 0.0) or
            bucket.get("gross_exposure_local", 0.0) or
            bucket.get("gross_exposure_mxn", 0.0) or 0.0
        )

        checked += 1

        if exposure < 1.0:
            # No meaningful exposure -- skip
            compliant += 1
            continue

        effective_ratio = hedge_pos / exposure

        if effective_ratio < band_min:
            violations.append(BandViolation(
                bucket=bucket_id,
                confidence=confidence,
                effective_ratio=effective_ratio,
                band_min=band_min,
                band_max=band_max,
                violation_type="UNDER_HEDGED",
                severity="WARNING" if effective_ratio >= band_min * 0.8 else "CRITICAL",
            ))
        elif effective_ratio > band_max:
            violations.append(BandViolation(
                bucket=bucket_id,
                confidence=confidence,
                effective_ratio=effective_ratio,
                band_min=band_min,
                band_max=band_max,
                violation_type="OVER_HEDGED",
                severity="WARNING" if effective_ratio <= band_max * 1.2 else "CRITICAL",
            ))
        else:
            compliant += 1

    return HedgeBandResult(
        violations=violations,
        buckets_checked=checked,
        buckets_compliant=compliant,
        all_compliant=len(violations) == 0,
    )
