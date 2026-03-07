"""Tests for app.engine_v1.normalizer_multi."""

import pytest
from datetime import date

import pandas as pd

from app.engine_v1.normalizer_multi import normalize_hedges_multi, normalize_trades_multi
from app.schemas_v1.hedges import MultiCurrencyHedgeRow
from app.schemas_v1.trades import TradeRow


class TestNormalizeTradesMulti:
    def test_ar_trade_positive_signed_local(self):
        trade = TradeRow(
            record_id="T1", entity="Corp", type="AR", currency="MXN",
            amount=1_000_000, value_date=date(2025, 7, 15), status="CONFIRMED",
            description="Invoice",
        )
        df = normalize_trades_multi([trade])
        assert len(df) == 1
        assert df.iloc[0]["signed_local"] == 1_000_000
        assert df.iloc[0]["bucket"] == "2025-07"

    def test_ap_trade_negative_signed_local(self):
        trade = TradeRow(
            record_id="T2", entity="Corp", type="AP", currency="EUR",
            amount=500_000, value_date=date(2025, 9, 1), status="CONFIRMED",
        )
        df = normalize_trades_multi([trade])
        assert len(df) == 1
        assert df.iloc[0]["signed_local"] == -500_000

    def test_multiple_trades(self):
        trades = [
            TradeRow(record_id="T1", entity="Corp", type="AR", currency="MXN",
                     amount=1_000_000, value_date=date(2025, 7, 15), status="CONFIRMED"),
            TradeRow(record_id="T2", entity="Corp", type="AP", currency="MXN",
                     amount=500_000, value_date=date(2025, 8, 1), status="FORECAST"),
        ]
        df = normalize_trades_multi(trades)
        assert len(df) == 2
        assert df.iloc[0]["signed_local"] == 1_000_000
        assert df.iloc[1]["signed_local"] == -500_000

    def test_empty_trades(self):
        df = normalize_trades_multi([])
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 0

    def test_columns_present(self):
        trade = TradeRow(
            record_id="T1", entity="Corp", type="AR", currency="MXN",
            amount=100, value_date=date(2025, 1, 5), status="CONFIRMED",
        )
        df = normalize_trades_multi([trade])
        expected_cols = [
            "record_id", "entity", "type", "currency", "amount",
            "value_date", "status", "description", "bucket", "signed_local",
        ]
        for col in expected_cols:
            assert col in df.columns

    def test_bucket_format(self):
        trade = TradeRow(
            record_id="T1", entity="Corp", type="AR", currency="MXN",
            amount=100, value_date=date(2025, 12, 31), status="CONFIRMED",
        )
        df = normalize_trades_multi([trade])
        assert df.iloc[0]["bucket"] == "2025-12"

    def test_description_preserved(self):
        trade = TradeRow(
            record_id="T1", entity="Corp", type="AR", currency="MXN",
            amount=100, value_date=date(2025, 1, 5), status="CONFIRMED",
            description="Test desc",
        )
        df = normalize_trades_multi([trade])
        assert df.iloc[0]["description"] == "Test desc"

    def test_description_default_empty(self):
        trade = TradeRow(
            record_id="T1", entity="Corp", type="AR", currency="MXN",
            amount=100, value_date=date(2025, 1, 5), status="CONFIRMED",
        )
        df = normalize_trades_multi([trade])
        assert df.iloc[0]["description"] == ""

    def test_entity_preserved(self):
        trade = TradeRow(
            record_id="T1", entity="SubsidiaryA", type="AR", currency="JPY",
            amount=10_000, value_date=date(2025, 5, 1), status="FORECAST",
        )
        df = normalize_trades_multi([trade])
        assert df.iloc[0]["entity"] == "SubsidiaryA"
        assert df.iloc[0]["currency"] == "JPY"

    def test_status_preserved(self):
        for status in ("CONFIRMED", "FORECAST"):
            trade = TradeRow(
                record_id="T1", entity="Corp", type="AR", currency="MXN",
                amount=100, value_date=date(2025, 1, 5), status=status,
            )
            df = normalize_trades_multi([trade])
            assert df.iloc[0]["status"] == status

    def test_amount_preserved_positive(self):
        trade = TradeRow(
            record_id="T1", entity="Corp", type="AP", currency="MXN",
            amount=999_999, value_date=date(2025, 3, 1), status="CONFIRMED",
        )
        df = normalize_trades_multi([trade])
        assert df.iloc[0]["amount"] == 999_999
        assert df.iloc[0]["signed_local"] == -999_999


