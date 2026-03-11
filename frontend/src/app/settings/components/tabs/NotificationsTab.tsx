"use client";
import { S, NotificationSettings, inputStyle, monoInputStyle } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";
import Field from "../shared/Field";
import SliderField from "../shared/SliderField";

interface Props {
  s:   NotificationSettings;
  set: (v: NotificationSettings) => void;
}

const TOGGLE_ITEMS = [
  { key: "alert_on_breach"     as const, label: "Hedge Ratio Breach",        desc: "Alert when actual hedge coverage deviates from policy target" },
  { key: "alert_on_engine_run" as const, label: "Engine Run Complete",        desc: "Alert when a hedge plan calculation finishes" },
  { key: "alert_on_staging"    as const, label: "Staging Requires Approval",  desc: "Alert when a staged artifact needs your authorization" },
];

export default function NotificationsTab({ s, set }: Props) {
  const u = <K extends keyof NotificationSettings>(k: K) =>
    (v: NotificationSettings[K]) => set({ ...s, [k]: v });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <SectionHeader label="Alert Triggers" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {TOGGLE_ITEMS.map(item => (
            <label key={item.key} style={{
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
              background: s[item.key] ? `color-mix(in srgb, ${S.cyan} 5%, transparent)` : S.bgSub,
              border: `1px solid ${s[item.key] ? S.cyan : S.soft}`,
              borderRadius: 2, padding: "10px 14px",
            }}>
              <input type="checkbox" checked={s[item.key] as boolean}
                onChange={e => u(item.key)(e.target.checked as NotificationSettings[typeof item.key])}
                style={{ accentColor: S.cyan, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: s[item.key] ? S.primary : S.secondary }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>{item.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader label="Breach Threshold" />
        <SliderField label="HEDGE RATIO DRIFT THRESHOLD (%)" hint="notify if coverage drifts by more than this % from policy target"
          value={s.breach_threshold_pct} min={1} max={20} step={1}
          fmt={v => `${v}%`} onChange={v => u("breach_threshold_pct")(v as number)} />
      </div>

      <div>
        <SectionHeader label="Delivery Channels" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="EMAIL RECIPIENTS" hint="comma-separated list">
            <input value={s.email_recipients} onChange={e => u("email_recipients")(e.target.value)}
              placeholder="cfo@company.com, treasury@company.com" style={inputStyle} />
          </Field>
          <Field label="WEBHOOK URL" hint="HTTPS endpoint — JSON POST">
            <input value={s.webhook_url} onChange={e => u("webhook_url")(e.target.value)}
              placeholder="https://hooks.yourapp.com/ordr" style={monoInputStyle} />
          </Field>
          <Field label="SLACK INCOMING WEBHOOK URL">
            <input value={s.slack_webhook_url} onChange={e => u("slack_webhook_url")(e.target.value)}
              placeholder="https://hooks.slack.com/services/…" style={monoInputStyle} />
          </Field>
        </div>
      </div>

      <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, padding: "12px 14px" }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 6 }}>
          WEBHOOK PAYLOAD SCHEMA
        </div>
        <pre style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, margin: 0, lineHeight: 1.6, overflowX: "auto" }}>
{`{
  "event":     "HEDGE_RATIO_BREACH",
  "severity":  "WARNING",
  "run_id":    "run_xxxx",
  "message":   "Confirmed hedge ratio 72% — below policy target 80%",
  "drift_pct": 8,
  "timestamp": "2026-02-23T14:32:00Z",
  "tenant_id": "ordr_default"
}`}
        </pre>
      </div>
    </div>
  );
}
