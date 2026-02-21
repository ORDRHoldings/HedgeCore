"use client";

/**
 * ClientProviders.tsx
 *
 * Single client-side boundary that wraps all client-only providers and
 * shell components.  Imported by the root Server Component layout.tsx so
 * that layout can remain a proper Next.js Server Component (no "use client")
 * while still delivering Redux, HedgeContext, and UI shell to the tree.
 *
 * Render tree (all client-side):
 *   Provider (react-redux)
 *     HedgeProvider
 *       SessionLoader   ← dispatches loadSessionThunk on mount
 *       Shell           ← pathname-aware
 *         AppTopBar     ← persistent on ALL authenticated routes (self-hides on auth pages)
 *         SystemBar     ← pipeline context strip (simulation routes only)
 *         <main>{children}</main>
 *
 * Pipeline routes (show context strip + StaleSnapshotBanner):
 *   /sandbox, /currency-fx, /input
 */

import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { usePathname } from "next/navigation";
import { store } from "../../lib/store";
import { AuthProvider } from "../../lib/authContext";
import { HedgeProvider } from "../../lib/hedgeContext";
import AppTopBar from "../layout/AppTopBar";
import SystemBar from "./SystemBar";
import StaleSnapshotBanner from "./StaleSnapshotBanner";
import SessionLoader from "./SessionLoader";

// Routes that get the pipeline context strip (SystemBar only)
const PIPELINE_PREFIXES = [
  "/sandbox",
  "/currency-fx",
  "/input",
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const showPipelineChrome = PIPELINE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
      <AppTopBar />
      {showPipelineChrome && (
        <>
          <SystemBar />
          <StaleSnapshotBanner />
        </>
      )}
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

export default function ClientProviders({ children }: Props) {
  return (
    <Provider store={store}>
      <AuthProvider>
        <HedgeProvider>
          {/* SessionLoader — renders nothing; auth session auto-restores via AuthProvider */}
          <SessionLoader />
          <Shell>{children}</Shell>
        </HedgeProvider>
      </AuthProvider>
    </Provider>
  );
}