class TestNormalizeHedgesMulti:
    def test_empty_hedges(self):
        df = normalize_hedges_multi([])
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 0
        expected_cols = [
            "hedge_id", "pair", "instrument", "direction",
            "notional_local", "value_date", "status", "bucket", "signed_local",
        ]
        for col in expected_cols:
            assert col in df.columns

    def test_sell_local_negative(self):
        hedge = MultiCurrencyHedgeRow(
            hedge_id="H1", pair="USDMXN", instrument="FWD",
            direction="SELL_MXN_BUY_USD", notional_local=1_000_000,
            value_date=date(2025, 7, 15), status="LOCKED",
        )
        df = normalize_hedges_multi([hedge])
        assert len(df) == 1
        assert df.iloc[0]["signed_local"] == -1_000_000

    def test_buy_local_positive(self):
        hedge = MultiCurrencyHedgeRow(
            hedge_id="H2", pair="USDMXN", instrument="FWD",
            direction="BUY_MXN_SELL_USD", notional_local=500_000,
            value_date=date(2025, 8, 1), status="ACTIVE",
        )
        df = normalize_hedges_multi([hedge])
        assert df.iloc[0]["signed_local"] == 500_000

    def test_usd_base_pair_local_ccy_extraction(self):
        hedge = MultiCurrencyHedgeRow(
            hedge_id="H1", pair="USDMXN", instrument="FWD",
            direction="SELL_MXN_BUY_USD", notional_local=1_000_000,
            value_date=date(2025, 7, 15), status="LOCKED",
        )
        df = normalize_hedges_multi([hedge])
        assert df.iloc[0]["signed_local"] == -1_000_000

    def test_non_usd_base_pair_sell(self):
        hedge = MultiCurrencyHedgeRow(
            hedge_id="H1", pair="EURUSD", instrument="FWD",
            direction="SELL_EUR_BUY_USD", notional_local=500_000,
            value_date=date(2025, 7, 15), status="LOCKED",
        )
        df = normalize_hedges_multi([hedge])
        assert df.iloc[0]["signed_local"] == -500_000

    def test_non_usd_base_pair_buy(self):
        hedge = MultiCurrencyHedgeRow(
            hedge_id="H1", pair="EURUSD", instrument="FWD",
            direction="BUY_EUR_SELL_USD", notional_local=500_000,
            value_date=date(2025, 7, 15), status="ACTIVE",
        )
        df = normalize_hedges_multi([hedge])
        assert df.iloc[0]["signed_local"] == 500_000

    def test_bucket_format(self):
        hedge = MultiCurrencyHedgeRow(
            hedge_id="H1", pair="USDMXN", instrument="NDF",
            direction="SELL_MXN_BUY_USD", notional_local=100_000,
            value_date=date(2025, 12, 20), status="LOCKED",
        )
        df = normalize_hedges_multi([hedge])
        assert df.iloc[0]["bucket"] == "2025-12"

    def test_multiple_hedges(self):
        hedges = [
            MultiCurrencyHedgeRow(
                hedge_id="H1", pair="USDMXN", instrument="FWD",
                direction="SELL_MXN_BUY_USD", notional_local=1_000_000,
                value_date=date(2025, 7, 15), status="LOCKED",
            ),
            MultiCurrencyHedgeRow(
                hedge_id="H2", pair="EURUSD", instrument="NDF",
                direction="BUY_EUR_SELL_USD", notional_local=300_000,
                value_date=date(2025, 8, 1), status="ACTIVE",
            ),
        ]
        df = normalize_hedges_multi(hedges)
        assert len(df) == 2
        assert df.iloc[0]["signed_local"] == -1_000_000
        assert df.iloc[1]["signed_local"] == 300_000

    def test_pair_field_preserved(self):
        hedge = MultiCurrencyHedgeRow(
            hedge_id="H1", pair="USDJPY", instrument="FWD",
            direction="SELL_JPY_BUY_USD", notional_local=10_000_000,
            value_date=date(2025, 6, 1), status="LOCKED",
        )
        df = normalize_hedges_multi([hedge])
        assert df.iloc[0]["pair"] == "USDJPY"

    def test_instrument_field_preserved(self):
        for inst in ("FWD", "NDF"):
            hedge = MultiCurrencyHedgeRow(
                hedge_id="H1", pair="USDMXN", instrument=inst,
                direction="SELL_MXN_BUY_USD", notional_local=100_000,
                value_date=date(2025, 6, 1), status="LOCKED",
            )
            df = normalize_hedges_multi([hedge])
            assert df.iloc[0]["instrument"] == inst
