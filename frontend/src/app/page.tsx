"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHedge } from "../lib/hedgeContext";

// ── Hydration-safe timestamp ────────────────────────────────────────────────
// Use a stable placeholder during SSR; replace with real timestamp on client.
const TS_PLACEHOLDER = "—";

export default function LandingPage() {
  const router = useRouter();
  const { result } = useHedge();
  const [, setRenderTs] = useState(TS_PLACEHOLDER);

  // Hydration-safe: set real timestamp only on client
  useEffect(() => {
    setRenderTs(new Date().toISOString());
  }, []);

  useEffect(() => {
    // If no result exists, send user to input page
    if (!result) {
      router.replace("/input");
    } else {
      router.replace("/results");
    }
  }, [result, router]);

  return null;
}
