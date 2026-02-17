"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "../lib/store";
import { logout } from "../lib/store/slices/authSlice";

// renderTs must NOT be a module-level constant — that causes a hydration
// mismatch because the server evaluates it at a different time than the client.
// Instead, we set it once after first mount (client-only) via useState + useEffect.
// Until mounted, we render a stable placeholder that matches the server output.
const TS_PLACEHOLDER = "— UTC";

// ─── small primitives ───────────────────────────────────────────────────────

function MetaChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: "0.5625rem", whiteSpace: "nowrap" }}>
      <span style={{ color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ color: accent ? "var(--accent-cyan)" : "var(--text-secondary)", fontWeight: 500 }}>{value}</span>
    </span>
  );
}

function Sep() {
  return <span style={{ color: "var(--border-rim)", fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: "0.5625rem", userSelect: "none" }}>|</span>;
}

function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  const color = active ? "var(--status-pass)" : "var(--status-pending,var(--text-tertiary))";
  const borderColor = active ? "var(--status-pass)" : "var(--border-soft)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
      fontSize: "0.5625rem", fontWeight: 600, letterSpacing: "0.07em",
      padding: "2px 6px", border: `1px solid ${borderColor}`,
      color,
      background: active ? `color-mix(in srgb, var(--status-pass) 8%, transparent)` : "transparent",
      whiteSpace: "nowrap" as const,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
      {label ?? (active ? "ACTIVE" : "COMING SOON")}
    </span>
  );
}

function PostureTag({ label, variant }: { label: string; variant: "ok" | "stale" | "info" }) {
  const colors = {
    ok:    { color: "var(--status-pass)", border: "var(--status-pass)", bg: "color-mix(in srgb, var(--status-pass) 7%, transparent)" },
    stale: { color: "var(--status-warn)", border: "var(--status-warn)", bg: "color-mix(in srgb, var(--status-warn) 7%, transparent)" },
    info:  { color: "var(--accent-cyan)", border: "var(--accent-cyan)", bg: "color-mix(in srgb, var(--accent-cyan) 7%, transparent)" },
  }[variant];
  return (
    <span style={{
      display: "inline-block",
      fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
      fontSize: "0.5rem", fontWeight: 600, letterSpacing: "0.06em",
      padding: "1px 5px", border: `1px solid ${colors.border}`,
      color: colors.color, background: colors.bg, textTransform: "uppercase" as const,
    }}>{label}</span>
  );
}

// ─── module definitions ─────────────────────────────────────────────────────

const MODULES = [
  {
    key: "portfolio-risk",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="9" width="3" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.25"/>
        <rect x="6.5" y="5.5" width="3" height="9.5" rx="0.5" stroke="currentColor" strokeWidth="1.25"/>
        <rect x="12" y="1.5" width="3" height="13.5" rx="0.5" stroke="currentColor" strokeWidth="1.25"/>
        <path d="M2.5 7L7 4l4.5 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
      </svg>
    ),
    label: "Portfolio Risk Analysis",
    active: true,
    purpose: "R1–R8 risk decomposition across delta, vega, gamma, theta, correlation, credit, liquidity, and tail. VaR 99% · CVaR · hedge effectiveness · factor attribution.",
    route: "/portfolio-risk",
    tag: "PORTFOLIO · VaR · R1–R8",
  },
  {
    key: "currency-fx",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M2 8h12M10 5l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 8H2M6 11l-4-3 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
      </svg>
    ),
    label: "Currency FX Hedging",
    active: true,
    purpose: "Transaction ingestion → netting → bucketing → hedge ladder generation with policy-based ratios, deterministic replay, and full audit trails.",
    route: "/currency-fx",
    tag: "FX · RISK ENGINE",
  },
  {
    key: "scenario-studio",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M1 12L5 7l3 3 3-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.25"/>
      </svg>
    ),
    label: "Scenario Studio",
    active: true,
    purpose: "Stress-test exposures against FX shocks, macro regimes, and custom paths. Monte Carlo · Historical Simulation · Deterministic shock ladder.",
    route: "/scenario-studio",
    tag: "SIMULATION · STRESS",
  },
  {
    key: "polisophic",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25"/>
        <path d="M8 4v4l2.5 2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
        <path d="M3.5 8h1M11.5 8h1M8 3.5v-1M8 13.5v-1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
    label: "Polisophic",
    active: true,
    purpose: "Real-time political & macro risk intelligence — converts events, policy shifts, and regime signals into structured risk scores, scenarios, and decision-ready alerts.",
    route: "/polisophic",
    tag: "POLITICAL RISK · MACRO",
  },
  {
    key: "hedgewiki",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
        <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
        <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    ),
    label: "HedgeWiki",
    active: true,
    purpose: "Versioned, citation-dense governance knowledge graph for hedging — sits above HedgeCore to produce audit-ready, institution-grade hedge design and documentation.",
    route: "/hedgewiki",
    tag: "KNOWLEDGE GRAPH · IFRS 9",
  },
];

