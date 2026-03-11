"use client";

/**
 * SmbDashboard — fixed-layout, single-column dashboard for SMB plan users.
 *
 * No react-grid-layout, no drag-and-drop, no widget catalog.
 * Clean, focused fintech layout for single-currency (USD/MXN) users.
 */
import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import SmbExposureCard from "./smb/SmbExposureCard";
import SmbRateCard from "./smb/SmbRateCard";
import SmbQuickActions from "./smb/SmbQuickActions";
import SmbRecentActivity from "./smb/SmbRecentActivity";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  pass: "var(--status-pass)",
} as const;

interface Props {
  token: string;
  user: UserContext;
}

function nowTs() {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default function SmbDashboard({ token, user }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [ts, setTs] = useState("");

  useEffect(() => {
    setTs(nowTs());
  }, [refreshKey]);

  const companyName = user.company?.name ?? "My Company";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: S.bgDeep,
        fontFamily: S.fontUI,
      }}
    >
      {/* ── Header Bar ── */}
      <div
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          background: S.bgPanel,
          borderBottom: `1px solid ${S.rim}`,
          flexShrink: 0,
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: S.cyan,
            textTransform: "uppercase",
          }}
        >
          ORDR Lite
        </span>
        <span style={{ width: 1, height: 20, background: S.soft }} />
        <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
          {companyName}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: "transparent",
            border: `1px solid ${S.soft}`,
            borderRadius: 2,
            cursor: "pointer",
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 500,
            color: S.secondary,
            letterSpacing: "0.04em",
          }}
        >
          <RefreshCw size={12} />
          REFRESH
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: S.pass,
              animation: "pulse 2s infinite",
            }}
          />
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            LIVE
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "24px 24px 40px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 880,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* KPI Grid */}
          <SmbExposureCard key={`exp-${refreshKey}`} token={token} />

          {/* Two-column: Rate + Actions */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
            }}
          >
            <SmbRateCard key={`rate-${refreshKey}`} token={token} />
            <SmbQuickActions />
          </div>

          {/* Activity Feed */}
          <SmbRecentActivity key={`act-${refreshKey}`} token={token} />
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          background: S.bgPanel,
          borderTop: `1px solid ${S.rim}`,
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.04em" }}>
          ORDR Lite · Solo Mode · USD/MXN
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          {ts}
        </span>
      </div>
    </div>
  );
}
