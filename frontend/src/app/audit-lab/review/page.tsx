"use client";
/**
 * /audit-lab/review
 * Audit Lab -- Review Queue
 * Confidence-based transaction review interface.
 * Loads flagged transactions from GET /v1/audit-lab/review-queue
 * and allows approve/reject actions via POST /v1/audit-lab/review-queue/{id}/resolve.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Inbox,
  BarChart3,
  Hash, Microscope } from "lucide-react"

import { PageShell } from "@/components/layout/PageShell";

/* ── Style tokens ─────────────────────────────────────────────────────────── */

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
  green:     "var(--status-pass,#22c55e)",
  red:       "var(--accent-red,#f87171)",
} as const;

/* ── Types ──────────────────────────────────────────────────────────────── */

interface ReviewItem {
  id: string;
  row_index: number;
  trade_date: string | null;
  value_date: string | null;
  currency_sold: string | null;
  currency_bought: string | null;
  amount_sold: number | null;
  amount_bought: number | null;
  effective_rate: number | null;
  counterparty: string | null;
  confidence: number;
  flags: string[];
}

type FilterTab = "all" | "low" | "medium" | "acceptable";

/* ── Helpers ────────────────────────────────────────────────────────────── */

function fmtAmount(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtRate(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return n.toFixed(6);
}

function confidenceColor(pct: number): string {
  if (pct < 50) return S.red;
  if (pct < 70) return S.amber;
  return S.green;
}

function confidenceBand(pct: number): FilterTab {
  if (pct < 50) return "low";
  if (pct < 70) return "medium";
  return "acceptable";
}

function filterItems(items: ReviewItem[], tab: FilterTab): ReviewItem[] {
  if (tab === "all") return items;
  return items.filter((i) => confidenceBand(i.confidence * 100) === tab);
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function AuditLabReviewPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [resolvedCount, setResolvedCount] = useState(0);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  /* ── Load queue ───────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch("/v1/audit-lab/review-queue", token);
      if (!res.ok) {
        setError(`Failed to load review queue (HTTP ${res.status}).`);
        return;
      }
      const data = await res.json();
      setItems((data as { items: ReviewItem[] }).items ?? []);
    } catch {
      setError("Network error loading review queue.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── Resolve action ───────────────────────────────────────────────────── */

  const resolveItem = useCallback(
    async (id: string, action: "approve" | "reject") => {
      if (!token) return;
      setResolvingIds((prev) => new Set(prev).add(id));

      // Optimistic remove
      setItems((prev) => prev.filter((i) => i.id !== id));

      try {
        const res = await dashboardFetch(
          `/v1/audit-lab/review-queue/${id}/resolve`,
          token,
          {
            method: "POST",
            body: JSON.stringify({ action }),
          },
        );
        if (!res.ok) {
          // Revert on failure -- reload full queue
          await load();
          setError(`Failed to ${action} transaction (HTTP ${res.status}).`);
        } else {
          setResolvedCount((c) => c + 1);
        }
      } catch {
        await load();
        setError(`Network error while resolving transaction.`);
      } finally {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [token, load],
  );

  /* ── Derived stats ────────────────────────────────────────────────────── */

  const filtered = useMemo(() => filterItems(items, filter), [items, filter]);

  const avgConfidence = useMemo(() => {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, i) => acc + i.confidence, 0);
    return (sum / items.length) * 100;
  }, [items]);

  const tabCounts = useMemo(() => {
    const counts = { all: items.length, low: 0, medium: 0, acceptable: 0 };
    for (const item of items) {
      const band = confidenceBand(item.confidence * 100);
      counts[band]++;
    }
    return counts;
  }, [items]);

  /* ── Render ───────────────────────────────────────────────────────────── */

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "low", label: "Low (<50%)" },
    { key: "medium", label: "Medium (50-70%)" },
    { key: "acceptable", label: "Acceptable (70-80%)" },
  ];

  return (
    <PageShell icon={Microscope} title="Review Queue" breadcrumb={["Audit Lab","Review Queue"]}>
      {/* ── Breadcrumb + header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.tertiary,
            letterSpacing: "0.1em",
            marginBottom: 6,
          }}
        >
          <a
            href="/audit-lab"
            style={{ color: S.cyan, textDecoration: "none" }}
          >
            AUDIT LAB
          </a>
          {" / "}
          <span>REVIEW QUEUE</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: S.fontMono,
                fontSize: 18,
                fontWeight: 700,
                color: S.primary,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <ClipboardCheck size={20} style={{ color: S.cyan }} />
              Review Queue
            </h1>
            <p
              style={{
                fontFamily: S.fontUI,
                fontSize: 13,
                color: S.secondary,
                marginTop: 6,
                maxWidth: 600,
              }}
            >
              Transactions flagged for review due to low parse confidence or
              data quality issues.
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI stats bar ───────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Total in queue */}
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Inbox size={20} style={{ color: S.cyan, flexShrink: 0 }} />
          <div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                color: S.tertiary,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              QUEUE SIZE
            </div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 22,
                fontWeight: 700,
                color: S.primary,
                lineHeight: 1,
              }}
            >
              {loading ? "\u2014" : items.length}
            </div>
          </div>
        </div>

        {/* Avg confidence */}
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <BarChart3 size={20} style={{ color: S.amber, flexShrink: 0 }} />
          <div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                color: S.tertiary,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              AVG CONFIDENCE
            </div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 22,
                fontWeight: 700,
                color:
                  loading || items.length === 0
                    ? S.tertiary
                    : confidenceColor(avgConfidence),
                lineHeight: 1,
              }}
            >
              {loading || items.length === 0
                ? "\u2014"
                : `${avgConfidence.toFixed(1)}%`}
            </div>
          </div>
        </div>

        {/* Resolved this session */}
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Hash size={20} style={{ color: S.green, flexShrink: 0 }} />
          <div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                color: S.tertiary,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              RESOLVED (SESSION)
            </div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 22,
                fontWeight: 700,
                color: resolvedCount > 0 ? S.green : S.tertiary,
                lineHeight: 1,
              }}
            >
              {resolvedCount}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter tabs ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 0,
          borderBottom: `1px solid ${S.rim}`,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: filter === t.key ? 700 : 400,
              color: filter === t.key ? S.cyan : S.secondary,
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${filter === t.key ? S.cyan : "transparent"}`,
              padding: "10px 20px",
              cursor: "pointer",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {t.label} ({tabCounts[t.key]})
          </button>
        ))}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            background: `color-mix(in srgb, ${S.red} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.red} 30%, transparent)`,
            padding: "10px 16px",
            marginTop: 16,
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.red,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading && (
        <div
          style={{
            padding: 40,
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.tertiary,
          }}
        >
          Loading review queue...
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderTop: "none",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {[
                  "Row #",
                  "Date",
                  "Pair",
                  "Amount Sold",
                  "Rate",
                  "Counterparty",
                  "Confidence",
                  "Flags",
                  "Actions",
                ].map((h) => (
                  <th scope="col"
                    key={h}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: S.tertiary,
                      textAlign: "left",
                      padding: "10px 14px",
                      borderBottom: `1px solid ${S.soft}`,
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const pct = item.confidence * 100;
                const isResolving = resolvingIds.has(item.id);
                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: `1px solid ${S.soft}`,
                      opacity: isResolving ? 0.4 : 1,
                      transition: "opacity 150ms ease",
                    }}
                  >
                    {/* Row # */}
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.secondary,
                      }}
                    >
                      {item.row_index}
                    </td>

                    {/* Date */}
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.primary,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.trade_date ?? "\u2014"}
                    </td>

                    {/* Pair (sold/bought) */}
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.primary,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.currency_sold && item.currency_bought
                        ? `${item.currency_sold}/${item.currency_bought}`
                        : item.currency_sold || item.currency_bought || "\u2014"}
                    </td>

                    {/* Amount Sold */}
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.primary,
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtAmount(item.amount_sold)}
                    </td>

                    {/* Rate */}
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.secondary,
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtRate(item.effective_rate)}
                    </td>

                    {/* Counterparty */}
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.secondary,
                      }}
                    >
                      {item.counterparty || "\u2014"}
                    </td>

                    {/* Confidence */}
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 700,
                        color: confidenceColor(pct),
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 2,
                          background: `color-mix(in srgb, ${confidenceColor(pct)} 10%, transparent)`,
                        }}
                      >
                        {pct.toFixed(1)}%
                      </span>
                    </td>

                    {/* Flags */}
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.amber,
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={item.flags.join(", ")}
                    >
                      {item.flags.length > 0 ? item.flags.join(", ") : "\u2014"}
                    </td>

                    {/* Actions */}
                    <td
                      style={{
                        padding: "10px 14px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <button
                        onClick={() => resolveItem(item.id, "approve")}
                        disabled={isResolving}
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          color: S.green,
                          background: `color-mix(in srgb, ${S.green} 8%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${S.green} 25%, transparent)`,
                          padding: "4px 10px",
                          borderRadius: 2,
                          cursor: isResolving ? "not-allowed" : "pointer",
                          marginRight: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <CheckCircle2 size={12} />
                        APPROVE
                      </button>
                      <button
                        onClick={() => resolveItem(item.id, "reject")}
                        disabled={isResolving}
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          color: S.red,
                          background: `color-mix(in srgb, ${S.red} 8%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${S.red} 25%, transparent)`,
                          padding: "4px 10px",
                          borderRadius: 2,
                          cursor: isResolving ? "not-allowed" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <XCircle size={12} />
                        REJECT
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Empty state */}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: "48px 16px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <CheckCircle2
                        size={28}
                        style={{ color: S.green, opacity: 0.6 }}
                      />
                      <div
                        style={{
                          fontFamily: S.fontUI,
                          fontSize: 13,
                          color: S.tertiary,
                          maxWidth: 400,
                        }}
                      >
                        {items.length === 0
                          ? "No transactions require review. All parsed data meets confidence thresholds."
                          : "No transactions match the current filter."}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
