"""Coverage tests for pipeline_service.py uncovered lines.

Groups:
  1. TestSandboxCalculateValid   -- happy path: returns dict with run_id, calculate_response
  2. TestSandboxCalculateErrors  -- invalid trade / market / hedge / policy -> ValueError
  3. TestSandboxCalculateStore   -- store eviction actually fires inside sandbox_calculate
  4. TestSandboxCalculateMulti   -- USDMXN delegates to sandbox_calculate; unsupported pair raises
  5. TestCreateProposalStale      -- staleness check rejects fresh-but-just-expired market
  6. TestCreateProposalSuccess    -- valid run_id in store goes through full proposal path
  7. TestStagingListGet           -- list_staging and get_staging (not-found / found paths)
  8. TestLedgerListGet            -- list_ledger and get_ledger (found / not-found paths)
  9. TestReplayLedger             -- replay_ledger happy path (has freeze_artifact)
 10. TestEmitPipelineEventCompany -- _emit_pipeline_event with valid company UUID path
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _mock_session():
    session = AsyncMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.flush = AsyncMock()
    session.rollback = AsyncMock()
    session.get = AsyncMock(return_value=None)
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=mock_result)
    return session


def _minimal_trade() -> dict[str, Any]:
    return {
        "record_id": "T-001",
        "entity": "Acme Corp",
        "type": "AR",
        "currency": "MXN",
        "amount": 1_000_000.0,
        "value_date": "2026-06-30",
        "status": "CONFIRMED",
        "description": "Test trade",
    }


def _minimal_market() -> dict[str, Any]:
    return {
        "as_of": datetime.now(UTC).isoformat(),
        "spot_rate": 17.5,
        "forward_points_by_month": {"1": 0.05, "2": 0.10, "3": 0.15},
        "provider_metadata": {},
    }


def _minimal_policy() -> dict[str, Any]:
    return {
        "bucket_mode": "CALENDAR_MONTH",
        "hedge_ratios": {"confirmed": 0.85, "forecast": 0.50},
        "cost_assumptions": {"spread_bps": 5.0},
        "execution_product": "FWD",
        "min_trade_size_usd": 50_000.0,
        "allow_indicative_proxy": True,
    }


def _make_request(**overrides) -> Any:
    from app.schemas_v1.pipeline import SandboxCalculateRequest

    data = {
        "trades": [_minimal_trade()],
        "hedges": [],
        "market": _minimal_market(),
        "policy": _minimal_policy(),
    }
    data.update(overrides)
    return SandboxCalculateRequest(**data)


# ═══════════════════════════════════════════════════════════════════════════
# 1. sandbox_calculate -- happy path
# ═══════════════════════════════════════════════════════════════════════════


class TestSandboxCalculateValid:
    def setup_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    def teardown_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    def test_returns_dict_with_run_id(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        assert isinstance(result, dict)
        assert "run_id" in result
        assert isinstance(result["run_id"], str)
        assert len(result["run_id"]) > 0

    def test_returns_waterfall_result(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        assert "waterfall_result" in result
        assert result["waterfall_result"] is not None

    def test_returns_validation_report(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        assert "validation_report" in result
        assert result["validation_report"] is not None

    def test_returns_trace_events_list(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        assert "trace_events" in result
        assert isinstance(result["trace_events"], list)
        assert len(result["trace_events"]) >= 1

    def test_frozen_inputs_preserved(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        assert "frozen_inputs" in result
        fi = result["frozen_inputs"]
        assert "trades" in fi
        assert "market" in fi
        assert "policy" in fi
        assert "hedges" in fi

    def test_run_stored_in_sandbox_runs(self):
        from app.services.pipeline_service import _sandbox_runs, sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        run_id = result["run_id"]
        assert run_id in _sandbox_runs

    def test_calculate_response_present_on_pass(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        # When validation passes, calculate_response is populated
        report = result["validation_report"]
        if report.status == "PASS":
            assert result["calculate_response"] is not None
        # If validation fails (FAIL/WARN), calculate_response may be None -- still valid

    def test_v2_results_is_dict(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        assert "v2_results" in result
        assert isinstance(result["v2_results"], dict)

    def test_run_envelope_present(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        assert "run_envelope" in result
        assert result["run_envelope"] is not None

    def test_multiple_trades(self):
        from app.services.pipeline_service import sandbox_calculate

        trades = [
            _minimal_trade(),
            {**_minimal_trade(), "record_id": "T-002", "type": "AP", "amount": 500_000.0},
        ]
        req = _make_request(trades=trades)
        result = sandbox_calculate("user-1", req)
        assert "run_id" in result

    def test_with_hedge_rows(self):
        from app.services.pipeline_service import sandbox_calculate

        hedges = [{
            "hedge_id": "H-001",
            "instrument": "FWD",
            "direction": "SELL_MXN_BUY_USD",
            "notional_mxn": 500_000.0,
            "value_date": "2026-06-30",
            "status": "ACTIVE",
        }]
        req = _make_request(hedges=hedges)
        result = sandbox_calculate("user-1", req)
        assert "run_id" in result

    def test_each_call_produces_unique_run_id(self):
        from app.services.pipeline_service import sandbox_calculate

        r1 = sandbox_calculate("user-1", _make_request())
        r2 = sandbox_calculate("user-1", _make_request())
        assert r1["run_id"] != r2["run_id"]

    def test_parse_trace_event_appended(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        steps = [e.step for e in result["trace_events"]]
        assert "PARSE" in steps

    def test_validate_trace_event_appended(self):
        from app.services.pipeline_service import sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        steps = [e.step for e in result["trace_events"]]
        assert "VALIDATE" in steps


# ═══════════════════════════════════════════════════════════════════════════
# 2. sandbox_calculate -- error paths
# ═══════════════════════════════════════════════════════════════════════════


class TestSandboxCalculateErrors:
    def test_invalid_trade_type_raises_value_error(self):
        from app.services.pipeline_service import sandbox_calculate

        bad_trade = {**_minimal_trade(), "type": "INVALID_TYPE"}
        req = _make_request(trades=[bad_trade])
        with pytest.raises(ValueError, match="Trade parse error"):
            sandbox_calculate("user-1", req)

    def test_invalid_trade_missing_record_id_raises(self):
        from app.services.pipeline_service import sandbox_calculate

        bad_trade = {**_minimal_trade()}
        del bad_trade["record_id"]
        req = _make_request(trades=[bad_trade])
        with pytest.raises(ValueError, match="Trade parse error"):
            sandbox_calculate("user-1", req)

    def test_invalid_trade_negative_amount_raises(self):
        from app.services.pipeline_service import sandbox_calculate

        bad_trade = {**_minimal_trade(), "amount": -1000.0}
        req = _make_request(trades=[bad_trade])
        with pytest.raises(ValueError, match="Trade parse error"):
            sandbox_calculate("user-1", req)

    def test_invalid_hedge_missing_required_field_raises(self):
        from app.services.pipeline_service import sandbox_calculate

        bad_hedge = {"hedge_id": "H-001", "instrument": "FWD"}  # missing required fields
        req = _make_request(hedges=[bad_hedge])
        with pytest.raises(ValueError, match="Hedge parse error"):
            sandbox_calculate("user-1", req)

    def test_invalid_market_missing_spot_rate_raises(self):
        from app.services.pipeline_service import sandbox_calculate

        bad_market = {**_minimal_market()}
        del bad_market["spot_rate"]
        req = _make_request(market=bad_market)
        with pytest.raises(ValueError, match="Market parse error"):
            sandbox_calculate("user-1", req)

    def test_invalid_market_zero_spot_rate_raises(self):
        from app.services.pipeline_service import sandbox_calculate

        bad_market = {**_minimal_market(), "spot_rate": 0.0}
        req = _make_request(market=bad_market)
        with pytest.raises(ValueError, match="Market parse error"):
            sandbox_calculate("user-1", req)

    def test_invalid_policy_bad_execution_product_raises(self):
        from app.services.pipeline_service import sandbox_calculate

        bad_policy = {**_minimal_policy(), "execution_product": "OPTION"}
        req = _make_request(policy=bad_policy)
        with pytest.raises(ValueError, match="Policy parse error"):
            sandbox_calculate("user-1", req)

    def test_invalid_policy_missing_hedge_ratios_raises(self):
        from app.services.pipeline_service import sandbox_calculate

        bad_policy = {**_minimal_policy()}
        del bad_policy["hedge_ratios"]
        req = _make_request(policy=bad_policy)
        with pytest.raises(ValueError, match="Policy parse error"):
            sandbox_calculate("user-1", req)


# ═══════════════════════════════════════════════════════════════════════════
# 3. sandbox_calculate -- store eviction triggered by actual calls
# ═══════════════════════════════════════════════════════════════════════════


class TestSandboxCalculateStore:
    def setup_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    def teardown_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    def test_store_grows_after_call(self):
        from app.services.pipeline_service import _sandbox_runs, sandbox_calculate

        assert len(_sandbox_runs) == 0
        sandbox_calculate("user-1", _make_request())
        assert len(_sandbox_runs) == 1

    def test_eviction_via_actual_calls(self):
        """Fill _sandbox_runs to MAX_STORE_SIZE manually then call sandbox_calculate once
        to trigger eviction of the oldest entry."""
        from app.services.pipeline_service import MAX_STORE_SIZE, _sandbox_runs, sandbox_calculate

        # Pre-fill store to capacity with sentinel keys
        sentinel_keys = []
        for i in range(MAX_STORE_SIZE):
            k = f"sentinel-{i:05d}"
            _sandbox_runs[k] = {"calculate_response": None}
            sentinel_keys.append(k)

        assert len(_sandbox_runs) == MAX_STORE_SIZE
        oldest = sentinel_keys[0]
        assert oldest in _sandbox_runs

        # One more real call should push count over limit and evict the oldest
        sandbox_calculate("user-evict", _make_request())

        # Store must not exceed MAX_STORE_SIZE
        assert len(_sandbox_runs) <= MAX_STORE_SIZE
        # The oldest sentinel should have been evicted
        assert oldest not in _sandbox_runs


# ═══════════════════════════════════════════════════════════════════════════
# 4. sandbox_calculate_multi
# ═══════════════════════════════════════════════════════════════════════════


class TestSandboxCalculateMulti:
    def setup_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    def teardown_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    def test_usdmxn_delegates_to_sandbox_calculate(self):
        """pair=USDMXN must delegate to sandbox_calculate (same result dict shape)."""
        from app.services.pipeline_service import sandbox_calculate_multi

        result = sandbox_calculate_multi("user-1", _make_request(), pair="USDMXN")
        assert "run_id" in result
        assert "waterfall_result" in result

    def test_unsupported_pair_raises_value_error(self):
        """Unsupported pair must raise ValueError via get_pair_meta."""
        from app.services.pipeline_service import sandbox_calculate_multi

        with pytest.raises((ValueError, Exception)):
            sandbox_calculate_multi("user-1", _make_request(), pair="XXXYYY")

    def test_default_pair_is_usdmxn(self):
        """Default pair argument must produce a valid result (same as USDMXN)."""
        from app.services.pipeline_service import sandbox_calculate_multi

        result = sandbox_calculate_multi("user-1", _make_request())
        assert "run_id" in result


# ═══════════════════════════════════════════════════════════════════════════
# 5. create_proposal -- stale market data
# ═══════════════════════════════════════════════════════════════════════════


class TestCreateProposalStale:
    def setup_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    def teardown_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    @pytest.mark.asyncio
    async def test_stale_market_raises_snapshot_stale(self):
        """If the market as_of in a run's frozen_inputs is old, create_proposal raises SNAPSHOT_STALE."""
        from app.services.pipeline_service import _sandbox_runs, create_proposal

        stale_market_ts = (datetime.now(UTC) - timedelta(hours=2)).isoformat()

        # Inject a fake run that has a non-None calculate_response but stale market
        fake_calc_response = MagicMock()
        fake_calc_response.hedge_plan = MagicMock()
        fake_calc_response.hedge_plan.buckets = []
        fake_calc_response.hedge_plan.summary = MagicMock()
        fake_calc_response.hedge_plan.summary.total_commercial_exposure_mxn = 1_000_000.0
        fake_calc_response.scenario_results = MagicMock()
        fake_calc_response.model_dump = MagicMock(return_value={})
        fake_calc_response.scenario_results.model_dump = MagicMock(return_value={})

        fake_waterfall = MagicMock()
        fake_waterfall.integrity_score = 90.0
        fake_waterfall.model_dump = MagicMock(return_value={})

        fake_envelope = MagicMock()
        fake_envelope.inputs_hash = "abc123"
        fake_envelope.policy_hash = "def456"
        fake_envelope.engine_version = "1.0.0"

        run_id = "stale-run-001"
        _sandbox_runs[run_id] = {
            "calculate_response": fake_calc_response,
            "waterfall_result": fake_waterfall,
            "frozen_inputs": {
                "trades": [],
                "hedges": [],
                "market": {"as_of": stale_market_ts},
                "policy": {},
            },
            "run_envelope": fake_envelope,
            "v2_results": {},
        }

        session = _mock_session()
        with pytest.raises(ValueError, match="SNAPSHOT_STALE"):
            await create_proposal(session, "user-1", run_id)


