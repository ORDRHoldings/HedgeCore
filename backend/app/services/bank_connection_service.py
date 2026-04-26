"""
app/services/bank_connection_service.py

OAuth connection management for TrueLayer/Plaid with circuit-breaker.

Circuit-breaker: consecutive_failure_count >= 3 -> status=ERROR.
Reset: any successful pull resets count to 0.
OAuth CSRF: pending_oauth_state stored with 5-min TTL; validated at callback.
"""
from __future__ import annotations

import os
import secrets
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import (
    BankConnection,
    BankConnectionProvider,
    BankConnectionStatus,
    CashAuditEventType,
)
from app.services.cash_audit_service import append_event
from app.services.cash_encryption import encrypt_field

CIRCUIT_BREAKER_THRESHOLD = 3
OAUTH_STATE_TTL_MINUTES = 5


@dataclass
class ProviderBalance:
    account_id: str
    ledger_balance: float
    available_balance: float
    currency: str


class BankProviderAdapter(ABC):
    @abstractmethod
    def get_auth_url(self, state: str, redirect_uri: str) -> str: ...

    @abstractmethod
    async def exchange_code(self, code: str) -> dict: ...  # returns {access_token, refresh_token, expires_in}

    @abstractmethod
    async def get_balances(self, access_token: str) -> list[ProviderBalance]: ...


class TrueLayerAdapter(BankProviderAdapter):
    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        client_id = os.getenv("TRUELAYER_CLIENT_ID", "")
        return (
            f"https://auth.truelayer.com/?response_type=code&client_id={client_id}"
            f"&scope=accounts+balance&redirect_uri={redirect_uri}&state={state}"
            f"&providers=uk-ob-all+ie-ob-all+de-ob-all"
        )

    async def exchange_code(self, code: str) -> dict:
        raise NotImplementedError("TrueLayer live exchange — configure TRUELAYER_CLIENT_SECRET")

    async def get_balances(self, access_token: str) -> list[ProviderBalance]:
        raise NotImplementedError("TrueLayer live balance pull — configure TRUELAYER_CLIENT_SECRET")


class PlaidAdapter(BankProviderAdapter):
    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        return f"https://cdn.plaid.com/link/v2/stable/link.html?state={state}&redirect_uri={redirect_uri}"

    async def exchange_code(self, code: str) -> dict:
        raise NotImplementedError("Plaid live exchange — configure PLAID_CLIENT_SECRET")

    async def get_balances(self, access_token: str) -> list[ProviderBalance]:
        raise NotImplementedError("Plaid live balance pull — configure PLAID_CLIENT_SECRET")


def _get_adapter(provider: str) -> BankProviderAdapter:
    if provider == BankConnectionProvider.TRUELAYER.value:
        return TrueLayerAdapter()
    if provider == BankConnectionProvider.PLAID.value:
        return PlaidAdapter()
    raise ValueError(f"Unknown provider: {provider}")


def _handle_pull_failure(connection: BankConnection, error: str) -> None:
    connection.consecutive_failure_count += 1
    connection.last_error_at = datetime.now(UTC)
    connection.last_error_message = error[:500]  # prevent token fragments
    if connection.consecutive_failure_count >= CIRCUIT_BREAKER_THRESHOLD:
        connection.status = BankConnectionStatus.ERROR.value


def _handle_pull_success(connection: BankConnection) -> None:
    connection.consecutive_failure_count = 0
    connection.last_successful_pull_at = datetime.now(UTC)
    if connection.status == BankConnectionStatus.ACTIVE.value:
        pass  # already active


async def get_auth_url(
    session: AsyncSession,
    *,
    provider: str,
    company_id: uuid.UUID,
    redirect_uri: str,
    created_by: uuid.UUID,
) -> tuple[str, BankConnection]:
    state = secrets.token_urlsafe(48)
    adapter = _get_adapter(provider)
    url = adapter.get_auth_url(state, redirect_uri)

    connection = BankConnection(
        company_id=company_id,
        provider=provider,
        institution_id="pending",
        institution_name="Pending OAuth",
        status=BankConnectionStatus.ACTIVE.value,
        pending_oauth_state=state,
        pending_oauth_state_expires_at=datetime.now(UTC) + timedelta(minutes=OAUTH_STATE_TTL_MINUTES),
        created_by=created_by,
    )
    session.add(connection)
    return url, connection


async def handle_callback(
    session: AsyncSession,
    *,
    state: str,
    code: str,
    company_id: uuid.UUID,
    created_by: uuid.UUID,
) -> BankConnection:
    result = await session.execute(
        select(BankConnection).where(
            BankConnection.company_id == company_id,
            BankConnection.pending_oauth_state == state,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        raise ValueError("Invalid OAuth state — connection not found")
    if connection.pending_oauth_state_expires_at < datetime.now(UTC):
        raise ValueError("OAuth state expired — restart the connection flow")
    if connection.created_by == created_by:
        raise ValueError("SoD violation: the user who initiated the OAuth flow cannot complete it")

    adapter = _get_adapter(connection.provider)
    tokens = await adapter.exchange_code(code)

    connection.access_token_enc = encrypt_field(tokens["access_token"], str(company_id))
    connection.refresh_token_enc = encrypt_field(tokens.get("refresh_token", ""), str(company_id))
    connection.token_expires_at = datetime.now(UTC) + timedelta(seconds=tokens.get("expires_in", 3600))
    connection.pending_oauth_state = None
    connection.pending_oauth_state_expires_at = None
    connection.status = BankConnectionStatus.ACTIVE.value

    await append_event(session, company_id=company_id, event_type=CashAuditEventType.CONNECTION_LINKED,
                       payload={"provider": connection.provider}, performed_by=created_by)
    return connection


async def revoke_connection(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    company_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> BankConnection:
    result = await session.execute(
        select(BankConnection).where(
            BankConnection.id == connection_id,
            BankConnection.company_id == company_id,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        raise ValueError(f"BankConnection {connection_id} not found")
    connection.status = BankConnectionStatus.REVOKED.value
    connection.access_token_enc = None
    connection.refresh_token_enc = None
    connection.updated_at = datetime.now(UTC)
    await append_event(session, company_id=company_id, event_type=CashAuditEventType.CONNECTION_REVOKED,
                       payload={"connection_id": str(connection_id)}, performed_by=actor_id)
    return connection
