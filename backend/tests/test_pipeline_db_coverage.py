"""
tests/test_pipeline_db_coverage.py

Coverage-targeted unit tests for app/services/pipeline_db.py.

Uses AsyncMock DB sessions to avoid PostgreSQL dependency so tests run on
every CI run (SQLite / no DB mode).

Functions covered:
  Proposal:
    - save_proposal            — valid UUID, invalid created_by, invalid company_id
    - update_proposal_status   — found, not found (no-op)
    - load_proposal            — not found, found
    - load_all_proposals       — empty, filtered by company_id, bad company_id filter

  Staging:
    - save_staging             — valid, invalid submitted_by
    - save_approval            — staging not found, success, IntegrityError (duplicate)
    - update_staging_status    — found, not found (no-op)
    - update_staging_status_versioned — success (rowcount==1), conflict (rowcount==0)
    - load_staging             — not found, found
    - load_all_staging         — empty, with status_filter, with company_id_filter, bad filter
    - count_staging            — no filter, with filters, bad company_id

  Ledger:
    - save_ledger              — valid, invalid authorized_by, invalid company_id
    - load_ledger              — not found, found
    - load_all_ledger          — empty, filtered, bad filter
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas_v1.pipeline import (
    ApprovalAction,
    ApprovalRecord,
    AuthorizationStatus,
    FreezeArtifact,
    LedgerEntry,
    Proposal,
    ProposalStatus,
    ProvenanceChain,
    StagedArtifact,
    WaterfallResult,
    WaterfallRule,
    WaterfallRuleStatus,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db() -> AsyncMock:
    """Return a minimal AsyncMock that looks like an AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()
    db.add_all = MagicMock()
    result = MagicMock()
    result.scalars.return_value.first.return_value = None
    result.scalars.return_value.all.return_value = []
    result.scalar_one.return_value = 0
    result.rowcount = 0
    db.execute.return_value = result
    return db


def _make_waterfall() -> WaterfallResult:
    return WaterfallResult(
        rules=[
            WaterfallRule(
                rule_id="R1",
                name="Test Rule",
                status=WaterfallRuleStatus.PASS,
            )
        ],
        overall_status="PASS",
        integrity_score=95.0,
    )


def _make_freeze_artifact() -> FreezeArtifact:
    return FreezeArtifact(
        snapshot_hash="snap_abc123",
        exposure_digest="exp_digest_xyz",
        policy_hash="pol_hash_000",
        engine_version="1.0.0",
        hedge_plan={"spot": 0.5},
        scenario_results={"base": {}},
        waterfall_result={"overall_status": "PASS"},
        residual_risk_vector=[0.1, 0.2],
        capability_flags={},
    )


def _make_proposal(
    created_by: str = "user@test.com",
    company_id: str | None = None,
) -> Proposal:
    return Proposal(
        proposal_id="PROP-001",
        status=ProposalStatus.DRAFT,
        created_by=created_by,
        created_at=datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        snapshot_hash="snap_abc123",
        policy_version="v1",
        exposure_digest="exp_digest",
        engine_version="1.0.0",
        calculate_response={"status": "ok"},
        waterfall=_make_waterfall(),
        frozen_inputs={"trade_ids": []},
        freeze_artifact=_make_freeze_artifact(),
        residual_risk_vector=[0.1, 0.2],
        capability_flags={},
        company_id=company_id,
    )


def _make_staged_artifact(
    submitted_by: str = "submitter@test.com",
    company_id: str | None = None,
) -> StagedArtifact:
    return StagedArtifact(
        staging_id="STG-001",
        proposal_id="PROP-001",
        submitted_by=submitted_by,
        submitted_at=datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        justification="Test submission",
        integrity_score=95.0,
        authorization_status=AuthorizationStatus.PENDING,
        required_approvals=2,
        version=0,
        company_id=company_id,
    )


def _make_approval_record() -> ApprovalRecord:
    return ApprovalRecord(
        approver_id=str(uuid.uuid4()),
        approver_role="treasurer",
        action=ApprovalAction.APPROVE,
        signature_hash="sig_abc123",
        comment="Looks good",
        timestamp=datetime(2024, 1, 1, 13, 0, 0, tzinfo=timezone.utc),
    )


