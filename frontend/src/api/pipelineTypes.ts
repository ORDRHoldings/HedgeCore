import type { CalculateRequest, CalculateResponse } from "./types";

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------

export type WaterfallRuleStatus = "PASS" | "FAIL" | "WARN";

export interface WaterfallRule {
  rule_id: string;
  name: string;
  status: WaterfallRuleStatus;
  v_codes: string[];
  details: string[];
  threshold: number | null;
  result_summary: string;
}

export interface WaterfallResult {
  rules: WaterfallRule[];
  overall_status: string;
  integrity_score: number;
}

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

export type ProposalStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "RETURNED"
  | "AUTHORIZED"
  | "REJECTED";

export interface FreezeArtifact {
  snapshot_hash: string;
  exposure_digest: string;
  policy_hash: string;
  engine_version: string;
  hedge_plan: Record<string, unknown>;
  scenario_results: Record<string, unknown>;
  waterfall_result: Record<string, unknown>;
  residual_risk_vector: number[];
  capability_flags: Record<string, boolean>;
  factor_covariance_summary?: Record<string, unknown>;
  nav_attribution_summary?: Record<string, unknown>;
  transaction_cost_summary?: Record<string, unknown>;
  approval_threshold_metadata?: Record<string, unknown>;
  compound_scenario_summary?: Record<string, unknown>;
  currency_netting_summary?: Record<string, unknown>;
  capital_adequacy_summary?: Record<string, unknown>;
  margin_breakdown?: Record<string, unknown>;
  concentration_summary?: Record<string, unknown>;
  worst_case_summary?: Record<string, unknown>;
  liquidity_regime?: string;
}

export interface Proposal {
  proposal_id: string;
  status: ProposalStatus;
  created_by: string;
  created_at: string;
  snapshot_hash: string;
  policy_version: string;
  exposure_digest: string;
  engine_version: string;
  calculate_response: Record<string, unknown>;
  waterfall: WaterfallResult;
  frozen_inputs: Record<string, unknown>;
  freeze_artifact: FreezeArtifact;
  residual_risk_vector: number[];
  capability_flags: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

export type AuthorizationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "RETURNED";
export type ApprovalAction = "APPROVE" | "REJECT" | "RETURN";

export interface ApprovalRecord {
  approver_id: string;
  approver_role: string;
  action: ApprovalAction;
  signature_hash: string;
  comment: string;
  timestamp: string;
}

export interface StagedArtifact {
  staging_id: string;
  proposal_id: string;
  submitted_by: string;
  submitted_at: string;
  justification: string;
  integrity_score: number;
  authorization_status: AuthorizationStatus;
  approvals: ApprovalRecord[];
  required_approvals: number;
  version?: number;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export interface ProvenanceChain {
  market_data_source: string;
  transformation_steps: string[];
  policy_hash: string;
  approval_hash: string;
  execution_payload_hash: string;
}

export interface LedgerEntry {
  ledger_id: string;
  order_id: string;
  staging_id: string;
  authorized_by: string;
  authorized_at: string;
  signature_hash: string;
  provenance_chain: ProvenanceChain;
  root_hash: string;
  freeze_artifact: FreezeArtifact | null;
  replay_verified: boolean;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export interface ReplayResult {
  original_hash: string;
  replay_hash: string;
  match: boolean;
  divergences: Record<string, unknown>[];
  fields_compared: string[];
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  event_type: string;
  timestamp: string;
  actor: string;
  detail: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// V2 engine results
// ---------------------------------------------------------------------------

export interface V2Results {
  tensor_result?: Record<string, unknown>;
  margin_summary?: Record<string, unknown>;
  liquidity_result?: Record<string, unknown>;
  allocator_result?: Record<string, unknown>;
  roll_ladder?: Record<string, unknown>;
  extended_scenarios?: Record<string, unknown>;
  factor_covariance?: Record<string, unknown>;
  transaction_costs?: Record<string, unknown>;
  nav_attribution?: Record<string, unknown>;
  currency_netting?: Record<string, unknown>;
  concentration?: Record<string, unknown>;
  liquidity_regime?: Record<string, unknown>;
  worst_case?: Record<string, unknown>;
  capital_adequacy?: Record<string, unknown>;
  margin_breakdown?: Record<string, unknown>;
  forward_validation?: Record<string, unknown>;
  hedge_bands?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sandbox response
// ---------------------------------------------------------------------------

export interface SandboxCalculateResponse {
  run_id: string;
  calculate_response: CalculateResponse | null;
  waterfall_result: WaterfallResult;
  validation_report: unknown;
  hedge_plan: unknown;
  scenario_results: unknown;
  trace_events: unknown[];
  frozen_inputs: Record<string, unknown>;
  run_envelope: unknown;
  v2_results: V2Results;
  pair?: string;      // Active pair ID, e.g. "EURUSD", "USDMXN"
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export type SandboxCalculateRequest = CalculateRequest;

export interface CreateProposalRequest {
  run_id: string;
}

export interface SubmitToStagingRequest {
  proposal_id: string;
  justification: string;
}

export interface AuthorizeRequest {
  staging_id: string;
  action: ApprovalAction;
  comment?: string;
}

export interface ReplayLedgerRequest {
  ledger_id: string;
}
