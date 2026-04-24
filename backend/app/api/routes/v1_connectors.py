"""
Connector API routes -- /api/v1/connectors

Endpoints:
  # File-based imports (legacy CSV/Excel)
  GET  /v1/connectors/runs            -> list import history (trades.view)
  GET  /v1/connectors/runs/{run_id}   -> detail with errors (trades.view)
  POST /v1/connectors/import/csv      -> audited CSV import (trades.create)
  POST /v1/connectors/import/excel    -> audited Excel import (trades.create)
  POST /v1/connectors/accounting/import -> trigger accounting system import (trades.create)
  POST /v1/connectors/erp/sync        -> trigger ERP sync (trades.create)

  # Live ERP connectors (Track 1 — Launch Readiness)
  GET  /v1/connectors/providers                -> list supported providers
  GET  /v1/connectors/{provider}/status        -> connection status
  GET  /v1/connectors/{provider}/health        -> live health probe
  POST /v1/connectors/{provider}/authorize     -> start OAuth flow
  POST /v1/connectors/{provider}/connect-form  -> non-OAuth connect (Intacct)
  POST /v1/connectors/{provider}/disconnect    -> revoke + wipe
  GET  /v1/connectors/{provider}/coa           -> pull chart of accounts
  POST /v1/connectors/{provider}/journal       -> post journal
  GET  /v1/connectors/oauth/callback           -> unified OAuth callback
  POST /v1/connectors/{provider}/webhook       -> inbound webhook (no JWT)

All endpoints require JWT unless noted. Scope resolved from token.
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors import oauth_state, registry, token_vault
from app.connectors.base import JournalLine, JournalPayload
from app.connectors.errors import ConnectorError
from app.core.db import async_session_maker, get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.schemas_v1.connectors import (
    AccountingImportRequest,
    COAAccountResponse,
    COAResponse,
    ConnectorAuthorizeRequest,
    ConnectorAuthorizeResponse,
    ConnectorConnectFormRequest,
    ConnectorHealthResponse,
    ConnectorRunDetailResponse,
    ConnectorRunListResponse,
    ConnectorRunResponse,
    ConnectorStatusResponse,
    ERPSyncRequest,
    JournalPostRequest,
    JournalPostResponse,
    PaperModeResponse,
    ProviderListResponse,
    ProviderMeta,
)
from app.services import connector_service, rbac_service
from app.services.audit_emit import emit_audit

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/connectors", tags=["v1-connectors"])
# ---------------------------------------------------------------------------
# Auth/RBAC helpers
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
    if user.is_superuser:
        return True
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    return "reports.view_all_branches" in perms
# ---------------------------------------------------------------------------
# Routes -- /runs must come before /import to avoid routing ambiguity
# ---------------------------------------------------------------------------

@router.get("/runs", response_model=ConnectorRunListResponse)
async def list_connector_runs(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """List import history for this company/branch, newest first."""
    await _check_permission(session, current_user, "trades.view")
    all_branches = await _resolve_scope(session, current_user)
    items = await connector_service.list_runs(
        session, current_user, all_branches, limit=limit
    )
    return {"items": items, "total": len(items)}
@router.get("/runs/{run_id}", response_model=ConnectorRunDetailResponse)
async def get_connector_run_detail(
    run_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return a single ConnectorRun with its per-row errors."""
    await _check_permission(session, current_user, "trades.view")
    try:
        run, errors = await connector_service.get_run_detail(
            session, current_user, run_id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ConnectorRunDetailResponse(
        **ConnectorRunResponse.model_validate(run).model_dump(),
        errors=errors,
    )
@router.post("/import/csv", response_model=ConnectorRunResponse, status_code=200)
async def import_csv(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Audited CSV import. Creates positions + a ConnectorRun audit record.
    Returns the ConnectorRun regardless of row-level errors.
    """
    await _check_permission(session, current_user, "trades.create")
    content = await file.read()
    run = await connector_service.import_csv_audited(
        session, current_user, content, file.filename or "upload.csv"
    )
    # PLAN-07a: audit event — CSV import completed
    await emit_audit(
        session=session,
        user=current_user,
        event_type="TRADE",
        description=f"CSV import: {file.filename or 'upload.csv'} ({run.rows_ok} ok, {run.rows_error} errors)",
        entity_type="connector_run",
        entity_id=str(run.id),
        payload={"filename": file.filename, "rows_ok": run.rows_ok, "rows_error": run.rows_error, "status": run.status},
    )
    return run


# ---------------------------------------------------------------------------
# Accounting / ERP integration stubs (production-ready paper mode)
# ---------------------------------------------------------------------------

@router.post("/accounting/import", response_model=PaperModeResponse, status_code=202)
async def import_accounting_documents(
    body: AccountingImportRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger import from accounting system (QuickBooks, Xero, NetSuite, Sage).

    **Paper mode** — no live credentials are stored. The request is accepted
    and logged, but actual data pull requires ERP credentials to be configured
    in company.settings first.
    """
    await _check_permission(session, current_user, "trades.create")
    await emit_audit(
        session=session,
        user=current_user,
        event_type="CONNECTOR",
        description="Accounting import requested (paper mode — no live credentials)",
        entity_type="connector_run",
        entity_id="paper-mode",
        payload={"status": "accepted", "mode": "paper", "detail": "ERP credentials not configured"},
    )
    return PaperModeResponse(
        status="accepted",
        mode="paper",
        detail="Accounting import is in paper mode. Configure ERP credentials in Settings > ERP Integration to enable live pulls.",
    )


@router.post("/erp/sync", response_model=PaperModeResponse, status_code=202)
async def sync_erp(
    body: ERPSyncRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger ERP sync (SAP, Oracle, NetSuite, Dynamics).

    **Paper mode** — no live credentials are stored. The request is accepted
    and logged, but actual sync requires ERP credentials to be configured
    in company.settings first.
    """
    await _check_permission(session, current_user, "trades.create")
    await emit_audit(
        session=session,
        user=current_user,
        event_type="CONNECTOR",
        description="ERP sync requested (paper mode — no live credentials)",
        entity_type="connector_run",
        entity_id="paper-mode",
        payload={"status": "accepted", "mode": "paper", "detail": "ERP credentials not configured"},
    )
    return PaperModeResponse(
        status="accepted",
        mode="paper",
        detail="ERP sync is in paper mode. Configure ERP credentials in Settings > ERP Integration to enable live sync.",
    )
@router.post("/import/excel", response_model=ConnectorRunResponse, status_code=200)
async def import_excel(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Audited Excel (.xlsx) import. Creates positions + a ConnectorRun audit record.
    Returns the ConnectorRun regardless of row-level errors.
    """
    await _check_permission(session, current_user, "trades.create")
    content = await file.read()
    run = await connector_service.import_excel_audited(
        session, current_user, content, file.filename or "upload.xlsx"
    )
    # PLAN-07b: audit event — Excel import completed
    await emit_audit(
        session=session,
        user=current_user,
        event_type="TRADE",
        description=f"Excel import: {file.filename or 'upload.xlsx'} ({run.rows_ok} ok, {run.rows_error} errors)",
        entity_type="connector_run",
        entity_id=str(run.id),
        payload={"filename": file.filename, "rows_ok": run.rows_ok, "rows_error": run.rows_error, "status": run.status},
    )
    return run


# ═════════════════════════════════════════════════════════════════════════════
# Live ERP connectors — Track 1 Launch Readiness
# ═════════════════════════════════════════════════════════════════════════════


def _connector_error_to_http(exc: ConnectorError) -> HTTPException:
    """Translate ConnectorError → HTTPException using the error's http_status."""
    return HTTPException(status_code=exc.http_status, detail=exc.to_dict())


def _tenant_id(user: User) -> UUID:
    if not user.company_id:
        raise HTTPException(
            status_code=409,
            detail="User has no company — connectors require a tenant scope.",
        )
    return user.company_id


@router.get("/providers", response_model=ProviderListResponse)
async def list_supported_providers(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return metadata for all ERP/accounting providers we can connect to."""
    await _check_permission(session, current_user, "trades.view")
    providers = [ProviderMeta(**p) for p in registry.list_providers()]
    return ProviderListResponse(providers=providers)


@router.get("/{provider}/status", response_model=ConnectorStatusResponse)
async def connector_status(
    provider: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return whether this tenant has connected this provider + last state."""
    await _check_permission(session, current_user, "trades.view")
    tenant = _tenant_id(current_user)

    # Check tokens presence
    try:
        bundle = await token_vault.load_tokens(
            session, tenant_id=tenant, provider=provider
        )
        connected = True
        realm_id = bundle.realm_id
    except ConnectorError:
        connected = False
        realm_id = None

    state = await token_vault.get_state(session, tenant_id=tenant, provider=provider)

    return ConnectorStatusResponse(
        provider_id=provider,
        connected=connected,
        realm_id=realm_id,
        last_connected_at=state.get("last_connected_at"),
        last_sync_at=state.get("last_sync_at"),
        last_error=state.get("last_error"),
        circuit_open=bool(state.get("circuit_open")),
        paper_mode=bool(state.get("paper_mode")),
    )


@router.get("/{provider}/health", response_model=ConnectorHealthResponse)
async def connector_health(
    provider: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Live health probe — calls the provider's cheapest endpoint."""
    await _check_permission(session, current_user, "trades.view")
    tenant = _tenant_id(current_user)
    try:
        connector = registry.get_connector(provider)
    except ConnectorError as exc:
        raise _connector_error_to_http(exc) from exc
    result = await connector.health_check(tenant_id=tenant)
    return ConnectorHealthResponse(
        provider_id=result.provider,
        healthy=result.healthy,
        latency_ms=result.latency_ms,
        detail=result.detail,
    )


@router.post("/{provider}/authorize", response_model=ConnectorAuthorizeResponse)
async def authorize_connector(
    provider: str,
    body: ConnectorAuthorizeRequest = Body(default_factory=ConnectorAuthorizeRequest),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Start OAuth flow. Returns authorize URL + state token.

    For form-based providers (Sage Intacct), returns requires_form=true and a
    list of fields the UI must collect before calling /connect-form.
    """
    await _check_permission(session, current_user, "trades.create")
    tenant = _tenant_id(current_user)
    try:
        connector = registry.get_connector(provider)
    except ConnectorError as exc:
        raise _connector_error_to_http(exc) from exc

    state_token = await oauth_state.issue(tenant_id=tenant, provider=provider)

    # Sage Intacct exposes no redirect flow — signal to the UI.
    if provider == "sage_intacct":
        return ConnectorAuthorizeResponse(
            authorize_url=None,
            state=state_token,
            requires_form=True,
            form_fields=["company_id", "user_id", "user_password"],
        )

    try:
        url = await connector.authorize_url(
            state=state_token, tenant_id=tenant, **body.extra
        )
    except ConnectorError as exc:
        raise _connector_error_to_http(exc) from exc

    await emit_audit(
        session=session,
        user=current_user,
        event_type="CONNECTOR",
        description=f"Connector authorize initiated: {provider}",
        entity_type="connector",
        entity_id=provider,
        payload={"provider": provider, "state_issued": True},
    )
    return ConnectorAuthorizeResponse(
        authorize_url=url, state=state_token, requires_form=False
    )


@router.post("/{provider}/connect-form", response_model=ConnectorStatusResponse)
async def connect_form(
    provider: str,
    body: ConnectorConnectFormRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Non-OAuth connect (Sage Intacct): consume state + submit credentials."""
    await _check_permission(session, current_user, "trades.create")
    tenant = _tenant_id(current_user)

    parsed_state = await oauth_state.verify_and_consume(body.state)
    if parsed_state.tenant_id != tenant or parsed_state.provider != provider:
        raise HTTPException(status_code=400, detail="State/tenant/provider mismatch")

    try:
        connector = registry.get_connector(provider)
        await connector.exchange_code(
            code="",  # unused for form-based
            state=body.state,
            tenant_id=tenant,
            **body.fields,
        )
    except ConnectorError as exc:
        raise _connector_error_to_http(exc) from exc

    await emit_audit(
        session=session,
        user=current_user,
        event_type="CONNECTOR",
        description=f"Connector connected (form): {provider}",
        entity_type="connector",
        entity_id=provider,
        payload={"provider": provider, "auth_style": "form"},
    )
    return await connector_status(provider=provider, session=session, current_user=current_user)


@router.get("/oauth/callback")
async def oauth_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
):
    """Unified OAuth redirect target. Verifies state, swaps code → tokens.

    No JWT: the user is mid-browser-redirect and has no Authorization header.
    Security is provided by the HMAC-signed state token issued in /authorize.
    """
    try:
        parsed_state = await oauth_state.verify_and_consume(state)
    except ConnectorError as exc:
        raise _connector_error_to_http(exc) from exc

    provider = parsed_state.provider
    tenant_id_ = parsed_state.tenant_id

    # Providers attach provider-specific params (realmId for QBO, etc.).
    extra = {k: v for k, v in request.query_params.items() if k not in {"code", "state"}}

    try:
        connector = registry.get_connector(provider)
        await connector.exchange_code(
            code=code, state=state, tenant_id=tenant_id_, **extra
        )
    except ConnectorError as exc:
        log.exception("connector.oauth_callback failed provider=%s tenant=%s", provider, tenant_id_)
        # Use a user-visible frontend URL for the error — keeps error out of logs only.
        return RedirectResponse(
            url=f"/settings/connectors?provider={provider}&status=error&detail={exc.message[:120]}",
            status_code=302,
        )

    async with async_session_maker() as audit_session:
        # Best-effort: connector callback has no User to attribute audit to.
        log.info("connector.connected provider=%s tenant=%s", provider, tenant_id_)

    return RedirectResponse(
        url=f"/settings/connectors?provider={provider}&status=connected",
        status_code=302,
    )


@router.post("/{provider}/disconnect", status_code=204)
async def disconnect_connector(
    provider: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    await _check_permission(session, current_user, "trades.create")
    tenant = _tenant_id(current_user)
    try:
        connector = registry.get_connector(provider)
        await connector.revoke(tenant_id=tenant)
    except ConnectorError as exc:
        raise _connector_error_to_http(exc) from exc

    await emit_audit(
        session=session,
        user=current_user,
        event_type="CONNECTOR",
        description=f"Connector disconnected: {provider}",
        entity_type="connector",
        entity_id=provider,
        payload={"provider": provider},
    )


@router.get("/{provider}/coa", response_model=COAResponse)
async def pull_coa(
    provider: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    await _check_permission(session, current_user, "trades.view")
    tenant = _tenant_id(current_user)
    try:
        connector = registry.get_connector(provider)
        accounts = await connector.pull_coa(tenant_id=tenant)
    except ConnectorError as exc:
        raise _connector_error_to_http(exc) from exc
    return COAResponse(
        provider_id=provider,
        accounts=[COAAccountResponse(**a.__dict__) for a in accounts],
        fetched_at=datetime.now(timezone.utc),
    )


@router.post("/{provider}/journal", response_model=JournalPostResponse)
async def post_journal(
    provider: str,
    body: JournalPostRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Post a GL journal entry to the connected provider."""
    await _check_permission(session, current_user, "trades.create")
    tenant = _tenant_id(current_user)

    lines = tuple(
        JournalLine(
            account_external_id=ln.account_external_id,
            debit=Decimal(ln.debit or "0"),
            credit=Decimal(ln.credit or "0"),
            description=ln.description,
            currency=ln.currency,
            memo=ln.memo,
            dimensions=ln.dimensions,
        )
        for ln in body.lines
    )
    payload = JournalPayload(
        journal_entry_id=tenant,  # placeholder — real flow uses an ORDR JE id
        posting_date=body.posting_date,
        memo=body.memo,
        reference=body.reference,
        lines=lines,
        dry_run=body.dry_run,
    )

    try:
        connector = registry.get_connector(provider)
        result = await connector.post_journal(tenant_id=tenant, payload=payload)
    except ConnectorError as exc:
        raise _connector_error_to_http(exc) from exc

    await emit_audit(
        session=session,
        user=current_user,
        event_type="CONNECTOR",
        description=f"Journal posted to {provider} ref={body.reference} dry_run={body.dry_run}",
        entity_type="connector_journal",
        entity_id=result.external_ref or body.reference,
        payload={
            "provider": provider,
            "reference": body.reference,
            "dry_run": result.dry_run,
            "external_ref": result.external_ref,
        },
    )
    return JournalPostResponse(
        provider_id=provider,
        external_ref=result.external_ref,
        posted_at=result.posted_at,
        dry_run=result.dry_run,
    )


@router.post("/{provider}/webhook", status_code=202)
async def inbound_webhook(
    provider: str,
    request: Request,
):
    """Inbound webhook endpoint. No JWT — signature verified by the provider adapter."""
    body = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}
    try:
        connector = registry.get_connector(provider)
        parsed = await connector.verify_webhook(body=body, headers=headers)
    except ConnectorError as exc:
        raise _connector_error_to_http(exc) from exc

    log.info("connector.webhook provider=%s keys=%s", provider, list(parsed.keys()) if isinstance(parsed, dict) else "?")
    # Downstream processing (sync triggers, change queue) is out of scope for v1 — accept + log.
    return {"status": "accepted", "provider": provider}
