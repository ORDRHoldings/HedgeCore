"""
Pydantic response models for Audit Lab API endpoints.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ── Upload response ──────────────────────────────────────────────────────────


class DatasetUploadResponse(BaseModel):
    dataset_id: str
    row_count: int
    currency_pairs_detected: list[str]
    period_start: str
    period_end: str
    source_hash: str
    parse_warnings: list[str] = Field(default_factory=list)


# ── Run responses ────────────────────────────────────────────────────────────


class AuditRunSummary(BaseModel):
    total_markup_usd: float = 0.0
    total_fees_usd: float = 0.0
    total_rate_variance_usd: float = 0.0
    total_unhedged_impact_usd: float = 0.0  # backward compat alias
    total_loss_usd: float = 0.0
    data_quality_score: float = 0.0
    fee_confidence: str = "LOW_CONFIDENCE"
    markup_rejections_count: int = 0
    total_favorable_usd: float = 0.0
    total_adverse_usd: float = 0.0
    outlier_count: int = 0
    counterparty_count: int = 0
    natural_hedge_count: int = 0


class AuditRunCreateResponse(BaseModel):
    run_id: str
    run_hash: str
    summary: AuditRunSummary


class AuditFindingResponse(BaseModel):
    id: str
    finding_type: str
    currency_pair: str | None = None
    counterparty: str | None = None
    amount_usd: float
    severity: str
    narrative: str
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    finding_hash: str
    markup_direction: str | None = None
    spread_classification: str | None = None
    created_at: str | None = None


class AuditRunDetailResponse(BaseModel):
    run_id: str
    dataset_id: str
    methodology_version: str
    benchmark_config: Any = None
    run_hash: str
    inputs_hash: str
    outputs_hash: str
    status: str
    created_at: str | None = None
    summary: dict[str, Any] = Field(default_factory=dict)
    findings: list[AuditFindingResponse] = Field(default_factory=list)
    markup_by_pair: dict[str, float] = Field(default_factory=dict)
    markup_by_counterparty: dict[str, float] = Field(default_factory=dict)
    markup_by_month: dict[str, float] = Field(default_factory=dict)
    rate_variance_results: list[dict[str, Any]] = Field(default_factory=list)
    unhedged_results: list[dict[str, Any]] = Field(default_factory=list)  # backward compat
    counterparty_scores: list[dict[str, Any]] = Field(default_factory=list)
    natural_hedges: list[dict[str, Any]] = Field(default_factory=list)
    outlier_count: int = 0
    trace_bundle: Any = None
    report_hash: str | None = None


class AuditRunListItem(BaseModel):
    run_id: str
    dataset_id: str
    methodology_version: str
    run_hash: str
    inputs_hash: str
    outputs_hash: str
    status: str
    markup_total_usd: float = 0.0
    created_at: str | None = None


# ── Export response ──────────────────────────────────────────────────────────


class ExportArtifact(BaseModel):
    type: str
    id: str | None = None
    hash: str


class AuditRunExportResponse(BaseModel):
    manifest_version: str = "1.0.0"
    generated_at: str
    run_type: str = "audit_lab"
    run_id: str
    run_hash: str
    inputs_hash: str
    outputs_hash: str
    methodology_version: str
    artifacts: list[ExportArtifact] = Field(default_factory=list)
    findings_count: int = 0
    findings_total_usd: float = 0.0
    summary: dict[str, Any] = Field(default_factory=dict)
    trace_bundle: Any = None


# ── Dataset response ─────────────────────────────────────────────────────────


class DatasetListItem(BaseModel):
    id: str
    period_start: str
    period_end: str
    source_filename: str
    source_hash: str
    row_count: int
    currency_pairs: list[str] | Any = Field(default_factory=list)
    created_at: str | None = None


class DatasetListResponse(BaseModel):
    items: list[DatasetListItem]
    total: int


# ── Transaction response (Item 13 drill-down) ───────────────────────────────


class TransactionResponse(BaseModel):
    id: str
    row_index: int
    trade_date: str | None = None
    value_date: str | None = None
    currency_sold: str | None = None
    currency_bought: str | None = None
    amount_sold: float | None = None
    amount_bought: float | None = None
    effective_rate: float | None = None
    counterparty: str | None = None
    fee_amount: float | None = None
    fee_currency: str | None = None
    reference: str | None = None
    row_hash: str
    benchmark_rate: float | None = None
    markup_per_unit: float | None = None
    markup_cost_usd: float | None = None
    markup_direction: str | None = None
    spread_classification: str | None = None


# ── Compare response ─────────────────────────────────────────────────────────


class RunCompareResponse(BaseModel):
    runs: list[AuditRunDetailResponse]
