"use client";
import { S, PolicyLimitSettings } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";
import GovernedBanner from "../shared/GovernedBanner";
import SliderField from "../shared/SliderField";

interface Props {
  s:               PolicyLimitSettings;
  set:             (v: PolicyLimitSettings) => void;
  lastModifiedAt?: string | null;
  lastModifiedBy?: string | null;
}

export default function PolicyLimitsTab({ s, set, lastModifiedAt, lastModifiedBy }: Props) {
  const u   = (k: keyof PolicyLimitSettings) => (v: number) => set({ ...s, [k]: v });
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const usd = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <GovernedBanner lastModifiedAt={lastModifiedAt} lastModifiedBy={lastModifiedBy} />

      <div>
        <SectionHeader label="Hedge Ratios" />
        <div style={{
          background: `color-mix(in srgb, ${S.amber} 5%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.amber} 15%, transparent)`,
          borderLeft: `3px solid ${S.amber}`,
          borderRadius: 2, padding: "8px 12px", marginBottom: 16,
          fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.5,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.amber, marginRight: 6 }}>POLICY ENGINE</span>
          These ratios become the default for new policy templates. Override per-template in Saved Policies.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SliderField label="CONFIRMED EXPOSURE HEDGE RATIO" hint="proportion of confirmed FX exposure to hedge"
            value={s.confirmed_hedge_ratio} min={0} max={1} step={0.05} fmt={pct} onChange={u("confirmed_hedge_ratio")} />
          <SliderField label="FORECAST EXPOSURE HEDGE RATIO" hint="proportion of forecast FX exposure to hedge"
            value={s.forecast_hedge_ratio} min={0} max={1} step={0.05} fmt={pct} onChange={u("forecast_hedge_ratio")} />
        </div>
      </div>

      <div>
        <SectionHeader label="Trade Size Limits" />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SliderField label="MINIMUM TRADE SIZE (USD)" hint="trades below this threshold are aggregated or skipped"
            value={s.min_trade_size_usd} min={100_000} max={5_000_000} step={100_000} fmt={usd} onChange={u("min_trade_size_usd")} />
          <SliderField label="MAXIMUM SINGLE TRADE SIZE (USD)" hint="trades above this trigger additional approval workflow"
            value={s.max_single_trade_usd} min={1_000_000} max={200_000_000} step={1_000_000} fmt={usd} onChange={u("max_single_trade_usd")} />
        </div>
      </div>

      <div>
        <SectionHeader label="Governance Controls" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <SliderField label="COOLING-OFF PERIOD (HOURS)" hint="minimum time between staging and execution"
            value={s.cooling_off_hours} min={0} max={72} step={1} fmt={v => `${v}h`} onChange={u("cooling_off_hours")} />
          <SliderField label="REQUIRED APPROVALS" hint="minimum authorizations for staging promotion"
            value={s.required_approvals} min={1} max={5} step={1} fmt={v => `${v}`} onChange={u("required_approvals")} />
          <SliderField label="TRANSACTION SPREAD (BPS)" hint="assumed bid-ask cost for hedge execution"
            value={s.spread_bps} min={1} max={100} step={1} fmt={v => `${v} bps`} onChange={u("spread_bps")} />
          <SliderField label="MIN INTEGRITY SCORE" hint="staging artifacts below this score are blocked"
            value={s.integrity_threshold} min={0} max={100} step={5} fmt={v => `${v}/100`} onChange={u("integrity_threshold")} />
        </div>
      </div>
    </div>
  );
}
