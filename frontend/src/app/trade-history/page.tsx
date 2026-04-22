"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";

import { PageShell } from "@/components/layout/PageShell";
import { Clock } from "lucide-react";

// ─── Design tokens ───────────────────────────────────────────────────────────
const S = {
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red)",
  green:     "var(--status-pass)",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Proposal {
  id: string;
  position_id: string;
  status: "PROPOSED" | "APPROVED" | "EXECUTED" | "WITHDRAWN" | "REJECTED";
  proposed_by_email: string | null;
  proposed_at: string;
  approved_by_email: string | null;
  approved_at: string | null;
  executed_at: string | null;
  execution_ref: string | null;
  proposal_hash: string;
  approval_hash: string | null;
  fill_hash: string | null;
  actual_fill_rate: number | null;
  slippage_bps: number | null;
  risk_verdict: string | null;
}

type SortKey = "newest" | "oldest" | "status" | "fill_rate" | "slippage";

const STATUS_TABS = [
  "ALL",
  "PENDING APPROVAL",
  "PROPOSED",
  "APPROVED",
  "EXECUTED",
  "REJECTED",
  "WITHDRAWN",
] as const;

type StatusTab = (typeof STATUS_TABS)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(s: string): string {
  switch (s) {
    case "EXECUTED":  return S.green;
    case "APPROVED":  return S.cyan;
    case "PROPOSED":  return S.amber;
    case "REJECTED":  return S.red;
    case "WITHDRAWN": return S.tertiary;
    default:          return S.secondary;
  }
}

function riskDisplay(verdict: string | null): { label: string; color: string } {
  if (!verdict) return { label: "—", color: S.tertiary };
  const v = verdict.toUpperCase();
  if (v === "PASS" || v === "APPROVE" || v === "APPROVED")
    return { label: "✓ PASS", color: S.green };
  if (v === "FAIL" || v === "REJECT" || v === "REJECTED")
    return { label: "✗ FAIL", color: S.red };
  return { label: "⚠ COND", color: S.amber };
}

function slippageColor(bps: number | null): string {
  if (bps === null) return S.tertiary;
  if (bps > 10) return S.red;
  if (bps >= 1) return S.amber;
  return S.green;
}

function fmtAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const totalMins = Math.floor(diffMs / 60_000);
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const d = Math.floor(h / 24);
  const rh = h % 24;
  if (d > 0) return `${d}d ${rh}h`;
  return `${h}h`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function extractCcy(ref: string | null): string {
  if (!ref) return "";
  // execution_ref often contains a currency pair, e.g. "EURUSD-..." or "EUR/USD-..."
  const m = ref.match(/^([A-Z]{3})[^A-Z]?([A-Z]{3})?/);
  if (m) return m[1] ?? "";
  return "";
}

