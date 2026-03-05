"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/auth/store";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  rim: "var(--border-rim,#E2E8F0)",
  soft: "var(--border-soft,#CBD5E1)",
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

interface Tenant {
  id: string;
  name: string;
  tier: "ENTERPRISE" | "SMB" | "LITE" | "TRIAL";
  users: number;
  positions: number;
  runs: number;
  created: string;
  status: "ACTIVE" | "SUSPENDED" | "TRIAL";
}

const MOCK_TENANTS: Tenant[] = [
  { id: "t1", name: "DemoCo", tier: "SMB", users: 4, positions: 12, runs: 7, created: "2025-01-15", status: "ACTIVE" },
  { id: "t2", name: "Apex Treasury", tier: "ENTERPRISE", users: 18, positions: 340, runs: 214, created: "2024-09-03", status: "ACTIVE" },
  { id: "t3", name: "NordicFX Ltd", tier: "SMB", users: 7, positions: 55, runs: 38, created: "2024-11-20", status: "ACTIVE" },
  { id: "t4", name: "SandboxCo", tier: "LITE", users: 1, positions: 0, runs: 0, created: "2026-02-01", status: "TRIAL" },
  { id: "t5", name: "Meridian Capital", tier: "ENTERPRISE", users: 31, positions: 812, runs: 591, created: "2024-06-12", status: "ACTIVE" },
  { id: "t6", name: "Volta FX", tier: "SMB", users: 5, positions: 28, runs: 12, created: "2025-08-19", status: "ACTIVE" },
  { id: "t7", name: "TrialUser Inc", tier: "LITE", users: 2, positions: 3, runs: 1, created: "2026-01-28", status: "TRIAL" },
  { id: "t8", name: "OldCorp", tier: "SMB", users: 0, positions: 0, runs: 0, created: "2024-03-07", status: "SUSPENDED" },
];

const TIER_STYLES: Record<string, { bg: string; color: string }> = {
  ENTERPRISE: { bg: "#EFF6FF", color: "#1C62F2" },
  SMB: { bg: "#D1FAE5", color: "#059669" },
  LITE: { bg: "#F1F5F9", color: "#94A3B8" },
  TRIAL: { bg: "#FFFBEB", color: "#D97706" },
};

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_STYLES[tier] ?? TIER_STYLES.LITE;
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "2px 8px",
        borderRadius: 3,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {tier}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ACTIVE" ? "#059669" : status === "TRIAL" ? "#D97706" : "#DC2626";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color }}>{status}</span>
    </span>
  );
}

