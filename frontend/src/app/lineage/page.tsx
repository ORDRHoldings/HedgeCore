"use client";

/**
 * /lineage — Sprint 1.4: Position Lineage Graph
 *
 * Visual audit chain for a single position showing the full provenance tree:
 *   Position → Policy → PolicyRevision → CalculationRun → ExecutionProposal(s)
 *
 * URL: /lineage?position={position_id}
 * Linked from: Position Desk (new LINEAGE action on each row)
 *
 * Design: horizontal node chain with connecting lines + expandable detail cards.
 * Each node is color-coded by type and shows status badge + key fields.
 * Nodes with links to other ORDR pages have → drill-through buttons.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../lib/authContext";
import { fetchPositionLineage } from "../../api/positionClient";
import type { LineageNode, LineageEdge, LineageResponse } from "../../api/positionClient";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import HelpPanel from "@/components/layout/HelpPanel";
import { LINEAGE_HELP } from "@/lib/helpContent";

// ── Design tokens ──────────────────────────────────────────────────────────────
const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass,#22c55e)",
  fail:      "var(--accent-red,#ef4444)",
  purple:    "#a78bfa",
  indigo:    "#818cf8",
} as const;

// ── Node type config ───────────────────────────────────────────────────────────
interface NodeTypeMeta {
  color:       string;
  bgColor:     string;
  icon:        string;
  label:       string;
  order:       number;
}

const NODE_TYPE_META: Record<string, NodeTypeMeta> = {
  POSITION:           { color: S.cyan,   bgColor: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,   icon: "P", label: "Position",          order: 0 },
  POLICY:             { color: S.amber,  bgColor: `color-mix(in srgb, ${S.amber} 10%, transparent)`,  icon: "Pol", label: "Policy",          order: 1 },
  POLICY_REVISION:    { color: S.indigo, bgColor: `color-mix(in srgb, ${S.indigo} 10%, transparent)`, icon: "Rev", label: "Policy Revision", order: 2 },
  CALCULATION_RUN:    { color: S.purple, bgColor: `color-mix(in srgb, ${S.purple} 10%, transparent)`, icon: "Run", label: "Calc Run",         order: 3 },
  EXECUTION_PROPOSAL: { color: S.pass,   bgColor: `color-mix(in srgb, ${S.pass} 10%, transparent)`,   icon: "Ep", label: "Proposal",          order: 4 },
};

function getNodeMeta(type: string): NodeTypeMeta {
  return NODE_TYPE_META[type] ?? { color: S.tertiary, bgColor: "transparent", icon: "?", label: type, order: 99 };
}

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  NEW:               S.tertiary,
  POLICY_ASSIGNED:   S.cyan,
  READY_TO_EXECUTE:  S.amber,
  HEDGED:            S.pass,
  REJECTED:          S.fail,
  ACTIVE:            S.pass,
  INACTIVE:          S.tertiary,
  WORM:              S.indigo,
  COMPLETE:          S.pass,
  PROPOSED:          S.amber,
  APPROVED:          S.cyan,
  EXECUTED:          S.pass,
  WITHDRAWN:         S.tertiary,
};

function statusColor(s: string): string {
  return STATUS_COLORS[s] ?? S.secondary;
}

// ── Badge ──────────────────────────────────────────────────────────────────────
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontFamily:    S.fontMono,
      fontSize:      9,
      fontWeight:    700,
      letterSpacing: "0.07em",
      color,
      background:    `color-mix(in srgb, ${color} 12%, transparent)`,
      border:        `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding:       "1px 5px",
      borderRadius:  2,
      flexShrink:    0,
    }}>
      {text}
    </span>
  );
}

// ── FieldRow ───────────────────────────────────────────────────────────────────
function FieldRow({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "3px 0", borderBottom: `1px solid ${S.soft}` }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.06em", color: S.tertiary, flexShrink: 0 }}>
        {label.toUpperCase()}
      </span>
      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.primary, textAlign: "right", wordBreak: "break-all" as const, lineHeight: 1.4 }}>
        {String(value)}
      </span>
    </div>
  );
}

// ── Node Card ──────────────────────────────────────────────────────────────────
function NodeCard({
  node,
  isSelected,
  onClick,
}: {
  node: LineageNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  const meta = getNodeMeta(node.type);
  const sc   = statusColor(node.status);

  return (
    <div
      onClick={onClick}
      style={{
        background:   isSelected ? meta.bgColor : S.bgPanel,
        border:       `1px solid ${isSelected ? meta.color : S.rim}`,
        borderTop:    `2px solid ${meta.color}`,
        borderRadius: 2,
        padding:      "12px 14px",
        cursor:       "pointer",
        width:        200,
        flexShrink:   0,
        transition:   "border-color 0.12s, background 0.12s",
        position:     "relative",
      }}
    >
      {/* Type label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <div style={{
          width:          24,
          height:         24,
          borderRadius:   2,
          background:     meta.bgColor,
          border:         `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontFamily:     S.fontMono,
          fontSize:       9,
          fontWeight:     700,
          color:          meta.color,
          letterSpacing:  "0.04em",
          flexShrink:     0,
        }}>
          {meta.icon}
        </div>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.06em", color: meta.color, fontWeight: 700 }}>
          {meta.label.toUpperCase()}
        </span>
      </div>

      {/* Label */}
      <div style={{
        fontFamily:    S.fontMono,
        fontSize:      11,
        fontWeight:    700,
        color:         S.primary,
        marginBottom:  4,
        overflow:      "hidden",
        textOverflow:  "ellipsis",
        whiteSpace:    "nowrap",
        letterSpacing: "0.03em",
      }}>
        {node.label}
      </div>

      {/* Status badge */}
      <Badge text={node.status} color={sc} />

      {/* Selected indicator */}
      {isSelected && (
        <div style={{
          position:   "absolute",
          bottom:     6,
          right:      8,
          fontFamily: S.fontMono,
          fontSize:   8,
          color:      meta.color,
          fontWeight: 700,
          letterSpacing: "0.06em",
        }}>
          SELECTED
        </div>
      )}
    </div>
  );
}

