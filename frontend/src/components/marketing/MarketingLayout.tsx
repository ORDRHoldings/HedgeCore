"use client";

import { useState, useEffect, type ReactNode } from "react";
import MarketingNav from "./MarketingNav";
import MarketingFooter from "./MarketingFooter";
import { DARK, LIGHT, F, type ThemeMode, type MarketingTheme } from "./theme";

interface Props {
  children: ReactNode;
  /** Pass theme/mode/toggle to control externally (e.g. landing page). */
  theme?: MarketingTheme;
  mode?: ThemeMode;
  onToggleTheme?: () => void;
}

export default function MarketingLayout({ children, theme, mode, onToggleTheme }: Props) {
  /* Internal state — only used when props are NOT provided */
  const [internalMode, setInternalMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    if (mode !== undefined) return; // controlled externally
    const saved = localStorage.getItem("ordr_landing_theme");
    if (saved === "dark" || saved === "light") setInternalMode(saved);
  }, [mode]);

  const toggleInternal = () => {
    setInternalMode(prev => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("ordr_landing_theme", next);
      return next;
    });
  };

  const resolvedMode = mode ?? internalMode;
  const resolvedTheme = theme ?? (resolvedMode === "dark" ? DARK : LIGHT);
  const resolvedToggle = onToggleTheme ?? toggleInternal;

  return (
    <div style={{
      background: resolvedTheme.bg,
      color: resolvedTheme.text,
      minHeight: "100vh",
      fontFamily: F.ui,
      overflowX: "hidden",
    }}>
      <MarketingNav theme={resolvedTheme} mode={resolvedMode} onToggleTheme={resolvedToggle} />
      {children}
      <MarketingFooter theme={resolvedTheme} />
    </div>
  );
}

/* Re-export for convenience so pages can access theme types */
export { DARK, LIGHT, F };
export type { ThemeMode, MarketingTheme };
