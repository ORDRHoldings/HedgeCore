"use client";

/**
 * connectors/hub/page.tsx — Live ERP Connector Hub
 *
 * Institutional-grade hub for connecting live accounting/ERP systems:
 * QuickBooks Online, Xero, NetSuite, Sage Intacct, Dynamics 365 Finance.
 *
 * Status per tenant+provider is fetched from /v1/connectors/{provider}/status.
 * Connect button starts the OAuth flow or opens a form modal (Intacct).
 * Health check runs a live probe. View CoA pulls chart of accounts.
 */

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { PageShell } from "@/components/layout/PageShell";
import { LayoutDashboard, RefreshCw, Plug, PlugZap, Activity, AlertTriangle } from "lucide-react";
import { StatusDot } from "@/components/ui/StatusDot";
import { logger } from "@/lib/logger";
import {
  authorizeConnector,
  connectForm,
  disconnectConnector,
  getConnectorStatus,
  listProviders,
  probeConnectorHealth,
  pullCOA,
  type ConnectorHealth,
  type ConnectorStatus,
  type ProviderMeta,
} from "@/api/connectorClient";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  pass: "var(--status-pass)",
  fail: "var(--accent-red,#B91C1C)",
  amber: "var(--accent-amber)",
} as const;

type Row = {
  provider: ProviderMeta;
  status: ConnectorStatus | null;
  health: ConnectorHealth | null;
  busy: boolean;
};

export default function ConnectorHubPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<{
    provider: string;
    stateToken: string;
    fields: string[];
  } | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const providers = await listProviders(token);
      const statuses = await Promise.all(
        providers.map(async (p) => {
          try {
            const st = await getConnectorStatus(p.provider_id, token);
            return { provider: p, status: st, health: null, busy: false } as Row;
          } catch (e) {
            logger.warn("connector.status.failed", { provider: p.provider_id, err: String(e) });
            return { provider: p, status: null, health: null, busy: false } as Row;
          }
        }),
      );
      setRows(statuses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Detect callback query params (?provider=X&status=connected) and refresh
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("provider")) {
      void refresh();
    }
  }, [refresh]);

  async function onConnect(provider: ProviderMeta) {
    if (!token) return;
    try {
      const extra: Record<string, string> = {};
      if (provider.provider_id === "netsuite") {
        const acct = window.prompt("NetSuite account ID (e.g. TSTDRV1234567):");
        if (!acct) return;
        extra.account_id = acct;
      } else if (provider.provider_id === "dynamics365") {
        const url = window.prompt("D365 instance URL (e.g. https://contoso.operations.dynamics.com):");
        if (!url) return;
        extra.instance_url = url;
      }
      const resp = await authorizeConnector(provider.provider_id, extra, token);
      if (resp.requires_form) {
        setFormState({
          provider: provider.provider_id,
          stateToken: resp.state,
          fields: resp.form_fields,
        });
        const blank: Record<string, string> = {};
        resp.form_fields.forEach((f) => (blank[f] = ""));
        setFormValues(blank);
      } else if (resp.authorize_url) {
        window.location.href = resp.authorize_url;
      }
    } catch (e) {
      logger.error("connector.authorize.failed", { provider: provider.provider_id, err: String(e) });
      setError(`Failed to start OAuth for ${provider.display_name}`);
    }
  }

  async function onDisconnect(provider: ProviderMeta) {
    if (!token) return;
    if (!window.confirm(`Disconnect ${provider.display_name}? Tokens will be wiped.`)) return;
    try {
      await disconnectConnector(provider.provider_id, token);
      await refresh();
    } catch (e) {
      logger.error("connector.disconnect.failed", { provider: provider.provider_id, err: String(e) });
      setError(`Failed to disconnect ${provider.display_name}`);
    }
  }

  async function onProbe(provider: ProviderMeta) {
    if (!token) return;
    setRows((prev) =>
      prev.map((r) => (r.provider.provider_id === provider.provider_id ? { ...r, busy: true } : r)),
    );
    try {
      const h = await probeConnectorHealth(provider.provider_id, token);
      setRows((prev) =>
        prev.map((r) =>
          r.provider.provider_id === provider.provider_id ? { ...r, health: h, busy: false } : r,
        ),
      );
    } catch (e) {
      logger.error("connector.health.failed", { provider: provider.provider_id, err: String(e) });
      setRows((prev) =>
        prev.map((r) =>
          r.provider.provider_id === provider.provider_id ? { ...r, busy: false } : r,
        ),
      );
    }
  }

  async function onViewCOA(provider: ProviderMeta) {
    if (!token) return;
    try {
      const coa = await pullCOA(provider.provider_id, token);
      window.alert(`Pulled ${coa.accounts.length} accounts from ${provider.display_name}.`);
    } catch (e) {
      logger.error("connector.coa.failed", { provider: provider.provider_id, err: String(e) });
      setError(`Failed to fetch CoA for ${provider.display_name}`);
    }
  }

  async function onSubmitForm() {
    if (!formState || !token) return;
    try {
      await connectForm(
        formState.provider,
        { state: formState.stateToken, fields: formValues },
        token,
      );
      setFormState(null);
      setFormValues({});
      await refresh();
    } catch (e) {
      logger.error("connector.connect_form.failed", { provider: formState.provider, err: String(e) });
      setError("Failed to connect with provided credentials");
    }
  }

  return (
    <PageShell
      title="Live ERP Connector Hub"
      icon={LayoutDashboard}
    >
      <div style={{ padding: 20, fontFamily: S.fontUI, color: S.primary }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 12, color: S.secondary, fontFamily: S.fontMono }}>
            {rows.length} providers · {rows.filter((r) => r.status?.connected).length} connected
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              background: S.bgSub,
              border: `1px solid ${S.rim}`,
              color: S.primary,
              padding: "6px 12px",
              fontSize: 12,
              fontFamily: S.fontMono,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              border: `1px solid ${S.fail}`,
              background: "rgba(185,28,28,0.08)",
              marginBottom: 16,
              fontSize: 12,
              fontFamily: S.fontMono,
              color: S.fail,
            }}
          >
            <AlertTriangle size={12} style={{ display: "inline", marginRight: 6 }} />
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))",
            gap: 16,
          }}
        >
          {rows.map((row) => (
            <ProviderCard
              key={row.provider.provider_id}
              row={row}
              onConnect={() => onConnect(row.provider)}
              onDisconnect={() => onDisconnect(row.provider)}
              onProbe={() => onProbe(row.provider)}
              onViewCOA={() => onViewCOA(row.provider)}
            />
          ))}
        </div>

        {formState && (
          <FormModal
            provider={formState.provider}
            fields={formState.fields}
            values={formValues}
            onChange={(k, v) => setFormValues((p) => ({ ...p, [k]: v }))}
            onSubmit={onSubmitForm}
            onCancel={() => {
              setFormState(null);
              setFormValues({});
            }}
          />
        )}
      </div>
    </PageShell>
  );
}

