"""
test_support_db_infra.py -- DB Infrastructure Validation for Support Ticketing

Tests:
  A) Schema: tables, columns, NOT NULL constraints, indexes
  B) Durability: ticket persists across new DB session
  C) Referential integrity: orphan event INSERT fails (FK violation)
  D) CHECK constraints: invalid severity/status rejected
  E) UNIQUE constraint: duplicate (company_id, ticket_ref) rejected
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app.core.db import async_engine

pytestmark = [pytest.mark.asyncio, pytest.mark.requires_postgres]


# ---------------------------------------------------------------------------
# A — Schema assertions
# ---------------------------------------------------------------------------

async def test_support_tickets_table_exists():
    """support_tickets table must exist in public schema."""
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = 'support_tickets'"
            )
        )
        rows = result.fetchall()
    assert len(rows) == 1, "support_tickets table not found in public schema"


async def test_ticket_events_table_exists():
    """ticket_events table must exist in public schema."""
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = 'ticket_events'"
            )
        )
        rows = result.fetchall()
    assert len(rows) == 1, "ticket_events table not found in public schema"


async def test_support_tickets_required_columns():
    """support_tickets must have all required columns with correct types and nullability."""
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT column_name, data_type, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'support_tickets'"
            )
        )
        rows = result.fetchall()

    col_map = {r[0]: {"data_type": r[1], "is_nullable": r[2]} for r in rows}

    expected = {
        "id": {"data_type": "uuid"},
        "company_id": {"data_type": "uuid", "is_nullable": "NO"},
        "submitted_by": {"data_type": "uuid", "is_nullable": "NO"},
        "ticket_ref": {"data_type": "character varying", "is_nullable": "NO"},
        "subject": {"data_type": "character varying", "is_nullable": "NO"},
        "description": {"data_type": "text", "is_nullable": "NO"},
        "severity": {"data_type": "character varying", "is_nullable": "NO"},
        "status": {"data_type": "character varying", "is_nullable": "NO"},
        "created_at": {"data_type": "timestamp with time zone", "is_nullable": "NO"},
        "updated_at": {"data_type": "timestamp with time zone", "is_nullable": "NO"},
    }

    for col_name, col_spec in expected.items():
        assert col_name in col_map, f"Column '{col_name}' missing from support_tickets"
        assert col_map[col_name]["data_type"] == col_spec["data_type"], (
            f"Column '{col_name}': expected type '{col_spec['data_type']}', "
            f"got '{col_map[col_name]['data_type']}'"
        )
        if "is_nullable" in col_spec:
            assert col_map[col_name]["is_nullable"] == col_spec["is_nullable"], (
                f"Column '{col_name}': expected is_nullable='{col_spec['is_nullable']}', "
                f"got '{col_map[col_name]['is_nullable']}'"
            )


async def test_ticket_events_required_columns():
    """ticket_events must have all required columns with correct types and NOT NULL constraints."""
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT column_name, data_type, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'ticket_events'"
            )
        )
        rows = result.fetchall()

    col_map = {r[0]: {"data_type": r[1], "is_nullable": r[2]} for r in rows}

    expected = {
        "id": {"data_type": "uuid", "is_nullable": "NO"},
        "ticket_id": {"data_type": "uuid", "is_nullable": "NO"},
        "company_id": {"data_type": "uuid", "is_nullable": "NO"},
        "event_type": {"data_type": "character varying", "is_nullable": "NO"},
        "created_at": {"data_type": "timestamp with time zone", "is_nullable": "NO"},
    }

    for col_name, col_spec in expected.items():
        assert col_name in col_map, f"Column '{col_name}' missing from ticket_events"
        assert col_map[col_name]["data_type"] == col_spec["data_type"], (
            f"Column '{col_name}': expected type '{col_spec['data_type']}', "
            f"got '{col_map[col_name]['data_type']}'"
        )
        assert col_map[col_name]["is_nullable"] == col_spec["is_nullable"], (
            f"Column '{col_name}': expected is_nullable='{col_spec['is_nullable']}', "
            f"got '{col_map[col_name]['is_nullable']}'"
        )


async def test_support_tickets_indexes_exist():
    """Required indexes must exist on support_tickets."""
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT indexname FROM pg_indexes "
                "WHERE schemaname = 'public' AND tablename = 'support_tickets'"
            )
        )
        rows = result.fetchall()

    index_names = {r[0] for r in rows}
    required = {"ix_tickets_tenant", "ix_tickets_status"}
    missing = required - index_names
    assert not missing, f"Missing indexes on support_tickets: {missing}"


async def test_ticket_events_index_exists():
    """ix_ticket_events_ticket index must exist on ticket_events."""
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT indexname FROM pg_indexes "
                "WHERE schemaname = 'public' AND tablename = 'ticket_events'"
            )
        )
        rows = result.fetchall()

    index_names = {r[0] for r in rows}
    assert "ix_ticket_events_ticket" in index_names, (
        f"Missing index ix_ticket_events_ticket on ticket_events. Found: {index_names}"
    )


# ---------------------------------------------------------------------------
# B — Durability: ticket survives across independent connections
# ---------------------------------------------------------------------------

async def test_ticket_durability_across_connections():
    """A ticket inserted in one connection must be readable in a fresh connection."""
    ticket_id = uuid.uuid4()
    company_id = uuid.uuid4()
    submitted_by = uuid.uuid4()
    ticket_ref = f"TKT-{uuid.uuid4().hex[:4].upper()}"

    # Insert using first connection
    async with async_engine.begin() as conn:
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
                "subject": "Durability test",
                "description": "Testing persistence across connections",
                "severity": "S3",
                "status": "OPEN",
            },
        )

    # Read back using a new independent connection
    async with async_engine.begin() as conn:
        result = await conn.execute(
            text("SELECT id, subject FROM support_tickets WHERE id = :id"),
            {"id": str(ticket_id)},
        )
        row = result.fetchone()

    assert row is not None, f"Ticket {ticket_id} not found after commit"
    assert str(row[0]) == str(ticket_id)
    assert row[1] == "Durability test"

    # Cleanup
    async with async_engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM support_tickets WHERE id = :id"),
            {"id": str(ticket_id)},
        )


# ---------------------------------------------------------------------------
# C — Referential integrity: orphan ticket_events INSERT must fail
# ---------------------------------------------------------------------------

async def test_ticket_events_fk_violation():
    """Inserting a ticket_event with a non-existent ticket_id must raise an FK exception."""
    nonexistent_ticket_id = uuid.uuid4()
    company_id = uuid.uuid4()
    event_id = uuid.uuid4()

    with pytest.raises(Exception):
        async with async_engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO ticket_events "
                    "(id, ticket_id, company_id, event_type, created_at) "
                    "VALUES (:id, :ticket_id, :company_id, :event_type, NOW())"
                ),
                {
                    "id": str(event_id),
                    "ticket_id": str(nonexistent_ticket_id),
                    "company_id": str(company_id),
                    "event_type": "CREATED",
                },
            )


# ---------------------------------------------------------------------------
# D — CHECK constraints: invalid severity and status must be rejected
# ---------------------------------------------------------------------------

async def test_invalid_severity_rejected():
    """INSERT with severity='S9' (not in S0-S4) must be rejected by a CHECK constraint."""
    ticket_id = uuid.uuid4()
    company_id = uuid.uuid4()
    submitted_by = uuid.uuid4()

    with pytest.raises(Exception):
        async with async_engine.begin() as conn:
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
                    "ticket_ref": f"TKT-ZCHK",
                    "subject": "Check constraint test",
                    "description": "Testing invalid severity",
                    "severity": "S9",
                    "status": "OPEN",
                },
            )


async def test_invalid_status_rejected():
    """INSERT with status='INVALID' must be rejected by a CHECK constraint."""
    ticket_id = uuid.uuid4()
    company_id = uuid.uuid4()
    submitted_by = uuid.uuid4()

    with pytest.raises(Exception):
        async with async_engine.begin() as conn:
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
                    "ticket_ref": f"TKT-ZSTS",
                    "subject": "Status constraint test",
                    "description": "Testing invalid status",
                    "severity": "S3",
                    "status": "INVALID",
                },
            )


# ---------------------------------------------------------------------------
# E — UNIQUE constraint: duplicate (company_id, ticket_ref) must be rejected
# ---------------------------------------------------------------------------

async def test_duplicate_company_ticket_ref_rejected():
    """Two tickets with the same (company_id, ticket_ref) must violate the UNIQUE constraint."""
    company_id = uuid.uuid4()
    submitted_by = uuid.uuid4()
    shared_ref = f"TKT-UNIQ"

    ticket_id_1 = uuid.uuid4()
    ticket_id_2 = uuid.uuid4()

    # First insert: must succeed
    async with async_engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO support_tickets "
                "(id, company_id, submitted_by, ticket_ref, subject, description, "
                " severity, status, created_at, updated_at) "
                "VALUES (:id, :company_id, :submitted_by, :ticket_ref, :subject, "
                ":description, :severity, :status, NOW(), NOW())"
            ),
            {
                "id": str(ticket_id_1),
                "company_id": str(company_id),
                "submitted_by": str(submitted_by),
                "ticket_ref": shared_ref,
                "subject": "First ticket",
                "description": "First entry for unique constraint test",
                "severity": "S3",
                "status": "OPEN",
            },
        )

    # Second insert with same (company_id, ticket_ref): must fail
    with pytest.raises(Exception):
        async with async_engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO support_tickets "
                    "(id, company_id, submitted_by, ticket_ref, subject, description, "
                    " severity, status, created_at, updated_at) "
                    "VALUES (:id, :company_id, :submitted_by, :ticket_ref, :subject, "
                    ":description, :severity, :status, NOW(), NOW())"
                ),
                {
                    "id": str(ticket_id_2),
                    "company_id": str(company_id),
                    "submitted_by": str(submitted_by),
                    "ticket_ref": shared_ref,
                    "subject": "Duplicate ticket",
                    "description": "Second entry — should violate UNIQUE constraint",
                    "severity": "S3",
                    "status": "OPEN",
                },
            )

    # Cleanup
    async with async_engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM support_tickets WHERE id = :id"),
            {"id": str(ticket_id_1)},
        )
