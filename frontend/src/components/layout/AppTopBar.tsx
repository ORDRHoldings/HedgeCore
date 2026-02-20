"use client";

/**
 * AppTopBar.tsx
 * Unified top navigation bar for all ORDR Terminal module pages.
 *
 * Shows:
 *   Left:   ⬡ ORDR Terminal  [CurrentModule pill]
 *   Center: Dashboard · CurrencyFX · Portfolio Risk · Polisophic · HedgeWiki
 *   Right:  Full Name  [role]  Branch  [↓ Switch]  Sign Out
 *
 * Used by: every module page (currency-fx, results, reports, portfolio-risk,
 *          polisophic, hedgewiki, hedges, ledger, execution, sandbox, staging,
 *          scenario-studio)
 */

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgSub:    "var(--bg-sub,#0d1117)",
  bgPanel:  "var(--bg-panel,#111722)",
  rim:      "var(--border-rim,#1e2835)",
  soft:     "var(--border-soft,#1a2333)",
  primary:  "var(--text-primary,#e8edf4)",
  secondary:"var(--text-secondary,#8a94a6)",
  tertiary: "var(--text-tertiary,#4a5568)",
  cyan:     "var(--accent-cyan,#22d3ee)",
  amber:    "var(--accent-amber,#fbbf24)",
  red:      "var(--accent-red,#f87171)",
} as const;

// ── Module definitions ────────────────────────────────────────────────────────
interface ModuleLink {
  label: string;
  path:  string;
  short: string; // short label for dropdown
}

const MODULE_LINKS: ModuleLink[] = [
  { label: "Dashboard",      path: "/dashboard",      short: "Dashboard"      },
  { label: "CurrencyFX",     path: "/currency-fx",    short: "CurrencyFX"     },
  { label: "Portfolio Risk",  path: "/portfolio-risk", short: "Portfolio Risk" },
  { label: "Polisophic",     path: "/polisophic",     short: "Polisophic"     },
  { label: "HedgeWiki",      path: "/hedgewiki",      short: "HedgeWiki"      },
];

// ── Props ─────────────────────────────────────────────────────────────────────
export interface AppTopBarProps {
  /** Display name of the current module, e.g. "CurrencyFX" */
  currentModule: string;
  /** Current path, used to highlight active nav link, e.g. "/currency-fx" */
  currentPath: string;
}

