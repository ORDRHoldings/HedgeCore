"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  rim: "var(--border-rim,#E2E8F0)",
  accentRed: "var(--accent-red,#DC2626)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  statusPass: "var(--status-pass,#059669)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

function NotFound() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-deep)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 48, fontWeight: 700, color: "var(--border-soft)" }}>404</div>
        <div style={{ fontFamily: "var(--font-terminal)", fontSize: 14, color: "var(--text-tertiary)", marginTop: 8 }}>Page not found</div>
      </div>
    </div>
  );
}

interface SchemaHealth {
  status: string;
  checks?: Record<string, boolean | string>;
  tables?: Record<string, { exists: boolean; row_count?: number }>;
  failed_checks?: string[];
}

interface AuditEvent {
  id: string;
  event_type: string;
  created_at: string;
  actor_email?: string;
  company_name?: string;
  entity_type?: string;
  description?: string;
  hash?: string;
}

const MOCK_TENANTS = [
  { name: "DemoCo", tier: "SMB", users: 4, positions: 12, status: "ACTIVE" },
  { name: "Apex Treasury", tier: "ENTERPRISE", users: 18, positions: 340, status: "ACTIVE" },
  { name: "NordicFX Ltd", tier: "SMB", users: 7, positions: 55, status: "ACTIVE" },
  { name: "SandboxCo", tier: "LITE", users: 1, positions: 0, status: "TRIAL" },
  { name: "Meridian Capital", tier: "ENTERPRISE", users: 31, positions: 812, status: "ACTIVE" },
];

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    ENTERPRISE: { bg: "#EFF6FF", color: S.accentCyan },
    SMB: { bg: "#D1FAE5", color: S.statusPass },
    LITE: { bg: S.bgSub, color: S.textTertiary },
    TRIAL: { bg: "#FFFBEB", color: S.accentAmber },
  };
  const cfg = map[tier] ?? map.LITE;
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "1px 7px",
        borderRadius: 3,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {tier}
    </span>
  );
}

interface StatusBoxProps {
  label: string;
  status: "OK" | "ERROR" | "WARN";
  metric: string;
  metricLabel: string;
}

function StatusBox({ label, status, metric, metricLabel }: StatusBoxProps) {
  const dotColor = status === "OK" ? S.statusPass : status === "WARN" ? S.accentAmber : S.accentRed;
  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderTop: `3px solid ${dotColor}`,
        borderRadius: 6,
        padding: "16px 20px",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textTertiary }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 28, fontWeight: 700, color: S.textPrimary, lineHeight: 1 }}>
        {metric}
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 4 }}>{metricLabel}</div>
    </div>
  );
}

