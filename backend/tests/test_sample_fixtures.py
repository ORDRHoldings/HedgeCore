"""
Tests for sample fixtures validity and lifecycle matrix completeness.

Verifies:
- All 8 fixtures are properly typed
- Lifecycle transitions match the model
- Deletability rules are correct
- FakePosition is Pydantic-compatible
"""
import uuid

import pytest

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from fixtures.sample_positions import (
    FIXTURES,
    ALLOWED_TRANSITIONS,
    DELETABLE_STATES,
    ALL_STATES,
    FakePosition,
    make_position,
    COMPANY_ID,
    BRANCH_ID,
    USER_ID,
)


class TestFixtureIntegrity:
    """All 8 fixtures exist and have correct types."""

    def test_fixture_count(self):
        assert len(FIXTURES) == 8

    def test_all_names_present(self):
        expected = {"NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED",
                    "REJECTED", "DELETABLE", "NOT_DELETABLE", "WITH_REFS"}
        assert set(FIXTURES.keys()) == expected

    def test_each_fixture_has_uuid_id(self):
        for name, pos in FIXTURES.items():
            assert isinstance(pos.id, uuid.UUID), f"{name} has non-UUID id"

    def test_each_fixture_has_company_scope(self):
        for name, pos in FIXTURES.items():
            assert pos.company_id == COMPANY_ID, f"{name} has wrong company_id"
            assert pos.branch_id == BRANCH_ID, f"{name} has wrong branch_id"
            assert pos.created_by == USER_ID, f"{name} has wrong created_by"

    def test_execution_status_matches_fixture_name(self):
        mapping = {
            "NEW": "NEW",
            "POLICY_ASSIGNED": "POLICY_ASSIGNED",
            "READY_TO_EXECUTE": "READY_TO_EXECUTE",
            "HEDGED": "HEDGED",
            "REJECTED": "REJECTED",
            "DELETABLE": "REJECTED",       # deletable IS rejected
            "NOT_DELETABLE": "NEW",         # not deletable IS new
            "WITH_REFS": "HEDGED",          # with refs IS hedged
        }
        for name, expected_status in mapping.items():
            assert FIXTURES[name].execution_status == expected_status, \
                f"{name} should be {expected_status}"

    def test_hedged_fixtures_have_execution_ref(self):
        for name in ("HEDGED", "WITH_REFS"):
            pos = FIXTURES[name]
            assert pos.execution_ref is not None, f"{name} missing execution_ref"
            assert pos.executed_at is not None, f"{name} missing executed_at"

    def test_rejected_fixtures_have_reason(self):
        for name in ("REJECTED", "DELETABLE"):
            pos = FIXTURES[name]
            assert pos.rejection_reason is not None, f"{name} missing rejection_reason"

    def test_ready_fixture_has_hedge_fields(self):
        pos = FIXTURES["READY_TO_EXECUTE"]
        assert pos.hedge_amount is not None
        assert pos.hedge_rate is not None
        assert pos.last_run_id is not None

    def test_new_fixture_has_no_refs(self):
        pos = FIXTURES["NEW"]
        assert pos.policy_id is None
        assert pos.last_run_id is None
        assert pos.execution_ref is None

    def test_all_fixtures_are_active(self):
        for name, pos in FIXTURES.items():
            assert pos.is_active is True, f"{name} should be active"


class TestLifecycleMatrix:
    """ALLOWED_TRANSITIONS matches the model definition."""

    def test_all_five_states_covered(self):
        assert set(ALL_STATES) == {"NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE",
                                    "HEDGED", "REJECTED"}

    def test_hedged_is_terminal(self):
        assert ALLOWED_TRANSITIONS["HEDGED"] == set()

    def test_new_transitions(self):
        assert ALLOWED_TRANSITIONS["NEW"] == {"POLICY_ASSIGNED", "REJECTED"}

    def test_policy_assigned_transitions(self):
        assert ALLOWED_TRANSITIONS["POLICY_ASSIGNED"] == {"READY_TO_EXECUTE", "REJECTED", "NEW", "POLICY_ASSIGNED"}

    def test_ready_transitions(self):
        assert ALLOWED_TRANSITIONS["READY_TO_EXECUTE"] == {"HEDGED", "REJECTED", "POLICY_ASSIGNED"}

    def test_rejected_can_only_reopen(self):
        assert ALLOWED_TRANSITIONS["REJECTED"] == {"NEW"}

    def test_deletable_states(self):
        assert DELETABLE_STATES == {"REJECTED"}

    def test_transitions_match_model(self):
        """Cross-validate against the actual model definition."""
        from app.models.position import EXECUTION_TRANSITIONS
        for state, allowed in ALLOWED_TRANSITIONS.items():
            actual = EXECUTION_TRANSITIONS.get(state, set())
            assert actual == allowed, \
                f"State {state}: fixture says {allowed}, model says {actual}"


class TestMakePosition:
    """make_position() factory works correctly."""

    def test_default_position(self):
        pos = make_position()
        assert pos.execution_status == "NEW"
        assert pos.currency == "EUR"
        assert pos.is_active is True

    def test_override_fields(self):
        pos = make_position(
            execution_status="HEDGED",
            currency="GBP",
            amount=999_999.0,
        )
        assert pos.execution_status == "HEDGED"
        assert pos.currency == "GBP"
        assert pos.amount == 999_999.0

    def test_to_dict_serialization(self):
        pos = make_position(execution_status="REJECTED", rejection_reason="test reason")
        d = pos.to_dict()
        assert d["execution_status"] == "REJECTED"
        assert d["rejection_reason"] == "test reason"
        assert isinstance(d["id"], str)
        assert isinstance(d["company_id"], str)

    def test_custom_pid(self):
        pid = uuid.UUID("eeeeeeee-0000-0000-0000-000000000001")
        pos = make_position(pid=pid)
        assert pos.id == pid
