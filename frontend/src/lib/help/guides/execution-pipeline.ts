import type { GuideDoc } from "@/lib/help/guides/types";

export const EXECUTION_PIPELINE: GuideDoc = {
  id: "execution-pipeline",
  title: "Execution Pipeline",
  summary:
    "The tri-state governance pipeline from Sandbox to Ledger: execution workflow, hedge sizer formula, decision gate thresholds, four-eyes segregation of duties, failure modes, and ledger immutability.",
  path: "/hedge-desk",
  icon: "Workflow",
  lastReviewed: "2026-02-28",
  relatedIds: ["sandbox-simulation", "policy-engine", "position-desk", "getting-started"],
  sections: [
    // ─── L1: Execution Pipeline Overview ──────────────────────────────────────
    {
      id: "execution-pipeline-overview",
      heading: "Execution Pipeline Overview",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/execution_proposal.py" },
        { file: "backend/app/models/ledger.py" },
      ],
      blocks: [
        {
          type: "text",
          body: "The execution pipeline is the governance pathway that transforms a sandbox calculation result into an immutable ledger entry. It enforces a three-state progression — SANDBOX → STAGING → LEDGER — with mandatory four-eyes approval between Staging and Ledger.",
        },
        {
          type: "table",
          table: {
            headers: ["Pipeline State", "What Exists", "Who Can Act", "Reversible?"],
            rows: [
              ["SANDBOX", "Calculation run record (WORM). No proposal yet.", "Any user with calculate.run_sandbox", "Yes — run more simulations anytime"],
              ["STAGING", "Execution proposal artifact (immutable at creation). Awaiting approval.", "Maker creates; different Checker approves", "Yes — Checker can reject; proposal is closed"],
              ["LEDGER", "Ledger entry (WORM). Position transitions to HEDGED.", "Requires pipeline.authorize_ledger", "No — ledger entries are permanent"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "The LEDGER state is a Write Once operation. Once a ledger entry is committed, it cannot be modified or deleted. Corrections require a new offsetting position and hedge cycle.",
          },
        },
        {
          type: "text",
          body: "The four-step execution flow within the pipeline — REVIEW → CALCULATE → RISK_CHECK → EXECUTE — maps to discrete user actions and system checks. Each step is audited. The risk check (decision gate) is rerun at execution time against current market inputs to ensure the plan is still valid.",
        },
      ],
    },

    // ─── L2: End-to-End Execution Workflow ────────────────────────────────────
    {
      id: "execution-pipeline-workflow",
      heading: "End-to-End Execution Workflow",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Promote sandbox run to proposal",
              detail: "From the Sandbox or Recent Runs, select a completed run and click 'Promote to Proposal'. This creates an execution_proposal record. Requires pipeline.create_proposal. The proposal is immutable from this point.",
            },
            {
              n: 2,
              label: "Review execution proposal",
              detail: "Navigate to /hedge-desk. The proposal appears in the STAGING queue. The maker reviews all fields: instrument_type, notional_usd, strike_rate, premium_usd, effective_date, maturity_date, counterparty.",
            },
            {
              n: 3,
              label: "Run risk check",
              detail: "Click 'Run Risk Check'. The system re-executes the decision gate against the proposal's plan data and current market inputs. The verdict (APPROVE / APPROVE_WITH_CONDITIONS / REJECT) is displayed with reasons.",
            },
            {
              n: 4,
              label: "Submit for four-eyes approval",
              detail: "If the risk check passes, the maker submits the proposal for approval. Requires pipeline.submit_staging. The proposal is locked for editing.",
            },
            {
              n: 5,
              label: "Checker reviews and decides",
              detail: "A different user (checker ≠ maker) reviews the proposal and risk check results. The checker can APPROVE (pipeline.approve) or REJECT (pipeline.reject). Rejecting closes the proposal; the sandbox run remains available for re-promotion.",
            },
            {
              n: 6,
              label: "Ledger commit",
              detail: "On approval, a user with pipeline.authorize_ledger authorises the final ledger write. A ledger_entry is appended (WORM). The position transitions to HEDGED. The daily Merkle root is updated.",
            },
            {
              n: 7,
              label: "Audit logged",
              detail: "Every step from proposal creation through ledger commit generates an audit event in the WORM audit_events chain. The execution_proposal_id is present in all related events.",
            },
          ],
        },
      ],
    },

    // ─── L2: Execution Variables ──────────────────────────────────────────────
    {
      id: "execution-pipeline-variables",
      heading: "Execution Variables",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] Field names below reflect the intended execution_proposal schema. Verify against backend/app/models/execution_proposal.py for the exact column definitions.",
          },
        },
        {
          type: "field-dict",
          fields: [
            {
              name: "execution_proposal_id",
              type: "UUID",
              constraints: "Primary key, immutable, system-generated",
              meaning: "Stable identifier for the proposal. Referenced in all audit events, ledger entry, and approval records.",
              example: "f3a2b1c0-d4e5-...",
            },
            {
              name: "instrument_type",
              type: "enum",
              constraints: "NDF | Forward | Futures | Options",
              meaning: "The hedge instrument selected by the engine and confirmed by the analyst",
              example: "NDF",
            },
            {
              name: "notional_usd",
              type: "decimal",
              constraints: "> 0",
              meaning: "The USD-equivalent notional amount of the hedge instrument",
              example: "2000000.00",
            },
            {
              name: "strike_rate",
              type: "decimal",
              constraints: "> 0",
              meaning: "The locked-in FX rate for the hedging instrument (forward rate, NDF fixing rate, or option strike)",
              example: "18.95",
            },
            {
              name: "premium_usd",
              type: "decimal",
              constraints: "≥ 0; 0 for forwards/NDFs",
              meaning: "Option premium paid at inception, expressed in USD. Zero for non-option instruments.",
              example: "12400.00",
            },
            {
              name: "effective_date",
              type: "ISO date",
              constraints: "Must be on or after today",
              meaning: "The start date of the hedging instrument",
              example: "2026-03-01",
            },
            {
              name: "maturity_date",
              type: "ISO date",
              constraints: "Must be after effective_date; should align with position settlement_date",
              meaning: "The expiry or settlement date of the hedging instrument",
              example: "2026-09-30",
            },
            {
              name: "counterparty",
              type: "string",
              constraints: "Non-empty, max 255 chars",
              meaning: "Name of the bank or counterparty for the hedging instrument",
              example: "HSBC Mexico",
            },
          ],
        },
      ],
    },

    // ─── L3: Hedge Sizer Formula ──────────────────────────────────────────────
    {
      id: "execution-pipeline-hedge-sizer",
      heading: "Hedge Sizer Formula",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/hedge_sizer.py", symbol: "size_hedges" },
      ],
      blocks: [
        {
          type: "text",
          body: "The hedge sizer converts mapped instruments into concrete contract counts using deterministic sizing formulas. All inputs must be explicitly provided — no live pricing feeds are accessed.",
        },
        {
          type: "formula",
          formula: {
            label: "Delta-Neutral Contract Sizing (Futures/Perp)",
            expression: "contracts = -delta_usd / (price × multiplier)",
            explanation:
              "delta_usd = the exposure's delta in USD (negative for short exposure); price = current futures/spot price for the instrument; multiplier = contract_multiplier from instrument_specs. The negative sign ensures the hedge offsets the exposure direction. Result is rounded using the configured rounding mode (default: nearest, ties away from zero).",
            source: "hedge_sizer.py",
            codeRef: { file: "backend/app/engine/hedge_sizer.py", symbol: "size_hedges" },
          },
        },
        {
          type: "formula",
          formula: {
            label: "Delta-Neutral Contract Sizing (Options)",
            expression: "contracts = -delta_usd / (option_delta × underlying_price × multiplier)",
            explanation:
              "option_delta = the option's delta (from market.option_deltas); underlying_price = spot price of the underlying (from market.prices[INSTRUMENT_ID_UNDERLYING]); multiplier = contract_multiplier. For options, delta_usd_per_contract = option_delta × underlying_price × multiplier.",
            source: "hedge_sizer.py",
            codeRef: { file: "backend/app/engine/hedge_sizer.py", symbol: "_delta_usd_per_contract_for_options" },
          },
        },
        {
          type: "formula",
          formula: {
            label: "Vega-Target Sizing",
            expression: "contracts = -vega_usd / vega_usd_per_contract",
            explanation:
              "Used for volatility-driven instruments (e.g. volatility futures). vega_usd = the exposure's vega in USD; vega_usd_per_contract = from market.sensitivities[instrument_id].vega_usd_per_contract.",
            source: "hedge_sizer.py",
            codeRef: { file: "backend/app/engine/hedge_sizer.py", symbol: "size_hedges" },
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "After raw contract calculation, the sizer applies constraint caps (min_contract, max_contract from instrument_specs) and global caps (global_min_contract=0, global_max_contract=500). If a material exposure rounds to 0 contracts and min_contract > 0, a minimum bump is applied and recorded in the trace.",
          },
        },
      ],
    },

    // ─── L3: Decision Gate ────────────────────────────────────────────────────
    {
      id: "execution-pipeline-decision-gate",
      heading: "Decision Gate",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/decision_gate.py", symbol: "decision_gate" },
        { file: "backend/app/engine/decision_gate.py", symbol: "_policy_defaults" },
      ],
      blocks: [
        {
          type: "text",
          body: "The decision gate is re-executed at execution time (not only in sandbox). This ensures that any market movement between sandbox run and proposal execution is reflected in the approval decision. The gate is decision-only — it does not modify the plan.",
        },
        {
          type: "table",
          table: {
            headers: ["Check", "Default Threshold", "REJECT Reason Code"],
            rows: [
              ["Total cost > bps limit", "> 75 bps of portfolio notional", "REASON_COST_TOO_HIGH"],
              ["Total cost > absolute limit (notional unknown)", "> $25,000 USD", "REASON_COST_TOO_HIGH"],
              ["Worst-case net PnL", "< -$50,000 USD", "REASON_WORST_CASE_TOO_LOW"],
              ["Min effectiveness", "< 0.25 (25%)", "REASON_EFFECTIVENESS_TOO_LOW"],
              ["Rejected legs", "> 0 legs rejected by engine", "REASON_TOO_MANY_REJECTIONS"],
              ["Empty hedge plan", "0 non-zero contracts", "REASON_EMPTY_HEDGE_PLAN"],
              ["Stage failure", "Any upstream stage returned error", "REASON_STAGE_FAILURE"],
              ["Unhedged material risk", "Classifier risk score ≥ 0.50 and covered=False", "REASON_UNHEDGED_MATERIAL_RISK"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "A REJECT verdict at execution time blocks the ledger commit. The proposal enters a FAILED_RISK_CHECK state. The maker must return to sandbox, revise inputs, run a new simulation, and create a new proposal. The failed proposal is retained in the audit trail.",
          },
        },
      ],
    },

    // ─── L4: 4-Eyes Segregation of Duties ─────────────────────────────────────
    {
      id: "execution-pipeline-sod",
      heading: "Four-Eyes Segregation of Duties",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/execution_proposal.py" },
      ],
      blocks: [
        {
          type: "text",
          body: "The four-eyes segregation of duties (SoD) control on execution proposals is enforced at the database level via a CHECK constraint: approved_by ≠ proposed_by. This cannot be bypassed by any application-level role, including admin.",
        },
        {
          type: "table",
          table: {
            headers: ["Control Aspect", "Implementation"],
            rows: [
              ["DB constraint", "CHECK (approved_by != proposed_by) on execution_proposals table"],
              ["API enforcement", "Backend validates approved_by ≠ proposed_by before writing approval"],
              ["Audit on violation attempt", "SOD_VIOLATION_ATTEMPT audit event written if the same user tries to approve their own proposal"],
              ["HTTP response on violation", "409 Conflict with error code SOD_VIOLATION"],
              ["Admin bypass", "None — admin role does not circumvent this constraint"],
              ["Multi-role user", "A user holding both maker and checker roles in their role set still cannot self-approve"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "This is a hard control with no override path in v1. If an organisation has a single-person treasury function, approval workflows must be delegated to a second authorised user before production use of the execution pipeline.",
          },
        },
      ],
    },

    // ─── L4: Failure Modes ────────────────────────────────────────────────────
    {
      id: "execution-pipeline-failures",
      heading: "Failure Modes",
      level: "L4",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] Failure handling described below is based on the intended design. Verify against current execution desk frontend and backend error handling.",
          },
        },
        {
          type: "table",
          table: {
            headers: ["Failure Scenario", "System Behaviour", "Recovery"],
            rows: [
              ["Engine timeout (> 8s)", "Proposal moves to ERROR state. No ledger write occurs.", "Investigate slow inputs or backend load. Resubmit from sandbox."],
              ["Stale market data", "Decision gate may REJECT if stale rates produce out-of-bounds cost or worst-case. The trace records the specific failing check.", "Refresh market inputs in sandbox, re-run, create new proposal."],
              ["Engine returns ERROR state", "Proposal blocked. REJECT envelope returned with stage failure code.", "Review error_code in decision trace. Correct inputs and re-run."],
              ["Ledger write failure (DB error)", "Full transaction rollback. No partial ledger entry. Position remains READY_TO_EXECUTE.", "DBA investigation required. Proposal can be resubmitted after DB issue is resolved."],
              ["SoD 409 Conflict", "Approval rejected. SOD_VIOLATION_ATTEMPT audited. Proposal remains in PENDING_APPROVAL.", "A different user must approve. Ensure a second authorised user is available."],
              ["Checker rejects proposal", "Proposal moves to REJECTED state. Sandbox run remains. A new proposal can be created from the same or a new sandbox run.", "Analyst reviews checker comments, revises inputs, runs new sandbox simulation."],
            ],
          },
        },
      ],
    },

    // ─── L5: Ledger Immutability ──────────────────────────────────────────────
    {
      id: "execution-pipeline-ledger",
      heading: "Ledger Immutability",
      level: "L5",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/ledger.py" },
      ],
      blocks: [
        {
          type: "text",
          body: "The ledger_entries table is the final, immutable record of every committed hedge. It is a WORM table: rows are appended only, never updated or deleted. A daily Merkle root provides a cryptographic digest of all entries committed on a given trading day.",
        },
        {
          type: "formula",
          formula: {
            label: "Daily Ledger Merkle Root",
            expression: "root_hash = SHA256(h1 ‖ h2 ‖ h3 ‖ h4 ‖ h5)",
            explanation:
              "h1 through h5 are the SHA-256 hashes of five ledger_entry hash components concatenated in canonical order. The root_hash covers all entries committed on the same trading day. ‖ denotes string concatenation before hashing.",
            source: "ledger.py",
            codeRef: { file: "backend/app/models/ledger.py" },
          },
        },
        {
          type: "table",
          table: {
            headers: ["Immutability Feature", "Implementation"],
            rows: [
              ["WORM table", "No UPDATE or DELETE operations on ledger_entries in application code"],
              ["Daily Merkle root", "SHA256(h1‖h2‖h3‖h4‖h5) over each day's committed entries"],
              ["Entry-level hash", "Each ledger_entry has its own SHA-256 hash over canonical JSON"],
              ["Examiner verification", "Root hash can be independently recomputed from entry data to detect tampering"],
              ["Linked to audit chain", "LEDGER_COMMIT audit event references ledger_entry_id and execution_proposal_id"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "The daily Merkle root is the cryptographic seal on each day's trading activity. For examiner verification: download all ledger entries for a given day, recompute each entry hash, concatenate the five components in canonical order, and verify the SHA-256 result matches the stored root_hash. Any tampering with any entry will produce a hash mismatch.",
          },
        },
        {
          type: "table",
          table: {
            headers: ["Regulatory Framework", "Ledger Feature"],
            rows: [
              ["EMIR Art. 9 — Record keeping", "WORM ledger with complete trade details retained for 5 years minimum"],
              ["MiFID II Art. 16 — Transaction records", "Immutable ledger_entry with execution_proposal_id, counterparty, notional, strike"],
              ["CFTC Part 45 — Swap data reporting", "Audit-ready Merkle-sealed daily record with hash verification path"],
              ["SOX — Financial record integrity", "Append-only ledger with Merkle root and complete approval chain documentation"],
              ["IFRS 9 — Hedge accounting documentation", "Ledger entry links to policy_instance (designation) and calculation_run (effectiveness basis)"],
            ],
          },
        },
      ],
    },
  ],
};
