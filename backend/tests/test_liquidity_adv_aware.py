"""
backend/tests/test_liquidity_adv_aware.py
FIX-05: Pair-aware ADV fallback — not flat $5B for all pairs.
"""
from __future__ import annotations
import pytest


class TestLiquidityADVAware:
    def test_usdcop_fallback_not_5b(self):
        """USDCOP typical ADV ($3B) must be < $5B flat default."""
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        cop_adv = PAIR_REGISTRY["USDCOP"].typical_adv_usd
        assert cop_adv < 5_000_000_000, f"USDCOP ADV should be <$5B, got {cop_adv:,.0f}"

    def test_estimate_slippage_uses_registry_adv(self):
        """Without market ADV data, registry fallback is used (not $5B)."""
        from app.engine_v1.liquidity_model import estimate_slippage
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        actions = [{"bucket": "2026-01", "action_usd": 1_000_000, "pair": "USDCOP"}]
        market = {"adv_data": {}}  # Empty — forces fallback
        policy = {"execution_product": "NDF", "cost_assumptions": {"spread_bps": 25.0}}
        result = estimate_slippage(actions, market, policy)
        # Should use USDCOP registry ADV (~$3B), not $5B
        est = result.estimates[0]
        cop_adv = PAIR_REGISTRY["USDCOP"].typical_adv_usd
        assert abs(est.adv_usd - cop_adv) < 1.0, (
            f"ADV should be registry value {cop_adv:,.0f}, got {est.adv_usd:,.0f}"
        )

    def test_require_adv_strict_raises(self):
        """require_adv=True raises ValueError when ADV not in market data."""
        from app.engine_v1.liquidity_model import estimate_slippage
        actions = [{"bucket": "2026-01", "action_usd": 500_000, "pair": "USDTRY"}]
        market = {"adv_data": {}}
        policy = {"execution_product": "FWD", "cost_assumptions": {"spread_bps": 50.0}}
        with pytest.raises(ValueError, match="ADV data required"):
            estimate_slippage(actions, market, policy, require_adv=True)
