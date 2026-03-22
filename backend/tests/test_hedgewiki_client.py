"""
Tests for HedgeWikiClient — async HTTP client with circuit breaker and TTL cache.

Covers:
  1. Circuit breaker open/close/reset logic
  2. TTL cache hit/miss/expiry with different TTLs
  3. HTTP request success/failure/timeout handling
  4. All compute methods (effectiveness, dv01, scenario)
  5. All knowledge methods (formulas, formula, context, presets, preset)
  6. Lifecycle (close, is_available)
  7. End-to-end workflow: request -> cache -> circuit breaker interactions
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.hedgewiki_client import HedgeWikiClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client() -> HedgeWikiClient:
    """Fresh HedgeWikiClient with short TTLs for test speed."""
    return HedgeWikiClient(
        base_url="https://hedgewiki.test",
        api_key="test-key",
        timeout=5.0,
        compute_cache_ttl=10.0,
        knowledge_cache_ttl=60.0,
    )


@pytest.fixture
def mock_httpx_client():
    """Patch httpx.AsyncClient so no real HTTP occurs."""
    mock = AsyncMock(spec=httpx.AsyncClient)
    mock.is_closed = False
    return mock


def _make_response(json_data: dict | list, status_code: int = 200) -> MagicMock:
    """Build a mock httpx.Response."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data
    if status_code >= 400:
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            message=f"{status_code} error",
            request=MagicMock(),
            response=resp,
        )
    else:
        resp.raise_for_status.return_value = None
    return resp


# ===================================================================
# 1. Circuit Breaker Tests
# ===================================================================

class TestCircuitBreaker:

    def test_initially_not_open(self, client: HedgeWikiClient):
        assert client._circuit_is_open() is False
        assert client._failures == 0

    def test_opens_after_three_failures(self, client: HedgeWikiClient):
        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 1000.0
            client._record_failure()
            client._record_failure()
            assert client._circuit_is_open() is False
            client._record_failure()
            assert client._failures == 3
            assert client._circuit_open_until == 1000.0 + 60.0

    def test_blocks_requests_while_open(self, client: HedgeWikiClient):
        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 1000.0
            for _ in range(3):
                client._record_failure()
            # Still within cooldown
            mock_time.monotonic.return_value = 1050.0
            assert client._circuit_is_open() is True

    def test_resets_after_cooldown(self, client: HedgeWikiClient):
        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 1000.0
            for _ in range(3):
                client._record_failure()
            # After cooldown (60s)
            mock_time.monotonic.return_value = 1061.0
            assert client._circuit_is_open() is False
            assert client._failures == 0

    def test_resets_on_success(self, client: HedgeWikiClient):
        client._failures = 2
        client._record_success()
        assert client._failures == 0


# ===================================================================
# 2. TTL Cache Tests
# ===================================================================

class TestTTLCache:

    def test_cache_hit(self, client: HedgeWikiClient):
        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 100.0
            client._cache_set("key", {"data": 1}, ttl=60.0)
            mock_time.monotonic.return_value = 150.0
            assert client._cache_get("key") == {"data": 1}

    def test_cache_miss(self, client: HedgeWikiClient):
        assert client._cache_get("nonexistent") is None

    def test_cache_expires(self, client: HedgeWikiClient):
        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 100.0
            client._cache_set("key", {"data": 1}, ttl=10.0)
            mock_time.monotonic.return_value = 111.0
            assert client._cache_get("key") is None
            # Entry should be removed
            assert "key" not in client._cache

    def test_different_ttls(self, client: HedgeWikiClient):
        """Compute TTL (10s) expires before knowledge TTL (60s)."""
        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 100.0
            client._cache_set("compute_key", "c", ttl=client._compute_ttl)
            client._cache_set("knowledge_key", "k", ttl=client._knowledge_ttl)

            # At t=111 compute (10s ttl) expired, knowledge (60s ttl) still alive
            mock_time.monotonic.return_value = 111.0
            assert client._cache_get("compute_key") is None
            assert client._cache_get("knowledge_key") == "k"


# ===================================================================
# 3. HTTP Client / _request Tests
# ===================================================================

