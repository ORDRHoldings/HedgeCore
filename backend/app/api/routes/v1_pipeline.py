"""Pipeline API routes: SANDBOX -> STAGING -> LEDGER -- v1 API.



13 endpoints covering the full tri-state governance lifecycle.

DB-backed persistence for proposals, staging, and ledger.

All endpoints require JWT authentication via Depends(get_current_user).

Mutation endpoints enforce inline permission checks via rbac_service.

"""




import io
import json
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.schema_state import require_schema_ready
from app.core.security import get_current_user
from app.models.user import User
from app.schemas_v1.pipeline import (
    AuthorizeRequest,
    CreateProposalRequest,
    LedgerListResponse,
    ProposalListResponse,
    SandboxCalculateRequest,
    StagingListResponse,
    SubmitToStagingRequest,
    TimelineResponse,
)
from app.services import pipeline_db, pipeline_service, rbac_service

router = APIRouter(prefix="/v1/pipeline", tags=["v1-pipeline"])





# ?????????????????????????????????????????????????????????????????????????????

# Permission helper

# ?????????????????????????????????????????????????????????????????????????????



async def _check_permission(

    session: AsyncSession, user: User, codename: str

) -> None:

    """Raise 403 if user lacks the given permission and is not superuser."""

    if user.is_superuser:

        return

    perms = await rbac_service.get_permissions_by_user(session, user.id)

    if codename not in perms:

        raise HTTPException(

            status_code=403,

            detail=f"Missing permission: {codename}",

        )





# ---------------------------------------------------------------------------

# SANDBOX (in-memory, synchronous -- no DB session needed for calculation)

# ---------------------------------------------------------------------------





@router.post("/sandbox/calculate")

async def sandbox_calculate(

    request: SandboxCalculateRequest,

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

    _schema: None = Depends(require_schema_ready),

):

    """Run engine + waterfall in sandbox mode (SIMULATION)."""

    await _check_permission(session, current_user, "calculate.run_sandbox")

    try:

        result = pipeline_service.sandbox_calculate(

            str(current_user.id), request

        )

    except ValueError as e:

        raise HTTPException(status_code=422, detail=str(e))



    resp = {

        "run_id": result["run_id"],

        "validation_report": result["validation_report"].model_dump(mode="json"),

        "waterfall_result": result["waterfall_result"].model_dump(mode="json"),

    }



    if result["calculate_response"]:

        resp["calculate_response"] = result["calculate_response"].model_dump(mode="json")

    if result["hedge_plan"]:

        resp["hedge_plan"] = result["hedge_plan"].model_dump(mode="json")

    if result["scenario_results"]:

        resp["scenario_results"] = result["scenario_results"].model_dump(mode="json")



    return resp





# ---------------------------------------------------------------------------

# PROPOSALS (DB-backed)

# ---------------------------------------------------------------------------





@router.post("/proposals")

