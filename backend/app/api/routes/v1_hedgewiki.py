"""
v1_hedgewiki.py -- HedgeWiki knowledge proxy endpoints.

Proxies HedgeWiki API calls through TreasuryFX backend,
adding caching and fallback behavior.
"""

import logging

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/hedgewiki", tags=["hedgewiki"])


def _get_client(request: Request):
    """Extract HedgeWikiClient from app state or raise 503."""
    client = getattr(request.app.state, "hedgewiki", None)
    if not client:
        raise HTTPException(503, "HedgeWiki integration not available")
    return client


@router.get("/context/{slug}")
async def get_knowledge_context(slug: str, request: Request):
    """Proxy to HedgeWiki knowledge context API."""
    client = _get_client(request)
    result = await client.get_knowledge_context(slug)
    if result is None:
        raise HTTPException(502, "HedgeWiki service unavailable")
    return result


@router.get("/formulas")
async def get_formulas(request: Request):
    """Proxy to HedgeWiki formulas API."""
    client = _get_client(request)
    formulas = await client.get_formulas()
    return {"formulas": formulas}


@router.get("/formulas/{slug}")
async def get_formula(slug: str, request: Request):
    """Proxy to HedgeWiki single formula API."""
    client = _get_client(request)
    result = await client.get_formula(slug)
    if result is None:
        raise HTTPException(502, "HedgeWiki service unavailable or formula not found")
    return result


@router.get("/policy-presets")
async def get_policy_presets(request: Request):
    """Proxy to HedgeWiki policy presets API."""
    client = _get_client(request)
    presets = await client.get_policy_presets()
    return {"presets": presets}


@router.get("/policy-presets/{slug}")
async def get_policy_preset(slug: str, request: Request):
    """Proxy to HedgeWiki single policy preset API."""
    client = _get_client(request)
    result = await client.get_policy_preset(slug)
    if result is None:
        raise HTTPException(502, "HedgeWiki service unavailable or preset not found")
    return result


@router.post("/compute/effectiveness")
async def compute_effectiveness(request: Request):
    """Proxy to HedgeWiki effectiveness computation."""
    client = _get_client(request)
    body = await request.json()
    result = await client.compute_effectiveness(
        periods=body.get("periods", []),
        config=body.get("config"),
    )
    if result is None:
        raise HTTPException(502, "HedgeWiki compute service unavailable")
    return result


@router.post("/compute/dv01-analysis")
async def compute_dv01(request: Request):
    """Proxy to HedgeWiki DV01 analysis."""
    client = _get_client(request)
    body = await request.json()
    result = await client.compute_dv01_analysis(
        hedged_pv01=body["hedgedItemPV01"],
        instrument_pv01=body["instrumentPV01"],
        notional_hedged=body["notionalHedged"],
        notional_instrument=body["notionalInstrument"],
    )
    if result is None:
        raise HTTPException(502, "HedgeWiki compute service unavailable")
    return result
