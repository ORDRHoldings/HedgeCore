"""
tests/test_policy_service_coverage.py

Coverage-targeted unit tests for app/services/policy_service.py.

Uses AsyncMock DB sessions to avoid PostgreSQL dependency so tests run on
every CI run (SQLite / no DB mode).

Functions covered:
  - list_templates           — empty result, non-empty result
  - get_template             — not found, accessible, inaccessible company
  - get_active_instance      — not found, found
  - activate_policy          — template not found raises ValueError
  - update_template          — not found raises ValueError, system template raises ValueError
  - delete_template          — not found raises ValueError, system template raises ValueError
  - deactivate_policy        — no active instance (no-op), active instance deactivated
  - _get_prev_hash           — no rows (returns GENESIS_HASH), row present

Does NOT duplicate tests from tests/test_policy_service_fix.py (which uses
requires_postgres and the real DB via endpoint calls).
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.audit_event import GENESIS_HASH


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db() -> AsyncMock:
    """Return a minimal AsyncMock that looks like an AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()
    db.add_all = MagicMock()
    # Default execute result: empty scalars
    result = MagicMock()
    result.scalars.return_value.first.return_value = None
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result
    return db


def _make_user(company_id=None, branch_id=None, user_id=None, email="user@test.com"):
    user = MagicMock()
    user.id = user_id or uuid.uuid4()
    user.company_id = company_id or uuid.uuid4()
    user.branch_id = branch_id or uuid.uuid4()
    user.email = email
    return user


def _make_template(template_id=None, company_id=None, is_system=False, config=None):
    tmpl = MagicMock()
    tmpl.id = template_id or uuid.uuid4()
    tmpl.company_id = company_id  # None = system-wide
    tmpl.is_system = is_system
    tmpl.config = config or {"hedge_ratios": {"spot": 0.5}}
    tmpl.name = "Test Template"
    tmpl.short_name = "TST"
    tmpl.version = 1
    return tmpl


# ---------------------------------------------------------------------------
# _get_prev_hash
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_prev_hash_returns_genesis_when_no_rows():
    """When no audit events exist, _get_prev_hash returns GENESIS_HASH."""
    from app.services.policy_service import _get_prev_hash

    db = _make_db()
    result = await _get_prev_hash(db, uuid.uuid4())
    assert result == GENESIS_HASH


@pytest.mark.asyncio
async def test_get_prev_hash_returns_existing_hash():
    """When an audit event exists, _get_prev_hash returns its hash."""
    from app.services.policy_service import _get_prev_hash

    expected_hash = "abc123deadbeef"
    db = _make_db()
    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = expected_hash
    db.execute.return_value = res_mock

    result = await _get_prev_hash(db, uuid.uuid4())
    assert result == expected_hash


# ---------------------------------------------------------------------------
# list_templates
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_templates_empty_db_returns_empty_list():
    """list_templates returns [] when no templates match."""
    from app.services.policy_service import list_templates

    db = _make_db()
    user = _make_user()
    result = await list_templates(db, user)
    assert result == []


@pytest.mark.asyncio
async def test_list_templates_returns_all_matching_templates():
    """list_templates returns all items from scalars().all()."""
    from app.services.policy_service import list_templates

    db = _make_db()
    user = _make_user()

    tmpl1 = _make_template(is_system=True)
    tmpl2 = _make_template(company_id=user.company_id)

    res_mock = MagicMock()
    res_mock.scalars.return_value.all.return_value = [tmpl1, tmpl2]
    db.execute.return_value = res_mock

    result = await list_templates(db, user)
    assert len(result) == 2
    assert tmpl1 in result
    assert tmpl2 in result


# ---------------------------------------------------------------------------
# get_template
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_template_returns_none_when_not_found():
    """get_template returns None when session.get() returns None."""
    from app.services.policy_service import get_template

    db = _make_db()
    db.get = AsyncMock(return_value=None)
    user = _make_user()

    result = await get_template(db, uuid.uuid4(), user)
    assert result is None


@pytest.mark.asyncio
async def test_get_template_returns_system_template():
    """System templates (company_id=None) are accessible to any user."""
    from app.services.policy_service import get_template

    db = _make_db()
    tmpl = _make_template(company_id=None, is_system=True)
    db.get = AsyncMock(return_value=tmpl)
    user = _make_user()

    result = await get_template(db, tmpl.id, user)
    assert result is tmpl


@pytest.mark.asyncio
async def test_get_template_returns_company_template_for_same_company():
    """Company-specific template accessible to user of same company."""
    from app.services.policy_service import get_template

    company_id = uuid.uuid4()
    db = _make_db()
    tmpl = _make_template(company_id=company_id, is_system=False)
    db.get = AsyncMock(return_value=tmpl)
    user = _make_user(company_id=company_id)

    result = await get_template(db, tmpl.id, user)
    assert result is tmpl


@pytest.mark.asyncio
async def test_get_template_returns_none_for_different_company():
    """Template belonging to another company is not returned."""
    from app.services.policy_service import get_template

    db = _make_db()
    other_company_id = uuid.uuid4()
    tmpl = _make_template(company_id=other_company_id, is_system=False)
    db.get = AsyncMock(return_value=tmpl)
    user = _make_user(company_id=uuid.uuid4())  # different company

    result = await get_template(db, tmpl.id, user)
    assert result is None


# ---------------------------------------------------------------------------
# get_active_instance
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_active_instance_returns_none_when_no_active():
    """get_active_instance returns None when no active policy exists."""
    from app.services.policy_service import get_active_instance

    db = _make_db()
    user = _make_user()

    result = await get_active_instance(db, user)
    assert result is None


