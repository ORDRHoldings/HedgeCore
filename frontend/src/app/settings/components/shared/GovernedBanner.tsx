"use client";
import { S } from "../../types/settings";

interface Props {
  lastModifiedAt?: string | null;
  lastModifiedBy?: string | null;
}

export default function GovernedBanner({ lastModifiedAt, lastModifiedBy }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: `color-mix(in srgb, var(--accent-cyan,#06B6D4) 5%, transparent)`,
      border: `1px solid color-mix(in srgb, var(--accent-cyan,#06B6D4) 15%, transparent)`,
      borderLeft: `3px solid var(--accent-cyan,#06B6D4)`,
      borderRadius: 2, padding: "7px 12px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.cyan }}>
          ⊛ AFFECTS OUTPUTS
        </span>
        <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>
          These settings are server-backed and affect hedge engine outputs. Changes require <strong>company.edit_settings</strong> permission and are audit-logged.
        </span>
      </div>
      {lastModifiedAt && (
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, flexShrink: 0, marginLeft: 12 }}>
          Last saved: {lastModifiedAt.replace("T", " ").slice(0, 16)} UTC{lastModifiedBy ? ` by ${lastModifiedBy}` : ""}
        </span>
      )}
    </div>
  );
}
