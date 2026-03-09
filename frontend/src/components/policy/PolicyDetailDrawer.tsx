"use client";

/**
 * PolicyDetailDrawer — Full policy inspection drawer.
 *
 * Fixed right-side slide-in showing all policy metadata, kernel-consumed fields,
 * methodology, field classification, provenance, and effectiveness score.
 *
 * Follows the same structural pattern as PolicyRevisionDrawer.tsx.
 */

import { useEffect } from "react";
import { Shield, X } from "lucide-react";
import type { PolicyPreset } from "@/constants/policyPresets";
import type { PolicyTemplate } from "@/api/policyClient";
import {
  computeEffectivenessScore,
  getEffectivenessColor,
} from "@/utils/policyEffectivenessScore";

// ── Design tokens ──────────────────────────────────────────────────────────────
const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub,var(--bg-panel))",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan,#22d3ee)",
  amber: "var(--accent-amber,#fbbf24)",
  pass: "var(--status-pass,#4ade80)",
  red: "var(--accent-red,#f87171)",
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function riskPostureColor(posture: string): string {
  switch (posture.toUpperCase()) {
    case "CONSERVATIVE":
      return S.pass;
    case "MODERATE":
      return S.amber;
    case "AGGRESSIVE":
      return S.red;
    default:
      return S.tertiary;
  }
}

function governanceTierColor(tier: string): string {
  switch (tier.toUpperCase()) {
    case "STANDARD":
      return S.pass;
    case "ENHANCED":
      return S.amber;
    case "COMMITTEE":
      return S.red;
    default:
      return S.tertiary;
  }
}

// ── Badge sub-component ────────────────────────────────────────────────────────

