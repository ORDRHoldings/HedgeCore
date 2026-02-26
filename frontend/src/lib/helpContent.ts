/**
 * helpContent.ts — Contextual help panel content for every ORDR module
 *
 * Sprint 1.8: Institutional Help System
 *
 * Each export is a HelpPanelConfig consumed by HelpPanel.tsx.
 * Variables, workflows, pipeline positions, and glossary terms are
 * written to BlackRock/Bloomberg institutional documentation standard.
 */

import type { HelpPanelConfig } from "../components/layout/HelpPanel";

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY FX — Market Data Hub
// ─────────────────────────────────────────────────────────────────────────────

export const CURRENCY_FX_HELP: HelpPanelConfig = {
  pageTitle:    "FX Rates & Forward Curve",
  pageSubtitle: "MARKET DATA HUB · LIVE RATES",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 2,
        total:    7,
        label:    "Step 2 of 7 — Market Data",
        description:
          "Market data is the second input to the hedge engine. Spot rates and forward points feed directly into bucket pricing, carry calculations, and scenario stress tests. Without live rates, the engine falls back to indicative data.",
        prev: { label: "Position Desk", href: "/position-desk" },
        next: { label: "Run Engine", href: "/input" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "This module fetches real-time FX spot rates and 12-month forward curves from Alpha Vantage (or a fallback provider). Rates feed directly into the hedge engine calculation.\n\nThe currency pair selector auto-detects currencies from your loaded hedge plan (shown with the POS badge). You can add any of 27 CME-listed currencies via the + ADD PAIR button.\n\nThe TradingView chart shows live price action for the selected pair. The forward curve table shows forward points (carry) for each monthly tenor bucket.",
    },
    {
      id:          "variables",
      title:       "Key Variables Explained",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "spot_usdmxn",
          type:        "number (4 d.p.)",
          description: "Current mid-market spot rate for the selected currency pair. For most EM currencies, this is USD per local unit (e.g., 18.4200 = 18.42 MXN per USD). For EUR/GBP/AUD/NZD/CHF, the convention is inverted.",
          example:     "18.4200",
          source:      "Alpha Vantage FX_DAILY endpoint",
        },
        {
          name:        "forward_points",
          type:        "number (pips)",
          description: "Forward points represent the interest rate differential between two currencies over a given tenor. Added to spot to get the all-in forward rate. Positive = local currency at a discount to USD (higher interest rate).",
          example:     "+0.3412 for 3M MXN",
          source:      "Calculated from interest rate parity (or market feed)",
        },
        {
          name:        "all_in_rate",
          type:        "number",
          description: "The outright forward rate for a given tenor bucket: Spot + Forward Points. This is the rate at which an NDF or FX Forward would be struck for settlement in that month.",
          example:     "18.7612 = 18.4200 + 0.3412",
          source:      "Computed: spot + forward_points",
        },
        {
          name:        "ann_basis",
          type:        "percentage",
          description: "Annualised forward basis — the annualised cost of carry expressed as a percentage. Computed as: (forward_points / spot) / (months_out / 12) × 100. Represents the implied interest rate differential.",
          example:     "7.43% for 3M MXN",
          source:      "Computed from forward points",
        },
        {
          name:        "ndf_basis_12m",
          type:        "number (pips)",
          description: "The forward points at the 12-month tenor — the furthest bucket displayed. This is the maximum carry cost on the forward curve and is the key input for long-dated NDF pricing.",
          example:     "+1.3842",
          source:      "12th bucket in forward_points_by_month",
        },
        {
          name:        "implied_vol_1y",
          type:        "percentage",
          description: "1-year implied volatility from the options market. Not currently available via the market data feed (requires options pricing endpoint). Shown as '—' when unavailable.",
          example:     "11.2%",
          source:      "Not yet available — options endpoint pending",
        },
        {
          name:        "data_class",
          type:        "LIVE | INDICATIVE",
          description: "LIVE = data fetched from Alpha Vantage with a valid API key and within rate limits. INDICATIVE = fallback data used when Alpha Vantage is unavailable (set ALPHA_VANTAGE_API_KEY in environment).",
          example:     "LIVE",
          source:      "market.provider_metadata.data_class",
        },
        {
          name:        "tvSymbol",
          type:        "string",
          description: "TradingView symbol used to embed the live chart widget. Format: FX:USDMXN for spot FX, CME:MXN1! for CME futures.",
          example:     "FX:USDMXN",
          source:      "currencySymbolMap.getTradingViewSymbol()",
        },
        {
          name:        "fromPosition",
          type:        "boolean",
          description: "If true, this currency pair was detected from your loaded hedge plan (positions in HedgeContext). Shown with a 'POS' badge. Position-detected pairs appear first in the tab bar.",
          example:     "true",
          source:      "deriveCurrencyContext(lastInputs.trades)",
        },
      ],
    },
    {
      id:    "workflow",
      title: "How to use this page",
      icon:  "→",
      type:  "workflow",
      steps: [
        {
          step:        1,
          label:       "Load your positions",
          description: "Navigate to Position Desk and run the hedge engine first. The FX page will auto-detect your position currencies and show them with a POS badge.",
          link:        "/position-desk",
        },
        {
          step:        2,
          label:       "Select a currency pair",
          description: "Click any pair tab to load its spot rate and forward curve. POS-tagged pairs are from your hedge plan. Use + ADD PAIR to add any CME currency.",
        },
        {
          step:        3,
          label:       "Read the forward curve",
          description: "The Forward Curve table shows monthly forward points for the next 12 months. The 'All-In Rate' column is what the engine uses to price each tenor bucket.",
        },
        {
          step:        4,
          label:       "Check the data source",
          description: "The SOURCE KPI card and badge (LIVE / INDICATIVE) confirm whether rates are real-time. For hedge effectiveness documentation, live rates are required.",
        },
        {
          step:        5,
          label:       "Stress-test the position",
          description: "Use the 'OPEN SANDBOX →' button to run custom FX shock scenarios against your loaded positions.",
          link:        "/sandbox",
        },
      ],
    },
    {
      id:      "glossary",
      title:   "FX / NDF Glossary",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "NDF", definition: "Non-Deliverable Forward. An OTC derivative contract fixing an exchange rate for a future date, settled in USD (no physical delivery of local currency). Standard for restricted EM currencies." },
        { term: "Forward Points", definition: "The differential between the forward rate and spot rate, expressed in pips. Reflects the interest rate differential between the two currencies (covered interest parity)." },
        { term: "Carry", definition: "The cost or benefit of holding a position over time. In FX, carry = the interest rate differential. Positive carry = you earn the differential by being long the high-yielding currency." },
        { term: "T+2", definition: "Standard FX settlement convention — trades settle two business days after trade date. Spot rates reflect T+2 settlement." },
        { term: "CME", definition: "Chicago Mercantile Exchange. Lists standardised FX futures contracts for 27 major and EM currencies. Used as the reference exchange for ORDR instrument mapping." },
        { term: "Alpha Vantage", definition: "Market data provider used by ORDR for live FX spot rates and forward curves. Requires an API key set via ALPHA_VANTAGE_API_KEY environment variable." },
        { term: "POS Badge", definition: "Currency pairs tagged POS are detected from the user's loaded hedge plan (positions in HedgeContext). These are shown first in the pair tab bar for convenience." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// PORTFOLIO RISK — R1–R8 Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export const PORTFOLIO_RISK_HELP: HelpPanelConfig = {
  pageTitle:    "Portfolio Risk Analysis",
  pageSubtitle: "R1–R8 DECOMPOSITION · VaR 99%",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 5,
        total:    7,
        label:    "Step 5 of 7 — Risk Management",
        description:
          "Portfolio risk analysis sits after the hedge plan has been computed. It takes the hedge plan outputs (gross exposure, hedge notional, friction) and scenario stress grid to decompose risk across 8 institutional dimensions. This is the risk committee reporting layer.",
        prev: { label: "Execution", href: "/execution" },
        next: { label: "Committee Pack", href: "/committee-pack" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "This module provides an institutional R1–R8 risk decomposition of the FX hedge portfolio, consistent with Basel III risk taxonomy and IFRS 9 effectiveness documentation standards.\n\nWhen the hedge engine is active (LIVE badge), all metrics are computed from real hedge plan data. Without an active calculation, parametric approximations are displayed (DEMO MODE).\n\nFour tabs: R1–R8 Decomposition, Position Ledger (live from API), Risk Attribution (P&L factor decomposition), and Hedge Efficiency (IFRS 9 §6.4.1 bucket-level testing).",
    },
    {
      id:          "r-dims",
      title:       "R1–R8 Risk Taxonomy",
      icon:        "⊠",
      type:        "variables",
      variables: [
        {
          name:        "R1 — Delta Risk",
          type:        "PRIMARY",
          description: "First-order sensitivity to FX spot rate moves. Computed from net delta = gross commercial exposure minus hedged notional. VaR uses 2.33σ × 2% daily vol for 99% confidence.",
          source:      "hedge_plan.summary.total_action_usd vs gross exposure",
        },
        {
          name:        "R2 — Vega Risk",
          type:        "ZERO (option-free)",
          description: "Sensitivity to implied volatility changes. Zero because this portfolio uses only NDFs and FX Forwards — no optionality. Would be non-zero if options or structured products were introduced.",
          source:      "N/A — option-free book",
        },
        {
          name:        "R3 — Gamma Risk",
          type:        "ZERO (option-free)",
          description: "Second-order delta sensitivity (convexity). Zero for linear instruments (NDFs, forwards). Would become material if option books were added.",
          source:      "N/A — option-free book",
        },
        {
          name:        "R4 — Theta / Carry Risk",
          type:        "SECONDARY",
          description: "Time decay and carry cost embedded in forward points. Computed from total_friction_usd in the hedge plan — the sum of spread costs across all executed buckets.",
          source:      "hedge_plan.summary.total_friction_usd",
        },
        {
          name:        "R5 — Correlation Risk",
          type:        "SECONDARY",
          description: "Cross-currency and commodity correlation breakdown risk. For MXN/BRL portfolios, oil price correlation is a material secondary driver. Approximated at 12% correlation-shock sensitivity.",
          source:      "Parametric: 12% × gross_exposure at 99%",
        },
        {
          name:        "R6 — Credit / CVA Risk",
          type:        "SECONDARY",
          description: "Counterparty Default Risk on outstanding OTC derivatives (NDFs). Measured as CVA (Credit Valuation Adjustment) — 75bps of hedge notional as a bilateral SA-CCR proxy.",
          source:      "Parametric: 0.75% × hedge_notional",
        },
        {
          name:        "R7 — Liquidity Risk",
          type:        "SECONDARY",
          description: "Liquidation cost and market depth risk. For EM NDF markets, modelled as 65bps spread over a 5-business-day unwind horizon. Increases in stressed conditions.",
          source:      "Parametric: 0.65% × hedge_notional",
        },
        {
          name:        "R8 — Tail / Event Risk",
          type:        "HIGH DOMINANCE",
          description: "Fat-tail risk from extreme FX dislocations (political crises, sovereign defaults, central bank interventions). Computed from the worst-case sigma in the engine's scenario stress grid.",
          source:      "scenario_results.totals[worst sigma].total_hedge_benefit_usd",
        },
      ],
    },
    {
      id:          "metrics",
      title:       "Risk Metrics Explained",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "VaR 99% (1D)",
          type:        "USD",
          description: "Value at Risk at 99% confidence over a 1-day horizon. The maximum expected loss that will not be exceeded on 99% of trading days. Negative values indicate loss.",
          example:     "−$26.9M",
          source:      "Parametric: 2.33σ × daily_vol × net_delta",
        },
        {
          name:        "CVaR 99%",
          type:        "USD",
          description: "Conditional Value at Risk (Expected Shortfall). The expected loss in the worst 1% of scenarios. Always more negative than VaR. Regulators increasingly prefer CVaR over VaR for tail-risk capture.",
          example:     "−$38.3M",
          source:      "Parametric: VaR × 1.42 (normal CVaR/VaR ratio)",
        },
        {
          name:        "Hedge Cover %",
          type:        "percentage",
          description: "The proportion of gross commercial exposure covered by the hedge programme. Computed as: hedge_notional / gross_exposure × 100. Compared against the target ratio from the pinned policy.",
          example:     "80%",
          source:      "hedge_plan.summary.total_action_usd / gross_exposure",
        },
        {
          name:        "Gross Exposure",
          type:        "USD",
          description: "Total commercial FX exposure before hedging. Sum of all AR (receivable) position amounts converted to USD at the bucket forward rate.",
          example:     "+$346.6M",
          source:      "sum(commercial_exposure_mxn / forward_rate) per bucket",
        },
        {
          name:        "IFRS 9 Effectiveness",
          type:        "percentage",
          description: "Hedge effectiveness per IFRS 9 §6.4.1: ratio of actual hedge ratio to target hedge ratio. 80–125% is no longer a hard threshold under IFRS 9 (IAS 39 abolished). Qualitative prospective assessment applies.",
          example:     "98.5% = (actual 79%) / (target 80%) × 100",
          source:      "Computed from BucketResult[] vs policy.hedge_ratios.confirmed",
        },
      ],
    },
    {
      id:    "workflow",
      title: "Reading the Dashboard",
      icon:  "→",
      type:  "workflow",
      steps: [
        { step: 1, label: "Check the data source badge", description: "LIVE DATA = computed from the active hedge engine run. DEMO MODE = parametric estimates. Run the engine from Position Desk to get live metrics." },
        { step: 2, label: "Review R1–R8 Decomposition", description: "The table shows all 8 risk dimensions. R1 (Delta) and R8 (Tail) typically dominate. NONE = dimension not applicable for this instrument set." },
        { step: 3, label: "Examine the Risk Radar", description: "The spider chart shows VaR magnitudes per active dimension, scaled to the largest. R8 dominance (large red area) signals tail risk as the primary concern." },
        { step: 4, label: "Review Position Ledger", description: "The Position Ledger tab shows real positions from the API with lifecycle status. HEDGED positions are highlighted green." },
        { step: 5, label: "Check Hedge Efficiency", description: "The Hedge Efficiency tab computes IFRS 9 §6.4.1 prospective effectiveness per bucket. Delta column shows actual vs target ratio — green within ±3pp." },
      ],
    },
    {
      id:      "glossary",
      title:   "Risk Glossary",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "VaR", definition: "Value at Risk. The maximum expected loss at a given confidence level over a specified horizon. Does not capture tail losses beyond the confidence threshold." },
        { term: "CVaR / ES", definition: "Conditional VaR, also called Expected Shortfall. The average loss in the worst X% of scenarios. Preferred by Basel III as it captures tail risk that VaR misses." },
        { term: "EWMA", definition: "Exponentially Weighted Moving Average. A volatility estimation method that gives more weight to recent observations. λ=0.94 is the RiskMetrics standard for daily VaR." },
        { term: "CVA", definition: "Credit Valuation Adjustment. The market value of counterparty credit risk on OTC derivatives. Represents the present value of expected losses from counterparty default." },
        { term: "SA-CCR", definition: "Standardised Approach for Counterparty Credit Risk. Basel III framework for computing exposure at default on OTC derivatives, replacing the older CEM method." },
        { term: "Delta", definition: "The rate of change of a portfolio's value with respect to the underlying asset price. For an FX position, delta = 1 (physical) or −1 (short hedge). Net delta = gross − hedged." },
        { term: "IFRS 9 §6.4.1", definition: "The IFRS 9 hedge effectiveness qualification requirements. Requires: (a) economic relationship, (b) credit risk not dominant, (c) designated hedge ratio reflects actual quantities." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT TRAIL — Governance Event Ledger
// ─────────────────────────────────────────────────────────────────────────────

export const AUDIT_TRAIL_HELP: HelpPanelConfig = {
  pageTitle:    "Audit Trail",
  pageSubtitle: "GOVERNANCE LEDGER · WORM IMMUTABLE",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 7,
        total:    7,
        label:    "Step 7 of 7 — Compliance Audit",
        description:
          "The Audit Trail is the final and permanent layer of the institutional hedge workflow. Every action taken by every user — proposals, approvals, executions, policy changes, imports — is written as an append-only event. This ledger is the source of truth for IFRS 9 §B6.4 hedge effectiveness documentation.",
        prev: { label: "Committee Pack", href: "/committee-pack" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Audit Trail is a WORM (Write Once Read Many) governance ledger. Once an event is written, it cannot be modified or deleted.\n\nEach event is linked to the previous event via a SHA-256 hash chain, providing cryptographic proof that the log has not been tampered with. This is the same principle used in blockchain and WORM storage systems.\n\nEvent types: PROPOSAL, APPROVAL, EXECUTION, POLICY, IMPORT, SYSTEM.\n\nThis ledger satisfies IFRS 9 §B6.4.1 documentation requirements and EMIR Article 11 trade reporting obligations.",
    },
    {
      id:          "variables",
      title:       "Event Fields Explained",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "event_type",
          type:        "enum",
          description: "The category of governance action. PROPOSAL = 4-eyes execution proposal created. APPROVAL = proposal approved or rejected. EXECUTION = hedge position executed. POLICY = policy revision created. IMPORT = data connector run. SYSTEM = automated system event.",
          example:     "EXECUTION",
          source:      "AuditEvent.event_type",
        },
        {
          name:        "actor",
          type:        "string",
          description: "The authenticated user who performed the action. Always linked to the user's verified identity from the JWT token. Tampering with actor identity is prevented by the token signature.",
          example:     "jane.smith@company.com",
          source:      "AuditEvent.actor_name",
        },
        {
          name:        "hash",
          type:        "SHA-256 hex",
          description: "The SHA-256 hash of this event's content. Derived from: timestamp + event_type + actor_id + payload + prev_hash. Any modification to any field changes this hash.",
          example:     "a3f82bc4…",
          source:      "AuditEvent.hash (computed by backend)",
        },
        {
          name:        "prev_hash",
          type:        "SHA-256 hex",
          description: "The hash of the previous audit event. This is the chain link — verifying that prev_hash matches the prior event's hash proves the chain is intact and unmodified.",
          example:     "9d1c74a1…",
          source:      "AuditEvent.prev_hash",
        },
        {
          name:        "related_ids",
          type:        "Record<string, string>",
          description: "Foreign keys to related entities. For EXECUTION events: proposal_id, position_id, run_id. For POLICY events: policy_revision_id, policy_instance_id. For IMPORT events: connector_run_id.",
          example:     '{"position_id": "uuid", "run_id": "uuid"}',
          source:      "AuditEvent.related_ids",
        },
        {
          name:        "integrity_score",
          type:        "percentage",
          description: "The result of the chain integrity verification — the percentage of events where hash(event) matches the claimed hash and prev_hash matches the prior event. 100% = chain is intact.",
          example:     "100%",
          source:      "Computed during Verify Chain Integrity check",
        },
      ],
    },
    {
      id:      "glossary",
      title:   "Audit / Compliance Glossary",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "WORM", definition: "Write Once Read Many. A storage or logging architecture where records can never be modified or deleted after creation. Required by many financial regulators for audit logs." },
        { term: "Hash Chain", definition: "A sequence of records where each record contains the hash of the previous record. Modifying any record breaks the chain and is detectable. Also the foundation of blockchain technology." },
        { term: "SHA-256", definition: "Secure Hash Algorithm 256-bit. A cryptographic hash function that produces a unique 64-character hex string for any input. Used to fingerprint audit events in ORDR." },
        { term: "4-Eyes Principle", definition: "A control requiring that any significant action (e.g., trade execution) be approved by a second authorised person. Also known as dual control. Required under EMIR for material hedges." },
        { term: "EMIR Art. 11", definition: "European Market Infrastructure Regulation Article 11. Requires risk mitigation techniques for OTC derivatives, including timely confirmation, portfolio reconciliation, and dispute resolution." },
        { term: "IFRS 9 §B6.4", definition: "The IFRS 9 requirement to maintain contemporaneous documentation of hedge relationships at inception and throughout the hedging period. The Audit Trail provides this documentation automatically." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// POSITION DESK — Treasury Control Tower
// ─────────────────────────────────────────────────────────────────────────────

export const POSITION_DESK_HELP: HelpPanelConfig = {
  pageTitle:    "Position Desk",
  pageSubtitle: "TREASURY CONTROL TOWER · LIFECYCLE",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 1,
        total:    7,
        label:    "Step 1 of 7 — Position Management",
        description:
          "The Position Desk is the starting point of the hedge workflow. Raw FX exposures (AR receivables, AP payables) are loaded here, either via CSV import, ERP connector, or manual entry. Positions flow through the lifecycle: NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED.",
        next: { label: "FX Market Data", href: "/currency-fx" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Position Desk is the Treasury Control Tower — the primary interface for managing all FX hedge positions from initial booking through to execution.\n\nPositions represent commercial FX exposures: accounts receivable (AR) in foreign currency, or accounts payable (AP). The desk tracks each position through a regulated lifecycle state machine with 4-eyes approval controls.\n\nKey actions: assign policy, mark ready to execute, propose execution (4-eyes), approve/reject proposals, confirm execution.",
    },
    {
      id:          "lifecycle",
      title:       "Position Lifecycle States",
      icon:        "⟳",
      type:        "variables",
      variables: [
        {
          name:        "NEW",
          type:        "Initial state",
          description: "Position has been created but no policy has been assigned. The hedge engine cannot run without a policy. Assign a policy to advance to POLICY_ASSIGNED.",
          source:      "Default state on creation",
        },
        {
          name:        "POLICY_ASSIGNED",
          type:        "Active",
          description: "A hedge policy has been linked to this position. The hedge engine can now run to compute the hedge plan. Mark as ready after the hedge plan is approved.",
          source:      "PATCH /v1/positions/{id}/assign-policy",
        },
        {
          name:        "READY_TO_EXECUTE",
          type:        "Pending",
          description: "Hedge plan computed and approved. A 4-eyes execution proposal (PROPOSE) should be created. The second approver reviews and approves or rejects.",
          source:      "PATCH /v1/positions/{id}/ready",
        },
        {
          name:        "HEDGED",
          type:        "Terminal (success)",
          description: "Hedge has been executed. IBKR or prime broker trade confirmation has been recorded. hedge_amount and hedge_rate are set. This is the final successful state.",
          source:      "PATCH /v1/positions/{id}/execute",
        },
        {
          name:        "REJECTED",
          type:        "Terminal (failure)",
          description: "Position was rejected during the 4-eyes review process, or manually rejected. A rejection_reason is recorded. Can be reopened (REOPEN → NEW) if circumstances change.",
          source:      "PATCH /v1/positions/{id}/reject",
        },
      ],
    },
    {
      id:          "fields",
      title:       "Position Fields Explained",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "record_id",
          type:        "string",
          description: "Your internal reference for this position — typically the ERP invoice or journal entry number. Used for reconciliation with your accounting system.",
          example:     "INV-2026-001",
          source:      "User input / ERP connector",
        },
        {
          name:        "type (flow_type)",
          type:        "AR | AP",
          description: "AR = Accounts Receivable (you will receive foreign currency — long FX, BUY direction). AP = Accounts Payable (you will pay foreign currency — short FX, SELL direction). The hedge direction is opposite to the exposure direction.",
          example:     "AR",
          source:      "User input",
        },
        {
          name:        "amount",
          type:        "number (local ccy)",
          description: "The notional amount in the foreign currency (not USD). E.g., 5,000,000 MXN. The engine converts to USD using the forward rate for the value_date bucket.",
          example:     "5000000",
          source:      "User input",
        },
        {
          name:        "value_date",
          type:        "YYYY-MM-DD",
          description: "The date when the FX flow is expected to settle. The engine assigns this position to the nearest calendar month bucket (the bucket whose month contains this date).",
          example:     "2026-03-15 → bucket 2026-03",
          source:      "User input",
        },
        {
          name:        "status",
          type:        "CONFIRMED | FORECAST",
          description: "CONFIRMED = contractually obligated, high certainty. FORECAST = expected but not yet contracted. The hedge policy applies different hedge ratios to each (e.g., 80% CONFIRMED, 50% FORECAST).",
          example:     "CONFIRMED",
          source:      "User input",
        },
        {
          name:        "hedge_rate",
          type:        "number",
          description: "The all-in forward rate at which the hedge was executed. Set when execution_status transitions to HEDGED. Used for IFRS 9 effectiveness testing (comparing actual to target forward rate).",
          example:     "18.7612",
          source:      "Set on execution confirmation",
        },
      ],
    },
    {
      id:    "workflow",
      title: "End-to-End Workflow",
      icon:  "→",
      type:  "workflow",
      steps: [
        { step: 1, label: "Import Positions", description: "Import via CSV (Upload CSV) or ERP connector (Connectors). Or add manually. Each position represents one FX cash flow.", link: "/upload-csv" },
        { step: 2, label: "Assign Policy", description: "Select one or more positions → click ASSIGN POLICY. Choose the correct hedge policy for this entity/currency." },
        { step: 3, label: "Run Hedge Engine", description: "Navigate to Input → select positions → run engine. The engine computes the hedge plan and creates a CalculationRun record.", link: "/input" },
        { step: 4, label: "Mark Ready to Execute", description: "After reviewing the hedge plan in Execution Bridge, mark positions as READY_TO_EXECUTE with the computed hedge amount and rate." },
        { step: 5, label: "4-Eyes Proposal", description: "Click PROPOSE on READY positions. A second authorised user must APPROVE the proposal before execution can proceed." },
        { step: 6, label: "Execute", description: "Once approved, execute the hedge via IBKR or prime broker. Record the execution reference to transition positions to HEDGED." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// POLICY DESK — Policy Assignment Control Center
// ─────────────────────────────────────────────────────────────────────────────

export const POLICY_DESK_HELP: HelpPanelConfig = {
  pageTitle:    "Policy Desk",
  pageSubtitle: "ASSIGNMENT CENTER · POLICY GOVERNANCE",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 2,
        total:    7,
        label:    "Step 2 of 7 — Policy Assignment",
        description:
          "Policy assignment is the critical governance step between position ingestion and hedge execution. Every FX position must be assigned a hedge policy before it can progress to calculation and execution. This desk provides four assignment modes: active policy quick-assign, template selection, favorites, and AI recommendations.",
        prev: { label: "Ingestion Desk", href: "/input" },
        next: { label: "Position Desk", href: "/position-desk" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "Policy Desk is the central hub for assigning hedge policies to FX positions. Positions arrive from the Ingestion Desk in NEW status, meaning they have no policy attached. Before a position can be hedged, it must be assigned a policy that defines hedge ratios, instruments, bucket allocation, and risk limits.\n\nThe desk supports four assignment modes:\n\n1. ACTIVE POLICY — Quick-assign using your company's currently activated policy (fastest for bulk operations)\n2. FROM TEMPLATE — Choose any policy from the library (system or company templates)\n3. FROM FAVORITES — Select from your frequently-used policies\n4. AI RECOMMEND — Let AI analyze position characteristics and suggest the optimal policy\n\nSelect positions using checkboxes, then click one of the assignment buttons in the bulk action bar.",
    },
    {
      id:    "workflow",
      title: "Assignment Workflow",
      icon:  "⚙",
      type:  "workflow",
      steps: [
        {
          step:        1,
          label:       "Filter Positions",
          description: "Use the NEEDS POLICY filter to show only positions in NEW status (no policy assigned). You can also search by record ID, entity, or currency.",
        },
        {
          step:        2,
          label:       "Select Positions",
          description: "Click checkboxes to select one or more positions. Use the header checkbox to select all visible positions. Selected count appears in the bulk action bar.",
        },
        {
          step:        3,
          label:       "Choose Assignment Mode",
          description: "Click one of the assignment buttons: ⚡ ACTIVE POLICY (instant), 📋 FROM TEMPLATE (library), ⭐ FROM FAVORITES (starred), or 🤖 AI RECOMMEND (intelligent suggestion).",
        },
        {
          step:        4,
          label:       "Confirm Assignment",
          description: "For template/favorite modes, a modal opens to select the policy. For AI mode, the system analyzes each position and suggests the best-fit policy with reasoning. Click ASSIGN to apply.",
        },
        {
          step:        5,
          label:       "Verify Status",
          description: "After assignment, positions transition from NEW → POLICY_ASSIGNED and appear in the POLICY ASSIGNED filter. The POLICY column shows the assigned policy name. Positions are now ready for hedge calculation.",
        },
      ],
    },
    {
      id:    "assignment-modes",
      title: "Assignment Modes",
      icon:  "⚡",
      type:  "glossary",
      glossary: [
        {
          term:       "Active Policy",
          definition: "The company's currently activated policy instance. This is the fastest assignment mode — no selection required. Ideal for bulk operations when all positions should use the same policy. The active policy is shown at the top of the library with an ACTIVE badge.",
        },
        {
          term:       "Template Selection",
          definition: "Choose any policy template from the library (system or company-specific). The modal shows template name, risk posture (CONSERVATIVE/MODERATE/AGGRESSIVE), category (CORPORATE/FINANCIAL/SOVEREIGN/SECTOR), and description. System templates are pre-seeded and marked with a SYSTEM badge.",
        },
        {
          term:       "Favorites",
          definition: "Your starred policies appear in the favorites modal for quick access. Star a policy from the Policy Library page to add it to favorites. You can add notes to each favorite (e.g., 'Use for EMEA AR positions'). Favorites persist per-user.",
        },
        {
          term:       "AI Recommendation",
          definition: "Click AI RECOMMEND to analyze selected positions and suggest the optimal policy for each. The AI considers currency, amount, value_date, entity, and flow type (AR/AP). Recommendations show confidence score (0-100%) and reasoning. You can review before applying.",
        },
      ],
    },
    {
      id:          "variables",
      title:       "Key Variables",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "execution_status",
          type:        "enum",
          description: "Position lifecycle state: NEW (no policy) → POLICY_ASSIGNED (policy attached) → READY_TO_EXECUTE (hedge calculated) → HEDGED (execution confirmed) or REJECTED (rejected at any stage). Policy Desk focuses on NEW → POLICY_ASSIGNED transition.",
          example:     "NEW",
          source:      "positions.execution_status",
        },
        {
          name:        "policy_id",
          type:        "UUID | null",
          description: "Foreign key to policy_instances table. NULL for NEW positions, populated after assignment. The policy instance captures which template was activated and when. Immutable after assignment (policy pinning for audit trail).",
          example:     "a1b2c3d4-e5f6-...",
          source:      "positions.policy_id",
        },
        {
          name:        "policy_revision_id",
          type:        "UUID | null",
          description: "Foreign key to policy_revisions table. Pinned revision at assignment time. Allows exact replay of 'which policy config governed this position' even after subsequent policy changes. This is the version-pinning anchor for regulatory compliance.",
          example:     "z9y8x7w6-v5u4-...",
          source:      "positions.policy_revision_id",
        },
        {
          name:        "risk_posture",
          type:        "CONSERVATIVE | MODERATE | AGGRESSIVE",
          description: "Policy template risk classification. CONSERVATIVE = max hedge ratios, min risk tolerance. MODERATE = balanced approach. AGGRESSIVE = min hedge ratios, max flexibility. Shown as a badge in template selection.",
          example:     "CONSERVATIVE",
          source:      "policy_templates.risk_posture",
        },
        {
          name:        "is_system",
          type:        "boolean",
          description: "TRUE = system-seeded template (cannot be deleted or modified). FALSE = company-specific template (user-created). System templates are marked with a SYSTEM badge in the library.",
          example:     "true",
          source:      "policy_templates.is_system",
        },
        {
          name:        "confidence",
          type:        "number (0.0-1.0)",
          description: "AI recommendation confidence score. 1.0 = perfect match, 0.5 = weak match. Based on position currency, amount range, tenor, and historical assignment patterns. Displayed as percentage (e.g., 87% CONFIDENCE).",
          example:     "0.87",
          source:      "AI engine output",
        },
      ],
    },
    {
      id:    "keyboard",
      title: "Keyboard Shortcuts",
      icon:  "⌨",
      type:  "glossary",
      glossary: [
        {
          term:       "/ (slash)",
          definition: "Focus the search box. Type a query to filter positions by record ID, entity, or currency. Press Esc to clear search.",
        },
        {
          term:       "Esc (escape)",
          definition: "Clear search query and unfocus search box. Also closes modals.",
        },
        {
          term:       "R (refresh)",
          definition: "Reload positions from the server. Useful after bulk assignment to verify status changes.",
        },
        {
          term:       "Space",
          definition: "Toggle row selection when a position row is focused (click row first).",
        },
      ],
    },
    {
      id:    "best-practices",
      title: "Best Practices",
      icon:  "✓",
      type:  "text",
      content:
        "**Use Active Policy for Bulk Operations**: When all positions follow the same hedge strategy, assign them all to the active policy in one click. This is the fastest workflow.\n\n**Star Frequently-Used Policies**: If you regularly assign different policies to different position types (e.g., one policy for AR, another for AP), star them both and use the favorites modal.\n\n**Let AI Handle Edge Cases**: For positions with unusual currencies, tenors, or amounts, use AI RECOMMEND to get a data-driven suggestion rather than guessing.\n\n**Verify Before Proceeding**: After bulk assignment, use the POLICY ASSIGNED filter to verify all positions have the correct policy. Click the policy chip to view policy details.\n\n**Policy Pinning Matters**: Once a position is assigned a policy, that policy revision is pinned. Even if you later modify the template, already-assigned positions retain the original configuration. This ensures audit trail integrity.",
    },
    {
      id:    "compliance",
      title: "Regulatory & Compliance",
      icon:  "⚖",
      type:  "text",
      content:
        "Policy assignment is a regulated operation under IFRS 9 hedge accounting rules. Every assignment creates an audit event that logs:\n\n- Actor (who assigned)\n- Timestamp (when)\n- Policy ID & Revision ID (which policy version)\n- Position IDs (which positions)\n- IP address & request ID (where/how)\n\nThe audit trail is tamper-evident (SHA-256 hash chain) and append-only. Policy pinning via policy_revision_id ensures that hedge effectiveness tests can be replayed exactly as they were at assignment time, even if the policy template is later modified or deleted.\n\nBulk operations are atomic: either all positions in a batch are assigned, or none are (fail-safe). Partial failures are logged with error messages in the bulk result banner.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION — Execution Hub
// ─────────────────────────────────────────────────────────────────────────────

export const EXECUTION_HELP: HelpPanelConfig = {
  pageTitle:    "Execution Hub",
  pageSubtitle: "PRE-TRADE · IBKR HANDOFF · MiFID II",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 4,
        total:    7,
        label:    "Step 4 of 7 — Trade Execution",
        description:
          "The Execution Hub is where approved hedge plans are turned into live trades. It provides the pre-trade compliance checklist (4-eyes, ISDA confirmation, board mandate), the IBKR JSON/FIX order payload, and settlement mechanics per bucket ticket.",
        prev: { label: "Hedge Engine", href: "/input" },
        next: { label: "Portfolio Risk", href: "/portfolio-risk" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Execution Hub bridges the computed hedge plan to real-world trade execution. Two modes:\n\n• EXECUTION BRIDGE: Live execution workflow — pre-trade compliance checklist, per-bucket instrument tickets, IBKR order payload (JSON + FIX protocol), settlement date calculation.\n\n• SIMULATION: Runs the sandbox engine with the same inputs for what-if analysis without committing to execution.\n\nAll execution events are written to the Audit Trail.",
    },
    {
      id:          "variables",
      title:       "Execution Variables",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "action_direction",
          type:        "BUY | SELL",
          description: "The direction of the hedge instrument for this bucket. BUY = you buy foreign currency forward (hedges a payable). SELL = you sell foreign currency forward (hedges a receivable/AR position).",
          example:     "SELL",
          source:      "BucketResult.action_direction",
        },
        {
          name:        "action_usd",
          type:        "number (USD)",
          description: "The notional USD value of the hedge instrument to execute for this bucket. Computed by the engine as: action_mxn / forward_rate. This is what you enter as the order notional.",
          example:     "$1,240,000",
          source:      "BucketResult.action_usd",
        },
        {
          name:        "suggested_contracts",
          type:        "integer",
          description: "For CME futures: the number of contracts to trade. Computed as: action_usd / (contract_size / forward_rate). Rounded to the nearest whole contract. For NDFs: not applicable (notional-based).",
          example:     "24 contracts",
          source:      "symbolMapper.mapBucketToInstrument().suggested_contracts",
        },
        {
          name:        "ibkr_symbol",
          type:        "string",
          description: "The Interactive Brokers instrument symbol for this currency/tenor. CME futures: e.g., MXN. For NDFs: the IBKR NDF ticker. Used in the JSON order payload.",
          example:     "MXN (CME Jun 2026 futures)",
          source:      "symbolMapper.CCY_SPEC_MAP.ibkrSymbol",
        },
        {
          name:        "settlement_date",
          type:        "YYYY-MM-DD",
          description: "The last business day of the bucket month. Computed as: find last calendar day of month, step back while Saturday or Sunday. This is the NDF fixing date (T+2 for spot, last bus. day for the month).",
          example:     "2026-03-31 (last bus. day of March)",
          source:      "Computed: lastBusinessDay(bucket)",
        },
        {
          name:        "stressSigma",
          type:        "0.08 | 0.15 | 0.22",
          description: "The stress sigma selector for worst-case P&L preview on each ticket. ±8% = 1σ, ±15% = 2σ, ±22% = 3σ move in the underlying FX rate. Controls the worst-case hedge benefit display.",
          example:     "0.10 (default)",
          source:      "ExecutionBridge component state",
        },
        {
          name:        "friction_usd",
          type:        "number (USD)",
          description: "The estimated transaction cost for this bucket: bid-offer spread × notional. Set by policy.cost_assumptions.spread_bps. Shown as 'Est. Friction' in the execution summary.",
          example:     "$3,100",
          source:      "BucketResult.friction_usd",
        },
      ],
    },
    {
      id:    "workflow",
      title: "Execution Workflow",
      icon:  "→",
      type:  "workflow",
      steps: [
        { step: 1, label: "Complete Pre-Flight Checklist", description: "The ED-00A panel shows 6 authorization items. 3 auto-check from the engine (validation PASS, policy limits, run ID). 3 require manual tick: board mandate, counterparty credit check, ISDA confirmation." },
        { step: 2, label: "Review Bucket Tickets", description: "Each tenor bucket shows a ticket with instrument, notional, direction, settlement date, ISDA reference, DV01, and initial margin estimate." },
        { step: 3, label: "Click IBKR to open order modal", description: "The IBKR handoff modal shows 4 tabs: Instructions, JSON Order Payload, FIX Protocol Fields, and IBKR FXTrader deep-link." },
        { step: 4, label: "Copy JSON payload to TWS", description: "Copy the JSON order payload and paste into IBKR Trader Workstation or Client Portal API. The referenceId field links the IBKR trade back to this run." },
        { step: 5, label: "Record execution reference", description: "After execution, record the IBKR trade confirmation reference in Position Desk → HEDGED transition.", link: "/position-desk" },
      ],
    },
    {
      id:      "glossary",
      title:   "Execution Glossary",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "DV01", definition: "Dollar Value of a 1 Basis Point move. The change in instrument value for a 1bp change in the underlying rate. For FX NDFs: DV01 ≈ notional × 0.0001. Used for duration risk management." },
        { term: "FIX Protocol", definition: "Financial Information eXchange protocol. An industry-standard messaging format for electronic trading. ClOrdID uniquely identifies your order. Used by most institutional execution venues." },
        { term: "Initial Margin", definition: "Collateral required by the exchange or clearing house before a position is entered. For CME futures, typically 2–5% of notional. Returned when position is closed." },
        { term: "ISDA Master Agreement", definition: "The 2002 ISDA Master Agreement is the standard legal framework for OTC derivatives (NDFs, FX Forwards). Must be in place with each counterparty before trading." },
        { term: "MiFID II", definition: "Markets in Financial Instruments Directive II (EU). Requires pre-trade transparency, best execution documentation, and post-trade reporting for all OTC derivatives." },
        { term: "Basis Risk", definition: "The residual risk when a hedge instrument does not perfectly offset the hedged item. Proxy hedges (e.g., using CME MXN futures for Colombian Peso exposure) have higher basis risk." },
        { term: "TWS", definition: "Trader Workstation. Interactive Brokers' professional trading platform. Accepts manual entry or automated order submission via the IBKR Client Portal API." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO STUDIO — Stress Testing
// ─────────────────────────────────────────────────────────────────────────────

export const SCENARIO_STUDIO_HELP: HelpPanelConfig = {
  pageTitle:    "Scenario Studio",
  pageSubtitle: "STRESS TESTING · MC SIMULATION",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 3,
        total:    7,
        label:    "Step 3 of 7 — Scenario Analysis",
        description:
          "The Scenario Studio sits between market data and execution. It runs stress tests and Monte Carlo simulations to quantify hedge effectiveness under various market shocks, informing the hedge ratio and tenor decisions before execution.",
        prev: { label: "FX Market Data", href: "/currency-fx" },
        next: { label: "Execution Hub", href: "/execution" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Scenario Studio allows running deterministic and Monte Carlo stress scenarios against the hedge portfolio.\n\nScenario Library: pre-defined scenarios (macro shocks, EM stress, commodity events) that can be run against the current positions.\n\nShock Ladder: a grid of FX spot shocks from −20% to +20%, showing P&L impact at each level for hedged vs unhedged portfolios.\n\nP&L Distribution: Monte Carlo simulation output showing the full distribution of outcomes, with percentile analysis.\n\nNote: Scenario engine integration is in progress — run the hedge engine from Position Desk/Input to generate live scenario grids.",
    },
    {
      id:          "variables",
      title:       "Scenario Variables",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "sigma",
          type:        "number (fraction)",
          description: "The standard deviation (sigma) of the FX spot rate shock. sigma=0.10 means a ±10% shock. The engine runs shocks at −3σ, −2σ, −1σ, 0, +1σ, +2σ, +3σ.",
          example:     "0.10 (±10%)",
          source:      "ScenarioResults.sigmas[]",
        },
        {
          name:        "shocked_spot",
          type:        "number",
          description: "The FX spot rate after applying the sigma shock: spot × (1 + sigma). Used to revalue all positions and hedges at the stressed rate.",
          example:     "20.2620 = 18.4200 × (1 + 0.10)",
          source:      "ScenarioTotalResult.shocked_spot",
        },
        {
          name:        "hedge_benefit_usd",
          type:        "number (USD)",
          description: "The USD P&L benefit of the hedge programme in this scenario: hedged_position_P&L − unhedged_position_P&L. Positive = hedge protects value. Negative (rare) = hedge hurts in this scenario.",
          example:     "+$8,240,000",
          source:      "ScenarioTotalResult.total_hedge_benefit_usd",
        },
        {
          name:        "monte_carlo_paths",
          type:        "integer",
          description: "Number of simulation paths in the Monte Carlo engine. More paths = smoother distribution but slower computation. Default: 10,000 paths with EWMA volatility and GBM process.",
          example:     "10,000",
          source:      "Scenario Studio run parameters",
        },
      ],
    },
    {
      id:      "glossary",
      title:   "Scenario Glossary",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "Monte Carlo", definition: "A simulation method that generates thousands of random price paths to estimate the distribution of portfolio outcomes. Used to compute VaR, CVaR, and tail risk beyond what parametric methods capture." },
        { term: "GBM", definition: "Geometric Brownian Motion. The standard model for FX rate evolution in quantitative finance: dS = μ·S·dt + σ·S·dW. Assumes log-normal returns and constant volatility." },
        { term: "Shock Ladder", definition: "A scenario grid showing portfolio P&L at discrete FX rate shock levels (e.g., −20% to +20% in 5% increments). Shows non-linearity and the breakeven hedge level." },
        { term: "P&L Distribution", definition: "The probability distribution of portfolio gains/losses across all simulation paths. Key statistics: mean, VaR (percentile), CVaR (tail average), skewness, kurtosis." },
        { term: "Crisis Scenario", definition: "A named historical or hypothetical stress event (e.g., 'EM Taper Tantrum 2013', 'COVID-19 March 2020'). Uses historical or estimated shock parameters." },
        { term: "What-If Builder", definition: "A tool for constructing custom multi-factor scenarios: simultaneous shocks to FX rate, interest rates, volatility, and correlation. Used for ICAAP and internal stress testing." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// COMMITTEE PACK — Print-Ready IFRS 9 Pack
// ─────────────────────────────────────────────────────────────────────────────

export const COMMITTEE_PACK_HELP: HelpPanelConfig = {
  pageTitle:    "Committee Pack",
  pageSubtitle: "IFRS 9 §B6.4 · WORM SEALED",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 6,
        total:    7,
        label:    "Step 6 of 7 — Governance Documentation",
        description:
          "The Committee Pack is the formal governance output. It assembles all run data — RunEnvelope hash chain, TraceLite audit narrative, PolicyRevision, hedge plan, and scenario grid — into a print-ready document for the Investment Committee.",
        prev: { label: "Portfolio Risk", href: "/portfolio-risk" },
        next: { label: "Audit Trail", href: "/audit-trail" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Committee Pack is a print-ready IFRS 9 hedge effectiveness documentation pack. It satisfies IFRS 9 §B6.4.1 requirements for formal documentation that must be prepared at hedge inception and on each reporting date.\n\nThe pack is fetched from the database-backed endpoint (GET /v1/export/committee-pack/{run_id}) and assembled from the WORM-sealed CalculationRun record. It is immutable once the run is committed.\n\nClick PRINT / EXPORT PDF to generate a PDF via the browser print dialog.",
    },
    {
      id:          "variables",
      title:       "Pack Sections Explained",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "CP-01 — Cover Page",
          description: "Run metadata: run ID, engine version, timestamp, trade count, hedge bucket count. The IFRS 9 attestation statement confirming this document constitutes formal hedge effectiveness documentation.",
          source:      "meta + regulatory.attestation",
        },
        {
          name:        "CP-02 — Hash Chain",
          description: "The 8-field RunEnvelope SHA-256 hash chain: run_hash, inputs_hash, outputs_hash, trades_hash, hedges_hash, market_hash, policy_hash, engine_version. Click any hash to copy. This is the WORM fingerprint.",
          source:      "run_envelope (8 SHA-256 fields)",
        },
        {
          name:        "CP-03 — TraceLite Audit Trail",
          description: "The pipeline stage narrative: PARSE → VALIDATE → NORMALIZE → KERNEL → SCENARIO → AUDIT. Each stage records a timestamp, description, and structured data snapshot. Proves the computation path.",
          source:      "trace_lite.events[]",
        },
        {
          name:        "CP-04 — Policy Configuration",
          description: "The pinned PolicyRevision canonical configuration. Shows the exact policy parameters used at calc time: hedge ratios, cost assumptions, execution product, bucket mode. Policy hash proves no change post-execution.",
          source:      "policy_revision (or UNPINNED warning)",
        },
        {
          name:        "CP-05 — Hedge Plan",
          description: "Bucket-level hedge actions: each month's commercial exposure, target hedge notional, action direction, instrument type, friction cost. The proposed hedge programme for committee approval.",
          source:      "hedge_plan.buckets[]",
        },
        {
          name:        "CP-06 — Scenario Grid",
          description: "Stress scenario results: for each sigma value, the shocked spot rate, hedged vs unhedged P&L, and hedge benefit. Demonstrates hedge effectiveness under adverse scenarios.",
          source:      "scenarios[] (ScenarioTotalResult[])",
        },
        {
          name:        "CP-07 — Regulatory Notes",
          description: "IFRS 9 §B6.4 attestation, EMIR Article 11 reference, Dodd-Frank §731 note (if applicable), WORM storage confirmation.",
          source:      "regulatory (static attestation text)",
        },
      ],
    },
    {
      id:      "glossary",
      title:   "Regulatory Glossary",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "RunEnvelope", definition: "The cryptographic record of a single hedge engine computation. Contains 8 SHA-256 hashes covering inputs, outputs, trades, hedges, market data, policy, and the combined run hash. Provides byte-for-byte audit proof." },
        { term: "TraceLite", definition: "The lightweight pipeline audit trail stored alongside each CalculationRun. Records each computation stage with timestamp and structured data, enabling forensic reconstruction of how results were derived." },
        { term: "PolicyRevision", definition: "An immutable snapshot of the hedge policy configuration at the time a calculation was run. Pinning a PolicyRevision (WORM) proves that the policy used in the hedge plan matches the approved policy." },
        { term: "IFRS 9 §B6.4", definition: "The IFRS 9 application guidance for hedge effectiveness documentation. Requires contemporaneous documentation of: the hedging relationship, risk management objective, and how effectiveness will be assessed." },
        { term: "EMIR Art. 11", definition: "Requires timely confirmation (T+2 for FX), portfolio reconciliation, and dispute resolution for all OTC derivatives. Trade details must be reported to a registered Trade Repository." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX — Advanced Scenario Analysis
// ─────────────────────────────────────────────────────────────────────────────

export const SANDBOX_HELP: HelpPanelConfig = {
  pageTitle:    "Sandbox",
  pageSubtitle: "STRESS TESTING · SIMULATION ENGINE",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 3,
        total:    7,
        label:    "Step 3 (Alt) — Simulation",
        description:
          "The Sandbox is the advanced simulation environment. It mirrors the live execution workflow but runs in a non-committing mode, allowing full analysis without creating audit events or modifying positions.",
        prev: { label: "FX Rates", href: "/currency-fx" },
        next: { label: "Execution Hub", href: "/execution" },
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Sandbox runs the same hedge engine as the live system but in a simulation context — no audit events, no position state changes.\n\nSeven analysis tabs:\n• Stress Testing: scenario grid P&L analysis\n• Risk Attribution: factor decomposition\n• Crisis Library: named historical stress events\n• What-If Builder: custom multi-factor scenarios\n• Regulatory Capital: IFRS 9 capital impact\n• Market Microstructure: liquidity and execution cost\n• Audit: simulation run audit trail\n\nUse the Demo Fixture Selector to load pre-built scenarios without needing live positions.",
    },
    {
      id:      "glossary",
      title:   "Sandbox Glossary",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "sandboxResult", definition: "The Redux state slice holding the simulation output from sandboxCalculateThunk. Mirrors CalculateResponse but is stored separately from the live HedgeContext." },
        { term: "Demo Fixture", definition: "A pre-built set of positions, market data, and policy configuration for demonstration purposes. Loaded via the Demo Fixture Selector when no live positions are available." },
        { term: "X-Ray Drawer", definition: "An inspection panel (opened via X-RAY button) that shows the raw JSON of any data structure — useful for debugging and understanding the calculation internals." },
        { term: "Crisis Library", definition: "A collection of named historical FX stress events with their associated shock parameters (e.g., 2013 Taper Tantrum: USD/MXN +18%). Used for historical scenario analysis." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HEDGE WIKI — Governance Knowledge Graph
// ─────────────────────────────────────────────────────────────────────────────

export const HEDGEWIKI_HELP: HelpPanelConfig = {
  pageTitle:    "HedgeWiki",
  pageSubtitle: "GOVERNANCE KNOWLEDGE GRAPH",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "HedgeWiki is the institutional knowledge graph — a linked database of governance concepts, regulatory standards, instrument definitions, and policy templates relevant to the ORDR hedge workflow.\n\n20 articles across 6 domains: FX Instruments, ISDA Framework, IFRS 9, ASC 815 (US GAAP), Policy Templates, and HedgeCore Architecture.\n\nEach article includes: authoritative citations (ISDA, IFRS, SEC), HedgeCore field linkage, audit notes, and links to related articles.",
    },
    {
      id:      "domains",
      title:   "Knowledge Domains",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "FX Instruments", definition: "Non-Deliverable Forwards (NDF), FX Swaps, Vanilla Options, Cross-Currency Swaps. Instrument mechanics, settlement conventions, and use cases in corporate hedging programmes." },
        { term: "ISDA Framework", definition: "The ISDA Master Agreement legal framework: close-out netting provisions, Credit Support Annexes (CSA), master confirmation agreements. Required documentation for all OTC derivative counterparties." },
        { term: "IFRS 9 Standard", definition: "International Financial Reporting Standard 9 — Financial Instruments. Chapter 6: Hedge Accounting. Includes: hedge effectiveness (§6.4.1), cash flow hedges (§6.5.11), fair value hedges." },
        { term: "ASC 815 (US GAAP)", definition: "US Generally Accepted Accounting Principles standard for derivative instruments and hedging activities. Requires formal documentation, prospective effectiveness assessment, and quarterly retrospective testing." },
        { term: "Policy Templates", definition: "Standard hedge policy configurations: hedge ratio policy (confirmed vs forecast ratios), tenor bucketing conventions, minimum trade size thresholds." },
        { term: "HedgeCore Architecture", definition: "Technical documentation of the ORDR engine: exposure model, netting engine, bucketing algorithm, ladder generator. Describes how raw trade data flows to hedge plan outputs." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — Institutional Dashboard
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
        "The Dashboard is the institutional command centre — a role-based, customisable widget grid showing key metrics across the entire hedge workflow.\n\nWidgets include: KPI Summary (VaR, exposure, hedge cover), Recent Runs (last 5 engine runs), Pending Approvals (4-eyes proposals awaiting action), Team Activity (audit event feed), Branch Comparison (multi-branch exposure), Pipeline Status (workflow stage tracker), Quick Actions (shortcuts), and Exposure Summary (currency breakdown).\n\nDrag and resize widgets to customise your layout. Your layout is saved and restored on each login.",
    },
    {
      id:      "widgets",
      title:   "Widget Glossary",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "KPI Summary", definition: "Key Portfolio Indicators: Total VaR 99%, gross exposure, hedge cover %, and net delta. Computed from the most recent active calculation run." },
        { term: "Recent Runs", definition: "The last 5 hedge engine calculation runs with run ID, timestamp, trade count, and hedge plan summary. Click any run to open in Run Viewer." },
        { term: "Pending Approvals", definition: "4-eyes execution proposals awaiting a second approver. Shows proposal ID, position, amount, and submitter. Direct approval/rejection from the widget." },
        { term: "Pipeline Status", definition: "A visual tracker of the 7-step hedge workflow showing which stages have been completed for the active portfolio." },
        { term: "Exposure Summary", definition: "Per-currency breakdown of gross FX exposure from the position ledger. Shows confirmed vs forecast split and hedge cover ratio per currency." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS — Configuration Hub
// ─────────────────────────────────────────────────────────────────────────────

export const SETTINGS_HELP: HelpPanelConfig = {
  pageTitle:    "Settings",
  pageSubtitle: "PLATFORM CONFIGURATION · INSTITUTIONAL",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "Platform configuration hub with 5 tabs:\n\n• General: organisation name, base currency, timezone\n• Policy Limits: default hedge ratios, minimum trade size, spread assumptions\n• Execution: default execution product (NDF/FWD), stress sigma, friction threshold\n• API & Keys: market data provider credentials, backend URL\n• Notifications: alert thresholds, email recipients, webhooks\n\nSettings are persisted to localStorage (browser-local). Backend API persistence integration is planned.",
    },
    {
      id:          "variables",
      title:       "Key Settings Explained",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "base_currency",
          type:        "FuturesCurrency",
          description: "The primary currency of your FX exposure (the local currency you receive/pay). Used as the default Y-axis currency for forward curves and exposure calculations. E.g., MXN for a Mexico operation.",
          example:     "MXN",
          source:      "Settings → General tab",
        },
        {
          name:        "hedge_ratio_confirmed",
          type:        "percentage (0.00–1.00)",
          description: "Default hedge ratio applied to CONFIRMED positions. The policy engine will target this coverage for all confirmed FX flows. Override at the policy level for specific instruments.",
          example:     "0.80 (= 80%)",
          source:      "Settings → Policy Limits → policy.hedge_ratios.confirmed",
        },
        {
          name:        "hedge_ratio_forecast",
          type:        "percentage (0.00–1.00)",
          description: "Default hedge ratio for FORECAST positions. Typically lower than confirmed (e.g., 50%) to reflect the higher uncertainty of uncontracted cash flows.",
          example:     "0.50 (= 50%)",
          source:      "Settings → Policy Limits → policy.hedge_ratios.forecast",
        },
        {
          name:        "spread_bps",
          type:        "integer (basis points)",
          description: "Assumed bid-offer spread in basis points for friction cost calculation. 5bps = 0.05%. Applies to all hedge instruments. Used in friction_usd = (notional × spread_bps / 10000).",
          example:     "5 bps",
          source:      "Settings → Policy Limits → policy.cost_assumptions.spread_bps",
        },
        {
          name:        "min_trade_size_usd",
          type:        "number (USD)",
          description: "Minimum notional USD threshold below which a hedge action is suppressed. Prevents uneconomical small trades that would cost more in friction than they hedge.",
          example:     "$25,000",
          source:      "Settings → Policy Limits → policy.min_trade_size_usd",
        },
        {
          name:        "ALPHA_VANTAGE_API_KEY",
          type:        "string (secret)",
          description: "Your Alpha Vantage API key for live FX rate data. Without this, the market data module falls back to indicative (cached/estimated) rates. Do not share this key.",
          example:     "ABCD1234EFGH5678",
          source:      "Settings → API & Keys → environment/localStorage",
        },
      ],
    },
    {
      id:          "env_vars",
      title:       "Windows Environment Variables",
      icon:        "⊠",
      type:        "variables",
      variables: [
        {
          name:        "DATABASE_URL",
          type:        "connection string",
          description: "PostgreSQL connection URL for the backend. Format: postgresql+asyncpg://user:password@host:port/dbname. On Render cloud, append ?ssl=require. For local dev on Windows, use 127.0.0.1.",
          example:     "postgresql+asyncpg://hedgecalc:pw@127.0.0.1:5432/hedgecalc",
          source:      "backend/.env or system environment",
        },
        {
          name:        "ASYNC_DATABASE_URL",
          type:        "connection string",
          description: "Async variant of DATABASE_URL used by SQLAlchemy async engine. Must use the postgresql+asyncpg:// driver prefix. Typically mirrors DATABASE_URL.",
          example:     "postgresql+asyncpg://hedgecalc:pw@127.0.0.1:5432/hedgecalc",
          source:      "backend/.env",
        },
        {
          name:        "JWT_SECRET",
          type:        "string (secret)",
          description: "HMAC secret key for HS256 JWT token signing. Used to create 30-minute access tokens and 7-day refresh tokens. Must match between all backend instances.",
          example:     "***REDACTED_JWT_SECRET***",
          source:      "backend/.env — never commit production secrets",
        },
        {
          name:        "ENV",
          type:        "dev | test | production",
          description: "Runtime environment flag. Controls logging verbosity, CORS origins, debug endpoints, and seed behaviour. Set to 'test' for E2E testing, 'dev' for local development.",
          example:     "dev",
          source:      "backend/.env",
        },
        {
          name:        "DB_HOST",
          type:        "hostname or IP",
          description: "PostgreSQL host. Use 127.0.0.1 for local Windows dev, hedgecalc_db for Docker Compose, or the Render external hostname for cloud.",
          example:     "127.0.0.1 (Windows) / hedgecalc_db (Docker)",
          source:      "backend/.env",
        },
        {
          name:        "DB_PORT",
          type:        "integer",
          description: "PostgreSQL port. Default is 5432. Ensure Windows Firewall allows inbound connections on this port if running PostgreSQL locally.",
          example:     "5432",
          source:      "backend/.env",
        },
        {
          name:        "DB_USER / DB_PASSWORD",
          type:        "string",
          description: "PostgreSQL credentials. Created during pg_ctl initdb or via CREATE ROLE. The user must have CREATEDB privilege for test database creation.",
          example:     "hedgecalc / ***REDACTED_DB_PASSWORD***",
          source:      "backend/.env",
        },
        {
          name:        "DB_NAME",
          type:        "string",
          description: "PostgreSQL database name. The backend connects to this database. Create with: CREATE DATABASE hedgecalc OWNER hedgecalc.",
          example:     "hedgecalc",
          source:      "backend/.env",
        },
        {
          name:        "REDIS_URL",
          type:        "connection string",
          description: "Redis connection URL for rate limiting and caching. Format: redis://host:port/db. Optional for local dev — rate limiter falls back to in-memory if unavailable.",
          example:     "redis://127.0.0.1:6379/0",
          source:      "root .env (Docker Compose)",
        },
        {
          name:        "ALPHA_VANTAGE_API_KEY",
          type:        "string (secret)",
          description: "API key for Alpha Vantage FX rate provider. Without this key, the Currency FX module shows INDICATIVE data. Free tier: 25 requests/day. Premium: unlimited.",
          example:     "ABCD1234EFGH5678",
          source:      "Settings → API & Keys or system environment",
        },
      ],
    },
    {
      id:    "win_setup",
      title: "Windows Dev Setup",
      icon:  "→",
      type:  "workflow",
      steps: [
        {
          step:        1,
          label:       "Install PostgreSQL 14+",
          description: "Download from postgresql.org. During install, set superuser password and add to PATH. Verify: psql --version. Create the hedgecalc user and database.",
        },
        {
          step:        2,
          label:       "Install Python 3.12+",
          description: "Download from python.org. Check 'Add to PATH' during install. Verify: python --version. Create venv: python -m venv .venv && .\\.venv\\Scripts\\activate.",
        },
        {
          step:        3,
          label:       "Install Node.js 20+",
          description: "Download LTS from nodejs.org. Verify: node --version && npm --version. Install pnpm globally: npm install -g pnpm.",
        },
        {
          step:        4,
          label:       "Configure backend/.env",
          description: "Copy backend/.env.example to backend/.env. Set DATABASE_URL to your local PostgreSQL. Set JWT_SECRET. Set ENV=dev. Ensure DB_HOST=127.0.0.1.",
        },
        {
          step:        5,
          label:       "Install backend dependencies",
          description: "cd backend && pip install -r requirements.txt. Key packages: fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, pydantic, python-jose, passlib, httpx.",
        },
        {
          step:        6,
          label:       "Install frontend dependencies",
          description: "cd frontend && pnpm install. Key packages: next, react, @reduxjs/toolkit, tailwindcss, echarts, recharts, jspdf.",
        },
        {
          step:        7,
          label:       "Start services",
          description: "Backend: cd backend && uvicorn app.main:app --reload --port 8000. Frontend: cd frontend && pnpm dev. Health check: GET http://localhost:8000/api/health.",
        },
      ],
    },
    {
      id:      "modules",
      title:   "Platform Module Reference",
      icon:    "⊞",
      type:    "glossary",
      glossary: [
        { term: "Position Desk", definition: "Step 1/7. Treasury Control Tower — import, create, and manage FX hedge positions. Lifecycle: NEW > POLICY_ASSIGNED > READY_TO_EXECUTE > HEDGED. Routes: /api/v1/positions. Key vars: record_id, flow_type (AR/AP), amount, currency, value_date, execution_status." },
        { term: "Currency FX", definition: "Step 2/7. Market Data Hub — live FX spot rates and 12-month forward curves from Alpha Vantage. Key vars: spot rate, forward_points, all_in_rate, ann_basis, data_class (LIVE/INDICATIVE). Requires ALPHA_VANTAGE_API_KEY." },
        { term: "Scenario Studio", definition: "Step 3/7. Stress testing and Monte Carlo simulation. Shock ladder (-20% to +20%), crisis library, what-if builder. Key vars: sigma, shocked_spot, hedge_benefit_usd, monte_carlo_paths." },
        { term: "Execution Hub", definition: "Step 4/7. Pre-trade compliance and IBKR handoff. 6-item pre-flight checklist, per-bucket instrument tickets, JSON/FIX order payloads. Key vars: action_direction, action_usd, ibkr_symbol, settlement_date, DV01." },
        { term: "Portfolio Risk", definition: "Step 5/7. R1-R8 risk decomposition (Basel III taxonomy). R1 Delta, R4 Carry, R5 Correlation, R6 CVA, R7 Liquidity, R8 Tail. Key metrics: VaR 99%, CVaR, Hedge Cover %, IFRS 9 Effectiveness." },
        { term: "Committee Pack", definition: "Step 6/7. IFRS 9 §B6.4 print-ready governance documentation. 7 sections: Cover, Hash Chain, TraceLite, Policy Config, Hedge Plan, Scenario Grid, Regulatory Notes. WORM-sealed." },
        { term: "Audit Trail", definition: "Step 7/7. WORM governance ledger with SHA-256 hash chaining. Event types: INGEST, LIFECYCLE, PROPOSAL, APPROVAL, EXECUTION, POLICY, IMPORT. Tamper-evident, append-only." },
        { term: "Sandbox", definition: "Step 3 (Alt). Non-committing simulation engine. 7 analysis tabs: Stress Testing, Risk Attribution, Crisis Library, What-If Builder, Regulatory Capital, Market Microstructure, Audit." },
        { term: "Policy Engine", definition: "AI wizard + policy library. 20 system templates (SME, FULL, CNSV, BLNC, ACTV). PolicyTemplate > PolicyInstance (activation) > PolicyRevision (WORM snapshot). Key vars: bucket_mode, hedge_ratios, cost_assumptions." },
        { term: "Run Viewer", definition: "TraceLite audit replay. 8-field RunEnvelope SHA-256 hash chain: run_hash, inputs_hash, outputs_hash, trades_hash, hedges_hash, market_hash, policy_hash, engine_version. Immutable CalculationRun records." },
        { term: "Dashboard", definition: "Role-based widget grid. Widgets: KPI Summary (VaR, exposure), Recent Runs, Pending Approvals (4-eyes), Team Activity, Branch Comparison, Pipeline Status, Exposure Summary." },
        { term: "HedgeWiki", definition: "Governance knowledge graph. 20 articles across 6 domains: FX Instruments, ISDA Framework, IFRS 9, ASC 815, Policy Templates, HedgeCore Architecture." },
        { term: "Settings", definition: "Platform configuration. 5 tabs: General (org, currency, timezone), Policy Limits (ratios, min trade), Execution (product, sigma), API & Keys (Alpha Vantage, IBKR), Notifications (alerts, webhooks)." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// RUN VIEWER — TraceLite Audit Viewer
// ─────────────────────────────────────────────────────────────────────────────

export const RUN_VIEWER_HELP: HelpPanelConfig = {
  pageTitle:    "Run Viewer",
  pageSubtitle: "TRACYLITE AUDIT · SHA-256 HASH CHAIN",
  sections: [
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "The Run Viewer shows the full audit trail for a single hedge engine calculation run — the TraceLite pipeline narrative and RunEnvelope SHA-256 hash chain.\n\nEvery run is immutably stored in the calculation_runs database table. This viewer reconstructs exactly what the engine computed, from which inputs, under which policy.\n\nUse Run Viewer for: audit replay, dispute resolution, IFRS 9 documentation, and investigating unexpected hedge plan outputs.",
    },
    {
      id:          "variables",
      title:       "Run Viewer Fields",
      icon:        "≡",
      type:        "variables",
      variables: [
        {
          name:        "run_id",
          type:        "UUID string",
          description: "The unique identifier for this calculation run. Immutable — used in all downstream references (audit events, position records, committee packs). Format: UUID v4.",
          example:     "8f3a2c1d-...",
          source:      "CalculationRun.id",
        },
        {
          name:        "run_hash",
          type:        "SHA-256 hex",
          description: "The top-level fingerprint of this entire run: SHA-256(inputs_hash + outputs_hash + timestamp + engine_version). If any input or output changes, this hash changes.",
          source:      "RunEnvelope.run_hash",
        },
        {
          name:        "inputs_hash",
          type:        "SHA-256 hex",
          description: "SHA-256 hash of the calculation inputs: trades, hedges, market data, policy. Proves exactly what data the engine received.",
          source:      "RunEnvelope.inputs_hash",
        },
        {
          name:        "outputs_hash",
          type:        "SHA-256 hex",
          description: "SHA-256 hash of the calculation outputs: hedge plan, scenario results, validation report. Proves exactly what the engine produced.",
          source:      "RunEnvelope.outputs_hash",
        },
        {
          name:        "policy_revision_id",
          type:        "UUID | null",
          description: "The ID of the pinned PolicyRevision used in this run. If set, the policy parameters are WORM-sealed — the exact policy configuration can be retrieved for audit replay.",
          source:      "CalculationRun.policy_revision_id",
        },
        {
          name:        "TraceLite events",
          type:        "array",
          description: "Ordered list of pipeline stage events: PARSE, VALIDATE, NORMALIZE, KERNEL, SCENARIO, AUDIT. Each event has a timestamp, description, and structured data payload capturing the stage output.",
          source:      "CalculationRun.trace_lite.events[]",
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// POLICY ENGINE — Policy Library
// ─────────────────────────────────────────────────────────────────────────────

export const POLICY_LIBRARY_HELP: HelpPanelConfig = {
  pageTitle:    "Policy Engine",
  pageSubtitle: "FX HEDGE POLICY LIBRARY · SYSTEM PRESETS",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position:    4,
        total:       7,
        label:       "Step 4 of 7 — Policy Engine",
        description: "The Policy Engine governs every hedge calculation. Select a system preset or build a custom policy using the AI Wizard. Activate one policy per branch — all subsequent calculations use that policy's parameters until changed.",
        prev: { label: "Position Desk",   href: "/position-desk" },
        next: { label: "Run Engine",      href: "/input" },
      },
    },
    {
      id:      "overview",
      title:   "What this page does",
      icon:    "ℹ",
      type:    "text",
      content: "The Policy Library shows all 33 system-defined hedge presets organised by category (Corporate, Financial, Sovereign, Sector). Each preset encodes a full hedge governance mandate: confirmed and forecast ratios, spread budget, execution instrument, and minimum trade size.\n\nClick ACTIVATE POLICY on any preset to make it the live policy for your branch. Only one policy can be active at a time — activating a new one automatically deactivates the previous one and creates an immutable WORM audit revision.\n\nCustom AI-generated policies appear in the CUSTOM POLICIES section below the presets. Use the ★ bookmark icon to add any policy to your favorites for quick access from the Position Desk.",
    },
    {
      id:        "variables",
      title:     "Key Policy Variables",
      icon:      "≡",
      type:      "variables",
      variables: [
        {
          name:        "hedge_ratio_confirmed",
          type:        "float · 0.0 – 1.0",
          description: "Fraction of CONFIRMED (firm order / invoice) FX exposure to hedge. A value of 1.0 means 100% of all confirmed payables/receivables are hedged. IFRS 9.6.4.1(a) requires the hedged item to be reliably measurable.",
          example:     "1.0 (full coverage)",
          source:      "IFRS 9.6.4.1(a); BIS FX Survey 2022 median: 0.85",
        },
        {
          name:        "hedge_ratio_forecast",
          type:        "float · 0.0 – 1.0",
          description: "Fraction of FORECAST (highly probable) FX exposure to hedge. Must not exceed confirmed ratio to satisfy IFRS 9.6.4.1(b) 'highly probable' criterion. Sovereign and EM issuers typically set 0.0–0.3.",
          example:     "0.5 (50% of forecast flows)",
          source:      "IFRS 9.6.4.1(b); ECB Occasional Paper No. 312",
        },
        {
          name:        "spread_bps",
          type:        "float · basis points",
          description: "All-in transaction cost assumption per leg, in basis points. Covers bid-offer spread plus any brokerage commission. Interbank desks operate at 1–3 bps; corporate treasury typically pays 4–10 bps; SME / NDF desks 15–30 bps.",
          example:     "5.0 bps (mid-market corporate)",
          source:      "ISDA 2022 FX Working Group; Chatham Financial 2023 Cost Survey",
        },
        {
          name:        "execution_product",
          type:        "enum · FWD | NDF",
          description: "FWD (Deliverable Forward): physically settled, used for G10 and convertible EM currencies. NDF (Non-Deliverable Forward): cash-settled in USD, used for restricted EM currencies (MXN, BRL, INR, KRW, IDR). NDFs carry additional basis risk vs spot.",
          example:     "NDF for MXN/USD; FWD for EUR/USD",
          source:      "ISDA Master Agreement 2002; CLS Settlement Rules",
        },
        {
          name:        "min_trade_size_usd",
          type:        "float · USD equivalent",
          description: "Minimum notional per hedge leg. Buckets below this threshold are skipped (unhedged). Interbank desks require $500K+. Mid-market corporates use $50K–$250K. SME/FinTech platforms accept $0 (no minimum).",
          example:     "50000 (skip sub-$50K buckets)",
          source:      "LCH ForexClear eligibility rules; CME FX minimum lot sizes",
        },
      ],
    },
    {
      id:    "workflow",
      title: "Activation Workflow",
      icon:  "→",
      type:  "workflow",
      steps: [
        {
          step:        1,
          label:       "Browse Presets",
          description: "Filter by category (Corporate, Financial, Sovereign, Sector) and search by name or audience. Each card shows confirmed %, forecast %, spread budget, and execution product.",
        },
        {
          step:        2,
          label:       "Review Parameters",
          description: "Check CONF and FCST ratios against your board mandate. Verify spread_bps against your treasury dealing desk rates. Confirm execution product matches your FX settlement agreement (FWD vs NDF).",
        },
        {
          step:        3,
          label:       "Activate Policy",
          description: "Click ACTIVATE POLICY. The backend deactivates the previous policy, creates a new PolicyInstance, and writes an immutable PolicyRevision WORM record with SHA-256 hash for audit.",
          link:        "/policies",
        },
        {
          step:        4,
          label:       "Verify on Position Desk",
          description: "Navigate to the Position Desk. Use ASSIGN POLICY on any NEW position — your activated policy will appear first. The policy short code (e.g. BLNC) will show in the POLICY ID column.",
          link:        "/position-desk",
        },
      ],
    },
    {
      id:      "formulas",
      title:   "Hedge Ratio Formulas",
      icon:    "∑",
      type:    "formula",
      formulas: [
        {
          label:       "Optimal Hedge Ratio (OHR)",
          latex:       "H* = ρ(ΔS, ΔF) × (σS / σF)",
          explanation: "The Johnson–Ederington OHR minimises portfolio variance. ρ is the correlation between spot changes ΔS and forward changes ΔF; σS and σF are their standard deviations. In practice, treasury teams round H* to the nearest 5% band (e.g., 0.75, 0.80, 0.85).",
          source:      "Johnson (1960); Ederington (1979); Hull & White (1988)",
        },
        {
          label:       "IFRS 9 Effectiveness Test",
          latex:       "0.80 ≤ ΔFV(hedging) / ΔFV(hedged) ≤ 1.25",
          explanation: "IFRS 9.B6.4.4 requires the hedge to be 'highly effective': the ratio of fair value changes must stay within 80–125%. The engine enforces forecast_ratio ≤ confirmed_ratio as a necessary (but not sufficient) precondition.",
          source:      "IFRS 9 §6.5.2; IAS 39 §AG105 (superseded)",
        },
        {
          label:       "Basel III VaR (Simplified)",
          latex:       "VaR₁₀ = VaR₁ × √10",
          explanation: "10-day Value at Risk scales from 1-day VaR by the square root of time (assuming i.i.d. returns). Financial institution presets (BANK, HFND) are calibrated to remain within 10-day VaR limits at 99% confidence.",
          source:      "BCBS 2019 (Basel III); FRTB SA §MAR21",
        },
        {
          label:       "IMF ARA Reserve Adequacy (Sovereign)",
          latex:       "ARA = 0.3×STD + 0.15×OPL + 0.05×M2 + 0.05×Exports",
          explanation: "The IMF Assessing Reserve Adequacy metric weights short-term debt (STD), other portfolio liabilities (OPL), broad money (M2), and export receipts. Sovereign presets target reserves ≥ 100% ARA.",
          source:      "IMF ARA Metric (2011, revised 2016); WEO April 2024",
        },
      ],
    },
    {
      id:      "glossary",
      title:   "Glossary",
      icon:    "§",
      type:    "glossary",
      glossary: [
        { term: "IFRS 9",        definition: "International Financial Reporting Standard 9 (Financial Instruments). Chapter 6 governs hedge accounting: designating hedge relationships, effectiveness testing, and discontinuation rules." },
        { term: "FRTB ES",       definition: "Fundamental Review of the Trading Book — Expected Shortfall. Replaces VaR for market risk capital under Basel III.5. Expected Shortfall at 97.5% confidence over 10-day horizon." },
        { term: "NDF",           definition: "Non-Deliverable Forward. A cash-settled FX forward used where currency controls restrict physical delivery (e.g., BRL, INR, KRW, PHP, IDR). Settlement is in USD at the WMR fixing rate." },
        { term: "FWD",           definition: "Deliverable Forward. A physically settled FX contract where both currencies are exchanged on the value date. Used for G10 and convertible EM currencies (MXN, CLP, COP)." },
        { term: "Basis Risk",    definition: "The residual risk when the hedging instrument does not perfectly offset the hedged item — e.g., NDF settlement basis vs. actual spot, or tenor mismatch between hedge and exposure." },
        { term: "PolicyRevision", definition: "An immutable WORM snapshot of the canonical policy configuration at the moment of activation. SHA-256 hashed, chain-linked to prior revisions. Referenced by all calculation runs for audit traceability." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// POLICY ENGINE — AI Policy Wizard
// ─────────────────────────────────────────────────────────────────────────────

export const AI_WIZARD_HELP: HelpPanelConfig = {
  pageTitle:    "AI Policy Wizard",
  pageSubtitle: "7-PHASE POLICY CONSTRUCTION · CLAUDE AI",
  sections: [
    {
      id:      "overview",
      title:   "7-Phase Overview",
      icon:    "ℹ",
      type:    "text",
      content: "The AI Wizard constructs a bespoke FX hedge policy through 7 institutional-grade questionnaire phases:\n\nA · Intent & Scope — policy mandate, portfolio perimeter, time horizon\nB · Exposure & Bucketing — flow classification, netting rules, materiality thresholds\nC · Instruments — eligible products, tenor ladder, execution constraints\nD · Constraints & Budget — cost/carry budget, concentration limits, VaR budget\nE · Scenarios & Stress — stress test families, tail scenarios, custom shocks\nF · Governance Review — approval checklist, IFRS 9 designation statement\nG · Publish — AI analysis, ranked recommendations, name & save\n\nYour progress is auto-saved to localStorage every 500ms. Use CLEAR PROGRESS to restart.",
    },
    {
      id:      "exposure",
      title:   "Exposure Classification",
      icon:    "≡",
      type:    "text",
      content: "Phase B determines how your cash flows are classified and netted:\n\n• CONFIRMED flows: firm purchase orders, invoiced payables/receivables, contracted payments. IFRS 9.6.4.1(a) — reliably measurable. Hedge ratio: 0.85–1.0.\n\n• FORECAST flows: highly probable transactions without firm commitment. IFRS 9.6.4.1(b) — must be 'highly probable' (>90% confidence historically). Hedge ratio: 0.3–0.7.\n\n• Materiality: sub-threshold buckets (< min_trade_size_usd) are excluded to avoid uneconomic micro-hedges.",
    },
    {
      id:    "instruments",
      title: "Instrument Eligibility",
      icon:  "⊞",
      type:  "text",
      content: "Phase C maps your currency pairs and tenor buckets to eligible hedging instruments:\n\n• G10 currencies (EUR, GBP, JPY, CHF, AUD, CAD, NZD, SEK, NOK, DKK): FWD preferred, liquid up to 10Y.\n\n• Convertible EM (MXN, CLP, COP, ILS, PLN, CZK, HUF, RON): FWD available, but NDF preferred for tenors >90 days due to lower cost.\n\n• Restricted EM (BRL, INR, KRW, IDR, PHP, THB, TRY, ZAR): NDF only. Settlement at WMR fixing; basis risk applies.\n\n• Tenor ladder: standard ORDR buckets are CALENDAR_MONTH (1M–12M). Longer tenors require supervisor approval.",
    },
    {
      id:      "constraints",
      title:   "Cost & Risk Budget",
      icon:    "◈",
      type:    "text",
      content: "Phase D sets your governance guardrails:\n\n• Spread budget (bps): the maximum transaction cost per leg you are willing to pay. Drives instrument selection and broker selection.\n\n• Carry cost: the net interest differential between currencies. FWDs embed this in forward points; NDFs settle at spot with separate carry.\n\n• Concentration limit: max % of total notional in a single tenor bucket (e.g., 40% in M+3). Prevents cliff-risk at rollover.\n\n• IFRS 9 constraint: forecast ratio must not exceed confirmed ratio. The wizard enforces this inline.",
    },
    {
      id:      "governance",
      title:   "Governance & Approval",
      icon:    "✓",
      type:    "text",
      content: "Phase F generates the policy approval checklist:\n\n□ Board mandate letter on file\n□ IFRS 9 designation documentation prepared\n□ Internal credit limit for FX counterparty confirmed\n□ Dual-control approval workflow configured\n□ Policy reviewed by external auditor (if required)\n□ Cooling-off period compliant with internal control framework\n\nThe FINAL status locks the policy for production activation. DRAFT status allows editing but cannot be activated on the Position Desk.",
    },
    {
      id:      "publish",
      title:   "AI Analysis & Save",
      icon:    "★",
      type:    "text",
      content: "Phase G sends your questionnaire responses to Claude AI, which generates 3 ranked policy recommendations scored on:\n\n• Coverage adequacy (vs. your stated risk appetite)\n• Cost efficiency (spread_bps optimised for your instrument access)\n• IFRS 9 compliance (effectiveness test probability)\n• Regulatory alignment (Basel III / FRTB / local requirements)\n\nThe first recommendation is auto-selected. Review all 3 before confirming. Name your policy clearly — it will appear in your Saved Policies and Position Desk favorites.\n\nThe saved policy creates a company-specific PolicyTemplate in the database, owned by your user account.",
    },
    {
      id:      "formulas",
      title:   "Hedge Math Reference",
      icon:    "∑",
      type:    "formula",
      formulas: [
        {
          label:       "IFRS 9 Effectiveness (Ratio Method)",
          latex:       "0.80 ≤ ΔFV_hedge / ΔFV_hedged ≤ 1.25",
          explanation: "The ratio of fair value change of the hedging instrument to the fair value change of the hedged item must stay within 80–125% throughout the hedge relationship. Below 80% = under-hedge; above 125% = over-hedge.",
          source:      "IFRS 9.B6.4.4; IAS 39.AG105",
        },
        {
          label:       "Hedge Effectiveness (Regression R²)",
          latex:       "R² ≥ 0.80  (95% confidence)",
          explanation: "Statistical test: the R² of regressing spot changes on forward price changes must be ≥ 0.80 to qualify for hedge accounting. Rolling 24-period regression used for ongoing assessment.",
          source:      "IFRS 9.B6.4.15; KPMG Hedge Accounting Guide (2023)",
        },
        {
          label:       "Basel III 10-Day VaR Scaling",
          latex:       "VaR₁₀ = VaR₁ × √10",
          explanation: "10-day VaR required for market risk capital calculations. Assumes i.i.d. daily returns. For FX, daily VaR is computed at 99% confidence using a 250-day historical window.",
          source:      "BCBS (2019) Minimum capital requirements for market risk, §MAR21",
        },
        {
          label:       "IFRS 9 Highly Probable Threshold",
          latex:       "P(transaction) > 0.90  (historically verified)",
          explanation: "IFRS 9.6.4.1(b) requires forecast transactions to be 'highly probable' — interpreted as >90% probability based on transaction history, budget plans, and contractual agreements.",
          source:      "IFRS 9.B6.3.7; IASB ED/2010/13 basis for conclusions",
        },
      ],
    },
    {
      id:      "glossary",
      title:   "AI Wizard Glossary",
      icon:    "§",
      type:    "glossary",
      glossary: [
        { term: "Canonical Policy",    definition: "The complete, deterministic JSON representation of all policy parameters at a point in time. SHA-256 hashed and stored as a WORM PolicyRevision. Used to prove 'what exact policy governed this calculation?'" },
        { term: "Highly Probable",     definition: "IFRS 9 term for forecast hedged items. Requires >90% probability based on historical transaction patterns. Failure causes hedge accounting discontinuation." },
        { term: "WizardState",         definition: "The 60+ field in-memory object capturing all questionnaire responses across all 7 phases. Auto-saved to localStorage every 500ms as 'ai_wizard_state_v1'." },
        { term: "ΔS / ΔF",            definition: "Changes in spot price (ΔS) and forward price (ΔF) over a measurement period. Used in the Johnson–Ederington OHR formula and IFRS 9 effectiveness regression." },
        { term: "Hedge Effectiveness", definition: "The degree to which changes in the fair value of the hedging instrument offset changes in the fair value of the hedged item. Must be in the 80–125% range per IFRS 9." },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// POLICY ENGINE — Saved Policies
// ─────────────────────────────────────────────────────────────────────────────

export const SAVED_POLICIES_HELP: HelpPanelConfig = {
  pageTitle:    "Saved Policies",
  pageSubtitle: "USER POLICY HUB · VERSION-CONTROLLED",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position:    4,
        total:       7,
        label:       "Step 4 of 7 — Policy Engine",
        description: "Saved Policies is the governance library for all custom policies created by your team. Activate any policy here to make it live for your branch — it immediately governs all new hedge calculations.",
        prev: { label: "Policy Library",  href: "/policies" },
        next: { label: "Run Engine",      href: "/input" },
      },
    },
    {
      id:      "overview",
      title:   "What this page does",
      icon:    "ℹ",
      type:    "text",
      content: "This page is your personal and team policy library. It shows all AI-generated and manually created policy templates belonging to your company.\n\nTabs:\n• MY POLICIES — templates you created\n• BRANCH POLICIES — all templates for your branch\n• COMPANY-WIDE — all templates across all branches\n• FAVORITES — templates you have bookmarked (★)\n\nActions available per card:\n• ACTIVATE — make this the live branch policy (requires policy.activate permission)\n• DEACTIVATE — remove the live policy (leaves positions unprotected)\n• EDIT — update name, risk posture, or hedge ratios (increments version)\n• DUPLICATE — create a copy for iteration\n• DELETE — permanent removal (blocked if policy is currently active)\n• EXPORT — download as JSON for sharing or backup\n\nUse IMPORT POLICY in the header to upload a previously exported JSON file.",
    },
    {
      id:        "variables",
      title:     "Policy Card Fields",
      icon:      "≡",
      type:      "variables",
      variables: [
        {
          name:        "version",
          type:        "integer · monotonic",
          description: "Version number, incremented on every PATCH (edit). Version 1 is the initial creation. The version number is immutable once a PolicyRevision is created — editing creates a new version, never overwrites the old one.",
          example:     "v3 (edited 3 times since creation)",
          source:      "policy_templates.version (DB column)",
        },
        {
          name:        "policy_hash",
          type:        "string · SHA-256 hex",
          description: "64-character SHA-256 hash of the canonical policy JSON. Computed at activation time and stored in PolicyRevision. Any change to any parameter changes the hash — tamper-evident.",
          example:     "a3f8c2d1… (first 8 chars shown)",
          source:      "policy_revisions.policy_hash (WORM)",
        },
        {
          name:        "revision_id",
          type:        "UUID",
          description: "The PolicyRevision record ID created at activation time. All CalculationRun records pin to this revision_id, enabling 'point-in-time policy reconstruction' for audit.",
          example:     "e2c1a4b3-…",
          source:      "policy_revisions.id (WORM, append-only)",
        },
        {
          name:        "status",
          type:        "enum · DRAFT | ACTIVE | ARCHIVED",
          description: "DRAFT: editable, not yet activated. ACTIVE: currently governing hedge calculations for this branch. ARCHIVED: superseded by a newer version.",
          example:     "ACTIVE (live policy)",
          source:      "policy_templates.status",
        },
      ],
    },
    {
      id:    "workflow",
      title: "Policy Lifecycle",
      icon:  "→",
      type:  "workflow",
      steps: [
        {
          step:        1,
          label:       "Create via AI Wizard",
          description: "Build a custom policy using the 7-phase AI Wizard. The saved template appears in MY POLICIES with status DRAFT.",
          link:        "/ai-policy-wizard",
        },
        {
          step:        2,
          label:       "Review & Edit",
          description: "Use EDIT to refine hedge ratios, name, or risk posture. Each edit increments the version number. DUPLICATE to branch for A/B testing.",
        },
        {
          step:        3,
          label:       "Activate",
          description: "Click ACTIVATE to make the policy live. Previous active policy is deactivated automatically. A WORM PolicyRevision is created, hash-chained to prior revisions.",
        },
        {
          step:        4,
          label:       "Pin to Positions",
          description: "On the Position Desk, use ASSIGN POLICY on any NEW position. Favorited policies appear at the top of the selector for quick access.",
          link:        "/position-desk",
        },
        {
          step:        5,
          label:       "Export & Share",
          description: "EXPORT generates a JSON blob with SHA-256 checksum. Share with other branches or archive for regulatory retention. Import on any ORDR instance via IMPORT POLICY.",
        },
      ],
    },
    {
      id:      "formulas",
      title:   "WORM Hash Formula",
      icon:    "∑",
      type:    "formula",
      formulas: [
        {
          label:       "Policy Hash (SHA-256)",
          latex:       "H = hex(SHA-256(sort_keys(canonical_json)))",
          explanation: "The canonical policy is serialised to JSON with sorted keys and no whitespace, then SHA-256 hashed. Any modification to any field produces a completely different hash — detectable tampering.",
          source:      "SEC Rule 17a-4 (WORM); CFTC 1.31 (electronic records)",
        },
        {
          label:       "Hash Chain Integrity",
          latex:       "H(n) = SHA-256(event_type + actor + entity + payload + H(n-1))",
          explanation: "Each audit event includes the hash of the previous event. A chain verifier can recompute all hashes; any gap or mismatch proves tampering. The first event uses GENESIS_HASH = '0000...0000'.",
          source:      "ORDR Audit Model v1.0; analogous to Merkle tree leaves",
        },
      ],
    },
    {
      id:      "glossary",
      title:   "Glossary",
      icon:    "§",
      type:    "glossary",
      glossary: [
        { term: "WORM",            definition: "Write Once, Read Many. Immutable storage semantics enforced by DB-level BEFORE UPDATE/DELETE triggers on audit_events and policy_revisions. Required by SEC 17a-4 and CFTC 1.31 for financial record retention." },
        { term: "PolicyRevision",  definition: "An append-only snapshot of the canonical policy config created at each activation. Contains policy_hash, canonical_policy JSONB, created_by, prev_revision_id. Never modified after creation." },
        { term: "Version Pinning", definition: "The practice of storing policy_revision_id on each CalculationRun row. Enables point-in-time reconstruction: 'exactly which policy parameters governed this specific calculation?'" },
        { term: "SEC 17a-4",       definition: "US SEC rule requiring broker-dealers to retain electronic records in non-rewritable, non-erasable format (WORM). ORDR's audit_events table is compliant by design." },
        { term: "CFTC 1.31",       definition: "US CFTC recordkeeping rule requiring swap dealers to retain records for 5 years in a readily accessible format. Applies to FX forward and NDF positions." },
      ],
    },
  ],
};

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
      id:    "manual-entry",
      title: "Manual Entry Guide",
      icon:  "✎",
      type:  "workflow",
      steps: [
        { step: 1, label: "Record ID",    description: "Enter a unique identifier (e.g. EXP-EUR-001). Immutable after save per WORM audit. Use convention: {TYPE}-{CCY}-{SEQ}." },
        { step: 2, label: "Entity",       description: "Legal entity or counterparty name (e.g. Nordstrom GmbH). Must match counterparty master data." },
        { step: 3, label: "Flow Type",    description: "AP = Accounts Payable (outflow, you owe foreign currency). AR = Accounts Receivable (inflow, you are owed). Determines hedge direction." },
        { step: 4, label: "Currency",     description: "Select ISO 4217 code from dropdown. 27 currencies: EUR, GBP, JPY, MXN, BRL, CAD, CHF, ZAR, and more." },
        { step: 5, label: "Amount",       description: "Positive notional value (e.g. 2500000). No sign or symbol — direction is from Flow Type. Displays with thousand separators." },
        { step: 6, label: "Value Date",   description: "Click to open calendar. Use Q1-Q4 shortcuts to jump quarters, arrows for months. Or type YYYY-MM-DD. Must be future date." },
        { step: 7, label: "Status",       description: "CONFIRMED (contractually obligated) or FORECAST (projected). Only CONFIRMED eligible for IBKR execution." },
        { step: 8, label: "Save",         description: "Click + ADD POSITION. Position appears in table with status NEW. Gate Check turns green when positions are loaded." },
      ],
    },
    {
      id:    "field-reference",
      title: "Field Reference",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "RECORD_ID",   type: "string",  description: "Unique position identifier. Alphanumeric, max 64 chars, no spaces. Immutable after creation (WORM).", example: "EXP-EUR-001", source: "User input" },
        { name: "ENTITY",      type: "string",  description: "Legal entity or business unit originating the exposure. Required for entity-level attribution.", example: "Nordstrom GmbH", source: "User input" },
        { name: "FLOW_TYPE",   type: "enum",    description: "AP (Accounts Payable, outflow) or AR (Accounts Receivable, inflow). Determines hedge direction.", example: "AR", source: "User input" },
        { name: "CURRENCY",    type: "ISO 4217", description: "3-letter currency code. Must be listed on CME/ICE for automated hedging. Non-listed currencies are manual-only.", example: "EUR", source: "User input" },
        { name: "AMOUNT",      type: "number",  description: "Gross notional in selected currency. Always positive. Do not net AP/AR — enter each as separate record.", example: "2,500,000", source: "User input" },
        { name: "VALUE_DATE",  type: "date",    description: "Settlement date (YYYY-MM-DD). Must be future. Determines hedge tenor and forward points calculation.", example: "2026-06-30", source: "User input" },
        { name: "STATUS",      type: "enum",    description: "CONFIRMED (firm, eligible for execution) or FORECAST (estimated, excluded from IBKR automation).", example: "CONFIRMED", source: "User input" },
        { name: "DESCRIPTION", type: "string",  description: "Optional note (max 500 chars). Appears in WORM ledger and audit trail. Use for invoice/PO references.", example: "Q2 consulting revenue", source: "User input" },
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
    {
      id:    "glossary",
      title: "Glossary",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "AP (Accounts Payable)", definition: "Outflow exposure — your company owes foreign currency to a supplier. Requires a buy-side FX hedge (you need to buy the foreign currency)." },
        { term: "AR (Accounts Receivable)", definition: "Inflow exposure — your company is owed foreign currency by a client. Requires a sell-side FX hedge (you will sell the foreign currency received)." },
        { term: "CONFIRMED", definition: "Contractually obligated exposure — invoice received or PO signed. Eligible for automated IBKR execution and lifecycle automation." },
        { term: "FORECAST", definition: "Projected or estimated exposure. Excluded from automated execution but included in scenario analysis and exposure reporting." },
        { term: "Gate Check", definition: "Validation bar at the bottom of Position Desk. Shows ALL GATES PASSED (green) when positions are loaded and validated, unlocking the hedge plan generator." },
        { term: "WORM", definition: "Write Once, Read Many. All position creation and status changes are recorded in an append-only audit trail that cannot be modified or deleted." },
        { term: "Value Date", definition: "The settlement date when the FX cash flow is expected to occur. Used to determine hedge tenor, forward points, and maturity bucket assignment." },
      ],
    },
  ],
};

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

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION DESK — Institutional Position Execution Hub
// ─────────────────────────────────────────────────────────────────────────────

export const EXECUTION_DESK_HELP: HelpPanelConfig = {
  pageTitle:    "Execution Desk",
  pageSubtitle: "EXECUTION HUB · POSITION MANAGEMENT",
  sections: [
    {
      id:    "pipeline",
      title: "Pipeline Position",
      icon:  "⬡",
      type:  "pipeline",
      pipelinePos: {
        position: 5,
        total:    7,
        label:    "Step 5 of 7 — Execution Hub",
        description: "Convert policy-assigned positions into executable hedge transactions via simulation, stress testing, and IBKR payload generation.",
      },
    },
    {
      id:    "overview",
      title: "What this page does",
      icon:  "ℹ",
      type:  "text",
      content:
        "Execution Desk is the institutional nerve center for converting policy-assigned positions into executable hedge transactions. Positions flow here automatically from Policy Desk once they have an assigned hedge policy.\n\nDesigned to Bloomberg FXGO and BlackRock Aladdin execution standards, it provides Monte Carlo simulation, stress testing, hedge plan optimization, and IBKR FIX message generation — all with terminal-grade efficiency and keyboard-first UX.",
    },
    {
      id:    "workflow",
      title: "Execution Workflow",
      icon:  "▶",
      type:  "workflow",
      steps: [
        { step: 1, label: "SELECT",    description: "Choose positions from the execution queue. Multi-select with keyboard shortcuts (⌘A, ⌘K). All positions here have status POLICY_ASSIGNED." },
        { step: 2, label: "SIMULATE",  description: "Run Monte Carlo simulation (10,000 paths). Get VaR, CVaR, P&L distribution, worst/best case scenarios." },
        { step: 3, label: "STRESS",    description: "Apply market shock scenarios (2008 crisis, COVID, EM crisis). Test resilience against tail events." },
        { step: 4, label: "OPTIMIZE",  description: "Build optimal hedge plan using constraint solver. Minimize cost while meeting policy risk constraints." },
        { step: 5, label: "GENERATE",  description: "Create IBKR execution payload (JSON/FIX format). Includes order validation and compliance pre-checks." },
        { step: 6, label: "EXECUTE",   description: "Export payload and send to IBKR via TWS API or manual order entry.", link: "/execution" },
      ],
    },
    {
      id:    "actions",
      title: "Available Actions",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "SIMULATE MONTE CARLO", type: "simulation", description: "10,000-path Monte Carlo simulation. Returns mean P&L, standard deviation, VaR (95%), CVaR (95%), worst case, best case.", example: "VaR $125K loss at 95% confidence", source: "Simulation engine" },
        { name: "STRESS TEST",          type: "scenario",   description: "Apply historical market shock scenarios. Tests: 2008 financial crisis, COVID March 2020, EM currency crisis.", example: "Position loses $200K in 2008 scenario", source: "Historical scenario library" },
        { name: "BUILD HEDGE PLAN",     type: "optimizer",  description: "Constraint-based hedge optimization. Minimizes execution cost while satisfying policy hedge ratio, tenor, and instrument constraints.", example: "Optimal plan: 75% FWD, 25% NDF", source: "Constraint solver" },
        { name: "GENERATE IBKR PAYLOAD", type: "export",    description: "Creates JSON payload for IBKR TWS execution. Includes order type, size, price, TIF, account validation.", example: "ibkr-payload-2026-02-26.json", source: "FIX message generator" },
      ],
    },
    {
      id:    "shortcuts",
      title: "Keyboard Shortcuts",
      icon:  "⌨",
      type:  "variables",
      variables: [
        { name: "⌘K",  type: "search",  description: "Focus search box. Instantly filter positions by record ID, entity, or currency.", example: "Type to filter", source: "Keyboard" },
        { name: "Esc", type: "clear",   description: "Clear search and unfocus. Returns to position queue view.", example: "Press to clear", source: "Keyboard" },
        { name: "⌘A",  type: "select",  description: "Select all visible positions. Works with current filters applied.", example: "Select all", source: "Keyboard" },
        { name: "R",   type: "refresh", description: "Refresh position queue. Fetches latest data from backend.", example: "Press to refresh", source: "Keyboard" },
      ],
    },
    {
      id:    "metrics",
      title: "Risk Metrics Explained",
      icon:  "≡",
      type:  "variables",
      variables: [
        { name: "VaR (Value at Risk)",    type: "95% CI", description: "Maximum expected loss at 95% confidence level. 1 in 20 days will be worse than this.", example: "$125K loss", source: "Monte Carlo simulation" },
        { name: "CVaR (Conditional VaR)", type: "95% CI", description: "Average loss in the worst 5% of outcomes. Also called Expected Shortfall (ES).", example: "$175K loss", source: "Tail risk calculation" },
        { name: "Mean P&L",               type: "USD",    description: "Expected profit/loss from simulation. Positive = expected gain, negative = expected loss.", example: "+$15K", source: "Monte Carlo mean" },
        { name: "Std Dev",                type: "USD",    description: "Standard deviation of P&L distribution. Higher = more volatile outcomes.", example: "$85K", source: "Monte Carlo std dev" },
      ],
    },
    {
      id:    "glossary",
      title: "Glossary",
      icon:  "§",
      type:  "glossary",
      glossary: [
        { term: "Monte Carlo Simulation", definition: "Statistical technique that runs thousands of random scenarios to estimate probability distribution of outcomes. ORDR uses 10,000 paths for hedge P&L estimation." },
        { term: "Stress Testing",         definition: "Analysis technique applying extreme but plausible market shocks to test portfolio resilience. Required by Basel III for financial institutions." },
        { term: "VaR (Value at Risk)",    definition: "Maximum expected loss at a given confidence level (typically 95% or 99%). Industry-standard risk metric used by banks and asset managers worldwide." },
        { term: "IBKR FIX Payload",       definition: "Financial Information eXchange (FIX) protocol message for order execution via Interactive Brokers TWS API. Standard format for institutional order routing." },
        { term: "Hedge Plan Optimization", definition: "Mathematical optimization to find the lowest-cost hedge strategy that satisfies all policy constraints (hedge ratio, tenor, instrument mix)." },
      ],
    },
  ],
};
