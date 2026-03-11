"use client";

/**
 * SmbQuickActions — navigation shortcuts for SMB dashboard.
 */
import { useRouter } from "next/navigation";
import { Plus, Play, List, CheckCircle } from "lucide-react";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel: "var(--bg-panel)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
} as const;

const ACTIONS = [
  { label: "Add Position", icon: Plus, href: "/position-desk", desc: "Enter new MXN exposure" },
  { label: "Run Hedge Calc", icon: Play, href: "/hedge-desk", desc: "Calculate optimal hedge" },
  { label: "View Positions", icon: List, href: "/position-desk", desc: "All open exposures" },
  { label: "Approve Pending", icon: CheckCircle, href: "/hedge-desk", desc: "Review & execute" },
];

export default function SmbQuickActions() {
  const router = useRouter();

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 2,
        padding: "20px 24px",
      }}
    >
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: S.tertiary,
          textTransform: "uppercase",
          display: "block",
          marginBottom: 16,
        }}
      >
        Quick Actions
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => router.push(a.href)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              background: "transparent",
              border: `1px solid ${S.soft}`,
              borderRadius: 2,
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 120ms, background 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = S.cyan;
              e.currentTarget.style.background = "color-mix(in srgb, var(--accent-cyan) 4%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = S.soft;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <a.icon size={16} color={S.cyan} style={{ flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  color: S.primary,
                }}
              >
                {a.label}
              </span>
              <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
                {a.desc}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
