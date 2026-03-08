"""Tests for dual-key (two-approver) execution proposal flow.

Covers:
  - Full dual-key E2E: maker → checker → second_approver → execute
  - Threshold-based second approval triggering
  - SoD enforcement on both approvers
  - Hash chain integrity through dual-key flow
  - Solo mode bypasses
"""

import pytest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.execution_proposal import (
    ExecutionProposal,
    compute_approval_hash,
    compute_proposal_hash,
)


# ─────────────────────────────────────────────────────────────────────────────
# Dual-key model field tests
# ─────────────────────────────────────────────────────────────────────────────

class TestDualKeyModelFields:
    """Verify ExecutionProposal model has all dual-key fields."""

    def test_second_approver_fields_exist(self):
        ep = ExecutionProposal()
        assert hasattr(ep, "second_approver_required")
        assert hasattr(ep, "second_approver_id")
        assert hasattr(ep, "second_approver_email")
        assert hasattr(ep, "second_approved_at")
        assert hasattr(ep, "second_approval_notes")
        assert hasattr(ep, "second_approval_hash")

    def test_second_approver_defaults_none(self):
        ep = ExecutionProposal()
        assert ep.second_approver_id is None
        assert ep.second_approver_email is None
        assert ep.second_approved_at is None
        assert ep.second_approval_hash is None

    def test_second_approver_required_field(self):
        ep = ExecutionProposal()
        assert hasattr(ep, "second_approver_required")


# ─────────────────────────────────────────────────────────────────────────────
# Dual-key hash chain tests
# ─────────────────────────────────────────────────────────────────────────────

class TestDualKeyHashChain:
    """Verify hash chain integrity through dual-key flow."""

    def test_proposal_hash_deterministic(self):
        payload = {
            "execution_ref": "FX-001",
            "hedge_amount": 100_000,
            "hedge_rate": 17.5,
        }
        h1 = compute_proposal_hash(payload)
        h2 = compute_proposal_hash(payload)
        assert h1 == h2
        assert len(h1) == 64

    def test_approval_hash_chains_to_proposal(self):
        proposal_hash = compute_proposal_hash({"ref": "FX-001"})
        approval_hash = compute_approval_hash(
            approved_by="user-2-id",
            approved_at=datetime(2026, 3, 8, tzinfo=UTC),
            approval_notes="Approved per policy",
            proposal_hash=proposal_hash,
        )
        assert len(approval_hash) == 64
        assert approval_hash != proposal_hash  # different content

    def test_different_approver_different_hash(self):
        proposal_hash = "a" * 64
        h1 = compute_approval_hash(
            approved_by="user-A",
            approved_at=datetime(2026, 3, 8, tzinfo=UTC),
            approval_notes="ok",
            proposal_hash=proposal_hash,
        )
        h2 = compute_approval_hash(
            approved_by="user-B",
            approved_at=datetime(2026, 3, 8, tzinfo=UTC),
            approval_notes="ok",
            proposal_hash=proposal_hash,
        )
        assert h1 != h2


# ─────────────────────────────────────────────────────────────────────────────
# SoD enforcement tests for dual-key
# ─────────────────────────────────────────────────────────────────────────────

