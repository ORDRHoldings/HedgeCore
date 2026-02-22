"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import EmptyState from "../../components/ui/EmptyState";

// ── Hydration-safe timestamp hook ─────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  pass:     "var(--status-pass)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
type EventType = "PROPOSAL" | "APPROVAL" | "EXECUTION" | "POLICY" | "IMPORT" | "SYSTEM";
type TabKey = "all" | "proposals" | "approvals" | "executions" | "policy" | "imports";

interface AuditEvent {
  id: string;
  timestamp: string;
  type: EventType;
  actor: string;
  role: string;
  description: string;
  hash: string;
  fullHash: string;
  prevHash: string;
  relatedIds: Record<string, string>;
  ip: string;
  userAgent: string;
  payload: Record<string, unknown>;
  failed?: boolean;
}

// ── Color map for event types ─────────────────────────────────────────────────
const TYPE_COLORS: Record<EventType, string> = {
  PROPOSAL:  S.cyan,
  APPROVAL:  S.pass,
  EXECUTION: S.amber,
  POLICY:    "#a78bfa",
  IMPORT:    S.tertiary,
  SYSTEM:    S.tertiary,
};

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS: { key: TabKey; label: string }[] = [
  { key: "all",        label: "All Events" },
  { key: "proposals",  label: "Proposals" },
  { key: "approvals",  label: "Approvals" },
  { key: "executions", label: "Executions" },
  { key: "policy",     label: "Policy Changes" },
  { key: "imports",    label: "Data Imports" },
];

const TAB_TYPE_MAP: Record<TabKey, EventType | null> = {
  all:        null,
  proposals:  "PROPOSAL",
  approvals:  "APPROVAL",
  executions: "EXECUTION",
  policy:     "POLICY",
  imports:    "IMPORT",
};

