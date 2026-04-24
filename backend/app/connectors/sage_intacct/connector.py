"""
Sage Intacct connector — XML Gateway + session authentication.

Reference:
  - https://developer.intacct.com/api/
  - https://developer.intacct.com/api/company-console/authentication/

Auth flow
---------
Intacct does not use redirect-based OAuth 2.0 in its XML Gateway. Instead the
user fills a form (company_id + user_id + user_password) in our Connector Hub;
the backend calls `exchange_code()` with those values (in `extra`), which
exchanges them for a sessionID via the `getAPISession` function. Session IDs
expire after ~1 hour and are refreshed transparently.

The integration sender credentials (SAGE_INTACCT_SENDER_ID / _PASSWORD) are
shared across all tenants; only the per-tenant user/company credentials are
stored encrypted in the token vault.

Webhooks
--------
Intacct supports outbound notifications via Smart Events but they are not
standard webhooks. `verify_webhook` raises for v1.
"""
from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

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

PROVIDER_ID = "sage_intacct"
_ENDPOINT = "https://api.intacct.com/ia/xml/xmlgw.phtml"


class SageIntacctConnector:
    provider_id: str = PROVIDER_ID
    display_name: str = "Sage Intacct"

    # ──────────────────────────────────────────────────────────────────────
    # Auth (form-based, not redirect OAuth)
    # ──────────────────────────────────────────────────────────────────────

    async def authorize_url(self, *, state: str, tenant_id: UUID) -> str:
        raise ConnectorAuthError(
            "Sage Intacct uses form-based credentials, not OAuth redirect. "
            "Submit company_id + user_id + user_password directly to the connect endpoint.",
            provider=PROVIDER_ID,
        )

    async def exchange_code(
        self,
        *,
        code: str,
        state: str,
        tenant_id: UUID,
        **extra: Any,
    ) -> TokenBundle:
        # `code` is unused; creds live in `extra`.
        user_id = extra.get("user_id")
        company_id = extra.get("company_id")
        user_password = extra.get("user_password")
        if not (user_id and company_id and user_password):
            raise ConnectorAuthError(
                "Sage Intacct requires user_id, company_id, user_password.",
                provider=PROVIDER_ID,
            )

        session_id, session_endpoint = await self._open_session(
            user_id=user_id, company_id=company_id, user_password=user_password
        )

        bundle = TokenBundle(
            access_token=session_id,
            refresh_token=None,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=55),
            realm_id=company_id,
            scope=None,
            raw={
                "endpoint": session_endpoint,
                "user_id": user_id,
                # user_password stored so we can reopen sessions; it never leaves the vault.
                "user_password": user_password,
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
        creds = existing.raw or {}
        if not (creds.get("user_id") and existing.realm_id and creds.get("user_password")):
            raise ConnectorAuthError(
                "Intacct session expired and stored creds are missing — reconnect required.",
                provider=PROVIDER_ID,
            )
        session_id, session_endpoint = await self._open_session(
            user_id=creds["user_id"],
            company_id=existing.realm_id,
            user_password=creds["user_password"],
        )
        bundle = TokenBundle(
            access_token=session_id,
            refresh_token=None,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=55),
            realm_id=existing.realm_id,
            scope=None,
            raw={
                "endpoint": session_endpoint,
                "user_id": creds["user_id"],
                "user_password": creds["user_password"],
            },
        )
        async with async_session_maker() as session:
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
            await self._invoke(tenant_id, "getUserPermissions", params_xml="")
            latency = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return ConnectorHealth(provider=PROVIDER_ID, healthy=True, latency_ms=latency, detail="ok")
        except ConnectorError as exc:
            latency = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return ConnectorHealth(provider=PROVIDER_ID, healthy=False, latency_ms=latency, detail=str(exc))

    async def pull_coa(self, *, tenant_id: UUID) -> list[COAAccount]:
        params = (
            "<object>GLACCOUNT</object>"
            "<fields>RECORDNO,ACCOUNTNO,TITLE,ACCOUNTTYPE,NORMALBALANCE,CURRENCY,STATUS,PARENTACCOUNTNO</fields>"
            "<pagesize>500</pagesize>"
        )
        result = await self._invoke(tenant_id, "readByQuery", params_xml=params)
        accounts: list[COAAccount] = []
        for row in result.findall(".//glaccount"):
            accounts.append(
                COAAccount(
                    external_id=_text(row, "RECORDNO") or "",
                    code=_text(row, "ACCOUNTNO") or "",
                    name=_text(row, "TITLE") or "",
                    type=_text(row, "ACCOUNTTYPE") or "Unknown",
                    subtype=None,
                    currency=_text(row, "CURRENCY"),
                    active=(_text(row, "STATUS") == "active"),
                    parent_external_id=_text(row, "PARENTACCOUNTNO"),
                )
            )
        return accounts

    async def pull_trial_balance(
        self, *, tenant_id: UUID, period_start: datetime, period_end: datetime
    ) -> list[TrialBalanceEntry]:
        params = (
            f"<reportname>Trial Balance</reportname>"
            f"<startdate>{period_start.date():%m/%d/%Y}</startdate>"
            f"<enddate>{period_end.date():%m/%d/%Y}</enddate>"
        )
        result = await self._invoke(tenant_id, "runReport", params_xml=params)
        out: list[TrialBalanceEntry] = []
        for row in result.findall(".//row"):
            account_id = _text(row, "ACCOUNTNO") or ""
            out.append(
                TrialBalanceEntry(
                    account_external_id=account_id,
                    account_code=account_id,
                    debit=Decimal(_text(row, "DEBIT") or "0"),
                    credit=Decimal(_text(row, "CREDIT") or "0"),
                    currency=_text(row, "CURRENCY") or "USD",
                    period_start=period_start,
                    period_end=period_end,
                )
            )
        return out

    async def post_journal(
        self, *, tenant_id: UUID, payload: JournalPayload
    ) -> PostJournalResult:
        payload.assert_balanced()

        lines_xml = ""
        for line in payload.lines:
            amount = line.debit if line.debit > 0 else line.credit
            debit_credit = "debit" if line.debit > 0 else "credit"
            lines_xml += (
                "<gljournalentry>"
                f"<glaccountno>{line.account_external_id}</glaccountno>"
                f"<amount>{amount}</amount>"
                f"<trtype>{debit_credit}</trtype>"
                f"<description>{_escape(line.description[:1000])}</description>"
                f"<currency>{line.currency}</currency>"
                "</gljournalentry>"
            )

        body = (
            "<create_journal_entry>"
            "<journalid>GJ</journalid>"
            f"<batchtitle>{_escape(payload.memo[:80])}</batchtitle>"
            f"<batchdate>{payload.posting_date.date():%m/%d/%Y}</batchdate>"
            f"<referenceno>{_escape(payload.reference[:60])}</referenceno>"
            f"<entries>{lines_xml}</entries>"
            "</create_journal_entry>"
        )

        if payload.dry_run:
            return PostJournalResult(
                external_ref=None,
                posted_at=datetime.now(timezone.utc),
                dry_run=True,
                raw={"dry_run": True, "would_post": body},
            )

        result = await self._invoke(tenant_id, "create_journal_entry", params_xml=body, raw_params=True)
        key = result.findtext(".//key")
        return PostJournalResult(
            external_ref=key,
            posted_at=datetime.now(timezone.utc),
            dry_run=False,
            raw={"key": key, "status": "posted"},
        )

    async def verify_webhook(self, *, body: bytes, headers: dict[str, str]) -> dict:
        raise ConnectorWebhookError(
            "Sage Intacct does not emit HTTPS webhooks in the XML Gateway. "
            "Use Smart Events + polling.",
            provider=PROVIDER_ID,
        )

    # ══════════════════════════════════════════════════════════════════════
    # Internals
    # ══════════════════════════════════════════════════════════════════════

    async def _open_session(
        self, *, user_id: str, company_id: str, user_password: str
    ) -> tuple[str, str]:
        if not settings.SAGE_INTACCT_SENDER_ID or not settings.SAGE_INTACCT_SENDER_PASSWORD:
            raise ConnectorAuthError(
                "Sage Intacct sender credentials missing (SAGE_INTACCT_SENDER_*).",
                provider=PROVIDER_ID,
            )
        envelope = self._envelope(
            user_id=user_id,
            company_id=company_id,
            user_password=user_password,
            session_id=None,
            function_xml="<function controlid='getSession'><getAPISession/></function>",
        )
        resp_root = await self._post_xml(_ENDPOINT, envelope)
        _assert_operation_ok(resp_root)
        session_id = resp_root.findtext(".//sessionid")
        endpoint = resp_root.findtext(".//endpoint") or _ENDPOINT
        if not session_id:
            raise ConnectorAuthError(
                "Intacct session response missing sessionid.", provider=PROVIDER_ID
            )
        return session_id, endpoint

    async def _ensure_valid_token(self, tenant_id: UUID) -> TokenBundle:
        async with async_session_maker() as session:
            bundle = await token_vault.load_tokens(
                session, tenant_id=tenant_id, provider=PROVIDER_ID
            )
        if bundle.expires_at and bundle.expires_at - datetime.now(timezone.utc) < timedelta(seconds=60):
            bundle = await self.refresh(tenant_id=tenant_id)
        return bundle

    async def _invoke(
        self,
        tenant_id: UUID,
        function_name: str,
        *,
        params_xml: str,
        raw_params: bool = False,
    ) -> ET.Element:
        await rate_limiter.take(provider=PROVIDER_ID, tenant_id=tenant_id)
        bundle = await self._ensure_valid_token(tenant_id)
        endpoint = (bundle.raw or {}).get("endpoint", _ENDPOINT)

        inner = params_xml if raw_params else f"<{function_name}>{params_xml}</{function_name}>"
        function_xml = f"<function controlid='{uuid4()}'>{inner}</function>"

        envelope = self._envelope(
            user_id=(bundle.raw or {}).get("user_id", ""),
            company_id=bundle.realm_id or "",
            user_password=None,
            session_id=bundle.access_token,
            function_xml=function_xml,
        )

        async def _do() -> ET.Element:
            root = await self._post_xml(endpoint, envelope)
            _assert_operation_ok(root)
            return root

        return await retry_mod.call_with_guard(
            _do, provider=PROVIDER_ID, tenant_id=tenant_id
        )

    def _envelope(
        self,
        *,
        user_id: str,
        company_id: str,
        user_password: str | None,
        session_id: str | None,
        function_xml: str,
    ) -> str:
        if session_id:
            auth = f"<sessionid>{session_id}</sessionid>"
        else:
            auth = (
                "<login>"
                f"<userid>{_escape(user_id)}</userid>"
                f"<companyid>{_escape(company_id)}</companyid>"
                f"<password>{_escape(user_password or '')}</password>"
                "</login>"
            )
        return (
            '<?xml version="1.0" encoding="utf-8"?>'
            "<request>"
            "<control>"
            f"<senderid>{_escape(settings.SAGE_INTACCT_SENDER_ID)}</senderid>"
            f"<password>{_escape(settings.SAGE_INTACCT_SENDER_PASSWORD)}</password>"
            f"<controlid>{uuid4()}</controlid>"
            "<uniqueid>false</uniqueid>"
            "<dtdversion>3.0</dtdversion>"
            "<includewhitespace>false</includewhitespace>"
            "</control>"
            "<operation>"
            f"<authentication>{auth}</authentication>"
            f"<content>{function_xml}</content>"
            "</operation>"
            "</request>"
        )

    async def _post_xml(self, endpoint: str, xml_body: str) -> ET.Element:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                endpoint,
                content=xml_body.encode("utf-8"),
                headers={"Content-Type": "application/xml"},
            )
        if resp.status_code == 429:
            raise ConnectorRateLimitError("Intacct rate limit.", provider=PROVIDER_ID)
        if 500 <= resp.status_code < 600:
            raise ConnectorServerError(
                f"Intacct server error {resp.status_code}", provider=PROVIDER_ID
            )
        if resp.status_code >= 400:
            raise ConnectorValidationError(
                f"Intacct HTTP {resp.status_code}: {resp.text[:400]}",
                provider=PROVIDER_ID,
            )
        try:
            return ET.fromstring(resp.text)
        except ET.ParseError as exc:
            raise ConnectorServerError(
                f"Intacct returned invalid XML: {exc}", provider=PROVIDER_ID
            ) from exc


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════


def _text(element: ET.Element, tag: str) -> str | None:
    found = element.find(tag)
    return found.text if found is not None else None


def _escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _assert_operation_ok(root: ET.Element) -> None:
    """Intacct returns 200 with <errormessage> embedded — parse status manually."""
    # Control-level status
    control_status = root.findtext(".//control/status")
    if control_status and control_status != "success":
        msg = root.findtext(".//errormessage//description2") or "Unknown control error"
        raise ConnectorAuthError(f"Intacct control rejected: {msg}", provider=PROVIDER_ID)

    # Operation-level
    op_status = root.findtext(".//operation/authentication/status")
    if op_status and op_status != "success":
        msg = root.findtext(".//operation/errormessage//description2") or "Authentication failed"
        raise ConnectorAuthError(f"Intacct auth rejected: {msg}", provider=PROVIDER_ID)

    # Function-level
    func_status = root.findtext(".//result/status")
    if func_status and func_status not in ("success",):
        msg = (
            root.findtext(".//result/errormessage//description2")
            or root.findtext(".//result/errormessage//description")
            or "Function call failed"
        )
        raise ConnectorValidationError(f"Intacct rejected: {msg}", provider=PROVIDER_ID)