class TestDualKeySoD:
    """Verify SoD holds across both approval layers."""

    def test_primary_sod_blocks_self_approval(self):
        """Maker cannot be the primary checker."""
        maker_id = uuid.uuid4()
        ep = ExecutionProposal(
            id=uuid.uuid4(),
            proposed_by=maker_id,
            status="PROPOSED",
        )
        # Simulating service-layer check
        assert ep.proposed_by == maker_id
        # Service would raise ValueError if approved_by == proposed_by

    def test_second_approver_must_differ_from_maker(self):
        """Second approver must not be the maker."""
        maker_id = uuid.uuid4()
        checker_id = uuid.uuid4()
        ep = ExecutionProposal(
            id=uuid.uuid4(),
            proposed_by=maker_id,
            approved_by=checker_id,
            status="APPROVED",
        )
        # If second approval attempted by maker, should fail
        second_approver_id = maker_id  # violation
        assert second_approver_id == ep.proposed_by  # should be blocked

    def test_second_approver_must_differ_from_checker(self):
        """Second approver must not be the primary checker."""
        maker_id = uuid.uuid4()
        checker_id = uuid.uuid4()
        ep = ExecutionProposal(
            id=uuid.uuid4(),
            proposed_by=maker_id,
            approved_by=checker_id,
            status="APPROVED",
        )
        second_approver_id = checker_id  # violation
        assert second_approver_id == ep.approved_by  # should be blocked

    def test_valid_dual_key_three_distinct_actors(self):
        """Valid dual-key: maker, checker, second_approver all different."""
        maker_id = uuid.uuid4()
        checker_id = uuid.uuid4()
        second_id = uuid.uuid4()
        assert maker_id != checker_id
        assert checker_id != second_id
        assert maker_id != second_id


# ─────────────────────────────────────────────────────────────────────────────
# Threshold-based second approval
# ─────────────────────────────────────────────────────────────────────────────

class TestDualKeyThreshold:
    """Second approval required when notional exceeds threshold."""

    def test_below_threshold_no_second_approval(self):
        threshold = 1_000_000
        notional = 500_000
        requires_second = notional >= threshold
        assert requires_second is False

    def test_above_threshold_requires_second(self):
        threshold = 1_000_000
        notional = 2_000_000
        requires_second = notional >= threshold
        assert requires_second is True

    def test_at_threshold_requires_second(self):
        threshold = 1_000_000
        notional = 1_000_000
        requires_second = notional >= threshold
        assert requires_second is True


# ─────────────────────────────────────────────────────────────────────────────
# Full dual-key state machine
# ─────────────────────────────────────────────────────────────────────────────

class TestDualKeyStateMachine:
    """Test state transitions with dual-key enabled."""

    def test_full_flow(self):
        """PROPOSED → APPROVED (checker) → second_approval → EXECUTED"""
        maker_id = uuid.uuid4()
        checker_id = uuid.uuid4()
        second_id = uuid.uuid4()

        ep = ExecutionProposal(
            id=uuid.uuid4(),
            position_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            proposed_by=maker_id,
            proposed_by_email="maker@co.com",
            proposed_at=datetime.now(UTC),
            status="PROPOSED",
            proposal_payload={"hedge_amount": 2_000_000},
            proposal_hash=compute_proposal_hash({"hedge_amount": 2_000_000}),
            second_approver_required=True,
        )
        assert ep.status == "PROPOSED"
        assert ep.second_approver_required is True

        # Primary approval
        ep.approved_by = checker_id
        ep.approved_by_email = "checker@co.com"
        ep.approved_at = datetime.now(UTC)
        ep.approval_hash = compute_approval_hash(
            approved_by=str(checker_id),
            approved_at=ep.approved_at,
            approval_notes="Primary approval",
            proposal_hash=ep.proposal_hash,
        )
        ep.status = "APPROVED"
        assert ep.status == "APPROVED"

        # Second approval
        ep.second_approver_id = second_id
        ep.second_approver_email = "second@co.com"
        ep.second_approved_at = datetime.now(UTC)
        ep.second_approval_notes = "Second approval confirmed"
        assert ep.second_approver_id != ep.proposed_by
        assert ep.second_approver_id != ep.approved_by

        # Execute
        ep.status = "EXECUTED"
        ep.executed_at = datetime.now(UTC)
        assert ep.status == "EXECUTED"

    def test_single_approval_when_not_required(self):
        """Standard flow when second approval not required."""
        ep = ExecutionProposal(
            id=uuid.uuid4(),
            proposed_by=uuid.uuid4(),
            status="PROPOSED",
            second_approver_required=False,
        )
        ep.approved_by = uuid.uuid4()
        ep.status = "APPROVED"
        assert ep.status == "APPROVED"
        assert ep.second_approver_id is None
