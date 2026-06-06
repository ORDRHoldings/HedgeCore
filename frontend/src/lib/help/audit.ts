import type { ModuleHelp } from "@/lib/help/types";

export const AUDIT_HELP: ModuleHelp = {
  moduleId: "audit",
  pageTitle: "Audit Trail",
  pageSubtitle: "SHA-256 HASH CHAIN · TAMPER-EVIDENT · WORM",
  sections: [
    {
      id: "audit-overview",
      anchor: "audit-overview",
      title: "Audit Trail Overview",
      icon: "ShieldCheck",
      level: 1,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/models/audit_event.py" }],
      content:
        "The ORDR Treasury maintains an immutable, append-only audit log of every material system action. Each record is cryptographically linked to the preceding record via a SHA-256 hash chain, creating a tamper-evident sequence that spans the entire lifetime of the system.\n\n" +
        "If any historical record is modified, deleted, or reordered, the hash chain breaks at that point. Any reader with access to the GENESIS hash (64 zeroes) can independently recompute the entire chain from raw data and detect any discrepancy without trusting the application layer.\n\n" +
        "The audit trail records 8 event types: position lifecycle transitions, proposal submissions, approval grants, ledger commits, policy revisions, user logins, API key creation, and hash chain verification runs. Every event captures the acting user, their tenant, the full payload, and the UTC timestamp to microsecond precision.\n\n" +
        "The audit_events table is a WORM (Write Once, Read Many) table. The database role that the application uses has INSERT and SELECT grants on audit_events but no UPDATE or DELETE grants. This means even a compromised application credential cannot silently alter the record.",
    },
    {
      id: "audit-reading-workflow",
      anchor: "audit-reading-workflow",
      title: "Reading the Audit Log",
      icon: "Search",
      level: 2,
      type: "workflow",
      verified: true,
      codeRefs: [{ file: "backend/app/models/audit_event.py" }],
      steps: [
        {
          step: 1,
          label: "Apply Filters",
          description:
            "Use the filter bar to narrow the log by user (select from team members), date range, or event_type (8 available). For regulatory reviews, filter by event_type 'ledger.committed' or 'approval.granted' to see the approval chain for executed hedges.",
        },
        {
          step: 2,
          label: "Browse Events",
          description:
            "The filtered list shows events in reverse-chronological order (newest first). Each row displays event_type, the acting user, and the UTC timestamp. The list is paginated; use the page controls or export to XLSX for bulk analysis.",
        },
        {
          step: 3,
          label: "Inspect Event Detail",
          description:
            "Click any row to expand the full event panel. This shows the complete JSON payload, the acting user's role at the time of the event, and the SHA-256 hash values (prev_hash and this_hash) for chain verification.",
        },
        {
          step: 4,
          label: "Verify Hash",
          description:
            "Click the Verify button on any event to trigger an on-demand hash recomputation. The system recomputes SHA-256(prev_hash + canonical_json(payload)) and compares it to the stored this_hash. A green PASS badge confirms the record is untampered.",
        },
        {
          step: 5,
          label: "Export",
          description:
            "Use Export to download the filtered event set as XLSX or CSV. Exported files include the this_hash column so that external parties can independently verify chain integrity without system access. Export actions are themselves logged as audit events.",
        },
      ],
    },
    {
      id: "audit-event-fields",
      anchor: "audit-event-fields",
      title: "Audit Event Fields",
      icon: "Table",
      level: 2,
      type: "variables",
      verified: true,
      codeRefs: [{ file: "backend/app/models/audit_event.py" }],
      variables: [
        {
          name: "event_id",
          type: "UUID v4",
          description:
            "Primary key of the audit event. Globally unique. Referenced in other tables (e.g. calculation_runs.audit_event_id) to link business records to their originating event.",
          example: "550e8400-e29b-41d4-a716-446655440000",
          source: "auto-generated on insert",
        },
        {
          name: "event_type",
          type: "string (enum, 8 values)",
          description:
            "Categorical type of the event. The 8 canonical types are: position.created, proposal.submitted, approval.granted, ledger.committed, policy.revised, user.login, api_key.created, hash_chain.verified. New types cannot be added without a schema migration.",
          example: "approval.granted",
          source: "backend/app/models/audit_event.py",
        },
        {
          name: "user_id",
          type: "UUID (FK → users)",
          description:
            "The user who caused the event. For system-initiated events (e.g. scheduled hash verification), this references the service account. Never null.",
          example: "11111111-1111-1111-1111-111111111111",
          source: "JWT sub claim at time of request",
        },
        {
          name: "tenant_id",
          type: "UUID (FK → companies)",
          description:
            "The company tenant under which the event occurred. All hash chains are per-tenant, meaning the chain is scoped to a single company's event sequence.",
          example: "11111111-1111-1111-1111-111111111111",
          source: "Derived from user's company_id",
        },
        {
          name: "payload",
          type: "JSONB",
          description:
            "The full, structured data payload of the event. Content varies by event_type. For approval.granted events this includes proposal_id, approver_role, and decision. Payload is what is hashed (after canonical serialisation) to produce this_hash.",
          example: '{"proposal_id": "...", "decision": "APPROVED"}',
          source: "Application layer at event time",
        },
        {
          name: "prev_hash",
          type: "string (64-char hex SHA-256)",
          description:
            "The this_hash of the immediately preceding event in the tenant's chain. The GENESIS event has prev_hash = '0000000000000000000000000000000000000000000000000000000000000000' (64 zeroes).",
          example: "a3f2c1d4e5b6...",
          source: "Computed from previous audit_events row",
        },
        {
          name: "this_hash",
          type: "string (64-char hex SHA-256)",
          description:
            "SHA-256 of (prev_hash + canonical_json(payload)). This is the output of the chain link computation. The next event in the chain uses this value as its prev_hash.",
          example: "b7e8d9a0c1f2...",
          source: "Computed at insert time",
        },
        {
          name: "created_at",
          type: "timestamptz",
          description:
            "UTC timestamp of event insertion, set by the database server (not the application). Microsecond precision. Because audit_events is WORM, this timestamp cannot be altered after insert.",
          example: "2025-03-31T14:32:07.123456Z",
          source: "PostgreSQL server clock",
        },
      ],
    },
    {
      id: "audit-hash-chain-formula",
      anchor: "audit-hash-chain-formula",
      title: "Hash Chain Formula",
      icon: "Link",
      level: 3,
      type: "formula",
      verified: true,
      codeRefs: [{ file: "backend/app/models/audit_event.py" }],
      formulas: [
        {
          label: "Canonical JSON Serialisation",
          latex:
            "\\text{canonical\\_json}(p) = \\texttt{json.dumps}(p,\\, \\texttt{sort\\_keys=True},\\, \\texttt{separators=(\\text{','}, \\text{':'})})",
          explanation:
            "Before hashing, the payload is serialised to a deterministic JSON string with keys sorted alphabetically and with no extraneous whitespace. This ensures that two payloads with identical content but different key ordering produce the same hash.",
          source: "backend/app/models/audit_event.py",
          codeRef: { file: "backend/app/models/audit_event.py" },
        },
        {
          label: "Hash Chain Link",
          latex:
            "H_n = \\text{SHA-256}\\!\\left(H_{n-1} \\,\\|\\, \\text{canonical\\_json}(\\text{payload}_n)\\right)",
          explanation:
            "Each event's hash H_n is the SHA-256 digest of the concatenation of the previous event's hash H_{n-1} and the canonical JSON of the current event's payload. The || operator denotes string concatenation. This construction makes the chain non-invertible and collision-resistant.",
          source: "SHA-256: FIPS 180-4",
          codeRef: { file: "backend/app/models/audit_event.py" },
        },
        {
          label: "GENESIS Condition",
          latex:
            "H_0 = \\text{SHA-256}\\!\\left(\\underbrace{00\\cdots0}_{64} \\,\\|\\, \\text{canonical\\_json}(\\text{payload}_0)\\right)",
          explanation:
            "The first event in each tenant's chain (GENESIS) uses a prev_hash of 64 zero characters as its anchor. This value is a public constant (GENESIS_HASH), allowing any verifier to independently reconstruct the chain from event 0 without requiring access to a preceding record.",
          source: "Internal constant GENESIS_HASH",
          codeRef: { file: "backend/app/models/audit_event.py" },
        },
      ],
    },
    {
      id: "audit-ledger-merkle",
      anchor: "audit-ledger-merkle",
      title: "Ledger Merkle Root",
      icon: "GitBranch",
      level: 3,
      type: "formula",
      verified: false,
      callout: {
        type: "info",
        text:
          "The ledger Merkle root is a planned verification feature. The formula below describes the intended design. Verify current implementation status in backend/app/models/ledger.py before citing in regulatory submissions.",
      },
      codeRefs: [{ file: "backend/app/models/ledger.py" }],
      formulas: [
        {
          label: "Daily Ledger Merkle Root",
          latex:
            "R_{\\text{day}} = \\text{SHA-256}(h_1 \\| h_2 \\| h_3 \\| h_4 \\| h_5)",
          explanation:
            "The day's ledger entries are partitioned into 5 segments. Each segment is hashed to produce h_1 through h_5. The daily Merkle root R_day is the SHA-256 of their concatenation. This provides an independent verification anchor that can be published as a daily checksum without revealing individual transaction data.",
          source: "Internal design specification",
          codeRef: { file: "backend/app/models/ledger.py" },
        },
      ],
    },
    {
      id: "audit-worm-semantics",
      anchor: "audit-worm-semantics",
      title: "WORM Semantics",
      icon: "Lock",
      level: 4,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/models/audit_event.py" }],
      content:
        "Three tables are designated WORM (Write Once, Read Many): **audit_events**, **calculation_runs**, and **policy_revisions**.\n\n" +
        "**Database-layer enforcement**: The database role used by the application (hedge_user) holds INSERT and SELECT privileges on WORM tables but no UPDATE or DELETE privileges. Any attempt by the application to modify or delete a WORM record will be rejected at the database layer with a permission error.\n\n" +
        "**Application-layer enforcement**: SQLAlchemy model definitions for WORM tables do not expose update methods. The ORM session is configured to raise an error if a flush attempts to emit an UPDATE statement against a WORM-table mapped object.\n\n" +
        "**Implications for incident response**: If an error is discovered in an audit record or calculation run, the correct remediation is to insert a correcting event (not to modify the original). The correction event references the original event_id and explains the discrepancy. Both records remain in the chain permanently.\n\n" +
        "**Policy revisions**: Every change to a policy template creates a new policy_revision row with an incremented version number. The previous version is never modified. This allows the system to reconstruct the exact policy parameters in force at any historical moment.",
    },
    {
      id: "audit-verify-workflow",
      anchor: "audit-verify-workflow",
      title: "Hash Verification",
      icon: "CheckCircle",
      level: 4,
      type: "workflow",
      verified: true,
      codeRefs: [{ file: "backend/app/models/audit_event.py" }],
      steps: [
        {
          step: 1,
          label: "Select Event",
          description:
            "Navigate to the Audit Trail page and click on the event you wish to verify. The event detail panel expands to show the full payload, prev_hash, and stored this_hash.",
        },
        {
          step: 2,
          label: "Click Verify",
          description:
            "Click the Verify button in the event detail panel. This sends a verification request to the backend. The request does not modify any data; it is a read-only recomputation.",
        },
        {
          step: 3,
          label: "Server Recomputes Hash",
          description:
            "The server retrieves the stored payload and prev_hash for the event. It reserialises the payload using canonical_json (sort_keys=True, separators=(',',':')) and computes SHA-256(prev_hash + canonical_json(payload)).",
        },
        {
          step: 4,
          label: "Compare to Stored Hash",
          description:
            "The recomputed hash is compared byte-for-byte to the stored this_hash. If they match, the event is untampered. If they differ, the record has been modified after insertion.",
        },
        {
          step: 5,
          label: "PASS or FAIL Displayed",
          description:
            "A PASS badge (green) confirms integrity. A FAIL badge (red) indicates tampering and triggers an automatic alert to the admin and head_of_risk roles. FAIL results are themselves logged as a hash_chain.verified event with outcome='FAIL'.",
        },
      ],
    },
    {
      id: "audit-regulatory",
      anchor: "audit-regulatory",
      title: "Regulatory Context",
      icon: "Scale",
      level: 5,
      type: "text",
      verified: false,
      callout: {
        type: "regulatory",
        text:
          "The following regulatory mappings are provided for orientation only. Confirm applicability with your legal counsel and compliance team before citing in filings or external audit reports.",
      },
      content:
        "The ORDR Treasury's hash-chained audit trail is designed to satisfy tamper-evidence requirements under multiple regulatory frameworks applicable to institutional treasury operations.\n\n" +
        "**ISDA Master Agreement / MRA**: The ISDA Master Repurchase Agreement requires counterparties to maintain records sufficient to demonstrate the terms and history of each transaction. The hash chain provides a court-admissible record of every proposal, approval, and ledger commitment with cryptographic proof that the record has not been altered.\n\n" +
        "**FINRA Rule 17a-4**: Requires broker-dealers to preserve electronic records in a non-rewriteable, non-erasable format (WORM). The combination of database-level permission controls and the SHA-256 chain satisfies the technical requirements of 17a-4(f)(2)(ii)(A) for records that cannot be overwritten or erased.\n\n" +
        "**Independent Verification**: A qualified external examiner with read-only database access can independently recompute the entire audit chain from the GENESIS event (prev_hash = 64 zeroes) using only the raw event data, without any access to application code or secrets. This is the strongest available form of tamper-evidence for digital records.\n\n" +
        "**MiFID II Article 16 / RTS 6**: Transaction record-keeping requirements for systematic internalisers and investment firms can be satisfied by the audit trail's combination of immutable storage, user attribution, and cryptographic linking.\n\n" +
        "**Practical note for committee presentations**: The audit trail's GENESIS hash and the hash of the most recent event can be published in board minutes as a cryptographic commitment to the integrity of the full historical record at that point in time.",
    },
  ],
};
