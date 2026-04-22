"use client";

/**
 * methodology/page.tsx — Calculation Methodology Whitepaper
 *
 * Full whitepaper: hedge formulas, instrument reference, engine architecture,
 * GARCH vol modelling, stress testing, audit & governance engine.
 */

import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import WhitepaperPage from "@/app/sandbox/whitepaper/page";

export default function MethodologyPage() {
  const isMobile = useIsMobile();
  const _planAllowed = usePlanRedirect("professional");
  if (!_planAllowed) return null;
  return <WhitepaperPage />;
}
