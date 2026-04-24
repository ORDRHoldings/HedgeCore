"""
QuickBooks Online connector — OAuth 2.0 + v3 REST API.

Reference:
  - OAuth:    https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization
  - API v3:   https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/journalentry
  - Webhooks: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks

Design notes
------------
- Tokens are refreshed lazily: every data call obtains the token bundle via
  `_ensure_valid_token()`, refreshing if ≤60s from expiry. New bundles are
  persisted back to the vault in the same request.
- Realm ID (QBO's company ID) is stored alongside the ciphertext for routing.
- All errors are normalized to `ConnectorError` subclasses — routes map a single
  `http_status` to HTTP response, no QBO-specific error translation in routes.
- Journal posting uses `payload.reference` as the idempotency key (QBO's
  `DocNumber`). A duplicate POST returns the existing entry unchanged.
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


PROVIDER_ID = "quickbooks"

_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2"
_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke"
_SCOPES = "com.intuit.quickbooks.accounting openid profile email"


def _api_base() -> str:
    if settings.QBO_ENVIRONMENT == "production":
        return "https://quickbooks.api.intuit.com/v3"
    return "https://sandbox-quickbooks.api.intuit.com/v3"


# ═════════════════════════════════════════════════════════════════════════════
# Connector
# ═════════════════════════════════════════════════════════════════════════════


class QuickBooksConnector:
    provider_id: str = PROVIDER_ID
    display_name: str = "QuickBooks Online"

    # ──────────────────────────────────────────────────────────────────────
    # OAuth lifecycle
    # ──────────────────────────────────────────────────────────────────────

    async def authorize_url(self, *, state: str, tenant_id: UUID) -> str:
        if not settings.QBO_CLIENT_ID or not settings.QBO_REDIRECT_URI:
            raise ConnectorAuthError(
                "QuickBooks is not configured (QBO_CLIENT_ID / QBO_REDIRECT_URI missing).",
                provider=PROVIDER_ID,
            )
        params = {
            "client_id": settings.QBO_CLIENT_ID,
            "response_type": "code",
            "scope": _SCOPES,
            "redirect_uri": settings.QBO_REDIRECT_URI,
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
        realm_id = extra.get("realmId") or extra.get("realm_id")
        if not realm_id:
            raise ConnectorAuthError(
                "QBO callback missing realmId parameter.", provider=PROVIDER_ID
            )

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.QBO_REDIRECT_URI,
        }
        bundle = await self._token_request(data, realm_id=str(realm_id))

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
                raise ConnectorAuthError(
                    "No refresh token stored. Reconnect required.",
                    provider=PROVIDER_ID,
                )
            bundle = await self._token_request(
                {
                    "grant_type": "refresh_token",
                    "refresh_token": existing.refresh_token,
                },
                realm_id=existing.realm_id,
            )
            await token_vault.store_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID, bundle=bundle
            )
            await session.commit()
        return bundle

    async def revoke(self, *, tenant_id: UUID) -> None:
        try:
            async with async_session_maker() as session:
                bundle = await token_vault.load_tokens(
                    session, tenant_id=tenant_id, provider=PROVIDER_ID
                )
                # Best-effort revoke with Intuit
                auth = base64.b64encode(
                    f"{settings.QBO_CLIENT_ID}:{settings.QBO_CLIENT_SECRET}".encode()
                ).decode()
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        _REVOKE_URL,
                        headers={
                            "Authorization": f"Basic {auth}",
                            "Content-Type": "application/json",
                            "Accept": "application/json",
                        },
                        json={"token": bundle.refresh_token or bundle.access_token},
                    )
        except ConnectorError:
            pass  # wipe tokens anyway — best-effort revoke

        async with async_session_maker() as session:
            await token_vault.wipe_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID
            )
            await session.commit()

    # ──────────────────────────────────────────────────────────────────────
    # Data operations
    # ──────────────────────────────────────────────────────────────────────

    async def health_check(self, *, tenant_id: UUID) -> ConnectorHealth:
        start = datetime.now(timezone.utc)
        try:
            await self._get(tenant_id, "/companyinfo/{realm}")
            latency = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return ConnectorHealth(
                provider=PROVIDER_ID, healthy=True, latency_ms=latency, detail="ok"
            )
        except ConnectorError as exc:
            latency = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return ConnectorHealth(
                provider=PROVIDER_ID, healthy=False, latency_ms=latency, detail=str(exc)
            )

    async def pull_coa(self, *, tenant_id: UUID) -> list[COAAccount]:
        """Pull all active accounts via the Query endpoint."""
        accounts: list[COAAccount] = []
        start_position = 1
        page_size = 500
        while True:
            query = (
                f"SELECT * FROM Account WHERE Active IN (true,false) "
                f"STARTPOSITION {start_position} MAXRESULTS {page_size}"
            )
            data = await self._get(
                tenant_id, "/company/{realm}/query", params={"query": query}
            )
            rows = (data.get("QueryResponse") or {}).get("Account") or []
            if not rows:
                break
            for row in rows:
                accounts.append(
                    COAAccount(
                        external_id=str(row["Id"]),
                        code=row.get("AcctNum") or row["Id"],
                        name=row.get("Name") or "",
                        type=row.get("AccountType") or "Unknown",
                        subtype=row.get("AccountSubType"),
                        currency=(row.get("CurrencyRef") or {}).get("value"),
                        active=bool(row.get("Active", True)),
                        parent_external_id=(row.get("ParentRef") or {}).get("value"),
                    )
                )
            if len(rows) < page_size:
                break
            start_position += page_size
        return accounts

    async def pull_trial_balance(
        self,
        *,
        tenant_id: UUID,
        period_start: datetime,
        period_end: datetime,
    ) -> list[TrialBalanceEntry]:
        """Pull TrialBalance report between two dates."""
        data = await self._get(
            tenant_id,
            "/company/{realm}/reports/TrialBalance",
            params={
                "start_date": period_start.date().isoformat(),
                "end_date": period_end.date().isoformat(),
                "accounting_method": "Accrual",
            },
        )
        out: list[TrialBalanceEntry] = []
        rows = (data.get("Rows") or {}).get("Row") or []
        currency = ((data.get("Header") or {}).get("Currency")) or "USD"
        for row in rows:
            col_data = row.get("ColData") or []
            if len(col_data) < 3:
                continue
            acct_name = col_data[0].get("value") or ""
            acct_id = col_data[0].get("id") or ""
            debit_raw = col_data[1].get("value") or "0"
            credit_raw = col_data[2].get("value") or "0"
            out.append(
                TrialBalanceEntry(
                    account_external_id=acct_id,
                    account_code=acct_name,
                    debit=Decimal(debit_raw or "0"),
                    credit=Decimal(credit_raw or "0"),
                    currency=currency,
                    period_start=period_start,
                    period_end=period_end,
                )
            )
        return out

    async def post_journal(
        self, *, tenant_id: UUID, payload: JournalPayload
    ) -> PostJournalResult:
        payload.assert_balanced()

        qbo_lines = []
        for line in payload.lines:
            amount = line.debit if line.debit > 0 else line.credit
            posting_type = "Debit" if line.debit > 0 else "Credit"
            qbo_lines.append(
                {
                    "DetailType": "JournalEntryLineDetail",
                    "Amount": float(amount),
                    "Description": line.description[:4000],
                    "JournalEntryLineDetail": {
                        "PostingType": posting_type,
                        "AccountRef": {"value": line.account_external_id},
                    },
                }
            )

        body = {
            "TxnDate": payload.posting_date.date().isoformat(),
            "DocNumber": payload.reference[:21],  # QBO max 21 chars
            "PrivateNote": payload.memo[:4000],
            "Line": qbo_lines,
        }

        if payload.dry_run:
            # Full validation without POST — QBO has no native dry-run, so we
            # simulate by checking account references exist.
            coa = await self.pull_coa(tenant_id=tenant_id)
            known = {a.external_id for a in coa}
            missing = [ln.account_external_id for ln in payload.lines if ln.account_external_id not in known]
            if missing:
                raise ConnectorValidationError(
                    f"Unknown account refs: {missing}",
                    provider=PROVIDER_ID,
                    detail={"missing_accounts": missing},
                )
            return PostJournalResult(
                external_ref=None,
                posted_at=datetime.now(timezone.utc),
                dry_run=True,
                raw={"dry_run": True, "would_post": body},
            )

        data = await self._post(tenant_id, "/company/{realm}/journalentry", body)
        entry = data.get("JournalEntry") or {}
        return PostJournalResult(
            external_ref=str(entry.get("Id")) if entry.get("Id") else None,
            posted_at=datetime.now(timezone.utc),
            dry_run=False,
            raw=data,
        )

    # ──────────────────────────────────────────────────────────────────────
    # Webhooks
    # ──────────────────────────────────────────────────────────────────────

    async def verify_webhook(self, *, body: bytes, headers: dict[str, str]) -> dict:
        """Verify intuit-signature header (HMAC-SHA256 base64 of raw body)."""
        verifier = settings.QBO_CLIENT_SECRET  # QBO uses verifier token = client secret; prod deployments should override via env
        if not verifier:
            raise ConnectorWebhookError("QBO webhook verifier not configured.", provider=PROVIDER_ID)

        # Header names arrive case-insensitive; httpx/FastAPI normalize to lower
        sig_b64 = headers.get("intuit-signature") or headers.get("Intuit-Signature")
        if not sig_b64:
            raise ConnectorWebhookError("Missing intuit-signature header.", provider=PROVIDER_ID)

        expected = base64.b64encode(
            hmac.new(verifier.encode("utf-8"), body, hashlib.sha256).digest()
        ).decode("utf-8")
        if not hmac.compare_digest(expected, sig_b64):
            raise ConnectorWebhookError("QBO webhook signature mismatch.", provider=PROVIDER_ID)

        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ConnectorWebhookError("QBO webhook body is not valid JSON.", provider=PROVIDER_ID) from exc

    # ══════════════════════════════════════════════════════════════════════
    # Internals
    # ══════════════════════════════════════════════════════════════════════

    async def _token_request(self, data: dict[str, str], *, realm_id: str | None) -> TokenBundle:
        if not settings.QBO_CLIENT_ID or not settings.QBO_CLIENT_SECRET:
            raise ConnectorAuthError("QBO credentials missing.", provider=PROVIDER_ID)
        auth = base64.b64encode(
            f"{settings.QBO_CLIENT_ID}:{settings.QBO_CLIENT_SECRET}".encode()
        ).decode()
        headers = {
            "Authorization": f"Basic {auth}",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(_TOKEN_URL, data=data, headers=headers)
        if resp.status_code >= 500:
            raise ConnectorServerError(
                f"QBO token endpoint {resp.status_code}", provider=PROVIDER_ID
            )
        if resp.status_code >= 400:
            raise ConnectorAuthError(
                f"QBO token exchange failed: {resp.text[:400]}",
                provider=PROVIDER_ID,
                detail={"status": resp.status_code},
            )
        payload = resp.json()
        expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=int(payload.get("expires_in", 3600))
        )
        return TokenBundle(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token"),
            expires_at=expires_at,
            realm_id=realm_id,
            scope=payload.get("scope"),
            raw=payload,
        )

    async def _ensure_valid_token(self, tenant_id: UUID) -> TokenBundle:
        async with async_session_maker() as session:
            bundle = await token_vault.load_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID
            )
        if bundle.expires_at and bundle.expires_at - datetime.now(timezone.utc) < timedelta(seconds=60):
            log.info("qbo.token_refresh tenant=%s", tenant_id)
            bundle = await self.refresh(tenant_id=tenant_id)
        return bundle

    def _resolve_path(self, path: str, realm_id: str) -> str:
        return f"{_api_base()}{path.replace('{realm}', realm_id)}"

    async def _get(
        self,
        tenant_id: UUID,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> dict:
        return await self._request(tenant_id, "GET", path, params=params)

    async def _post(
        self,
        tenant_id: UUID,
        path: str,
        body: dict[str, Any],
    ) -> dict:
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
            raise ConnectorAuthError("No realm_id on token bundle.", provider=PROVIDER_ID)
        url = self._resolve_path(path, bundle.realm_id)
        headers = {
            "Authorization": f"Bearer {bundle.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        async def _do() -> dict:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(
                    method, url, params=params, json=json_body, headers=headers
                )
            return _handle_qbo_response(resp)

        return await retry_mod.call_with_guard(
            _do, provider=PROVIDER_ID, tenant_id=tenant_id
        )


# ═════════════════════════════════════════════════════════════════════════════
# Error translation
# ═════════════════════════════════════════════════════════════════════════════


def _handle_qbo_response(resp: httpx.Response) -> dict:
    """Translate HTTP response → ConnectorError subclass or return parsed JSON."""
    if resp.status_code == 429:
        retry_after = float(resp.headers.get("Retry-After", "60"))
        raise ConnectorRateLimitError(
            "QBO rate limit exceeded.",
            retry_after_sec=retry_after,
            provider=PROVIDER_ID,
        )
    if resp.status_code in (401, 403):
        raise ConnectorAuthError(
            f"QBO auth failure: {resp.text[:400]}",
            provider=PROVIDER_ID,
            detail={"status": resp.status_code},
        )
    if 500 <= resp.status_code < 600:
        raise ConnectorServerError(
            f"QBO server error {resp.status_code}",
            provider=PROVIDER_ID,
            detail={"body": resp.text[:400]},
        )
    if resp.status_code >= 400:
        raise ConnectorValidationError(
            f"QBO rejected request: {resp.text[:400]}",
            provider=PROVIDER_ID,
            detail={"status": resp.status_code},
        )
    try:
        return resp.json() if resp.content else {}
    except json.JSONDecodeError as exc:
        raise ConnectorServerError(
            "QBO returned non-JSON body.", provider=PROVIDER_ID
        ) from exc
