"use client";

import { useState, useEffect } from "react";

export function useBreakpoint(breakpoint: number = 768): boolean {
  const [isBelow, setIsBelow] = useState(false);

  useEffect(() => {
    const check = () => setIsBelow(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isBelow;
}

export function useIsMobile(): boolean {
  return useBreakpoint(768);
}

export function useIsSmallMobile(): boolean {
  return useBreakpoint(640);
}
