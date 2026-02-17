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
 *       shell div
 *         SystemBar
 *         PipelineNav
 *         StaleSnapshotBanner
 *         <main>{children}</main>
 */

import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { store } from "../../lib/store";
import { HedgeProvider } from "../../lib/hedgeContext";
import SystemBar from "./SystemBar";
import PipelineNav from "./PipelineNav";
import StaleSnapshotBanner from "./StaleSnapshotBanner";
import SessionLoader from "./SessionLoader";

interface Props {
  children: ReactNode;
}

export default function ClientProviders({ children }: Props) {
  return (
    <Provider store={store}>
      <HedgeProvider>
        {/* SessionLoader dispatches loadSessionThunk on client mount — renders nothing */}
        <SessionLoader />
        <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
          <SystemBar />
          <PipelineNav />
          <StaleSnapshotBanner />
          <main className="flex-1 min-h-0">{children}</main>
        </div>
      </HedgeProvider>
    </Provider>
  );
}
