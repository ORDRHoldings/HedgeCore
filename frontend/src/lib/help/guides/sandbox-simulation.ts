import type { GuideDoc } from "@/lib/help/guides/types";

export const SANDBOX_SIMULATION: GuideDoc = {
  id: "sandbox-simulation",
  title: "Sandbox & Simulation",
  summary:
    "Run the full 7-stage hedge engine in simulation mode without ledger writes. Covers the engine pipeline, decision gate hard limits, cost models, and governance use cases.",
  path: "/sandbox",
  icon: "FlaskConical",
  lastReviewed: "2026-02-28",
  relatedIds: ["position-desk", "policy-engine", "execution-pipeline"],
  sections: [
    // ─── L1: Sandbox Overview ─────────────────────────────────────────────────
    {
      id: "sandbox-simulation-overview",
      heading: "Sandbox Overview",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/recommend.py", symbol: "recommend" },
      ],
      blocks: [
        {
          type: "text",
          body: "The Sandbox runs the complete 7-stage hedge calculation engine (ENGINE_VERSION 1.0.3) in simulation mode. No ledger entry is created, no position status is modified, and no staging artifact is submitted. The sandbox is the appropriate environment for training new analysts, prototyping policy configurations, and preparing committee demonstrations.",
        },
        {
          type: "table",
          table: {
            headers: ["Property", "Sandbox", "Production (Ledger)"],
            rows: [
              ["Ledger write", "No", "Yes — WORM append"],
              ["Position status change", "No", "Yes — transitions to HEDGED"],
              ["Audit logging", "Yes — run_type=SANDBOX", "Yes — run_type=PRODUCTION"],
              ["Decision gate applied", "Yes — full 8-check gate", "Yes — full 8-check gate"],
              ["Repeatable", "Yes — run as many times as needed", "Once per approval cycle"],
              ["Promotable to proposal", "Yes — analyst can promote to staging", "N/A — already committed"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "All sandbox runs are recorded in calculation_runs with run_type='SANDBOX'. They appear in the team activity feed and Recent Runs widget. Sandbox runs are audited but never linked to ledger_entries.",
          },
        },
      ],
    },

    // ─── L2: Running a Simulation ─────────────────────────────────────────────
    {
      id: "sandbox-simulation-run",
      heading: "Running a Simulation",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Open the Sandbox",
              detail: "Navigate to /sandbox. Requires calculate.run_sandbox permission.",
            },
            {
              n: 2,
              label: "Specify position inputs",
              detail: "Enter position details manually (notional_usd, currency_pair, settlement_date, exposure_type) or load an existing READY_TO_EXECUTE position from the Position Desk using the 'Load from Position Desk' button.",
            },
            {
              n: 3,
              label: "Select a policy template (optional)",
              detail: "Choose an active policy template from the dropdown. The policy parameters (coverage_ratio, instrument_type, max_cost_bps, etc.) are pre-loaded. Overrides are not supported in v1 — all engine override fields are explicitly ignored.",
            },
            {
              n: 4,
              label: "Set market inputs",
              detail: "Provide the spot rate for the currency pair. Additional market inputs (option deltas, vega sensitivities, futures prices) are required for options and vega-driven instruments.",
            },
            {
              n: 5,
              label: "Configure scenario shocks (optional)",
              detail: "Add one or more percentage spot-rate shocks to test the hedge plan under stress scenarios (e.g. -10%, +5%, -15%). The scenario engine runs each shock and reports net PnL and effectiveness.",
            },
            {
              n: 6,
              label: "Run the engine",
              detail: "Click 'Run Simulation'. The 7-stage engine executes deterministically. A plan_id (SHA-256 hash of the plan core) is generated and the full decision trace is stored.",
            },
            {
              n: 7,
              label: "Review output",
              detail: "Examine the output across all 7 stage panels: exposure profile, risk classification, strategy selection, instrument mapping, sizing, costs, and scenario results. The decision gate verdict (APPROVE, APPROVE_WITH_CONDITIONS, or REJECT) is shown with reasons.",
            },
            {
              n: 8,
              label: "Promote to proposal (optional)",
              detail: "If the run is satisfactory, click 'Promote to Proposal' to create a staging artifact. This requires calculate.run_production + pipeline.create_proposal permissions.",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "The engine is fail-closed. If any stage fails, no partial hedge plan is emitted and the output shows a stage failure envelope. Review the error_code in the decision trace to diagnose.",
          },
        },
      ],
    },

    // ─── L2: Sandbox Variables ────────────────────────────────────────────────
    {
      id: "sandbox-simulation-variables",
      heading: "Sandbox Variables",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "field-dict",
          fields: [
            {
              name: "notional_usd",
              type: "decimal",
              constraints: "> 0",
              meaning: "Notional exposure amount in USD (or USD-equivalent). Primary input to the exposure stage.",
              example: "2500000.00",
            },
            {
              name: "currency_pair",
              type: "string",
              constraints: "6-char ISO code",
              meaning: "The FX pair of the exposure",
              example: "USDMXN",
            },
            {
              name: "settlement_date",
              type: "ISO date",
              constraints: "Must be in future",
              meaning: "Expected settlement date. Determines tenor bucket and strategy eligibility.",
              example: "2026-09-30",
            },
            {
              name: "policy_template_id",
              type: "UUID",
              constraints: "Optional; must reference an active policy instance",
              meaning: "Pre-loads policy parameters. If omitted, engine uses built-in defaults.",
              example: "a1b2c3d4-e5f6-...",
            },
            {
              name: "spot_rate",
              type: "decimal",
              constraints: "> 0, required for delta-driven sizing",
              meaning: "Current spot rate for the currency pair. Provided by the analyst — not taken from dashboard feeds.",
              example: "18.42",
            },
            {
              name: "scenario_shocks",
              type: "array of decimal",
              constraints: "Percentage moves, e.g. [-0.10, 0.05, -0.15]",
              meaning: "List of spot-rate percentage shocks to run in the scenario engine. Each shock produces a net PnL and effectiveness result.",
              example: "[-0.10, -0.05, 0.05, 0.10]",
            },
          ],
        },
      ],
    },

    // ─── L3: 7-Stage Engine Pipeline ──────────────────────────────────────────
    {
      id: "sandbox-simulation-pipeline",
      heading: "7-Stage Engine Pipeline",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/recommend.py", symbol: "recommend" },
      ],
      blocks: [
        {
          type: "text",
          body: "The engine orchestrator (recommend.py) executes seven stages sequentially. Each stage is deterministic, has no I/O, and produces a fingerprinted output that feeds the next stage. The pipeline is fail-closed: a failure in any stage stops execution and returns a rejection envelope.",
        },
        {
          type: "table",
          table: {
            headers: ["Stage #", "Module", "Function", "Input", "Output"],
            rows: [
              ["1", "exposure", "compute_exposure", "positions or exposure_input from payload", "exposures: {delta_usd, vega_usd, gamma_usd, theta_usd}"],
              ["2", "risk_classifier", "classify_risk", "exposures dict", "risk classifications: R1-R8 scores per exposure"],
              ["3", "strategy_selector", "select_strategies", "risk classifications", "ranked strategy list (up to max_strategies_forward=25)"],
              ["4", "instrument_mapper", "map_instruments", "strategies list", "mapped_instruments: concrete instrument specs per strategy"],
              ["5", "hedge_sizer", "size_hedges", "exposures + mapped_instruments + market prices", "sized_hedges: contracts, notional_usd, margin estimate per instrument"],
              ["6", "cost_engine", "compute_costs", "sized_hedges + instrument_meta + market + assumptions", "costs: one-time + carry breakdown, total_usd"],
              ["7", "scenario_engine", "run_scenarios", "portfolio + sized_hedges + market + scenario shocks", "scenario_results: net PnL and effectiveness per scenario"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "Each stage records input_fingerprint and output_fingerprint (SHA-256) in the decision trace. The trace_fingerprint covers the entire pipeline run and is stored with the calculation_run record for replay verification.",
          },
        },
        {
          type: "text",
          body: "After the 7 stages complete, the orchestrator synthesises a plan_core object and computes a plan_id (SHA-256 hash of the plan_core). This plan_id is the stable identifier for the sandbox result. It does not change on re-runs with identical inputs.",
        },
      ],
    },

    // ─── L3: Decision Gate Hard Limits ────────────────────────────────────────
    {
      id: "sandbox-simulation-decision-gate",
      heading: "Decision Gate Hard Limits",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/decision_gate.py", symbol: "decision_gate" },
        { file: "backend/app/engine/decision_gate.py", symbol: "_policy_defaults" },
      ],
      blocks: [
        {
          type: "text",
          body: "The decision gate is a separate deterministic module that evaluates the plan_core against a set of hard REJECT conditions. A single HARD reason causes a REJECT verdict. Soft conditions produce APPROVE_WITH_CONDITIONS. The gate never modifies, resizes, or remaps hedges — it is decision-only.",
        },
        {
          type: "table",
          table: {
            headers: ["Check #", "Condition", "Threshold", "Verdict if Breached"],
            rows: [
              ["1", "Total hedge cost (bps of notional)", "> 75 bps", "REJECT — REASON_COST_TOO_HIGH"],
              ["2", "Total hedge cost (absolute, when notional unknown)", "> $25,000 USD", "REJECT — REASON_COST_TOO_HIGH"],
              ["3", "Worst-case net PnL across scenarios", "< -$50,000 USD", "REJECT — REASON_WORST_CASE_TOO_LOW"],
              ["4", "Minimum hedge effectiveness (fraction)", "< 0.25", "REJECT — REASON_EFFECTIVENESS_TOO_LOW"],
              ["5", "Rejected legs count", "> 0 (default strict)", "REJECT — REASON_TOO_MANY_REJECTIONS"],
              ["6", "Zero-contract hedge plan", "All contracts = 0", "REJECT — REASON_EMPTY_HEDGE_PLAN"],
              ["7", "Upstream orchestrator stage failure", "Any stage failed", "REJECT — REASON_STAGE_FAILURE"],
              ["8", "Unhedged material risks (if risk classifier output provided)", "score ≥ 0.50 and covered=False", "REJECT — REASON_UNHEDGED_MATERIAL_RISK"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "The decision gate thresholds are conservative institutional defaults. They can be overridden via the policy parameter at the API level, but all overrides are recorded in the decision trace. The cost gate defaults (75 bps, $25k) and worst-case floor (-$50k) are the reference values from the production configuration.",
          },
        },
        {
          type: "text",
          body: "When effectiveness is not computable (e.g. all scenario portfolio PnLs are positive — no downside to offset), the gate adds an APPROVE_WITH_CONDITIONS reason requiring manual review of scenario results. This is not a REJECT.",
        },
      ],
    },

    // ─── L3: Cost Models ──────────────────────────────────────────────────────
    {
      id: "sandbox-simulation-cost-models",
      heading: "Cost Models",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/cost_engine.py", symbol: "compute_costs" },
      ],
      blocks: [
        {
          type: "text",
          body: "The cost engine supports four cost models, each representing a different instrument cost structure. The model is selected per-instrument via the instrument_meta configuration. All models use a conservative gross outflow methodology (COST_METHODOLOGY = 'gross_outflow_conservative').",
        },
        {
          type: "table",
          table: {
            headers: ["Cost Model", "One-Time Cost Formula", "Carry Cost", "Typical Instrument"],
            rows: [
              ["spread_plus_margin", "notional × (spread_bps / 10000) × trade_mult + contracts × fee_per_contract × trade_mult", "margin_posted × margin_rate × (days/365)", "Futures, perps"],
              ["spread_plus_premium", "notional × (spread_bps / 10000) × trade_mult + contracts × premium_per_contract", "None (options carry not modelled)", "Options"],
              ["fee_plus_spread", "notional × (spread_bps / 10000) × trade_mult + contracts × fee_per_contract × trade_mult", "None", "Exchange-traded FX forwards"],
              ["spread_only", "notional × (spread_bps / 10000) × trade_mult", "None", "OTC NDFs, simple forwards"],
              ["funding (perp only)", "notional × (spread_bps / 10000)", "notional × funding_rate_annual × (days/365)", "Perpetual swaps"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "trade_mult = 2.0 if assume_round_trip=True (entry + exit), otherwise 1.0 (entry only, default). The round-trip assumption is off by default — it can be set in the engine policy.",
          },
        },
        {
          type: "text",
          body: "All cost inputs (spread_bps, fee_per_contract, margin_rate, funding_rate_annual, option_premium_per_contract) must be explicitly provided in the assumptions payload. The engine does not fetch pricing from live feeds. If a required cost input is missing and allow_missing_spread_bps / allow_missing_fees are both False (default), the instrument row is rejected.",
        },
      ],
    },

    // ─── L4: Sandbox vs Ledger ────────────────────────────────────────────────
    {
      id: "sandbox-simulation-vs-ledger",
      heading: "Sandbox vs Ledger",
      level: "L4",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] The run_type field and its relationship to ledger_entries described here is based on the intended design. Verify against backend/app/models/calculation_run.py.",
          },
        },
        {
          type: "text",
          body: "Every engine run — sandbox or production — creates a calculation_run record. The run_type field distinguishes sandbox runs from production runs. Sandbox runs are never linked to ledger_entries; they have no downstream financial consequence.",
        },
        {
          type: "table",
          table: {
            headers: ["Property", "Sandbox (run_type=SANDBOX)", "Production (run_type=PRODUCTION)"],
            rows: [
              ["calculation_run record", "Yes — always written", "Yes — always written"],
              ["Linked to ledger_entry", "No — never", "Yes — on successful ledger commit"],
              ["Linked to position status change", "No", "Yes — position transitions to HEDGED"],
              ["Appears in Recent Runs", "Yes", "Yes"],
              ["Appears in Audit Trail", "Yes — run type labelled SANDBOX", "Yes — run type labelled PRODUCTION"],
              ["Can be promoted to proposal", "Yes — analyst's discretion", "N/A"],
              ["Immutable after creation", "Yes — WORM like all calculation_runs", "Yes — WORM"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "Because sandbox runs are audited and immutable, they provide a complete record of analytical work even before a production run is committed. This is valuable for showing the committee the range of scenarios evaluated before the final hedge decision.",
          },
        },
      ],
    },

    // ─── L5: Governance Use Case ──────────────────────────────────────────────
    {
      id: "sandbox-simulation-governance",
      heading: "Governance Use Case",
      level: "L5",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "The sandbox serves several formal governance use cases beyond day-to-day analytical work.",
        },
        {
          type: "table",
          table: {
            headers: ["Use Case", "Procedure", "Governance Value"],
            rows: [
              ["New analyst onboarding", "Run sandbox with training positions. Review all 7 stage outputs. Verify decision gate interpretation.", "Demonstrates system literacy before production access. All runs audited."],
              ["Policy template validation", "Run proposed template against representative positions across different tenors and notionals. Check effectiveness scores and decision gate verdicts.", "Provides evidence that the policy performs as intended before activation."],
              ["Board/committee demonstration", "Run sandbox with real exposure data. Export full decision trace and scenario analysis to PDF.", "Auditable demonstration record. Plan_id provides unique reference for the demo run."],
              ["Stress testing", "Run multiple scenario shocks on key positions. Compare worst-case PnL across hedge strategies.", "Identifies policy fragility before production commitment."],
              ["Pre-approval review", "Analyst runs sandbox, reviews output, promotes to proposal. Checker can view the underlying sandbox run in the proposal detail.", "Full analytical lineage from sandbox run to staging artifact."],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "All sandbox runs appear in the audit trail. When the sandbox is used as part of a formal pre-trade approval process, the run records constitute documentary evidence of the analytical steps taken before execution. Retain plan_ids in the approval documentation.",
          },
        },
      ],
    },
  ],
};