export default function TenantsPage() {
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", slug: "", tier: "SMB" });

  if (!user?.is_superuser) return <NotFound />;

  const filtered = MOCK_TENANTS.filter((t) => {
    const matchSearch =
      search === "" ||
      t.name.toLowerCase().includes(search.toLowerCase());
    const matchTier = tierFilter === "ALL" || t.tier === tierFilter;
    return matchSearch && matchTier;
  });

  const counts = {
    LITE: MOCK_TENANTS.filter((t) => t.tier === "LITE").length,
    SMB: MOCK_TENANTS.filter((t) => t.tier === "SMB").length,
    ENTERPRISE: MOCK_TENANTS.filter((t) => t.tier === "ENTERPRISE").length,
    TRIAL: MOCK_TENANTS.filter((t) => t.status === "TRIAL").length,
  };

  return (
    <div style={{ padding: "28px 32px", minHeight: "calc(100vh - 92px)", background: S.bgDeep }}>
      {/* DEMO DATA Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: "#FFFBEB",
          border: `1px solid ${S.accentAmber}`,
          borderRadius: 5,
          marginBottom: 20,
        }}
      >
        <span style={{ color: S.accentAmber, fontSize: 14 }}>⚠</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentAmber, fontWeight: 600, letterSpacing: "0.04em" }}>
          DEMO DATA — Tenant management API not yet available. Displaying mock tenant records.
        </span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
            COMMAND CENTER / TENANTS
          </div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.textPrimary, margin: 0 }}>
            TENANT REGISTRY
          </h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: S.bgPanel,
            background: S.accentRed,
            border: "none",
            borderRadius: 5,
            padding: "8px 18px",
            cursor: "pointer",
          }}
        >
          + CREATE COMPANY
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tenants..."
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.textPrimary,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "7px 12px",
            outline: "none",
            width: 220,
          }}
        />
        {["ALL", "ENTERPRISE", "SMB", "LITE", "TRIAL"].map((tier) => (
          <button
            key={tier}
            onClick={() => setTierFilter(tier)}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: tierFilter === tier ? S.bgPanel : S.textSecondary,
              background: tierFilter === tier ? S.accentCyan : S.bgPanel,
              border: `1px solid ${tierFilter === tier ? S.accentCyan : S.rim}`,
              borderRadius: 4,
              padding: "5px 12px",
              cursor: "pointer",
            }}
          >
            {tier}
          </button>
        ))}
      </div>

      {/* Table */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: S.bgSub, borderBottom: `1px solid ${S.rim}` }}>
              {["COMPANY", "TIER", "USERS", "POSITIONS", "RUNS", "CREATED", "STATUS", "ACTIONS"].map((h) => (
                <th
                  key={h}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    color: S.textTertiary,
                    padding: "10px 16px",
                    textAlign: "left",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                <td style={{ padding: "11px 16px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 600, color: S.textPrimary }}>
                  {t.name}
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <TierBadge tier={t.tier} />
                </td>
                <td style={{ padding: "11px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>{t.users}</td>
                <td style={{ padding: "11px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>{t.positions}</td>
                <td style={{ padding: "11px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>{t.runs}</td>
                <td style={{ padding: "11px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>{t.created}</td>
                <td style={{ padding: "11px 16px" }}>
                  <StatusDot status={t.status} />
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <button
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      color: S.accentCyan,
                      background: "transparent",
                      border: `1px solid ${S.accentCyan}`,
                      borderRadius: 4,
                      padding: "3px 10px",
                      cursor: "pointer",
                      letterSpacing: "0.05em",
                    }}
                  >
                    MANAGE →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div
        style={{
          display: "flex",
          gap: 24,
          padding: "12px 20px",
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
        }}
      >
        {[
          { label: "LITE", count: counts.LITE },
          { label: "SMB", count: counts.SMB },
          { label: "ENTERPRISE", count: counts.ENTERPRISE },
          { label: "TRIALS", count: counts.TRIAL },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: S.textTertiary }}>
              {item.label}:
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: S.textPrimary }}>
              {item.count}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
          {MOCK_TENANTS.length} total tenants
        </div>
      </div>

      {/* Create Slide-Over */}
      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-end",
          }}
        >
          <div
            onClick={() => setShowCreate(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)" }}
          />
          <div
            style={{
              position: "relative",
              width: 420,
              height: "100vh",
              background: S.bgPanel,
              borderLeft: `3px solid ${S.accentRed}`,
              boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                borderBottom: `1px solid ${S.rim}`,
                background: S.bgSub,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary, letterSpacing: "0.06em" }}>
                CREATE COMPANY
              </span>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: S.fontMono,
                  fontSize: 16,
                  color: S.textTertiary,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { label: "COMPANY NAME", key: "name", placeholder: "Acme Corp" },
                { label: "SLUG", key: "slug", placeholder: "acme-corp" },
              ].map((field) => (
                <div key={field.key}>
                  <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.textTertiary, display: "block", marginBottom: 6 }}>
                    {field.label}
                  </label>
                  <input
                    value={createForm[field.key as keyof typeof createForm]}
                    onChange={(e) => setCreateForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{
                      width: "100%",
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: S.textPrimary,
                      background: S.bgDeep,
                      border: `1px solid ${S.rim}`,
                      borderRadius: 5,
                      padding: "8px 12px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.textTertiary, display: "block", marginBottom: 6 }}>
                  TIER
                </label>
                <select
                  value={createForm.tier}
                  onChange={(e) => setCreateForm((f) => ({ ...f, tier: e.target.value }))}
                  style={{
                    width: "100%",
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.textPrimary,
                    background: S.bgDeep,
                    border: `1px solid ${S.rim}`,
                    borderRadius: 5,
                    padding: "8px 12px",
                    outline: "none",
                  }}
                >
                  <option>SMB</option>
                  <option>ENTERPRISE</option>
                  <option>LITE</option>
                </select>
              </div>
              <div
                style={{
                  padding: "10px 14px",
                  background: "#FFFBEB",
                  border: `1px solid ${S.accentAmber}`,
                  borderRadius: 5,
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  color: S.accentAmber,
                }}
              >
                Company creation endpoint stubbed — not yet wired to backend.
              </div>
              <button
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: S.bgPanel,
                  background: S.accentRed,
                  border: "none",
                  borderRadius: 5,
                  padding: "10px",
                  cursor: "pointer",
                  marginTop: 8,
                }}
              >
                CREATE COMPANY (STUB)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
