import type { ModuleHelp } from "@/lib/help/types";

export const LINEAGE_HELP: ModuleHelp = {
  moduleId: "lineage",
  pageTitle: "Position Lineage",
  pageSubtitle: "PROVENANCE GRAPH · AUDIT CHAIN VISUALISER",
  sections: [
    {
      id: "lineage-overview",
      anchor: "lineage-overview",
      title: "What this page does",
      icon: "GitFork",
      level: 1,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/api/routes/v1_positions.py", line: 1190 }],
      content:
        "Position Lineage renders the full provenance chain for a single FX position as a directed graph: " +
        "Position → Policy → PolicyRevision → CalculationRun → ExecutionProposal(s).\n\n" +
        "Every node represents a WORM-persisted entity (append-only, never modified). " +
        "The lineage answers: what policy version governed this position, what calculation produced the hedge plan, " +
        "and what 4-eyes approval chain authorised execution.\n\n" +
        "Select a position from the list (or navigate here via the LINEAGE icon on the Position Desk). " +
        "Click any node to expand its evidence packet. Use the EXPORT JSON button to download the full provenance bundle.",
    },
    {
      id: "lineage-nodes",
      anchor: "lineage-nodes",
      title: "Node Types",
      icon: "Box",
      level: 1,
      type: "variables",
      verified: true,
      codeRefs: [{ file: "backend/app/api/routes/v1_positions.py", line: 1256 }],
      variables: [
        { name: "POSITION", type: "Entity", description: "The FX exposure record. Lifecycle: NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED/REJECTED. Tenant-scoped by company_id." },
        { name: "POLICY", type: "Entity", description: "The PolicyInstance governing this position. Linked at assign-policy time." },
        { name: "POLICY_REVISION", type: "WORM", description: "Pinned policy snapshot at the moment the policy was assigned. SHA-256 hash-sealed. Never mutated." },
        { name: "CALCULATION_RUN", type: "WORM", description: "RunEnvelope from the engine run that produced the hedge plan. Includes inputs_hash, outputs_hash, run_hash for determinism proof." },
        { name: "EXECUTION_PROPOSAL", type: "4-Eyes", description: "Maker/checker approval record. Includes proposal_hash and approval_hash for chain binding. SoD enforced at DB level." },
      ],
    },
    {
      id: "lineage-integrity",
      anchor: "lineage-integrity",
      title: "Integrity Verification",
      icon: "ShieldCheck",
      level: 2,
      type: "formula",
      verified: true,
      codeRefs: [{ file: "backend/app/api/routes/v1_positions.py", line: 1536 }],
      formulas: [
        {
          label: "Policy Hash Binding",
          latex: "integrity\\_verified = (run.policy\\_revision\\_id == position.policy\\_revision\\_id) \\land (run.policy\\_hash == revision.policy\\_hash)",
          explanation: "The run used the same policy revision that was pinned to the position, and the policy hashes match. Ensures no policy substitution between assignment and execution.",
        },
        {
          label: "RunEnvelope Integrity",
          latex: "run\\_hash = SHA256(inputs\\_hash \\| outputs\\_hash \\| policy\\_hash \\| created\\_at)",
          explanation: "The run_hash seals the full input/output snapshot. Any post-hoc modification to the run record breaks the chain.",
        },
      ],
    },
    {
      id: "lineage-rbac",
      anchor: "lineage-rbac",
      title: "Access Control",
      icon: "Lock",
      level: 2,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/api/routes/v1_positions.py", line: 1226 }],
      content:
        "Lineage data requires the `trades.view` permission. All queries are tenant-scoped: positions, policy revisions, " +
        "calculation runs, and execution proposals are filtered to the caller's company_id at SQL level.\n\n" +
        "Attempting to access a position belonging to another tenant returns HTTP 404 (not 403) to prevent tenant enumeration.",
    },
  ],
};
