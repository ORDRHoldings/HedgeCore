"use client";
import { S } from "../../types/settings";

interface Props {
  checked:   boolean;
  onChange:  (v: boolean) => void;
  label:     string;
  desc?:     string;
}

export default function ToggleSwitch({ checked, onChange, label, desc }: Props) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
      background: checked ? `color-mix(in srgb, ${S.cyan} 5%, transparent)` : S.bgSub,
      border: `1px solid ${checked ? S.cyan : S.soft}`,
      borderRadius: 2, padding: "10px 14px",
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: S.cyan, flexShrink: 0 }}
      />
      <div>
        <div style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: checked ? S.primary : S.secondary }}>
          {label}
        </div>
        {desc && (
          <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary }}>{desc}</div>
        )}
      </div>
    </label>
  );
}
