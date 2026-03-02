"""
backend/tests/test_pair_registry.py
Multi-currency pair registry tests. Covers all 26 pairs.
"""
from __future__ import annotations

import pytest


class TestPairRegistryCompleteness:
    def test_registry_has_26_pairs(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        assert len(PAIR_REGISTRY) == 26, f"Expected 26 pairs, got {len(PAIR_REGISTRY)}"

    def test_all_g10_present(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        g10 = {"EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCHF", "USDCAD", "USDSEK", "USDNOK", "USDDKK"}
        assert g10.issubset(PAIR_REGISTRY.keys())

    def test_all_em_latam_present(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        latam = {"USDMXN", "USDBRL", "USDCLP", "USDCOP", "USDPEN"}
        assert latam.issubset(PAIR_REGISTRY.keys())

    def test_all_em_asia_present(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        asia = {"USDCNH", "USDINR", "USDKRW", "USDSGD", "USDTWD"}
        assert asia.issubset(PAIR_REGISTRY.keys())

    def test_all_em_ceemea_present(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        ceemea = {"USDZAR", "USDTRY", "USDHUF", "USDPLN", "USDCZK", "USDILS"}
        assert ceemea.issubset(PAIR_REGISTRY.keys())


class TestQuoteConventions:
    def test_eurusd_is_indirect(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, QuoteConvention
        assert PAIR_REGISTRY["EURUSD"].quote_convention == QuoteConvention.INDIRECT

    def test_gbpusd_is_indirect(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, QuoteConvention
        assert PAIR_REGISTRY["GBPUSD"].quote_convention == QuoteConvention.INDIRECT

    def test_usdmxn_is_direct(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, QuoteConvention
        assert PAIR_REGISTRY["USDMXN"].quote_convention == QuoteConvention.DIRECT

    def test_usdjpy_is_direct(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, QuoteConvention
        assert PAIR_REGISTRY["USDJPY"].quote_convention == QuoteConvention.DIRECT

    def test_usdbrl_is_direct(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, QuoteConvention
        assert PAIR_REGISTRY["USDBRL"].quote_convention == QuoteConvention.DIRECT


class TestForwardPointFormats:
    def test_usdmxn_is_additive(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, ForwardPointFormat
        assert PAIR_REGISTRY["USDMXN"].forward_point_format == ForwardPointFormat.ADDITIVE

    def test_eurusd_is_additive(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, ForwardPointFormat
        assert PAIR_REGISTRY["EURUSD"].forward_point_format == ForwardPointFormat.ADDITIVE

    def test_usdbrl_is_percentage(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, ForwardPointFormat
        assert PAIR_REGISTRY["USDBRL"].forward_point_format == ForwardPointFormat.PERCENTAGE

    def test_usdinr_is_percentage(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, ForwardPointFormat
        assert PAIR_REGISTRY["USDINR"].forward_point_format == ForwardPointFormat.PERCENTAGE

    def test_usdkrw_is_percentage(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, ForwardPointFormat
        assert PAIR_REGISTRY["USDKRW"].forward_point_format == ForwardPointFormat.PERCENTAGE

    def test_usdtwd_is_percentage(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, ForwardPointFormat
        assert PAIR_REGISTRY["USDTWD"].forward_point_format == ForwardPointFormat.PERCENTAGE


class TestSettlementTypes:
    def test_ndf_pairs_are_restricted(self):
        from app.engine_v1.pair_registry import list_ndf_pairs
        ndfs = list_ndf_pairs()
        assert all(m.is_ndf for m in ndfs)
        pairs = {m.pair for m in ndfs}
        assert "USDBRL" in pairs
        assert "USDINR" in pairs
        assert "USDKRW" in pairs
        assert "USDTWD" in pairs

    def test_eurusd_is_deliverable(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, SettlementType
        assert PAIR_REGISTRY["EURUSD"].settlement_type == SettlementType.DELIVERABLE

    def test_usdmxn_is_deliverable(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY, SettlementType
        assert PAIR_REGISTRY["USDMXN"].settlement_type == SettlementType.DELIVERABLE


class TestUSDConversion:
    def test_direct_local_to_usd_divides(self):
        """DIRECT (USD/XXX): local / rate = USD. E.g. 175 MXN / 17.5 = 10 USD."""
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["USDMXN"]
        assert abs(meta.convert_local_to_usd(175.0, 17.5) - 10.0) < 1e-9

    def test_indirect_local_to_usd_multiplies(self):
        """INDIRECT (XXX/USD): local * rate = USD. E.g. 100 EUR * 1.085 = 108.5 USD."""
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["EURUSD"]
        assert abs(meta.convert_local_to_usd(100.0, 1.085) - 108.5) < 1e-9

    def test_direct_usd_to_local_multiplies(self):
        """DIRECT (USD/XXX): usd * rate = local. E.g. 10 USD * 17.5 = 175 MXN."""
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["USDMXN"]
        assert abs(meta.convert_usd_to_local(10.0, 17.5) - 175.0) < 1e-9

    def test_indirect_usd_to_local_divides(self):
        """INDIRECT (XXX/USD): usd / rate = local. E.g. 108.5 USD / 1.085 = 100 EUR."""
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["EURUSD"]
        assert abs(meta.convert_usd_to_local(108.5, 1.085) - 100.0) < 1e-9

    def test_zero_rate_returns_zero(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["USDMXN"]
        assert meta.convert_local_to_usd(100.0, 0.0) == 0.0


class TestForwardRateComputation:
    def test_additive_forward(self):
        """ADDITIVE: spot + points. USDMXN: 17.5 + 0.025 = 17.525."""
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["USDMXN"]
        assert abs(meta.compute_forward_rate(17.5, 0.025) - 17.525) < 1e-9

    def test_percentage_forward_ndf(self):
        """PERCENTAGE: spot * (1 + pct/100). USDBRL: 5.20 * 1.025 = 5.33."""
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["USDBRL"]
        expected = 5.20 * 1.025
        assert abs(meta.compute_forward_rate(5.20, 2.5) - expected) < 1e-9

    def test_percentage_not_additive(self):
        """NDF percentage forward must NOT equal spot + points."""
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["USDBRL"]
        fwd = meta.compute_forward_rate(5.20, 2.5)
        assert abs(fwd - (5.20 + 2.5)) > 0.1  # 7.70 is wrong, 5.33 is correct


class TestDirectionStrings:
    def test_usdmxn_sell_local(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["USDMXN"]
        assert meta.sell_local_direction == "SELL_MXN_BUY_USD"

    def test_eurusd_sell_local(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["EURUSD"]
        assert meta.sell_local_direction == "SELL_EUR_BUY_USD"

    def test_usdinr_buy_local(self):
        from app.engine_v1.pair_registry import PAIR_REGISTRY
        meta = PAIR_REGISTRY["USDINR"]
        assert meta.buy_local_direction == "BUY_INR_SELL_USD"


class TestHelperFunctions:
    def test_get_pair_meta_valid(self):
        from app.engine_v1.pair_registry import get_pair_meta
        meta = get_pair_meta("EURUSD")
        assert meta.pair == "EURUSD"

    def test_get_pair_meta_invalid_raises(self):
        from app.engine_v1.pair_registry import get_pair_meta
        with pytest.raises(ValueError, match="Unknown currency pair"):
            get_pair_meta("XYZABC")

    def test_get_pair_for_currency_mxn(self):
        from app.engine_v1.pair_registry import get_pair_for_currency
        meta = get_pair_for_currency("MXN")
        assert meta.pair == "USDMXN"

    def test_get_pair_for_currency_eur(self):
        from app.engine_v1.pair_registry import get_pair_for_currency
        meta = get_pair_for_currency("EUR")
        assert meta.pair == "EURUSD"

    def test_get_pair_for_usd_raises(self):
        from app.engine_v1.pair_registry import get_pair_for_currency
        with pytest.raises(ValueError):
            get_pair_for_currency("USD")

    def test_list_ndf_pairs_count(self):
        from app.engine_v1.pair_registry import list_ndf_pairs
        ndfs = list_ndf_pairs()
        assert len(ndfs) >= 8  # BRL, INR, KRW, TWD, CNH, CLP, COP, PEN

    def test_list_percentage_forward_pairs(self):
        from app.engine_v1.pair_registry import list_percentage_forward_pairs
        pct_pairs = {m.pair for m in list_percentage_forward_pairs()}
        assert "USDBRL" in pct_pairs
        assert "USDINR" in pct_pairs
        assert "USDMXN" not in pct_pairs
