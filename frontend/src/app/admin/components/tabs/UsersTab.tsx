"use client";

import { useEffect, useState, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red)",
  pass:      "var(--status-pass)",
  fail:      "var(--status-fail)",
} as const;

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  is_active: boolean;
  is_superuser: boolean;
  plan_tier: string | null;
  company_id: string | null;
  company_name: string | null;
  roles: string[];
  mfa_enabled: boolean;
  created_at: string | null;
}

interface AdminUserListResponse {
  items: AdminUser[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

interface DraftUser {
  full_name: string;
  job_title: string;
  is_active: boolean;
  is_superuser: boolean;
}

function planColor(tier: string | null): string {
  if (!tier) return S.tertiary;
  if (tier === "professional") return S.cyan;
  if (tier === "enterprise") return S.amber;
  return S.tertiary;
}

function planBg(tier: string | null): string {
  if (tier === "professional") return `color-mix(in srgb,${S.cyan} 12%,transparent)`;
  if (tier === "enterprise") return `color-mix(in srgb,${S.amber} 12%,transparent)`;
  return `color-mix(in srgb,${S.tertiary} 12%,transparent)`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

// ---------- Side drawer ----------

interface DrawerProps {
  user: AdminUser;
  token: string;
  onClose: () => void;
  onSaved: (updated: AdminUser) => void;
}

function UserDrawer({ user, token, onClose, onSaved }: DrawerProps) {
  const [draft, setDraft] = useState<DraftUser>({
    full_name: user.full_name ?? "",
    job_title: user.job_title ?? "",
    is_active: user.is_active,
    is_superuser: user.is_superuser,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [revokeState, setRevokeState] = useState<"idle" | "confirm" | "loading" | "done">("idle");
  const [revokeMsg, setRevokeMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    const body: Record<string, unknown> = {};
    if (draft.full_name !== (user.full_name ?? "")) body.full_name = draft.full_name || null;
    if (draft.job_title !== (user.job_title ?? "")) body.job_title = draft.job_title || null;
    if (draft.is_active !== user.is_active) body.is_active = draft.is_active;
    if (draft.is_superuser !== user.is_superuser) body.is_superuser = draft.is_superuser;

    if (Object.keys(body).length === 0) {
      setSaveMsg({ ok: false, text: "No changes to save." });
      setSaving(false);
      return;
    }

    try {
      const res = await dashboardFetch(`/v1/admin/users/${user.id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveMsg({ ok: false, text: (err as { detail?: string }).detail ?? "Save failed." });
      } else {
        setSaveMsg({ ok: true, text: "Saved." });
        onSaved({
          ...user,
          full_name: (body.full_name as string | null) ?? user.full_name,
          job_title: (body.job_title as string | null) ?? user.job_title,
          is_active: draft.is_active,
          is_superuser: draft.is_superuser,
        });
      }
    } catch {
      setSaveMsg({ ok: false, text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    setRevokeState("loading");
    try {
      const res = await dashboardFetch(`/v1/admin/users/${user.id}/revoke-sessions`, token, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRevokeMsg((err as { detail?: string }).detail ?? "Revoke failed.");
        setRevokeState("idle");
      } else {
        setRevokeMsg("All sessions revoked.");
        setRevokeState("done");
      }
    } catch {
      setRevokeMsg("Network error.");
      setRevokeState("idle");
    }
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: S.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: S.tertiary,
    marginBottom: 4,
    textTransform: "uppercase",
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontUI,
    fontSize: 13,
    color: S.primary,
    background: S.bgDeep,
    border: `1px solid ${S.rim}`,
    padding: "6px 10px",
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        height: "100%",
        width: 380,
        background: S.bgPanel,
        borderLeft: `1px solid ${S.rim}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "16px 20px 12px",
          borderBottom: `1px solid ${S.rim}`,
        }}
      >
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.cyan }}>
            EDIT USER
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginTop: 2 }}>
            {user.email}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: S.tertiary,
            fontSize: 18,
            cursor: "pointer",
            padding: "0 4px",
            lineHeight: 1,
          }}
          aria-label="Close drawer"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        {/* full_name */}
        <div>
          <div style={labelStyle}>Full Name</div>
          <input
            style={inputStyle}
            value={draft.full_name}
            onChange={e => setDraft(d => ({ ...d, full_name: e.target.value }))}
            placeholder="—"
          />
        </div>

