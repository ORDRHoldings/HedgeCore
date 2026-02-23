/**
 * reportPresets.ts — ORDR Report Studio Preset Library
 *
 * 30 institutional-grade presets across 10 categories.
 * Each preset defines purpose, audience, required inputs, sections, and defaults.
 * Templates are version-frozen: template_version is bumped on schema changes.
 */

import type { ReportTemplate, ReportSection, SectionType, ReportCategory, ReportAudience, ReportModule, ExportFormat } from "../types/reportTypes";

// ─── Section factory ───────────────────────────────────────────────────────────

let _sectionSeq = 0;
function sec(
  type: SectionType,
  title: string,
  overrides: Partial<Omit<ReportSection, "id" | "type" | "title" | "order">> = {}
): Omit<ReportSection, "id"> {
  return {
    type,
    title,
    order: _sectionSeq++,
    status: "INCLUDED",
    params: [],
    ai_assisted: false,
    citations: [],
    page_break_before: false,
    ...overrides,
  };
}

// Reset seq between presets
function resetSeq() { _sectionSeq = 0; }

// ─── Template factory ──────────────────────────────────────────────────────────

function tmpl(
  template_id: string,
  name: string,
  short_name: string,
  description: string,
  category: ReportCategory,
  audience: ReportAudience[],
  modules: ReportModule[],
  sections: Omit<ReportSection, "id">[],
  opts: {
    required_inputs?: string[];
    export?: ExportFormat;
    tags?: string[];
    pages?: number;
  } = {}
): ReportTemplate {
  return {
    template_id,
    version: 1,
    name,
    short_name,
    description,
    category,
    audience,
    modules,
    default_sections: sections,
    required_inputs: opts.required_inputs ?? ["run_envelope_id", "policy_id"],
    default_export_format: opts.export ?? "PDF",
    is_system: true,
    tags: opts.tags ?? [],
    estimated_pages: opts.pages ?? 6,
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-02-22T00:00:00Z",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 1 — EXECUTIVE / BOARD PACK
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T01_BOARD_PACK = tmpl(
  "RPT-001", "Board FX Risk Pack", "Board Pack",
  "Quarterly board-level FX risk summary. Covers portfolio exposure, hedge ratios, stress scenarios, policy compliance, and forward curve outlook. Non-technical narrative with executive KPIs.",
  "EXECUTIVE_BOARD",
  ["BOARD", "CFO"],
  ["DASHBOARD", "POSITION_DESK", "POLICY_ENGINE", "SCENARIO_STRESS", "FX_RATES"],
  [
    sec("COVER_PAGE", "Cover Page", { page_break_before: false }),
    sec("TABLE_OF_CONTENTS", "Table of Contents"),
    sec("EXECUTIVE_SUMMARY", "Executive Summary", { ai_assisted: true }),
    sec("EXPOSURE_DECOMPOSITION", "FX Exposure Overview"),
    sec("HEDGE_PLAN_TABLE", "Hedge Position Summary"),
    sec("SCENARIO_SENSITIVITY", "Stress Scenario Results"),
    sec("POLICY_COMPLIANCE", "Policy Compliance Status"),
    sec("DISCLOSURES", "Disclosures & Assumptions"),
  ],
  { required_inputs: ["run_envelope_id", "policy_id", "market_snapshot_id"], pages: 12, export: "PDF", tags: ["board", "quarterly", "executive"] }
);

resetSeq();
const T02_CFO_DASHBOARD = tmpl(
  "RPT-002", "CFO Monthly Dashboard", "CFO Dashboard",
  "Monthly one-pager for CFO: net FX exposure, hedge effectiveness, cash flow forecast sensitivity, and top risks. Dense KPI grid, minimal narrative.",
  "EXECUTIVE_BOARD",
  ["CFO", "TREASURER"],
  ["DASHBOARD", "POSITION_DESK", "FX_RATES", "SCENARIO_STRESS"],
  [
    sec("COVER_PAGE", "Cover Page"),
    sec("EXECUTIVE_SUMMARY", "CFO Summary KPIs", { ai_assisted: true }),
    sec("EXPOSURE_DECOMPOSITION", "Net FX Exposure by Currency"),
    sec("HEDGE_PLAN_TABLE", "Hedge Plan vs Target Ratios"),
    sec("FORWARD_CURVE", "Forward Curve & Carry Cost"),
    sec("SCENARIO_SENSITIVITY", "Stress: 1σ / 2σ / 3σ Impact"),
    sec("DISCLOSURES", "Methodology Notes"),
  ],
  { pages: 4, export: "PDF", tags: ["cfo", "monthly", "kpi"] }
);

resetSeq();
const T03_ANNUAL_BOARD = tmpl(
  "RPT-003", "Annual Board Risk Review", "Annual Review",
  "Full-year FX risk governance review for board approval. Includes policy change log, hedge accounting summary, YTD execution performance, and regulatory alignment statement.",
  "EXECUTIVE_BOARD",
  ["BOARD", "CFO", "AUDIT"],
  ["DASHBOARD", "POLICY_ENGINE", "EXECUTION", "AUDIT_COMPLIANCE"],
  [
    sec("COVER_PAGE", "Cover Page"),
    sec("TABLE_OF_CONTENTS", "Contents"),
    sec("EXECUTIVE_SUMMARY", "Year in Review", { ai_assisted: true }),
    sec("POLICY_RATIONALE", "Policy Changes & Rationale"),
    sec("EXPOSURE_DECOMPOSITION", "Full-Year Exposure Analysis"),
    sec("HEDGE_PLAN_TABLE", "Hedge Execution Summary"),
    sec("HEDGE_EFFICIENCY", "Hedge Effectiveness (IAS 39 / IFRS 9)"),
    sec("AUDIT_EVENTS", "Governance & Audit Events"),
    sec("ASSUMPTIONS_REGISTRY", "Assumptions Registry"),
    sec("DISCLOSURES", "Regulatory Disclosures"),
  ],
  { pages: 20, export: "PDF", tags: ["annual", "board", "governance", "ifrs9"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 2 — TREASURY FX HEDGE PACK
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T04_HEDGE_PLAN = tmpl(
  "RPT-004", "FX Hedge Plan Report", "Hedge Plan",
  "Full hedge plan for the current run: exposure buckets, hedge actions, forward rates, carry costs, residual exposure. Primary working document for Treasury.",
  "TREASURY_FX",
  ["TREASURER", "TRADER", "CFO"],
  ["POSITION_DESK", "FX_RATES", "EXECUTION"],
  [
    sec("COVER_PAGE", "Cover Page"),
    sec("EXECUTIVE_SUMMARY", "Plan Summary"),
    sec("EXPOSURE_DECOMPOSITION", "Exposure by Bucket & Currency"),
    sec("HEDGE_PLAN_TABLE", "Hedge Actions Required"),
    sec("FORWARD_CURVE", "Forward Rates & Carry Cost"),
    sec("POLICY_COMPLIANCE", "Policy Constraint Check"),
    sec("DISCLOSURES", "Disclosures"),
  ],
  { required_inputs: ["run_envelope_id", "policy_id", "market_snapshot_id"], pages: 8, export: "PDF", tags: ["hedge", "plan", "treasury"] }
);

resetSeq();
const T05_HEDGE_EFFICIENCY = tmpl(
  "RPT-005", "Hedge Effectiveness Report", "Hedge Effectiveness",
  "IFRS 9 / IAS 39 hedge effectiveness assessment. Covers prospective and retrospective tests, dollar-offset ratios, and effectiveness band compliance.",
  "TREASURY_FX",
  ["CFO", "AUDIT", "TREASURER"],
  ["POSITION_DESK", "FX_RATES"],
  [
    sec("COVER_PAGE", "Cover Page"),
    sec("EXECUTIVE_SUMMARY", "Effectiveness Summary"),
    sec("HEDGE_EFFICIENCY", "Hedge Effectiveness Analysis (IFRS 9.6.4.1)"),
    sec("HEDGE_PLAN_TABLE", "Hedged Notionals vs Exposure"),
    sec("ASSUMPTIONS_REGISTRY", "Assumptions: Proxy Rates & Materiality"),
    sec("DISCLOSURES", "IFRS 9 Compliance Disclosures"),
  ],
  { pages: 6, export: "PDF", tags: ["ifrs9", "effectiveness", "hedge", "accounting"] }
);

resetSeq();
const T06_FORWARD_CURVE = tmpl(
  "RPT-006", "Forward Curve & Carry Analysis", "Forward Curve",
  "Detailed forward curve report for up to 12M tenors. Shows points, all-in rates, annualised carry costs, and source (live vs indicative).",
  "TREASURY_FX",
  ["TREASURER", "TRADER"],
  ["FX_RATES"],
  [
    sec("FORWARD_CURVE", "Forward Curve Table & Chart"),
    sec("HEDGE_PLAN_TABLE", "All-In Rate Comparison"),
    sec("DISCLOSURES", "Data Source Disclosures"),
  ],
  { required_inputs: ["market_snapshot_id"], pages: 3, export: "EXCEL", tags: ["forward", "curve", "carry", "fx"] }
);

resetSeq();
const T07_EXPOSURE_DECOMP = tmpl(
  "RPT-007", "Exposure Decomposition Report", "Exposure Decomp",
  "Full exposure breakdown by currency, bucket (month), flow type (AR/AP), entity, and status (CONFIRMED/FORECAST). Includes netting analysis.",
  "EXPOSURE_DECOMP",
  ["TREASURER", "RISK_COMMITTEE", "ANALYST"],
  ["POSITION_DESK"],
  [
    sec("EXPOSURE_DECOMPOSITION", "Exposure by Currency & Tenor"),
    sec("POSITION_REGISTER", "Full Position Register"),
    sec("HEDGE_PLAN_TABLE", "Net Positions After Netting"),
    sec("DISCLOSURES", "Netting & Materiality Assumptions"),
  ],
  { required_inputs: ["run_envelope_id", "portfolio_snapshot_id"], pages: 6, export: "EXCEL", tags: ["exposure", "decomp", "positions"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 3 — RISK COMMITTEE PACK
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T08_RISK_COMMITTEE = tmpl(
  "RPT-008", "Risk Committee Pack", "Risk Committee",
  "Monthly risk committee pack. Covers VaR/stress impact, policy compliance scorecard, hedge ratio trend, scenario sensitivity matrix, and top risk flags.",
  "RISK_COMMITTEE",
  ["RISK_COMMITTEE", "CFO", "BOARD"],
  ["DASHBOARD", "SCENARIO_STRESS", "POLICY_ENGINE", "FX_RATES"],
  [
    sec("COVER_PAGE", "Cover Page"),
    sec("TABLE_OF_CONTENTS", "Contents"),
    sec("EXECUTIVE_SUMMARY", "Risk Summary", { ai_assisted: true }),
    sec("SCENARIO_SENSITIVITY", "Stress Scenario Matrix"),
    sec("STRESS_TEST_RESULTS", "Stress Test Results (BCBS FRTB §MAR23)"),
    sec("POLICY_COMPLIANCE", "Policy Compliance Scorecard"),
    sec("HEDGE_EFFICIENCY", "Hedge Effectiveness KPIs"),
    sec("MACRO_OVERLAY", "Macro & Geopolitical Risk Overlay"),
    sec("DISCLOSURES", "Methodology & Disclosures"),
  ],
  { pages: 14, export: "ZIP_COMMITTEE", tags: ["risk", "committee", "stress", "var"] }
);

resetSeq();
const T09_STRESS_DEEP_DIVE = tmpl(
  "RPT-009", "Stress Test Deep-Dive", "Stress Deep-Dive",
  "Full stress test report across all scenario packs (MILD/MODERATE/SEVERE/TAIL) with calibration to historical crises. Includes P&L impact by bucket.",
  "RISK_COMMITTEE",
  ["RISK_COMMITTEE", "CFO", "ANALYST"],
  ["SCENARIO_STRESS", "FX_RATES"],
  [
    sec("EXECUTIVE_SUMMARY", "Stress Summary"),
    sec("STRESS_TEST_RESULTS", "Scenario Pack Results"),
    sec("SCENARIO_SENSITIVITY", "Sensitivity Matrix by Sigma"),
    sec("HEDGE_EFFICIENCY", "Hedge Benefit Under Stress"),
    sec("ASSUMPTIONS_REGISTRY", "Scenario Calibration Assumptions"),
    sec("DISCLOSURES", "Stress Test Methodology"),
  ],
  { required_inputs: ["run_envelope_id", "market_snapshot_id"], pages: 10, export: "PDF", tags: ["stress", "var", "scenarios", "bcbs"] }
);

resetSeq();
const T10_VaR_REPORT = tmpl(
  "RPT-010", "VaR & CVaR Report", "VaR / CVaR",
  "Value-at-Risk and Conditional VaR report. 95th / 99th confidence intervals. Hedged vs unhedged P&L distribution across scenario sigmas.",
  "RISK_COMMITTEE",
  ["RISK_COMMITTEE", "CFO", "REGULATOR"],
  ["SCENARIO_STRESS"],
  [
    sec("EXECUTIVE_SUMMARY", "VaR Summary KPIs"),
    sec("SCENARIO_SENSITIVITY", "P&L Distribution (1σ–3σ)"),
    sec("STRESS_TEST_RESULTS", "CVaR at 95% / 99%"),
    sec("HEDGE_EFFICIENCY", "Hedge Benefit vs Unhedged VaR"),
    sec("DISCLOSURES", "VaR Methodology Disclosures"),
  ],
  { pages: 5, export: "PDF", tags: ["var", "cvar", "risk", "distribution"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 4 — POLICY PACK
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T11_POLICY_RATIONALE = tmpl(
  "RPT-011", "Policy Rationale & Approval Pack", "Policy Rationale",
  "Full documentation pack for a hedge policy: rationale, instrument eligibility, constraints, approval chain, and regulatory alignment (IFRS 9, BCBS FRTB).",
  "POLICY_PACK",
  ["BOARD", "CFO", "AUDIT", "REGULATOR"],
  ["POLICY_ENGINE"],
  [
    sec("COVER_PAGE", "Cover Page"),
    sec("POLICY_RATIONALE", "Policy Rationale & Objectives"),
    sec("POLICY_COMPLIANCE", "Policy Constraints & Limits"),
    sec("APPROVAL_CHAIN", "Governance & Approval Chain"),
    sec("ASSUMPTIONS_REGISTRY", "Policy Assumptions Registry"),
    sec("DISCLOSURES", "Regulatory Alignment Disclosures"),
  ],
  { required_inputs: ["policy_id", "policy_version"], pages: 8, export: "PDF", tags: ["policy", "rationale", "governance", "ifrs9", "bcbs"] }
);

resetSeq();
const T12_POLICY_CHANGE_LOG = tmpl(
  "RPT-012", "Policy Change Log", "Policy Change Log",
  "Chronological log of all policy versions, changes, approvals, and rationale. Version-diff included. Audit-safe.",
  "POLICY_PACK",
  ["AUDIT", "CFO", "RISK_COMMITTEE"],
  ["POLICY_ENGINE", "AUDIT_COMPLIANCE"],
  [
    sec("POLICY_RATIONALE", "Policy Version History"),
    sec("AUDIT_EVENTS", "Change Events & Approvals"),
    sec("DISCLOSURES", "Change Control Disclosures"),
  ],
  { required_inputs: ["policy_id"], pages: 4, export: "PDF", tags: ["policy", "change", "audit", "version"] }
);

resetSeq();
const T13_POLICY_SCORECARD = tmpl(
  "RPT-013", "Policy Compliance Scorecard", "Policy Scorecard",
  "Real-time policy compliance check for current run: hedge ratio vs target, instrument eligibility, concentration limits, cost budget, IFRS 9 alignment.",
  "POLICY_PACK",
  ["TREASURER", "RISK_COMMITTEE", "ANALYST"],
  ["POLICY_ENGINE", "POSITION_DESK"],
  [
    sec("EXECUTIVE_SUMMARY", "Compliance Summary"),
    sec("POLICY_COMPLIANCE", "Policy Scorecard — All Constraints"),
    sec("HEDGE_PLAN_TABLE", "Hedge Ratio vs Policy Target"),
    sec("DISCLOSURES", "Compliance Methodology"),
  ],
  { required_inputs: ["run_envelope_id", "policy_id"], pages: 4, export: "PDF", tags: ["compliance", "scorecard", "policy"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 5 — EXECUTION PACK
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T14_EXECUTION_LOG = tmpl(
  "RPT-014", "Execution Log Report", "Execution Log",
  "Full trade execution log: ticket reference, instrument, counterparty, rate, settlement date, status, and approval chain. Hash-verified.",
  "EXECUTION_PACK",
  ["TREASURER", "TRADER", "AUDIT"],
  ["EXECUTION"],
  [
    sec("EXECUTION_LOG", "Trade Execution Log"),
    sec("APPROVAL_CHAIN", "Approval Chain per Trade"),
    sec("AUDIT_EVENTS", "Execution Audit Events"),
    sec("DISCLOSURES", "Execution Disclosures"),
  ],
  { required_inputs: ["connector_run_ids"], pages: 5, export: "EXCEL", tags: ["execution", "trades", "audit"] }
);

resetSeq();
const T15_SETTLEMENT_REPORT = tmpl(
  "RPT-015", "Settlement & Reconciliation Report", "Settlement Recon",
  "Settlement status report: open, pending, settled, and failed items. Reconciles hedge notionals against confirmed settlements.",
  "EXECUTION_PACK",
  ["TREASURER", "TRADER"],
  ["EXECUTION", "POSITION_DESK"],
  [
    sec("EXECUTION_LOG", "Settlement Status Register"),
    sec("HEDGE_PLAN_TABLE", "Notional Reconciliation"),
    sec("DISCLOSURES", "Settlement Methodology"),
  ],
  { pages: 4, export: "EXCEL", tags: ["settlement", "reconciliation"] }
);

resetSeq();
const T16_PIPELINE_STATUS = tmpl(
  "RPT-016", "Pipeline & Approval Status", "Pipeline Status",
  "Current state of the execution pipeline: proposals pending, in staging, approved, and executed. Includes SLA tracking.",
  "EXECUTION_PACK",
  ["TREASURER", "RISK_COMMITTEE"],
  ["EXECUTION"],
  [
    sec("EXECUTION_LOG", "Pipeline Status by Stage"),
    sec("APPROVAL_CHAIN", "Approval Queue & SLAs"),
    sec("DISCLOSURES", "Workflow Definitions"),
  ],
  { pages: 3, export: "PDF", tags: ["pipeline", "approval", "workflow"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 6 — SCENARIO & STRESS PACK
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T17_SCENARIO_PACK = tmpl(
  "RPT-017", "Scenario Sensitivity Pack", "Scenario Pack",
  "Multi-scenario sensitivity pack: P&L impact across 1σ–3σ spot shocks. Hedged vs unhedged. Bucket-level decomposition.",
  "SCENARIO_STRESS",
  ["RISK_COMMITTEE", "CFO", "TREASURER"],
  ["SCENARIO_STRESS", "FX_RATES"],
  [
    sec("EXECUTIVE_SUMMARY", "Scenario Summary"),
    sec("SCENARIO_SENSITIVITY", "Sensitivity Matrix (1σ / 2σ / 3σ)"),
    sec("STRESS_TEST_RESULTS", "Bucket-Level Stress Decomposition"),
    sec("HEDGE_EFFICIENCY", "Hedge Benefit Under Each Scenario"),
    sec("DISCLOSURES", "Scenario Calibration Disclosures"),
  ],
  { required_inputs: ["run_envelope_id", "market_snapshot_id"], pages: 8, export: "PDF", tags: ["scenario", "sensitivity", "stress"] }
);

resetSeq();
const T18_CRISIS_STRESS = tmpl(
  "RPT-018", "Historical Crisis Stress Test", "Crisis Stress",
  "Stress test calibrated to historical FX crises: 1994 Tequila, 2018 BRL/TRY, 2020 COVID, 2022 Russia/Ukraine. Portfolio impact under each.",
  "SCENARIO_STRESS",
  ["RISK_COMMITTEE", "BOARD", "CFO"],
  ["SCENARIO_STRESS"],
  [
    sec("EXECUTIVE_SUMMARY", "Crisis Stress Summary"),
    sec("STRESS_TEST_RESULTS", "Impact: 1994 Tequila Crisis"),
    sec("STRESS_TEST_RESULTS", "Impact: 2018 EM Currency Crisis"),
    sec("STRESS_TEST_RESULTS", "Impact: 2020 COVID Shock"),
    sec("STRESS_TEST_RESULTS", "Impact: 2022 Russia/Ukraine"),
    sec("ASSUMPTIONS_REGISTRY", "Calibration Sources"),
    sec("DISCLOSURES", "Methodology & Limitations"),
  ],
  { pages: 10, export: "PDF", tags: ["crisis", "historical", "stress", "tequila", "covid"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 7 — DATA QUALITY / INGESTION RECONCILIATION
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T19_DATA_QUALITY = tmpl(
  "RPT-019", "Data Quality & Ingestion Report", "Data Quality",
  "Ingestion quality report: total rows, validation errors, rejected rows, duplicate check, field completeness, and source breakdown.",
  "DATA_QUALITY",
  ["ANALYST", "TREASURER", "AUDIT"],
  ["POSITION_DESK", "CONNECTOR_HEALTH"],
  [
    sec("DATA_QUALITY", "Ingestion Quality Summary"),
    sec("POSITION_REGISTER", "Validated Position Register"),
    sec("AUDIT_EVENTS", "Ingestion Audit Events"),
    sec("DISCLOSURES", "Data Quality Standards"),
  ],
  { required_inputs: ["connector_run_ids"], pages: 5, export: "EXCEL", tags: ["data", "quality", "ingestion", "validation"] }
);

resetSeq();
const T20_RECONCILIATION = tmpl(
  "RPT-020", "Position Reconciliation Report", "Reconciliation",
  "Reconciles positions across ingestion sources (CSV, ERP, Accounting, Database). Highlights discrepancies, duplicate records, and unmatched items.",
  "DATA_QUALITY",
  ["ANALYST", "TREASURER"],
  ["POSITION_DESK", "CONNECTOR_HEALTH"],
  [
    sec("DATA_QUALITY", "Source Comparison Table"),
    sec("POSITION_REGISTER", "Matched vs Unmatched Positions"),
    sec("DISCLOSURES", "Reconciliation Methodology"),
  ],
  { required_inputs: ["connector_run_ids", "portfolio_snapshot_id"], pages: 4, export: "EXCEL", tags: ["reconciliation", "positions"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 8 — CONNECTOR HEALTH / DATA LINEAGE
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T21_CONNECTOR_HEALTH = tmpl(
  "RPT-021", "Connector Health Dashboard Report", "Connector Health",
  "Health status of all data connectors (CSV, ERP, Database, Accounting). Run history, error rates, last successful sync, and SLA status.",
  "CONNECTOR_HEALTH",
  ["ANALYST", "TREASURER"],
  ["CONNECTOR_HEALTH"],
  [
    sec("CONNECTOR_HEALTH", "Connector Status Overview"),
    sec("DATA_QUALITY", "Error Rate by Connector"),
    sec("AUDIT_EVENTS", "Connector Run History"),
    sec("DISCLOSURES", "Data Lineage Statement"),
  ],
  { required_inputs: ["connector_run_ids"], pages: 4, export: "PDF", tags: ["connectors", "health", "lineage", "erp"] }
);

resetSeq();
const T22_DATA_LINEAGE = tmpl(
  "RPT-022", "Data Lineage & Provenance Report", "Data Lineage",
  "Full audit trail of data from source to report: connector → ingestion batch → normalization → run_id → report_id. SSOT proof.",
  "CONNECTOR_HEALTH",
  ["AUDIT", "ANALYST"],
  ["CONNECTOR_HEALTH", "AUDIT_COMPLIANCE"],
  [
    sec("DATA_QUALITY", "Lineage Chain: Source → Report"),
    sec("AUDIT_EVENTS", "Processing Events"),
    sec("ASSUMPTIONS_REGISTRY", "Normalization Rules"),
    sec("DISCLOSURES", "Data Governance Statement"),
  ],
  { pages: 5, export: "PDF", tags: ["lineage", "provenance", "audit", "ssot"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 9 — COMPLIANCE & AUDIT PACK
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T23_AUDIT_PACK = tmpl(
  "RPT-023", "Full Audit Pack", "Audit Pack",
  "Complete audit-ready pack: all events, approvals, user actions, data imports, policy changes, and export history. Hash-linked for integrity.",
  "COMPLIANCE_AUDIT",
  ["AUDIT", "REGULATOR", "CFO"],
  ["AUDIT_COMPLIANCE", "EXECUTION", "POLICY_ENGINE"],
  [
    sec("COVER_PAGE", "Cover Page"),
    sec("TABLE_OF_CONTENTS", "Contents"),
    sec("AUDIT_EVENTS", "All Audit Events"),
    sec("APPROVAL_CHAIN", "Approval Chains"),
    sec("POLICY_RATIONALE", "Policy Governance Log"),
    sec("DATA_QUALITY", "Data Ingestion Audit"),
    sec("ASSUMPTIONS_REGISTRY", "All Assumptions"),
    sec("DISCLOSURES", "Regulatory Disclosures"),
  ],
  { pages: 18, export: "ZIP_COMMITTEE", tags: ["audit", "compliance", "governance", "regulatory"] }
);

resetSeq();
const T24_REGULATORY_REPORT = tmpl(
  "RPT-024", "Regulatory Alignment Report", "Regulatory Report",
  "Demonstrates alignment with IFRS 9, BCBS FRTB §MAR23, ISDA 2022, and local regulatory requirements. Not legal advice — methodology documentation.",
  "COMPLIANCE_AUDIT",
  ["CFO", "AUDIT", "REGULATOR"],
  ["POLICY_ENGINE", "EXECUTION", "SCENARIO_STRESS"],
  [
    sec("EXECUTIVE_SUMMARY", "Regulatory Alignment Summary", { ai_assisted: true }),
    sec("POLICY_RATIONALE", "IFRS 9.6.4.1 Hedge Documentation"),
    sec("HEDGE_EFFICIENCY", "IFRS 9 Effectiveness Test Results"),
    sec("STRESS_TEST_RESULTS", "BCBS FRTB §MAR23 Stress Tests"),
    sec("ASSUMPTIONS_REGISTRY", "Methodology Assumptions"),
    sec("DISCLOSURES", "Regulatory Scope Disclosures"),
  ],
  { pages: 10, export: "PDF", tags: ["regulatory", "ifrs9", "bcbs", "isda", "compliance"] }
);

resetSeq();
const T25_SOX_CONTROLS = tmpl(
  "RPT-025", "SOX Controls Evidence Pack", "SOX Controls",
  "Evidence pack for SOX / internal controls review: system access log, approval workflow, segregation of duties, and change management events.",
  "COMPLIANCE_AUDIT",
  ["AUDIT", "CFO"],
  ["AUDIT_COMPLIANCE"],
  [
    sec("AUDIT_EVENTS", "Access & Action Log"),
    sec("APPROVAL_CHAIN", "Segregation of Duties Evidence"),
    sec("POLICY_RATIONALE", "Change Management Log"),
    sec("DISCLOSURES", "SOX Control Framework"),
  ],
  { pages: 8, export: "PDF", tags: ["sox", "controls", "audit", "segregation"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORY 10 — MACRO OVERLAY / POLISOPHIC
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T26_MACRO_OVERLAY = tmpl(
  "RPT-026", "Macro & Geopolitical Risk Overlay", "Macro Overlay",
  "Polisophic intelligence overlay: key geopolitical events, central bank actions, and macro risk factors affecting FX exposure. Non-forecasting contextual report.",
  "RISK_COMMITTEE",
  ["RISK_COMMITTEE", "CFO", "BOARD"],
  ["MACRO_OVERLAY", "FX_RATES"],
  [
    sec("MACRO_OVERLAY", "Macro Risk Summary"),
    sec("SCENARIO_SENSITIVITY", "Macro Scenario Sensitivity"),
    sec("FORWARD_CURVE", "Central Bank & Rate Outlook"),
    sec("DISCLOSURES", "Macro Data Disclosures"),
  ],
  { required_inputs: ["market_snapshot_id"], pages: 5, export: "PDF", tags: ["macro", "geopolitical", "polisophic", "risk"] }
);

resetSeq();
const T27_COUNTRY_RISK = tmpl(
  "RPT-027", "Country FX Risk Report", "Country Risk",
  "Per-country FX exposure and risk profile: exposure size, instrument availability, NDF vs deliverable, political risk rating, and hedge cost.",
  "EXPOSURE_DECOMP",
  ["TREASURER", "RISK_COMMITTEE"],
  ["POSITION_DESK", "FX_RATES", "MACRO_OVERLAY"],
  [
    sec("EXPOSURE_DECOMPOSITION", "Exposure by Country / Currency"),
    sec("MACRO_OVERLAY", "Country Risk Ratings"),
    sec("FORWARD_CURVE", "NDF vs Deliverable Availability"),
    sec("DISCLOSURES", "Country Risk Methodology"),
  ],
  { pages: 6, export: "PDF", tags: ["country", "risk", "ndf", "geopolitical"] }
);

// ══════════════════════════════════════════════════════════════════════════════
// BONUS PRESETS — QUICK OPERATIONAL REPORTS
// ══════════════════════════════════════════════════════════════════════════════

resetSeq();
const T28_DAILY_TREASURY = tmpl(
  "RPT-028", "Daily Treasury Flash", "Daily Flash",
  "One-page daily treasury update: spot rate, net exposure change, new trades, hedge actions taken today. Intraday snapshot.",
  "TREASURY_FX",
  ["TREASURER", "TRADER"],
  ["FX_RATES", "POSITION_DESK", "EXECUTION"],
  [
    sec("EXECUTIVE_SUMMARY", "Daily Flash Summary"),
    sec("FORWARD_CURVE", "Today's Spot & Forward Rates"),
    sec("EXPOSURE_DECOMPOSITION", "Exposure Change vs Yesterday"),
    sec("EXECUTION_LOG", "Trades Executed Today"),
    sec("DISCLOSURES", "Data Sources & Disclaimers"),
  ],
  { pages: 2, export: "PDF", tags: ["daily", "flash", "intraday", "treasury"] }
);

resetSeq();
const T29_HEDGE_RATIO_TREND = tmpl(
  "RPT-029", "Hedge Ratio Trend Report", "Hedge Ratio Trend",
  "Period-over-period hedge ratio trend: confirmed and forecast hedge ratios vs policy target. Tracks drift from target over time.",
  "TREASURY_FX",
  ["TREASURER", "RISK_COMMITTEE"],
  ["POSITION_DESK", "POLICY_ENGINE"],
  [
    sec("HEDGE_EFFICIENCY", "Hedge Ratio vs Policy Target Trend"),
    sec("POLICY_COMPLIANCE", "Target Compliance Over Period"),
    sec("DISCLOSURES", "Hedge Ratio Definition"),
  ],
  { pages: 3, export: "EXCEL", tags: ["hedge", "ratio", "trend", "compliance"] }
);

resetSeq();
const T30_COMMITTEE_ZIP = tmpl(
  "RPT-030", "Risk Committee Committee Pack (ZIP)", "Committee ZIP",
  "Full committee ZIP bundle: Board Pack PDF + Hedge Plan XLSX + Risk Summary JSON + Disclosures PDF. One-click distribution.",
  "RISK_COMMITTEE",
  ["BOARD", "RISK_COMMITTEE", "CFO"],
  ["DASHBOARD", "POSITION_DESK", "POLICY_ENGINE", "SCENARIO_STRESS", "FX_RATES"],
  [
    sec("COVER_PAGE", "Cover Page"),
    sec("TABLE_OF_CONTENTS", "Contents"),
    sec("EXECUTIVE_SUMMARY", "Committee Summary", { ai_assisted: true }),
    sec("EXPOSURE_DECOMPOSITION", "Exposure Overview"),
    sec("HEDGE_PLAN_TABLE", "Hedge Plan"),
    sec("SCENARIO_SENSITIVITY", "Stress Scenarios"),
    sec("POLICY_COMPLIANCE", "Policy Compliance"),
    sec("MACRO_OVERLAY", "Macro Context"),
    sec("DISCLOSURES", "Full Disclosures"),
    sec("ASSUMPTIONS_REGISTRY", "Assumptions Registry"),
  ],
  { pages: 16, export: "ZIP_COMMITTEE", tags: ["committee", "zip", "bundle", "full"] }
);

// ─── Export catalog ────────────────────────────────────────────────────────────

export const REPORT_PRESETS: ReportTemplate[] = [
  T01_BOARD_PACK, T02_CFO_DASHBOARD, T03_ANNUAL_BOARD,
  T04_HEDGE_PLAN, T05_HEDGE_EFFICIENCY, T06_FORWARD_CURVE, T07_EXPOSURE_DECOMP,
  T08_RISK_COMMITTEE, T09_STRESS_DEEP_DIVE, T10_VaR_REPORT,
  T11_POLICY_RATIONALE, T12_POLICY_CHANGE_LOG, T13_POLICY_SCORECARD,
  T14_EXECUTION_LOG, T15_SETTLEMENT_REPORT, T16_PIPELINE_STATUS,
  T17_SCENARIO_PACK, T18_CRISIS_STRESS,
  T19_DATA_QUALITY, T20_RECONCILIATION,
  T21_CONNECTOR_HEALTH, T22_DATA_LINEAGE,
  T23_AUDIT_PACK, T24_REGULATORY_REPORT, T25_SOX_CONTROLS,
  T26_MACRO_OVERLAY, T27_COUNTRY_RISK,
  T28_DAILY_TREASURY, T29_HEDGE_RATIO_TREND, T30_COMMITTEE_ZIP,
];

// ─── Category metadata ─────────────────────────────────────────────────────────

export const REPORT_CATEGORIES: { key: string; label: string; count: number; description: string }[] = [
  { key: "EXECUTIVE_BOARD",   label: "Executive / Board",        count: 3,  description: "Board-level and C-suite FX risk summaries" },
  { key: "TREASURY_FX",       label: "Treasury FX Hedge",        count: 4,  description: "Hedge plans, effectiveness, forward curves" },
  { key: "RISK_COMMITTEE",    label: "Risk Committee",           count: 5,  description: "Risk committee packs, VaR, stress, macro" },
  { key: "POLICY_PACK",       label: "Policy Pack",              count: 3,  description: "Policy rationale, change logs, scorecards" },
  { key: "EXECUTION_PACK",    label: "Execution Pack",           count: 3,  description: "Trade logs, settlement, pipeline status" },
  { key: "SCENARIO_STRESS",   label: "Scenario & Stress",        count: 2,  description: "Stress tests, scenario sensitivity, VaR" },
  { key: "EXPOSURE_DECOMP",   label: "Exposure Decomposition",   count: 2,  description: "Currency, tenor, entity decompositions" },
  { key: "DATA_QUALITY",      label: "Data Quality / Ingestion", count: 2,  description: "Validation errors, reconciliation, quality" },
  { key: "CONNECTOR_HEALTH",  label: "Connector Health",         count: 2,  description: "ERP, CSV, DB connector run health & lineage" },
  { key: "COMPLIANCE_AUDIT",  label: "Compliance & Audit",       count: 4,  description: "IFRS 9, SOX, BCBS, regulatory, audit packs" },
];

export const ALL_REPORT_TAGS = [
  "board", "quarterly", "executive", "cfo", "monthly", "kpi",
  "hedge", "plan", "treasury", "ifrs9", "effectiveness", "accounting",
  "forward", "curve", "carry", "fx", "exposure", "decomp", "positions",
  "risk", "committee", "stress", "var", "bcbs", "scenario", "sensitivity",
  "policy", "rationale", "governance", "version", "compliance", "scorecard",
  "execution", "trades", "audit", "settlement", "reconciliation", "pipeline",
  "crisis", "historical", "covid", "tequila", "data", "quality", "ingestion",
  "validation", "connectors", "health", "lineage", "erp", "ssot",
  "regulatory", "isda", "sox", "controls", "segregation",
  "macro", "geopolitical", "polisophic", "country", "ndf",
  "daily", "flash", "intraday", "annual", "committee", "zip", "bundle",
];
