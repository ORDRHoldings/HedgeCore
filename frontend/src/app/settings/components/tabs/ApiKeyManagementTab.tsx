"use client";
import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { S } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";

interface ApiKey {
  id:         string;
  label:      string;
  prefix:     string;
  created_at: string;
  last_used:  string | null;
  scopes:     string[];
  is_active:  boolean;
}

interface Props { token: string; }

export default function ApiKeyManagementTab({ token }: Props) {
  const [keys,       setKeys]       = useState<ApiKey[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel,   setNewLabel]   = useState("");
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null); // shown once
  const [revoking,   setRevoking]   = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [toast,      setToast]      = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await dashboardFetch("/v1/admin/api-keys", token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { api_keys?: ApiKey[] } | ApiKey[];
      setKeys(Array.isArray(data) ? data : (data as { api_keys?: ApiKey[] }).api_keys ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load API keys.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newLabel.trim()) { setCreateErr("Label is required."); return; }
    setCreating(true); setCreateErr(null);
    try {
      const res = await dashboardFetch("/v1/admin/api-keys", token, {
        method: "POST",
        body:   JSON.stringify({ label: newLabel.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { key: string; api_key?: ApiKey };
      setCreatedKey(data.key);
      if (data.api_key) setKeys(prev => [data.api_key!, ...prev]);
      setNewLabel("");
      setShowCreate(false);
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create key.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      const res = await dashboardFetch(`/v1/admin/api-keys/${id}`, token, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      setKeys(prev => prev.filter(k => k.id !== id));
      showToast("success", "Key revoked.");
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Failed to revoke key.");
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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

      {/* Created key banner — show once */}
      {createdKey && (
        <div style={{
          background: `color-mix(in srgb, ${S.pass} 6%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.pass} 25%, transparent)`,
          borderLeft: `3px solid ${S.pass}`,
          borderRadius: 2, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.pass, letterSpacing: "0.09em" }}>
            KEY CREATED — COPY NOW (SHOWN ONCE ONLY)
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              fontFamily: S.fontMono, fontSize: 12, color: S.pass,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              borderRadius: 2, padding: "8px 12px", flex: 1, wordBreak: "break-all", lineHeight: 1.6,
            }}>
              {createdKey}
            </div>
            <button onClick={() => handleCopy(createdKey)} style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: copied ? S.pass : S.secondary, background: S.bgSub,
              border: `1px solid ${copied ? S.pass : S.rim}`, borderRadius: 2, padding: "8px 12px",
              cursor: "pointer", flexShrink: 0,
            }}>
              {copied ? "COPIED ✓" : "COPY"}
            </button>
            <button onClick={() => setCreatedKey(null)} style={{
              fontFamily: S.fontMono, fontSize: 10, color: S.tertiary,
              background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 2,
              padding: "8px 10px", cursor: "pointer", flexShrink: 0,
            }}>
              ✕
            </button>
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.amber }}>
            ⚠ Store this key in a secrets manager immediately. It cannot be recovered after closing this banner.
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeader label={`API Keys (${keys.length})`} />
        <button
          onClick={() => setShowCreate(p => !p)}
          style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            color: "#000", background: S.cyan, border: "none", borderRadius: 2,
            padding: "5px 14px", cursor: "pointer",
          }}
        >
          + GENERATE NEW KEY
        </button>
      </div>

      {showCreate && (
        <div style={{
          background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.cyan} 15%, transparent)`,
          borderLeft: `3px solid ${S.cyan}`,
          borderRadius: 2, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.cyan, letterSpacing: "0.09em" }}>
            NEW API KEY
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Label (e.g. CI Pipeline, ERP Integration)"
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
            <button onClick={() => { setShowCreate(false); setNewLabel(""); setCreateErr(null); }} style={{
              fontFamily: S.fontMono, fontSize: 10, color: S.secondary, background: "transparent",
              border: `1px solid ${S.rim}`, borderRadius: 2, padding: "6px 12px", cursor: "pointer",
            }}>
              CANCEL
            </button>
          </div>
          {createErr && (
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail }}>✗ {createErr}</div>
          )}
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
      ) : (
        <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headerCell}>LABEL</th>
                <th style={headerCell}>PREFIX</th>
                <th style={headerCell}>CREATED</th>
                <th style={headerCell}>LAST USED</th>
                <th style={headerCell}>STATUS</th>
                <th style={headerCell}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr><td colSpan={6} style={{ ...cell, textAlign: "center", color: S.tertiary, padding: "24px" }}>No API keys. Generate one above.</td></tr>
              ) : keys.map(k => (
                <tr key={k.id}>
                  <td style={cell}>{k.label}</td>
                  <td style={{ ...cell, fontFamily: S.fontMono, fontSize: 11, color: S.cyan }}>{k.prefix}…</td>
                  <td style={{ ...cell, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                    {new Date(k.created_at).toLocaleDateString("en-GB")}
                  </td>
                  <td style={{ ...cell, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                    {k.last_used ? new Date(k.last_used).toLocaleDateString("en-GB") : "Never"}
                  </td>
                  <td style={cell}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: k.is_active ? S.pass : S.tertiary }}>
                      {k.is_active ? "● ACTIVE" : "○ REVOKED"}
                    </span>
                  </td>
                  <td style={{ ...cell, padding: "6px 10px" }}>
                    {k.is_active && (
                      <button
                        onClick={() => handleRevoke(k.id)}
                        disabled={revoking === k.id}
                        style={{
                          fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                          color: S.fail, background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`,
                          borderRadius: 2, padding: "3px 9px", cursor: revoking === k.id ? "wait" : "pointer",
                        }}
                      >
                        {revoking === k.id ? "…" : "REVOKE"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "10px 14px", fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.6 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.secondary, marginRight: 6, letterSpacing: "0.07em" }}>SECURITY</span>
        Keys are stored as bcrypt hashes — the full value is shown once at creation. Use as Bearer token:
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, marginLeft: 4 }}>Authorization: Bearer HK_live_…</span>
      </div>
    </div>
  );
}
