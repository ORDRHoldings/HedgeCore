"use client";

import { useState } from "react";

const S = {
  bg:            "var(--bg-deep)",
  bgSub:         "var(--bg-sub)",
  bgPanel:       "var(--bg-panel)",
  border:        "var(--border-rim)",
  borderSoft:    "var(--border-soft)",
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary:  "var(--text-tertiary)",
  cyan:          "var(--accent-cyan)",
  amber:         "var(--accent-amber)",
  green:         "var(--status-pass)",
  red:           "var(--accent-red)",
  fontMono:      "'IBM Plex Mono', monospace",
  fontUI:        "'IBM Plex Sans', sans-serif",
};

type HelpSection = "manual" | "upload" | "connection" | "lifecycle";

const SECTION_TABS: { key: HelpSection; label: string }[] = [
  { key: "manual",     label: "Manual Entry"   },
  { key: "upload",     label: "Upload CSV"     },
  { key: "connection", label: "Connection Hub" },
  { key: "lifecycle",  label: "Lifecycle"      },
];

interface FieldRef {
  field: string;
  description: string;
  validValues: string;
  regulatoryNote: string;
}

const MANUAL_FIELDS: FieldRef[] = [
  {
    field: "RECORD ID",
    description: "Unique position identifier for this exposure record.",
    validValues: "Alphanumeric, max 64 characters. No spaces.",
    regulatoryNote: "Immutable after creation per WORM audit requirements (SEC 17a-4). Cannot be changed once the position is saved.",
  },
  {
    field: "ENTITY",
    description: "Legal entity or business unit originating the exposure.",
    validValues: "Free text. Must match counterparty master data. Required.",
    regulatoryNote: "Used for entity-level hedge attribution and reporting. Required for regulatory position reporting.",
  },
  {
    field: "FLOW TYPE",
    description: "Direction of the cash flow: outflow (AP) or inflow (AR).",
    validValues: "AP (Accounts Payable - outflow) or AR (Accounts Receivable - inflow).",
    regulatoryNote: "Determines hedge direction. AP positions require buy-side FX hedges; AR positions require sell-side hedges.",
  },
  {
    field: "CURRENCY",
    description: "ISO 4217 currency code of the exposure.",
    validValues: "Standard 3-letter ISO 4217 codes, e.g., EUR, GBP, JPY, MXN.",
    regulatoryNote: "Must be listed on CME or ICE futures exchange for automated hedging via IBKR. Non-listed currencies can be entered but will not be eligible for execution.",
  },
  {
    field: "AMOUNT",
    description: "Absolute notional value of the exposure in the selected currency.",
    validValues: "Positive integer or decimal. No sign (always positive). Must be greater than 0.",
    regulatoryNote: "Enter the gross notional. Do not net AP and AR positions - enter each as a separate record. Displayed with thousand separators.",
  },
  {
    field: "VALUE DATE",
    description: "Settlement date when the cash flow is expected to occur.",
    validValues: "Future dates only. ISO 8601 format: YYYY-MM-DD.",
    regulatoryNote: "Must be a future business date. Past dates are not permitted. Used to determine hedge tenor and forward points calculation.",
  },
  {
    field: "STATUS",
    description: "Contractual certainty level of the exposure.",
    validValues: "CONFIRMED (contractually obligated, firm) or FORECAST (projected/estimated).",
    regulatoryNote: "Only CONFIRMED positions are eligible for automated IBKR execution. FORECAST positions can be hedged manually but are excluded from lifecycle automation.",
  },
  {
    field: "DESCRIPTION",
    description: "Optional free-text annotation for this position.",
    validValues: "Any text, max 500 characters. Optional.",
    regulatoryNote: "This note appears in the WORM ledger export and audit trail. Use it to reference source documents, invoice numbers, or approval references.",
  },
];

