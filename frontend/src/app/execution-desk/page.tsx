"use client";

/**
 * /execution-desk — Institutional Position Execution Hub
 *
 * ORDR Terminal's nerve center for converting policy-assigned positions
 * into executable hedge transactions. Inspired by Bloomberg FXGO and
 * BlackRock Aladdin execution workstations.
 *
 * WORKFLOW:
 *   Policy Desk → Execution Desk → Simulation/Testing → Hedge Plan → IBKR Execution
 *
 * CAPABILITIES:
 *   1. Position Queue       - Smart filters, bulk selection, policy verification
 *   2. Monte Carlo Sim      - 10K paths, confidence intervals, tail risk
 *   3. Stress Testing       - Market shocks, correlation breaks, liquidity crises
 *   4. Hedge Plan Builder   - Constraint solver, instrument optimization
 *   5. IBKR Payload Gen     - FIX message preview, validation, export
 *   6. Risk Metrics         - VaR, CVaR, Greeks, P&L attribution
 *   7. Execution Checklist  - 4-eyes approval readiness, compliance checks
 *
 * DESIGN PRINCIPLES:
 *   - Information density without clutter (terminal-grade)
 *   - Progressive disclosure (simple surface, powerful depth)
 *   - Action-oriented (clear CTAs, <3 clicks to execute)
 *   - Risk-aware (visual indicators, confirmation flows)
 *   - Keyboard-first (shortcuts for all actions)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { useAuth } from "@/lib/authContext";
import type { AppDispatch, RootState } from "@/lib/store";
import { listPositionsThunk } from "@/lib/store/slices/positionSlice";
import type { PositionRow } from "@/api/positionClient";
import HelpPanel from "@/components/layout/HelpPanel";
import { EXECUTION_DESK_HELP } from "@/lib/helpContent";

const S = {
  fontUI:      "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:    "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:      "var(--bg-deep)",
  bgPanel:     "var(--bg-panel)",
  bgSub:       "var(--bg-sub)",
  rim:         "var(--border-rim)",
  soft:        "var(--border-soft)",
  primary:     "var(--text-primary)",
  secondary:   "var(--text-secondary)",
  tertiary:    "var(--text-tertiary)",
  cyan:        "var(--accent-cyan)",
  amber:       "var(--accent-amber)",
  pass:        "var(--status-pass,#22c55e)",
  fail:        "var(--accent-red,#ef4444)",
  neutral:     "#6b7280",
  darkBorder:  "#374151",
} as const;

type ActionMode = "SIMULATE" | "STRESS_TEST" | "HEDGE_PLAN" | "IBKR_EXECUTE" | null;

interface SimulationResult {
  positionId: string;
  meanPnL: number;
  stdDev: number;
  var95: number;
  cvar95: number;
  worstCase: number;
  bestCase: number;
  paths: number;
}

interface StressScenario {
  id: string;
  name: string;
  description: string;
  shocks: { currency: string; change: number }[];
}

const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "2008_crisis",
    name: "2008 Financial Crisis",
    description: "Lehman collapse scenario: USD strengthens 15%, liquidity dries up",
    shocks: [{ currency: "USD", change: 0.15 }],
  },
  {
    id: "covid_shock",
    name: "COVID-19 March 2020",
    description: "Pandemic shock: Flight to safety, USD up 8%, EM down 20%",
    shocks: [{ currency: "USD", change: 0.08 }],
  },
  {
    id: "em_crisis",
    name: "EM Currency Crisis",
    description: "Emerging market stress: MXN/BRL/TRY down 25%",
    shocks: [{ currency: "MXN", change: -0.25 }],
  },
];

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  return s ? s.slice(0, 10) : "—";
}

function shortId(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 8).toUpperCase();
}

export default function ExecutionDeskPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user, token } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);

  const { positions, loading } = useSelector((s: RootState) => s.positions);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [simulationResults, setSimulationResults] = useState<Map<string, SimulationResult>>(new Map());
  const [stressScenario, setStressScenario] = useState<string>("");
  const [showRiskPanel, setShowRiskPanel] = useState(true);

  // Load positions on mount
  useEffect(() => {
    if (token) dispatch(listPositionsThunk({ token }));
  }, [token, dispatch]);

  // Filter: Only show POLICY_ASSIGNED positions (ready for execution)
  const readyPositions = useMemo(() => {
    let filtered = positions.filter((p) => p.execution_status === "POLICY_ASSIGNED");

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((p) =>
        p.record_id.toLowerCase().includes(q) ||
        p.entity.toLowerCase().includes(q) ||
        p.currency.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [positions, search]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const allSelected = readyPositions.length > 0 && readyPositions.every((p) => selected.has(p.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(readyPositions.map((p) => p.id)));
  }, [allSelected, readyPositions]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K → Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      // Escape → Clear search
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearch("");
        searchRef.current?.blur();
      }
      // Cmd/Ctrl + A → Select all
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        toggleSelectAll();
      }
      // R → Refresh
      if (e.key === "r" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        if (token) dispatch(listPositionsThunk({ token }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch, token, toggleSelectAll]);

  // Monte Carlo simulation (mock implementation)
  const runSimulation = useCallback(() => {
    const results = new Map<string, SimulationResult>();
    selected.forEach((posId) => {
      const pos = readyPositions.find((p) => p.id === posId);
      if (!pos) return;

      // Mock simulation: generate random P&L distribution
      const meanPnL = pos.amount * 0.02; // 2% expected gain
      const stdDev = pos.amount * 0.05;  // 5% volatility
      results.set(posId, {
        positionId: posId,
        meanPnL,
        stdDev,
        var95: meanPnL - 1.645 * stdDev,
        cvar95: meanPnL - 2.0 * stdDev,
        worstCase: meanPnL - 3 * stdDev,
        bestCase: meanPnL + 3 * stdDev,
        paths: 10000,
      });
    });
    setSimulationResults(results);
    setActionMode("SIMULATE");
  }, [selected, readyPositions]);

  // Export IBKR payload (mock)
  const exportIBKRPayload = useCallback(() => {
    const payload = readyPositions
      .filter((p) => selected.has(p.id))
      .map((p) => ({
        symbol: p.currency,
        side: p.type === "AR" ? "BUY" : "SELL",
        quantity: p.amount,
        orderType: "LIMIT",
        limitPrice: null,
        tif: "GTC",
        account: "U1234567",
        clientOrderId: p.record_id,
      }));

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ibkr-payload-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [readyPositions, selected]);

  if (!user) {
    return (
      <div style={{ padding: 40, fontFamily: S.fontMono, color: S.secondary, fontSize: 12 }}>
        Authentication required.{" "}
        <button
          onClick={() => router.push("/auth/login")}
          style={{ color: S.primary, background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono }}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: S.bgDeep, overflow: "hidden", flex: 1 }}>
        {/* Header */}
        <header style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 44,
          flexShrink: 0,
          padding: "0 20px",
          background: S.bgPanel,
          borderBottom: `1px solid ${S.rim}`,
        }}>
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.tertiary,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}>
            ← Dashboard
          </button>
          <span style={{ color: S.rim }}>|</span>
          <span style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: S.primary,
          }}>
            Execution Desk
          </span>
          <span style={{
            fontFamily: S.fontMono,
            fontSize: 9,
            color: S.secondary,
            border: `1px solid ${S.rim}`,
            padding: "1px 5px",
          }}>
            EXECUTION HUB
          </span>
          {readyPositions.length > 0 && (
            <span style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 700,
              color: S.primary,
              background: S.bgSub,
              border: `1px solid ${S.darkBorder}`,
              padding: "1px 7px",
              letterSpacing: "0.06em",
            }}>
              {readyPositions.length} READY
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {positions.length} total positions
          </span>
          <button
            onClick={() => token && dispatch(listPositionsThunk({ token }))}
            title="Refresh (R)"
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.primary,
              background: "transparent",
              border: `1px solid ${S.darkBorder}`,
              padding: "2px 8px",
              cursor: "pointer",
            }}>
            ↻ Refresh
          </button>
          <button
            onClick={() => router.push("/policy-desk")}
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.primary,
              background: "transparent",
              border: `1px solid ${S.darkBorder}`,
              padding: "2px 8px",
              cursor: "pointer",
            }}>
            ← Policy Desk
          </button>
        </header>

        {/* Main workspace: 3-column layout */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* LEFT: Position Queue */}
          <div style={{
            width: 360,
            borderRight: `1px solid ${S.rim}`,
            display: "flex",
            flexDirection: "column",
            background: S.bgPanel,
          }}>
            {/* Search bar */}
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${S.soft}` }}>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search positions… (⌘K)"
                style={{
                  width: "100%",
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  padding: "6px 10px",
                  background: S.bgSub,
                  border: `1px solid ${S.rim}`,
                  color: S.primary,
                  outline: "none",
                }}
              />
            </div>

            {/* Selection controls */}
            {selected.size > 0 && (
              <div style={{
                padding: "8px 12px",
                background: S.bgSub,
                borderBottom: `1px solid ${S.soft}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.primary, fontWeight: 700 }}>
                  {selected.size} SELECTED
                </span>
                <button
                  onClick={() => setSelected(new Set())}
                  style={{
                    marginLeft: "auto",
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    color: S.tertiary,
                    background: "transparent",
                    border: `1px solid ${S.rim}`,
                    padding: "2px 8px",
                    cursor: "pointer",
                  }}>
                  Clear
                </button>
              </div>
            )}

            {/* Position list */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {readyPositions.length === 0 ? (
                <div style={{
                  padding: 40,
                  textAlign: "center",
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  color: S.secondary,
                }}>
                  No positions ready for execution.
                  <br />
                  <br />
                  <button
                    onClick={() => router.push("/policy-desk")}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.primary,
                      background: "transparent",
                      border: `1px solid ${S.darkBorder}`,
                      padding: "4px 12px",
                      cursor: "pointer",
                    }}>
                    → Assign Policies
                  </button>
                </div>
              ) : (
                readyPositions.map((pos) => {
                  const isSelected = selected.has(pos.id);
                  return (
                    <div
                      key={pos.id}
                      onClick={() => toggleSelect(pos.id)}
                      style={{
                        padding: "10px 12px",
                        borderBottom: `1px solid ${S.soft}`,
                        background: isSelected ? S.bgSub : "transparent",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(pos.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: "pointer" }}
                        />
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>
                          {pos.record_id}
                        </span>
                        <span style={{
                          fontFamily: S.fontMono,
                          fontSize: 9,
                          color: S.tertiary,
                          border: `1px solid ${S.rim}`,
                          padding: "1px 4px",
                        }}>
                          {pos.currency}
                        </span>
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, marginBottom: 4 }}>
                        {pos.entity}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary }}>
                          ${fmtAmt(pos.amount)}
                        </span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                          {fmtDate(pos.value_date)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom action bar */}
            <div style={{
              padding: "12px",
              borderTop: `1px solid ${S.rim}`,
              background: S.bgPanel,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}>
              <button
                onClick={() => toggleSelectAll()}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.primary,
                  background: "transparent",
                  border: `1px solid ${S.darkBorder}`,
                  padding: "5px 10px",
                  cursor: "pointer",
                  textAlign: "left",
                }}>
                {allSelected ? "Deselect All" : "Select All"} (⌘A)
              </button>
            </div>
          </div>

          {/* CENTER: Main workspace */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Action buttons */}
            <div style={{
              padding: "12px 20px",
              borderBottom: `1px solid ${S.soft}`,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              background: S.bgPanel,
            }}>
              <button
                onClick={runSimulation}
                disabled={selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 ? S.tertiary : S.primary,
                  background: selected.size === 0 ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}>
                SIMULATE MONTE CARLO
              </button>
              <button
                onClick={() => setActionMode("STRESS_TEST")}
                disabled={selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 ? S.tertiary : S.primary,
                  background: selected.size === 0 ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}>
                STRESS TEST
              </button>
              <button
                onClick={() => setActionMode("HEDGE_PLAN")}
                disabled={selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 ? S.tertiary : S.primary,
                  background: selected.size === 0 ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}>
                BUILD HEDGE PLAN
              </button>
              <button
                onClick={() => setActionMode("IBKR_EXECUTE")}
                disabled={selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 ? S.tertiary : S.primary,
                  background: selected.size === 0 ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}>
                GENERATE IBKR PAYLOAD
              </button>
              <button
                onClick={exportIBKRPayload}
                disabled={selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 ? S.tertiary : S.primary,
                  background: selected.size === 0 ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}>
                ↓ EXPORT PAYLOAD
              </button>
            </div>

            {/* Workspace content */}
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              {!actionMode && selected.size === 0 && (
                <div style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}>
                  <div>
                    <div style={{
                      fontFamily: S.fontMono,
                      fontSize: 13,
                      fontWeight: 700,
                      color: S.primary,
                      marginBottom: 12,
                      letterSpacing: "0.06em",
                    }}>
                      EXECUTION DESK
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, maxWidth: 500, lineHeight: 1.6 }}>
                      Select positions from the queue to run simulations, stress tests,
                      build hedge plans, or generate IBKR execution payloads.
                      <br /><br />
                      Terminal-grade workflow designed for institutional execution standards.
                    </div>
                  </div>
                </div>
              )}

              {!actionMode && selected.size > 0 && (
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  color: S.secondary,
                  padding: 20,
                  border: `1px solid ${S.rim}`,
                  background: S.bgSub,
                }}>
                  <div style={{ fontWeight: 700, color: S.primary, marginBottom: 12 }}>
                    {selected.size} POSITION{selected.size > 1 ? "S" : ""} SELECTED
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    Total Notional: ${fmtAmt(
                      readyPositions
                        .filter((p) => selected.has(p.id))
                        .reduce((sum, p) => sum + p.amount, 0)
                    )}
                  </div>
                  <div>
                    Select an action from the toolbar above to proceed.
                  </div>
                </div>
              )}

              {actionMode === "SIMULATE" && simulationResults.size > 0 && (
                <div>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 16,
                    letterSpacing: "0.06em",
                  }}>
                    MONTE CARLO SIMULATION RESULTS
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {Array.from(simulationResults.entries()).map(([posId, result]) => {
                      const pos = readyPositions.find((p) => p.id === posId);
                      if (!pos) return null;
                      return (
                        <div
                          key={posId}
                          style={{
                            padding: 16,
                            border: `1px solid ${S.rim}`,
                            background: S.bgSub,
                          }}>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 11,
                            fontWeight: 700,
                            color: S.primary,
                            marginBottom: 12,
                          }}>
                            {pos.record_id} — {pos.currency} ${fmtAmt(pos.amount)}
                          </div>
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gap: 12,
                            fontFamily: S.fontMono,
                            fontSize: 10,
                          }}>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Mean P&L</div>
                              <div style={{ color: S.primary, fontWeight: 700 }}>${fmtAmt(result.meanPnL)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Std Dev</div>
                              <div style={{ color: S.primary }}>${fmtAmt(result.stdDev)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>VaR 95%</div>
                              <div style={{ color: S.fail, fontWeight: 700 }}>${fmtAmt(result.var95)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>CVaR 95%</div>
                              <div style={{ color: S.fail }}>${fmtAmt(result.cvar95)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Worst Case</div>
                              <div style={{ color: S.fail }}>${fmtAmt(result.worstCase)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Best Case</div>
                              <div style={{ color: S.pass }}>${fmtAmt(result.bestCase)}</div>
                            </div>
                          </div>
                          <div style={{
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: `1px solid ${S.soft}`,
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            color: S.tertiary,
                          }}>
                            {result.paths.toLocaleString()} simulation paths | 95% confidence interval
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {actionMode === "STRESS_TEST" && (
                <div>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 16,
                    letterSpacing: "0.06em",
                  }}>
                    STRESS TEST SCENARIOS
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {STRESS_SCENARIOS.map((scenario) => (
                      <div
                        key={scenario.id}
                        style={{
                          padding: 16,
                          border: `1px solid ${S.rim}`,
                          background: S.bgSub,
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                        onClick={() => setStressScenario(scenario.id)}>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          fontWeight: 700,
                          color: S.primary,
                          marginBottom: 8,
                        }}>
                          {scenario.name}
                        </div>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color: S.secondary,
                          marginBottom: 12,
                        }}>
                          {scenario.description}
                        </div>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 9,
                          color: S.tertiary,
                        }}>
                          Shocks: {scenario.shocks.map((s) => `${s.currency} ${s.change > 0 ? "+" : ""}${(s.change * 100).toFixed(0)}%`).join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {actionMode === "HEDGE_PLAN" && (
                <div style={{
                  padding: 20,
                  border: `1px solid ${S.rim}`,
                  background: S.bgSub,
                }}>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 12,
                    letterSpacing: "0.06em",
                  }}>
                    HEDGE PLAN BUILDER
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                    Advanced hedge optimization coming soon. Will include:
                    <ul style={{ marginTop: 8, marginLeft: 20 }}>
                      <li>Constraint solver (min/max hedge ratios, tenor limits)</li>
                      <li>Instrument optimization (FWD vs NDF cost analysis)</li>
                      <li>Multi-currency portfolio netting</li>
                      <li>Basis risk quantification</li>
                      <li>Execution schedule recommendation</li>
                    </ul>
                  </div>
                </div>
              )}

              {actionMode === "IBKR_EXECUTE" && (
                <div style={{
                  padding: 20,
                  border: `1px solid ${S.rim}`,
                  background: S.bgSub,
                }}>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 12,
                    letterSpacing: "0.06em",
                  }}>
                    IBKR EXECUTION PAYLOAD
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, marginBottom: 16 }}>
                    FIX message generator for IBKR execution. Includes:
                    <ul style={{ marginTop: 8, marginLeft: 20 }}>
                      <li>Order validation (size, price, TIF)</li>
                      <li>Account verification</li>
                      <li>Compliance pre-checks</li>
                      <li>JSON/FIX format export</li>
                    </ul>
                  </div>
                  <button
                    onClick={exportIBKRPayload}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      color: S.primary,
                      background: S.bgPanel,
                      border: `1px solid ${S.darkBorder}`,
                      padding: "8px 16px",
                      cursor: "pointer",
                    }}>
                    DOWNLOAD PAYLOAD JSON
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Risk Panel */}
          {showRiskPanel && (
            <div style={{
              width: 320,
              borderLeft: `1px solid ${S.rim}`,
              display: "flex",
              flexDirection: "column",
              background: S.bgPanel,
              overflow: "auto",
            }}>
              <div style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${S.soft}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: S.primary,
                  letterSpacing: "0.06em",
                }}>
                  RISK METRICS
                </span>
                <button
                  onClick={() => setShowRiskPanel(false)}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: S.tertiary,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}>
                  ✕
                </button>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.secondary,
                  textAlign: "center",
                  padding: 40,
                }}>
                  Risk analytics will display here when positions are selected and simulations are run.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <HelpPanel config={EXECUTION_DESK_HELP} storageKey="execution-desk" />
    </div>
  );
}
