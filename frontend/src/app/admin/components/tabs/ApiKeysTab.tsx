"use client";

import { useEffect, useState, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { logger } from "@/lib/logger";

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

// ---- Shapes from backend schemas/api_keys.py ----
interface ApiKey {
  id: string;
  key_id: string;
  name: string | null;
  scopes: string[];
  status: "active" | "revoked" | string;
  owner_user_id: string | null;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  token?: string; // only on create response
}

interface ApiKeyListResponse {
  items: ApiKey[];
}

// ---- Shapes from backend schemas/api_key_audit.py ----
// Fields match ApiKeyAuditLogPublic schema.
// Note: the underlying ApiKeyAuditLog model also has status_code, client_ip,
// latency_ms, method, path — but ApiKeyAuditLogPublic does not expose them.
// status_code is included here as optional for forward-compatibility.
interface AuditEntry {
  id: string;
  api_key_id: string;
  event: string;
  ip_address: string | null;
  user_agent: string | null;
  request_path: string | null;
  request_method: string | null;
  status_code?: number | null;
  created_at: string;
}

interface AuditListResponse {
  total: number;
  items: AuditEntry[];
}

// ---- Helpers ----

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function statusCodeColor(code: number): string {
  if (code >= 200 && code < 300) return S.pass;
  if (code >= 400) return S.fail;
  return S.secondary;
}

// ---- NEW KEY CREATED overlay ----

function NewKeyOverlay({
  token: rawToken,
  keyName,
  onDone,
}: {
  token: string;
  keyName: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(rawToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.cyan}`,
          borderRadius: 6,
          width: 520,
          padding: 24,
        }}
      >
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 13,
            fontWeight: 700,
            color: S.pass,
            marginBottom: 4,
            letterSpacing: "0.06em",
          }}
        >
          NEW KEY CREATED
        </div>
        <div
          style={{
            fontFamily: S.fontUI,
            fontSize: 12,
            color: S.secondary,
            marginBottom: 16,
          }}
        >
          {keyName || "API Key"}
        </div>

        <div
          style={{
            background: S.bgDeep,
            border: `1px solid ${S.rim}`,
            borderRadius: 4,
            padding: "10px 12px",
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.cyan,
            wordBreak: "break-all",
            marginBottom: 10,
          }}
        >
          {rawToken}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={copy}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              background: S.cyan,
              border: "none",
              color: S.bgDeep,
              borderRadius: 4,
              padding: "6px 14px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {copied ? "COPIED!" : "COPY"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            background: "rgba(255,180,0,0.08)",
            border: `1px solid ${S.amber}`,
            borderRadius: 4,
            padding: "8px 10px",
            marginBottom: 16,
            fontFamily: S.fontUI,
            fontSize: 12,
            color: S.amber,
          }}
        >
          <span style={{ marginRight: 4 }}>⚠</span>
          This token will only be shown once. Copy it now.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onDone}
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
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- CREATE KEY modal ----

function CreateKeyModal({
  onClose,
  onCreated,
  token,
}: {
  onClose: () => void;
  onCreated: (key: ApiKey) => void;
  token: string;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await dashboardFetch("/admin/api-keys", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const key: ApiKey = await res.json();
      onCreated(key);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
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
          width: 400,
          padding: 24,
        }}
      >
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            color: S.cyan,
            letterSpacing: "0.08em",
            marginBottom: 16,
          }}
        >
          CREATE API KEY
        </div>

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
          style={{
            fontFamily: S.fontUI,
            fontSize: 12,
            background: S.bgDeep,
            border: `1px solid ${S.rim}`,
            color: S.primary,
            borderRadius: 4,
            padding: "7px 10px",
            width: "100%",
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 16,
          }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CI/CD Pipeline"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
            onClick={() => void handleCreate()}
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
            {saving ? "CREATING…" : "CREATE"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Revoke confirm inline ----

function RevokeCell({
  apiKey,
  onRevoked,
  token,
}: {
  apiKey: ApiKey;
  onRevoked: () => void;
  token: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);

  if (apiKey.status !== "active") {
    return (
      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
        —
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          background: "transparent",
          border: `1px solid ${S.red}`,
          color: S.red,
          borderRadius: 3,
          padding: "3px 8px",
          cursor: "pointer",
        }}
      >
        REVOKE
      </button>
    );
  }

  async function confirmRevoke() {
    setRevoking(true);
    try {
      const res = await dashboardFetch(
        `/admin/api-keys/${apiKey.key_id}`,
        token,
        { method: "DELETE" }
      );
      if (res.ok) {
        // Backend returns 204 No Content — do NOT call res.json()
        onRevoked();
        return;
      }
      // Non-2xx: parse error body without assuming JSON on 204
      const err = await res.json().catch(() => ({ detail: "Revoke failed" })) as { detail?: string };
      logger.error("Revoke failed:", err.detail ?? `HTTP ${res.status}`);
    } finally {
      setRevoking(false);
      setConfirming(false);
    }
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: S.fontUI,
        fontSize: 11,
        color: S.amber,
      }}
    >
      Revoke? Cannot undo.
      <button
        onClick={() => void confirmRevoke()}
        disabled={revoking}
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          background: S.red,
          border: "none",
          color: S.bgDeep,
          borderRadius: 3,
          padding: "2px 7px",
          cursor: revoking ? "not-allowed" : "pointer",
          fontWeight: 700,
        }}
      >
        YES
      </button>
      <button
        onClick={() => setConfirming(false)}
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          background: "transparent",
          border: `1px solid ${S.rim}`,
          color: S.secondary,
          borderRadius: 3,
          padding: "2px 7px",
          cursor: "pointer",
        }}
      >
        NO
      </button>
    </span>
  );
}

// ---- Table header cell style ----
const TH: React.CSSProperties = {
  fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontSize: 10,
  color: "var(--text-tertiary)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "6px 10px",
  borderBottom: "1px solid var(--border-rim)",
  textAlign: "left",
  whiteSpace: "nowrap",
  background: "var(--bg-sub)",
  fontWeight: 700,
};

const TD: React.CSSProperties = {
  fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontSize: 12,
  color: "var(--text-primary)",
  padding: "7px 10px",
  borderBottom: "1px solid var(--border-rim)",
  verticalAlign: "middle",
};

// ---- Main component ----

export default function ApiKeysTab({ token }: { token: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState<string>("");

  const fetchKeys = useCallback(async () => {
    setKeysLoading(true);
    setKeysError(null);
    try {
      const res = await dashboardFetch("/admin/api-keys", token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiKeyListResponse = await res.json();
      setKeys(data.items);
    } catch (err: unknown) {
      setKeysError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setKeysLoading(false);
    }
  }, [token]);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await dashboardFetch(
        "/admin/api-key-audit?limit=50",
        token
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AuditListResponse = await res.json();
      setAudit(data.items);
    } catch (err: unknown) {
      setAuditError(
        err instanceof Error ? err.message : "Failed to load audit log"
      );
    } finally {
      setAuditLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchKeys();
    void fetchAudit();
  }, [fetchKeys, fetchAudit]);

  // Light 60s refresh for audit
  useEffect(() => {
    const id = setInterval(() => void fetchAudit(), 60_000);
    return () => clearInterval(id);
  }, [fetchAudit]);

  function handleKeyCreated(key: ApiKey) {
    setShowCreate(false);
    if (key.token) {
      setNewToken(key.token);
      setNewKeyName(key.name ?? "");
    }
    void fetchKeys();
  }

  function handleTokenDone() {
    setNewToken(null);
    setNewKeyName("");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: S.fontUI,
      }}
    >
      {/* ---- API KEYS TABLE ---- */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderBottom: `1px solid ${S.rim}`,
          }}
        >
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              color: S.primary,
              letterSpacing: "0.08em",
            }}
          >
            API KEYS
            {keysLoading && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  color: S.tertiary,
                  fontWeight: 400,
                }}
              >
                …
              </span>
            )}
          </span>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              background: S.cyan,
              border: "none",
              color: S.bgDeep,
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            + CREATE API KEY
          </button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {keysError ? (
            <div
              style={{
                padding: 16,
                fontFamily: S.fontUI,
                fontSize: 12,
                color: S.fail,
              }}
            >
              {keysError}
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "9%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" style={TH}>NAME</th>
                  <th scope="col" style={TH}>KEY ID</th>
                  <th scope="col" style={TH}>STATUS</th>
                  <th scope="col" style={TH}>SCOPES</th>
                  <th scope="col" style={TH}>CREATED</th>
                  <th scope="col" style={TH}>LAST USED</th>
                  <th scope="col" style={TH}>REVOKE</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 && !keysLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        ...TD,
                        textAlign: "center",
                        color: S.tertiary,
                        padding: 24,
                      }}
                    >
                      No API keys.
                    </td>
                  </tr>
                ) : (
                  keys.map((k) => (
                    <tr
                      key={k.id}
                      style={{
                        opacity: k.status === "revoked" ? 0.5 : 1,
                      }}
                    >
                      <td style={TD}>
                        <span style={{ fontWeight: 600 }}>{k.name ?? "—"}</span>
                      </td>
                      <td style={{ ...TD, fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                        {k.key_id.slice(0, 12)}…
                      </td>
                      <td style={TD}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            color:
                              k.status === "active"
                                ? S.pass
                                : S.tertiary,
                          }}
                        >
                          {k.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...TD, fontSize: 11, color: S.secondary }}>
                        {k.scopes.length > 0 ? k.scopes.join(", ") : "—"}
                      </td>
                      <td style={{ ...TD, fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                        {formatDateTime(k.created_at)}
                      </td>
                      <td style={{ ...TD, fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                        {formatDateTime(k.last_used_at)}
                      </td>
                      <td style={TD}>
                        <RevokeCell
                          apiKey={k}
                          token={token}
                          onRevoked={() => void fetchKeys()}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- AUDIT LOG ---- */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          borderTop: `1px solid ${S.rim}`,
        }}
      >
        {/* Audit header */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: `1px solid ${S.rim}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              color: S.primary,
              letterSpacing: "0.08em",
            }}
          >
            AUDIT LOG — LAST 50 CALLS
          </span>
          {auditLoading && (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
              …
            </span>
          )}
        </div>

        {/* Audit table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {auditError ? (
            <div
              style={{
                padding: 16,
                fontFamily: S.fontUI,
                fontSize: 12,
                color: S.fail,
              }}
            >
              {auditError}
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: "8%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" style={TH}>METHOD</th>
                  <th scope="col" style={TH}>PATH</th>
                  <th scope="col" style={TH}>STATUS</th>
                  <th scope="col" style={TH}>EVENT</th>
                  <th scope="col" style={TH}>KEY ID</th>
                  <th scope="col" style={TH}>TIMESTAMP</th>
                </tr>
              </thead>
              <tbody>
                {audit.length === 0 && !auditLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        ...TD,
                        textAlign: "center",
                        color: S.tertiary,
                        padding: 24,
                      }}
                    >
                      No audit entries.
                    </td>
                  </tr>
                ) : (
                  audit.map((entry) => (
                    <tr key={entry.id}>
                      <td
                        style={{
                          ...TD,
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          color: S.amber,
                        }}
                      >
                        {entry.request_method ?? "—"}
                      </td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          color: S.secondary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={entry.request_path ?? ""}
                      >
                        {entry.request_path ?? "—"}
                      </td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          fontWeight: 700,
                          color: entry.status_code != null
                            ? statusCodeColor(entry.status_code)
                            : entry.event === "denied"
                            ? S.fail
                            : entry.event === "used"
                            ? S.pass
                            : S.secondary,
                        }}
                      >
                        {entry.status_code ?? "—"}
                      </td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color:
                            entry.event === "denied" || entry.event === "expired"
                              ? S.fail
                              : entry.event === "revoked"
                              ? S.amber
                              : S.pass,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {entry.event.toUpperCase()}
                      </td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          color: S.secondary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={entry.api_key_id}
                      >
                        {entry.api_key_id.slice(0, 12)}…
                      </td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          color: S.tertiary,
                        }}
                      >
                        {formatDateTime(entry.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- Modals / Overlays ---- */}
      {showCreate && (
        <CreateKeyModal
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={handleKeyCreated}
        />
      )}

      {newToken && (
        <NewKeyOverlay
          token={newToken}
          keyName={newKeyName}
          onDone={handleTokenDone}
        />
      )}
    </div>
  );
}
