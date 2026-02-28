import type { GuideDoc } from "@/lib/help/guides/types";

export const EXECUTION_BRIDGE: GuideDoc = {
  id: "execution-bridge",
  title: "Execution Bridge",
  summary:
    "The Execution Bridge (/execution) connects sandbox engine results to real-world FX execution workflows. It provides simulation mode (bridge mode) for pre-trade analysis and a history view for reviewing past runs.",
  path: "/execution",
  icon: "⇄",
  lastReviewed: "2026-02-28",
  relatedIds: ["getting-started", "position-desk", "governance", "api-reference"],
  sections: [
    // ─── L1: What is the Execution Bridge? ───────────────────────────────────
    {
      id: "eb-what-is",
      heading: "What is the Execution Bridge?",
      level: "L1",
      verified: false,
      callout: {
        type: "info",
        text: "The Execution Bridge (/execution) is a demonstration interface for simulating how sandbox engine results would map to FX execution fills. It does not write to the Ledger and cannot initiate live trades.",
      },
      blocks: [
        {
          type: "text",
          body: "The Execution Bridge page sits between the Sandbox Engine and the full Execution Pipeline. It allows treasury analysts and risk officers to load completed sandbox run results, enter bridge (simulation) mode to review proposed fill structures, and evaluate execution cost estimates — all without committing any record to the LEDGER.",
        },
        {
          type: "table",
          table: {
            headers: ["Tab", "Purpose", "Writes to Ledger?"],
            rows: [
              ["SIM (Bridge Mode)", "Simulate fills from a sandbox run result; review proposed hedge structure", "No — SANDBOX only"],
              ["HISTORY", "Review past bridge-mode simulation records for the current user", "No — read-only"],
            ],
          },
        },
        {
          type: "text",
          body: "The bridge is designed for pre-trade analysis workflows: broker comparison, treasury committee demos, and scenario rehearsal before the proposal is formally promoted through the Execution Pipeline (SANDBOX → STAGING → LEDGER).",
        },
      ],
    },

    // ─── L2: Bridge vs Pipeline ───────────────────────────────────────────────
    {
      id: "eb-bridge-vs-pipeline",
      heading: "Bridge vs Pipeline",
      level: "L2",
      verified: false,
      callout: {
        type: "info",
        text: "The Execution Bridge (/execution) is a demonstration and pre-trade analysis interface. The Execution Pipeline (/execution-desk) is the governed workflow that produces immutable staging artifacts and ledger commits.",
      },
      blocks: [
        {
          type: "table",
          table: {
            headers: ["Dimension", "Execution Bridge (/execution)", "Execution Pipeline (/execution-desk)"],
            rows: [
              ["Purpose", "Pre-trade simulation and broker comparison", "Governed staging, 4-eyes approval, ledger commit"],
              ["Run Type", "SANDBOX only", "SANDBOX → STAGING → LEDGER"],
              ["Ledger Write", "Never", "Yes — on authorized commit"],
              ["Audit Trail", "Simulation record only", "Full WORM audit chain"],
              ["Approval Required", "No", "Yes — 4-eyes SoD enforced"],
              ["Typical User", "Analyst, senior analyst", "Senior analyst, supervisor, CFO"],
              ["Use Case", "Broker comparison, treasury committee demos", "Binding hedge execution governance"],
            ],
          },
        },
      ],
    },

    // ─── L2: Execution Bridge Workflow ────────────────────────────────────────
    {
      id: "eb-workflow",
      heading: "Execution Bridge Workflow",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Load run results",
              detail: "Navigate to /execution. Select a completed SANDBOX calculation run from the run selector. The run must have a APPROVE or APPROVE_WITH_CONDITIONS verdict from the decision gate.",
            },
            {
              n: 2,
              label: "Select bridge (SIM) mode",
              detail: "Click the SIM tab to enter bridge mode. The system loads the run's sized_hedges output and maps each leg to a proposed fill structure with indicative spread and margin estimates.",
            },
            {
              n: 3,
              label: "Review proposed fills",
              detail: "Inspect each hedge leg: instrument type, notional, tenor, indicative rate, estimated spread, and total cost. Compare against the engine's cost estimate from the original sandbox run.",
            },
            {
              n: 4,
              label: "Confirm or adjust",
              detail: "Mark the simulation as reviewed. Optionally add notes for the broker comparison record. No approval workflow is required at this stage.",
            },
            {
              n: 5,
              label: "Output logged as SANDBOX simulation",
              detail: "The bridge simulation is recorded as a SANDBOX-type event in the audit trail. No ledger entry is created. To proceed to a binding execution, promote the sandbox run to the Execution Pipeline (/execution-desk).",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "Bridge mode results are indicative only. Fills shown are based on the engine's hedge plan plus a spread model — they are not executable quotes from a broker. For binding execution, use the Execution Pipeline.",
          },
        },
      ],
    },

    // ─── L3: Execution Costs ──────────────────────────────────────────────────
    {
      id: "eb-costs",
      heading: "Execution Costs",
      level: "L3",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "The bridge simulation applies a spread-plus-margin model to estimate the all-in execution cost for each hedge leg. The model is indicative and uses reference spread tiers derived from market convention for each instrument type.",
        },
        {
          type: "formula",
          formula: {
            label: "All-in Execution Cost (Spread + Margin Model)",
            expression: "cost_per_leg = notional × (bid_ask_spread / 2 + dealer_margin)",
            explanation:
              "Half the bid-ask spread captures the crossing cost; the dealer margin captures the credit and operational charge layered on top. Total cost sums across all legs.",
            source: "Market convention — indicative model [Unverified for specific values]",
          },
        },
        {
          type: "table",
          table: {
            headers: ["Instrument", "Pair Type", "Indicative Spread (bps)", "Note"],
            rows: [
              ["FX Forward / NDF", "G10 majors (EURUSD, GBPUSD, AUDUSD)", "2–5 bps", "Tighter in deep liquidity — indicative only [Unverified]"],
              ["FX Forward / NDF", "USDJPY, USDCAD, USDCHF", "3–6 bps", "Indicative — varies by tenor [Unverified]"],
              ["NDF", "EM (USDMXN, USDCNH)", "10–25 bps", "Wider due to settlement and capital controls — indicative only [Unverified]"],
              ["FX Futures", "Listed (CME)", "1–3 bps", "Exchange-traded, narrowest spread — indicative only [Unverified]"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "Spread values shown in bridge mode are illustrative reference tiers, not live executable quotes. Actual transaction costs depend on notional size, tenor, credit relationship with dealer, and prevailing market conditions.",
          },
        },
      ],
    },

    // ─── L4: Controls ─────────────────────────────────────────────────────────
    {
      id: "eb-controls",
      heading: "Controls",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/calculation_run.py", symbol: "CalculationRun" },
      ],
      blocks: [
        {
          type: "text",
          body: "The Execution Bridge enforces a hard boundary between simulation and the governed execution record. The following controls are applied at the application layer:",
        },
        {
          type: "table",
          table: {
            headers: ["Control", "Enforcement Point", "Effect"],
            rows: [
              ["SANDBOX run_type only", "Engine output — calculation_runs table", "Bridge mode can only load runs with run_type=SANDBOX; PRODUCTION or LEDGER runs are not accessible via the bridge"],
              ["No ledger write path", "Application layer", "Bridge mode has no code path to create ledger_entries or staging_artifacts"],
              ["No approval workflow triggered", "Application layer", "Bridge mode confirmation does not create an execution_proposal record"],
              ["Audit log on simulation", "audit_events table (WORM)", "Bridge simulation confirmation is logged as a SANDBOX event in the tamper-evident audit trail"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "The run_type field on calculation_runs is set at engine execution time and is WORM-protected. It cannot be upgraded from SANDBOX to PRODUCTION via the bridge interface. To produce a production run, use the Sandbox Engine with production mode selected and the appropriate permissions (calculate.run_production).",
          },
        },
      ],
    },

    // ─── L5: Institutional Context ────────────────────────────────────────────
    {
      id: "eb-institutional",
      heading: "Institutional Context",
      level: "L5",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "The Execution Bridge serves a specific institutional purpose: providing a governed pre-trade analysis layer that treasury committees, risk officers, and CFOs can use to review execution intent before the four-eyes approval cycle begins.",
        },
        {
          type: "table",
          table: {
            headers: ["Use Case", "Stakeholder", "Bridge Output Used For"],
            rows: [
              ["Broker comparison", "Senior analyst / Treasurer", "Side-by-side cost comparison of proposed fills across indicative dealer spreads"],
              ["Treasury committee demo", "CFO / Head of Risk", "Presenting proposed hedge structure with cost estimates before formal approval vote"],
              ["Pre-approval rehearsal", "Maker (risk analyst)", "Verifying the engine's hedge plan maps cleanly to executable fills before promoting to Execution Pipeline"],
              ["Audit preparation", "Auditor", "Reviewing simulation history to verify that pre-trade analysis was documented before each execution proposal"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "Bridge mode simulations are logged in the audit trail as SANDBOX events. For ISDA and regulatory purposes, pre-trade analysis documentation generated via the bridge can be referenced as evidence of sound process. However, the binding governance record begins at staging artifact creation in the Execution Pipeline — not at bridge simulation.",
          },
        },
      ],
    },
  ],
};