// ─── page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router   = useRouter();
  const dispatch = useDispatch();
  const token          = useSelector((s: RootState) => s.auth.token);
  const { sandboxResult } = useSelector((s: RootState) => s.pipeline);

  const runId   = sandboxResult?.run_id         ? String(sandboxResult.run_id).slice(0, 8)   : "—";
  const snapHash = sandboxResult?.frozen_inputs?.market_hash
    ? String(sandboxResult.frozen_inputs.market_hash).slice(0, 8)
    : "—";

  // Mounted-gate for timestamp: server renders TS_PLACEHOLDER, client updates
  // after first paint — prevents hydration mismatch caused by differing clocks.
  const [renderTs, setRenderTs] = useState<string>(TS_PLACEHOLDER);
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);

  useEffect(() => { if (!token) router.replace("/auth/login"); }, [token, router]);
  if (!token) return null;

  const handleLogout = () => { dispatch(logout()); router.push("/auth/login"); };

  // ── shared style tokens ──────────────────────────────────────────────────
  const S = {
    fontUI:   "var(--font-terminal,'IBM Plex Sans',var(--font-ui,sans-serif))",
    fontMono: "var(--font-terminal-mono,'IBM Plex Mono',var(--font-mono,monospace))",
    bgDeep:   "var(--bg-deep)",
    bgPanel:  "var(--bg-panel)",
    bgSub:    "var(--bg-sub)",
    borderRim:"var(--border-rim)",
    borderSoft:"var(--border-soft)",
    textPrimary:   "var(--text-primary)",
    textSecondary: "var(--text-secondary)",
    textTertiary:  "var(--text-tertiary)",
    accentCyan:    "var(--accent-cyan)",
  } as const;

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.textPrimary }}>

      {/* ── Context Identity Bar ────────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center", gap: 16, height: 44,
        padding: "0 16px", background: S.bgPanel,
        borderBottom: `1px solid ${S.borderRim}`, flexShrink: 0,
      }}>
        {/* left: product wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* logo mark */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="16" height="16" rx="1.5" stroke="var(--accent-cyan)" strokeWidth="1.25"/>
            <path d="M4.5 13.5V9L9 4.5 13.5 9v4.5" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6.75 13.5v-3h4.5v3" stroke="var(--accent-cyan)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.textPrimary }}>
            HedgeCore
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", fontWeight: 500, letterSpacing: "0.08em", color: S.textTertiary, borderLeft: `1px solid ${S.borderRim}`, paddingLeft: 8 }}>
            RISK PLATFORM
          </span>
        </div>

        {/* center: metadata chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden" }}>
          <MetaChip label="ENGINE" value="1.0.0" />
          <Sep />
          <MetaChip label="RUN"    value={runId} />
          <Sep />
          <MetaChip label="SNAP"   value={snapHash} />
          <Sep />
          <MetaChip label="AS OF"  value={renderTs} />
          <Sep />
          <MetaChip label="ROLE"   value="risk_analyst" accent />
        </div>

        {/* right: user + logout */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: S.fontMono, fontSize: "0.625rem", color: S.textSecondary,
            padding: "2px 7px", border: `1px solid ${S.borderSoft}`,
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            demo
          </span>
          <button onClick={handleLogout} style={{
            fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 500,
            letterSpacing: "0.04em", color: S.textTertiary, background: "transparent",
            border: `1px solid ${S.borderRim}`, padding: "2px 8px", cursor: "pointer",
          }}>
            Logout
          </button>
        </div>
      </header>

      {/* ── Main Two-Column Grid ─────────────────────────────────────── */}
      <main style={{ display: "grid", gridTemplateColumns: "1fr 240px", flex: 1, minHeight: 0 }}>

        {/* LEFT: Primary content */}
        <div style={{ padding: "24px 28px", borderRight: `1px solid ${S.borderRim}`, display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>

          {/* ── Section 01: About ─────────────────────────────────── */}
          <section style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.textTertiary, letterSpacing: "0.06em" }}>01</span>
              <h1 style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.textPrimary, letterSpacing: "0.01em", margin: 0 }}>
                About HedgeCore
              </h1>
            </div>
            <div style={{ height: 1, background: S.borderRim, marginBottom: 14 }} />
            <p style={{ fontFamily: S.fontUI, fontSize: "0.75rem", lineHeight: 1.65, color: S.textSecondary, maxWidth: "64ch", margin: 0 }}>
              HedgeCore is an institutional-grade risk platform combining portfolio risk decomposition
              (R1–R8 · VaR · attribution), FX exposure management, scenario simulation, political & macro
              risk intelligence, and a versioned governance knowledge graph. Every output is deterministic,
              snapshot-bound, and audit-traced — designed for treasury committees, risk desks, and external auditors.
            </p>
          </section>

          {/* ── Section 02: Platform Modules ──────────────────────────── */}
          <section style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.textTertiary, letterSpacing: "0.06em" }}>02</span>
              <h2 style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.textPrimary, letterSpacing: "0.01em", margin: 0 }}>
                Platform Modules
              </h2>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.textTertiary, marginLeft: "auto" }}>
                {MODULES.filter(m => m.active).length} active · {MODULES.length} total
              </span>
            </div>
            <div style={{ height: 1, background: S.borderRim, marginBottom: 0 }} />

            {/* Module Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontUI, fontSize: "0.6875rem" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.borderRim}` }}>
                  {["Module", "Status", "Purpose", "Action"].map((h, i) => (
                    <th key={h} style={{
                      padding: "6px 12px 6px 0", fontSize: "0.5625rem", fontWeight: 500,
                      letterSpacing: "0.07em", textTransform: "uppercase", color: S.textTertiary,
                      textAlign: i === 3 ? "right" : "left", whiteSpace: "nowrap",
                      paddingRight: i === 3 ? 0 : undefined,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m, idx) => (
                  <tr key={m.key} style={{ borderBottom: idx < MODULES.length - 1 ? `1px solid ${S.borderSoft}` : "none" }}>

                    {/* Module name */}
                    <td style={{ padding: "10px 12px 10px 0", verticalAlign: "top", width: 220 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, borderLeft: `2px solid ${m.active ? S.accentCyan : S.borderRim}`, paddingLeft: 8 }}>
                        <span style={{ color: m.active ? S.accentCyan : S.textTertiary, display: "flex", alignItems: "center", flexShrink: 0, marginTop: 1 }}>
                          {m.icon}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: "0.75rem", color: m.active ? S.textPrimary : S.textTertiary, whiteSpace: "nowrap" }}>{m.label}</span>
                          <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.textTertiary, letterSpacing: "0.06em" }}>{m.tag}</span>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "10px 12px 10px 0", verticalAlign: "top", paddingTop: 11 }}>
                      <StatusBadge active={m.active} />
                    </td>

                    {/* Purpose */}
                    <td style={{ padding: "10px 12px 10px 0", verticalAlign: "top", fontSize: "0.6875rem", lineHeight: 1.55, color: S.textTertiary }}>
                      {m.purpose}
                    </td>

                    {/* Action */}
                    <td style={{ padding: "10px 0 10px 0", verticalAlign: "top", textAlign: "right", width: 120, paddingTop: 10 }}>
                      {m.active ? (
                        <button
                          onClick={() => router.push(m.route)}
                          style={{
                            fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 500,
                            letterSpacing: "0.04em", color: S.accentCyan,
                            border: `1px solid ${S.accentCyan}`, background: "transparent",
                            padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          Launch →
                        </button>
                      ) : (
                        <button
                          disabled
                          style={{
                            fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 500,
                            letterSpacing: "0.04em", color: S.textTertiary,
                            border: `1px solid ${S.borderSoft}`, background: "transparent",
                            padding: "4px 10px", cursor: "not-allowed", opacity: 0.45, whiteSpace: "nowrap",
                          }}
                        >
                          Coming Soon
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

        </div>{/* /left */}

        {/* RIGHT: System Posture Panel */}
        <aside style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 0, background: S.bgSub }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, paddingBottom: 8 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.textTertiary, letterSpacing: "0.06em" }}>SYS</span>
            <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.textPrimary, letterSpacing: "0.01em" }}>System Posture</span>
          </div>
          <div style={{ height: 1, background: S.borderRim, marginBottom: 14 }} />

          <dl style={{ display: "flex", flexDirection: "column", gap: 0, margin: 0 }}>
            {[
              { dt: "Determinism",    dd: <PostureTag label="Snapshot-bound" variant="ok" /> },
              { dt: "Replay",         dd: <PostureTag label="Replayable"     variant="ok" /> },
              { dt: "Audit",          dd: <PostureTag label="Audit-traced"   variant="ok" /> },
              { dt: "Platform",       dd: <PostureTag label="v1.0.0"         variant="info" /> },
              { dt: "Data Freshness", dd: <PostureTag label={snapHash !== "—" ? "Snapshot loaded" : "No snapshot"} variant={snapHash !== "—" ? "ok" : "stale"} /> },
              { dt: "Active Run",     dd: <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.textTertiary, letterSpacing: "0.04em" }}>{runId}</span> },
              { dt: "Modules Active", dd: <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.textSecondary, letterSpacing: "0.04em" }}>{MODULES.filter(m => m.active).length} / {MODULES.length}</span> },
            ].map(({ dt, dd }, i, arr) => (
              <div key={dt} style={{
                display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center",
                gap: 8, padding: "7px 0",
                borderBottom: i < arr.length - 1 ? `1px solid ${S.borderSoft}` : "none",
              }}>
                <dt style={{ fontFamily: S.fontUI, fontSize: "0.625rem", color: S.textTertiary, fontWeight: 400 }}>{dt}</dt>
                <dd style={{ margin: 0, textAlign: "right" as const }}>{dd}</dd>
              </div>
            ))}
          </dl>

          {/* Divider + session info */}
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${S.borderRim}` }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.textTertiary, letterSpacing: "0.04em", marginBottom: 6 }}>
              PLATFORM MODULES
            </div>
            {MODULES.filter(m => m.active).map(m => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--status-pass)", display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.textSecondary }}>{m.label}</span>
              </div>
            ))}
            {MODULES.filter(m => !m.active).map(m => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: S.borderRim, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontFamily: S.fontUI, fontSize: "0.5625rem", color: S.textTertiary }}>{m.label}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto", paddingTop: 16, fontFamily: S.fontMono, fontSize: "0.5rem", color: S.textTertiary, letterSpacing: "0.04em" }}>
            Rendered {renderTs}
          </div>
        </aside>

      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer style={{
        display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 28px",
        borderTop: `1px solid ${S.borderRim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.5rem", color: S.textTertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>© 2026 HedgeCore Inc.</span>
        <span style={{ color: S.borderRim, userSelect: "none" }}>·</span>
        <span>Engine v1.0.0</span>
        <span style={{ color: S.borderRim, userSelect: "none" }}>·</span>
        <span>Institutional Risk Infrastructure</span>
        <span style={{ color: S.borderRim, userSelect: "none" }}>·</span>
        <span>All rights reserved.</span>
      </footer>

    </div>
  );
}
