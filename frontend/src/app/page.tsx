"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/authContext";

// ── Hydration-safe timestamp ────────────────────────────────────────────────
// Use a stable placeholder during SSR; replace with real timestamp on client.
const TS_PLACEHOLDER = "—";

export default function LandingPage() {
  const router = useRouter();
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
    // Authenticated — route to terminal selector
    router.replace("/terminal");
  }, [isAuthenticated, router]);

  return null;
}
