"use client";

import { useState, useEffect } from "react";
import { DARK, LIGHT } from "./theme";
import type { MarketingTheme, ThemeMode } from "./theme";

/**
 * Hook to read the current marketing theme from localStorage.
 * Polls every 200ms so child pages react when the nav toggle fires.
 */
export function useMarketingTheme(): { T: MarketingTheme; dk: boolean; mob: boolean } {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [mob, setMob] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem("ordr_landing_theme");
    if (s === "dark" || s === "light") setMode(s);
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      const s = localStorage.getItem("ordr_landing_theme");
      if (s === "dark" || s === "light") setMode(s);
    }, 200);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const c = () => setMob(window.innerWidth < 768);
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  return { T: mode === "dark" ? DARK : LIGHT, dk: mode === "dark", mob };
}
