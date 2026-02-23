/**
 * reportTypes.ts — Canonical Report System Data Model
 *
 * Covers: ReportTemplate, ReportDefinition, ReportRun, ReportSection,
 * ExportArtifact, and all supporting types.
 *
 * Principles:
 * - Deterministic: same inputs → same output hash
 * - Audit-safe: every run records who, what data, what policy, which assumptions
 * - Version-stable: templates are versioned, old runs reference frozen template versions
 * - Multi-module: sections span Dashboard, Position Desk, Policy, Execution, Scenario, FX, Macro
 */

// ─── Section Types ─────────────────────────────────────────────────────────────

export type SectionType =
  | "EXECUTIVE_SUMMARY"
  | "HEDGE_PLAN_TABLE"
  | "EXPOSURE_DECOMPOSITION"
  | "SCENARIO_SENSITIVITY"
  | "POLICY_COMPLIANCE"
  | "HEDGE_EFFICIENCY"
  | "FORWARD_CURVE"
  | "CONNECTOR_HEALTH"
  | "DATA_QUALITY"
  | "POSITION_REGISTER"
  | "EXECUTION_LOG"
  | "APPROVAL_CHAIN"
  | "POLICY_RATIONALE"
  | "STRESS_TEST_RESULTS"
  | "MACRO_OVERLAY"
  | "AUDIT_EVENTS"
  | "DISCLOSURES"
  | "ASSUMPTIONS_REGISTRY"
  | "COVER_PAGE"
  | "TABLE_OF_CONTENTS"
  | "CUSTOM_NARRATIVE";

export type SectionStatus = "INCLUDED" | "EXCLUDED" | "DRAFT";

export interface SectionParam {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "select" | "currency";
  value: string | number | boolean;
  options?: string[];
}

export interface ReportSection {
  id: string;                          // uuid
  type: SectionType;
  title: string;
  order: number;
  status: SectionStatus;
  params: SectionParam[];
  narrative?: string;                  // AI-assisted narrative — always labeled
  ai_assisted: boolean;
  citations: string[];                 // ["run_id:xxx", "snapshot_id:yyy", "policy_v:2"]
  page_break_before: boolean;
}

// ─── Module Coverage ───────────────────────────────────────────────────────────

export type ReportModule =
  | "DASHBOARD"
  | "POSITION_DESK"
  | "POLICY_ENGINE"
  | "EXECUTION"
  | "SCENARIO_STRESS"
  | "FX_RATES"
  | "CONNECTOR_HEALTH"
  | "MACRO_OVERLAY"
  | "AUDIT_COMPLIANCE";

// ─── Template ─────────────────────────────────────────────────────────────────

export type ReportCategory =
  | "EXECUTIVE_BOARD"
  | "TREASURY_FX"
  | "RISK_COMMITTEE"
  | "POLICY_PACK"
  | "EXECUTION_PACK"
  | "SCENARIO_STRESS"
  | "EXPOSURE_DECOMP"
  | "DATA_QUALITY"
  | "CONNECTOR_HEALTH"
  | "COMPLIANCE_AUDIT";

export type ReportAudience =
  | "BOARD"
  | "CFO"
  | "TREASURER"
  | "RISK_COMMITTEE"
  | "AUDIT"
  | "TRADER"
  | "ANALYST"
  | "REGULATOR";

export type ExportFormat = "PDF" | "EXCEL" | "POWERPOINT" | "HTML" | "JSON" | "CSV" | "ZIP_COMMITTEE";

export interface ReportTemplate {
  template_id: string;
  version: number;                     // template schema version — frozen on publish
  name: string;
  short_name: string;
  description: string;
  category: ReportCategory;
  audience: ReportAudience[];
  modules: ReportModule[];
  default_sections: Omit<ReportSection, "id">[];
  required_inputs: string[];           // e.g. ["run_envelope_id", "policy_id", "market_snapshot_id"]
  default_export_format: ExportFormat;
  is_system: boolean;
  tags: string[];
  estimated_pages: number;
  created_at: string;
  updated_at: string;
}

// ─── Report Definition (user-configured) ──────────────────────────────────────

export type ReportStatus = "DRAFT" | "REVIEW" | "APPROVED" | "FINAL" | "ARCHIVED";

export interface DataBindings {
  run_envelope_id?: string;
  portfolio_snapshot_id?: string;
  market_snapshot_id?: string;
  policy_id?: string;
  policy_version?: number;
  connector_run_ids?: string[];
  scenario_pack?: string;
  as_of_date?: string;
  reporting_currency?: string;        // default "USD"
  period_start?: string;
  period_end?: string;
}

