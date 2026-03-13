"use client";

import { T } from "@/lib/design/tokens";
import { TABS } from "../types";
import type { ReportStudioTab } from "../types";

interface Props {
  activeTab: ReportStudioTab;
  onTabChange: (tab: ReportStudioTab) => void;
}

export default function ReportTabBar({ activeTab, onTabChange }: Props) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${T.rim}`,
        background: T.bgPanel,
        padding: "0 24px",
        overflowX: "auto",
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              fontFamily: T.fontMono,
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: "0.06em",
              color: isActive ? T.accent : T.tertiary,
              background: "transparent",
              border: "none",
              borderBottom: isActive
                ? `2px solid ${T.accent}`
                : "2px solid transparent",
              padding: "12px 18px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.12s, border-color 0.12s",
              textTransform: "uppercase",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