class TestHTTPRequest:

    async def test_successful_request(self, client: HedgeWikiClient, mock_httpx_client):
        payload = {"result": "ok"}
        mock_httpx_client.request = AsyncMock(return_value=_make_response(payload))
        client._client = mock_httpx_client

        result = await client._request("GET", "/api/v1/test")
        assert result == payload
        assert client._failures == 0

    async def test_http_error_returns_none(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.request = AsyncMock(return_value=_make_response({}, 500))
        client._client = mock_httpx_client

        result = await client._request("GET", "/api/v1/test")
        assert result is None
        assert client._failures == 1

    async def test_connection_error_returns_none(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.request = AsyncMock(side_effect=httpx.ConnectError("conn refused"))
        client._client = mock_httpx_client

        result = await client._request("GET", "/api/v1/test")
        assert result is None
        assert client._failures == 1

    async def test_timeout_returns_none(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.request = AsyncMock(
            side_effect=httpx.ReadTimeout("read timed out"),
        )
        client._client = mock_httpx_client

        result = await client._request("GET", "/api/v1/test")
        assert result is None
        assert client._failures == 1

    async def test_circuit_open_skips_request(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.request = AsyncMock(return_value=_make_response({"ok": 1}))
        client._client = mock_httpx_client

        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 1000.0
            for _ in range(3):
                client._record_failure()
            mock_time.monotonic.return_value = 1030.0

            result = await client._request("GET", "/api/v1/test")
            assert result is None
            mock_httpx_client.request.assert_not_called()


# ===================================================================
# 4. Compute Method Tests
# ===================================================================

class TestComputeMethods:

    async def test_compute_effectiveness_payload(self, client: HedgeWikiClient, mock_httpx_client):
        periods = [{"hedgeGain": 100, "hedgedItemLoss": -95}]
        config = {"method": "dollar_offset"}
        expected_body = {"periods": periods, "config": config}

        mock_httpx_client.request = AsyncMock(return_value=_make_response({"ratio": 1.05}))
        client._client = mock_httpx_client

        result = await client.compute_effectiveness(periods, config)
        assert result == {"ratio": 1.05}
        call_kwargs = mock_httpx_client.request.call_args
        assert call_kwargs.args == ("POST", "/api/v1/compute/effectiveness")
        assert call_kwargs.kwargs["json"] == expected_body

    async def test_compute_effectiveness_no_config(self, client: HedgeWikiClient, mock_httpx_client):
        periods = [{"hedgeGain": 50, "hedgedItemLoss": -48}]

        mock_httpx_client.request = AsyncMock(return_value=_make_response({"ratio": 1.04}))
        client._client = mock_httpx_client

        await client.compute_effectiveness(periods)
        call_kwargs = mock_httpx_client.request.call_args
        assert "config" not in call_kwargs.kwargs["json"]

    async def test_compute_dv01_camelcase_fields(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.request = AsyncMock(return_value=_make_response({"dv01Ratio": 0.98}))
        client._client = mock_httpx_client

        result = await client.compute_dv01_analysis(
            hedged_pv01=120.0,
            instrument_pv01=118.0,
            notional_hedged=1_000_000.0,
            notional_instrument=1_000_000.0,
        )
        assert result == {"dv01Ratio": 0.98}
        sent_json = mock_httpx_client.request.call_args.kwargs["json"]
        assert sent_json == {
            "hedgedItemPV01": 120.0,
            "instrumentPV01": 118.0,
            "notionalHedged": 1_000_000.0,
            "notionalInstrument": 1_000_000.0,
        }

    async def test_compute_scenario_stress_payload(self, client: HedgeWikiClient, mock_httpx_client):
        positions = [{"notional": 5_000_000, "currency": "EUR"}]
        mock_httpx_client.request = AsyncMock(return_value=_make_response({"pnl": -25_000}))
        client._client = mock_httpx_client

        result = await client.compute_scenario_stress("crisis_2008", positions, spot_rate=1.12)
        assert result == {"pnl": -25_000}
        sent_json = mock_httpx_client.request.call_args.kwargs["json"]
        assert sent_json == {
            "scenarioId": "crisis_2008",
            "positions": positions,
            "spotRate": 1.12,
        }


# ===================================================================
# 5. Knowledge Method Tests
# ===================================================================

class TestKnowledgeMethods:

    async def test_get_formulas_caches_and_extracts(self, client: HedgeWikiClient, mock_httpx_client):
        formulas_list = [{"slug": "dollar-offset", "name": "Dollar Offset"}]
        mock_httpx_client.request = AsyncMock(
            return_value=_make_response({"formulas": formulas_list}),
        )
        client._client = mock_httpx_client

        result = await client.get_formulas()
        assert result == formulas_list

        # Second call should hit cache
        mock_httpx_client.request.reset_mock()
        result2 = await client.get_formulas()
        assert result2 == formulas_list
        mock_httpx_client.request.assert_not_called()

    async def test_get_formulas_empty_on_failure(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.request = AsyncMock(return_value=_make_response({}, 500))
        client._client = mock_httpx_client

        result = await client.get_formulas()
        assert result == []

    async def test_get_formula_caches_by_slug(self, client: HedgeWikiClient, mock_httpx_client):
        formula = {"slug": "dollar-offset", "latex": "r = dH / dI"}
        mock_httpx_client.request = AsyncMock(return_value=_make_response(formula))
        client._client = mock_httpx_client

        result = await client.get_formula("dollar-offset")
        assert result == formula

        mock_httpx_client.request.reset_mock()
        result2 = await client.get_formula("dollar-offset")
        assert result2 == formula
        mock_httpx_client.request.assert_not_called()

    async def test_get_knowledge_context_caches_by_slug(self, client: HedgeWikiClient, mock_httpx_client):
        context = {"slug": "basis-risk", "definition": "Imperfect hedge correlation"}
        mock_httpx_client.request = AsyncMock(return_value=_make_response(context))
        client._client = mock_httpx_client

        result = await client.get_knowledge_context("basis-risk")
        assert result == context

        mock_httpx_client.request.reset_mock()
        result2 = await client.get_knowledge_context("basis-risk")
        assert result2 == context
        mock_httpx_client.request.assert_not_called()

    async def test_get_policy_presets_caches_and_extracts(self, client: HedgeWikiClient, mock_httpx_client):
        presets_list = [{"slug": "conservative", "maxRatio": 1.5}]
        mock_httpx_client.request = AsyncMock(
            return_value=_make_response({"presets": presets_list}),
        )
        client._client = mock_httpx_client

        result = await client.get_policy_presets()
        assert result == presets_list

        mock_httpx_client.request.reset_mock()
        result2 = await client.get_policy_presets()
        assert result2 == presets_list
        mock_httpx_client.request.assert_not_called()

    async def test_get_policy_preset_no_cache(self, client: HedgeWikiClient, mock_httpx_client):
        preset = {"slug": "aggressive", "maxRatio": 3.0}
        mock_httpx_client.request = AsyncMock(return_value=_make_response(preset))
        client._client = mock_httpx_client

        result = await client.get_policy_preset("aggressive")
        assert result == preset

        # Second call should NOT hit cache (direct passthrough)
        result2 = await client.get_policy_preset("aggressive")
        assert result2 == preset
        assert mock_httpx_client.request.call_count == 2


# ===================================================================
# 6. Lifecycle Tests
# ===================================================================

class TestLifecycle:

    async def test_close_closes_httpx_client(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.aclose = AsyncMock()
        client._client = mock_httpx_client

        await client.close()
        mock_httpx_client.aclose.assert_called_once()

    async def test_close_noop_when_no_client(self, client: HedgeWikiClient):
        # Should not raise
        await client.close()

    async def test_close_noop_when_already_closed(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.is_closed = True
        mock_httpx_client.aclose = AsyncMock()
        client._client = mock_httpx_client

        await client.close()
        mock_httpx_client.aclose.assert_not_called()

    def test_is_available_reflects_circuit_state(self, client: HedgeWikiClient):
        assert client.is_available is True

        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 1000.0
            for _ in range(3):
                client._record_failure()
            mock_time.monotonic.return_value = 1030.0
            assert client.is_available is False

            mock_time.monotonic.return_value = 1061.0
            assert client.is_available is True


# ===================================================================
# 7. Workflow / Integration Tests
# ===================================================================

class TestWorkflow:
    """End-to-end flow: request -> cache -> circuit breaker interactions."""

    async def test_first_call_miss_second_call_hit(self, client: HedgeWikiClient, mock_httpx_client):
        formula = {"slug": "var", "name": "Value at Risk"}
        mock_httpx_client.request = AsyncMock(return_value=_make_response(formula))
        client._client = mock_httpx_client

        # First call: cache miss -> HTTP -> cache set
        r1 = await client.get_formula("var")
        assert r1 == formula
        assert mock_httpx_client.request.call_count == 1

        # Second call: cache hit -> no HTTP
        r2 = await client.get_formula("var")
        assert r2 == formula
        assert mock_httpx_client.request.call_count == 1

    async def test_cache_expiry_triggers_new_request(self, client: HedgeWikiClient, mock_httpx_client):
        context = {"slug": "cva", "definition": "Credit Valuation Adjustment"}
        mock_httpx_client.request = AsyncMock(return_value=_make_response(context))
        client._client = mock_httpx_client

        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 100.0
            r1 = await client.get_knowledge_context("cva")
            assert r1 == context
            assert mock_httpx_client.request.call_count == 1

            # After knowledge TTL (60s) expires
            mock_time.monotonic.return_value = 161.0
            r2 = await client.get_knowledge_context("cva")
            assert r2 == context
            assert mock_httpx_client.request.call_count == 2

    async def test_failure_records_and_returns_none(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.request = AsyncMock(return_value=_make_response({}, 503))
        client._client = mock_httpx_client

        result = await client.compute_effectiveness([{"hedgeGain": 10}])
        assert result is None
        assert client._failures == 1

    async def test_three_failures_open_circuit_then_skip(self, client: HedgeWikiClient, mock_httpx_client):
        mock_httpx_client.request = AsyncMock(return_value=_make_response({}, 500))
        client._client = mock_httpx_client

        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 1000.0

            # 3 failures
            for _ in range(3):
                await client._request("GET", "/api/v1/test")
            assert client._failures == 3

            # Circuit is open - should skip HTTP
            mock_httpx_client.request.reset_mock()
            mock_time.monotonic.return_value = 1030.0
            result = await client._request("GET", "/api/v1/test")
            assert result is None
            mock_httpx_client.request.assert_not_called()

    async def test_circuit_resets_on_success_after_cooldown(self, client: HedgeWikiClient, mock_httpx_client):
        with patch("app.services.hedgewiki_client.time") as mock_time:
            mock_time.monotonic.return_value = 1000.0

            # Open the circuit
            mock_httpx_client.request = AsyncMock(return_value=_make_response({}, 500))
            client._client = mock_httpx_client
            for _ in range(3):
                await client._request("GET", "/api/v1/test")
            assert client._failures == 3

            # After cooldown, allow request and succeed
            mock_time.monotonic.return_value = 1061.0
            success_resp = _make_response({"recovered": True})
            mock_httpx_client.request = AsyncMock(return_value=success_resp)

            result = await client._request("GET", "/api/v1/test")
            assert result == {"recovered": True}
            assert client._failures == 0

    async def test_lazy_client_creation(self, client: HedgeWikiClient):
        """_get_client creates httpx.AsyncClient lazily on first use."""
        assert client._client is None

        mock_instance = AsyncMock()
        mock_instance.is_closed = False

        with patch("app.services.hedgewiki_client.httpx.AsyncClient", return_value=mock_instance) as mock_cls:
            result = await client._get_client()
            assert result is mock_instance
            mock_cls.assert_called_once()

            # Second call reuses the same client
            result2 = await client._get_client()
            assert result2 is mock_instance
            assert mock_cls.call_count == 1

    async def test_client_recreated_if_closed(self, client: HedgeWikiClient):
        """_get_client recreates the client if the existing one is closed."""
        closed_client = AsyncMock()
        closed_client.is_closed = True
        client._client = closed_client

        new_client = AsyncMock()
        new_client.is_closed = False

        with patch("app.services.hedgewiki_client.httpx.AsyncClient", return_value=new_client) as mock_cls:
            result = await client._get_client()
            assert result is new_client
            mock_cls.assert_called_once()

    async def test_api_key_header_included(self, client: HedgeWikiClient):
        """When api_key is set, X-HedgeWiki-API-Key header is passed."""
        mock_instance = AsyncMock()
        mock_instance.is_closed = False

        with patch("app.services.hedgewiki_client.httpx.AsyncClient", return_value=mock_instance) as mock_cls:
            await client._get_client()
            call_kwargs = mock_cls.call_args.kwargs
            assert call_kwargs["headers"] == {"X-HedgeWiki-API-Key": "test-key"}

    async def test_no_api_key_no_header(self):
        """When api_key is empty, headers dict is empty."""
        c = HedgeWikiClient(base_url="https://test.local", api_key="")
        mock_instance = AsyncMock()
        mock_instance.is_closed = False

        with patch("app.services.hedgewiki_client.httpx.AsyncClient", return_value=mock_instance) as mock_cls:
            await c._get_client()
            call_kwargs = mock_cls.call_args.kwargs
            assert call_kwargs["headers"] == {}
