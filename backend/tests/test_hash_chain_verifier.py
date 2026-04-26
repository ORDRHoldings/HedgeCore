"""
tests/test_hash_chain_verifier.py

Unit tests for:
  - app/services/hash_chain_verifier.py (verify_tenant_chain, verify_all_chains)
  - app/tasks/hash_chain_verify.py (run_hash_chain_verify_job)

Uses synthetic AuditEvent instances with real compute_event_hash() calls so
the hash values are consistent without needing a database.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.audit_event import GENESIS_HASH, AuditEvent, compute_event_hash
from app.services.hash_chain_verifier import (
    ChainBreak,
    ChainReport,
    verify_all_chains,
    verify_tenant_chain,
)
from app.tasks.hash_chain_verify import HashChainBrokenError, run_hash_chain_verify_job


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

_COMPANY = uuid.uuid4()
_NOW = datetime(2026, 1, 15, 10, 0, 0, tzinfo=UTC)


def _make_event(
    event_type: str = "LOGIN",
    actor_id: str | None = None,
    entity_id: str | None = None,
    payload: dict | None = None,
    prev_event_hash: str = GENESIS_HASH,
    created_at: datetime = _NOW,
    company_id: uuid.UUID = _COMPANY,
) -> AuditEvent:
    """Build a synthetic AuditEvent with a correctly computed event_hash."""
    payload = payload or {}
    ev = AuditEvent()
    ev.id = uuid.uuid4()
    ev.company_id = company_id
    ev.actor_id = uuid.UUID(actor_id) if actor_id else None
    ev.entity_id = entity_id
    ev.event_type = event_type
    ev.description = f"test {event_type}"
    ev.payload = payload
    ev.prev_event_hash = prev_event_hash
    ev.created_at = created_at
    ev.event_hash = compute_event_hash(
        event_type=event_type,
        actor_id=actor_id,
        entity_id=entity_id,
        payload=payload,
        created_at=created_at,
        prev_hash=prev_event_hash,
    )
    return ev


def _mock_session(events: list[AuditEvent]) -> AsyncMock:
    """Build an AsyncSession mock that returns `events` for any execute() call."""
    session = AsyncMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = events
    result_mock = MagicMock()
    result_mock.scalars.return_value = scalars_mock
    session.execute.return_value = result_mock
    return session


# ──────────────────────────────────────────────────────────────────────────────
# ChainReport
# ──────────────────────────────────────────────────────────────────────────────

class TestChainReport:
    def test_healthy_when_no_breaks(self):
        report = ChainReport(checked_at=_NOW, tenants_checked=1, events_checked=10)
        assert report.healthy is True

    def test_not_healthy_when_breaks_present(self):
        brk = ChainBreak(
            company_id=str(_COMPANY), event_id="abc", sequence_index=0,
            kind="hash_mismatch", detail="test",
        )
        report = ChainReport(
            checked_at=_NOW, tenants_checked=1, events_checked=5, breaks=[brk],
        )
        assert report.healthy is False

    def test_to_dict_structure(self):
        report = ChainReport(checked_at=_NOW, tenants_checked=2, events_checked=20)
        d = report.to_dict()
        assert d["tenants_checked"] == 2
        assert d["events_checked"] == 20
        assert d["healthy"] is True
        assert d["break_count"] == 0
        assert d["breaks"] == []

    def test_to_dict_with_break(self):
        brk = ChainBreak(
            company_id="c1", event_id="e1", sequence_index=3,
            kind="prev_hash_mismatch", detail="mismatch detail",
        )
        report = ChainReport(checked_at=_NOW, tenants_checked=1, events_checked=4, breaks=[brk])
        d = report.to_dict()
        assert d["healthy"] is False
        assert d["break_count"] == 1
        assert d["breaks"][0]["kind"] == "prev_hash_mismatch"


# ──────────────────────────────────────────────────────────────────────────────
# verify_tenant_chain
# ──────────────────────────────────────────────────────────────────────────────

class TestVerifyTenantChain:

    @pytest.mark.asyncio
    async def test_empty_chain_is_healthy(self):
        session = _mock_session([])
        breaks = await verify_tenant_chain(session, _COMPANY)
        assert breaks == []

    @pytest.mark.asyncio
    async def test_single_valid_event(self):
        ev = _make_event(prev_event_hash=GENESIS_HASH)
        session = _mock_session([ev])
        breaks = await verify_tenant_chain(session, _COMPANY)
        assert breaks == []

    @pytest.mark.asyncio
    async def test_two_valid_events_in_chain(self):
        ev1 = _make_event(event_type="LOGIN", prev_event_hash=GENESIS_HASH)
        ev2 = _make_event(event_type="LOGOUT", prev_event_hash=ev1.event_hash)
        session = _mock_session([ev1, ev2])
        breaks = await verify_tenant_chain(session, _COMPANY)
        assert breaks == []

    @pytest.mark.asyncio
    async def test_detects_hash_mismatch(self):
        """Tampered event_hash (record-level) raises hash_mismatch."""
        ev = _make_event(prev_event_hash=GENESIS_HASH)
        ev.event_hash = "a" * 64  # tampered
        session = _mock_session([ev])
        breaks = await verify_tenant_chain(session, _COMPANY)
        assert any(b.kind == "hash_mismatch" for b in breaks)

    @pytest.mark.asyncio
    async def test_detects_genesis_mismatch(self):
        """First event with wrong prev_event_hash (not GENESIS_HASH) raises genesis_mismatch."""
        ev = _make_event(prev_event_hash="b" * 64)  # wrong genesis
        # Recompute hash to match the wrong prev so only the linkage check fails
        ev.event_hash = compute_event_hash(
            event_type=ev.event_type,
            actor_id=str(ev.actor_id) if ev.actor_id else None,
            entity_id=ev.entity_id,
            payload=ev.payload,
            created_at=ev.created_at,
            prev_hash="b" * 64,
        )
        session = _mock_session([ev])
        breaks = await verify_tenant_chain(session, _COMPANY)
        assert any(b.kind == "genesis_mismatch" for b in breaks)

    @pytest.mark.asyncio
    async def test_detects_prev_hash_mismatch(self):
        """ev2.prev_event_hash doesn't match ev1.event_hash → prev_hash_mismatch."""
        ev1 = _make_event(event_type="LOGIN", prev_event_hash=GENESIS_HASH)
        # ev2 claims to follow something else
        ev2 = _make_event(event_type="LOGOUT", prev_event_hash="c" * 64)
        # Recompute ev2's hash consistently with its (wrong) prev
        ev2.event_hash = compute_event_hash(
            event_type=ev2.event_type,
            actor_id=str(ev2.actor_id) if ev2.actor_id else None,
            entity_id=ev2.entity_id,
            payload=ev2.payload,
            created_at=ev2.created_at,
            prev_hash="c" * 64,
        )
        session = _mock_session([ev1, ev2])
        breaks = await verify_tenant_chain(session, _COMPANY)
        assert any(b.kind == "prev_hash_mismatch" for b in breaks)

    @pytest.mark.asyncio
    async def test_break_contains_company_id(self):
        ev = _make_event(prev_event_hash=GENESIS_HASH)
        ev.event_hash = "d" * 64  # tampered
        session = _mock_session([ev])
        breaks = await verify_tenant_chain(session, _COMPANY)
        assert breaks[0].company_id == str(_COMPANY)


