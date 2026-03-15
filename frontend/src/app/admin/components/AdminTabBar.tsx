"use client";

const TABS = [
  { key: "operations", label: "OPERATIONS" },
  { key: "users",      label: "USERS" },
  { key: "tenants",    label: "TENANTS" },
  { key: "roles",      label: "ROLES" },
  { key: "apikeys",    label: "API KEYS" },
  { key: "metrics",    label: "METRICS" },
  { key: "config",     label: "CONFIG" },
  { key: "devops",     label: "DEVOPS" },
] as const;

export type AdminTab = typeof TABS[number]["key"];

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:  "var(--bg-panel)",
  rim:      "var(--border-rim)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
} as const;

interface Props {
  active: AdminTab;
  onChange: (tab: AdminTab) => void;
}

export default function AdminTabBar({ active, onChange }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "stretch", height: 40,
      background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      overflowX: "auto", flexShrink: 0,
    }}>
      {TABS.map(({ key, label }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
              letterSpacing: "0.08em", padding: "0 18px",
              color: isActive ? S.cyan : S.tertiary,
              background: "transparent", border: "none",
              borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
              cursor: "pointer", whiteSpace: "nowrap",
              transition: "color 0.1s, border-color 0.1s",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
