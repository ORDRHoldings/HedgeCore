import type { ModuleHelp } from "@/lib/help/types";

export const EXECUTION_HELP: ModuleHelp = {
  moduleId: "execution",
  pageTitle: "Execution Desk",
  pageSubtitle: "HEDGE EXECUTION · 4-EYES APPROVAL",
  sections: [
    {
      id: "execution-overview",
      anchor: "execution-overview",
      title: "Execution Desk Overview",
      icon: "Zap",
      level: 1,
      type: "text",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/execution-desk/page.tsx" },
        { file: "backend/app/models/execution_proposal.py" },
      ],
      content:
        "The Execution Desk is the terminal stage of the hedging pipeline. It is where approved calculation outputs transition from the STAGING state into permanent, immutable LEDGER entries that represent confirmed hedge transactions.\n\nIn ORDR Terminal's tri-state pipeline — **SANDBOX → STAGING → LEDGER** — the Execution Desk governs the STAGING → LEDGER transition. Proposals reach the Execution Desk after the hedge engine has computed an optimal strategy and the proposal has passed the automated decision gate. At this point, a human approval chain (4-eyes Segregation of Duties) is the only remaining barrier before ledger commitment.\n\nThe desk surfaces a real-time queue of STAGING proposals, each showing: instrument type, notional, strike/forward rate, premium (if applicable), and the decision gate summary. Operators can review full calculation details, re-trigger a fresh calculation against live market rates, inspect the risk gate scorecard, and submit the proposal for checker approval.\n\nOnce approved, the system writes a WORM ledger entry, advances the underlying position to HEDGED, and emits an audit event. The entire pipeline — from calculation to ledger write — is atomic: a failure at any step results in a full rollback with no partial state persisted.\n\nOrganisationally, the Execution Desk enforces a strict Maker/Checker model. The analyst who generated the proposal (Maker) cannot also approve it (Checker). This control is enforced at the database layer via a CHECK constraint, not merely at the application layer.",
    },
    {
      id: "execution-workflow",
      anchor: "execution-workflow",
      title: "Execution Workflow",
      icon: "ArrowRightCircle",
      level: 2,
      type: "workflow",
      verified: true,
      codeRefs: [{ file: "frontend/src/app/execution-desk/page.tsx" }],
      steps: [
        {
          step: 1,
          label: "Review Proposal",
          description:
            "The Checker selects an execution proposal from the STAGING queue. The detail panel displays the full proposal: engine version (ENGINE_VERSION 1.0.3), calculation run ID (UUID, references the WORM calculation_runs table), instrument specification, notional USD, strike rate, premium, effective date, maturity date, and counterparty. The Checker reviews all fields against the underlying position and policy instance.",
          link: "/execution-desk",
        },
        {
          step: 2,
          label: "Run Calculation",
          description:
            "Optionally, the Checker may trigger a recalculation against current market rates by clicking Recalculate. This invokes the full 7-stage engine pipeline (exposure → risk_classifier → strategy_selector → instrument_mapper → hedge_sizer → cost_engine → scenario_engine) and produces a new calculation_run record. The proposal is updated with the fresh output if the decision gate passes.",
        },
        {
          step: 3,
          label: "Risk Gate Check",
          description:
            "The decision gate scorecard is displayed for every proposal: 8 hard REJECT conditions are evaluated and shown as PASS/FAIL indicators. All 8 must PASS for the Submit button to be enabled. If any condition FAILs, the proposal status returns to SANDBOX and the Maker is notified with the specific failure reason.",
        },
        {
          step: 4,
          label: "Submit for Approval",
          description:
            "Once all gate checks pass, the Checker clicks Approve. The system verifies that the Checker's user UUID differs from the proposal's proposed_by UUID (DB CHECK constraint). On success, the proposal status advances to APPROVED, a ledger_entry is written (WORM), the position status advances to HEDGED, and an audit_event is emitted. The entire operation is wrapped in a database transaction; any failure triggers a full rollback.",
        },
      ],
    },
    {
      id: "execution-variables",
      anchor: "execution-variables",
      title: "Execution Variables",
      icon: "FileText",
      level: 2,
      type: "variables",
      verified: true,
      codeRefs: [{ file: "backend/app/models/execution_proposal.py" }],
      variables: [
        {
          name: "execution_proposal_id",
          type: "UUID",
          description:
            "Immutable primary key for the execution proposal record. Referenced by the ledger_entry and audit_event on approval. Used for reconciliation between the ORDR ledger and the counterparty trade confirmation.",
          example: "550e8400-e29b-41d4-a716-446655440000",
          source: "backend/app/models/execution_proposal.py",
        },
        {
          name: "instrument_type",
          type: "Enum",
          description:
            "The hedging instrument selected by the strategy selector: VANILLA_FORWARD, VANILLA_CALL, VANILLA_PUT, COLLAR, PARTICIPATING_FORWARD, CROSS_CURRENCY_SWAP. Determines which sizer formula is applied and which cost model is used.",
          example: "VANILLA_FORWARD",
          source: "backend/app/models/execution_proposal.py",
        },
        {
          name: "notional_usd",
          type: "Numeric(18,4)",
          description:
            "The USD-equivalent notional of the hedge instrument, computed by the hedge sizer as coverage_ratio × position_notional_usd. This is the economically significant figure used for all decision gate tests and ledger recording.",
          example: "1350000.0000",
          source: "backend/app/models/execution_proposal.py",
        },
        {
          name: "strike_rate",
          type: "Numeric(12,6)",
          description:
            "The contractual exchange rate for the hedge instrument. For forwards: the outright forward rate (spot + forward points). For options: the option strike price. Expressed as units of quote currency per unit of base currency.",
          example: "1.085200",
          source: "backend/app/models/execution_proposal.py",
        },
        {
          name: "premium_usd",
          type: "Numeric(18,4)",
          description:
            "The upfront option premium in USD, applicable to vanilla option and collar instruments. Zero for forward instruments. Included in the total_cost_usd calculation for the decision gate.",
          example: "12500.0000",
          source: "backend/app/models/execution_proposal.py",
        },
        {
          name: "effective_date",
          type: "Date",
          description:
            "The trade start date — typically today's date (T) or T+2 for spot-starting instruments. For forward-starting instruments, this is the deferred start date.",
          example: "2026-03-01",
          source: "backend/app/models/execution_proposal.py",
        },
        {
          name: "maturity_date",
          type: "Date",
          description:
            "The date on which the hedge instrument expires and the contracted exchange rate applies. Should align with the position's settlement_date. Mismatches between maturity_date and settlement_date create basis risk and are flagged in the risk scorecard.",
          example: "2026-06-30",
          source: "backend/app/models/execution_proposal.py",
        },
        {
          name: "counterparty",
          type: "String",
          description:
            "The financial institution on the other side of the hedge trade. In v1, counterparty is a text field capturing the approved counterparty name from the treasury's panel bank list. Counterparty credit risk is not modelled in v1.",
          example: "JP Morgan London Branch",
          source: "backend/app/models/execution_proposal.py",
        },
      ],
    },
    {
      id: "execution-decision-gate",
      anchor: "execution-decision-gate",
      title: "Decision Gate Logic",
      icon: "ShieldAlert",
      level: 3,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/engine/decision_gate.py" }],
      callout: {
        type: "warning",
        text: "All 8 decision gate conditions are hard REJECT thresholds. There are no warnings or overrides. A single FAIL returns the proposal to SANDBOX and requires recalculation or policy revision.",
      },
      content:
        "The decision gate is the final automated validation layer before a proposal enters the human approval queue. It evaluates 8 hard conditions against the calculation output. All conditions must PASS; any single FAIL produces a REJECT disposition with a specific failure code.\n\n**Condition 1 — Maximum Total Cost (bps)**\n`total_cost_bps > 75` → REJECT: COST_EXCEEDS_MAX_BPS\nAll-in cost (premium + spread + fees) expressed in basis points of notional must not exceed 75 bps. This corresponds to the platform's global cost ceiling, independent of individual policy cost caps.\n\n**Condition 2 — Minimum Effectiveness**\n`effectiveness < 0.25` → REJECT: EFFECTIVENESS_BELOW_MINIMUM\nThe prospective effectiveness ratio must be at least 25%. This is the absolute platform floor; individual policies may set higher minimums.\n\n**Condition 3 — Maximum Total Cost (USD)**\n`total_cost_usd > 25,000` → REJECT: COST_EXCEEDS_MAX_USD\nAbsolute cost cap in USD, independent of the basis points measure. Prevents large-notional transactions from incurring disproportionate premiums even when bps cost appears acceptable.\n\n**Condition 4 — Minimum Worst-Case Net P&L**\n`worst_case_net_pnl_usd < -50,000` → REJECT: WORST_CASE_PNL_BREACH\nThe scenario engine's worst-case (2-sigma adverse move) net P&L after hedging must not fall below -$50,000. Ensures the hedge provides meaningful downside protection under stress.\n\n**Condition 5 — Minimum Delta Coverage**\n`delta_coverage < 10%` → REJECT: INSUFFICIENT_DELTA_COVERAGE\nThe hedge must cover at least 10% of the position's R1 delta risk. Proposals that are too small relative to the exposure are rejected to prevent symbolic hedges that create governance optics without economic substance.\n\n**Condition 6 — Maximum Negative Carry**\n`negative_carry > 200 bps` → REJECT: NEGATIVE_CARRY_EXCEEDS_LIMIT\nThe carry cost of holding the hedge position must not exceed 200 bps annually. Extremely negative carry indicates the hedge is structured inefficiently or that market conditions have moved significantly against the strategy.\n\n**Condition 7 — Notional Alignment**\n`hedge_notional > position_exposure` → REJECT: HEDGE_EXCEEDS_EXPOSURE\nThe hedge notional must not exceed the underlying position exposure in absolute terms. Over-hedging the exposure creates a speculative component that violates IFRS 9 hedge accounting requirements.\n\n**Condition 8 — Maximum Hedge Ratio**\n`hedge_ratio > 110%` → REJECT: HEDGE_RATIO_EXCEEDS_LIMIT\nExpressed as a ratio, the hedge must not exceed 110% of the exposure. A 10% buffer above 100% is permitted to account for rounding in instrument sizing; anything above 110% is classified as over-hedging.",
    },
    {
      id: "execution-hedge-sizer-formula",
      anchor: "execution-hedge-sizer-formula",
      title: "Hedge Sizer Formula",
      icon: "Calculator",
      level: 3,
      type: "formula",
      verified: true,
      codeRefs: [{ file: "backend/app/engine/hedge_sizer.py" }],
      formulas: [
        {
          label: "Delta-Neutral Contract Sizing",
          latex:
            "N_{\\text{contracts}} = -\\frac{\\Delta_{USD}}{P \\cdot M}",
          explanation:
            "The number of contracts required to delta-hedge the position. Δ_USD is the position's R1 delta in USD (negative for a PAYABLE, positive for a RECEIVABLE). P is the current instrument price (forward rate or option premium per unit). M is the contract multiplier (e.g. 100,000 for a standard FX forward lot). The negative sign ensures the hedge is in the opposite direction to the exposure.",
          source: "backend/app/engine/hedge_sizer.py",
          codeRef: { file: "backend/app/engine/hedge_sizer.py" },
        },
        {
          label: "Vega-Neutral Contract Sizing (Options Only)",
          latex:
            "N_{\\text{vega}} = -\\frac{V_{USD}}{P \\cdot M \\cdot 0.01}",
          explanation:
            "For volatility-sensitive instruments (vanilla options, collars), the vega-neutral sizing is computed alongside the delta-neutral size. V_USD is the position's R2 vega in USD per 1% move in implied volatility. The 0.01 factor converts the per-1%-vol vega to a per-contract basis. In practice, the hedge sizer takes the larger of the delta-based and vega-based contract counts and applies the policy coverage ratio.",
          source: "backend/app/engine/hedge_sizer.py",
          codeRef: { file: "backend/app/engine/hedge_sizer.py" },
        },
        {
          label: "Final Hedge Notional",
          latex:
            "N_{\\text{hedge}} = \\text{round}(N_{\\text{contracts}}) \\cdot M \\cdot \\rho",
          explanation:
            "The final hedge notional is the rounded contract count multiplied by the contract multiplier M and the policy coverage ratio ρ (e.g. 0.90 for 90% coverage). Rounding to whole contracts introduces a small basis which is reported as part of R4 (residual risk). The rounded notional must satisfy the decision gate hedge_ratio ≤ 110% condition.",
          source: "backend/app/engine/hedge_sizer.py",
          codeRef: { file: "backend/app/engine/hedge_sizer.py" },
        },
      ],
    },
    {
      id: "execution-sod-four-eyes",
      anchor: "execution-sod-four-eyes",
      title: "4-Eyes Segregation of Duties",
      icon: "Eye",
      level: 4,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/models/execution_proposal.py" }],
      callout: {
        type: "regulatory",
        text: "The SoD constraint is enforced by a PostgreSQL CHECK constraint (approved_by != proposed_by) that fires at INSERT time. It cannot be bypassed by application code, role escalation, or direct database access with application credentials.",
      },
      content:
        "**Maker/Checker Model**\n\nOrdr Terminal enforces a strict two-person integrity rule for all hedge execution proposals. The officer who submits a proposal (Maker, recorded as `proposed_by`) and the officer who approves it (Checker, recorded as `approved_by`) must be different individuals. This is the classic 4-eyes principle required by most treasury management policies and recommended by all major regulatory frameworks for derivative transactions.\n\n**Database-Level Enforcement**\n\nThe constraint is implemented as a PostgreSQL CHECK constraint on the `execution_proposals` table:\n\n```sql\nCHECK (approved_by IS NULL OR approved_by != proposed_by)\n```\n\nThe NULL condition allows proposals to exist in PENDING state before approval. Once an `approved_by` value is provided, the constraint fires. If the same UUID appears in both columns, PostgreSQL raises an integrity error (ERROR 23514) that the application translates to a 409 Conflict HTTP response with error code `SOD_VIOLATION`.\n\n**No Application-Level Override**\n\nThere is no `force_approve` flag, no superuser bypass, and no administrative override for this constraint. Even users with `is_superuser=true` (such as the demo/admin user) cannot self-approve. This is intentional: superuser privileges grant administrative platform access, not authority to override governance controls.\n\n**Audit Trail**\n\nBoth `proposed_by` and `approved_by` UUIDs are recorded in the `execution_proposals` table and copied to the `ledger_entries` record on approval. Every approval action generates an `audit_event` record with action type `EXECUTION_PROPOSAL_APPROVED`, operator UUID, timestamp, and the proposal UUID. The audit event is hash-chained into the tenant's audit log.",
    },
    {
      id: "execution-failure-modes",
      anchor: "execution-failure-modes",
      title: "Failure Modes & Recovery",
      icon: "AlertTriangle",
      level: 4,
      type: "text",
      verified: false,
      callout: {
        type: "caution",
        text: "All failure modes listed below result in the proposal remaining in STAGING or reverting to SANDBOX. No partial ledger entries are ever written. Recovery requires operator action.",
      },
      content:
        "**Market Data Timeout (8-second threshold)**\nIf a Finnhub or Yahoo Finance upstream call does not respond within 8 seconds, the route returns a 503 with `MARKET_DATA_TIMEOUT`. The calculation engine falls back to the most recent cached rates (with `isStale: true` flag). If the cache is also empty (cold start), the engine uses the reference rate table. Calculations performed on stale data are flagged in the calculation_run record with `data_quality: STALE`.\n\n**Market Data Stale on Recalculation**\nWhen the Checker clicks Recalculate and stale data is detected, the system displays a stale data banner and requires the Checker to explicitly acknowledge before proceeding. The acknowledgement is recorded in the audit trail.\n\n**Decision Gate REJECT**\nA REJECT from the decision gate returns the proposal to SANDBOX status. The specific failing condition(s) are recorded in the `rejection_reason` field (JSON array of condition codes and values). The Maker receives a notification listing the failed conditions. The proposal can be resubmitted after the underlying issue is resolved (e.g. policy revision to reduce the cost cap, or waiting for market rates to improve).\n\n**Engine ERROR State**\nIf the calculation engine encounters an unhandled exception (e.g. missing market data for an exotic currency pair, division-by-zero in risk normalization), the proposal is placed in ERROR status. ERROR proposals are not accessible from the Execution Desk queue; they require investigation by an admin-level user via the Calculation History view. The full Python traceback is stored in the `calculation_runs.error_detail` field (never surfaced to the browser).\n\n**Ledger Write Failure**\nThe STAGING → LEDGER transition is wrapped in a PostgreSQL transaction. If the ledger_entry INSERT fails (e.g. unique constraint violation, connection loss), the entire transaction is rolled back. The proposal remains in APPROVED state with a `ledger_error` flag set. An admin must investigate and re-trigger the ledger write via the admin panel. No duplicate ledger entries are possible due to the transaction semantics.\n\n**SoD Violation (409 Conflict)**\nIf the application-level SoD check passes but the database CHECK constraint fires (e.g. due to a race condition in a multi-tab session), the 409 Conflict response is returned to the browser. The proposal remains in STAGING. The violation attempt is recorded as an `audit_event` with action type `SOD_VIOLATION_ATTEMPT`.",
    },
    {
      id: "execution-ledger-immutability",
      anchor: "execution-ledger-immutability",
      title: "Ledger Immutability & Hash Chain",
      icon: "Lock",
      level: 5,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/models/ledger.py" }],
      callout: {
        type: "regulatory",
        text: "ledger_entries is a WORM table. No application-level UPDATE or DELETE is exposed. Corrections must be made via reversing entries (new WORM rows), maintaining a complete audit record of both the original and the correction.",
      },
      content:
        "**WORM Ledger Architecture**\n\nEvery confirmed hedge transaction is recorded in the `ledger_entries` table as an immutable row. The table schema permits only INSERT operations at the application layer. No UPDATE or DELETE statements are issued by any route handler or background task. This Write-Once, Read-Many (WORM) design is the foundation for regulatory-grade record retention.\n\n**Daily Merkle Root**\n\nAt the end of each UTC trading day, a batch process computes a Merkle-style daily root hash over all ledger entries created during that day:\n\n```\nroot_hash = SHA256(\n  entry_hash_1 || entry_hash_2 || entry_hash_3 || entry_hash_4 || entry_hash_5\n)\n```\n\nWhere `||` denotes string concatenation of the individual entry hashes (sorted by `created_at` ascending for determinism). Each `entry_hash` is computed from the canonical JSON serialisation of the ledger entry (sort_keys=True, no whitespace). The daily root hash is stored in the `ledger_daily_roots` table and is itself included in the following day's computation, creating a cross-day chain.\n\n**Independent Verification**\n\nRegulatory examiners, internal auditors, or external counterparties can independently verify the ledger by:\n1. Extracting all ledger_entry rows for a date range via the `/v1/ledger/export` endpoint (requires `audit.view` permission)\n2. Recomputing entry hashes from the canonical JSON of each row\n3. Recomputing the daily root hash and comparing against the stored `ledger_daily_roots` record\n4. Verifying the cross-day chain from genesis to the current date\n\nA hash mismatch at any step identifies the specific entry or day where tampering occurred.\n\n**Correction Entries**\n\nWhen a ledger entry is determined to be erroneous (e.g. incorrect notional due to a data entry error), the correction protocol is:\n1. Create a REVERSAL entry (new WORM row with opposite sign and reference to the original entry UUID)\n2. Create a CORRECTED entry with the correct values\n3. Document the correction reason in both rows\n4. Obtain 4-eyes approval for the correction pair (same SoD rules as original)\n\nThis produces a self-consistent ledger where the economic net of original + reversal + correction equals the intended position, and every step is auditable.\n\n**Regulatory Framework Alignment**\n\nThe ledger design supports compliance with:\n- **EMIR Article 9**: Trade reporting obligation with retained records\n- **MiFID II Article 25**: Transaction reporting and record retention (5+ years)\n- **CFTC Recordkeeping Rule 1.35**: Swap record retention requirements\n- **SOX Section 404**: Internal controls over financial reporting — completeness and accuracy of recorded transactions",
    },
  ],
};
