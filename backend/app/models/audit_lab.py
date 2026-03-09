"""app/models/audit_lab.py

Audit Lab ORM models — 5 WORM tables for institutional FX audit workflows.

Tables:
  - audit_datasets      Upload metadata + file hash dedup
  - audit_transactions   Parsed rows from uploaded statements
  - audit_runs           Reproducible audit execution envelopes
  - audit_findings       Individual findings with severity + evidence
  - audit_reports        Rendered report snapshots (JSON + hash)

All 5 tables are append-only (WORM). PostgreSQL triggers block UPDATE/DELETE.
"""

from __future__ import annotations

import uuid as _uuid
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import (
    UUID,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


# ── AuditDataset ─────────────────────────────────────────────────────────────


class AuditDataset(Base):
    __tablename__ = "audit_datasets"

    id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4,
        doc="Stable reference UUID for this dataset.",
    )

    company_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        doc="Tenant scope — dataset belongs to this company.",
    )

    period_start: Mapped[date] = mapped_column(
        Date, nullable=False,
        doc="Inclusive start of the statement period.",
    )

    period_end: Mapped[date] = mapped_column(
        Date, nullable=False,
        doc="Inclusive end of the statement period.",
    )

    source_filename: Mapped[str] = mapped_column(
        Text, nullable=False,
        doc="Original filename of the uploaded statement.",
    )

    source_hash: Mapped[str] = mapped_column(
        Text, nullable=False,
        doc="SHA-256 of the raw uploaded file. Dedup key with company_id.",
    )

    row_count: Mapped[int] = mapped_column(
        Integer, nullable=False,
        doc="Number of parsed transaction rows.",
    )

    currency_pairs: Mapped[Optional[Any]] = mapped_column(
        JSONB, nullable=True,
        doc="Distinct currency pairs found in the dataset (e.g. ['USD/MXN', 'EUR/USD']).",
    )

    created_by: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        doc="User who uploaded the dataset.",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "company_id", "source_hash",
            name="uix_audit_datasets_company_source_hash",
        ),
        Index("ix_audit_datasets_company", "company_id", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditDataset id={self.id} company_id={self.company_id} "
            f"file={self.source_filename!r} rows={self.row_count}>"
        )


# ── AuditTransaction ────────────────────────────────────────────────────────


class AuditTransaction(Base):
    __tablename__ = "audit_transactions"

    id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4,
        doc="Stable reference UUID for this transaction row.",
    )

    dataset_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("audit_datasets.id", ondelete="CASCADE"),
        nullable=False,
        doc="Parent dataset this row belongs to.",
    )

    company_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        doc="Tenant scope — denormalized for efficient queries.",
    )

    row_index: Mapped[int] = mapped_column(
        Integer, nullable=False,
        doc="Zero-based row index within the source file.",
    )

    trade_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True,
        doc="Trade/execution date.",
    )

    value_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True,
        doc="Settlement/value date.",
    )

    currency_sold: Mapped[Optional[str]] = mapped_column(
        String, nullable=True,
        doc="ISO 4217 currency code sold.",
    )

    currency_bought: Mapped[Optional[str]] = mapped_column(
        String, nullable=True,
        doc="ISO 4217 currency code bought.",
    )

    amount_sold: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True,
        doc="Notional amount sold.",
    )

    amount_bought: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True,
        doc="Notional amount bought.",
    )

    effective_rate: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True,
        doc="Effective FX rate (amount_bought / amount_sold or inverse).",
    )

    counterparty: Mapped[Optional[str]] = mapped_column(
        String, nullable=True,
        doc="Counterparty bank/broker name.",
    )

    fee_amount: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True,
        doc="Transaction fee amount.",
    )

    fee_currency: Mapped[Optional[str]] = mapped_column(
        String, nullable=True,
        doc="ISO 4217 currency of the fee.",
    )

    reference: Mapped[Optional[str]] = mapped_column(
        String, nullable=True,
        doc="External reference / deal ticket number.",
    )

    row_hash: Mapped[str] = mapped_column(
        String, nullable=False,
        doc="SHA-256 hash of the canonical row content.",
    )

    parse_warnings: Mapped[Optional[Any]] = mapped_column(
        JSONB, nullable=True,
        doc="Parser warnings for this row (e.g. missing fields, format issues).",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        Index("ix_audit_transactions_dataset", "dataset_id"),
        Index("ix_audit_transactions_company", "company_id"),
        Index("ix_audit_transactions_dataset_trade_date", "dataset_id", "trade_date"),
        Index(
            "ix_audit_transactions_dataset_ccy_pair",
            "dataset_id", "currency_sold", "currency_bought",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditTransaction id={self.id} dataset={self.dataset_id} "
            f"row={self.row_index} {self.currency_sold}/{self.currency_bought}>"
        )


# ── AuditRun ─────────────────────────────────────────────────────────────────


class AuditRun(Base):
    __tablename__ = "audit_runs"

    id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4,
        doc="Stable reference UUID for this audit run.",
    )

    company_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        doc="Tenant scope.",
    )

    dataset_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("audit_datasets.id"),
        nullable=False,
        doc="Dataset analysed in this run.",
    )

    methodology_version: Mapped[str] = mapped_column(
        String, nullable=False,
        doc="Semantic version of the audit methodology (e.g. '1.0.0').",
    )

    benchmark_config: Mapped[Any] = mapped_column(
        JSONB, nullable=False,
        doc="Frozen benchmark/threshold configuration used for this run.",
    )

    run_hash: Mapped[str] = mapped_column(
        String, nullable=False,
        doc="SHA-256 hash of the full run envelope (inputs + outputs).",
    )

    inputs_hash: Mapped[str] = mapped_column(
        String, nullable=False,
        doc="SHA-256 hash of all inputs (dataset rows + benchmark config).",
    )

    outputs_hash: Mapped[str] = mapped_column(
        String, nullable=False,
        doc="SHA-256 hash of all outputs (findings + report).",
    )

    trace_bundle: Mapped[Any] = mapped_column(
        JSONB, nullable=False,
        doc="Full execution trace for reproducibility verification.",
    )

    status: Mapped[str] = mapped_column(
        String, nullable=False, default="COMPLETED",
        doc="Run status: COMPLETED | FAILED.",
    )

    created_by: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        doc="User who triggered the audit run.",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        Index("ix_audit_runs_company", "company_id", "created_at"),
        Index("ix_audit_runs_dataset", "dataset_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditRun id={self.id} dataset={self.dataset_id} "
            f"status={self.status} method={self.methodology_version!r}>"
        )