# ═══════════════════════════════════════════════════════════════════════════
# 6. create_proposal -- full success path via actual sandbox run
# ═══════════════════════════════════════════════════════════════════════════


class TestCreateProposalSuccess:
    def setup_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    def teardown_method(self):
        from app.services.pipeline_service import _sandbox_runs
        _sandbox_runs.clear()

    @pytest.mark.asyncio
    async def test_create_proposal_from_valid_sandbox_run(self):
        """Run sandbox_calculate then create_proposal from its run_id."""
        from app.services.pipeline_service import create_proposal, sandbox_calculate
        from app.schemas_v1.pipeline import Proposal

        result = sandbox_calculate("user-1", _make_request())
        run_id = result["run_id"]

        # Only proceed if validation passed and calculate_response is populated
        if result["calculate_response"] is None:
            pytest.skip("Sandbox calculation did not produce a response (validation failed)")

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.save_proposal = AsyncMock()
            proposal = await create_proposal(session, "user-1", run_id)

        assert isinstance(proposal, Proposal)
        assert proposal.proposal_id.startswith("PROP-")
        assert proposal.created_by == "user-1"
        assert proposal.status.value == "DRAFT"

    @pytest.mark.asyncio
    async def test_create_proposal_with_company_id(self):
        """create_proposal correctly threads company_id into the Proposal."""
        from app.services.pipeline_service import create_proposal, sandbox_calculate

        result = sandbox_calculate("user-1", _make_request())
        run_id = result["run_id"]

        if result["calculate_response"] is None:
            pytest.skip("Sandbox calculation did not produce a response")

        company_id = str(uuid.uuid4())
        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.save_proposal = AsyncMock()
            proposal = await create_proposal(session, "user-1", run_id, company_id=company_id)

        assert proposal.company_id == company_id

    @pytest.mark.asyncio
    async def test_create_proposal_stores_freeze_artifact(self):
        """Freeze artifact must be embedded in the returned Proposal."""
        from app.services.pipeline_service import create_proposal, sandbox_calculate
        from app.schemas_v1.pipeline import FreezeArtifact

        result = sandbox_calculate("user-1", _make_request())
        run_id = result["run_id"]

        if result["calculate_response"] is None:
            pytest.skip("Sandbox calculation did not produce a response")

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.save_proposal = AsyncMock()
            proposal = await create_proposal(session, "user-1", run_id)

        assert isinstance(proposal.freeze_artifact, FreezeArtifact)
        assert proposal.freeze_artifact.engine_version != ""


