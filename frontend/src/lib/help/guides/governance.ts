import type { GuideDoc } from "@/lib/help/guides/types";

export const GOVERNANCE: GuideDoc = {
  id: "governance",
  title: "Governance & Audit",
  summary:
    "ORDR Treasury's three governance pillars: SHA-256 hash-chained audit trail, 41-permission RBAC, and 4-eyes segregation of duties on all material transactions. All controls are enforced at the system level and cannot be bypassed by any role.",
  path: "/audit-trail",
  icon: "🔒",
  lastReviewed: "2026-02-28",
  relatedIds: ["getting-started", "api-reference", "faq", "troubleshooting"],
  sections: [
    // ─── L1: Governance Overview ──────────────────────────────────────────────
    {
      id: "gov-overview",
      heading: "Governance Overview",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/audit_event.py", symbol: "AuditEvent" },
        { file: "backend/app/models/permission.py", symbol: "SEED_PERMISSIONS" },
        { file: "backend/app/models/execution_proposal.py", symbol: "ExecutionProposal" },
      ],
      blocks: [
        {
          type: "text",
          body: "ORDR Treasury is built on three non-negotiable governance pillars. These controls are implemented at the database and application layer — they are not configuration options and cannot be disabled by any user role, including admin.",
        },
        {
          type: "table",
          table: {
            headers: ["Pillar", "Mechanism", "Scope"],
            rows: [
              ["1. Immutable Audit Trail", "SHA-256 hash chain, WORM audit_events table", "Every action: login, position, policy, calculation, approval, ledger commit"],
              ["2. Role-Based Access Control", "9 roles, 41 permissions, 11 modules, hierarchy_level 0–15", "Every API endpoint and UI action gated by at least one permission"],
              ["3. Four-Eyes Approval (SoD)", "DB CHECK: approved_by ≠ proposed_by on execution_proposals", "All material transactions: no actor can approve their own proposal"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "These three controls together satisfy the core requirements of EMIR Art. 9 (audit preservation), MiFID II RTS 6 (audit trail), SOX IT general controls (SoD), and IFRS 9 §6.4.1 (hedge designation documentation). See Section L5 for detailed regulatory mapping.",
          },
        },
      ],
    },

    // ─── L2: Reading the Audit Trail ─────────────────────────────────────────
    {
      id: "gov-reading-audit",
      heading: "Reading the Audit Trail",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Navigate to /audit-trail",
              detail: "Open the Audit Trail page from the navigation. You need audit.view_own, audit.view_branch, or audit.view_all permission depending on scope required. Auditors and admin have audit.view_all.",
            },
            {
              n: 2,
              label: "Filter by user, date range, or event type",
              detail: "Use the filter panel to narrow events by actor (user), date range, or one of the 8 event types: INGEST, POLICY, CALCULATE, LIFECYCLE, EXECUTION, REJECTION, LOGIN, SYSTEM.",
            },
            {
              n: 3,
              label: "Expand an event",
              detail: "Click any event row to expand its detail panel. The full payload (canonical JSON), entity_type, entity_id, actor_email, and hash fields are displayed.",
            },
            {
              n: 4,
              label: "Verify the hash",
              detail: "The event_hash field is the SHA-256 of the canonical event content including prev_event_hash. To verify, recompute: SHA256(canonical_json({event_type, actor_id, entity_id, payload_digest, created_at, prev_event_hash})). A FAIL status indicates the chain has been broken for that event.",
            },
            {
              n: 5,
              label: "Export",
              detail: "Use the Export function to download a filtered event range as JSON or CSV for external audit tools. Requires audit.view_all or audit.view_branch permission.",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "The 8 event types map to the INGEST, POLICY, CALCULATE, LIFECYCLE, EXECUTION, REJECTION, LOGIN, and SYSTEM enum values defined in backend/app/models/audit_event.py.",
          },
        },
      ],
    },

    // ─── L2: Audit Event Fields ───────────────────────────────────────────────
    {
      id: "gov-audit-fields",
      heading: "Audit Event Fields",
      level: "L2",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/audit_event.py", symbol: "AuditEvent" },
      ],
      blocks: [
        {
          type: "field-dict",
          fields: [
            {
              name: "id",
              type: "UUID",
              constraints: "Primary key, auto-generated",
              meaning: "Unique identifier for this audit event",
              example: "3f8a2c1d-1111-4abc-8def-0123456789ab",
            },
            {
              name: "event_type",
              type: "string (enum)",
              constraints: "One of 8 values: INGEST | POLICY | CALCULATE | LIFECYCLE | EXECUTION | REJECTION | LOGIN | SYSTEM",
              meaning: "Classification of the action that generated this event",
              example: "CALCULATE",
            },
            {
              name: "actor_id",
              type: "UUID (nullable)",
              constraints: "null for system/anonymous events",
              meaning: "UUID of the user who performed the action",
              example: "11111111-1111-1111-1111-111111111111",
            },
            {
              name: "actor_email",
              type: "string (nullable)",
              constraints: "max 255 chars",
              meaning: "Email of the actor at time of event (denormalized for audit replay without joining users table)",
              example: "analyst@democompany.com",
            },
            {
              name: "company_id",
              type: "UUID (nullable)",
              constraints: "null for system events",
              meaning: "Tenant identifier — hash chain is isolated per tenant",
              example: "11111111-1111-1111-1111-111111111111",
            },
            {
              name: "entity_type",
              type: "string (nullable)",
              constraints: "e.g. 'position', 'run', 'policy'",
              meaning: "Type of the business entity acted upon",
              example: "position",
            },
            {
              name: "entity_id",
              type: "string (nullable)",
              constraints: "UUID or string ID of the entity",
              meaning: "Identifier of the entity acted upon, for cross-referencing with business tables",
              example: "abc12345-...",
            },
            {
              name: "payload",
              type: "JSONB",
              constraints: "Full field values at time of event — audit replay basis",
              meaning: "Structured snapshot of all relevant field values at the time the event was created",
              example: "{\"hedge_notional\": 1000000, \"currency\": \"MXN\", \"instrument\": \"NDF\"}",
            },
            {
              name: "prev_event_hash",
              type: "string (hex-64)",
              constraints: "SHA-256 hex; GENESIS = 64 zeroes",
              meaning: "Hash of the immediately preceding event in this tenant's chain. All-zeroes for the first (GENESIS) event.",
              example: "0000000000000000000000000000000000000000000000000000000000000000",
            },
            {
              name: "event_hash",
              type: "string (hex-64)",
              constraints: "SHA-256 hex; computed at insert",
              meaning: "Tamper-evident hash of this event's content including prev_event_hash. Any post-insert modification invalidates this hash.",
              example: "a3f2d1e8b7c6...(64 hex chars)",
            },
            {
              name: "created_at",
              type: "datetime (UTC, timezone-aware)",
              constraints: "Server-set via NOW() — immutable after insert",
              meaning: "WORM timestamp of event creation. Never updated.",
              example: "2026-02-28T10:15:22.334Z",
            },
          ],
        },
      ],
    },

    // ─── L3: Hash Chain Formula ───────────────────────────────────────────────
    {
      id: "gov-hash-chain",
      heading: "Hash Chain Formula",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/audit_event.py", symbol: "compute_event_hash" },
        { file: "backend/app/models/audit_event.py", symbol: "GENESIS_HASH" },
      ],
      blocks: [
        {
          type: "formula",
          formula: {
            label: "Audit Event Hash",
            expression: "event_hash = SHA256(canonical_json({event_type, actor_id, entity_id, payload_digest, created_at, prev_event_hash}))",
            explanation:
              "payload_digest is itself SHA256(json.dumps(payload, sort_keys=True, default=str)). The outer canonical JSON is produced with sort_keys=True and separators=(',', ':') — no whitespace. This guarantees hash stability across platforms and languages.",
            source: "backend/app/models/audit_event.py — compute_event_hash()",
            codeRef: { file: "backend/app/models/audit_event.py", symbol: "compute_event_hash" },
          },
        },
        {
          type: "table",
          table: {
            headers: ["Event Position", "prev_event_hash Value", "Meaning"],
            rows: [
              ["First event (GENESIS)", "0000...0000 (64 zeroes)", "Sentinel value — no prior event in this tenant's chain"],
              ["Every subsequent event", "event_hash of the immediately preceding event", "Links this event cryptographically to the previous one"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "Any modification to a historical event — including its payload, created_at, or any other field — will produce a different hash when the chain is recomputed. This invalidates the hashes of all events that follow in the chain, making the tampering detectable by any external examiner who recomputes the chain from the GENESIS event.",
          },
        },
      ],
    },

    // ─── L3: Ledger Merkle Root ───────────────────────────────────────────────
    {
      id: "gov-merkle",
      heading: "Ledger Merkle Root",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/ledger.py", symbol: "AnchorHash" },
        { file: "backend/app/models/ledger.py", symbol: "LedgerEntry" },
      ],
      blocks: [
        {
          type: "formula",
          formula: {
            label: "Ledger Daily Merkle Root (Entry-Level)",
            expression: "root_hash = SHA256(snapshot_hash ‖ exposure_digest ‖ policy_hash ‖ approval_hash ‖ execution_payload_hash)",
            explanation:
              "Each LedgerEntry stores a root_hash computed over five component hashes from its provenance chain. The AnchorHash table stores a daily merkle_root over all ledger entries for that trading day, providing a single digest for external audit verification.",
            source: "backend/app/models/ledger.py — LedgerEntry.root_hash, AnchorHash.merkle_root",
            codeRef: { file: "backend/app/models/ledger.py", symbol: "AnchorHash" },
          },
        },
        {
          type: "text",
          body: "The anchor_hashes table stores one row per trading day. Each row holds the merkle_root over all ledger_entries created that day, the entry_count, and a created_at timestamp. External auditors can verify a day's transactions by: (1) fetching all ledger_entries for the date, (2) recomputing each entry's root_hash from stored provenance components, (3) recomputing the merkle_root, and (4) comparing against the stored anchor.",
        },
      ],
    },

    // ─── L4: WORM Enforcement ─────────────────────────────────────────────────
    {
      id: "gov-worm",
      heading: "WORM Enforcement",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/audit_event.py", symbol: "AuditEvent" },
        { file: "backend/app/models/calculation_run.py", symbol: "CalculationRun" },
        { file: "backend/app/models/policy_revision.py", symbol: "PolicyRevision" },
        { file: "backend/app/models/ledger.py", symbol: "LedgerEntry" },
      ],
      blocks: [
        {
          type: "text",
          body: "Three tables in ORDR Treasury carry WORM (Write Once Read Many) semantics: audit_events, calculation_runs, and policy_revisions. A fourth table, ledger_entries, is protected by a PostgreSQL BEFORE UPDATE OR DELETE trigger that raises an exception on any mutation attempt.",
        },
        {
          type: "table",
          table: {
            headers: ["Table", "WORM Mechanism", "Correction Path"],
            rows: [
              ["audit_events", "Application-layer enforced: no ORM update/delete path exists", "New append-only event with corrective notes in payload"],
              ["calculation_runs", "Application-layer enforced: results written once at engine completion", "New calculation run must be created to supersede a prior run"],
              ["policy_revisions", "Application-layer enforced: each change creates a new revision row", "New revision appended; old revision immutable in history"],
              ["ledger_entries", "PostgreSQL BEFORE UPDATE OR DELETE trigger raises EXCEPTION", "Cannot be modified or deleted at any layer; authorization is permanent"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "WORM semantics are enforced at the ORM layer (no SQLAlchemy update/delete operations are permitted on these tables) and additionally at the PostgreSQL trigger level for ledger_entries. No database role — including the application service account — can UPDATE or DELETE a committed ledger entry.",
          },
        },
      ],
    },

    // ─── L4: Permission Matrix ────────────────────────────────────────────────
    {
      id: "gov-permissions",
      heading: "Permission Matrix",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/permission.py", symbol: "SEED_PERMISSIONS" },
        { file: "backend/app/models/permission.py", symbol: "DEFAULT_ROLE_PERMISSIONS" },
      ],
      blocks: [
        {
          type: "table",
          table: {
            headers: ["Role", "Hierarchy Level", "Key Permissions", "Typical Capability"],
            rows: [
              ["admin", "15", "All 41 permissions", "Full system access; user management; all audit views; company settings"],
              ["cfo", "13", "trades.view, pipeline.approve, reports.view_all_branches, reports.export_pdf, audit.view_all", "Approval authority; cross-branch reporting; full audit read"],
              ["head_of_risk", "12", "All trade + hedge + calculate + pipeline.approve + policy.* + audit.view_all", "Full risk governance; branch-level comparisons; policy management"],
              ["supervisor", "8", "All trade + hedge + calculate + pipeline.create_proposal + pipeline.approve + policy.edit + overrides.override_subordinate", "Full trading workflow; team oversight; proposal submission and approval"],
              ["senior_analyst", "6", "trades.*, hedges.*, calculate.*, pipeline.create_proposal + submit_staging, policy.edit", "End-to-end sandbox-to-staging workflow; policy editing"],
              ["risk_analyst", "4", "trades.*, hedges.view/create/edit, calculate.*, pipeline.create_proposal + submit_staging, policy.*", "Full trading workflow excluding delete; cannot approve own proposals"],
              ["junior_analyst", "2", "trades.view, hedges.view, calculate.run_sandbox, policy.view, audit.view_own", "Sandbox only; read-only access to hedges and policies"],
              ["auditor", "varies", "audit.view_all, trades.view, hedges.view, reports.view_all_branches", "Read-only audit access; no write or approval permissions"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "A user may hold multiple roles simultaneously. Effective permissions are the union of all assigned role permissions. Escalation above a user's maximum hierarchy_level is prevented — a user cannot assign roles with a higher hierarchy_level than their own.",
          },
        },
      ],
    },

    // ─── L5: Regulatory Framework ────────────────────────────────────────────
    {
      id: "gov-regulatory",
      heading: "Regulatory Framework",
      level: "L5",
      verified: false,
      callout: {
        type: "regulatory",
        text: "The following regulatory alignments are based on the system design intent. Formal compliance assessment requires review by qualified legal and compliance counsel for each applicable jurisdiction.",
      },
      blocks: [
        {
          type: "table",
          table: {
            headers: ["Regulation / Standard", "ORDR Control", "Alignment Basis"],
            rows: [
              ["ISDA Master Agreement — Tamper-evidence", "SHA-256 hash-chained audit trail, WORM audit_events", "Cryptographic tamper-evidence for all trade-related events from inception"],
              ["FINRA Rule 17a-4 — Records preservation", "WORM tables, no DELETE path, ledger PostgreSQL trigger", "Immutable preservation of calculation, policy, and execution records"],
              ["EMIR Art. 9 — Reporting and recordkeeping", "audit_events, calculation_runs, ledger_entries all WORM", "Complete immutable trade record from exposure through execution"],
              ["MiFID II RTS 6 — Audit trail completeness", "Hash chain includes actor, timestamp, entity, full payload", "Every step of the trading workflow logged with actor and content hash"],
              ["IFRS 9 §6.4.1 — Hedge accounting effectiveness", "80%–125% bright-line test in mathEngine.ts ifrs9EffectivenessTest()", "Quantitative hedge effectiveness gate; WORM policy_revisions for designation docs"],
              ["SOX IT General Controls — SoD", "DB CHECK approved_by ≠ proposed_by; no admin override path", "Two-person integrity for all material trade executions"],
            ],
          },
        },
        {
          type: "text",
          body: "For external examiners: the audit chain can be independently verified from the GENESIS event (prev_event_hash = 64 zeroes). The daily anchor_hashes table provides a Merkle root digest for each trading day. Both the chain and the daily anchors are recomputable from data stored in the database without relying on any application-layer trust.",
        },
      ],
    },
  ],
};
