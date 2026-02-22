"use client";

/**
 * access-control/page.tsx — Access Control
 *
 * Governance > Access Control
 * Users & Roles | Permission Matrix | Branch Hierarchy
 */

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import EmptyState from "../../components/ui/EmptyState";

// ── Hydration-safe timestamp hook ─────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

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

// ── Demo users (Mexican manufacturing company) ───────────────────────────────
const DEMO_USERS: DemoUser[] = [
  { name: "Maria Torres",     email: "m.torres@synexiun.com",       role: "CFO",             roleBadgeColor: S.amber,     branch: "MX-CORP", department: "Treasury",         mfaEnabled: true,  active: true,  lastLogin: "2026-02-22 08:30" },
  { name: "Carlos Reyes",     email: "c.reyes@synexiun.com",        role: "Head of Risk",    roleBadgeColor: S.cyan,      branch: "MX-CORP", department: "Risk Management",   mfaEnabled: true,  active: true,  lastLogin: "2026-02-22 09:15" },
  { name: "Juan Martinez",    email: "j.martinez@synexiun.com",     role: "Analyst",         roleBadgeColor: S.tertiary,  branch: "MX-CORP", department: "Treasury",         mfaEnabled: true,  active: true,  lastLogin: "2026-02-21 17:00" },
  { name: "Sofia Hernandez",  email: "s.hernandez@synexiun.com",    role: "Trader",          roleBadgeColor: S.tertiary,  branch: "MX-CORP", department: "Execution",        mfaEnabled: false, active: true,  lastLogin: "2026-02-22 07:45" },
  { name: "Roberto Diaz",     email: "r.diaz@synexiun.com",         role: "Auditor",         roleBadgeColor: "#a78bfa",   branch: "MX-CORP", department: "Compliance",       mfaEnabled: true,  active: true,  lastLogin: "2026-02-20 14:00" },
  { name: "Ana Garcia",       email: "a.garcia@synexiun.com",       role: "Branch Manager",  roleBadgeColor: S.cyan,      branch: "MX-GDL",  department: "Operations",       mfaEnabled: true,  active: true,  lastLogin: "2026-02-21 10:30" },
  { name: "Pedro Morales",    email: "p.morales@synexiun.com",      role: "Analyst",         roleBadgeColor: S.tertiary,  branch: "MX-GDL",  department: "Treasury",         mfaEnabled: false, active: false, lastLogin: "2026-01-15 09:00" },
  { name: "Demo User",        email: "demo@ordr-terminal.com",      role: "Admin",           roleBadgeColor: S.amber,     branch: "MX-CORP", department: "IT",               mfaEnabled: true,  active: true,  lastLogin: "Current session", isCurrentUser: true },
];

// ── Permission matrix data ───────────────────────────────────────────────────
const ROLES = ["Admin", "CFO", "Head of Risk", "Branch Manager", "Trader", "Analyst", "Auditor"] as const;

interface PermissionRow {
  permission: string;
  grants: Record<string, boolean>;
}

const PERMISSION_ROWS: PermissionRow[] = [
  { permission: "View Positions",       grants: { Admin: true, CFO: true, "Head of Risk": true, "Branch Manager": true, Trader: true, Analyst: true, Auditor: true } },
  { permission: "Create/Edit Positions", grants: { Admin: true, CFO: true, "Head of Risk": true, "Branch Manager": true, Trader: true, Analyst: false, Auditor: false } },
  { permission: "Delete Positions",     grants: { Admin: true, CFO: true, "Head of Risk": false, "Branch Manager": false, Trader: false, Analyst: false, Auditor: false } },
  { permission: "Run Sandbox",          grants: { Admin: true, CFO: true, "Head of Risk": true, "Branch Manager": true, Trader: true, Analyst: true, Auditor: false } },
  { permission: "Create Proposals",     grants: { Admin: true, CFO: true, "Head of Risk": true, "Branch Manager": true, Trader: true, Analyst: false, Auditor: false } },
  { permission: "Approve Staging",      grants: { Admin: true, CFO: true, "Head of Risk": true, "Branch Manager": true, Trader: false, Analyst: false, Auditor: false } },
  { permission: "Execute Trades",       grants: { Admin: true, CFO: true, "Head of Risk": true, "Branch Manager": false, Trader: false, Analyst: false, Auditor: false } },
  { permission: "Manage Policies",      grants: { Admin: true, CFO: true, "Head of Risk": true, "Branch Manager": false, Trader: false, Analyst: false, Auditor: false } },
  { permission: "View Audit Trail",     grants: { Admin: true, CFO: true, "Head of Risk": true, "Branch Manager": true, Trader: true, Analyst: true, Auditor: true } },
  { permission: "Export Data",          grants: { Admin: true, CFO: true, "Head of Risk": true, "Branch Manager": true, Trader: false, Analyst: false, Auditor: true } },
  { permission: "Manage Users",         grants: { Admin: true, CFO: false, "Head of Risk": false, "Branch Manager": false, Trader: false, Analyst: false, Auditor: false } },
  { permission: "System Configuration", grants: { Admin: true, CFO: false, "Head of Risk": false, "Branch Manager": false, Trader: false, Analyst: false, Auditor: false } },
];

