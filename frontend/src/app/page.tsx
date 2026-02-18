"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHedge } from "../lib/hedgeContext";
import { useAuth } from "../lib/authContext";

// ── Hydration-safe timestamp ────────────────────────────────────────────────
// Use a stable placeholder during SSR; replace with real timestamp on client.
const TS_PLACEHOLDER = "—";

export default function LandingPage() {
  const router = useRouter();
  const { result } = useHedge();
  const { isAuthenticated } = useAuth();
  const [, setRenderTs] = useState(TS_PLACEHOLDER);

  // Hydration-safe: set real timestamp only on client
  useEffect(() => {
    setRenderTs(new Date().toISOString());
  }, []);

  useEffect(() => {
    // Must log in first
    if (!isAuthenticated) {
      router.replace("/auth/login");
      return;
    }
    // Authenticated — go to results if we have them, otherwise input (product selection)
    if (result) {
      router.replace("/results");
    } else {
      router.replace("/input");
    }
  }, [isAuthenticated, result, router]);

  return null;
}
