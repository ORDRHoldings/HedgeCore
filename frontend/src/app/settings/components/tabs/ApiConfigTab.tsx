"use client";
import { useState } from "react";
import { S, ApiKeySettings, monoInputStyle, inputStyle } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";
import Field from "../shared/Field";
import SecretField from "../shared/SecretField";

interface Props {
  s:   ApiKeySettings;
  set: (v: ApiKeySettings) => void;
}

function ConnectivityChecker({ apiUrl }: { apiUrl: string }) {
  const [status,  setStatus]  = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [latency, setLatency] = useState<number | null>(null);

  const check = async () => {
    setStatus("checking");
    const t0 = performance.now();
    try {
      const res = await fetch(`${apiUrl}/v1/health`, { signal: AbortSignal.timeout(5000) });
      const ms  = Math.round(performance.now() - t0);
      setLatency(ms);
      setStatus(res.ok ? "ok" : "fail");
    } catch {
      setStatus("fail");
      setLatency(null);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button onClick={check} disabled={status === "checking"} style={{
        fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        color: "#000", background: status === "checking" ? S.tertiary : S.cyan,
        border: "none", borderRadius: 2, padding: "7px 16px",
        cursor: status === "checking" ? "wait" : "pointer",
      }}>
        {status === "checking" ? "CHECKING…" : "TEST CONNECTION"}
      </button>
      {status === "ok"   && <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.pass }}>✓ CONNECTED — {latency}ms</span>}
      {status === "fail" && <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.fail }}>✗ UNREACHABLE — check URL and CORS headers</span>}
    </div>
  );
}

export default function ApiConfigTab({ s, set }: Props) {
  const u = (k: keyof ApiKeySettings) => (v: string) => set({ ...s, [k]: v });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{
        background: `color-mix(in srgb, ${S.fail} 5%, transparent)`,
        border: `1px solid color-mix(in srgb, ${S.fail} 20%, transparent)`,
        borderLeft: `3px solid ${S.fail}`,
        borderRadius: 2, padding: "10px 14px",
        fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.5,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.fail, marginRight: 6, letterSpacing: "0.07em" }}>SECURITY</span>
        API keys are stored in localStorage for demo mode. In production, keys are stored in the backend secrets vault
        (HashiCorp Vault / AWS Secrets Manager) and never transmitted to the browser.
      </div>

      <div>
        <SectionHeader label="Market Data" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SecretField label="ALPHA VANTAGE API KEY" hint="used for live FX spot rates and forward curves"
            value={s.alpha_vantage_key} placeholder="Enter Alpha Vantage key…" onChange={u("alpha_vantage_key")} />
          <SecretField label="BLOOMBERG TERMINAL API KEY" hint="optional — premium market data override"
            value={s.bloomberg_api_key} placeholder="BLPAPI key (optional)" onChange={u("bloomberg_api_key")} />
          <SecretField label="REFINITIV / EIKON API KEY" hint="optional — Refinitiv Elektron / Workspace override"
            value={s.refinitiv_api_key} placeholder="Refinitiv DSS key (optional)" onChange={u("refinitiv_api_key")} />
        </div>
      </div>

      <div>
        <SectionHeader label="Backend & Broker Connectivity" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="BACKEND API URL" hint="base URL for ORDR REST API">
            <input value={s.backend_api_url} onChange={e => u("backend_api_url")(e.target.value)}
              placeholder="http://localhost:8000/api" style={monoInputStyle} />
          </Field>
          <Field label="IBKR TWS HOST" hint="localhost for local TWS, or gateway IP">
            <input value={s.ibkr_tws_host} onChange={e => u("ibkr_tws_host")(e.target.value)}
              placeholder="127.0.0.1" style={monoInputStyle} />
          </Field>
          <Field label="IBKR TWS PORT" hint="7497 = paper, 7496 = live TWS; 4002 = paper Gateway, 4001 = live Gateway">
            <input value={s.ibkr_tws_port} onChange={e => u("ibkr_tws_port")(e.target.value)}
              placeholder="7497" style={monoInputStyle} />
          </Field>
        </div>
      </div>

      <div>
        <SectionHeader label="Connectivity Check" />
        <ConnectivityChecker apiUrl={s.backend_api_url} />
      </div>
    </div>
  );
}
