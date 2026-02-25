"""

Position API routes -- /api/v1/positions



Standard CRUD:

  GET    /v1/positions                    -> list (trades.view)

  POST   /v1/positions                    -> create (trades.create)

  PUT    /v1/positions/{id}               -> update (trades.edit)

  DELETE /v1/positions/{id}               -> soft-delete (trades.delete)

  POST   /v1/positions/import             -> CSV bulk import (trades.create)

  GET    /v1/positions/exposure           -> aggregated per-currency totals (trades.view)



Lifecycle transitions (Phase 0 regulated backbone -- fail-closed):

  PATCH  /v1/positions/{id}/assign-policy -> NEW -> POLICY_ASSIGNED (trades.edit)

  PATCH  /v1/positions/{id}/ready         -> POLICY_ASSIGNED -> READY_TO_EXECUTE (trades.edit)

  PATCH  /v1/positions/{id}/execute       -> READY_TO_EXECUTE -> HEDGED (trades.execute)

  PATCH  /v1/positions/{id}/reject        -> any -> REJECTED (trades.edit)

  PATCH  /v1/positions/{id}/reopen        -> REJECTED -> NEW (trades.edit)



All endpoints require JWT. Scope (company+branch) is resolved from the token.

Illegal lifecycle transitions return 409 Conflict with a structured error body.

"""

from __future__ import annotations



import csv

import io

import logging

from typing import Optional

from uuid import UUID



from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile

from sqlalchemy.ext.asyncio import AsyncSession



from app.core.db import get_async_session

from app.core.security import get_current_user

from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event

from app.models.user import User

from app.schemas_v1.positions import (

    AssignPolicyRequest,

    ExecutePositionRequest,

    ExposureAggregation,

    PositionCreate,

    PositionListResponse,

    PositionResponse,

    PositionUpdate,

    ReadyToExecuteRequest,

    RejectPositionRequest,

)

from app.services import position_service, rbac_service

from sqlalchemy import select as sa_select



logger = logging.getLogger(__name__)



router = APIRouter(prefix="/v1/positions", tags=["v1-positions"])





# ---------------------------------------------------------------------------

# Auth/RBAC helpers (inline -- avoids session factory mismatch)

# ---------------------------------------------------------------------------



async def _check_permission(

    session: AsyncSession, user: User, codename: str

) -> None:

    if user.is_superuser:

        return

    perms = await rbac_service.get_permissions_by_user(session, user.id)

    if codename not in perms:

        raise HTTPException(

            status_code=403, detail=f"Missing permission: {codename}"

        )





async def _resolve_scope(session: AsyncSession, user: User) -> bool:

    """Returns True if the user may see all branches in their company."""

    if user.is_superuser:

        return True

    perms = await rbac_service.get_permissions_by_user(session, user.id)

    return "reports.view_all_branches" in perms





# ---------------------------------------------------------------------------

# Routes -- NOTE: /exposure and /import must come before /{position_id}

# ---------------------------------------------------------------------------



@router.get("/exposure", response_model=list[ExposureAggregation])

