"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import HedgeDeskPipeline from "@/components/hedge-desk/HedgeDeskPipeline";
import WorkflowBreadcrumb from "@/components/layout/WorkflowBreadcrumb";

const HD = {
  navy:    "#0A1F44",
  royal:   "#1C62F2",
  emerald: "#2ECC71",
  bgPanel: "var(--bg-panel)",
  bgSub:   "var(--bg-sub)",
  bgDeep:  "var(--bg-deep)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

type GovernanceMode = "solo" | "team";

export default function HedgeDeskPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

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
          const mode = (data.governance_mode ?? data.governanceMode ?? "solo") as string;
          if (mode === "team" || mode === "solo") {
            setGovernanceMode(mode as GovernanceMode);
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

  if (!isAuthenticated || !user || !token) return null;

  const modeBadgeColor = governanceMode === "team" ? HD.amber : HD.emerald;
  const modeLabel      = governanceMode === "team" ? "TEAM MODE" : "SOLO MODE";

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
        {/* Title */}
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

        {/* Pipeline badge */}
        <span style={{
          fontFamily: HD.fontMono,
          fontSize: 9,
          color: HD.cyan,
          border: `1px solid color-mix(in srgb,${HD.cyan} 25%,transparent)`,
          padding: "1px 6px",
          letterSpacing: "0.1em",
        }}>
          EXECUTION PIPELINE
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

        {/* User context */}
        <span style={{
          fontFamily: HD.fontMono,
          fontSize: 10,
          color: HD.tertiary,
          marginLeft: 8,
        }}>
          {user.email ?? ""}
        </span>
      </header>

      <WorkflowBreadcrumb active="hedge" />

      {/* Pipeline body */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {settingsLoaded && (
          <HedgeDeskPipeline
            token={token}
            user={user}
            governanceMode={governanceMode}
          />
        )}
      </div>
    </div>
  );
}
