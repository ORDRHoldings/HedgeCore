"""
Oracle NetSuite connector — OAuth 2.0 + SuiteTalk REST API.

Reference:
  - OAuth 2.0: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157771733782.html
  - REST API:  https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/book_1559132836.html
  - Webhooks:  NetSuite does not expose HTTPS webhooks; change detection uses the
               SuiteScript UserEvent or a saved-search poller. For v1 we only
               implement outbound operations; `verify_webhook` raises to prevent
               callers from expecting inbound events.

Account ID (realm) is baked into every URL — e.g. TSTDRV123.suitetalk.api.netsuite.com.
The admin supplies it during the Connect flow (query string `account` on the
authorize URL).
"""
from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID
from urllib.parse import urlencode

import httpx

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
from app.connectors import rate_limiter, retry as retry_mod, token_vault
from app.core.config import settings
from app.core.db import async_session_maker

log = logging.getLogger(__name__)

PROVIDER_ID = "netsuite"
_SCOPES = "restlets rest_webservices"


def _authorize_host(account_id: str) -> str:
    # NetSuite accounts differ (prod vs sandbox): TSTDRV... is sandbox-like.
    return f"https://{account_id.lower().replace('_', '-')}.app.netsuite.com"


def _rest_host(account_id: str) -> str:
    return f"https://{account_id.lower().replace('_', '-')}.suitetalk.api.netsuite.com"


