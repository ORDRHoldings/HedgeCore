"use client";

/**
 * PolicyHelpPanel.tsx
 *
 * Sliding help panel for the ORDR Policy Engine module.
 * Renders as a fixed right-side drawer with backdrop.
 *
 * Sections:
 *   1. Policy Library  — browses 60 system presets, activate flow, template categories
 *   2. AI Wizard       — 7-phase wizard walkthrough, AI analysis, save-to-DB flow
 *   3. Saved Policies  — CRUD lifecycle, activation/deactivation, version pinning
 *   4. Math & Formulas — whitepaper-level formulas, IFRS 9, Basel III, optimal hedge ratio
 *
 * Regulatory refs: IFRS 9 §6.5, BCBS FRTB MAR23, SEC 17a-4, CFTC 1.31, ISO 8601
 */

import { useState } from "react";

// ── Design tokens ───────────────────────────────────────────────────────────
const S = {
  bg:            "var(--bg-deep)",
  bgSub:         "var(--bg-sub,var(--bg-panel))",
  bgPanel:       "var(--bg-panel)",
  border:        "var(--border-rim)",
  borderSoft:    "var(--border-soft)",
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary:  "var(--text-tertiary)",
  cyan:          "var(--accent-cyan,#22d3ee)",
  amber:         "var(--accent-amber,#fbbf24)",
  green:         "var(--status-pass,#34d399)",
  red:           "var(--accent-red,#f87171)",
  purple:        "var(--accent-purple,#93C5FD)",
  fontMono:      "'IBM Plex Mono', monospace",
  fontUI:        "'IBM Plex Sans', sans-serif",
};

// ── Section tabs ─────────────────────────────────────────────────────────────
type HelpSection = "library" | "wizard" | "saved" | "math";

const SECTION_TABS: { key: HelpSection; label: string }[] = [
  { key: "library", label: "Policy Library"  },
  { key: "wizard",  label: "AI Wizard"       },
  { key: "saved",   label: "Saved Policies"  },
  { key: "math",    label: "Math & Formulas" },
];

// ── Subcomponents ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.12em",
      color: S.cyan, fontWeight: 700, textTransform: "uppercase",
      borderBottom: `1px solid ${S.border}`, paddingBottom: 6, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: S.fontUI, fontSize: "0.75rem", color: S.textSecondary,
      lineHeight: 1.6, margin: "0 0 10px 0",
    }}>
      {children}
    </p>
  );
}

function FieldRow({ label, desc, note }: { label: string; desc: string; note?: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "130px 1fr", gap: "4px 10px",
      padding: "6px 0", borderBottom: `1px solid ${S.border}`,
      alignItems: "start",
    }}>
      <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.cyan, letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div>
        <div style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.textSecondary }}>{desc}</div>
        {note && (
          <div style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.textTertiary, marginTop: 2 }}>
            ↳ {note}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: "0.5625rem", padding: "1px 5px",
      border: `1px solid ${color}`, color, borderRadius: 2, letterSpacing: "0.06em",
    }}>
      {children}
    </span>
  );
}

function TipRow({ type, text }: { type: "TIP" | "WARN" | "NOTE" | "REG"; text: string }) {
  const color = type === "TIP" ? S.green : type === "WARN" ? S.red : type === "REG" ? S.purple : S.amber;
  return (
    <div style={{
      display: "flex", gap: 8, padding: "5px 0",
      borderBottom: `1px solid ${S.border}`, alignItems: "flex-start",
    }}>
      <Chip color={color}>{type}</Chip>
      <span style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.textSecondary, lineHeight: 1.5 }}>
        {text}
      </span>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre style={{
      fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.amber,
      background: S.bgSub, border: `1px solid ${S.border}`,
      padding: "8px 10px", margin: "8px 0", overflowX: "auto", lineHeight: 1.6,
      whiteSpace: "pre",
    }}>
      {children}
    </pre>
  );
}

// ── Section content ───────────────────────────────────────────────────────────

