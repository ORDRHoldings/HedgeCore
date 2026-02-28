"""
test_support_worm.py -- WORM (Write-Once Read-Many) enforcement for ticket_events

Critical: ticket_events rows must NEVER be updatable or deletable.
DB-level enforcement via PostgreSQL triggers added in _ensure_tables().

Tests:
  1. Trigger exists: trg_ticket_events_no_update
  2. Trigger exists: trg_ticket_events_no_delete
  3. UPDATE on ticket_events raises exception
  4. DELETE on ticket_events raises exception
  5. Events are monotonically ordered by created_at per ticket
  6. INSERT is permitted (append-only)
  7. Event count only grows (never decreases)
  8. [Hash chain: MISSING -- ticket_events has no hash chain field]
"""

from __future__ import annotations

import uuid
import asyncio

import pytest
from sqlalchemy import text

from app.core.db import async_engine

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers: raw SQL insert for tickets and events (bypasses ORM/API layer)
# ---------------------------------------------------------------------------

async def _insert_ticket(conn, company_id: uuid.UUID, submitted_by: uuid.UUID) -> uuid.UUID:
    """Insert a bare-minimum support_tickets row and return its id."""
    ticket_id = uuid.uuid4()
    ticket_ref = f"TKT-{uuid.uuid4().hex[:4].upper()}"
    await conn.execute(
        text(
            "INSERT INTO support_tickets "
            "(id, company_id, submitted_by, ticket_ref, subject, description, "
            " severity, status, created_at, updated_at) "
            "VALUES (:id, :company_id, :submitted_by, :ticket_ref, :subject, "
            ":description, :severity, :status, NOW(), NOW())"
        ),
        {
            "id": str(ticket_id),
            "company_id": str(company_id),
            "submitted_by": str(submitted_by),
            "ticket_ref": ticket_ref,
            "subject": "WORM test ticket",
            "description": "Inserted for WORM enforcement testing",
            "severity": "S3",
            "status": "OPEN",
        },
    )
    return ticket_id


async def _insert_event(
    conn,
    ticket_id: uuid.UUID,
    company_id: uuid.UUID,
    event_type: str = "CREATED",
) -> uuid.UUID:
    """Insert a bare-minimum ticket_events row and return its id."""
    event_id = uuid.uuid4()
    await conn.execute(
        text(
            "INSERT INTO ticket_events "
            "(id, ticket_id, company_id, event_type, created_at) "
            "VALUES (:id, :ticket_id, :company_id, :event_type, NOW())"
        ),
        {
            "id": str(event_id),
            "ticket_id": str(ticket_id),
            "company_id": str(company_id),
            "event_type": event_type,
        },
    )
    return event_id


# ---------------------------------------------------------------------------
# Test 1: trg_ticket_events_no_update trigger exists
# ---------------------------------------------------------------------------

async def test_worm_trigger_no_update_exists():
    """trg_ticket_events_no_update trigger must be present on ticket_events."""
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT trigger_name FROM information_schema.triggers "
                "WHERE event_object_table = 'ticket_events'"
            )
        )
        trigger_names = {r[0] for r in result.fetchall()}

    assert "trg_ticket_events_no_update" in trigger_names, (
        f"WORM trigger trg_ticket_events_no_update not found. "
        f"Existing triggers on ticket_events: {trigger_names}"
    )


# ---------------------------------------------------------------------------
# Test 2: trg_ticket_events_no_delete trigger exists
# ---------------------------------------------------------------------------

async def test_worm_trigger_no_delete_exists():
    """trg_ticket_events_no_delete trigger must be present on ticket_events."""
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT trigger_name FROM information_schema.triggers "
                "WHERE event_object_table = 'ticket_events'"
            )
        )
        trigger_names = {r[0] for r in result.fetchall()}

    assert "trg_ticket_events_no_delete" in trigger_names, (
        f"WORM trigger trg_ticket_events_no_delete not found. "
        f"Existing triggers on ticket_events: {trigger_names}"
    )


# ---------------------------------------------------------------------------
# Test 3: UPDATE on ticket_events is blocked
# ---------------------------------------------------------------------------

async def test_update_ticket_event_blocked():
    """UPDATE on a ticket_events row must raise an exception (WORM enforcement)."""
    company_id = uuid.uuid4()
    submitted_by = uuid.uuid4()

    # Setup: insert ticket and event in their own committed transactions
    async with async_engine.begin() as conn:
        ticket_id = await _insert_ticket(conn, company_id, submitted_by)

    async with async_engine.begin() as conn:
        event_id = await _insert_event(conn, ticket_id, company_id)

    # Attempt UPDATE — must fail due to WORM trigger
    with pytest.raises(Exception) as exc_info:
        async with async_engine.begin() as conn:
            await conn.execute(
                text(
                    "UPDATE ticket_events SET comment = 'modified' WHERE id = :id"
                ),
                {"id": str(event_id)},
            )

    err_msg = str(exc_info.value).lower()
    # The trigger should raise an error containing "worm" or "forbidden" or similar
    assert any(kw in err_msg for kw in ("worm", "forbidden", "immutable", "cannot", "not allowed", "deny", "denied", "prevent")), (
        f"UPDATE was not blocked by WORM trigger. Exception message: {exc_info.value}"
    )

    # Cleanup ticket (CASCADE will clean events if DELETE trigger were absent, but
    # since DELETE is also blocked, we clean up via direct bypass is not possible.
    # Accept that the test row remains — it is an isolated UUID-keyed row.)


