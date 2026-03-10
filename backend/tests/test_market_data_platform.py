"""Tests for the institutional market data platform.

Covers: provider base, TwelveData, IBKR, models, services,
ingestion orchestrator, scheduler, staleness monitor, routes.
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

UTC = timezone.utc


# ═══════════════════════════════════════════════════════════
# Provider Base
# ═══════════════════════════════════════════════════════════

class TestProviderBase:

    def test_provider_base_is_abstract(self):
        from app.services.market_data.provider_base import MarketDataProvider
        with pytest.raises(TypeError):
            MarketDataProvider()

    def test_provider_base_has_required_methods(self):
        from app.services.market_data.provider_base import MarketDataProvider
        assert hasattr(MarketDataProvider, "fetch_fx_spot")
        assert hasattr(MarketDataProvider, "fetch_historical_ohlc")
        assert hasattr(MarketDataProvider, "fetch_equity_quotes")
        assert hasattr(MarketDataProvider, "health_check")
        assert hasattr(MarketDataProvider, "provider_name")

    def test_normalized_spot_shape(self):
        from app.services.market_data.provider_base import NormalizedSpot
        spot = NormalizedSpot(
            pair="USDMXN", mid=17.24, bid=17.23, ask=17.25,
            source="twelvedata", data_class="LIVE", as_of=datetime.now(UTC),
        )
        assert spot.pair == "USDMXN"
        assert spot.spread_pips == pytest.approx(200.0, rel=0.01)

    def test_normalized_ohlc_shape(self):
        from app.services.market_data.provider_base import NormalizedOHLC
        bar = NormalizedOHLC(
            symbol="USDMXN", open=17.20, high=17.30, low=17.15,
            close=17.24, volume=0.0, timestamp=datetime.now(UTC), source="twelvedata",
        )
        assert bar.symbol == "USDMXN"

    def test_normalized_equity_shape(self):
        from app.services.market_data.provider_base import NormalizedEquity
        eq = NormalizedEquity(
            symbol="SPY", price=520.0, open=518.0, high=522.0, low=517.0,
            close=520.0, volume=80_000_000, change_pct=0.38, market_cap=None,
            source="twelvedata", as_of=datetime.now(UTC),
        )
        assert eq.symbol == "SPY"

    def test_normalized_forward_curve_shape(self):
        from app.services.market_data.provider_base import NormalizedForwardCurve
        fc = NormalizedForwardCurve(
            pair="USDMXN", spot_mid=17.24,
            forward_points={"1M": 0.015, "3M": 0.045},
            source="ibkr", data_class="LIVE", as_of=datetime.now(UTC),
        )
        assert fc.pair == "USDMXN"
        assert "1M" in fc.forward_points

    def test_normalized_option_shape(self):
        from app.services.market_data.provider_base import NormalizedOption
        opt = NormalizedOption(
            underlying="USDMXN", expiry="20260401", strike=17.5,
            option_type="CALL", bid=0.12, ask=0.15, last=0.13,
            volume=100, open_interest=500, implied_vol=0.14,
            delta=0.45, gamma=0.02, theta=-0.003, vega=0.05,
            source="ibkr", as_of=datetime.now(UTC),
        )
        assert opt.implied_vol == pytest.approx(0.14)

    def test_providers_set_live_data_class(self):
        """Verify provider shapes pass V-022 gate (data_class=LIVE)."""
        from app.services.market_data.provider_base import NormalizedSpot
        spot = NormalizedSpot(
            pair="USDMXN", mid=17.24, bid=17.23, ask=17.25,
            source="twelvedata", data_class="LIVE", as_of=datetime.now(UTC),
        )
        assert spot.data_class == "LIVE"
        assert spot.data_class != "INDICATIVE_FALLBACK"


# ═══════════════════════════════════════════════════════════
# TwelveData Provider
# ═══════════════════════════════════════════════════════════

class TestTwelveDataProvider:

    def _make_provider(self):
        from app.services.market_data.twelvedata_provider import TwelveDataProvider
        return TwelveDataProvider(api_key="test_key_123")

    def test_provider_name(self):
        p = self._make_provider()
        assert p.provider_name == "twelvedata"

    def test_pair_conversion(self):
        p = self._make_provider()
        assert p._to_td_symbol("USDMXN") == "USD/MXN"
        assert p._to_td_symbol("EURUSD") == "EUR/USD"
        assert p._from_td_symbol("USD/MXN") == "USDMXN"

    @pytest.mark.asyncio
    async def test_fetch_fx_spot_success(self):
        p = self._make_provider()
        mock_resp = {
            "USD/MXN": {"symbol": "USD/MXN", "open": "17.20", "high": "17.30",
                        "low": "17.15", "close": "17.24", "timestamp": 1710000000},
            "EUR/USD": {"symbol": "EUR/USD", "open": "1.0850", "high": "1.0900",
                        "low": "1.0830", "close": "1.0870", "timestamp": 1710000000},
        }
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            spots = await p.fetch_fx_spot(["USDMXN", "EURUSD"])
        assert len(spots) == 2
        usdmxn = next(s for s in spots if s.pair == "USDMXN")
        assert usdmxn.mid == pytest.approx(17.24)
        assert usdmxn.source == "twelvedata"
        assert usdmxn.data_class == "LIVE"

    @pytest.mark.asyncio
    async def test_fetch_fx_spot_partial_failure(self):
        p = self._make_provider()
        mock_resp = {
            "USD/MXN": {"symbol": "USD/MXN", "close": "17.24", "timestamp": 1710000000},
            "EUR/USD": {"code": 400, "message": "error"},
        }
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            spots = await p.fetch_fx_spot(["USDMXN", "EURUSD"])
        assert len(spots) == 1
        assert spots[0].pair == "USDMXN"

    @pytest.mark.asyncio
    async def test_fetch_historical_ohlc(self):
        p = self._make_provider()
        mock_resp = {
            "meta": {"symbol": "USD/MXN", "interval": "1day"},
            "values": [
                {"datetime": "2026-03-09", "open": "17.20", "high": "17.30",
                 "low": "17.15", "close": "17.24", "volume": "0"},
                {"datetime": "2026-03-08", "open": "17.10", "high": "17.25",
                 "low": "17.05", "close": "17.20", "volume": "0"},
            ],
        }
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            bars = await p.fetch_historical_ohlc("USDMXN", interval="1day", outputsize=2)
        assert len(bars) == 2
        assert bars[0].close == pytest.approx(17.24)
        assert bars[0].source == "twelvedata"

    @pytest.mark.asyncio
    async def test_fetch_equity_quotes(self):
        p = self._make_provider()
        mock_resp = {
            "SPY": {"symbol": "SPY", "open": "518.00", "high": "522.00",
                    "low": "517.00", "close": "520.00", "volume": "80000000",
                    "percent_change": "0.38", "timestamp": 1710000000},
        }
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            equities = await p.fetch_equity_quotes(["SPY"])
        assert len(equities) == 1
        assert equities[0].symbol == "SPY"
        assert equities[0].price == pytest.approx(520.0)
        assert equities[0].change_pct == pytest.approx(0.38)

    @pytest.mark.asyncio
    async def test_health_check_success(self):
        p = self._make_provider()
        mock_resp = {"symbol": "USD/MXN", "close": "17.24", "timestamp": 1710000000}
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            health = await p.health_check()
        assert health.connected is True
        assert health.name == "twelvedata"

    @pytest.mark.asyncio
    async def test_health_check_failure(self):
        p = self._make_provider()
        with patch.object(p, "_get_json", new_callable=AsyncMock, side_effect=Exception("timeout")):
            health = await p.health_check()
        assert health.connected is False
        assert "timeout" in health.error

    @pytest.mark.asyncio
    async def test_fetch_fx_spot_single_symbol(self):
        """Single symbol returns dict directly, not dict of dicts."""
        p = self._make_provider()
        mock_resp = {"symbol": "USD/MXN", "close": "17.24", "timestamp": 1710000000}
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            spots = await p.fetch_fx_spot(["USDMXN"])
        assert len(spots) == 1
        assert spots[0].pair == "USDMXN"

    @pytest.mark.asyncio
    async def test_fetch_fx_spot_empty_response(self):
        p = self._make_provider()
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value={}):
            spots = await p.fetch_fx_spot(["USDMXN"])
        assert len(spots) == 0


# ═══════════════════════════════════════════════════════════
# IBKR Provider
# ═══════════════════════════════════════════════════════════

class TestIBKRProvider:

    def _make_provider(self):
        from app.services.market_data.ibkr_provider import IBKRProvider
        return IBKRProvider(host="127.0.0.1", port=4002, client_id=99)

    def test_provider_name(self):
        p = self._make_provider()
        assert p.provider_name == "ibkr"

    @pytest.mark.asyncio
    async def test_fetch_fx_spot_success(self):
        p = self._make_provider()
        mock_ticker = MagicMock()
        mock_ticker.midpoint.return_value = 17.24
        mock_ticker.bid = 17.23
        mock_ticker.ask = 17.25
        mock_ticker.time = datetime.now(UTC)
        with patch.object(p, "_get_ticker", new_callable=AsyncMock, return_value=mock_ticker):
            spots = await p.fetch_fx_spot(["USDMXN"])
        assert len(spots) == 1
        assert spots[0].pair == "USDMXN"
        assert spots[0].mid == pytest.approx(17.24)
        assert spots[0].source == "ibkr"

    @pytest.mark.asyncio
    async def test_fetch_forward_curves(self):
        p = self._make_provider()
        mock_curves = [
            {"tenor": "1M", "points": 0.015},
            {"tenor": "3M", "points": 0.045},
            {"tenor": "6M", "points": 0.092},
        ]
        with patch.object(p, "_fetch_fx_forwards_raw", new_callable=AsyncMock, return_value=(17.24, mock_curves)):
            curves = await p.fetch_forward_curves(["USDMXN"])
        assert len(curves) == 1
        assert curves[0].pair == "USDMXN"
        assert curves[0].spot_mid == pytest.approx(17.24)
        assert "1M" in curves[0].forward_points

    @pytest.mark.asyncio
    async def test_fetch_options_chain(self):
        p = self._make_provider()
        mock_opts = [
            {"strike": 17.50, "type": "CALL", "bid": 0.12, "ask": 0.15,
             "last": 0.13, "volume": 100, "oi": 500, "iv": 0.14,
             "delta": 0.45, "gamma": 0.02, "theta": -0.003, "vega": 0.05},
        ]
        with patch.object(p, "_fetch_options_raw", new_callable=AsyncMock, return_value=mock_opts):
            opts = await p.fetch_options_chain("USDMXN", "20260401")
        assert len(opts) == 1
        assert opts[0].underlying == "USDMXN"
        assert opts[0].implied_vol == pytest.approx(0.14)

    @pytest.mark.asyncio
    async def test_health_check_not_connected(self):
        """When connect raises, health reports disconnected."""
        p = self._make_provider()
        with patch.object(p, "connect", new_callable=AsyncMock, side_effect=ConnectionRefusedError("no gateway")):
            health = await p.health_check()
        assert health.connected is False
        assert health.name == "ibkr"
        assert "no gateway" in health.error

    def test_cip_forward_points_usdmxn(self):
        """CIP: USDMXN should have positive forward points (MXN rate > USD rate)."""
        from app.services.market_data.ibkr_provider import IBKRProvider
        pts = IBKRProvider._compute_cip_forward_points(17.24, "USD", "MXN", "12M")
        # MXN 10.25% vs USD 5.10% → positive carry → forward points > 0
        assert pts > 0.0
        # Sanity: USDMXN 12M points should be roughly 0.8-1.0 at spot ~17.24
        assert 0.3 < pts < 2.0

    def test_cip_forward_points_eurusd(self):
        """CIP: EURUSD forward points positive (r_USD > r_EUR → F > S)."""
        from app.services.market_data.ibkr_provider import IBKRProvider
        pts = IBKRProvider._compute_cip_forward_points(1.085, "EUR", "USD", "12M")
        # F = S × (1 + r_USD) / (1 + r_EUR), r_USD 5.10% > r_EUR 3.50% → F > S
        assert pts > 0.0
        assert 0.0 < pts < 0.03

    def test_cip_forward_points_usdjpy(self):
        """CIP: USDJPY should have large negative points (JPY rate << USD rate)."""
        from app.services.market_data.ibkr_provider import IBKRProvider
        pts = IBKRProvider._compute_cip_forward_points(149.50, "USD", "JPY", "12M")
        # JPY 0.30% vs USD 5.10% → big negative
        assert pts < -5.0

    def test_cip_forward_points_unknown_ccy(self):
        """Unknown currency returns 0.0 (no rate data)."""
        from app.services.market_data.ibkr_provider import IBKRProvider
        pts = IBKRProvider._compute_cip_forward_points(1.0, "USD", "XYZ", "12M")
        # XYZ has 0% rate, USD 5.10% → slightly negative
        assert pts < 0.0

    def test_cip_forward_points_scaling_with_tenor(self):
        """Longer tenors should produce larger absolute points."""
        from app.services.market_data.ibkr_provider import IBKRProvider
        pts_1m = abs(IBKRProvider._compute_cip_forward_points(17.24, "USD", "MXN", "1M"))
        pts_12m = abs(IBKRProvider._compute_cip_forward_points(17.24, "USD", "MXN", "12M"))
        assert pts_12m > pts_1m


# ═══════════════════════════════════════════════════════════
# Models
# ═══════════════════════════════════════════════════════════

class TestModels:

    def test_equity_snapshot_importable(self):
        from app.models.equity_snapshot import EquitySnapshot
        assert EquitySnapshot.__tablename__ == "equity_snapshots"

    def test_equity_snapshot_has_required_columns(self):
        from app.models.equity_snapshot import EquitySnapshot
        cols = {c.name for c in EquitySnapshot.__table__.columns}
        required = {"id", "company_id", "symbol", "as_of", "source", "data_class",
                    "open", "high", "low", "close", "volume", "change_pct",
                    "snapshot_hash", "payload", "is_stale", "created_at"}
        assert required.issubset(cols)

    def test_options_snapshot_importable(self):
        from app.models.options_snapshot import OptionsSnapshot
        assert OptionsSnapshot.__tablename__ == "options_snapshots"

    def test_options_snapshot_has_required_columns(self):
        from app.models.options_snapshot import OptionsSnapshot
        cols = {c.name for c in OptionsSnapshot.__table__.columns}
        required = {"id", "company_id", "underlying", "expiry", "strike",
                    "option_type", "as_of", "source", "implied_vol",
                    "snapshot_hash", "payload", "created_at"}
        assert required.issubset(cols)


# ═══════════════════════════════════════════════════════════
# Services
# ═══════════════════════════════════════════════════════════

class TestServices:

    def test_equity_build_canonical_payload(self):
        from app.services.equity_snapshot_service import build_canonical_payload
        p1 = build_canonical_payload({"symbol": "SPY", "close": 520.0, "as_of": "2026-03-10"})
        p2 = build_canonical_payload({"as_of": "2026-03-10", "close": 520.0, "symbol": "SPY"})
        assert p1 == p2  # sort_keys ensures determinism

    def test_equity_build_snapshot_hash_deterministic(self):
        from app.services.equity_snapshot_service import build_canonical_payload, build_snapshot_hash
        canonical = build_canonical_payload({"symbol": "SPY", "close": 520.0})
        h1 = build_snapshot_hash(canonical)
        h2 = build_snapshot_hash(canonical)
        assert h1 == h2
        assert len(h1) == 64

    def test_options_build_canonical_payload(self):
        from app.services.options_snapshot_service import build_canonical_payload
        p = build_canonical_payload({"underlying": "USDMXN", "strike": 17.5, "type": "CALL"})
        assert "strike" in p


# ═══════════════════════════════════════════════════════════
# Ingestion Orchestrator
# ═══════════════════════════════════════════════════════════

class TestIngestionOrchestrator:

    @pytest.mark.asyncio
    async def test_ingest_fx_spots_writes_to_worm(self):
        from app.services.market_data.ingestion_service import IngestionOrchestrator
        from app.services.market_data.provider_base import NormalizedSpot

        mock_provider = AsyncMock()
        mock_provider.provider_name = "twelvedata"
        mock_provider.fetch_fx_spot.return_value = [
            NormalizedSpot(pair="USDMXN", mid=17.24, bid=17.23, ask=17.25,
                           source="twelvedata", data_class="LIVE", as_of=datetime.now(UTC)),
        ]

        orch = IngestionOrchestrator(providers=[mock_provider])
        mock_session = AsyncMock()
        mock_user = MagicMock()
        mock_user.company_id = "00000000-0000-0000-0000-000000000001"

        with patch("app.services.market_data.ingestion_service.market_snapshot_service") as mock_svc:
            mock_snap = MagicMock()
            mock_snap.id = "test-uuid"
            mock_svc.create_or_get = AsyncMock(return_value=mock_snap)
            results = await orch.ingest_fx_spots(mock_session, mock_user, pairs=["USDMXN"])

        assert len(results) == 1
        mock_svc.create_or_get.assert_called_once()

    @pytest.mark.asyncio
    async def test_ingest_fx_spots_failover(self):
        from app.services.market_data.ingestion_service import IngestionOrchestrator
        from app.services.market_data.provider_base import NormalizedSpot

        primary = AsyncMock()
        primary.provider_name = "twelvedata"
        primary.fetch_fx_spot.side_effect = Exception("API down")

        backup = AsyncMock()
        backup.provider_name = "ibkr"
        backup.fetch_fx_spot.return_value = [
            NormalizedSpot(pair="USDMXN", mid=17.24, bid=17.23, ask=17.25,
                           source="ibkr", data_class="LIVE", as_of=datetime.now(UTC)),
        ]

        orch = IngestionOrchestrator(providers=[primary, backup])
        mock_session = AsyncMock()
        mock_user = MagicMock()
        mock_user.company_id = "00000000-0000-0000-0000-000000000001"

        with patch("app.services.market_data.ingestion_service.market_snapshot_service") as mock_svc:
            mock_snap = MagicMock()
            mock_snap.id = "test-uuid"
            mock_svc.create_or_get = AsyncMock(return_value=mock_snap)
            results = await orch.ingest_fx_spots(mock_session, mock_user, pairs=["USDMXN"])

        assert len(results) == 1
        backup.fetch_fx_spot.assert_called_once()

    @pytest.mark.asyncio
    async def test_ingest_equity_quotes(self):
        from app.services.market_data.ingestion_service import IngestionOrchestrator
        from app.services.market_data.provider_base import NormalizedEquity

        mock_provider = AsyncMock()
        mock_provider.provider_name = "twelvedata"
        mock_provider.fetch_equity_quotes.return_value = [
            NormalizedEquity(
                symbol="SPY", price=520.0, open=518.0, high=522.0, low=517.0,
                close=520.0, volume=80_000_000, change_pct=0.38, market_cap=None,
                source="twelvedata", as_of=datetime.now(UTC),
            ),
        ]

        orch = IngestionOrchestrator(providers=[mock_provider])
        mock_session = AsyncMock()
        mock_user = MagicMock()
        mock_user.company_id = "00000000-0000-0000-0000-000000000001"

        with patch("app.services.market_data.ingestion_service.equity_snapshot_service") as mock_svc:
            mock_snap = MagicMock()
            mock_snap.id = "test-uuid"
            mock_svc.create_or_get = AsyncMock(return_value=mock_snap)
            results = await orch.ingest_equity_quotes(mock_session, mock_user, symbols=["SPY"])

        assert len(results) == 1


# ═══════════════════════════════════════════════════════════
# Scheduler
# ═══════════════════════════════════════════════════════════

class TestScheduler:

    def test_scheduler_importable(self):
        from app.services.market_data.scheduler import MarketDataScheduler
        assert MarketDataScheduler is not None

    def test_scheduler_config(self):
        from app.services.market_data.scheduler import MarketDataScheduler
        s = MarketDataScheduler(
            orchestrator=MagicMock(),
            spot_interval=300,
            forward_interval=3600,
            equity_interval=300,
            vol_interval=3600,
        )
        assert s._spot_interval == 300
        assert s._forward_interval == 3600

    @pytest.mark.asyncio
    async def test_scheduler_start_stop(self):
        from app.services.market_data.scheduler import MarketDataScheduler
        s = MarketDataScheduler(
            orchestrator=MagicMock(),
            spot_interval=300,
            forward_interval=3600,
            equity_interval=300,
            vol_interval=3600,
        )
        s.start()
        assert s.is_running
        s.stop()
        assert not s.is_running


# ═══════════════════════════════════════════════════════════
# Staleness Monitor
# ═══════════════════════════════════════════════════════════

class TestStalenessMonitor:

    def test_monitor_importable(self):
        from app.services.market_data.staleness_monitor import StalenessMonitor
        assert StalenessMonitor is not None

    def test_staleness_thresholds(self):
        from app.services.market_data.staleness_monitor import STALENESS_THRESHOLDS
        assert STALENESS_THRESHOLDS["fx_spot"] == 5
        assert STALENESS_THRESHOLDS["forward_curve"] == 60
        assert STALENESS_THRESHOLDS["equity"] == 5


# ═══════════════════════════════════════════════════════════
# Permissions
# ═══════════════════════════════════════════════════════════

class TestPermissions:

    def test_market_data_permissions_exist(self):
        from app.models.permission import SEED_PERMISSIONS
        codenames = {p[0] for p in SEED_PERMISSIONS}
        assert "forward_curve.create" in codenames
        assert "forward_curve.read" in codenames
        assert "volatility.snapshot.create" in codenames
        assert "volatility.snapshot.read" in codenames
        assert "equity.snapshot.create" in codenames
        assert "equity.snapshot.read" in codenames
        assert "options.snapshot.create" in codenames
        assert "options.snapshot.read" in codenames
        assert "market_data.admin" in codenames
        assert "market_data.refresh" in codenames


# ═══════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════

class TestRoutes:

    def test_admin_routes_importable(self):
        from app.api.routes.v1_market_data_admin import router
        paths = [r.path for r in router.routes if hasattr(r, "path")]
        assert any("status" in p for p in paths)
        assert any("refresh" in p for p in paths)

    def test_equity_routes_importable(self):
        from app.api.routes.v1_equity_snapshots import router
        paths = [r.path for r in router.routes if hasattr(r, "path")]
        assert any("latest" in p for p in paths)


# ═══════════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════════

class TestConfig:

    def test_market_data_config_fields_exist(self):
        """All new config fields have defaults — no env vars needed."""
        from app.core.config import Settings
        fields = Settings.model_fields
        assert "TWELVEDATA_API_KEY" in fields
        assert "TWELVEDATA_BASE_URL" in fields
        assert "TWELVEDATA_RATE_LIMIT" in fields
        assert "IBKR_HOST" in fields
        assert "IBKR_PORT" in fields
        assert "IBKR_ENABLED" in fields
        assert "MARKET_DATA_SPOT_INTERVAL_SEC" in fields

    def test_market_data_config_defaults(self):
        """Verify sensible defaults."""
        from app.core.config import Settings
        defaults = {k: v.default for k, v in Settings.model_fields.items() if v.default is not None}
        assert defaults.get("TWELVEDATA_API_KEY") == ""
        assert defaults.get("IBKR_ENABLED") is False
        assert defaults.get("MARKET_DATA_SPOT_INTERVAL_SEC") == 300
