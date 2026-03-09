"""
Tests for app.services.audit_scheduler — in-memory CRUD for audit schedules.
"""
from __future__ import annotations

import uuid

import pytest

from app.services.audit_scheduler import (
    AuditSchedule,
    _schedules,
    clear_company_schedules,
    create_schedule,
    delete_schedule,
    get_schedule,
    get_schedules,
    toggle_enabled,
    update_last_run,
)

COMPANY_A = str(uuid.uuid4())
COMPANY_B = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
DATASET_ID = str(uuid.uuid4())
BENCHMARK = {"benchmark_rate": 1.35, "tolerance_bps": 50}


@pytest.fixture(autouse=True)
def _clean_store():
    """Clear the in-memory store before each test."""
    _schedules.clear()
    yield
    _schedules.clear()


# ── create_schedule ───────────────────────────────────────────────────────────


class TestCreateSchedule:
    def test_returns_audit_schedule(self):
        result = create_schedule(
            company_id=COMPANY_A,
            dataset_id=DATASET_ID,
            benchmark_config=BENCHMARK,
            cron_expression="0 6 * * *",
            created_by=USER_ID,
        )
        assert isinstance(result, AuditSchedule)

    def test_assigns_uuid(self):
        result = create_schedule(
            company_id=COMPANY_A,
            dataset_id=DATASET_ID,
            benchmark_config=BENCHMARK,
            cron_expression="0 6 * * *",
            created_by=USER_ID,
        )
        uuid.UUID(result.id)  # validates it is a proper UUID

    def test_stores_fields(self):
        result = create_schedule(
            company_id=COMPANY_A,
            dataset_id=DATASET_ID,
            benchmark_config=BENCHMARK,
            cron_expression="30 2 * * 5",
            created_by=USER_ID,
        )
        assert result.company_id == COMPANY_A
        assert result.dataset_id == DATASET_ID
        assert result.benchmark_config == BENCHMARK
        assert result.cron_expression == "30 2 * * 5"
        assert result.created_by == USER_ID
        assert result.enabled is True
        assert result.last_run_at is None
        assert result.next_run_at is None

    def test_persists_in_store(self):
        result = create_schedule(
            company_id=COMPANY_A,
            dataset_id=DATASET_ID,
            benchmark_config=BENCHMARK,
            cron_expression="0 0 * * 1",
            created_by=USER_ID,
        )
        assert result.id in _schedules

    def test_created_at_populated(self):
        result = create_schedule(
            company_id=COMPANY_A,
            dataset_id=DATASET_ID,
            benchmark_config={},
            cron_expression="0 0 * * 1",
            created_by=USER_ID,
        )
        assert result.created_at is not None


# ── get_schedules ─────────────────────────────────────────────────────────────


class TestGetSchedules:
    def test_empty_returns_empty_list(self):
        assert get_schedules(COMPANY_A) == []

    def test_returns_only_matching_company(self):
        create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        create_schedule(COMPANY_B, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        create_schedule(COMPANY_A, DATASET_ID, {}, "0 6 * * *", USER_ID)

        results = get_schedules(COMPANY_A)
        assert len(results) == 2
        assert all(s.company_id == COMPANY_A for s in results)

    def test_ordered_newest_first(self):
        from datetime import timedelta

        s1 = create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        # Force s2 to have a later timestamp so sort is deterministic
        s2 = create_schedule(COMPANY_A, DATASET_ID, {}, "0 6 * * *", USER_ID)
        s2.created_at = s1.created_at + timedelta(seconds=10)

        results = get_schedules(COMPANY_A)
        # s2 has later created_at, so it should appear first (newest first)
        assert results[0].id == s2.id
        assert results[1].id == s1.id


# ── get_schedule ──────────────────────────────────────────────────────────────


class TestGetSchedule:
    def test_returns_schedule_for_correct_company(self):
        s = create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        result = get_schedule(s.id, COMPANY_A)
        assert result is not None
        assert result.id == s.id

    def test_returns_none_for_wrong_company(self):
        s = create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        assert get_schedule(s.id, COMPANY_B) is None

    def test_returns_none_for_nonexistent_id(self):
        assert get_schedule(str(uuid.uuid4()), COMPANY_A) is None


# ── delete_schedule ───────────────────────────────────────────────────────────


class TestDeleteSchedule:
    def test_deletes_and_returns_true(self):
        s = create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        assert delete_schedule(s.id, COMPANY_A) is True
        assert s.id not in _schedules

    def test_returns_false_for_wrong_company(self):
        s = create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        assert delete_schedule(s.id, COMPANY_B) is False
        assert s.id in _schedules  # not deleted

    def test_returns_false_for_nonexistent_id(self):
        assert delete_schedule(str(uuid.uuid4()), COMPANY_A) is False

    def test_idempotent_double_delete(self):
        s = create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        assert delete_schedule(s.id, COMPANY_A) is True
        assert delete_schedule(s.id, COMPANY_A) is False


# ── update_last_run ───────────────────────────────────────────────────────────


class TestUpdateLastRun:
    def test_sets_last_run_at(self):
        s = create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        assert s.last_run_at is None
        result = update_last_run(s.id, COMPANY_A)
        assert result is not None
        assert result.last_run_at is not None

    def test_returns_none_for_missing_schedule(self):
        assert update_last_run(str(uuid.uuid4()), COMPANY_A) is None


# ── toggle_enabled ────────────────────────────────────────────────────────────


class TestToggleEnabled:
    def test_toggles_from_true_to_false(self):
        s = create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        assert s.enabled is True
        result = toggle_enabled(s.id, COMPANY_A)
        assert result is not None
        assert result.enabled is False

    def test_toggles_from_false_to_true(self):
        s = create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        toggle_enabled(s.id, COMPANY_A)
        result = toggle_enabled(s.id, COMPANY_A)
        assert result is not None
        assert result.enabled is True

    def test_returns_none_for_missing_schedule(self):
        assert toggle_enabled(str(uuid.uuid4()), COMPANY_A) is None


# ── clear_company_schedules ──────────────────────────────────────────────────


class TestClearCompanySchedules:
    def test_clears_all_for_company(self):
        create_schedule(COMPANY_A, DATASET_ID, {}, "0 0 * * 1", USER_ID)
        create_schedule(COMPANY_A, DATASET_ID, {}, "0 6 * * *", USER_ID)
        create_schedule(COMPANY_B, DATASET_ID, {}, "0 0 * * 1", USER_ID)

        count = clear_company_schedules(COMPANY_A)
        assert count == 2
        assert get_schedules(COMPANY_A) == []
        assert len(get_schedules(COMPANY_B)) == 1

    def test_returns_zero_when_no_schedules(self):
        assert clear_company_schedules(COMPANY_A) == 0


# ── AuditSchedule dataclass defaults ─────────────────────────────────────────


class TestAuditScheduleDefaults:
    def test_default_cron_is_weekly_monday(self):
        s = AuditSchedule()
        assert s.cron_expression == "0 0 * * 1"

    def test_default_enabled_is_true(self):
        s = AuditSchedule()
        assert s.enabled is True

    def test_default_benchmark_config_is_empty_dict(self):
        s = AuditSchedule()
        assert s.benchmark_config == {}

    def test_independent_benchmark_dicts(self):
        """Each instance gets its own dict -- no shared mutable default."""
        s1 = AuditSchedule()
        s2 = AuditSchedule()
        s1.benchmark_config["foo"] = "bar"
        assert "foo" not in s2.benchmark_config
