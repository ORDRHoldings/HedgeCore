"use client";

/**
 * AppTopBar.tsx
 * Unified top navigation bar for ALL authenticated ORDR Terminal pages.
 *
 * Layout:
 *   Left:   ⬡ ORDR  [CurrentSection pill]
 *   Center: Dashboard · Position Desk · Policy Engine · Reports · Execution · Governance · Help
 *   Right:  Full Name  [role]  Branch  Sign Out
 *
 * Rendered by ClientProviders Shell on every authenticated route.
 * Determines active section from pathname automatically.
 */

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/authContext";

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:  "var(--bg-panel)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red,#f87171)",
} as const;

// ── Navigation sections (institutional 4-section architecture) ────────────────
interface NavSection {
  label: string;
  href:  string;
  /** Routes that belong to this section */
  prefixes: string[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Dashboard",
    href:  "/dashboard",
    prefixes: ["/dashboard"],
  },
  {
    label: "Position Desk",
    href:  "/input",
    prefixes: ["/input"],
  },
  {
    label: "Policy Engine",
    href:  "/policies",
    prefixes: ["/policies", "/polisophic"],
  },
  {
    label: "Reports",
    href:  "/reports",
    prefixes: ["/reports", "/results"],
  },
  {
    label: "Execution",
    href:  "/execution",
    prefixes: ["/execution", "/sandbox", "/currency-fx", "/portfolio-risk", "/scenario-studio"],
  },
  {
    label: "Governance",
    href:  "/hedgewiki",
    prefixes: ["/hedgewiki", "/hedges"],
  },
  {
    label: "Help",
    href:  "/help",
    prefixes: ["/help"],
  },
];

// ── Section label resolver ────────────────────────────────────────────────────
function resolveSection(pathname: string): string {
  for (const sec of NAV_SECTIONS) {
    if (sec.prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return sec.label;
    }
  }
  return "Dashboard";
}

// ── Role badge colour ─────────────────────────────────────────────────────────
function roleColor(role: string): string {
  if (["admin", "cfo", "ceo"].includes(role))            return S.amber;
  if (["head_of_risk", "branch_manager"].includes(role)) return S.cyan;
  if (["auditor"].includes(role))                        return "#a78bfa";
  return S.secondary;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AppTopBar() {
  const { user, logout, isAuthenticated } = useAuth();
  const router   = useRouter();
  const pathname = usePathname() ?? "";

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  // Don't render on auth or public pages
  if (!isAuthenticated || !user) return null;
  if (pathname.startsWith("/auth") || pathname === "/api-health") return null;

  const role    = user.roles?.[0] ?? "—";
  const branch  = user.branch?.code ?? user.branch?.name ?? "—";
  const name    = user.full_name ?? user.email;
  const section = resolveSection(pathname);

  return (
    <div
      style={{
        position:     "sticky",
        top:          0,
        zIndex:       200,
        height:       48,
        display:      "flex",
        alignItems:   "center",
        background:   S.bgPanel,
        borderBottom: `1px solid ${S.rim}`,
        fontFamily:   S.fontUI,
        paddingLeft:  24,
        paddingRight: 24,
        gap:          0,
        flexShrink:   0,
      }}
    >
      {/* ── LEFT: Brand + section pill ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Link
          href="/dashboard"
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            6,
            textDecoration: "none",
          }}
        >
          <span style={{ color: S.cyan, fontSize: 15, lineHeight: 1 }}>⬡</span>
          <span
            style={{
              fontFamily:    S.fontMono,
              fontSize:      13,
              fontWeight:    700,
              letterSpacing: "0.1em",
              color:         S.primary,
              textTransform: "uppercase",
            }}
          >
            ORDR
          </span>
        </Link>

        {/* divider */}
        <span style={{ color: S.rim, fontSize: 16, userSelect: "none" }}>│</span>

        {/* current section pill */}
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      12,
            fontWeight:    600,
            letterSpacing: "0.06em",
            color:         S.cyan,
            background:    `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
            border:        `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
            padding:       "3px 10px",
            borderRadius:  2,
            textTransform: "uppercase",
          }}
        >
          {section}
        </span>
      </div>

      {/* ── CENTER: Section nav ── */}
      <nav
        style={{
          flex:           1,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          gap:            0,
        }}
      >
        {NAV_SECTIONS.map((sec) => {
          const isActive = sec.prefixes.some(
            (p) => pathname === p || pathname.startsWith(p + "/")
          );
          return (
            <Link
              key={sec.label}
              href={sec.href}
              style={{
                fontFamily:     S.fontUI,
                fontSize:       13,
                fontWeight:     isActive ? 600 : 400,
                letterSpacing:  "0.02em",
                color:          isActive ? S.cyan : S.secondary,
                textDecoration: "none",
                padding:        "4px 16px",
                borderBottom:   isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
                transition:     "color 120ms, border-color 120ms",
                whiteSpace:     "nowrap",
              }}
            >
              {sec.label}
            </Link>
          );
        })}
      </nav>

      {/* ── RIGHT: Identity + sign out ── */}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        12,
          flexShrink: 0,
        }}
      >
        {/* Full name */}
        <span
          style={{
            fontFamily: S.fontUI,
            fontSize:   13,
            fontWeight: 500,
            color:      S.primary,
            whiteSpace: "nowrap",
            maxWidth:   180,
            overflow:   "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </span>

        {/* Role badge */}
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      11,
            fontWeight:    600,
            letterSpacing: "0.06em",
            color:         roleColor(role),
            background:    `color-mix(in srgb, ${roleColor(role)} 10%, transparent)`,
            border:        `1px solid color-mix(in srgb, ${roleColor(role)} 25%, transparent)`,
            padding:       "2px 8px",
            borderRadius:  2,
            textTransform: "uppercase",
            whiteSpace:    "nowrap",
          }}
        >
          {role}
        </span>

        {/* Branch */}
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      12,
            color:         S.tertiary,
            letterSpacing: "0.04em",
            whiteSpace:    "nowrap",
          }}
        >
          {branch}
        </span>

        {/* divider */}
        <span style={{ color: S.rim, fontSize: 16, userSelect: "none" }}>│</span>

        {/* Sign Out */}
        <button
          onClick={handleLogout}
          style={{
            fontFamily:    S.fontMono,
            fontSize:      12,
            fontWeight:    500,
            letterSpacing: "0.04em",
            color:         S.tertiary,
            background:    "none",
            border:        `1px solid ${S.soft}`,
            cursor:        "pointer",
            padding:       "4px 12px",
            borderRadius:  2,
            transition:    "color 120ms, border-color 120ms",
            whiteSpace:    "nowrap",
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