        {/* job_title */}
        <div>
          <div style={labelStyle}>Job Title</div>
          <input
            style={inputStyle}
            value={draft.job_title}
            onChange={e => setDraft(d => ({ ...d, job_title: e.target.value }))}
            placeholder="—"
          />
        </div>

        {/* is_active */}
        <div>
          <div style={labelStyle}>Account Status</div>
          <button
            onClick={() => setDraft(d => ({ ...d, is_active: !d.is_active }))}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              padding: "4px 12px",
              cursor: "pointer",
              background: draft.is_active
                ? `color-mix(in srgb,${S.pass} 12%,transparent)`
                : `color-mix(in srgb,${S.fail} 12%,transparent)`,
              color: draft.is_active ? S.pass : S.fail,
              border: `1px solid ${draft.is_active ? S.pass : S.fail}`,
            }}
          >
            {draft.is_active ? "ACTIVE" : "INACTIVE"}
          </button>
        </div>

        {/* is_superuser */}
        <div>
          <div style={labelStyle}>Superuser</div>
          <button
            onClick={() => setDraft(d => ({ ...d, is_superuser: !d.is_superuser }))}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              padding: "4px 12px",
              cursor: "pointer",
              background: draft.is_superuser
                ? `color-mix(in srgb,${S.amber} 15%,transparent)`
                : `color-mix(in srgb,${S.tertiary} 10%,transparent)`,
              color: draft.is_superuser ? S.amber : S.tertiary,
              border: `1px solid ${draft.is_superuser ? S.amber : S.soft}`,
            }}
          >
            {draft.is_superuser ? "SUPERUSER" : "STANDARD"}
          </button>
          {draft.is_superuser && (
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.amber, marginTop: 4 }}>
              Warning: superusers have full cross-tenant access.
            </div>
          )}
        </div>

        {/* Roles — display only */}
        <div>
          <div style={labelStyle}>Roles</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {user.roles.length === 0 ? (
              <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>—</span>
            ) : (
              user.roles.map(r => (
                <span
                  key={r}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    padding: "2px 8px",
                    background: `color-mix(in srgb,${S.tertiary} 10%,transparent)`,
                    color: S.secondary,
                    border: `1px solid ${S.soft}`,
                  }}
                >
                  {r}
                </span>
              ))
            )}
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 4 }}>
            Role assignment managed via Roles tab.
          </div>
        </div>

        {/* MFA — display only */}
        <div>
          <div style={labelStyle}>MFA Status</div>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 8px",
              background: user.mfa_enabled
                ? `color-mix(in srgb,${S.pass} 12%,transparent)`
                : `color-mix(in srgb,${S.tertiary} 10%,transparent)`,
              color: user.mfa_enabled ? S.pass : S.tertiary,
              border: `1px solid ${user.mfa_enabled ? S.pass : S.soft}`,
            }}
          >
            {user.mfa_enabled ? "ENABLED" : "DISABLED"}
          </span>
        </div>

        {/* SAVE */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              padding: "6px 18px",
              cursor: saving ? "not-allowed" : "pointer",
              background: `color-mix(in srgb,${S.cyan} 15%,transparent)`,
              color: S.cyan,
              border: `1px solid ${S.cyan}`,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "SAVING…" : "SAVE"}
          </button>
          {saveMsg && (
            <span
              style={{
                fontFamily: S.fontUI,
                fontSize: 12,
                color: saveMsg.ok ? S.pass : S.fail,
              }}
            >
              {saveMsg.text}
            </span>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${S.rim}` }} />

        {/* REVOKE SESSIONS */}
        <div>
          <div style={labelStyle}>Session Management</div>
          {revokeState === "idle" && (
            <button
              onClick={() => setRevokeState("confirm")}
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                padding: "5px 14px",
                cursor: "pointer",
                background: `color-mix(in srgb,${S.red} 12%,transparent)`,
                color: S.red,
                border: `1px solid ${S.red}`,
              }}
            >
              REVOKE SESSIONS
            </button>
          )}
          {revokeState === "confirm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                Are you sure? All active sessions will be terminated.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleRevoke}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    padding: "4px 12px",
                    cursor: "pointer",
                    background: `color-mix(in srgb,${S.red} 15%,transparent)`,
                    color: S.red,
                    border: `1px solid ${S.red}`,
                  }}
                >
                  YES
                </button>
                <button
                  onClick={() => setRevokeState("idle")}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    padding: "4px 12px",
                    cursor: "pointer",
                    background: "none",
                    color: S.tertiary,
                    border: `1px solid ${S.soft}`,
                  }}
                >
                  NO
                </button>
              </div>
            </div>
          )}
          {revokeState === "loading" && (
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>Revoking…</span>
          )}
          {(revokeState === "done" || revokeMsg) && revokeState !== "loading" && (
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: revokeState === "done" ? S.pass : S.fail }}>
              {revokeMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Create User Modal ----------

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  is_superuser: boolean;
}

interface CreateUserModalProps {
  token: string;
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
}

function CreateUserModal({ token, onClose, onCreated }: CreateUserModalProps) {
  const [draft, setDraft] = useState<CreateUserRequest>({
    email: "",
    password: "",
    full_name: "",
    is_superuser: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.email.trim() || !draft.password.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await dashboardFetch("/v1/admin/users", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: draft.email.trim(),
          password: draft.password,
          full_name: draft.full_name.trim() || null,
          is_superuser: draft.is_superuser,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
        return;
      }
      const created = await res.json() as AdminUser;
      onCreated(created);
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
    letterSpacing: "0.08em", color: S.tertiary,
    marginBottom: 4, textTransform: "uppercase", display: "block",
  };
  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: 13, color: S.primary,
    background: S.bgDeep, border: `1px solid ${S.rim}`,
    padding: "7px 10px", width: "100%", outline: "none", boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, width: 400, maxWidth: "90vw" }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: `1px solid ${S.rim}`,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", color: S.cyan }}>
            CREATE USER
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: S.tertiary, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Email *</label>
            <input style={inputStyle} type="email" required value={draft.email}
              onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Password *</label>
            <input style={inputStyle} type="password" required minLength={8} value={draft.password}
              onChange={e => setDraft(d => ({ ...d, password: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input style={inputStyle} value={draft.full_name}
              onChange={e => setDraft(d => ({ ...d, full_name: e.target.value }))} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Superuser</label>
            <button type="button"
              onClick={() => setDraft(d => ({ ...d, is_superuser: !d.is_superuser }))}
              style={{
                fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                padding: "2px 10px", cursor: "pointer",
                color: draft.is_superuser ? S.amber : S.tertiary,
                background: draft.is_superuser ? `color-mix(in srgb,${S.amber} 10%,transparent)` : "transparent",
                border: `1px solid ${draft.is_superuser ? S.amber : S.rim}`,
              }}>
              {draft.is_superuser ? "YES" : "NO"}
            </button>
          </div>
          {error && <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.fail }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="submit" disabled={saving} style={{
              fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
              padding: "7px 20px", cursor: saving ? "not-allowed" : "pointer",
              background: `color-mix(in srgb,${S.cyan} 15%,transparent)`,
              color: S.cyan, border: `1px solid ${S.cyan}`, opacity: saving ? 0.6 : 1,
            }}>
              {saving ? "CREATING…" : "CREATE"}
            </button>
            <button type="button" onClick={onClose} style={{
              fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
              padding: "7px 16px", cursor: "pointer", background: "none",
              color: S.tertiary, border: `1px solid ${S.soft}`,
            }}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Main component ----------

export default function UsersTab({ token }: { token: string }) {
  const [data, setData] = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await dashboardFetch(`/v1/admin/users?page=${p}&size=25`, token);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AdminUserListResponse;
        setData(json);
        setPage(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  const items = data?.items ?? [];
  const filtered =
    search.trim() === ""
      ? items
      : items.filter(
          u =>
            u.email.toLowerCase().includes(search.toLowerCase()) ||
            (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()),
        );

  const thStyle: React.CSSProperties = {
    fontFamily: S.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.09em",
    color: S.tertiary,
    textAlign: "left",
    padding: "8px 12px",
    borderBottom: `1px solid ${S.rim}`,
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  const tdStyle: React.CSSProperties = {
    fontFamily: S.fontUI,
    fontSize: 12,
    color: S.primary,
    padding: "9px 12px",
    borderBottom: `1px solid ${S.soft}`,
    verticalAlign: "middle",
    maxWidth: 180,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ position: "relative", height: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 20px",
          borderBottom: `1px solid ${S.rim}`,
          background: S.bgPanel,
        }}
      >
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
            padding: "6px 14px", cursor: "pointer",
            background: `color-mix(in srgb,${S.cyan} 15%,transparent)`,
            color: S.cyan, border: `1px solid ${S.cyan}`,
            whiteSpace: "nowrap",
          }}
        >
          + CREATE USER
        </button>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by email or name…"
          style={{
            fontFamily: S.fontUI,
            fontSize: 12,
            color: S.primary,
            background: S.bgDeep,
            border: `1px solid ${S.rim}`,
            padding: "6px 12px",
            width: 260,
            outline: "none",
          }}
        />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, marginLeft: "auto" }}>
          {loading ? "Loading…" : `${data?.total ?? 0} users`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "16px 20px", fontFamily: S.fontUI, fontSize: 13, color: S.fail }}>
          Error: {error}
        </div>
      )}

      {/* Table */}
      {!error && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                <th style={thStyle}>EMAIL</th>
                <th style={thStyle}>COMPANY</th>
                <th style={thStyle}>STATUS</th>
                <th style={thStyle}>PLAN</th>
                <th style={thStyle}>MFA</th>
                <th style={thStyle}>SUPERUSER</th>
                <th style={thStyle}>ROLES</th>
                <th style={thStyle}>CREATED</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, color: S.tertiary, textAlign: "center", padding: 32 }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, color: S.tertiary, textAlign: "center", padding: 32 }}>
                    No users found.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map(u => {
                  const isHovered = hoveredId === u.id;
                  const isSelected = selectedUser?.id === u.id;
                  const visibleRoles = u.roles.slice(0, 2);
                  const extra = u.roles.length - 2;

                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedUser(isSelected ? null : u)}
                      onMouseEnter={() => setHoveredId(u.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        cursor: "pointer",
                        background: isSelected
                          ? `color-mix(in srgb,${S.cyan} 8%,transparent)`
                          : isHovered
                            ? `color-mix(in srgb,${S.cyan} 4%,transparent)`
                            : "transparent",
                        transition: "background 0.1s",
                      }}
                    >
                      {/* EMAIL */}
                      <td style={{ ...tdStyle, fontFamily: S.fontMono, fontSize: 11 }}>{u.email}</td>

                      {/* COMPANY */}
                      <td style={{ ...tdStyle, color: S.secondary }}>{u.company_name ?? "—"}</td>

                      {/* STATUS */}
                      <td style={tdStyle}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            padding: "2px 8px",
                            background: u.is_active
                              ? `color-mix(in srgb,${S.pass} 12%,transparent)`
                              : `color-mix(in srgb,${S.fail} 12%,transparent)`,
                            color: u.is_active ? S.pass : S.fail,
                            border: `1px solid ${u.is_active ? S.pass : S.fail}`,
                          }}
                        >
                          {u.is_active ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>

                      {/* PLAN */}
                      <td style={tdStyle}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            padding: "2px 8px",
                            background: planBg(u.plan_tier),
                            color: planColor(u.plan_tier),
                            border: `1px solid ${planColor(u.plan_tier)}`,
                          }}
                        >
                          {(u.plan_tier ?? "—").toUpperCase()}
                        </span>
                      </td>

                      {/* MFA */}
                      <td style={tdStyle}>
                        {u.mfa_enabled ? (
                          <span
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              padding: "2px 8px",
                              background: `color-mix(in srgb,${S.pass} 12%,transparent)`,
                              color: S.pass,
                              border: `1px solid ${S.pass}`,
                            }}
                          >
                            ENABLED
                          </span>
                        ) : (
                          <span style={{ color: S.tertiary }}>—</span>
                        )}
                      </td>

                      {/* SUPERUSER */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {u.is_superuser ? (
                          <span style={{ color: S.amber, fontSize: 14 }}>★</span>
                        ) : (
                          <span style={{ color: S.tertiary }}>—</span>
                        )}
                      </td>

                      {/* ROLES */}
                      <td style={tdStyle}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {visibleRoles.map(r => (
                            <span
                              key={r}
                              style={{
                                fontFamily: S.fontMono,
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: "0.05em",
                                padding: "1px 6px",
                                background: `color-mix(in srgb,${S.tertiary} 10%,transparent)`,
                                color: S.secondary,
                                border: `1px solid ${S.soft}`,
                              }}
                            >
                              {r}
                            </span>
                          ))}
                          {extra > 0 && (
                            <span
                              style={{
                                fontFamily: S.fontMono,
                                fontSize: 9,
                                color: S.tertiary,
                                padding: "1px 4px",
                              }}
                            >
                              +{extra} more
                            </span>
                          )}
                          {u.roles.length === 0 && <span style={{ color: S.tertiary }}>—</span>}
                        </div>
                      </td>

                      {/* CREATED */}
                      <td style={{ ...tdStyle, color: S.tertiary, fontFamily: S.fontMono, fontSize: 10 }}>
                        {fmtDate(u.created_at)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            borderTop: `1px solid ${S.rim}`,
          }}
        >
          <button
            onClick={() => fetchPage(page - 1)}
            disabled={page <= 1 || loading}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "4px 12px",
              cursor: page <= 1 ? "not-allowed" : "pointer",
              background: "none",
              color: page <= 1 ? S.tertiary : S.primary,
              border: `1px solid ${page <= 1 ? S.soft : S.rim}`,
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            ← PREV
          </button>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
            Page {data.page} of {data.pages}
          </span>
          <button
            onClick={() => fetchPage(page + 1)}
            disabled={page >= data.pages || loading}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "4px 12px",
              cursor: page >= data.pages ? "not-allowed" : "pointer",
              background: "none",
              color: page >= data.pages ? S.tertiary : S.primary,
              border: `1px solid ${page >= data.pages ? S.soft : S.rim}`,
              opacity: page >= data.pages ? 0.5 : 1,
            }}
          >
            NEXT →
          </button>
        </div>
      )}

      {/* Side drawer */}
      {selectedUser && (
        <UserDrawer
          user={selectedUser}
          token={token}
          onClose={() => setSelectedUser(null)}
          onSaved={updated => {
            setSelectedUser(updated);
            setData(prev =>
              prev
                ? {
                    ...prev,
                    items: prev.items.map(u => (u.id === updated.id ? updated : u)),
                  }
                : prev,
            );
          }}
        />
      )}

      {/* Create user modal */}
      {showCreate && (
        <CreateUserModal
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={(newUser) => {
            setData(prev => prev ? { ...prev, items: [newUser, ...prev.items] } : prev);
          }}
        />
      )}
    </div>
  );
}
