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
