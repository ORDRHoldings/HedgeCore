"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import HedgeDeskPipeline from "@/components/hedge-desk/HedgeDeskPipeline";
import HedgeDeskOverview from "@/components/hedge-desk/HedgeDeskOverview";
import WorkflowBreadcrumb from "@/components/layout/WorkflowBreadcrumb";
import WorkflowGuide from "@/components/layout/WorkflowGuide";

const HD = {
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  rim: "var(--border-rim)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  emerald: "#2ECC71",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

type GovernanceMode = "solo" | "team";

function HedgeDeskInner() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = searchParams.get("mode"); // "run" = active pipeline, null = overview
  const [governanceMode, setGovernanceMode] = useState<GovernanceMode>("solo");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [isAuthenticated, router]);

  // Fetch governance mode from company settings
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const load = async () => {
      try {
        const res = await dashboardFetch("/v1/company/settings", token);
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>;
          const m = (data.governance_mode ?? data.governanceMode ?? "solo") as string;
          if (m === "team" || m === "solo") {
            setGovernanceMode(m as GovernanceMode);
          }
        }
      } catch {
        // Default to solo if fetch fails
      } finally {
        setSettingsLoaded(true);
      }
    };

    load();
  }, [isAuthenticated, token]);

  const startRun = useCallback(() => {
    router.push("/hedge-desk?mode=run");
  }, [router]);

  if (!isAuthenticated || !user || !token) return null;

  const isRunMode = mode === "run";
  const modeBadgeColor = governanceMode === "team" ? HD.amber : HD.emerald;
  const modeLabel = governanceMode === "team" ? "TEAM MODE" : "SOLO MODE";

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: HD.bgPanel,
      overflow: "hidden",
    }}>
      {/* Page header */}
      <header style={{
        height: 44,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 20px",
        background: HD.bgPanel,
        borderBottom: `1px solid ${HD.rim}`,
      }}>
        <span style={{
          fontFamily: HD.fontMono,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: HD.primary,
        }}>
          HEDGE DESK
        </span>

        <span style={{
          fontFamily: HD.fontMono,
          fontSize: 9,
          color: isRunMode ? HD.cyan : HD.tertiary,
          border: `1px solid color-mix(in srgb,${isRunMode ? HD.cyan : HD.tertiary} 25%,transparent)`,
          padding: "1px 6px",
          letterSpacing: "0.1em",
        }}>
          {isRunMode ? "EXECUTION PIPELINE" : "OVERVIEW"}
        </span>

        <div style={{ flex: 1 }} />

        {/* Governance mode badge */}
        <span style={{
          fontFamily: HD.fontMono,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: modeBadgeColor,
          background: `color-mix(in srgb,${modeBadgeColor} 10%,transparent)`,
          border: `1px solid color-mix(in srgb,${modeBadgeColor} 30%,transparent)`,
          padding: "2px 8px",
          borderRadius: 2,
        }}>
          {settingsLoaded ? modeLabel : "LOADING..."}
        </span>

        <span style={{
          fontFamily: HD.fontMono,
          fontSize: 10,
          color: HD.tertiary,
          marginLeft: 8,
        }}>
          {user.email ?? ""}
        </span>
      </header>

      {/* Breadcrumb + Guide — only shown in run mode */}
      {isRunMode && (
        <>
          <WorkflowBreadcrumb active="select" />
          <WorkflowGuide active={isRunMode ? "select" : "overview"} />
        </>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {isRunMode ? (
          settingsLoaded && (
            <HedgeDeskPipeline
              token={token}
              user={user}
              governanceMode={governanceMode}
            />
          )
        ) : (
          <HedgeDeskOverview
            token={token}
            user={user}
            onStartRun={startRun}
          />
        )}
      </div>
    </div>
  );
}

export default function HedgeDeskPage() {
  return (
    <Suspense fallback={
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-panel)",
      }}>
        <span style={{
          fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
          fontSize: 11,
          color: "var(--text-tertiary)",
          letterSpacing: "0.1em",
        }}>
          LOADING...
        </span>
      </div>
    }>
      <HedgeDeskInner />
    </Suspense>
  );
}
