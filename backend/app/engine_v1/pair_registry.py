"""Currency Pair Metadata Registry.

Production-grade registry defining quote conventions, forward formats,
settlement rules, NDF flags, and market characteristics for 26 currencies
against USD.

Design: Immutable at startup. Thread-safe. No external dependencies.
Extensible: new pairs added as data, not code.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import ClassVar


class QuoteConvention(str, Enum):
    DIRECT = "DIRECT"
    INDIRECT = "INDIRECT"


class ForwardPointFormat(str, Enum):
    ADDITIVE = "ADDITIVE"
    PERCENTAGE = "PERCENTAGE"


class SettlementType(str, Enum):
    DELIVERABLE = "DELIVERABLE"
    NDF = "NDF"


@dataclass(frozen=True)
class PairMetadata:
    pair: str
    base_ccy: str
    quote_ccy: str
    local_ccy: str
    quote_convention: QuoteConvention
    forward_point_format: ForwardPointFormat
    settlement_type: SettlementType
    settlement_days: int
    pip_size: float
    typical_spread_bps: float
    typical_adv_usd: float
    max_tenor_months: int
    is_restricted: bool
    iso_region: str

    @property
    def usd_is_base(self) -> bool:
        return self.quote_convention == QuoteConvention.DIRECT

    @property
    def usd_is_quote(self) -> bool:
        return self.quote_convention == QuoteConvention.INDIRECT

    @property
    def is_ndf(self) -> bool:
        return self.settlement_type == SettlementType.NDF

    @property
    def sell_local_direction(self) -> str:
        return f"SELL_{self.local_ccy}_BUY_USD"

    @property
    def buy_local_direction(self) -> str:
        return f"BUY_{self.local_ccy}_SELL_USD"

    def compute_forward_rate(self, spot: float, points: float) -> float:
        if self.forward_point_format == ForwardPointFormat.ADDITIVE:
            return spot + points
        else:
            return spot * (1.0 + points / 100.0)

    def convert_local_to_usd(self, local_amount: float, rate: float) -> float:
        if rate == 0:
            return 0.0
        if self.usd_is_base:
            return local_amount / rate
        else:
            return local_amount * rate

    def convert_usd_to_local(self, usd_amount: float, rate: float) -> float:
        if rate == 0:
            return 0.0
        if self.usd_is_base:
            return usd_amount * rate
        else:
            return usd_amount / rate


_PAIR_DATA: list[dict] = [
    # G10 INDIRECT (XXX/USD)
    {"pair": "EURUSD", "base_ccy": "EUR", "quote_ccy": "USD", "local_ccy": "EUR",
     "quote_convention": "INDIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 0.5,
     "typical_adv_usd": 750_000_000_000, "max_tenor_months": 60, "is_restricted": False, "iso_region": "G10"},
    {"pair": "GBPUSD", "base_ccy": "GBP", "quote_ccy": "USD", "local_ccy": "GBP",
     "quote_convention": "INDIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 1.0,
     "typical_adv_usd": 420_000_000_000, "max_tenor_months": 60, "is_restricted": False, "iso_region": "G10"},
    {"pair": "AUDUSD", "base_ccy": "AUD", "quote_ccy": "USD", "local_ccy": "AUD",
     "quote_convention": "INDIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 1.5,
     "typical_adv_usd": 180_000_000_000, "max_tenor_months": 36, "is_restricted": False, "iso_region": "G10"},
    {"pair": "NZDUSD", "base_ccy": "NZD", "quote_ccy": "USD", "local_ccy": "NZD",
     "quote_convention": "INDIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 2.0,
     "typical_adv_usd": 50_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "G10"},
    # G10 DIRECT (USD/XXX)
    {"pair": "USDJPY", "base_ccy": "USD", "quote_ccy": "JPY", "local_ccy": "JPY",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.01, "typical_spread_bps": 0.5,
     "typical_adv_usd": 580_000_000_000, "max_tenor_months": 60, "is_restricted": False, "iso_region": "G10"},
    {"pair": "USDCHF", "base_ccy": "USD", "quote_ccy": "CHF", "local_ccy": "CHF",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 1.0,
     "typical_adv_usd": 150_000_000_000, "max_tenor_months": 60, "is_restricted": False, "iso_region": "G10"},
    {"pair": "USDCAD", "base_ccy": "USD", "quote_ccy": "CAD", "local_ccy": "CAD",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 1, "pip_size": 0.0001, "typical_spread_bps": 1.0,
     "typical_adv_usd": 220_000_000_000, "max_tenor_months": 60, "is_restricted": False, "iso_region": "G10"},
    {"pair": "USDSEK", "base_ccy": "USD", "quote_ccy": "SEK", "local_ccy": "SEK",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 3.0,
     "typical_adv_usd": 45_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "G10"},
    {"pair": "USDNOK", "base_ccy": "USD", "quote_ccy": "NOK", "local_ccy": "NOK",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 3.0,
     "typical_adv_usd": 40_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "G10"},
    {"pair": "USDDKK", "base_ccy": "USD", "quote_ccy": "DKK", "local_ccy": "DKK",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 2.0,
     "typical_adv_usd": 30_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "G10"},
    # EM LATAM
    {"pair": "USDMXN", "base_ccy": "USD", "quote_ccy": "MXN", "local_ccy": "MXN",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 5.0,
     "typical_adv_usd": 55_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "EM_LATAM"},
    {"pair": "USDBRL", "base_ccy": "USD", "quote_ccy": "BRL", "local_ccy": "BRL",
     "quote_convention": "DIRECT", "forward_point_format": "PERCENTAGE", "settlement_type": "NDF",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 15.0,
     "typical_adv_usd": 25_000_000_000, "max_tenor_months": 24, "is_restricted": True, "iso_region": "EM_LATAM"},
    {"pair": "USDCLP", "base_ccy": "USD", "quote_ccy": "CLP", "local_ccy": "CLP",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "NDF",
     "settlement_days": 2, "pip_size": 0.01, "typical_spread_bps": 20.0,
     "typical_adv_usd": 5_000_000_000, "max_tenor_months": 12, "is_restricted": True, "iso_region": "EM_LATAM"},
    {"pair": "USDCOP", "base_ccy": "USD", "quote_ccy": "COP", "local_ccy": "COP",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "NDF",
     "settlement_days": 2, "pip_size": 0.01, "typical_spread_bps": 25.0,
     "typical_adv_usd": 3_000_000_000, "max_tenor_months": 12, "is_restricted": True, "iso_region": "EM_LATAM"},
    {"pair": "USDPEN", "base_ccy": "USD", "quote_ccy": "PEN", "local_ccy": "PEN",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "NDF",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 15.0,
     "typical_adv_usd": 1_500_000_000, "max_tenor_months": 12, "is_restricted": True, "iso_region": "EM_LATAM"},
    # EM ASIA
    {"pair": "USDCNH", "base_ccy": "USD", "quote_ccy": "CNH", "local_ccy": "CNH",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "NDF",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 5.0,
     "typical_adv_usd": 60_000_000_000, "max_tenor_months": 24, "is_restricted": True, "iso_region": "EM_ASIA"},
    {"pair": "USDINR", "base_ccy": "USD", "quote_ccy": "INR", "local_ccy": "INR",
     "quote_convention": "DIRECT", "forward_point_format": "PERCENTAGE", "settlement_type": "NDF",
     "settlement_days": 2, "pip_size": 0.01, "typical_spread_bps": 8.0,
     "typical_adv_usd": 30_000_000_000, "max_tenor_months": 12, "is_restricted": True, "iso_region": "EM_ASIA"},
    {"pair": "USDKRW", "base_ccy": "USD", "quote_ccy": "KRW", "local_ccy": "KRW",
     "quote_convention": "DIRECT", "forward_point_format": "PERCENTAGE", "settlement_type": "NDF",
     "settlement_days": 2, "pip_size": 0.01, "typical_spread_bps": 10.0,
     "typical_adv_usd": 28_000_000_000, "max_tenor_months": 12, "is_restricted": True, "iso_region": "EM_ASIA"},
    {"pair": "USDSGD", "base_ccy": "USD", "quote_ccy": "SGD", "local_ccy": "SGD",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 2.0,
     "typical_adv_usd": 35_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "EM_ASIA"},
    {"pair": "USDTWD", "base_ccy": "USD", "quote_ccy": "TWD", "local_ccy": "TWD",
     "quote_convention": "DIRECT", "forward_point_format": "PERCENTAGE", "settlement_type": "NDF",
     "settlement_days": 2, "pip_size": 0.001, "typical_spread_bps": 8.0,
     "typical_adv_usd": 12_000_000_000, "max_tenor_months": 12, "is_restricted": True, "iso_region": "EM_ASIA"},
    # EM CEEMEA
    {"pair": "USDZAR", "base_ccy": "USD", "quote_ccy": "ZAR", "local_ccy": "ZAR",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 10.0,
     "typical_adv_usd": 25_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "EM_CEEMEA"},
    {"pair": "USDTRY", "base_ccy": "USD", "quote_ccy": "TRY", "local_ccy": "TRY",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 50.0,
     "typical_adv_usd": 15_000_000_000, "max_tenor_months": 12, "is_restricted": False, "iso_region": "EM_CEEMEA"},
    {"pair": "USDHUF", "base_ccy": "USD", "quote_ccy": "HUF", "local_ccy": "HUF",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.01, "typical_spread_bps": 8.0,
     "typical_adv_usd": 6_000_000_000, "max_tenor_months": 12, "is_restricted": False, "iso_region": "EM_CEEMEA"},
    {"pair": "USDPLN", "base_ccy": "USD", "quote_ccy": "PLN", "local_ccy": "PLN",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.0001, "typical_spread_bps": 5.0,
     "typical_adv_usd": 12_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "EM_CEEMEA"},
    {"pair": "USDCZK", "base_ccy": "USD", "quote_ccy": "CZK", "local_ccy": "CZK",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.001, "typical_spread_bps": 5.0,
     "typical_adv_usd": 8_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "EM_CEEMEA"},
    {"pair": "USDILS", "base_ccy": "USD", "quote_ccy": "ILS", "local_ccy": "ILS",
     "quote_convention": "DIRECT", "forward_point_format": "ADDITIVE", "settlement_type": "DELIVERABLE",
     "settlement_days": 2, "pip_size": 0.001, "typical_spread_bps": 4.0,
     "typical_adv_usd": 8_000_000_000, "max_tenor_months": 24, "is_restricted": False, "iso_region": "EM_CEEMEA"},
]


def _build_registry() -> dict[str, PairMetadata]:
    registry: dict[str, PairMetadata] = {}
    for d in _PAIR_DATA:
        pm = PairMetadata(
            pair=d["pair"],
            base_ccy=d["base_ccy"],
            quote_ccy=d["quote_ccy"],
            local_ccy=d["local_ccy"],
            quote_convention=QuoteConvention(d["quote_convention"]),
            forward_point_format=ForwardPointFormat(d["forward_point_format"]),
            settlement_type=SettlementType(d["settlement_type"]),
            settlement_days=d["settlement_days"],
            pip_size=d["pip_size"],
            typical_spread_bps=d["typical_spread_bps"],
            typical_adv_usd=d["typical_adv_usd"],
            max_tenor_months=d["max_tenor_months"],
            is_restricted=d["is_restricted"],
            iso_region=d["iso_region"],
        )
        registry[pm.pair] = pm
    return registry


PAIR_REGISTRY: dict[str, PairMetadata] = _build_registry()


def get_pair_meta(pair: str) -> PairMetadata:
    meta = PAIR_REGISTRY.get(pair)
    if meta is None:
        raise ValueError(
            f"Unknown currency pair: {pair!r}. "
            f"Supported: {sorted(PAIR_REGISTRY.keys())}"
        )
    return meta


def get_pair_for_currency(currency: str) -> PairMetadata:
    if currency == "USD":
        raise ValueError("Cannot determine USD pair without counterpart currency")
    for meta in PAIR_REGISTRY.values():
        if meta.local_ccy == currency:
            return meta
    raise ValueError(f"No registered pair for currency: {currency!r}")


def list_pairs_by_region(region: str) -> list[PairMetadata]:
    return [m for m in PAIR_REGISTRY.values() if m.iso_region == region]


def list_ndf_pairs() -> list[PairMetadata]:
    return [m for m in PAIR_REGISTRY.values() if m.is_ndf]


def list_percentage_forward_pairs() -> list[PairMetadata]:
    return [m for m in PAIR_REGISTRY.values()
            if m.forward_point_format == ForwardPointFormat.PERCENTAGE]
