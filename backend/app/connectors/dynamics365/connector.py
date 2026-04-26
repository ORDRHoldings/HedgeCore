"""
Microsoft Dynamics 365 Finance connector — Azure AD OAuth 2.0 + Data OData API.

Reference:
  - Azure AD v2:  https://learn.microsoft.com/azure/active-directory/develop/v2-oauth2-auth-code-flow
  - D365 Data:    https://learn.microsoft.com/dynamics365/fin-ops-core/dev-itpro/data-entities/odata
  - Journal API:  LedgerJournalHeaders + LedgerJournalLines entities

Design notes
------------
- Each customer has its own tenant instance URL (e.g. `contoso.operations.dynamics.com`).
  We accept this as `instance_url` in `extra` during authorize, store it as the
  realm_id, and all API calls are scoped to that host.
- Scope is the resource URI with `/.default` suffix (v2 endpoint style).
- Journal posting is a two-step entity write: header first, then lines keyed by
  the header's JournalBatchNumber.
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from urllib.parse import urlencode, urlparse
from uuid import UUID

import httpx

from app.connectors import rate_limiter, token_vault
from app.connectors import retry as retry_mod
from app.connectors.base import (
    COAAccount,
    ConnectorHealth,
    JournalPayload,
    PostJournalResult,
    TokenBundle,
    TrialBalanceEntry,
)
from app.connectors.errors import (
    ConnectorAuthError,
    ConnectorError,
    ConnectorRateLimitError,
    ConnectorServerError,
    ConnectorValidationError,
    ConnectorWebhookError,
)
from app.core.config import settings
from app.core.db import async_session_maker

log = logging.getLogger(__name__)

PROVIDER_ID = "dynamics365"


def _aad_authorize(tenant_id_aad: str) -> str:
    return f"https://login.microsoftonline.com/{tenant_id_aad}/oauth2/v2.0/authorize"


def _aad_token(tenant_id_aad: str) -> str:
    return f"https://login.microsoftonline.com/{tenant_id_aad}/oauth2/v2.0/token"


def _resource_from_instance(instance_url: str) -> str:
    """Strip path — we only want scheme+host for the scope."""
    parsed = urlparse(instance_url)
    return f"{parsed.scheme}://{parsed.netloc}"


class Dynamics365Connector:
    provider_id: str = PROVIDER_ID
    display_name: str = "Microsoft Dynamics 365 Finance"

    # ──────────────────────────────────────────────────────────────────────
    # OAuth
    # ──────────────────────────────────────────────────────────────────────

    async def authorize_url(self, *, state: str, tenant_id: UUID, **extra: Any) -> str:
        if not settings.DYNAMICS365_CLIENT_ID or not settings.DYNAMICS365_REDIRECT_URI:
            raise ConnectorAuthError("Dynamics 365 not configured.", provider=PROVIDER_ID)
        instance_url = extra.get("instance_url")
        if not instance_url:
            raise ConnectorAuthError(
                "Dynamics 365 authorize requires `instance_url` (company's D365FO host).",
                provider=PROVIDER_ID,
            )
        aad_tenant = settings.DYNAMICS365_TENANT_ID or "common"
        scope = f"{_resource_from_instance(instance_url)}/.default offline_access"
        params = {
            "client_id": settings.DYNAMICS365_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": settings.DYNAMICS365_REDIRECT_URI,
            "scope": scope,
            "state": state,
            "response_mode": "query",
            "prompt": "select_account",
        }
        return f"{_aad_authorize(aad_tenant)}?{urlencode(params)}"

    async def exchange_code(
        self,
        *,
        code: str,
        state: str,
        tenant_id: UUID,
        **extra: Any,
    ) -> TokenBundle:
        instance_url = extra.get("instance_url")
        if not instance_url:
            raise ConnectorAuthError(
                "D365 callback missing instance_url.", provider=PROVIDER_ID
            )
        bundle = await self._token_request(
            instance_url=instance_url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.DYNAMICS365_REDIRECT_URI,
            },
        )
        async with async_session_maker() as session:
            await token_vault.store_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID, bundle=bundle
            )
            await token_vault.update_state(
                session,
                tenant_id=tenant_id,
                provider=PROVIDER_ID,
                last_connected_at=datetime.now(UTC).isoformat(),
                last_error=None,
            )
            await session.commit()
        return bundle

    async def refresh(self, *, tenant_id: UUID) -> TokenBundle:
        async with async_session_maker() as session:
            existing = await token_vault.load_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID
            )
            if not existing.refresh_token or not existing.realm_id:
                raise ConnectorAuthError(
                    "D365 refresh requires stored refresh_token + instance_url.",
                    provider=PROVIDER_ID,
                )
            bundle = await self._token_request(
                instance_url=existing.realm_id,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": existing.refresh_token,
                },
            )
            await token_vault.store_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID, bundle=bundle
            )
            await session.commit()
        return bundle

    async def revoke(self, *, tenant_id: UUID) -> None:
        async with async_session_maker() as session:
            await token_vault.wipe_tokens(session, tenant_id=tenant_id, provider=PROVIDER_ID)
            await session.commit()

    # ──────────────────────────────────────────────────────────────────────
    # Data
    # ──────────────────────────────────────────────────────────────────────

    async def health_check(self, *, tenant_id: UUID) -> ConnectorHealth:
        start = datetime.now(UTC)
        try:
            await self._get(tenant_id, "/data/CompanyInfo", params={"$top": "1"})
            latency = (datetime.now(UTC) - start).total_seconds() * 1000
            return ConnectorHealth(provider=PROVIDER_ID, healthy=True, latency_ms=latency, detail="ok")
        except ConnectorError as exc:
            latency = (datetime.now(UTC) - start).total_seconds() * 1000
            return ConnectorHealth(provider=PROVIDER_ID, healthy=False, latency_ms=latency, detail=str(exc))

    async def pull_coa(self, *, tenant_id: UUID) -> list[COAAccount]:
        accounts: list[COAAccount] = []
        next_url = "/data/MainAccounts"
        params: dict[str, Any] | None = {
            "$select": "MainAccountId,Name,Type,CurrencyCode,IsSuspended",
            "$top": "500",
        }
        while next_url:
            data = await self._get(tenant_id, next_url, params=params)
            params = None  # only first call uses params; next links embed them
            for row in data.get("value") or []:
                accounts.append(
                    COAAccount(
                        external_id=row.get("MainAccountId") or "",
                        code=row.get("MainAccountId") or "",
                        name=row.get("Name") or "",
                        type=row.get("Type") or "Unknown",
                        subtype=None,
                        currency=row.get("CurrencyCode"),
                        active=not bool(row.get("IsSuspended")),
                        parent_external_id=None,
                    )
                )
            next_link = data.get("@odata.nextLink")
            next_url = next_link if next_link else None
            if next_url and next_url.startswith("http"):
                # Absolute → convert to relative so _request's base_url join works.
                next_url = next_url.split("/data/", 1)[-1]
                next_url = "/data/" + next_url
        return accounts

    async def pull_trial_balance(
        self, *, tenant_id: UUID, period_start: datetime, period_end: datetime
    ) -> list[TrialBalanceEntry]:
        # D365 exposes TrialBalanceEntities for aggregate balances between dates.
        filter_q = (
            f"TransactionDate ge {period_start.date():%Y-%m-%d}T00:00:00Z and "
            f"TransactionDate le {period_end.date():%Y-%m-%d}T23:59:59Z"
        )
        data = await self._get(
            tenant_id,
            "/data/TrialBalanceEntities",
            params={
                "$select": "MainAccountId,DebitAmount,CreditAmount,CurrencyCode",
                "$filter": filter_q,
                "$top": "5000",
            },
        )
        out: list[TrialBalanceEntry] = []
        for row in data.get("value") or []:
            out.append(
                TrialBalanceEntry(
                    account_external_id=row.get("MainAccountId") or "",
                    account_code=row.get("MainAccountId") or "",
                    debit=Decimal(str(row.get("DebitAmount") or "0")),
                    credit=Decimal(str(row.get("CreditAmount") or "0")),
                    currency=row.get("CurrencyCode") or "USD",
                    period_start=period_start,
                    period_end=period_end,
                )
            )
        return out

    async def post_journal(
        self, *, tenant_id: UUID, payload: JournalPayload
    ) -> PostJournalResult:
        payload.assert_balanced()

        header_body = {
            "JournalName": "ORDR",
            "JournalDescription": payload.memo[:60],
            # JournalBatchNumber is auto-assigned on POST — we read it back.
            # Store our reference as Description so duplicate detection works.
            "Description": payload.reference[:60],
        }

        if payload.dry_run:
            return PostJournalResult(
                external_ref=None,
                posted_at=datetime.now(UTC),
                dry_run=True,
                raw={"dry_run": True, "header": header_body, "lines": len(payload.lines)},
            )

        header_resp = await self._post(
            tenant_id, "/data/LedgerJournalHeaders", header_body
        )
        batch_number = header_resp.get("JournalBatchNumber")
        if not batch_number:
            raise ConnectorValidationError(
                "D365 header post returned no JournalBatchNumber.",
                provider=PROVIDER_ID,
                detail=header_resp,
            )

        line_refs = []
        for line in payload.lines:
            amount = float(line.debit) if line.debit > 0 else -float(line.credit)
            body = {
                "JournalBatchNumber": batch_number,
                "AccountDisplayValue": line.account_external_id,
                "DebitAmount": float(line.debit) if line.debit > 0 else 0,
                "CreditAmount": float(line.credit) if line.credit > 0 else 0,
                "TransactionDate": payload.posting_date.date().isoformat(),
                "Description": line.description[:60],
                "CurrencyCode": line.currency,
                "Amount": amount,
            }
            ln = await self._post(tenant_id, "/data/LedgerJournalLines", body)
            line_refs.append(ln.get("LineNumber"))

        return PostJournalResult(
            external_ref=str(batch_number),
            posted_at=datetime.now(UTC),
            dry_run=False,
            raw={"batch": batch_number, "line_numbers": line_refs},
        )

    async def verify_webhook(self, *, body: bytes, headers: dict[str, str]) -> dict:
        raise ConnectorWebhookError(
            "Dynamics 365 Finance does not emit HTTPS webhooks. "
            "Use Business Events integrated with Azure Event Grid.",
            provider=PROVIDER_ID,
        )

    # ══════════════════════════════════════════════════════════════════════
    # Internals
    # ══════════════════════════════════════════════════════════════════════

    async def _token_request(
        self, *, instance_url: str, data: dict[str, str]
    ) -> TokenBundle:
        if not settings.DYNAMICS365_CLIENT_ID or not settings.DYNAMICS365_CLIENT_SECRET:
            raise ConnectorAuthError("D365 credentials missing.", provider=PROVIDER_ID)
        aad_tenant = settings.DYNAMICS365_TENANT_ID or "common"
        payload = {
            **data,
            "client_id": settings.DYNAMICS365_CLIENT_ID,
            "client_secret": settings.DYNAMICS365_CLIENT_SECRET,
            "scope": f"{_resource_from_instance(instance_url)}/.default offline_access",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(_aad_token(aad_tenant), data=payload)
        if resp.status_code >= 500:
            raise ConnectorServerError(
                f"Azure AD server error {resp.status_code}", provider=PROVIDER_ID
            )
        if resp.status_code >= 400:
            raise ConnectorAuthError(
                f"D365 token exchange failed: {resp.text[:400]}",
                provider=PROVIDER_ID,
            )
        body = resp.json()
        expires_at = datetime.now(UTC) + timedelta(
            seconds=int(body.get("expires_in", 3600))
        )
        return TokenBundle(
            access_token=body["access_token"],
            refresh_token=body.get("refresh_token"),
            expires_at=expires_at,
            realm_id=instance_url,
            scope=body.get("scope"),
            raw=body,
        )

    async def _ensure_valid_token(self, tenant_id: UUID) -> TokenBundle:
        async with async_session_maker() as session:
            bundle = await token_vault.load_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID
            )
        if bundle.expires_at and bundle.expires_at - datetime.now(UTC) < timedelta(seconds=60):
            bundle = await self.refresh(tenant_id=tenant_id)
        return bundle

    async def _get(
        self, tenant_id: UUID, path: str, *, params: dict[str, Any] | None = None
    ) -> dict:
        return await self._request(tenant_id, "GET", path, params=params)

    async def _post(self, tenant_id: UUID, path: str, body: dict[str, Any]) -> dict:
        return await self._request(tenant_id, "POST", path, json_body=body)

    async def _request(
        self,
        tenant_id: UUID,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict:
        await rate_limiter.take(provider=PROVIDER_ID, tenant_id=tenant_id)
        bundle = await self._ensure_valid_token(tenant_id)
        if not bundle.realm_id:
            raise ConnectorAuthError("D365 token has no instance_url.", provider=PROVIDER_ID)
        base = _resource_from_instance(bundle.realm_id)
        url = f"{base}{path}"
        headers = {
            "Authorization": f"Bearer {bundle.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0",
        }

        async def _do() -> dict:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(
                    method, url, params=params, json=json_body, headers=headers
                )
            return _handle_d365_response(resp)

        return await retry_mod.call_with_guard(
            _do, provider=PROVIDER_ID, tenant_id=tenant_id
        )


def _handle_d365_response(resp: httpx.Response) -> dict:
    if resp.status_code == 429:
        retry_after = float(resp.headers.get("Retry-After", "60"))
        raise ConnectorRateLimitError(
            "D365 rate limit exceeded.",
            retry_after_sec=retry_after,
            provider=PROVIDER_ID,
        )
    if resp.status_code in (401, 403):
        raise ConnectorAuthError(
            f"D365 auth failure: {resp.text[:400]}",
            provider=PROVIDER_ID,
            detail={"status": resp.status_code},
        )
    if 500 <= resp.status_code < 600:
        raise ConnectorServerError(
            f"D365 server error {resp.status_code}", provider=PROVIDER_ID
        )
    if resp.status_code >= 400:
        raise ConnectorValidationError(
            f"D365 rejected request: {resp.text[:400]}",
            provider=PROVIDER_ID,
            detail={"status": resp.status_code},
        )
    if not resp.content:
        return {}
    try:
        return resp.json()
    except json.JSONDecodeError as exc:
        raise ConnectorServerError(
            "D365 returned non-JSON body.", provider=PROVIDER_ID
        ) from exc
