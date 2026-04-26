"use client";
import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { S } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";

/* ── Backend shapes ──────────────────────────────────────────────────────── */
interface UserItem {
  id:        string;
  email:     string;
  is_active: boolean;
  roles:     string[];
}

interface PaginatedUsers {
  items: UserItem[];
  total: number;
  page:  number;
  size:  number;
  pages: number;
}

interface RoleDef {
  id:              string | number;
  name:            string;
  description:     string | null;
  hierarchy_level: number;
  is_system:       boolean;
  permissions?:    { codename: string; module: string }[];
}

interface Props { token: string; }

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function roleColor(name: string): string {
  if (["admin", "cfo", "ceo"].includes(name))            return S.amber;
  if (["head_of_risk", "branch_manager"].includes(name)) return S.cyan;
  if (["auditor"].includes(name))                        return "#3B82F6";
  if (["supervisor"].includes(name))                     return "#3B82F6";
  return S.secondary;
}

function levelColor(lvl: number): string {
  if (lvl >= 12) return S.amber;
  if (lvl >= 8)  return S.cyan;
  if (lvl >= 5)  return "#3B82F6";
  return S.secondary;
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function UsersRolesTab({ token }: Props) {
  const [users,       setUsers]       = useState<UserItem[]>([]);
  const [roles,       setRoles]       = useState<RoleDef[]>([]);
  const [totalUsers,  setTotalUsers]  = useState(0);
  const [totalPages,  setTotalPages]  = useState(1);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [toast,       setToast]       = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [assigning,   setAssigning]   = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Record<string, string>>({});
  const [expandRole,  setExpandRole]  = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; userEmail: string; roleName: string } | null>(null);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async (pg = 1) => {
    setLoading(true); setError(null);
    try {
      const [uRes, rRes] = await Promise.all([
        dashboardFetch(`/admin/users?page=${pg}&size=25`, token),
        dashboardFetch("/v1/admin/roles", token),
      ]);
      if (!uRes.ok) throw new Error(`Users: HTTP ${uRes.status}`);
      if (!rRes.ok) throw new Error(`Roles: HTTP ${rRes.status}`);

      const ud = await uRes.json() as PaginatedUsers;
      const rd = await rRes.json() as RoleDef[];

      setUsers(ud.items ?? []);
      setTotalUsers(ud.total ?? 0);
      setTotalPages(ud.pages ?? 1);
      setRoles((Array.isArray(rd) ? rd : []).sort((a, b) => b.hierarchy_level - a.hierarchy_level));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load users and roles.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  /* Assign role */
  const handleAssign = async (userId: string) => {
    const roleName = pendingRole[userId];
    if (!roleName) return;
    const role = roles.find(r => r.name === roleName);
    if (!role) return;
    setAssigning(userId);
    try {
      const res = await dashboardFetch(`/admin/users/${userId}/roles`, token, {
        method: "POST",
        body: JSON.stringify({ body: { user_id: userId, role_id: String(role.id) } }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, roles: [...new Set([...u.roles, roleName])] } : u));
      setPendingRole(prev => { const n = { ...prev }; delete n[userId]; return n; });
      showToast("success", `Role "${roleName}" assigned.`);
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Failed to assign role.");
    } finally { setAssigning(null); }
  };

  /* Remove role — caller must pre-confirm via the modal. */
  const handleRemove = async (userId: string, roleName: string) => {
    const role = roles.find(r => r.name === roleName);
    if (!role) return;
    setAssigning(userId);
    try {
      const res = await dashboardFetch(`/admin/users/${userId}/roles`, token, {
        method: "DELETE",
        body: JSON.stringify({ body: { user_id: userId, role_id: String(role.id) } }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, roles: u.roles.filter(r => r !== roleName) } : u));
      showToast("success", `Role "${roleName}" removed.`);
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Failed to remove role.");
    } finally {
      setAssigning(null);
      setConfirmRemove(null);
    }
  };

  const goPage = (p: number) => { setPage(p); load(p); };

  const filtered = search.trim()
    ? users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()))
    : users;

  /* ── Styles ──────────────────────────────────────────────────────────── */
  const th: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.09em",
    color: S.tertiary, textTransform: "uppercase", padding: "6px 10px",
    borderBottom: `1px solid ${S.rim}`, textAlign: "left",
  };
  const td: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: 12, color: S.primary,
    padding: "8px 10px", borderBottom: `1px solid ${S.soft}`, verticalAlign: "middle",
  };

  if (loading) return (
    <div style={{ padding: "40px 0", textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.09em" }}>
      LOADING USERS…
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ background: `color-mix(in srgb, ${S.fail} 8%, transparent)`, border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`, borderRadius: 2, padding: "12px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.fail }}>
        ✗ {error}
      </div>
      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, padding: "0 4px" }}>
        Admin role required. Ensure you are authenticated as an admin user.
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {toast && (
        <div style={{
          background: toast.kind === "success" ? "#064E3B" : "#450A0A",
          border: `1px solid ${toast.kind === "success" ? S.pass : S.fail}`,
          borderLeft: `3px solid ${toast.kind === "success" ? S.pass : S.fail}`,
          borderRadius: 2, padding: "8px 14px", fontFamily: S.fontUI, fontSize: 12, color: S.primary,
        }}>
          {toast.kind === "success" ? "✓" : "✗"} {toast.msg}
        </div>
      )}

      {/* ── User Directory ─────────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionHeader label={`Team Members (${totalUsers})`} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              placeholder="Search by email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                fontFamily: S.fontUI, fontSize: 12, color: S.primary,
                background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
                padding: "5px 10px", outline: "none", width: 200,
              }}
            />
            <button onClick={() => load(page)} style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan,
              background: "transparent", border: `1px solid ${S.cyan}40`, borderRadius: 2,
              padding: "4px 10px", cursor: "pointer",
            }}>↻</button>
          </div>
        </div>

        <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                <th scope="col" style={th}>EMAIL</th>
                <th scope="col" style={th}>ROLES</th>
                <th scope="col" style={th}>STATUS</th>
                <th scope="col" style={th}>ASSIGN ROLE</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...td, textAlign: "center", color: S.tertiary, padding: "28px" }}>
                    {search ? "No users match the search." : "No users found."}
                  </td>
                </tr>
              ) : filtered.map(u => {
                const pending = pendingRole[u.id];
                return (
                  <tr key={u.id}>
                    <td style={{ ...td, fontFamily: S.fontMono, fontSize: 12 }}>
                      {u.email}
                      <span style={{ display: "block", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 1 }}>
                        {u.id.slice(0, 8)}…
                      </span>
                    </td>

                    <td style={{ ...td, maxWidth: 220 }}>
                      {u.roles.length === 0 ? (
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>— no role —</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {u.roles.map(r => {
                            const rc = roleColor(r);
                            return (
                              <span key={r} style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                                color: rc,
                                background: `color-mix(in srgb, ${rc} 10%, transparent)`,
                                border: `1px solid color-mix(in srgb, ${rc} 25%, transparent)`,
                                padding: "2px 6px", borderRadius: 2,
                              }}>
                                {r.toUpperCase()}
                                <button
                                  onClick={() => setConfirmRemove({ userId: u.id, userEmail: u.email, roleName: r })}
                                  disabled={assigning === u.id}
                                  title={`Remove ${r}`}
                                  style={{ fontFamily: S.fontMono, fontSize: 12, color: rc, background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, opacity: 0.8 }}
                                >×</button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    <td style={td}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: u.is_active ? S.pass : S.tertiary }}>
                        {u.is_active ? "● ACTIVE" : "○ INACTIVE"}
                      </span>
                    </td>

                    <td style={{ ...td, padding: "6px 10px" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <select
                          value={pending ?? ""}
                          onChange={e => setPendingRole(prev => ({ ...prev, [u.id]: e.target.value }))}
                          disabled={assigning === u.id}
                          style={{
                            fontFamily: S.fontUI, fontSize: 12, color: S.primary,
                            background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2,
                            padding: "4px 6px", outline: "none",
                          }}
                        >
                          <option value="">+ Add role…</option>
                          {roles.map(r => (
                            <option key={String(r.id)} value={r.name}>
                              {r.name} (L{r.hierarchy_level})
                            </option>
                          ))}
                        </select>
                        {pending && (
                          <button onClick={() => handleAssign(u.id)} disabled={assigning === u.id} style={{
                            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                            color: S.black, background: assigning === u.id ? S.tertiary : S.cyan,
                            border: "none", borderRadius: 2, padding: "4px 10px",
                            cursor: assigning === u.id ? "wait" : "pointer",
                          }}>
                            {assigning === u.id ? "…" : "ASSIGN"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 }}>
            <button disabled={page <= 1} onClick={() => goPage(page - 1)} style={{
              fontFamily: S.fontMono, fontSize: 12, color: page <= 1 ? S.tertiary : S.secondary,
              background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 2,
              padding: "4px 10px", cursor: page <= 1 ? "not-allowed" : "pointer",
            }}>← PREV</button>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => goPage(page + 1)} style={{
              fontFamily: S.fontMono, fontSize: 12, color: page >= totalPages ? S.tertiary : S.secondary,
              background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 2,
              padding: "4px 10px", cursor: page >= totalPages ? "not-allowed" : "pointer",
            }}>NEXT →</button>
          </div>
        )}
      </div>

      {/* ── Role Directory ─────────────────────────────────────────────── */}
      {roles.length > 0 && (
        <div>
          <SectionHeader label={`Role Directory (${roles.length})`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8, marginTop: 10 }}>
            {roles.map(r => {
              const isExp = expandRole === r.name;
              const lc    = levelColor(r.hierarchy_level);
              const perms = r.permissions ?? [];
              return (
                <div key={r.name}
                  onClick={() => setExpandRole(isExp ? null : r.name)}
                  style={{
                    background: S.bgSub, border: `1px solid ${isExp ? lc + "50" : S.soft}`,
                    borderTop: `2px solid ${lc}`, borderRadius: 2, padding: "12px 14px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{r.name}</span>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
                      color: lc, background: `color-mix(in srgb, ${lc} 10%, transparent)`,
                      border: `1px solid ${lc}30`, borderRadius: 2, padding: "1px 5px",
                    }}>L{r.hierarchy_level}</span>
                  </div>
                  {r.description && (
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginBottom: 6, lineHeight: 1.4 }}>
                      {r.description}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {r.is_system && (
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`, border: `1px solid ${S.cyan}25`, padding: "1px 5px", borderRadius: 2 }}>SYS</span>
                    )}
                    {perms.length > 0 && (
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{perms.length} perms</span>
                    )}
                    <span style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && perms.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: `1px solid ${S.soft}`, paddingTop: 8, display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {perms.map(p => (
                        <span key={p.codename} style={{
                          fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
                          background: S.bgPanel, border: `1px solid ${S.soft}`,
                          padding: "1px 4px", borderRadius: 2,
                        }}>{p.codename}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "10px 14px", fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.6 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.secondary, marginRight: 6, letterSpacing: "0.07em" }}>RBAC</span>
        Roles are bounded by your own hierarchy_level. You cannot assign a role with a higher level than your own.
        Click a role card to expand its permission set. Role changes are effective immediately and audit-logged.
      </div>

      {/* Role removal confirmation — destructive, audit-logged */}
      {confirmRemove && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-role-title"
          onClick={() => assigning === null && setConfirmRemove(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: S.bgPanel, border: `1px solid ${S.fail}`,
              borderLeft: `3px solid ${S.fail}`,
              borderRadius: 2, padding: "20px 22px", maxWidth: 460, width: "100%",
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div id="remove-role-title" style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              color: S.fail, letterSpacing: "0.09em",
            }}>
              REMOVE ROLE · AUDIT-LOGGED
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary, lineHeight: 1.6 }}>
              Remove role <code style={{
                fontFamily: S.fontMono, fontSize: 12, color: roleColor(confirmRemove.roleName), fontWeight: 700,
              }}>{confirmRemove.roleName.toUpperCase()}</code>{" "}
              from <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan }}>{confirmRemove.userEmail}</span>?{" "}
              Their permissions will narrow immediately. If this is their only role, they will lose UI access.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmRemove(null)}
                disabled={assigning !== null}
                style={{
                  fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
                  background: "transparent", border: `1px solid ${S.rim}`,
                  borderRadius: 2, padding: "6px 14px",
                  cursor: assigning !== null ? "wait" : "pointer",
                }}
              >
                CANCEL
              </button>
              <button
                onClick={() => handleRemove(confirmRemove.userId, confirmRemove.roleName)}
                disabled={assigning !== null}
                style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                  color: S.white, background: S.fail, border: "none",
                  borderRadius: 2, padding: "6px 16px",
                  cursor: assigning !== null ? "wait" : "pointer",
                }}
              >
                {assigning === confirmRemove.userId ? "REMOVING…" : "REMOVE ROLE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