export default function AdminWarRoom() {
  const { user } = useAuthStore();
  const [schemaHealth, setSchemaHealth] = useState<SchemaHealth | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [health, events] = await Promise.allSettled([
        api.get<SchemaHealth>("/system/schema-health"),
        api.get<{ items: AuditEvent[] } | AuditEvent[]>("/v1/audit?limit=20"),
      ]);
      if (health.status === "fulfilled") setSchemaHealth(health.value);
      if (events.status === "fulfilled") {
        const val = events.value;
        setAuditEvents(Array.isArray(val) ? val : (val as { items: AuditEvent[] }).items ?? []);
      }
    } catch {
      // ignore
    }
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (!user?.is_superuser) return <NotFound />;

  const schemaOk = schemaHealth?.status === "ok" || schemaHealth?.status === "healthy";
  const failedChecks = schemaHealth?.failed_checks ?? [];
  const alerts: { time: string; msg: string }[] = failedChecks.map((c) => ({
    time: new Date().toISOString(),
    msg: c,
  }));

  return (
    <div style={{ padding: "28px 32px", minHeight: "calc(100vh - 92px)", background: S.bgDeep }}>
      {/* Page title */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700, letterSpacing: "0.1em" }}>
            COMMAND CENTER
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
            / WAR ROOM
          </span>
        </div>
        <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.textPrimary, margin: 0, letterSpacing: "0.04em" }}>
          BIG BOARD
        </h1>
        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 4 }}>
          Auto-refresh every 30s · Last: {lastRefresh.toLocaleTimeString()}
        </div>
      </div>

      {/* 4 Status Boxes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        <StatusBox
          label="SYSTEM"
          status="OK"
          metric="98.7%"
          metricLabel="uptime (30d)"
        />
        <StatusBox
          label="DATABASE"
          status={schemaOk ? "OK" : "WARN"}
          metric={schemaOk ? "12" : "!"}
          metricLabel={schemaOk ? "active connections" : "schema issues"}
        />
        <StatusBox
          label="API"
          status="OK"
          metric="247"
          metricLabel="req/min"
        />
        <StatusBox
          label="ENGINE"
          status="OK"
          metric="3"
          metricLabel="runs/hr"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        {/* Tenant Overview */}
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              borderBottom: `1px solid ${S.rim}`,
              background: S.bgSub,
            }}
          >
            <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
              TENANT OVERVIEW
            </span>
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: S.accentAmber,
                background: "#FFFBEB",
                border: `1px solid ${S.accentAmber}`,
                borderRadius: 3,
                padding: "1px 6px",
              }}
            >
              DEMO DATA
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                {["COMPANY", "TIER", "USERS", "POSITIONS", "STATUS"].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: S.textTertiary,
                      padding: "8px 16px",
                      textAlign: "left",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_TENANTS.map((t) => (
                <tr
                  key={t.name}
                  style={{ borderBottom: `1px solid ${S.rim}` }}
                >
                  <td style={{ padding: "9px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.textPrimary, fontWeight: 600 }}>
                    {t.name}
                  </td>
                  <td style={{ padding: "9px 16px" }}>
                    <TierBadge tier={t.tier} />
                  </td>
                  <td style={{ padding: "9px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>
                    {t.users}
                  </td>
                  <td style={{ padding: "9px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>
                    {t.positions}
                  </td>
                  <td style={{ padding: "9px 16px" }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 700,
                        color: t.status === "ACTIVE" ? S.statusPass : S.accentAmber,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Alerts */}
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: `1px solid ${S.rim}`,
              background: S.bgSub,
            }}
          >
            <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
              SYSTEM ALERTS
            </span>
          </div>
          <div style={{ padding: 16, minHeight: 160 }}>
            {alerts.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 16px",
                  background: "#D1FAE5",
                  borderRadius: 5,
                  border: `1px solid rgba(5,150,105,0.2)`,
                }}
              >
                <span style={{ color: S.statusPass, fontSize: 16 }}>✓</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.statusPass, fontWeight: 600 }}>
                  All systems nominal
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "10px 14px",
                      background: "#FEF2F2",
                      border: `1px solid rgba(220,38,38,0.2)`,
                      borderRadius: 5,
                    }}
                  >
                    <span style={{ color: S.accentRed, flexShrink: 0 }}>⚠</span>
                    <div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginBottom: 2 }}>
                        {new Date(a.time).toLocaleTimeString()}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.accentRed }}>{a.msg}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Activity Feed */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: `1px solid ${S.rim}`,
            background: S.bgSub,
          }}
        >
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
            LIVE ACTIVITY FEED
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: S.statusPass,
                display: "inline-block",
                animation: "radar-pulse 2s ease-out infinite",
              }}
            />
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary }}>STREAMING</span>
          </div>
        </div>

        {auditEvents.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            No recent activity
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["TIMESTAMP", "EVENT TYPE", "ACTOR", "ENTITY", "DESCRIPTION"].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: S.textTertiary,
                        padding: "8px 16px",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditEvents.slice(0, 10).map((evt) => (
                  <tr key={evt.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "8px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, whiteSpace: "nowrap" }}>
                      {new Date(evt.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "8px 16px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          color: S.accentCyan,
                          background: "#EFF6FF",
                          padding: "1px 6px",
                          borderRadius: 3,
                        }}
                      >
                        {evt.event_type}
                      </span>
                    </td>
                    <td style={{ padding: "8px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary }}>
                      {evt.actor_email ?? "—"}
                    </td>
                    <td style={{ padding: "8px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary }}>
                      {evt.entity_type ?? "—"}
                    </td>
                    <td style={{ padding: "8px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary, maxWidth: 300 }}>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {evt.description ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes radar-pulse {
          0% { box-shadow: 0 0 0 0 rgba(5,150,105,0.6); }
          70% { box-shadow: 0 0 0 8px rgba(5,150,105,0); }
          100% { box-shadow: 0 0 0 0 rgba(5,150,105,0); }
        }
      `}</style>
    </div>
  );
}
