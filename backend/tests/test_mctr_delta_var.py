"""
backend/engine/tests/test_mctr_delta_var.py
RISK-01: Delta-VaR based MCTR tests.
"""

from __future__ import annotations

import pytest
from app.engine_v1.risk_allocator import compute_mctr_delta_var


class TestMCTRDeltaVaR:
    def test_function_is_importable(self):
        """compute_mctr_delta_var must be importable."""
        assert callable(compute_mctr_delta_var)

    def test_empty_positions_returns_empty(self):
        """Empty position list returns empty dict."""
        result = compute_mctr_delta_var([], {}, confidence=0.95)
        assert result == {}

    def test_single_position_nonzero(self):
        """Single position with positive weight returns non-negative MCTR."""
        from types import SimpleNamespace
        pos = SimpleNamespace(id="pos_1", weight=1.0)
        cov = {(0, 0): 0.04}  # 20% vol squared
        result = compute_mctr_delta_var([pos], cov, confidence=0.95)
        assert "pos_1" in result
        assert result["pos_1"] >= 0.0

    def test_zero_covariance_matrix(self):
        """All-zero covariance → portfolio VaR = 0 → MCTR = 0."""
        from types import SimpleNamespace
        positions = [
            SimpleNamespace(id="pos_A", weight=0.6),
            SimpleNamespace(id="pos_B", weight=0.4),
        ]
        cov = {(0, 0): 0.0, (0, 1): 0.0, (1, 0): 0.0, (1, 1): 0.0}
        result = compute_mctr_delta_var(positions, cov, confidence=0.95)
        for v in result.values():
            assert v == pytest.approx(0.0, abs=1e-9)

    def test_legacy_allocator_still_works(self):
        """Original allocate_hedges function still importable and callable."""
        from app.engine_v1.risk_allocator import allocate_hedges
        assert callable(allocate_hedges)
