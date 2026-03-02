"""
backend/engine/tests/test_triangulation.py
ARCH-02: Cross-rate triangulation validation tests.
"""

from __future__ import annotations

import pytest
from app.engine_v1.currency_netting_matrix import validate_triangular_consistency


class TestTriangularConsistency:
    def test_consistent_rates_pass(self):
        """Internally consistent rates produce no violations."""
        # USDEUR=0.92, EURGBP=0.86 → implied USDGBP = 0.92*0.86 = 0.7912
        rates = {"USDEUR": 0.92, "EURGBP": 0.86, "USDGBP": 0.7912}
        violations = validate_triangular_consistency(rates, tolerance_bps=10.0)
        assert violations == []

    def test_inconsistent_rates_caught(self):
        """Rates with large triangulation breach are caught."""
        rates = {"USDEUR": 0.92, "EURGBP": 0.86, "USDGBP": 0.50}  # Far off
        violations = validate_triangular_consistency(rates, tolerance_bps=5.0)
        assert len(violations) > 0
        assert "Triangulation breach" in violations[0]

    def test_missing_pair_skipped(self):
        """Incomplete rate set (no triplet possible) returns no violations."""
        rates = {"USDEUR": 0.92}
        violations = validate_triangular_consistency(rates)
        assert violations == []

    def test_empty_rates_no_violations(self):
        """Empty rates dict returns no violations."""
        violations = validate_triangular_consistency({})
        assert violations == []

    def test_tolerance_bps_respected(self):
        """Violation within tolerance_bps is allowed."""
        # Small discrepancy of ~1 bps — within 5 bps tolerance
        rates = {"USDEUR": 0.9200, "EURGBP": 0.8600, "USDGBP": 0.79125}
        tight_violations = validate_triangular_consistency(rates, tolerance_bps=0.01)
        loose_violations = validate_triangular_consistency(rates, tolerance_bps=100.0)
        # Loose tolerance must accept it
        assert loose_violations == []

    def test_two_pairs_no_triplet(self):
        """Two pairs sharing one currency don't form a triplet without the third."""
        rates = {"USDEUR": 0.92, "USDJPY": 150.0}
        violations = validate_triangular_consistency(rates)
        assert violations == []

    def test_function_is_importable(self):
        """validate_triangular_consistency must be importable."""
        from app.engine_v1.currency_netting_matrix import validate_triangular_consistency
        assert callable(validate_triangular_consistency)