function LibraryHelp() {
  return (
    <div>
      <SectionTitle>Policy Library — /policies</SectionTitle>
      <Para>
        The Policy Library displays all 60 system-defined hedge policy presets across 4 institutional
        categories. Browse, filter by risk posture, and activate any preset as your branch's live
        hedge policy. Only one policy can be active per company+branch at any time.
      </Para>

      <SectionTitle>Category Overview</SectionTitle>
      <FieldRow label="CORPORATE (6)"  desc="Standard treasury presets for non-financial corporates. Cover AP/AR flows, natural hedging, layered forward programs." note="Target: CFOs, Treasurers — IFRS 9 qualifying" />
      <FieldRow label="FINANCIAL (4)"  desc="Bank, insurance, and pension fund presets with Basel III / FRTB-aligned VaR floors and ES constraints." note="Target: CROs, Risk Managers — BCBS MAR23" />
      <FieldRow label="SOVEREIGN (3)"  desc="Reserve management presets per IMF ARA methodology. Includes Guidotti–Greenspan liquidity floor." note="Target: Central Banks, Sovereign Wealth" />
      <FieldRow label="SECTOR (47)"    desc="Industry-specific presets for 47 sectors including airlines, tech, pharma, commodities, agri, mining, shipping." note="Empirical hedge ratios from BIS FX Survey 2022" />

      <SectionTitle>Action Flow</SectionTitle>
      <FieldRow label="Browse"    desc="Filter by category tab or search by name, short code, or target audience." />
      <FieldRow label="ACTIVATE"  desc="Click the ACTIVATE button on any preset card. Backend creates a PolicyInstance row for your company+branch." note="PATCH /v1/policies/activate" />
      <FieldRow label="ACTIVE"    desc="The currently active policy shows a cyan ACTIVE banner in the header and a ✓ ACTIVE chip on the card." />
      <FieldRow label="AI POLICY" desc="Click '+ NEW AI POLICY' to launch the 7-phase AI Wizard and create a custom policy backed by Claude AI." />

      <SectionTitle>Risk Posture Chips</SectionTitle>
      <div style={{ display: "flex", gap: 6, margin: "6px 0 10px" }}>
        <Chip color={S.green}>CONSERVATIVE</Chip>
        <Chip color={S.amber}>MODERATE</Chip>
        <Chip color={S.red}>AGGRESSIVE</Chip>
      </div>
      <Para>
        Conservative policies hedge 80–100% of confirmed and 60–80% of forecast exposures via
        forwards. Aggressive policies may hedge only 40–60% of confirmed and use options overlays.
      </Para>

      <SectionTitle>Tips</SectionTitle>
      <TipRow type="TIP"  text="Activating a new policy automatically deactivates the previous one. Audit history is preserved for both." />
      <TipRow type="TIP"  text="All system presets are seeded in the database at startup. They cannot be modified or deleted — only activated." />
      <TipRow type="REG"  text="Policy activation creates a WORM PolicyRevision snapshot (SEC 17a-4 / CFTC 1.31). The snapshot is hash-chained and tamper-evident." />
      <TipRow type="NOTE" text="Custom policies created via the AI Wizard appear in the CUSTOM POLICIES section at the bottom of this page." />
    </div>
  );
}

function WizardHelp() {
  return (
    <div>
      <SectionTitle>AI Policy Wizard — /ai-policy-wizard</SectionTitle>
      <Para>
        The 7-phase wizard collects institutional-grade data about your hedging context and submits
        it to the Claude AI policy engine. The AI returns 3 ranked policy recommendations each
        backed by a full CanonicalPolicy configuration, hedge ratios, and regulatory rationale.
      </Para>

      <SectionTitle>7 Phases</SectionTitle>
      <FieldRow label="A — Intent"       desc="Policy intent (defensive/cost optimization/accounting), portfolio scope (confirmed/forecast split), time horizon (1–24 months)." />
      <FieldRow label="B — Exposure"     desc="Currency pair classification, netting rules (same-currency offset), materiality threshold (min notional to hedge)." />
      <FieldRow label="C — Instruments"  desc="Eligible instrument grid (forwards, options, swaps, NDF), tenor ladder configuration (max tenor per currency)." />
      <FieldRow label="D — Constraints"  desc="Hedge cost budget (spread bps), option premium cap (% notional), concentration limits per currency." />
      <FieldRow label="E — Scenarios"    desc="Stress scenario pack (2008 GFC, 2020 COVID, 2022 EM crisis), custom scenario override with bespoke FX moves." />
      <FieldRow label="F — Governance"   desc="Policy summary with all field values pre-populated. Approval checklist (CFO sign-off, board mandate, auditor review)." />
      <FieldRow label="G — Publish"      desc="Status selector (DRAFT vs FINAL), policy name and short tag, AI analysis trigger, recommendation selection, save to DB." />

      <SectionTitle>AI Analysis Flow</SectionTitle>
      <Para>
        On Phase G, clicking <strong>✦ ANALYZE WITH AI →</strong> sends all wizard state to
        <code style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.amber }}> POST /api/policy-ai </code>
        which proxies to the Claude API. The AI returns 3 ranked recommendations.
        The first recommendation is auto-selected to enable immediate saving.
      </Para>

      <SectionTitle>Save to Database</SectionTitle>
      <FieldRow label="SAVE POLICY"   desc="Creates a PolicyTemplate row in the database via POST /v1/policies/templates/. Requires a recommendation to be selected." note="company_id + branch_id scoped" />
      <FieldRow label="Policy Name"   desc="Auto-filled from the selected recommendation. Editable before saving." />
      <FieldRow label="Short Tag"     desc="8-character max identifier (e.g. CONS-FWD). Used for display and matching against system presets." />
      <FieldRow label="Status"        desc="DRAFT = editable; FINAL = immutable and eligible for company-wide publish." />

      <SectionTitle>Tips</SectionTitle>
      <TipRow type="TIP"  text="Each phase has a validation gate. Clicking Next without required fields shows an inline error bar — no data is lost." />
      <TipRow type="TIP"  text="All wizard state is kept in React state. Refreshing the page resets the wizard — save before navigating away." />
      <TipRow type="WARN" text="If your account has no company_id, the saved policy will be unscoped and may not appear in the Policy Library. Contact your admin." />
      <TipRow type="REG"  text="IFRS 9 §6.5.2 requires 80–125% effectiveness. The AI enforces forecast_ratio ≤ confirmed_ratio to qualify." />
    </div>
  );
}

