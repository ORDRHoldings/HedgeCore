"""
IBKR Gateway integration routes -- /api/v1/ibkr

Endpoints:
  GET  /v1/ibkr/status   -> connection status + account info
  POST /v1/ibkr/connect  -> attempt to connect to IB Gateway
  POST /v1/ibkr/execute  -> submit FX orders via ib_insync

All endpoints require JWT authentication.
IBKR_ENABLED must be True in config for execute to work.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/v1/ibkr", tags=["v1-ibkr"])
_log = logging.getLogger(__name__)

UTC = UTC

# ---------------------------------------------------------------------------
# Shared IBKR provider singleton (lazy)
# ---------------------------------------------------------------------------
_ibkr_provider = None


def _load_ib_insync():
    """Load ib_insync module via the provider's lazy loader. Patchable for tests."""
    from app.services.market_data.ibkr_provider import _ensure_ib_insync
    return _ensure_ib_insync()


def _get_provider():
    """Lazy-init the IBKR provider singleton."""
    global _ibkr_provider
    if _ibkr_provider is not None:
        return _ibkr_provider
    try:
        from app.services.market_data.ibkr_provider import IBKRProvider
        _ibkr_provider = IBKRProvider(
            host=settings.IBKR_HOST,
            port=settings.IBKR_PORT,
            client_id=settings.IBKR_CLIENT_ID,
        )
        return _ibkr_provider
    except Exception as exc:
        _log.warning("IBKR provider init failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class IBKRStatusResponse(BaseModel):
    connected: bool
    enabled: bool
    host: str
    port: int
    client_id: int
    error: str | None = None


class IBKRConnectResponse(BaseModel):
    connected: bool
    message: str


class IBKROrderRequest(BaseModel):
    currency_pair: str = Field(..., description="e.g. USDMXN")
    action: str = Field(..., description="BUY or SELL")
    quantity: float = Field(..., gt=0)
    order_type: str = Field(default="MKT", description="MKT or LMT")
    limit_price: float | None = None


class IBKRExecuteRequest(BaseModel):
    proposal_id: str
    orders: list[IBKROrderRequest]


class IBKRFillResult(BaseModel):
    currency_pair: str
    action: str
    fill_price: float
    fill_quantity: float
    status: str
    exec_id: str | None = None
    error: str | None = None


class IBKRExecuteResponse(BaseModel):
    success: bool
    proposal_id: str
    fills: list[IBKRFillResult]
    total_notional: float
    weighted_avg_price: float
    message: str


# ---------------------------------------------------------------------------
# GET /v1/ibkr/status
# ---------------------------------------------------------------------------

@router.get("/status", response_model=IBKRStatusResponse)
async def ibkr_status(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Check IBKR Gateway connection status."""
    provider = _get_provider()
    connected = False
    error = None

    if not settings.IBKR_ENABLED:
        error = "IBKR integration is disabled in server configuration"
    elif provider is None:
        error = "ib_insync not installed or provider init failed"
    else:
        try:
            connected = provider.is_connected
        except Exception as exc:
            error = str(exc)

    return IBKRStatusResponse(
        connected=connected,
        enabled=settings.IBKR_ENABLED,
        host=settings.IBKR_HOST,
        port=settings.IBKR_PORT,
        client_id=settings.IBKR_CLIENT_ID,
        error=error,
    )


# ---------------------------------------------------------------------------
# POST /v1/ibkr/connect
# ---------------------------------------------------------------------------

@router.post("/connect", response_model=IBKRConnectResponse)
async def ibkr_connect(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Attempt to connect to IBKR Gateway."""
    if not settings.IBKR_ENABLED:
        raise HTTPException(status_code=503, detail="IBKR integration is disabled")

    provider = _get_provider()
    if provider is None:
        raise HTTPException(status_code=503, detail="IBKR provider unavailable (ib_insync not installed)")

    try:
        await provider.connect()
        return IBKRConnectResponse(
            connected=provider.is_connected,
            message="Connected to IBKR Gateway" if provider.is_connected else "Connection attempt completed but not connected",
        )
    except Exception as exc:
        _log.warning("IBKR connect failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"IBKR Gateway connection failed: {exc}")


# ---------------------------------------------------------------------------
# POST /v1/ibkr/execute
# ---------------------------------------------------------------------------

@router.post("/execute", response_model=IBKRExecuteResponse)
async def ibkr_execute(
    request: Request,
    body: IBKRExecuteRequest,
    current_user: User = Depends(get_current_user),
):
    """Submit FX orders to IBKR and return fill results.

    Each order is placed as a market order on the IDEALPRO exchange.
    Results are collected after a brief wait for fills.
    """
    if not settings.IBKR_ENABLED:
        raise HTTPException(status_code=503, detail="IBKR integration is disabled")

    provider = _get_provider()
    if provider is None:
        raise HTTPException(status_code=503, detail="IBKR provider unavailable")

    # Ensure connected
    if not provider.is_connected:
        try:
            await provider.connect()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Cannot connect to IBKR Gateway: {exc}")

    if not provider.is_connected:
        raise HTTPException(status_code=502, detail="IBKR Gateway not connected after connect attempt")

    try:
        ib_mod = _load_ib_insync()
    except ImportError:
        raise HTTPException(status_code=503, detail="ib_insync library not available")

    ib = provider._ib
    fills: list[IBKRFillResult] = []

    for order_req in body.orders:
        try:
            # Build forex contract
            pair = order_req.currency_pair.upper().replace("/", "")
            contract = ib_mod.Forex(pair[:3] + pair[3:])
            await ib.qualifyContractsAsync(contract)

            # Build order
            if order_req.order_type == "LMT" and order_req.limit_price:
                order = ib_mod.LimitOrder(
                    action=order_req.action.upper(),
                    totalQuantity=order_req.quantity,
                    lmtPrice=order_req.limit_price,
                )
            else:
                order = ib_mod.MarketOrder(
                    action=order_req.action.upper(),
                    totalQuantity=order_req.quantity,
                )

            # Place order
            trade = ib.placeOrder(contract, order)
            _log.info(
                "IBKR order placed: %s %s %s qty=%s proposal=%s",
                order_req.action, pair, order_req.order_type,
                order_req.quantity, body.proposal_id,
            )

            # Wait for fill (up to 10 seconds for market orders)
            timeout = 10.0
            elapsed = 0.0
            while elapsed < timeout and trade.orderStatus.status not in ("Filled", "Cancelled", "ApiCancelled"):
                await asyncio.sleep(0.5)
                elapsed += 0.5

            status = trade.orderStatus.status
            avg_fill = trade.orderStatus.avgFillPrice or 0.0
            filled_qty = trade.orderStatus.filled or 0.0
            exec_id = None
            if trade.fills:
                exec_id = trade.fills[0].execution.execId

            fills.append(IBKRFillResult(
                currency_pair=order_req.currency_pair,
                action=order_req.action,
                fill_price=avg_fill,
                fill_quantity=filled_qty,
                status=status,
                exec_id=exec_id,
            ))

        except Exception as exc:
            _log.warning("IBKR order failed for %s: %s", order_req.currency_pair, exc)
            fills.append(IBKRFillResult(
                currency_pair=order_req.currency_pair,
                action=order_req.action,
                fill_price=0.0,
                fill_quantity=0.0,
                status="Error",
                error=str(exc),
            ))

    # Compute aggregates
    total_notional = sum(f.fill_quantity * f.fill_price for f in fills if f.fill_price > 0)
    total_filled_qty = sum(f.fill_quantity for f in fills if f.fill_price > 0)
    weighted_avg = (total_notional / total_filled_qty) if total_filled_qty > 0 else 0.0

    all_filled = all(f.status == "Filled" for f in fills)
    any_error = any(f.status == "Error" for f in fills)

    if all_filled:
        message = f"All {len(fills)} order(s) filled successfully"
    elif any_error:
        message = f"Some orders failed. {sum(1 for f in fills if f.status == 'Filled')}/{len(fills)} filled."
    else:
        message = f"Orders submitted. {sum(1 for f in fills if f.status == 'Filled')}/{len(fills)} filled, others pending."

    return IBKRExecuteResponse(
        success=all_filled,
        proposal_id=body.proposal_id,
        fills=fills,
        total_notional=total_notional,
        weighted_avg_price=weighted_avg,
        message=message,
    )
