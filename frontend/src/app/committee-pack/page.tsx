"use client";

/**
 * /committee-pack — Sprint 1.5: Committee Pack Generator
 *
 * Print-ready institutional hedge programme documentation pack.
 *
 * Structure (mirrors BlackRock Aladdin / Bloomberg HSWB export format):
 *   CP-01  Cover Page       — Run metadata, IFRS 9 attestation header
 *   CP-02  Hash Chain       — RunEnvelope SHA-256 fingerprints (WORM proof)
 *   CP-03  Audit Trail      — TraceLite pipeline stage narrative
 *   CP-04  Policy Config    — Pinned PolicyRevision canonical parameters
 *   CP-05  Hedge Plan       — Bucket-level instrument actions + notionals
 *   CP-06  Scenario Grid    — Stress scenario P&L analysis
 *   CP-07  Regulatory Notes — IFRS 9 / EMIR / Dodd-Frank attestation
 *
 * URL: /committee-pack?id={run_id}
 * Linked from: Run Viewer (ED-03 Policy Pin section), Position Desk RUN chip
 *
 * Print: window.print() → @media print CSS hides nav, sidebar, action bar.
 * All sections use data-print-section for CSS page-break control.
 */

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../lib/authContext";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import {
  fetchCommitteePack,
  type CommitteePackResponse,
  type CommitteePackBucket,
  type CommitteePackTraceEvent,
  type CommitteePackScenario,
} from "../../api/runsClient";
import HelpPanel from "../../components/layout/HelpPanel";
import { COMMITTEE_PACK_HELP } from "../../lib/helpContent";

import { PageShell } from "@/components/layout/PageShell";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { FileText } from "lucide-react";

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
  purple:    "#93C5FD",
  indigo:    "#818cf8",
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────
function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.slice(0, 8).toUpperCase();
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1,
  }).format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });
  } catch { return ts; }
}

// ── Trace step colours ─────────────────────────────────────────────────────────
const STEP_COLORS: Record<string, string> = {
  PARSE:     S.tertiary,
  VALIDATE:  S.cyan,
  NORMALIZE: S.secondary,
  KERNEL:    S.amber,
  SCENARIO:  S.indigo,
  AUDIT:     S.pass,
};

function stepColor(step: string): string {
  return STEP_COLORS[step.toUpperCase()] ?? S.secondary;
}

// ── Divider ────────────────────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, margin: "32px 0 20px",
    }}>
      <div style={{ flex: 1, height: 1, background: S.rim }} />
      <span style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.10em",
        color: S.tertiary, whiteSpace: "nowrap" as const,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: S.rim }} />
    </div>
  );
}

// ── Hash row ───────────────────────────────────────────────────────────────────
function HashRow({
  label, value, highlight,
}: { label: string; value: string | null; highlight?: boolean }) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      role="row"
      aria-label={`${label}: ${value ?? "not available"}`}
      style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "140px 1fr 24px",
        alignItems: "center", gap: 8, padding: "5px 0",
        borderBottom: `1px solid ${S.rim}`,
      }}
    >
      <span style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
        letterSpacing: "0.06em", color: S.secondary, textTransform: "uppercase" as const,
      }}>
        {label}
      </span>
      <span
        role="img"
        aria-label={`SHA-256 hash: ${value ?? "not available"}`}
        title={value ?? "—"}
        style={{
          fontFamily: S.fontMono, fontSize: 12,
          color: highlight ? S.cyan : S.secondary,
          wordBreak: "break-all" as const,
          cursor: value ? "pointer" : "default",
        }}
        onClick={copy}
      >
        {value ?? "—"}
      </span>
      <button
        type="button"
        aria-label={`Copy ${label} hash to clipboard`}
        onClick={copy}
        disabled={!value}
        style={{
          fontFamily: S.fontMono, fontSize: 12,
          color: copied ? S.pass : S.tertiary,
          transition: "color 0.2s",
          background: "none", border: "none", cursor: value ? "pointer" : "default",
          padding: 0, lineHeight: 1,
        }}
      >
        {copied ? "✓" : "⎘"}
      </button>
    </div>
  );
}

// ── Policy field row ───────────────────────────────────────────────────────────
function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{
        padding: "5px 10px 5px 0", fontFamily: S.fontMono, fontSize: 12,
        color: S.secondary, whiteSpace: "nowrap" as const, verticalAlign: "top",
        borderBottom: `1px solid ${S.rim}`,
      }}>
        {label}
      </td>
      <td style={{
        padding: "5px 0", fontFamily: S.fontMono, fontSize: 12,
        color: S.primary, borderBottom: `1px solid ${S.rim}`,
      }}>
        {value}
      </td>
    </tr>
  );
}

