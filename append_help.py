"""Appends all missing HelpPanelConfig exports to helpContent.ts"""

NEW_CONTENT = r"""
// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — Institutional KPI Overview
// ─────────────────────────────────────────────────────────────────────────────

export const DASHBOARD_HELP: HelpPanelConfig = {
  pageTitle:    "Dashboard",
  pageSubtitle: "INSTITUTIONAL OVERVIEW · ROLE-BASED",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Dashboard is your institutional command centre. Role-based widgets surface the KPIs most relevant to your function: admins see team activity and system health; supervisors see pending approvals; risk analysts see open positions and calculation runs.\n\nWidgets are drag-and-drop resizable and persisted per user. Add or remove widgets via the + ADD WIDGET button. Click any KPI to drill through to the underlying module.",
    },
    {
      id:    "widgets",
      title: "Widget Reference",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "Open Positions",    type: "count",      description: "Number of FX positions in NEW or POLICY_ASSIGNED lifecycle states that require action. Excludes fully HEDGED and REJECTED positions.", example: "12 open", source: "position_desk" },
        { name: "Pending Approvals", type: "count",      description: "Staged artifacts awaiting 4-eyes sign-off. Includes calculation runs promoted to STAGING and policy activations pending supervisor approval.", example: "3 pending", source: "staging pipeline" },
        { name: "Hedge Coverage",    type: "percentage", description: "Portfolio-level hedge ratio: sum of hedged notional ÷ sum of total exposed notional. Target range is policy-dependent (e.g., FULL = 100%, SME = 80%).", example: "87.4%", source: "policy engine" },
        { name: "VaR (99%, 1d)",     type: "USD",        description: "1-day 99% Value-at-Risk across the live unhedged FX portfolio. Uses historical simulation over a 252-day lookback. Breaches trigger R6 (Liquidity) risk flag.", example: "$2.4M", source: "portfolio-risk" },
        { name: "Recent Runs",       type: "list",       description: "Last 10 calculation runs across all users. Shows run_id, status (PASS/FAIL/WARN), policy used, and timestamp. Click to open the full Run Viewer.", example: "RUN-00142 PASS", source: "calculation_runs table" },
        { name: "Active Policy",     type: "string",     description: "The currently activated company-wide hedge policy short name and version. Shown for quick reference — click to view the full policy card in the Policy Engine.", example: "BLNC v3", source: "policy_instances" },
      ],
    },
    {
      id:    "roles",
      title: "Role-Based Views",
      icon:  "⬡",
      type:  "workflow",
      steps: [
        { step: 1, label: "Admin",        description: "Sees: all widgets + system health, user activity, API key status, branch comparison, and full audit summary.", link: "/access-control" },
        { step: 2, label: "Supervisor",   description: "Sees: pending approvals queue, staging pipeline status, hedge coverage, and risk alerts requiring sign-off.", link: "/staging" },
        { step: 3, label: "Risk Analyst", description: "Sees: open positions, recent sandbox runs, market data snapshot, scenario P&L summary, and active policy card.", link: "/position-desk" },
      ],
    },
    {
      id:    "glossary",
      title: "Glossary",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "KPI Widget",       definition: "A configurable dashboard card displaying a single metric or list. State is persisted per user in localStorage. Supports resize and reorder via react-grid-layout." },
        { term: "4-Eyes Principle", definition: "Governance control requiring two distinct approvers for a sensitive action. In ORDR, all STAGING → LEDGER promotions require a supervisor sign-off different from the proposer." },
        { term: "Drill-Through",    definition: "Clicking a KPI navigates to the underlying data module. E.g., clicking 'Pending Approvals' navigates to the Staging Pipeline filtered to PENDING." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// INPUT — Hedge Engine Input / Position Upload
// ─────────────────────────────────────────────────────────────────────────────

export const INPUT_HELP: HelpPanelConfig = {
  pageTitle:    "Hedge Engine Input",
  pageSubtitle: "POSITION UPLOAD · POLICY BIND · RUN ENGINE",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position:    3,
        total:       7,
        label:       "Step 3 of 7 — Run Engine",
        description: "Input is the engine trigger. After loading positions (step 1) and market data (step 2), you bind a hedge policy and launch a deterministic calculation run. Output flows to Sandbox (step 4) for stress testing.",
        prev: { label: "Market Data", href: "/currency-fx" },
        next: { label: "Sandbox",     href: "/sandbox" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Input page is the calculation engine trigger. It takes three inputs — (1) a loaded set of FX positions, (2) a live market data snapshot, and (3) an active hedge policy — and executes a fully deterministic, auditable calculation run.\n\nEvery run produces a calculation_run record with a SHA-256 hash of all inputs. The run is reproducible at any future date given the same inputs. Results are visible in the Run Viewer and can be promoted to the Staging Pipeline for supervisor approval.",
    },
    {
      id:    "variables",
      title: "Input Parameters",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "hedge_plan",      type: "PositionSet",  description: "The set of FX positions loaded from the Position Desk. Includes currency pair, notional, direction (BUY/SELL), maturity date, and confirmation status (CONFIRMED/FORECAST).", example: "14 positions, MXN/USD", source: "position_desk → Redux" },
        { name: "market_snapshot", type: "RateSnapshot", description: "Point-in-time FX spot rates and forward curves fetched at calculation time. Immutably stored with the run for full reproducibility.", example: "USDMXN 18.42, captured 2026-02-25 09:00 UTC", source: "currency-fx module" },
        { name: "active_policy",   type: "PolicyConfig", description: "The hedge policy bound to this run. Contains hedge_ratios, cost_assumptions, execution_product, min_trade_size_usd, and bucket_mode. Policy version is pinned on the run record.", example: "BLNC v3 — confirmed 100%, forecast 50%", source: "policy_instances" },
        { name: "bucket_mode",     type: "enum",         description: "Controls how maturity buckets are formed. CALENDAR_MONTH groups by calendar month-end. ROLLING_30D groups by 30-day rolling windows from today.", example: "CALENDAR_MONTH", source: "policy_config" },
        { name: "run_id",          type: "UUID",         description: "System-generated UUID for this calculation run. Primary key for the calculation_runs table and the replay reference used in audit.", example: "RUN-00142", source: "auto-generated" },
      ],
    },
    {
      id:    "formulas",
      title: "Core Calculation Formulas",
      icon:  "∑",
      type:  "formula",
      formulas: [
        {
          label:       "Hedge Notional per Bucket",
          latex:       "N_h = N_e × r_{conf} × I_{confirmed} + N_e × r_{fcst} × (1 - I_{confirmed})",
          explanation: "Hedge notional is the exposed notional multiplied by the appropriate policy hedge ratio — confirmed ratio for firm flows, forecast ratio for estimated flows.",
          source:      "ORDR Engine v1 Kernel",
        },
        {
          label:       "All-In Forward Rate",
          latex:       "F_T = S_0 + fwd\\_pts_T",
          explanation: "The outright forward rate for tenor T equals the spot rate plus the forward points (carry) for that tenor. This is the contract rate for NDF or FX Forward execution.",
          source:      "Covered Interest Rate Parity (CIP)",
        },
        {
          label:       "Hedge Cost (bps)",
          latex:       "C = (spread\\_bps / 10000) × N_h × F_T",
          explanation: "The estimated transaction cost equals the policy spread assumption in basis points multiplied by the hedge notional and forward rate. Used for pre-trade cost analytics.",
          source:      "ORDR Engine cost_assumptions",
        },
      ],
    },
    {
      id:    "workflow",
      title: "How to run a calculation",
      icon:  "▶",
      type:  "workflow",
      steps: [
        { step: 1, label: "Load Positions",      description: "Navigate to Position Desk, upload your FX exposure CSV, confirm lifecycle transitions to POLICY_ASSIGNED.", link: "/position-desk" },
        { step: 2, label: "Fetch Market Data",   description: "Go to Currency FX, confirm spot rates and forward curve are live (green badge). Stale data shows a warning.", link: "/currency-fx" },
        { step: 3, label: "Bind Policy",         description: "In the Input page, select the active hedge policy from the dropdown. The policy card shows all parameters." },
        { step: 4, label: "Run Engine",          description: "Click RUN HEDGE ENGINE. The engine executes deterministically — same inputs always produce the same output." },
        { step: 5, label: "Review Results",      description: "Output appears in Run Viewer. Review bucket breakdown, hedge notionals, costs, and effectiveness score.", link: "/run-viewer" },
        { step: 6, label: "Promote to Staging",  description: "If results pass review, click PROMOTE TO STAGING to submit for supervisor 4-eyes approval.", link: "/staging" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS — Report Studio
// ─────────────────────────────────────────────────────────────────────────────

export const REPORTS_HELP: HelpPanelConfig = {
  pageTitle:    "Report Studio",
  pageSubtitle: "REGULATORY · BOARD · IFRS 9 · PDF/XLSX",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "Report Studio is the enterprise reporting layer. It provides 30+ institutional report templates spanning IFRS 9 hedge documentation, board-level FX summaries, risk committee packs, and Basel III capital analytics.\n\nThe AI Report Builder (Claude-powered) takes a plain-English goal and assembles a structured multi-section report outline. Each section can be bound to a specific calculation run, policy, or market snapshot. Export to PDF, XLSX, PPT, or ZIP.",
    },
    {
      id:    "templates",
      title: "Report Template Categories",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "IFRS 9 Hedge Documentation", type: "Regulatory", description: "Formal hedge designation documentation per IFRS 9 §B6.4.1. Includes hedge objective, risk being hedged, hedging instrument description, economic relationship narrative, and hedge ratio justification.", example: "Q1 2026 Hedge Designation — USDMXN", source: "IFRS 9 §B6.4.1" },
        { name: "Board FX Summary",           type: "Governance", description: "Executive-level FX exposure and hedging activity summary. Shows gross exposure by currency, hedge coverage ratio, mark-to-market P&L on open hedges, and budget vs. actual rate comparison.", example: "Q1 2026 Board FX Pack", source: "ORDR Portfolio Risk" },
        { name: "Risk Committee Pack",        type: "Governance", description: "Full risk committee documentation set: VaR report, limit utilisation, stress test results, policy compliance summary, and open positions lifecycle dashboard.", example: "March 2026 Risk Committee", source: "portfolio-risk + scenario-studio" },
        { name: "Basel III FX Capital",       type: "Regulatory", description: "Capital requirement calculation for FX positions under the Standardised Approach to Market Risk (SA-MR). Shows gross weighted position, net open position, and required capital charge.", example: "SA-MR FX Capital Q1 2026", source: "Basel III §MAR20" },
        { name: "Hedge Effectiveness Test",   type: "Regulatory", description: "Quantitative retrospective effectiveness test per IFRS 9 §B6.4.17. Uses Dollar-Offset and regression analysis (R² ≥ 0.80) to confirm hedge qualification.", example: "HET — USDMXN Forward Book Q1", source: "IFRS 9 §B6.4.17" },
      ],
    },
    {
      id:    "formulas",
      title: "Key Regulatory Formulas",
      icon:  "∑",
      type:  "formula",
      formulas: [
        {
          label:       "Dollar-Offset Effectiveness",
          latex:       "R_{eff} = |ΔFV_{hedging}| / |ΔFV_{hedged}|",
          explanation: "Hedge effectiveness under IAS 39. Must fall 80%–125% prospectively and retrospectively. IFRS 9 requires only that economic relationship exists and sources of ineffectiveness are identified.",
          source:      "IAS 39 §AG105; IFRS 9 §B6.4.4",
        },
        {
          label:       "Basel III Net Open Position",
          latex:       "NOP = max(|longs|, |shorts|)",
          explanation: "Net open FX position for capital charge purposes. The larger of total long or total short positions across all currencies. Capital charge = NOP × 8% (standard).",
          source:      "Basel III SA-MR §MAR20.4",
        },
        {
          label:       "Hedge Ratio (IFRS 9)",
          latex:       "HR = N_{hedging} / N_{hedged}",
          explanation: "The designated hedge ratio must be consistent with the risk management objective and must not reflect an imbalance that would create hedge ineffectiveness.",
          source:      "IFRS 9 §B6.4.9",
        },
      ],
    },
    {
      id:    "workflow",
      title: "Creating a report",
      icon:  "▶",
      type:  "workflow",
      steps: [
        { step: 1, label: "Choose Template", description: "Browse the 30-preset library by category (Regulatory, Board, Operational, Risk). Or use AI Builder for custom construction." },
        { step: 2, label: "Bind Data",       description: "Attach the report to a specific calculation run, active policy, and market snapshot date. All data is immutable once bound." },
        { step: 3, label: "Edit Outline",    description: "Drag to reorder sections, toggle visibility, and edit AI-generated narrative text before finalising." },
        { step: 4, label: "Preview",         description: "Click PREVIEW to render a print-ready view with all charts, tables, and regulatory disclosures populated from live data." },
        { step: 5, label: "Export",          description: "Download as PDF (regulatory filing), XLSX (data tables), PPT (board presentation), or ZIP (full package).", link: "/committee-pack" },
      ],
    },
    {
      id:    "glossary",
      title: "Glossary",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "IFRS 9",            definition: "International Financial Reporting Standard 9 — Financial Instruments. Governs hedge accounting since 2018. Requires documented risk management objective, economic relationship, and hedge ratio justification." },
        { term: "Dollar-Offset",     definition: "Quantitative hedge effectiveness method comparing fair value changes in the hedging instrument vs. the hedged item. Results between 80%–125% confirm high effectiveness." },
        { term: "Hedge Designation", definition: "Formal documentation establishing a hedging relationship under IFRS 9. Must be completed at inception and cannot be retroactively applied." },
        { term: "OCI",               definition: "Other Comprehensive Income — the balance sheet reserve where effective gains/losses on designated cash flow hedges accumulate until the hedged item affects profit or loss." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS — Calculation Results Viewer
// ─────────────────────────────────────────────────────────────────────────────

export const RESULTS_HELP: HelpPanelConfig = {
  pageTitle:    "Calculation Results",
  pageSubtitle: "HEDGE OUTPUT · BUCKET ANALYSIS · EFFECTIVENESS",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position:    4,
        total:       7,
        label:       "Step 4 of 7 — Results Review",
        description: "Results are generated after the engine run. Review hedge notionals, bucket breakdown, and effectiveness score before promoting to the Staging Pipeline for supervisor approval.",
        prev: { label: "Run Engine", href: "/input" },
        next: { label: "Sandbox",    href: "/sandbox" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Results page organises engine output across six sub-tabs:\n\n① Committee Summary — board-ready narrative + KPIs\n② Exposure & Buckets — monthly bucket breakdown table\n③ Scenario Analysis — stress-tested P&L under historical scenarios\n④ Hedge Effectiveness — IFRS 9 prospective/retrospective test\n⑤ Trade Tickets — executable trade instruction set\n⑥ Audit Evidence — SHA-256 hash chain for this run\n\nEach tab renders live from the selected calculation_run_id. Results are read-only and WORM-sealed once the run completes.",
    },
    {
      id:    "variables",
      title: "Output Fields Explained",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "bucket_breakdown",    type: "Table",      description: "Monthly exposure buckets showing: exposure notional, hedge notional, hedge ratio, all-in forward rate, hedging cost (bps), and net unhedged exposure for each month.", example: "Jan-26: $2.1M exp, $1.89M hedged (90%)", source: "engine kernel" },
        { name: "effectiveness_score", type: "percentage", description: "The IFRS 9 hedge effectiveness score. Computed as the R² of the regression of hedging instrument fair value changes vs. hedged item changes.", example: "94.7% — HIGHLY EFFECTIVE", source: "IFRS 9 §B6.4.17" },
        { name: "total_hedge_cost",    type: "USD",        description: "Sum of estimated transaction costs across all hedge trades: sum of (spread_bps / 10000 × notional × forward_rate) for each bucket.", example: "$47,230 total cost", source: "cost_assumptions" },
        { name: "net_unhedged",        type: "USD",        description: "Total FX exposure remaining after applying policy hedge ratios. Represents residual currency risk accepted per policy design.", example: "$980,000 net unhedged", source: "engine kernel" },
        { name: "run_hash",            type: "SHA-256",    description: "Deterministic SHA-256 fingerprint of all run inputs. Same inputs always produce the same hash, enabling independent audit verification.", example: "a3f8b2c1...", source: "audit trail" },
      ],
    },
    {
      id:    "formulas",
      title: "Effectiveness Formulas",
      icon:  "∑",
      type:  "formula",
      formulas: [
        {
          label:       "IFRS 9 R² Effectiveness",
          latex:       "R^2 = \\left(\\frac{\\sum(x_i-\\bar{x})(y_i-\\bar{y})}{\\sqrt{\\sum(x_i-\\bar{x})^2 \\cdot \\sum(y_i-\\bar{y})^2}}\\right)^2",
          explanation: "R-squared of the regression of hedging instrument changes vs. hedged item changes. IFRS 9 requires R² ≥ 0.80 for high effectiveness.",
          source:      "IFRS 9 §B6.4.17; Johnson (1960)",
        },
        {
          label:       "Hedge P&L (Mark-to-Market)",
          latex:       "MTM = (F_{current} - F_{inception}) × N_h × (-1)^{direction}",
          explanation: "Mark-to-market gain/loss on open hedge positions. Sign convention: positive = gain on hedge instrument.",
          source:      "FAS 133 / IFRS 9 §6.5.2",
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGING — Approval Pipeline
// ─────────────────────────────────────────────────────────────────────────────

export const STAGING_HELP: HelpPanelConfig = {
  pageTitle:    "Staging Pipeline",
  pageSubtitle: "4-EYES APPROVAL · PROMOTE TO LEDGER",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position:    5,
        total:       7,
        label:       "Step 5 of 7 — Staging & Approval",
        description: "Staging is the 4-eyes governance gate. Calculation runs promoted from Sandbox or Input arrive here as PENDING artifacts. A supervisor must approve before promotion to the immutable Ledger.",
        prev: { label: "Sandbox", href: "/sandbox" },
        next: { label: "Ledger",  href: "/ledger" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Staging Pipeline is the 4-eyes approval checkpoint between calculation and ledger commitment. Every proposed hedge plan must be reviewed and approved by a supervisor (different from the proposer) before becoming a permanent Ledger entry.\n\nEach artifact shows an integrity score — a SHA-256 hash chain verification proving it has not been tampered with since calculation.",
    },
    {
      id:    "lifecycle",
      title: "Artifact Lifecycle",
      icon:  "▶",
      type:  "workflow",
      steps: [
        { step: 1, label: "PENDING",  description: "Submitted by risk analyst. Awaiting supervisor review. Proposer cannot approve own submission (4-eyes enforcement)." },
        { step: 2, label: "RETURNED", description: "Supervisor returned with comments for rework. Risk analyst must address comments and resubmit." },
        { step: 3, label: "APPROVED", description: "Supervisor approved. Artifact locked and eligible for Ledger promotion. No further modification possible." },
        { step: 4, label: "LEDGER",   description: "Promoted to the immutable Ledger. WORM-sealed. Triggers position lifecycle transition to HEDGED.", link: "/ledger" },
        { step: 5, label: "REJECTED", description: "Definitively rejected. Not eligible for resubmission. A new calculation run must be initiated." },
        { step: 6, label: "REVOKED",  description: "Previously approved artifact revoked before Ledger promotion. Requires admin authority. Creates an audit event." },
      ],
    },
    {
      id:    "variables",
      title: "Integrity Score Explained",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "integrity_score", type: "0–100",   description: "Verification score of the artifact's hash chain. 100 = all hashes verified from genesis to latest event. < 100 = gap detected, possible tampering.", example: "100 — CHAIN INTACT", source: "SHA-256 replay verifier" },
        { name: "chain_depth",     type: "integer", description: "Number of audit events in the hash chain. Higher depth = more state transitions and richer audit history.", example: "7 events", source: "audit_events table" },
        { name: "proposer_id",     type: "UUID",    description: "User who submitted the artifact. System prevents this user from approving the same artifact (4-eyes).", example: "analyst@synexcapital.com", source: "staging_artifacts.created_by" },
      ],
    },
    {
      id:    "glossary",
      title: "Glossary",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "4-Eyes Principle", definition: "Dual-control governance requiring two different individuals to authorise a sensitive financial action. ORDR enforces this at the DB level: proposer_id ≠ approver_id." },
        { term: "WORM Sealing",     definition: "Once promoted to the Ledger, an artifact is protected by Write-Once-Read-Many DB triggers. Neither UPDATE nor DELETE can be executed on Ledger rows." },
        { term: "Integrity Score",  definition: "SHA-256 hash chain verification score. ORDR replays all audit events in sequence and checks each hash matches its predecessor. 100% = tamper-free." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER — Immutable Audit Ledger
// ─────────────────────────────────────────────────────────────────────────────

export const LEDGER_HELP: HelpPanelConfig = {
  pageTitle:    "Audit Ledger",
  pageSubtitle: "WORM IMMUTABLE · SHA-256 HASH CHAIN",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position:    6,
        total:       7,
        label:       "Step 6 of 7 — Ledger",
        description: "The Ledger is the terminal state of the tri-state pipeline. Approved artifacts land here permanently. WORM semantics prevent any modification. This is the official record of executed hedge plans.",
        prev: { label: "Staging",   href: "/staging" },
        next: { label: "Execution", href: "/execution" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Ledger is the permanent, immutable record of all approved hedge plans. Every entry was reviewed by at least two individuals (4-eyes principle) and cannot be modified, deleted, or backdated after creation.\n\nEach entry contains a root_hash — the top-level SHA-256 hash of the entire audit chain for that record. A verifier can re-derive all hashes to prove the chain has never been tampered with. Satisfies SEC Rule 17a-4 and CFTC 1.31 WORM requirements.",
    },
    {
      id:    "variables",
      title: "Ledger Fields",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "ledger_id",       type: "UUID",     description: "The permanent, immutable identifier for this ledger entry. Referenced in IFRS 9 hedge documentation and regulatory filings.", example: "LDG-00089", source: "ledger table" },
        { name: "root_hash",       type: "SHA-256",  description: "The SHA-256 hash of the final audit event in this entry's chain. Encodes the complete history. Any external verification can reproduce this hash from public data.", example: "7b2f4e8a...", source: "audit_events chain" },
        { name: "replay_verified", type: "boolean",  description: "Automated result of the hash chain replay verifier. TRUE = all hashes match. FALSE = tamper detected, requires immediate investigation.", example: "TRUE", source: "replay verifier" },
        { name: "locked_at",       type: "ISO 8601", description: "Timestamp when the artifact was sealed. Immutable. Used as the official as-of date for IFRS 9 designation documentation.", example: "2026-02-25T09:14:22Z", source: "ledger.locked_at" },
      ],
    },
    {
      id:    "formulas",
      title: "Hash Chain Formula",
      icon:  "∑",
      type:  "formula",
      formulas: [
        {
          label:       "Root Hash Construction",
          latex:       "H_{root} = SHA256(event_n\\ |\\ H_{n-1})",
          explanation: "The root hash is the final event's hash in the chain. Each hash covers the event payload concatenated with the previous hash. The genesis hash is 0000...0000 by convention.",
          source:      "ORDR Audit Model v1.0",
        },
        {
          label:       "Chain Depth Integrity",
          latex:       "\\forall i \\in [1,n]: H_i = SHA256(payload_i + H_{i-1})",
          explanation: "Full chain integrity requires every link to be reproducible. A verifier replays all events in creation-order and checks each computed hash matches the stored value.",
          source:      "Merkle-chain pattern; CFTC 1.31",
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HEDGES — Hedge Calculator (Simple Mode)
// ─────────────────────────────────────────────────────────────────────────────

export const HEDGES_HELP: HelpPanelConfig = {
  pageTitle:    "Hedge Calculator",
  pageSubtitle: "QUICK HEDGE · SPOT + FORWARD PRICING",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Hedge Calculator provides a simplified single-trade hedge calculation without full policy binding. Useful for quick what-if pricing, trade ticket generation, and pre-trade cost analysis.\n\nEnter a currency pair, notional, settlement date, and direction. The calculator retrieves the live forward rate and computes hedging cost, net proceeds, and indicative NDF/Forward terms.",
    },
    {
      id:    "variables",
      title: "Input Parameters",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "currency_pair",   type: "string",  description: "The FX pair to hedge in ISO 4217 notation. The base currency is the currency being hedged; the quote currency is USD by default for NDF products.", example: "USDMXN", source: "user input" },
        { name: "notional",        type: "USD",     description: "The face value of the hedge in base currency units. Minimum trade size is policy-dependent (e.g., $25,000 for BLNC policy).", example: "$2,500,000", source: "user input" },
        { name: "settlement_date", type: "date",    description: "The value date (maturity) of the hedge instrument. For NDFs, this is the fixing date. For FX Forwards, this is the delivery date.", example: "2026-06-30", source: "user input" },
        { name: "hedge_cost_bps",  type: "bps",     description: "Indicative bid-offer spread in basis points. Typical ranges: G10 1-3 bps; EM 3-10 bps; frontier 10-50 bps.", example: "4.5 bps = $1,125 on $2.5M", source: "market indicative" },
      ],
    },
    {
      id:    "formulas",
      title: "Pricing Formulas",
      icon:  "∑",
      type:  "formula",
      formulas: [
        {
          label:       "NDF Settlement P&L",
          latex:       "PnL = (F_{fixing} - F_{contract}) × N / F_{fixing}",
          explanation: "NDF settlement is cash-only. At fixing, if the fixing rate differs from the contracted rate, the cash difference is paid by the out-of-the-money party. No physical delivery.",
          source:      "ISDA 1998 FX and Currency Option Definitions",
        },
        {
          label:       "Forward Points (IRP)",
          latex:       "F = S × (1 + r_{domestic}) / (1 + r_{foreign})",
          explanation: "The forward exchange rate derived from Interest Rate Parity. Currencies with higher interest rates trade at a forward discount to reflect the carry cost.",
          source:      "Covered Interest Rate Parity (CIP)",
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD CSV — Audited File Import
// ─────────────────────────────────────────────────────────────────────────────

export const UPLOAD_CSV_HELP: HelpPanelConfig = {
  pageTitle:    "CSV / Excel Import",
  pageSubtitle: "AUDITED FILE IMPORT · VALIDATED INGEST",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Upload page provides audited file import for FX positions. Supports CSV and Excel (.xlsx) formats. Every import creates an immutable audit event recording: who uploaded, when, file hash, row count, validation results, and any errors.\n\nThe import pipeline runs: file hash → schema validation → business rule validation → staging → atomic DB commit. Partial imports are rolled back on any validation error.",
    },
    {
      id:    "variables",
      title: "Required CSV Columns",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "currency_pair",   type: "string",   description: "ISO 4217 currency pair code. Must match a supported CME-listed pair.", example: "USDMXN", source: "column: currency_pair" },
        { name: "notional_usd",    type: "number",   description: "Transaction notional in USD equivalent. Positive = USD buy. Negative = USD sell.", example: "2500000", source: "column: notional_usd" },
        { name: "settlement_date", type: "ISO 8601", description: "Value date for the exposure in YYYY-MM-DD format. Used to assign the exposure to a monthly bucket.", example: "2026-06-30", source: "column: settlement_date" },
        { name: "flow_type",       type: "enum",     description: "CONFIRMED = firm contractual obligation. FORECAST = estimated/budgeted flow. Determines which hedge ratio is applied.", example: "CONFIRMED or FORECAST", source: "column: flow_type" },
        { name: "reference_id",    type: "string",   description: "Optional external reference (PO number, contract ID) for position traceability. Stored verbatim for audit.", example: "PO-2026-0441", source: "column: reference_id (optional)" },
      ],
    },
    {
      id:    "workflow",
      title: "Import Workflow",
      icon:  "▶",
      type:  "workflow",
      steps: [
        { step: 1, label: "Prepare File",      description: "Download the CSV template from the Position Desk. Populate all required columns. Save as .csv or .xlsx." },
        { step: 2, label: "Upload",            description: "Drag-and-drop or click to browse. File is immediately hashed before any processing." },
        { step: 3, label: "Schema Validate",   description: "System checks: required columns present, data types correct, date formats valid, no null required fields." },
        { step: 4, label: "Business Validate", description: "Checks: currency pairs supported, notionals within range, settlement dates are valid FX settlement dates." },
        { step: 5, label: "Commit",            description: "All rows inserted atomically. If any row fails, the entire import is rolled back." },
        { step: 6, label: "Review",            description: "Import summary shows rows imported, warnings, and errors. Navigate to Position Desk to confirm lifecycle transitions.", link: "/position-desk" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// LINEAGE — Position Provenance Graph
// ─────────────────────────────────────────────────────────────────────────────

export const LINEAGE_HELP: HelpPanelConfig = {
  pageTitle:    "Position Lineage",
  pageSubtitle: "PROVENANCE GRAPH · AUDIT CHAIN VISUALISER",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Lineage Graph shows the complete provenance chain for a single FX position — from initial upload through policy assignment, calculation runs, staging approvals, and final Ledger entry.\n\nEach node in the horizontal chain is a milestone in the position's lifecycle. Clicking a node expands its detail card, showing the exact timestamp, user, input parameters, and SHA-256 hash at that state.",
    },
    {
      id:    "nodes",
      title: "Node Types Explained",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "POSITION",           type: "node", description: "The root node — the original FX position as uploaded. Shows currency pair, notional, settlement date, flow_type, and import file hash.", example: "POS-0441 / USDMXN / $2.5M", source: "positions table" },
        { name: "POLICY",             type: "node", description: "The policy assignment event — when a hedge policy was bound to this position. Links to the specific policy version in force at that time.", example: "BLNC v3 assigned 2026-02-10", source: "policy_instances" },
        { name: "POLICY_REVISION",    type: "node", description: "A WORM-sealed snapshot of the policy config used in this position's calculation. Shows the exact hedge_ratios and cost_assumptions that governed the run.", example: "Revision #4 — confirmed 100%, fcst 50%", source: "policy_revisions" },
        { name: "CALCULATION_RUN",    type: "node", description: "An engine execution node. Shows run_id, run hash, engine version, and output summary. Links to full Run Viewer.", example: "RUN-00142 PASS / 94.7% eff.", source: "calculation_runs" },
        { name: "EXECUTION_PROPOSAL", type: "node", description: "A generated trade ticket proposal. Shows instrument type (NDF/FWD), tenor, all-in rate, and notional. Status: PROPOSED/EXECUTED/CANCELLED.", example: "NDF USDMXN 3M $2.25M @ 18.76", source: "execution_proposals" },
      ],
    },
    {
      id:    "formulas",
      title: "Audit Integrity",
      icon:  "∑",
      type:  "formula",
      formulas: [
        {
          label:       "Lineage Hash Binding",
          latex:       "H_{node} = SHA256(node\\_type + entity\\_id + payload + H_{prev\\_node})",
          explanation: "Each lineage node is hash-bound to its predecessor. The full chain can be replayed from the GENESIS event to verify no node was inserted, modified, or deleted.",
          source:      "ORDR Lineage Model v1.0",
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION HISTORY — Trade Execution Archive
// ─────────────────────────────────────────────────────────────────────────────

export const EXECUTION_HISTORY_HELP: HelpPanelConfig = {
  pageTitle:    "Execution History",
  pageSubtitle: "TRADE ARCHIVE · POST-TRADE · MiFID II",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "Execution History is the post-trade archive for all FX hedge transactions. Shows completed, cancelled, and pending execution proposals with their broker reference, traded rate, settlement confirmation, and MiFID II best execution record.\n\nThe archive is append-only: once an execution record is created, it cannot be modified. Amendments create a new linked record referencing the original.",
    },
    {
      id:    "variables",
      title: "Trade Record Fields",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "broker_ref",        type: "string", description: "Counterparty-assigned trade reference number. The primary reconciliation key for matching ORDR records against broker confirms.", example: "GS-FX-20260225-4412", source: "execution_proposals.broker_ref" },
        { name: "traded_rate",       type: "number", description: "The all-in rate at which the hedge was executed. Compared to the indicative forward rate to compute execution slippage.", example: "18.7612", source: "execution confirmation" },
        { name: "slippage_bps",      type: "bps",    description: "Execution slippage = (traded_rate - indicative_rate) × 10,000 / indicative_rate. Positive = worse than indicative (cost).", example: "+1.2 bps", source: "computed" },
        { name: "settlement_status", type: "enum",   description: "T+2 settlement confirmation status: CONFIRMED (settled), PENDING (T+1), FAILED (triggers escalation), AMENDED.", example: "CONFIRMED", source: "prime broker feed" },
        { name: "best_ex_score",     type: "0–100",  description: "MiFID II best execution score. Compares traded rate against market VWAP at time of execution. ≥ 80 = compliant; < 80 = requires written justification.", example: "92 — COMPLIANT", source: "MiFID II §27 RTS" },
      ],
    },
    {
      id:    "glossary",
      title: "Glossary",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "MiFID II Best Execution", definition: "Markets in Financial Instruments Directive II Article 27 — requires firms to take all sufficient steps to obtain the best possible result when executing orders. FX forwards and NDFs are in scope." },
        { term: "T+2 Settlement",          definition: "Standard FX spot settlement convention: trade date plus two business days. NDFs and FX Forwards settle on the value date specified in the contract." },
        { term: "Slippage",                definition: "The difference between the indicative rate used in pre-trade analysis and the actual executed rate." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT HISTORY — File Import Archive
// ─────────────────────────────────────────────────────────────────────────────

export const IMPORT_HISTORY_HELP: HelpPanelConfig = {
  pageTitle:    "Import History",
  pageSubtitle: "FILE AUDIT LOG · INGEST PROVENANCE",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "Import History shows the complete log of every file import: CSV uploads, ERP data pulls, accounting system syncs, and manual position entries. Each record shows the file name, SHA-256 hash, row count, validation outcome, and the user who triggered the import.\n\nThis log cannot be deleted or modified. Every position in the system can be traced back to a specific import event.",
    },
    {
      id:    "variables",
      title: "Import Record Fields",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "file_hash",         type: "SHA-256", description: "SHA-256 hash of the raw uploaded file bytes, computed before any processing. Used to prove the file content at import time.", example: "a3f8b2c1d4e5...", source: "computed at upload" },
        { name: "row_count",         type: "integer", description: "Number of data rows in the uploaded file, excluding headers. Stored for quick reconciliation against position counts.", example: "47 rows", source: "parser output" },
        { name: "validation_status", type: "enum",    description: "PASS = all rows validated and committed. PARTIAL = some rows committed (with warnings). FAIL = no rows committed (all rolled back).", example: "PASS", source: "validation engine" },
        { name: "error_count",       type: "integer", description: "Number of rows that failed validation. If > 0 and status is PARTIAL, these rows were skipped.", example: "2 rows failed", source: "validation engine" },
        { name: "connector_id",      type: "string",  description: "For automated connector imports, the connector instance that triggered the import. NULL for manual file uploads.", example: "SAP-PROD-01", source: "connectors module" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCESS CONTROL — RBAC Administration
// ─────────────────────────────────────────────────────────────────────────────

export const ACCESS_CONTROL_HELP: HelpPanelConfig = {
  pageTitle:    "Access Control",
  pageSubtitle: "RBAC · USERS · ROLES · PERMISSIONS",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "Access Control manages the Role-Based Access Control (RBAC) system. Admins can create and manage users, assign roles, and view the permission matrix. The three built-in roles (admin/supervisor/risk_analyst) have a strict hierarchy.\n\nAll changes are audit-logged. Role assignments cannot be backdated. The permission matrix shows the exact codenames available to each role.",
    },
    {
      id:    "roles",
      title: "Built-in Roles",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "admin",        type: "hierarchy 0",  description: "Full system access. Can: create/delete users, assign any role, access all branches, approve any artifact, view and export all audit records, manage API keys.", example: "CFO, Head of Treasury, System Admin", source: "RBAC — hierarchy_level 0" },
        { name: "supervisor",   type: "hierarchy 5",  description: "Approval authority. Can: review and approve/reject staged artifacts (4-eyes), view all positions and runs, read audit trail. Cannot modify system configuration.", example: "Treasury Manager, Risk Manager", source: "RBAC — hierarchy_level 5" },
        { name: "risk_analyst", type: "hierarchy 10", description: "Calculation and analysis. Can: create positions, run engine, create sandbox runs, view rates and results, generate reports. Cannot approve own submissions.", example: "FX Analyst, Treasury Analyst", source: "RBAC — hierarchy_level 10" },
      ],
    },
    {
      id:    "glossary",
      title: "Glossary",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "RBAC",            definition: "Role-Based Access Control — permissions are assigned to roles, not directly to users. Users are assigned roles and inherit corresponding permissions." },
        { term: "Permission",      definition: "A codename representing a specific action on a specific module. Format: module:action (e.g., positions:create, policies:activate)." },
        { term: "Hierarchy Level", definition: "A numeric value defining role seniority. Level 0 = highest authority (admin); level 10 = base analyst." },
        { term: "API Key",         definition: "A static secret (HK_live_ prefix) for programmatic access. Associated with a service account. Can be scoped to read-only or specific modules." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTORS — ERP & Data Source Integration Hub
// ─────────────────────────────────────────────────────────────────────────────

export const CONNECTORS_HELP: HelpPanelConfig = {
  pageTitle:    "Connectors",
  pageSubtitle: "ERP · ACCOUNTING · API INTEGRATIONS",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "Connectors manages automated data feeds from external systems — ERP platforms (SAP, Oracle, NetSuite), accounting systems (Xero, QuickBooks, Sage), and custom REST APIs. Each connector runs on a configurable schedule and imports FX exposures automatically.\n\nAll connector-sourced data carries a connector_id provenance tag and is processed through the same audited import pipeline as manual CSV uploads.",
    },
    {
      id:    "types",
      title: "Connector Types",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "ERP Connector",        type: "Pull",      description: "Connects to SAP (RFC/SOAP), Oracle EBS (SOAP/REST), or NetSuite (REST). Extracts open AR/AP items in foreign currency on a scheduled basis.", example: "SAP FI-AR extract — 152 items", source: "erp-integration module" },
        { name: "Accounting Connector", type: "OAuth",     description: "OAuth 2.0 integration with Xero, QuickBooks Online, or Sage. Syncs multi-currency invoices, bills, and bank transactions to derive FX exposure.", example: "Xero — 24 multi-currency invoices", source: "accounting-connection module" },
        { name: "API Connector",        type: "Push/Pull", description: "Generic REST/webhook connector with custom field mapping and transformation rules. Used for bespoke TMS integrations.", example: "Custom TMS webhook — 380 exposures/day", source: "connectors module" },
      ],
    },
    {
      id:    "workflow",
      title: "Setting up a connector",
      icon:  "▶",
      type:  "workflow",
      steps: [
        { step: 1, label: "Select Type",  description: "Choose ERP, accounting, or custom API connector from the catalogue." },
        { step: 2, label: "Authenticate", description: "For OAuth connectors, complete the OAuth 2.0 flow. For ERP, enter connection credentials (stored encrypted, never logged).", link: "/accounting-connection" },
        { step: 3, label: "Map Fields",   description: "Configure field mapping from source system fields to ORDR position schema (currency_pair, notional_usd, settlement_date, flow_type)." },
        { step: 4, label: "Test Run",     description: "Execute a dry-run import. Results show matched rows, unmatched rows, and mapping warnings. No data committed in test mode." },
        { step: 5, label: "Schedule",     description: "Set the import schedule (cron syntax). Connector will run automatically and create import history records for every execution.", link: "/import-history" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// ERP INTEGRATION — SAP / Oracle / NetSuite
// ─────────────────────────────────────────────────────────────────────────────

export const ERP_INTEGRATION_HELP: HelpPanelConfig = {
  pageTitle:    "ERP Integration",
  pageSubtitle: "SAP · ORACLE · NETSUITE · AR/AP SYNC",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "ERP Integration provides direct connectivity to enterprise resource planning systems for automated FX exposure extraction. Open AR items in foreign currency = receivable FX exposure (long foreign currency). Open AP items in foreign currency = payable FX exposure (short foreign currency).\n\nThe integration extracts document-level data: document number, vendor/customer, currency, amount, payment due date.",
    },
    {
      id:    "variables",
      title: "ERP Data Mapping",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "document_currency", type: "ISO 4217", description: "The original transaction currency in the ERP. USD-denominated documents are excluded. All others create FX exposure.", example: "MXN, EUR, GBP", source: "SAP BSEG-WAERS" },
        { name: "document_amount",   type: "number",   description: "The open (unpaid) balance in transaction currency. Converted to USD equivalent using the ERP reference rate.", example: "MXN 5,200,000", source: "SAP BSEG-WRBTR" },
        { name: "due_date",          type: "date",     description: "Payment due date — used as the position settlement_date for bucket assignment.", example: "2026-04-30", source: "SAP BSEG-ZFBDT" },
        { name: "flow_direction",    type: "enum",     description: "AR items = BUY (you will receive foreign currency). AP items = SELL (you will pay foreign currency). Determines hedge direction.", example: "AR → BUY (MXN exposure)", source: "SAP document type" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HEDGEWIKI — Institutional Knowledge Graph
// ─────────────────────────────────────────────────────────────────────────────

export const HEDGEWIKI_HELP: HelpPanelConfig = {
  pageTitle:    "HedgeWiki",
  pageSubtitle: "GOVERNANCE KNOWLEDGE GRAPH · 20 ARTICLES",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "HedgeWiki is the institutional knowledge graph for ORDR. It contains 20 curated articles across 6 domains: FX Instruments, ISDA Framework, IFRS 9, ASC 815, Policy Templates, and HedgeCore Architecture.\n\nEach article is versioned (STABLE / DRAFT / REVIEW / DEPRECATED), cites authoritative sources, and links to the relevant ORDR module.",
    },
    {
      id:    "domains",
      title: "Knowledge Domains",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "FX Instruments",         type: "domain", description: "NDF mechanics, FX Forward settlement, FX Option structures, swap pricing, and differences between deliverable and non-deliverable instruments.", example: "NDF vs. FX Forward, carry cost calculation", source: "ISDA 1998 FX Definitions" },
        { name: "ISDA Framework",         type: "domain", description: "ISDA Master Agreement structure, CSA mechanics, netting provisions, close-out netting, and 2002 amendments.", example: "Two-way payment netting, default provisions", source: "ISDA Master Agreement 2002" },
        { name: "IFRS 9",                 type: "domain", description: "Hedge accounting under IFRS 9: designation requirements, economic relationship test, hedge ratio documentation, effectiveness assessment, and OCI recycling.", example: "Cash flow hedge documentation template", source: "IFRS 9 §6.4–6.5" },
        { name: "ASC 815",                type: "domain", description: "US GAAP hedge accounting under ASC 815 (FAS 133). Fair value vs. cash flow hedge designation, effectiveness testing (80-125%), and DFV method.", example: "Critical terms match test", source: "ASC 815-20; FAS 161" },
        { name: "Policy Templates",        type: "domain", description: "Deep-dive documentation for each of the 33 system policy presets — rationale, target entity type, use cases, and implementation notes.", example: "SME policy — when to use, limitations", source: "ORDR Policy Engine v1" },
        { name: "HedgeCore Architecture", type: "domain", description: "Technical documentation: kernel design, determinism guarantees, hash chain implementation, WORM audit model, and API reference.", example: "Engine v1 — input/output schema", source: "ORDR Technical Docs v1" },
      ],
    },
    {
      id:    "glossary",
      title: "Key Regulatory Citations",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "IFRS 9 §6.4",   definition: "Qualifying criteria for hedge accounting: formal designation at inception; economic relationship exists; credit risk does not dominate; designated hedge ratio reflects actual quantities hedged." },
        { term: "ASC 815-20-25", definition: "US GAAP hedge accounting designation criteria. Requires management intent, formal contemporaneous documentation, reasonable expectation of high effectiveness." },
        { term: "ISDA 2002 §6",  definition: "Early Termination provisions of the ISDA Master Agreement. Governs Events of Default, close-out netting amounts, and payment netting." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// POLISOPHIC — AI Policy Recommendation Engine
// ─────────────────────────────────────────────────────────────────────────────

export const POLISOPHIC_HELP: HelpPanelConfig = {
  pageTitle:    "Polisophic",
  pageSubtitle: "AI POLICY RECOMMENDER · PORTFOLIO OPTIMISER",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "Polisophic is the AI-powered policy recommendation engine. It analyses your current FX exposure profile, risk posture, cost constraints, and historical hedge performance to recommend the optimal policy configuration from the 33 system presets — or propose a custom hybrid.\n\nRecommendations are explained with quantitative rationale: expected coverage ratio, estimated hedging cost, scenario P&L under stress scenarios, and IFRS 9 effectiveness probability.",
    },
    {
      id:    "variables",
      title: "Recommendation Inputs",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "exposure_profile",  type: "PortfolioSnapshot", description: "Aggregated view of all active FX positions: currency breakdown, confirmed vs. forecast split, maturity distribution, and net open position by currency pair.", example: "87% MXN, 13% EUR; 60% confirmed", source: "position_desk" },
        { name: "risk_appetite",     type: "enum",              description: "Board-approved risk tolerance: CONSERVATIVE (minimise variability), MODERATE (balance cost vs. protection), AGGRESSIVE (accept variability for lower cost).", example: "MODERATE", source: "company policy settings" },
        { name: "budget_fx_rate",    type: "number",            description: "The FX rate used in annual budget/forecast. Policies that keep the realised rate within 2% of budget receive a higher recommendation score.", example: "18.50 USDMXN", source: "user input" },
        { name: "hedge_cost_budget", type: "bps",               description: "Maximum acceptable annual hedging cost in basis points of total FX exposure. Used to filter out policies with cost_assumptions above budget.", example: "6 bps max", source: "user input" },
      ],
    },
    {
      id:    "formulas",
      title: "Optimisation Logic",
      icon:  "∑",
      type:  "formula",
      formulas: [
        {
          label:       "Policy Score",
          latex:       "Score_p = w_1 \\cdot Coverage + w_2 \\cdot CostEff + w_3 \\cdot EffProb + w_4 \\cdot BudgetAlign",
          explanation: "Policies are scored across four weighted dimensions. Weights are calibrated to the user's risk_appetite: CONSERVATIVE weights coverage highest; AGGRESSIVE weights cost efficiency highest.",
          source:      "ORDR Polisophic v1",
        },
        {
          label:       "Budget Alignment",
          latex:       "BA = 1 - |R_{realised} - R_{budget}| / R_{budget}",
          explanation: "Measures how closely the hedged realised rate tracks the budget rate under a base-case forward scenario. A policy that locks in near-budget rates scores close to 1.0.",
          source:      "ORDR Polisophic v1",
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// TERMINAL — API Console
// ─────────────────────────────────────────────────────────────────────────────

export const TERMINAL_HELP: HelpPanelConfig = {
  pageTitle:    "API Terminal",
  pageSubtitle: "REST CONSOLE · RAW API ACCESS",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Terminal provides direct REST API console access to the ORDR backend. Useful for debugging, integration development, bulk operations, and power-user workflows not exposed in the UI.\n\nAll API calls are authenticated with your current JWT session and are fully audit-logged. The terminal supports tab-completion for endpoint paths, request body templates, and response formatting.",
    },
    {
      id:    "variables",
      title: "Common Endpoints",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "POST /api/auth/login",           type: "Auth",    description: "Obtain a JWT access token. Requires username + password as form data. Returns access_token (30min) and refresh_token (7d).", example: "Content-Type: application/x-www-form-urlencoded", source: "auth routes" },
        { name: "GET /api/v1/positions",          type: "Position", description: "List all positions for your branch. Supports filters: ?status=NEW&currency=USDMXN. Returns paginated PositionList.", example: "?status=POLICY_ASSIGNED&limit=50", source: "position routes" },
        { name: "POST /api/v1/policies/activate", type: "Policy",  description: "Activate a policy template for your branch. Body: {template_id: UUID}. Requires supervisor or admin role.", example: "{\"template_id\": \"db537738-...\"}", source: "policy routes" },
        { name: "POST /api/v1/engine/run",        type: "Engine",  description: "Trigger a synchronous hedge calculation run. Body: {run_config}. Returns a CalculationRun object with full output.", example: "{\"policy_id\": \"...\", \"positions\": [...]}", source: "engine routes" },
        { name: "GET /api/v1/audit/events",       type: "Audit",   description: "Query the audit event log. Supports filters: ?entity_type=PolicyTemplate&limit=100. Returns hash-chained AuditEvent list.", example: "?entity_type=CalculationRun", source: "audit routes" },
      ],
    },
    {
      id:    "glossary",
      title: "API Conventions",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "JWT Bearer Token", definition: "All API calls require Authorization: Bearer <token> header. Token expires after 30 minutes. Use POST /api/auth/refresh to obtain a new access token." },
        { term: "X-API-Key",        definition: "Server-to-server calls use X-API-Key: HC_DEV_KEY_001 header. API keys are managed in Access Control." },
        { term: "Idempotency",      definition: "POST endpoints accept an Idempotency-Key header. Duplicate requests with the same key return the original response without re-executing." },
        { term: "Pagination",       definition: "List endpoints use cursor-based pagination: ?limit=50&cursor=<uuid>. The next_cursor field in the response is passed as cursor in the next request." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE CONNECTION — DB Administration
// ─────────────────────────────────────────────────────────────────────────────

export const DATABASE_CONNECTION_HELP: HelpPanelConfig = {
  pageTitle:    "Database Connection",
  pageSubtitle: "POSTGRESQL · ASYNC · MULTI-TENANT",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Database Connection page shows the current PostgreSQL connection status, pool metrics, and provides admin-level database management tools: schema migration status, table row counts, and the ability to trigger manual seed operations.\n\nAll operations are logged to the audit trail. Schema migrations are applied idempotently.",
    },
    {
      id:    "variables",
      title: "Connection Metrics",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "pool_size",      type: "integer", description: "Number of database connections in the async connection pool. Default: min=5, max=20 for production.", example: "12 active / 20 max", source: "SQLAlchemy pool stats" },
        { name: "latency_ms",     type: "ms",      description: "Round-trip time for a SELECT 1 health check query. < 5ms = local; 5-50ms = cloud same-region; > 100ms = network issue.", example: "3.2 ms", source: "health check endpoint" },
        { name: "schema_version", type: "string",  description: "Current Alembic migration revision hash. Compared against expected revision to detect schema drift between code and database.", example: "rev_20260225_001", source: "alembic_version table" },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HELP CENTER — Documentation Hub
// ─────────────────────────────────────────────────────────────────────────────

export const HELP_CENTER_HELP: HelpPanelConfig = {
  pageTitle:    "Help Center",
  pageSubtitle: "DOCUMENTATION · GUIDES · API REFERENCE",
  sections: [
    {
      id:    "overview",
      title: "About this Help Center",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Help Center is your complete reference for ORDR. It contains getting-started guides, module documentation, API reference, regulatory context, and troubleshooting guides.\n\nEvery module has a contextual Help Panel (the HELP tab on the right edge of each page) with module-specific formulas, variable definitions, workflow steps, and glossary terms.",
    },
    {
      id:    "workflow",
      title: "7-Step Platform Workflow",
      icon:  "▶",
      type:  "workflow",
      steps: [
        { step: 1, label: "Position Desk",    description: "Upload FX positions via CSV or connect your ERP. Review lifecycle transitions to POLICY_ASSIGNED.", link: "/position-desk" },
        { step: 2, label: "Market Data",      description: "Fetch live FX rates and 12-month forward curves. Confirm rates are live (green badge) before running.", link: "/currency-fx" },
        { step: 3, label: "Run Engine",       description: "Bind a policy and trigger the deterministic calculation engine. Review hedge notionals and costs.", link: "/input" },
        { step: 4, label: "Sandbox",          description: "Stress-test your hedge plan against historical FX scenarios. Review scenario P&L and adjust if needed.", link: "/sandbox" },
        { step: 5, label: "Stage & Approve",  description: "Submit calculation run for 4-eyes supervisor approval. Track through PENDING → APPROVED.", link: "/staging" },
        { step: 6, label: "Ledger",           description: "Approved plans are sealed into the immutable Ledger. WORM-protected, hash-chained audit record.", link: "/ledger" },
        { step: 7, label: "Execute",          description: "Generate trade tickets and send execution proposals to your prime broker.", link: "/execution" },
      ],
    },
    {
      id:    "glossary",
      title: "Quick Reference Glossary",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "NDF",             definition: "Non-Deliverable Forward — a cash-settled FX forward contract. Used for currencies with exchange controls (MXN, BRL, INR, KRW, CNH). Settlement is the net USD gain/loss at fixing." },
        { term: "WORM",            definition: "Write Once, Read Many — immutable storage enforced by DB triggers. audit_events and ledger rows cannot be modified or deleted after creation." },
        { term: "4-Eyes",          definition: "Dual-authorisation control — the person who proposes an action cannot approve it. ORDR enforces proposer_id ≠ approver_id at the database level." },
        { term: "IFRS 9",          definition: "International reporting standard governing hedge accounting since 2018. Requires documented risk objective, economic relationship, and hedge ratio justification." },
        { term: "Tri-State Pipeline", definition: "ORDR's SANDBOX → STAGING → LEDGER workflow. Sandbox is mutable; Staging requires approval; Ledger is WORM-sealed." },
      ],
    },
  ],
};
"""

