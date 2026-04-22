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
import { useState, useCallback, useEffect } from "react";
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
import { Menu, X } from "lucide-react";

// Dynamic import — voice terminal uses browser APIs (AudioContext, WebSocket)
const VoiceTerminal = dynamic(() => import("../voice/VoiceTerminal"), { ssr: false });

// Public routes: no sidebar, no voice, full viewport
const PUBLIC_ROUTES = ["/", "/market"];

// Marketing route prefixes: no sidebar, no voice (matched via startsWith)
const MARKETING_PREFIXES = ["/products", "/solutions", "/pricing", "/about", "/contact"];

// Auth pages where the voice assistant should NOT appear
const AUTH_PREFIXES = ["/auth", "/login", "/register"];

// Routes that get the pipeline context strip (SystemBar only)
const PIPELINE_PREFIXES = [
  "/sandbox",
  "/execution",
  "/market-intelligence",
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(prev => !prev);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  // Public routes: no sidebar, no voice, full viewport
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname) ||
    MARKETING_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"));
  if (isPublicRoute) {
    // Canvas-based routes (chart/market) need overflow hidden; landing/marketing pages scroll naturally
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
      {/* Mobile sidebar backdrop */}
      {isMobile && (
        <div
          className={`sidebar-backdrop ${mobileSidebarOpen ? "is-visible" : ""}`}
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}
      <AppSidebar mobileOpen={mobileSidebarOpen} onMobileClose={closeMobileSidebar} />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile hamburger header */}
        {isMobile && (
          <header
            style={{
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              borderBottom: "1px solid var(--border-rim)",
              background: "var(--bg-panel)",
              flexShrink: 0,
            }}
          >
            <button
              onClick={toggleMobileSidebar}
              aria-label="Open navigation"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {mobileSidebarOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <span style={{
              fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: "var(--text-primary)",
            }}>
              ORDR
            </span>
            <div style={{ width: 38 }} />
          </header>
        )}
        {showPipelineChrome && (
          <>
            <SystemBar />
            <StaleSnapshotBanner />
          </>
        )}
        <main className={`flex-1 min-h-0 ${mainOverflow} main-content`}>{children}</main>
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
