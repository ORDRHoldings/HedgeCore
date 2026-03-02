"use client";
import { S } from "../../types/settings";

interface RadioOption<T extends string | number> {
  val:   T;
  label: string;
  desc?: string;
}

interface Props<T extends string | number> {
  name:     string;
  value:    T;
  options:  RadioOption<T>[];
  onChange: (v: T) => void;
}

export default function RadioGroup<T extends string | number>({ name, value, options, onChange }: Props<T>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map(opt => (
        <label
          key={String(opt.val)}
          style={{
            display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
            background: value === opt.val
              ? `color-mix(in srgb, ${S.cyan} 8%, transparent)`
              : "transparent",
            border: `1px solid ${value === opt.val ? S.cyan : S.soft}`,
            borderRadius: 2, padding: "10px 14px",
          }}
        >
          <input
            type="radio"
            name={name}
            checked={value === opt.val}
            onChange={() => onChange(opt.val)}
            style={{ accentColor: S.cyan, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: value === opt.val ? S.cyan : S.primary }}>
              {opt.label}
            </div>
            {opt.desc && (
              <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary }}>{opt.desc}</div>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
