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
 *         AppSidebar    ← persistent left rail on ALL authenticated routes (self-hides on auth pages)
 *         SystemBar     ← pipeline context strip (execution routes only)
 *         <main>{children}</main>
 *
 * Pipeline routes (show context strip + StaleSnapshotBanner):
 *   /sandbox, /execution, /currency-fx, /input
 */

import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { usePathname } from "next/navigation";
import { store } from "../../lib/store";
import { AuthProvider, useAuth } from "../../lib/authContext";
import { HedgeProvider } from "../../lib/hedgeContext";
import AppSidebar from "../layout/AppSidebar";
import SystemBar from "./SystemBar";
import StaleSnapshotBanner from "./StaleSnapshotBanner";
import SessionLoader from "./SessionLoader";
import dynamic from "next/dynamic";

// Dynamic import — voice terminal uses browser APIs (AudioContext, WebSocket)
const VoiceTerminal = dynamic(() => import("../voice/VoiceTerminal"), { ssr: false });

// Public routes: no sidebar, no voice, full viewport
const PUBLIC_ROUTES = ["/", "/market"];

// Auth pages where the voice assistant should NOT appear
const AUTH_PREFIXES = ["/auth", "/login", "/register"];

// Routes that get the pipeline context strip (SystemBar only)
const PIPELINE_PREFIXES = [
  "/sandbox",
  "/execution",
  "/market-overview",
  "/position-desk",
];

function VoiceShell() {
  const { isAuthenticated, token } = useAuth();
  const pathname = usePathname() ?? "";
  const isAuthPage = AUTH_PREFIXES.some(p => pathname.startsWith(p));
  if (!isAuthenticated || !token || isAuthPage) return null;
  return <VoiceTerminal token={token} />;
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  // Public routes: no sidebar, no voice, full viewport
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  if (isPublicRoute) {
    // Canvas-based routes (chart/market) need overflow hidden; landing page scrolls naturally
    const isCanvasRoute = pathname === "/market";
    const publicStyle: React.CSSProperties = isCanvasRoute
      ? { height: "100vh", overflow: "hidden" }
      : { minHeight: "100vh" };
    return <main style={publicStyle}>{children}</main>;
  }

  const showPipelineChrome = PIPELINE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Full-viewport routes that must not scroll (chart platform)
  const isFullViewport = pathname === "/chart";
  const mainOverflow = isFullViewport ? "overflow-hidden" : "overflow-auto";

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] flex flex-row" style={isFullViewport ? { height: "100vh", overflow: "hidden" } : undefined}>
      <AppSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {showPipelineChrome && (
          <>
            <SystemBar />
            <StaleSnapshotBanner />
          </>
        )}
        <main className={`flex-1 min-h-0 ${mainOverflow}`}>{children}</main>
      </div>
      <VoiceShell />
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
