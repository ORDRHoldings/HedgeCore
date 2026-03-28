"""
backend/app/engine_v1/counterparty_risk.py
RPT-07: Counterparty FX exposure and PFE (Potential Future Exposure) model.

Provides per-counterparty exposure aggregation and PFE at 97.5% confidence.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


@dataclass
class CounterpartyExposure:
    counterparty_id: str
    counterparty_name: str
    gross_notional_usd: float
    net_notional_usd: float       # after netting
    pfe_97_5: float               # Potential Future Exposure at 97.5%
    mark_to_market: float         # Current MtM (positive = in-the-money)
    isda_threshold: float         # CSA threshold (0 = full collateral)
    exposure_above_threshold: float  # max(0, net - threshold)
    concentration_pct: float      # % of total portfolio

    def to_dict(self) -> dict[str, Any]:
        return {
            "counterparty_id": self.counterparty_id,
            "counterparty_name": self.counterparty_name,
            "gross_notional_usd": self.gross_notional_usd,
            "net_notional_usd": self.net_notional_usd,
            "pfe_97_5": self.pfe_97_5,
            "mark_to_market": self.mark_to_market,
            "isda_threshold": self.isda_threshold,
            "exposure_above_threshold": self.exposure_above_threshold,
            "concentration_pct": self.concentration_pct,
        }


@dataclass
class CounterpartyRiskResult:
    exposures: list[CounterpartyExposure] = field(default_factory=list)
    total_gross_usd: float = 0.0
    total_net_usd: float = 0.0
    total_pfe_usd: float = 0.0
    largest_cp_pct: float = 0.0   # Herfindahl-like concentration
    risk_level: str = "LOW"       # LOW | MEDIUM | HIGH | CRITICAL

    def to_dict(self) -> dict[str, Any]:
        return {
            "exposures": [e.to_dict() for e in self.exposures],
            "total_gross_usd": self.total_gross_usd,
            "total_net_usd": self.total_net_usd,
            "total_pfe_usd": self.total_pfe_usd,
            "largest_cp_pct": self.largest_cp_pct,
            "risk_level": self.risk_level,
        }


def compute_counterparty_exposure(
    positions: list[dict[str, Any]],  # list of {counterparty_id, counterparty_name, notional_usd, mtm_usd, isda_threshold_usd}
    volatility_annual: float = 0.10,  # 10% annual vol default for PFE
    time_horizon_years: float = 1.0,
    confidence: float = 0.975,
) -> CounterpartyRiskResult:
    """Compute per-counterparty FX exposure and PFE.

    PFE = notional * vol * sqrt(T) * z_alpha  (Basel simplified approach)
    where z_alpha = norm.ppf(confidence) ~ 1.96 for 97.5%
    """
    if not positions:
        return CounterpartyRiskResult()

    # z-score for confidence level (hardcoded for 97.5%)
    z_alpha = 1.959964  # norm.ppf(0.975)

    # Group by counterparty
    cp_map: dict[str, dict[str, Any]] = {}
    for pos in positions:
        cp_id = pos.get("counterparty_id", "UNKNOWN")
        if cp_id not in cp_map:
            cp_map[cp_id] = {
                "name": pos.get("counterparty_name", cp_id),
                "notionals": [],
                "mtm": 0.0,
                "isda_threshold": pos.get("isda_threshold_usd", 0.0),
            }
        cp_map[cp_id]["notionals"].append(pos.get("notional_usd", 0.0))
        cp_map[cp_id]["mtm"] += pos.get("mtm_usd", 0.0)

    total_gross = sum(abs(n) for cp in cp_map.values() for n in cp["notionals"])

    exposures = []
    for cp_id, cp in cp_map.items():
        gross = sum(abs(n) for n in cp["notionals"])
        net = sum(cp["notionals"])  # netting
        pfe = gross * volatility_annual * math.sqrt(time_horizon_years) * z_alpha
        above_threshold = max(0.0, abs(net) - cp["isda_threshold"])
        conc = gross / total_gross if total_gross > 0 else 0.0
        exposures.append(CounterpartyExposure(
            counterparty_id=cp_id,
            counterparty_name=cp["name"],
            gross_notional_usd=gross,
            net_notional_usd=net,
            pfe_97_5=pfe,
            mark_to_market=cp["mtm"],
            isda_threshold=cp["isda_threshold"],
            exposure_above_threshold=above_threshold,
            concentration_pct=conc,
        ))

    total_net = sum(abs(e.net_notional_usd) for e in exposures)
    total_pfe = sum(e.pfe_97_5 for e in exposures)
    largest_pct = max((e.concentration_pct for e in exposures), default=0.0)

    risk_level = "LOW"
    if largest_pct > 0.50:
        risk_level = "CRITICAL"
    elif largest_pct > 0.33:
        risk_level = "HIGH"
    elif largest_pct > 0.20:
        risk_level = "MEDIUM"

    return CounterpartyRiskResult(
        exposures=sorted(exposures, key=lambda e: e.gross_notional_usd, reverse=True),
        total_gross_usd=total_gross,
        total_net_usd=total_net,
        total_pfe_usd=total_pfe,
        largest_cp_pct=largest_pct,
        risk_level=risk_level,
    )
