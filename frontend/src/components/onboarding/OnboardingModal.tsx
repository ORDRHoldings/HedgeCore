"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";

const STEPS = [
  {
    num: "01",
    title: "Add Your First Position",
    desc: "Create an FX exposure record — the starting point for every hedge workflow.",
    href: "/position-desk",
    action: "Open Position Desk",
  },
  {
    num: "02",
    title: "Assign a Hedge Policy",
    desc: "Select a policy template that governs hedge ratio, tenor, and cost thresholds.",
    href: "/policy-desk",
    action: "Open Policy Desk",
  },
  {
    num: "03",
    title: "Run a Hedge Calculation",
    desc: "Calculate your optimal hedge plan — deterministic, audit-trail backed.",
    href: "/hedge-desk",
    action: "Open Execution Desk",
  },
  {
    num: "04",
    title: "Review the Governance Pack",
    desc: "Generate your Committee Pack with hash-chained audit evidence for your CRO.",
    href: "/committee-pack",
    action: "Open Committee Pack",
  },
];

interface Props {
  userId: string;
}

export default function OnboardingModal({ userId }: Props) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [neverShow, setNeverShow] = useState(false);

  useEffect(() => {
    // Only suppress if user explicitly opted out — show by default every login
    const suppressed = localStorage.getItem(`onboarding_suppressed_${userId}`);
    if (!suppressed) setVisible(true);
  }, [userId]);

  function dismiss() {
    if (neverShow) {
      localStorage.setItem(`onboarding_suppressed_${userId}`, "1");
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border-rim)",
        borderRadius: 4,
        width: "min(680px, 94vw)",
        maxHeight: "90vh",
        overflow: "auto",
        padding: "32px 36px",
        position: "relative",
      }}>
        {/* Close */}
        <button
          onClick={dismiss}
          aria-label="Dismiss onboarding"
          style={{
            position: "absolute", top: 16, right: 16,
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-tertiary)", display: "flex", alignItems: "center",
          }}
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{
          fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
          fontSize: 11, color: "var(--accent-cyan)", letterSpacing: "0.12em", marginBottom: 4,
        }}>
          WELCOME TO ORDR TERMINAL
        </div>
        <div style={{
          fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
          fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8,
        }}>
          Get started in 4 steps
        </div>
        <div style={{
          fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
          fontSize: 13, color: "var(--text-secondary)", marginBottom: 28,
        }}>
          Follow this workflow to complete your first institutional FX hedge.
        </div>

        {/* Steps grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
          {STEPS.map((s) => (
            <div key={s.num} style={{
              background: "var(--bg-sub)",
              border: "1px solid var(--border-soft)",
              borderRadius: 3,
              padding: "16px 18px",
            }}>
              <div style={{
                fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
                fontSize: 10, color: "var(--accent-cyan)", marginBottom: 6,
              }}>
                STEP {s.num}
              </div>
              <div style={{
                fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
                fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4,
              }}>
                {s.title}
              </div>
              <div style={{
                fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
                fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5,
              }}>
                {s.desc}
              </div>
              <button
                onClick={() => { dismiss(); router.push(s.href); }}
                style={{
                  background: "none", border: "1px solid var(--accent-cyan)",
                  color: "var(--accent-cyan)",
                  fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
                  fontSize: 10, padding: "4px 10px", cursor: "pointer", borderRadius: 2,
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                {s.action} <ArrowRight size={10} />
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          {/* Never show again checkbox */}
          <label style={{
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
            fontSize: 12, color: "var(--text-secondary)", userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={neverShow}
              onChange={(e) => setNeverShow(e.target.checked)}
              style={{ accentColor: "var(--accent-cyan)", width: 13, height: 13, cursor: "pointer" }}
            />
            Don&apos;t show this again
          </label>

          <button
            onClick={dismiss}
            style={{
              background: "var(--accent-cyan)", border: "none", color: "var(--bg-deep)",
              fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 11,
              padding: "8px 20px", cursor: "pointer", borderRadius: 2, fontWeight: 600,
              flexShrink: 0,
            }}
          >
            GOT IT, DISMISS
          </button>
        </div>
      </div>
    </div>
  );
}
