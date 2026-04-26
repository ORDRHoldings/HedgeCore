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

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  plan_tier: string;
  is_active: boolean;
  user_count: number;
  position_count: number;
  run_count: number;
  created_at: string;
  governance_mode?: string;
}

function planColor(tier: string): string {
  if (tier === "professional") return S.cyan;
  if (tier === "enterprise") return S.amber;
  return S.tertiary;
}

function planBg(tier: string): string {
  if (tier === "professional") return `color-mix(in srgb,${S.cyan} 12%,transparent)`;
  if (tier === "enterprise") return `color-mix(in srgb,${S.amber} 12%,transparent)`;
  return `color-mix(in srgb,${S.tertiary} 12%,transparent)`;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

// ---------- Create modal ----------

interface CreateModalProps {
  token: string;
  onClose: () => void;
  onCreated: (t: TenantSummary) => void;
}

function CreateModal({ token, onClose, onCreated }: CreateModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [planTier, setPlanTier] = useState("smb");
  const [submitting, setSubmitting] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleNameBlur() {
    if (name && !slug) {
      setSlug(toSlug(name));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSlugError(null);
    setGeneralError(null);
    if (!name.trim()) return;
    if (!slug.trim()) {
      setSlugError("Slug is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await dashboardFetch("/v1/admin/tenants", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          domain: domain.trim() || null,
          plan_tier: planTier,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = (err as { detail?: string }).detail ?? "Create failed.";
        if (res.status === 400 && detail.toLowerCase().includes("slug")) {
          setSlugError("Slug already taken.");
        } else {
          setGeneralError(detail);
        }
        return;
      }
      const created = (await res.json()) as TenantSummary;
      onCreated(created);
      onClose();
    } catch {
      setGeneralError("Network error.");
    } finally {
      setSubmitting(false);
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
    display: "block",
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontUI,
    fontSize: 13,
    color: S.primary,
    background: S.bgDeep,
    border: `1px solid ${S.rim}`,
    padding: "7px 10px",
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          width: 420,
          maxWidth: "90vw",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: `1px solid ${S.rim}`,
          }}
        >
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", color: S.cyan }}>
            CREATE TENANT
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: S.tertiary, fontSize: 18, cursor: "pointer", lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              style={inputStyle}
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="Acme Corp"
              required
              minLength={2}
              maxLength={255}
            />
          </div>
          <div>
            <label style={labelStyle}>Slug *</label>
            <input
              style={{
                ...inputStyle,
                borderColor: slugError ? S.fail : undefined,
              }}
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="acme-corp"
              required
              minLength={2}
              maxLength={64}
            />
            {slugError && (
              <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.fail, marginTop: 3 }}>{slugError}</div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Domain (optional)</label>
            <input
              style={inputStyle}
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="acme.com"
            />
          </div>
          <div>
            <label style={labelStyle}>Plan Tier</label>
            <select
              value={planTier}
              onChange={e => setPlanTier(e.target.value)}
              style={{
                ...inputStyle,
                cursor: "pointer",
              }}
            >
              <option value="lite">Lite</option>
              <option value="smb">SMB</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          {generalError && (
            <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.fail }}>{generalError}</div>
          )}

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                padding: "7px 20px",
                cursor: submitting ? "not-allowed" : "pointer",
                background: `color-mix(in srgb,${S.cyan} 15%,transparent)`,
                color: S.cyan,
                border: `1px solid ${S.cyan}`,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "CREATING…" : "CREATE"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                padding: "7px 16px",
                cursor: "pointer",
                background: "none",
                color: S.tertiary,
                border: `1px solid ${S.soft}`,
              }}
            >
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Edit drawer ----------

interface EditDrawerProps {
  tenant: TenantSummary;
  token: string;
  onClose: () => void;
  onSaved: (updated: TenantSummary) => void;
}