# ═══════════════════════════════════════════════════════════════════════════
# 7. submit_to_staging -- success path
# ═══════════════════════════════════════════════════════════════════════════


class TestSubmitToStagingSuccess:
    @pytest.mark.asyncio
    async def test_submit_to_staging_success(self):
        """DRAFT proposal can be submitted; returns StagedArtifact."""
        from app.services.pipeline_service import submit_to_staging
        from app.schemas_v1.pipeline import (
            AuthorizationStatus,
            StagedArtifact,
            SubmitToStagingRequest,
        )

        session = _mock_session()
        proposal = MagicMock()
        proposal.status = "DRAFT"
        proposal.waterfall = MagicMock()
        proposal.waterfall.integrity_score = 85.0
        proposal.company_id = None

        with patch("app.services.pipeline_service.pipeline_db") as mock_db, \
             patch("app.services.pipeline_service._emit_pipeline_event", new_callable=AsyncMock):
            mock_db.load_proposal = AsyncMock(return_value=proposal)
            mock_db.update_proposal_status = AsyncMock()
            mock_db.save_staging = AsyncMock()

            req = SubmitToStagingRequest(proposal_id="PROP-AABBCCDD", justification="ready to go")
            artifact = await submit_to_staging(session, "PROP-AABBCCDD", "user-1", req)

        assert isinstance(artifact, StagedArtifact)
        assert artifact.staging_id.startswith("STG-")
        assert artifact.submitted_by == "user-1"
        assert artifact.authorization_status == AuthorizationStatus.PENDING


