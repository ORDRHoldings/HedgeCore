"use client";
import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { S } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";

/* ── Backend shapes ──────────────────────────────────────────────────────── */
interface ApiKey {
  id:           string;
  key_id:       string;
  name:         string | null;
  scopes:       string[];
  status:       string;  // "active" | "revoked"
  owner_user_id: string | null;
  created_at:   string;
  last_used_at: string | null;
  token?:       string;  // full key — returned ONCE on creation
}

interface AuditLogItem {
  id:         string;
  api_key_id: string | null;
  user_id:    string | null;
  path:       string | null;
  method:     string | null;
  status_code: number | null;
  created_at: string;
}

interface Props { token: string; }

/* ── Component ───────────────────────────────────────────────────────────── */
export default function ApiKeyManagementTab({ token }: Props) {
  const [keys,       setKeys]       = useState<ApiKey[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [authError,  setAuthError]  = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName,    setNewName]    = useState("");
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revoking,   setRevoking]   = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [toast,      setToast]      = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  // Audit log state
  const [auditLog,    setAuditLog]    = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  };

  /* Load API keys — uses /api/admin/api-keys (API key auth required on backend) */
  const loadKeys = useCallback(async () => {
    setLoading(true); setError(null); setAuthError(false);
    try {
      const res = await dashboardFetch("/api/admin/api-keys", token);
      if (res.status === 401 || res.status === 403) {
        setAuthError(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { items?: ApiKey[] } | ApiKey[];
      const items = Array.isArray(data) ? data : (data as { items?: ApiKey[] }).items ?? [];
      setKeys(items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load API keys.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  /* Load audit log — uses JWT auth */
  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await dashboardFetch("/admin/api-key-audit?limit=25", token);
      if (!res.ok) return;
      const data = await res.json() as { items?: AuditLogItem[]; total?: number };
      setAuditLog(data.items ?? []);
    } catch {
      // Audit log is best-effort
    } finally {
      setAuditLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadKeys();
    loadAudit();
  }, [loadKeys, loadAudit]);

  /* Create key */
  const handleCreate = async () => {
    if (!newName.trim()) { setCreateErr("Name is required."); return; }
    setCreating(true); setCreateErr(null);
    try {
      const res = await dashboardFetch("/api/admin/api-keys", token, {
        method: "POST",
        body:   JSON.stringify({ name: newName.trim(), scopes: [] }),
      });
      if (res.status === 401 || res.status === 403) {
        setCreateErr("API key authentication required — cannot create via browser.");
        return;
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as ApiKey;
      if (data.token) setCreatedKey(data.token);
      setKeys(prev => [data, ...prev]);
      setNewName("");
      setShowCreate(false);
      loadAudit();
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create key.");
    } finally {
      setCreating(false);
    }
  };

  /* Revoke key */
  const handleRevoke = async (keyId: string) => {
    setRevoking(keyId);
    try {
      const res = await dashboardFetch(`/api/admin/api-keys/${keyId}`, token, { method: "DELETE" });
      if (res.status === 401 || res.status === 403) {
        showToast("error", "API key authentication required to revoke.");
        return;
      }
      if (!res.ok && res.status !== 204) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      setKeys(prev => prev.map(k => k.key_id === keyId ? { ...k, status: "revoked" } : k));
      showToast("success", "API key revoked.");
      loadAudit();
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Failed to revoke key.");
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  /* ── Styles ──────────────────────────────────────────────────────────── */
  const th: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.09em",
    color: S.tertiary, textTransform: "uppercase", padding: "6px 10px",
    borderBottom: `1px solid ${S.rim}`, textAlign: "left",
  };
  const td: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: 12, color: S.primary,
    padding: "8px 10px", borderBottom: `1px solid ${S.soft}`, verticalAlign: "middle",
  };

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

      {/* Created key — show ONCE */}
      {createdKey && (
        <div style={{
          background: `color-mix(in srgb, ${S.pass} 6%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.pass} 30%, transparent)`,
          borderLeft: `3px solid ${S.pass}`,
          borderRadius: 2, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.pass, letterSpacing: "0.09em" }}>
            KEY CREATED — COPY NOW · SHOWN ONCE ONLY
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <code style={{
              fontFamily: S.fontMono, fontSize: 12, color: S.pass,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              borderRadius: 2, padding: "8px 12px", flex: 1, wordBreak: "break-all", lineHeight: 1.6,
            }}>
              {createdKey}
            </code>
            <button onClick={() => handleCopy(createdKey)} style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: copied ? S.pass : S.secondary, background: S.bgSub,
              border: `1px solid ${copied ? S.pass : S.rim}`, borderRadius: 2, padding: "8px 12px",
              cursor: "pointer", flexShrink: 0,
            }}>
              {copied ? "COPIED ✓" : "COPY"}
            </button>
            <button onClick={() => setCreatedKey(null)} style={{
              fontFamily: S.fontMono, fontSize: 11, color: S.tertiary,
              background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 2,
              padding: "8px 10px", cursor: "pointer", flexShrink: 0,
            }}>✕</button>
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.amber, lineHeight: 1.5 }}>
            ⚠ Store this key in a secrets manager immediately. It cannot be recovered after closing this banner.
            Use as: <code style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan }}>Authorization: Bearer {createdKey.slice(0, 20)}…</code>
          </div>
        </div>
      )}

      {/* ── Section A: API Keys ─────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionHeader label={`Platform API Keys (HK_live_)`} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={loadKeys} style={{
              fontFamily: S.fontMono, fontSize: 10, color: S.cyan,
              background: "transparent", border: `1px solid ${S.cyan}40`, borderRadius: 2,
              padding: "4px 10px", cursor: "pointer",
            }}>↻</button>
            <button onClick={() => setShowCreate(p => !p)} style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: "#000", background: S.cyan, border: "none", borderRadius: 2,
              padding: "5px 14px", cursor: "pointer",
            }}>+ GENERATE KEY</button>
          </div>
        </div>

        {/* Auth error notice */}
        {authError && (
          <div style={{
            background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
            border: `1px solid ${S.amber}40`, borderLeft: `3px solid ${S.amber}`,
            borderRadius: 2, padding: "12px 16px", marginBottom: 10,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.amber, letterSpacing: "0.08em" }}>
              API KEY AUTH REQUIRED
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.6 }}>
              The key management endpoint (<code style={{ fontFamily: S.fontMono, fontSize: 10 }}>POST /api/admin/api-keys</code>) requires an
              existing <code style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan }}>HK_live_</code> API key in the Authorization header — not a JWT session token.
              This is by design: API keys for service integrations are provisioned via the API itself, not the browser UI.
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary }}>
              To create the first key, use the backend admin CLI or the Swagger UI at{" "}
              <code style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan }}>/api/docs</code>.
            </div>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <div style={{
            background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.cyan} 15%, transparent)`,
            borderLeft: `3px solid ${S.cyan}`,
            borderRadius: 2, padding: "14px 16px", marginBottom: 10,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.cyan, letterSpacing: "0.09em" }}>NEW API KEY</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Name (e.g. CI Pipeline, ERP Integration)"
                style={{
                  fontFamily: S.fontUI, fontSize: 12, color: S.primary,
                  background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
                  padding: "6px 10px", outline: "none", flex: 1,
                }}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
              <button onClick={handleCreate} disabled={creating} style={{
                fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                color: "#000", background: creating ? S.tertiary : S.cyan, border: "none", borderRadius: 2,
                padding: "6px 18px", cursor: creating ? "wait" : "pointer",
              }}>
                {creating ? "CREATING…" : "CREATE"}
              </button>
              <button onClick={() => { setShowCreate(false); setNewName(""); setCreateErr(null); }} style={{
                fontFamily: S.fontMono, fontSize: 10, color: S.secondary, background: "transparent",
                border: `1px solid ${S.rim}`, borderRadius: 2, padding: "6px 12px", cursor: "pointer",
              }}>CANCEL</button>
            </div>
            {createErr && <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail }}>✗ {createErr}</div>}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, padding: "24px 0", letterSpacing: "0.09em" }}>
            LOADING…
          </div>
        ) : error ? (
          <div style={{ background: `color-mix(in srgb, ${S.fail} 8%, transparent)`, border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`, borderRadius: 2, padding: "12px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.fail }}>
            ✗ {error}
          </div>
        ) : !authError && (
          <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 580 }}>
              <thead>
                <tr>
                  <th style={th}>NAME</th>
                  <th style={th}>KEY ID</th>
                  <th style={th}>CREATED</th>
                  <th style={th}>LAST USED</th>
                  <th style={th}>STATUS</th>
                  <th style={th}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...td, textAlign: "center", color: S.tertiary, padding: "28px" }}>
                      No API keys. Generate one above.
                    </td>
                  </tr>
                ) : keys.map(k => (
                  <tr key={k.id}>
                    <td style={td}>{k.name ?? <span style={{ color: S.tertiary }}>—</span>}</td>
                    <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10, color: S.cyan }}>
                      HK_live_{k.key_id.slice(0, 10)}…
                    </td>
                    <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, whiteSpace: "nowrap" }}>
                      {new Date(k.created_at).toLocaleDateString("en-GB")}
                    </td>
                    <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, whiteSpace: "nowrap" }}>
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString("en-GB") : "Never"}
                    </td>
                    <td style={td}>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                        color: k.status === "active" ? S.pass : S.tertiary,
                      }}>
                        {k.status === "active" ? "● ACTIVE" : "○ REVOKED"}
                      </span>
                    </td>
                    <td style={{ ...td, padding: "6px 10px" }}>
                      {k.status === "active" && (
                        <button
                          onClick={() => handleRevoke(k.key_id)}
                          disabled={revoking === k.key_id}
                          style={{
                            fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                            color: S.fail, background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
                            border: `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`,
                            borderRadius: 2, padding: "3px 9px", cursor: revoking === k.key_id ? "wait" : "pointer",
                          }}
                        >
                          {revoking === k.key_id ? "…" : "REVOKE"}
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

      {/* ── Section B: Key Audit Log ────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionHeader label="API Key Access Log" />
          <button onClick={loadAudit} style={{
            fontFamily: S.fontMono, fontSize: 10, color: S.cyan,
            background: "transparent", border: `1px solid ${S.cyan}40`, borderRadius: 2,
            padding: "4px 10px", cursor: "pointer",
          }}>↻</button>
        </div>

        {auditLoading ? (
          <div style={{ textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, padding: "16px 0", letterSpacing: "0.09em" }}>
            LOADING…
          </div>
        ) : (
          <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={th}>TIMESTAMP</th>
                  <th style={th}>KEY ID</th>
                  <th style={th}>PATH</th>
                  <th style={th}>METHOD</th>
                  <th style={th}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...td, textAlign: "center", color: S.tertiary, padding: "24px" }}>
                      No API key access events recorded.
                    </td>
                  </tr>
                ) : auditLog.map(a => (
                  <tr key={a.id}>
                    <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, whiteSpace: "nowrap" }}>
                      {a.created_at.replace("T", " ").slice(0, 16)}
                    </td>
                    <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10, color: S.cyan }}>
                      {a.api_key_id ? a.api_key_id.slice(0, 10) + "…" : "—"}
                    </td>
                    <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                      {a.path ?? "—"}
                    </td>
                    <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10 }}>
                      {a.method ?? "—"}
                    </td>
                    <td style={td}>
                      {a.status_code && (
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                          color: a.status_code < 300 ? S.pass : a.status_code < 500 ? S.amber : S.fail,
                        }}>
                          {a.status_code}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security footer */}
      <div style={{ background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "10px 14px", fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.6 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.secondary, marginRight: 6, letterSpacing: "0.07em" }}>SECURITY</span>
        Keys are stored as Argon2id hashes — the full value is shown once at creation. Pass in the{" "}
        <code style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan }}>Authorization: Bearer HK_live_…</code> header.
        Rotate every 90 days per NIST SP 800-57. Revoke immediately if compromised.
      </div>
    </div>
  );
}
