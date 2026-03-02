"""
backend/tests/test_netting_triangulation.py
FIX-10: Triangular arbitrage consistency check.
"""
from __future__ import annotations
import pytest


class TestTriangulationCheck:
    def test_consistent_rates_status_ok(self):
        """Consistent cross rates → status OK."""
        from app.engine_v1.currency_netting_matrix import (
            compute_currency_netting, validate_netting_triangulation, NettingPair
        )
        # EURUSD=1.085, USDJPY=149.0, EURJPY=149.0×1.085=161.665 (synthetic matches market)
        netting_pairs = [NettingPair(
            original_pair_1="EURUSD",
            original_pair_2="USDJPY",
            synthetic_pair="EURJPY",
            original_notional_1=1_000_000,
            original_notional_2=1_000_000,
            netted_notional=1_000_000,
            savings_usd=30_000,
        )]
        fx_rates = {"EURUSD": 1.085, "USDJPY": 149.0, "EURJPY": 161.665}
        checks = validate_netting_triangulation(netting_pairs, fx_rates)
        assert len(checks) == 1
        assert checks[0].status == "OK"

    def test_stale_data_triggers_warning(self):
        """Large deviation between synthetic and market cross → WARNING."""
        from app.engine_v1.currency_netting_matrix import validate_netting_triangulation, NettingPair
        netting_pairs = [NettingPair(
            original_pair_1="EURUSD",
            original_pair_2="USDJPY",
            synthetic_pair="EURJPY",
            original_notional_1=1_000_000,
            original_notional_2=1_000_000,
            netted_notional=1_000_000,
            savings_usd=30_000,
        )]
        # EURUSD=1.085, USDJPY=149.0 → synthetic=161.665, market=162.5 → deviation ~0.5%
        fx_rates = {"EURUSD": 1.085, "USDJPY": 149.0, "EURJPY": 162.5}
        checks = validate_netting_triangulation(netting_pairs, fx_rates, tolerance_pct=0.3)
        assert len(checks) == 1
        assert checks[0].status in ("WARNING", "SUSPECT")

    def test_netting_result_has_triangulation_fields(self):
        """NettingResult includes triangulation_checks and triangulation_warnings."""
        from app.engine_v1.currency_netting_matrix import compute_currency_netting
        result = compute_currency_netting(
            {"EURUSD": 1_000_000, "USDJPY": -800_000},
            {"EURUSD": 1.085, "USDJPY": 149.0, "EURJPY": 161.0},
        )
        assert hasattr(result, "triangulation_checks")
        assert hasattr(result, "triangulation_warnings")
        assert isinstance(result.triangulation_warnings, int)

    def test_validate_netting_triangulation_callable(self):
        """validate_netting_triangulation is importable and callable."""
        from app.engine_v1.currency_netting_matrix import validate_netting_triangulation
        assert callable(validate_netting_triangulation)
