"""
HedgeWiki Integration Client — Async HTTP client for compute and knowledge APIs.

Features:
- Async HTTP with httpx + connection pooling
- TTL-based caching (5min compute, 30min knowledge)
- Circuit breaker (3 failures -> 60s cooldown)
- Graceful fallback (returns None on failure -- caller decides)
"""

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class HedgeWikiClient:
    """Async client for HedgeWiki compute and knowledge APIs."""

    def __init__(
        self,
        base_url: str = "https://hedgewiki.onrender.com",
        api_key: str = "",
        timeout: float = 15.0,
        compute_cache_ttl: float = 300.0,    # 5 min
        knowledge_cache_ttl: float = 1800.0,  # 30 min
    ):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._compute_ttl = compute_cache_ttl
        self._knowledge_ttl = knowledge_cache_ttl

        # Circuit breaker state
        self._failures = 0
        self._circuit_open_until = 0.0
        self._max_failures = 3
        self._cooldown = 60.0

        # TTL cache: key -> (value, expires_at)
        self._cache: dict[str, tuple[Any, float]] = {}

        # Shared httpx client (created lazily)
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=self._timeout,
                headers={"X-HedgeWiki-API-Key": self._api_key} if self._api_key else {},
                limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            )
        return self._client

    def _circuit_is_open(self) -> bool:
        if self._failures >= self._max_failures:
            if time.monotonic() < self._circuit_open_until:
                return True
            # Reset after cooldown
            self._failures = 0
        return False

    def _record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self._max_failures:
            self._circuit_open_until = time.monotonic() + self._cooldown
            logger.warning(
                "HedgeWiki circuit breaker OPEN -- %ss cooldown",
                self._cooldown,
            )

    def _record_success(self) -> None:
        self._failures = 0

    def _cache_get(self, key: str) -> Any | None:
        if key in self._cache:
            value, expires = self._cache[key]
            if time.monotonic() < expires:
                return value
            del self._cache[key]
        return None

    def _cache_set(self, key: str, value: Any, ttl: float) -> None:
        self._cache[key] = (value, time.monotonic() + ttl)

    async def _request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> dict | list | None:
        """Make HTTP request with circuit breaker. Returns None on any failure."""
        if self._circuit_is_open():
            logger.debug("HedgeWiki circuit breaker is open -- skipping request")
            return None
        try:
            client = await self._get_client()
            resp = await client.request(method, path, **kwargs)
            resp.raise_for_status()
            self._record_success()
            return resp.json()
        except Exception as e:
            self._record_failure()
            logger.warning("HedgeWiki request failed: %s %s: %s", method, path, e)
            return None

    # -- Compute endpoints -------------------------------------------------

    async def compute_effectiveness(
        self,
        periods: list[dict],
        config: dict | None = None,
    ) -> dict | None:
        """POST /api/v1/compute/effectiveness"""
        body: dict[str, Any] = {"periods": periods}
        if config:
            body["config"] = config
        return await self._request("POST", "/api/v1/compute/effectiveness", json=body)

    async def compute_dv01_analysis(
        self,
        hedged_pv01: float,
        instrument_pv01: float,
        notional_hedged: float,
        notional_instrument: float,
    ) -> dict | None:
        """POST /api/v1/compute/dv01-analysis"""
        return await self._request(
            "POST",
            "/api/v1/compute/dv01-analysis",
            json={
                "hedgedItemPV01": hedged_pv01,
                "instrumentPV01": instrument_pv01,
                "notionalHedged": notional_hedged,
                "notionalInstrument": notional_instrument,
            },
        )

    async def compute_scenario_stress(
        self,
        scenario_id: str,
        positions: list[dict],
        spot_rate: float = 1.0,
    ) -> dict | None:
        """POST /api/v1/compute/scenario-stress"""
        return await self._request(
            "POST",
            "/api/v1/compute/scenario-stress",
            json={
                "scenarioId": scenario_id,
                "positions": positions,
                "spotRate": spot_rate,
            },
        )

    # -- Knowledge endpoints -----------------------------------------------

    async def get_formulas(self) -> list[dict]:
        """GET /api/v1/compute/formulas -- cached 30min."""
        cached = self._cache_get("formulas")
        if cached is not None:
            return cached
        result = await self._request("GET", "/api/v1/compute/formulas")
        if result and isinstance(result, dict) and "formulas" in result:
            self._cache_set("formulas", result["formulas"], self._knowledge_ttl)
            return result["formulas"]
        return []

    async def get_formula(self, slug: str) -> dict | None:
        """GET /api/v1/compute/formulas/:slug"""
        key = f"formula:{slug}"
        cached = self._cache_get(key)
        if cached is not None:
            return cached
        result = await self._request("GET", f"/api/v1/compute/formulas/{slug}")
        if result:
            self._cache_set(key, result, self._knowledge_ttl)
        return result

    async def get_knowledge_context(self, slug: str) -> dict | None:
        """GET /api/v1/knowledge/context/:slug -- cached 30min."""
        key = f"knowledge:{slug}"
        cached = self._cache_get(key)
        if cached is not None:
            return cached
        result = await self._request("GET", f"/api/v1/knowledge/context/{slug}")
        if result:
            self._cache_set(key, result, self._knowledge_ttl)
        return result

    async def get_policy_presets(self) -> list[dict]:
        """GET /api/v1/knowledge/policy-presets -- cached 30min."""
        cached = self._cache_get("policy_presets")
        if cached is not None:
            return cached
        result = await self._request("GET", "/api/v1/knowledge/policy-presets")
        if result and isinstance(result, dict) and "presets" in result:
            self._cache_set("policy_presets", result["presets"], self._knowledge_ttl)
            return result["presets"]
        return []

    async def get_policy_preset(self, slug: str) -> dict | None:
        """GET /api/v1/knowledge/policy-presets/:slug"""
        return await self._request("GET", f"/api/v1/knowledge/policy-presets/{slug}")

    # -- Lifecycle ---------------------------------------------------------

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    @property
    def is_available(self) -> bool:
        return not self._circuit_is_open()
