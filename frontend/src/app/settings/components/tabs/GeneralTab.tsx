"use client";
import { S, OrgSettings, inputStyle } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";
import Field from "../shared/Field";

const CURRENCIES = ["USD","EUR","GBP","JPY","CHF","CAD","AUD","MXN","BRL","CLP","COP"];
const TIMEZONES = [
  "America/New_York","America/Chicago","America/Los_Angeles",
  "Europe/London","Europe/Frankfurt","Europe/Zurich",
  "Asia/Tokyo","Asia/Hong_Kong","Asia/Singapore",
  "America/Sao_Paulo","America/Mexico_City",
];
const MONTHS: [string, string][] = [
  ["01","January"],["02","February"],["03","March"],["04","April"],
  ["05","May"],["06","June"],["07","July"],["08","August"],
  ["09","September"],["10","October"],["11","November"],["12","December"],
];

interface Props {
  s:   OrgSettings;
  set: (v: OrgSettings) => void;
}

export default function GeneralTab({ s, set }: Props) {
  const u = (k: keyof OrgSettings) => (v: string) => set({ ...s, [k]: v });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionHeader label="Organisation Identity" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="ORGANISATION NAME">
          <input value={s.org_name} onChange={e => u("org_name")(e.target.value)}
            placeholder="e.g. ORDR Capital Management" style={inputStyle} />
        </Field>
        <Field label="BRANCH / ENTITY LABEL" hint="shown on reports">
          <input value={s.branch_label} onChange={e => u("branch_label")(e.target.value)}
            placeholder="e.g. HQ, EMEA, LATAM" style={inputStyle} />
        </Field>
        <Field label="REPORTING BASE CURRENCY">
          <select value={s.base_currency} onChange={e => u("base_currency")(e.target.value)} style={inputStyle}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="TIMEZONE">
          <select value={s.timezone} onChange={e => u("timezone")(e.target.value)} style={inputStyle}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>
        <Field label="FISCAL YEAR START">
          <select value={s.fiscal_year_start} onChange={e => u("fiscal_year_start")(e.target.value)} style={inputStyle}>
            {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>

      <SectionHeader label="Report Branding" />
      <Field label="REPORT FOOTER TEXT" hint="appears on all generated reports">
        <input value={s.report_footer} onChange={e => u("report_footer")(e.target.value)}
          placeholder="CONFIDENTIAL — For internal use only" style={inputStyle} />
      </Field>

      <div style={{
        background: `color-mix(in srgb, ${S.cyan} 5%, transparent)`,
        border: `1px solid color-mix(in srgb, ${S.cyan} 15%, transparent)`,
        borderLeft: `3px solid ${S.cyan}`,
        borderRadius: 2, padding: "10px 14px",
      }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan, letterSpacing: "0.07em", marginBottom: 3 }}>
          LOGO UPLOAD
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
          Logo upload (PNG/SVG, 2× for HiDPI) will appear on report covers, PDF headers, and the portal footer.
          File upload requires server-side storage — configure via the backend admin panel.
        </div>
      </div>
    </div>
  );
}
