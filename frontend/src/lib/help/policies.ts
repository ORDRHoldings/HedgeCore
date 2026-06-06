import type { ModuleHelp } from "@/lib/help/types";

export const POLICIES_HELP: ModuleHelp = {
  moduleId: "policies",
  pageTitle: "Policy Library",
  pageSubtitle: "HEDGE POLICY GOVERNANCE · IFRS 9 COMPLIANT",
  sections: [
    {
      id: "policies-overview",
      anchor: "policies-overview",
      title: "What is a Hedge Policy?",
      icon: "BookOpen",
      level: 1,
      type: "text",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/policy_template.py" },
        { file: "backend/app/api/routes/policies.py" },
      ],
      content:
        "A hedge policy is the formal governance document that defines how a specific category of FX exposure will be managed. In ORDR Treasury, policies exist at two levels: **template** and **instance**.\n\nA **policy template** is the pre-approved master document authored by the head-of-risk or CFO. It specifies the permitted hedging instruments, target coverage ratio, acceptable cost envelope (in basis points), minimum hedge effectiveness threshold, and tenor scope. Templates are versioned and subject to committee approval before activation.\n\nA **policy instance** is the binding assignment of an active template to a specific position. When the engine or a risk officer assigns a template to a position, an instance is created that captures the exact policy parameters at the moment of assignment. The position's hedge ratio, permitted instruments, and cost limits are governed by the instance for its entire lifecycle.\n\nThis two-level architecture ensures that changes to a policy template (e.g. updating the maximum cost cap) do not retroactively alter positions already under a prior instance. Each instance references the specific policy_revision that was active at assignment time, providing a point-in-time audit trail that satisfies regulatory requirements for hedge documentation.\n\nThe Policy Library screen displays all templates (draft, active, archived) and their associated instances. Filtering is available by instrument type, coverage range, tenor, and effectiveness grade.",
    },
    {
      id: "policies-lifecycle-workflow",
      anchor: "policies-lifecycle-workflow",
      title: "Policy Lifecycle",
      icon: "GitMerge",
      level: 2,
      type: "workflow",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/policy_template.py" },
        { file: "backend/app/api/routes/policies.py" },
      ],
      steps: [
        {
          step: 1,
          label: "Create Template",
          description:
            "A senior analyst or head-of-risk drafts a new policy template, specifying instrument types, coverage ratio, cost limits (max_cost_bps, max_cost_usd), minimum effectiveness threshold, tenor scope (min/max months), and auto-renewal flag. Template is saved in DRAFT status.",
        },
        {
          step: 2,
          label: "Internal Review",
          description:
            "The drafting officer submits the template for review. A supervisor or head-of-risk reviews the parameters against the treasury committee mandate, risk appetite statement, and applicable accounting standards (IFRS 9). Comments are recorded in the audit trail.",
        },
        {
          step: 3,
          label: "Activate",
          description:
            "Upon approval, a head-of-risk or CFO activates the template. Activation creates the first policy_revision record (WORM, SHA-256 chained) and sets the template status to ACTIVE. Only ACTIVE templates can be assigned to positions.",
        },
        {
          step: 4,
          label: "Assign to Positions",
          description:
            "The hedge engine's strategy selector automatically matches ACTIVE templates to NEW positions based on currency pair, tenor, and exposure type. Manual override assignment is available to head-of-risk and above. Assignment creates a policy_instance record.",
        },
        {
          step: 5,
          label: "Monitor Effectiveness",
          description:
            "Once instances are live, the Policy Library displays the rolling effectiveness score for each instance. Quarterly IFRS 9 effectiveness tests are triggered automatically based on the reporting calendar. Scores falling below the minimum threshold generate alerts.",
        },
        {
          step: 6,
          label: "Revise or Archive",
          description:
            "When market conditions or regulatory requirements change, an authorised officer creates a new policy revision (incrementing the revision number and extending the hash chain). Active instances are not retroactively altered. Superseded templates are ARCHIVED, not deleted.",
        },
      ],
    },
    {
      id: "policies-variables",
      anchor: "policies-variables",
      title: "Policy Variables",
      icon: "Sliders",
      level: 2,
      type: "variables",
      verified: true,
      codeRefs: [{ file: "backend/app/models/policy_template.py" }],
      variables: [
        {
          name: "coverage_ratio",
          type: "Numeric(5,4)",
          description:
            "Target proportion of the position notional to be hedged, expressed as a decimal. A ratio of 0.90 instructs the hedge sizer to cover 90% of notional exposure. Typical institutional range: 0.75–1.00. Ratios above 1.00 constitute over-hedging and are flagged by the decision gate.",
          example: "0.9000",
          source: "backend/app/models/policy_template.py",
        },
        {
          name: "min_effectiveness",
          type: "Numeric(5,4)",
          description:
            "The minimum hedge effectiveness ratio the instrument must demonstrate at inception and quarterly. Maps to the IFRS 9 bright-line lower bound. The platform default is 0.25 (25%); the engine hard-rejects proposals below this threshold. Most institutional policies set this at 0.80 to align with the IFRS 9 corridor.",
          example: "0.2500",
          source: "backend/app/engine/decision_gate.py",
        },
        {
          name: "max_cost_bps",
          type: "Numeric(8,2)",
          description:
            "Maximum permissible all-in hedge cost expressed in basis points of notional. Includes instrument premium, bid-ask spread, and broker fees. The engine hard-rejects proposals where total_cost_bps exceeds this threshold. Platform ceiling: 75 bps.",
          example: "75.00",
          source: "backend/app/engine/decision_gate.py",
        },
        {
          name: "instrument_type",
          type: "Enum",
          description:
            "The permitted hedging instrument for this policy: VANILLA_FORWARD, VANILLA_CALL, VANILLA_PUT, COLLAR, PARTICIPATING_FORWARD, CROSS_CURRENCY_SWAP. Multiple instruments can be permitted per template; the strategy selector chooses the optimal instrument within the permitted set.",
          example: "VANILLA_FORWARD",
          source: "backend/app/models/policy_template.py",
        },
        {
          name: "tenor_months",
          type: "Integer",
          description:
            "The maximum hedge horizon in months. Positions with settlement dates beyond this horizon cannot be assigned this template. Typical values: 3, 6, 12, 24. Long-dated policies (>12 months) typically require cross-currency swaps.",
          example: "12",
          source: "backend/app/models/policy_template.py",
        },
        {
          name: "auto_renew_flag",
          type: "Boolean",
          description:
            "When true, the system automatically generates a renewal proposal 30 days before the hedge maturity date, using the same policy instance parameters. The renewal proposal still requires 4-eyes approval. When false, the position returns to READY_TO_EXECUTE on hedge maturity.",
          example: "true",
          source: "backend/app/models/policy_template.py",
        },
      ],
    },
    {
      id: "policies-effectiveness-formula",
      anchor: "policies-effectiveness-formula",
      title: "Policy Effectiveness Score Formula",
      icon: "BarChart3",
      level: 3,
      type: "formula",
      verified: true,
      codeRefs: [{ file: "frontend/src/utils/policyEffectivenessScore.ts" }],
      formulas: [
        {
          label: "Composite Effectiveness Score",
          latex:
            "\\text{Score} = 0.30 \\cdot C + 0.25 \\cdot E + 0.20 \\cdot I + 0.15 \\cdot P + 0.10 \\cdot S",
          explanation:
            "A weighted sum of five sub-scores, each normalised to [0, 100]. C = Coverage Score (how closely the hedge ratio matches the policy target). E = Efficiency Score (cost per unit of risk transferred, lower cost = higher score). I = IFRS 9 Score (closeness of effectiveness ratio to the 100% centre of the 80%–125% corridor). P = ProductFit Score (suitability of the selected instrument for the exposure profile). S = SizeAccess Score (whether the notional falls within the instrument's market liquidity band).",
          source: "frontend/src/utils/policyEffectivenessScore.ts",
          codeRef: { file: "frontend/src/utils/policyEffectivenessScore.ts" },
        },
        {
          label: "Effectiveness Grade Thresholds",
          latex:
            "\\text{Grade} = \\begin{cases} \\text{INSTITUTIONAL} & \\text{Score} \\geq 85 \\\\ \\text{STRONG} & 70 \\leq \\text{Score} < 85 \\\\ \\text{MODERATE} & 50 \\leq \\text{Score} < 70 \\\\ \\text{BASIC} & \\text{Score} < 50 \\end{cases}",
          explanation:
            "INSTITUTIONAL grade (≥85) indicates the policy is fully optimised across all five dimensions and is suitable for presentation to a treasury committee or external auditor without qualification. STRONG (70-84) is operationally sound with minor optimisation opportunities. MODERATE (50-69) requires review before the next reporting date. BASIC (<50) should trigger immediate policy revision.",
          source: "frontend/src/utils/policyEffectivenessScore.ts",
          codeRef: { file: "frontend/src/utils/policyEffectivenessScore.ts" },
        },
      ],
    },
    {
      id: "policies-ifrs9-bright-line",
      anchor: "policies-ifrs9-bright-line",
      title: "IFRS 9 Bright-Line Effectiveness Test",
      icon: "Percent",
      level: 3,
      type: "formula",
      verified: true,
      codeRefs: [{ file: "frontend/src/lib/mathEngine.ts" }],
      callout: {
        type: "regulatory",
        text: "The 80%–125% corridor is a quantitative bright-line under IAS 39 that has been carried forward as a practical expedient under IFRS 9. Breaching this corridor results in suspension of hedge accounting and immediate P&L recognition of fair value changes.",
      },
      formulas: [
        {
          label: "IFRS 9 Effectiveness Ratio",
          latex:
            "\\eta = \\frac{\\Delta FV_{\\text{hedge instrument}}}{\\Delta FV_{\\text{hedged item}}}",
          explanation:
            "η (eta) is the hedge effectiveness ratio: the change in fair value of the hedging instrument divided by the change in fair value of the hedged item over the same measurement period. Both fair value changes are measured with respect to the designated hedged risk (R1 delta for most positions). The sign convention is that an effective hedge produces opposite-sign fair value changes, so η should be negative; the absolute value |η| is tested against the corridor.",
          source: "frontend/src/lib/mathEngine.ts",
          codeRef: { file: "frontend/src/lib/mathEngine.ts" },
        },
        {
          label: "IFRS 9 Bright-Line Pass Condition",
          latex: "0.80 \\leq |\\eta| \\leq 1.25",
          explanation:
            "The hedge is considered highly effective — and hedge accounting is maintained — only when the absolute effectiveness ratio falls within the 80%–125% corridor. This test is implemented in `ifrs9EffectivenessTest()` in the math engine. Results outside this range generate an IFRS9_BREACH alert in the HedgeHealth widget and are flagged for head-of-risk review.",
          source: "frontend/src/lib/mathEngine.ts",
          codeRef: { file: "frontend/src/lib/mathEngine.ts" },
        },
      ],
    },
    {
      id: "policies-revision-audit",
      anchor: "policies-revision-audit",
      title: "Policy Revision Audit Trail",
      icon: "FileClock",
      level: 4,
      type: "text",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/policy_template.py" },
        { file: "backend/app/api/routes/policies.py" },
      ],
      callout: {
        type: "regulatory",
        text: "policy_revisions is a WORM table. No UPDATE or DELETE operations are permitted after insert. Any attempt to modify a revision record via direct database access will be detected by the hash chain verification routine.",
      },
      content:
        "Every change to a policy template — parameter modification, status transition, or approval action — is recorded as a new row in the `policy_revisions` table. This table is Write-Once, Read-Many (WORM): rows are never updated or deleted.\n\n**Hash Chain Integrity**\n\nEach policy revision record contains a `revision_hash` computed as:\n\n```\nrevision_hash = SHA-256(canonical_json(revision_data) + prior_revision_hash)\n```\n\nThe first revision of any policy (GENESIS revision) uses `GENESIS_HASH = \"0000000000000000000000000000000000000000000000000000000000000000\"` as the prior hash. This creates a tamper-evident chain: altering any historical revision invalidates all subsequent hashes, which can be detected by re-running the hash verification routine.\n\n**Revision Contents**\n\nEach revision record captures: the full policy parameter set at time of revision, the revision author (user UUID), the action taken (CREATED / AMENDED / APPROVED / ARCHIVED / ACTIVATED), the timestamp (UTC, microsecond precision), the prior revision hash, and the computed revision hash.\n\n**Verification**\n\nThe hash chain can be verified independently by any authorised auditor using the `/v1/policies/{id}/revisions/verify` endpoint, which re-computes all hashes from the genesis revision and compares against stored values. A mismatch on any revision is reported with the first failing revision number and hash.\n\n**Regulatory Use**\n\nFor IFRS 9 audits and regulatory examinations, the revision chain provides documentary evidence of: when a policy was first approved, what parameters were in effect at any historical date, who approved each version, and whether any parameter has been retrospectively altered.",
    },
    {
      id: "policies-approval-workflow",
      anchor: "policies-approval-workflow",
      title: "Policy Approval Workflow",
      icon: "CheckSquare",
      level: 4,
      type: "workflow",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/policy_template.py" },
        { file: "backend/app/api/routes/policies.py" },
      ],
      callout: {
        type: "warning",
        text: "4-Eyes SoD is enforced at the database level (approved_by != proposed_by CHECK constraint). A user cannot approve their own policy submission regardless of their role or hierarchy level.",
      },
      steps: [
        {
          step: 1,
          label: "Submit Template for Approval",
          description:
            "The policy author (minimum role: senior_analyst) clicks Submit for Review. The template status changes from DRAFT to PENDING_APPROVAL. The system records the submitter's user UUID as proposed_by and writes an audit event.",
        },
        {
          step: 2,
          label: "Reviewer Notification",
          description:
            "Eligible approvers (supervisor, head_of_risk, cfo, admin — with hierarchy_level > submitter's level) receive a pending approval notification in the dashboard's Pending Approvals widget. The template is visible in their review queue.",
        },
        {
          step: 3,
          label: "Review Parameters",
          description:
            "The reviewer inspects all policy parameters: coverage ratio, cost caps, instrument types, tenor scope, effectiveness threshold. The reviewer may add comments. If the reviewer is the same user as the submitter, the Approve button is disabled (SoD enforcement).",
        },
        {
          step: 4,
          label: "Approve or Reject",
          description:
            "On approval, the reviewer's UUID is recorded as approved_by. The DB CHECK constraint (approved_by != proposed_by) is evaluated at insert time — failure raises an integrity error that is surfaced as a 409 Conflict response. On rejection, the template returns to DRAFT with the rejection reason recorded.",
        },
        {
          step: 5,
          label: "Activate",
          description:
            "An approved template is activated by a head-of-risk or CFO. Activation is a separate step from approval, allowing committee review between approval and go-live. Activation creates the initial policy_revision record and the template becomes assignable to positions.",
        },
      ],
    },
    {
      id: "policies-committee-pack",
      anchor: "policies-committee-pack",
      title: "Committee Pack Context",
      icon: "Building2",
      level: 5,
      type: "text",
      verified: false,
      callout: {
        type: "info",
        text: "The Policy Library export function (PDF/XLSX) is on the product roadmap for v2. In v1, committee packs are assembled manually using the revision history API endpoint.",
      },
      content:
        "**Single Source of Truth**\n\nThe ORDR Policy Library is designed to serve as the single authoritative reference for all hedging decisions presented to the treasury committee, audit committee, and board risk committee. Every policy template, version, approval action, and effectiveness score is captured in the system with full provenance — author identity, timestamp, and hash-verified revision trail.\n\n**Version History as Governance Evidence**\n\nFor regulatory examinations (e.g. by the external auditor, internal audit, or a prudential regulator), the policy revision chain demonstrates:\n- That hedging policies were documented and approved before hedging activity commenced (prospective documentation requirement under IFRS 9)\n- That policy parameters have not been retrospectively altered (tamper-evidence via hash chain)\n- The identity and authority of every approver (RBAC hierarchy_level ≥ required threshold)\n- The exact policy parameters in effect at any historical point in time\n\n**Effectiveness Reporting**\n\nThe composite effectiveness score (Coverage 30% + Efficiency 25% + IFRS9 20% + ProductFit 15% + SizeAccess 10%) is computed at each quarterly reporting date and stored against the policy instance. Historical scores are available via the `/v1/policies/instances/{id}/effectiveness-history` endpoint, enabling trend analysis across reporting periods.\n\n**Regulatory Framework Alignment**\n\nThe Policy Library architecture is designed to support compliance with:\n- **IFRS 9 / IAS 39**: Hedge documentation and prospective effectiveness requirements\n- **EMIR (EU)**: Trade reporting and risk mitigation standards for OTC derivatives\n- **Basel III**: Counterparty credit risk requirements for derivative instruments\n- **SOX Section 13(b)**: Internal controls over financial reporting for US-listed entities\n\nSpecific regulatory obligations remain the responsibility of the entity's legal and compliance teams. ORDR Treasury provides the data infrastructure; the governance posture is set by the organisation.",
    },
  ],
};