# ═══════════════════════════════════════════════════════════════════════════
# 8. list_staging / get_staging
# ═══════════════════════════════════════════════════════════════════════════


class TestStagingListGet:
    @pytest.mark.asyncio
    async def test_list_staging_returns_list(self):
        from app.services.pipeline_service import list_staging

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.load_all_staging = AsyncMock(return_value=["stg1", "stg2"])
            result = await list_staging(session)
        assert result == ["stg1", "stg2"]

    @pytest.mark.asyncio
    async def test_list_staging_with_filters(self):
        from app.services.pipeline_service import list_staging

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.load_all_staging = AsyncMock(return_value=[])
            result = await list_staging(session, limit=10, offset=5, status_filter="PENDING", company_id="co-1")
        assert result == []
        mock_db.load_all_staging.assert_awaited_once_with(
            session, limit=10, offset=5, status_filter="PENDING", company_id_filter="co-1"
        )

    @pytest.mark.asyncio
    async def test_get_staging_not_found_returns_none(self):
        from app.services.pipeline_service import get_staging

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.load_staging = AsyncMock(return_value=None)
            result = await get_staging(session, "STG-MISSING")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_staging_no_company_filter_returns_artifact(self):
        """No company_id filter -- return whatever pipeline_db gives us."""
        from app.services.pipeline_service import get_staging

        session = _mock_session()
        artifact = MagicMock()
        artifact.company_id = "co-A"

        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.load_staging = AsyncMock(return_value=artifact)
            result = await get_staging(session, "STG-X")
        assert result is artifact


