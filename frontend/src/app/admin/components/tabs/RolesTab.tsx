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

// ---- Shapes from backend schemas/permission.py ----
interface PermissionOut {
  id: number;
  codename: string;
  module: string;
  action: string;
  description: string;
}

interface PermissionGroupOut {
  module: string;
  permissions: PermissionOut[];
}

interface RoleWithPermissions {
  id: number;
  name: string;
  description: string | null;
  hierarchy_level: number;
  is_system: boolean;
  permissions: string[]; // codenames
}

// ---- Draft state for create modal ----
interface DraftRole {
  name: string;
  description: string;
  hierarchy_level: number;
  permission_codenames: string[];
}

const EMPTY_DRAFT: DraftRole = {
  name: "",
  description: "",
  hierarchy_level: 10,
  permission_codenames: [],
};

// ---- Sub-components ----

function HierarchyBadge({ level }: { level: number }) {
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        background: S.bgSub,
        border: `1px solid ${S.amber}`,
        color: S.amber,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: "0.04em",
      }}
    >
      L{level}
    </span>
  );
}

function RoleCard({
  role,
  selected,
  onClick,
}: {
  role: RoleWithPermissions;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "10px 12px",
        borderLeft: selected ? `3px solid ${S.cyan}` : "3px solid transparent",
        background: selected
          ? `${S.bgSub}`
          : hovered
          ? "rgba(255,255,255,0.03)"
          : "transparent",
        cursor: "pointer",
        borderBottom: `1px solid ${S.rim}`,
        transition: "background 0.1s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 3,
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: selected ? S.cyan : S.primary,
            fontWeight: 700,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {role.name.toUpperCase()}
        </span>
        <HierarchyBadge level={role.hierarchy_level} />
      </div>
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 11,
          color: S.tertiary,
        }}
      >
        {role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}
        {role.is_system && (
          <span
            style={{
              marginLeft: 6,
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.tertiary,
              letterSpacing: "0.05em",
            }}
          >
            SYSTEM
          </span>
        )}
      </div>
    </div>
  );
}