async def get_exposure(

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """

    Aggregate active positions by currency.

    Returns confirmed + forecast totals per currency.

    Empty list when no positions exist (never returns fake zeros).

    """

    await _check_permission(session, current_user, "trades.view")

    all_branches = await _resolve_scope(session, current_user)

    return await position_service.get_exposure_aggregation(

        session, current_user, all_branches

    )





@router.post("/import", status_code=200)

async def import_positions_csv(

    file: UploadFile = File(...),

    session: AsyncSession = Depends(get_async_session),

    current_user: User = Depends(get_current_user),

):

    """

    Bulk-import positions from CSV.

    Expected columns: record_id, entity, flow_type, currency, amount, value_date,

                      status (optional), description (optional)

    Returns: { created: int, errors: [{row, record_id, error}], total_rows: int }

    """

    await _check_permission(session, current_user, "trades.create")



    content = await file.read()

    try:

        text = content.decode("utf-8-sig")  # handle BOM from Excel exports

    except UnicodeDecodeError:

        text = content.decode("latin-1")



    reader = csv.DictReader(io.StringIO(text))

    rows: list[PositionCreate] = []

    parse_errors: list[dict] = []



    for i, row in enumerate(reader):

        try:

            rows.append(

                PositionCreate(

                    record_id=row["record_id"],

                    entity=row["entity"],

                    flow_type=row["flow_type"],

                    currency=row["currency"],

                    amount=float(row["amount"]),

                    value_date=row["value_date"],

                    status=row.get("status") or "CONFIRMED",

                    description=row.get("description") or None,

                )

            )

        except Exception as e:

            parse_errors.append({"row": i + 2, "error": str(e)})  # +2: header row + 0-index



    if parse_errors:

        raise HTTPException(

            status_code=422,

            detail={"parse_errors": parse_errors},

        )



    created, import_errors = await position_service.bulk_import(

        session, current_user, rows

    )

    return {

        "created": len(created),

        "errors": import_errors,

        "total_rows": len(rows),

    }





@router.get("", response_model=PositionListResponse)

async def list_positions(

    status:    Optional[str] = Query(default=None, description="CONFIRMED or FORECAST"),

    currency:  Optional[str] = Query(default=None, description="ISO 4217 code"),

    flow_type: Optional[str] = Query(default=None, description="AR or AP"),

    session:   AsyncSession  = Depends(get_async_session),

    current_user: User       = Depends(get_current_user),

):

    await _check_permission(session, current_user, "trades.view")

    all_branches = await _resolve_scope(session, current_user)

    items = await position_service.list_positions(

        session, current_user, all_branches, status, currency, flow_type

    )

    return {"items": items, "total": len(items)}





@router.post("", response_model=PositionResponse, status_code=201)
async def create_position(
    data:         PositionCreate,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    await _check_permission(session, current_user, "trades.create")
    try:
        pos = await position_service.create_position(session, current_user, data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    # WORM audit: every ingest is logged per Bloomberg/BlackRock regulatory standards
    await _emit_lifecycle_audit(
        session, current_user,
        event_type  = "INGEST",
        description = f"Position {pos.record_id} created via manual entry",
        position_id = str(pos.id),
        payload     = {
            "action":     "CREATE",
            "record_id":  pos.record_id,
            "entity":     pos.entity,
            "flow_type":  pos.flow_type,
            "currency":   pos.currency,
            "amount":     float(pos.amount),
            "value_date": str(pos.value_date),
            "status":     pos.status,
        },
        request = request,
    )
    return pos


@router.put("/{position_id}", response_model=PositionResponse)
async def update_position(
    position_id:  UUID,
    data:         PositionUpdate,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    await _check_permission(session, current_user, "trades.edit")
    all_branches = await _resolve_scope(session, current_user)
    try:
        pos = await position_service.update_position(
            session, current_user, position_id, data, all_branches
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    # WORM audit: every field change is logged
    await _emit_lifecycle_audit(
        session, current_user,
        event_type  = "LIFECYCLE",
        description = f"Position {pos.record_id} fields updated",
        position_id = str(pos.id),
        payload     = {
            "action":    "UPDATE",
            "record_id": pos.record_id,
            "changes":   data.model_dump(exclude_none=True),
        },
        request = request,
    )
    return pos


@router.delete("/{position_id}", status_code=204)
async def delete_position(
    position_id:  UUID,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    await _check_permission(session, current_user, "trades.delete")
    all_branches = await _resolve_scope(session, current_user)
    record_id_str = str(position_id)
    try:
        # Capture record_id for the audit trail before soft-delete
        from app.services.position_service import get_position
        pos_obj = await get_position(session, current_user, position_id, all_branches)
        if pos_obj:
            record_id_str = pos_obj.record_id
        await position_service.delete_position(
            session, current_user, position_id, all_branches
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    # WORM audit: soft-delete logged (position deactivated, not destroyed)
    await _emit_lifecycle_audit(
        session, current_user,
        event_type  = "LIFECYCLE",
        description = f"Position {record_id_str} soft-deleted (is_active=False)",
        position_id = str(position_id),
        payload     = {"action": "DELETE", "record_id": record_id_str},
        request     = request,
    )


# ---------------------------------------------------------------------------

# Lifecycle transition endpoints (Phase 0 regulated backbone)

#

# All transitions are fail-closed: illegal transitions return 409 Conflict

# with a structured body: {"error": "ILLEGAL_TRANSITION", "detail": "...",

#                          "current_status": "...", "requested": "..."}

# ---------------------------------------------------------------------------



def _lifecycle_error(e: ValueError, current: str, target: str) -> HTTPException:

    return HTTPException(

        status_code=409,

        detail={

            "error":          "ILLEGAL_TRANSITION",

            "detail":         str(e),

            "current_status": current,

            "requested":      target,

        },

    )





async def _get_actor_role(session: AsyncSession, user: User) -> str | None:

    """

    Resolve the primary role name for the actor from the RBAC service.

    Returns the first assigned role name, or None if no roles assigned.

    Non-fatal: returns None on any error so audit emission never blocks.

    """

    try:

        from app.services.rbac_service import get_user_roles

        roles = await get_user_roles(session, user.id)

        if roles:

            # Return the role with the lowest hierarchy level (most privileged)

            sorted_roles = sorted(roles, key=lambda r: getattr(r, "hierarchy_level", 99))

            return sorted_roles[0].name

        return None

    except Exception:

        return None





async def _emit_lifecycle_audit(

    session:      AsyncSession,

    user:         User,

    event_type:   str,

    description:  str,

    position_id:  str,

    payload:      dict,

    request:      Request | None = None,

) -> None:

    """

    Append an audit event for a lifecycle transition.



    Sprint 0.2 additions:

    - Threads request_id from AuditHeadersMiddleware (X-Request-Id header)

    - Captures client IP address from request

    - Resolves actor_role from RBAC service



    Fetches the most recent event_hash for this tenant to maintain chain linkage.

    Non-fatal: any DB error is swallowed so lifecycle responses always succeed.

    """

    try:

        q = (

            sa_select(AuditEvent.event_hash)

            .where(AuditEvent.company_id == user.company_id)

            .order_by(AuditEvent.created_at.desc())

            .limit(1)

        )

        result = await session.execute(q)

        prev_hash = result.scalars().first() or GENESIS_HASH



        # Extract correlation context from request headers (set by AuditHeadersMiddleware)

        request_id: str | None = None

        ip_address: str | None = None

        if request is not None:

            request_id = request.headers.get("X-Request-Id")

            client = request.client

            ip_address = client.host if client else None



        # Resolve actor's primary role for audit record

        actor_role = await _get_actor_role(session, user)



        event = build_audit_event(

            event_type      = event_type,

            description     = description,

            payload         = payload,

            prev_event_hash = prev_hash,

            company_id      = user.company_id,

            branch_id       = user.branch_id,

            actor_id        = user.id,

            actor_email     = user.email,

            actor_role      = actor_role,

            entity_type     = "position",

            entity_id       = position_id,

            request_id      = request_id,

            ip_address      = ip_address,

        )

        session.add(event)

        await session.commit()

    except Exception:

        logger.warning(

            "Failed to emit audit event for position %s event_type=%s",

            position_id, event_type, exc_info=True,

        )





@router.patch("/{position_id}/assign-policy", response_model=PositionResponse)

async def assign_policy(

    position_id:  UUID,

    data:         AssignPolicyRequest,

    request:      Request,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

):

    """

    Assign a policy instance to a position.

    Transitions: NEW -> POLICY_ASSIGNED (or POLICY_ASSIGNED -> POLICY_ASSIGNED re-assign).

    Required permission: trades.edit

    """

    await _check_permission(session, current_user, "trades.edit")

    all_branches = await _resolve_scope(session, current_user)

    try:

        pos = await position_service.assign_policy(

            session, current_user, position_id, data, all_branches

        )

    except ValueError as e:

        msg = str(e)

        if "Illegal lifecycle" in msg:

            raise _lifecycle_error(e, "unknown", "POLICY_ASSIGNED")

        raise HTTPException(status_code=404, detail=msg)

    await _emit_lifecycle_audit(

        session, current_user,

        event_type  = "LIFECYCLE",

        description = f"Position {pos.record_id} policy assigned -> POLICY_ASSIGNED",

        position_id = str(pos.id),

        payload     = {

            "transition":         "POLICY_ASSIGNED",

            "policy_instance_id": str(data.policy_instance_id),

            "record_id":          pos.record_id,

        },

        request     = request,

    )

    return pos





@router.patch("/{position_id}/ready", response_model=PositionResponse)

async def mark_ready(

    position_id:  UUID,

    data:         ReadyToExecuteRequest,

    request:      Request,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

):

    """

    Link a calculation run and mark position ready to execute.

    Transitions: POLICY_ASSIGNED -> READY_TO_EXECUTE.

    Required permission: trades.edit

    """

    await _check_permission(session, current_user, "trades.edit")

    all_branches = await _resolve_scope(session, current_user)

    try:

        pos = await position_service.mark_ready(

            session, current_user, position_id, data, all_branches

        )

    except ValueError as e:

        msg = str(e)

        if "Illegal lifecycle" in msg:

            raise _lifecycle_error(e, "unknown", "READY_TO_EXECUTE")

        raise HTTPException(status_code=404, detail=msg)

    await _emit_lifecycle_audit(

        session, current_user,

        event_type  = "LIFECYCLE",

        description = f"Position {pos.record_id} run linked -> READY_TO_EXECUTE",

        position_id = str(pos.id),

        payload     = {

            "transition":   "READY_TO_EXECUTE",

            "run_id":       data.run_id,

            "hedge_amount": data.hedge_amount,

            "hedge_rate":   data.hedge_rate,

            "record_id":    pos.record_id,

        },

        request     = request,

    )

    return pos





@router.patch("/{position_id}/execute", response_model=PositionResponse)

async def execute_position(

    position_id:  UUID,

    data:         ExecutePositionRequest,

    request:      Request,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

):

    """

    Confirm execution -- IBKR ack, bank confirmation, or manual attestation.

    Transitions: READY_TO_EXECUTE -> HEDGED (terminal -- no further transitions).

    execution_ref, executed_at, hedge_amount, hedge_rate become immutable.

    Required permission: trades.execute (separate from trades.edit -- SoD gate)

    """

    await _check_permission(session, current_user, "trades.execute")

    all_branches = await _resolve_scope(session, current_user)

    try:

        pos = await position_service.execute_position(

            session, current_user, position_id, data, all_branches

        )

    except ValueError as e:

        msg = str(e)

        if "Illegal lifecycle" in msg:

            raise _lifecycle_error(e, "unknown", "HEDGED")

        raise HTTPException(status_code=404, detail=msg)

    await _emit_lifecycle_audit(

        session, current_user,

        event_type  = "EXECUTION",

        description = f"Position {pos.record_id} executed -> HEDGED (ref: {data.execution_ref})",

        position_id = str(pos.id),

        payload     = {

            "transition":    "HEDGED",

            "execution_ref": data.execution_ref,

            "hedge_amount":  float(pos.hedge_amount) if pos.hedge_amount else None,

            "hedge_rate":    float(pos.hedge_rate)   if pos.hedge_rate   else None,

            "executed_at":   pos.executed_at.isoformat() if pos.executed_at else None,

            "record_id":     pos.record_id,

        },

        request     = request,

    )

    return pos





@router.patch("/{position_id}/reject", response_model=PositionResponse)

async def reject_position(

    position_id:  UUID,

    data:         RejectPositionRequest,

    request:      Request,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

):

    """

    Reject a position from any non-terminal state.

    rejection_reason is mandatory for audit trail completeness.

    Transitions: any -> REJECTED.

    Required permission: trades.edit

    """

    await _check_permission(session, current_user, "trades.edit")

    all_branches = await _resolve_scope(session, current_user)

    try:

        pos = await position_service.reject_position(

            session, current_user, position_id, data, all_branches

        )

    except ValueError as e:

        msg = str(e)

        if "Illegal lifecycle" in msg:

            raise _lifecycle_error(e, "unknown", "REJECTED")

        raise HTTPException(status_code=404, detail=msg)

    await _emit_lifecycle_audit(

        session, current_user,

        event_type  = "REJECTION",

        description = f"Position {pos.record_id} rejected -> REJECTED: {data.reason}",

        position_id = str(pos.id),

        payload     = {

            "transition":       "REJECTED",

            "rejection_reason": data.reason,

            "record_id":        pos.record_id,

        },

        request     = request,

    )

    return pos





@router.patch("/{position_id}/reopen", response_model=PositionResponse)

async def reopen_position(

    position_id:  UUID,

    request:      Request,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

):

    """

    Re-open a rejected position. Clears policy/run linkage and returns to NEW.

    Transitions: REJECTED -> NEW.

    Required permission: trades.edit

    """

    await _check_permission(session, current_user, "trades.edit")

    all_branches = await _resolve_scope(session, current_user)

    try:

        pos = await position_service.reopen_position(

            session, current_user, position_id, all_branches

        )

    except ValueError as e:

        msg = str(e)

        if "Illegal lifecycle" in msg:

            raise _lifecycle_error(e, "unknown", "NEW")

        raise HTTPException(status_code=404, detail=msg)

    await _emit_lifecycle_audit(

        session, current_user,

        event_type  = "LIFECYCLE",

        description = f"Position {pos.record_id} re-opened -> NEW",

        position_id = str(pos.id),

        payload     = {

            "transition": "NEW",

            "record_id":  pos.record_id,

        },

        request     = request,

    )

    return pos





# ---------------------------------------------------------------------------

# Lineage endpoint -- Sprint 1.4

# ---------------------------------------------------------------------------



@router.get("/{position_id}/lineage")

async def get_position_lineage(

    position_id:  UUID,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

):

    """

    GET /v1/positions/{id}/lineage



    Returns the full provenance chain for a single position:

      Position -> PolicyInstance -> PolicyRevision -> CalculationRun -> ExecutionProposals



    Each node includes enough data to render a card: id, type, status, key fields,

    timestamps, and links to drill-down pages.



    Responds with a flat list of nodes + edges for frontend graph rendering.

    Requires: trades.view permission.

    """

    await _check_permission(session, current_user, "trades.view")

    all_branches = await _resolve_scope(session, current_user)



    # Fetch the Position

    from app.models.position import Position

    pos_q = sa_select(Position).where(Position.id == position_id)

    if not all_branches and current_user.company_id:

        pos_q = pos_q.where(Position.company_id == current_user.company_id)

    pos = (await session.execute(pos_q)).scalars().first()

    if pos is None:

        raise HTTPException(status_code=404, detail=f"Position {position_id!s} not found")



    nodes: list[dict] = []

    edges: list[dict] = []



    # Node 0: Position

    pos_node_id = f"position:{pos.id}"

    nodes.append({

        "id":     pos_node_id,

        "type":   "POSITION",

        "label":  pos.record_id,

        "status": pos.execution_status,

        "fields": {

            "record_id":          pos.record_id,

            "entity":             pos.entity,

            "flow_type":          pos.flow_type,

            "currency":           pos.currency,

            "amount":             str(pos.amount),

            "value_date":         pos.value_date,

            "status":             pos.status,

            "execution_status":   pos.execution_status,

            "hedge_amount":       str(pos.hedge_amount) if pos.hedge_amount else None,

            "hedge_rate":         str(pos.hedge_rate) if pos.hedge_rate else None,

            "execution_ref":      pos.execution_ref,

            "executed_at":        pos.executed_at.isoformat() if pos.executed_at else None,

            "rejection_reason":   pos.rejection_reason,

            "created_at":         pos.created_at.isoformat() if pos.created_at else None,

        },

        "links": { "position_desk": "/position-desk" },

    })



    # Node 1: PolicyInstance

    if pos.policy_id:

        from app.models.policy import PolicyInstance

        pi = await session.get(PolicyInstance, pos.policy_id)

        if pi:

            pi_node_id = f"policy:{pi.id}"

            nodes.append({

                "id":     pi_node_id,

                "type":   "POLICY",

                "label":  getattr(pi, "name", str(pi.id)[:8].upper()) or str(pi.id)[:8].upper(),

                "status": "ACTIVE" if getattr(pi, "is_active", True) else "INACTIVE",

                "fields": {

                    "id":         str(pi.id),

                    "is_active":  getattr(pi, "is_active", None),

                    "created_at": pi.created_at.isoformat() if hasattr(pi, "created_at") and pi.created_at else None,

                },

                "links": { "policies": "/policies" },

            })

            edges.append({"from": pos_node_id, "to": pi_node_id, "label": "GOVERNED BY"})



    # Node 1b: PolicyRevision pinned to this position

    if pos.policy_revision_id:

        from app.models.policy_revision import PolicyRevision

        pr = await session.get(PolicyRevision, pos.policy_revision_id)

        if pr:

            pr_node_id = f"policy_revision:{pr.id}"

            nodes.append({

                "id":     pr_node_id,

                "type":   "POLICY_REVISION",

                "label":  f"Rev #{getattr(pr, 'revision', '?')} . {str(pr.id)[:8].upper()}",

                "status": "WORM",

                "fields": {

                    "id":               str(pr.id),

                    "revision":         getattr(pr, "revision", None),

                    "policy_hash":      getattr(pr, "policy_hash", None),

                    "change_reason":    getattr(pr, "change_reason", None),

                    "created_by_email": getattr(pr, "created_by_email", None),

                    "created_at":       pr.created_at.isoformat() if hasattr(pr, "created_at") and pr.created_at else None,

                },

                "links": {},

            })

            anchor = f"policy:{pos.policy_id}" if pos.policy_id else pos_node_id

            edges.append({"from": anchor, "to": pr_node_id, "label": "PINNED REVISION"})



    # Node 2: CalculationRun

    if pos.last_run_id:

        from app.models.calculation_run import CalculationRun

        run = await session.get(CalculationRun, pos.last_run_id)

        if run:

            run_node_id = f"run:{run.id}"

            nodes.append({

                "id":     run_node_id,

                "type":   "CALCULATION_RUN",

                "label":  run.id[:8].upper(),

                "status": "COMPLETE",

                "fields": {

                    "run_id":             run.id,

                    "trade_count":        run.trade_count,

                    "hedge_count":        run.hedge_count,

                    "run_hash":           run.run_hash[:16] + "..." if run.run_hash else None,

                    "inputs_hash":        run.inputs_hash[:16] + "..." if run.inputs_hash else None,

                    "outputs_hash":       run.outputs_hash[:16] + "..." if run.outputs_hash else None,

                    "policy_hash":        run.policy_hash[:16] + "..." if run.policy_hash else None,

                    "policy_revision_id": run.policy_revision_id,

                    "created_at":         run.created_at.isoformat() if run.created_at else None,

                },

                "links": {"run_viewer": f"/run-viewer?id={run.id}"},

            })

            edges.append({"from": pos_node_id, "to": run_node_id, "label": "LAST RUN"})

            if pos.policy_revision_id and run.policy_revision_id == str(pos.policy_revision_id):

                edges.append({"from": f"policy_revision:{pos.policy_revision_id}", "to": run_node_id, "label": "GOVERNED"})



    # Node 3: ExecutionProposals

    from app.models.execution_proposal import ExecutionProposal

    proposals_q = (

        sa_select(ExecutionProposal)

        .where(ExecutionProposal.position_id == position_id)

        .order_by(ExecutionProposal.created_at.asc())

    )

    proposals = list((await session.execute(proposals_q)).scalars().all())



    for ep in proposals:

        ep_node_id = f"proposal:{ep.id}"

        payload = ep.proposal_payload or {}

        nodes.append({

            "id":     ep_node_id,

            "type":   "EXECUTION_PROPOSAL",

            "label":  f"{ep.status} . {str(ep.id)[:8].upper()}",

            "status": ep.status,

            "fields": {

                "id":               str(ep.id),

                "status":           ep.status,

                "proposed_by_email":ep.proposed_by_email,

                "proposed_at":      ep.proposed_at.isoformat() if ep.proposed_at else None,

                "approved_by_email":ep.approved_by_email,

                "approved_at":      ep.approved_at.isoformat() if ep.approved_at else None,

                "approval_notes":   ep.approval_notes,

                "execution_ref":    ep.execution_ref,

                "executed_at":      ep.executed_at.isoformat() if ep.executed_at else None,

                "rejection_reason": ep.rejection_reason,

                "run_id":           payload.get("run_id"),

                "hedge_amount":     payload.get("hedge_amount"),

                "hedge_rate":       payload.get("hedge_rate"),

                "proposal_hash":    ep.proposal_hash[:16] + "..." if ep.proposal_hash else None,

                "approval_hash":    ep.approval_hash[:16] + "..." if ep.approval_hash else None,

                "created_at":       ep.created_at.isoformat() if ep.created_at else None,

            },

            "links": {},

        })

        edges.append({"from": pos_node_id, "to": ep_node_id, "label": "PROPOSAL"})

        ep_run_id = payload.get("run_id")

        if ep_run_id and pos.last_run_id == ep_run_id:

            edges.append({"from": ep_node_id, "to": f"run:{ep_run_id}", "label": "USES RUN"})



    return {

        "position_id": str(position_id),

        "nodes":       nodes,

        "edges":       edges,

        "summary": {

            "node_count":            len(nodes),

            "edge_count":            len(edges),

            "has_policy":            pos.policy_id is not None,

            "has_policy_revision":   pos.policy_revision_id is not None,

            "has_run":               pos.last_run_id is not None,

            "proposal_count":        len(proposals),

            "execution_status":      pos.execution_status,

        },

    }

