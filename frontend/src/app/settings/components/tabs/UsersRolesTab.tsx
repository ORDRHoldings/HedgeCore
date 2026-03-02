"use client";
import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { S } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";

interface UserRow {
  id:         string;
  email:      string;
  full_name:  string | null;
  is_active:  boolean;
  roles:      string[];
  created_at: string;
}

interface RoleDef {
  name:            string;
  display_name:    string;
  hierarchy_level: number;
}

interface Props { token: string; }

function roleBadgeColor(role: string): string {
  if (["admin","cfo","ceo"].includes(role))            return S.amber;
  if (["head_of_risk","branch_manager"].includes(role)) return S.cyan;
  if (["auditor"].includes(role))                       return S.violet;
  return S.secondary;
}

export default function UsersRolesTab({ token }: Props) {
  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [roles,    setRoles]    = useState<RoleDef[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [saving,   setSaving]   = useState<string | null>(null); // user id being saved
  const [editRole, setEditRole] = useState<Record<string, string>>({});
  const [toast,    setToast]    = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        dashboardFetch("/v1/admin/users", token),
        dashboardFetch("/v1/admin/roles", token),
      ]);
      if (!usersRes.ok) throw new Error(`Users: HTTP ${usersRes.status}`);
      if (!rolesRes.ok) throw new Error(`Roles: HTTP ${rolesRes.status}`);
      const usersData = await usersRes.json() as { users?: UserRow[] } | UserRow[];
      const rolesData = await rolesRes.json() as { roles?: RoleDef[] } | RoleDef[];
      const userList = Array.isArray(usersData) ? usersData : (usersData as { users?: UserRow[] }).users ?? [];
      const roleList = Array.isArray(rolesData) ? rolesData : (rolesData as { roles?: RoleDef[] }).roles ?? [];
      setUsers(userList);
      setRoles(roleList.sort((a, b) => b.hierarchy_level - a.hierarchy_level));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load users and roles.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleRoleChange = async (userId: string) => {
    const newRole = editRole[userId];
    if (!newRole) return;
    setSaving(userId);
    try {
      const res = await dashboardFetch(`/v1/admin/users/${userId}/role`, token, {
        method: "PATCH",
        body:   JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, roles: [newRole] } : u));
      setEditRole(prev => { const n = { ...prev }; delete n[userId]; return n; });
      showToast("success", "Role updated.");
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Failed to update role.");
    } finally {
      setSaving(null);
    }
  };

  const headerCell: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.09em",
    color: S.tertiary, textTransform: "uppercase", padding: "6px 10px",
    borderBottom: `1px solid ${S.rim}`, textAlign: "left",
  };
  const cell: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: 12, color: S.primary,
    padding: "8px 10px", borderBottom: `1px solid ${S.soft}`,
  };

  if (loading) return (
    <div style={{ padding: "40px 0", textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.09em" }}>
      LOADING USERS…
    </div>
  );

  if (error) return (
    <div style={{ background: `color-mix(in srgb, ${S.fail} 8%, transparent)`, border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`, borderRadius: 2, padding: "12px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.fail }}>
      ✗ {error}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {toast && (
        <div style={{
          background: toast.kind === "success" ? "#064E3B" : "#450A0A",
          border: `1px solid ${toast.kind === "success" ? S.pass : S.fail}`,
          borderLeft: `3px solid ${toast.kind === "success" ? S.pass : S.fail}`,
          borderRadius: 2, padding: "8px 14px",
          fontFamily: S.fontUI, fontSize: 12, color: S.primary,
        }}>
          {toast.kind === "success" ? "✓" : "✗"} {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeader label={`Team Members (${users.length})`} />
        <button onClick={load} style={{
          fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}40`,
          borderRadius: 2, padding: "4px 10px", cursor: "pointer",
        }}>↻ REFRESH</button>
      </div>

      <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headerCell}>USER</th>
              <th style={headerCell}>EMAIL</th>
              <th style={headerCell}>CURRENT ROLE</th>
              <th style={headerCell}>STATUS</th>
              <th style={headerCell}>ASSIGN ROLE</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...cell, textAlign: "center", color: S.tertiary, padding: "24px" }}>
                  No users found.
                </td>
              </tr>
            ) : users.map(u => {
              const role = u.roles[0] ?? "—";
              const roleColor = roleBadgeColor(role);
              const pendingRole = editRole[u.id];
              return (
                <tr key={u.id}>
                  <td style={cell}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary }}>
                      {u.full_name ?? "—"}
                    </span>
                  </td>
                  <td style={{ ...cell, fontFamily: S.fontMono, fontSize: 11 }}>{u.email}</td>
                  <td style={cell}>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                      color: roleColor,
                      background: `color-mix(in srgb, ${roleColor} 10%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${roleColor} 25%, transparent)`,
                      padding: "2px 7px", borderRadius: 2,
                    }}>
                      {role.toUpperCase()}
                    </span>
                  </td>
                  <td style={cell}>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                      color: u.is_active ? S.pass : S.tertiary,
                    }}>
                      {u.is_active ? "● ACTIVE" : "○ INACTIVE"}
                    </span>
                  </td>
                  <td style={{ ...cell, padding: "6px 10px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select
                        value={pendingRole ?? ""}
                        onChange={e => setEditRole(prev => ({ ...prev, [u.id]: e.target.value }))}
                        style={{
                          fontFamily: S.fontUI, fontSize: 11, color: S.primary,
                          background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2,
                          padding: "4px 6px", outline: "none",
                        }}
                      >
                        <option value="">— select —</option>
                        {roles.map(r => (
                          <option key={r.name} value={r.name}>{r.display_name} (L{r.hierarchy_level})</option>
                        ))}
                      </select>
                      {pendingRole && (
                        <button
                          onClick={() => handleRoleChange(u.id)}
                          disabled={saving === u.id}
                          style={{
                            fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                            color: "#000", background: saving === u.id ? S.tertiary : S.cyan,
                            border: "none", borderRadius: 2, padding: "4px 10px",
                            cursor: saving === u.id ? "wait" : "pointer",
                          }}
                        >
                          {saving === u.id ? "…" : "ASSIGN"}
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

      <div style={{ background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "10px 14px", fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.6 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.secondary, marginRight: 6, letterSpacing: "0.07em" }}>RBAC</span>
        Role assignments are bounded by your own hierarchy_level. You cannot assign a role with a higher level than your own.
        9 roles span hierarchy_level 0 (junior_analyst) through 15 (admin). Changes are effective immediately and audit-logged.
      </div>
    </div>
  );
}