// ── Branch hierarchy data ────────────────────────────────────────────────────
interface BranchNode {
  code: string;
  name: string;
  type: "company" | "branch" | "department";
  userCount?: number;
  approvalChain?: string;
  children?: BranchNode[];
}

const BRANCH_TREE: BranchNode = {
  code: "SYNEX",
  name: "Synexiun Manufacturing S.A. de C.V.",
  type: "company",
  children: [
    {
      code: "MX-CORP",
      name: "Corporate Treasury (Mexico City)",
      type: "branch",
      userCount: 6,
      approvalChain: "Analyst \u2192 CFO \u2192 Head of Risk",
      children: [
        { code: "TREAS",   name: "Treasury Department",  type: "department", userCount: 3, approvalChain: "Analyst \u2192 CFO" },
        { code: "RISK",    name: "Risk Management",      type: "department", userCount: 1, approvalChain: "Head of Risk" },
        { code: "EXEC",    name: "Execution",            type: "department", userCount: 1, approvalChain: "Trader \u2192 CFO" },
        { code: "COMPL",   name: "Compliance",           type: "department", userCount: 1, approvalChain: "Auditor \u2192 CFO" },
        { code: "IT",      name: "IT",                   type: "department", userCount: 1, approvalChain: "Admin" },
      ],
    },
    {
      code: "MX-GDL",
      name: "Guadalajara Operations",
      type: "branch",
      userCount: 2,
      approvalChain: "Analyst \u2192 Branch Manager \u2192 CFO",
      children: [
        { code: "OPS",    name: "Operations",  type: "department", userCount: 1, approvalChain: "Branch Manager" },
        { code: "TREAS2", name: "Treasury",    type: "department", userCount: 1, approvalChain: "Analyst \u2192 Branch Manager" },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function AccessControlPage() {
  const renderTs = useRenderTs();
  const { isAuthenticated, token, user, isDemoMode } = useAuth();
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

  // ── Non-demo empty state ──────────────────────────────────────────────────
  if (!DEMO_MODE && !isDemoMode) {
    return (
      <div style={{
        background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI,
        display: "flex", flexDirection: "column",
      }}>
        <TopBar renderTs={renderTs} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <EmptyState
            type="empty"
            title="Access Control"
            message="Contact your administrator for access control settings."
          />
        </div>
        <Footer renderTs={renderTs} />
      </div>
    );
  }

  // Resolve current user email for highlighting
  const currentEmail = user?.email ?? "demo@ordr-terminal.com";

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
          {DEMO_USERS.length} USERS
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
        {activeTab === "users" && <UsersRolesPanel currentEmail={currentEmail} />}
        {activeTab === "matrix" && <PermissionMatrixPanel />}
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
function UsersRolesPanel({ currentEmail }: { currentEmail: string }) {
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
          {DEMO_USERS.filter(u => u.active).length} ACTIVE
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          letterSpacing: "0.06em",
        }}>
          {DEMO_USERS.length} TOTAL
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
            {DEMO_USERS.map((u, i) => {
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
// Tab 2 — Permission Matrix
// ═══════════════════════════════════════════════════════════════════════════════
function PermissionMatrixPanel() {
  const thStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 600,
    color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase",
    padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${S.rim}`,
    background: S.bgSub, whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.75rem",
    padding: "7px 10px", borderBottom: `1px solid ${S.soft}`,
    textAlign: "center", whiteSpace: "nowrap",
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
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>02</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>
          Permission Matrix
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          marginLeft: "auto", letterSpacing: "0.06em",
        }}>
          {ROLES.length} ROLES {"\u00B7"} {PERMISSION_ROWS.length} PERMISSIONS
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 180 }}>Permission</th>
              {ROLES.map(role => (
                <th key={role} style={{ ...thStyle, minWidth: 90 }}>{role}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_ROWS.map((row, i) => (
              <tr key={row.permission} style={{
                background: i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
              }}>
                <td style={{
                  ...tdStyle, textAlign: "left",
                  fontFamily: S.fontUI, fontSize: "0.75rem",
                  color: S.primary, fontWeight: 500,
                }}>
                  {row.permission}
                </td>
                {ROLES.map(role => (
                  <td key={role} style={tdStyle}>
                    {row.grants[role] ? (
                      <span style={{ color: S.pass, fontWeight: 700 }}>{"\u2713"}</span>
                    ) : (
                      <span style={{ color: S.tertiary }}>{"\u2014"}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3 — Branch Hierarchy
// ═══════════════════════════════════════════════════════════════════════════════
function BranchHierarchyPanel() {
  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20,
    }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16,
        borderBottom: `1px solid ${S.soft}`, paddingBottom: 10,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>03</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>
          Branch Hierarchy
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          marginLeft: "auto", letterSpacing: "0.06em",
        }}>
          2 BRANCHES {"\u00B7"} 7 DEPARTMENTS
        </span>
      </div>

      <TreeNode node={BRANCH_TREE} depth={0} isLast={true} />
    </div>
  );
}

// ── Tree node recursive renderer ─────────────────────────────────────────────
function TreeNode({ node, depth, isLast }: { node: BranchNode; depth: number; isLast: boolean }) {
  const indent = depth * 28;
  const hasChildren = node.children && node.children.length > 0;

  // Node type colors
  const typeColor = node.type === "company" ? S.amber
    : node.type === "branch" ? S.cyan
    : S.secondary;

  const typeLabel = node.type === "company" ? "COMPANY"
    : node.type === "branch" ? "BRANCH"
    : "DEPT";

  // Connector character
  const connector = depth === 0 ? "" : isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";

  return (
    <div>
      {/* Node row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        paddingLeft: indent, paddingTop: 6, paddingBottom: 6,
        borderBottom: `1px solid ${S.soft}`,
      }}>
        {/* Connector */}
        {depth > 0 && (
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.rim,
            whiteSpace: "pre", userSelect: "none", lineHeight: 1,
          }}>
            {connector}
          </span>
        )}

        {/* Type badge */}
        <span style={badge(typeColor, typeLabel)}>
          {typeLabel}
        </span>

        {/* Code */}
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700,
          color: typeColor, letterSpacing: "0.04em",
        }}>
          {node.code}
        </span>

        {/* Separator */}
        <span style={{ color: S.rim, userSelect: "none" }}>{"\u2014"}</span>

        {/* Name */}
        <span style={{
          fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 500,
          color: S.primary,
        }}>
          {node.name}
        </span>

        {/* User count */}
        {node.userCount !== undefined && (
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
            letterSpacing: "0.06em", marginLeft: 4,
          }}>
            {node.userCount} {node.userCount === 1 ? "user" : "users"}
          </span>
        )}

        {/* Approval chain */}
        {node.approvalChain && (
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
            letterSpacing: "0.04em", marginLeft: "auto",
            padding: "2px 8px", border: `1px solid ${S.rim}`,
            background: `color-mix(in srgb, ${S.bgSub} 60%, transparent)`,
          }}>
            CHAIN: {node.approvalChain}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && node.children!.map((child, i) => (
        <TreeNode
          key={child.code}
          node={child}
          depth={depth + 1}
          isLast={i === node.children!.length - 1}
        />
      ))}
    </div>
  );
}
