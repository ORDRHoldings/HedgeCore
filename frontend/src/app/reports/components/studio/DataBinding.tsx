"use client";

import { useState, useEffect, useCallback } from "react";
import { T } from "@/lib/design/tokens";
import { listRuns } from "@/api/runsClient";
import type { RunSummary } from "@/api/runsClient";
import { Database, Link } from "lucide-react";

// ── Public interface ──────────────────────────────────────────────────────────

export interface DataBindingState {
  runId: string | null;
  policyId: string | null;
  runLabel: string;
  policyLabel: string;
}

interface Props {
  token: string;
  binding: DataBindingState;
  onBindingChange: (next: DataBindingState) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DataBinding({ token, binding, onBindingChange }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch runs on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await listRuns(token, 30);
        if (!cancelled) setRuns(res.items ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load runs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (token) load();
    return () => { cancelled = true; };
  }, [token]);

  const handleSelectRun = useCallback(
    (run: RunSummary) => {
      const shortId = run.run_id.slice(0, 8);
      const dateStr = run.created_at
        ? new Date(run.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      onBindingChange({
        runId: run.run_id,
        policyId: null,
        runLabel: `${shortId}... ${dateStr}`,
        policyLabel: "",
      });
      setDropdownOpen(false);
    },
    [onBindingChange],
  );

  const handleClear = useCallback(() => {
    onBindingChange({
      runId: null,
      policyId: null,
      runLabel: "",
      policyLabel: "",
    });
  }, [onBindingChange]);

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Database size={14} style={{ color: T.tertiary }} />
        <span
          style={{
            fontFamily: T.fontMono,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: T.tertiary,
            textTransform: "uppercase",
          }}
        >
          DATA BINDING
        </span>
      </div>

      {/* Run selector */}
      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontFamily: T.fontUI,
            fontSize: 12,
            color: T.secondary,
            display: "block",
            marginBottom: 6,
          }}
        >
          Calculation Run
        </label>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: T.bgDeep,
              border: `1px solid ${T.rim}`,
              borderRadius: 4,
              fontFamily: T.fontMono,
              fontSize: 12,
              color: binding.runId ? T.primary : T.tertiary,
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {loading
                ? "Loading runs..."
                : binding.runId
                  ? binding.runLabel
                  : "Select a run..."}
            </span>
            <span style={{ color: T.tertiary, fontSize: 10, flexShrink: 0, marginLeft: 4 }}>
              {dropdownOpen ? "\u25B2" : "\u25BC"}
            </span>
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 50,
                background: T.bgPanel,
                border: `1px solid ${T.rim}`,
                borderRadius: 4,
                marginTop: 2,
                maxHeight: 200,
                overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              {error && (
                <div
                  style={{
                    padding: "8px 12px",
                    fontFamily: T.fontUI,
                    fontSize: 12,
                    color: T.fail,
                  }}
                >
                  {error}
                </div>
              )}
              {runs.length === 0 && !error && (
                <div
                  style={{
                    padding: "8px 12px",
                    fontFamily: T.fontUI,
                    fontSize: 12,
                    color: T.tertiary,
                  }}
                >
                  No runs available
                </div>
              )}
              {runs.map((run) => {
                const shortId = run.run_id.slice(0, 8);
                const dateStr = run.created_at
                  ? new Date(run.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "";
                const isSelected = binding.runId === run.run_id;
                return (
                  <button
                    key={run.run_id}
                    onClick={() => handleSelectRun(run)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      background: isSelected ? T.bgSub : "transparent",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: T.fontMono,
                      fontSize: 12,
                      color: isSelected ? T.accent : T.primary,
                      borderLeft: isSelected
                        ? `2px solid ${T.accent}`
                        : "2px solid transparent",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{shortId}...</span>
                    <span
                      style={{
                        color: T.tertiary,
                        marginLeft: 8,
                        fontSize: 12,
                      }}
                    >
                      {dateStr}
                    </span>
                    <span
                      style={{
                        color: T.tertiary,
                        marginLeft: 8,
                        fontSize: 12,
                      }}
                    >
                      {run.trade_count}T / {run.hedge_count}H
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Clear button */}
        {binding.runId && (
          <button
            onClick={handleClear}
            style={{
              marginTop: 6,
              background: "transparent",
              border: "none",
              fontFamily: T.fontMono,
              fontSize: 12,
              color: T.tertiary,
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Clear binding
          </button>
        )}
      </div>

      {/* Status badges */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <StatusBadge
          label={binding.runId ? "RUN BOUND" : "NO RUN"}
          bound={!!binding.runId}
        />
        <StatusBadge
          label={binding.policyId ? "POLICY BOUND" : "NO POLICY"}
          bound={!!binding.policyId}
        />
      </div>
    </div>
  );
}

// ── Badge sub-component ───────────────────────────────────────────────────────

function StatusBadge({ label, bound }: { label: string; bound: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 3,
        fontFamily: T.fontMono,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.06em",
        color: bound ? T.pass : T.warn,
        background: T.bgDeep,
        border: `1px solid ${bound ? T.pass : T.warn}`,
      }}
    >
      <Link size={10} />
      {label}
    </span>
  );
}