async def create_proposal(

    request: CreateProposalRequest,

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """Create a proposal (freeze sandbox result)."""

    await _check_permission(session, current_user, "pipeline.create_proposal")
    _company_id = str(current_user.company_id) if current_user.company_id else None

    try:

        proposal = await pipeline_service.create_proposal(

            session, str(current_user.id), request.run_id, company_id=_company_id,

        )

    except ValueError as e:

        error_msg = str(e)

        if "SNAPSHOT_STALE" in error_msg:

            raise HTTPException(status_code=409, detail=error_msg)

        raise HTTPException(status_code=400, detail=error_msg)



    return proposal.model_dump(mode="json")





@router.get("/proposals")

async def list_proposals(

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """List all proposals (tenant-scoped)."""

    await _check_permission(session, current_user, "pipeline.create_proposal")
    _company_id = str(current_user.company_id) if current_user.company_id else None

    proposals = await pipeline_service.list_proposals(session, company_id=_company_id)

    return ProposalListResponse(

        proposals=proposals,

        total=len(proposals),

    ).model_dump(mode="json")





@router.get("/proposals/{proposal_id}")

async def get_proposal(

    proposal_id: str,

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """Get a specific proposal (tenant-scoped)."""

    await _check_permission(session, current_user, "pipeline.create_proposal")
    _company_id = str(current_user.company_id) if current_user.company_id else None

    proposal = await pipeline_service.get_proposal(session, proposal_id, company_id=_company_id)

    if not proposal:

        raise HTTPException(status_code=404, detail=f"Proposal {proposal_id} not found")

    return proposal.model_dump(mode="json")





@router.post("/proposals/{proposal_id}/submit")

async def submit_to_staging(

    proposal_id: str,

    request: SubmitToStagingRequest,

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """Submit a proposal to staging for governance review."""

    await _check_permission(session, current_user, "pipeline.submit_staging")

    try:

        _company_id = str(current_user.company_id) if current_user.company_id else None
        artifact = await pipeline_service.submit_to_staging(

            session, proposal_id, str(current_user.id), request,

            company_id=_company_id,

        )

    except ValueError as e:

        raise HTTPException(status_code=400, detail=str(e))



    return artifact.model_dump(mode="json")





# ---------------------------------------------------------------------------

# STAGING (DB-backed)

# ---------------------------------------------------------------------------





@router.get("/staging")
async def list_staging(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """List staged artifacts with optional status filter and pagination."""
    _company_id = str(current_user.company_id) if current_user.company_id else None
    artifacts = await pipeline_service.list_staging(
        session, limit=limit, offset=offset, status_filter=status, company_id=_company_id,
    )
    total = await pipeline_db.count_staging(session, status_filter=status, company_id_filter=_company_id)
    return StagingListResponse(
        artifacts=artifacts,
        total=total,
    ).model_dump(mode="json")





@router.get("/staging/{staging_id}")

async def get_staging(

    staging_id: str,

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """Get a specific staged artifact."""

    _company_id = str(current_user.company_id) if current_user.company_id else None
    artifact = await pipeline_service.get_staging(session, staging_id, company_id=_company_id)

    if not artifact:

        raise HTTPException(status_code=404, detail=f"Staging {staging_id} not found")

    return artifact.model_dump(mode="json")





@router.post("/staging/{staging_id}/authorize")
async def authorize_staged(
    staging_id: str,
    request: AuthorizeRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Authorize a staged artifact."""
    # P1-5: Per-action permission gate
    if request.action.value == "REJECT":
        await _check_permission(session, current_user, "pipeline.reject")
    else:
        await _check_permission(session, current_user, "pipeline.approve")
    # Resolve actual role
    roles = await rbac_service.get_roles_by_user(session, current_user.id)
    user_role = roles[0] if roles else "unknown"
    _cid = str(current_user.company_id) if current_user.company_id else None
    try:
        result = await pipeline_service.authorize_staged(
            session, staging_id, str(current_user.id), user_role, request,
            company_id=_cid,
        )
    except ValueError as e:
        error_msg = str(e)
        if "SNAPSHOT_STALE" in error_msg or "CONCURRENT_MODIFICATION" in error_msg:

            raise HTTPException(status_code=409, detail=error_msg)

        raise HTTPException(status_code=400, detail=error_msg)



    return result.model_dump(mode="json")





# ---------------------------------------------------------------------------

# LEDGER (DB-backed)

# ---------------------------------------------------------------------------





@router.get("/ledger")

async def list_ledger(

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """List all ledger entries (tenant-scoped)."""

    await _check_permission(session, current_user, "pipeline.approve")
    _company_id = str(current_user.company_id) if current_user.company_id else None

    entries = await pipeline_service.list_ledger(session, company_id=_company_id)

    return LedgerListResponse(

        entries=entries,

        total=len(entries),

    ).model_dump(mode="json")





@router.get("/ledger/{ledger_id}")

async def get_ledger(

    ledger_id: str,

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """Get a specific ledger entry (tenant-scoped)."""

    await _check_permission(session, current_user, "pipeline.approve")
    _company_id = str(current_user.company_id) if current_user.company_id else None

    entry = await pipeline_service.get_ledger(session, ledger_id, company_id=_company_id)

    if not entry:

        raise HTTPException(status_code=404, detail=f"Ledger {ledger_id} not found")

    return entry.model_dump(mode="json")





@router.post("/ledger/{ledger_id}/replay")

async def replay_ledger(

    ledger_id: str,

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """Run deterministic replay verification on a ledger entry."""

    await _check_permission(session, current_user, "pipeline.approve")
    _company_id = str(current_user.company_id) if current_user.company_id else None

    # Verify tenant access before replay
    entry = await pipeline_service.get_ledger(session, ledger_id, company_id=_company_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Ledger {ledger_id} not found")

    try:

        result = await pipeline_service.replay_ledger(session, ledger_id)

    except ValueError as e:

        raise HTTPException(status_code=400, detail=str(e))



    return result.model_dump(mode="json")





@router.get("/ledger/{ledger_id}/timeline")

async def get_ledger_timeline(

    ledger_id: str,

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """Get event timeline for a ledger entry (tenant-scoped)."""

    await _check_permission(session, current_user, "pipeline.approve")
    _company_id = str(current_user.company_id) if current_user.company_id else None

    entry = await pipeline_service.get_ledger(session, ledger_id, company_id=_company_id)

    if not entry:

        raise HTTPException(status_code=404, detail=f"Ledger {ledger_id} not found")



    # Collect timelines from ledger + staging + proposal

    events = pipeline_service.get_timeline(ledger_id)



    staging = await pipeline_service.get_staging(session, entry.staging_id)

    if staging:

        events.extend(pipeline_service.get_timeline(staging.staging_id))

        proposal = await pipeline_service.get_proposal(session, staging.proposal_id)

        if proposal:

            events.extend(pipeline_service.get_timeline(proposal.proposal_id))



    events.sort(key=lambda e: e.timestamp)



    return TimelineResponse(events=events).model_dump(mode="json")





@router.get("/ledger/{ledger_id}/export/{fmt}")

async def export_ledger(

    ledger_id: str,

    fmt: str,

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """Export ledger entry as PDF metadata, Excel metadata, or ZIP archive (tenant-scoped)."""

    await _check_permission(session, current_user, "pipeline.approve")
    _company_id = str(current_user.company_id) if current_user.company_id else None

    entry = await pipeline_service.get_ledger(session, ledger_id, company_id=_company_id)

    if not entry:

        raise HTTPException(status_code=404, detail=f"Ledger {ledger_id} not found")



    if fmt not in ("pdf", "excel", "zip"):

        raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")



    if fmt == "zip":
        # Build in-memory ZIP containing full ledger JSON + human-readable provenance
        def _safe_dump(obj) -> dict:
            try:
                return obj.model_dump(mode="json") if obj is not None else {}
            except Exception:
                return {}

        def _safe_isoformat(dt) -> str | None:
            try:
                return dt.isoformat() if dt else None
            except Exception:
                return None

        ledger_dict = {
            "meta": {
                "ledger_id": entry.ledger_id,
                "order_id": entry.order_id,
                "staging_id": entry.staging_id,
                "authorized_at": _safe_isoformat(entry.authorized_at),
                "root_hash": entry.root_hash,
                "replay_verified": entry.replay_verified,
            },
            "provenance_chain": _safe_dump(entry.provenance_chain),
            "frozen_artifact": _safe_dump(entry.freeze_artifact),
        }
        pc = _safe_dump(entry.provenance_chain)
        provenance_lines = [f"{k}: {v}" for k, v in pc.items()] if isinstance(pc, dict) else []
        provenance_text = "\n".join(provenance_lines) or "No provenance chain available."

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(
                f"ledger-{ledger_id}.json",
                json.dumps(ledger_dict, indent=2, default=str),
            )
            zf.writestr(
                f"provenance-{ledger_id}.txt",
                provenance_text,
            )
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=ledger-{ledger_id}.zip"},
        )

    # pdf and excel: return structured JSON metadata document
    return {

        "ledger_id": ledger_id,

        "format": fmt,

        "status": "export_available",

        "message": f"Export in {fmt} format for {ledger_id}",

        "meta": {
            "order_id": entry.order_id,
            "staging_id": entry.staging_id,
            "authorized_by": str(entry.authorized_by),
            "authorized_at": entry.authorized_at.isoformat() if entry.authorized_at else None,
            "signature_hash": entry.signature_hash,
            "root_hash": entry.root_hash,
            "replay_verified": entry.replay_verified,
            "company_id": entry.company_id,
        },

    }

