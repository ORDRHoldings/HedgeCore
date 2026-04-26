// frontend/src/app/settings/legal-entities/page.tsx
"use client";
import { useEffect, useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { listEntities } from "@/lib/api/cashClient";
import type { LegalEntity } from "@/lib/api/cashClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", rim: "var(--border-rim)",
} as const;

export default function LegalEntitiesPage() {
  const { token } = useAuth();
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listEntities(token)
      .then(setEntities)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Building2 size={18} color="var(--accent-primary)" />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
              Legal Entities
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Settings → Legal Entities
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--accent-red,#ef4444)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
      ) : entities.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
          No legal entities configured. Add your first entity to start tracking group treasury positions.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entities.map((e) => (
            <div key={e.id} style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
              padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600 }}>{e.legal_name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                  {e.country} · {e.functional_currency} → {e.reporting_currency}
                  {e.lei ? ` · LEI: ${e.lei}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 3, fontFamily: S.fontMono,
                  background: e.status === "ACTIVE" ? "rgba(34,197,94,0.15)" : "rgba(100,100,100,0.15)",
                  color: e.status === "ACTIVE" ? "#22c55e" : "var(--text-muted)",
                }}>
                  {e.status}
                </span>
                <ChevronRight size={14} color="var(--text-muted)" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