def _make_ledger_entry(
    authorized_by: str = "auth@test.com",
    company_id: str | None = None,
) -> LedgerEntry:
    return LedgerEntry(
        ledger_id="LEDG-001",
        order_id="ORD-001",
        staging_id="STG-001",
        authorized_by=authorized_by,
        authorized_at=datetime(2024, 1, 1, 14, 0, 0, tzinfo=timezone.utc),
        signature_hash="ledger_sig_xyz",
        provenance_chain=ProvenanceChain(
            market_data_source="bloomberg",
            policy_hash="pol_hash_000",
        ),
        replay_verified=True,
        root_hash="root_hash_abc",
        freeze_artifact=_make_freeze_artifact(),
        company_id=company_id,
    )


def _make_orm_proposal(proposal_id: str = "PROP-001") -> MagicMock:
    orm = MagicMock()
    orm.proposal_id = proposal_id
    orm.status = ProposalStatus.DRAFT.value
    orm.created_by = uuid.uuid4()
    orm.created_at = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    orm.snapshot_hash = "snap_abc123"
    orm.policy_version = "v1"
    orm.exposure_digest = "exp_digest"
    orm.engine_version = "1.0.0"
    orm.calculate_response = {"status": "ok"}
    orm.waterfall_result = {
        "rules": [{"rule_id": "R1", "name": "Test", "status": "PASS", "v_codes": [], "details": [], "result_summary": ""}],
        "overall_status": "PASS",
        "integrity_score": 95.0,
    }
    orm.frozen_inputs = {"trade_ids": []}
    orm.freeze_artifact = {
        "snapshot_hash": "snap_abc123",
        "exposure_digest": "exp_digest",
        "policy_hash": "pol_hash_000",
        "engine_version": "1.0.0",
        "hedge_plan": {},
        "scenario_results": {},
        "waterfall_result": {},
        "residual_risk_vector": [],
        "capability_flags": {},
    }
    orm.residual_risk_vector = [0.1, 0.2]
    orm.capability_flags = {}
    orm.company_id = None
    return orm


def _make_orm_staging(staging_id: str = "STG-001") -> MagicMock:
    orm = MagicMock()
    orm.staging_id = staging_id
    orm.proposal_id = "PROP-001"
    orm.submitted_by = uuid.uuid4()
    orm.submitted_at = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    orm.justification = "Test"
    orm.integrity_score = 95.0
    orm.authorization_status = AuthorizationStatus.PENDING.value
    orm.required_approvals = 2
    orm.version = 0
    orm.approvals = []
    orm.company_id = None
    return orm


def _make_orm_ledger(ledger_id: str = "LEDG-001") -> MagicMock:
    orm = MagicMock()
    orm.ledger_id = ledger_id
    orm.order_id = "ORD-001"
    orm.staging_id = "STG-001"
    orm.authorized_by = uuid.uuid4()
    orm.authorized_at = datetime(2024, 1, 1, 14, 0, 0, tzinfo=timezone.utc)
    orm.signature_hash = "ledger_sig_xyz"
    orm.provenance_chain = {
        "market_data_source": "bloomberg",
        "transformation_steps": [],
        "policy_hash": "pol_hash_000",
        "approval_hash": "",
        "execution_payload_hash": "",
    }
    orm.root_hash = "root_hash_abc"
    orm.frozen_artifact = {
        "snapshot_hash": "snap_abc123",
        "exposure_digest": "exp_digest",
        "policy_hash": "pol_hash_000",
        "engine_version": "1.0.0",
        "hedge_plan": {},
        "scenario_results": {},
        "waterfall_result": {},
        "residual_risk_vector": [],
        "capability_flags": {},
    }
    orm.replay_verified = True
    orm.company_id = None
    return orm


# ===========================================================================
# Proposal CRUD
# ===========================================================================

@pytest.mark.asyncio
async def test_save_proposal_with_valid_uuid_created_by():
    """save_proposal succeeds when created_by is a valid UUID string."""
    from app.services.pipeline_db import save_proposal

    db = _make_db()
    proposal = _make_proposal(created_by=str(uuid.uuid4()))
    await save_proposal(db, proposal, run_id="RUN-001")

    db.add.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_save_proposal_with_invalid_created_by_falls_back_to_nil_uuid():
    """save_proposal falls back to nil UUID when created_by is not a valid UUID."""
    from app.services.pipeline_db import save_proposal

    db = _make_db()
    proposal = _make_proposal(created_by="not-a-uuid@example.com")
    await save_proposal(db, proposal, run_id="RUN-002")

    db.add.assert_called_once()
    db.commit.assert_called_once()
    # Inspect what was added — created_by should be nil UUID
    added_orm = db.add.call_args[0][0]
    assert str(added_orm.created_by) == "00000000-0000-0000-0000-000000000000"


