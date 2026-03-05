"""
app/schemas_v1/extended_response.py
Extended calculation API response schema.

API-01: Wraps base CalculateResponse with outputs from all engine_v1
extended modules (factor covariance, margin, liquidity, NAV attribution,
TCA, rolls, capital adequacy, risk allocation, waterfall).

The base /v1/calculate endpoint is UNCHANGED — this schema is used only
by the new /v1/calculate/extended endpoint.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ExtendedCalculateResponse(BaseModel):
    """Full engine_v1 output: kernel result + all extended modules."""

    base: Any
    """Identical to the standard CalculateResponse from /v1/calculate."""

    extended: dict[str, Any | None] = {}
    """Per-module outputs. Key = module name, value = result or None if module failed.

    Expected keys (None when module could not run):
      - factor_covariance: FactorCovarianceResult
      - margin:            MarginSummary
      - liquidity:         LiquidityResult
      - nav_attribution:   NavAttributionResult
      - tca:               TransactionCostResult
      - rolls:             dict (FX roll schedule)
      - capital:           dict (capital adequacy charges)
      - waterfall:         WaterfallResult
    """

    class Config:
        json_schema_extra = {
            "description": (
                "Full engine_v1 output including kernel result + all extended modules. "
                "Use /v1/calculate for the standard (unextended) response."
            )
        }
