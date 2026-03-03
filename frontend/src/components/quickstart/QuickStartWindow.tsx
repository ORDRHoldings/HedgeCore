"use client";

import { useEffect, useState } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { UserContext } from "@/lib/authContext";

// ── Design tokens ─────────────────────────────────────────────────────────────

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
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
  pass:      "var(--status-pass,#4ade80)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface QuickStartWindowProps {
  token: string;
  user: UserContext;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Readiness = "READY" | "NEEDS ACTION" | "BLOCKED";

interface OnboardingSummary {
  exposures_open_count: number;
  policy_assigned: boolean;
  policy_id: string | null;
  last_run_id: string | null;
  last_run_at: string | null;
  pending_proposals_count: number;
  pending_approvals_count: number;
  net_notional_base: string | null;
  net_notional_amount: number | null;
  last_run_estimated_cost: number | null;
  risk_gate_status: "unknown" | "pass" | "fail" | "warn";
}

// ── Safe defaults ─────────────────────────────────────────────────────────────

const SAFE_SUMMARY: OnboardingSummary = {
  exposures_open_count: 0,
  policy_assigned: false,
  policy_id: null,
  last_run_id: null,
  last_run_at: null,
  pending_proposals_count: 0,
  pending_approvals_count: 0,
  net_notional_base: null,
  net_notional_amount: null,
  last_run_estimated_cost: null,
  risk_gate_status: "unknown",
};

// ── Pure helper functions (exported for testing) ──────────────────────────────

export function getStepReadiness(step: number, s: OnboardingSummary): Readiness {
  if (step === 1) return s.exposures_open_count > 0 ? "READY" : "NEEDS ACTION";
  if (step === 2) return s.policy_assigned ? "READY" : (s.exposures_open_count > 0 ? "NEEDS ACTION" : "BLOCKED");
  if (step === 3) return s.last_run_id ? "READY" : (s.policy_assigned ? "NEEDS ACTION" : "BLOCKED");
  if (step === 4) return (s.pending_proposals_count > 0 || s.last_run_id != null) ? "READY" : "NEEDS ACTION";
  return "NEEDS ACTION";
}