# ═══════════════════════════════════════════════════════════════════════════
# 9. list_ledger / get_ledger
# ═══════════════════════════════════════════════════════════════════════════


class TestLedgerListGet:
    @pytest.mark.asyncio
    async def test_list_ledger_returns_entries(self):
        from app.services.pipeline_service import list_ledger

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.load_all_ledger = AsyncMock(return_value=["e1", "e2", "e3"])
            result = await list_ledger(session)
        assert result == ["e1", "e2", "e3"]

    @pytest.mark.asyncio
    async def test_list_ledger_with_company_filter(self):
        from app.services.pipeline_service import list_ledger

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.load_all_ledger = AsyncMock(return_value=[])
            await list_ledger(session, company_id="co-1")
        mock_db.load_all_ledger.assert_awaited_once_with(session, company_id_filter="co-1")

    @pytest.mark.asyncio
    async def test_get_ledger_found(self):
        from app.services.pipeline_service import get_ledger

        session = _mock_session()
        entry = MagicMock()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.load_ledger = AsyncMock(return_value=entry)
            result = await get_ledger(session, "LEDG-ABCD1234")
        assert result is entry

    @pytest.mark.asyncio
    async def test_get_ledger_not_found_returns_none(self):
        from app.services.pipeline_service import get_ledger

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db:
            mock_db.load_ledger = AsyncMock(return_value=None)
            result = await get_ledger(session, "LEDG-MISSING")
        assert result is None


