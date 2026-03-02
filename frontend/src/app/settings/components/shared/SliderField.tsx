"use client";
import { S } from "../../types/settings";
import Field from "./Field";

interface Props {
  label:    string;
  hint?:    string;
  value:    number;
  min:      number;
  max:      number;
  step:     number;
  fmt:      (v: number) => string;
  onChange: (v: number) => void;
}

export default function SliderField({ label, hint, value, min, max, step, fmt, onChange }: Props) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="range" min={min} max={max} step={step} value={value}
            onChange={e => onChange(Number(e.target.value))}
            style={{
              width: "100%", height: 4, appearance: "none", outline: "none",
              background: `linear-gradient(to right, ${S.cyan} ${pct}%, ${S.rim} ${pct}%)`,
              borderRadius: 2, cursor: "pointer",
            }}
          />
        </div>
        <span style={{
          fontFamily: S.fontMono, fontSize: 13, fontWeight: 700,
          color: S.cyan, minWidth: 70, textAlign: "right",
        }}>
          {fmt(value)}
        </span>
      </div>
    </Field>
  );
}