function SavedHelp() {
  return (
    <div>
      <SectionTitle>Saved Policies — /saved-policies</SectionTitle>
      <Para>
        Your Saved Policies page shows all non-system PolicyTemplate records created by your company.
        Organised into three tabs: My Policies (your own), Branch Policies (same branch),
        and Company-wide (all branches).
      </Para>

      <SectionTitle>Card Fields</SectionTitle>
      <FieldRow label="NAME"        desc="Display name of the policy template. Editable via the Edit modal." />
      <FieldRow label="SHORT CODE"  desc="8-char identifier. Used to match against system presets when activating." />
      <FieldRow label="CATEGORY"    desc="CORPORATE | FINANCIAL | SOVEREIGN | SECTOR — determines which template group this belongs to." />
      <FieldRow label="RISK POSTURE" desc="CONSERVATIVE | MODERATE | AGGRESSIVE — hedge ratio profile." />
      <FieldRow label="CONF / FCST" desc="Hedge ratios: confirmed and forecast buckets as percentages (e.g. 85% / 60%)." />
      <FieldRow label="VERSION"     desc="Monotonically increasing. Incremented on every PATCH update." />
      <FieldRow label="STATUS"      desc="DRAFT = editable; FINAL = locked for publish." />
      <FieldRow label="ACTIVE"      desc="Cyan badge shown if this template is the currently active PolicyInstance." />

      <SectionTitle>Actions</SectionTitle>
      <FieldRow label="ACTIVATE"    desc="Sets this template as the active hedge policy for your company+branch. Deactivates any prior active policy." note="PATCH /v1/policies/activate" />
      <FieldRow label="DEACTIVATE"  desc="Removes the active policy, leaving no policy in place. Position desk will show unhedged exposure." note="POST /v1/policies/deactivate" />
      <FieldRow label="EDIT"        desc="Opens an inline edit modal to update name, description, hedge ratios, and cost assumptions." note="PATCH /v1/policies/templates/{id}" />
      <FieldRow label="DUPLICATE"   desc="Creates a copy of this template with '(Copy)' appended to the name. Useful for iterative refinement." note="POST /v1/policies/templates/{id}/duplicate" />
      <FieldRow label="DELETE"      desc="Permanently removes the template. Cannot delete system templates or currently active templates." note="DELETE /v1/policies/templates/{id}" />

      <SectionTitle>Tips</SectionTitle>
      <TipRow type="TIP"  text="Filter by My / Branch / Company tabs to narrow the list. Use the search bar to find policies by name or short code." />
      <TipRow type="WARN" text="You cannot delete a template that is currently active. Deactivate it first, then delete." />
      <TipRow type="WARN" text="System templates (seeded presets) cannot be edited or deleted — only activated. They are marked with a SYSTEM chip." />
      <TipRow type="REG"  text="Every activation creates an immutable PolicyRevision WORM record with SHA-256 chain hash (SEC 17a-4 / CFTC 1.31 compliant)." />
      <TipRow type="NOTE" text="Policy version numbers increment on every PATCH update. Version history is preserved in the PolicyRevision table." />
    </div>
  );
}

