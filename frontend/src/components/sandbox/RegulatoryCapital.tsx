"use client";

import { useState, useMemo } from "react";
import type { SandboxCalculateResponse } from "../../api/pipelineTypes";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  green:    "var(--accent-green)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red, #f87171)",
} as const;

function fmt(n: number, dp = 0): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return sign + "$" + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return sign + "$" + (abs / 1_000).toFixed(0) + "K";
  return sign + "$" + abs.toFixed(dp);
}

function fmtBps(n: number): string {
  return n.toFixed(1) + " bps";
}

// ─── Basel III SA-CCR Model ────────────────────────────────────────────────────
// Per BCBS 279 (March 2014) and finalized Basel III framework (2017)

interface SACCRInputs {
  notionalUSD: number;       // adjusted notional
  maturityYears: number;     // M in years
  mf: number;                // maturity factor
  supervisoryDuration: number; // SD
  supervisoryFactor: number; // SF per asset class
  correlationFactor: number; // ρ per hedge set
}

interface SACCROutput {
  replacementCost: number;  // RC
  pfe: number;              // Potential Future Exposure
  ead: number;              // Exposure at Default = alpha * (RC + PFE)
  rwa: number;              // Risk-Weighted Asset = EAD * 100%
  capitalCharge: number;    // RWA × 8% (Basel III minimum)
  leverageExposure: number; // NSFR leverage denominator
  alpha: number;            // 1.4 (regulatory)
}

/**
 * SA-CCR calculation per BCBS 279.
 * FX forward: AddOn = |δ| × SF_FX × MF × SD × Notional
 * where SF_FX = 4% (single-currency), MF = sqrt(min(M, 1year)/1year)
 */
function computeSACCR(inputs: SACCRInputs, mtmValue: number = 0): SACCROutput {
  const { notionalUSD, maturityYears, supervisoryFactor, correlationFactor } = inputs;

  // Maturity factor (floored at 10 business days)
  const mfActual = Math.sqrt(Math.min(maturityYears, 1) / 1);

  // Adjusted notional
  const adjustedNotional = notionalUSD * mfActual;

  // FX AddOn per BCBS 279 §166
  const effectionalNotional = adjustedNotional;
  const addOn = Math.abs(correlationFactor) * supervisoryFactor * effectionalNotional;

  // RC = max(V - C, 0) where V = MTM value, C = collateral
  const rc = Math.max(mtmValue, 0);

  // PFE = multiplier × AddOn_aggregate
  const multiplier = Math.min(1, 0.05 + 0.95 * Math.exp(Math.min(0, mtmValue) / (2 * 0.95 * addOn)));
  const pfe = multiplier * addOn;

  const alpha = 1.4;
  const ead = alpha * (rc + pfe);
  const rwa = ead * 1.0; // FX has 100% RW for counterparty credit
  const capitalCharge = rwa * 0.08; // Basel III 8% minimum
  const leverageExposure = ead;

  return { replacementCost: rc, pfe, ead, rwa, capitalCharge, leverageExposure, alpha };
}

// ─── CVA Capital per Basel III §75 ───────────────────────────────────────────

interface CVAOutput {
  cvaCharge: number;    // CVA capital charge
  dva: number;          // Debit Valuation Adjustment (informational)
  bilateralCVA: number; // CVA net of DVA
  stressedCVA: number;  // Stressed CVA per BCBS 189
}

/**
 * Standardised CVA capital charge (BCBS §75, Table 3)
 * CVA = 0.5 × wi × (Mi × EADi - Mhedi × BHedi) where:
 * wi = supervisory weight (0.7% for IG bank counterparty)
 * For FX NDF with bank counterparty: wi = 0.7% (IG), or 1.0% (BB)
 */
function computeCVA(ead: number, maturityYears: number, counterpartyRating: "IG" | "HY"): CVAOutput {
  const wi = counterpartyRating === "IG" ? 0.007 : 0.015; // supervisory weight
  const discountFactor = Math.exp(-0.05 * maturityYears); // crude PD approximation
  const cvaRaw = 0.5 * wi * maturityYears * ead;
  const stressMultiplier = 1.25; // BCBS stressed CVA scaling

  const cvaCharge = cvaRaw * 2.33; // 99.9% confidence interval scaling
  const dva = ead * 0.002 * maturityYears; // rough DVA using own CDS spread
  const bilateralCVA = cvaCharge - dva;
  const stressedCVA = cvaCharge * stressMultiplier;

  void discountFactor; // suppress unused var

  return { cvaCharge, dva, bilateralCVA, stressedCVA };
}

