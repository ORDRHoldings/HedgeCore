"use client";
import { S, SettingsTab, TABS } from "../types/settings";

interface Props {
  activeTab:  SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

const GROUP_LABELS = {
  CONFIG: "CONFIGURATION",
  ACCESS: "ACCESS & SECURITY",
  ORG:    "ORGANISATION",
};

export default function SettingsTabBar({ activeTab, onTabChange }: Props) {
  const groups = (["CONFIG", "ACCESS", "ORG"] as const).map(g => ({
    key:   g,
    label: GROUP_LABELS[g],
    tabs:  TABS.filter(t => t.group === g),
  }));

  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      padding: "0 24px", gap: 0, height: 36, flexShrink: 0,
    }}>
      {groups.map((grp, gi) => (
        <div key={grp.key} style={{ display: "flex", alignItems: "stretch" }}>
          {/* Group divider (except before first group) */}
          {gi > 0 && (
            <div style={{
              width: 1, background: S.soft, margin: "8px 4px",
              alignSelf: "stretch",
            }} />
          )}
          {grp.tabs.map(t => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                style={{
                  fontFamily: S.fontUI, fontSize: 12, fontWeight: active ? 700 : 400,
                  color: active ? S.cyan : S.tertiary,
                  background: "transparent", border: "none",
                  borderBottom: active ? `2px solid ${S.cyan}` : "2px solid transparent",
                  padding: "0 14px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
                {t.badge && (
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                    color: active ? S.cyan : S.tertiary,
                    background: active ? `color-mix(in srgb, ${S.cyan} 10%, transparent)` : S.bgSub,
                    border: `1px solid ${active ? S.cyan : S.rim}`,
                    borderRadius: 10, padding: "0 5px", lineHeight: "14px",
                  }}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