function MathHelp() {
  return (
    <div>
      <SectionTitle>Optimal Hedge Ratio (Johnson 1960, Ederington 1979)</SectionTitle>
      <Para>
        The minimum-variance hedge ratio H* minimises the variance of the hedged portfolio.
        It is the cornerstone of all ORDR hedge policy calibrations:
      </Para>
      <CodeBlock>
{`H* = ρ(ΔS, ΔF) · σ(ΔS) / σ(ΔF)

where:
  ΔS = change in spot rate
  ΔF = change in forward rate
  ρ  = Pearson correlation (typically 0.95–0.99 for major pairs)
  σ  = standard deviation of returns over the hedge tenor

Practical example (MXN/USD, 1-month):
  ρ = 0.97,  σ(ΔS) = 0.024,  σ(ΔF) = 0.025
  H* = 0.97 × 0.024 / 0.025 = 0.931  → hedge 93% of exposure`}
      </CodeBlock>

      <SectionTitle>Hedge Effectiveness (IFRS 9 §6.5.2)</SectionTitle>
      <Para>
        IFRS 9 requires an effectiveness ratio between 80% and 125% for hedge accounting
        qualification. The ORDR policy engine enforces this via the constraint:
        <code style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.amber }}> forecast_ratio ≤ confirmed_ratio</code>.
      </Para>
      <CodeBlock>
{`Effectiveness = (Change in FV of hedging instrument)
              / (Change in FV of hedged item)

Required:  0.80 ≤ Effectiveness ≤ 1.25

ORDR enforcement:
  - confirmed_ratio:   80% → 100%  (hard cap)
  - forecast_ratio:    ≤ confirmed_ratio (IFRS 9 §6.5.2 constraint)
  - If violated:       POLICY_INVALID — position cannot qualify for hedge accounting`}
      </CodeBlock>

      <SectionTitle>Basel III / FRTB VaR & Expected Shortfall</SectionTitle>
      <Para>
        Financial institution presets (BANK-STD, INS-ALM, PENSION-LDI, PROP-TRADING) calibrate
        their hedge floors to Basel III VaR and FRTB Expected Shortfall (ES):
      </Para>
      <CodeBlock>
{`VaR(α, T) = σ · z_α · √T · Notional

where:
  α   = confidence level (99% for Basel III)
  T   = holding period (10 trading days for Basel III)
  z_α = 2.326 at α=99%
  σ   = daily FX volatility

Expected Shortfall (FRTB MAR23 — supersedes VaR from 2025):
  ES = E[Loss | Loss > VaR(α)]
     = σ · √T · φ(z_α) / (1-α) · Notional

  φ(z_α) = standard normal PDF at z_α
  ES ≈ 1.34 × VaR(99%) for normal returns`}
      </CodeBlock>

      <SectionTitle>IMF ARA Reserve Adequacy (Sovereign Presets)</SectionTitle>
      <Para>
        Sovereign presets (SOVEREIGN-STANDARD, SOVEREIGN-BUFFER, SOVEREIGN-CRISIS) are calibrated
        using the IMF Assessing Reserve Adequacy (ARA) composite metric:
      </Para>
      <CodeBlock>
{`ARA_composite = w₁·STD + w₂·Portfol + w₃·M2 + w₄·Exports

Fixed exchange rate regime (SOVEREIGN-CRISIS weights):
  w₁ = 30%  (Short-term external debt)
  w₂ = 20%  (Portfolio liabilities)
  w₃ = 10%  (Broad money, M2)
  w₄ = 10%  (3 months of imports)

Guidotti–Greenspan rule (SOVEREIGN-STANDARD threshold):
  Reserves / Short-term external debt ≥ 1.0

ORDR implementation:
  min_trade_size_usd = ARA_metric × 0.05 × 1,000,000`}
      </CodeBlock>

      <SectionTitle>Sector Hedge Ratios (BIS FX Survey 2022)</SectionTitle>
      <CodeBlock>
{`Sector              Confirmed    Forecast   Instrument
─────────────────── ──────────── ────────── ──────────────────────
Airlines            70–90%       50–70%     Forwards + Fuel swaps
Technology          30–50%       20–30%     Options (cost cap)
Pharmaceuticals     60–80%       45–65%     Forwards (budget rate)
Mining / Resources  50–70%       35–50%     Collars (floor + cap)
Agriculture         75–90%       55–75%     Futures + Forwards
Shipping            60–75%       40–55%     NDF (non-deliverable)
Automotive          80–95%       65–80%     Forwards (natural hedge)`}
      </CodeBlock>

      <SectionTitle>Policy Formula Display</SectionTitle>
      <Para>
        Each system preset exposes a human-readable formula string visible on the preset card.
        Example for CONSERVATIVE TREASURY:
      </Para>
      <CodeBlock>
{`H = 0.85 × E_confirmed + 0.60 × E_forecast

where:
  H            = total hedge notional
  E_confirmed  = confirmed exposure (AP/AR with signed contracts)
  E_forecast   = forecast exposure (probabilistic, budgeted)

Execution product: FORWARD
Spread budget:     3.5 bps
Min trade size:    $50,000 USD equivalent`}
      </CodeBlock>

      <SectionTitle>Regulatory References</SectionTitle>
      <div style={{ marginBottom: 6 }}>
        {[
          ["IFRS 9 §6.5",      "Hedge accounting qualification, effectiveness testing, forecast ratio constraint"],
          ["BCBS FRTB MAR23",  "Market risk capital — Expected Shortfall replaces VaR for trading book"],
          ["ISDA 2002/2022",   "Master Agreement governing OTC derivative contracts (forwards, swaps, options)"],
          ["BIS FX Survey",    "Triennial Central Bank Survey — empirical turnover and hedging data by sector"],
          ["SEC 17a-4",        "Broker-dealer records retention — WORM storage, 6-year minimum retention"],
          ["CFTC 1.31",        "Commodity/derivatives records retention — hash-chained audit trail"],
        ].map(([ref, desc]) => (
          <FieldRow key={ref} label={ref} desc={desc} />
        ))}
      </div>

      <TipRow type="REG"  text="All PolicyRevision records are WORM-protected, hash-chained, and retained indefinitely (SEC 17a-4 / CFTC 1.31)." />
      <TipRow type="NOTE" text="Whitepaper: FX Hedge Policy Framework v1.0 — available at /docs/whitepapers/fx-hedge-policy-framework.md" />
    </div>
  );
}