# ── AuditFinding ─────────────────────────────────────────────────────────────


class AuditFinding(Base):
    __tablename__ = "audit_findings"

    id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4,
        doc="Stable reference UUID for this finding.",
    )

    run_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("audit_runs.id"),
        nullable=False,
        doc="Parent audit run.",
    )

    company_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        doc="Tenant scope — denormalized for efficient queries.",
    )

    finding_type: Mapped[str] = mapped_column(
        String, nullable=False,
        doc="Finding category (e.g. 'RATE_DEVIATION', 'FEE_OUTLIER', 'MISSING_COUNTERPARTY').",
    )

    currency_pair: Mapped[Optional[str]] = mapped_column(
        String, nullable=True,
        doc="Affected currency pair (e.g. 'USD/MXN').",
    )

    counterparty: Mapped[Optional[str]] = mapped_column(
        String, nullable=True,
        doc="Affected counterparty, if applicable.",
    )

    amount_usd: Mapped[float] = mapped_column(
        Float, nullable=False,
        doc="Finding amount in USD.",
    )

    amount_local: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True,
        doc="Finding amount in local currency.",
    )

    local_currency: Mapped[Optional[str]] = mapped_column(
        String, nullable=True,
        doc="ISO 4217 code for the local currency amount.",
    )

    severity: Mapped[str] = mapped_column(
        String, nullable=False,
        doc="Finding severity: CRITICAL | HIGH | MEDIUM | LOW | INFO.",
    )

    narrative: Mapped[str] = mapped_column(
        Text, nullable=False,
        doc="Human-readable explanation of the finding.",
    )

    evidence: Mapped[Any] = mapped_column(
        JSONB, nullable=False, server_default="[]",
        doc="Supporting evidence array (transaction refs, rate comparisons, etc.).",
    )

    finding_hash: Mapped[str] = mapped_column(
        String, nullable=False,
        doc="SHA-256 hash of the finding content for tamper evidence.",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        Index("ix_audit_findings_run", "run_id"),
        Index("ix_audit_findings_company", "company_id", "created_at"),
        Index("ix_audit_findings_run_type", "run_id", "finding_type"),
        Index("ix_audit_findings_company_severity", "company_id", "severity"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditFinding id={self.id} run={self.run_id} "
            f"type={self.finding_type!r} severity={self.severity!r}>"
        )


# ── AuditReport ──────────────────────────────────────────────────────────────


class AuditReport(Base):
    __tablename__ = "audit_reports"

    id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4,
        doc="Stable reference UUID for this report.",
    )

    run_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("audit_runs.id"),
        nullable=False,
        doc="Parent audit run that produced this report.",
    )

    company_id: Mapped[_uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        doc="Tenant scope — denormalized for efficient queries.",
    )

    report_json: Mapped[Any] = mapped_column(
        JSONB, nullable=False,
        doc="Full rendered report payload.",
    )

    report_hash: Mapped[str] = mapped_column(
        String, nullable=False,
        doc="SHA-256 hash of report_json for tamper evidence.",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        Index("ix_audit_reports_run", "run_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditReport id={self.id} run={self.run_id} "
            f"hash={self.report_hash[:8]}...>"
        )
