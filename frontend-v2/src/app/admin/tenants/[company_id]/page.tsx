"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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

interface TenantDetail {
  id: string; name: string; slug: string; plan_tier: string;
  is_active: boolean; user_count: number; position_count: number;
  run_count: number; created_at: string; domain: string | null;
  settings: Record<string, unknown> | null; governance_mode: string;
}

function NotFound() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: S.bgDeep }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 48, fontWeight: 700, color: "#E2E8F0" }}>404</div>
        <div style={{ fontFamily: S.fontUI, fontSize: 14, color: S.textTertiary, marginTop: 8 }}>Company not found</div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderTop: `3px solid ${color ?? S.accentCyan}`, borderRadius: 6, padding: "16px 20px" }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.textTertiary, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: S.fontMono, fontSize: 28, fontWeight: 700, color: S.textPrimary }}>{value}</div>
    </div>
  );
}

export default function TenantDetailPage() {
  const { user } = useAuthStore();
  const params = useParams<{ company_id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", plan_tier: "", governance_mode: "" });
  const [saving, setSaving] = useState(false);
  const [suspendConfirm, setSuspendConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!params?.company_id) return;
    try {
      setLoading(true); setError(null);
      const data = await api.get<TenantDetail>(`/v1/admin/tenants/${params.company_id}`);
      setTenant(data);
      setEditForm({ name: data.name, plan_tier: data.plan_tier, governance_mode: data.governance_mode });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load company");
    } finally { setLoading(false); }
  }, [params?.company_id]);

  useEffect(() => { load(); }, [load]);

  if (!user?.is_superuser) return <NotFound />;
  if (loading) return <div style={{ padding: 40, fontFamily: S.fontMono, fontSize: 13, color: S.textTertiary }}>Loading company...</div>;
  if (error) return <div style={{ padding: 40, fontFamily: S.fontMono, fontSize: 13, color: S.accentRed }}>{error} <button onClick={load} style={{ background: "none", border: "none", color: S.accentCyan, cursor: "pointer" }}>Retry</button></div>;
  if (!tenant) return <NotFound />;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.fetch(`/v1/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editForm.name, plan_tier: editForm.plan_tier, governance_mode: editForm.governance_mode }),
      });
      setEditing(false);
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  const handleSuspend = async () => {
    try {
      await api.fetch(`/v1/admin/tenants/${tenant.id}/suspend`, { method: "POST" });
      setSuspendConfirm(false);
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Suspend failed"); }
  };

  return (
    <div style={{ padding: "28px 32px", minHeight: "calc(100vh - 92px)", background: S.bgDeep }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button onClick={() => router.push("/admin/tenants")} style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentCyan, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          ← TENANTS
        </button>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>/</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textPrimary, fontWeight: 700 }}>{tenant.name.toUpperCase()}</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
            COMMAND CENTER / TENANTS / DETAIL
          </div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 22, fontWeight: 700, color: S.textPrimary, margin: 0 }}>{tenant.name}</h1>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 4 }}>
            {tenant.slug} · Created {tenant.created_at?.slice(0, 10)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setEditing(!editing)}
            style={{ fontFamily: S.fontMono, fontSize: 11, padding: "8px 16px", border: `1px solid ${S.accentCyan}`, borderRadius: 5, background: "transparent", color: S.accentCyan, cursor: "pointer", fontWeight: 700 }}>
            {editing ? "CANCEL" : "EDIT"}
          </button>
          {tenant.is_active && (
            <button onClick={() => setSuspendConfirm(true)}
              style={{ fontFamily: S.fontMono, fontSize: 11, padding: "8px 16px", border: `1px solid ${S.accentRed}`, borderRadius: 5, background: "transparent", color: S.accentRed, cursor: "pointer", fontWeight: 700 }}>
              SUSPEND
            </button>
          )}
        </div>
      </div>

      {/* Suspended banner */}
      {!tenant.is_active && (
        <div style={{ padding: "10px 16px", background: "#FEF2F2", border: `1px solid ${S.accentRed}`, borderRadius: 5, marginBottom: 20, fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700 }}>
          COMPANY SUSPENDED — All users cannot log in
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        <KpiCard label="USERS" value={tenant.user_count} color={S.accentCyan} />
        <KpiCard label="POSITIONS" value={tenant.position_count.toLocaleString()} color={S.statusPass} />
        <KpiCard label="CALC RUNS" value={tenant.run_count} color={S.accentAmber} />
        <KpiCard label="TIER" value={tenant.plan_tier.toUpperCase()} color={S.textTertiary} />
      </div>

      {/* Detail panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Profile */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 24 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textTertiary, marginBottom: 16 }}>COMPANY PROFILE</div>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {([{ label: "NAME", key: "name" }, { label: "TIER", key: "plan_tier" }, { label: "GOVERNANCE", key: "governance_mode" }] as { label: string; key: keyof typeof editForm }[]).map((f) => (
                <div key={f.key}>
                  <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.textTertiary, display: "block", marginBottom: 6 }}>{f.label}</label>
                  {f.key === "plan_tier" ? (
                    <select value={editForm.plan_tier} onChange={(e) => setEditForm((p) => ({ ...p, plan_tier: e.target.value }))}
                      style={{ width: "100%", fontFamily: S.fontMono, fontSize: 12, color: S.textPrimary, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 5, padding: "7px 12px" }}>
                      <option value="lite">LITE (Free)</option>
                      <option value="smb">SMB</option>
                      <option value="professional">PROFESSIONAL</option>
                      <option value="enterprise">ENTERPRISE</option>
                    </select>
                  ) : f.key === "governance_mode" ? (
                    <select value={editForm.governance_mode} onChange={(e) => setEditForm((p) => ({ ...p, governance_mode: e.target.value }))}
                      style={{ width: "100%", fontFamily: S.fontMono, fontSize: 12, color: S.textPrimary, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 5, padding: "7px 12px" }}>
                      <option value="team">TEAM (4-eyes)</option>
                      <option value="solo">SOLO (self-approve)</option>
                    </select>
                  ) : (
                    <input value={editForm[f.key]} onChange={(e) => setEditForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width: "100%", fontFamily: S.fontMono, fontSize: 12, color: S.textPrimary, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 5, padding: "7px 12px", outline: "none", boxSizing: "border-box" }} />
                  )}
                </div>
              ))}
              <button onClick={handleSave} disabled={saving}
                style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, padding: 10, background: S.accentCyan, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", marginTop: 4 }}>
                {saving ? "SAVING..." : "SAVE CHANGES"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {([["Name", tenant.name], ["Slug", tenant.slug], ["Domain", tenant.domain ?? "—"], ["Plan Tier", tenant.plan_tier.toUpperCase()], ["Governance", tenant.governance_mode.toUpperCase()], ["Status", tenant.is_active ? "ACTIVE" : "SUSPENDED"]] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, borderBottom: `1px solid ${S.rim}` }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>{k}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textPrimary, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Raw Settings */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 24 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textTertiary, marginBottom: 16 }}>RAW SETTINGS (JSON)</div>
          <pre style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary, background: S.bgSub, padding: 12, borderRadius: 4, overflow: "auto", maxHeight: 360, margin: 0 }}>
            {JSON.stringify(tenant.settings ?? {}, null, 2)}
          </pre>
        </div>
      </div>

      {/* Suspend confirmation */}
      {suspendConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 32, maxWidth: 400, width: "100%" }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: S.accentRed, marginBottom: 12 }}>SUSPEND COMPANY</div>
            <div style={{ fontFamily: S.fontUI, fontSize: 14, color: S.textSecondary, marginBottom: 24 }}>
              This will immediately prevent all users of <strong>{tenant.name}</strong> from logging in.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setSuspendConfirm(false)}
                style={{ flex: 1, fontFamily: S.fontMono, fontSize: 12, padding: 10, border: `1px solid ${S.rim}`, borderRadius: 5, background: "transparent", color: S.textSecondary, cursor: "pointer" }}>
                CANCEL
              </button>
              <button onClick={handleSuspend}
                style={{ flex: 1, fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, padding: 10, border: "none", borderRadius: 5, background: S.accentRed, color: "#fff", cursor: "pointer" }}>
                SUSPEND
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
