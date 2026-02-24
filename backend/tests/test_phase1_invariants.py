"""
test_phase1_invariants.py
Phase 1 Invariant Test Suite -- Sprint 1.0 (Policy Revisions) + Sprint 1.1 (4-Eyes Proposals)

INSTITUTIONAL PRINCIPLE: These tests prove the institutional guarantees at the
model and service layer, independently of HTTP transport. If any test here fails,
the regulated backbone is broken.

Sprint 1.0 -- Policy Version Pinning Invariants:
  TestPolicyHashDeterminism        -- same config -> same hash (deterministic)
  TestPolicyHashTamperDetection    -- any config change -> different hash
  TestPolicyRevisionFactory        -- factory produces valid WORM fields
  TestPolicyDiffEngine             -- diff correctly classifies added/removed/changed
  TestPolicyDiffIdentical          -- identical configs -> is_identical = True

Sprint 1.1 -- 4-Eyes Execution Proposal Invariants:
  TestProposalStateMachine         -- valid transitions only
  TestProposalIllegalTransitions   -- illegal transitions raise ValueError
  TestProposalTerminalStates       -- terminal states have no outgoing transitions
  TestProposalHashDeterminism      -- proposal_hash and approval_hash are deterministic
  TestProposalHashChaining         -- approval_hash binds to proposal_hash
  TestProposalApprovalHashTamper   -- changing any approval field invalidates hash
  TestSoDConstraintAtModel         -- DB CHECK constraint string is correct

Total: 37 tests
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from copy import deepcopy

import pytest

# ---------------------------------------------------------------------------
# Sprint 1.0 -- Policy Revision model
# ---------------------------------------------------------------------------
from app.models.policy_revision import (
    PolicyRevision,
    build_policy_revision,
    compute_policy_hash,
)
from app.services.policy_revision_service import compute_diff, _flatten

# ---------------------------------------------------------------------------
# Sprint 1.1 -- Execution Proposal model
# ---------------------------------------------------------------------------
from app.models.execution_proposal import (
    ExecutionProposal,
    PROPOSAL_STATUSES,
    PROPOSAL_TRANSITIONS,
    _assert_proposal_transition,
    compute_proposal_hash,
    compute_approval_hash,
)


# ???????????????????????????????????????????????????????????????????????????
# Sprint 1.0 -- Policy Hash Invariants
# ???????????????????????????????????????????????????????????????????????????

class TestPolicyHashDeterminism:
    """SHA-256 of canonical policy config is deterministic."""

    def test_same_flat_config_same_hash(self):
        config = {"hedge_ratio": 0.8, "currency": "MXN", "maturity": "3M"}
        h1 = compute_policy_hash(config)
        h2 = compute_policy_hash(config)
        assert h1 == h2, "Same config must produce identical hash"

    def test_same_nested_config_same_hash(self):
        config = {"hedge_ratios": {"3M": 0.8, "6M": 0.7}, "instruments": ["FUT"]}
        assert compute_policy_hash(config) == compute_policy_hash(config)

    def test_key_order_independent(self):
        config_a = {"b": 2, "a": 1}
        config_b = {"a": 1, "b": 2}
        assert compute_policy_hash(config_a) == compute_policy_hash(config_b), \
            "canonical_json uses sort_keys -- hash must be order-independent"

    def test_hash_is_64_hex_chars(self):
        h = compute_policy_hash({"x": 1})
        assert len(h) == 64
        int(h, 16)  # must be valid hex


class TestPolicyHashTamperDetection:
    """Any config mutation produces a different hash."""

    def test_value_change_changes_hash(self):
        config = {"hedge_ratio": 0.8}
        mutated = {"hedge_ratio": 0.81}
        assert compute_policy_hash(config) != compute_policy_hash(mutated)

    def test_key_added_changes_hash(self):
        config = {"hedge_ratio": 0.8}
        mutated = {**config, "new_field": True}
        assert compute_policy_hash(config) != compute_policy_hash(mutated)

    def test_key_removed_changes_hash(self):
        config = {"hedge_ratio": 0.8, "currency": "MXN"}
        mutated = {"hedge_ratio": 0.8}
        assert compute_policy_hash(config) != compute_policy_hash(mutated)

    def test_nested_change_changes_hash(self):
        config = {"ratios": {"3M": 0.8}}
        mutated = {"ratios": {"3M": 0.85}}
        assert compute_policy_hash(config) != compute_policy_hash(mutated)


class TestPolicyRevisionFactory:
    """build_policy_revision() produces a correctly structured WORM row."""

    def _make_revision(self, revision=1, prev_id=None):
        company_id = uuid.uuid4()
        template_id = uuid.uuid4()
        instance_id = uuid.uuid4()
        created_by = uuid.uuid4()
        config = {"hedge_ratio": 0.75, "instruments": ["FUT", "NDF"]}
        return build_policy_revision(
            policy_instance_id=instance_id,
            template_id=template_id,
            company_id=company_id,
            branch_id=None,
            canonical_policy=config,
            created_by=created_by,
            created_by_email="maker@example.com",
            change_reason="Initial activation",
            prev_revision_id=prev_id,
            revision=revision,
        ), config

    def test_factory_returns_policy_revision_instance(self):
        rev, _ = self._make_revision()
        assert isinstance(rev, PolicyRevision)

    def test_policy_hash_matches_config(self):
        rev, config = self._make_revision()
        expected = compute_policy_hash(config)
        assert rev.policy_hash == expected, "policy_hash must equal SHA-256(canonical_json(config))"

    def test_revision_number_set(self):
        rev, _ = self._make_revision(revision=3)
        assert rev.revision == 3

    def test_prev_revision_id_chained(self):
        parent_id = uuid.uuid4()
        rev, _ = self._make_revision(revision=2, prev_id=parent_id)
        assert rev.prev_revision_id == parent_id

    def test_no_prev_revision_is_none(self):
        rev, _ = self._make_revision(revision=1)
        assert rev.prev_revision_id is None

    def test_canonical_policy_stored(self):
        config = {"hedge_ratio": 0.75, "instruments": ["FUT", "NDF"]}
        rev, _ = self._make_revision()
        assert rev.canonical_policy is not None

    def test_created_at_set(self):
        rev, _ = self._make_revision()
        assert rev.created_at is not None


# ???????????????????????????????????????????????????????????????????????????
# Sprint 1.0 -- Policy Diff Engine
# ???????????????????????????????????????????????????????????????????????????

class TestPolicyDiffEngine:
    """compute_diff() correctly classifies config mutations."""

    def test_added_field_detected(self):
        a = {"hedge_ratio": 0.8}
        b = {"hedge_ratio": 0.8, "new_field": True}
        diff = compute_diff(a, b)
        fields = [f["field"] for f in diff["fields_added"]]
        assert "new_field" in fields
        assert diff["fields_removed"] == []
        assert diff["fields_changed"] == []
        assert diff["is_identical"] is False

    def test_removed_field_detected(self):
        a = {"hedge_ratio": 0.8, "old_field": True}
        b = {"hedge_ratio": 0.8}
        diff = compute_diff(a, b)
        fields = [f["field"] for f in diff["fields_removed"]]
        assert "old_field" in fields

    def test_changed_value_detected(self):
        a = {"hedge_ratio": 0.8}
        b = {"hedge_ratio": 0.9}
        diff = compute_diff(a, b)
        changed = diff["fields_changed"]
        assert len(changed) == 1
        assert changed[0]["field"] == "hedge_ratio"
        assert changed[0]["old"] == 0.8
        assert changed[0]["new"] == 0.9

    def test_nested_change_detected_dot_notation(self):
        a = {"ratios": {"3M": 0.8, "6M": 0.7}}
        b = {"ratios": {"3M": 0.85, "6M": 0.7}}
        diff = compute_diff(a, b)
        changed_fields = [c["field"] for c in diff["fields_changed"]]
        assert "ratios.3M" in changed_fields

    def test_hash_a_and_hash_b_present(self):
        a = {"x": 1}
        b = {"x": 2}
        diff = compute_diff(a, b)
        assert "hash_a" in diff and "hash_b" in diff
        assert diff["hash_a"] != diff["hash_b"]

    def test_summary_mentions_change_count(self):
        a = {"hedge_ratio": 0.8}
        b = {"hedge_ratio": 0.9}
        diff = compute_diff(a, b)
        assert "1 field(s) changed" in diff["summary"]


class TestPolicyDiffIdentical:
    """Identical configs are recognized as identical."""

    def test_identical_flat(self):
        config = {"hedge_ratio": 0.8, "currency": "MXN"}
        diff = compute_diff(config, config)
        assert diff["is_identical"] is True
        assert diff["fields_added"] == []
        assert diff["fields_removed"] == []
        assert diff["fields_changed"] == []

    def test_identical_nested(self):
        config = {"ratios": {"3M": 0.8}, "instruments": ["FUT"]}
        diff = compute_diff(config, deepcopy(config))
        assert diff["is_identical"] is True


class TestFlattenHelper:
    """_flatten() produces correct dot-notation keys."""

    def test_flat_dict(self):
        flat = _flatten({"a": 1, "b": 2})
        assert flat == {"a": 1, "b": 2}

    def test_nested_dict(self):
        flat = _flatten({"outer": {"inner": 42}})
        assert flat == {"outer.inner": 42}

    def test_deep_nested(self):
        flat = _flatten({"a": {"b": {"c": 99}}})
        assert flat == {"a.b.c": 99}


# ???????????????????????????????????????????????????????????????????????????
# Sprint 1.1 -- Execution Proposal State Machine
# ???????????????????????????????????????????????????????????????????????????

class TestProposalStateMachine:
    """PROPOSAL_TRANSITIONS covers all legal transitions."""

    def test_proposed_can_go_to_approved(self):
        assert "APPROVED" in PROPOSAL_TRANSITIONS["PROPOSED"]

    def test_proposed_can_go_to_withdrawn(self):
        assert "WITHDRAWN" in PROPOSAL_TRANSITIONS["PROPOSED"]

    def test_proposed_can_go_to_rejected(self):
        assert "REJECTED" in PROPOSAL_TRANSITIONS["PROPOSED"]

    def test_approved_can_go_to_executed(self):
        assert "EXECUTED" in PROPOSAL_TRANSITIONS["APPROVED"]

    def test_approved_can_go_to_withdrawn(self):
        assert "WITHDRAWN" in PROPOSAL_TRANSITIONS["APPROVED"]

    def test_all_statuses_defined(self):
        for status in PROPOSAL_STATUSES:
            assert status in PROPOSAL_TRANSITIONS, f"{status} missing from PROPOSAL_TRANSITIONS"


class TestProposalIllegalTransitions:
    """Illegal proposal transitions raise ValueError."""

    def test_proposed_cannot_go_to_executed_directly(self):
        with pytest.raises(ValueError, match="Illegal"):
            _assert_proposal_transition("PROPOSED", "EXECUTED", uuid.uuid4())

    def test_approved_cannot_go_to_rejected(self):
        with pytest.raises(ValueError, match="Illegal"):
            _assert_proposal_transition("APPROVED", "REJECTED", uuid.uuid4())

    def test_approved_cannot_go_to_proposed(self):
        with pytest.raises(ValueError, match="Illegal"):
            _assert_proposal_transition("APPROVED", "PROPOSED", uuid.uuid4())


class TestProposalTerminalStates:
    """Terminal states (EXECUTED, WITHDRAWN, REJECTED) have no outgoing transitions."""

    def test_executed_is_terminal(self):
        assert PROPOSAL_TRANSITIONS["EXECUTED"] == set()

    def test_withdrawn_is_terminal(self):
        assert PROPOSAL_TRANSITIONS["WITHDRAWN"] == set()

    def test_rejected_is_terminal(self):
        assert PROPOSAL_TRANSITIONS["REJECTED"] == set()

    def test_terminal_transition_raises(self):
        for state in ("EXECUTED", "WITHDRAWN", "REJECTED"):
            with pytest.raises(ValueError):
                _assert_proposal_transition(state, "PROPOSED", uuid.uuid4())


# ???????????????????????????????????????????????????????????????????????????
# Sprint 1.1 -- Proposal Hash Contract
# ???????????????????????????????????????????????????????????????????????????

class TestProposalHashDeterminism:
    """compute_proposal_hash is deterministic for identical payloads."""

    def _payload(self):
        return {
            "execution_ref":     "IBKR-TEST-001",
            "hedge_amount":      1000000.0,
            "hedge_rate":        16.85,
            "run_id":            "abc123",
            "policy_revision_id": str(uuid.uuid4()),
            "notes":             "Test proposal",
            "proposed_by":       str(uuid.uuid4()),
            "proposed_at":       "2026-01-15T10:00:00+00:00",
        }

    def test_same_payload_same_hash(self):
        payload = self._payload()
        h1 = compute_proposal_hash(payload)
        h2 = compute_proposal_hash(payload)
        assert h1 == h2

    def test_hash_is_64_hex_chars(self):
        h = compute_proposal_hash(self._payload())
        assert len(h) == 64
        int(h, 16)

    def test_key_order_independent(self):
        payload = self._payload()
        reordered = {k: payload[k] for k in reversed(list(payload.keys()))}
        assert compute_proposal_hash(payload) == compute_proposal_hash(reordered)


class TestProposalHashChaining:
    """approval_hash correctly chains the proposal_hash."""

    def _approval_params(self, proposal_hash: str):
        approver_id = str(uuid.uuid4())
        approved_at = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        return {
            "approved_by":    approver_id,
            "approved_at":    approved_at,
            "approval_notes": "Looks good",
            "proposal_hash":  proposal_hash,
        }

    def test_approval_hash_deterministic(self):
        proposal_hash = "a" * 64
        params = self._approval_params(proposal_hash)
        h1 = compute_approval_hash(**params)
        h2 = compute_approval_hash(**params)
        assert h1 == h2

    def test_approval_hash_is_64_hex(self):
        h = compute_approval_hash(
            approved_by=str(uuid.uuid4()),
            approved_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
            approval_notes=None,
            proposal_hash="b" * 64,
        )
        assert len(h) == 64
        int(h, 16)

    def test_approval_hash_depends_on_proposal_hash(self):
        """Changing proposal_hash changes approval_hash -- chain is tamper-evident."""
        approver_id = str(uuid.uuid4())
        approved_at = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        h1 = compute_approval_hash(
            approved_by=approver_id, approved_at=approved_at,
            approval_notes="OK", proposal_hash="a" * 64,
        )
        h2 = compute_approval_hash(
            approved_by=approver_id, approved_at=approved_at,
            approval_notes="OK", proposal_hash="b" * 64,
        )
        assert h1 != h2, "Changing proposal_hash must invalidate approval_hash"


class TestProposalApprovalHashTamper:
    """Any field change in the approval record invalidates the hash."""

    def _base(self):
        return dict(
            approved_by=str(uuid.uuid4()),
            approved_at=datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc),
            approval_notes="Approved",
            proposal_hash="c" * 64,
        )

    def _hash(self, **kwargs):
        return compute_approval_hash(**kwargs)

    def test_change_approved_by_changes_hash(self):
        base = self._base()
        h1 = self._hash(**base)
        mutated = {**base, "approved_by": str(uuid.uuid4())}
        h2 = self._hash(**mutated)
        assert h1 != h2

    def test_change_approved_at_changes_hash(self):
        base = self._base()
        h1 = self._hash(**base)
        mutated = {**base, "approved_at": datetime(2026, 2, 1, tzinfo=timezone.utc)}
        h2 = self._hash(**mutated)
        assert h1 != h2

    def test_change_approval_notes_changes_hash(self):
        base = self._base()
        h1 = self._hash(**base)
        mutated = {**base, "approval_notes": "Changed reason"}
        h2 = self._hash(**mutated)
        assert h1 != h2


# ???????????????????????????????????????????????????????????????????????????
# Sprint 1.1 -- SoD Constraint
# ???????????????????????????????????????????????????????????????????????????

class TestSoDConstraintAtModel:
    """The DB CHECK constraint for SoD is correctly defined on the model."""

    def test_sod_check_constraint_exists(self):
        """ExecutionProposal has a ck_execution_proposals_sod CHECK constraint."""
        table_args = ExecutionProposal.__table_args__
        constraint_names = []
        for arg in table_args:
            if hasattr(arg, "name"):
                constraint_names.append(arg.name)
        assert "ck_execution_proposals_sod" in constraint_names, \
            "SoD DB CHECK constraint missing from ExecutionProposal.__table_args__"

    def test_sod_check_constraint_expression(self):
        """The SoD CHECK expression prevents self-approval."""
        from sqlalchemy import CheckConstraint
        for arg in ExecutionProposal.__table_args__:
            if isinstance(arg, CheckConstraint) and "sod" in str(getattr(arg, "name", "")):
                expr = str(arg.sqltext)
                assert "approved_by" in expr
                assert "proposed_by" in expr
                return
        pytest.fail("SoD CheckConstraint with correct expression not found")
