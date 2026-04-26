"""
ConnectorProtocol — uniform contract every ERP/accounting provider must implement.

Design principles:
- Provider-agnostic types (JournalPayload, COAAccount, TrialBalanceEntry).
  Adapters translate to/from provider-native JSON inside their own package.
- Async-only. Every method returns awaitable.
- Returns normalized types; raises normalized ConnectorError subclasses.
- No SQLAlchemy imports here. Session is passed in by the calling service,
  never stored on the connector instance.

Contract stability: changing this file triggers an ADR — every provider adapter
depends on it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Protocol, runtime_checkable
from uuid import UUID

# ═════════════════════════════════════════════════════════════════════════════
# Normalized types
# ═════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class TokenBundle:
    """OAuth token set returned after exchange or refresh.

    Providers that don't use OAuth (e.g., Sage Intacct session auth) still
    return a TokenBundle with `access_token` set to the session ID and
    `refresh_token=None`.
    """

    access_token: str
    refresh_token: str | None
    expires_at: datetime | None  # UTC
    realm_id: str | None = None  # QBO company id, Xero tenant id, NetSuite account
    scope: str | None = None
    raw: dict = field(default_factory=dict)  # provider-native response (opaque)


@dataclass(frozen=True)
class ConnectorStatus:
    provider: str
    connected: bool
    paper_mode: bool
    last_sync_at: datetime | None
    last_error: str | None
    realm_id: str | None
    rate_budget_remaining: int | None  # tokens left in current window
    rate_window_reset_at: datetime | None
    circuit_open: bool


@dataclass(frozen=True)
class ConnectorHealth:
    provider: str
    healthy: bool
    latency_ms: float
    detail: str


@dataclass(frozen=True)
class COAAccount:
    """Normalized chart-of-accounts entry pulled from the ERP."""

    external_id: str  # provider-assigned ID
    code: str  # e.g. "1100"
    name: str
    type: str  # Asset | Liability | Equity | Revenue | Expense
    subtype: str | None
    currency: str | None
    active: bool
    parent_external_id: str | None


@dataclass(frozen=True)
class TrialBalanceEntry:
    account_external_id: str
    account_code: str
    debit: Decimal
    credit: Decimal
    currency: str
    period_start: datetime
    period_end: datetime


@dataclass(frozen=True)
class JournalLine:
    """One line of a GL journal entry. Sign convention: positive debit, positive credit.

    Exactly one of debit/credit must be > 0; the other must be 0.
    """

    account_external_id: str  # provider-specific ref
    debit: Decimal
    credit: Decimal
    description: str
    currency: str
    memo: str | None = None
    dimensions: dict = field(default_factory=dict)  # class, dept, entity, project...


@dataclass(frozen=True)
class JournalPayload:
    """Normalized journal entry ready to post. Must be balanced."""

    journal_entry_id: UUID  # ORDR internal ID (for external_ref tracking)
    posting_date: datetime
    memo: str
    reference: str  # idempotency key — provider will reject duplicates
    lines: tuple[JournalLine, ...]
    dry_run: bool = False

    def assert_balanced(self) -> None:
        total_debit = sum((ln.debit for ln in self.lines), start=Decimal("0"))
        total_credit = sum((ln.credit for ln in self.lines), start=Decimal("0"))
        if total_debit != total_credit:
            from app.connectors.errors import ConnectorValidationError
            raise ConnectorValidationError(
                f"Journal unbalanced: debit={total_debit}, credit={total_credit}",
                detail={"debit": str(total_debit), "credit": str(total_credit)},
            )


@dataclass(frozen=True)
class PostJournalResult:
    external_ref: str | None  # provider's journal ID; None for dry-run
    posted_at: datetime
    dry_run: bool
    raw: dict  # opaque provider response for audit


# ═════════════════════════════════════════════════════════════════════════════
# Protocol
# ═════════════════════════════════════════════════════════════════════════════


@runtime_checkable
class ConnectorProtocol(Protocol):
    """Contract every provider adapter must satisfy.

    Instances are per-request (cheap to construct). State (tokens, rate budget)
    is resolved via token_vault + rate_limiter on each call — never cached on
    the connector instance.
    """

    provider_id: str  # "quickbooks" | "xero" | "netsuite" | "sage_intacct" | "dynamics365"
    display_name: str

    # OAuth / auth lifecycle -------------------------------------------------
    async def authorize_url(self, *, state: str, tenant_id: UUID) -> str:
        """Return the provider OAuth authorize URL. `state` is CSRF-safe token."""
        ...

    async def exchange_code(self, *, code: str, state: str, tenant_id: UUID, **extra) -> TokenBundle:
        """Exchange authorization code for tokens."""
        ...

    async def refresh(self, *, tenant_id: UUID) -> TokenBundle:
        """Refresh access token using stored refresh_token."""
        ...

    async def revoke(self, *, tenant_id: UUID) -> None:
        """Revoke tokens with provider (best-effort) and wipe vault entry."""
        ...

    # Data operations --------------------------------------------------------
    async def health_check(self, *, tenant_id: UUID) -> ConnectorHealth:
        """Cheap GET to verify auth still works. Called by /status endpoint."""
        ...

    async def pull_coa(self, *, tenant_id: UUID) -> list[COAAccount]:
        """Pull full chart of accounts."""
        ...

    async def pull_trial_balance(
        self, *, tenant_id: UUID, period_start: datetime, period_end: datetime
    ) -> list[TrialBalanceEntry]:
        """Pull trial balance for the period."""
        ...

    async def post_journal(self, *, tenant_id: UUID, payload: JournalPayload) -> PostJournalResult:
        """Post a GL journal entry. Raises ConnectorValidationError if provider rejects.

        If `payload.dry_run` is True, perform all validation but do not POST.
        Returns a result with external_ref=None.
        """
        ...

    # Webhooks ---------------------------------------------------------------
    async def verify_webhook(self, *, body: bytes, headers: dict[str, str]) -> dict:
        """Verify HMAC signature + timestamp skew. Return parsed payload.

        Raises ConnectorWebhookError on any verification failure.
        """
        ...