# ──────────────────────────────────────────────────────────────────────────────
# verify_all_chains
# ──────────────────────────────────────────────────────────────────────────────

class TestVerifyAllChains:

    @pytest.mark.asyncio
    async def test_no_tenants_returns_empty_report(self):
        session = AsyncMock()
        # First execute → tenant list (empty)
        tenant_result = MagicMock()
        tenant_result.all.return_value = []
        session.execute.return_value = tenant_result

        report = await verify_all_chains(session)
        assert report.tenants_checked == 0
        assert report.events_checked == 0
        assert report.healthy is True

    @pytest.mark.asyncio
    async def test_single_healthy_tenant(self):
        ev = _make_event()
        session = AsyncMock()

        # Call sequence: distinct company_ids → count query → scalars for events
        tenant_result = MagicMock()
        tenant_result.all.return_value = [(_COMPANY,)]

        count_result = MagicMock()
        count_result.all.return_value = [(ev.id,)]  # 1 event row

        scalars_result = MagicMock()
        scalars_result.all.return_value = [ev]
        chain_result = MagicMock()
        chain_result.scalars.return_value = scalars_result

        session.execute.side_effect = [tenant_result, count_result, chain_result]

        report = await verify_all_chains(session)
        assert report.tenants_checked == 1
        assert report.events_checked == 1
        assert report.healthy is True


# ──────────────────────────────────────────────────────────────────────────────
# run_hash_chain_verify_job
# ──────────────────────────────────────────────────────────────────────────────

class TestRunHashChainVerifyJob:

    @pytest.mark.asyncio
    async def test_healthy_chain_does_not_raise(self):
        healthy_report = ChainReport(
            checked_at=_NOW, tenants_checked=2, events_checked=100,
        )
        with patch("app.tasks.hash_chain_verify.async_session_maker") as mock_maker, \
             patch("app.tasks.hash_chain_verify.verify_all_chains", return_value=healthy_report):
            mock_session = AsyncMock()
            mock_maker.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_maker.return_value.__aexit__ = AsyncMock(return_value=False)
            # Should complete without raising
            await run_hash_chain_verify_job()

    @pytest.mark.asyncio
    async def test_broken_chain_raises_hash_chain_broken_error(self):
        brk = ChainBreak(
            company_id=str(_COMPANY), event_id="xyz", sequence_index=1,
            kind="hash_mismatch", detail="tampered",
        )
        broken_report = ChainReport(
            checked_at=_NOW, tenants_checked=1, events_checked=5, breaks=[brk],
        )
        with patch("app.tasks.hash_chain_verify.async_session_maker") as mock_maker, \
             patch("app.tasks.hash_chain_verify.verify_all_chains", return_value=broken_report):
            mock_session = AsyncMock()
            mock_maker.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_maker.return_value.__aexit__ = AsyncMock(return_value=False)
            with pytest.raises(HashChainBrokenError, match="1 hash-chain integrity break"):
                await run_hash_chain_verify_job()

    @pytest.mark.asyncio
    async def test_error_message_contains_break_count(self):
        breaks = [
            ChainBreak(str(_COMPANY), f"e{i}", i, "hash_mismatch", "t")
            for i in range(3)
        ]
        report = ChainReport(
            checked_at=_NOW, tenants_checked=1, events_checked=10, breaks=breaks,
        )
        with patch("app.tasks.hash_chain_verify.async_session_maker") as mock_maker, \
             patch("app.tasks.hash_chain_verify.verify_all_chains", return_value=report):
            mock_session = AsyncMock()
            mock_maker.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_maker.return_value.__aexit__ = AsyncMock(return_value=False)
            with pytest.raises(HashChainBrokenError, match="3 hash-chain"):
                await run_hash_chain_verify_job()