// ── Scenario P&L badge ─────────────────────────────────────────────────────────
function ScenarioBadge({ scenario }: { scenario: CommitteePackScenario }) {
  const benefit = scenario.hedge_benefit_usd ?? 0;
  const sigma   = scenario.sigma ?? 0;
  const isPos   = benefit >= 0;
  return (
    <div style={{
      background: isPos
        ? `color-mix(in srgb, ${S.pass} 8%, ${S.bgPanel})`
        : `color-mix(in srgb, ${S.fail} 8%, ${S.bgPanel})`,
      border: `1px solid color-mix(in srgb, ${isPos ? S.pass : S.fail} 20%, transparent)`,
      borderRadius: 3, padding: "8px 12px", minWidth: 100,
    }}>
      <div style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
        color: S.secondary, letterSpacing: "0.08em", marginBottom: 4,
      }}>
        σ {sigma > 0 ? `+${(sigma * 100).toFixed(0)}%` : `${(sigma * 100).toFixed(0)}%`}
      </div>
      <div style={{
        fontFamily: S.fontMono, fontSize: 13, fontWeight: 700,
        color: isPos ? S.pass : S.fail,
      }}>
        {fmtUsd(benefit)}
      </div>
      <div style={{
        fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 2,
      }}>
        hedge benefit
      </div>
    </div>
  );
}

