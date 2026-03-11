"use client";
import { S, ExecutionSettings, monoInputStyle } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";
import GovernedBanner from "../shared/GovernedBanner";
import SliderField from "../shared/SliderField";
import Field from "../shared/Field";

interface Props {
  s:               ExecutionSettings;
  set:             (v: ExecutionSettings) => void;
  lastModifiedAt?: string | null;
  lastModifiedBy?: string | null;
}

const SIGMA_OPTIONS = [
  { val: 0.08 as const, label: "1σ ±8%",  desc: "Conservative — 68% confidence interval" },
  { val: 0.15 as const, label: "2σ ±15%", desc: "Standard — 95% confidence interval" },
  { val: 0.22 as const, label: "3σ ±22%", desc: "Extreme — 99.7% confidence interval" },
];

export default function ExecutionTab({ s, set, lastModifiedAt, lastModifiedBy }: Props) {
  const u   = <K extends keyof ExecutionSettings>(k: K) => (v: ExecutionSettings[K]) => set({ ...s, [k]: v });
  const usd = (v: number) =>
    v === 0 ? "OFF" : v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <GovernedBanner lastModifiedAt={lastModifiedAt} lastModifiedBy={lastModifiedBy} />

      <div>
        <SectionHeader label="Default Execution Product" />
        <div style={{ display: "flex", gap: 8 }}>
          {(["NDF", "FWD", "FUTURES"] as const).map(p => (
            <button key={p} onClick={() => u("default_product")(p)} style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
              color: s.default_product === p ? "#000" : S.secondary,
              background: s.default_product === p ? S.cyan : "transparent",
              border: `1px solid ${s.default_product === p ? S.cyan : S.rim}`,
              borderRadius: 2, padding: "6px 18px", cursor: "pointer",
            }}>
              {p}
            </button>
          ))}
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 6 }}>
          {s.default_product === "NDF"     && "Non-Deliverable Forward — cash-settled, used for restricted currencies (MXN, BRL, CLP, COP)."}
          {s.default_product === "FWD"     && "Deliverable Forward — physical settlement, used for G10 currencies (EUR, GBP, JPY, CHF)."}
          {s.default_product === "FUTURES" && "CME/COMEX listed futures — exchange-cleared, daily margin settlement, 27-currency coverage."}
        </div>
      </div>

      <div>
        <SectionHeader label="Default Stress Sigma (Worst-Case Scenario)" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SIGMA_OPTIONS.map(opt => (
            <label key={opt.val} style={{
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
              background: s.stress_sigma === opt.val ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
              border: `1px solid ${s.stress_sigma === opt.val ? S.cyan : S.soft}`,
              borderRadius: 2, padding: "10px 14px",
            }}>
              <input type="radio" name="sigma" checked={s.stress_sigma === opt.val}
                onChange={() => u("stress_sigma")(opt.val)} style={{ accentColor: S.cyan, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: s.stress_sigma === opt.val ? S.cyan : S.primary }}>
                  {opt.label}
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader label="Risk Thresholds" />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SliderField label="MAX ACCEPTABLE FRICTION (BPS)" hint="execution cost above this triggers a warning"
            value={s.max_friction_bps} min={1} max={100} step={1} fmt={v => `${v} bps`} onChange={v => u("max_friction_bps")(v)} />
          <SliderField label="COUNTERPARTY EXPOSURE LIMIT (USD)" hint="max notional per counterparty before additional sign-off"
            value={s.counterparty_limit_usd} min={1_000_000} max={100_000_000} step={1_000_000} fmt={usd} onChange={v => u("counterparty_limit_usd")(v)} />
          <SliderField label="AUTO-APPROVE THRESHOLD (USD)" hint="trades below this amount skip additional approval (0 = always require)"
            value={s.auto_submit_below_usd} min={0} max={5_000_000} step={100_000} fmt={usd} onChange={v => u("auto_submit_below_usd")(v)} />
        </div>
      </div>

      <div>
        <SectionHeader label="Execution Desk Defaults" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="IBKR ACCOUNT ID" hint="shown on IBKR JSON payloads">
            <input value={s.ibkr_account_id} onChange={e => u("ibkr_account_id")(e.target.value)}
              placeholder="U1234567" style={monoInputStyle} />
          </Field>
          <Field label="FX DESK EMAIL">
            <input value={s.fx_desk_email} onChange={e => u("fx_desk_email")(e.target.value)}
              placeholder="fx@yourbank.com" style={{ ...monoInputStyle, fontFamily: S.fontUI }} type="email" />
          </Field>
          <Field label="FX DESK PHONE">
            <input value={s.fx_desk_phone} onChange={e => u("fx_desk_phone")(e.target.value)}
              placeholder="+1 212 000 0000" style={{ ...monoInputStyle, fontFamily: S.fontUI }} />
          </Field>
        </div>
      </div>
    </div>
  );
}
