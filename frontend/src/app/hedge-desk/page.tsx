"use client";

/**
 * hedge-desk/page.tsx — Hedge Execution Pipeline
 *
 * 6-phase governance pipeline:
 *   SELECT → CALCULATE → RISK → REVIEW → APPROVE → EXECUTE
 *
 * NOTE: Full pipeline UI is being built in steps 8–16.
 * This stub renders the page shell and phase progress bar.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

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
} as const;

const PHASES = [
  { id: "SELECT",    label: "Select",    desc: "Choose positions"     },
  { id: "CALCULATE", label: "Calculate", desc: "Run hedge engine"      },
  { id: "RISK",      label: "Risk",      desc: "Decision gate"        },
  { id: "REVIEW",    label: "Review",    desc: "Confirm hedge plan"   },
  { id: "APPROVE",   label: "Approve",   desc: "Governance sign-off"  },
  { id: "EXECUTE",   label: "Execute",   desc: "Mark as hedged"       },
];

export default function HedgeDeskPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/auth/login");
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user) return null;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: S.bgDeep, overflow: "hidden" }}>

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <header style={{
        height: 44, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 10,
        padding: "0 20px",
        background: S.bgPanel,
        borderBottom: `1px solid ${S.rim}`,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>
          Hedge Desk
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.cyan, border: `1px solid color-mix(in srgb,${S.cyan} 25%,transparent)`, padding: "1px 5px" }}>
          EXECUTION PIPELINE
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
          governance: SOLO MODE
        </span>
      </header>

      {/* ── Phase progress bar ─────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "stretch",
        background: S.bgPanel, borderBottom: `1px solid ${S.soft}`,
        padding: "0 20px",
      }}>
        {PHASES.map((phase, i) => {
          const isFirst = i === 0;
          return (
            <div key={phase.id} style={{
              display: "flex", alignItems: "center", gap: 0,
            }}>
              {i > 0 && (
                <div style={{ width: 24, height: 1, background: S.soft, flexShrink: 0 }} />
              )}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "10px 16px",
                borderBottom: isFirst ? `2px solid ${S.cyan}` : "2px solid transparent",
              }}>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: isFirst ? 700 : 400,
                  color: isFirst ? S.cyan : S.tertiary,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  {String(i + 1).padStart(2, "0")} {phase.label}
                </span>
                <span style={{ fontFamily: S.fontUI, fontSize: 10, color: S.tertiary, marginTop: 2 }}>
                  {phase.desc}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 20,
      }}>
        <div style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
          color: S.tertiary, textTransform: "uppercase",
        }}>
          Pipeline Loading
        </div>
        <div style={{
          fontFamily: S.fontUI, fontSize: 13, color: S.secondary,
          maxWidth: 400, textAlign: "center", lineHeight: 1.6,
        }}>
          The 6-phase hedge execution pipeline is being initialised. Select positions from the Position Desk to begin.
        </div>
        <button
          onClick={() => router.push("/position-desk")}
          style={{
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: S.cyan, background: `color-mix(in srgb,${S.cyan} 8%,transparent)`,
            border: `1px solid color-mix(in srgb,${S.cyan} 30%,transparent)`,
            padding: "8px 20px", cursor: "pointer",
          }}
        >
          ← Go to Position Desk
        </button>
      </div>

    </div>
  );
}
