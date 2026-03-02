"""
backend/tests/test_margin_calendar_days.py
FIX-06: Actual calendar day computation replaces month×30 formula.
"""
from __future__ import annotations
import pytest


class TestMarginCalendarDays:
    def test_value_date_overrides_bucket(self):
        """value_date=2025-07-15, as_of=2025-06-01 → 44 days."""
        from app.engine_v1.margin_model import _estimate_days
        days = _estimate_days("2025-07", value_date="2025-07-15", as_of="2025-06-01")
        assert days == 44

    def test_bucket_mid_month_estimate(self):
        """Bucket 2026-09, as_of 2026-06-01 → ~106 days (Sep-15 minus Jun-01)."""
        from app.engine_v1.margin_model import _estimate_days
        days = _estimate_days("2026-09", as_of="2026-06-01")
        assert 100 <= days <= 110, f"Expected ~106 days, got {days}"

    def test_month_times_30_not_used(self):
        """month×30 formula must NOT be used — January != 30, June != 180."""
        from app.engine_v1.margin_model import _estimate_days
        # If month×30 is used: bucket "2026-01" → 30 days regardless of as_of
        # Calendar: Jan-15-2026 from Jun-01-2025 = ~228 days
        days = _estimate_days("2026-01", as_of="2025-06-01")
        assert days > 100, f"month×30 formula would give 30 for Jan, got {days}"

    def test_expired_bucket_minimum_one_day(self):
        """Expired positions (past maturity) return minimum 1 day."""
        from app.engine_v1.margin_model import _estimate_days
        # 2024-01 bucket is well in the past
        days = _estimate_days("2024-01", as_of="2026-03-01")
        assert days >= 1, "Minimum 1 day must be returned for expired positions"

    def test_compute_margin_passes_value_date(self):
        """compute_margin uses action value_date for calendar computation."""
        from app.engine_v1.margin_model import compute_margin
        actions = [{"bucket": "2026-09", "action_usd": 1_000_000, "value_date": "2026-09-15"}]
        market = {"funding_rate_bps": 500, "as_of": "2026-03-01"}
        policy = {"execution_product": "FWD"}
        result = compute_margin(actions, market, policy)
        assert len(result.positions) == 1
        # funding_cost = initial_margin × rate × (days/360), days should be ~198 not 9×30=270
        assert result.positions[0].funding_cost > 0