// ── Main page inner (requires useSearchParams → must be in Suspense) ───────────
function CommitteePackInner() {
  const params   = useSearchParams();
  const _router  = useRouter();
  const { token } = useAuth();

  const runId = params.get("id") ?? "";

  const [pack,    setPack]    = useState<CommitteePackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    setErr(null);
    fetchCommitteePack(runId, token ?? undefined)
      .then(setPack)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [runId, token]);

  // ── No run ID ─────────────────────────────────────────────────────────────
  if (!runId) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "60vh", gap: 12, textAlign: "center",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: `1px solid ${S.rim}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: S.fontMono, fontSize: 16, color: S.tertiary,
        }}>
          ▤
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary, fontWeight: 600 }}>
          No run ID provided
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
          Navigate from Position Desk or Run Viewer to generate a committee pack.
        </div>
        <Link href="/position-desk" style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.cyan,
          border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
          padding: "4px 12px", borderRadius: 2, textDecoration: "none",
        }}>
          → Position Desk
        </Link>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "60vh", gap: 12,
      }}>
        <div style={{
          width: 16, height: 16, border: `2px solid ${S.rim}`,
          borderTopColor: S.cyan, borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
          Loading committee pack…
        </span>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (err) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "60vh", gap: 10,
      }}>
        <div style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.fail,
          background: `color-mix(in srgb, ${S.fail} 8%, ${S.bgPanel})`,
          border: `1px solid color-mix(in srgb, ${S.fail} 20%, transparent)`,
          borderRadius: 3, padding: "8px 16px",
        }}>
          {err}
        </div>
        <Link href="/trade-history" style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.secondary, textDecoration: "none",
        }}>
          ← Back to Run History
        </Link>
      </div>
    );
  }

  if (!pack) return null;

  const { meta, run_envelope, trace_lite, policy_revision, hedge_plan, scenarios, regulatory } = pack;
  const cp      = policy_revision?.canonical_policy ?? {};
  const buckets = hedge_plan?.buckets ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "12px 16px 40px" : "20px 24px 60px" }}>

      {/* ── Print / Action bar (hidden in @media print) ── */}
      <div
        className="no-print"
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 20, padding: "8px 12px",
          background: S.bgPanel,
          border: `1px solid ${S.rim}`, borderRadius: 3,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/run-viewer?id=${encodeURIComponent(runId)}`} style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.purple,
            background: `color-mix(in srgb, ${S.purple} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.purple} 20%, transparent)`,
            padding: "3px 8px", borderRadius: 2, textDecoration: "none",
          }}>
            ← RUN VIEWER
          </Link>
          <Link href="/trade-history" style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
            border: `1px solid ${S.rim}`, padding: "3px 8px", borderRadius: 2,
            textDecoration: "none",
          }}>
            ← RUN HISTORY
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
            letterSpacing: "0.06em",
          }}>
            RUN {shortId(runId)}
          </span>
          <button
            onClick={() => window.print()}
            aria-label="Print committee pack to PDF"
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              letterSpacing: "0.06em",
              color: S.bgDeep, background: S.cyan,
              border: "none", borderRadius: 2, padding: "4px 14px",
              cursor: "pointer",
            }}
          >
            PRINT / PDF
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          CP-01  COVER PAGE
      ───────────────────────────────────────────────────────────────────── */}
      <div data-print-section="cover" style={{
        border: `1px solid ${S.rim}`, borderRadius: 3,
        background: S.bgPanel, padding: isMobile ? "16px 20px" : "28px 32px", marginBottom: 24,
      }}>
        {/* Header rule */}
        <div style={{
          height: 2,
          background: `linear-gradient(90deg, ${S.cyan}, ${S.purple}, transparent)`,
          marginBottom: 20,
        }} />

        {/* Title block */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase" as const,
            marginBottom: 6,
          }}>
            ORDR TERMINAL  ·  COMMITTEE PACK
          </div>
          <div style={{
            fontFamily: S.fontUI, fontSize: 22, fontWeight: 700,
            color: S.primary, letterSpacing: "-0.01em", lineHeight: 1.2,
            marginBottom: 4,
          }}>
            FX Hedge Programme
          </div>
          <div style={{
            fontFamily: S.fontUI, fontSize: 14, color: S.secondary, marginBottom: 16,
          }}>
            {meta.generated_for}
          </div>
        </div>

        {/* KPI strip */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill,minmax(130px,1fr))",
          gap: 1,
          background: S.rim, borderRadius: 2, overflow: "hidden", marginBottom: 20,
        }}>
          {[
            { label: "Run ID",        value: shortId(meta.run_id)                },
            { label: "Generated",     value: fmtTs(meta.created_at)              },
            { label: "Engine",        value: meta.engine_version                 },
            { label: "Positions",     value: String(meta.trade_count)            },
            { label: "Buckets",       value: String(meta.hedge_count)            },
            { label: "Policy Rev",    value: policy_revision
                ? `REV ${policy_revision.revision}`
                : "UNPINNED"
            },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: S.bgPanel, padding: "10px 14px",
            }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                letterSpacing: "0.08em", color: S.tertiary, marginBottom: 3,
              }}>
                {label.toUpperCase()}
              </div>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, color: S.primary, fontWeight: 600,
              }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* IFRS 9 attestation header */}
        <div style={{
          background: `color-mix(in srgb, ${S.pass} 5%, ${S.bgSub})`,
          border: `1px solid color-mix(in srgb, ${S.pass} 15%, transparent)`,
          borderRadius: 2, padding: "10px 14px",
        }}>
          <div style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.10em", color: S.pass, marginBottom: 4,
          }}>
            IFRS 9 §B6.4 — HEDGE EFFECTIVENESS DOCUMENTATION
          </div>
          <div style={{
            fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.5,
          }}>
            {regulatory.attestation}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          CP-02  HASH CHAIN — RunEnvelope WORM fingerprint
      ───────────────────────────────────────────────────────────────────── */}
      <SectionDivider label="CP-02  RUN ENVELOPE — SHA-256 HASH CHAIN" />
      <div data-print-section="hash-chain" style={{
        border: `1px solid ${S.rim}`, borderRadius: 3,
        background: S.bgPanel, padding: "18px 20px", marginBottom: 8,
      }}>
        <div style={{ marginBottom: 12 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.08em", color: S.tertiary,
          }}>
            ENGINE VERSION
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.cyan, marginLeft: 10,
          }}>
            {run_envelope.engine_version}
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginLeft: 16,
          }}>
            TIMESTAMP
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.secondary, marginLeft: 10,
          }}>
            {fmtTs(run_envelope.timestamp)}
          </span>
        </div>

        <HashRow label="run_hash"     value={run_envelope.run_hash}     highlight />
        <HashRow label="inputs_hash"  value={run_envelope.inputs_hash}  />
        <HashRow label="outputs_hash" value={run_envelope.outputs_hash} />
        <HashRow label="trades_hash"  value={run_envelope.trades_hash}  />
        <HashRow label="hedges_hash"  value={run_envelope.hedges_hash}  />
        <HashRow label="market_hash"  value={run_envelope.market_hash}  />
        <HashRow label="policy_hash"  value={run_envelope.policy_hash}  />

        <div style={{
          marginTop: 12,
          fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.5,
        }}>
          {regulatory.worm_note}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          CP-03  AUDIT TRAIL — TraceLite pipeline stage narrative
      ───────────────────────────────────────────────────────────────────── */}
      <SectionDivider label="CP-03  AUDIT TRAIL — PIPELINE STAGE NARRATIVE" />
      <div data-print-section="trace" style={{
        border: `1px solid ${S.rim}`, borderRadius: 3,
        background: S.bgPanel, padding: "18px 20px", marginBottom: 8,
      }}>
        {trace_lite.events.length === 0 ? (
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
            No trace events recorded for this run.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {trace_lite.events.map((evt: CommitteePackTraceEvent, i: number) => {
              const col = stepColor(evt.step);
              return (
                <div key={i} style={{ display: "flex", gap: 0, position: "relative" }}>
                  {/* Connector line */}
                  {i < trace_lite.events.length - 1 && (
                    <div style={{
                      position: "absolute", left: 13, top: 26, width: 1,
                      height: "calc(100% - 10px)",
                      background: `color-mix(in srgb, ${col} 20%, ${S.rim})`,
                    }} />
                  )}
                  {/* Icon bubble */}
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    border: `1px solid ${col}`,
                    background: `color-mix(in srgb, ${col} 12%, ${S.bgPanel})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                    color: col, flexShrink: 0, marginTop: 4,
                  }}>
                    {evt.step[0] ?? "?"}
                  </div>
                  {/* Content */}
                  <div style={{
                    marginLeft: 12, paddingBottom: 16, flex: 1,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                        color: col, letterSpacing: "0.06em",
                      }}>
                        {evt.step}
                      </span>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
                      }}>
                        {fmtTs(evt.timestamp)}
                      </span>
                    </div>
                    <div style={{
                      fontFamily: S.fontUI, fontSize: 12, color: S.secondary,
                    }}>
                      {evt.detail ?? "—"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          CP-04  POLICY CONFIGURATION — Pinned PolicyRevision
      ───────────────────────────────────────────────────────────────────── */}
      <SectionDivider label="CP-04  POLICY CONFIGURATION — PINNED REVISION" />
      <div data-print-section="policy" style={{
        border: `1px solid ${S.rim}`, borderRadius: 3,
        background: S.bgPanel, padding: "18px 20px", marginBottom: 8,
      }}>
        {!policy_revision ? (
          <div style={{
            background: `color-mix(in srgb, ${S.amber} 6%, ${S.bgSub})`,
            border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`,
            borderRadius: 2, padding: "10px 14px",
          }}>
            <span style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              color: S.amber, letterSpacing: "0.06em",
            }}>
              UNPINNED RUN
            </span>
            <span style={{
              fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginLeft: 10,
            }}>
              This run was executed before policy version pinning was activated
              (Sprint 1.0). The policy configuration in force at calculation time
              cannot be proven from the DB record alone.
            </span>
          </div>
        ) : (
          <div>
            {/* Revision badge row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
              flexWrap: "wrap" as const,
            }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                color: S.bgDeep, background: S.pass,
                padding: "2px 8px", borderRadius: 2, letterSpacing: "0.06em",
              }}>
                REV {policy_revision.revision}
              </div>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
              }}>
                Policy Instance: {policy_revision.policy_instance_id.slice(0, 8).toUpperCase()}
              </div>
              {policy_revision.created_by_email && (
                <div style={{
                  fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
                }}>
                  Activated by: {policy_revision.created_by_email}
                </div>
              )}
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
              }}>
                {fmtTs(policy_revision.created_at)}
              </div>
              {policy_revision.change_reason && (
                <div style={{
                  fontFamily: S.fontUI, fontSize: 12, color: S.secondary,
                  fontStyle: "italic",
                }}>
                  &quot;{policy_revision.change_reason}&quot;
                </div>
              )}
            </div>

            {/* Policy hash */}
            <div style={{ marginBottom: 14 }}>
              <HashRow label="policy_hash" value={policy_revision.policy_hash} highlight />
            </div>

            {/* Canonical policy config table */}
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <caption style={{
                fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
                letterSpacing: "0.06em", textAlign: "left" as const,
                padding: "0 0 6px", captionSide: "top" as const,
              }}>
                Pinned policy revision — canonical configuration parameters
              </caption>
              <tbody>
                {typeof cp === "object" && cp !== null &&
                  Object.entries(cp as Record<string, unknown>).map(([k, v]) => {
                    const display = typeof v === "object"
                      ? JSON.stringify(v, null, 0)
                      : String(v);
                    return (
                      <PolicyRow
                        key={k}
                        label={k.replace(/_/g, " ").toUpperCase()}
                        value={display}
                      />
                    );
                  })
                }
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          CP-05  HEDGE PLAN — Bucket-level instrument actions
      ───────────────────────────────────────────────────────────────────── */}
      <SectionDivider label="CP-05  HEDGE PLAN — EXECUTION BUCKETS" />
      <div data-print-section="hedge-plan" style={{
        border: `1px solid ${S.rim}`, borderRadius: 3,
        background: S.bgPanel, marginBottom: 8, overflow: "hidden",
      }}>
        {buckets.length === 0 ? (
          <div style={{
            padding: "18px 20px", fontFamily: S.fontUI, fontSize: 12, color: S.tertiary,
          }}>
            No hedge buckets in this run.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <caption style={{
                fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
                letterSpacing: "0.06em", textAlign: "left" as const,
                padding: "6px 12px 4px", captionSide: "top" as const,
              }}>
                Hedge execution buckets — notional amounts, coverage ratios, and assigned instruments
              </caption>
              <thead>
                <tr style={{ background: S.bgSub }}>
                  {["BUCKET", "DIRECTION", "NOTIONAL (USD)", "COVERAGE", "INSTRUMENT"].map(h => (
                    <th scope="col" key={h} style={{
                      padding: "8px 12px", fontFamily: S.fontMono, fontSize: 12,
                      fontWeight: 700, letterSpacing: "0.08em", color: S.secondary,
                      textAlign: "left" as const, borderBottom: `1px solid ${S.rim}`,
                      whiteSpace: "nowrap" as const,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buckets.map((b: CommitteePackBucket, i: number) => {
                  const isBuy = (b.action_direction as string)?.toUpperCase() === "BUY";
                  const dirColor = isBuy ? S.pass : S.fail;
                  const mapping = (b as Record<string, unknown>).mapping as Record<string, unknown> | undefined;
                  return (
                    <tr key={i} style={{
                      background: i % 2 === 0 ? S.bgPanel : S.bgSub,
                    }}>
                      <td style={{
                        padding: "7px 12px", fontFamily: S.fontMono, fontSize: 12,
                        color: S.primary, borderBottom: `1px solid ${S.rim}`,
                        whiteSpace: "nowrap" as const,
                      }}>
                        {b.bucket as string}
                      </td>
                      <td style={{
                        padding: "7px 12px", fontFamily: S.fontMono, fontSize: 12,
                        fontWeight: 700, color: dirColor,
                        borderBottom: `1px solid ${S.rim}`,
                      }}>
                        {(b.action_direction as string)?.toUpperCase() ?? "—"}
                      </td>
                      <td style={{
                        padding: "7px 12px", fontFamily: S.fontMono, fontSize: 12,
                        color: S.secondary, borderBottom: `1px solid ${S.rim}`,
                        textAlign: "right" as const,
                      }}>
                        {fmtUsd(b.action_usd as number)}
                      </td>
                      <td style={{
                        padding: "7px 12px", fontFamily: S.fontMono, fontSize: 12,
                        color: S.secondary, borderBottom: `1px solid ${S.rim}`,
                        textAlign: "right" as const,
                      }}>
                        {fmtPct(b.coverage_pct as number)}
                      </td>
                      <td style={{
                        padding: "7px 12px", fontFamily: S.fontMono, fontSize: 12,
                        color: S.tertiary, borderBottom: `1px solid ${S.rim}`,
                      }}>
                        {mapping
                          ? `${mapping.instrument_type ?? "—"}  ${mapping.ibkr_symbol ?? ""}`
                          : "—"
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary footer */}
        {hedge_plan?.summary && Object.keys(hedge_plan.summary).length > 0 && (
          <div style={{
            borderTop: `1px solid ${S.rim}`, padding: "10px 16px",
            display: "flex", gap: 24, flexWrap: "wrap" as const,
          }}>
            {Object.entries(hedge_plan.summary).map(([k, v]) => (
              <div key={k}>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
                  letterSpacing: "0.06em",
                }}>
                  {k.replace(/_/g, " ").toUpperCase()}
                </span>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 12, color: S.secondary, marginLeft: 6,
                }}>
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          CP-06  SCENARIO GRID — Stress analysis
      ───────────────────────────────────────────────────────────────────── */}
      <SectionDivider label="CP-06  SCENARIO ANALYSIS — STRESS GRID" />
      <div data-print-section="scenarios" style={{
        border: `1px solid ${S.rim}`, borderRadius: 3,
        background: S.bgPanel, padding: "18px 20px", marginBottom: 8,
      }}>
        {scenarios.length === 0 ? (
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
            No scenario analysis data in this run.
          </div>
        ) : (
          <div style={{
            display: "flex", gap: 8, flexWrap: "wrap" as const,
          }}>
            {scenarios.map((s: CommitteePackScenario, i: number) => (
              <ScenarioBadge key={i} scenario={s} />
            ))}
          </div>
        )}
        <div style={{
          marginTop: 12, fontFamily: S.fontUI, fontSize: 12,
          color: S.secondary, lineHeight: 1.5,
        }}>
          Scenario values represent the estimated P&amp;L benefit of the hedge programme
          under the stated FX rate shock (σ). Positive values indicate the hedge
          offsets currency losses. Computed deterministically by the ORDR engine;
          no model risk or ML inference.
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          CP-07  REGULATORY NOTES
      ───────────────────────────────────────────────────────────────────── */}
      <SectionDivider label="CP-07  REGULATORY & COMPLIANCE NOTES" />
      <div data-print-section="regulatory" style={{
        border: `1px solid ${S.rim}`, borderRadius: 3,
        background: S.bgPanel, padding: "18px 20px",
      }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <caption style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
            letterSpacing: "0.06em", textAlign: "left" as const,
            padding: "0 0 6px", captionSide: "top" as const,
          }}>
            Regulatory framework references — IFRS 9, EMIR, Dodd-Frank
          </caption>
          <tbody>
            <PolicyRow label="Framework"    value={regulatory.framework}    />
            <PolicyRow label="Standard Ref" value={regulatory.standard_ref} />
            <PolicyRow label="EMIR Ref"     value={regulatory.emir_ref}     />
            <PolicyRow label="Dodd-Frank"   value={regulatory.dodd_frank}   />
          </tbody>
        </table>
        </div>
        <div style={{
          marginTop: 14,
          background: `color-mix(in srgb, ${S.pass} 5%, ${S.bgSub})`,
          border: `1px solid color-mix(in srgb, ${S.pass} 15%, transparent)`,
          borderRadius: 2, padding: "10px 14px",
        }}>
          <div style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.10em", color: S.pass, marginBottom: 6,
          }}>
            ATTESTATION
          </div>
          <div style={{
            fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6,
          }}>
            {regulatory.attestation}
          </div>
        </div>
        <div style={{
          marginTop: 10,
          fontFamily: S.fontUI, fontSize: 12, color: S.secondary,
          fontStyle: "italic",
        }}>
          {regulatory.worm_note}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 24, paddingTop: 16, borderTop: `1px solid ${S.rim}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap" as const, gap: 8,
        }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
            letterSpacing: "0.06em",
          }}>
            ORDR TERMINAL  ·  ENGINE v{meta.engine_version}  ·  RUN {shortId(runId)}
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
          }}>
            Generated {fmtTs(meta.created_at)}
          </span>
        </div>
      </div>

      {/* ── Print CSS (injected inline to avoid separate file) ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          [data-print-section] { page-break-inside: avoid; }
          [data-print-section="cover"]     { page-break-after: always; }
          [data-print-section="hash-chain"]{ page-break-after: auto; }
          [data-print-section="trace"]     { page-break-after: auto; }
          [data-print-section="policy"]    { page-break-before: always; }
          [data-print-section="hedge-plan"]{ page-break-before: auto; }
          [data-print-section="scenarios"] { page-break-before: auto; }
          [data-print-section="regulatory"]{ page-break-before: always; }
        }
        @keyframes spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Page wrapper with Suspense (required by useSearchParams) ───────────────────
export default function CommitteePackPage() {
  const _planAllowed = usePlanRedirect("professional");
  const _isMobile = useIsMobile();
  if (!_planAllowed) return null;
  return (

    <PageShell icon={FileText} title="Committee Pack" breadcrumb={["Dashboard", "Committee Pack"]} noPadding>
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Suspense fallback={
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "60vh", gap: 12,
          }}>
            <div style={{
              fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
              fontSize: 12, color: "var(--text-secondary)",
            }}>
              Loading…
            </div>
          </div>
        }>
          <CommitteePackInner />
        </Suspense>
      </div>
      <HelpPanel config={COMMITTEE_PACK_HELP} storageKey="committee-pack" />
    </div>
  
    </PageShell>
    );
}
