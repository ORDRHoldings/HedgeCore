import type { GuideDoc } from "@/lib/help/guides/types";

export const DATA_INGESTION: GuideDoc = {
  id: "data-ingestion",
  title: "Data Ingestion",
  summary:
    "How to load FX exposure positions into ORDR Terminal: CSV upload, manual entry, ERP connector, field validation requirements, and the audit trail created for each import.",
  path: "/upload-csv",
  icon: "Upload",
  lastReviewed: "2026-02-28",
  relatedIds: ["position-desk", "policy-engine", "getting-started"],
  sections: [
    // ─── L1: Data Ingestion Overview ──────────────────────────────────────────
    {
      id: "data-ingestion-overview",
      heading: "Data Ingestion Overview",
      level: "L1",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "Data ingestion is the first step of the ORDR Terminal workflow: loading FX exposure positions that represent your company's foreign currency obligations or receivables. Positions are the source objects that drive policy assignment, hedge calculation, and ultimately ledger commitment.",
        },
        {
          type: "table",
          table: {
            headers: ["Ingestion Method", "Path", "Best For"],
            rows: [
              ["CSV Upload", "/upload-csv", "Batch imports from treasury systems, spreadsheets, or ERP exports"],
              ["Manual Entry", "/position-desk → New Position", "Individual positions, ad-hoc additions, corrections"],
              ["ERP / API Connector", "/connectors", "Scheduled automated sync from SAP, Oracle NetSuite, or generic SQL"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "All three ingestion methods produce identical position records. The ingestion method is recorded in the audit event but does not affect the subsequent lifecycle or calculation workflow.",
          },
        },
        {
          type: "text",
          body: "Once ingested, every position enters the lifecycle at status NEW. No position can be deleted from the system — positions that are not suitable for hedging are transitioned to REJECTED status instead, preserving the complete history.",
        },
      ],
    },

    // ─── L2: CSV Upload Workflow ───────────────────────────────────────────────
    {
      id: "data-ingestion-csv-workflow",
      heading: "CSV Upload Workflow",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] The CSV upload workflow and field specification below describe the intended interface. Verify field names against the current template file available at /upload-csv → Download Template.",
          },
        },
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Navigate to the CSV upload page",
              detail: "Go to /upload-csv from the navigation menu. Requires trades.import_csv permission.",
            },
            {
              n: 2,
              label: "Download the CSV template",
              detail: "Click 'Download Template'. The template file includes all required and optional columns with example data and format notes in the header row.",
            },
            {
              n: 3,
              label: "Populate the template",
              detail: "Fill in your position data. Required fields must not be blank. Dates must be in ISO 8601 format (YYYY-MM-DD). Currency pairs must match the supported pair list.",
            },
            {
              n: 4,
              label: "Upload the completed file",
              detail: "Click 'Choose File' or drag-and-drop your CSV onto the upload zone. Files up to a system-configured size limit are accepted.",
            },
            {
              n: 5,
              label: "Review validation results",
              detail: "The system validates each row. Rows with errors are listed with the specific error per field. Rows with no errors show a green checkmark.",
            },
            {
              n: 6,
              label: "Correct errors and re-upload if needed",
              detail: "Download the error report, correct the flagged rows in your source file, and re-upload. Only the corrected file needs to be uploaded; a new batch is created.",
            },
            {
              n: 7,
              label: "Confirm import",
              detail: "Click 'Confirm Import'. All validated rows are written to the positions table. An audit event is created for the entire batch with import_batch_id, user_id, position_count, and status.",
            },
          ],
        },
      ],
    },

    // ─── L2: Required Position Fields ─────────────────────────────────────────
    {
      id: "data-ingestion-required-fields",
      heading: "Required Position Fields",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] Field names and constraints below reflect the intended data model. Verify against the current CSV template and API documentation.",
          },
        },
        {
          type: "field-dict",
          fields: [
            {
              name: "entity_name",
              type: "string",
              constraints: "max 255 chars, required",
              meaning: "The legal entity or business unit that holds the FX exposure",
              example: "Acme Corp — Mexico Operations",
            },
            {
              name: "currency_pair",
              type: "string",
              constraints: "6-char ISO pair, required, must be in supported list",
              meaning: "The currency pair of the exposure (base/quote). Base is the exposure currency; quote is the functional currency.",
              example: "USDMXN",
            },
            {
              name: "notional_amount",
              type: "decimal",
              constraints: "> 0, required",
              meaning: "The face amount of the exposure in the base currency",
              example: "1500000.00",
            },
            {
              name: "exposure_type",
              type: "enum",
              constraints: "payable | receivable, required",
              meaning: "Direction of the exposure: payable = you owe foreign currency; receivable = you are owed foreign currency",
              example: "payable",
            },
            {
              name: "settlement_date",
              type: "ISO date",
              constraints: "YYYY-MM-DD, must be in future, required",
              meaning: "Date on which the FX payment or receipt is expected to settle",
              example: "2026-09-30",
            },
            {
              name: "notes",
              type: "string",
              constraints: "max 1000 chars, optional",
              meaning: "Free-text annotation for context (e.g. contract reference, counterparty name)",
              example: "Q3 supplier invoice — Contract #INV-2026-0412",
            },
          ],
        },
      ],
    },

    // ─── L2: ERP Connector ────────────────────────────────────────────────────
    {
      id: "data-ingestion-erp-connector",
      heading: "ERP Connector",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] The ERP connector interface is described here as intended functionality. Verify current connector availability and configuration options in the /connectors administration page.",
          },
        },
        {
          type: "text",
          body: "The ERP connector enables automated, scheduled synchronisation of FX exposure positions from enterprise resource planning systems. Supported sources include SAP, Oracle NetSuite, and generic SQL databases.",
        },
        {
          type: "table",
          table: {
            headers: ["Connector Type", "Connection Method", "Typical Sync Frequency"],
            rows: [
              ["SAP", "RFC/BAPI or OData API", "Daily or on-demand"],
              ["Oracle NetSuite", "SuiteQL REST API", "Daily or on-demand"],
              ["Generic SQL", "JDBC/ODBC connection string", "Configurable schedule (cron)"],
            ],
          },
        },
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Navigate to Connectors",
              detail: "Go to /connectors. Requires company.edit_settings or admin permission.",
            },
            {
              n: 2,
              label: "Create a new connector",
              detail: "Select the source type, enter connection credentials, and configure the field mapping between source columns and ORDR Terminal position fields.",
            },
            {
              n: 3,
              label: "Test the connection",
              detail: "Run a test sync to validate connectivity and field mapping. Review the sample data before enabling.",
            },
            {
              n: 4,
              label: "Set sync schedule",
              detail: "Configure the sync frequency (e.g. daily at 06:00 UTC). Each sync run creates a new import batch.",
            },
            {
              n: 5,
              label: "Monitor sync status",
              detail: "View sync history, row counts, and any errors in the connector dashboard. All sync runs are audited.",
            },
          ],
        },
      ],
    },

    // ─── L3: Position Validation Rules ────────────────────────────────────────
    {
      id: "data-ingestion-validation",
      heading: "Position Validation Rules",
      level: "L3",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "[Unverified] Validation logic described here represents the intended rules. Exact implementation may vary. Verify against backend/app/api/routes/ validation code.",
          },
        },
        {
          type: "table",
          table: {
            headers: ["Field", "Validation Rule", "Error on Failure"],
            rows: [
              ["notional_amount", "Must be a positive decimal number (> 0)", "INVALID_NOTIONAL: notional_amount must be > 0"],
              ["settlement_date", "Must be an ISO date in the future (> today UTC)", "INVALID_DATE: settlement_date must be a future date"],
              ["currency_pair", "Must be a 6-character code in the supported pair list", "UNSUPPORTED_PAIR: currency_pair not in supported list"],
              ["exposure_type", "Must be exactly 'payable' or 'receivable'", "INVALID_EXPOSURE_TYPE: must be payable or receivable"],
              ["entity_name", "Non-empty string, max 255 characters", "MISSING_ENTITY: entity_name is required"],
            ],
          },
        },
        {
          type: "text",
          body: "Validation is applied row-by-row at import time. Rows that fail any required-field validation are excluded from the import and listed in the validation error report. The import proceeds for all valid rows if at least one valid row exists; alternatively, the user can reject the entire batch and correct all errors before re-importing.",
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "Duplicate detection: if a position with the same entity_name, currency_pair, notional_amount, and settlement_date already exists in NEW or POLICY_ASSIGNED status, the import row will be flagged as a potential duplicate for manual review.",
          },
        },
      ],
    },

    // ─── L4: Import Audit Trail ────────────────────────────────────────────────
    {
      id: "data-ingestion-audit",
      heading: "Import Audit Trail",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/audit_event.py", symbol: "AuditEvent" },
      ],
      blocks: [
        {
          type: "text",
          body: "Every import — whether CSV, manual, or ERP connector — produces an audit event in the WORM audit_events table. The event records the complete context of the import operation, chained into the tenant's SHA-256 hash chain.",
        },
        {
          type: "table",
          table: {
            headers: ["Audit Field", "Value at Import"],
            rows: [
              ["event_type", "POSITION_IMPORT_BATCH"],
              ["actor_id", "UUID of the user who triggered the import"],
              ["company_id", "Tenant company UUID"],
              ["payload.import_batch_id", "UUID generated for this batch — links all positions from this import"],
              ["payload.ingestion_method", "csv_upload | manual | erp_sync"],
              ["payload.position_count", "Number of positions successfully written"],
              ["payload.rejected_count", "Number of rows that failed validation and were excluded"],
              ["payload.status", "completed | partial | failed"],
              ["event_hash", "SHA-256(canonical_json(event) + previous_hash)"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "The import_batch_id is stable for the life of the audit record. Auditors can trace any position back to its source batch, the user who imported it, and the exact timestamp. This provides full data lineage from source to ledger.",
          },
        },
      ],
    },

    // ─── L5: Data Governance ──────────────────────────────────────────────────
    {
      id: "data-ingestion-governance",
      heading: "Data Governance",
      level: "L5",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/position.py", symbol: "Position" },
        { file: "backend/app/models/audit_event.py", symbol: "AuditEvent" },
      ],
      blocks: [
        {
          type: "text",
          body: "ORDR Terminal enforces strict data governance rules on position records to ensure complete lineage from initial ingestion through to the final ledger entry.",
        },
        {
          type: "table",
          table: {
            headers: ["Governance Rule", "Implementation"],
            rows: [
              ["Positions are never deleted", "No DELETE operation on the positions table. Unwanted positions are transitioned to REJECTED."],
              ["Position ID is immutable", "The position UUID is assigned at creation and never changes. It is the stable identifier across all downstream records."],
              ["Lifecycle transitions are audited", "Every status change (NEW → POLICY_ASSIGNED, etc.) creates an audit event."],
              ["Data lineage is complete", "import_batch_id → position_id → policy_instance_id → calculation_run_id → ledger_entry_id"],
              ["No silent data modification", "Field updates to positions (e.g. correcting a notional amount) require explicit edit actions, each producing a separate audit event."],
            ],
          },
        },
        {
          type: "text",
          body: "The complete data lineage chain means an auditor can start from any ledger entry and trace back through the calculation run, the policy applied, the position, and the original import batch — including who performed each action and when.",
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "Under EMIR reporting requirements, firms must maintain records sufficient to demonstrate the economic rationale for each hedge. ORDR Terminal's data lineage from position import through to ledger commit provides this documentation chain.",
          },
        },
      ],
    },
  ],
};