@pytest.mark.asyncio
async def test_save_proposal_with_valid_company_id():
    """save_proposal correctly parses a valid company_id UUID."""
    from app.services.pipeline_db import save_proposal

    cid = str(uuid.uuid4())
    db = _make_db()
    proposal = _make_proposal(company_id=cid)
    await save_proposal(db, proposal, run_id="RUN-003")

    db.add.assert_called_once()
    added_orm = db.add.call_args[0][0]
    assert str(added_orm.company_id) == cid


@pytest.mark.asyncio
async def test_save_proposal_with_invalid_company_id_skips():
    """save_proposal sets company_id to None when company_id is not a valid UUID."""
    from app.services.pipeline_db import save_proposal

    db = _make_db()
    proposal = _make_proposal(company_id="not-a-uuid")
    await save_proposal(db, proposal, run_id="RUN-004")

    db.add.assert_called_once()
    added_orm = db.add.call_args[0][0]
    assert added_orm.company_id is None


@pytest.mark.asyncio
async def test_update_proposal_status_when_found():
    """update_proposal_status updates status and commits when proposal exists."""
    from app.services.pipeline_db import update_proposal_status

    db = _make_db()
    orm_row = _make_orm_proposal()
    result = MagicMock()
    result.scalars.return_value.first.return_value = orm_row
    db.execute.return_value = result

    await update_proposal_status(db, "PROP-001", "SUBMITTED")

    assert orm_row.status == "SUBMITTED"
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_proposal_status_when_not_found_is_noop():
    """update_proposal_status is a no-op when proposal does not exist."""
    from app.services.pipeline_db import update_proposal_status

    db = _make_db()
    # Default: scalars().first() returns None
    await update_proposal_status(db, "NONEXISTENT", "SUBMITTED")
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_load_proposal_returns_none_when_not_found():
    """load_proposal returns None when proposal_id does not exist."""
    from app.services.pipeline_db import load_proposal

    db = _make_db()
    result = await load_proposal(db, "NONEXISTENT")
    assert result is None


@pytest.mark.asyncio
async def test_load_proposal_returns_schema_when_found():
    """load_proposal returns Pydantic Proposal when ORM row exists."""
    from app.services.pipeline_db import load_proposal

    db = _make_db()
    orm_row = _make_orm_proposal("PROP-001")
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = orm_row
    db.execute.return_value = mock_result

    result = await load_proposal(db, "PROP-001")
    assert result is not None
    assert result.proposal_id == "PROP-001"
    assert result.status == ProposalStatus.DRAFT


@pytest.mark.asyncio
async def test_load_all_proposals_returns_empty_list():
    """load_all_proposals returns [] when no proposals exist."""
    from app.services.pipeline_db import load_all_proposals

    db = _make_db()
    result = await load_all_proposals(db)
    assert result == []


@pytest.mark.asyncio
async def test_load_all_proposals_returns_multiple():
    """load_all_proposals converts all ORM rows to Pydantic schemas."""
    from app.services.pipeline_db import load_all_proposals

    db = _make_db()
    rows = [_make_orm_proposal("PROP-001"), _make_orm_proposal("PROP-002")]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = rows
    db.execute.return_value = mock_result

    result = await load_all_proposals(db)
    assert len(result) == 2
    assert result[0].proposal_id == "PROP-001"
    assert result[1].proposal_id == "PROP-002"


@pytest.mark.asyncio
async def test_load_all_proposals_with_valid_company_id_filter():
    """load_all_proposals applies company_id filter when valid UUID given."""
    from app.services.pipeline_db import load_all_proposals

    db = _make_db()
    cid = str(uuid.uuid4())
    # Empty result is fine; we just verify no exception is raised
    result = await load_all_proposals(db, company_id_filter=cid)
    assert result == []


