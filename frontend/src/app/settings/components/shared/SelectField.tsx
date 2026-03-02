"use client";
import { S, inputStyle } from "../../types/settings";
import Field from "./Field";

interface Props {
  label:    string;
  hint?:    string;
  value:    string;
  options:  { value: string; label: string }[];
  onChange: (v: string) => void;
}

export default function SelectField({ label, hint, value, options, onChange }: Props) {
  return (
    <Field label={label} hint={hint}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, color: S.primary }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}