export function fmtAgo(isoStr: string | null): string {
  if (!isoStr) return "—";
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtAmount(amount: number | null, base: string | null): string {
  if (amount == null) return "—";
  const sym = base === "USD" ? "$" : (base ?? "");
  if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${sym}${(amount / 1_000).toFixed(0)}K`;
  return `${sym}${amount.toFixed(0)}`;
}

// ── Readiness badge ───────────────────────────────────────────────────────────

function ReadinessBadge({ status }: { status: Readiness }) {
  const style: React.CSSProperties = (() => {
    if (status === "READY") return {
      background: "color-mix(in srgb, var(--status-pass) 15%, transparent)",
      color: "var(--status-pass,#4ade80)",
    };
    if (status === "NEEDS ACTION") return {
      background: "color-mix(in srgb, var(--accent-amber) 15%, transparent)",
      color: "var(--accent-amber)",
    };
    return {
      background: "color-mix(in srgb, var(--text-tertiary) 15%, transparent)",
      color: "var(--text-tertiary)",
    };
  })();

  const label = status === "READY" ? "✓ READY" : status;

  return (
    <span style={{
      ...style,
      fontFamily:    S.fontMono,
      fontSize:      9,
      fontWeight:    700,
      letterSpacing: "0.07em",
      padding:       "2px 6px",
      whiteSpace:    "nowrap",
      flexShrink:    0,
    }}>
      {label}
    </span>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────────

function KpiStrip({ summary, loading }: { summary: OnboardingSummary; loading: boolean }) {
  const cards = [
    {
      label: "OPEN EXPOS.",
      value: loading ? "…" : String(summary.exposures_open_count),
      sub:   loading ? "" : summary.exposures_open_count === 1 ? "position" : "positions",
    },
    {
      label: "NET NOTIONAL",
      value: loading ? "…" : fmtAmount(summary.net_notional_amount, summary.net_notional_base),
      sub:   loading ? "" : (summary.net_notional_base ?? "—"),
    },
    {
      label: "LAST RUN",
      value: loading ? "…" : fmtAgo(summary.last_run_at),
      sub:   "",
    },
  ];

  return (
    <div style={{
      display:      "flex",
      gap:          0,
      borderBottom: `1px solid ${S.rim}`,
      flexShrink:   0,
    }}>
      {cards.map((card, i) => (
        <div
          key={card.label}
          style={{
            flex:          1,
            padding:       "10px 12px",
            borderRight:   i < cards.length - 1 ? `1px solid ${S.rim}` : "none",
            background:    S.bgSub,
            display:       "flex",
            flexDirection: "column",
            gap:           2,
          }}
        >
          <div style={{
            fontFamily:    S.fontMono,
            fontSize:      8,
            letterSpacing: "0.10em",
            color:         S.tertiary,
            fontWeight:    700,
          }}>
            {card.label}
          </div>
          <div style={{
            fontFamily: S.fontMono,
            fontSize:   16,
            fontWeight: 700,
            color:      S.primary,
            lineHeight: 1.1,
          }}>
            {card.value}
          </div>
          {card.sub && (
            <div style={{
              fontFamily:    S.fontMono,
              fontSize:      9,
              color:         S.tertiary,
              letterSpacing: "0.05em",
            }}>
              {card.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Workflow step ─────────────────────────────────────────────────────────────

interface StepDef {
  number: number;
  circleLabel: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  ctaAriaLabel: string;
}

const STEPS: StepDef[] = [
  {
    number:       1,
    circleLabel:  "①",
    title:        "Add FX Exposures",
    description:  "Enter AR/AP positions to define your FX exposure",
    ctaLabel:     "→ Position Desk",
    ctaHref:      "/positions",
    ctaAriaLabel: "Go to Position Desk to add FX exposures",
  },
  {
    number:       2,
    circleLabel:  "②",
    title:        "Assign Hedge Policy",
    description:  "Select a policy template for your exposures",
    ctaLabel:     "→ Policy Desk",
    ctaHref:      "/policies",
    ctaAriaLabel: "Go to Policy Desk to assign a hedge policy",
  },
  {
    number:       3,
    circleLabel:  "③",
    title:        "Run Calculation",
    description:  "Compute the optimal hedge plan",
    ctaLabel:     "→ Hedge Desk",
    ctaHref:      "/hedge",
    ctaAriaLabel: "Go to Hedge Desk to run the calculation",
  },
  {
    number:       4,
    circleLabel:  "④",
    title:        "Review & Execute",
    description:  "Approve the proposal and open execution tickets",
    ctaLabel:     "→ Execution Desk",
    ctaHref:      "/execution",
    ctaAriaLabel: "Go to Execution Desk to review and approve",
  },
];

function WorkflowStep({
  step,
  readiness,
  isLast,
}: {
  step: StepDef;
  readiness: Readiness;
  isLast: boolean;
}) {
  const blocked = readiness === "BLOCKED";

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           0,
      paddingBottom: isLast ? 0 : 0,
    }}>
      {/* Main row */}
      <div style={{
        display:    "flex",
        gap:        10,
        padding:    "12px 14px",
        borderBottom: isLast ? "none" : `1px solid ${S.soft}`,
      }}>
        {/* Circle number */}
        <div style={{
          width:          24,
          height:         24,
          borderRadius:   "50%",
          background:     blocked
            ? "color-mix(in srgb, var(--text-tertiary) 12%, transparent)"
            : `color-mix(in srgb, ${S.cyan} 15%, transparent)`,
          border:         `1px solid ${blocked ? S.tertiary : S.cyan}`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontFamily:     S.fontMono,
          fontSize:       11,
          fontWeight:     700,
          color:          blocked ? S.tertiary : S.cyan,
          flexShrink:     0,
          marginTop:      1,
        }}>
          {step.number}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title + badge row */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            8,
            marginBottom:   3,
          }}>
            <span style={{
              fontFamily:  S.fontUI,
              fontSize:    12,
              fontWeight:  600,
              color:       blocked ? S.tertiary : S.primary,
              lineHeight:  1.2,
            }}>
              {step.title}
            </span>
            <ReadinessBadge status={readiness} />
          </div>

          {/* Description */}
          <p style={{
            fontFamily: S.fontUI,
            fontSize:   10,
            color:      S.secondary,
            lineHeight: 1.55,
            margin:     "0 0 8px",
          }}>
            {step.description}
          </p>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {/* Primary CTA */}
            <a
              href={blocked ? undefined : step.ctaHref}
              aria-label={step.ctaAriaLabel}
              aria-disabled={blocked}
              style={{
                fontFamily:     S.fontMono,
                fontSize:       9,
                letterSpacing:  "0.06em",
                fontWeight:     600,
                color:          blocked ? S.tertiary : S.cyan,
                background:     "transparent",
                border:         `1px solid ${blocked ? S.tertiary : S.cyan}`,
                padding:        "3px 8px",
                cursor:         blocked ? "not-allowed" : "pointer",
                textDecoration: "none",
                opacity:        blocked ? 0.5 : 1,
                display:        "inline-block",
              }}
            >
              {step.ctaLabel}
            </a>

            {/* Help link */}
            <a
              href={`/help?section=getting-started`}
              aria-label={`Help for step ${step.number}: ${step.title}`}
              style={{
                fontFamily:     S.fontMono,
                fontSize:       9,
                color:          S.tertiary,
                background:     "transparent",
                border:         `1px solid ${S.soft}`,
                padding:        "3px 7px",
                cursor:         "pointer",
                textDecoration: "none",
                display:        "inline-block",
              }}
            >
              ?
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QuickStartWindow({ token, user }: QuickStartWindowProps) {
  const [open,           setOpen]           = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary,        setSummary]        = useState<OnboardingSummary>(SAFE_SUMMARY);
  const [dismissing,     setDismissing]     = useState(false);
  const [mounted,        setMounted]        = useState(false);

  // ── Hydration guard ────────────────────────────────────────────────────────
  useEffect(() => { setMounted(true); }, []);

  // ── ESC to close ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Fetch prefs + summary on mount ────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function init() {
      // 1. Check prefs
      try {
        const prefsRes = await dashboardFetch("/v1/ui/prefs", token);
        if (!cancelled && prefsRes.ok) {
          const prefs = await prefsRes.json();
          if (prefs?.show_quickstart === false) {
            setOpen(false);
            setSummaryLoading(false);
            return;
          }
        }
      } catch {
        // localStorage fallback
        try {
          const suppressed = localStorage.getItem("qs_suppressed_" + user.id);
          if (suppressed === "1") {
            setOpen(false);
            setSummaryLoading(false);
            return;
          }
        } catch {}
      }

      if (!cancelled) setOpen(true);

      // 2. Fetch onboarding summary
      try {
        const sumRes = await dashboardFetch("/v1/ui/onboarding-summary", token);
        if (!cancelled && sumRes.ok) {
          const data = await sumRes.json();
          setSummary({ ...SAFE_SUMMARY, ...data });
        }
      } catch {
        // Safe default already set
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [token, user.id]);

  // ── Don't show again ───────────────────────────────────────────────────────
  const handleDontShowAgain = async () => {
    setDismissing(true);
    try {
      await dashboardFetch("/v1/ui/prefs", token, {
        method: "PATCH",
        body:   JSON.stringify({ show_quickstart: false }),
      });
    } catch {}
    // localStorage fallback always
    try { localStorage.setItem("qs_suppressed_" + user.id, "1"); } catch {}
    setOpen(false);
    setDismissing(false);
  };

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-label="Quick Start Guide"
      aria-modal="false"
      style={{
        position:      "fixed",
        right:         0,
        top:           0,
        width:         380,
        height:        "100vh",
        zIndex:        1000,
        transform:     open ? "translateX(0)" : "translateX(100%)",
        transition:    "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
        display:       "flex",
        flexDirection: "column",
        background:    S.bgPanel,
        borderLeft:    `1px solid ${S.rim}`,
        overflow:      "hidden",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding:      "10px 14px",
        borderBottom: `1px solid ${S.rim}`,
        background:   S.bgDeep,
        flexShrink:   0,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
        gap:          10,
      }}>
        <div>
          <div style={{
            fontFamily:    S.fontMono,
            fontSize:      9,
            letterSpacing: "0.12em",
            color:         S.cyan,
            fontWeight:    700,
            marginBottom:  2,
          }}>
            ORDR TERMINAL
          </div>
          <div style={{
            fontFamily: S.fontUI,
            fontSize:   13,
            fontWeight: 600,
            color:      S.primary,
            lineHeight: 1.2,
          }}>
            Quick Start — Get hedge-ready
          </div>
        </div>

        <button
          onClick={() => setOpen(false)}
          aria-label="Close Quick Start"
          style={{
            background:     "transparent",
            border:         `1px solid ${S.rim}`,
            cursor:         "pointer",
            fontFamily:     S.fontMono,
            fontSize:       9,
            color:          S.tertiary,
            letterSpacing:  "0.07em",
            padding:        "4px 8px",
            display:        "flex",
            alignItems:     "center",
            gap:            4,
            flexShrink:     0,
            lineHeight:     1,
          }}
        >
          ✕ CLOSE
        </button>
      </div>

      {/* ── KPI Strip ───────────────────────────────────────────────────────── */}
      <KpiStrip summary={summary} loading={summaryLoading} />

      {/* ── Section label ───────────────────────────────────────────────────── */}
      <div style={{
        padding:      "8px 14px 6px",
        borderBottom: `1px solid ${S.rim}`,
        flexShrink:   0,
        background:   S.bgSub,
      }}>
        <span style={{
          fontFamily:    S.fontMono,
          fontSize:      8,
          letterSpacing: "0.12em",
          color:         S.tertiary,
          fontWeight:    700,
        }}>
          WORKFLOW STEPS
        </span>
      </div>

      {/* ── Steps ───────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {STEPS.map((step, i) => (
          <WorkflowStep
            key={step.number}
            step={step}
            readiness={summaryLoading ? "BLOCKED" : getStepReadiness(step.number, summary)}
            isLast={i === STEPS.length - 1}
          />
        ))}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding:      "10px 14px",
        borderTop:    `1px solid ${S.rim}`,
        background:   S.bgSub,
        flexShrink:   0,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
        gap:          10,
      }}>
        {/* Don't show again toggle */}
        <button
          onClick={handleDontShowAgain}
          disabled={dismissing}
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            6,
            background:     "transparent",
            border:         "none",
            cursor:         dismissing ? "not-allowed" : "pointer",
            fontFamily:     S.fontMono,
            fontSize:       9,
            color:          S.tertiary,
            letterSpacing:  "0.06em",
            padding:        0,
            opacity:        dismissing ? 0.5 : 1,
          }}
        >
          <span style={{
            width:        12,
            height:       12,
            border:       `1px solid ${S.rim}`,
            display:      "inline-block",
            flexShrink:   0,
            background:   "transparent",
            lineHeight:   "10px",
            textAlign:    "center",
            fontSize:     8,
            color:        S.tertiary,
          }}>
            □
          </span>
          Don&apos;t show again
        </button>

        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          style={{
            background:    "transparent",
            border:        `1px solid ${S.rim}`,
            cursor:        "pointer",
            fontFamily:    S.fontMono,
            fontSize:      9,
            color:         S.tertiary,
            letterSpacing: "0.07em",
            padding:       "4px 10px",
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