function TenantDrawer({ tenant, token, onClose, onSaved }: EditDrawerProps) {
  const [draft, setDraft] = useState({
    name: tenant.name,
    plan_tier: tenant.plan_tier,
    governance_mode: tenant.governance_mode ?? "team",
    is_active: tenant.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [suspendState, setSuspendState] = useState<"idle" | "confirm" | "loading" | "done">("idle");
  const [suspendMsg, setSuspendMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    const body: Record<string, unknown> = {};
    if (draft.name !== tenant.name) body.name = draft.name;
    if (draft.plan_tier !== tenant.plan_tier) body.plan_tier = draft.plan_tier;
    if (draft.governance_mode !== (tenant.governance_mode ?? "team")) body.governance_mode = draft.governance_mode;
    if (draft.is_active !== tenant.is_active) body.is_active = draft.is_active;

    if (Object.keys(body).length === 0) {
      setSaveMsg({ ok: false, text: "No changes to save." });
      setSaving(false);
      return;
    }

    try {
      const res = await dashboardFetch(`/v1/admin/tenants/${tenant.id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveMsg({ ok: false, text: (err as { detail?: string }).detail ?? "Save failed." });
      } else {
        const updated = (await res.json()) as TenantSummary;
        setSaveMsg({ ok: true, text: "Saved." });
        onSaved(updated);
      }
    } catch {
      setSaveMsg({ ok: false, text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspend() {
    setSuspendState("loading");
    try {
      const res = await dashboardFetch(`/v1/admin/tenants/${tenant.id}/suspend`, token, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSuspendMsg((err as { detail?: string }).detail ?? "Suspend failed.");
        setSuspendState("idle");
      } else {
        setSuspendMsg("Tenant suspended.");
        setSuspendState("done");
        onSaved({ ...tenant, is_active: false });
      }
    } catch {
      setSuspendMsg("Network error.");
      setSuspendState("idle");
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
    display: "block",
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
            EDIT TENANT
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginTop: 2 }}>
            {tenant.name}
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
        {/* Name */}
        <div>
          <label style={labelStyle}>Name</label>
          <input
            style={inputStyle}
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          />
        </div>

        {/* Plan tier */}
        <div>
          <label style={labelStyle}>Plan Tier</label>
          <select
            value={draft.plan_tier}
            onChange={e => setDraft(d => ({ ...d, plan_tier: e.target.value }))}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="lite">Lite</option>
            <option value="smb">SMB</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {/* Governance mode */}
        <div>
          <label style={labelStyle}>Governance Mode</label>
          <select
            value={draft.governance_mode}
            onChange={e => setDraft(d => ({ ...d, governance_mode: e.target.value }))}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="solo">Solo</option>
            <option value="team">Team</option>
          </select>
        </div>

        {/* is_active */}
        <div>
          <label style={labelStyle}>Status</label>
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
            {draft.is_active ? "ACTIVE" : "SUSPENDED"}
          </button>
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
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: saveMsg.ok ? S.pass : S.fail }}>
              {saveMsg.text}
            </span>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${S.rim}` }} />

        {/* SUSPEND */}
        <div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: S.tertiary,
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            Danger Zone
          </div>
          {suspendState === "idle" && tenant.is_active && (
            <button
              onClick={() => setSuspendState("confirm")}
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                padding: "5px 14px",
                cursor: "pointer",
                background: `color-mix(in srgb,${S.amber} 12%,transparent)`,
                color: S.amber,
                border: `1px solid ${S.amber}`,
              }}
            >
              SUSPEND TENANT
            </button>
          )}
          {suspendState === "confirm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                Are you sure? The tenant will be suspended immediately.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleSuspend}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    padding: "4px 12px",
                    cursor: "pointer",
                    background: `color-mix(in srgb,${S.amber} 15%,transparent)`,
                    color: S.amber,
                    border: `1px solid ${S.amber}`,
                  }}
                >
                  YES
                </button>
                <button
                  onClick={() => setSuspendState("idle")}
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
          {suspendState === "loading" && (
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>Suspending…</span>
          )}
          {(suspendState === "done" || suspendMsg) && suspendState !== "loading" && suspendState !== "idle" && (
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: suspendState === "done" ? S.pass : S.fail }}>
              {suspendMsg}
            </span>
          )}
          {!tenant.is_active && suspendState === "idle" && (
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>Tenant is already suspended.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Main component ----------

export default function TenantsTab({ token }: { token: string }) {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantSummary | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch("/v1/admin/tenants", token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TenantSummary[];
      setTenants(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

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
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ position: "relative", height: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: `1px solid ${S.rim}`,
          background: S.bgPanel,
        }}
      >
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
          {loading ? "Loading…" : `${tenants.length} tenants`}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.07em",
            padding: "6px 16px",
            cursor: "pointer",
            background: `color-mix(in srgb,${S.cyan} 15%,transparent)`,
            color: S.cyan,
            border: `1px solid ${S.cyan}`,
          }}
        >
          + CREATE TENANT
        </button>
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
                <th scope="col" style={thStyle}>NAME</th>
                <th scope="col" style={thStyle}>SLUG</th>
                <th scope="col" style={thStyle}>TIER</th>
                <th scope="col" style={thStyle}>GOV MODE</th>
                <th scope="col" style={{ ...thStyle, textAlign: "right" }}>USERS</th>
                <th scope="col" style={{ ...thStyle, textAlign: "right" }}>POSITIONS</th>
                <th scope="col" style={{ ...thStyle, textAlign: "right" }}>RUNS</th>
                <th scope="col" style={thStyle}>STATUS</th>
                <th scope="col" style={thStyle}>CREATED</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, color: S.tertiary, textAlign: "center", padding: 32 }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && tenants.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...tdStyle, color: S.tertiary, textAlign: "center", padding: 32 }}>
                    No tenants found.
                  </td>
                </tr>
              )}
              {!loading &&
                tenants.map(t => {
                  const isHovered = hoveredId === t.id;
                  const isSelected = selectedTenant?.id === t.id;

                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTenant(isSelected ? null : t)}
                      onMouseEnter={() => setHoveredId(t.id)}
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
                      {/* NAME */}
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{t.name}</td>

                      {/* SLUG */}
                      <td style={{ ...tdStyle, fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                        {t.slug}
                      </td>

                      {/* TIER */}
                      <td style={tdStyle}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            padding: "2px 8px",
                            background: planBg(t.plan_tier),
                            color: planColor(t.plan_tier),
                            border: `1px solid ${planColor(t.plan_tier)}`,
                          }}
                        >
                          {t.plan_tier.toUpperCase()}
                        </span>
                      </td>

                      {/* GOV MODE */}
                      <td style={{ ...tdStyle, fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                        {(t.governance_mode ?? "—").toUpperCase()}
                      </td>

                      {/* USERS */}
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: S.fontMono, fontSize: 12 }}>
                        {t.user_count}
                      </td>

                      {/* POSITIONS */}
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: S.fontMono, fontSize: 12 }}>
                        {t.position_count}
                      </td>

                      {/* RUNS */}
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: S.fontMono, fontSize: 12 }}>
                        {t.run_count}
                      </td>

                      {/* STATUS */}
                      <td style={tdStyle}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            padding: "2px 8px",
                            background: t.is_active
                              ? `color-mix(in srgb,${S.pass} 12%,transparent)`
                              : `color-mix(in srgb,${S.fail} 12%,transparent)`,
                            color: t.is_active ? S.pass : S.fail,
                            border: `1px solid ${t.is_active ? S.pass : S.fail}`,
                          }}
                        >
                          {t.is_active ? "ACTIVE" : "SUSPENDED"}
                        </span>
                      </td>

                      {/* CREATED */}
                      <td style={{ ...tdStyle, color: S.tertiary, fontFamily: S.fontMono, fontSize: 10 }}>
                        {fmtDate(t.created_at)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={created => {
            setTenants(prev => [created, ...prev]);
          }}
        />
      )}

      {/* Edit drawer */}
      {selectedTenant && (
        <TenantDrawer
          tenant={selectedTenant}
          token={token}
          onClose={() => setSelectedTenant(null)}
          onSaved={updated => {
            setSelectedTenant(updated);
            setTenants(prev => prev.map(t => (t.id === updated.id ? updated : t)));
          }}
        />
      )}
    </div>
  );
}
