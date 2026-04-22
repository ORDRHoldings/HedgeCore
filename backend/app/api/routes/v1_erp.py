"""
ERP live pull routes.

POST /v1/erp/pull/{connector_id} — trigger on-demand ERP pull
GET  /v1/erp/pull-status         — list recent pull results (stub)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import get_current_user
from app.deps.plan_tier import require_plan
from app.models.user import User
from app.schemas_v1.erp import ERPPullResult
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/erp", tags=["v1-erp"])

_PLAN_DEPS = [require_plan("professional", "enterprise")]


@router.post(
    "/pull/{connector_id}",
    response_model=ERPPullResult,
    dependencies=_PLAN_DEPS,
)
async def trigger_erp_pull(
    connector_id: str,  # Logical ERP connector ID (key in company.settings["erp_credentials"])
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """On-demand ERP invoice pull. Creates NEW positions for new invoices.

    NOTE: There is no `Connector` ORM entity in Phase 1.
    ERP credentials are stored in `company.settings["erp_credentials"][connector_id]`.
    A full `Connector` entity is a Phase 2 deliverable.
    """
    from app.services.erp_adapters.xero import XeroAdapter  # noqa: PLC0415
    from app.services.erp_adapters.netsuite import NetSuiteAdapter  # noqa: PLC0415
    from app.services.erp_connector_service import process_invoices  # noqa: PLC0415

    company_settings = current_user.company.settings or {}
    erp_credentials = company_settings.get("erp_credentials", {})
    settings = erp_credentials.get(connector_id, {})
    if not settings:
        raise HTTPException(
            status_code=404,
            detail=f"No ERP credentials configured for connector '{connector_id}'",
        )

    system = settings.get("system", "").upper()
    base_currency = company_settings.get("base_currency", "USD")

    if system == "XERO":
        adapter = XeroAdapter(
            access_token=settings.get("access_token", ""),
            tenant_id=settings.get("tenant_id", ""),
        )
    elif system == "NETSUITE":
        adapter = NetSuiteAdapter(
            account_id=settings.get("account_id", ""),
            consumer_key=settings.get("consumer_key", ""),
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown ERP system: {system}")

    invoices = await adapter.pull_open_invoices(base_currency=base_currency)
    created, skipped = await process_invoices(
        session, invoices, current_user.company.id, current_user
    )
    await session.commit()

    await emit_audit(
        session=session, user=current_user,
        event_type="SYSTEM",
        description=f"ERP pull: {len(created)} positions created, {skipped} skipped",
        entity_type="erp_pull", entity_id=str(connector_id),
        payload={
            "source_system": system,
            "created": len(created),
            "skipped": skipped,
        },
    )

    return ERPPullResult(
        source_system=system,
        invoices_fetched=len(invoices),
        positions_created=len(created),
        duplicates_skipped=skipped,
    )