@pytest.mark.asyncio
async def test_load_all_proposals_with_invalid_company_id_filter_skips():
    """load_all_proposals ignores invalid company_id filter (not a UUID)."""
    from app.services.pipeline_db import load_all_proposals

    db = _make_db()
    result = await load_all_proposals(db, company_id_filter="not-a-uuid")
    assert result == []


# ===========================================================================
# Staging CRUD
# ===========================================================================

@pytest.mark.asyncio
async def test_save_staging_with_valid_submitted_by():
    """save_staging persists when submitted_by is a valid UUID."""
    from app.services.pipeline_db import save_staging

    db = _make_db()
    artifact = _make_staged_artifact(submitted_by=str(uuid.uuid4()))
    await save_staging(db, artifact)

    db.add.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_save_staging_with_invalid_submitted_by_falls_back():
    """save_staging falls back to nil UUID when submitted_by is not a UUID."""
    from app.services.pipeline_db import save_staging

    db = _make_db()
    artifact = _make_staged_artifact(submitted_by="not-a-uuid@example.com")
    await save_staging(db, artifact)

    db.add.assert_called_once()
    added_orm = db.add.call_args[0][0]
    assert str(added_orm.submitted_by) == "00000000-0000-0000-0000-000000000000"


@pytest.mark.asyncio
async def test_save_staging_with_company_id():
    """save_staging correctly sets company_id from artifact."""
    from app.services.pipeline_db import save_staging

    cid = str(uuid.uuid4())
    db = _make_db()
    artifact = _make_staged_artifact(company_id=cid)
    await save_staging(db, artifact)

    db.add.assert_called_once()
    added_orm = db.add.call_args[0][0]
    assert str(added_orm.company_id) == cid


@pytest.mark.asyncio
async def test_save_approval_returns_false_when_staging_not_found():
    """save_approval returns False when staging_id does not exist."""
    from app.services.pipeline_db import save_approval

    db = _make_db()
    approval = _make_approval_record()
    result = await save_approval(db, "NONEXISTENT-STG", approval)
    assert result is False


@pytest.mark.asyncio
async def test_save_approval_returns_true_on_success():
    """save_approval returns True when approval is persisted successfully."""
    from app.services.pipeline_db import save_approval

    db = _make_db()
    staging_orm = _make_orm_staging("STG-001")
    staging_orm.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = staging_orm
    db.execute.return_value = mock_result

    approval = _make_approval_record()
    result = await save_approval(db, "STG-001", approval)
    assert result is True
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_save_approval_handles_integrity_error_returns_false():
    """save_approval returns False on IntegrityError (duplicate approval)."""
    from sqlalchemy.exc import IntegrityError

    from app.services.pipeline_db import save_approval

    db = _make_db()
    staging_orm = _make_orm_staging("STG-001")
    staging_orm.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = staging_orm
    db.execute.return_value = mock_result
    db.commit.side_effect = IntegrityError("duplicate", {}, Exception())

    approval = _make_approval_record()
    result = await save_approval(db, "STG-001", approval)
    assert result is False
    db.rollback.assert_called_once()


@pytest.mark.asyncio
async def test_save_approval_with_invalid_approver_id_falls_back():
    """save_approval falls back to nil UUID when approver_id is not a UUID."""
    from app.services.pipeline_db import save_approval

    db = _make_db()
    staging_orm = _make_orm_staging("STG-001")
    staging_orm.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = staging_orm
    db.execute.return_value = mock_result

    approval = ApprovalRecord(
        approver_id="not-a-uuid",
        approver_role="treasurer",
        action=ApprovalAction.APPROVE,
        signature_hash="sig_hash",
    )
    result = await save_approval(db, "STG-001", approval)
    assert result is True
    added_orm = db.add.call_args[0][0]
    assert str(added_orm.approver_id) == "00000000-0000-0000-0000-000000000000"


