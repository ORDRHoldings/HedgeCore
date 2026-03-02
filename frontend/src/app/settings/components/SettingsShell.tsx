"use client";
import { S } from "../types/settings";

interface Props {
  isDirty:      boolean;
  saving:       boolean;
  changeLogLen: number;
  lastSaved:    string;
  onSave:       () => void;
  onReset:      () => void;
  onToggleLog:  () => void;
}

export default function SettingsShell({
  isDirty, saving, changeLogLen, lastSaved, onSave, onReset, onToggleLog,
}: Props) {
  return (
    <div style={{
      height: 44, padding: "0 24px",
      background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.primary }}>
          SETTINGS
        </span>
        <span style={{ color: S.rim }}>|</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em", color: S.tertiary }}>
          ORDR TERMINAL · CONFIGURATION
        </span>
        {isDirty && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
            color: S.amber,
            background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`,
            padding: "1px 6px", borderRadius: 2,
          }}>
            UNSAVED CHANGES
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {lastSaved && (
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            Last saved: {lastSaved.replace("T", " ").slice(0, 16)} UTC
          </span>
        )}
        <button
          onClick={onToggleLog}
          style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            color: S.secondary, background: "transparent",
            border: `1px solid ${S.rim}`, borderRadius: 2,
            padding: "5px 12px", cursor: "pointer",
          }}
        >
          CHANGE LOG ({changeLogLen})
        </button>
        <button
          onClick={onReset}
          style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            color: S.fail, background: "transparent",
            border: `1px solid ${S.fail}40`, borderRadius: 2,
            padding: "5px 12px", cursor: "pointer",
          }}
        >
          RESET DEFAULTS
        </button>
        <button
          onClick={onSave}
          disabled={saving || !isDirty}
          style={{
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
            color: "#000", background: saving || !isDirty ? S.tertiary : S.cyan,
            border: "none", borderRadius: 2, padding: "5px 18px",
            cursor: saving || !isDirty ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "SAVING…" : isDirty ? "SAVE CHANGES" : "SAVED ✓"}
        </button>
      </div>
    </div>
  );
}