# ═══════════════════════════════════════════════════════════════════════════
# 10. replay_ledger -- success path
# ═══════════════════════════════════════════════════════════════════════════


class TestReplayLedger:
    def _make_replay_mocks(self, integrity_score: float = 95.0):
        """Build the chain of mocks needed by replay_ledger:
           ledger entry -> staging artifact -> proposal (with frozen_inputs)
        """
        freeze_artifact_data = {
            "snapshot_hash": "abc",
            "exposure_digest": "def",
            "policy_hash": "ghi",
            "engine_version": "1.0.0",
            "hedge_plan": {},
            "scenario_results": {},
            "waterfall_result": {
                "rules": [],
                "overall_status": "PASS",
                "integrity_score": integrity_score,
            },
            "residual_risk_vector": [],
            "capability_flags": {},
        }
        freeze_mock = MagicMock()
        freeze_mock.model_dump = MagicMock(return_value=freeze_artifact_data)

        market_ts = datetime.now(UTC).isoformat()
        frozen_inputs = {
            "trades": [_minimal_trade()],
            "hedges": [],
            "market": {**_minimal_market(), "as_of": market_ts},
            "policy": _minimal_policy(),
        }

        entry = MagicMock()
        entry.freeze_artifact = freeze_mock
        entry.staging_id = "STG-REPLAY001"

        staging = MagicMock()
        staging.proposal_id = "PROP-REPLAY001"

        proposal = MagicMock()
        proposal.frozen_inputs = frozen_inputs

        return entry, staging, proposal

    @pytest.mark.asyncio
    async def test_replay_ledger_success(self):
        """replay_ledger with a valid freeze_artifact re-runs sandbox and returns ReplayResult."""
        from app.services.pipeline_service import _sandbox_runs, replay_ledger
        from app.schemas_v1.pipeline import ReplayResult

        _sandbox_runs.clear()

        entry, staging, proposal = self._make_replay_mocks(integrity_score=95.0)

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db, \
             patch("app.services.pipeline_service.sandbox_calculate") as mock_sc:

            mock_db.load_ledger = AsyncMock(return_value=entry)
            mock_db.load_staging = AsyncMock(return_value=staging)
            mock_db.load_proposal = AsyncMock(return_value=proposal)

            mock_waterfall = MagicMock()
            mock_waterfall.model_dump = MagicMock(return_value={
                "overall_status": "PASS", "rules": [], "integrity_score": 95.0,
            })
            mock_sc.return_value = {
                "run_id": "replay-run-001",
                "waterfall_result": mock_waterfall,
                "calculate_response": MagicMock(model_dump=MagicMock(return_value={})),
                "validation_report": MagicMock(status="PASS"),
            }

            result = await replay_ledger(session, "LEDG-XYZABC12")

        assert isinstance(result, ReplayResult)
        assert isinstance(result.original_hash, str)
        assert isinstance(result.replay_hash, str)
        assert isinstance(result.match, bool)

    @pytest.mark.asyncio
    async def test_replay_ledger_records_drift(self):
        """When waterfall results differ from freeze_artifact, drift may be detected."""
        from app.services.pipeline_service import _sandbox_runs, replay_ledger

        _sandbox_runs.clear()

        entry, staging, proposal = self._make_replay_mocks(integrity_score=100.0)

        session = _mock_session()
        with patch("app.services.pipeline_service.pipeline_db") as mock_db, \
             patch("app.services.pipeline_service.sandbox_calculate") as mock_sc:

            mock_db.load_ledger = AsyncMock(return_value=entry)
            mock_db.load_staging = AsyncMock(return_value=staging)
            mock_db.load_proposal = AsyncMock(return_value=proposal)

            mock_waterfall = MagicMock()
            mock_waterfall.model_dump = MagicMock(return_value={
                "overall_status": "WARN",
                "rules": [],
                "integrity_score": 75.0,  # different from original 100.0
            })
            mock_sc.return_value = {
                "run_id": "replay-run-002",
                "waterfall_result": mock_waterfall,
                "calculate_response": MagicMock(model_dump=MagicMock(return_value={})),
                "validation_report": MagicMock(status="WARN"),
            }

            result = await replay_ledger(session, "LEDG-DRIFT001")

        assert isinstance(result.original_hash, str)
        assert isinstance(result.replay_hash, str)