export interface ReportDefinition {
  report_id: string;
  template_id: string;
  template_version: number;           // locked snapshot of template version
  name: string;
  description: string;
  owner: string;                      // user email/id
  tenant_id: string;
  status: ReportStatus;
  sections: ReportSection[];
  bindings: DataBindings;
  export_formats: ExportFormat[];
  schedule?: ReportSchedule;
  tags: string[];
  version: number;                    // report definition version
  parent_report_id?: string;          // for clones
  ai_plan?: AIReportPlan;
  created_at: string;
  updated_at: string;
  last_run_id?: string;
}

// ─── Report Run (generated instance) ──────────────────────────────────────────

export type RunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface ReportRun {
  run_id: string;
  report_id: string;
  template_id: string;
  template_version: number;
  status: RunStatus;
  triggered_by: string;
  started_at: string;
  completed_at?: string;
  inputs_hash: string;                // SHA-256 of bindings → determinism guarantee
  outputs_hash?: string;             // SHA-256 of rendered output
  section_count: number;
  page_count?: number;
  validation_warnings: string[];
  validation_errors: string[];
  artifacts: ExportArtifact[];
  bindings_snapshot: DataBindings;   // frozen copy at run time
  created_at: string;
}

// ─── Export Artifact ──────────────────────────────────────────────────────────

export interface ExportArtifact {
  artifact_id: string;
  run_id: string;
  format: ExportFormat;
  filename: string;
  size_bytes?: number;
  url?: string;                       // signed object storage URL
  expires_at?: string;
  created_at: string;
}

// ─── AI Report Plan ───────────────────────────────────────────────────────────

export type AIReportGoal =
  | "BOARD_UPDATE"
  | "AUDIT_PACK"
  | "FX_HEDGE_RATIONALE"
  | "STRESS_SUMMARY"
  | "POLICY_REVIEW"
  | "EXECUTION_SUMMARY"
  | "RISK_COMMITTEE_PACK"
  | "QUARTERLY_TREASURY"
  | "CUSTOM";

export interface AIReportPlan {
  plan_id: string;
  goal: AIReportGoal;
  goal_description: string;          // user's free-text intent
  selected_modules: ReportModule[];
  proposed_sections: Omit<ReportSection, "id">[];
  narrative_scaffolds: Record<string, string>; // section_type → AI-generated narrative
  disclosures_generated: string[];
  citations: string[];
  model_version: string;
  generated_at: string;
  is_ai_assisted: true;
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export type ScheduleFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ON_DEMAND";

export interface ReportSchedule {
  frequency: ScheduleFrequency;
  next_run_at?: string;
  recipients: string[];              // email list
  auto_export_format: ExportFormat;
  active: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface ReportValidationIssue {
  code: string;
  severity: ValidationSeverity;
  section_id?: string;
  message: string;
  suggestion?: string;
}

export interface ReportValidationResult {
  is_valid: boolean;
  issues: ReportValidationIssue[];
  stale_bindings: string[];
  missing_required: string[];
  checked_at: string;
}

// ─── Governance / Disclosures ─────────────────────────────────────────────────

export interface DisclosureEntry {
  id: string;
  category: "REGULATORY" | "METHODOLOGY" | "DATA" | "LIMITATION" | "LEGAL";
  text: string;
  applies_to: SectionType[];
  mandatory: boolean;
}

export interface AssumptionEntry {
  id: string;
  label: string;
  value: string;
  source: string;                    // e.g. "Policy v2 §4.2", "IFRS 9.B6.5.4"
  applies_to: SectionType[];
}

// ─── RBAC ─────────────────────────────────────────────────────────────────────

export type ReportRole = "VIEWER" | "EDITOR" | "APPROVER" | "ADMIN";

export interface ReportAccess {
  report_id: string;
  user_id: string;
  role: ReportRole;
  granted_at: string;
  granted_by: string;
}

// ─── Builder UI State ─────────────────────────────────────────────────────────

export type BuilderStep = "PRESET" | "CONFIGURE" | "BIND" | "AI_ASSIST" | "PREVIEW" | "EXPORT";

export interface BuilderState {
  step: BuilderStep;
  definition: Partial<ReportDefinition>;
  validation?: ReportValidationResult;
  ai_plan?: AIReportPlan;
  is_dirty: boolean;
  last_saved?: string;
}
