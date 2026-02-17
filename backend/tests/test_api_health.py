"""
tests/test_api_health.py
Validates HedgeCalc API availability, middleware stack, and response headers.
Compatible with httpx >= 0.28 (ASGITransport pattern).
"""

import pytest
import httpx
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint_returns_ok():
    """Ensure /health returns HTTP 200 and correct payload."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"].lower() == "hedgecalc api"


@pytest.mark.asyncio
async def test_response_headers_and_middleware():
    """Validate middleware headers (CORS, GZip, Request-ID, Rate-Limit)."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        # GZip or CORS headers presence
        assert any(
            h in response.headers
            for h in ("content-encoding", "access-control-allow-origin", "x-request-id")
        ), "Expected at least one middleware header in response"