class NetSuiteConnector:
    provider_id: str = PROVIDER_ID
    display_name: str = "Oracle NetSuite"

    # ──────────────────────────────────────────────────────────────────────
    # OAuth
    # ──────────────────────────────────────────────────────────────────────

    async def authorize_url(self, *, state: str, tenant_id: UUID, **extra: Any) -> str:
        if not settings.NETSUITE_CLIENT_ID or not settings.NETSUITE_REDIRECT_URI:
            raise ConnectorAuthError("NetSuite not configured.", provider=PROVIDER_ID)
        account_id = extra.get("account_id")
        if not account_id:
            raise ConnectorAuthError(
                "NetSuite authorize requires `account_id` (company's NS account).",
                provider=PROVIDER_ID,
            )
        params = {
            "response_type": "code",
            "client_id": settings.NETSUITE_CLIENT_ID,
            "redirect_uri": settings.NETSUITE_REDIRECT_URI,
            "scope": _SCOPES,
            "state": state,
        }
        return f"{_authorize_host(account_id)}/app/login/oauth2/authorize.nl?{urlencode(params)}"

    async def exchange_code(
        self,
        *,
        code: str,
        state: str,
        tenant_id: UUID,
        **extra: Any,
    ) -> TokenBundle:
        account_id = extra.get("account_id") or extra.get("realmId")
        if not account_id:
            raise ConnectorAuthError(
                "NetSuite callback missing account_id.", provider=PROVIDER_ID
            )
        bundle = await self._token_request(
            account_id,
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.NETSUITE_REDIRECT_URI,
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
                last_connected_at=datetime.now(timezone.utc).isoformat(),
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
                    "NetSuite refresh requires stored refresh_token + account_id.",
                    provider=PROVIDER_ID,
                )
            bundle = await self._token_request(
                existing.realm_id,
                {"grant_type": "refresh_token", "refresh_token": existing.refresh_token},
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
        start = datetime.now(timezone.utc)
        try:
            # Cheapest endpoint: metadata catalog
            await self._get(tenant_id, "/services/rest/record/v1/metadata-catalog")
            latency = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return ConnectorHealth(provider=PROVIDER_ID, healthy=True, latency_ms=latency, detail="ok")
        except ConnectorError as exc:
            latency = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return ConnectorHealth(provider=PROVIDER_ID, healthy=False, latency_ms=latency, detail=str(exc))

    async def pull_coa(self, *, tenant_id: UUID) -> list[COAAccount]:
        # SuiteQL: most efficient way to pull the whole CoA in one round trip.
        q = (
            "SELECT id, acctnumber, acctname, accttype, subsidiary, parent, "
            "isinactive, currency FROM account"
        )
        data = await self._post(
            tenant_id,
            "/services/rest/query/v1/suiteql",
            {"q": q},
        )
        out: list[COAAccount] = []
        for row in data.get("items", []) or []:
            out.append(
                COAAccount(
                    external_id=str(row.get("id")),
                    code=str(row.get("acctnumber") or row.get("id")),
                    name=row.get("acctname") or "",
                    type=row.get("accttype") or "Unknown",
                    subtype=None,
                    currency=row.get("currency"),
                    active=not bool(row.get("isinactive")),
                    parent_external_id=str(row["parent"]) if row.get("parent") else None,
                )
            )
        return out

    async def pull_trial_balance(
        self, *, tenant_id: UUID, period_start: datetime, period_end: datetime
    ) -> list[TrialBalanceEntry]:
        # NetSuite's native TrialBalance report is SuiteAnalytics-specific;
        # the SuiteQL equivalent aggregates transaction lines.
        q = (
            "SELECT TL.expenseaccount AS account_id, SUM(TL.debit) AS d, "
            "SUM(TL.credit) AS c "
            "FROM transactionline TL "
            f"WHERE TL.trandate BETWEEN '{period_start.date()}' "
            f"AND '{period_end.date()}' "
            "GROUP BY TL.expenseaccount"
        )
        data = await self._post(
            tenant_id, "/services/rest/query/v1/suiteql", {"q": q}
        )
        out: list[TrialBalanceEntry] = []
        for row in data.get("items", []) or []:
            out.append(
                TrialBalanceEntry(
                    account_external_id=str(row.get("account_id")),
                    account_code=str(row.get("account_id")),
                    debit=Decimal(row.get("d") or "0"),
                    credit=Decimal(row.get("c") or "0"),
                    currency="USD",  # base currency; refine with subsidiary join if needed
                    period_start=period_start,
                    period_end=period_end,
                )
            )
        return out

    async def post_journal(
        self, *, tenant_id: UUID, payload: JournalPayload
    ) -> PostJournalResult:
        payload.assert_balanced()
        lines = []
        for line in payload.lines:
            lines.append(
                {
                    "account": {"id": line.account_external_id},
                    "debit": float(line.debit) if line.debit > 0 else 0,
                    "credit": float(line.credit) if line.credit > 0 else 0,
                    "memo": line.description[:999],
                }
            )
        body = {
            "tranDate": payload.posting_date.date().isoformat(),
            "memo": payload.memo[:999],
            "externalId": payload.reference,  # NetSuite's idempotency key
            "line": {"items": lines},
        }
        if payload.dry_run:
            return PostJournalResult(
                external_ref=None,
                posted_at=datetime.now(timezone.utc),
                dry_run=True,
                raw={"dry_run": True, "would_post": body},
            )

        # POST /record/v1/journalEntry returns 204 with Location header holding ID.
        resp = await self._request(
            tenant_id,
            "POST",
            "/services/rest/record/v1/journalEntry",
            json_body=body,
            return_response=True,
        )
        location = resp.headers.get("Location", "")
        external_ref = location.rsplit("/", 1)[-1] if location else None
        return PostJournalResult(
            external_ref=external_ref,
            posted_at=datetime.now(timezone.utc),
            dry_run=False,
            raw={"location": location, "status": resp.status_code},
        )

    # ──────────────────────────────────────────────────────────────────────
    # Webhook — NetSuite has no inbound webhooks
    # ──────────────────────────────────────────────────────────────────────

    async def verify_webhook(self, *, body: bytes, headers: dict[str, str]) -> dict:
        raise ConnectorWebhookError(
            "NetSuite does not emit HTTPS webhooks. Use scheduled poller.",
            provider=PROVIDER_ID,
        )

    # ══════════════════════════════════════════════════════════════════════
    # Internals
    # ══════════════════════════════════════════════════════════════════════

    async def _token_request(
        self, account_id: str, data: dict[str, str]
    ) -> TokenBundle:
        if not settings.NETSUITE_CLIENT_ID or not settings.NETSUITE_CLIENT_SECRET:
            raise ConnectorAuthError("NetSuite credentials missing.", provider=PROVIDER_ID)
        auth = base64.b64encode(
            f"{settings.NETSUITE_CLIENT_ID}:{settings.NETSUITE_CLIENT_SECRET}".encode()
        ).decode()
        token_url = f"{_rest_host(account_id)}/services/rest/auth/oauth2/v1/token"
        headers = {
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(token_url, data=data, headers=headers)
        if resp.status_code >= 500:
            raise ConnectorServerError(
                f"NetSuite token server error {resp.status_code}", provider=PROVIDER_ID
            )
        if resp.status_code >= 400:
            raise ConnectorAuthError(
                f"NetSuite token exchange failed: {resp.text[:400]}",
                provider=PROVIDER_ID,
            )
        payload = resp.json()
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(payload.get("expires_in", 3600)))
        return TokenBundle(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token"),
            expires_at=expires_at,
            realm_id=account_id,
            scope=payload.get("scope"),
            raw=payload,
        )

    async def _ensure_valid_token(self, tenant_id: UUID) -> TokenBundle:
        async with async_session_maker() as session:
            bundle = await token_vault.load_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID
            )
        if bundle.expires_at and bundle.expires_at - datetime.now(timezone.utc) < timedelta(seconds=60):
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
        return_response: bool = False,
    ):
        await rate_limiter.take(provider=PROVIDER_ID, tenant_id=tenant_id)
        bundle = await self._ensure_valid_token(tenant_id)
        if not bundle.realm_id:
            raise ConnectorAuthError("NetSuite token has no account_id.", provider=PROVIDER_ID)
        url = f"{_rest_host(bundle.realm_id)}{path}"
        headers = {
            "Authorization": f"Bearer {bundle.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Prefer": "transient",  # SuiteQL requires this for large results
        }

        async def _do():
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(
                    method, url, params=params, json=json_body, headers=headers
                )
            if return_response:
                _ensure_ok(resp)
                return resp
            return _handle_ns_response(resp)

        return await retry_mod.call_with_guard(
            _do, provider=PROVIDER_ID, tenant_id=tenant_id
        )


def _ensure_ok(resp: httpx.Response) -> None:
    if resp.status_code == 429:
        raise ConnectorRateLimitError("NetSuite rate limit.", provider=PROVIDER_ID)
    if resp.status_code in (401, 403):
        raise ConnectorAuthError(f"NetSuite auth failure: {resp.text[:400]}", provider=PROVIDER_ID)
    if 500 <= resp.status_code < 600:
        raise ConnectorServerError(f"NetSuite server error {resp.status_code}", provider=PROVIDER_ID)
    if resp.status_code >= 400:
        raise ConnectorValidationError(
            f"NetSuite rejected request: {resp.text[:400]}", provider=PROVIDER_ID
        )


def _handle_ns_response(resp: httpx.Response) -> dict:
    _ensure_ok(resp)
    if not resp.content:
        return {}
    try:
        return resp.json()
    except json.JSONDecodeError as exc:
        raise ConnectorServerError(
            "NetSuite returned non-JSON body.", provider=PROVIDER_ID
        ) from exc
