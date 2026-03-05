"use client";
/**
 * Sidebar — tier-aware navigation with locked item popovers.
 * Collapses to icon-only at 72px, expands to 272px.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUIStore } from "@/lib/ui/store";
import {
  Home,
  Microscope,
  BarChart2,
  Target,
  FileText,
  Zap,
  TrendingUp,
  Shield,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Lock,
  Monitor,
  Building2,
  Users,
  Server,
  ScrollText,
  Key,
  Activity,
  Sliders,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import type { PlanTier } from "@/types/api";
import {
  meetsRequirement,
  TIER_LABELS,
  TIER_BADGE_COLORS,
} from "@/lib/tier/features";

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
      { label: "Home",       href: "/dashboard",  icon: <Home size={16} />,       exact: true },
      { label: "Audit Lab",  href: "/audit-lab", icon: <Microscope size={16} /> },
      { label: "Exposures",  href: "/exposures", icon: <BarChart2 size={16} />,  requiredTier: "smb", featureName: "exposures" },
      { label: "Hedge Plan", href: "/hedge-plan",icon: <Target size={16} />,     requiredTier: "smb", featureName: "hedge-plan" },
      { label: "Policies",   href: "/policies",  icon: <FileText size={16} />,   requiredTier: "smb", featureName: "policies" },
      { label: "Execute",    href: "/execute",   icon: <Zap size={16} />,        requiredTier: "smb", featureName: "execute" },
    ],
  },
  {
    header: "ANALYTICS",
    items: [
      { label: "Portfolio Risk", href: "/analytics/portfolio", icon: <TrendingUp size={16} />, requiredTier: "enterprise", featureName: "analytics" },
      { label: "Scenario Studio",href: "/analytics/scenarios", icon: <Activity size={16} />,   requiredTier: "enterprise", featureName: "analytics" },
    ],
  },
  {
    header: "GOVERNANCE",
    items: [
      { label: "Audit Trail",  href: "/governance/audit-trail", icon: <ScrollText size={16} />, requiredTier: "enterprise", featureName: "governance" },
      { label: "Staging Queue",href: "/governance/staging",     icon: <Shield size={16} />,     requiredTier: "enterprise", featureName: "governance" },
      { label: "Ledger",       href: "/governance/ledger",      icon: <FileText size={16} />,   requiredTier: "enterprise", featureName: "governance" },
    ],
  },
];

const ADMIN_NAV: NavItem[] = [
  { label: "War Room",      href: "/admin",           icon: <Monitor size={16} /> },
  { label: "Tenants",       href: "/admin/tenants",   icon: <Building2 size={16} /> },
  { label: "Users",         href: "/admin/users",     icon: <Users size={16} /> },
  { label: "System",        href: "/admin/system",    icon: <Server size={16} /> },
  { label: "Audit (Global)",href: "/admin/audit",     icon: <ScrollText size={16} /> },
  { label: "API Keys",      href: "/admin/api-keys",  icon: <Key size={16} /> },
  { label: "Metrics",       href: "/admin/metrics",   icon: <TrendingUp size={16} /> },
  { label: "Config",        href: "/admin/config",    icon: <Sliders size={16} /> },
];

const BOTTOM_NAV: NavItem[] = [
  { label: "Settings", href: "/settings", icon: <Settings size={16} /> },
  { label: "Help",     href: "/help",     icon: <HelpCircle size={16} /> },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { sidebarCollapsed: collapsed, setSidebarCollapsed } = useUIStore();
  const [lockedHover, setLockedHover] = useState<string | null>(null);

  const tierLabel = user ? TIER_LABELS[user.plan_tier] : "FREE";
  const tierColors = user ? TIER_BADGE_COLORS[user.plan_tier] : TIER_BADGE_COLORS.lite;

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const canAccess = (requiredTier?: PlanTier) => {
    if (!requiredTier) return true;
    if (!user) return false;
    if (user.is_superuser) return true;
    return meetsRequirement(user.plan_tier, requiredTier);
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    logout();
    window.location.href = "/auth/login";
  };

  const w = collapsed ? 72 : 272;

  const renderItem = (item: NavItem, compact = false) => {
    const active = isActive(item.href, item.exact);
    const accessible = canAccess(item.requiredTier);

    if (!accessible) {
      // Locked state
      return (
        <div
          key={item.href}
          style={{ position: "relative" }}
          onMouseEnter={() => setLockedHover(item.href)}
          onMouseLeave={() => setLockedHover(null)}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: collapsed ? 0 : 10,
              padding: collapsed ? "10px 0" : "8px 14px",
              justifyContent: collapsed ? "center" : "flex-start",
              cursor: "not-allowed",
              opacity: 0.45,
              borderRadius: 4,
            }}
          >
            <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && (
              <>
                <span style={{ fontFamily: "var(--font-terminal)", fontSize: 13, color: "var(--text-tertiary)", flex: 1 }}>
                  {item.label}
                </span>
                <Lock size={10} style={{ color: "var(--text-tertiary)" }} />
              </>
            )}
          </div>

          {/* Tier popover on hover */}
          {lockedHover === item.href && (
            <div
              style={{
                position: "absolute",
                left: collapsed ? 80 : "calc(100% + 8px)",
                top: 0,
                zIndex: 100,
                background: "var(--bg-panel)",
                border: "1px solid var(--border-rim)",
                borderRadius: 6,
                padding: "12px 16px",
                width: 220,
                boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent-cyan)", marginBottom: 6, letterSpacing: "0.08em" }}>
                {TIER_LABELS[item.requiredTier!]}+ REQUIRED
              </div>
              <p style={{ fontFamily: "var(--font-terminal)", fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px" }}>
                {item.label} requires the {TIER_LABELS[item.requiredTier!]} plan.
              </p>
              <a
                href="/settings?upgrade=true"
                style={{
                  display: "block",
                  fontFamily: "var(--font-terminal-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                  background: "var(--accent-cyan)",
                  padding: "7px 12px",
                  borderRadius: 3,
                  textDecoration: "none",
                  textAlign: "center",
                  letterSpacing: "0.06em",
                }}
              >
                UPGRADE →
              </a>
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 10,
          padding: collapsed ? "10px 0" : "8px 14px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderRadius: 4,
          textDecoration: "none",
          background: active ? "color-mix(in srgb, var(--accent-cyan) 8%, transparent)" : "transparent",
          borderLeft: active ? "2px solid var(--accent-cyan)" : "2px solid transparent",
          transition: "background 100ms",
        }}
        onMouseEnter={(e) => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-sub)";
        }}
        onMouseLeave={(e) => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <span style={{ color: active ? "var(--accent-cyan)" : "var(--text-secondary)", flexShrink: 0 }}>
          {item.icon}
        </span>
        {!collapsed && (
          <span style={{
            fontFamily: "var(--font-terminal)",
            fontSize: 13,
            fontWeight: active ? 600 : 400,
            color: active ? "var(--text-primary)" : "var(--text-secondary)",
          }}>
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      style={{
        width: w,
        minWidth: w,
        height: "100vh",
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-rim)",
        display: "flex",
        flexDirection: "column",
        transition: "width 200ms ease",
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 20,
        overflowX: "hidden",
      }}
    >
      {/* Logo / Brand */}
      <div
        style={{
          height: 56,
          borderBottom: "1px solid var(--border-rim)",
          display: "flex",
          alignItems: "center",
          padding: collapsed ? "0 12px" : "0 16px",
          justifyContent: collapsed ? "center" : "space-between",
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              ORDR
            </div>
            <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 9, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>
              {user?.company?.name ?? "Free Account"}
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 800, color: "var(--accent-cyan)" }}>O</div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "1px solid var(--border-rim)",
            borderRadius: 3,
            padding: "3px 5px",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: collapsed ? "8px 12px" : "8px 10px" }}>
        {NAV.map((section, si) => (
          <div key={si} style={{ marginBottom: 4 }}>
            {section.header && !collapsed && (
              <div style={{
                fontFamily: "var(--font-terminal-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: "var(--text-tertiary)",
                padding: "12px 14px 4px",
              }}>
                {section.header}
              </div>
            )}
            {section.items.map((item) => renderItem(item))}
          </div>
        ))}

        {/* Admin section */}
        {user?.is_superuser && (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                borderLeft: "2px solid var(--accent-red)",
                marginLeft: collapsed ? 0 : 10,
                paddingLeft: collapsed ? 0 : 8,
              }}
            >
              {!collapsed && (
                <div style={{
                  fontFamily: "var(--font-terminal-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: "var(--accent-red)",
                  padding: "12px 6px 4px",
                }}>
                  COMMAND CENTER
                </div>
              )}
              {collapsed && (
                <div style={{ borderTop: "1px solid var(--accent-red)", margin: "8px 0", opacity: 0.4 }} />
              )}
              {ADMIN_NAV.map((item) => renderItem(item))}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div style={{ borderTop: "1px solid var(--border-rim)", padding: collapsed ? "8px 12px" : "8px 10px" }}>
        {BOTTOM_NAV.map((item) => renderItem(item))}

        {/* Tier badge + user */}
        <div style={{
          marginTop: 8,
          padding: collapsed ? "8px 0" : "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: collapsed ? "center" : "flex-start",
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--accent-cyan)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-terminal-mono)",
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}>
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          {!collapsed && user && (
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontFamily: "var(--font-terminal)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.full_name ?? user.email}
              </div>
              <div style={{
                display: "inline-block",
                fontFamily: "var(--font-terminal-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: tierColors.text,
                background: tierColors.bg,
                padding: "1px 6px",
                borderRadius: 2,
              }}>
                {tierLabel}
              </div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              title="Log out"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-tertiary)",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
            >
              <LogOut size={13} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
export default Sidebar;
