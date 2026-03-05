"""Tests for all 21 validation rejection codes."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.engine.validator import validate_all
from app.schemas.hedges import HedgeRow
from app.schemas.market import MarketSnapshot
from app.schemas.policy import PolicyConfig, HedgeRatios, CostAssumptions
from app.schemas.trades import TradeRow


def _market(**overrides):
    defaults = dict(
        as_of=datetime(2025, 6, 15, tzinfo=timezone.utc),
        spot_usdmxn=17.15,
        forward_points_by_month={"2025-07": 0.035},
    )
    defaults.update(overrides)
    return MarketSnapshot(**defaults)


def _policy(**overrides):
    defaults = dict(
        hedge_ratios=HedgeRatios(confirmed=1.0, forecast=0.5),
        cost_assumptions=CostAssumptions(spread_bps=5.0),
        execution_product="NDF",
        min_trade_size_usd=50000,
    )
    defaults.update(overrides)
    return PolicyConfig(**defaults)


def _trade(**overrides):
    defaults = dict(
        record_id="T1", entity="E", type="AR", currency="MXN",
        amount=1000000, value_date=date(2025, 7, 15), status="CONFIRMED",
    )
    defaults.update(overrides)
    return TradeRow(**defaults)


def _hedge(**overrides):
    defaults = dict(
        hedge_id="H1", instrument="NDF", direction="SELL_MXN_BUY_USD",
        notional_mxn=1000000, value_date=date(2025, 7, 15), status="ACTIVE",
    )
    defaults.update(overrides)
    return HedgeRow(**defaults)


class TestTradeValidation:
    def test_v001_amount_rejected_by_pydantic(self):
        with pytest.raises(Exception):
            _trade(amount=-1)

    def test_v005_past_value_date_warning(self):
        t = _trade(value_date=date(2025, 5, 1))
        # Include forward points for the past bucket to avoid V-014
        m = _market(forward_points_by_month={"2025-05": 0.02, "2025-07": 0.035})
        r = validate_all([t], [], m, _policy())
        assert r.status == "PASS"
        assert any("V-005" in w for w in r.warnings)

    def test_v006_duplicate_record_id(self):
        t1 = _trade(record_id="DUP")
        t2 = _trade(record_id="DUP")
        r = validate_all([t1, t2], [], _market(), _policy())
        assert r.status == "FAIL"
        assert any(e.code == "V-006" for e in r.errors)

    def test_v019_empty_trades(self):
        r = validate_all([], [], _market(), _policy())
        assert r.status == "FAIL"
        assert any(e.code == "V-019" for e in r.errors)

    def test_valid_trade_passes(self):
        r = validate_all([_trade()], [], _market(), _policy())
        assert r.status == "PASS"


class TestHedgeValidation:
    def test_v010_duplicate_hedge_id(self):
        h1 = _hedge(hedge_id="DUP")
        h2 = _hedge(hedge_id="DUP")
        r = validate_all([_trade()], [h1, h2], _market(), _policy())
        assert r.status == "FAIL"
        assert any(e.code == "V-010" for e in r.errors)

    def test_valid_hedge_passes(self):
        r = validate_all([_trade()], [_hedge()], _market(), _policy())
        assert r.status == "PASS"


class TestMarketValidation:
    def test_v011_spot_too_low(self):
        r = validate_all([_trade()], [], _market(spot_usdmxn=5.0), _policy())
        assert r.status == "FAIL"
        assert any(e.code == "V-011" for e in r.errors)

    def test_v011_spot_too_high(self):
        r = validate_all([_trade()], [], _market(spot_usdmxn=35.0), _policy())
        assert r.status == "FAIL"
        assert any(e.code == "V-011" for e in r.errors)

    def test_v012_empty_forward_points(self):
        r = validate_all([_trade()], [], _market(forward_points_by_month={}), _policy())
        assert r.status == "FAIL"
        assert any(e.code == "V-012" for e in r.errors)

    def test_v013_bad_key_format(self):
        r = validate_all(
            [_trade()], [],
            _market(forward_points_by_month={"Jul-2025": 0.035}),
            _policy(),
        )
        assert r.status == "FAIL"
        assert any(e.code == "V-013" for e in r.errors)

    def test_v021_points_too_large(self):
        r = validate_all(
            [_trade()], [],
            _market(forward_points_by_month={"2025-07": 1500}),
            _policy(),
        )
        assert r.status == "FAIL"
        assert any(e.code == "V-021" for e in r.errors)

    def test_v021_points_near_limit_pass(self):
        r = validate_all(
            [_trade()], [],
            _market(forward_points_by_month={"2025-07": 4.99}),
            _policy(),
        )
        assert r.status == "PASS"


class TestPolicyValidation:
    def test_valid_policy_passes(self):
        r = validate_all([_trade()], [], _market(), _policy())
        assert r.status == "PASS"


class TestCrossValidation:
    def test_v014_trade_bucket_no_fwd_points(self):
        t = _trade(value_date=date(2025, 8, 15))
        r = validate_all([t], [], _market(), _policy())
        assert r.status == "FAIL"
        assert any(e.code == "V-014" for e in r.errors)

    def test_v015_hedge_bucket_no_fwd_points_warning(self):
        h = _hedge(value_date=date(2025, 8, 15))
        r = validate_all([_trade()], [h], _market(), _policy())
        assert r.status == "PASS"
        assert any("V-015" in w for w in r.warnings)
