"use client";

import { useEffect, useState } from "react";
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

interface SchemaCheck {
  table: string;
  check: string;
  passed: boolean;
}

interface WormTable {
  name: string;
  row_count?: number;
}

interface SchemaHealth {
  status: string;
  checks?: Record<string, unknown>;
  tables?: Record<string, { exists: boolean; row_count?: number; worm?: boolean }>;
  failed_checks?: string[];
  summary?: { total: number; passed: number; failed: number };
}

const MOCK_SERVICES = [
  { name: "API Server", status: "ONLINE", latency: "12ms", version: "v1.4.2" },
  { name: "PostgreSQL", status: "ONLINE", latency: "3ms", version: "15.3" },
  { name: "Redis", status: "MOCK", latency: "—", version: "7.2" },
  { name: "Celery", status: "MOCK", latency: "—", version: "5.3" },
  { name: "Frontend", status: "ONLINE", latency: "—", version: "next@15.5" },
];

const MIDDLEWARE_STACK = [
  { name: "AuditHeaders", desc: "Injects X-Request-ID, records request metadata" },
  { name: "RateLimit", desc: "Sliding window 100 req/min per key" },
  { name: "APIKeyAuth", desc: "HK_live_ prefix bearer validation" },
  { name: "CORS", desc: "Origin whitelist: ordr-terminal.vercel.app" },
  { name: "GZip", desc: "Compress responses > 1KB" },
];

const WORM_TABLES = ["audit_events", "calculation_runs", "policy_revisions"];

function ServiceStatus({ status }: { status: string }) {
  const color =
    status === "ONLINE" ? "#059669" :
    status === "MOCK" ? "#D97706" :
    "#DC2626";
  const bg =
    status === "ONLINE" ? "#D1FAE5" :
    status === "MOCK" ? "#FFFBEB" :
    "#FEE2E2";
  return (
    <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color, background: bg, padding: "2px 8px", borderRadius: 3 }}>
      {status}
    </span>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.textTertiary, marginBottom: 12, marginTop: 4 }}>
      {title}
    </div>
  );
}

export default function SystemPage() {
  const { user } = useAuthStore();
  const [health, setHealth] = useState<SchemaHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.is_superuser) return;
    api.get<SchemaHealth>("/system/schema-health")
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to fetch schema health"))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user?.is_superuser) return <NotFound />;

  // Parse checks from health response
  const parsedChecks: SchemaCheck[] = [];
  if (health?.checks) {
    for (const [key, val] of Object.entries(health.checks)) {
      const parts = key.split(".");
      parsedChecks.push({
        table: parts[0] ?? key,
        check: parts.slice(1).join(".") || key,
        passed: val === true || val === "ok" || val === "passed",
      });
    }
  }

  const wormRows: WormTable[] = WORM_TABLES.map((name) => ({
    name,
    row_count: health?.tables?.[name]?.row_count,
  }));

  return (
    <div style={{ padding: "28px 32px", minHeight: "calc(100vh - 92px)", background: S.bgDeep }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
          COMMAND CENTER / SYSTEM
        </div>
        <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.textPrimary, margin: 0 }}>
          SYSTEM HEALTH
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        {/* Services */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
              SERVICES
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                {["SERVICE", "STATUS", "LATENCY", "VERSION"].map((h) => (
                  <th key={h} style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: S.textTertiary, padding: "8px 16px", textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_SERVICES.map((svc) => (
                <tr key={svc.name} style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.textPrimary }}>
                    {svc.name}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <ServiceStatus status={svc.status} />
                  </td>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                    {svc.latency}
                  </td>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                    {svc.version}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Middleware Stack */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
              MIDDLEWARE STACK
            </span>
          </div>
          <div style={{ padding: "12px 0" }}>
            {MIDDLEWARE_STACK.map((mw, i) => (
              <div
                key={mw.name}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 20px",
                  borderBottom: i < MIDDLEWARE_STACK.length - 1 ? `1px solid ${S.rim}` : "none",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: S.bgSub,
                    border: `1px solid ${S.rim}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    color: S.textTertiary,
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.textPrimary }}>
                    {mw.name}
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginTop: 2 }}>
                    {mw.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WORM Tables */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
            WORM TABLES
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.accentAmber, background: "#FFFBEB", border: `1px solid ${S.accentAmber}`, borderRadius: 3, padding: "1px 6px", fontWeight: 700, letterSpacing: "0.06em" }}>
            APPEND-ONLY
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
          {wormRows.map((t, i) => (
            <div
              key={t.name}
              style={{
                padding: "20px 24px",
                borderRight: i < wormRows.length - 1 ? `1px solid ${S.rim}` : "none",
              }}
            >
              <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.textTertiary, letterSpacing: "0.08em", marginBottom: 8 }}>
                {t.name}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 28, fontWeight: 700, color: S.textPrimary }}>
                {t.row_count !== undefined ? t.row_count.toLocaleString() : "—"}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginTop: 4 }}>rows</div>
            </div>
          ))}
        </div>
      </div>

      {/* Schema Governance */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
            SCHEMA GOVERNANCE
          </span>
          {health?.summary && (
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: health.summary.failed === 0 ? S.statusPass : S.accentRed }}>
              {health.summary.passed}/{health.summary.total} checks passed
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            Loading schema health...
          </div>
        ) : error ? (
          <div style={{ padding: 20, fontFamily: S.fontMono, fontSize: 12, color: S.accentRed }}>
            {error}
          </div>
        ) : parsedChecks.length === 0 ? (
          <div style={{ padding: 20 }}>
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
                Schema health: {health?.status ?? "OK"} — No detailed checks available
              </span>
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                {["TABLE", "CHECK", "RESULT", "ACTION"].map((h) => (
                  <th key={h} style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: S.textTertiary, padding: "8px 16px", textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedChecks.map((chk, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <td style={{ padding: "9px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.textPrimary, fontWeight: 600 }}>
                    {chk.table}
                  </td>
                  <td style={{ padding: "9px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary }}>
                    {chk.check}
                  </td>
                  <td style={{ padding: "9px 16px" }}>
                    <span style={{ fontSize: 14 }}>{chk.passed ? "✅" : "❌"}</span>
                  </td>
                  <td style={{ padding: "9px 16px" }}>
                    {!chk.passed && (
                      <button
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          color: S.accentAmber,
                          background: "#FFFBEB",
                          border: `1px solid ${S.accentAmber}`,
                          borderRadius: 4,
                          padding: "3px 10px",
                          cursor: "pointer",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Apply Fix →
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
