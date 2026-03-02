"use client";
import { useState } from "react";
import { S, monoInputStyle } from "../../types/settings";
import Field from "./Field";

interface Props {
  label:       string;
  hint?:       string;
  value:       string;
  placeholder?: string;
  onChange:    (v: string) => void;
}

export default function SecretField({ label, hint, value, placeholder, onChange }: Props) {
  const [show, setShow] = useState(false);

  return (
    <Field label={label} hint={hint}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? "Enter key…"}
          autoComplete="off"
          style={{ ...monoInputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => setShow(p => !p)}
          style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
            color: S.secondary, background: S.bgSub,
            border: `1px solid ${S.rim}`, borderRadius: 2,
            padding: "6px 10px", cursor: "pointer", flexShrink: 0,
            letterSpacing: "0.04em",
          }}
        >
          {show ? "HIDE" : "SHOW"}
        </button>
        {value && (
          <div style={{
            fontFamily: S.fontMono, fontSize: 10, color: S.pass,
            background: "rgba(16,185,129,0.08)", border: `1px solid rgba(16,185,129,0.2)`,
            borderRadius: 2, padding: "6px 8px", display: "flex", alignItems: "center",
            gap: 4, flexShrink: 0,
          }}>
            ● SET
          </div>
        )}
      </div>
    </Field>
  );
}
