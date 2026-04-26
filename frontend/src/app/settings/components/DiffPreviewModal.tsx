"use client";
import { S, DiffField } from "../types/settings";

interface Props {
  open:      boolean;
  fields:    DiffField[];
  onConfirm: () => void;
  onCancel:  () => void;
  saving:    boolean;
}

export default function DiffPreviewModal({ open, fields, onConfirm, onCancel, saving }: Props) {
  if (!open) return null;
  const changed = fields.filter(f => f.before !== f.after);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg-panel,#141618)", border: "1px solid var(--border-rim,#2A2D34)",
        borderRadius: 4, padding: 28, width: 560, maxHeight: "80vh", overflow: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.09em", color: S.primary, marginBottom: 4 }}>
          CONFIRM GOVERNED SETTINGS CHANGE
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 20 }}>
          The following changes affect hedge engine outputs and will be audit-logged.
        </div>

        {changed.length === 0 ? (
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>No changes detected.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {changed.map(f => (
              <div key={f.label} style={{
                background: "var(--bg-sub,#1A1D21)", border: "1px solid var(--border-soft,#1F2228)",
                borderRadius: 2, padding: "8px 12px",
              }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 4 }}>{f.label}</div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: "var(--accent-red,#EF4444)", textDecoration: "line-through" }}>{f.before}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>→</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: "var(--status-pass,#10B981)", fontWeight: 700 }}>{f.after}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button
            onClick={onConfirm}
            disabled={saving || changed.length === 0}
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
              color: S.black, background: saving || changed.length === 0 ? S.tertiary : S.cyan,
              border: "none", borderRadius: 2, padding: "8px 22px",
              cursor: saving || changed.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "SAVING…" : "CONFIRM & SAVE"}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
              color: S.secondary, background: "transparent",
              border: "1px solid var(--border-rim,#2A2D34)", borderRadius: 2, padding: "8px 18px", cursor: "pointer",
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
