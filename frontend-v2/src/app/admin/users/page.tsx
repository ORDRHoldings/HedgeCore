"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  rim: "var(--border-rim,#E2E8F0)",
  accentRed: "var(--accent-red,#DC2626)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  statusPass: "var(--status-pass,#059669)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

function NotFound() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-deep)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 48, fontWeight: 700, color: "var(--border-soft)" }}>404</div>
        <div style={{ fontFamily: "var(--font-terminal)", fontSize: 14, color: "var(--text-tertiary)", marginTop: 8 }}>Page not found</div>
      </div>
    </div>
  );
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  is_active: boolean;
  is_superuser: boolean;
  mfa_enabled?: boolean;
  last_login?: string | null;
  company: { id: string; name: string } | null;
  roles: string[];
  permissions: string[];
  created_at?: string;
}

interface UserListResponse {
  items: AdminUser[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

interface CreateUserForm {
  email: string;
  full_name: string;
  password: string;
  company_id: string;
  role: string;
}

const INPUT_STYLE = {
  width: "100%",
  fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontSize: 12,
  color: "var(--text-primary,#0F172A)",
  background: "var(--bg-deep,#F8FAFC)",
  border: "1px solid var(--border-rim,#E2E8F0)",
  borderRadius: 5,
  padding: "8px 12px",
  outline: "none",
  boxSizing: "border-box" as const,
};

export default function AdminUsersPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: "",
    full_name: "",
    password: "",
    company_id: "",
    role: "analyst",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UserListResponse>(`/v1/admin/users?page=${p}&size=20`);
      setUsers(res.items);
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_superuser) fetchUsers(1);
  }, [user, fetchUsers]);

  if (!user?.is_superuser) return <NotFound />;

  const handleCreate = async () => {
    setSubmitting(true);
    setCreateError(null);
    try {
      await api.post("/v1/admin/users", createForm);
      setCreateSuccess(true);
      setCreateForm({ email: "", full_name: "", password: "", company_id: "", role: "analyst" });
      fetchUsers(page);
      setTimeout(() => {
        setShowCreate(false);
        setCreateSuccess(false);
      }, 1500);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "28px 32px", minHeight: "calc(100vh - 92px)", background: S.bgDeep }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
            COMMAND CENTER / USERS
          </div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.textPrimary, margin: 0 }}>
            USER MANAGEMENT
          </h1>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 4 }}>
            {total} total users across all tenants
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: S.bgPanel,
            background: S.accentRed,
            border: "none",
            borderRadius: 5,
            padding: "8px 18px",
            cursor: "pointer",
          }}
        >
          + CREATE USER
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "10px 16px",
            background: "#FEF2F2",
            border: `1px solid ${S.accentRed}`,
            borderRadius: 5,
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.accentRed,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            Loading users...
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub, borderBottom: `1px solid ${S.rim}` }}>
                {["EMAIL", "COMPANY", "ROLES", "MFA", "LAST LOGIN", "ACTIONS"].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.07em",
                      color: S.textTertiary,
                      padding: "10px 16px",
                      textAlign: "left",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  style={{ borderBottom: `1px solid ${S.rim}`, cursor: "pointer" }}
                  onClick={() => setSelectedUser(u)}
                >
                  <td style={{ padding: "11px 16px" }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.textPrimary }}>
                      {u.email}
                    </div>
                    {u.full_name && (
                      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginTop: 1 }}>
                        {u.full_name}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "11px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary }}>
                    {u.company?.name ?? "—"}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {u.is_superuser && (
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            color: S.accentRed,
                            background: "#FEE2E2",
                            padding: "1px 5px",
                            borderRadius: 3,
                          }}
                        >
                          SUPER
                        </span>
                      )}
                      {(u.roles ?? []).slice(0, 2).map((r) => (
                        <span
                          key={r}
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            color: S.textSecondary,
                            background: S.bgSub,
                            padding: "1px 5px",
                            borderRadius: 3,
                          }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "11px 16px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700 }}>
                    <span style={{ color: u.mfa_enabled ? S.statusPass : S.textTertiary }}>
                      {u.mfa_enabled ? "+" : "−"}
                    </span>
                  </td>
                  <td style={{ padding: "11px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedUser(u); }}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 700,
                        color: S.accentCyan,
                        background: "transparent",
                        border: `1px solid ${S.accentCyan}`,
                        borderRadius: 4,
                        padding: "3px 10px",
                        cursor: "pointer",
                        letterSpacing: "0.05em",
                      }}
                    >
                      VIEW →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => fetchUsers(p)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: p === page ? 700 : 400,
                color: p === page ? S.bgPanel : S.textSecondary,
                background: p === page ? S.accentCyan : S.bgPanel,
                border: `1px solid ${p === page ? S.accentCyan : S.rim}`,
                borderRadius: 4,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginLeft: 8 }}>
            {total} total
          </span>
        </div>
      )}

      {/* User Detail Slide-Over */}
      {selectedUser && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div onClick={() => setSelectedUser(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)" }} />
          <div
            style={{
              position: "relative",
              width: 460,
              height: "100vh",
              background: S.bgPanel,
              borderLeft: `3px solid ${S.accentRed}`,
              boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
              overflowY: "auto",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: `1px solid ${S.rim}`,
                background: S.bgSub,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                position: "sticky",
                top: 0,
              }}
            >
              <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary, letterSpacing: "0.06em" }}>
                USER PROFILE
              </span>
              <button
                onClick={() => setSelectedUser(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: S.fontMono, fontSize: 18, color: S.textTertiary }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Profile section */}
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.textTertiary, marginBottom: 10 }}>
                  IDENTITY
                </div>
                {[
                  { label: "Email", value: selectedUser.email },
                  { label: "Full Name", value: selectedUser.full_name ?? "—" },
                  { label: "Job Title", value: selectedUser.job_title ?? "—" },
                  { label: "ID", value: selectedUser.id },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "7px 0",
                      borderBottom: `1px solid ${S.rim}`,
                    }}
                  >
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>{row.label}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textPrimary, fontWeight: 600 }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Company */}
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.textTertiary, marginBottom: 10 }}>
                  COMPANY ASSIGNMENT
                </div>
                <div style={{ padding: "10px 14px", background: S.bgSub, borderRadius: 5, fontFamily: S.fontMono, fontSize: 12, color: S.textPrimary }}>
                  {selectedUser.company?.name ?? "No company assigned"}
                </div>
              </div>

              {/* Roles */}
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.textTertiary, marginBottom: 10 }}>
                  ROLES
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedUser.is_superuser && (
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.accentRed, background: "#FEE2E2", padding: "3px 10px", borderRadius: 4 }}>
                      SUPERUSER
                    </span>
                  )}
                  {(selectedUser.roles ?? []).map((r) => (
                    <span key={r} style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary, background: S.bgSub, padding: "3px 10px", borderRadius: 4 }}>
                      {r}
                    </span>
                  ))}
                  {!selectedUser.is_superuser && (selectedUser.roles ?? []).length === 0 && (
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>No roles assigned</span>
                  )}
                </div>
              </div>

              {/* Permissions (collapsed) */}
              {(selectedUser.permissions ?? []).length > 0 && (
                <details>
                  <summary style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.textTertiary, cursor: "pointer", marginBottom: 6 }}>
                    EFFECTIVE PERMISSIONS ({(selectedUser.permissions ?? []).length})
                  </summary>
                  <div
                    style={{
                      maxHeight: 160,
                      overflowY: "auto",
                      background: S.bgSub,
                      borderRadius: 5,
                      padding: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      marginTop: 8,
                    }}
                  >
                    {(selectedUser.permissions ?? []).map((p) => (
                      <span key={p} style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textSecondary }}>
                        {p}
                      </span>
                    ))}
                  </div>
                </details>
              )}

              {/* Actions */}
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.textTertiary, marginBottom: 10 }}>
                  ACTIONS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "RESET PASSWORD", color: S.accentAmber, bg: "#FFFBEB" },
                    { label: "REVOKE ALL SESSIONS", color: S.accentRed, bg: "#FEF2F2" },
                    { label: "SUSPEND ACCOUNT", color: S.accentRed, bg: "#FEF2F2" },
                  ].map((action) => (
                    <button
                      key={action.label}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: action.color,
                        background: action.bg,
                        border: `1px solid ${action.color}`,
                        borderRadius: 5,
                        padding: "8px 12px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {action.label} (STUB)
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create User Slide-Over */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div onClick={() => setShowCreate(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)" }} />
          <div
            style={{
              position: "relative",
              width: 420,
              height: "100vh",
              background: S.bgPanel,
              borderLeft: `3px solid ${S.accentRed}`,
              boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                borderBottom: `1px solid ${S.rim}`,
                background: S.bgSub,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                position: "sticky",
                top: 0,
              }}
            >
              <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
                CREATE USER
              </span>
              <button onClick={() => setShowCreate(false)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: S.textTertiary }}>
                ×
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { label: "EMAIL", key: "email", placeholder: "user@company.com", type: "email" },
                { label: "FULL NAME", key: "full_name", placeholder: "Jane Smith", type: "text" },
                { label: "PASSWORD", key: "password", placeholder: "••••••••••••", type: "password" },
                { label: "COMPANY ID", key: "company_id", placeholder: "UUID of company", type: "text" },
              ].map((field) => (
                <div key={field.key}>
                  <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.textTertiary, display: "block", marginBottom: 6 }}>
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={createForm[field.key as keyof CreateUserForm]}
                    onChange={(e) => setCreateForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={INPUT_STYLE}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.textTertiary, display: "block", marginBottom: 6 }}>
                  ROLE
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                  style={{ ...INPUT_STYLE }}
                >
                  {["analyst", "manager", "trader", "risk_officer", "cfo", "auditor", "compliance_officer", "admin"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {createError && (
                <div style={{ padding: "8px 12px", background: "#FEF2F2", border: `1px solid ${S.accentRed}`, borderRadius: 5, fontFamily: S.fontMono, fontSize: 11, color: S.accentRed }}>
                  {createError}
                </div>
              )}
              {createSuccess && (
                <div style={{ padding: "8px 12px", background: "#D1FAE5", border: `1px solid ${S.statusPass}`, borderRadius: 5, fontFamily: S.fontMono, fontSize: 11, color: S.statusPass }}>
                  User created successfully.
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={submitting}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: S.bgPanel,
                  background: submitting ? S.textTertiary : S.accentRed,
                  border: "none",
                  borderRadius: 5,
                  padding: "10px",
                  cursor: submitting ? "default" : "pointer",
                  marginTop: 8,
                }}
              >
                {submitting ? "CREATING..." : "CREATE USER"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
