"use client";
import { S, ChangeEntry } from "../types/settings";

interface Props {
  entries: ChangeEntry[];
  onClose: () => void;
}

export default function ChangeLogDrawer({ entries, onClose }: Props) {
  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3,
      marginBottom: 20, overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${S.rim}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary }}>
          SETTINGS CHANGE LOG
        </span>
        <button
          onClick={onClose}
          style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: "none", border: "none", cursor: "pointer" }}
        >
          CLOSE
        </button>
      </div>
      {entries.length === 0 ? (
        <div style={{ padding: "20px 14px", fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, textAlign: "center" }}>
          No changes saved this session.
        </div>
      ) : entries.map((e, i) => (
        <div key={i} style={{ padding: "7px 14px", borderBottom: `1px solid ${S.soft}`, display: "flex", gap: 14 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, flexShrink: 0 }}>{e.ts}</span>
          <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{e.msg}</span>
        </div>
      ))}
    </div>
  );
}
