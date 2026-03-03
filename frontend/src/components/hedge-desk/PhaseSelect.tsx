"use client";

import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import DisclosurePanel from "./DisclosurePanel";
import { CheckSquareIcon, SquareIcon, AlertCircleIcon, LoaderIcon } from "lucide-react";

const HD = {
  navy:    "#0A1F44",
  royal:   "#1C62F2",
  emerald: "#2ECC71",
  crimson: "#E74C3C",
  slate:   "#8A9AB5",
  bgPanel: "var(--bg-panel)",
  bgSub:   "var(--bg-sub)",
  bgDeep:  "var(--bg-deep)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

interface PhaseSelectProps {
  token: string;
  onComplete: (positions: PositionRow[]) => void;
}

const STATUS_LABEL: Record<string, { color: string; label: string }> = {
  POLICY_ASSIGNED:   { color: HD.cyan,    label: "POLICY ASSIGNED" },
  READY_TO_EXECUTE:  { color: HD.emerald, label: "READY" },
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export default function PhaseSelect({ token, onComplete }: PhaseSelectProps) {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch("/v1/positions?limit=200", token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: PositionRow[] = (data.items ?? data ?? []) as PositionRow[];
      const eligible = items.filter(p =>
        p.execution_status === "POLICY_ASSIGNED" ||
        p.execution_status === "READY_TO_EXECUTE"
      );
      setPositions(eligible);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load positions");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 50) {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === positions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(positions.slice(0, 50).map(p => p.id)));
    }
  };

  const selectedPositions = positions.filter(p => selected.has(p.id));

  // Summary: total notional per currency
  const currencySummary = selectedPositions.reduce<Record<string, number>>((acc, p) => {
    const ccy = p.currency;
    acc[ccy] = (acc[ccy] ?? 0) + (p.amount ?? 0);
    return acc;
  }, {});

  const handleProceed = () => {
    if (selectedPositions.length === 0) return;
    onComplete(selectedPositions);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px", height: "100%", overflowY: "auto" }}>

      {/* Hint */}
      <DisclosurePanel title="Select positions to hedge in this run" level="L1" defaultOpen>
        <p style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.secondary, margin: 0, lineHeight: 1.6 }}>
          Select the positions you want to include in this hedge calculation run. Only positions with status
          <strong style={{ color: HD.cyan }}> POLICY ASSIGNED</strong> or
          <strong style={{ color: HD.emerald }}> READY TO EXECUTE</strong> are eligible.
          You can select up to 50 positions per run.
        </p>
      </DisclosurePanel>

      {/* Selection summary card */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 16px",
        background: `color-mix(in srgb, var(--accent-cyan) 6%, transparent)`,
        border: `1px solid var(--border-rim)`,
        borderRadius: 2,
        marginBottom: 12,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--accent-cyan)" }}>
            SELECTION
          </span>
          <span style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            {selected.size} of {positions.length} selected
          </span>
        </div>
        {selected.size > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
              NOTIONAL
            </span>
            <span style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
                positions.filter(p => selected.has(p.id)).reduce((sum, p) => sum + (p.amount || 0), 0)
              )} {positions.find(p => selected.has(p.id))?.currency ?? ""}
            </span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button
          disabled={selected.size === 0}
          onClick={handleProceed}
          title={selected.size === 0 ? "Select at least 1 eligible position" : `Proceed with ${selected.size} position${selected.size !== 1 ? "s" : ""}`}
          style={{
            fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "8px 20px",
            background: selected.size === 0 ? "transparent" : "var(--accent-cyan)",
            color: selected.size === 0 ? "var(--text-tertiary)" : "var(--bg-deep)",
            border: `1px solid ${selected.size === 0 ? "var(--border-rim)" : "var(--accent-cyan)"}`,
            cursor: selected.size === 0 ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}>
          {selected.size === 0 ? "SELECT POSITIONS TO PROCEED" : `PROCEED TO CALCULATE — ${selected.size}`}
        </button>
      </div>

      {/* Position list */}
      <div style={{
        border: `1px solid ${HD.rim}`,
        borderRadius: 4,
        overflow: "hidden",
        background: HD.bgPanel,
        flex: 1,
      }}>
        {/* List header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "32px 1fr 80px 120px 100px 100px",
          gap: 0,
          padding: "8px 12px",
          background: HD.bgSub,
          borderBottom: `1px solid ${HD.soft}`,
        }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={toggleAll}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
            >
              {selected.size > 0 && selected.size === positions.length
                ? <CheckSquareIcon size={16} color={HD.cyan} />
                : <SquareIcon size={16} color={HD.slate} />
              }
            </button>
          </div>
          {["ENTITY", "STATUS", "CURRENCY", "AMOUNT", "VALUE DATE"].map(h => (
            <span key={h} style={{
              fontFamily: HD.fontMono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: HD.tertiary,
              textTransform: "uppercase",
            }}>
              {h}
            </span>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40 }}>
            <LoaderIcon size={16} color={HD.slate} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.tertiary }}>LOADING POSITIONS...</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40 }}>
            <AlertCircleIcon size={16} color={HD.crimson} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.crimson }}>{error}</span>
            <button
              onClick={load}
              style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.cyan, background: "none", border: `1px solid ${HD.cyan}`, padding: "3px 8px", cursor: "pointer" }}
            >
              RETRY
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && positions.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 60 }}>
            <AlertCircleIcon size={32} color={HD.slate} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, letterSpacing: "0.06em" }}>
              NO ELIGIBLE POSITIONS
            </span>
            <span style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.secondary, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
              No positions with POLICY_ASSIGNED or READY_TO_EXECUTE status found.
              Go to the Position Desk to import positions and assign policies.
            </span>
          </div>
        )}

        {/* Rows */}
        {!loading && !error && positions.map((p, idx) => {
          const isSelected = selected.has(p.id);
          const st = STATUS_LABEL[p.execution_status] ?? { color: HD.slate, label: p.execution_status };
          return (
            <div
              key={p.id}
              onClick={() => toggle(p.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr 80px 120px 100px 100px",
                gap: 0,
                padding: "8px 12px",
                borderBottom: `1px solid ${HD.soft}`,
                background: isSelected ? `color-mix(in srgb,${HD.royal} 6%,${HD.bgPanel})` : idx % 2 === 0 ? HD.bgPanel : HD.bgSub,
                cursor: "pointer",
                transition: "background 0.1s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                {isSelected
                  ? <CheckSquareIcon size={16} color={HD.royal} />
                  : <SquareIcon size={16} color={HD.slate} />
                }
              </div>
              <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center" }}>
                {p.entity}
              </span>
              <span style={{
                fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700,
                color: st.color, display: "flex", alignItems: "center",
                letterSpacing: "0.06em",
              }}>
                {st.label}
              </span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center" }}>
                {p.currency}
              </span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center" }}>
                {fmt(p.amount ?? 0)}
              </span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.secondary, display: "flex", alignItems: "center" }}>
                {p.value_date}
              </span>
            </div>
          );
        })}
      </div>

      {/* Selection summary + proceed */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 16px",
        background: HD.bgSub,
        border: `1px solid ${HD.soft}`,
        borderRadius: 4,
        flexShrink: 0,
      }}>
        {/* Summary */}
        <div style={{ flex: 1, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>SELECTED</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 16, fontWeight: 700, color: selected.size > 0 ? HD.royal : HD.slate }}>
              {selected.size}
              <span style={{ fontSize: 11, color: HD.tertiary }}> / {positions.length}</span>
            </span>
          </div>
          {Object.entries(currencySummary).map(([ccy, total]) => (
            <div key={ccy} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>{ccy} NOTIONAL</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 14, fontWeight: 600, color: HD.primary }}>
                {fmt(total)}
              </span>
            </div>
          ))}
        </div>

        {/* Proceed button */}
        <button
          onClick={handleProceed}
          disabled={selected.size === 0}
          style={{
            fontFamily: HD.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: selected.size > 0 ? "#ffffff" : HD.slate,
            background: selected.size > 0 ? HD.royal : `color-mix(in srgb,${HD.slate} 20%,transparent)`,
            border: `1px solid ${selected.size > 0 ? HD.royal : HD.soft}`,
            padding: "10px 24px",
            cursor: selected.size > 0 ? "pointer" : "not-allowed",
            borderRadius: 3,
            transition: "all 0.15s",
          }}
        >
          PROCEED WITH {selected.size} POSITION{selected.size !== 1 ? "S" : ""} →
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