// ── Role badge colour ─────────────────────────────────────────────────────────
function roleColor(role: string): string {
  if (["admin", "cfo", "ceo"].includes(role))            return S.amber;
  if (["head_of_risk", "branch_manager"].includes(role)) return S.cyan;
  if (["auditor"].includes(role))                        return "#a78bfa"; // purple
  return S.secondary;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AppTopBar({ currentModule, currentPath }: AppTopBarProps) {
  const { user, logout, isAuthenticated } = useAuth();
  const router  = useRouter();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef  = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  // Don't render if not authenticated (page's own auth guard handles redirect)
  if (!isAuthenticated || !user) return null;

  const role   = user.roles?.[0] ?? "—";
  const branch = user.branch?.code ?? user.branch?.name ?? "—";
  const name   = user.full_name ?? user.email;

  return (
    <div
      style={{
        position:     "sticky",
        top:          0,
        zIndex:       200,
        height:       40,
        display:      "flex",
        alignItems:   "center",
        background:   S.bgSub,
        borderBottom: `1px solid ${S.rim}`,
        fontFamily:   S.fontUI,
        paddingLeft:  16,
        paddingRight: 16,
        gap:          0,
        flexShrink:   0,
      }}
    >
      {/* ── LEFT: Brand + module pill ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <Link
          href="/dashboard"
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            6,
            textDecoration: "none",
          }}
        >
          <span style={{ color: S.cyan, fontSize: 14, lineHeight: 1 }}>⬡</span>
          <span
            style={{
              fontFamily:    S.fontMono,
              fontSize:      11,
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

        {/* current module pill */}
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      10,
            fontWeight:    600,
            letterSpacing: "0.08em",
            color:         S.cyan,
            background:    `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
            border:        `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`,
            padding:       "2px 8px",
            borderRadius:  2,
            textTransform: "uppercase",
          }}
        >
          {currentModule}
        </span>
      </div>

      {/* ── CENTER: Nav links ── */}
      <nav
        style={{
          flex:           1,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          gap:            4,
        }}
      >
        {MODULE_LINKS.map((m) => {
          const isActive = currentPath === m.path ||
            (m.path !== "/dashboard" && currentPath.startsWith(m.path));
          return (
            <Link
              key={m.path}
              href={m.path}
              style={{
                fontFamily:     S.fontMono,
                fontSize:       10,
                fontWeight:     isActive ? 600 : 400,
                letterSpacing:  "0.06em",
                color:          isActive ? S.cyan : S.secondary,
                textDecoration: "none",
                padding:        "3px 10px",
                borderBottom:   isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
                transition:     "color 120ms, border-color 120ms",
                whiteSpace:     "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.color = S.primary;
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.color = S.secondary;
              }}
            >
              {m.label}
            </Link>
          );
        })}
      </nav>

      {/* ── RIGHT: Identity + dropdown + sign out ── */}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        10,
          flexShrink: 0,
        }}
      >
        {/* Full name */}
        <span
          style={{
            fontFamily: S.fontUI,
            fontSize:   12,
            fontWeight: 500,
            color:      S.primary,
            whiteSpace: "nowrap",
            maxWidth:   160,
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
            fontSize:      9,
            fontWeight:    600,
            letterSpacing: "0.07em",
            color:         roleColor(role),
            background:    `color-mix(in srgb, ${roleColor(role)} 10%, transparent)`,
            border:        `1px solid color-mix(in srgb, ${roleColor(role)} 25%, transparent)`,
            padding:       "1px 6px",
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
            fontSize:      10,
            color:         S.tertiary,
            letterSpacing: "0.06em",
            whiteSpace:    "nowrap",
          }}
        >
          {branch}
        </span>

        {/* divider */}
        <span style={{ color: S.rim, fontSize: 16, userSelect: "none" }}>│</span>

        {/* Module switcher dropdown */}
        <div ref={dropRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropOpen((o) => !o)}
            style={{
              display:       "flex",
              alignItems:    "center",
              gap:           4,
              fontFamily:    S.fontMono,
              fontSize:      10,
              fontWeight:    500,
              letterSpacing: "0.06em",
              color:         dropOpen ? S.cyan : S.secondary,
              background:    "none",
              border:        `1px solid ${dropOpen ? S.cyan : S.soft}`,
              padding:       "3px 8px",
              cursor:        "pointer",
              borderRadius:  2,
              transition:    "color 120ms, border-color 120ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = S.primary;
              (e.currentTarget as HTMLElement).style.borderColor = S.secondary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = dropOpen ? S.cyan : S.secondary;
              (e.currentTarget as HTMLElement).style.borderColor = dropOpen ? S.cyan : S.soft;
            }}
            aria-haspopup="listbox"
            aria-expanded={dropOpen}
          >
            Switch Module
            <span style={{ fontSize: 8, marginTop: 1 }}>{dropOpen ? "▲" : "▼"}</span>
          </button>

          {dropOpen && (
            <div
              role="listbox"
              style={{
                position:   "absolute",
                top:        "calc(100% + 4px)",
                right:      0,
                minWidth:   180,
                background: S.bgPanel,
                border:     `1px solid ${S.rim}`,
                borderRadius: 3,
                boxShadow:  "0 8px 24px rgba(0,0,0,0.4)",
                zIndex:     300,
                overflow:   "hidden",
              }}
            >
              {MODULE_LINKS.map((m) => {
                const isActive = currentPath === m.path ||
                  (m.path !== "/dashboard" && currentPath.startsWith(m.path));
                return (
                  <button
                    key={m.path}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setDropOpen(false);
                      router.push(m.path);
                    }}
                    style={{
                      display:    "block",
                      width:      "100%",
                      textAlign:  "left",
                      fontFamily: S.fontMono,
                      fontSize:   11,
                      padding:    "9px 14px",
                      color:      isActive ? S.cyan : S.secondary,
                      background: isActive
                        ? `color-mix(in srgb, ${S.cyan} 6%, transparent)`
                        : "none",
                      border:     "none",
                      borderBottom: `1px solid ${S.soft}`,
                      cursor:     "pointer",
                      letterSpacing: "0.04em",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background =
                          `color-mix(in srgb, ${S.cyan} 4%, transparent)`;
                        (e.currentTarget as HTMLElement).style.color = S.primary;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "none";
                        (e.currentTarget as HTMLElement).style.color = S.secondary;
                      }
                    }}
                  >
                    {isActive && (
                      <span style={{ color: S.cyan, marginRight: 6 }}>●</span>
                    )}
                    {m.short}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sign Out */}
        <button
          onClick={handleLogout}
          style={{
            fontFamily:    S.fontMono,
            fontSize:      10,
            fontWeight:    500,
            letterSpacing: "0.06em",
            color:         S.tertiary,
            background:    "none",
            border:        "none",
            cursor:        "pointer",
            padding:       "3px 6px",
            transition:    "color 120ms",
            whiteSpace:    "nowrap",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.color = S.red)
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.color = S.tertiary)
          }
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
