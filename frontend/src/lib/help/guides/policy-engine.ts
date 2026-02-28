import type { GuideDoc } from "@/lib/help/guides/types";

export const POLICY_ENGINE_GUIDE: GuideDoc = {
  id: "policy-engine",
  title: "Policy Engine",
  summary:
    "Policy templates, instances, and the effectiveness scoring system: how to create, activate, and monitor hedge policies, including IFRS 9 effectiveness testing and audit controls.",
  path: "/policy",
  icon: "ShieldCheck",
  lastReviewed: "2026-02-28",
  relatedIds: ["position-desk", "sandbox-simulation", "execution-pipeline", "getting-started"],
  sections: [
    // ─── L1: Policy Engine Overview ───────────────────────────────────────────
    {
      id: "policy-engine-overview",
      heading: "Policy Engine Overview",
      level: "L1",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "The Policy Engine manages hedge policies using a two-tier structure. Policy templates are reusable parameter sets defined by the risk team. Policy instances are point-in-time bindings of a template to a specific company or branch context, with a designated activation date and version record.",
        },
        {
          type: "table",
          table: {
            headers: ["Tier", "What It Is", "Who Creates It"],
            rows: [
              ["Policy Template", "Reusable parameter set: coverage ratio, cost limits, instrument type, tenor, etc.", "risk_analyst or supervisor with policy.create_preset"],
              ["Policy Instance", "An activated binding of a template to a company/branch context with effective dates.", "supervisor or head_of_risk with policy.activate"],
              ["Policy Revision", "An immutable snapshot of a policy instance at a point in time. Append-only (WORM).", "Created automatically on every parameter change or activation event"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "Policy templates can be shared across branches. Policy instances are always scoped to a single company/branch and represent the formal designation record for IFRS 9 purposes.",
          },
        },
        {
          type: "text",
          body: "The policy library is the single source of truth for the treasury committee. Every policy version is tamper-evident through the WORM revision table. The effectiveness score (0-100) provides a structured assessment of policy quality across five weighted dimensions.",
        },
      ],
    },

    // ─── L2: Policy Lifecycle ─────────────────────────────────────────────────
    {
      id: "policy-engine-lifecycle",
      heading: "Policy Lifecycle",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Create template",
              detail: "Navigate to /policy → Templates → New Template. Fill in all required parameters. The template is saved in DRAFT status. Requires policy.create_preset or policy.edit permission.",
            },
            {
              n: 2,
              label: "Supervisor approval",
              detail: "A supervisor or head_of_risk reviews the template and approves it (transitions from DRAFT to APPROVED). This requires the reviewer to be a different user than the creator (four-eyes pattern).",
            },
            {
              n: 3,
              label: "Activate as instance",
              detail: "An approved template can be activated for a specific company/branch context. Activation creates a policy_instance record and writes the first policy_revision entry. Requires policy.activate.",
            },
            {
              n: 4,
              label: "Assign to positions",
              detail: "Active policy instances appear in the policy selector on the Position Desk. Assigning a policy to a position creates a link between the position and the policy_instance_id.",
            },
            {
              n: 5,
              label: "Monitor effectiveness",
              detail: "The effectiveness score is computed for each active policy. Review the score breakdown in the policy detail panel. Run sandbox simulations to test policy performance under different market scenarios.",
            },
            {
              n: 6,
              label: "Archive",
              detail: "Policies that are no longer in use are archived (not deleted). Archived policies remain in the version history and can be referenced by existing positions and ledger entries.",
            },
          ],
        },
      ],
    },

    // ─── L2: Policy Variables ─────────────────────────────────────────────────
    {
      id: "policy-engine-variables",
      heading: "Policy Variables",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] Field names and constraints below represent the intended policy schema. Verify against backend/app/models/policy_template.py and frontend policy form components.",
          },
        },
        {
          type: "field-dict",
          fields: [
            {
              name: "coverage_ratio",
              type: "decimal",
              constraints: "0.0 – 1.0 (expressed as a fraction; 0.80 = 80%)",
              meaning: "The proportion of the notional exposure to be hedged. Drives the Coverage component of the effectiveness score.",
              example: "0.80",
            },
            {
              name: "min_effectiveness",
              type: "decimal",
              constraints: "0.0 – 1.0",
              meaning: "Minimum hedge effectiveness ratio required for the policy to pass. Used as the decision gate threshold.",
              example: "0.80",
            },
            {
              name: "max_cost_bps",
              type: "integer",
              constraints: "> 0; system hard limit is 75 bps at the decision gate",
              meaning: "Maximum allowable hedge cost expressed in basis points of notional. Drives the Efficiency component of the score.",
              example: "50",
            },
            {
              name: "instrument_type",
              type: "enum",
              constraints: "NDF | Forward | Futures",
              meaning: "The permitted hedge instrument class for this policy. Drives strategy and instrument selection in the engine.",
              example: "NDF",
            },
            {
              name: "tenor_months",
              type: "integer",
              constraints: "> 0",
              meaning: "Target hedge tenor in months. Must align with the settlement_date tenor of the positions assigned to this policy.",
              example: "6",
            },
            {
              name: "auto_renew_flag",
              type: "boolean",
              constraints: "true | false",
              meaning: "If true, the policy instance is flagged for review and renewal before its expiry date. Does not auto-extend without human approval.",
              example: "true",
            },
          ],
        },
      ],
    },

    // ─── L3: Policy Effectiveness Score ───────────────────────────────────────
    {
      id: "policy-engine-effectiveness-score",
      heading: "Policy Effectiveness Score",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "frontend/src/utils/policyEffectivenessScore.ts" },
      ],
      blocks: [
        {
          type: "text",
          body: "The Policy Effectiveness Score is a composite 0–100 score that quantifies how well a policy configuration is expected to perform. It is computed from five weighted components.",
        },
        {
          type: "formula",
          formula: {
            label: "Policy Effectiveness Score",
            expression: "Score = (Coverage × 30) + (Efficiency × 25) + (IFRS9 × 20) + (ProductFit × 15) + (SizeAccess × 10)",
            explanation:
              "Each component is normalised to 0–1 before weighting. Coverage = hedge_ratio compliance; Efficiency = cost relative to max_cost_bps; IFRS9 = effectiveness ratio within 80-125% band; ProductFit = instrument suitability for the exposure type; SizeAccess = position notional relative to instrument minimum lot size.",
            source: "policyEffectivenessScore.ts",
            codeRef: { file: "frontend/src/utils/policyEffectivenessScore.ts" },
          },
        },
        {
          type: "table",
          table: {
            headers: ["Score Range", "Grade", "Interpretation"],
            rows: [
              ["≥ 85", "INSTITUTIONAL", "Policy meets institutional-grade governance standards"],
              ["70 – 84", "STRONG", "Policy is sound with minor areas for improvement"],
              ["50 – 69", "MODERATE", "Policy is functional but has material gaps to address"],
              ["< 50", "BASIC", "Policy requires significant improvement before use in production hedging"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "The effectiveness score is advisory. It does not block policy activation. However, policies scoring BASIC are flagged with a warning in the policy library and in sandbox results.",
          },
        },
      ],
    },

    // ─── L3: IFRS 9 Bright-Line Test ──────────────────────────────────────────
    {
      id: "policy-engine-ifrs9-test",
      heading: "IFRS 9 Bright-Line Effectiveness Test",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/mathEngine.ts" },
      ],
      blocks: [
        {
          type: "text",
          body: "IFRS 9 requires that hedge effectiveness be measured prospectively and retrospectively. ORDR Terminal implements the dollar-offset quantitative test using the 80%–125% bright-line prescribed by the standard.",
        },
        {
          type: "formula",
          formula: {
            label: "IFRS 9 Effectiveness Ratio (Dollar Offset)",
            expression: "η = ΔFV_hedge / ΔFV_hedged_item",
            explanation:
              "η is the hedge effectiveness ratio. ΔFV_hedge = change in fair value of the hedging instrument; ΔFV_hedged_item = change in fair value of the hedged item attributable to the designated risk. The relationship is effective if 0.80 ≤ |η| ≤ 1.25.",
            source: "mathEngine.ts",
            codeRef: { file: "frontend/src/lib/mathEngine.ts" },
          },
        },
        {
          type: "table",
          table: {
            headers: ["Ratio Range", "Result", "Consequence"],
            rows: [
              ["0.80 ≤ |η| ≤ 1.25", "PASS — Effective", "Hedge accounting continues; fair value changes recorded in OCI"],
              ["|η| < 0.80", "FAIL — Under-hedging", "Hedging relationship must be dedesignated; ineffectiveness recognised in P&L"],
              ["|η| > 1.25", "FAIL — Over-hedging", "Hedging relationship must be dedesignated; ineffectiveness recognised in P&L"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "IFRS 9 §6.4.1(c) requires the effectiveness test to be performed at a minimum at each reporting date. Dedesignation is not optional once the bright-line is breached. Ensure this test is run quarterly at minimum and the results are retained in the treasury committee pack.",
          },
        },
      ],
    },

    // ─── L4: Policy Revision Audit Trail ──────────────────────────────────────
    {
      id: "policy-engine-revision-audit",
      heading: "Policy Revision Audit Trail",
      level: "L4",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] The policy_revisions table structure described here is based on the intended design. Verify against backend/app/models/policy_revision.py for the exact schema.",
          },
        },
        {
          type: "text",
          body: "Every change to a policy instance — parameter edits, activation, archival, re-activation — creates a new record in the policy_revisions table. This table is append-only (WORM): records are never updated or deleted. Each revision is linked to the previous revision by a SHA-256 hash chain.",
        },
        {
          type: "table",
          table: {
            headers: ["Revision Field", "Description"],
            rows: [
              ["revision_id", "UUID of this revision record"],
              ["policy_instance_id", "FK to the policy instance being versioned"],
              ["revision_number", "Monotonically increasing integer within the policy instance"],
              ["parameters_snapshot", "Full canonical JSON snapshot of all policy parameters at this revision"],
              ["changed_by", "UUID of the user who made the change"],
              ["effective_from", "Timestamp from which this revision applies"],
              ["revision_hash", "SHA-256 of (canonical_json(this_revision) + previous_revision_hash)"],
              ["change_reason", "Free-text explanation of why the revision was made (required)"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "The policy revision chain is tamper-evident. Any modification of a historical revision record will invalidate all subsequent revision hashes. For IFRS 9 audit purposes, the revision record at the time of designation is the authoritative documentation of the hedge designation.",
          },
        },
      ],
    },

    // ─── L4: Approval Controls ────────────────────────────────────────────────
    {
      id: "policy-engine-approval-controls",
      heading: "Approval Controls",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/execution_proposal.py" },
      ],
      blocks: [
        {
          type: "text",
          body: "Policy activation and major parameter changes require four-eyes approval: the user who creates or modifies the policy cannot be the same user who approves it. This segregation of duties is enforced at the application level, mirroring the same DB-level constraint applied to execution proposals.",
        },
        {
          type: "table",
          table: {
            headers: ["Action", "Maker Permission", "Checker Permission", "SoD Rule"],
            rows: [
              ["Activate policy instance", "policy.activate (initiator)", "policy.activate (approver)", "approved_by ≠ proposed_by"],
              ["Major parameter change", "policy.edit (initiator)", "supervisor or head_of_risk (approver)", "Same user cannot approve own changes"],
              ["Archive policy", "policy.activate", "head_of_risk or above", "Requires separate approver"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "An attempt to approve a policy action as the same user who initiated it will be rejected with a SoD violation error. The attempt is recorded in the audit trail as a SOD_VIOLATION_ATTEMPT event. There is no admin bypass for this control.",
          },
        },
      ],
    },

    // ─── L5: Committee Pack Context ───────────────────────────────────────────
    {
      id: "policy-engine-committee",
      heading: "Committee Pack Context",
      level: "L5",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "The policy library serves as the single source of truth for the treasury committee's hedge governance documentation. The combination of WORM policy revisions, four-eyes approval, and effectiveness scoring provides the evidence base for board-level risk committee reporting.",
        },
        {
          type: "table",
          table: {
            headers: ["Regulatory Framework", "Relevant Policy Engine Feature"],
            rows: [
              ["IFRS 9 — Hedge Designation", "Policy instance creation date = designation date; parameter snapshot = formal designation record"],
              ["IFRS 9 — Effectiveness Testing", "Quarterly effectiveness score with 80%–125% IFRS 9 component; full calculation in mathEngine.ts"],
              ["EMIR — Trade Documentation", "Policy revision WORM chain provides audit-ready documentation of hedge rationale"],
              ["Basel III — Operational Risk", "Four-eyes approval and SoD controls reduce key-person and unauthorised-trade operational risk"],
              ["SOX — Internal Controls", "Approval workflow with distinct maker/checker, complete audit log, and no bypass path"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "The policy library export (PDF or Excel) is designed for inclusion in treasury committee packs. It includes the current active policy parameters, effectiveness score breakdown, version history summary, and the hash root of the revision chain. Retain these exports as the formal hedge accounting documentation.",
          },
        },
        {
          type: "text",
          body: "For new policy validation before production use: run the proposed template through the sandbox with representative position data and review the decision gate output. A sandbox run does not modify any production records and can be demonstrated to the committee as a validation step.",
        },
      ],
    },
  ],
};