function Badge({
  label,
  color,
  filled,
}: {
  label: string;
  color: string;
  filled?: boolean;
}) {
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: "0.5625rem",
        letterSpacing: "0.06em",
        padding: "2px 8px",
        border: `1px solid ${color}`,
        color: filled ? S.bgDeep : color,
        background: filled
          ? color
          : `color-mix(in srgb, ${color} 8%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── Section header sub-component ───────────────────────────────────────────────

function SectionHeader({
  title,
  color,
}: {
  title: string;
  color?: string;
}) {
  return (
    <div
      style={{
        fontFamily: S.fontMono,
        fontSize: "0.5rem",
        letterSpacing: "0.1em",
        color: color ?? S.tertiary,
        fontWeight: 700,
        marginBottom: 8,
        textTransform: "uppercase",
      }}
    >
      {title}
    </div>
  );
}

// ── Kernel field row ───────────────────────────────────────────────────────────

function KernelField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: "0.5rem",
          letterSpacing: "0.06em",
          color: S.tertiary,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: "0.8125rem",
          color: S.primary,
          fontWeight: 700,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Classification row ─────────────────────────────────────────────────────────

function ClassificationRow({
  category,
  fields,
  status,
  borderColor,
}: {
  category: string;
  fields: string;
  status: string;
  borderColor: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr 160px",
        gap: 8,
        padding: "6px 8px",
        borderLeft: `3px solid ${borderColor}`,
        background: `color-mix(in srgb, ${borderColor} 4%, ${S.bgPanel})`,
        marginBottom: 2,
      }}
    >
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: "0.5625rem",
          color: borderColor,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {category}
      </span>
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: "0.5rem",
          color: S.secondary,
          letterSpacing: "0.03em",
        }}
      >
        {fields}
      </span>
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: "0.5rem",
          color: S.tertiary,
          letterSpacing: "0.03em",
          textAlign: "right",
        }}
      >
        {status}
      </span>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface PolicyDetailDrawerProps {
  preset: PolicyPreset;
  dbTemplate?: PolicyTemplate | null;
  token?: string;
  onClose: () => void;
  onOpenAudit?: (templateId: string, name: string, code: string) => void;
}

// ── Main drawer ────────────────────────────────────────────────────────────────

export default function PolicyDetailDrawer({
  preset,
  dbTemplate,
  onClose,
  onOpenAudit,
}: PolicyDetailDrawerProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Effectiveness score
  const effectiveness = computeEffectivenessScore(
    preset.policy,
    preset.riskPosture,
  );
  const effectivenessColor = getEffectivenessColor(
    effectiveness.score,
    S as unknown as Record<string, string>,
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(0,0,0,0.45)",
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 201,
          width: "clamp(560px, 40vw, 96vw)",
          minWidth: 560,
          maxWidth: "96vw",
          background: S.bgPanel,
          borderLeft: `1px solid ${S.rim}`,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.25)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${S.rim}`,
            background: S.bgSub,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <Shield size={14} color={S.cyan} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: "0.5625rem",
                color: S.cyan,
                letterSpacing: "0.1em",
                fontWeight: 700,
              }}
            >
              POLICY DETAIL
            </div>
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: "0.875rem",
                fontWeight: 700,
                color: S.primary,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {preset.name}
            </div>
          </div>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: "0.625rem",
              letterSpacing: "0.06em",
              padding: "2px 8px",
              border: `1px solid ${S.cyan}`,
              color: S.cyan,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {preset.shortName}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: "none",
              border: `1px solid ${S.rim}`,
              cursor: "pointer",
              color: S.tertiary,
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {/* ── SECTION 1: IDENTITY ───────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <SectionHeader title="Identity" />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 10,
              }}
            >
              <Badge label={preset.category} color={S.cyan} />
              <Badge
                label={preset.riskPosture}
                color={riskPostureColor(preset.riskPosture)}
              />
              <Badge
                label={preset.governance_tier}
                color={governanceTierColor(preset.governance_tier)}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  MATURITY PROFILE
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {preset.maturity_profile}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  ACCOUNTING MODE
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {preset.accounting_mode}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  EVIDENCE GRADE
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {preset.evidence_grade}
                </div>
              </div>
            </div>

            {dbTemplate && (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 6,
                }}
              >
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.04em",
                  }}
                >
                  DB VERSION:{" "}
                  <span style={{ color: S.primary, fontWeight: 600 }}>
                    v{dbTemplate.version}
                  </span>
                </span>
                {dbTemplate.updated_at && (
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: "0.5rem",
                      color: S.tertiary,
                      letterSpacing: "0.04em",
                    }}
                  >
                    UPDATED: {formatDate(dbTemplate.updated_at)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              borderBottom: `1px solid ${S.rim}`,
              marginBottom: 16,
            }}
          />

          {/* ── SECTION 2: DESCRIPTION & RATIONALE ────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <SectionHeader title="Description & Rationale" />
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: "0.75rem",
                color: S.secondary,
                lineHeight: 1.5,
                marginBottom: 8,
              }}
            >
              {preset.description}
            </div>
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: "0.75rem",
                color: S.secondary,
                lineHeight: 1.5,
                fontStyle: "italic",
                marginBottom: 8,
              }}
            >
              {preset.rationale}
            </div>
            <div>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "0.5rem",
                  color: S.tertiary,
                  letterSpacing: "0.06em",
                }}
              >
                TARGET AUDIENCE
              </span>
              <div
                style={{
                  fontFamily: S.fontUI,
                  fontSize: "0.6875rem",
                  color: S.secondary,
                  marginTop: 2,
                }}
              >
                {preset.targetAudience}
              </div>
            </div>
          </div>

          <div
            style={{
              borderBottom: `1px solid ${S.rim}`,
              marginBottom: 16,
            }}
          />

          {/* ── SECTION 3: EFFECT SURFACE ─────────────────────────────────── */}
          <div
            style={{
              marginBottom: 16,
              borderLeft: `3px solid ${S.cyan}`,
              paddingLeft: 12,
            }}
          >
            <SectionHeader
              title="Effect Surface -- Live Kernel Fields"
              color={S.cyan}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <KernelField
                label="Confirmed Ratio"
                value={`${Math.round(preset.policy.hedge_ratios.confirmed * 100)}%`}
              />
              <KernelField
                label="Forecast Ratio"
                value={`${Math.round(preset.policy.hedge_ratios.forecast * 100)}%`}
              />
              <KernelField
                label="Spread"
                value={`${preset.policy.cost_assumptions.spread_bps} bps`}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <KernelField
                label="Execution Product"
                value={preset.policy.execution_product}
              />
              <KernelField
                label="Min Trade Size"
                value={
                  preset.policy.min_trade_size_usd === 0
                    ? "None"
                    : `$${preset.policy.min_trade_size_usd.toLocaleString()}`
                }
              />
            </div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: "0.5rem",
                color: S.tertiary,
                lineHeight: 1.5,
                letterSpacing: "0.03em",
                marginTop: 6,
                padding: "6px 8px",
                background: `color-mix(in srgb, ${S.cyan} 4%, ${S.bgPanel})`,
                border: `1px solid color-mix(in srgb, ${S.cyan} 15%, ${S.rim})`,
              }}
            >
              These 5 fields are the ONLY policy parameters consumed by the v1
              hedge calculation kernel. All other fields are governance metadata
              or overlay controls.
            </div>
          </div>

          <div
            style={{
              borderBottom: `1px solid ${S.rim}`,
              marginBottom: 16,
            }}
          />

          {/* ── SECTION 4: METHODOLOGY ────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <SectionHeader title="Methodology" />
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: "0.75rem",
                color: S.cyan,
                marginBottom: 6,
                padding: "4px 8px",
                background: `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})`,
                border: `1px solid color-mix(in srgb, ${S.cyan} 20%, ${S.rim})`,
              }}
            >
              {preset.formula}
            </div>
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: "0.6875rem",
                color: S.secondary,
                lineHeight: 1.5,
              }}
            >
              {preset.formulaExplain}
            </div>
          </div>

          <div
            style={{
              borderBottom: `1px solid ${S.rim}`,
              marginBottom: 16,
            }}
          />

          {/* ── SECTION 5: METADATA -- NON-ENGINE FIELDS ──────────────────── */}
          <div
            style={{
              marginBottom: 16,
              borderLeft: `3px solid ${S.rim}`,
              paddingLeft: 12,
            }}
          >
            <SectionHeader title="Metadata -- Does Not Affect Hedge Calculation" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  BUCKET MODE
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {preset.policy.bucket_mode}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  GOVERNANCE TIER
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {preset.governance_tier}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  MATURITY PROFILE
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {preset.maturity_profile}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  ACCOUNTING MODE
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {preset.accounting_mode}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  EVIDENCE GRADE
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {preset.evidence_grade}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              borderBottom: `1px solid ${S.rim}`,
              marginBottom: 16,
            }}
          />

          {/* ── SECTION 6: FIELD CLASSIFICATION ───────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <SectionHeader title="Field Classification (Kernel Trace)" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 160px",
                gap: 0,
                marginBottom: 4,
                padding: "4px 8px",
              }}
            >
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "0.4375rem",
                  color: S.tertiary,
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                }}
              >
                CATEGORY
              </span>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "0.4375rem",
                  color: S.tertiary,
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                }}
              >
                FIELDS
              </span>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "0.4375rem",
                  color: S.tertiary,
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                  textAlign: "right",
                }}
              >
                STATUS
              </span>
            </div>
            <ClassificationRow
              category="KERNEL-BOUND"
              fields="hedge_ratios, spread_bps, min_trade, product"
              status="LIVE -- affects calculation"
              borderColor={S.cyan}
            />
            <ClassificationRow
              category="OVERLAY CONTROLS"
              fields="volatility, geopolitical, scenarios, effectiveness"
              status="DISABLED BY DEFAULT"
              borderColor={S.amber}
            />
            <ClassificationRow
              category="GOVERNANCE"
              fields="dual_key, governance_tier, evidence_grade"
              status="AUDIT ONLY"
              borderColor={S.pass}
            />
            <ClassificationRow
              category="INFORMATIONAL"
              fields="description, rationale, target_audience, formula"
              status="DISPLAY ONLY"
              borderColor={S.tertiary}
            />
          </div>

          <div
            style={{
              borderBottom: `1px solid ${S.rim}`,
              marginBottom: 16,
            }}
          />

          {/* ── SECTION 7: PROVENANCE ─────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <SectionHeader title="Provenance" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  SOURCE
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {dbTemplate
                    ? dbTemplate.is_system
                      ? "SYSTEM PRESET \u00B7 SEEDED"
                      : "CUSTOM \u00B7 unknown"
                    : "LOCAL PRESET \u00B7 NO DB RECORD"}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  CREATED
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {dbTemplate?.created_at
                    ? formatDate(dbTemplate.created_at)
                    : "\u2014"}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  VERSION
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {dbTemplate?.version ? `v${dbTemplate.version}` : "\u2014"}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.5rem",
                    color: S.tertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  TEMPLATE ID
                </span>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: "0.6875rem",
                    color: S.primary,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {dbTemplate?.id
                    ? dbTemplate.id.slice(0, 8).toUpperCase()
                    : "\u2014"}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              borderBottom: `1px solid ${S.rim}`,
              marginBottom: 16,
            }}
          />

          {/* ── SECTION 8: EFFECTIVENESS ──────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <SectionHeader title="Effectiveness" />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: effectivenessColor,
                }}
              >
                {effectiveness.score}
              </span>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "0.75rem",
                  color: S.tertiary,
                }}
              >
                / 100
              </span>
              <Badge
                label={effectiveness.badge}
                color={effectivenessColor}
                filled
              />
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "0.4375rem",
                  color: S.tertiary,
                  letterSpacing: "0.06em",
                  padding: "2px 6px",
                  border: `1px solid ${S.rim}`,
                }}
              >
                {effectiveness.grading}
              </span>
            </div>

            {/* Component breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(
                Object.entries(effectiveness.components) as [
                  string,
                  { score: number; max: number; rationale: string },
                ][]
              ).map(([key, comp]) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "3px 8px",
                    background: S.bgDeep,
                    border: `1px solid ${S.soft}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: "0.5rem",
                      color: S.tertiary,
                      letterSpacing: "0.04em",
                      width: 70,
                      flexShrink: 0,
                      textTransform: "uppercase",
                    }}
                  >
                    {key}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: "0.5625rem",
                      color: S.primary,
                      fontWeight: 700,
                      width: 40,
                      flexShrink: 0,
                    }}
                  >
                    {comp.score}/{comp.max}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontUI,
                      fontSize: "0.5rem",
                      color: S.tertiary,
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {comp.rationale}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: `1px solid ${S.rim}`,
            background: S.bgSub,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            {onOpenAudit && dbTemplate && (
              <button
                type="button"
                onClick={() =>
                  onOpenAudit(dbTemplate.id, preset.name, preset.shortName)
                }
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "0.5rem",
                  letterSpacing: "0.06em",
                  padding: "4px 12px",
                  border: `1px solid ${S.amber}`,
                  color: S.amber,
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                VIEW AUDIT TRAIL
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: S.fontMono,
              fontSize: "0.5rem",
              letterSpacing: "0.06em",
              padding: "4px 12px",
              border: `1px solid ${S.rim}`,
              color: S.tertiary,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </>
  );
}
