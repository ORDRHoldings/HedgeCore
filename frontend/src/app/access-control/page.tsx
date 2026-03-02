"use client";

/**
 * access-control/page.tsx — Access Control
 *
 * Governance > Access Control
 * Users & Roles | Permission Matrix | Branch Hierarchy
 */

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import HelpPanel from "@/components/layout/HelpPanel";
import { ACCESS_CONTROL_HELP } from "@/lib/helpContent";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";

// ── Hydration-safe timestamp hook ─────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  pass:     "var(--status-pass)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

// ── Badge helper ──────────────────────────────────────────────────────────────
function badge(color: string, label: string): React.CSSProperties {
  return {
    fontFamily: S.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: color,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
    padding: "1px 5px",
    borderRadius: 2,
    display: "inline-block",
    whiteSpace: "nowrap" as const,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
type PageTab = "users" | "matrix" | "hierarchy";

interface DemoUser {
  name: string;
  email: string;
  role: string;
  roleBadgeColor: string;
  branch: string;
  department: string;
  mfaEnabled: boolean;
  active: boolean;
  lastLogin: string;
  isCurrentUser?: boolean;
}

const TABS: { key: PageTab; label: string }[] = [
  { key: "users",     label: "Users & Roles" },
  { key: "matrix",    label: "Permission Matrix" },
  { key: "hierarchy", label: "Branch Hierarchy" },
];

// ── API types ─────────────────────────────────────────────────────────────────
interface ApiRole {
  id: number;
  name: string;
  description: string | null;
  hierarchy_level: number;
  is_system: boolean;
  permissions: string[]; // codenames e.g. "positions.view"
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function AccessControlPage() {
  const _planAllowed = usePlanRedirect("enterprise");
  if (!_planAllowed) return null;
  const renderTs = useRenderTs();
  const { isAuthenticated, token, user } = useAuth();
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  const [activeTab, setActiveTab] = useState<PageTab>("users");

  if (!isAuthenticated) return null;

  // Determine admin status
  const isAdmin = user?.roles?.some(r => ["admin", "superuser"].includes(r)) ?? user?.is_superuser ?? false;

  // Build single-user list from auth context
  const currentUser: DemoUser[] = user ? [{
    name: user.full_name ?? user.email ?? "Operator",
    email: user.email ?? "—",
    role: (user.roles?.[0] ?? "operator").charAt(0).toUpperCase() + (user.roles?.[0] ?? "operator").slice(1),
    roleBadgeColor: S.cyan,
    branch: "—",
    department: "—",
    mfaEnabled: true,
    active: true,
    lastLogin: "Current session",
    isCurrentUser: true,
  }] : [];

  // Resolve current user email for highlighting
  const currentEmail = user?.email ?? "";

  return (
    <div style={{
      background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI,
      display: "flex", flexDirection: "column",
    }}>
      {/* TopBar */}
      <TopBar renderTs={renderTs} />

      {/* Tab bar */}
      <div style={{
        height: 36, display: "flex", alignItems: "stretch",
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        padding: "0 20px", gap: 0, flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              fontFamily: S.fontUI, fontSize: "0.6875rem",
              fontWeight: activeTab === tab.key ? 600 : 400,
              padding: "0 16px", border: "none",
              borderBottom: activeTab === tab.key ? `2px solid ${S.cyan}` : "2px solid transparent",
              color: activeTab === tab.key ? S.cyan : S.tertiary,
              background: "transparent", cursor: "pointer",
              display: "flex", alignItems: "center",
              transition: "color 0.15s, border-color 0.15s",
              letterSpacing: "0.04em",
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.06em",
        }}>
          {currentUser.length} USERS
        </span>
      </div>

      {/* Non-admin read-only banner */}
      {!isAdmin && (
        <div style={{
          background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`,
          margin: "16px 24px 0",
          padding: "8px 14px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 700,
            color: S.amber, letterSpacing: "0.08em",
          }}>
            READ-ONLY
          </span>
          <span style={{
            fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary,
          }}>
            You are viewing access control in read-only mode. Contact your administrator for changes.
          </span>
        </div>
      )}

      {/* Content area */}
      <div style={{
        flex: 1, maxWidth: 1440, width: "100%", margin: "0 auto",
        padding: "24px 24px 16px",
      }}>
        {activeTab === "users" && <UsersRolesPanel users={currentUser} currentEmail={currentEmail} />}
        {activeTab === "matrix" && <PermissionMatrixPanel token={token ?? ""} />}
        {activeTab === "hierarchy" && <BranchHierarchyPanel />}
      </div>

      {/* Footer */}
      <Footer renderTs={renderTs} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TopBar
// ═══════════════════════════════════════════════════════════════════════════════
function TopBar({ renderTs }: { renderTs: string }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 12, height: 44,
      padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.625rem", color: S.cyan,
        letterSpacing: "0.1em", fontWeight: 700,
      }}>
        GOVERNANCE
      </span>
      <span style={{ color: S.rim, userSelect: "none" }}>|</span>
      <span style={{
        fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700,
        letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary,
      }}>
        Access Control
      </span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em",
        color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}`,
      }}>RBAC</span>
      <div style={{ flex: 1 }} />
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em",
      }}>
        AS OF {renderTs}
      </span>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Footer
// ═══════════════════════════════════════════════════════════════════════════════
function Footer({ renderTs }: { renderTs: string }) {
  return (
    <footer style={{
      height: 32, display: "flex", alignItems: "center", justifyContent: "center",
      borderTop: `1px solid ${S.rim}`, background: S.bgPanel, flexShrink: 0,
    }}>
      <span suppressHydrationWarning style={{
        fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
        letterSpacing: "0.06em",
      }}>
        {renderTs} {"\u2014"} ORDR {"\u00B7"} Access Control
      </span>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1 — Users & Roles
// ═══════════════════════════════════════════════════════════════════════════════
function UsersRolesPanel({ users, currentEmail }: { users: DemoUser[]; currentEmail: string }) {
  const thStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 600,
    color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase",
    padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${S.rim}`,
    background: S.bgSub, whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.75rem", color: S.primary,
    padding: "8px 12px", borderBottom: `1px solid ${S.soft}`,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20,
    }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16,
        borderBottom: `1px solid ${S.soft}`, paddingBottom: 10,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>01</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>
          Users & Roles
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.pass,
          marginLeft: "auto", letterSpacing: "0.06em",
        }}>
          {users.filter(u => u.active).length} ACTIVE
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          letterSpacing: "0.06em",
        }}>
          {users.length} TOTAL
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Branch</th>
              <th style={thStyle}>Department</th>
              <th style={{ ...thStyle, textAlign: "center" }}>MFA</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
              <th style={thStyle}>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const isCurrent = u.email === currentEmail || u.isCurrentUser;
              return (
                <tr key={i} style={{
                  background: isCurrent
                    ? `color-mix(in srgb, ${S.cyan} 6%, transparent)`
                    : i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                  borderLeft: isCurrent ? `2px solid ${S.cyan}` : "2px solid transparent",
                }}>
                  {/* Name */}
                  <td style={{ ...tdStyle, fontFamily: S.fontUI, fontWeight: 600 }}>
                    <span style={{ color: S.primary }}>{u.name}</span>
                    {isCurrent && (
                      <span style={{
                        ...badge(S.cyan, "YOU"),
                        marginLeft: 6,
                        fontSize: 8,
                      }}>YOU</span>
                    )}
                  </td>

                  {/* Email */}
                  <td style={{ ...tdStyle, color: S.secondary, fontSize: "0.6875rem" }}>
                    {u.email}
                  </td>

                  {/* Role badge */}
                  <td style={tdStyle}>
                    <span style={badge(u.roleBadgeColor, u.role)}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>

                  {/* Branch */}
                  <td style={{ ...tdStyle, color: S.secondary, fontSize: "0.6875rem" }}>
                    {u.branch}
                  </td>

                  {/* Department */}
                  <td style={{ ...tdStyle, color: S.secondary, fontSize: "0.6875rem" }}>
                    {u.department}
                  </td>

                  {/* MFA */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {u.mfaEnabled ? (
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.pass }}>
                        {"\u2713"} MFA
                      </span>
                    ) : (
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.fail }}>
                        {"\u2717"} MFA
                      </span>
                    )}
                  </td>

                  {/* Status */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {u.active ? (
                      <span style={{
                        fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 700,
                        color: S.pass, letterSpacing: "0.08em",
                      }}>
                        ACTIVE
                      </span>
                    ) : (
                      <span style={{
                        fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 700,
                        color: S.tertiary, letterSpacing: "0.08em",
                      }}>
                        INACTIVE
                      </span>
                    )}
                  </td>

                  {/* Last Login */}
                  <td style={{
                    ...tdStyle, fontSize: "0.6875rem",
                    color: u.lastLogin === "Current session" ? S.cyan : S.tertiary,
                    fontStyle: u.lastLogin === "Current session" ? "italic" : "normal",
                  }}>
                    {u.lastLogin}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2 — Permission Matrix (live from GET /v1/admin/roles)
// ═══════════════════════════════════════════════════════════════════════════════
function PermissionMatrixPanel({ token }: { token: string }) {
  const [roles, setRoles] = useState<ApiRole[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    dashboardFetch("/v1/admin/roles", token)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiRole[]>;
      })
      .then(data => setRoles(data))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load roles"))
      .finally(() => setLoading(false));
  }, [token]);

  // All unique permission codenames across all roles, sorted
  const allPermissions = useMemo(() => {
    if (!roles) return [];
    const set = new Set<string>();
    for (const role of roles) for (const p of role.permissions) set.add(p);
    return [...set].sort();
  }, [roles]);

  // Group by module (first segment before ".")
  const byModule = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const perm of allPermissions) {
      const mod = perm.split(".")[0];
      (map[mod] ??= []).push(perm);
    }
    return map;
  }, [allPermissions]);

  // Flatten to a single list of rows for the table body (avoids Fragment key issues)
  const tableRows = useMemo(() => {
    type ModuleRow = { kind: "module"; mod: string };
    type PermRow   = { kind: "perm"; perm: string; stripe: boolean };
    const rows: (ModuleRow | PermRow)[] = [];
    for (const [mod, perms] of Object.entries(byModule)) {
      rows.push({ kind: "module", mod });
      perms.forEach((perm, i) => rows.push({ kind: "perm", perm, stripe: i % 2 !== 0 }));
    }
    return rows;
  }, [byModule]);

  const thStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 600,
    color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase",
    padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${S.rim}`,
    background: S.bgSub, whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.6875rem",
    padding: "6px 10px", borderBottom: `1px solid ${S.soft}`,
    textAlign: "center", whiteSpace: "nowrap",
  };
  const roleLabel = (name: string) =>
    name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20 }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16,
        borderBottom: `1px solid ${S.soft}`, paddingBottom: 10,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>02</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>
          Permission Matrix
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary, marginLeft: "auto", letterSpacing: "0.06em" }}>
          {loading
            ? "LOADING…"
            : error
              ? "ERROR"
              : `${roles?.length ?? 0} ROLES \u00B7 ${allPermissions.length} PERMISSIONS \u00B7 BACKEND \u00B7 LIVE`
          }
        </span>
      </div>

      {loading && (
        <div style={{ padding: "32px 0", textAlign: "center", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>
          Loading roles from backend…
        </div>
      )}

      {error && (
        <div style={{
          padding: "12px 16px",
          background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`,
          fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.fail,
        }}>
          Failed to load roles: {error}
        </div>
      )}

      {!loading && !error && roles && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left", minWidth: 220 }}>Permission</th>
                {roles.map(role => (
                  <th key={role.id} style={{ ...thStyle, minWidth: 90 }}>
                    {roleLabel(role.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map(row => {
                if (row.kind === "module") {
                  return (
                    <tr key={`mod-${row.mod}`}>
                      <td
                        colSpan={(roles?.length ?? 0) + 1}
                        style={{
                          fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 700,
                          letterSpacing: "0.1em", textTransform: "uppercase",
                          color: S.cyan, padding: "8px 10px 4px",
                          background: `color-mix(in srgb, ${S.cyan} 5%, transparent)`,
                          borderBottom: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
                        }}
                      >
                        {row.mod}
                      </td>
                    </tr>
                  );
                }
                const action = row.perm.split(".").slice(1).join(".");
                return (
                  <tr
                    key={row.perm}
                    style={{ background: row.stripe ? `color-mix(in srgb, ${S.bgSub} 40%, transparent)` : "transparent" }}
                  >
                    <td style={{ ...tdStyle, textAlign: "left", fontFamily: S.fontUI, fontSize: "0.75rem", color: S.primary, fontWeight: 500 }}>
                      {action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      <span style={{ marginLeft: 8, fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary }}>
                        {row.perm}
                      </span>
                    </td>
                    {roles.map(role => (
                      <td key={role.id} style={tdStyle}>
                        {role.permissions.includes(row.perm)
                          ? <span style={{ color: S.pass, fontWeight: 700 }}>{"\u2713"}</span>
                          : <span style={{ color: S.tertiary }}>{"\u2014"}</span>
                        }
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3 — Branch Hierarchy
// ═══════════════════════════════════════════════════════════════════════════════
function BranchHierarchyPanel() {
  return (
    <div style={{
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      borderLeft: `3px solid ${S.amber}`,
      padding: "20px 24px",
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
    }}>
      <div>
        <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.amber, marginBottom: 6 }}>
          ADMINISTRATOR REQUIRED
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary, marginBottom: 4 }}>
          Branch Hierarchy Configuration
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.5 }}>
          Contact your administrator to configure the organizational branch hierarchy and approval chains.
        </div>
      </div>
    
    <HelpPanel config={ACCESS_CONTROL_HELP} storageKey="access-control" />
    </div>
  );
}