@pytest.mark.asyncio
async def test_update_staging_status_when_found():
    """update_staging_status updates the status field and commits."""
    from app.services.pipeline_db import update_staging_status

    db = _make_db()
    orm_row = _make_orm_staging()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = orm_row
    db.execute.return_value = mock_result

    await update_staging_status(db, "STG-001", "APPROVED")
    assert orm_row.authorization_status == "APPROVED"
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_staging_status_when_not_found_is_noop():
    """update_staging_status is a no-op when staging does not exist."""
    from app.services.pipeline_db import update_staging_status

    db = _make_db()
    await update_staging_status(db, "NONEXISTENT", "APPROVED")
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_update_staging_status_versioned_returns_true_on_success():
    """update_staging_status_versioned returns True when rowcount == 1."""
    from app.services.pipeline_db import update_staging_status_versioned

    db = _make_db()
    mock_result = MagicMock()
    mock_result.rowcount = 1
    db.execute.return_value = mock_result

    result = await update_staging_status_versioned(db, "STG-001", "APPROVED", 0)
    assert result is True
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_staging_status_versioned_returns_false_on_conflict():
    """update_staging_status_versioned returns False when rowcount == 0 (version conflict)."""
    from app.services.pipeline_db import update_staging_status_versioned

    db = _make_db()
    mock_result = MagicMock()
    mock_result.rowcount = 0
    db.execute.return_value = mock_result

    result = await update_staging_status_versioned(db, "STG-001", "APPROVED", 99)
    assert result is False


@pytest.mark.asyncio
async def test_load_staging_returns_none_when_not_found():
    """load_staging returns None when staging_id does not exist."""
    from app.services.pipeline_db import load_staging

    db = _make_db()
    result = await load_staging(db, "NONEXISTENT")
    assert result is None


@pytest.mark.asyncio
async def test_load_staging_returns_schema_when_found():
    """load_staging returns StagedArtifact when ORM row exists."""
    from app.services.pipeline_db import load_staging

    db = _make_db()
    orm_row = _make_orm_staging("STG-001")
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = orm_row
    db.execute.return_value = mock_result

    result = await load_staging(db, "STG-001")
    assert result is not None
    assert result.staging_id == "STG-001"
    assert result.authorization_status == AuthorizationStatus.PENDING


@pytest.mark.asyncio
async def test_load_staging_with_approvals():
    """load_staging converts approval ORM rows to ApprovalRecord schemas."""
    from app.services.pipeline_db import load_staging

    db = _make_db()
    orm_row = _make_orm_staging("STG-002")

    # Attach a mock approval
    approval_orm = MagicMock()
    approval_orm.approver_id = uuid.uuid4()
    approval_orm.approver_role = "cfo"
    approval_orm.action = "APPROVE"
    approval_orm.signature_hash = "sig123"
    approval_orm.comment = "OK"
    approval_orm.created_at = datetime(2024, 1, 1, 13, 0, 0, tzinfo=timezone.utc)
    orm_row.approvals = [approval_orm]

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = orm_row
    db.execute.return_value = mock_result

    result = await load_staging(db, "STG-002")
    assert result is not None
    assert len(result.approvals) == 1
    assert result.approvals[0].approver_role == "cfo"


@pytest.mark.asyncio
async def test_load_all_staging_returns_empty_list():
    """load_all_staging returns [] when no staging artifacts exist."""
    from app.services.pipeline_db import load_all_staging

    db = _make_db()
    result = await load_all_staging(db)
    assert result == []


@pytest.mark.asyncio
async def test_load_all_staging_with_status_filter():
    """load_all_staging applies status_filter without error."""
    from app.services.pipeline_db import load_all_staging

    db = _make_db()
    result = await load_all_staging(db, status_filter="PENDING")
    assert result == []


@pytest.mark.asyncio
async def test_load_all_staging_with_valid_company_id_filter():
    """load_all_staging applies valid company_id_filter without error."""
    from app.services.pipeline_db import load_all_staging

    db = _make_db()
    cid = str(uuid.uuid4())
    result = await load_all_staging(db, company_id_filter=cid)
    assert result == []


@pytest.mark.asyncio
async def test_load_all_staging_with_invalid_company_id_filter():
    """load_all_staging ignores invalid company_id_filter."""
    from app.services.pipeline_db import load_all_staging

    db = _make_db()
    result = await load_all_staging(db, company_id_filter="not-a-uuid")
    assert result == []


@pytest.mark.asyncio
async def test_load_all_staging_with_limit_offset():
    """load_all_staging accepts limit/offset parameters."""
    from app.services.pipeline_db import load_all_staging

    db = _make_db()
    result = await load_all_staging(db, limit=5, offset=10)
    assert result == []


