"use client";

import { useState, useEffect } from "react";

/** Simple breakpoint hook for marketing pages. */
export function useMarketingTheme(): { mob: boolean } {
  const [mob, setMob] = useState(false);
  useEffect(() => {
    const c = () => setMob(window.innerWidth < 768);
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);
  return { mob };
}