const UPLOAD_FIELDS: FieldRef[] = [
  {
    field: "Required Columns",
    description: "CSV must contain these column headers (case-insensitive).",
    validValues: "record_id, entity, type, currency, amount, value_date, status",
    regulatoryNote: "Column order is flexible. Extra columns are ignored. Missing required columns will cause the entire import to be rejected.",
  },
  {
    field: "File Format",
    description: "Supported file types for bulk import.",
    validValues: ".csv (UTF-8), .xlsx (Excel 2007+)",
    regulatoryNote: "Files are validated server-side before any rows are committed to the database. Partial imports are rolled back on fatal schema errors.",
  },
  {
    field: "Row Limit",
    description: "Maximum number of rows per import batch.",
    validValues: "Up to 10,000 rows per upload.",
    regulatoryNote: "Each successfully imported row generates a CREATE event in the WORM audit trail. Import batch ID is stamped on all rows for traceability.",
  },
  {
    field: "Error Handling",
    description: "How invalid rows are treated during import.",
    validValues: "Invalid rows are skipped. Valid rows are committed. Error report shows row number and reason.",
    regulatoryNote: "Skipped rows are logged in the import history. The import summary banner shows created count and error count.",
  },
];

const CONNECTION_FIELDS: FieldRef[] = [
  {
    field: "ERP Connector",
    description: "Automated feed from SAP, Oracle, or NetSuite ERP systems.",
    validValues: "Configured via API key and endpoint URL in the connector settings.",
    regulatoryNote: "ERP-sourced positions carry source_system metadata in the audit trail for full data lineage.",
  },
  {
    field: "SFTP / FTP",
    description: "Scheduled file drop from treasury or finance systems.",
    validValues: "CSV files dropped to the configured SFTP path. Polling interval: configurable (default 1 hour).",
    regulatoryNote: "Files are archived after processing. Reprocessing a file already ingested is blocked to prevent duplicate positions.",
  },
  {
    field: "REST API",
    description: "Direct API integration for real-time position streaming.",
    validValues: "POST /api/positions with JSON payload matching the position schema.",
    regulatoryNote: "Requires API key authentication. Rate limited to 100 positions per second. All API-sourced positions are audit-logged with source_system = api.",
  },
  {
    field: "Webhook",
    description: "Push-based inbound notification from external systems.",
    validValues: "HTTPS POST to your dedicated webhook endpoint. Payload must match position schema.",
    regulatoryNote: "Webhook deliveries are idempotent by record_id. Duplicate deliveries for the same record_id are rejected with 409.",
  },
];

const LIFECYCLE_FIELDS: FieldRef[] = [
  {
    field: "FORECAST",
    description: "Projected or estimated exposure. Not yet contractually obligated.",
    validValues: "Initial status for most positions. Can be promoted to CONFIRMED.",
    regulatoryNote: "FORECAST positions are excluded from automated IBKR execution. They contribute to exposure reporting and scenario analysis.",
  },
  {
    field: "CONFIRMED",
    description: "Contractually obligated exposure. Invoice received or PO signed.",
    validValues: "Can only transition from FORECAST or be created directly as CONFIRMED.",
    regulatoryNote: "CONFIRMED positions are eligible for automated hedging via IBKR. Status change generates an UPDATE event in the WORM audit trail.",
  },
  {
    field: "EXECUTED",
    description: "Hedge has been submitted to IBKR for this position.",
    validValues: "Set automatically when IBKR execution is confirmed. Cannot be set manually.",
    regulatoryNote: "EXECUTED positions cannot be modified. The execution_ref field is populated with the IBKR order reference. An EXECUTE audit event is created.",
  },
  {
    field: "IBKR Reference",
    description: "Interactive Brokers order or confirmation reference number.",
    validValues: "Alphanumeric string provided by the trader at execution time.",
    regulatoryNote: "Stored permanently in execution_ref field. Appears in the WORM audit trail execution event. Used for trade reconciliation.",
  },
  {
    field: "CME Eligibility",
    description: "Whether the position currency is listed on CME or ICE for futures hedging.",
    validValues: "Eligible currencies include: EUR, GBP, JPY, CAD, AUD, CHF, MXN, and others per FUTURES_CURRENCY_LIST.",
    regulatoryNote: "Non-CME currencies can be tracked in the system but are flagged as not eligible for automated hedging. Manual OTC hedge required.",
  },
];