@pytest.mark.asyncio
async def test_count_staging_returns_zero():
    """count_staging returns 0 when no staging artifacts exist."""
    from app.services.pipeline_db import count_staging

    db = _make_db()
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = 0
    db.execute.return_value = mock_result

    result = await count_staging(db)
    assert result == 0


@pytest.mark.asyncio
async def test_count_staging_with_status_filter():
    """count_staging applies status_filter correctly."""
    from app.services.pipeline_db import count_staging

    db = _make_db()
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = 3
    db.execute.return_value = mock_result

    result = await count_staging(db, status_filter="APPROVED")
    assert result == 3


@pytest.mark.asyncio
async def test_count_staging_with_valid_company_id_filter():
    """count_staging applies valid company_id_filter."""
    from app.services.pipeline_db import count_staging

    db = _make_db()
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = 5
    db.execute.return_value = mock_result

    cid = str(uuid.uuid4())
    result = await count_staging(db, company_id_filter=cid)
    assert result == 5


@pytest.mark.asyncio
async def test_count_staging_with_invalid_company_id_filter():
    """count_staging ignores invalid company_id_filter."""
    from app.services.pipeline_db import count_staging

    db = _make_db()
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = 0
    db.execute.return_value = mock_result

    result = await count_staging(db, company_id_filter="not-a-uuid")
    assert result == 0


# ===========================================================================
# Ledger CRUD
# ===========================================================================

@pytest.mark.asyncio
async def test_save_ledger_with_valid_authorized_by():
    """save_ledger persists when authorized_by is a valid UUID."""
    from app.services.pipeline_db import save_ledger

    db = _make_db()
    entry = _make_ledger_entry(authorized_by=str(uuid.uuid4()))
    await save_ledger(db, entry)

    db.add.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_save_ledger_with_invalid_authorized_by_falls_back():
    """save_ledger falls back to nil UUID when authorized_by is not a UUID."""
    from app.services.pipeline_db import save_ledger

    db = _make_db()
    entry = _make_ledger_entry(authorized_by="not-a-uuid@example.com")
    await save_ledger(db, entry)

    db.add.assert_called_once()
    added_orm = db.add.call_args[0][0]
    assert str(added_orm.authorized_by) == "00000000-0000-0000-0000-000000000000"


@pytest.mark.asyncio
async def test_save_ledger_with_valid_company_id():
    """save_ledger correctly sets company_id from entry."""
    from app.services.pipeline_db import save_ledger

    cid = str(uuid.uuid4())
    db = _make_db()
    entry = _make_ledger_entry(company_id=cid)
    await save_ledger(db, entry)

    db.add.assert_called_once()
    added_orm = db.add.call_args[0][0]
    assert str(added_orm.company_id) == cid


@pytest.mark.asyncio
async def test_save_ledger_with_invalid_company_id_skips():
    """save_ledger sets company_id to None when company_id is invalid UUID."""
    from app.services.pipeline_db import save_ledger

    db = _make_db()
    entry = _make_ledger_entry(company_id="not-a-uuid")
    await save_ledger(db, entry)

    db.add.assert_called_once()
    added_orm = db.add.call_args[0][0]
    assert added_orm.company_id is None


@pytest.mark.asyncio
async def test_save_ledger_without_provenance_or_freeze():
    """save_ledger handles None provenance_chain and freeze_artifact gracefully."""
    from app.services.pipeline_db import save_ledger

    db = _make_db()
    entry = LedgerEntry(
        ledger_id="LEDG-002",
        order_id="ORD-002",
        staging_id="STG-002",
        authorized_by=str(uuid.uuid4()),
        authorized_at=datetime(2024, 1, 1, 14, 0, 0, tzinfo=timezone.utc),
        signature_hash="sig_xyz",
        provenance_chain=ProvenanceChain(),
        replay_verified=False,
        root_hash="",
        freeze_artifact=None,
    )
    await save_ledger(db, entry)
    db.add.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_load_ledger_returns_none_when_not_found():
    """load_ledger returns None when ledger_id does not exist."""
    from app.services.pipeline_db import load_ledger

    db = _make_db()
    result = await load_ledger(db, "NONEXISTENT")
    assert result is None