function localPart(email: string | null): string {
  if (!email) return "—";
  return email.split("@")[0] ?? email;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TradeHistoryPage() {
  const isMobile = useIsMobile();
  const _planAllowed = usePlanRedirect("professional");
  const router = useRouter();
  const { user, token } = useAuth();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusTab>("ALL");
  const [sortKey, setSortKey]     = useState<SortKey>("newest");
  const [integrityStatus, setIntegrityStatus] = useState<"idle" | "checking" | "valid" | "broken">("idle");

  // Auth guard
  useEffect(() => {
    if (!user) router.push("/auth/login");
  }, [user, router]);

  // Single load function — receives endpoint as parameter
  const load = useCallback(
    async (endpoint: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await dashboardFetch(endpoint, token);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Proposal[];
        setProposals(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load proposals");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // One effect — routes to correct endpoint based on tab
  useEffect(() => {
    const endpoint =
      statusFilter === "PENDING APPROVAL"
        ? "/v1/proposals/pending"
        : "/v1/proposals";
    load(endpoint);
  }, [statusFilter, load]);

  // Derived: filter (client-side for non-pending tabs, server already filters pending)
  const filtered = useMemo(() => {
    const base =
      statusFilter === "ALL" || statusFilter === "PENDING APPROVAL"
        ? proposals
        : proposals.filter((p) => p.status === statusFilter);

    const sorted = [...base];
    switch (sortKey) {
      case "newest":
        sorted.sort(
          (a, b) =>
            new Date(b.proposed_at).getTime() -
            new Date(a.proposed_at).getTime()
        );
        break;
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.proposed_at).getTime() -
            new Date(b.proposed_at).getTime()
        );
        break;
      case "status":
        sorted.sort((a, b) => a.status.localeCompare(b.status));
        break;
      case "fill_rate":
        sorted.sort(
          (a, b) => (b.actual_fill_rate ?? -Infinity) - (a.actual_fill_rate ?? -Infinity)
        );
        break;
      case "slippage":
        sorted.sort(
          (a, b) => (b.slippage_bps ?? -Infinity) - (a.slippage_bps ?? -Infinity)
        );
        break;
    }
    return sorted;
  }, [proposals, statusFilter, sortKey]);

  const pendingCount = useMemo(
    () => proposals.filter((p) => p.status === "PROPOSED" || p.status === "APPROVED").length,
    [proposals]
  );

  // Aggregate analytics
  const avgSlippage = useMemo(() => {
    const withSlippage = proposals.filter(p => p.slippage_bps != null);
    if (withSlippage.length === 0) return 0;
    return withSlippage.reduce((s, p) => s + (p.slippage_bps ?? 0), 0) / withSlippage.length;
  }, [proposals]);

  const complianceRate = useMemo(() => {
    if (proposals.length === 0) return 100;
    return (proposals.filter(p => {
      const v = (p.risk_verdict ?? "").toUpperCase();
      return v === "APPROVE" || v === "PASS" || v === "APPROVED";
    }).length / proposals.length) * 100;
  }, [proposals]);

  const handleVerifyIntegrity = useCallback(async () => {
    if (!token) return;
    setIntegrityStatus("checking");
    try {
      const res = await dashboardFetch("/v1/audit/chain/verify", token);
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        setIntegrityStatus(data.valid ? "valid" : "broken");
      } else {
        setIntegrityStatus("broken");
      }
    } catch {
      setIntegrityStatus("broken");
    }
  }, [token]);

  if (!_planAllowed || !user) return null;

  // ─── Styles (inline, no className ─────────────────────────────────────────
  const headerBar: React.CSSProperties = {
    height: 44,
    background: S.bgPanel,
    borderBottom: `1px solid ${S.rim}`,
    display: "flex",
    alignItems: "center",
    padding: "0 20px",
    gap: 12,
    flexShrink: 0,
    position: "sticky",
    top: 0,
    zIndex: 10,
  };

  const commandStrip: React.CSSProperties = {
    height: 40,
    background: S.bgSub,
    borderBottom: `1px solid ${S.rim}`,
    display: "flex",
    alignItems: "center",
    padding: "0 20px",
    gap: 0,
  };

  const thCell: React.CSSProperties = {
    fontFamily: S.fontMono,
    fontSize: 12,
    color: S.tertiary,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    padding: "0 12px",
    whiteSpace: "nowrap" as const,
    userSelect: "none" as const,
  };

  return (
    <PageShell icon={Clock} title="Trade History" breadcrumb={["Dashboard","Trade History"]}>
      {/* ── 1. HEADER BAR (44px) ─────────────────────────────────────────── */}
      <div style={headerBar}>
        {/* Back */}
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.tertiary,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            letterSpacing: "0.04em",
          }}
        >
          ← Dashboard
        </button>

        <span style={{ color: S.rim, fontSize: 14, lineHeight: 1 }}>|</span>

        {/* Title */}
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: S.primary,
            textTransform: "uppercase",
          }}
        >
          Trade History
        </span>

        {/* Pill */}
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            letterSpacing: "0.08em",
            color: S.cyan,
            border: `1px solid color-mix(in srgb, ${S.cyan} 40%, transparent)`,
            background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
            padding: "2px 7px",
            textTransform: "uppercase",
          }}
        >
          Execution Proposals
        </span>

        <div style={{ flex: 1 }} />

        {/* Pending badge */}
        {pendingCount > 0 && (
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              letterSpacing: "0.08em",
              color: S.amber,
              border: `1px solid color-mix(in srgb, ${S.amber} 50%, transparent)`,
              background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
              padding: "2px 8px",
              textTransform: "uppercase",
            }}
          >
            {pendingCount} Pending Approval
          </span>
        )}

        {/* Refresh */}
        <button
          onClick={() => {
            const endpoint =
              statusFilter === "PENDING APPROVAL"
                ? "/v1/proposals/pending"
                : "/v1/proposals";
            load(endpoint);
          }}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.secondary,
            background: "transparent",
            border: `1px solid ${S.rim}`,
            padding: "2px 10px",
            cursor: "pointer",
            borderRadius: 2,
            letterSpacing: "0.04em",
          }}
        >
          ↻
        </button>
      </div>

      {/* ── 2. COMMAND STRIP (40px) ──────────────────────────────────────── */}
      <div style={commandStrip}>
        {/* Status tabs */}
        <div style={{ display: "flex", gap: 0, flex: 1 }}>
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab;
            return (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: active ? S.cyan : S.tertiary,
                  background: active
                    ? `color-mix(in srgb, ${S.cyan} 8%, transparent)`
                    : "transparent",
                  border: "none",
                  borderBottom: active
                    ? `2px solid ${S.cyan}`
                    : "2px solid transparent",
                  padding: "0 14px",
                  height: 40,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Record count */}
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.tertiary,
            marginRight: 16,
            whiteSpace: "nowrap",
          }}
        >
          {filtered.length} of {proposals.length} records
        </span>

        {/* Sort selector */}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.secondary,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            padding: "2px 6px",
            cursor: "pointer",
            outline: "none",
            height: 24,
          }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="status">Status</option>
          <option value="fill_rate">Fill Rate</option>
          <option value="slippage">Slippage</option>
        </select>
      </div>

      {/* ── 2.5. AGGREGATE ANALYTICS + INTEGRITY ─────────────────────── */}
      <div style={{ padding: "12px 20px", background: S.bgDeep, borderBottom: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "TOTAL EXECUTED",   value: String(proposals.filter(p => p.status === "EXECUTED").length),      color: S.cyan },
            { label: "AVG SLIPPAGE",     value: avgSlippage === 0 ? "—" : `${avgSlippage.toFixed(1)} bps`,          color: Math.abs(avgSlippage) < 3 ? S.green : S.amber },
            { label: "PENDING APPROVAL", value: String(pendingCount),                                                color: pendingCount > 0 ? S.amber : S.green },
            { label: "FIRST-PASS RATE",  value: `${complianceRate.toFixed(0)}%`,                                    color: complianceRate > 90 ? S.green : S.amber },
          ].map(stat => (
            <div key={stat.label} style={{ padding: "10px 14px", background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.10em", color: S.tertiary, textTransform: "uppercase" }}>
                {stat.label}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: stat.color, marginTop: 4 }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
        {/* Integrity button */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleVerifyIntegrity}
            disabled={integrityStatus === "checking"}
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
              color: S.cyan, background: "transparent",
              border: `1px solid rgba(0,255,255,0.3)`, padding: "5px 12px",
              cursor: integrityStatus === "checking" ? "wait" : "pointer", letterSpacing: "0.06em",
            }}
          >
            🔗 VERIFY HASH CHAIN INTEGRITY
          </button>
          {integrityStatus === "checking" && <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Verifying hash chain...</span>}
          {integrityStatus === "valid"    && <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.green }}>✓ Hash chain integrity verified — all records authentic</span>}
          {integrityStatus === "broken"   && <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red }}>✕ Hash chain integrity violation detected</span>}
        </div>
      </div>

      {/* ── 3. DATA TABLE ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowX: "auto" }}>
        {/* Loading */}
        {loading && (
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.tertiary,
              textAlign: "center",
              padding: 60,
              letterSpacing: "0.06em",
            }}
          >
            LOADING…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.red,
              padding: "12px 20px",
              background: `color-mix(in srgb, ${S.red} 8%, transparent)`,
              borderBottom: `1px solid color-mix(in srgb, ${S.red} 40%, transparent)`,
            }}
          >
            ERROR — {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 20px",
              gap: 12,
            }}
          >
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                letterSpacing: "0.12em",
                color: S.tertiary,
                textTransform: "uppercase",
              }}
            >
              No Proposals Found
            </div>
            <p
              style={{
                fontFamily: S.fontUI,
                fontSize: 13,
                color: S.secondary,
                margin: 0,
                textAlign: "center",
                maxWidth: 340,
              }}
            >
              Run the Execution Desk pipeline to generate proposals for approval.
            </p>
            <button
              onClick={() => router.push("/hedge-desk")}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                letterSpacing: "0.08em",
                padding: "7px 18px",
                background: S.cyan,
                color: "#fff",
                border: "none",
                borderRadius: 2,
                cursor: "pointer",
                textTransform: "uppercase",
                marginTop: 8,
              }}
            >
              Open Execution Desk →
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && filtered.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              minWidth: 1100,
            }}
          >
            <colgroup>
              <col style={{ width: 140 }} /> {/* ID */}
              <col style={{ width: 130 }} /> {/* POSITION */}
              <col style={{ width: 64 }}  /> {/* CCY */}
              <col style={{ width: 110 }} /> {/* STATUS */}
              <col style={{ width: 84 }}  /> {/* RISK */}
              <col style={{ width: 160 }} /> {/* MAKER */}
              <col style={{ width: 160 }} /> {/* CHECKER */}
              <col style={{ width: 96 }}  /> {/* FILL RATE */}
              <col style={{ width: 100 }} /> {/* SLIPPAGE */}
              <col style={{ width: 72 }}  /> {/* AGE */}
            </colgroup>

            <thead>
              <tr
                style={{
                  background: S.bgSub,
                  borderBottom: `1px solid ${S.rim}`,
                  height: 30,
                }}
              >
                {(
                  [
                    "ID",
                    "Position",
                    "CCY",
                    "Status",
                    "Risk",
                    "Maker",
                    "Checker",
                    "Fill Rate",
                    "Slippage",
                    "Age",
                  ] as const
                ).map((h) => (
                  <th key={h} style={{ ...thCell, textAlign: "left", fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.map((p, idx) => {
                const sc = statusColor(p.status);
                const risk = riskDisplay(p.risk_verdict);
                const ccy = extractCcy(p.execution_ref);
                const slipColor = slippageColor(p.slippage_bps);
                const rowBg =
                  idx % 2 === 0
                    ? "transparent"
                    : "color-mix(in srgb, var(--border-rim) 5%, transparent)";

                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/staging/${p.id}`)}
                    style={{
                      height: 34,
                      borderBottom: `1px solid ${S.soft}`,
                      cursor: "pointer",
                      background: rowBg,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "color-mix(in srgb, var(--accent-cyan) 4%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = rowBg;
                    }}
                  >
                    {/* ID */}
                    <td style={{ padding: "8px 12px" }}>
                      <div
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: S.cyan,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {p.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: S.tertiary,
                          marginTop: 1,
                        }}
                      >
                        {[
                          p.proposal_hash ? `prop: ${p.proposal_hash.slice(0, 8)}…` : null,
                          p.approval_hash ? `appr: ${p.approval_hash.slice(0, 8)}…` : null,
                          p.fill_hash     ? `fill: ${p.fill_hash.slice(0, 8)}…`     : null,
                        ].filter(Boolean).join(" → ") || "—"}
                      </div>
                    </td>

                    {/* POSITION */}
                    <td style={{ padding: "8px 12px" }}>
                      <div
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: S.secondary,
                        }}
                      >
                        {p.position_id.slice(0, 8).toUpperCase()}
                      </div>
                      {p.execution_ref && (
                        <div
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color: S.tertiary,
                            marginTop: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.execution_ref}
                        </div>
                      )}
                    </td>

                    {/* CCY */}
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: ccy ? S.primary : S.tertiary,
                          letterSpacing: "0.06em",
                        }}
                      >
                        {ccy || "—"}
                      </span>
                    </td>

                    {/* STATUS */}
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: sc,
                          borderLeft: `3px solid ${sc}`,
                          paddingLeft: 6,
                        }}
                      >
                        {p.status}
                      </span>
                    </td>

                    {/* RISK */}
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          letterSpacing: "0.06em",
                          color: risk.color,
                        }}
                      >
                        {risk.label}
                      </span>
                    </td>

                    {/* MAKER */}
                    <td style={{ padding: "8px 12px" }}>
                      <div
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: S.secondary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {localPart(p.proposed_by_email)}
                      </div>
                      <div
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: S.tertiary,
                          marginTop: 1,
                        }}
                      >
                        {fmtDateTime(p.proposed_at)}
                      </div>
                    </td>

                    {/* CHECKER */}
                    <td style={{ padding: "8px 12px" }}>
                      <div
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: S.secondary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {localPart(p.approved_by_email)}
                      </div>
                      {p.approved_at && (
                        <div
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color: S.tertiary,
                            marginTop: 1,
                          }}
                        >
                          {fmtDateTime(p.approved_at)}
                        </div>
                      )}
                    </td>

                    {/* FILL RATE */}
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color:
                            p.actual_fill_rate !== null ? S.primary : S.tertiary,
                        }}
                      >
                        {p.actual_fill_rate !== null
                          ? p.actual_fill_rate.toFixed(4)
                          : "—"}
                      </span>
                    </td>

                    {/* SLIPPAGE */}
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: slipColor,
                        }}
                      >
                        {p.slippage_bps !== null
                          ? `${p.slippage_bps.toFixed(1)} bps`
                          : "—"}
                      </span>
                    </td>

                    {/* AGE */}
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: S.tertiary,
                        }}
                      >
                        {fmtAge(p.proposed_at)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}