// ── Edge connector ─────────────────────────────────────────────────────────────
function EdgeConnector({ label }: { label: string }) {
  return (
    <div style={{
      display:    "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap:        4,
      paddingTop: 20,
      flexShrink: 0,
    }}>
      <div style={{ width: 40, height: 1, background: S.rim }} />
      <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.05em", whiteSpace: "nowrap" as const }}>
        {label}
      </span>
      <div style={{ width: 40, height: 1, background: S.rim }} />
    </div>
  );
}

// ── Detail Panel ───────────────────────────────────────────────────────────────
function DetailPanel({ node }: { node: LineageNode }) {
  const meta = getNodeMeta(node.type);
  const sc   = statusColor(node.status);

  // Field display ordering for each type
  const FIELD_ORDER: Record<string, string[]> = {
    POSITION: ["record_id", "entity", "flow_type", "currency", "amount", "value_date", "status", "execution_status", "hedge_amount", "hedge_rate", "execution_ref", "executed_at", "rejection_reason", "created_at"],
    POLICY: ["id", "is_active", "created_at"],
    POLICY_REVISION: ["id", "revision", "policy_hash", "change_reason", "created_by_email", "created_at"],
    CALCULATION_RUN: ["run_id", "trade_count", "hedge_count", "run_hash", "inputs_hash", "outputs_hash", "policy_hash", "policy_revision_id", "created_at"],
    EXECUTION_PROPOSAL: ["id", "status", "proposed_by_email", "proposed_at", "approved_by_email", "approved_at", "approval_notes", "execution_ref", "executed_at", "rejection_reason", "run_id", "hedge_amount", "hedge_rate", "proposal_hash", "approval_hash", "created_at"],
  };

  const orderedFields = FIELD_ORDER[node.type] ?? Object.keys(node.fields);

  return (
    <div style={{
      background:   S.bgPanel,
      border:       `1px solid ${S.rim}`,
      borderTop:    `2px solid ${meta.color}`,
      borderRadius: 2,
      overflow:     "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding:      "10px 14px",
        borderBottom: `1px solid ${S.rim}`,
        background:   S.bgSub,
        display:      "flex",
        alignItems:   "center",
        gap:          8,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: meta.color }}>
          {meta.label.toUpperCase()}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>
          {node.label}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Badge text={node.status} color={sc} />
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: "10px 14px" }}>
        {orderedFields.map(key => (
          <FieldRow key={key} label={key} value={node.fields[key]} />
        ))}
      </div>

      {/* Drill-through links */}
      {Object.entries(node.links).length > 0 && (
        <div style={{
          padding:      "8px 14px",
          borderTop:    `1px solid ${S.soft}`,
          background:   S.bgSub,
          display:      "flex",
          gap:          8,
          flexWrap:     "wrap" as const,
        }}>
          {Object.entries(node.links).map(([key, href]) => (
            <Link
              key={key}
              href={href}
              style={{
                fontFamily:    S.fontMono,
                fontSize:      9,
                fontWeight:    700,
                letterSpacing: "0.06em",
                color:         meta.color,
                background:    `color-mix(in srgb, ${meta.color} 8%, transparent)`,
                border:        `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`,
                padding:       "2px 8px",
                borderRadius:  2,
                textDecoration:"none",
              }}
            >
              {key.replace(/_/g, " ").toUpperCase()} →
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main content ───────────────────────────────────────────────────────────────
function LineageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, token, isLoading: authLoading } = useAuth();

  const positionId = params.get("position") ?? "";

  const [lineage,     setLineage]    = useState<LineageResponse | null>(null);
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [selectedId,  setSelectedId] = useState<string | null>(null);
  const [renderTs,    setRenderTs]   = useState("");
  const [positions,   setPositions]  = useState<{ id: string; record_id: string; currency: string; execution_status: string }[]>([]);
  const [posLoading,  setPosLoading] = useState(false);

  // Hydration-safe timestamp
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch positions list when no position ID is provided
  useEffect(() => {
    if (positionId || authLoading || !isAuthenticated || !token) return;
    setPosLoading(true);
    dashboardFetch("/v1/positions?limit=50", token)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setPositions(Array.isArray(data) ? data : (data.items ?? [])))
      .catch(() => {/* ignore */})
      .finally(() => setPosLoading(false));
  }, [positionId, isAuthenticated, authLoading, token]);

  // Fetch lineage
  useEffect(() => {
    if (!positionId || authLoading || !isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPositionLineage(positionId, token ?? undefined)
      .then(data => {
        if (!cancelled) {
          setLineage(data);
          // Auto-select the first node (Position)
          if (data.nodes.length > 0) setSelectedId(data.nodes[0].id);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [positionId, isAuthenticated, authLoading, token]);

  // Sort nodes for display in the chain (left-to-right by type order)
  const sortedNodes = lineage
    ? [...lineage.nodes].sort((a, b) => {
        const ao = getNodeMeta(a.type).order;
        const bo = getNodeMeta(b.type).order;
        return ao !== bo ? ao - bo : a.id.localeCompare(b.id);
      })
    : [];

  const selectedNode = selectedId ? sortedNodes.find(n => n.id === selectedId) ?? null : null;

  // Build edge label for the gap between consecutive sorted nodes
  function getEdgeBetween(fromNode: LineageNode, toNode: LineageNode): string | null {
    if (!lineage) return null;
    const edge = lineage.edges.find(
      e => (e.from === fromNode.id && e.to === toNode.id) ||
           (e.from === toNode.id && e.to === fromNode.id)
    );
    return edge?.label ?? null;
  }

  if (authLoading) {
    return (
      <div style={{ background: S.bgDeep, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>AUTHENTICATING…</span>
      </div>
    );
  }

  const posId8 = positionId.slice(0, 8).toUpperCase();

  return (
    <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI, color: S.primary, display: "flex", flexDirection: "column" }}>

      {/* ── Page header ── */}
      <div style={{
        height:        44,
        padding:       "0 24px",
        borderBottom:  `1px solid ${S.rim}`,
        background:    S.bgPanel,
        display:       "flex",
        alignItems:    "center",
        justifyContent:"space-between",
        flexShrink:    0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/position-desk"
            style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, textDecoration: "none", border: `1px solid ${S.rim}`, padding: "2px 8px", borderRadius: 2 }}
          >
            ← Position Desk
          </Link>
          <span style={{ color: S.soft }}>·</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
            LINEAGE
          </span>
          {positionId && (
            <>
              <span style={{ color: S.soft }}>·</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, letterSpacing: "0.06em" }}>
                {posId8}
              </span>
            </>
          )}
          {lineage && (
            <>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, border: `1px solid ${S.soft}`, padding: "1px 5px", borderRadius: 2 }}>
                {lineage.summary.node_count} NODES
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, border: `1px solid ${S.soft}`, padding: "1px 5px", borderRadius: 2 }}>
                {lineage.summary.edge_count} EDGES
              </span>
              <Badge text={lineage.summary.execution_status} color={statusColor(lineage.summary.execution_status)} />
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {renderTs}
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── No position ID: show positions list ── */}
          {!positionId && (
            <div style={{ maxWidth: 720, margin: "40px auto" }}>
              {/* Instruction banner */}
              <div style={{
                background: S.bgPanel, border: `1px solid ${S.rim}`,
                borderLeft: `3px solid ${S.amber}`, borderRadius: 2,
                padding: "14px 18px", marginBottom: 20,
              }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.amber, marginBottom: 6 }}>
                  SELECT A POSITION TO TRACE
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6 }}>
                  Click a position below to view its full provenance graph, or navigate here from the Position Desk by clicking the LINEAGE icon on any row.
                </div>
              </div>

              {/* Position list */}
              <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 16px", borderBottom: `1px solid ${S.rim}`,
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.08em", color: S.tertiary, textTransform: "uppercase" as const,
                }}>
                  Positions
                  <span style={{ color: S.soft }}>·</span>
                  <span style={{ color: S.secondary }}>{posLoading ? "LOADING…" : `${positions.length} RECORDS`}</span>
                </div>

                {posLoading && (
                  <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                    Loading positions…
                  </div>
                )}

                {!posLoading && positions.length === 0 && (
                  <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
                    No positions found. Add positions on the Position Desk first.
                  </div>
                )}

                {!posLoading && positions.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/lineage?position=${encodeURIComponent(p.id)}`}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr 70px 1fr",
                      alignItems: "center", gap: 12, padding: "9px 16px",
                      borderBottom: i < positions.length - 1 ? `1px solid ${S.soft}` : "none",
                      textDecoration: "none", background: "transparent", transition: "background 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, ${S.cyan} 5%, transparent)`)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, letterSpacing: "0.06em" }}>
                      {p.record_id}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.amber }}>
                      {p.currency}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                      {p.execution_status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Loading ── */}
          {positionId && loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.1em" }}>
                LOADING LINEAGE…
              </span>
            </div>
          )}

          {/* ── Error ── */}
          {positionId && !loading && error && (
            <div style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`, borderLeft: `3px solid ${S.fail}`,
              borderRadius: 2, padding: "16px 20px", maxWidth: 600,
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.fail, marginBottom: 6 }}>FAILED TO LOAD LINEAGE</div>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{error}</div>
            </div>
          )}

          {/* ── Lineage chain ── */}
          {positionId && !loading && !error && lineage && (
            <>
              {/* Compliance note */}
              <div style={{
                background:   `color-mix(in srgb, ${S.cyan} 3%, transparent)`,
                border:       `1px solid color-mix(in srgb, ${S.cyan} 15%, transparent)`,
                borderLeft:   `3px solid ${S.cyan}`,
                borderRadius: 2,
                padding:      "8px 16px",
                display:      "flex",
                alignItems:   "center",
                gap:          10,
                flexWrap:     "wrap" as const,
              }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.cyan }}>
                  AUDIT PROVENANCE CHAIN
                </span>
                <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                  Full position-to-execution lineage for{" "}
                  <span style={{ fontFamily: S.fontMono, color: S.primary }}>{posId8}</span>
                  {" "}— IFRS 9 / EMIR hedge documentation trail.
                  Click any node to expand its details.
                </span>
                {lineage.summary.proposal_count > 0 && (
                  <Badge text={`${lineage.summary.proposal_count} PROPOSAL${lineage.summary.proposal_count > 1 ? "S" : ""}`} color={S.pass} />
                )}
              </div>

              {/* Node chain (horizontal scroll) */}
              <div style={{
                background:   S.bgPanel,
                border:       `1px solid ${S.rim}`,
                borderRadius: 2,
                padding:      "20px 24px",
                overflowX:    "auto",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: "max-content" }}>
                  {sortedNodes.map((node, i) => {
                    const prevNode = i > 0 ? sortedNodes[i - 1] : null;
                    const edgeLabel = prevNode ? getEdgeBetween(prevNode, node) : null;
                    return (
                      <div key={node.id} style={{ display: "flex", alignItems: "center" }}>
                        {edgeLabel !== null && (
                          <EdgeConnector label={edgeLabel} />
                        )}
                        {prevNode && edgeLabel === null && (
                          <EdgeConnector label="↓" />
                        )}
                        <NodeCard
                          node={node}
                          isSelected={selectedId === node.id}
                          onClick={() => setSelectedId(selectedId === node.id ? null : node.id)}
                        />
                      </div>
                    );
                  })}
                </div>

                {sortedNodes.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 0", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                    NO LINEAGE DATA AVAILABLE
                  </div>
                )}
              </div>

              {/* Detail panel for selected node */}
              {selectedNode && (
                <div>
                  <div style={{
                    fontFamily:    S.fontMono,
                    fontSize:      9,
                    fontWeight:    700,
                    letterSpacing: "0.08em",
                    color:         S.tertiary,
                    marginBottom:  8,
                    paddingLeft:   2,
                  }}>
                    NODE DETAIL — {getNodeMeta(selectedNode.type).label.toUpperCase()}
                  </div>
                  <DetailPanel node={selectedNode} />
                </div>
              )}

              {/* Edge table */}
              {lineage.edges.length > 0 && (
                <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
                      LINEAGE EDGES — {lineage.edges.length} RELATIONS
                    </span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${S.soft}`, background: S.bgSub }}>
                        {["FROM", "RELATION", "TO"].map(h => (
                          <th key={h} style={{ padding: "6px 14px", textAlign: "left", fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.07em", color: S.tertiary, fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineage.edges.map((edge: LineageEdge, i: number) => {
                        const fromNode = lineage.nodes.find(n => n.id === edge.from);
                        const toNode   = lineage.nodes.find(n => n.id === edge.to);
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${S.soft}`, cursor: "pointer" }}
                            onClick={() => setSelectedId(edge.from)}
                          >
                            <td style={{ padding: "6px 14px", fontFamily: S.fontMono, fontSize: 10, color: fromNode ? getNodeMeta(fromNode.type).color : S.secondary }}>
                              {fromNode ? fromNode.label : edge.from.slice(0, 16)}
                            </td>
                            <td style={{ padding: "6px 14px" }}>
                              <Badge text={edge.label} color={S.tertiary} />
                            </td>
                            <td style={{ padding: "6px 14px", fontFamily: S.fontMono, fontSize: 10, color: toNode ? getNodeMeta(toNode.type).color : S.secondary }}>
                              {toNode ? toNode.label : edge.to.slice(0, 16)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{
        height:         32,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        background:     S.bgPanel,
        borderTop:      `1px solid ${S.rim}`,
        flexShrink:     0,
      }}>
        <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.06em" }}>
          {renderTs} &middot; ORDR LINEAGE VIEWER &middot; PROVENANCE
        </span>
      </footer>
    </div>
  );
}

export default function LineagePage() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

    <Suspense
      fallback={
        <div style={{
          padding: "60px 24px",
          textAlign: "center",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "0.625rem",
          color: "var(--text-tertiary)",
          letterSpacing: "0.08em",
        }}>
          LOADING LINEAGE VIEWER…
        </div>
      }
    >
      <LineageContent />
    </Suspense>
  
    <HelpPanel config={LINEAGE_HELP} storageKey="lineage" />
    </div>
  );
}