// ── Demo events ───────────────────────────────────────────────────────────────
const DEMO_EVENTS: AuditEvent[] = [
  {
    id: "EVT-0156",
    timestamp: "2026-02-20 16:45",
    type: "EXECUTION",
    actor: "Maria Torres",
    role: "CFO",
    description: "Ledger entry LDG-2026-0047 settled \u2014 $3.2M USD/MXN Forward 6M",
    hash: "0x7a3f...e2c1",
    fullHash: "0x7a3f8b12d4e6c9a0f1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2c1",
    prevHash: "0x4b2d1e3f8a9c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6f8a3",
    relatedIds: { ledger_id: "LDG-2026-0047", staging_id: "STG-0089", proposal_id: "PRP-0089" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Terminal v2.1.0 / Chrome 12x.x.x (masked)",
    payload: {
      event_type: "EXECUTION",
      ledger_id: "LDG-2026-0047",
      instrument: "USD/MXN Forward 6M",
      notional_usd: 3200000,
      settlement_date: "2026-08-20",
      counterparty: "Banamex",
      status: "SETTLED",
    },
  },
  {
    id: "EVT-0155",
    timestamp: "2026-02-20 16:30",
    type: "APPROVAL",
    actor: "Maria Torres",
    role: "CFO",
    description: "Staging artifact STG-0089 authorized for execution",
    hash: "0x4b2d...f8a3",
    fullHash: "0x4b2d1e3f8a9c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6f8a3",
    prevHash: "0x9e1c4a2b8d6f0e3c7a5b9d1f3e5a7c9b1d3f5a7c9e1b3d5f7a9c1e3b5d7b7d4",
    relatedIds: { staging_id: "STG-0089", proposal_id: "PRP-0089" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Terminal v2.1.0 / Chrome 12x.x.x (masked)",
    payload: {
      event_type: "APPROVAL",
      staging_id: "STG-0089",
      approver: "Maria Torres",
      approval_level: 2,
      required_approvals: 2,
      status: "AUTHORIZED",
    },
  },
  {
    id: "EVT-0154",
    timestamp: "2026-02-20 14:15",
    type: "PROPOSAL",
    actor: "Carlos Reyes",
    role: "Head of Risk",
    description: "Proposal PRP-0089 submitted \u2014 5 instruments, $8.4M total notional",
    hash: "0x9e1c...b7d4",
    fullHash: "0x9e1c4a2b8d6f0e3c7a5b9d1f3e5a7c9b1d3f5a7c9e1b3d5f7a9c1e3b5d7b7d4",
    prevHash: "0x2f8a3c5e9b1d7f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8c5e9",
    relatedIds: { proposal_id: "PRP-0089" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Terminal v2.1.0 / Chrome 12x.x.x (masked)",
    payload: {
      event_type: "PROPOSAL",
      proposal_id: "PRP-0089",
      instrument_count: 5,
      total_notional_usd: 8400000,
      currencies: ["USD/MXN", "EUR/MXN"],
      policy_id: "BLNC",
    },
  },
  {
    id: "EVT-0153",
    timestamp: "2026-02-19 11:20",
    type: "EXECUTION",
    actor: "Carlos Reyes",
    role: "Head of Risk",
    description: "Ledger entry LDG-2026-0046 executed \u2014 $1.8M EUR/MXN Collar 3M",
    hash: "0x2f8a...c5e9",
    fullHash: "0x2f8a3c5e9b1d7f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8c5e9",
    prevHash: "0x6d4e2a1b8c3f7d5e9a0b4c6d8f2a4e6b0c2d4f6a8e0b2c4d6f8a0e2b4a1b2",
    relatedIds: { ledger_id: "LDG-2026-0046", staging_id: "STG-0087", proposal_id: "PRP-0087" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Terminal v2.1.0 / Chrome 12x.x.x (masked)",
    payload: {
      event_type: "EXECUTION",
      ledger_id: "LDG-2026-0046",
      instrument: "EUR/MXN Collar 3M",
      notional_usd: 1800000,
      settlement_date: "2026-05-19",
      counterparty: "BBVA Mexico",
      status: "EXECUTED",
    },
  },
  {
    id: "EVT-0152",
    timestamp: "2026-02-18 09:15",
    type: "APPROVAL",
    actor: "Maria Torres",
    role: "CFO",
    description: "Staging artifact STG-0087 authorized \u2014 dual approval complete",
    hash: "0x6d4e...a1b2",
    fullHash: "0x6d4e2a1b8c3f7d5e9a0b4c6d8f2a4e6b0c2d4f6a8e0b2c4d6f8a0e2b4a1b2",
    prevHash: "0x8c3f5d7e6a2b4c9f1e3a5b7d9c1e3f5a7b9d1f3e5c7a9b1d3f5e7a9c1d7e6",
    relatedIds: { staging_id: "STG-0087", proposal_id: "PRP-0087" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Terminal v2.1.0 / Chrome 12x.x.x (masked)",
    payload: {
      event_type: "APPROVAL",
      staging_id: "STG-0087",
      approver: "Maria Torres",
      approval_level: 2,
      required_approvals: 2,
      status: "AUTHORIZED",
      dual_approval: true,
    },
  },
  {
    id: "EVT-0151",
    timestamp: "2026-02-17 14:00",
    type: "POLICY",
    actor: "Admin System",
    role: "System",
    description: "Policy BLNC (Balanced Corporate) activated \u2014 replaced SHIELD",
    hash: "0x8c3f...d7e6",
    fullHash: "0x8c3f5d7e6a2b4c9f1e3a5b7d9c1e3f5a7b9d1f3e5c7a9b1d3f5e7a9c1d7e6",
    prevHash: "0x1a5b3e3f8c7d9a2b4e6f0c8d2a4b6e8f0c2a4d6b8e0f2a4c6d8b0e2f4e3f8",
    relatedIds: { policy_id: "BLNC", replaced_policy: "SHIELD" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Platform / Automated Policy Engine",
    payload: {
      event_type: "POLICY_CHANGE",
      policy_id: "BLNC",
      policy_name: "Balanced Corporate",
      replaced_policy: "SHIELD",
      hedge_ratio_target: 0.75,
      activation_method: "manual",
    },
  },
  {
    id: "EVT-0150",
    timestamp: "2026-02-16 10:30",
    type: "IMPORT",
    actor: "Auto-Scheduler",
    role: "System",
    description: "CSV import completed \u2014 47 positions from accounting_export_feb.csv",
    hash: "0x1a5b...e3f8",
    fullHash: "0x1a5b3e3f8c7d9a2b4e6f0c8d2a4b6e8f0c2a4d6b8e0f2a4c6d8b0e2f4e3f8",
    prevHash: "0x5e7d1b9c4a3f8d2e6c0a4b8d2f6e0a4c8b2d6f0e4a8c2b6d0f4e8a2c6b9c4",
    relatedIds: { import_id: "IMP-0032", source_file: "accounting_export_feb.csv" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Platform / Scheduled Import Service",
    payload: {
      event_type: "DATA_IMPORT",
      import_id: "IMP-0032",
      source: "CSV",
      filename: "accounting_export_feb.csv",
      rows_imported: 47,
      rows_skipped: 0,
      duration_ms: 1240,
    },
  },
  {
    id: "EVT-0149",
    timestamp: "2026-02-15 14:30",
    type: "EXECUTION",
    actor: "Carlos Reyes",
    role: "Head of Risk",
    description: "Ledger entry LDG-2026-0044 settled \u2014 $2.1M USD/MXN NDF 3M",
    hash: "0x5e7d...b9c4",
    fullHash: "0x5e7d1b9c4a3f8d2e6c0a4b8d2f6e0a4c8b2d6f0e4a8c2b6d0f4e8a2c6b9c4",
    prevHash: "0x3c9a2f2d1b4e8c6a0d4f8b2e6a0c4d8f2b6e0a4c8d2f6b0e4a8c2d6f0f2d1",
    relatedIds: { ledger_id: "LDG-2026-0044", staging_id: "STG-0085", proposal_id: "PRP-0085" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Terminal v2.1.0 / Chrome 12x.x.x (masked)",
    payload: {
      event_type: "EXECUTION",
      ledger_id: "LDG-2026-0044",
      instrument: "USD/MXN NDF 3M",
      notional_usd: 2100000,
      settlement_date: "2026-05-15",
      counterparty: "Santander MX",
      status: "SETTLED",
    },
  },
  {
    id: "EVT-0148",
    timestamp: "2026-02-14 10:00",
    type: "EXECUTION",
    actor: "Auto-System",
    role: "System",
    description: "Ledger entry LDG-2026-0043 FAILED \u2014 counterparty credit check failed",
    hash: "0x3c9a...f2d1",
    fullHash: "0x3c9a2f2d1b4e8c6a0d4f8b2e6a0c4d8f2b6e0a4c8d2f6b0e4a8c2d6f0f2d1",
    prevHash: "0xab12cd34ef56ab78cd90ef12ab34cd56ef78ab90cd12ef34ab56cd78ef907890",
    relatedIds: { ledger_id: "LDG-2026-0043", staging_id: "STG-0084" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Platform / Execution Engine",
    payload: {
      event_type: "EXECUTION",
      ledger_id: "LDG-2026-0043",
      instrument: "USD/MXN Forward 6M",
      notional_usd: 1500000,
      status: "FAILED",
      failure_reason: "Counterparty credit check failed",
      counterparty: "Interacciones MX",
    },
    failed: true,
  },
  {
    id: "EVT-0147",
    timestamp: "2026-02-13 16:00",
    type: "SYSTEM",
    actor: "ORDR Platform",
    role: "System",
    description: "Integrity verification completed \u2014 145 events, all hashes valid",
    hash: "0xab12...7890",
    fullHash: "0xab12cd34ef56ab78cd90ef12ab34cd56ef78ab90cd12ef34ab56cd78ef907890",
    prevHash: "0x4d6f2c1a3b8e9d4f7a0c3b6e9d2f5a8c1b4e7d0f3a6c9b2e5d8a1f4c7c1a3",
    relatedIds: { verification_id: "VRF-0022" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Platform / Integrity Verification Service",
    payload: {
      event_type: "SYSTEM_VERIFICATION",
      verification_id: "VRF-0022",
      events_verified: 145,
      hashes_valid: 145,
      hashes_invalid: 0,
      chain_intact: true,
      duration_ms: 842,
    },
  },
  {
    id: "EVT-0146",
    timestamp: "2026-02-12 09:00",
    type: "IMPORT",
    actor: "Juan Martinez",
    role: "Analyst",
    description: "Database pull completed \u2014 23 new positions from PostgreSQL treasury_db",
    hash: "0x4d6f...c1a3",
    fullHash: "0x4d6f2c1a3b8e9d4f7a0c3b6e9d2f5a8c1b4e7d0f3a6c9b2e5d8a1f4c7c1a3",
    prevHash: "0x7b2e4d5f8a1c3b6e9f2a5c8d1b4e7a0f3c6b9d2e5a8f1c4b7e0d3a6c9d5f8",
    relatedIds: { import_id: "IMP-0031", database: "treasury_db" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Terminal v2.1.0 / Chrome 12x.x.x (masked)",
    payload: {
      event_type: "DATA_IMPORT",
      import_id: "IMP-0031",
      source: "PostgreSQL",
      database: "treasury_db",
      table: "fx_trade_positions",
      rows_imported: 23,
      rows_skipped: 2,
      duration_ms: 3840,
    },
  },
  {
    id: "EVT-0145",
    timestamp: "2026-02-10 11:00",
    type: "POLICY",
    actor: "Carlos Reyes",
    role: "Head of Risk",
    description: "Custom policy SHIELD-MX created via AI Wizard \u2014 hedge ratio 90%",
    hash: "0x7b2e...d5f8",
    fullHash: "0x7b2e4d5f8a1c3b6e9f2a5c8d1b4e7a0f3c6b9d2e5a8f1c4b7e0d3a6c9d5f8",
    prevHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    relatedIds: { policy_id: "SHIELD-MX", wizard_session: "WIZ-0014" },
    ip: "192.168.xxx.xxx",
    userAgent: "ORDR Terminal v2.1.0 / Chrome 12x.x.x (masked)",
    payload: {
      event_type: "POLICY_CHANGE",
      policy_id: "SHIELD-MX",
      policy_name: "SHIELD-MX Custom",
      creation_method: "AI Wizard",
      hedge_ratio_target: 0.9,
      instruments_allowed: ["Forward", "NDF", "Collar", "Option"],
      max_tenor_months: 12,
    },
  },
];

// ── Actor dropdown options ────────────────────────────────────────────────────
const ACTOR_OPTIONS = [
  "All Actors",
  "Maria Torres",
  "Carlos Reyes",
  "Juan Martinez",
  "Admin System",
  "Auto-Scheduler",
  "Auto-System",
  "ORDR Platform",
];

// ── Badge helper ──────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: S.fontMono,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      color,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding: "1px 5px",
      borderRadius: 2,
    }}>
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TopBar
// ═══════════════════════════════════════════════════════════════════════════════
function TopBar({ renderTs, onBack }: { renderTs: string; onBack: () => void }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 12, height: 44,
      padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      flexShrink: 0,
    }}>
      <button onClick={onBack} style={{
        fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
        background: "transparent", border: `1px solid ${S.rim}`,
        padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
      }}>{"\u2190"} Home</button>
      <span style={{ color: S.rim, userSelect: "none" }}>|</span>
      <span style={{
        fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700,
        letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary,
      }}>
        Audit Trail
      </span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em",
        color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}`,
      }}>GOVERNANCE {"\u00B7"} IMMUTABLE</span>
      <div style={{ flex: 1 }} />
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em",
      }}>
        AS OF {renderTs}
      </span>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Footer
// ═══════════════════════════════════════════════════════════════════════════════
function Footer({ renderTs }: { renderTs: string }) {
  return (
    <footer style={{
      height: 32, display: "flex", alignItems: "center", justifyContent: "center",
      borderTop: `1px solid ${S.rim}`, background: S.bgPanel, flexShrink: 0,
    }}>
      <span suppressHydrationWarning style={{
        fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
        letterSpacing: "0.06em",
      }}>
        {renderTs} {"\u2014"} ORDR {"\u00B7"} Audit Trail
      </span>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════════════════════
function KpiCard({ label, value, badge, badgeColor }: {
  label: string;
  value: string;
  badge: string;
  badgeColor: string;
}) {
  return (
    <div style={{
      flex: 1,
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 500,
          color: S.tertiary, letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {label}
        </span>
        <Badge label={badge} color={badgeColor} />
      </div>
      <span style={{
        fontFamily: S.fontMono, fontSize: "1.375rem", fontWeight: 700,
        color: S.primary, lineHeight: 1, letterSpacing: "-0.01em",
      }}>
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Row
// ═══════════════════════════════════════════════════════════════════════════════
function EventRow({ event, expanded, onToggle }: {
  event: AuditEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const typeColor = TYPE_COLORS[event.type];

  return (
    <div style={{
      borderBottom: `1px solid ${S.soft}`,
      background: expanded ? S.bgSub : "transparent",
      transition: "background 0.15s",
    }}>
      {/* Main row */}
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "140px 90px 170px 1fr 100px",
          alignItems: "center",
          padding: "10px 16px",
          cursor: "pointer",
          gap: 12,
        }}
        onMouseEnter={(e) => {
          if (!expanded) (e.currentTarget as HTMLDivElement).style.background = S.bgSub;
        }}
        onMouseLeave={(e) => {
          if (!expanded) (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        {/* Timestamp */}
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
          letterSpacing: "0.02em", whiteSpace: "nowrap",
        }}>
          {event.timestamp}
        </span>

        {/* Type badge */}
        <Badge label={event.type} color={typeColor} />

        {/* Actor */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{
            fontFamily: S.fontUI, fontSize: "0.75rem", fontWeight: 500,
            color: S.primary, whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {event.actor}
          </span>
          <Badge label={event.role} color={S.tertiary} />
        </div>

        {/* Description */}
        <span style={{
          fontFamily: S.fontUI, fontSize: "0.75rem",
          color: event.failed ? S.fail : S.secondary,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          fontWeight: event.failed ? 600 : 400,
        }}>
          {event.description}
        </span>

        {/* Hash */}
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          letterSpacing: "0.03em", textAlign: "right",
        }}>
          {event.hash}
        </span>
      </div>

      {/* Expandable detail panel */}
      {expanded && (
        <div style={{
          padding: "0 16px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          {/* Metadata grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            padding: "12px 14px",
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
          }}>
            {/* Full hash */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
                color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>Full Hash</span>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.cyan,
                wordBreak: "break-all",
              }}>{event.fullHash}</span>
            </div>

            {/* Previous hash */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
                color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>Previous Hash</span>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
                wordBreak: "break-all",
              }}>{event.prevHash}</span>
            </div>

            {/* Related IDs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
                color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>Related Entity IDs</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {Object.entries(event.relatedIds).map(([key, val]) => (
                  <span key={key} style={{
                    fontFamily: S.fontMono, fontSize: "0.625rem", color: S.secondary,
                    background: S.bgSub, border: `1px solid ${S.soft}`,
                    padding: "1px 5px", borderRadius: 2,
                  }}>
                    {key}: {val}
                  </span>
                ))}
              </div>
            </div>

            {/* IP + User Agent */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
                color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>Origin</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>
                IP: {event.ip}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary }}>
                {event.userAgent}
              </span>
            </div>
          </div>

          {/* Raw payload */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{
              fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
              color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
            }}>Raw Event Payload</span>
            <pre style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              padding: "12px 14px", margin: 0,
              overflow: "auto", whiteSpace: "pre-wrap",
              lineHeight: 1.55, maxHeight: 220,
            }}>
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function AuditTrailPage() {
  const renderTs = useRenderTs();
  const { isAuthenticated, token, user, isDemoMode } = useAuth();
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  // State
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState("All Actors");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  // Filter events
  const filteredEvents = DEMO_EVENTS.filter((evt) => {
    const typeFilter = TAB_TYPE_MAP[activeTab];
    if (typeFilter && evt.type !== typeFilter) return false;
    if (actorFilter !== "All Actors" && evt.actor !== actorFilter) return false;
    if (dateFrom) {
      const evtDate = evt.timestamp.slice(0, 10);
      if (evtDate < dateFrom) return false;
    }
    if (dateTo) {
      const evtDate = evt.timestamp.slice(0, 10);
      if (evtDate > dateTo) return false;
    }
    return true;
  });

  // Toggle expand
  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Verify chain integrity
  const handleVerify = useCallback(() => {
    setVerifying(true);
    setVerified(false);
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
    }, 1600);
  }, []);

  if (!isAuthenticated) return null;

  // ── Non-demo empty state ──────────────────────────────────────────────────
  if (!DEMO_MODE && !isDemoMode) {
    return (
      <div style={{
        background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI,
        display: "flex", flexDirection: "column",
      }}>
        <TopBar renderTs={renderTs} onBack={() => router.push("/")} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <EmptyState
            type="empty"
            title="No Audit Events"
            message="No audit events recorded. Pipeline actions will appear here."
          />
        </div>
        <Footer renderTs={renderTs} />
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI,
      display: "flex", flexDirection: "column",
    }}>
      {/* TopBar (44px) */}
      <TopBar renderTs={renderTs} onBack={() => router.push("/")} />

      {/* Tab bar (36px) */}
      <div style={{
        height: 36, display: "flex", alignItems: "stretch",
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        padding: "0 20px", gap: 0, flexShrink: 0,
      }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpandedId(null); }}
              style={{
                fontFamily: S.fontUI, fontSize: "0.6875rem",
                fontWeight: active ? 600 : 400,
                padding: "0 16px", border: "none",
                borderBottom: active ? `2px solid ${S.cyan}` : "2px solid transparent",
                color: active ? S.cyan : S.tertiary,
                background: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center",
                transition: "color 0.15s, border-color 0.15s",
                letterSpacing: "0.04em",
              }}
            >
              {tab.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          display: "flex", alignItems: "center", letterSpacing: "0.06em",
        }}>
          {filteredEvents.length} EVENTS
        </span>
      </div>

      {/* Content area */}
      <div style={{
        flex: 1, maxWidth: 1440, width: "100%", margin: "0 auto",
        padding: "20px 24px 16px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>

        {/* KPI Summary Row */}
        <div style={{ display: "flex", gap: 12 }}>
          <KpiCard label="Total Events"    value="156"  badge="ALL TIME" badgeColor={S.tertiary} />
          <KpiCard label="This Week"       value="12"   badge="7 DAYS"   badgeColor={S.tertiary} />
          <KpiCard label="Pending Reviews" value="3"    badge="ACTION"   badgeColor={S.amber} />
          <KpiCard label="Integrity Score" value="100%" badge="VERIFIED" badgeColor={S.pass} />
        </div>

        {/* Filter Controls */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          background: S.bgPanel, border: `1px solid ${S.rim}`,
          flexWrap: "wrap",
        }}>
          {/* Date range */}
          <span style={{
            fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
            color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
          }}>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              padding: "4px 8px", outline: "none",
            }}
          />
          <span style={{
            fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
            color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
          }}>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              padding: "4px 8px", outline: "none",
            }}
          />

          {/* Actor filter */}
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              padding: "4px 8px", outline: "none", cursor: "pointer",
              appearance: "none" as const,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.2'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
              paddingRight: 24,
            }}
          >
            {ACTOR_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <div style={{ flex: 1 }} />

          {/* Verify Chain Integrity */}
          <button
            onClick={handleVerify}
            disabled={verifying}
            style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 700,
              letterSpacing: "0.06em",
              color: verified ? S.pass : S.cyan,
              background: verified
                ? `color-mix(in srgb, ${S.pass} 10%, transparent)`
                : `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
              border: `1px solid ${verified ? S.pass : S.cyan}`,
              padding: "5px 14px", cursor: verifying ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.25s",
            }}
          >
            {verifying && (
              <span style={{
                display: "inline-block", width: 10, height: 10,
                border: `2px solid ${S.cyan}`, borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "audit-spin 0.6s linear infinite",
              }} />
            )}
            {verified ? "\u2713 All 156 events verified" : verifying ? "Verifying\u2026" : "Verify Chain Integrity"}
          </button>

          {/* Export */}
          <button style={{
            fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 600,
            letterSpacing: "0.06em",
            color: S.secondary,
            background: "transparent",
            border: `1px solid ${S.rim}`,
            padding: "5px 14px", cursor: "pointer",
          }}>
            Export Audit Log
          </button>
        </div>

        {/* Timeline header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "140px 90px 170px 1fr 100px",
          padding: "6px 16px",
          gap: 12,
          borderBottom: `1px solid ${S.rim}`,
        }}>
          {["TIMESTAMP", "TYPE", "ACTOR", "DESCRIPTION", "HASH"].map((h) => (
            <span key={h} style={{
              fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 700,
              letterSpacing: "0.08em", color: S.tertiary,
              textAlign: h === "HASH" ? "right" : "left",
            }}>
              {h}
            </span>
          ))}
        </div>

        {/* Event list */}
        <div style={{
          background: S.bgPanel, border: `1px solid ${S.rim}`,
          flex: 1, overflow: "auto",
        }}>
          {filteredEvents.length === 0 ? (
            <div style={{
              padding: "48px 24px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.tertiary,
              }}>
                No events match current filters.
              </span>
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <EventRow
                key={evt.id}
                event={evt}
                expanded={expandedId === evt.id}
                onToggle={() => handleToggle(evt.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer (32px) */}
      <Footer renderTs={renderTs} />

      {/* Spinner keyframes */}
      <style>{`
        @keyframes audit-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
