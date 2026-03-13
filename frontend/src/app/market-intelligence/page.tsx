"use client";

/**
 * /market-intelligence — Market Intelligence Dashboard
 *
 * Unified market briefing surface with 6 tabs: Overview, Heatmap, Calendar,
 * Companies, Watchlists, Signals. Powered by TradingView embed widgets.
 * Follows the Settings page tab-routing pattern (URL query params, Suspense).
 */

import { Suspense, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { PageShell } from "@/components/layout/PageShell";
import { BarChart3 } from "lucide-react";

import { HASH_MAP, TAB_TO_PARAM, S } from "./types";
import type { MarketTab } from "./types";

import MarketControlBar from "./components/MarketControlBar";
import MarketTabBar from "./components/MarketTabBar";

import OverviewTab from "./components/tabs/OverviewTab";
import HeatmapTab from "./components/tabs/HeatmapTab";
import CalendarTab from "./components/tabs/CalendarTab";
import CompaniesTab from "./components/tabs/CompaniesTab";
import WatchlistsTab from "./components/tabs/WatchlistsTab";
import SignalsTab from "./components/tabs/SignalsTab";

function MarketIntelligenceInner() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive active tab from URL
  const tabParam = searchParams.get("tab") ?? "";
  const activeTab: MarketTab =
    tabParam && HASH_MAP[tabParam] ? HASH_MAP[tabParam] : "OVERVIEW";

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [isLoading, isAuthenticated, router]);

  // Tab navigation — updates URL
  const handleTabChange = useCallback(
    (tab: MarketTab) => {
      const param = TAB_TO_PARAM[tab];
      router.replace(
        param ? `/market-intelligence?tab=${param}` : "/market-intelligence",
        { scroll: false }
      );
    },
    [router]
  );

  if (isLoading) {
    return (
      <div
        style={{
          background: S.bgDeep,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.tertiary,
            letterSpacing: "0.1em",
          }}
        >
          LOADING...
        </span>
      </div>
    );
  }

  // Tab content router
  const renderTab = () => {
    switch (activeTab) {
      case "OVERVIEW":
        return <OverviewTab />;
      case "HEATMAP":
        return <HeatmapTab />;
      case "CALENDAR":
        return <CalendarTab />;
      case "COMPANIES":
        return <CompaniesTab />;
      case "WATCHLISTS":
        return <WatchlistsTab userId={user?.id} />;
      case "SIGNALS":
        return <SignalsTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <PageShell icon={BarChart3} title="Market Intelligence" noPadding>
      <MarketControlBar />
      <MarketTabBar activeTab={activeTab} onTabChange={handleTabChange} />
      {renderTab()}
    </PageShell>
  );
}

export default function MarketIntelligencePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            background: "var(--bg-deep)",
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily:
                "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
              fontSize: 12,
              color: "var(--text-tertiary)",
              letterSpacing: "0.1em",
            }}
          >
            LOADING...
          </span>
        </div>
      }
    >
      <MarketIntelligenceInner />
    </Suspense>
  );
}
