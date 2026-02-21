"use client";

import EmptyState from "@/components/ui/EmptyState";

const S = {
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  border:   "var(--border-rim)",
  tertiary: "var(--text-tertiary)",
  secondary:"var(--text-secondary)",
  cyan:     "var(--accent-cyan)",
  fontMono: "'IBM Plex Mono', monospace",
  fontUI:   "'IBM Plex Sans', sans-serif",
} as const;

const FIELDS = [
  { key: "host",     label: "HOST",     placeholder: "db.example.com", type: "text" },
  { key: "port",     label: "PORT",     placeholder: "5432",           type: "number" },
  { key: "database", label: "DATABASE", placeholder: "hedgecalc_prod", type: "text" },
  { key: "schema",   label: "SCHEMA",   placeholder: "public",         type: "text" },
  { key: "table",    label: "TABLE / QUERY", placeholder: "SELECT * FROM fx_positions", type: "text" },
] as const;

export default function DatabaseConnectorLane() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Config form placeholder */}
      <div style={{
        border:       `1px solid ${S.border}`,
        borderRadius: 4,
        overflow:     "hidden",
      }}>
        <div style={{
          padding:      "8px 14px",
          background:   S.bgSub,
          borderBottom: `1px solid ${S.border}`,
          fontFamily:   S.fontMono,
          fontSize:     "0.5rem",
          letterSpacing:"0.08em",
          color:        S.tertiary,
        }}>
          CONNECTION PARAMETERS
        </div>
        <div style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:                 1,
          background:          S.border,
          padding:             0,
        }}>
          {FIELDS.map(f => (
            <div
              key={f.key}
              style={{ background: S.bgPanel, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 }}
            >
              <label style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.08em", color: S.tertiary }}>
                {f.label}
              </label>
              <input
                type={f.type}
                placeholder={f.placeholder}
                disabled
                style={{
                  fontFamily:   S.fontMono,
                  fontSize:     "0.6875rem",
                  background:   "transparent",
                  border:       "none",
                  borderBottom: `1px solid ${S.border}`,
                  color:        S.secondary,
                  padding:      "2px 0",
                  outline:      "none",
                  width:        "100%",
                  opacity:      0.5,
                  cursor:       "not-allowed",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Coming soon placeholder */}
      <EmptyState
        type="empty"
        title="Direct database connector — coming soon"
        message="Connect to PostgreSQL, MySQL, or MSSQL databases to pull exposure positions automatically. Configure credentials and query mapping in one step."
      />
    </div>
  );
}
