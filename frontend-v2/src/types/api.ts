// ── Core user type ────────────────────────────────────────────────────────────

export type PlanTier = "lite" | "smb" | "professional" | "enterprise";

export interface UserContext {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  is_active: boolean;
  is_superuser: boolean;
  company: { id: string; name: string; slug: string } | null;
  branch: { id: string; name: string; code: string } | null;
  department: { id: string; name: string; code: string } | null;
  roles: string[];
  permissions: string[];
  hierarchy_level: number | null;
  plan_tier: PlanTier;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  mfa_required?: boolean;
}

export interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

// ── Positions ─────────────────────────────────────────────────────────────────

export type PositionStatus =
  | "NEW"
  | "POLICY_ASSIGNED"
  | "READY_TO_EXECUTE"
  | "HEDGED"
  | "REJECTED";

export interface Position {
  id: string;
  record_id: string;
  currency: string;
  amount: number;
  amount_usd: number | null;
  flow_type: "AR" | "AP";
  value_date: string | null;
  description: string | null;
  /** Data type: CONFIRMED | FORECAST */
  status: string;
  /** Lifecycle state: NEW | POLICY_ASSIGNED | READY_TO_EXECUTE | HEDGED | REJECTED */
  execution_status: PositionStatus;
  policy_instance_id: string | null;
  last_run_id: string | null;
  hedge_amount: number | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PositionCreate {
  currency: string;
  amount: number;
  flow_type: "AR" | "AP";
  value_date?: string;
  description?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages?: number;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  exposure_usd: number;
  coverage_pct: number;
  pending_proposals: number;
  alerts_count: number;
}

export interface DashboardRun {
  id: string;
  status: string;
  position_count: number;
  decision_verdict: string | null;
  created_at: string;
}

// ── Audit Lab ─────────────────────────────────────────────────────────────────

export interface AuditDataset {
  dataset_id: string;
  name: string;
  row_count: number;
  currency_pairs_detected: string[];
  period_start: string | null;
  period_end: string | null;
  source_hash: string;
  created_at: string;
}

export interface AuditRunSummary {
  run_id: string;
  dataset_id: string;
  status: string;
  methodology_version: string;
  run_hash: string;
  inputs_hash: string;
  outputs_hash: string;
  created_at: string;
}

export interface AuditFinding {
  finding_type: "MARKUP" | "FEE" | "UNHEDGED_IMPACT";
  currency_pair: string | null;
  counterparty: string | null;
  amount_usd: number;
  status: string;
  narrative: string | null;
}

export interface AuditRunDetail extends AuditRunSummary {
  findings: AuditFinding[];
  markup_total_usd: number;
  fee_total_usd: number;
  unhedged_impact_usd: number;
  trace_bundle: Record<string, unknown>;
}

// ── Decision Desk ─────────────────────────────────────────────────────────────

export type DecisionAction =
  | "HEDGE_IMMEDIATE"
  | "HEDGE_STAGED"
  | "REDUCE_RATIO"
  | "NO_ACTION";

export interface DecisionProposal {
  proposal_id: string;
  currency_pair: string;
  net_usd: number;
  action: DecisionAction;
  instrument: string;
  side: string;
  notional_usd: number;
  hedge_ratio: number;
  cost_pct: number;
  rationale: string;
  staged_schedule?: Array<{ tenor_days: number; notional_usd: number }>;
}

export interface DecisionPacket {
  packet_id: string;
  proposal_id: string;
  packet_hash: string;
  ibkr_payload: Record<string, unknown>;
}

export interface DecisionRun {
  run_id: string;
  run_hash: string;
  inputs_hash: string;
  outputs_hash: string;
  proposals: DecisionProposal[];
  packets: DecisionPacket[];
  verdict: string;
  created_at: string;
}

// ── Proposals (execution) ─────────────────────────────────────────────────────

export type ProposalStatus =
  | "PROPOSED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN"
  | "EXECUTED";

export interface ExecutionProposal {
  id: string;
  position_id: string;
  status: ProposalStatus;
  execution_ref: string | null;
  proposal_payload: Record<string, unknown>;
  approver_notes: string | null;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  plan_tier: PlanTier;
  user_count: number;
  position_count: number;
  run_count: number;
  created_at: string;
  is_active: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  company_id: string | null;
  company_name: string | null;
  roles: string[];
  plan_tier: PlanTier;
  is_active: boolean;
  is_superuser: boolean;
  mfa_enabled: boolean;
  last_login: string | null;
  created_at: string;
}

// ── Policies ─────────────────────────────────────────────────────────────────

export interface PolicyTemplate {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  currency_pairs: string[];
  created_at: string;
}

export interface PolicyInstance {
  id: string;
  template_id: string;
  branch_id: string;
  active_since: string;
  revision_id: string;
}

// ── API Error ─────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errorCode?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
