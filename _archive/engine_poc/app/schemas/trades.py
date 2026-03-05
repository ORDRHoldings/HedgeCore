from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class TradeRow(BaseModel):
    record_id: str = Field(..., min_length=1)
    entity: str = Field(..., min_length=1)
    type: Literal["AR", "AP"]
    currency: Literal["MXN"]
    amount: float = Field(..., gt=0)
    value_date: date
    status: Literal["CONFIRMED", "FORECAST"]
    description: str = ""