target = r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend\src\lib\helpContent.ts"

with open(target, "r", encoding="utf-8") as f:
    existing = f.read()

# Check which exports already exist
exports_to_add = [
    "DASHBOARD_HELP", "INPUT_HELP", "REPORTS_HELP", "RESULTS_HELP",
    "STAGING_HELP", "LEDGER_HELP", "HEDGES_HELP", "UPLOAD_CSV_HELP",
    "LINEAGE_HELP", "EXECUTION_HISTORY_HELP", "IMPORT_HISTORY_HELP",
    "ACCESS_CONTROL_HELP", "CONNECTORS_HELP", "ERP_INTEGRATION_HELP",
    "HEDGEWIKI_HELP", "POLISOPHIC_HELP", "TERMINAL_HELP",
    "DATABASE_CONNECTION_HELP", "HELP_CENTER_HELP",
]

already_exist = [e for e in exports_to_add if f"export const {e}" in existing]
to_add = [e for e in exports_to_add if f"export const {e}" not in existing]

print(f"Already exist: {already_exist}")
print(f"Will add: {to_add}")

# Only append new content (skip sections for already-existing exports)
# Build filtered content
lines = NEW_CONTENT.split("\n")
output_lines = []
skip = False
current_export = None

for line in lines:
    # Check if we're starting a new export block
    for exp in exports_to_add:
        if f"export const {exp}" in line:
            current_export = exp
            skip = current_export in already_exist
            break

    # Detect separator lines (reset context for next export)
    if line.strip().startswith("// ─────") and current_export is not None:
        # Check if next export after this separator is already existing
        # Keep the separator lines either way
        skip = False
        current_export = None

    if not skip:
        output_lines.append(line)

filtered = "\n".join(output_lines)

# Actually: simpler approach - just append everything not already present
# by checking block by block
import re
blocks = re.split(r'\n(?=// ─{40,})', NEW_CONTENT)
new_blocks = []
for block in blocks:
    export_match = re.search(r'export const (\w+)', block)
    if export_match:
        export_name = export_match.group(1)
        if f"export const {export_name}" not in existing:
            new_blocks.append(block)
            print(f"  + Adding: {export_name}")
        else:
            print(f"  - Skipping (exists): {export_name}")
    else:
        pass  # skip non-export blocks (empty separators)

if new_blocks:
    append_content = "\n" + "\n".join(new_blocks)
    with open(target, "a", encoding="utf-8") as f:
        f.write(append_content)
    print(f"\nAppended {len(new_blocks)} new config blocks to helpContent.ts")
else:
    print("\nAll configs already exist — nothing to append")
