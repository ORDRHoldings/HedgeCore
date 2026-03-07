"""Tests for engine_v1/counterparty_risk.py — Counterparty PFE model."""

import pytest

from app.engine_v1.counterparty_risk import (
    compute_counterparty_exposure,
    CounterpartyRiskResult,
    CounterpartyExposure,
)


# ── Fixtures ──────────────────────────────────────────────────────────

POSITIONS_DIVERSIFIED = [
    {"counterparty_id": "CP1", "counterparty_name": "Bank A", "notional_usd": 1_000_000, "mtm_usd": 5000, "isda_threshold_usd": 100_000},
    {"counterparty_id": "CP2", "counterparty_name": "Bank B", "notional_usd": 2_000_000, "mtm_usd": -3000, "isda_threshold_usd": 0},
    {"counterparty_id": "CP3", "counterparty_name": "Bank C", "notional_usd": 1_500_000, "mtm_usd": 1000, "isda_threshold_usd": 50_000},
]

POSITIONS_CONCENTRATED = [
    {"counterparty_id": "CP1", "counterparty_name": "Big Bank", "notional_usd": 8_000_000, "mtm_usd": 10000},
    {"counterparty_id": "CP2", "counterparty_name": "Small Bank", "notional_usd": 2_000_000, "mtm_usd": -1000},
]


class TestComputeCounterpartyExposure:
    def test_empty_positions(self):
        result = compute_counterparty_exposure([])
        assert isinstance(result, CounterpartyRiskResult)
        assert result.total_gross_usd == 0.0
        assert result.risk_level == "LOW"
        assert len(result.exposures) == 0

    def test_diversified_portfolio(self):
        result = compute_counterparty_exposure(POSITIONS_DIVERSIFIED)
        assert len(result.exposures) == 3
        assert result.total_gross_usd == pytest.approx(4_500_000)
        # CP2 = 2M / 4.5M ≈ 0.44 > 0.33 → HIGH
        assert result.risk_level == "HIGH"

    def test_concentrated_portfolio(self):
        result = compute_counterparty_exposure(POSITIONS_CONCENTRATED)
        assert result.largest_cp_pct == pytest.approx(0.8)
        assert result.risk_level == "CRITICAL"

    def test_pfe_calculation(self):
        """PFE = notional * vol * sqrt(T) * z_alpha."""
        result = compute_counterparty_exposure(
            [{"counterparty_id": "CP1", "counterparty_name": "Test", "notional_usd": 1_000_000}],
            volatility_annual=0.10,
            time_horizon_years=1.0,
        )
        exp = result.exposures[0]
        # PFE = 1M * 0.10 * sqrt(1) * 1.96 = 196,000 (approx)
        assert exp.pfe_97_5 == pytest.approx(195_996.4, rel=0.01)

    def test_netting(self):
        """Positions with same counterparty should net."""
        positions = [
            {"counterparty_id": "CP1", "counterparty_name": "Bank", "notional_usd": 1_000_000},
            {"counterparty_id": "CP1", "counterparty_name": "Bank", "notional_usd": -500_000},
        ]
        result = compute_counterparty_exposure(positions)
        assert len(result.exposures) == 1
        assert result.exposures[0].gross_notional_usd == pytest.approx(1_500_000)
        assert result.exposures[0].net_notional_usd == pytest.approx(500_000)

    def test_isda_threshold(self):
        """Exposure above threshold should be net - threshold (floored at 0)."""
        positions = [
            {"counterparty_id": "CP1", "counterparty_name": "Bank", "notional_usd": 1_000_000, "isda_threshold_usd": 200_000},
        ]
        result = compute_counterparty_exposure(positions)
        exp = result.exposures[0]
        assert exp.exposure_above_threshold == pytest.approx(800_000)

    def test_isda_threshold_floor(self):
        """If net < threshold, exposure_above_threshold = 0."""
        positions = [
            {"counterparty_id": "CP1", "counterparty_name": "Bank", "notional_usd": 100_000, "isda_threshold_usd": 500_000},
        ]
        result = compute_counterparty_exposure(positions)
        assert result.exposures[0].exposure_above_threshold == 0.0

    def test_sorted_by_gross(self):
        """Exposures should be sorted by gross notional descending."""
        result = compute_counterparty_exposure(POSITIONS_DIVERSIFIED)
        notionals = [e.gross_notional_usd for e in result.exposures]
        assert notionals == sorted(notionals, reverse=True)

    def test_concentration_sums_to_one(self):
        result = compute_counterparty_exposure(POSITIONS_DIVERSIFIED)
        total = sum(e.concentration_pct for e in result.exposures)
        assert total == pytest.approx(1.0)

    def test_to_dict(self):
        result = compute_counterparty_exposure(POSITIONS_DIVERSIFIED)
        d = result.to_dict()
        assert "exposures" in d
        assert "total_gross_usd" in d
        assert "risk_level" in d
        assert isinstance(d["exposures"], list)
        assert "counterparty_id" in d["exposures"][0]

    def test_unknown_counterparty(self):
        """Missing counterparty_id defaults to UNKNOWN."""
        positions = [{"notional_usd": 100_000}]
        result = compute_counterparty_exposure(positions)
        assert result.exposures[0].counterparty_id == "UNKNOWN"

    def test_risk_levels(self):
        """Verify risk level thresholds."""
        # LOW: <20%
        r_low = compute_counterparty_exposure([
            {"counterparty_id": f"CP{i}", "counterparty_name": f"Bank {i}", "notional_usd": 100_000}
            for i in range(10)
        ])
        assert r_low.risk_level == "LOW"

        # MEDIUM: 20-33%
        r_med = compute_counterparty_exposure([
            {"counterparty_id": "CP1", "counterparty_name": "Big", "notional_usd": 250_000},
            {"counterparty_id": "CP2", "counterparty_name": "Small1", "notional_usd": 250_000},
            {"counterparty_id": "CP3", "counterparty_name": "Small2", "notional_usd": 250_000},
            {"counterparty_id": "CP4", "counterparty_name": "Small3", "notional_usd": 250_000},
        ])
        assert r_med.risk_level == "MEDIUM"
