"use client";
import type { ReactNode } from "react";
import { S } from "../../types/settings";

export default function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: S.secondary }}>
          {label}
        </label>
        {hint && (
          <span style={{ fontFamily: S.fontUI, fontSize: 10, color: S.tertiary }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
