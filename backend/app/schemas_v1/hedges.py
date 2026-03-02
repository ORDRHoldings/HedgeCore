from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class HedgeRow(BaseModel):
    hedge_id: str = Field(..., min_length=1)
    instrument: Literal["FWD", "NDF"]
    direction: Literal["SELL_MXN_BUY_USD", "BUY_MXN_SELL_USD"]
    notional_mxn: float = Field(..., gt=0)
    value_date: date
    status: Literal["LOCKED", "ACTIVE"]


class MultiCurrencyHedgeRow(BaseModel):
    """Generalized hedge row supporting any currency pair."""
    hedge_id: str = Field(..., min_length=1)
    pair: str = Field(default="USDMXN", description="Currency pair code")
    instrument: Literal["FWD", "NDF"]
    direction: str = Field(
        ...,
        description="SELL_{LOCAL}_BUY_USD or BUY_{LOCAL}_SELL_USD",
    )
    notional_local: float = Field(..., gt=0, description="Notional in local currency")
    value_date: date
    status: Literal["LOCKED", "ACTIVE"]

    @classmethod
    def from_legacy(cls, legacy: "HedgeRow", pair: str = "USDMXN") -> "MultiCurrencyHedgeRow":
        return cls(
            hedge_id=legacy.hedge_id,
            pair=pair,
            instrument=legacy.instrument,
            direction=legacy.direction,
            notional_local=legacy.notional_mxn,
            value_date=legacy.value_date,
            status=legacy.status,
        )
