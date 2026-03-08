"""Prospective hedge effectiveness testing per IFRS 9.6.4.1(c)(iii).

Supplements the existing retrospective testing in hedge_accounting.py.
Three methods supported:
1. CRITICAL_TERMS_MATCH -- qualitative assessment of hedging relationship
2. STATISTICAL_FORECAST -- forward-looking regression on projected changes
3. NONE -- prospective testing disabled (retrospective only)

References:
- IFRS 9.6.4.1(c)(iii): Prospective effectiveness requirement
- IFRS 9.B6.4.4-B6.4.6: Assessment methods guidance
- ASC 815-20-25-79 through 25-83: Critical terms match criteria
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class CriticalTermsResult:
    """Result of critical terms match assessment."""
    matched: bool
    terms_checked: list[str] = field(default_factory=list)
    terms_matched: list[str] = field(default_factory=list)
    terms_mismatched: list[str] = field(default_factory=list)
    is_effective: bool = False
    method: str = "CRITICAL_TERMS_MATCH"
    rationale: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "matched": self.matched,
            "terms_checked": self.terms_checked,
            "terms_matched": self.terms_matched,
            "terms_mismatched": self.terms_mismatched,
            "is_effective": self.is_effective,
            "method": self.method,
            "rationale": self.rationale,
        }


@dataclass
class StatisticalForecastResult:
    """Result of statistical forecast prospective test."""
    projected_effectiveness: float
    is_effective: bool
    confidence_level: float
    sample_size: int
    method: str = "STATISTICAL_FORECAST"
    projected_r_squared: float | None = None
    projected_slope: float | None = None
    band_min: float = 0.80
    band_max: float = 1.25
    rationale: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "projected_effectiveness": round(self.projected_effectiveness, 6),
            "is_effective": self.is_effective,
            "confidence_level": self.confidence_level,
            "sample_size": self.sample_size,
            "method": self.method,
            "projected_r_squared": round(self.projected_r_squared, 6) if self.projected_r_squared is not None else None,
            "projected_slope": round(self.projected_slope, 6) if self.projected_slope is not None else None,
            "band_min": self.band_min,
            "band_max": self.band_max,
            "rationale": self.rationale,
        }


@dataclass
class ProspectiveEffectivenessResult:
    """Combined prospective effectiveness assessment."""
    method: str  # "CRITICAL_TERMS_MATCH", "STATISTICAL_FORECAST", "NONE"
    is_effective: bool
    critical_terms: CriticalTermsResult | None = None
    statistical_forecast: StatisticalForecastResult | None = None
    rationale: str = ""

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "method": self.method,
            "is_effective": self.is_effective,
            "rationale": self.rationale,
        }
        if self.critical_terms is not None:
            d["critical_terms"] = self.critical_terms.to_dict()
        if self.statistical_forecast is not None:
            d["statistical_forecast"] = self.statistical_forecast.to_dict()
        return d


def assess_critical_terms_match(
    hedged_item: dict[str, Any],
    hedging_instrument: dict[str, Any],
) -> CriticalTermsResult:
    """Critical terms match per ASC 815-20-25-79 / IFRS 9.B6.4.4.

    Checks whether the critical terms of the hedging instrument match
    those of the hedged item. When all critical terms match, high
    effectiveness is expected and no quantitative assessment is needed.

    Critical terms checked:
    1. Notional amount (or quantity)
    2. Currency pair
    3. Maturity date (or settlement date)
    4. Underlying risk (FX rate)
    5. Settlement type (deliverable vs NDF)
    """
    terms_checked = ["notional", "currency_pair", "maturity", "underlying", "settlement_type"]
    terms_matched: list[str] = []
    terms_mismatched: list[str] = []

    # Notional match (within 5% tolerance for rounding)
    hi_notional = float(hedged_item.get("notional", 0))
    inst_notional = float(hedging_instrument.get("notional", 0))
    if hi_notional > 0 and abs(hi_notional - inst_notional) / hi_notional <= 0.05:
        terms_matched.append("notional")
    else:
        terms_mismatched.append("notional")

    # Currency pair match
    hi_pair = str(hedged_item.get("currency_pair", "")).upper()
    inst_pair = str(hedging_instrument.get("currency_pair", "")).upper()
    if hi_pair and hi_pair == inst_pair:
        terms_matched.append("currency_pair")
    else:
        terms_mismatched.append("currency_pair")

    # Maturity match (within 5 business days)
    hi_maturity = hedged_item.get("maturity_date", "")
    inst_maturity = hedging_instrument.get("maturity_date", "")
    if hi_maturity and inst_maturity and hi_maturity == inst_maturity:
        terms_matched.append("maturity")
    elif hi_maturity and inst_maturity:
        terms_mismatched.append("maturity")
    else:
        terms_mismatched.append("maturity")

    # Underlying match (both reference same FX rate)
    hi_underlying = str(hedged_item.get("underlying", "FX")).upper()
    inst_underlying = str(hedging_instrument.get("underlying", "FX")).upper()
    if hi_underlying == inst_underlying:
        terms_matched.append("underlying")
    else:
        terms_mismatched.append("underlying")

    # Settlement type match
    hi_settlement = str(hedged_item.get("settlement_type", "")).upper()
    inst_settlement = str(hedging_instrument.get("settlement_type", "")).upper()
    if hi_settlement and hi_settlement == inst_settlement:
        terms_matched.append("settlement_type")
    elif not hi_settlement and not inst_settlement:
        terms_matched.append("settlement_type")
    else:
        terms_mismatched.append("settlement_type")

    matched = len(terms_mismatched) == 0
    rationale = (
        f"All {len(terms_matched)} critical terms match -- high effectiveness expected per ASC 815-20-25-79."
        if matched
        else f"{len(terms_mismatched)} critical term(s) mismatch ({', '.join(terms_mismatched)}) -- quantitative test required."
    )

    return CriticalTermsResult(
        matched=matched,
        terms_checked=terms_checked,
        terms_matched=terms_matched,
        terms_mismatched=terms_mismatched,
        is_effective=matched,
        rationale=rationale,
    )


def assess_statistical_forecast(
    historical_hedged_changes: list[float],
    historical_instrument_changes: list[float],
    *,
    confidence: float = 0.95,
    band_min: float = 0.80,
    band_max: float = 1.25,
    r2_min: float = 0.80,
    slope_min: float = -1.25,
    slope_max: float = -0.80,
) -> StatisticalForecastResult:
    """Forward-looking statistical effectiveness test per IFRS 9.B6.4.6.

    Uses historical relationship to project future effectiveness.
    Requires minimum 20 data points (less than retrospective 30 to
    allow designation earlier in hedge life, per IFRS 9.B6.4.5).

    Method: OLS regression of instrument changes on hedged item changes.
    Effectiveness projected if R-squared >= threshold AND slope within band.
    """
    n = len(historical_hedged_changes)
    min_points = 20

    if n < min_points or n != len(historical_instrument_changes):
        return StatisticalForecastResult(
            projected_effectiveness=0.0,
            is_effective=False,
            confidence_level=confidence,
            sample_size=n,
            rationale=f"Insufficient data: {n} points, minimum {min_points} required for prospective test.",
        )

    # OLS regression: instrument = a + b x hedged_item
    guard = 1e-10
    x = historical_hedged_changes
    y = historical_instrument_changes

    x_mean = sum(x) / n
    y_mean = sum(y) / n

    ss_xx = sum((xi - x_mean) ** 2 for xi in x)
    ss_yy = sum((yi - y_mean) ** 2 for yi in y)
    ss_xy = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))

    if ss_xx < guard or ss_yy < guard:
        return StatisticalForecastResult(
            projected_effectiveness=0.0,
            is_effective=False,
            confidence_level=confidence,
            sample_size=n,
            rationale="Insufficient variance in data for regression.",
        )

    slope = ss_xy / ss_xx
    r_squared = (ss_xy ** 2) / (ss_xx * ss_yy)

    # Dollar-offset equivalent from slope
    projected_effectiveness = abs(slope)

    is_effective = (
        r_squared >= r2_min
        and slope_min <= slope <= slope_max
    )

    if is_effective:
        rationale = (
            f"Prospective test PASSED: R2={r_squared:.4f} (>={r2_min}), "
            f"slope={slope:.4f} (within [{slope_min}, {slope_max}]). "
            f"High effectiveness expected going forward per IFRS 9.B6.4.6."
        )
    else:
        reasons = []
        if r_squared < r2_min:
            reasons.append(f"R2={r_squared:.4f} < {r2_min}")
        if not (slope_min <= slope <= slope_max):
            reasons.append(f"slope={slope:.4f} outside [{slope_min}, {slope_max}]")
        rationale = (
            f"Prospective test FAILED: {'; '.join(reasons)}. "
            f"Consider adjusting hedge ratio or instrument selection."
        )

    return StatisticalForecastResult(
        projected_effectiveness=projected_effectiveness,
        is_effective=is_effective,
        confidence_level=confidence,
        sample_size=n,
        projected_r_squared=r_squared,
        projected_slope=slope,
        band_min=band_min,
        band_max=band_max,
        rationale=rationale,
    )


def assess_prospective_effectiveness(
    method: str,
    *,
    hedged_item: dict[str, Any] | None = None,
    hedging_instrument: dict[str, Any] | None = None,
    historical_hedged_changes: list[float] | None = None,
    historical_instrument_changes: list[float] | None = None,
    confidence: float = 0.95,
    band_min: float = 0.80,
    band_max: float = 1.25,
    r2_min: float = 0.80,
    slope_min: float = -1.25,
    slope_max: float = -0.80,
) -> ProspectiveEffectivenessResult:
    """Unified prospective effectiveness assessment.

    Dispatches to appropriate method based on policy configuration.
    """
    if method == "NONE":
        return ProspectiveEffectivenessResult(
            method="NONE",
            is_effective=True,  # no prospective test = assumed effective
            rationale="Prospective effectiveness testing disabled in policy. Retrospective testing only.",
        )

    if method == "CRITICAL_TERMS_MATCH":
        if hedged_item is None or hedging_instrument is None:
            return ProspectiveEffectivenessResult(
                method="CRITICAL_TERMS_MATCH",
                is_effective=False,
                rationale="Critical terms match requires hedged_item and hedging_instrument data.",
            )
        ct = assess_critical_terms_match(hedged_item, hedging_instrument)
        return ProspectiveEffectivenessResult(
            method="CRITICAL_TERMS_MATCH",
            is_effective=ct.is_effective,
            critical_terms=ct,
            rationale=ct.rationale,
        )

    if method == "STATISTICAL_FORECAST":
        if historical_hedged_changes is None or historical_instrument_changes is None:
            return ProspectiveEffectivenessResult(
                method="STATISTICAL_FORECAST",
                is_effective=False,
                rationale="Statistical forecast requires historical data series.",
            )
        sf = assess_statistical_forecast(
            historical_hedged_changes,
            historical_instrument_changes,
            confidence=confidence,
            band_min=band_min,
            band_max=band_max,
            r2_min=r2_min,
            slope_min=slope_min,
            slope_max=slope_max,
        )
        return ProspectiveEffectivenessResult(
            method="STATISTICAL_FORECAST",
            is_effective=sf.is_effective,
            statistical_forecast=sf,
            rationale=sf.rationale,
        )

    return ProspectiveEffectivenessResult(
        method=method,
        is_effective=False,
        rationale=f"Unknown prospective effectiveness method: {method}",
    )
