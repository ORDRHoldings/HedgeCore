import type { ModuleHelp } from "@/lib/help/types";

export const SANDBOX_HELP: ModuleHelp = {
  moduleId: "sandbox",
  pageTitle: "Sandbox Calculator",
  pageSubtitle: "SIMULATION MODE · NO LEDGER WRITE · SAFE",
  sections: [
    {
      id: "sandbox-overview",
      anchor: "sandbox-overview",
      title: "Sandbox Overview",
      icon: "FlaskConical",
      level: 1,
      type: "text",
      verified: true,
      codeRefs: [{ file: "frontend/src/app/sandbox/page.tsx" }],
      content:
        "The Sandbox Calculator runs the full 7-stage hedge calculation engine in simulation mode. Sandbox results are computed with the same mathematical rigour as live proposals but are isolated from the production ledger — no ledger_entries are created and no positions are modified.\n\n" +
        "This makes Sandbox the correct environment for:\n" +
        "- **Training new analysts** without risk of accidental ledger writes or policy violations\n" +
        "- **Scenario testing** — exploring how different spot rates, notional sizes, or policy templates affect the recommended hedge strategy and cost\n" +
        "- **Policy prototyping** — validating that a new policy template produces sensible recommendations before publishing it to the live pipeline\n" +
        "- **Committee demonstrations** — presenting hedge strategy options to the investment committee or board without creating any operational commitment\n\n" +
        "All sandbox runs are stored in the WORM calculation_runs table with run_type='SANDBOX', so they remain fully auditable even though they never touch the ledger. A sandbox run that meets your requirements can be promoted to a formal proposal via the Execution Desk.",
    },
    {
      id: "sandbox-pipeline-position",
      anchor: "sandbox-pipeline-position",
      title: "Pipeline Position",
      icon: "Workflow",
      level: 1,
      type: "pipeline",
      verified: true,
      codeRefs: [{ file: "frontend/src/app/sandbox/page.tsx" }],
      pipelinePos: {
        position: 1,
        total: 7,
        label: "Sandbox",
        next: { label: "Input", href: "/position-desk" },
        description:
          "Sandbox is the entry point of the hedge workflow — explore hedge strategies without commitment. The full 7-stage engine runs in simulation mode. Successful sandbox runs can be promoted to a formal proposal via the Execution Desk.",
      },
    },
    {
      id: "sandbox-run-workflow",
      anchor: "sandbox-run-workflow",
      title: "Running a Sandbox Calculation",
      icon: "Play",
      level: 2,
      type: "workflow",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/sandbox/page.tsx" },
        { file: "backend/app/engine/recommend.py" },
      ],
      steps: [
        {
          step: 1,
          label: "Enter Position Details",
          description:
            "Input the notional amount in USD, the currency pair (e.g. EURUSD), and the settlement date. These three fields drive the exposure calculation in Stage 1 of the engine. Optionally add a memo for your own reference — it is stored in the calculation_run record.",
        },
        {
          step: 2,
          label: "Select Policy Template (or use DEFAULT_POLICY)",
          description:
            "Choose a policy template from the dropdown. The template determines which hedge strategies are eligible (Stage 3) and the cost threshold for the decision gate. If no template is selected, the engine uses DEFAULT_POLICY — a conservative set of rules suitable for general-purpose simulation.",
        },
        {
          step: 3,
          label: "Set Spot Rate (or use Fallback)",
          description:
            "Optionally enter the spot rate for the currency pair. If left blank, the engine uses its configured fallback rate (a recent mid-market rate). For scenario testing, enter custom rates to model stress conditions or future-dated assumptions.",
        },
        {
          step: 4,
          label: "Run Engine",
          description:
            "Click Run Calculation. The request is sent to the backend engine (ENGINE_VERSION 1.0.3). All 7 stages execute sequentially. The typical response time is under 2 seconds for standard inputs. The run is recorded in calculation_runs regardless of outcome.",
        },
        {
          step: 5,
          label: "Review Output",
          description:
            "The results panel shows the recommended strategy, the proposed instrument list, computed hedge ratio, total cost in basis points, IFRS 9 effectiveness estimate, and the scenario P&L chart across ±5% spot shocks. Review each section before deciding to promote.",
        },
        {
          step: 6,
          label: "Optionally Promote to Proposal",
          description:
            "If the sandbox result is satisfactory, click Promote to Proposal. This creates a formal execution_proposal in STAGING status, referencing the sandbox calculation_run_id. The proposal then enters the 4-eyes approval workflow on the Execution Desk.",
        },
      ],
    },
    {
      id: "sandbox-variables",
      anchor: "sandbox-variables",
      title: "Sandbox Variables",
      icon: "SlidersHorizontal",
      level: 2,
      type: "variables",
      verified: true,
      codeRefs: [{ file: "frontend/src/app/sandbox/page.tsx" }],
      variables: [
        {
          name: "notional_usd",
          type: "number (USD)",
          description:
            "The gross notional amount of the FX exposure in US dollars. Used by the exposure stage to compute the delta_usd and the R1-R4 risk vector. Must be a positive number. Values below $10,000 may produce instrument-sizing warnings.",
          example: "5000000",
          source: "Notional input field",
        },
        {
          name: "currency_pair",
          type: "string (ISO 4217 pair)",
          description:
            "The currency pair of the exposure, expressed as a 6-character ISO code. The first 3 characters are the base currency; the last 3 are the quote currency. Used by the risk_classifier and instrument_mapper stages.",
          example: "EURUSD",
          source: "Currency pair selector",
        },
        {
          name: "settlement_date",
          type: "ISO 8601 date",
          description:
            "The date on which the FX exposure settles. Determines tenor_years for option pricing (Black-Scholes / Garman-Kohlhagen), forward points calculation, and the cost_engine's funding cost model.",
          example: "2025-09-30",
          source: "Settlement date picker",
        },
        {
          name: "policy_template_id",
          type: "UUID | null",
          description:
            "References a policy_template row. Determines eligible strategies, cost thresholds, and instrument constraints. Null triggers DEFAULT_POLICY — a built-in fallback suitable for sandbox exploration. DEFAULT_POLICY uses conservative strategy rules and a 75 bps cost ceiling.",
          example: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          source: "Policy template dropdown",
        },
        {
          name: "spot_rate",
          type: "number | null",
          description:
            "The spot FX rate for the currency pair at the time of calculation. If null, the engine substitutes its configured fallback rate. Override with a custom rate to model stress scenarios (e.g. a 10% depreciation of the base currency).",
          example: "1.0845",
          source: "Spot rate input (optional)",
        },
        {
          name: "scenario_shocks",
          type: "number[] (percentage moves)",
          description:
            "A list of spot rate percentage shocks for the scenario_engine (Stage 7). Default shocks are [-5, -4, -3, -2, -1, 0, +1, +2, +3, +4, +5] percent. Custom shocks can be entered as a comma-separated list to model tail scenarios beyond ±5%.",
          example: "[-10, -5, 0, 5, 10]",
          source: "Scenario shocks input (optional)",
        },
      ],
    },
    {
      id: "sandbox-engine-pipeline",
      anchor: "sandbox-engine-pipeline",
      title: "7-Stage Engine Pipeline",
      icon: "Cpu",
      level: 3,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/engine/recommend.py" }],
      content:
        "The sandbox engine executes identically to the live proposal engine. ENGINE_VERSION 1.0.3. The 7 stages run sequentially; each stage receives the output of the prior stage as its input.\n\n" +
        "**Stage 1 — Exposure** (`exposure`): Parses the notional amount and currency pair. Computes delta_usd (the USD-equivalent P&L sensitivity to a 1% spot move) and populates the R1-R4 risk vector components (directional, tenor, liquidity, counterparty concentration).\n\n" +
        "**Stage 2 — Risk Classifier** (`risk_classifier`): Normalises the R1-R8 risk taxonomy across all eight risk dimensions. Applies the immutable R1-R8 taxonomy mapping to produce a risk_score and risk_tier (LOW / MEDIUM / HIGH / CRITICAL). This classification feeds strategy selection.\n\n" +
        "**Stage 3 — Strategy Selector** (`strategy_selector`): Reads the policy template's strategy eligibility rules and maps the risk_tier and currency characteristics to a strategy_code (e.g. VANILLA_FORWARD, COLLAR, SPOT_COVER). The strategy → instrument mapping is immutable in v1.\n\n" +
        "**Stage 4 — Instrument Mapper** (`instrument_mapper`): Translates the strategy_code into a concrete list of instruments (e.g. EUR/USD 6-month forward, EUR put/USD call at 1.08 strike). Each instrument carries its own tenor, notional allocation, and pricing model reference.\n\n" +
        "**Stage 5 — Hedge Sizer** (`hedge_sizer`): Computes the number of contracts or notional of each instrument required to achieve the target hedge ratio. Applies lot-size rounding and minimum size constraints. Outputs a sized_instruments list.\n\n" +
        "**Stage 6 — Cost Engine** (`cost_engine`): Applies one of 5 cost models to each instrument (see Cost Models section below). Aggregates to total_cost_bps. Passes through the decision gate which compares cost_bps to risk_limit_bps.\n\n" +
        "**Stage 7 — Scenario Engine** (`scenario_engine`): Computes a linear proxy P&L for the hedged portfolio across the specified scenario_shocks (default ±5% in 1% increments). Outputs a scenario_matrix used to render the P&L chart in the results panel.",
    },
    {
      id: "sandbox-cost-models",
      anchor: "sandbox-cost-models",
      title: "Cost Models",
      icon: "DollarSign",
      level: 3,
      type: "formula",
      verified: true,
      codeRefs: [{ file: "backend/app/engine/cost_engine.py" }],
      formulas: [
        {
          label: "Spread Plus Margin",
          latex:
            "C_{\\text{spm}} = \\text{mid\\_spread} + \\text{dealer\\_margin}",
          explanation:
            "Used for vanilla forwards and swaps. mid_spread is the bid-ask spread at the mid-market rate, expressed in basis points. dealer_margin is the bank's mark-up, sourced from the policy template's dealer_margin_bps field. Both components are additive.",
          source: "backend/app/engine/cost_engine.py",
          codeRef: { file: "backend/app/engine/cost_engine.py" },
        },
        {
          label: "Spread Plus Premium",
          latex:
            "C_{\\text{spp}} = \\text{mid\\_spread} + \\text{option\\_premium\\_bps}",
          explanation:
            "Used for vanilla options (calls, puts, collars). option_premium_bps is the Garman-Kohlhagen option premium converted to basis points of notional. This model captures the full cost of buying an option including the spread on the premium itself.",
          source: "backend/app/engine/cost_engine.py",
          codeRef: { file: "backend/app/engine/cost_engine.py" },
        },
        {
          label: "Fee Plus Spread",
          latex:
            "C_{\\text{fps}} = \\text{flat\\_fee\\_bps} + \\text{mid\\_spread}",
          explanation:
            "Used for structured products with explicit arrangement fees. flat_fee_bps is a fixed cost in basis points (e.g. a structuring fee), added to the market spread. Suitable for cross-currency swaps and exotic instruments with upfront cost components.",
          source: "backend/app/engine/cost_engine.py",
          codeRef: { file: "backend/app/engine/cost_engine.py" },
        },
        {
          label: "Spread Only",
          latex: "C_{\\text{so}} = \\text{mid\\_spread}",
          explanation:
            "The simplest model, used for highly liquid instruments where dealer margins are embedded in the spread and no separate premium or fee applies. Typically used for G10 spot and short-dated forwards in major pairs.",
          source: "backend/app/engine/cost_engine.py",
          codeRef: { file: "backend/app/engine/cost_engine.py" },
        },
        {
          label: "Funding (Carry) Cost",
          latex:
            "C_{\\text{fund}} = \\text{carry\\_rate} \\times \\text{notional} \\times \\text{tenor\\_years}",
          explanation:
            "Used to capture the financing cost of holding a hedging position over time. carry_rate is the net carry (domestic rate minus foreign rate, in basis points per annum). tenor_years is derived from settlement_date. This model is applied to cross-currency basis swaps and long-dated forwards.",
          source: "backend/app/engine/cost_engine.py",
          codeRef: { file: "backend/app/engine/cost_engine.py" },
        },
      ],
    },
    {
      id: "sandbox-vs-ledger",
      anchor: "sandbox-vs-ledger",
      title: "Sandbox vs Ledger Distinction",
      icon: "GitCompare",
      level: 4,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/models/calculation_run.py" }],
      callout: {
        type: "caution",
        text:
          "Sandbox runs cannot be cited as hedge documentation for IFRS 9 or regulatory purposes. Only calculation runs linked to committed ledger_entries (run_type='LIVE') constitute audit evidence for executed hedges.",
      },
      content:
        "The distinction between sandbox and live runs is enforced at two layers:\n\n" +
        "**Database layer**: Every calculation run is stored in the WORM calculation_runs table with a run_type column. Sandbox runs use run_type='SANDBOX'; live proposal runs use run_type='LIVE'. The table is append-only — run_type cannot be changed after insert. A sandbox run therefore can never be retrospectively reclassified as a live run.\n\n" +
        "**Application layer**: Sandbox run IDs are not accepted as valid sources for ledger_entry creation. The ledger write path validates that the source calculation_run has run_type='LIVE' before committing. Attempting to promote a sandbox run directly to a ledger entry (bypassing the proposal workflow) returns HTTP 422.\n\n" +
        "**Audit trail visibility**: Sandbox runs appear in audit_events with event_type='calculation.sandbox'. Live runs appear as 'calculation.live'. This allows auditors to quickly filter audit exports to show only ledger-linked calculations.\n\n" +
        "**Promotion workflow**: To convert a sandbox result to a live proposal, use the Promote to Proposal function. This creates a new execution_proposal in STAGING status, which then undergoes the full 4-eyes approval workflow (maker submits → checker approves → ledger commits). The promotion step itself is logged in audit_events with both the sandbox calculation_run_id and the new proposal_id.",
    },
    {
      id: "sandbox-training-governance",
      anchor: "sandbox-training-governance",
      title: "Training & Governance",
      icon: "GraduationCap",
      level: 5,
      type: "text",
      verified: false,
      callout: {
        type: "info",
        text:
          "The following governance recommendations are advisory. Formalise them in your treasury operations manual and include sandbox usage in your onboarding programme for new analysts.",
      },
      content:
        "**Analyst Onboarding**: New analysts should complete a structured sandbox curriculum before being granted proposals.submit permission. A suggested onboarding sequence: (1) run sandbox with DEFAULT_POLICY on 5 standard currency pairs, (2) run sandbox with a custom spot rate to model a stress scenario, (3) run sandbox with a non-standard policy template, (4) review the resulting effectiveness estimate and cost breakdown with a senior analyst.\n\n" +
        "**Policy Template Validation**: Before publishing a new policy_template to the live environment, the head_of_risk or treasury manager should validate it in sandbox against at least three representative position types (small/medium/large notional, short/medium/long tenor, G10/EM currency pair). Sandbox validation run IDs should be documented in the policy change approval record.\n\n" +
        "**Committee Demonstrations**: When presenting hedge strategy options to an investment committee or board, use Sandbox mode exclusively. Share the scenario P&L chart and cost breakdown from the sandbox output. This ensures no accidental operational commitment arises from the demonstration.\n\n" +
        "**Compliance Oversight**: Although sandbox runs never reach the ledger, they remain fully auditable. All sandbox runs appear in audit_events, preserving a complete record of who modelled what, with which parameters, and when. This supports compliance oversight of the treasury function's analytical activities — not just its executed transactions.\n\n" +
        "**Scenario Library**: Consider maintaining an internal library of sandbox runs corresponding to standard stress scenarios (e.g. 10% USD depreciation, emerging market currency crisis, central bank surprise). These can be re-run periodically to demonstrate that the engine's recommendations remain robust as market conditions evolve.",
    },
  ],
};
