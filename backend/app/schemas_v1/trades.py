from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

# All CME / ICE futures-listed currency codes supported by this engine.
# Mirrors frontend api/types.ts FuturesCurrency union.
FUTURES_CURRENCIES = {
    "MXN", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "NZD",
    "BRL", "CLP", "COP", "PEN", "ZAR", "INR", "CNH", "KRW",
    "SGD", "TWD", "TRY", "HUF", "PLN", "CZK", "SEK", "NOK",
    "DKK", "ILS",
}


class TradeRow(BaseModel):
    record_id: str = Field(..., min_length=1)
    entity: str = Field(..., min_length=1)
    type: Literal["AR", "AP"]
    currency: str = Field(..., min_length=3, max_length=3)
    amount: float = Field(..., gt=0)
    value_date: date
    status: Literal["CONFIRMED", "FORECAST"]
    description: str = ""
