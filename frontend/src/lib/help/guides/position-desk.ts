import type { GuideDoc } from "@/lib/help/guides/types";

export const POSITION_DESK_GUIDE: GuideDoc = {
  id: "position-desk",
  title: "Position Desk",
  summary:
    "Managing FX exposure positions: lifecycle states, day-to-day workflow, R1-R8 risk classification, keyboard shortcuts, required permissions, and IFRS 9 designation.",
  path: "/position-desk",
  icon: "Table2",
  lastReviewed: "2026-02-28",
  relatedIds: ["data-ingestion", "policy-engine", "sandbox-simulation", "execution-pipeline"],
  sections: [
    // ─── L1: Position Desk Overview ───────────────────────────────────────────
    {
      id: "position-desk-overview",
      heading: "Position Desk Overview",
      level: "L1",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "The Position Desk is the primary interface for managing your company's FX exposure positions. It provides a filterable, searchable grid of all positions across their lifecycle states, with bulk operations and inline status management.",
        },
        {
          type: "table",
          table: {
            headers: ["Capability", "Description"],
            rows: [
              ["Filter by status", "Filter the grid to show only positions in a specific lifecycle state"],
              ["Search by entity", "Full-text search on entity_name, currency_pair, and notes"],
              ["Bulk policy assignment", "Select multiple NEW positions and assign a policy template in one action"],
              ["Status drill-down", "Click any position row to view full details, run history, and audit events"],
              ["Export", "Export visible positions to CSV (requires reports.export_excel permission)"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "Positions are scoped to your authority level. Junior analysts see only their own positions; branch managers see all positions in their branch; head_of_risk and above see company-wide positions.",
          },
        },
      ],
    },

    // ─── L1: Position Status Lifecycle ────────────────────────────────────────
    {
      id: "position-desk-lifecycle",
      heading: "Position Status Lifecycle",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/position.py", symbol: "Position" },
      ],
      blocks: [
        {
          type: "text",
          body: "Every position in ORDR Terminal moves through a defined lifecycle. Status transitions are one-directional and audit-logged. No position can be deleted — positions that will not be hedged are transitioned to REJECTED.",
        },
        {
          type: "table",
          table: {
            headers: ["Status", "Meaning", "What Triggers This State"],
            rows: [
              ["NEW", "Position has been ingested but no policy has been assigned.", "Created by CSV import, manual entry, or ERP sync."],
              ["POLICY_ASSIGNED", "A hedge policy template has been bound to the position.", "Supervisor or risk_analyst assigns a policy via the Position Desk."],
              ["READY_TO_EXECUTE", "Position has been reviewed and cleared for hedge proposal creation.", "Supervisor explicitly marks position as ready after policy review."],
              ["HEDGED", "A hedge has been approved and committed to the ledger for this position.", "Successful ledger commit following four-eyes approval."],
              ["REJECTED", "The position will not be hedged. Permanently closed.", "Explicit rejection by supervisor or head_of_risk, or failed approval."],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "HEDGED and REJECTED are terminal states. A position in either state cannot be moved to any other status. If a hedged position needs re-evaluation, a new position must be created.",
          },
        },
      ],
    },

    // ─── L2: Day-to-Day Workflow ──────────────────────────────────────────────
    {
      id: "position-desk-workflow",
      heading: "Day-to-Day Workflow",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Review NEW positions",
              detail: "Filter the Position Desk to STATUS = NEW. Review each position for completeness: entity name, currency pair, notional, settlement date.",
            },
            {
              n: 2,
              label: "Assign policy template",
              detail: "Select one or more NEW positions. Click 'Assign Policy'. Choose a policy template from the library. Positions transition to POLICY_ASSIGNED. Requires policy.view permission to see available templates.",
            },
            {
              n: 3,
              label: "Review policy fit",
              detail: "Open each POLICY_ASSIGNED position and review the effectiveness score and R1-R8 risk classification to confirm the chosen policy is appropriate.",
            },
            {
              n: 4,
              label: "Mark as READY_TO_EXECUTE",
              detail: "For positions where policy fit is confirmed, click 'Mark Ready'. This transitions the position to READY_TO_EXECUTE. Requires trades.execute permission.",
            },
            {
              n: 5,
              label: "Propose hedge",
              detail: "Navigate to the Sandbox to run a calculation for READY_TO_EXECUTE positions, then promote the result to a proposal. The proposal links back to the position.",
            },
            {
              n: 6,
              label: "Approve and commit to ledger",
              detail: "After four-eyes approval, the hedge is committed. The position automatically transitions to HEDGED.",
            },
          ],
        },
      ],
    },

    // ─── L2: Keyboard Shortcuts ───────────────────────────────────────────────
    {
      id: "position-desk-shortcuts",
      heading: "Keyboard Shortcuts",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] Keyboard shortcuts listed here are described as intended functionality. Verify against current frontend/src/app/position-desk/page.tsx implementation.",
          },
        },
        {
          type: "table",
          table: {
            headers: ["Key", "Action"],
            rows: [
              ["/", "Focus the search input field"],
              ["F", "Cycle through status filters (All → NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED → REJECTED → All)"],
              ["R", "Refresh the position list from the server"],
              ["Esc", "Clear current search query and reset filters to default"],
            ],
          },
        },
      ],
    },

    // ─── L2: Position Variables ───────────────────────────────────────────────
    {
      id: "position-desk-variables",
      heading: "Position Variables",
      level: "L2",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/position.py", symbol: "Position" },
      ],
      blocks: [
        {
          type: "field-dict",
          fields: [
            {
              name: "notional_amount",
              type: "decimal",
              constraints: "> 0",
              meaning: "Face amount of the FX exposure in the base currency of the currency pair",
              example: "2500000.00",
            },
            {
              name: "currency_pair",
              type: "string",
              constraints: "6-char ISO code",
              meaning: "The FX pair of the exposure. Base currency is the exposure currency.",
              example: "USDMXN",
            },
            {
              name: "settlement_date",
              type: "ISO date",
              constraints: "Must be in future at creation",
              meaning: "Expected date of the FX cash flow settlement. Drives tenor bucket classification.",
              example: "2026-09-30",
            },
            {
              name: "exposure_type",
              type: "enum",
              constraints: "payable | receivable",
              meaning: "Direction: payable = short the base currency; receivable = long the base currency",
              example: "payable",
            },
            {
              name: "status",
              type: "enum",
              constraints: "NEW | POLICY_ASSIGNED | READY_TO_EXECUTE | HEDGED | REJECTED",
              meaning: "Current lifecycle state of the position",
              example: "POLICY_ASSIGNED",
            },
            {
              name: "hedge_ratio",
              type: "decimal",
              constraints: "0.0 – 1.0",
              meaning: "Proportion of the notional to be hedged, set by the assigned policy template",
              example: "0.80",
            },
            {
              name: "policy_id",
              type: "UUID",
              constraints: "FK to policy_instances, nullable until POLICY_ASSIGNED",
              meaning: "The policy instance bound to this position",
              example: "d4e3f2a1-...",
            },
            {
              name: "run_id",
              type: "UUID",
              constraints: "FK to calculation_runs, nullable until a run is completed",
              meaning: "The most recent calculation run associated with this position",
              example: "a1b2c3d4-...",
            },
          ],
        },
      ],
    },

    // ─── L3: R1-R8 Risk Classification ────────────────────────────────────────
    {
      id: "position-desk-risk-classification",
      heading: "R1-R8 Risk Classification",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/risk_classifier.py" },
      ],
      blocks: [
        {
          type: "text",
          body: "The hedge engine's risk classifier assigns each exposure to one or more risk categories using the R1-R8 taxonomy. This classification drives strategy selection in the next pipeline stage. R1-R8 are immutable in v1.",
        },
        {
          type: "table",
          table: {
            headers: ["Code", "Risk Type", "Description", "v1 Status"],
            rows: [
              ["R1", "Delta", "Primary spot FX directional risk — the dominant risk for most corporate payables/receivables", "Active"],
              ["R2", "Vega", "Volatility sensitivity — relevant when options are in the hedge strategy", "Active"],
              ["R3", "Gamma", "Convexity risk from option positions — second-order delta change", "Active"],
              ["R4", "Residual", "Basis risk and other residual exposures not captured by R1-R3", "Active"],
              ["R5", "Reserved", "Reserved for future taxonomy extension", "Reserved"],
              ["R6", "Reserved", "Reserved for future taxonomy extension", "Reserved"],
              ["R7", "Reserved", "Reserved for future taxonomy extension", "Reserved"],
              ["R8", "Reserved", "Reserved for future taxonomy extension", "Reserved"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "The R1-R8 taxonomy is frozen in v1 and must not be modified. Changes to risk category definitions require a version increment and a policy revision, as existing hedging relationships are documented against these codes.",
          },
        },
        {
          type: "text",
          body: "Risk scores are normalised per exposure. The classifier outputs a score between 0.0 and 1.0 for each active risk category. A score at or above the material_risk_score_threshold (default 0.50) triggers a residual risk flag at the decision gate if the risk is not covered by any strategy.",
        },
      ],
    },

    // ─── L4: Controls & Permissions ───────────────────────────────────────────
    {
      id: "position-desk-permissions",
      heading: "Controls and Permissions",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/permission.py", symbol: "SEED_PERMISSIONS" },
      ],
      blocks: [
        {
          type: "text",
          body: "Every action on the Position Desk is gated by a specific permission. The following table maps each action to its required permission and the minimum role that holds it by default.",
        },
        {
          type: "table",
          table: {
            headers: ["Action", "Required Permission", "Min Default Role"],
            rows: [
              ["View positions", "trades.view", "risk_analyst"],
              ["Create a new position", "trades.create", "risk_analyst"],
              ["Edit a position (e.g. correct notional)", "trades.edit", "risk_analyst"],
              ["Import positions from CSV", "trades.import_csv", "risk_analyst"],
              ["Mark position READY_TO_EXECUTE", "trades.execute", "risk_analyst"],
              ["Assign policy to position", "policy.view (to see templates) + trades.edit", "risk_analyst"],
              ["Reject a position", "trades.delete", "supervisor"],
              ["View positions across all branches", "reports.view_all_branches", "head_of_risk"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "hierarchy_level is checked for override operations. A user with overrides.override_subordinate permission can act on positions created by users at lower hierarchy levels. This action is always audited.",
          },
        },
      ],
    },

    // ─── L4: Failure Modes & Recovery ─────────────────────────────────────────
    {
      id: "position-desk-failures",
      heading: "Failure Modes and Recovery",
      level: "L4",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] Failure handling behaviour described here is based on the intended design. Verify against current frontend/src/app/position-desk/page.tsx and backend error handling.",
          },
        },
        {
          type: "table",
          table: {
            headers: ["Failure Scenario", "Observed Behaviour", "Recovery Action"],
            rows: [
              ["Backend API offline", "Position grid shows last fetched data. Retry button appears. No mutations allowed.", "Wait for backend to recover; click Retry to re-fetch."],
              ["Policy assignment fails", "Position remains in NEW status. An error toast shows the server error message.", "Check that the selected policy template is active. Retry the assignment."],
              ["Calculation run returns error", "Position remains in POLICY_ASSIGNED. The failed run appears in Recent Runs with status ERROR.", "Review the error detail in the run record. Correct policy parameters or market inputs, then re-run from Sandbox."],
              ["Network timeout during status change", "The status transition may not have been committed. Refresh the page to verify current status.", "Refresh and check position status before retrying the action to avoid duplicate transitions."],
              ["Permission denied on action", "A 403 error is shown. The action is not performed. The attempt is audited.", "Contact your administrator to verify role assignments."],
            ],
          },
        },
      ],
    },

    // ─── L5: IFRS 9 Designation ───────────────────────────────────────────────
    {
      id: "position-desk-ifrs9",
      heading: "IFRS 9 Designation",
      level: "L5",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/mathEngine.ts" },
        { file: "backend/app/models/position.py" },
      ],
      blocks: [
        {
          type: "text",
          body: "Under IFRS 9, hedge accounting requires formal designation of the hedging relationship at inception, including the hedged item, the hedging instrument, the risk being hedged, and the effectiveness testing method. The position's settlement_date drives the tenor bucket used in IFRS 9 maturity analysis.",
        },
        {
          type: "table",
          table: {
            headers: ["IFRS 9 Requirement", "ORDR Terminal Implementation"],
            rows: [
              ["Designation documentation", "Policy instance creation timestamp serves as the designation date. Policy revision WORM table is the designation record."],
              ["Hedged item identification", "Position record (entity_name, currency_pair, notional_amount, settlement_date)"],
              ["Hedging instrument identification", "Execution proposal instrument_type, strike_rate, and maturity_date"],
              ["Risk designated", "R1 (delta) is the primary designated risk for FX forward/NDF hedges"],
              ["Effectiveness testing method", "Quantitative: 80%–125% dollar-offset ratio from mathEngine.ts"],
              ["Tenor bucket classification", "settlement_date determines short (<3m), medium (3-12m), or long (>12m) tenor"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "IFRS 9 §6.4.1 requires prospective effectiveness testing at inception and ongoing retrospective testing. The 80%–125% bright-line is tested at each reporting date. ORDR Terminal computes this ratio in mathEngine.ts; if the ratio falls outside this range, the hedging relationship must be dedesignated.",
          },
        },
        {
          type: "text",
          body: "Quarterly effectiveness testing should be conducted by running the effectiveness calculation for each open hedging relationship and reviewing the output against the 80%–125% band. Results should be exported and retained in the treasury committee pack. ORDR Terminal provides the calculation infrastructure; the formal designation documentation responsibility remains with the treasury function.",
        },
      ],
    },
  ],
};