function PermissionRow({ perm }: { perm: PermissionOut }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "6px 0",
        borderBottom: `1px solid ${S.rim}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: S.fontUI,
            fontSize: 12,
            fontWeight: 700,
            color: S.primary,
          }}
        >
          {perm.action}
        </div>
        <div
          style={{
            fontFamily: S.fontUI,
            fontSize: 11,
            color: S.secondary,
            marginTop: 1,
          }}
        >
          {perm.description}
        </div>
      </div>
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          color: S.tertiary,
          whiteSpace: "nowrap",
          paddingTop: 2,
        }}
      >
        {perm.codename}
      </div>
    </div>
  );
}

function CreateRoleModal({
  groups,
  onClose,
  onCreated,
  token,
}: {
  groups: PermissionGroupOut[];
  onClose: () => void;
  onCreated: (role: RoleWithPermissions) => void;
  token: string;
}) {
  const [draft, setDraft] = useState<DraftRole>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function togglePerm(codename: string) {
    setDraft((d) => ({
      ...d,
      permission_codenames: d.permission_codenames.includes(codename)
        ? d.permission_codenames.filter((c) => c !== codename)
        : [...d.permission_codenames, codename],
    }));
  }

  async function handleSubmit() {
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await dashboardFetch("/v1/admin/roles", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description || null,
          hierarchy_level: draft.hierarchy_level,
          permission_codenames: draft.permission_codenames,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const role: RoleWithPermissions = await res.json();
      onCreated(role);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontUI,
    fontSize: 12,
    background: S.bgDeep,
    border: `1px solid ${S.rim}`,
    color: S.primary,
    borderRadius: 4,
    padding: "6px 8px",
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          width: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: `1px solid ${S.rim}`,
          }}
        >
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              color: S.cyan,
              letterSpacing: "0.08em",
            }}
          >
            CREATE ROLE
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: S.tertiary,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: 16 }}>
          {error && (
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: 12,
                color: S.fail,
                background: "rgba(255,80,80,0.08)",
                border: `1px solid ${S.fail}`,
                borderRadius: 4,
                padding: "8px 10px",
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.tertiary,
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 4,
              }}
            >
              NAME *
            </label>
            <input
              style={inputStyle}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. analyst_read_only"
              maxLength={64}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.tertiary,
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 4,
              }}
            >
              DESCRIPTION
            </label>
            <textarea
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: 60,
              }}
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              maxLength={255}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.tertiary,
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 4,
              }}
            >
              HIERARCHY LEVEL (0–100)
            </label>
            <input
              type="number"
              style={{ ...inputStyle, width: 100 }}
              value={draft.hierarchy_level}
              min={0}
              max={100}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  hierarchy_level: Math.max(0, Math.min(100, Number(e.target.value))),
                }))
              }
            />
          </div>

          {/* Permissions checklist */}
          <div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.tertiary,
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              PERMISSIONS ({draft.permission_codenames.length} selected)
            </div>
            {groups.map((g) => (
              <div key={g.module} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: S.amber,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                    paddingBottom: 3,
                    borderBottom: `1px solid ${S.rim}`,
                  }}
                >
                  {g.module}
                </div>
                {g.permissions.map((perm) => (
                  <label
                    key={perm.codename}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "4px 0",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={draft.permission_codenames.includes(perm.codename)}
                      onChange={() => togglePerm(perm.codename)}
                      style={{ marginTop: 2, accentColor: S.cyan }}
                    />
                    <div>
                      <span
                        style={{
                          fontFamily: S.fontUI,
                          fontSize: 12,
                          color: S.primary,
                        }}
                      >
                        {perm.action}
                      </span>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color: S.tertiary,
                          marginLeft: 6,
                        }}
                      >
                        {perm.codename}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: `1px solid ${S.rim}`,
          }}
        >
          <button
            onClick={onClose}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              background: "transparent",
              border: `1px solid ${S.rim}`,
              color: S.secondary,
              borderRadius: 4,
              padding: "6px 14px",
              cursor: "pointer",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              background: S.cyan,
              border: "none",
              color: S.bgDeep,
              borderRadius: 4,
              padding: "6px 14px",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
              fontWeight: 700,
            }}
          >
            {saving ? "CREATING…" : "CREATE ROLE"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Edit permissions modal ----

function EditPermissionsModal({
  role,
  groups,
  token,
  onClose,
  onSaved,
}: {
  role: RoleWithPermissions;
  groups: PermissionGroupOut[];
  token: string;
  onClose: () => void;
  onSaved: (updated: RoleWithPermissions) => void;
}) {
  const [selected, setSelected] = useState<string[]>(role.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function togglePerm(codename: string) {
    setSelected((prev) =>
      prev.includes(codename) ? prev.filter((c) => c !== codename) : [...prev, codename]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await dashboardFetch(`/v1/admin/roles/${role.id}/permissions`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission_codenames: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      const updated: RoleWithPermissions = await res.json();
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          width: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: `1px solid ${S.rim}`,
          }}
        >
          <div>
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                color: S.cyan,
                letterSpacing: "0.08em",
              }}
            >
              EDIT PERMISSIONS
            </span>
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.tertiary,
                marginLeft: 10,
              }}
            >
              {role.name.toUpperCase()}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: S.tertiary,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: 16 }}>
          {error && (
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: 12,
                color: S.fail,
                background: "rgba(255,80,80,0.08)",
                border: `1px solid ${S.fail}`,
                borderRadius: 4,
                padding: "8px 10px",
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.tertiary,
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}
          >
            PERMISSIONS ({selected.length} selected)
          </div>

          {groups.map((g) => (
            <div key={g.module} style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.amber,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                  paddingBottom: 3,
                  borderBottom: `1px solid ${S.rim}`,
                }}
              >
                {g.module}
              </div>
              {g.permissions.map((perm) => (
                <label
                  key={perm.codename}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "4px 0",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(perm.codename)}
                    onChange={() => togglePerm(perm.codename)}
                    style={{ marginTop: 2, accentColor: S.cyan }}
                  />
                  <div>
                    <span
                      style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary }}
                    >
                      {perm.action}
                    </span>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.tertiary,
                        marginLeft: 6,
                      }}
                    >
                      {perm.codename}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: `1px solid ${S.rim}`,
          }}
        >
          <button
            onClick={onClose}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              background: "transparent",
              border: `1px solid ${S.rim}`,
              color: S.secondary,
              borderRadius: 4,
              padding: "6px 14px",
              cursor: "pointer",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              background: S.cyan,
              border: "none",
              color: S.bgDeep,
              borderRadius: 4,
              padding: "6px 14px",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
              fontWeight: 700,
            }}
          >
            {saving ? "SAVING…" : "SAVE PERMISSIONS"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main component ----

export default function RolesTab({ token }: { token: string }) {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [groups, setGroups] = useState<PermissionGroupOut[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch("/v1/admin/roles", token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RoleWithPermissions[] = await res.json();
      setRoles(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await dashboardFetch("/v1/admin/roles/permissions", token);
      if (!res.ok) return;
      const data: PermissionGroupOut[] = await res.json();
      setGroups(data);
    } catch {
      // non-fatal
    }
  }, [token]);

  useEffect(() => {
    void fetchRoles();
    void fetchGroups();
  }, [fetchRoles, fetchGroups]);

  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;

  // Build a map from codename -> PermissionOut for detail display
  const permMap = new Map<string, PermissionOut>();
  groups.forEach((g) => g.permissions.forEach((p) => permMap.set(p.codename, p)));

  // Group selected role's permissions by module
  const selectedPermsByModule: Map<string, PermissionOut[]> = new Map();
  if (selectedRole) {
    selectedRole.permissions.forEach((codename) => {
      const perm = permMap.get(codename);
      if (perm) {
        const list = selectedPermsByModule.get(perm.module) ?? [];
        list.push(perm);
        selectedPermsByModule.set(perm.module, list);
      }
    });
  }

  useEffect(() => {
    setShowEdit(false);
  }, [selectedId]);

  function handleCreated(role: RoleWithPermissions) {
    setShowCreate(false);
    setRoles((prev) => [...prev, role]);
    setSelectedId(role.id);
  }

  function handleRoleUpdated(updated: RoleWithPermissions) {
    setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setShowEdit(false);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        minHeight: 0,
        height: "100%",
        fontFamily: S.fontUI,
      }}
    >
      {/* Left rail */}
      <div
        style={{
          borderRight: `1px solid ${S.rim}`,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {/* Rail header */}
        <div
          style={{
            padding: "10px 12px",
            borderBottom: `1px solid ${S.rim}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              color: S.primary,
              letterSpacing: "0.08em",
            }}
          >
            ROLES
          </span>
          {loading && (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
              …
            </span>
          )}
        </div>

        {/* Role list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {error ? (
            <div
              style={{
                padding: 12,
                fontFamily: S.fontUI,
                fontSize: 12,
                color: S.fail,
              }}
            >
              {error}
            </div>
          ) : (
            roles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                selected={role.id === selectedId}
                onClick={() => setSelectedId(role.id)}
              />
            ))
          )}
        </div>

        {/* Create button */}
        <div style={{ padding: 10, borderTop: `1px solid ${S.rim}` }}>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              width: "100%",
              fontFamily: S.fontMono,
              fontSize: 11,
              background: "transparent",
              border: `1px solid ${S.cyan}`,
              color: S.cyan,
              borderRadius: 4,
              padding: "7px 0",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            + CREATE ROLE
          </button>
        </div>
      </div>

      {/* Right pane */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        {!selectedRole ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: S.fontUI,
              fontSize: 13,
              color: S.tertiary,
            }}
          >
            Select a role to view permissions
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            {/* Role header */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 14,
                    fontWeight: 700,
                    color: S.primary,
                  }}
                >
                  {selectedRole.name.toUpperCase()}
                </span>
                <HierarchyBadge level={selectedRole.hierarchy_level} />
                {selectedRole.is_system && (
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.tertiary,
                      letterSpacing: "0.06em",
                      border: `1px solid ${S.rim}`,
                      borderRadius: 3,
                      padding: "1px 5px",
                    }}
                  >
                    SYSTEM
                  </span>
                )}
                {!selectedRole.is_system && (
                  <button
                    onClick={() => setShowEdit(true)}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.07em",
                      padding: "4px 12px",
                      cursor: "pointer",
                      background: `color-mix(in srgb,${S.cyan} 12%,transparent)`,
                      color: S.cyan,
                      border: `1px solid ${S.cyan}`,
                      borderRadius: 3,
                    }}
                  >
                    EDIT PERMISSIONS
                  </button>
                )}
              </div>
              {selectedRole.description && (
                <div
                  style={{
                    fontFamily: S.fontUI,
                    fontSize: 12,
                    color: S.secondary,
                  }}
                >
                  {selectedRole.description}
                </div>
              )}
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.tertiary,
                  marginTop: 4,
                }}
              >
                {selectedRole.permissions.length} permission
                {selectedRole.permissions.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Permissions grouped by module */}
            {selectedRole.permissions.length === 0 ? (
              <div
                style={{
                  fontFamily: S.fontUI,
                  fontSize: 12,
                  color: S.tertiary,
                  padding: "20px 0",
                }}
              >
                No permissions assigned.
              </div>
            ) : (
              Array.from(selectedPermsByModule.entries()).map(([module, perms]) => (
                <div key={module} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.tertiary,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 6,
                      paddingBottom: 4,
                      borderBottom: `1px solid ${S.soft}`,
                    }}
                  >
                    {module}
                  </div>
                  {perms.map((perm) => (
                    <PermissionRow key={perm.codename} perm={perm} />
                  ))}
                </div>
              ))
            )}

            {/* Fallback: permissions not found in catalog */}
            {(() => {
              const unknown = selectedRole.permissions.filter(
                (c) => !permMap.has(c)
              );
              if (unknown.length === 0) return null;
              return (
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.tertiary,
                      letterSpacing: "0.1em",
                      marginBottom: 6,
                      borderBottom: `1px solid ${S.soft}`,
                      paddingBottom: 4,
                    }}
                  >
                    UNKNOWN MODULE
                  </div>
                  {unknown.map((codename) => (
                    <div
                      key={codename}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        color: S.secondary,
                        padding: "4px 0",
                        borderBottom: `1px solid ${S.rim}`,
                      }}
                    >
                      {codename}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Create role modal */}
      {showCreate && (
        <CreateRoleModal
          groups={groups}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          token={token}
        />
      )}

      {/* Edit permissions modal */}
      {showEdit && selectedRole && !selectedRole.is_system && (
        <EditPermissionsModal
          role={selectedRole}
          groups={groups}
          token={token}
          onClose={() => setShowEdit(false)}
          onSaved={handleRoleUpdated}
        />
      )}
    </div>
  );
}
