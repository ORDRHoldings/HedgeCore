"""Multi-currency normalizer: sign convention and bucket assignment for any pair.

Extends the MXN-specific normalizer (normalizer.py is FROZEN) to support
any currency pair using MultiCurrencyHedgeRow.

Sign convention (cashflow view, pair-agnostic):
  Trades:  AR => +local,  AP => -local
  Hedges:  SELL_{LOCAL}_BUY_USD => -local,  BUY_{LOCAL}_SELL_USD => +local
"""
from __future__ import annotations

import pandas as pd

from app.schemas_v1.hedges import MultiCurrencyHedgeRow
from app.schemas_v1.trades import TradeRow


def normalize_trades_multi(trades: list[TradeRow]) -> pd.DataFrame:
    """Normalize trades to a generic signed_local column.

    Same logic as normalize_trades() but uses `signed_local` column name
    so kernel_multi.py works with any currency.
    """
    rows = []
    for t in trades:
        signed_local = t.amount if t.type == "AR" else -t.amount
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
                "signed_local": signed_local,
            }
        )
    return pd.DataFrame(rows)


def normalize_hedges_multi(hedges: list[MultiCurrencyHedgeRow]) -> pd.DataFrame:
    """Normalize multi-currency hedges to signed_local column.

    Direction convention:
      SELL_{LOCAL}_BUY_USD  → negative (hedge against payable exposure)
      BUY_{LOCAL}_SELL_USD  → positive
    """
    if not hedges:
        return pd.DataFrame(
            columns=[
                "hedge_id",
                "pair",
                "instrument",
                "direction",
                "notional_local",
                "value_date",
                "status",
                "bucket",
                "signed_local",
            ]
        )
    rows = []
    for h in hedges:
        local_ccy = h.pair[3:] if h.pair.startswith("USD") else h.pair[:3]
        sell_direction = f"SELL_{local_ccy}_BUY_USD"
        signed_local = -h.notional_local if h.direction == sell_direction else h.notional_local
        rows.append(
            {
                "hedge_id": h.hedge_id,
                "pair": h.pair,
                "instrument": h.instrument,
                "direction": h.direction,
                "notional_local": h.notional_local,
                "value_date": h.value_date,
                "status": h.status,
                "bucket": h.value_date.strftime("%Y-%m"),
                "signed_local": signed_local,
            }
        )
    return pd.DataFrame(rows)
