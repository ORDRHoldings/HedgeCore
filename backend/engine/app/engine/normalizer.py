"""Normalizer: applies sign convention and assigns buckets.

Sign convention (cashflow view):
  Trades:  AR => +MXN,  AP => -MXN
  Hedges:  SELL_MXN_BUY_USD => -MXN,  BUY_MXN_SELL_USD => +MXN
"""

from __future__ import annotations

import pandas as pd

from app.schemas.hedges import HedgeRow
from app.schemas.trades import TradeRow


def normalize_trades(trades: list[TradeRow]) -> pd.DataFrame:
    rows = []
    for t in trades:
        signed_mxn = t.amount if t.type == "AR" else -t.amount
        rows.append(
            {
                "record_id": t.record_id,
                "entity": t.entity,
                "type": t.type,
                "currency": t.currency,
                "amount": t.amount,
                "value_date": t.value_date,
                "status": t.status,
                "description": t.description,
                "bucket": t.value_date.strftime("%Y-%m"),
                "signed_mxn": signed_mxn,
            }
        )
    return pd.DataFrame(rows)


def normalize_hedges(hedges: list[HedgeRow]) -> pd.DataFrame:
    if not hedges:
        return pd.DataFrame(
            columns=[
                "hedge_id",
                "instrument",
                "direction",
                "notional_mxn",
                "value_date",
                "status",
                "bucket",
                "signed_mxn",
            ]
        )
    rows = []
    for h in hedges:
        signed_mxn = (
            -h.notional_mxn
            if h.direction == "SELL_MXN_BUY_USD"
            else h.notional_mxn
        )
        rows.append(
            {
                "hedge_id": h.hedge_id,
                "instrument": h.instrument,
                "direction": h.direction,
                "notional_mxn": h.notional_mxn,
                "value_date": h.value_date,
                "status": h.status,
                "bucket": h.value_date.strftime("%Y-%m"),
                "signed_mxn": signed_mxn,
            }
        )
    return pd.DataFrame(rows)