const TIPS: Record<HelpSection, { tip: string; isError: boolean }[]> = {
  manual: [
    { tip: "VALUE DATE must be a future date. The calendar grays out past dates.", isError: false },
    { tip: "AMOUNT is entered without sign - always positive. The system determines direction from FLOW TYPE.", isError: false },
    { tip: "RECORD ID is permanent. Once saved, it cannot be changed even in edit mode.", isError: true },
    { tip: "Common error: saving with STATUS = FORECAST then trying to execute via IBKR. Change to CONFIRMED first.", isError: true },
    { tip: "DESCRIPTION is optional but strongly recommended for audit trail clarity (invoice number, PO reference).", isError: false },
  ],
  upload: [
    { tip: "UTF-8 encoding required for CSV. Files saved from Excel with Windows default encoding may fail.", isError: true },
    { tip: "The first row must be the header row. Do not include a title row above the headers.", isError: true },
    { tip: "Amount values in CSV must not include currency symbols or thousand separators. Use: 1000000, not $1,000,000.", isError: true },
    { tip: "value_date in CSV must be ISO 8601 format: YYYY-MM-DD. Excel date formats (MM/DD/YYYY) will be rejected.", isError: true },
    { tip: "Duplicate record_id values within the same CSV file are caught during validation. Only the first occurrence is kept.", isError: false },
  ],
  connection: [
    { tip: "API keys for connectors are stored encrypted. Never share your API key in the Description field.", isError: true },
    { tip: "SFTP connectors poll every hour by default. Contact your admin to adjust the polling interval.", isError: false },
    { tip: "Webhook endpoint URLs are unique per workspace. Do not reuse the same endpoint across environments.", isError: true },
    { tip: "If an ERP connector fails, positions from that feed will not appear. Check the Connection Hub status indicator.", isError: false },
    { tip: "All connector-sourced positions are marked with source_system in metadata. This appears in the audit export.", isError: false },
  ],
  lifecycle: [
    { tip: "Only CONFIRMED positions can be executed via IBKR. Attempting to execute FORECAST positions is blocked.", isError: true },
    { tip: "Once a position is EXECUTED, its AMOUNT, CURRENCY, and VALUE DATE cannot be changed.", isError: true },
    { tip: "The IBKR Reference you enter at execution time is stored permanently. Use the actual IBKR order ID.", isError: false },
    { tip: "Deleting an EXECUTED position is blocked. Contact your compliance officer for exception handling.", isError: true },
    { tip: "The WORM audit trail records every status transition. All changes are traceable to the user who made them.", isError: false },
  ],
};

