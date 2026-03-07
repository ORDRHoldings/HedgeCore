"""
tests/test_model_units.py

Unit tests for pure functions in model and service modules.
No database required — tests hash computation, event building, and determinism.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.models.audit_event import (
    GENESIS_HASH,
    build_audit_event,
    compute_event_hash,
)


# ---------------------------------------------------------------------------
# GENESIS_HASH
# ---------------------------------------------------------------------------

class TestGenesisHash:
    def test_is_64_zeros(self):
        assert GENESIS_HASH == "0" * 64
        assert len(GENESIS_HASH) == 64

    def test_all_zeros(self):
        assert set(GENESIS_HASH) == {"0"}


# ---------------------------------------------------------------------------
# compute_event_hash
# ---------------------------------------------------------------------------

class TestComputeEventHash:
    def test_returns_hex_string(self):
        h = compute_event_hash(
            event_type="SYSTEM",
            actor_id=None,
            entity_id=None,
            payload={},
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            prev_hash=GENESIS_HASH,
        )
        assert isinstance(h, str)
        assert len(h) == 64

    def test_deterministic(self):
        ts = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        kwargs = dict(
            event_type="CALCULATE",
            actor_id="user-123",
            entity_id="run-456",
            payload={"key": "value"},
            created_at=ts,
            prev_hash=GENESIS_HASH,
        )
        a = compute_event_hash(**kwargs)
        b = compute_event_hash(**kwargs)
        assert a == b

    def test_different_event_type_different_hash(self):
        ts = datetime(2026, 1, 1, tzinfo=timezone.utc)
        common = dict(actor_id=None, entity_id=None, payload={}, created_at=ts, prev_hash=GENESIS_HASH)
        h1 = compute_event_hash(event_type="SYSTEM", **common)
        h2 = compute_event_hash(event_type="LOGIN", **common)
        assert h1 != h2

    def test_different_payload_different_hash(self):
        ts = datetime(2026, 1, 1, tzinfo=timezone.utc)
        common = dict(event_type="SYSTEM", actor_id=None, entity_id=None, created_at=ts, prev_hash=GENESIS_HASH)
        h1 = compute_event_hash(payload={"x": 1}, **common)
        h2 = compute_event_hash(payload={"x": 2}, **common)
        assert h1 != h2

    def test_different_prev_hash_different_result(self):
        ts = datetime(2026, 1, 1, tzinfo=timezone.utc)
        common = dict(event_type="SYSTEM", actor_id=None, entity_id=None, payload={}, created_at=ts)
        h1 = compute_event_hash(prev_hash=GENESIS_HASH, **common)
        h2 = compute_event_hash(prev_hash="a" * 64, **common)
        assert h1 != h2

    def test_none_actor_and_entity(self):
        h = compute_event_hash(
            event_type="SYSTEM",
            actor_id=None,
            entity_id=None,
            payload={},
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            prev_hash=GENESIS_HASH,
        )
        assert isinstance(h, str)

    def test_payload_with_nested_dicts(self):
        h = compute_event_hash(
            event_type="SYSTEM",
            actor_id=None,
            entity_id=None,
            payload={"outer": {"inner": [1, 2, 3]}},
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            prev_hash=GENESIS_HASH,
        )
        assert len(h) == 64


# ---------------------------------------------------------------------------
# build_audit_event
# ---------------------------------------------------------------------------

class TestBuildAuditEvent:
    def test_returns_audit_event(self):
        from app.models.audit_event import AuditEvent
        event = build_audit_event(
            event_type="SYSTEM",
            description="Test event",
            payload={"test": True},
        )
        assert isinstance(event, AuditEvent)

    def test_event_has_hash(self):
        event = build_audit_event(
            event_type="CALCULATE",
            description="Calculation run",
            payload={"run_id": "abc"},
            entity_type="run",
            entity_id="abc-123",
        )
        assert len(event.event_hash) == 64
        assert event.prev_event_hash == GENESIS_HASH

    def test_event_with_custom_prev_hash(self):
        prev = "f" * 64
        event = build_audit_event(
            event_type="SYSTEM",
            description="Chained event",
            payload={},
            prev_event_hash=prev,
        )
        assert event.prev_event_hash == prev

    def test_event_with_actor(self):
        uid = uuid.uuid4()
        event = build_audit_event(
            event_type="LOGIN",
            description="User logged in",
            payload={},
            actor_id=uid,
            actor_email="user@test.com",
            actor_role="admin",
        )
        assert event.actor_id == uid
        assert event.actor_email == "user@test.com"
        assert event.actor_role == "admin"

    def test_event_with_entity(self):
        eid = uuid.uuid4()
        event = build_audit_event(
            event_type="LIFECYCLE",
            description="Position status changed",
            payload={"from": "NEW", "to": "POLICY_ASSIGNED"},
            entity_type="position",
            entity_id=eid,
        )
        assert event.entity_type == "position"
        assert event.entity_id == str(eid)

    def test_event_with_request_metadata(self):
        event = build_audit_event(
            event_type="SYSTEM",
            description="Health check",
            payload={},
            request_id="req-xyz",
            ip_address="192.168.1.1",
        )
        assert event.request_id == "req-xyz"
        assert event.ip_address == "192.168.1.1"

    def test_created_at_is_recent(self):
        event = build_audit_event(
            event_type="SYSTEM",
            description="Test",
            payload={},
        )
        assert event.created_at is not None
        # Should be within last 5 seconds
        delta = (datetime.now(timezone.utc) - event.created_at).total_seconds()
        assert delta < 5.0

    def test_consecutive_events_chain(self):
        e1 = build_audit_event(event_type="SYSTEM", description="First", payload={})
        e2 = build_audit_event(
            event_type="SYSTEM",
            description="Second",
            payload={},
            prev_event_hash=e1.event_hash,
        )
        assert e2.prev_event_hash == e1.event_hash
        assert e2.event_hash != e1.event_hash

    def test_company_and_branch(self):
        cid = uuid.uuid4()
        bid = uuid.uuid4()
        event = build_audit_event(
            event_type="SYSTEM",
            description="Org event",
            payload={},
            company_id=cid,
            branch_id=bid,
        )
        assert event.company_id == cid
        assert event.branch_id == bid


# ---------------------------------------------------------------------------
# Hash chain integrity simulation
# ---------------------------------------------------------------------------

class TestHashChainIntegrity:
    def test_chain_of_three(self):
        events = []
        prev = GENESIS_HASH
        for i in range(3):
            e = build_audit_event(
                event_type="SYSTEM",
                description=f"Event {i}",
                payload={"seq": i},
                prev_event_hash=prev,
            )
            events.append(e)
            prev = e.event_hash

        # Verify chain links
        assert events[0].prev_event_hash == GENESIS_HASH
        assert events[1].prev_event_hash == events[0].event_hash
        assert events[2].prev_event_hash == events[1].event_hash

        # All hashes unique
        hashes = {e.event_hash for e in events}
        assert len(hashes) == 3

    def test_tampered_payload_breaks_chain(self):
        e1 = build_audit_event(
            event_type="CALCULATE",
            description="Original",
            payload={"amount": 100},
        )
        original_hash = e1.event_hash

        # Recompute with tampered payload
        tampered_hash = compute_event_hash(
            event_type="CALCULATE",
            actor_id=None,
            entity_id=None,
            payload={"amount": 999},  # tampered
            created_at=e1.created_at,
            prev_hash=GENESIS_HASH,
        )
        assert tampered_hash != original_hash
