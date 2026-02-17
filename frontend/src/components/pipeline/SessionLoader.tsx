"use client";

/**
 * SessionLoader.tsx
 *
 * Thin client component that dispatches loadSessionThunk once on mount.
 * Extracted from layout.tsx so that layout can be a proper Server Component
 * (required by Next.js App Router — you cannot put "use client" on a layout
 * that renders <html> / <body>, as it causes hydration mismatches).
 *
 * Renders nothing — purely a side-effect carrier.
 */

import { useEffect } from "react";
import { store } from "../../lib/store";
import { loadSessionThunk } from "../../lib/store/slices/authSlice";

export default function SessionLoader() {
  useEffect(() => {
    store.dispatch(loadSessionThunk());
  }, []);

  return null;
}