function FieldTable({ fields }: { fields: FieldRef[] }) {
  return (
    <div style={{ overflowX: "auto", marginBottom: 16 }}>
      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        fontFamily: S.fontMono,
        fontSize: "0.625rem",
      }}>
        <thead>
          <tr>
            {["FIELD", "DESCRIPTION", "VALID VALUES", "REGULATORY NOTE"].map(h => (
              <th key={h} style={{
                textAlign: "left",
                padding: "5px 8px",
                background: S.bgSub,
                color: S.textTertiary,
                letterSpacing: "0.08em",
                borderBottom: `1px solid ${S.border}`,
                whiteSpace: "nowrap",
                fontWeight: 600,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((row, i) => (
            <tr key={i} style={{
              background: i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.cyan} 2%, ${S.bgPanel})`,
            }}>
              <td style={{
                padding: "6px 8px",
                color: S.cyan,
                borderBottom: `1px solid ${S.borderSoft}`,
                whiteSpace: "nowrap",
                fontWeight: 600,
                verticalAlign: "top",
              }}>{row.field}</td>
              <td style={{
                padding: "6px 8px",
                color: S.textPrimary,
                borderBottom: `1px solid ${S.borderSoft}`,
                lineHeight: 1.5,
                verticalAlign: "top",
              }}>{row.description}</td>
              <td style={{
                padding: "6px 8px",
                color: S.amber,
                borderBottom: `1px solid ${S.borderSoft}`,
                lineHeight: 1.5,
                verticalAlign: "top",
              }}>{row.validValues}</td>
              <td style={{
                padding: "6px 8px",
                color: S.textSecondary,
                borderBottom: `1px solid ${S.borderSoft}`,
                lineHeight: 1.5,
                verticalAlign: "top",
                fontSize: "0.5625rem",
              }}>{row.regulatoryNote}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TipsBlock({ tips }: { tips: { tip: string; isError: boolean }[] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontFamily: S.fontMono,
        fontSize: "0.5625rem",
        color: S.textTertiary,
        letterSpacing: "0.1em",
        marginBottom: 8,
      }}>TIPS &amp; COMMON ERRORS</div>
      {tips.map((t, i) => (
        <div key={i} style={{
          display: "flex",
          gap: 8,
          padding: "5px 8px",
          marginBottom: 4,
          background: t.isError
            ? `color-mix(in srgb, ${S.red} 6%, ${S.bgPanel})`
            : `color-mix(in srgb, ${S.green} 4%, ${S.bgPanel})`,
          border: `1px solid ${t.isError ? S.red : S.green}`,
          borderLeft: `3px solid ${t.isError ? S.red : S.green}`,
        }}>
          <span style={{
            fontFamily: S.fontMono,
            fontSize: "0.5625rem",
            color: t.isError ? S.red : S.green,
            flexShrink: 0,
            paddingTop: 1,
          }}>{t.isError ? "ERR" : "TIP"}</span>
          <span style={{
            fontFamily: S.fontUI,
            fontSize: "0.6875rem",
            color: S.textSecondary,
            lineHeight: 1.5,
          }}>{t.tip}</span>
        </div>
      ))}
    </div>
  );
}

// ─── ASCII Field Map Diagrams ────────────────────────────────────────────────

const DIAGRAM_MANUAL = `
┌─────────────────────────────────────────────────────────────┐
│  MANUAL ENTRY FORM — FIELD MAP                              │
│  (Bloomberg Ingestion Desk / /input → Manual Entry tab)     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────┐    │
│  │  RECORD ID  [req]    │  │  ENTITY          [req]   │    │
│  │  Unique key, max 64  │  │  Legal entity / BU       │    │
│  │  Immutable on save   │  │  Counterparty master     │    │
│  └──────────────────────┘  └──────────────────────────┘    │
│                                                             │
│  ┌─────────────┐  ┌───────────┐  ┌──────────────────┐      │
│  │ FLOW TYPE   │  │ CURRENCY  │  │  AMOUNT   [req]  │      │
│  │ AP  │  AR   │  │ ISO 4217  │  │  Notional ≥ 1    │      │
│  │ ↓   │  ↑   │  │ MXN/EUR…  │  │  No sign needed  │      │
│  └─────────────┘  └───────────┘  └──────────────────┘      │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────┐    │
│  │  VALUE DATE  [req]   │  │  STATUS          [opt]   │    │
│  │  Bloomberg calendar  │  │  CONFIRMED / FORECAST    │    │
│  │  Future dates only   │  │  Affects execution gate  │    │
│  │  Format: YYYY-MM-DD  │  │                          │    │
│  └──────────────────────┘  └──────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │  DESCRIPTION                          [optional]│       │
│  │  Free text note — max 512 chars                 │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
│  [ + ADD POSITION ]   or   [ UPDATE ] (edit mode)          │
│   Fires: POST /v1/positions/                               │
│   Audit: INGEST event written immediately (WORM)           │
└─────────────────────────────────────────────────────────────┘`;

const DIAGRAM_UPLOAD = `
┌─────────────────────────────────────────────────────────────┐
│  CSV / XLSX UPLOAD — FILE SCHEMA                            │
│  (Ingestion Desk → Upload CSV / Excel tab)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  REQUIRED COLUMNS (exact header names, case-insensitive):  │
│                                                             │
│  record_id   │ Unique ID per row    │ max 64 chars          │
│  entity      │ Legal entity         │ required              │
│  flow_type   │ AP or AR             │ required              │
│  currency    │ ISO 4217 code        │ e.g. MXN, EUR         │
│  amount      │ Positive number      │ no currency sign      │
│  value_date  │ YYYY-MM-DD           │ future dates only     │
│                                                             │
│  OPTIONAL COLUMNS:                                         │
│                                                             │
│  status      │ CONFIRMED or FORECAST │ default: CONFIRMED   │
│  description │ Free text note        │ max 512 chars        │
│                                                             │
│  EXAMPLE ROW:                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ record_id,entity,flow_type,currency,amount,value_date│  │
│  │ PO-001,SYNEX CORP,AP,MXN,500000,2026-06-30          │  │
│  │ INV-002,SYNEX CORP,AR,EUR,250000,2026-09-15         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  PROCESS: Drag & Drop or Browse → Validate → Import        │
│  API: POST /v1/positions/import-csv (multipart/form-data)  │
│  Audit: One INGEST event per row (WORM)                    │
│  Max rows: 10,000 per upload                               │
└─────────────────────────────────────────────────────────────┘`;

const DIAGRAM_CONNECTION = `
┌─────────────────────────────────────────────────────────────┐
│  CONNECTION HUB — FEED STATUS MAP                           │
│  (Ingestion Desk → Connection Hub tab)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Feed Card Structure:                                       │
│  ┌─────────────────────────────────────┐                   │
│  │  [ICON]  FEED NAME        [STATUS]  │                   │
│  │          Description                │                   │
│  │          [ CONFIGURE ]  [ TEST ]    │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
│  Available Feeds:                                          │
│                                                             │
│  ① REST API WEBHOOK         ● ACTIVE                       │
│    POST /v1/positions/      authenticated, live            │
│                                                             │
│  ② SQL DATABASE             ○ COMING SOON                  │
│    Oracle / Postgres / MySQL  JDBC pull                    │
│                                                             │
│  ③ ERP CONNECTOR            ○ COMING SOON                  │
│    SAP / Oracle / NetSuite    native API bridge            │
│                                                             │
│  ④ CSV FILE WATCHER         ○ COMING SOON                  │
│    SFTP / S3 / local folder   polling schedule             │
│                                                             │
│  ⑤ BLOOMBERG FEED           ○ COMING SOON                  │
│    B-PIPE / BLPAPI            real-time exposure feed      │
│                                                             │
│  ⑥ ACCOUNTING SYSTEMS       ○ COMING SOON                  │
│    QuickBooks / Xero / Sage   invoice-level import         │
│                                                             │
│  Status colours:  ● ACTIVE = cyan  ○ COMING SOON = amber   │
└─────────────────────────────────────────────────────────────┘`;

const DIAGRAM_LIFECYCLE = `
┌─────────────────────────────────────────────────────────────┐
│  POSITION LIFECYCLE — STATE MACHINE                         │
│  (Position Desk / /position-desk)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   CREATE                                                    │
│     │                                                       │
│     ▼                                                       │
│  ┌──────┐   Assign Policy   ┌─────────────────┐            │
│  │ NEW  │ ─────────────────►│ POLICY_ASSIGNED │            │
│  │amber │                   │ cyan            │            │
│  └──────┘                   └────────┬────────┘            │
│     │                                │                     │
│     │                     Mark Ready │                     │
│     │                                ▼                     │
│     │                   ┌───────────────────────┐          │
│     │                   │  READY_TO_EXECUTE     │          │
│     │                   │  bright cyan          │          │
│     │                   └────────┬──────────────┘          │
│     │                            │ Execute (IBKR)          │
│     │                            ▼                         │
│     │                        ┌────────┐                    │
│     │                        │ HEDGED │ ← terminal state   │
│     │                        │ green  │   immutable        │
│     │                        └────────┘                    │
│     │                                                       │
│     │      Reject (from any non-terminal state)            │
│     │──────────────────────────────────►┌──────────┐       │
│                                         │ REJECTED │       │
│                                         │ red      │       │
│                                         └────┬─────┘       │
│                                              │ Reopen      │
│                                              ▼             │
│                                           back to NEW      │
│                                                             │
│  Actions per status:                                       │
│  NEW           → Edit · Delete · Assign Policy · Reject    │
│  POLICY_ASSIGN → Mark Ready · Reject · View Lineage        │
│  READY         → Execute · Reject · View Lineage           │
│  HEDGED        → View Lineage · Audit Trail (read-only)    │
│  REJECTED      → Reopen · View Lineage                     │
│                                                             │
│  All transitions write a WORM audit event (append-only)    │
└─────────────────────────────────────────────────────────────┘`;

function FieldDiagram({ diagram }: { diagram: string }) {
  return (
    <div style={{
      marginBottom: 16,
      background:   `color-mix(in srgb, var(--accent-cyan) 3%, var(--bg-sub))`,
      border:       `1px solid var(--border-rim)`,
      borderRadius: 4,
      padding:      "10px 12px",
    }}>
      <div style={{
        fontFamily:    "'IBM Plex Mono', monospace",
        fontSize:      "0.5625rem",
        color:         "var(--text-tertiary)",
        letterSpacing: "0.1em",
        marginBottom:  6,
      }}>FIELD MAP — VISUAL REFERENCE</div>
      <pre style={{
        fontFamily:  "'IBM Plex Mono', monospace",
        fontSize:    "0.5rem",
        color:       "var(--text-secondary)",
        lineHeight:  1.55,
        margin:      0,
        overflowX:   "auto",
        whiteSpace:  "pre",
      }}>{diagram}</pre>
    </div>
  );
}

// ─── Section Content ──────────────────────────────────────────────────────────

function SectionContent({ section }: { section: HelpSection }) {
  const sectionLabels: Record<HelpSection, string> = {
    manual:     "MANUAL ENTRY - FIELD REFERENCE",
    upload:     "UPLOAD CSV / EXCEL - FIELD REFERENCE",
    connection: "CONNECTION HUB - CONNECTOR REFERENCE",
    lifecycle:  "POSITION LIFECYCLE - STATUS REFERENCE",
  };

  const fieldsMap: Record<HelpSection, FieldRef[]> = {
    manual:     MANUAL_FIELDS,
    upload:     UPLOAD_FIELDS,
    connection: CONNECTION_FIELDS,
    lifecycle:  LIFECYCLE_FIELDS,
  };

  const diagramMap: Record<HelpSection, string> = {
    manual:     DIAGRAM_MANUAL,
    upload:     DIAGRAM_UPLOAD,
    connection: DIAGRAM_CONNECTION,
    lifecycle:  DIAGRAM_LIFECYCLE,
  };

  return (
    <div>
      <div style={{
        fontFamily:    S.fontMono,
        fontSize:      "0.5625rem",
        color:         S.textTertiary,
        letterSpacing: "0.12em",
        marginBottom:  12,
        paddingBottom: 8,
        borderBottom:  `1px solid ${S.border}`,
      }}>
        {sectionLabels[section]}
      </div>
      <FieldDiagram diagram={diagramMap[section]} />
      <FieldTable fields={fieldsMap[section]} />
      <TipsBlock tips={TIPS[section]} />
    </div>
  );
}

export interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpPanel({ open, onClose }: HelpPanelProps) {
  const [activeSection, setActiveSection] = useState<HelpSection>("manual");

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position:   "fixed",
            inset:      0,
            background: "rgba(0,0,0,0.35)",
            zIndex:     9998,
          }}
          aria-hidden="true"
        />
      )}

      <div
        role="dialog"
        aria-label="Position Desk field reference help"
        aria-modal="true"
        style={{
          position:      "fixed",
          top:           0,
          right:         0,
          bottom:        0,
          width:         380,
          zIndex:        9999,
          background:    S.bgPanel,
          borderLeft:    `1px solid ${S.border}`,
          display:       "flex",
          flexDirection: "column",
          transform:     open ? "translateX(0)" : "translateX(100%)",
          transition:    "transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          boxShadow:     open ? "-8px 0 32px rgba(0,0,0,0.5)" : "none",
          overflowY:     "hidden",
        }}
      >
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "12px 16px",
          borderBottom:   `1px solid ${S.border}`,
          background:     S.bgSub,
          flexShrink:     0,
        }}>
          <div>
            <div style={{
              fontFamily:    S.fontMono,
              fontSize:      "0.6875rem",
              color:         S.cyan,
              letterSpacing: "0.1em",
              fontWeight:    600,
            }}>FIELD REFERENCE</div>
            <div style={{
              fontFamily: S.fontUI,
              fontSize:   "0.625rem",
              color:      S.textTertiary,
              marginTop:  2,
            }}>Bloomberg/BlackRock Institutional Grade</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help panel"
            style={{
              background:   "none",
              border:       "none",
              cursor:       "pointer",
              color:        S.textTertiary,
              fontFamily:   S.fontMono,
              fontSize:     "1.125rem",
              lineHeight:   1,
              padding:      "4px 6px",
              borderRadius: 2,
              transition:   "color 0.1s",
            }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.color = S.textPrimary; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.color = S.textTertiary; }}
          >&#215;</button>
        </div>

        <div style={{
          display:      "flex",
          borderBottom: `1px solid ${S.border}`,
          background:   S.bgSub,
          flexShrink:   0,
          overflowX:    "auto",
        }}>
          {SECTION_TABS.map(tab => {
            const active = activeSection === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSection(tab.key)}
                style={{
                  fontFamily:    S.fontMono,
                  fontSize:      "0.5625rem",
                  letterSpacing: "0.08em",
                  padding:       "7px 12px",
                  border:        "none",
                  borderBottom:  active ? `2px solid ${S.cyan}` : "2px solid transparent",
                  background:    active
                    ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})`
                    : "transparent",
                  color:         active ? S.cyan : S.textTertiary,
                  cursor:        "pointer",
                  whiteSpace:    "nowrap",
                  textTransform: "uppercase",
                  transition:    "all 0.1s",
                }}
              >{tab.label}</button>
            );
          })}
        </div>

        <div style={{
          flex:      1,
          overflowY: "auto",
          padding:   "16px",
        }}>
          <SectionContent section={activeSection} />

          <div style={{
            marginTop:  24,
            paddingTop: 12,
            borderTop:  `1px solid ${S.border}`,
            fontFamily: S.fontUI,
            fontSize:   "0.5625rem",
            color:      S.textTertiary,
            lineHeight: 1.6,
          }}>
            <div style={{
              fontFamily:    S.fontMono,
              fontSize:      "0.5rem",
              letterSpacing: "0.1em",
              marginBottom:  4,
            }}>
              REGULATORY STANDARDS
            </div>
            SEC Rule 17a-4 &bull; CFTC Rule 1.31 &bull; GDPR Art. 5(1)(f) &bull; ISO 8601 &bull; Basel III Op Risk
          </div>
        </div>
      </div>
    </>
  );
}
