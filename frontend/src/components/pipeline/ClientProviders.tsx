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
 *       Shell           ← pathname-aware: shows pipeline chrome only on pipeline pages
 *         <main>{children}</main>
 *
 * Pipeline pages (show SystemBar + PipelineNav + StaleSnapshotBanner):
 *   /sandbox, /staging, /ledger, /currency-fx, /input, /results, /reports, /execution
 *
 * All other pages (dashboard, portfolio-risk, polisophic, hedgewiki, etc.)
 * receive a clean layout — their own AppTopBar handles navigation.
 */

import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { usePathname } from "next/navigation";
import { store } from "../../lib/store";
import { AuthProvider } from "../../lib/authContext";
import { HedgeProvider } from "../../lib/hedgeContext";
import SystemBar from "./SystemBar";
import PipelineNav from "./PipelineNav";
import StaleSnapshotBanner from "./StaleSnapshotBanner";
import SessionLoader from "./SessionLoader";

// Routes that get the legacy pipeline chrome (SystemBar + PipelineNav)
const PIPELINE_PREFIXES = [
  "/sandbox",
  "/staging",
  "/ledger",
  "/currency-fx",
  "/input",
  "/results",
  "/reports",
  "/execution",
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const showPipelineChrome = PIPELINE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
      {showPipelineChrome && (
        <>
          <SystemBar />
          <PipelineNav />
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
