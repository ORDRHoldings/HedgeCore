"""Tests for sign convention and bucket assignment."""

from datetime import date

from app.engine.normalizer import normalize_hedges, normalize_trades
from app.schemas.hedges import HedgeRow
from app.schemas.trades import TradeRow


def test_ar_positive_sign():
    t = TradeRow(record_id="T1", entity="E", type="AR", currency="MXN", amount=1000000, value_date=date(2025, 7, 15), status="CONFIRMED")
    df = normalize_trades([t])
    assert df.iloc[0]["signed_mxn"] == 1000000


def test_ap_negative_sign():
    t = TradeRow(record_id="T1", entity="E", type="AP", currency="MXN", amount=1000000, value_date=date(2025, 7, 15), status="CONFIRMED")
    df = normalize_trades([t])
    assert df.iloc[0]["signed_mxn"] == -1000000


def test_sell_mxn_negative():
    h = HedgeRow(hedge_id="H1", instrument="NDF", direction="SELL_MXN_BUY_USD", notional_mxn=5000000, value_date=date(2025, 7, 15), status="ACTIVE")
    df = normalize_hedges([h])
    assert df.iloc[0]["signed_mxn"] == -5000000


def test_buy_mxn_positive():
    h = HedgeRow(hedge_id="H1", instrument="NDF", direction="BUY_MXN_SELL_USD", notional_mxn=5000000, value_date=date(2025, 7, 15), status="ACTIVE")
    df = normalize_hedges([h])
    assert df.iloc[0]["signed_mxn"] == 5000000


def test_bucket_assignment():
    t = TradeRow(record_id="T1", entity="E", type="AR", currency="MXN", amount=1000000, value_date=date(2025, 12, 25), status="CONFIRMED")
    df = normalize_trades([t])
    assert df.iloc[0]["bucket"] == "2025-12"


def test_empty_hedges():
    df = normalize_hedges([])
    assert len(df) == 0
    assert "signed_mxn" in df.columns
