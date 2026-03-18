"""
tests/test_snapshot_services_coverage.py

Coverage-targeted unit tests for the four snapshot service modules:
  - app/services/geo_snapshot_service.py
  - app/services/volatility_snapshot_service.py
  - app/services/options_snapshot_service.py
  - app/services/market_snapshot_service.py

Uses AsyncMock DB sessions — no PostgreSQL dependency, runs on every CI run.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _make_db() -> AsyncMock:
    """Return a minimal AsyncMock that looks like an AsyncSession."""
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.first.return_value = None
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result
    db.get.return_value = None
    return db


def _make_user(company_id=None):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = company_id or uuid.uuid4()
    return user


def _make_snapshot(company_id=None, **kwargs):
    snap = MagicMock()
    snap.id = uuid.uuid4()
    snap.company_id = company_id or uuid.uuid4()
    for k, v in kwargs.items():
        setattr(snap, k, v)
    return snap


# ===========================================================================
# geo_snapshot_service
# ===========================================================================

class TestGeoSnapshotServicePureFunctions:
    """Tests for pure/deterministic functions (no DB needed)."""

    def test_build_canonical_payload_is_deterministic(self):
        from app.services.geo_snapshot_service import build_canonical_payload

        payload = {"z": 3, "a": 1, "m": 2}
        result = build_canonical_payload(payload)
        # sort_keys ensures deterministic order
        assert result == '{"a":1,"m":2,"z":3}'

    def test_build_snapshot_hash_returns_hex_string(self):
        from app.services.geo_snapshot_service import build_snapshot_hash

        h = build_snapshot_hash('{"test":1}')
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_classify_geo_regime_stable(self):
        from app.services.geo_snapshot_service import classify_geo_regime

        assert classify_geo_regime(0.0) == "STABLE"
        assert classify_geo_regime(0.1) == "STABLE"
        assert classify_geo_regime(0.299) == "STABLE"

    def test_classify_geo_regime_elevated(self):
        from app.services.geo_snapshot_service import classify_geo_regime

        assert classify_geo_regime(0.3) == "ELEVATED"
        assert classify_geo_regime(0.5) == "ELEVATED"
        assert classify_geo_regime(0.699) == "ELEVATED"

    def test_classify_geo_regime_crisis(self):
        from app.services.geo_snapshot_service import classify_geo_regime

        assert classify_geo_regime(0.7) == "CRISIS"
        assert classify_geo_regime(1.0) == "CRISIS"


class TestGeoSnapshotServiceCreateOrGet:
    """Tests for create_or_get."""

    @pytest.mark.asyncio
    async def test_create_or_get_raises_on_invalid_score(self):
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()
        with pytest.raises(ValueError, match="normalized_score"):
            await create_or_get(
                db, user,
                corridor="US-MX",
                as_of=datetime.now(UTC),
                normalized_score=1.5,
            )

    @pytest.mark.asyncio
    async def test_create_or_get_raises_on_negative_score(self):
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()
        with pytest.raises(ValueError, match="normalized_score"):
            await create_or_get(
                db, user,
                corridor="US-MX",
                as_of=datetime.now(UTC),
                normalized_score=-0.1,
            )

    @pytest.mark.asyncio
    async def test_create_or_get_returns_existing_when_hash_matches(self):
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()
        existing_snap = _make_snapshot(company_id=user.company_id)

        # _find_by_hash returns existing
        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = existing_snap
        db.execute.return_value = res_mock

        result = await create_or_get(
            db, user,
            corridor="US-MX",
            as_of=datetime.now(UTC),
            normalized_score=0.5,
        )
        assert result is existing_snap
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_create_or_get_inserts_new_snapshot(self):
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        # _find_by_hash returns None (no existing)
        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        result = await create_or_get(
            db, user,
            corridor="EU-CN",
            as_of=datetime.now(UTC),
            normalized_score=0.2,
            evidence_summary="Low tension",
            confidence=0.9,
            factors_json={"trade": 0.1},
        )
        db.add.assert_called_once()
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_derives_regime_when_not_provided(self):
        """When regime=None, it should be auto-derived from normalized_score."""
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            corridor="EU-RU",
            as_of=datetime.now(UTC),
            normalized_score=0.8,
            regime=None,  # should become CRISIS
        )
        # Verify a GeopoliticalRiskSnapshot was added with regime=CRISIS
        added_obj = db.add.call_args[0][0]
        assert added_obj.regime == "CRISIS"

    @pytest.mark.asyncio
    async def test_create_or_get_marks_stale_when_older_than_48h(self):
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        old_dt = datetime.now(UTC) - timedelta(hours=72)
        await create_or_get(
            db, user,
            corridor="US-CN",
            as_of=old_dt,
            normalized_score=0.4,
        )
        added_obj = db.add.call_args[0][0]
        assert added_obj.is_stale is True

    @pytest.mark.asyncio
    async def test_create_or_get_not_stale_for_recent(self):
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            corridor="US-CN",
            as_of=datetime.now(UTC),
            normalized_score=0.4,
        )
        added_obj = db.add.call_args[0][0]
        assert added_obj.is_stale is False

    @pytest.mark.asyncio
    async def test_create_or_get_parses_string_as_of(self):
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            corridor="US-EU",
            as_of="2024-01-15T12:00:00Z",
            normalized_score=0.3,
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_handles_bad_string_as_of(self):
        """Invalid as_of string falls back to datetime.now(UTC)."""
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            corridor="US-EU",
            as_of="not-a-date",
            normalized_score=0.3,
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_on_commit_exception_returns_existing_race(self):
        """On commit exception, falls back to _find_by_hash (race condition path)."""
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        existing_snap = _make_snapshot(company_id=user.company_id)

        call_count = 0

        async def execute_side_effect(q):
            nonlocal call_count
            call_count += 1
            res = MagicMock()
            if call_count == 1:
                # First call: _find_by_hash returns None
                res.scalars.return_value.first.return_value = None
            else:
                # Second call after rollback: returns existing
                res.scalars.return_value.first.return_value = existing_snap
            return res

        db.execute.side_effect = execute_side_effect
        db.commit.side_effect = Exception("unique constraint violation")

        result = await create_or_get(
            db, user,
            corridor="US-MX",
            as_of=datetime.now(UTC),
            normalized_score=0.5,
        )
        assert result is existing_snap
        db.rollback.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_on_commit_exception_reraises_when_no_existing(self):
        """On commit exception with no existing row, re-raises."""
        from app.services.geo_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock
        db.commit.side_effect = RuntimeError("db error")

        with pytest.raises(RuntimeError, match="db error"):
            await create_or_get(
                db, user,
                corridor="US-MX",
                as_of=datetime.now(UTC),
                normalized_score=0.5,
            )


class TestGeoSnapshotServiceGetById:
    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_when_not_found(self):
        from app.services.geo_snapshot_service import get_by_id

        db = _make_db()
        db.get.return_value = None
        result = await get_by_id(db, uuid.uuid4(), uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_for_wrong_company(self):
        from app.services.geo_snapshot_service import get_by_id

        company_id = uuid.uuid4()
        snap = _make_snapshot(company_id=uuid.uuid4())  # different company
        db = _make_db()
        db.get.return_value = snap

        result = await get_by_id(db, snap.id, company_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_returns_row_for_correct_company(self):
        from app.services.geo_snapshot_service import get_by_id

        company_id = uuid.uuid4()
        snap = _make_snapshot(company_id=company_id)
        db = _make_db()
        db.get.return_value = snap

        result = await get_by_id(db, snap.id, company_id)
        assert result is snap


class TestGeoSnapshotServiceGetLatestByCorridor:
    @pytest.mark.asyncio
    async def test_get_latest_by_corridor_returns_none_when_empty(self):
        from app.services.geo_snapshot_service import get_latest_by_corridor

        db = _make_db()
        result = await get_latest_by_corridor(db, "US-MX", uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_get_latest_by_corridor_returns_first_result(self):
        from app.services.geo_snapshot_service import get_latest_by_corridor

        db = _make_db()
        snap = _make_snapshot()
        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = snap
        db.execute.return_value = res_mock

        result = await get_latest_by_corridor(db, "us-mx", uuid.uuid4())
        assert result is snap


class TestGeoSnapshotServiceGetCorridorMap:
    @pytest.mark.asyncio
    async def test_get_corridor_map_returns_empty_dict_when_no_rows(self):
        from app.services.geo_snapshot_service import get_corridor_map

        db = _make_db()
        result = await get_corridor_map(db, uuid.uuid4())
        assert result == {}

    @pytest.mark.asyncio
    async def test_get_corridor_map_returns_latest_per_corridor(self):
        from app.services.geo_snapshot_service import get_corridor_map

        db = _make_db()
        company_id = uuid.uuid4()

        snap1 = MagicMock()
        snap1.corridor = "US-MX"
        snap1.normalized_score = 0.4
        snap1.regime = "ELEVATED"
        snap1.source = "polisophic"
        snap1.as_of = datetime(2024, 1, 15, tzinfo=UTC)
        snap1.is_stale = False
        snap1.confidence = 0.85

        snap2 = MagicMock()
        snap2.corridor = "EU-CN"
        snap2.normalized_score = 0.7
        snap2.regime = "CRISIS"
        snap2.source = "polisophic"
        snap2.as_of = datetime(2024, 1, 16, tzinfo=UTC)
        snap2.is_stale = False
        snap2.confidence = 0.9

        res_mock = MagicMock()
        res_mock.scalars.return_value.all.return_value = [snap1, snap2]
        db.execute.return_value = res_mock

        result = await get_corridor_map(db, company_id)
        assert "US-MX" in result
        assert "EU-CN" in result
        assert result["US-MX"]["normalized_score"] == 0.4
        assert result["EU-CN"]["regime"] == "CRISIS"

    @pytest.mark.asyncio
    async def test_get_corridor_map_keeps_first_occurrence_per_corridor(self):
        """Since rows are ordered by as_of desc, the first occurrence is the latest."""
        from app.services.geo_snapshot_service import get_corridor_map

        db = _make_db()

        snap1 = MagicMock()
        snap1.corridor = "US-MX"
        snap1.normalized_score = 0.8
        snap1.regime = "CRISIS"
        snap1.source = "polisophic"
        snap1.as_of = datetime(2024, 1, 16, tzinfo=UTC)
        snap1.is_stale = False
        snap1.confidence = 0.9

        snap2 = MagicMock()
        snap2.corridor = "US-MX"
        snap2.normalized_score = 0.2
        snap2.regime = "STABLE"
        snap2.source = "polisophic"
        snap2.as_of = datetime(2024, 1, 10, tzinfo=UTC)
        snap2.is_stale = True
        snap2.confidence = 0.6

        res_mock = MagicMock()
        res_mock.scalars.return_value.all.return_value = [snap1, snap2]
        db.execute.return_value = res_mock

        result = await get_corridor_map(db, uuid.uuid4())
        assert result["US-MX"]["normalized_score"] == 0.8  # first = latest


# ===========================================================================
# volatility_snapshot_service
# ===========================================================================

class TestVolatilitySnapshotServicePureFunctions:
    def test_classify_vol_regime_low(self):
        from app.services.volatility_snapshot_service import classify_vol_regime

        assert classify_vol_regime(0.0) == "LOW"
        assert classify_vol_regime(0.05) == "LOW"
        assert classify_vol_regime(0.059) == "LOW"

    def test_classify_vol_regime_normal(self):
        from app.services.volatility_snapshot_service import classify_vol_regime

        assert classify_vol_regime(0.06) == "NORMAL"
        assert classify_vol_regime(0.10) == "NORMAL"
        assert classify_vol_regime(0.139) == "NORMAL"

    def test_classify_vol_regime_elevated(self):
        from app.services.volatility_snapshot_service import classify_vol_regime

        assert classify_vol_regime(0.14) == "ELEVATED"
        assert classify_vol_regime(0.18) == "ELEVATED"
        assert classify_vol_regime(0.219) == "ELEVATED"

    def test_classify_vol_regime_crisis(self):
        from app.services.volatility_snapshot_service import classify_vol_regime

        assert classify_vol_regime(0.22) == "CRISIS"
        assert classify_vol_regime(0.50) == "CRISIS"

    def test_classify_vol_regime_none_returns_normal(self):
        from app.services.volatility_snapshot_service import classify_vol_regime

        assert classify_vol_regime(None) == "NORMAL"

    def test_compute_z_score_normal_case(self):
        from app.services.volatility_snapshot_service import compute_z_score

        result = compute_z_score(current_vol=0.15, lookback_mean=0.10, lookback_std=0.05)
        assert abs(result - 1.0) < 1e-9

    def test_compute_z_score_zero_std_returns_zero(self):
        from app.services.volatility_snapshot_service import compute_z_score

        result = compute_z_score(current_vol=0.15, lookback_mean=0.10, lookback_std=0.0)
        assert result == 0.0

    def test_compute_z_score_negative_std_returns_zero(self):
        from app.services.volatility_snapshot_service import compute_z_score

        result = compute_z_score(current_vol=0.15, lookback_mean=0.10, lookback_std=-0.01)
        assert result == 0.0

    def test_build_canonical_payload_sort_keys(self):
        from app.services.volatility_snapshot_service import build_canonical_payload

        result = build_canonical_payload({"z": 1, "a": 2})
        assert result.index('"a"') < result.index('"z"')

    def test_build_snapshot_hash_length(self):
        from app.services.volatility_snapshot_service import build_snapshot_hash

        h = build_snapshot_hash('{"test":1}')
        assert len(h) == 64


class TestVolatilitySnapshotServiceCreateOrGet:
    @pytest.mark.asyncio
    async def test_create_or_get_returns_existing_on_hash_match(self):
        from app.services.volatility_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()
        existing = _make_snapshot(company_id=user.company_id)

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = existing
        db.execute.return_value = res_mock

        result = await create_or_get(
            db, user,
            pair="EURUSD",
            as_of=datetime.now(UTC),
            source="bbg",
        )
        assert result is existing
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_create_or_get_inserts_new_snapshot(self):
        from app.services.volatility_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            pair="USDMXN",
            as_of=datetime.now(UTC),
            source="REUTERS",
            realized_vol_annualized=0.10,
            ewma_vol_annualized=0.11,
            implied_vol_atm=0.12,
            vol_z_score=1.2,
            term_structure_slope=-0.02,
            lookback_days=30,
            ewma_lambda=0.94,
            surface_json={"25d_rr": 0.5},
        )
        db.add.assert_called_once()
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_derives_regime_from_ewma(self):
        """Primary vol source: ewma_vol_annualized."""
        from app.services.volatility_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            pair="EURUSD",
            as_of=datetime.now(UTC),
            source="BBG",
            ewma_vol_annualized=0.25,  # CRISIS threshold
        )
        added_obj = db.add.call_args[0][0]
        assert added_obj.vol_regime == "CRISIS"

    @pytest.mark.asyncio
    async def test_create_or_get_derives_regime_from_realized_when_no_ewma(self):
        from app.services.volatility_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            pair="GBPUSD",
            as_of=datetime.now(UTC),
            source="BBG",
            realized_vol_annualized=0.03,  # LOW
        )
        added_obj = db.add.call_args[0][0]
        assert added_obj.vol_regime == "LOW"

    @pytest.mark.asyncio
    async def test_create_or_get_uses_explicit_regime(self):
        from app.services.volatility_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            pair="USDJPY",
            as_of=datetime.now(UTC),
            source="BBG",
            realized_vol_annualized=0.30,
            vol_regime="CUSTOM",
        )
        added_obj = db.add.call_args[0][0]
        assert added_obj.vol_regime == "CUSTOM"

    @pytest.mark.asyncio
    async def test_create_or_get_parses_string_as_of(self):
        from app.services.volatility_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            pair="EURUSD",
            as_of="2024-06-01T00:00:00Z",
            source="BBG",
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_handles_bad_string_as_of(self):
        from app.services.volatility_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            pair="EURUSD",
            as_of="not-a-date",
            source="BBG",
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_on_commit_exception_returns_existing(self):
        from app.services.volatility_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()
        existing = _make_snapshot(company_id=user.company_id)

        call_count = 0

        async def execute_side_effect(q):
            nonlocal call_count
            call_count += 1
            res = MagicMock()
            if call_count == 1:
                res.scalars.return_value.first.return_value = None
            else:
                res.scalars.return_value.first.return_value = existing
            return res

        db.execute.side_effect = execute_side_effect
        db.commit.side_effect = Exception("constraint")

        result = await create_or_get(
            db, user,
            pair="EURUSD",
            as_of=datetime.now(UTC),
            source="BBG",
        )
        assert result is existing

    @pytest.mark.asyncio
    async def test_create_or_get_on_commit_exception_reraises(self):
        from app.services.volatility_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock
        db.commit.side_effect = RuntimeError("hard fail")

        with pytest.raises(RuntimeError):
            await create_or_get(
                db, user,
                pair="EURUSD",
                as_of=datetime.now(UTC),
                source="BBG",
            )


class TestVolatilitySnapshotServiceGetById:
    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_when_not_found(self):
        from app.services.volatility_snapshot_service import get_by_id

        db = _make_db()
        result = await get_by_id(db, uuid.uuid4(), uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_for_wrong_company(self):
        from app.services.volatility_snapshot_service import get_by_id

        company_id = uuid.uuid4()
        snap = _make_snapshot(company_id=uuid.uuid4())
        db = _make_db()
        db.get.return_value = snap

        result = await get_by_id(db, snap.id, company_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_returns_correct_row(self):
        from app.services.volatility_snapshot_service import get_by_id

        company_id = uuid.uuid4()
        snap = _make_snapshot(company_id=company_id)
        db = _make_db()
        db.get.return_value = snap

        result = await get_by_id(db, snap.id, company_id)
        assert result is snap


class TestVolatilitySnapshotServiceGetLatestByPair:
    @pytest.mark.asyncio
    async def test_get_latest_by_pair_returns_none_when_empty(self):
        from app.services.volatility_snapshot_service import get_latest_by_pair

        db = _make_db()
        result = await get_latest_by_pair(db, "EURUSD", uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_get_latest_by_pair_returns_result(self):
        from app.services.volatility_snapshot_service import get_latest_by_pair

        db = _make_db()
        snap = _make_snapshot()
        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = snap
        db.execute.return_value = res_mock

        result = await get_latest_by_pair(db, "eurusd", uuid.uuid4())
        assert result is snap


# ===========================================================================
# options_snapshot_service
# ===========================================================================

class TestOptionsSnapshotServicePureFunctions:
    def test_build_canonical_payload_sort_keys(self):
        from app.services.options_snapshot_service import build_canonical_payload

        result = build_canonical_payload({"z": 1, "a": 2})
        assert result.index('"a"') < result.index('"z"')

    def test_build_snapshot_hash_length(self):
        from app.services.options_snapshot_service import build_snapshot_hash

        h = build_snapshot_hash('{"test":1}')
        assert len(h) == 64


class TestOptionsSnapshotServiceCreateOrGet:
    @pytest.mark.asyncio
    async def test_create_or_get_returns_existing_on_hash_match(self):
        from app.services.options_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()
        existing = _make_snapshot(company_id=user.company_id)

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = existing
        db.execute.return_value = res_mock

        result = await create_or_get(
            db, user,
            underlying="EURUSD",
            expiry="2024-12-20",
            strike=1.10,
            option_type="call",
            as_of=datetime.now(UTC),
            source="bbg",
        )
        assert result is existing
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_create_or_get_inserts_new_snapshot(self):
        from app.services.options_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            underlying="USDMXN",
            expiry="2024-12-20",
            strike=17.5,
            option_type="PUT",
            as_of=datetime.now(UTC),
            source="REUTERS",
            bid=0.02,
            ask=0.025,
            last=0.022,
            volume=100,
            open_interest=500,
            implied_vol=0.15,
            delta=-0.45,
            gamma=0.02,
            theta=-0.001,
            vega=0.05,
            payload={"extra": "data"},
        )
        db.add.assert_called_once()
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_normalizes_strings(self):
        """underlying, option_type, and source should be uppercased."""
        from app.services.options_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            underlying="eurusd",
            expiry="2024-12-20",
            strike=1.10,
            option_type="call",
            as_of=datetime.now(UTC),
            source="bbg",
        )
        added_obj = db.add.call_args[0][0]
        assert added_obj.underlying == "EURUSD"
        assert added_obj.option_type == "CALL"
        assert added_obj.source == "BBG"

    @pytest.mark.asyncio
    async def test_create_or_get_parses_string_as_of(self):
        from app.services.options_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            underlying="EURUSD",
            expiry="2024-12-20",
            strike=1.10,
            option_type="CALL",
            as_of="2024-06-01T12:00:00Z",
            source="BBG",
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_handles_invalid_as_of(self):
        from app.services.options_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        await create_or_get(
            db, user,
            underlying="EURUSD",
            expiry="2024-12-20",
            strike=1.10,
            option_type="CALL",
            as_of="invalid-date",
            source="BBG",
        )
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_on_commit_exception_returns_existing(self):
        from app.services.options_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()
        existing = _make_snapshot(company_id=user.company_id)

        call_count = 0

        async def execute_side_effect(q):
            nonlocal call_count
            call_count += 1
            res = MagicMock()
            if call_count == 1:
                res.scalars.return_value.first.return_value = None
            else:
                res.scalars.return_value.first.return_value = existing
            return res

        db.execute.side_effect = execute_side_effect
        db.commit.side_effect = Exception("constraint violation")

        result = await create_or_get(
            db, user,
            underlying="EURUSD",
            expiry="2024-12-20",
            strike=1.10,
            option_type="CALL",
            as_of=datetime.now(UTC),
            source="BBG",
        )
        assert result is existing

    @pytest.mark.asyncio
    async def test_create_or_get_on_commit_exception_reraises(self):
        from app.services.options_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock
        db.commit.side_effect = RuntimeError("hard fail")

        with pytest.raises(RuntimeError):
            await create_or_get(
                db, user,
                underlying="EURUSD",
                expiry="2024-12-20",
                strike=1.10,
                option_type="CALL",
                as_of=datetime.now(UTC),
                source="BBG",
            )


class TestOptionsSnapshotServiceGetById:
    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_when_not_found(self):
        from app.services.options_snapshot_service import get_by_id

        db = _make_db()
        result = await get_by_id(db, uuid.uuid4(), uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_for_wrong_company(self):
        from app.services.options_snapshot_service import get_by_id

        company_id = uuid.uuid4()
        snap = _make_snapshot(company_id=uuid.uuid4())
        db = _make_db()
        db.get.return_value = snap

        result = await get_by_id(db, snap.id, company_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_returns_correct_row(self):
        from app.services.options_snapshot_service import get_by_id

        company_id = uuid.uuid4()
        snap = _make_snapshot(company_id=company_id)
        db = _make_db()
        db.get.return_value = snap

        result = await get_by_id(db, snap.id, company_id)
        assert result is snap


class TestOptionsSnapshotServiceGetLatestByUnderlying:
    @pytest.mark.asyncio
    async def test_get_latest_by_underlying_returns_empty_list_when_no_rows(self):
        from app.services.options_snapshot_service import get_latest_by_underlying

        db = _make_db()
        result = await get_latest_by_underlying(db, "EURUSD", uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_get_latest_by_underlying_returns_list(self):
        from app.services.options_snapshot_service import get_latest_by_underlying

        db = _make_db()
        snap1 = _make_snapshot()
        snap2 = _make_snapshot()
        res_mock = MagicMock()
        res_mock.scalars.return_value.all.return_value = [snap1, snap2]
        db.execute.return_value = res_mock

        result = await get_latest_by_underlying(db, "eurusd", uuid.uuid4())
        assert len(result) == 2
        assert snap1 in result
        assert snap2 in result


# ===========================================================================
# market_snapshot_service
# ===========================================================================

class TestMarketSnapshotServicePureFunctions:
    def test_build_canonical_payload_is_deterministic(self):
        from app.services.market_snapshot_service import build_canonical_payload

        result1 = build_canonical_payload({"b": 2, "a": 1})
        result2 = build_canonical_payload({"a": 1, "b": 2})
        assert result1 == result2
        assert result1 == '{"a":1,"b":2}'

    def test_build_snapshot_hash_deterministic(self):
        from app.services.market_snapshot_service import build_snapshot_hash, build_canonical_payload

        payload = {"spot_rate": 17.5, "as_of": "2024-01-01"}
        canonical = build_canonical_payload(payload)
        h1 = build_snapshot_hash(canonical)
        h2 = build_snapshot_hash(canonical)
        assert h1 == h2
        assert len(h1) == 64

    def test_build_snapshot_hash_different_payloads_differ(self):
        from app.services.market_snapshot_service import build_snapshot_hash

        h1 = build_snapshot_hash('{"a":1}')
        h2 = build_snapshot_hash('{"a":2}')
        assert h1 != h2


class TestMarketSnapshotServiceCreateOrGet:
    @pytest.mark.asyncio
    async def test_create_or_get_returns_existing_on_hash_match(self):
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()
        existing = _make_snapshot(company_id=user.company_id)

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = existing
        db.execute.return_value = res_mock

        payload = {
            "as_of": datetime.now(UTC).isoformat(),
            "spot_rate": 17.5,
            "provider_metadata": {"source": "bbg", "data_class": "LIVE", "primary_currency": "MXN"},
        }
        result = await create_or_get(db, user, payload)
        assert result is existing
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_create_or_get_inserts_new_snapshot(self):
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        payload = {
            "as_of": datetime.now(UTC).isoformat(),
            "spot_rate": 17.5,
            "forward_points_by_month": {"1M": 0.05},
            "provider_metadata": {"source": "bbg", "data_class": "LIVE", "primary_currency": "MXN"},
        }
        await create_or_get(db, user, payload)
        db.add.assert_called_once()
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_uses_spot_usdmxn_fallback(self):
        """spot_usdmxn as fallback key for spot_rate."""
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        payload = {
            "as_of": datetime.now(UTC).isoformat(),
            "spot_usdmxn": 17.8,  # fallback key
            "provider_metadata": {},
        }
        await create_or_get(db, user, payload)
        added_obj = db.add.call_args[0][0]
        assert added_obj.spot_rate == 17.8

    @pytest.mark.asyncio
    async def test_create_or_get_marks_synthetic_when_not_live(self):
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        payload = {
            "as_of": datetime.now(UTC).isoformat(),
            "spot_rate": 17.5,
            "provider_metadata": {"source": "fallback", "data_class": "INDICATIVE_FALLBACK"},
        }
        await create_or_get(db, user, payload)
        added_obj = db.add.call_args[0][0]
        assert added_obj.is_synthetic_forward is True

    @pytest.mark.asyncio
    async def test_create_or_get_not_synthetic_for_live_data(self):
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        payload = {
            "as_of": datetime.now(UTC).isoformat(),
            "spot_rate": 17.5,
            "provider_metadata": {"source": "bbg", "data_class": "LIVE"},
        }
        await create_or_get(db, user, payload)
        added_obj = db.add.call_args[0][0]
        assert added_obj.is_synthetic_forward is False

    @pytest.mark.asyncio
    async def test_create_or_get_parses_datetime_object_as_of(self):
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        dt = datetime(2024, 6, 1, 12, 0, 0, tzinfo=UTC)
        payload = {
            "as_of": dt,  # datetime object, not string
            "spot_rate": 17.5,
            "provider_metadata": {},
        }
        await create_or_get(db, user, payload)
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_handles_invalid_as_of_string(self):
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        payload = {
            "as_of": "not-a-valid-date",
            "spot_rate": 17.5,
            "provider_metadata": {},
        }
        await create_or_get(db, user, payload)
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_handles_empty_as_of(self):
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock

        payload = {
            "as_of": "",
            "spot_rate": 17.5,
            "provider_metadata": {},
        }
        await create_or_get(db, user, payload)
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_or_get_on_commit_exception_returns_existing(self):
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()
        existing = _make_snapshot(company_id=user.company_id)

        call_count = 0

        async def execute_side_effect(q):
            nonlocal call_count
            call_count += 1
            res = MagicMock()
            if call_count == 1:
                res.scalars.return_value.first.return_value = None
            else:
                res.scalars.return_value.first.return_value = existing
            return res

        db.execute.side_effect = execute_side_effect
        db.commit.side_effect = Exception("unique constraint")

        payload = {
            "as_of": datetime.now(UTC).isoformat(),
            "spot_rate": 17.5,
            "provider_metadata": {},
        }
        result = await create_or_get(db, user, payload)
        assert result is existing

    @pytest.mark.asyncio
    async def test_create_or_get_on_commit_exception_reraises(self):
        from app.services.market_snapshot_service import create_or_get

        db = _make_db()
        user = _make_user()

        res_mock = MagicMock()
        res_mock.scalars.return_value.first.return_value = None
        db.execute.return_value = res_mock
        db.commit.side_effect = RuntimeError("fatal db error")

        payload = {
            "as_of": datetime.now(UTC).isoformat(),
            "spot_rate": 17.5,
            "provider_metadata": {},
        }
        with pytest.raises(RuntimeError, match="fatal db error"):
            await create_or_get(db, user, payload)


class TestMarketSnapshotServiceGetById:
    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_when_not_found(self):
        from app.services.market_snapshot_service import get_by_id

        db = _make_db()
        result = await get_by_id(db, uuid.uuid4(), uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_for_wrong_company(self):
        from app.services.market_snapshot_service import get_by_id

        company_id = uuid.uuid4()
        snap = _make_snapshot(company_id=uuid.uuid4())
        db = _make_db()
        db.get.return_value = snap

        result = await get_by_id(db, snap.id, company_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_returns_correct_row(self):
        from app.services.market_snapshot_service import get_by_id

        company_id = uuid.uuid4()
        snap = _make_snapshot(company_id=company_id)
        db = _make_db()
        db.get.return_value = snap

        result = await get_by_id(db, snap.id, company_id)
        assert result is snap
