import type { ModuleHelp } from "@/lib/help/types";

export const POSITIONS_HELP: ModuleHelp = {
  moduleId: "positions",
  pageTitle: "Position Desk",
  pageSubtitle: "FX EXPOSURE MANAGEMENT · LIFECYCLE TRACKING",
  sections: [
    {
      id: "positions-overview",
      anchor: "positions-overview",
      title: "Position Desk Overview",
      icon: "TrendingUp",
      level: 1,
      type: "text",
      verified: false,
      callout: {
        type: "info",
        text: "All positions represent real corporate FX obligations. Ensure notional amounts and settlement dates are confirmed against the underlying commercial contract before submission.",
      },
      content:
        "The Position Desk is the entry point for FX exposure management within ORDR Terminal. A position represents a discrete corporate FX obligation — a payable or receivable denominated in a foreign currency that creates a financial risk to the entity's reporting currency (USD by default).\n\nTreasury teams log positions as they arise from commercial activity: import/export invoices, intercompany loans, dividend repatriations, and capital expenditure commitments in foreign currencies. Each position records the key economic attributes required for hedge sizing: notional amount, currency pair, settlement date, and exposure direction.\n\nOnce logged, a position moves through a defined lifecycle — from initial capture (NEW) through policy assignment, readiness for execution, and final settlement as HEDGED or REJECTED. At each lifecycle transition, the system enforces permission checks and records an immutable audit event.\n\nThe Position Desk aggregates all open positions into an exposure dashboard, enabling risk officers to view net USD-equivalent exposure by currency, tenor bucket, and counterparty. This aggregate view feeds directly into the USD Exposure Radar widget on the main dashboard.",
    },
    {
      id: "positions-lifecycle",
      anchor: "positions-lifecycle",
      title: "Position Status Lifecycle",
      icon: "GitBranch",
      level: 1,
      type: "pipeline",
      verified: true,
      codeRefs: [{ file: "backend/app/models/position.py" }],
      pipelinePos: {
        position: 2,
        total: 7,
        label: "Position Lifecycle",
        prev: { label: "Dashboard", href: "/help/dashboard" },
        next: { label: "Policies", href: "/help/policies" },
        description:
          "A position begins as NEW when first submitted by an analyst. The risk engine assigns an R1-R8 risk classification and policy template, advancing the position to POLICY_ASSIGNED. Once the policy instance is activated and all pre-trade checks pass, the position reaches READY_TO_EXECUTE — the only state from which an execution proposal can be generated. Terminal states are HEDGED (execution confirmed and ledger entry written) and REJECTED (position declined at any lifecycle gate). REJECTED positions are immutable and serve as the audit record of declined exposures.",
      },
      content:
        "**NEW** — Position has been submitted but not yet reviewed. Edits are permitted by the submitting analyst and their supervisor.\n\n**POLICY_ASSIGNED** — A hedge policy template has been matched to the position by the risk engine or manually by a head-of-risk. The policy defines the permitted instruments, coverage ratio, and cost envelope.\n\n**READY_TO_EXECUTE** — All pre-trade conditions are satisfied: policy is active, notional is within policy limits, settlement date is within tenor scope, and IFRS 9 hedged item designation is confirmed. The position is queued for execution proposal generation.\n\n**HEDGED** — An execution proposal has been approved (4-eyes SoD passed), the instrument trade has been confirmed, and a ledger entry has been written. The position is closed.\n\n**REJECTED** — The position was declined at any lifecycle gate (policy mismatch, decision gate REJECT, 4-eyes approval declined). The rejection reason and rejecting officer are recorded in the audit trail.",
    },
    {
      id: "positions-create-workflow",
      anchor: "positions-create-workflow",
      title: "Creating a Position",
      icon: "PlusCircle",
      level: 2,
      type: "workflow",
      verified: false,
      callout: {
        type: "caution",
        text: "Settlement dates must be a business day in the relevant currency pair's settlement convention (typically T+2 for spot). Entering a non-business-day settlement date will trigger a validation warning.",
      },
      steps: [
        {
          step: 1,
          label: "Enter Position Attributes",
          description:
            "In the New Position form, enter the notional amount (USD-equivalent or native currency), the currency pair (e.g. EUR/USD), the settlement date, and the exposure type (PAYABLE or RECEIVABLE). All four fields are required for submission.",
        },
        {
          step: 2,
          label: "Upload or Paste Supporting Document",
          description:
            "Attach the underlying commercial document (invoice, loan agreement, board resolution) that gives rise to the FX exposure. Accepted formats: PDF, XLSX, CSV. Alternatively, paste a reference number if the document is held in an external DMS.",
        },
        {
          step: 3,
          label: "Validate",
          description:
            "Click Validate to run client-side and server-side checks: notional must be positive and within the user's delegation limit, currency pair must be in the approved list, settlement date must be in the future, and exposure type must be specified. Validation errors are shown inline.",
        },
        {
          step: 4,
          label: "Submit",
          description:
            "Click Submit to persist the position with status NEW. A position_id (UUID) is assigned, an audit event is written, and the position appears in the Position Desk queue for review by the supervisor or head-of-risk.",
        },
      ],
    },
    {
      id: "positions-variables",
      anchor: "positions-variables",
      title: "Position Variables",
      icon: "Table",
      level: 2,
      type: "variables",
      verified: true,
      codeRefs: [{ file: "backend/app/models/position.py" }],
      variables: [
        {
          name: "notional_amount",
          type: "Numeric(18,4)",
          description:
            "The face value of the FX exposure in the transaction currency. Stored with four decimal places. Used as the primary input to the hedge sizer. Must be greater than zero.",
          example: "1500000.0000",
          source: "backend/app/models/position.py",
        },
        {
          name: "currency_pair",
          type: "String(7)",
          description:
            "The ISO 4217 currency pair representing the exposure, formatted as BASE/QUOTE (e.g. EUR/USD). Must be in the platform's approved currency list. The base currency is the transaction currency; USD is typically the quote (reporting) currency.",
          example: "EUR/USD",
          source: "backend/app/models/position.py",
        },
        {
          name: "settlement_date",
          type: "Date",
          description:
            "The contractual date on which the FX payment or receipt will settle. Drives tenor bucket classification (spot, 1M, 3M, 6M, 1Y, >1Y) and IFRS 9 hedge horizon. Must be a future date at submission.",
          example: "2026-06-30",
          source: "backend/app/models/position.py",
        },
        {
          name: "exposure_type",
          type: "Enum(PAYABLE, RECEIVABLE)",
          description:
            "Direction of the FX obligation. PAYABLE = entity owes foreign currency (long FX risk). RECEIVABLE = entity will receive foreign currency (short FX risk). Determines hedge direction: PAYABLEs are hedged with buy forwards/calls; RECEIVABLEs with sell forwards/puts.",
          example: "PAYABLE",
          source: "backend/app/models/position.py",
        },
        {
          name: "status",
          type: "Enum",
          description:
            "Current lifecycle state: NEW | POLICY_ASSIGNED | READY_TO_EXECUTE | HEDGED | REJECTED. Immutable once set to HEDGED or REJECTED. All status transitions are recorded in audit_events.",
          example: "READY_TO_EXECUTE",
          source: "backend/app/models/position.py",
        },
        {
          name: "hedge_ratio",
          type: "Numeric(5,4)",
          description:
            "The proportion of the notional exposure to be hedged, expressed as a decimal (0.0000–1.1000). Set by the assigned policy instance. A ratio of 1.0000 represents 100% coverage. Ratios above 1.0 (over-hedging) are flagged by the decision gate.",
          example: "0.9000",
          source: "backend/app/models/position.py",
        },
      ],
    },
    {
      id: "positions-risk-classification",
      anchor: "positions-risk-classification",
      title: "R1-R8 Risk Classification",
      icon: "ShieldAlert",
      level: 3,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/engine/risk_classifier.py" }],
      callout: {
        type: "regulatory",
        text: "The R1-R8 taxonomy is architecture-frozen. No modifications are permitted in v1. Extensions require a governance change request and a policy revision.",
      },
      content:
        "The risk classifier assigns each position a vector of R1-R8 risk components, quantifying distinct dimensions of FX risk. This taxonomy is a core immutable element of the ORDR v1 architecture.\n\n**R1 — Delta (Primary FX Spot Risk)**\nThe first-order sensitivity of position value to a unit change in the spot FX rate. All FX positions carry R1 risk. Delta is expressed as a USD equivalent: a 1% move in EUR/USD on a €1M PAYABLE position produces approximately $10,000 of R1 P&L impact. R1 is always populated; it is the primary sizing input to the hedge sizer.\n\n**R2 — Vega (Volatility Risk)**\nSensitivity to changes in implied volatility. Relevant for positions hedged with options instruments (vanilla calls/puts, collars). A position hedged with a forward carries zero vega. R2 is populated when the strategy selector assigns an options-based instrument.\n\n**R3 — Gamma (Convexity)**\nThe rate of change of delta with respect to the spot rate — second-order risk. Material for large notional positions or deep in/out-of-the-money options. The engine uses gamma to flag positions where linear hedges (forwards) may leave significant residual risk under stress scenarios.\n\n**R4 — Residual**\nCaptures all remaining risk not classified under R1-R3: settlement risk, basis risk between hedge instrument and underlying, and rollover risk for positions with tenors exceeding available hedge tenors.\n\n**R5-R8 — Reserved**\nReserved for future taxonomy extensions (e.g. rho / interest rate sensitivity, correlation risk, liquidity risk). These components are always zero in v1 and must not be repurposed without a formal taxonomy governance review.",
    },
    {
      id: "positions-risk-normalization-formula",
      anchor: "positions-risk-normalization-formula",
      title: "Risk Normalization Formula",
      icon: "Calculator",
      level: 3,
      type: "formula",
      verified: true,
      codeRefs: [{ file: "backend/app/engine/risk_classifier.py" }],
      formulas: [
        {
          label: "Normalized R1 (Delta) Component",
          latex:
            "\\hat{R}_1 = \\frac{\\Delta_{USD}}{\\sqrt{\\sum_{i=1}^{8} R_i^2}}",
          explanation:
            "The raw delta USD value (R1) is normalized by the Euclidean norm of the full R1-R8 risk vector. This produces a unit-less score in [0, 1] representing the proportion of total risk attributable to primary spot exposure. A position with pure spot risk and no options exposure will have a normalized R1 of 1.0. Normalization enables cross-currency, cross-instrument position comparison on a common scale.",
          source: "backend/app/engine/risk_classifier.py",
          codeRef: { file: "backend/app/engine/risk_classifier.py" },
        },
        {
          label: "Total Risk Magnitude",
          latex:
            "\\|\\mathbf{R}\\| = \\sqrt{R_1^2 + R_2^2 + R_3^2 + R_4^2}",
          explanation:
            "The Euclidean norm of the active risk components (R1-R4; R5-R8 are zero in v1). Used as the denominator in normalization and as a scalar risk magnitude for portfolio aggregation and limit monitoring. Expressed in USD.",
          source: "backend/app/engine/risk_classifier.py",
          codeRef: { file: "backend/app/engine/risk_classifier.py" },
        },
      ],
    },
    {
      id: "positions-controls-permissions",
      anchor: "positions-controls-permissions",
      title: "Position Controls & Permissions",
      icon: "Lock",
      level: 4,
      type: "text",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/permission.py" },
        { file: "backend/app/api/routes/positions.py" },
      ],
      content:
        "Position access is controlled by the RBAC permission system (9 roles, 41 permissions, hierarchy_level 0-15). The following permission checks are enforced at the API route level before any database mutation.\n\n**View Positions** — Requires `trades.view` permission. Granted to: all analyst roles (junior, risk, senior), supervisor, branch_manager, cfo, head_of_risk, ceo, admin. Auditors receive read-only access via `audit.view`.\n\n**Create Position** — Requires `trades.create`. Granted to: risk_analyst, senior_analyst, supervisor, head_of_risk, admin. Junior analysts cannot create positions without supervisor approval.\n\n**Edit Position** — Requires `trades.edit`. Permitted only when position status is NEW or POLICY_ASSIGNED. Positions in READY_TO_EXECUTE, HEDGED, or REJECTED state are immutable.\n\n**Approve Lifecycle Transition** — Moving a position from POLICY_ASSIGNED to READY_TO_EXECUTE requires `trades.approve`. Granted to: supervisor, head_of_risk, cfo, admin. The approver must have a hierarchy_level strictly greater than the submitting analyst.\n\n**Reject Position** — Requires `trades.reject`. Any rejection generates an immutable audit_event with the rejection reason, rejecting officer UUID, and timestamp.\n\n**Delete Position** — Hard delete is not permitted for any role in production. Positions must be moved to REJECTED status. This preserves the audit trail for regulatory purposes.\n\n**Branch Scoping** — Branch managers and below see only positions belonging to their branch. Head-of-risk and above have company-wide visibility. This scoping is enforced at the query level via the company_id / branch_id join, not at the application layer.",
    },
    {
      id: "positions-ifrs9-designation",
      anchor: "positions-ifrs9-designation",
      title: "IFRS 9 Hedged Item Designation",
      icon: "Scale",
      level: 5,
      type: "text",
      verified: false,
      callout: {
        type: "regulatory",
        text: "IFRS 9 hedge accounting qualification requires formal documentation at hedge inception. The data captured in ORDR Terminal supports but does not replace the formal hedge designation memorandum prepared by the treasury accounting team.",
      },
      content:
        "**Hedged Item Requirements**\n\nUnder IFRS 9, a hedged item must be reliably measurable and must create an exposure to changes in fair value or cash flows attributable to a designated risk. Corporate FX payables and receivables are eligible hedged items when the cash flow variability arises from spot FX rate movements (R1 risk).\n\nORDR Terminal captures the attributes required for IFRS 9 hedged item designation: the notional amount, the designated risk (R1 delta by default), the currency pair, and the expected cash flow date (settlement_date). These attributes are recorded at position creation and are immutable once the position reaches READY_TO_EXECUTE.\n\n**Tenor Bucket Classification**\n\nSettlement dates are classified into IFRS 9 standard tenor buckets at position creation:\n- Spot: 0-2 business days\n- Short: 3-30 days\n- 1 Month: 31-60 days\n- 3 Month: 61-90 days\n- 6 Month: 91-180 days\n- 1 Year: 181-365 days\n- Long-dated: >365 days\n\nThe tenor bucket drives strategy selector logic: long-dated positions may require cross-currency swaps rather than vanilla forwards.\n\n**Effectiveness Testing Cadence**\n\nIFRS 9 requires prospective and retrospective effectiveness testing at hedge inception and at each reporting date (typically quarterly). The ORDR engine computes effectiveness as the ratio of hedge instrument fair value change to hedged item fair value change. The 80%–125% bright-line corridor must be maintained for hedge accounting to continue. Positions that fall outside this corridor trigger an alert in the HedgeHealth widget and require reassessment by the head-of-risk.",
    },
  ],
};