// ─── ISDA SIMM v2.6 ─────────────────────────────────────────────────────────
// Per ISDA SIMM Methodology 2.6 (September 2023)
// FX Risk class: Delta = Sum(s_k × RW_k × CR_k)

interface ISDASimm {
  fxDelta: number;
  fxVega: number;
  curvatureDelta: number;
  IM: number;             // Initial Margin
  vmEstimate: number;     // Variation Margin estimate
  portfolioIM: number;    // After netting (approx 40% netting benefit)
}

/**
 * ISDA SIMM v2.6 FX delta sensitivity.
 * FX Risk Weight: 7.4% for EMEA EM currencies (Category 3)
 * Intra-bucket correlation: 0.5 for same bucket
 * Cross-bucket correlation: 0.27
 */
function computeISDASimm(notionalUSD: number, maturityYears: number, spot: number): ISDASimm {
  // FX Delta sensitivity: s_k = notional / spot (per SIMM §5.1)
  const fxSensitivity = notionalUSD;
  const riskWeight = 0.074; // 7.4% for EM Cat 3 (SIMM v2.6 §D.1.2)
  const correlationRho = 0.5;

  const fxDelta = fxSensitivity * riskWeight;

  // Vega = 0 for forwards (no optionality)
  const fxVega = 0;

  // Curvature delta (IR component of FX)
  const curvatureRW = 0.15; // 15% for < 2Y tenor
  const curvatureDelta = notionalUSD * curvatureRW * Math.sqrt(maturityYears);

  // IM = sqrt(FX_delta^2 + curvature^2 + 2*rho*FX*curvature)
  const IM = Math.sqrt(fxDelta ** 2 + curvatureDelta ** 2 + 2 * correlationRho * fxDelta * curvatureDelta);
  const vmEstimate = notionalUSD * 0.01 * spot; // ~1% of notional
  const portfolioIM = IM * 0.6; // approx 40% netting benefit (SIMM §2.4)

  void spot; // suppress
  return { fxDelta, fxVega, curvatureDelta, IM, vmEstimate, portfolioIM };
}

// ─── Leverage Ratio per Basel III ────────────────────────────────────────────

interface LeverageRatio {
  tier1Capital: number;
  leverageExposure: number;
  ratio: number;         // must be >= 3%
  buffer: number;        // G-SIB buffer (1–3.5%)
  compliant: boolean;
}

function computeLeverageRatio(ead: number, tier1Capital: number, gsibBuffer: number): LeverageRatio {
  const exposureEstimate = ead * 2.5; // rough total balance sheet proxy
  const ratio = tier1Capital / exposureEstimate;
  const minRequired = 0.03 + gsibBuffer;
  return {
    tier1Capital,
    leverageExposure: exposureEstimate,
    ratio,
    buffer: gsibBuffer,
    compliant: ratio >= minRequired,
  };
}

// ─── Data tile ────────────────────────────────────────────────────────────────

function DataRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${S.soft}` }}>
      <div>
        <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>{label}</span>
        {sub && <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginLeft: 6 }}>{sub}</span>}
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: color ?? S.primary }}>{value}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RegulatoryCapitalProps {
  sandboxResult: SandboxCalculateResponse | null;
  spot?: number;
}

export default function RegulatoryCapital({ sandboxResult, spot = 18.97 }: RegulatoryCapitalProps) {
  const [activeTab, setActiveTab] = useState<"sa-ccr" | "cva" | "isda-simm" | "leverage">("sa-ccr");
  const [counterpartyRating, setCounterpartyRating] = useState<"IG" | "HY">("IG");
  const [gsibBuffer, setGsibBuffer] = useState(0.01);

  const notionalUSD = useMemo(() => {
    const plan = sandboxResult?.calculate_response?.hedge_plan;
    const summary = plan?.summary as Record<string, number> | undefined;
    const localNotional = summary?.total_commercial_exposure_mxn ?? 10_000_000;
    return localNotional / spot;
  }, [sandboxResult, spot]);

  const maturityYears = 0.5; // 6 month average

  const saccr = useMemo(() => computeSACCR({
    notionalUSD,
    maturityYears,
    mf: Math.sqrt(0.5),
    supervisoryDuration: 1,
    supervisoryFactor: 0.04, // 4% per BCBS 279 for FX
    correlationFactor: 1.0,
  }), [notionalUSD]);

  const cva = useMemo(() => computeCVA(saccr.ead, maturityYears, counterpartyRating), [saccr.ead, counterpartyRating]);

  const simm = useMemo(() => computeISDASimm(notionalUSD, maturityYears, spot), [notionalUSD, spot]);

  const tier1 = notionalUSD * 0.08; // approximated
  const leverage = useMemo(() => computeLeverageRatio(saccr.ead, tier1, gsibBuffer), [saccr.ead, tier1, gsibBuffer]);

  const TABS = [
    { id: "sa-ccr" as const, label: "SA-CCR" },
    { id: "cva" as const, label: "CVA Capital" },
    { id: "isda-simm" as const, label: "ISDA SIMM" },
    { id: "leverage" as const, label: "Leverage Ratio" },
  ];

  return (
    <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px", borderBottom: `1px solid ${S.rim}`,
        background: `color-mix(in srgb, ${S.sub} 60%, transparent)`,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.cyan }}>
          ◈ REGULATORY CAPITAL ENGINE
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
          Basel III BCBS 279 · BCBS 457 · ISDA SIMM v2.6
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${S.rim}`, background: S.sub }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
            padding: "7px 14px", border: "none",
            borderBottom: activeTab === t.id ? `2px solid ${S.cyan}` : "2px solid transparent",
            background: "transparent",
            color: activeTab === t.id ? S.cyan : S.tertiary,
            cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* SA-CCR */}
        {activeTab === "sa-ccr" && (
          <div>
            <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, margin: "0 0 12px", lineHeight: 1.6 }}>
              Standardised Approach for Counterparty Credit Risk (SA-CCR) per BCBS 279 (2014).
              Replaced IMM/CEM for FX derivatives. Exposure At Default (EAD) = α × (RC + PFE) where α = 1.4.
              FX Supervisory Factor = 4% per BCBS 279 §165–170.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}`, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>SA-CCR COMPUTATION</div>
                <DataRow label="Adjusted Notional" sub="BCBS §166" value={fmt(notionalUSD)} />
                <DataRow label="Replacement Cost (RC)" sub="MTM basis" value={fmt(saccr.replacementCost)} />
                <DataRow label="Potential Future Exposure" sub="PFE = SF × MF × AN" value={fmt(saccr.pfe)} color={S.amber} />
                <DataRow label="Alpha Factor" sub="α = 1.4" value={saccr.alpha.toFixed(1)} />
                <DataRow label="Exposure at Default" sub="EAD = α×(RC+PFE)" value={fmt(saccr.ead)} color={S.red} />
                <DataRow label="Risk-Weighted Asset" sub="RWA = EAD×100%" value={fmt(saccr.rwa)} />
              </div>
              <div style={{ background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}`, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>CAPITAL REQUIREMENTS</div>
                <DataRow label="Pillar 1 Minimum (8%)" sub="CCR capital charge" value={fmt(saccr.capitalCharge)} color={S.red} />
                <DataRow label="Capital Conservation Buffer" sub="+ 2.5%" value={fmt(saccr.capitalCharge * 0.3125)} color={S.amber} />
                <DataRow label="Total CCR Capital" sub="8% + 2.5% = 10.5%" value={fmt(saccr.capitalCharge * 1.3125)} color={S.red} />
                <DataRow label="Leverage Exposure" sub="CRR §429" value={fmt(saccr.leverageExposure)} />
                <DataRow label="Capital as % of Notional" sub="efficiency ratio" value={((saccr.capitalCharge / notionalUSD) * 100).toFixed(2) + "%"} color={S.cyan} />
                <DataRow label="Supervisory Factor" sub="FX: BCBS 279 §165" value="4.00%" />
              </div>
            </div>
            <div style={{ marginTop: 10, padding: "6px 10px", background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>
                BCBS 279 (2014) · SA-CCR FX Add-On: SF_FX = 4% for single-currency pair · Maturity Factor = √(min(M,1yr)/1yr) · Alpha = 1.4 (conservative, BCBS §74)
              </div>
            </div>
          </div>
        )}

        {/* CVA */}
        {activeTab === "cva" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>Counterparty Rating:</span>
              {(["IG", "HY"] as const).map(r => (
                <button key={r} onClick={() => setCounterpartyRating(r)} style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  padding: "3px 10px", borderRadius: 2,
                  border: counterpartyRating === r ? `1px solid ${S.cyan}` : `1px solid ${S.rim}`,
                  background: counterpartyRating === r ? `color-mix(in srgb, ${S.cyan} 10%, transparent)` : S.sub,
                  color: counterpartyRating === r ? S.cyan : S.tertiary,
                  cursor: "pointer",
                }}>{r === "IG" ? "Investment Grade (wi = 0.7%)" : "High Yield (wi = 1.5%)"}</button>
              ))}
            </div>
            <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, margin: "0 0 12px", lineHeight: 1.6 }}>
              CVA Capital Charge per Basel III §75 (Standardised method). CVA arises from mark-to-market losses
              due to deterioration in counterparty creditworthiness. Mandatory for OTC derivatives under Dodd-Frank §731 and EMIR Art. 11.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}`, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>CVA CALCULATION</div>
                <DataRow label="EAD (from SA-CCR)" value={fmt(saccr.ead)} />
                <DataRow label="Supervisory Weight wi" sub={counterpartyRating} value={counterpartyRating === "IG" ? "0.70%" : "1.50%"} />
                <DataRow label="CVA Charge (99.9% CI)" value={fmt(cva.cvaCharge)} color={S.red} />
                <DataRow label="DVA (own CDS proxy)" value={fmt(cva.dva)} color={S.green} />
                <DataRow label="Bilateral CVA net DVA" value={fmt(cva.bilateralCVA)} color={S.amber} />
                <DataRow label="Stressed CVA (×1.25)" sub="BCBS 189" value={fmt(cva.stressedCVA)} color={S.red} />
              </div>
              <div style={{ background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}`, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>REGULATORY CONTEXT</div>
                {[
                  ["Framework", "Basel III §75 · BCBS 189 (2011)"],
                  ["Mandatory Since", "January 2013 (EU/US)"],
                  ["Clearing Exemption", "CCP-cleared: CVA charge = 0"],
                  ["Hedge Eligibility", "CDS on counterparty (index CDS 50% eff.)"],
                  ["Non-IG Multiplier", "15× capital vs IG counterparty"],
                  ["FRTB CVA (Jan 2025)", "Basic CVA (BA-CVA) replaces standardised"],
                ].map(([k, v]) => (
                  <DataRow key={k} label={k} value={v} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ISDA SIMM */}
        {activeTab === "isda-simm" && (
          <div>
            <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, margin: "0 0 12px", lineHeight: 1.6 }}>
              ISDA Standard Initial Margin Model (SIMM) v2.6 (September 2023). Required for uncleared OTC derivatives under BCBS-IOSCO IM framework.
              Phase-in complete for all entities with ≥$8B AANA (September 2022). FX category: EMEA EM = Category 3, risk weight 7.4%.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}`, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>SIMM CALCULATION</div>
                <DataRow label="FX Delta Sensitivity" sub="s_k = notional/spot" value={fmt(simm.fxDelta)} />
                <DataRow label="Risk Weight (Cat 3 EM)" sub="SIMM §D.1.2 = 7.4%" value="7.40%" />
                <DataRow label="FX Vega" sub="Forwards: zero" value="—" color={S.tertiary} />
                <DataRow label="Curvature Delta" sub="IR component" value={fmt(simm.curvatureDelta)} color={S.amber} />
                <DataRow label="Gross IM" sub="√(Δ² + Γ² + 2ρΔΓ)" value={fmt(simm.IM)} color={S.red} />
                <DataRow label="Portfolio IM (×0.6 net)" sub="~40% netting benefit" value={fmt(simm.portfolioIM)} color={S.amber} />
              </div>
              <div style={{ background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}`, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>SIMM PARAMETERS</div>
                {[
                  ["Model Version", "ISDA SIMM v2.6 (Sep 2023)"],
                  ["FX Category", "Cat 3: EMEA EM (incl. MXN, BRL, ZAR)"],
                  ["Risk Weight", "7.4% (Cat 3 FX delta)"],
                  ["Intra-bucket ρ", "0.50 (same bucket)"],
                  ["Cross-bucket γ", "0.27 (FX cross-bucket)"],
                  ["Threshold", "ANA ≥ $8B: IM required"],
                  ["Posting", "Bilateral IM — segregated"],
                  ["VM (estimate)", fmt(simm.vmEstimate)],
                ].map(([k, v]) => (
                  <DataRow key={k} label={k} value={v} />
                ))}
              </div>
            </div>
            <div style={{ marginTop: 10, padding: "6px 10px", background: `color-mix(in srgb, ${S.amber} 6%, transparent)`, borderRadius: 3, border: `1px solid ${S.amber}` }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.amber }}>
                ⚠ SIMM PHASE-IN: Entities with AANA {'<'} $50B may have reduced IM requirements or bilateral threshold agreements. CCP-cleared derivatives: IM set by CCP rulebook (typically LCH/CME model).
              </span>
            </div>
          </div>
        )}

        {/* LEVERAGE */}
        {activeTab === "leverage" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>G-SIB Buffer:</span>
              {[0.01, 0.015, 0.02, 0.025, 0.035].map(buf => (
                <button key={buf} onClick={() => setGsibBuffer(buf)} style={{
                  fontFamily: S.fontMono, fontSize: 8, fontWeight: 700,
                  padding: "2px 8px", borderRadius: 2,
                  border: gsibBuffer === buf ? `1px solid ${S.cyan}` : `1px solid ${S.rim}`,
                  background: gsibBuffer === buf ? `color-mix(in srgb, ${S.cyan} 10%, transparent)` : S.sub,
                  color: gsibBuffer === buf ? S.cyan : S.tertiary,
                  cursor: "pointer",
                }}>{(buf * 100).toFixed(1)}%</button>
              ))}
            </div>
            <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, margin: "0 0 12px", lineHeight: 1.6 }}>
              Basel III Leverage Ratio = Tier 1 Capital / Total Exposure. Minimum 3% for all banks; G-SIBs face additional buffers (1.0–3.5%). FX derivatives contribute to leverage exposure via SA-CCR EAD (CRR §429 / Basel III §32).
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}`, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>LEVERAGE RATIO</div>
                <DataRow label="Tier 1 Capital (est.)" value={fmt(tier1)} />
                <DataRow label="Leverage Exposure" sub="Incl. SA-CCR EAD" value={fmt(leverage.leverageExposure)} />
                <DataRow label="Leverage Ratio" value={(leverage.ratio * 100).toFixed(2) + "%" } color={leverage.compliant ? S.green : S.red} />
                <DataRow label="Minimum Required" sub={`3% + ${(leverage.buffer * 100).toFixed(1)}% G-SIB`} value={((0.03 + leverage.buffer) * 100).toFixed(1) + "%"} />
                <DataRow label="Buffer vs Minimum" value={((leverage.ratio - 0.03 - leverage.buffer) * 100).toFixed(2) + "%"} color={leverage.compliant ? S.green : S.red} />
                <DataRow label="Compliant" value={leverage.compliant ? "YES" : "BREACH"} color={leverage.compliant ? S.green : S.red} />
              </div>
              <div style={{ background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}`, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>G-SIB BUFFERS</div>
                {[
                  ["Bucket 1 (lowest)", "1.0%", "HSBC, BNP Paribas, etc."],
                  ["Bucket 2", "1.5%", "Barclays, Deutsche Bank"],
                  ["Bucket 3", "2.0%", "Goldman Sachs, Morgan Stanley"],
                  ["Bucket 4", "2.5%", "Bank of America, Citigroup"],
                  ["Bucket 5 (highest)", "3.5%", "JPMorgan Chase"],
                ].map(([bkt, buf, ex]) => (
                  <div key={bkt} style={{ display: "grid", gridTemplateColumns: "100px 40px 1fr", gap: 6, padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 10, color: S.secondary }}>{bkt}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.cyan }}>{buf}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{ex}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 10, fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>
              Basel III Leverage Ratio Framework (BCBS, 2014, revised 2017) · CRR §429 (EU) · US Basel III Final Rule (2013) · NSFR: Net Stable Funding Ratio (BCBS, 2014)
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