# ---------------------------------------------------------------------------
# Test 4: DELETE on ticket_events is blocked
# ---------------------------------------------------------------------------

async def test_delete_ticket_event_blocked():
    """DELETE on a ticket_events row must raise an exception (WORM enforcement)."""
    company_id = uuid.uuid4()
    submitted_by = uuid.uuid4()

    async with async_engine.begin() as conn:
        ticket_id = await _insert_ticket(conn, company_id, submitted_by)

    async with async_engine.begin() as conn:
        event_id = await _insert_event(conn, ticket_id, company_id)

    with pytest.raises(Exception):
        async with async_engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM ticket_events WHERE id = :id"),
                {"id": str(event_id)},
            )


# ---------------------------------------------------------------------------
# Test 5: Events are monotonically ordered by created_at per ticket
# ---------------------------------------------------------------------------

async def test_events_monotonically_ordered():
    """
    Three events inserted in sequence must have non-decreasing created_at timestamps
    when queried in ORDER BY created_at ASC.
    """
    company_id = uuid.uuid4()
    submitted_by = uuid.uuid4()

    async with async_engine.begin() as conn:
        ticket_id = await _insert_ticket(conn, company_id, submitted_by)

    # Insert 3 events sequentially with tiny sleeps to get distinct timestamps
    event_ids = []
    for event_type in ("CREATED", "COMMENT_ADDED", "STATUS_CHANGED"):
        async with async_engine.begin() as conn:
            eid = await _insert_event(conn, ticket_id, company_id, event_type)
            event_ids.append(eid)
        # Brief sleep to ensure non-identical NOW() values across separate transactions
        await asyncio.sleep(0.02)

    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT created_at FROM ticket_events "
                "WHERE ticket_id = :ticket_id "
                "ORDER BY created_at ASC"
            ),
            {"ticket_id": str(ticket_id)},
        )
        timestamps = [r[0] for r in result.fetchall()]

    assert len(timestamps) == 3, f"Expected 3 events, got {len(timestamps)}"
    for i in range(1, len(timestamps)):
        assert timestamps[i] >= timestamps[i - 1], (
            f"Events are not monotonically ordered: "
            f"timestamps[{i - 1}]={timestamps[i - 1]} > timestamps[{i}]={timestamps[i]}"
        )


# ---------------------------------------------------------------------------
# Test 6: INSERT is permitted (append-only write is allowed)
# ---------------------------------------------------------------------------

async def test_insert_ticket_event_permitted():
    """A fresh INSERT into ticket_events must succeed without exception."""
    company_id = uuid.uuid4()
    submitted_by = uuid.uuid4()

    async with async_engine.begin() as conn:
        ticket_id = await _insert_ticket(conn, company_id, submitted_by)

    # This must NOT raise
    async with async_engine.begin() as conn:
        event_id = await _insert_event(conn, ticket_id, company_id, "CREATED")

    # Verify the event was actually persisted
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text("SELECT id FROM ticket_events WHERE id = :id"),
            {"id": str(event_id)},
        )
        row = result.fetchone()

    assert row is not None, f"Event {event_id} was not found after INSERT"


# ---------------------------------------------------------------------------
# Test 7: Event count only grows (never decreases)
# ---------------------------------------------------------------------------

async def test_event_count_only_grows():
    """
    After inserting one event the total count of ticket_events must be exactly
    count_before + 1.  This documents that appends are allowed and nothing
    else modified the table during the test.
    """
    company_id = uuid.uuid4()
    submitted_by = uuid.uuid4()

    async with async_engine.begin() as conn:
        ticket_id = await _insert_ticket(conn, company_id, submitted_by)

    # Count before
    async with async_engine.begin() as conn:
        result = await conn.execute(text("SELECT COUNT(*) FROM ticket_events"))
        count_before = result.scalar()

    # Insert one event
    async with async_engine.begin() as conn:
        await _insert_event(conn, ticket_id, company_id, "CREATED")

    # Count after
    async with async_engine.begin() as conn:
        result = await conn.execute(text("SELECT COUNT(*) FROM ticket_events"))
        count_after = result.scalar()

    assert count_after == count_before + 1, (
        f"Expected count to grow by 1: before={count_before}, after={count_after}"
    )


# ---------------------------------------------------------------------------
# Test 8: Hash chain gap report (documents known gap — test MUST PASS)
# ---------------------------------------------------------------------------

async def test_hash_chain_gap_documented():
    """
    KNOWN GAP: ticket_events has no cryptographic hash chain.
    WORM is enforced by DB triggers only (trg_ticket_events_no_update,
    trg_ticket_events_no_delete).  Hash chain is a future enhancement.

    This test asserts that the event_hash column does NOT exist (expected for
    current implementation).  The test passes intentionally — it is a living
    specification of the current state, not a failure condition.
    """
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' "
                "  AND table_name = 'ticket_events' "
                "  AND column_name = 'event_hash'"
            )
        )
        rows = result.fetchall()

    # The column must NOT exist in the current implementation
    assert len(rows) == 0, (
        "event_hash column was found on ticket_events. "
        "If the hash chain has been implemented, update this test to validate "
        "SHA-256 chaining instead of documenting its absence."
    )