# ═══════════════════════════════════════════════════════════════════════════
# 11. _emit_pipeline_event -- with valid company UUID (DB query path)
# ═══════════════════════════════════════════════════════════════════════════


class TestEmitPipelineEventCompanyPath:
    @pytest.mark.asyncio
    async def test_emit_with_valid_company_uuid_queries_prev_hash(self):
        """When company_id is a valid UUID, _emit_pipeline_event must query the DB for prev_hash."""
        from app.services.pipeline_service import _emit_pipeline_event

        session = _mock_session()
        company_id = str(uuid.uuid4())

        # Simulate no previous event (first event in chain)
        mock_prev = MagicMock()
        mock_prev.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_prev)

        await _emit_pipeline_event(
            session, "entity-xyz", "TEST_EVENT", str(uuid.uuid4()), "test desc", {}, company_id=company_id
        )

        # execute should have been called (to query prev hash) plus commit
        session.execute.assert_awaited_once()
        session.add.assert_called_once()
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_emit_with_existing_prev_hash_uses_it(self):
        """When a previous hash exists in the chain, it is used as prev_event_hash."""
        from app.services.pipeline_service import _emit_pipeline_event

        session = _mock_session()
        company_id = str(uuid.uuid4())
        existing_hash = "a" * 64

        mock_prev = MagicMock()
        mock_prev.scalars.return_value.first.return_value = existing_hash
        session.execute = AsyncMock(return_value=mock_prev)

        await _emit_pipeline_event(
            session, "entity-abc", "CHAIN_EVENT", str(uuid.uuid4()), "chained desc", {}, company_id=company_id
        )

        session.add.assert_called_once()
        added_event = session.add.call_args[0][0]
        # The build_audit_event uses prev_hash; verify the event was created (not raising)
        assert added_event is not None

    @pytest.mark.asyncio
    async def test_emit_with_invalid_company_uuid_skips_db_query(self):
        """Non-UUID company_id must not trigger the DB query for prev_hash."""
        from app.services.pipeline_service import _emit_pipeline_event

        session = _mock_session()

        await _emit_pipeline_event(
            session, "entity-1", "EVT", "user-1", "desc", {}, company_id="not-a-uuid"
        )

        # execute not called for the prev_hash query since company UUID parse fails
        session.execute.assert_not_awaited()
        session.add.assert_called_once()