@pytest.mark.asyncio
async def test_get_active_instance_returns_active_instance():
    """get_active_instance returns the active PolicyInstance row."""
    from app.services.policy_service import get_active_instance

    db = _make_db()
    user = _make_user()

    instance = MagicMock()
    instance.is_active = True
    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = instance
    db.execute.return_value = res_mock

    result = await get_active_instance(db, user)
    assert result is instance


# ---------------------------------------------------------------------------
# activate_policy — template not found path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_activate_policy_raises_value_error_when_template_not_found():
    """activate_policy raises ValueError when get_template returns None."""
    from app.services.policy_service import activate_policy

    db = _make_db()
    db.get = AsyncMock(return_value=None)  # get_template will return None
    user = _make_user()
    template_id = uuid.uuid4()

    with pytest.raises(ValueError, match=str(template_id)):
        await activate_policy(db, user, template_id)


# ---------------------------------------------------------------------------
# update_template — error paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_template_raises_value_error_when_not_found():
    """update_template raises ValueError when template does not exist."""
    from app.services.policy_service import update_template

    db = _make_db()
    db.get = AsyncMock(return_value=None)
    user = _make_user()

    with pytest.raises(ValueError, match="not found"):
        await update_template(db, user, uuid.uuid4(), {"name": "NewName"})


@pytest.mark.asyncio
async def test_update_template_raises_value_error_for_system_template():
    """update_template raises ValueError when trying to modify a system template."""
    from app.services.policy_service import update_template

    company_id = uuid.uuid4()
    db = _make_db()
    tmpl = _make_template(company_id=None, is_system=True)
    db.get = AsyncMock(return_value=tmpl)
    user = _make_user(company_id=company_id)

    with pytest.raises(ValueError, match="System templates"):
        await update_template(db, user, tmpl.id, {"name": "Hacked"})


# ---------------------------------------------------------------------------
# delete_template — error paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_template_raises_value_error_when_not_found():
    """delete_template raises ValueError when template does not exist."""
    from app.services.policy_service import delete_template

    db = _make_db()
    db.get = AsyncMock(return_value=None)
    user = _make_user()

    with pytest.raises(ValueError, match="not found"):
        await delete_template(db, user, uuid.uuid4())


@pytest.mark.asyncio
async def test_delete_template_raises_value_error_for_system_template():
    """delete_template raises ValueError when trying to delete a system template."""
    from app.services.policy_service import delete_template

    db = _make_db()
    tmpl = _make_template(company_id=None, is_system=True)
    db.get = AsyncMock(return_value=tmpl)
    user = _make_user()

    with pytest.raises(ValueError, match="System templates"):
        await delete_template(db, user, tmpl.id)


@pytest.mark.asyncio
async def test_delete_template_raises_when_template_is_active():
    """delete_template raises ValueError when the template is currently active."""
    from app.services.policy_service import delete_template

    company_id = uuid.uuid4()
    template_id = uuid.uuid4()
    db = _make_db()

    tmpl = _make_template(company_id=company_id, is_system=False, template_id=template_id)
    db.get = AsyncMock(return_value=tmpl)

    # Mock get_active_instance to return an instance that uses this template
    active_instance = MagicMock()
    active_instance.template_id = template_id

    with patch(
        "app.services.policy_service.get_active_instance",
        new=AsyncMock(return_value=active_instance),
    ):
        user = _make_user(company_id=company_id)
        with pytest.raises(ValueError, match="active"):
            await delete_template(db, user, template_id)


# ---------------------------------------------------------------------------
# deactivate_policy
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_deactivate_policy_no_op_when_no_active_instance():
    """deactivate_policy is a no-op when there is no currently active instance."""
    from app.services.policy_service import deactivate_policy

    db = _make_db()
    user = _make_user()

    # get_active_instance returns None
    with patch(
        "app.services.policy_service.get_active_instance",
        new=AsyncMock(return_value=None),
    ):
        # Should not raise, should not call commit
        await deactivate_policy(db, user)
        db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_deactivate_policy_sets_is_active_false():
    """deactivate_policy sets is_active=False on the current active instance."""
    from app.services.policy_service import deactivate_policy

    db = _make_db()
    user = _make_user()

    instance = MagicMock()
    instance.is_active = True
    instance.id = uuid.uuid4()
    instance.template_id = uuid.uuid4()

    with patch(
        "app.services.policy_service.get_active_instance",
        new=AsyncMock(return_value=instance),
    ):
        with patch(
            "app.services.policy_service._get_prev_hash",
            new=AsyncMock(return_value=GENESIS_HASH),
        ):
            await deactivate_policy(db, user)

    assert instance.is_active is False
    db.commit.assert_called()


# ---------------------------------------------------------------------------
# create_template — smoke test (exercises the audit emit path)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_template_calls_session_add_and_commit():
    """create_template adds the template and commits (audit event may fail gracefully)."""
    from app.services.policy_service import create_template

    company_id = uuid.uuid4()
    user = _make_user(company_id=company_id)

    db = AsyncMock()
    # refresh returns a mock with required attributes
    created_tmpl = _make_template(company_id=company_id)
    db.refresh = AsyncMock(side_effect=lambda obj: None)

    # Patch the PolicyTemplate constructor to return our mock
    with patch("app.services.policy_service.PolicyTemplate", return_value=created_tmpl):
        with patch(
            "app.services.policy_service._get_prev_hash",
            new=AsyncMock(return_value=GENESIS_HASH),
        ):
            with patch("app.services.policy_service.build_audit_event", return_value=MagicMock()):
                result = await create_template(
                    db,
                    user,
                    name="My Template",
                    short_name="MT",
                    description="desc",
                    risk_posture="MODERATE",
                    category="CORPORATE",
                    config={"hedge_ratios": {}},
                )

    db.add.assert_called()
    db.commit.assert_called()
