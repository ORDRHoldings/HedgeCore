"use client";
import { inputStyle, monoInputStyle } from "../../types/settings";
import Field from "./Field";

interface Props {
  label:       string;
  hint?:       string;
  value:       string;
  placeholder?: string;
  mono?:       boolean;
  type?:       string;
  onChange:    (v: string) => void;
}

export default function TextInputField({ label, hint, value, placeholder, mono, type, onChange }: Props) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type ?? "text"}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={mono ? monoInputStyle : inputStyle}
      />
    </Field>
  );
}
