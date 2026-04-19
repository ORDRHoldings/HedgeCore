"""
Unit tests for hedge_template_service (P2-C).

Focus: pure-function logic.
- Instrument mix validation (sum-of-weights, instrument whitelist, option strikes)
- apply_template_to_position projection math (notional split, tenor-day → date)
- System template seed spec integrity (each built-in template validates)
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest

from app.services.hedge_template_service import (
    HedgeTemplateError,
    SYSTEM_TEMPLATES,
    apply_template_to_position,
    validate_instrument_mix,
)


# ── Validation ────────────────────────────────────────────────────────

def test_validate_rejects_empty_mix():
    with pytest.raises(HedgeTemplateError, match="non-empty"):
        validate_instrument_mix([])


def test_validate_rejects_unknown_instrument():
    mix = [{"instrument": "FROB", "weight": 1.0, "direction": "SELL"}]
    with pytest.raises(HedgeTemplateError, match="instrument"):
        validate_instrument_mix(mix)


def test_validate_rejects_weight_out_of_range():
    mix = [{"instrument": "FORWARD", "weight": 1.5, "direction": "SELL"}]
    with pytest.raises(HedgeTemplateError, match="weight"):
        validate_instrument_mix(mix)


def test_validate_rejects_bad_direction():
    mix = [{"instrument": "FORWARD", "weight": 1.0, "direction": "FOO"}]
    with pytest.raises(HedgeTemplateError, match="direction"):
        validate_instrument_mix(mix)


def test_validate_rejects_weight_sum_mismatch():
    mix = [
        {"instrument": "FORWARD", "weight": 0.3, "direction": "SELL"},
        {"instrument": "FORWARD", "weight": 0.3, "direction": "SELL"},
    ]
    with pytest.raises(HedgeTemplateError, match="sum\\(weight\\)"):
        validate_instrument_mix(mix)


def test_validate_accepts_unit_sum_sequential_tranches():
    mix = [
        {"instrument": "FORWARD", "weight": 0.5, "tenor_days": 90, "direction": "SELL"},
        {"instrument": "FORWARD", "weight": 0.3, "tenor_days": 180, "direction": "SELL"},
        {"instrument": "FORWARD", "weight": 0.2, "tenor_days": 365, "direction": "SELL"},
    ]
    validate_instrument_mix(mix)  # should not raise


def test_validate_accepts_paired_legs_sum_two():
    """Collar: put + call on same notional → weights sum to 2.0."""
    mix = [
        {"instrument": "VANILLA_PUT", "weight": 1.0, "strike_pct": 0.95, "direction": "BUY"},
        {"instrument": "VANILLA_CALL", "weight": 1.0, "strike_pct": 1.05, "direction": "SELL"},
    ]
    validate_instrument_mix(mix)  # should not raise


def test_validate_options_require_strike():
    mix = [{"instrument": "VANILLA_PUT", "weight": 1.0, "direction": "BUY"}]
    with pytest.raises(HedgeTemplateError, match="strike_pct"):
        validate_instrument_mix(mix)


def test_validate_rejects_negative_tenor():
    mix = [{
        "instrument": "FORWARD", "weight": 1.0,
        "tenor_days": -10, "direction": "SELL",
    }]
    with pytest.raises(HedgeTemplateError, match="tenor_days"):
        validate_instrument_mix(mix)


# ── System seeds ──────────────────────────────────────────────────────

@pytest.mark.parametrize("spec", SYSTEM_TEMPLATES, ids=lambda s: s["short_name"])
def test_all_system_templates_have_valid_mix(spec):
    """Every built-in template must pass validation."""
    validate_instrument_mix(spec["instrument_mix"])


def test_rolling_12_template_has_12_equal_tranches():
    roll = next(s for s in SYSTEM_TEMPLATES if s["short_name"] == "ROLL12")
    assert len(roll["instrument_mix"]) == 12
    assert all(abs(leg["weight"] - 1 / 12) < 1e-9 for leg in roll["instrument_mix"])


def test_layered_template_weights_sum_to_one():
    layered = next(s for s in SYSTEM_TEMPLATES if s["short_name"] == "LAY3")
    total = sum(leg["weight"] for leg in layered["instrument_mix"])
    assert abs(total - 1.0) < 1e-9


# ── Apply logic ───────────────────────────────────────────────────────

def _position(amount: float, currency: str = "EUR", value_date: str = "2026-12-31"):
    return SimpleNamespace(
        id="pos-1", amount=amount, currency=currency,
        value_date=date.fromisoformat(value_date), company_id="co-1",
    )


def test_apply_forward_100_single_leg_matches_exposure():
    """FWD100: one leg at 100% of notional, matures at position value_date."""
    tmpl = SimpleNamespace(instrument_mix=[
        {"instrument": "FORWARD", "weight": 1.0,
         "tenor_days": None, "strike_pct": None,
         "direction": "SELL", "tranche_label": "Full"},
    ])
    pos = _position(1_000_000, currency="EUR", value_date="2026-12-31")
    legs = apply_template_to_position(tmpl, pos, today=date(2026, 4, 18))
    assert len(legs) == 1
    assert legs[0]["notional"] == 1_000_000.00
    assert legs[0]["currency"] == "EUR"
    assert legs[0]["value_date"] == "2026-12-31"
    assert legs[0]["direction"] == "SELL"


def test_apply_layered_splits_notional_and_computes_dates():
    tmpl = SimpleNamespace(instrument_mix=[
        {"instrument": "FORWARD", "weight": 0.5, "tenor_days": 90,
         "strike_pct": None, "direction": "SELL", "tranche_label": "3M"},
        {"instrument": "FORWARD", "weight": 0.3, "tenor_days": 180,
         "strike_pct": None, "direction": "SELL", "tranche_label": "6M"},
        {"instrument": "FORWARD", "weight": 0.2, "tenor_days": 365,
         "strike_pct": None, "direction": "SELL", "tranche_label": "12M"},
    ])
    pos = _position(1_000_000, value_date="2027-04-18")
    legs = apply_template_to_position(tmpl, pos, today=date(2026, 4, 18))

    assert [leg["notional"] for leg in legs] == [500_000.0, 300_000.0, 200_000.0]
    assert legs[0]["value_date"] == "2026-07-17"   # +90 days
    assert legs[1]["value_date"] == "2026-10-15"   # +180 days
    assert legs[2]["value_date"] == "2027-04-18"   # +365 days
    assert sum(leg["notional"] for leg in legs) == pos.amount


def test_apply_rolling_12_produces_twelve_equal_legs():
    roll = next(s for s in SYSTEM_TEMPLATES if s["short_name"] == "ROLL12")
    tmpl = SimpleNamespace(instrument_mix=roll["instrument_mix"])
    pos = _position(1_200_000, value_date="2027-05-01")
    legs = apply_template_to_position(tmpl, pos, today=date(2026, 4, 18))
    assert len(legs) == 12
    # 1/12 of 1_200_000 = 100_000 per leg
    assert all(leg["notional"] == 100_000.0 for leg in legs)


def test_apply_collar_has_put_and_call_same_notional():
    collar = next(s for s in SYSTEM_TEMPLATES if s["short_name"] == "COLLAR95")
    tmpl = SimpleNamespace(instrument_mix=collar["instrument_mix"])
    pos = _position(500_000, value_date="2026-12-31")
    legs = apply_template_to_position(tmpl, pos, today=date(2026, 4, 18))
    assert len(legs) == 2
    put = next(leg for leg in legs if leg["instrument"] == "VANILLA_PUT")
    call = next(leg for leg in legs if leg["instrument"] == "VANILLA_CALL")
    assert put["notional"] == call["notional"] == 500_000.0
    assert put["strike_pct"] == 0.95
    assert call["strike_pct"] == 1.05
    assert put["direction"] == "BUY"
    assert call["direction"] == "SELL"


def test_apply_preserves_position_currency():
    tmpl = SimpleNamespace(instrument_mix=[
        {"instrument": "FORWARD", "weight": 1.0, "tenor_days": None,
         "strike_pct": None, "direction": "SELL", "tranche_label": "F"},
    ])
    for ccy in ("EUR", "JPY", "MXN", "GBP"):
        pos = _position(100_000, currency=ccy)
        legs = apply_template_to_position(tmpl, pos, today=date(2026, 4, 18))
        assert legs[0]["currency"] == ccy
