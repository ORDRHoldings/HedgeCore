"""
Xero connector — OAuth 2.0 + Accounting API.

Reference:
  - OAuth:   https://developer.xero.com/documentation/guides/oauth2/auth-flow
  - API:     https://developer.xero.com/documentation/api/accounting/manualjournals
  - Webhook: https://developer.xero.com/documentation/guides/webhooks/overview/

Notes
-----
- Xero uses `Xero-tenant-id` header instead of embedding the tenant in the URL.
- After token exchange, a separate GET /connections call returns the list of
  orgs the user authorized. We pick the first and store its tenantId as our
  `realm_id`. Multi-tenant users would pick from a UI — out of scope for v1.
- GL posting uses ManualJournal (not BankTransaction / Invoice).
- ShowOnCashBasisReports=false keeps journals accrual-only.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
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

PROVIDER_ID = "xero"

_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize"
_TOKEN_URL = "https://identity.xero.com/connect/token"
_CONNECTIONS_URL = "https://api.xero.com/connections"
_API_BASE = "https://api.xero.com/api.xro/2.0"
_SCOPES = (
    "offline_access openid profile email "
    "accounting.transactions accounting.journals.read "
    "accounting.settings accounting.reports.read"
)


class XeroConnector:
    provider_id: str = PROVIDER_ID
    display_name: str = "Xero"

    # ──────────────────────────────────────────────────────────────────────
    # OAuth
    # ──────────────────────────────────────────────────────────────────────

    async def authorize_url(self, *, state: str, tenant_id: UUID) -> str:
        if not settings.XERO_CLIENT_ID or not settings.XERO_REDIRECT_URI:
            raise ConnectorAuthError("Xero not configured.", provider=PROVIDER_ID)
        params = {
            "response_type": "code",
            "client_id": settings.XERO_CLIENT_ID,
            "redirect_uri": settings.XERO_REDIRECT_URI,
            "scope": _SCOPES,
            "state": state,
        }
        return f"{_AUTHORIZE_URL}?{urlencode(params)}"

    async def exchange_code(
        self,
        *,
        code: str,
        state: str,
        tenant_id: UUID,
        **extra: Any,
    ) -> TokenBundle:
        bundle = await self._token_request(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.XERO_REDIRECT_URI,
            },
            realm_id=None,
        )

        # Fetch tenant connections separately (OAuth response lacks tenantId).
        realm_id = await self._fetch_first_tenant(bundle.access_token)
        bundle = TokenBundle(
            access_token=bundle.access_token,
            refresh_token=bundle.refresh_token,
            expires_at=bundle.expires_at,
            realm_id=realm_id,
            scope=bundle.scope,
            raw=bundle.raw,
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
            if not existing.refresh_token:
                raise ConnectorAuthError("No Xero refresh token stored.", provider=PROVIDER_ID)
            bundle = await self._token_request(
                {"grant_type": "refresh_token", "refresh_token": existing.refresh_token},
                realm_id=existing.realm_id,
            )
            await token_vault.store_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID, bundle=bundle
            )
            await session.commit()
        return bundle

    async def revoke(self, *, tenant_id: UUID) -> None:
        # Xero exposes a /oauth/revocation endpoint, but disconnecting the app
        # via the connections endpoint is the sanctioned way.
        try:
            async with async_session_maker() as session:
                bundle = await token_vault.load_tokens(
                    session, tenant_id=tenant_id, provider=PROVIDER_ID
                )
            if bundle.realm_id:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.delete(
                        f"{_CONNECTIONS_URL}/{bundle.realm_id}",
                        headers={"Authorization": f"Bearer {bundle.access_token}"},
                    )
        except ConnectorError:
            pass
        async with async_session_maker() as session:
            await token_vault.wipe_tokens(session, tenant_id=tenant_id, provider=PROVIDER_ID)
            await session.commit()

    # ──────────────────────────────────────────────────────────────────────
    # Data
    # ──────────────────────────────────────────────────────────────────────

    async def health_check(self, *, tenant_id: UUID) -> ConnectorHealth:
        start = datetime.now(timezone.utc)
        try:
            await self._get(tenant_id, "/Organisation")
            latency = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return ConnectorHealth(provider=PROVIDER_ID, healthy=True, latency_ms=latency, detail="ok")
        except ConnectorError as exc:
            latency = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return ConnectorHealth(provider=PROVIDER_ID, healthy=False, latency_ms=latency, detail=str(exc))

    async def pull_coa(self, *, tenant_id: UUID) -> list[COAAccount]:
        data = await self._get(tenant_id, "/Accounts")
        accounts: list[COAAccount] = []
        for row in data.get("Accounts", []) or []:
            accounts.append(
                COAAccount(
                    external_id=row["AccountID"],
                    code=row.get("Code") or row["AccountID"],
                    name=row.get("Name") or "",
                    type=row.get("Class") or row.get("Type") or "Unknown",
                    subtype=row.get("Type"),
                    currency=row.get("CurrencyCode"),
                    active=(row.get("Status") == "ACTIVE"),
                    parent_external_id=None,
                )
            )
        return accounts

    async def pull_trial_balance(
        self, *, tenant_id: UUID, period_start: datetime, period_end: datetime
    ) -> list[TrialBalanceEntry]:
        # Xero's TrialBalance report is effectively balances at a point in time.
        data = await self._get(
            tenant_id,
            "/Reports/TrialBalance",
            params={"date": period_end.date().isoformat()},
        )
        rows_out: list[TrialBalanceEntry] = []
        for report in data.get("Reports", []) or []:
            for section in report.get("Rows", []) or []:
                for row in section.get("Rows", []) or []:
                    cells = row.get("Cells") or []
                    if len(cells) < 5:
                        continue
                    acct_name = cells[0].get("Value") or ""
                    debit = Decimal(cells[1].get("Value") or "0")
                    credit = Decimal(cells[2].get("Value") or "0")
                    attr = next(
                        (a for a in (cells[0].get("Attributes") or []) if a.get("Id") == "account"),
                        None,
                    )
                    account_id = attr.get("Value") if attr else acct_name
                    rows_out.append(
                        TrialBalanceEntry(
                            account_external_id=account_id,
                            account_code=acct_name,
                            debit=debit,
                            credit=credit,
                            currency="USD",  # Xero report is in org base currency; TODO surface from Organisation call
                            period_start=period_start,
                            period_end=period_end,
                        )
                    )
        return rows_out

    async def post_journal(
        self, *, tenant_id: UUID, payload: JournalPayload
    ) -> PostJournalResult:
        payload.assert_balanced()

        xero_lines = []
        for line in payload.lines:
            amount = line.debit if line.debit > 0 else -line.credit  # Xero convention: signed LineAmount
            xero_lines.append(
                {
                    "LineAmount": float(amount),
                    "AccountID": line.account_external_id,
                    "Description": line.description[:4000],
                    "TaxType": "NONE",
                }
            )

        body = {
            "ManualJournals": [
                {
                    "Narration": payload.memo[:4000],
                    "Date": payload.posting_date.date().isoformat(),
                    "Status": "POSTED" if not payload.dry_run else "DRAFT",
                    "LineAmountTypes": "NoTax",
                    "JournalLines": xero_lines,
                    # Xero lacks a true idempotency header on ManualJournals; Narration
                    # carries our reference so replays are visually detectable.
                    "Url": f"ordr:{payload.reference}",
                }
            ]
        }

        if payload.dry_run:
            return PostJournalResult(
                external_ref=None,
                posted_at=datetime.now(timezone.utc),
                dry_run=True,
                raw={"dry_run": True, "would_post": body},
            )

        data = await self._post(tenant_id, "/ManualJournals", body)
        journals = data.get("ManualJournals") or []
        external_ref = journals[0].get("ManualJournalID") if journals else None
        return PostJournalResult(
            external_ref=str(external_ref) if external_ref else None,
            posted_at=datetime.now(timezone.utc),
            dry_run=False,
            raw=data,
        )

    # ──────────────────────────────────────────────────────────────────────
    # Webhook
    # ──────────────────────────────────────────────────────────────────────

    async def verify_webhook(self, *, body: bytes, headers: dict[str, str]) -> dict:
        # Xero webhook key is distinct from client secret; live in QBO_-like env var.
        # We repurpose XERO_CLIENT_SECRET as the webhook signing key for now —
        # production rollout should add XERO_WEBHOOK_KEY.
        key = settings.XERO_CLIENT_SECRET
        if not key:
            raise ConnectorWebhookError("Xero webhook key not configured.", provider=PROVIDER_ID)
        sig = headers.get("x-xero-signature") or headers.get("X-Xero-Signature")
        if not sig:
            raise ConnectorWebhookError("Missing x-xero-signature header.", provider=PROVIDER_ID)
        expected = base64.b64encode(
            hmac.new(key.encode("utf-8"), body, hashlib.sha256).digest()
        ).decode("utf-8")
        if not hmac.compare_digest(expected, sig):
            raise ConnectorWebhookError("Xero webhook signature mismatch.", provider=PROVIDER_ID)
        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ConnectorWebhookError("Xero webhook body invalid JSON.", provider=PROVIDER_ID) from exc

    # ══════════════════════════════════════════════════════════════════════
    # Internals
    # ══════════════════════════════════════════════════════════════════════

    async def _token_request(
        self, data: dict[str, str], *, realm_id: str | None
    ) -> TokenBundle:
        if not settings.XERO_CLIENT_ID or not settings.XERO_CLIENT_SECRET:
            raise ConnectorAuthError("Xero credentials missing.", provider=PROVIDER_ID)
        auth = base64.b64encode(
            f"{settings.XERO_CLIENT_ID}:{settings.XERO_CLIENT_SECRET}".encode()
        ).decode()
        headers = {
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(_TOKEN_URL, data=data, headers=headers)
        if resp.status_code >= 500:
            raise ConnectorServerError(f"Xero token server error {resp.status_code}", provider=PROVIDER_ID)
        if resp.status_code >= 400:
            raise ConnectorAuthError(
                f"Xero token exchange failed: {resp.text[:400]}",
                provider=PROVIDER_ID,
                detail={"status": resp.status_code},
            )
        payload = resp.json()
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(payload.get("expires_in", 1800)))
        return TokenBundle(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token"),
            expires_at=expires_at,
            realm_id=realm_id,
            scope=payload.get("scope"),
            raw=payload,
        )

    async def _fetch_first_tenant(self, access_token: str) -> str:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                _CONNECTIONS_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
            )
        if resp.status_code >= 400:
            raise ConnectorAuthError(
                f"Xero /connections failed: {resp.text[:400]}",
                provider=PROVIDER_ID,
            )
        conns = resp.json() or []
        if not conns:
            raise ConnectorAuthError(
                "Xero user authorized no organisations.", provider=PROVIDER_ID
            )
        return conns[0]["tenantId"]

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
    ) -> dict:
        await rate_limiter.take(provider=PROVIDER_ID, tenant_id=tenant_id)
        bundle = await self._ensure_valid_token(tenant_id)
        if not bundle.realm_id:
            raise ConnectorAuthError("Xero token has no tenantId.", provider=PROVIDER_ID)
        headers = {
            "Authorization": f"Bearer {bundle.access_token}",
            "Xero-tenant-id": bundle.realm_id,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        url = f"{_API_BASE}{path}"

        async def _do() -> dict:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(
                    method, url, params=params, json=json_body, headers=headers
                )
            return _handle_xero_response(resp)

        return await retry_mod.call_with_guard(
            _do, provider=PROVIDER_ID, tenant_id=tenant_id
        )


def _handle_xero_response(resp: httpx.Response) -> dict:
    if resp.status_code == 429:
        retry_after = float(resp.headers.get("Retry-After", "60"))
        raise ConnectorRateLimitError(
            "Xero rate limit exceeded.",
            retry_after_sec=retry_after,
            provider=PROVIDER_ID,
        )
    if resp.status_code in (401, 403):
        raise ConnectorAuthError(
            f"Xero auth failure: {resp.text[:400]}",
            provider=PROVIDER_ID,
            detail={"status": resp.status_code},
        )
    if 500 <= resp.status_code < 600:
        raise ConnectorServerError(
            f"Xero server error {resp.status_code}", provider=PROVIDER_ID
        )
    if resp.status_code >= 400:
        raise ConnectorValidationError(
            f"Xero rejected request: {resp.text[:400]}",
            provider=PROVIDER_ID,
            detail={"status": resp.status_code},
        )
    try:
        return resp.json() if resp.content else {}
    except json.JSONDecodeError as exc:
        raise ConnectorServerError("Xero returned non-JSON body.", provider=PROVIDER_ID) from exc
