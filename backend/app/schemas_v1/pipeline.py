"""Pipeline schemas for Tri-State governance: Proposal -> Staging -> Ledger."""



from datetime import datetime

from enum import Enum

from typing import Any, Literal



from pydantic import BaseModel, Field





# ---------------------------------------------------------------------------

# Waterfall (R1-R8)

# ---------------------------------------------------------------------------





class WaterfallRuleStatus(str, Enum):

    PASS = "PASS"

    FAIL = "FAIL"

    WARN = "WARN"





class WaterfallRule(BaseModel):

    rule_id: str  # R1..R8

    name: str

    status: WaterfallRuleStatus

    v_codes: list[str] = []

    details: list[str] = []

    threshold: float | None = None

    result_summary: str = ""





class WaterfallResult(BaseModel):

    rules: list[WaterfallRule]

    overall_status: Literal["PASS", "FAIL", "WARN"]

    integrity_score: float = Field(ge=0, le=100)





# ---------------------------------------------------------------------------

# Freeze Artifact -- canonical immutable snapshot

# ---------------------------------------------------------------------------





class FreezeArtifact(BaseModel):

    snapshot_hash: str

    exposure_digest: str

    policy_hash: str

    engine_version: str

    hedge_plan: dict[str, Any]

    scenario_results: dict[str, Any]

    waterfall_result: dict[str, Any]

    residual_risk_vector: list[float]

    capability_flags: dict[str, bool] = {}

    # EXT2 additions

    factor_covariance_summary: dict[str, Any] | None = None

    nav_attribution_summary: dict[str, Any] | None = None

    transaction_cost_summary: dict[str, Any] | None = None

    approval_threshold_metadata: dict[str, Any] | None = None

    compound_scenario_summary: dict[str, Any] | None = None

    currency_netting_summary: dict[str, Any] | None = None

    # EXT3 additions

    capital_adequacy_summary: dict[str, Any] | None = None

    margin_breakdown: dict[str, Any] | None = None

    concentration_summary: dict[str, Any] | None = None

    worst_case_summary: dict[str, Any] | None = None

    liquidity_regime: str | None = None





# ---------------------------------------------------------------------------

# Proposal

# ---------------------------------------------------------------------------





class ProposalStatus(str, Enum):

    DRAFT = "DRAFT"

    SUBMITTED = "SUBMITTED"

    RETURNED = "RETURNED"

    AUTHORIZED = "AUTHORIZED"

    REJECTED = "REJECTED"





class Proposal(BaseModel):

    proposal_id: str  # PROP-xxx

    status: ProposalStatus

    created_by: str

    created_at: datetime

    snapshot_hash: str

    policy_version: str

    exposure_digest: str

    engine_version: str = "1.0.0"

    calculate_response: dict[str, Any]

    waterfall: WaterfallResult

    frozen_inputs: dict[str, Any]

    freeze_artifact: FreezeArtifact

    residual_risk_vector: list[float] = []

    capability_flags: dict[str, bool] = {}





# ---------------------------------------------------------------------------

# Staging / Approval

# ---------------------------------------------------------------------------





class AuthorizationStatus(str, Enum):

    PENDING = "PENDING"

    APPROVED = "APPROVED"

    REJECTED = "REJECTED"

    RETURNED = "RETURNED"





class ApprovalAction(str, Enum):

    APPROVE = "APPROVE"

    REJECT = "REJECT"

    RETURN = "RETURN"





class ApprovalRecord(BaseModel):

    approver_id: str

    approver_role: str

    action: ApprovalAction

    signature_hash: str

    comment: str = ""

    timestamp: datetime | None = None





class StagedArtifact(BaseModel):

    staging_id: str

    proposal_id: str

    submitted_by: str

    submitted_at: datetime

    justification: str = ""

    integrity_score: float = Field(ge=0, le=100)

    authorization_status: AuthorizationStatus = AuthorizationStatus.PENDING

    approvals: list[ApprovalRecord] = []

    required_approvals: int = 1

    version: int = 0





# ---------------------------------------------------------------------------

# Ledger

# ---------------------------------------------------------------------------





class ProvenanceChain(BaseModel):

    market_data_source: str = ""

    transformation_steps: list[str] = []

    policy_hash: str = ""

    approval_hash: str = ""

    execution_payload_hash: str = ""





class LedgerEntry(BaseModel):

    ledger_id: str  # LEDG-xxx

    order_id: str  # ORD-xxx

    staging_id: str

    authorized_by: str

    authorized_at: datetime

    signature_hash: str

    provenance_chain: ProvenanceChain

    replay_verified: bool = False

    root_hash: str = ""

    freeze_artifact: FreezeArtifact | None = None





# ---------------------------------------------------------------------------

# Replay

# ---------------------------------------------------------------------------





class ReplayResult(BaseModel):

    original_hash: str

    replay_hash: str

    match: bool

    divergences: list[dict[str, Any]] = []

    fields_compared: list[str] = []





# ---------------------------------------------------------------------------

# Timeline

# ---------------------------------------------------------------------------





class TimelineEvent(BaseModel):

    event_type: str

    timestamp: datetime

    actor: str

    detail: str = ""

    metadata: dict[str, Any] = {}





# ---------------------------------------------------------------------------

# API Request/Response wrappers

# ---------------------------------------------------------------------------





class SandboxCalculateRequest(BaseModel):

    """Extends CalculateRequest with pipeline context."""

    trades: list[dict[str, Any]]

    hedges: list[dict[str, Any]]

    market: dict[str, Any]

    policy: dict[str, Any]

    extended_market: dict[str, Any] | None = None

    extended_policy: dict[str, Any] | None = None





class CreateProposalRequest(BaseModel):

    """Request to freeze a sandbox result into a proposal."""

    run_id: str

    justification: str = ""





class SubmitToStagingRequest(BaseModel):

    justification: str = ""





class AuthorizeRequest(BaseModel):

    action: ApprovalAction

    comment: str = ""





class ProposalListResponse(BaseModel):

    proposals: list[Proposal]

    total: int





class StagingListResponse(BaseModel):

    artifacts: list[StagedArtifact]

    total: int





class LedgerListResponse(BaseModel):

    entries: list[LedgerEntry]

    total: int





class TimelineResponse(BaseModel):

    events: list[TimelineEvent]