@pytest.mark.asyncio
async def test_load_ledger_returns_schema_when_found():
    """load_ledger returns LedgerEntry when ORM row exists."""
    from app.services.pipeline_db import load_ledger

    db = _make_db()
    orm_row = _make_orm_ledger("LEDG-001")
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = orm_row
    db.execute.return_value = mock_result

    result = await load_ledger(db, "LEDG-001")
    assert result is not None
    assert result.ledger_id == "LEDG-001"
    assert result.replay_verified is True


@pytest.mark.asyncio
async def test_load_ledger_with_company_id_on_row():
    """load_ledger sets company_id from the ORM row when present."""
    from app.services.pipeline_db import load_ledger

    db = _make_db()
    cid = uuid.uuid4()
    orm_row = _make_orm_ledger("LEDG-003")
    orm_row.company_id = cid

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = orm_row
    db.execute.return_value = mock_result

    result = await load_ledger(db, "LEDG-003")
    assert result is not None
    assert result.company_id == str(cid)


@pytest.mark.asyncio
async def test_load_all_ledger_returns_empty_list():
    """load_all_ledger returns [] when no ledger entries exist."""
    from app.services.pipeline_db import load_all_ledger

    db = _make_db()
    result = await load_all_ledger(db)
    assert result == []


@pytest.mark.asyncio
async def test_load_all_ledger_returns_multiple():
    """load_all_ledger converts all ORM rows to Pydantic LedgerEntry schemas."""
    from app.services.pipeline_db import load_all_ledger

    db = _make_db()
    rows = [_make_orm_ledger("LEDG-001"), _make_orm_ledger("LEDG-002")]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = rows
    db.execute.return_value = mock_result

    result = await load_all_ledger(db)
    assert len(result) == 2
    assert result[0].ledger_id == "LEDG-001"
    assert result[1].ledger_id == "LEDG-002"


@pytest.mark.asyncio
async def test_load_all_ledger_with_valid_company_id_filter():
    """load_all_ledger applies company_id_filter without error."""
    from app.services.pipeline_db import load_all_ledger

    db = _make_db()
    cid = str(uuid.uuid4())
    result = await load_all_ledger(db, company_id_filter=cid)
    assert result == []


@pytest.mark.asyncio
async def test_load_all_ledger_with_invalid_company_id_filter():
    """load_all_ledger ignores invalid company_id_filter."""
    from app.services.pipeline_db import load_all_ledger

    db = _make_db()
    result = await load_all_ledger(db, company_id_filter="not-a-uuid")
    assert result == []


# ===========================================================================
# _proposal_orm_to_schema / _staging_orm_to_schema / _ledger_orm_to_schema
# (private converters exercised indirectly through load_ functions above,
#  but also tested directly for edge cases)
# ===========================================================================

def test_proposal_orm_to_schema_with_company_id():
    """_proposal_orm_to_schema converts company_id UUID to string."""
    from app.services.pipeline_db import _proposal_orm_to_schema

    cid = uuid.uuid4()
    orm_row = _make_orm_proposal("PROP-X")
    orm_row.company_id = cid

    schema = _proposal_orm_to_schema(orm_row)
    assert schema.company_id == str(cid)


def test_proposal_orm_to_schema_without_company_id():
    """_proposal_orm_to_schema returns None for company_id when ORM row has None."""
    from app.services.pipeline_db import _proposal_orm_to_schema

    orm_row = _make_orm_proposal("PROP-Y")
    orm_row.company_id = None

    schema = _proposal_orm_to_schema(orm_row)
    assert schema.company_id is None


def test_staging_orm_to_schema_with_company_id():
    """_staging_orm_to_schema converts company_id UUID to string."""
    from app.services.pipeline_db import _staging_orm_to_schema

    cid = uuid.uuid4()
    orm_row = _make_orm_staging("STG-X")
    orm_row.company_id = cid

    schema = _staging_orm_to_schema(orm_row)
    assert schema.company_id == str(cid)


def test_ledger_orm_to_schema_with_company_id():
    """_ledger_orm_to_schema converts company_id UUID to string."""
    from app.services.pipeline_db import _ledger_orm_to_schema

    cid = uuid.uuid4()
    orm_row = _make_orm_ledger("LEDG-X")
    orm_row.company_id = cid

    schema = _ledger_orm_to_schema(orm_row)
    assert schema.company_id == str(cid)
