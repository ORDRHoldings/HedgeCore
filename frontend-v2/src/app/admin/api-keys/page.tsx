"use client";

import { useEffect, useState, useCallback } from "react";
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

interface ApiKey {
  id: string;
  name: string;
  key_id?: string;
  key_prefix?: string;
  status: "active" | "revoked" | "expired";
  created_at: string;
  expires_at?: string | null;
  scopes?: string[];
  owner_email?: string;
  last_used_at?: string | null;
}

interface CreateKeyForm {
  name: string;
  scopes: string;
  owner_user_id: string;
  expires_at: string;
}

interface CreateKeyResult {
  id: string;
  key: string;
  name: string;
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

export default function ApiKeysPage() {
  const { user } = useAuthStore();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateKeyForm>({ name: "", scopes: "", owner_user_id: "", expires_at: "" });
  const [createResult, setCreateResult] = useState<CreateKeyResult | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiKey[] | { items: ApiKey[] }>("/admin/api-keys");
      setKeys(Array.isArray(res) ? res : (res as { items: ApiKey[] }).items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_superuser) fetchKeys();
  }, [user, fetchKeys]);

  if (!user?.is_superuser) return <NotFound />;

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await api.post(`/admin/api-keys/${id}/revoke`);
      setKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: "revoked" as const } : k));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setRevoking(null);
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setCreateError(null);
    setCreateResult(null);
    try {
      const payload: Record<string, unknown> = {
        name: createForm.name,
        scopes: createForm.scopes.split(",").map((s) => s.trim()).filter(Boolean),
      };
      if (createForm.owner_user_id) payload.owner_user_id = createForm.owner_user_id;
      if (createForm.expires_at) payload.expires_at = createForm.expires_at;

      const res = await api.post<CreateKeyResult>("/admin/api-keys", payload);
      setCreateResult(res);
      fetchKeys();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (s: string) =>
    s === "active" ? S.statusPass : s === "revoked" ? S.accentRed : S.accentAmber;
  const statusBg = (s: string) =>
    s === "active" ? "#D1FAE5" : s === "revoked" ? "#FEE2E2" : "#FFFBEB";

  return (
    <div style={{ padding: "28px 32px", minHeight: "calc(100vh - 92px)", background: S.bgDeep }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
            COMMAND CENTER / API KEYS
          </div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.textPrimary, margin: 0 }}>
            API KEY MANAGEMENT
          </h1>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 4 }}>
            HK_live_ prefixed programmatic access tokens
          </div>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateResult(null); setCreateError(null); }}
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
          + CREATE API KEY
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 16px", background: "#FEF2F2", border: `1px solid ${S.accentRed}`, borderRadius: 5, fontFamily: S.fontMono, fontSize: 12, color: S.accentRed, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            Loading API keys...
          </div>
        ) : keys.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            No API keys found.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: S.bgSub, borderBottom: `1px solid ${S.rim}` }}>
                  {["NAME", "KEY ID", "STATUS", "CREATED", "EXPIRES", "SCOPES", "ACTIONS"].map((h) => (
                    <th key={h} style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: S.textTertiary, padding: "10px 14px", textAlign: "left", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.textPrimary }}>
                      {k.name}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                      {k.key_prefix ?? k.key_id ?? `${k.id.slice(0, 12)}...`}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          color: statusColor(k.status),
                          background: statusBg(k.status),
                          padding: "2px 8px",
                          borderRadius: 3,
                        }}
                      >
                        {k.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, whiteSpace: "nowrap" }}>
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, whiteSpace: "nowrap" }}>
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "Never"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(k.scopes ?? []).slice(0, 3).map((sc) => (
                          <span
                            key={sc}
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 9,
                              fontWeight: 700,
                              color: S.textSecondary,
                              background: S.bgSub,
                              padding: "1px 5px",
                              borderRadius: 3,
                            }}
                          >
                            {sc}
                          </span>
                        ))}
                        {(k.scopes ?? []).length > 3 && (
                          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.textTertiary }}>
                            +{(k.scopes ?? []).length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {k.status === "active" && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          disabled={revoking === k.id}
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            color: S.accentRed,
                            background: "#FEF2F2",
                            border: `1px solid ${S.accentRed}`,
                            borderRadius: 4,
                            padding: "3px 10px",
                            cursor: revoking === k.id ? "default" : "pointer",
                          }}
                        >
                          {revoking === k.id ? "..." : "REVOKE"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Slide-Over */}
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
              <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>CREATE API KEY</span>
              <button onClick={() => setShowCreate(false)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: S.textTertiary }}>
                ×
              </button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { label: "NAME", key: "name", placeholder: "My Integration Key", type: "text" },
                { label: "SCOPES (comma-separated)", key: "scopes", placeholder: "read:positions,write:proposals", type: "text" },
                { label: "OWNER USER ID", key: "owner_user_id", placeholder: "UUID of user (optional)", type: "text" },
                { label: "EXPIRES AT", key: "expires_at", placeholder: "", type: "datetime-local" },
              ].map((field) => (
                <div key={field.key}>
                  <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.textTertiary, display: "block", marginBottom: 6 }}>
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={createForm[field.key as keyof CreateKeyForm]}
                    onChange={(e) => setCreateForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={INPUT_STYLE}
                  />
                </div>
              ))}

              {createError && (
                <div style={{ padding: "8px 12px", background: "#FEF2F2", border: `1px solid ${S.accentRed}`, borderRadius: 5, fontFamily: S.fontMono, fontSize: 11, color: S.accentRed }}>
                  {createError}
                </div>
              )}

              {createResult && (
                <div style={{ padding: "12px 14px", background: "#D1FAE5", border: `1px solid ${S.statusPass}`, borderRadius: 5 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.statusPass, marginBottom: 6 }}>
                    KEY CREATED — COPY NOW (shown once)
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      color: S.textPrimary,
                      background: S.bgPanel,
                      border: `1px solid ${S.rim}`,
                      borderRadius: 4,
                      padding: "8px 10px",
                      wordBreak: "break-all",
                    }}
                  >
                    {createResult.key}
                  </div>
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={submitting || !createForm.name}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: S.bgPanel,
                  background: (submitting || !createForm.name) ? S.textTertiary : S.accentRed,
                  border: "none",
                  borderRadius: 5,
                  padding: "10px",
                  cursor: (submitting || !createForm.name) ? "default" : "pointer",
                  marginTop: 8,
                }}
              >
                {submitting ? "CREATING..." : "CREATE KEY"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
