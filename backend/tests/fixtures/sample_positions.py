"""
Sample Position Fixtures — reusable across tests.

Provides deterministic, well-typed position objects for every lifecycle state.
Each fixture has known UUIDs so tests can assert specific IDs.

Usage:
    from tests.fixtures.sample_positions import FIXTURES, make_position

    pos_new = FIXTURES["NEW"]
    pos_custom = make_position(execution_status="HEDGED", currency="GBP")
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any


# ── Deterministic UUIDs ───────────────────────────────────────────────────────

COMPANY_ID   = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
BRANCH_ID    = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")
USER_ID      = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
POLICY_ID    = uuid.UUID("dddddddd-0000-0000-0000-000000000001")

POS_NEW_ID           = uuid.UUID("11111111-0000-0000-0000-000000000001")
POS_ASSIGNED_ID      = uuid.UUID("22222222-0000-0000-0000-000000000001")
POS_READY_ID         = uuid.UUID("33333333-0000-0000-0000-000000000001")
POS_HEDGED_ID        = uuid.UUID("44444444-0000-0000-0000-000000000001")
POS_REJECTED_ID      = uuid.UUID("55555555-0000-0000-0000-000000000001")
POS_DELETABLE_ID     = uuid.UUID("66666666-0000-0000-0000-000000000001")
POS_NOT_DELETABLE_ID = uuid.UUID("77777777-0000-0000-0000-000000000001")
POS_WITH_REFS_ID     = uuid.UUID("88888888-0000-0000-0000-000000000001")


# ── FakePosition class ───────────────────────────────────────────────────────

class FakePosition:
    """
    Mimics a Position SQLAlchemy model for Pydantic from_attributes serialization.
    Compatible with PositionResponse schema.
    """

    def __init__(
        self,
        *,
        pid: uuid.UUID | None = None,
        record_id: str = "POS-001",
        entity: str = "Acme Corp",
        flow_type: str = "AR",
        currency: str = "EUR",
        amount: float = 100_000.0,
        value_date: str = "2026-06-30",
        status: str = "CONFIRMED",
        execution_status: str = "NEW",
        description: str | None = None,
        policy_id: uuid.UUID | None = None,
        last_run_id: str | None = None,
        executed_at: datetime | None = None,
        execution_ref: str | None = None,
        hedge_amount: float | None = None,
        hedge_rate: float | None = None,
        rejection_reason: str | None = None,
        is_active: bool = True,
    ):
        self.id               = pid or uuid.uuid4()
        self.company_id       = COMPANY_ID
        self.branch_id        = BRANCH_ID
        self.created_by       = USER_ID
        self.record_id        = record_id
        self.entity           = entity
        self.flow_type        = flow_type
        self.currency         = currency
        self.amount           = amount
        self.value_date       = value_date
        self.status           = status
        self.description      = description
        self.is_active        = is_active
        self.created_at       = datetime(2026, 1, 1, tzinfo=UTC)
        self.updated_at       = datetime(2026, 1, 1, tzinfo=UTC)
        self.execution_status = execution_status
        self.policy_id        = policy_id
        self.last_run_id      = last_run_id
        self.executed_at      = executed_at
        self.execution_ref    = execution_ref
        self.hedge_amount     = hedge_amount
        self.hedge_rate       = hedge_rate
        self.rejection_reason = rejection_reason

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict for API response assertions."""
        return {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "branch_id": str(self.branch_id),
            "created_by": str(self.created_by),
            "record_id": self.record_id,
            "entity": self.entity,
            "flow_type": self.flow_type,
            "currency": self.currency,
            "amount": self.amount,
            "value_date": self.value_date,
            "status": self.status,
            "description": self.description,
            "is_active": self.is_active,
            "execution_status": self.execution_status,
            "policy_id": str(self.policy_id) if self.policy_id else None,
            "last_run_id": self.last_run_id,
            "executed_at": self.executed_at.isoformat() if self.executed_at else None,
            "execution_ref": self.execution_ref,
            "hedge_amount": self.hedge_amount,
            "hedge_rate": self.hedge_rate,
            "rejection_reason": self.rejection_reason,
        }


