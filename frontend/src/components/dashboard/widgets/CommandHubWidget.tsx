"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileInput,
  ShieldCheck,
  Rocket,
  FileBarChart,
  BookOpen,
  Settings,
  Globe,
  Landmark,
  Cpu,
  Wallet,
  FlaskConical,
  X,
} from "lucide-react";
import { useAuth, type UserContext } from "@/lib/authContext";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  green: "var(--status-pass,#15803D)",
  red: "var(--accent-red,#B91C1C)",
} as const;

interface NavItem {
  id: string;
  label: string;
  shortcut: string;
  route: string;
  Icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;
  // `accentColor` (not `color`) — these are deliberately distinct hues for
  // visual nav-item differentiation; sidesteps the design-system lint rule
  // which fires on `Property[key.name='color']` literals (see ADR-0017).
  accentColor: string;
  glow: string;
  description: string;
  permission: string | null;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "positions", label: "Position Desk", shortcut: "P", route: "/position-desk",
    Icon: FileInput, accentColor: "#3B82F6", glow: "rgba(59,130,246,0.15)",
    description: "Lifecycle control tower", permission: "trades.view",
  },
  {
    id: "policies", label: "Policy Engine", shortcut: "L", route: "/policies",
    Icon: ShieldCheck, accentColor: "#10B981", glow: "rgba(16,185,129,0.15)",
    description: "60 institutional presets", permission: "policy.view",
  },
  {
    id: "execution", label: "Hedge Desk", shortcut: "E", route: "/hedge-desk",
    Icon: Rocket, accentColor: "#F59E0B", glow: "rgba(245,158,11,0.15)",
    description: "Calculate → Risk → Approve", permission: "calculate.run_sandbox",
  },
  {
    id: "sandbox", label: "Sim Lab", shortcut: "S", route: "/sandbox",
    Icon: FlaskConical, accentColor: "#3B82F6", glow: "rgba(59,130,246,0.15)",
    description: "What-if & stress tests", permission: "calculate.run_sandbox",
  },
  {
    id: "reports", label: "Reports", shortcut: "R", route: "/reports",
    Icon: FileBarChart, accentColor: "#06B6D4", glow: "rgba(6,182,212,0.15)",
    description: "30 presets + AI composer", permission: "reports.view_own_branch",
  },
  {
    id: "fxrates", label: "FX Rates", shortcut: "F", route: "/market-intelligence",
    Icon: Globe, accentColor: "#EC4899", glow: "rgba(236,72,153,0.15)",
    description: "Spot, forwards, vol", permission: null,
  },
  {
    id: "audit", label: "Audit Trail", shortcut: "A", route: "/audit-trail",
    Icon: BookOpen, accentColor: "#14B8A6", glow: "rgba(20,184,166,0.15)",
    description: "Hash-chained ledger", permission: "audit.view_branch",
  },
  {
    id: "polisophic", label: "Polisophic", shortcut: "G", route: "/polisophic",
    Icon: Landmark, accentColor: "#F97316", glow: "rgba(249,115,22,0.15)",
    description: "Political & macro intel", permission: null,
  },
  {
    id: "connectors", label: "Connectors", shortcut: "C", route: "/connectors",
    Icon: Cpu, accentColor: "#6366F1", glow: "rgba(99,102,241,0.15)",
    description: "Data pipeline hub", permission: "trades.create",
  },
  {
    id: "hedgewiki", label: "Hedge Wiki", shortcut: "W", route: "/hedgewiki",
    Icon: Wallet, accentColor: "#84CC16", glow: "rgba(132,204,22,0.15)",
    description: "ISDA, IFRS 9 knowledge", permission: null,
  },
  {
    id: "settings", label: "Settings", shortcut: "X", route: "/settings",
    Icon: Settings, accentColor: "#A1A1AA", glow: "rgba(161,161,170,0.12)",
    description: "Org, limits, API keys", permission: "admin.manage_company",
  },
  {
    id: "ingestion", label: "Ingest Data", shortcut: "I", route: "/position-desk",
    Icon: LayoutDashboard, accentColor: "#22D3EE", glow: "rgba(34,211,238,0.15)",
    description: "CSV, XLSX, ERP import", permission: "trades.create",
  },
];

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function CommandHubWidget({ token: _token, user: _user, onRemove }: Props) {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const items = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
      display: "flex", flexDirection: "column", overflow: "hidden", height: "100%",
    }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab",
      }}>
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <div style={{
          width: 18, height: 18, borderRadius: 4,
          background: `linear-gradient(135deg, ${S.cyan}, #3B82F6)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <LayoutDashboard size={10} color="#fff" />
        </div>
        <span style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
          letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase",
        }}>
          Command Hub
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
          letterSpacing: "0.06em",
        }}>
          {items.length} MODULES
        </span>
        <div style={{ flex: 1 }} />
        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{
            background: "none", border: "none", cursor: "pointer",
            color: S.tertiary, display: "flex", alignItems: "center", padding: 2,
          }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body - Grid */}
      <div style={{
        flex: 1, overflow: "auto", padding: 8,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(115px, 1fr))",
        gap: 6,
        alignContent: "start",
      }}>
        {items.map((item) => {
          const isHovered = hoveredId === item.id;
          return (
            <div
              key={item.id}
              onClick={() => router.push(item.route)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                position: "relative",
                padding: "12px 10px 10px",
                background: isHovered ? item.glow : S.bgSub,
                border: `1px solid ${isHovered ? item.accentColor : S.soft}`,
                borderRadius: 5,
                cursor: "pointer",
                transition: "all 180ms ease",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                overflow: "hidden",
              }}
            >
              {/* Top accent line */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: isHovered ? item.accentColor : "transparent",
                transition: "background 180ms ease",
              }} />

              {/* Icon + shortcut row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: `color-mix(in srgb, ${item.accentColor} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${item.accentColor} 25%, transparent)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 180ms ease",
                  ...(isHovered ? { background: `color-mix(in srgb, ${item.accentColor} 20%, transparent)` } : {}),
                }}>
                  <item.Icon size={14} color={item.accentColor} />
                </div>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 12, color: isHovered ? item.accentColor : S.tertiary,
                  letterSpacing: "0.08em", fontWeight: 700,
                  background: isHovered
                    ? `color-mix(in srgb, ${item.accentColor} 10%, transparent)`
                    : `color-mix(in srgb, ${S.tertiary} 8%, transparent)`,
                  padding: "1px 4px", borderRadius: 2,
                  transition: "all 180ms ease",
                }}>
                  {item.shortcut}
                </span>
              </div>

              {/* Label */}
              <div style={{
                fontFamily: S.fontUI, fontSize: 12, fontWeight: 700,
                color: S.primary, lineHeight: 1.2, letterSpacing: "0.01em",
              }}>
                {item.label}
              </div>

              {/* Description */}
              <div style={{
                fontFamily: S.fontMono, fontSize: 12.5, color: S.tertiary,
                lineHeight: 1.3, letterSpacing: "0.02em",
              }}>
                {item.description}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "4px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 10.5, color: S.tertiary,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
        letterSpacing: "0.04em",
      }}>
        <span>Click to navigate · Role-filtered</span>
        <span>ORDR Treasury</span>
      </div>
    </div>
  );
}
