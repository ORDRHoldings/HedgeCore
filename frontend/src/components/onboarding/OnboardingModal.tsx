"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  { num: "01", title: "Add Your FX Exposures", desc: "Enter AR/AP positions — the currencies you owe or will receive.", href: "/position-desk", action: "OPEN POSITION DESK" },
  { num: "02", title: "Assign a Hedge Policy", desc: "Select a policy template that governs your hedge ratios and instruments.", href: "/policies?tab=assign", action: "OPEN POLICY DESK" },
  { num: "03", title: "Run the Hedge Calculation", desc: "The engine computes your optimal hedge plan against live FX rates.", href: "/hedge-desk", action: "OPEN HEDGE DESK" },
  { num: "04", title: "Review & Execute", desc: "Approve the hedge plan and open trade tickets directly in IBKR.", href: "/execution-desk", action: "OPEN EXECUTION" },
];

const M = {
  fontMono: "'IBM Plex Mono', monospace",
  fontUI:   "'IBM Plex Sans', sans-serif",
  bg:       "#0D0F11",
  bgCard:   "#111418",
  bgStep:   "#161A1F",
  bgStepHov:"#1C2128",
  rim:      "#252B34",
  rimSoft:  "#1E2530",
  cyan:     "#22D3EE",
  cyanDim:  "rgba(34,211,238,0.12)",
  cyanBorder:"rgba(34,211,238,0.25)",
  white:    "#F0F4F8",
  muted:    "#8A9AB5",
  dimmer:   "#4A5568",
} as const;

interface Props {
  userId: string;
}

export default function OnboardingModal({ userId }: Props) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  useEffect(() => {
    const suppressed = localStorage.getItem(`onboarding_suppressed_${userId}`);
    if (!suppressed) setVisible(true);
  }, [userId]);

  function dismiss() {
    setVisible(false);
  }

  function dismissForever() {
    localStorage.setItem(`onboarding_suppressed_${userId}`, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.82)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: M.bgCard,
        border: `1px solid ${M.rim}`,
        borderRadius: 6,
        width: "min(640px, 94vw)",
        maxHeight: "90vh",
        overflow: "auto",
        padding: "40px 44px 32px",
        position: "relative",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.06)",
      }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: M.fontMono,
            fontSize: 12,
            fontWeight: 700,
            color: M.cyan,
            letterSpacing: "0.2em",
            marginBottom: 10,
          }}>
            ORDR TERMINAL
          </div>
          <div style={{
            fontFamily: M.fontUI,
            fontSize: 22,
            fontWeight: 700,
            color: M.white,
            letterSpacing: "-0.01em",
            marginBottom: 6,
          }}>
            Get started in 4 steps
          </div>
          <div style={{
            fontFamily: M.fontUI,
            fontSize: 13,
            color: M.muted,
            lineHeight: 1.5,
          }}>
            Follow this workflow to complete your first institutional FX hedge.
          </div>
        </div>

        {/* Steps — horizontal rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 32 }}>
          {STEPS.map((s, idx) => (
            <div
              key={s.num}
              onMouseEnter={() => setActiveStep(idx)}
              onMouseLeave={() => setActiveStep(null)}
              style={{
                display: "flex", alignItems: "center", gap: 20,
                background: activeStep === idx ? M.bgStepHov : M.bgStep,
                border: `1px solid ${activeStep === idx ? M.cyanBorder : M.rimSoft}`,
                borderRadius: 4,
                padding: "16px 20px",
                transition: "background 120ms, border-color 120ms",
              }}
            >
              {/* Step number */}
              <div style={{
                fontFamily: M.fontMono,
                fontSize: 48,
                fontWeight: 700,
                color: activeStep === idx ? M.cyan : M.dimmer,
                lineHeight: 1,
                minWidth: 68,
                transition: "color 120ms",
                letterSpacing: "-0.03em",
                userSelect: "none",
              }}>
                {s.num}
              </div>

              {/* Title + desc */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: M.fontUI,
                  fontSize: 16,
                  fontWeight: 700,
                  color: M.white,
                  marginBottom: 4,
                  letterSpacing: "-0.01em",
                }}>
                  {s.title}
                </div>
                <div style={{
                  fontFamily: M.fontUI,
                  fontSize: 13,
                  color: M.muted,
                  lineHeight: 1.5,
                }}>
                  {s.desc}
                </div>
              </div>

              {/* Action button */}
              <button
                onClick={() => { dismiss(); router.push(s.href); }}
                style={{
                  fontFamily: M.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: activeStep === idx ? M.cyan : M.muted,
                  background: activeStep === idx ? M.cyanDim : "transparent",
                  border: `1px solid ${activeStep === idx ? M.cyanBorder : M.rimSoft}`,
                  padding: "8px 14px",
                  borderRadius: 3,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "all 120ms",
                }}
              >
                {s.action} →
              </button>
            </div>
          ))}
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 28 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === 0 ? 16 : 5,
              height: 5,
              borderRadius: 3,
              background: i === 0 ? M.cyan : M.rim,
              transition: "all 200ms",
            }} />
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={dismissForever}
            style={{
              fontFamily: M.fontUI,
              fontSize: 12,
              color: M.dimmer,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              letterSpacing: "0.01em",
              textDecoration: "underline",
              textDecorationColor: "transparent",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = M.muted)}
            onMouseLeave={e => (e.currentTarget.style.color = M.dimmer)}
          >
            Skip for now
          </button>

          <button
            onClick={dismiss}
            style={{
              fontFamily: M.fontMono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: M.bg,
              background: M.cyan,
              border: "none",
              padding: "10px 28px",
              borderRadius: 4,
              cursor: "pointer",
              boxShadow: `0 0 20px rgba(34,211,238,0.25)`,
            }}
          >
            BEGIN →
          </button>
        </div>
      </div>
    </div>
  );
}