def make_position(**overrides: Any) -> FakePosition:
    """Create a FakePosition with optional overrides."""
    return FakePosition(**overrides)


# ── Pre-built fixtures ────────────────────────────────────────────────────────

FIXTURES: dict[str, FakePosition] = {
    # Fresh position, no policy, no refs
    "NEW": FakePosition(
        pid=POS_NEW_ID,
        record_id="FX-NEW-001",
        entity="New Corp",
        execution_status="NEW",
        currency="EUR",
        amount=500_000.0,
    ),

    # Policy assigned, has policy_id
    "POLICY_ASSIGNED": FakePosition(
        pid=POS_ASSIGNED_ID,
        record_id="FX-ASSIGNED-001",
        entity="Assigned Corp",
        execution_status="POLICY_ASSIGNED",
        currency="GBP",
        amount=250_000.0,
        policy_id=POLICY_ID,
    ),

    # Ready to execute, has run_id and hedge fields
    "READY_TO_EXECUTE": FakePosition(
        pid=POS_READY_ID,
        record_id="FX-READY-001",
        entity="Ready Corp",
        execution_status="READY_TO_EXECUTE",
        currency="MXN",
        amount=10_000_000.0,
        policy_id=POLICY_ID,
        last_run_id="run-ready-001",
        hedge_amount=9_500_000.0,
        hedge_rate=17.85,
    ),

    # Fully hedged — terminal state, immutable
    "HEDGED": FakePosition(
        pid=POS_HEDGED_ID,
        record_id="FX-HEDGED-001",
        entity="Hedged Corp",
        execution_status="HEDGED",
        currency="JPY",
        amount=50_000_000.0,
        policy_id=POLICY_ID,
        last_run_id="run-hedged-001",
        executed_at=datetime(2026, 3, 1, 14, 30, tzinfo=UTC),
        execution_ref="IBKR-12345",
        hedge_amount=48_000_000.0,
        hedge_rate=148.50,
    ),

    # Rejected with reason
    "REJECTED": FakePosition(
        pid=POS_REJECTED_ID,
        record_id="FX-REJECTED-001",
        entity="Rejected Corp",
        execution_status="REJECTED",
        currency="CAD",
        amount=750_000.0,
        rejection_reason="Duplicate exposure — already hedged in batch 42",
    ),

    # Deletable: REJECTED + is_active=True
    "DELETABLE": FakePosition(
        pid=POS_DELETABLE_ID,
        record_id="FX-DELETE-001",
        entity="Deletable Corp",
        execution_status="REJECTED",
        currency="CHF",
        amount=100_000.0,
        rejection_reason="Error in data entry",
    ),

    # NOT deletable: NEW state (only REJECTED can be deleted)
    "NOT_DELETABLE": FakePosition(
        pid=POS_NOT_DELETABLE_ID,
        record_id="FX-NODELETE-001",
        entity="Protected Corp",
        execution_status="NEW",
        currency="AUD",
        amount=300_000.0,
    ),

    # Has all reference fields populated
    "WITH_REFS": FakePosition(
        pid=POS_WITH_REFS_ID,
        record_id="FX-REFS-001",
        entity="Full Refs Corp",
        execution_status="HEDGED",
        currency="NZD",
        amount=200_000.0,
        policy_id=POLICY_ID,
        last_run_id="run-refs-001",
        executed_at=datetime(2026, 3, 5, 9, 0, tzinfo=UTC),
        execution_ref="IBKR-67890",
        hedge_amount=195_000.0,
        hedge_rate=0.5850,
    ),
}


# ── Lifecycle transition test helpers ─────────────────────────────────────────

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "NEW":              {"POLICY_ASSIGNED", "REJECTED"},
    "POLICY_ASSIGNED":  {"READY_TO_EXECUTE", "REJECTED", "NEW", "POLICY_ASSIGNED"},  # allow re-assign
    "READY_TO_EXECUTE": {"HEDGED", "REJECTED", "POLICY_ASSIGNED"},
    "HEDGED":           set(),  # terminal
    "REJECTED":         {"NEW"},
}

DELETABLE_STATES = {"REJECTED"}

ALL_STATES = list(ALLOWED_TRANSITIONS.keys())