function ProviderCard({
  row,
  onConnect,
  onDisconnect,
  onProbe,
  onViewCOA,
}: {
  row: Row;
  onConnect: () => void;
  onDisconnect: () => void;
  onProbe: () => void;
  onViewCOA: () => void;
}) {
  const connected = !!row.status?.connected;
  const circuitOpen = !!row.status?.circuit_open;

  return (
    <div
      style={{
        border: `1px solid ${S.rim}`,
        background: S.bgPanel,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: S.primary }}>
          {row.provider.display_name}
        </div>
        <StatusDot
          status={connected ? (circuitOpen ? "warn" : "pass") : "neutral"}
          label={connected ? (circuitOpen ? "circuit open" : "connected") : "not connected"}
        />
      </div>

      <div style={{ fontSize: 11, color: S.tertiary, fontFamily: S.fontMono }}>
        auth: {row.provider.auth_style}
        {row.status?.realm_id && (
          <>
            {" · realm: "}
            <span style={{ color: S.secondary }}>{row.status.realm_id.slice(0, 24)}</span>
          </>
        )}
      </div>

      {row.status?.last_connected_at && (
        <div style={{ fontSize: 11, color: S.tertiary, fontFamily: S.fontMono }}>
          connected: {row.status.last_connected_at.slice(0, 19).replace("T", " ")}
        </div>
      )}
      {row.status?.last_error && (
        <div style={{ fontSize: 11, color: S.fail, fontFamily: S.fontMono }}>
          last error: {row.status.last_error.slice(0, 60)}
        </div>
      )}

      {row.health && (
        <div
          style={{
            fontSize: 11,
            fontFamily: S.fontMono,
            color: row.health.healthy ? S.pass : S.fail,
          }}
        >
          <Activity size={11} style={{ display: "inline", marginRight: 4 }} />
          {row.health.healthy ? "healthy" : "unhealthy"} · {row.health.latency_ms.toFixed(0)}ms
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        {!connected ? (
          <Button onClick={onConnect} icon={<Plug size={11} />} label="Connect" />
        ) : (
          <>
            <Button
              onClick={onProbe}
              icon={<Activity size={11} />}
              label={row.busy ? "…" : "Probe"}
              disabled={row.busy}
            />
            <Button onClick={onViewCOA} icon={<PlugZap size={11} />} label="View CoA" />
            <Button onClick={onDisconnect} label="Disconnect" danger />
          </>
        )}
      </div>
    </div>
  );
}

function Button({
  onClick,
  label,
  icon,
  disabled,
  danger,
}: {
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: danger ? "rgba(185,28,28,0.08)" : S.bgSub,
        border: `1px solid ${danger ? S.fail : S.rim}`,
        color: danger ? S.fail : S.primary,
        padding: "5px 10px",
        fontSize: 11,
        fontFamily: S.fontMono,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function FormModal({
  provider,
  fields,
  values,
  onChange,
  onSubmit,
  onCancel,
}: {
  provider: string;
  fields: string[];
  values: Record<string, string>;
  onChange: (k: string, v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          padding: 20,
          minWidth: 400,
          fontFamily: S.fontUI,
          color: S.primary,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          Connect {provider}
        </div>
        {fields.map((f) => (
          <div key={f} style={{ marginBottom: 12 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: S.secondary,
                fontFamily: S.fontMono,
                marginBottom: 4,
              }}
            >
              {f}
            </label>
            <input
              type={f.includes("password") ? "password" : "text"}
              value={values[f] ?? ""}
              onChange={(e) => onChange(f, e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 12,
                fontFamily: S.fontMono,
                background: S.bgSub,
                border: `1px solid ${S.rim}`,
                color: S.primary,
              }}
            />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Button onClick={onCancel} label="Cancel" />
          <Button onClick={onSubmit} label="Connect" />
        </div>
      </div>
    </div>
  );
}