// ── Main panel component ──────────────────────────────────────────────────────

export interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * @deprecated Use HelpPanel from @/components/layout/HelpPanel with policy-specific
 * HelpPanelConfig from @/lib/helpContent instead.
 * This slide-over component is kept for backwards compatibility only.
 */
export default function PolicyHelpPanel({ open, onClose }: HelpPanelProps) {
  const [activeSection, setActiveSection] = useState<HelpSection>("library");

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 9998,
          }}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        style={{
          position:   "fixed",
          top:        0,
          right:      0,
          bottom:     0,
          width:      520,
          maxWidth:   "92vw",
          background: S.bgPanel,
          borderLeft: `1px solid ${S.border}`,
          zIndex:     9999,
          transform:  open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
          display:    "flex",
          flexDirection: "column",
          overflowY:  "hidden",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Policy Engine Help"
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: `1px solid ${S.border}`, flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.12em",
              color: S.cyan, fontWeight: 700, textTransform: "uppercase",
            }}>
              POLICY ENGINE · HELP
            </div>
            <div style={{
              fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.textSecondary, marginTop: 2,
            }}>
              Institutional FX Hedge Policy Framework
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: S.textTertiary, fontFamily: S.fontMono, fontSize: "1rem", lineHeight: 1,
              padding: "2px 6px",
            }}
            aria-label="Close help"
          >×</button>
        </div>

        {/* Section tab bar */}
        <div style={{
          display: "flex", flexShrink: 0,
          borderBottom: `1px solid ${S.border}`, background: S.bgSub,
        }}>
          {SECTION_TABS.map(tab => {
            const active = activeSection === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSection(tab.key)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontFamily: S.fontMono, fontSize: "0.5625rem",
                  letterSpacing: "0.06em", fontWeight: active ? 700 : 400,
                  color: active ? S.cyan : S.textTertiary,
                  background: active ? S.bgPanel : "transparent",
                  border: "none",
                  borderBottom: active ? `2px solid ${S.cyan}` : "2px solid transparent",
                  cursor: "pointer", transition: "all 0.1s",
                }}
              >
                {tab.label.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
          {activeSection === "library" && <LibraryHelp />}
          {activeSection === "wizard"  && <WizardHelp />}
          {activeSection === "saved"   && <SavedHelp />}
          {activeSection === "math"    && <MathHelp />}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, padding: "8px 16px",
          borderTop: `1px solid ${S.border}`,
          fontFamily: S.fontMono, fontSize: "0.5625rem",
          color: S.textTertiary, letterSpacing: "0.06em",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>ORDR · Policy Engine · Institutional Grade</span>
          <span style={{ color: S.purple }}>IFRS 9 · BCBS FRTB · ISDA 2022</span>
        </div>
      </div>
    </>
  );
}
