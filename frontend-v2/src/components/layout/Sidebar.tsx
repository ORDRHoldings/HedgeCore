"use client";
/**
 * Sidebar — dark terminal nav. Collapses to 56px icon rail.
 * Institutional design: navy background, tight spacing, IBM Plex Mono labels.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUIStore } from "@/lib/ui/store";
import {
  Home, Microscope, BarChart2, Target, FileText, Zap,
  TrendingUp, Shield, Settings, HelpCircle,
  ChevronLeft, ChevronRight, Lock, Monitor,
  Building2, Users, Server, ScrollText, Key,
  Activity, Sliders, LogOut,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import type { PlanTier } from "@/types/api";
import { meetsRequirement, TIER_LABELS, TIER_BADGE_COLORS } from "@/lib/tier/features";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  requiredTier?: PlanTier;
  featureName?: string;
  exact?: boolean;
}

interface NavSection {
  items: NavItem[];
  adminOnly?: boolean;
  header?: string;
}

const NAV: NavSection[] = [
  {
    items: [
      { label: "Dashboard",  href: "/dashboard",  icon: <Home size={15} />,       exact: true },
      { label: "Audit Lab",  href: "/audit-lab",  icon: <Microscope size={15} /> },
      { label: "Exposures",  href: "/exposures",  icon: <BarChart2 size={15} />,  requiredTier: "smb" },
      { label: "Hedge Plan", href: "/hedge-plan", icon: <Target size={15} />,     requiredTier: "smb" },
      { label: "Policies",   href: "/policies",   icon: <FileText size={15} />,   requiredTier: "smb" },
      { label: "Execute",    href: "/execute",    icon: <Zap size={15} />,        requiredTier: "smb" },
    ],
  },
  {
    header: "ANALYTICS",
    items: [
      { label: "Portfolio Risk",   href: "/analytics/portfolio", icon: <TrendingUp size={15} />, requiredTier: "enterprise" },
      { label: "Scenario Studio",  href: "/analytics/scenarios", icon: <Activity size={15} />,   requiredTier: "enterprise" },
    ],
  },
  {
    header: "GOVERNANCE",
    items: [
      { label: "Audit Trail",   href: "/governance/audit-trail", icon: <ScrollText size={15} />, requiredTier: "enterprise" },
      { label: "Staging Queue", href: "/governance/staging",     icon: <Shield size={15} />,     requiredTier: "enterprise" },
      { label: "Ledger",        href: "/governance/ledger",      icon: <FileText size={15} />,   requiredTier: "enterprise" },
    ],
  },
];

const ADMIN_NAV: NavItem[] = [
  { label: "War Room",       href: "/admin",           icon: <Monitor size={15} /> },
  { label: "Tenants",        href: "/admin/tenants",   icon: <Building2 size={15} /> },
  { label: "Users",          href: "/admin/users",     icon: <Users size={15} /> },
  { label: "System",         href: "/admin/system",    icon: <Server size={15} /> },
  { label: "Audit Log",      href: "/admin/audit",     icon: <ScrollText size={15} /> },
  { label: "API Keys",       href: "/admin/api-keys",  icon: <Key size={15} /> },
  { label: "Metrics",        href: "/admin/metrics",   icon: <TrendingUp size={15} /> },
  { label: "Config",         href: "/admin/config",    icon: <Sliders size={15} /> },
];

const BOTTOM_NAV: NavItem[] = [
  { label: "Settings", href: "/settings", icon: <Settings size={15} /> },
  { label: "Help",     href: "/help",     icon: <HelpCircle size={15} /> },
];

// Dark sidebar colors (always dark regardless of page theme)
const N = {
  bg:       "#090D18",
  hover:    "#111826",
  active:   "#0F1C35",
  border:   "#1A2540",
  text:     "#6B7E96",
  textHov:  "#A8BDD0",
  textAct:  "#E4EAF2",
  accent:   "#1C62F2",
  section:  "#354A62",
  red:      "#E03E3E",
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { sidebarCollapsed: collapsed, setSidebarCollapsed } = useUIStore();
  const [lockedHover, setLockedHover] = useState<string | null>(null);

  const tierLabel = user ? TIER_LABELS[user.plan_tier] : "FREE";
  const tierColors = user ? TIER_BADGE_COLORS[user.plan_tier] : TIER_BADGE_COLORS.lite;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const canAccess = (requiredTier?: PlanTier) => {
    if (!requiredTier) return true;
    if (!user) return false;
    if (user.is_superuser) return true;
    return meetsRequirement(user.plan_tier, requiredTier);
  };

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    logout();
    window.location.href = "/auth/login";
  };

  const W = collapsed ? 56 : 232;

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href, item.exact);
    const accessible = canAccess(item.requiredTier);

    if (!accessible) {
      return (
        <div key={item.href} style={{ position: "relative" }}
          onMouseEnter={() => setLockedHover(item.href)}
          onMouseLeave={() => setLockedHover(null)}>
          <div style={{
            display: "flex", alignItems: "center",
            gap: collapsed ? 0 : 9,
            padding: collapsed ? "8px 0" : "7px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
            cursor: "not-allowed", opacity: 0.35, borderRadius: 3,
          }}>
            <span style={{ color: N.text, flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && (
              <>
                <span style={{ fontFamily: "var(--font-terminal)", fontSize: 12, color: N.text, flex: 1 }}>{item.label}</span>
                <Lock size={9} style={{ color: N.text }} />
              </>
            )}
          </div>
          {lockedHover === item.href && (
            <div style={{
              position: "absolute",
              left: collapsed ? 64 : "calc(100% + 10px)",
              top: 0, zIndex: 200,
              background: "#FFFFFF",
              border: "1px solid #D1D8E0",
              borderRadius: 4,
              padding: "12px 16px",
              width: 210,
              boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
            }}>
              <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 9, fontWeight: 700, color: "#1446C8", marginBottom: 6, letterSpacing: "0.09em" }}>
                {TIER_LABELS[item.requiredTier!]}+ REQUIRED
              </div>
              <p style={{ fontFamily: "var(--font-terminal)", fontSize: 12, color: "#273144", margin: "0 0 10px", lineHeight: 1.4 }}>
                {item.label} requires the {TIER_LABELS[item.requiredTier!]} plan.
              </p>
              <a href="/settings?upgrade=true" style={{
                display: "block", fontFamily: "var(--font-terminal-mono)", fontSize: 10, fontWeight: 700,
                color: "#fff", background: "#1C62F2", padding: "6px 10px", borderRadius: 3,
                textDecoration: "none", textAlign: "center", letterSpacing: "0.06em",
              }}>UPGRADE PLAN →</a>
            </div>
          )}
        </div>
      );
    }

    return (
      <Link key={item.href} href={item.href} style={{
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 9,
        padding: collapsed ? "8px 0" : "7px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 3,
        textDecoration: "none",
        background: active ? N.active : "transparent",
        borderLeft: active ? `2px solid ${N.accent}` : "2px solid transparent",
        marginLeft: active ? 0 : 0,
        transition: "background 80ms",
      }}
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = N.hover; }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ color: active ? N.accent : N.text, flexShrink: 0 }}>{item.icon}</span>
        {!collapsed && (
          <span style={{
            fontFamily: "var(--font-terminal)", fontSize: 12,
            fontWeight: active ? 600 : 400,
            color: active ? N.textAct : N.text,
            letterSpacing: "0.01em",
          }}>
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside style={{
      width: W, minWidth: W, height: "100vh",
      background: N.bg,
      borderRight: `1px solid ${N.border}`,
      display: "flex", flexDirection: "column",
      transition: "width 180ms ease",
      position: "fixed", left: 0, top: 0, bottom: 0,
      zIndex: 20, overflowX: "hidden",
    }}>
      {/* Brand */}
      <div style={{
        height: 52, borderBottom: `1px solid ${N.border}`,
        display: "flex", alignItems: "center",
        padding: collapsed ? "0 0" : "0 14px",
        justifyContent: collapsed ? "center" : "space-between",
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 15, fontWeight: 800, color: "#E8EDF5", letterSpacing: "-0.03em", lineHeight: 1 }}>
              ORDR
            </div>
            <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 8, color: N.text, letterSpacing: "0.12em", marginTop: 1, textTransform: "uppercase" }}>
              {user?.company?.name ?? "Terminal"}
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, fontWeight: 800, color: N.accent, letterSpacing: "-0.02em" }}>O</div>
        )}
        <button onClick={() => setSidebarCollapsed(!collapsed)} style={{
          background: "none", border: `1px solid ${N.border}`,
          borderRadius: 3, padding: "2px 4px", cursor: "pointer",
          color: N.text, display: "flex", alignItems: "center", flexShrink: 0,
        }}>
          {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
        </button>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: collapsed ? "6px 8px" : "6px 8px" }}>
        {NAV.map((section, si) => (
          <div key={si} style={{ marginBottom: 2 }}>
            {section.header && !collapsed && (
              <div style={{
                fontFamily: "var(--font-terminal-mono)", fontSize: 8,
                fontWeight: 700, letterSpacing: "0.12em",
                color: N.section, padding: "10px 12px 3px",
                textTransform: "uppercase",
              }}>
                {section.header}
              </div>
            )}
            {section.header && collapsed && (
              <div style={{ borderTop: `1px solid ${N.border}`, margin: "6px 4px" }} />
            )}
            {section.items.map((item) => renderItem(item))}
          </div>
        ))}

        {/* Admin section */}
        {user?.is_superuser && (
          <div style={{ marginTop: 6 }}>
            {!collapsed ? (
              <div style={{
                fontFamily: "var(--font-terminal-mono)", fontSize: 8, fontWeight: 700,
                letterSpacing: "0.12em", color: N.red,
                padding: "10px 12px 3px", textTransform: "uppercase",
                borderTop: `1px solid ${N.border}`, marginTop: 4,
              }}>
                COMMAND CENTER
              </div>
            ) : (
              <div style={{ borderTop: `1px solid ${N.red}20`, margin: "6px 4px" }} />
            )}
            {ADMIN_NAV.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link key={item.href} href={item.href} style={{
                  display: "flex", alignItems: "center",
                  gap: collapsed ? 0 : 9,
                  padding: collapsed ? "8px 0" : "7px 12px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius: 3, textDecoration: "none",
                  background: active ? "#2A0A0A" : "transparent",
                  borderLeft: active ? `2px solid ${N.red}` : "2px solid transparent",
                  transition: "background 80ms",
                }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "#1A0505"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ color: active ? N.red : "#7A4444", flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && (
                    <span style={{
                      fontFamily: "var(--font-terminal)", fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      color: active ? "#F5CCCC" : "#8A6060",
                    }}>
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div style={{ borderTop: `1px solid ${N.border}`, padding: collapsed ? "6px 8px" : "6px 8px", flexShrink: 0 }}>
        {BOTTOM_NAV.map((item) => renderItem(item))}

        {/* User row */}
        <div style={{
          marginTop: 4,
          padding: collapsed ? "7px 0" : "7px 10px",
          display: "flex", alignItems: "center", gap: 8,
          justifyContent: collapsed ? "center" : "flex-start",
          borderTop: `1px solid ${N.border}`,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 3,
            background: N.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-terminal-mono)", fontSize: 11, fontWeight: 700,
            color: "#fff", flexShrink: 0,
          }}>
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          {!collapsed && user && (
            <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-terminal)", fontSize: 11, fontWeight: 600, color: N.textAct, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.full_name ?? user.email}
              </div>
              <span style={{
                fontFamily: "var(--font-terminal-mono)", fontSize: 8, fontWeight: 700,
                color: tierColors.text, background: tierColors.bg,
                padding: "1px 5px", borderRadius: 2,
              }}>
                {tierLabel}
              </span>
            </div>
          )}
          {!collapsed && (
            <button onClick={handleLogout} title="Log out" style={{
              background: "none", border: "none", cursor: "pointer",
              color: N.text, padding: 3, display: "flex", alignItems: "center",
              borderRadius: 3, transition: "color 80ms",
            }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = N.textHov)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = N.text)}
            >
              <LogOut size={12} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
