"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Printer, Globe } from "lucide-react"
import HelpPanel from "@/components/layout/HelpPanel";
import { HEDGEWIKI_HELP } from "@/lib/helpContent";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";

import { PageShell } from "@/components/layout/PageShell";

// ── Hydration-safe timestamp hook ─────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  pass:     "var(--status-pass)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

// ─── knowledge graph data ─────────────────────────────────────────────────────

type EntryId =
  | "ndf" | "fxswap" | "vanilla-option" | "ccs"
  | "isda-netting" | "csa" | "master-confirm"
  | "ifrs9-eff" | "ifrs9-cfh" | "fvh" | "ias39"
  | "asc815-20" | "asc815-30"
  | "hedge-ratio-policy" | "bucket-mode" | "min-trade"
  | "hc-exposure-model" | "hc-netting" | "hc-bucketing" | "hc-ladder" | "hc-runevelope"
  | "r1-directional" | "r2-volatility" | "r3-convexity" | "r4-carry"
  | "r5-concentration" | "r6-credit" | "r7-liquidity" | "r8-tail";

interface Entry {
  id: EntryId;
  title: string;
  version: string;
  updated: string;
  category: string;
  status: "STABLE" | "DRAFT" | "DEPRECATED" | "REVIEW";
  abstract: string;
  citations: string[];
  linkedIds: EntryId[];
  hedgecoreField?: string;
  auditNote?: string;
}

const ENTRIES: Record<EntryId, Entry> = {
  // ── FX Instruments ──────────────────────────────────────────────────────────
  "ndf": {
    id: "ndf", title: "Non-Deliverable Forward (NDF)", version: "v2.3", updated: "2026-01-15",
    category: "FX INSTRUMENTS", status: "STABLE",
    abstract: "A cash-settled forward contract used to hedge or speculate on currencies where exchange controls prevent physical delivery. At maturity, the settlement amount equals the notional × (contracted forward rate − fixing rate), paid in USD. The MXN/USD NDF fixing is published by Banxico at 12:00 Mexico City time (T+2). Widely used for MXN, BRL, KRW, CNY, INR, TWD, CLP exposure management.",
    citations: ["ISDA 2006 Definitions §1.34", "BIS Triennial Survey 2022 §2.4", "Banxico Circular 10/2014", "FX Global Code 2021 Principle 9"],
    linkedIds: ["isda-netting", "csa", "hc-ladder"],
    hedgecoreField: "execution_product = NDF_VANILLA",
    auditNote: "NDF settlement rate source must match Banxico official fix for IFRS 9 effectiveness testing.",
  },
  "fxswap": {
    id: "fxswap", title: "FX Swap", version: "v1.8", updated: "2026-01-10",
    category: "FX INSTRUMENTS", status: "STABLE",
    abstract: "Simultaneous spot sale and forward repurchase (or vice versa) of one currency for another. The near leg settles spot (T+2); the far leg settles at a negotiated forward date. Used to roll existing forward hedges or to manage short-term liquidity gaps. No directional FX exposure on a net basis; economic effect is a collateralised borrowing in one currency against another. Forward points are the sole P&L driver.",
    citations: ["ISDA 2006 Definitions §1.44", "FX Global Code 2021 Principle 8", "BIS 2023 FX Turnover Report"],
    linkedIds: ["ndf", "csa", "hc-netting"],
    hedgecoreField: "execution_product = FX_SWAP (pending)",
    auditNote: "FX swaps must be documented as hedging instruments under IFRS 9.6.2.2 for hedge accounting treatment.",
  },
  "vanilla-option": {
    id: "vanilla-option", title: "Vanilla FX Option (European)", version: "v1.5", updated: "2025-12-20",
    category: "FX INSTRUMENTS", status: "STABLE",
    abstract: "European-style put or call granting the holder the right—not obligation—to exchange a specified notional at a predetermined strike on a single expiry date. Premium is paid upfront. For an MXN hedger, a USD call / MXN put protects against MXN depreciation above the strike. Garman-Kohlhagen (1983) is the standard pricing model; implied volatility surfaces are sourced from broker-dealer screens or Bloomberg BVOL. The option's hedge ratio (delta) must be used when designating a portion of the option as a hedging instrument under IFRS 9.",
    citations: ["Garman & Kohlhagen (1983) JFE", "ISDA 2006 Definitions §7.1", "IFRS 9.B6.5.15 (option intrinsic value)", "ASC 815-20-25-82"],
    linkedIds: ["ndf", "ifrs9-cfh", "asc815-20"],
    hedgecoreField: "execution_product = VANILLA_OPTION (pending)",
    auditNote: "Time value of options excluded from hedging relationship under IFRS 9.6.5.15 and recycled to OCI.",
  },
  "ccs": {
    id: "ccs", title: "Cross-Currency Swap (CCS)", version: "v1.2", updated: "2025-11-30",
    category: "FX INSTRUMENTS", status: "STABLE",
    abstract: "Agreement to exchange principal and floating or fixed interest payments in two currencies over a specified term, with re-exchange of principal at maturity at the original spot rate. Used to hedge long-dated FX risk embedded in foreign currency bonds or intercompany loans. Unlike an interest rate swap, CCS involves physical exchange of notional at inception and maturity. Regulatory capital treatment under SA-CCR applies. Basis risk (cross-currency basis spread) creates residual P&L volatility.",
    citations: ["ISDA 2006 Definitions §5.2", "Basel III SA-CCR §3.4", "IFRS 9.6.5.11 (net investment hedge)", "FX Global Code Principle 15"],
    linkedIds: ["isda-netting", "csa", "fvh"],
    hedgecoreField: "execution_product = CCS (pending)",
    auditNote: "CCS designated as net investment hedge — see IAS 21.32 and IFRS 9.6.5.13 for treatment.",
  },

  // ── ISDA ────────────────────────────────────────────────────────────────────
  "isda-netting": {
    id: "isda-netting", title: "Close-Out Netting (ISDA 2002)", version: "v3.0", updated: "2026-01-08",
    category: "ISDA FRAMEWORK", status: "STABLE",
    abstract: "A legally enforceable mechanism whereby, upon an Event of Default or Termination Event under the ISDA Master Agreement, all outstanding transactions are terminated simultaneously and their replacement values netted to a single sum owed by one party to the other. Netting enforceability is jurisdictionally dependent; ISDA publishes netting opinions for 70+ jurisdictions. Close-out netting is the foundation for regulatory capital relief under Basel III CRE52 and the basis for bilateral and cleared margin calculations. HedgeCore audit trails must reference the governing ISDA MA for each counterparty.",
    citations: ["ISDA 2002 Master Agreement §6(e)", "BCBS CRE52.8–52.12", "ISDA 2024 Netting Opinion: Mexico", "EU EMIR Art. 11.3"],
    linkedIds: ["csa", "master-confirm", "ndf"],
    hedgecoreField: "counterparty.isda_version = 2002",
    auditNote: "Netting opinion must be on file and dated within 12 months of each counterparty trade.",
  },
  "csa": {
    id: "csa", title: "Credit Support Annex (CSA / VM CSA)", version: "v2.5", updated: "2025-12-15",
    category: "ISDA FRAMEWORK", status: "STABLE",
    abstract: "The CSA (or, post-UMR, the VM CSA under the 2016 ISDA Credit Support Annex for Variation Margin) governs bilateral collateral posting between counterparties. Key parameters: eligible collateral (typically cash in major currencies), threshold, minimum transfer amount, independent amount / initial margin, and interest rate on posted collateral. The CSA directly determines the Funding Valuation Adjustment (FVA) and the OIS discounting curve applied to bilateral derivatives. For HedgeCore purposes, the CSA type (one-way / two-way) and threshold determine which trades are margined and the resulting collateral call schedule.",
    citations: ["ISDA 1994 CSA (New York Law)", "ISDA 2016 VM CSA §11(d)", "BCBS-IOSCO UMR Phase 6 (2022)", "IFRS 13.48 (CVA/DVA guidance)"],
    linkedIds: ["isda-netting", "ndf", "ccs"],
    hedgecoreField: "counterparty.csa_type = TWO_WAY | ONE_WAY",
    auditNote: "VM CSA is mandatory for counterparties with ADV > €750bn (UMR Phase 1). Verify applicability per counterparty.",
  },
  "master-confirm": {
    id: "master-confirm", title: "Master Confirmation Agreement (MCA)", version: "v1.1", updated: "2025-10-05",
    category: "ISDA FRAMEWORK", status: "STABLE",
    abstract: "A template confirmation that governs the standard economic terms for a class of transactions (e.g., MXN NDF, G10 FX forwards). Supplements the ISDA Master Agreement by pre-agreeing fixing sources, settlement conventions, and fallback rates. Reduces per-trade confirmation burden and legal risk. For NDF trades, the MCA typically specifies the Banxico rate as fixing source and T+2 MXN settlement. EMTA NDF templates apply for certain EM pairs.",
    citations: ["ISDA 2004 NDF Master Confirmation", "EMTA NDF Template 2014", "FX Global Code §3.2"],
    linkedIds: ["isda-netting", "ndf"],
    auditNote: "MCA date must pre-date first NDF trade. HedgeCore counterparty record should store MCA execution date.",
  },

  // ── IFRS 9 ──────────────────────────────────────────────────────────────────
  "ifrs9-eff": {
    id: "ifrs9-eff", title: "Hedge Effectiveness (IFRS 9 §6.4)", version: "v2.1", updated: "2026-01-20",
    category: "IFRS 9 STANDARD", status: "STABLE",
    abstract: "Under IFRS 9.6.4.1, a hedging relationship qualifies if three criteria are met: (1) an economic relationship exists between the hedged item and hedging instrument; (2) the effect of credit risk does not dominate the value changes; (3) the hedge ratio reflects quantities actually used. Retrospective effectiveness testing (80–125% bright-line) is abolished; prospective qualitative assessment suffices unless the hedging relationship becomes ineffective. Ineffectiveness must be measured and recognised in P&L. The dollar-offset method and regression analysis are acceptable prospective methods. HedgeCore generates the effectiveness test output for each designated hedge relationship.",
    citations: ["IFRS 9.6.4.1 (a–c)", "IASB Educational Material 2014 §18", "KPMG IFRS 9 Practical Guide 2023 §7.3", "IFRS 9.B6.4.1–B6.4.11"],
    linkedIds: ["ifrs9-cfh", "fvh", "ndf"],
    hedgecoreField: "hedge.effectiveness_test = QUALITATIVE | REGRESSION",
    auditNote: "Effectiveness documentation must be contemporaneous with hedge designation. HedgeCore generates this as part of the Generate Hedge Plan output.",
  },
  "ifrs9-cfh": {
    id: "ifrs9-cfh", title: "Cash Flow Hedge Accounting (IFRS 9 §6.5)", version: "v2.0", updated: "2025-12-01",
    category: "IFRS 9 STANDARD", status: "STABLE",
    abstract: "The effective portion of gains and losses on a designated cash flow hedging instrument is recognised in Other Comprehensive Income (OCI) and accumulated in the Cash Flow Hedge Reserve (CFHR) in equity. The reserve is reclassified to profit or loss when the hedged forecast transaction affects P&L (matching principle). Ineffective portions are immediately expensed. Time value of options and forward element of forwards may be separately accounted for under IFRS 9.6.5.15–6.5.16, with aligned / unaligned designation options. For MXN NDF hedges of forecast export receivables, the aligned time value approach is most common.",
    citations: ["IFRS 9.6.5.1–6.5.16", "IAS 1.90–96 (OCI presentation)", "IFRS 9.B6.5.1–B6.5.28", "PwC Illustrative Disclosures 2023 §HFX"],
    linkedIds: ["ifrs9-eff", "ndf", "hc-exposure-model"],
    hedgecoreField: "hedge.accounting_model = CASH_FLOW_HEDGE",
    auditNote: "CFHR roll-forward reconciliation required at each reporting date. HedgeCore audit trail supports this.",
  },
  "fvh": {
    id: "fvh", title: "Fair Value Hedge Accounting (IFRS 9 §6.5.8)", version: "v1.4", updated: "2025-09-15",
    category: "IFRS 9 STANDARD", status: "STABLE",
    abstract: "Gains and losses on both the hedged item and the hedging instrument are recognised in P&L. Used when hedging the FX risk of a recognised foreign currency monetary item (e.g., USD receivable on balance sheet). Unlike cash flow hedges, there is no OCI deferral — both legs go to P&L each period, which can create volatility if timing differs. The hedged item is adjusted for changes in fair value attributable to the hedged risk (basis adjustment). FVH is less common for MXN exporters who typically hedge forecast cash flows.",
    citations: ["IFRS 9.6.5.8–6.5.10", "IFRS 9.B6.5.7–B6.5.16", "Deloitte Hedging Under IFRS 9 2022 §4"],
    linkedIds: ["ifrs9-eff", "ccs"],
    hedgecoreField: "hedge.accounting_model = FAIR_VALUE_HEDGE (pending)",
    auditNote: "Basis adjustment on hedged item must be tracked separately. HedgeCore ledger support pending.",
  },
  "ias39": {
    id: "ias39", title: "IAS 39 Legacy Reference", version: "v1.0", updated: "2024-06-01",
    category: "IFRS 9 STANDARD", status: "DEPRECATED",
    abstract: "IAS 39 was superseded by IFRS 9 for annual periods beginning on or after 1 January 2018. The 80–125% bright-line effectiveness test and the highly effective prospective requirement under IAS 39.88 no longer apply under IFRS 9. Retained here for historical audit trail reference. Some entities grandfathered IAS 39 fair value hedge macro relationships pending IASB macro hedging project conclusion.",
    citations: ["IAS 39.88–102", "IFRS 9 Transition Guidance §7.2.1", "IASB Macro Hedge Discussion Paper 2014"],
    linkedIds: ["ifrs9-eff"],
    auditNote: "No new designations under IAS 39. Superseded by IFRS 9.",
  },

  // ── ASC 815 ─────────────────────────────────────────────────────────────────
  "asc815-20": {
    id: "asc815-20", title: "ASC 815-20 Designation & Documentation", version: "v1.6", updated: "2025-11-01",
    category: "ASC 815 (US GAAP)", status: "STABLE",
    abstract: "ASC 815-20-25 requires formal designation and documentation at hedge inception, including: the risk management objective, the hedged item, the hedging instrument, the nature of the risk being hedged, and the method for assessing effectiveness. Under ASU 2017-12, qualitative effectiveness assessment is permitted for highly effective relationships, and the cumulative-fair-value catch-up method is eliminated. For FX cash flow hedges of forecasted transactions, documentation must specify that the hedged transaction is probable. Long-haul method vs. shortcut method (for interest rate swaps only) distinction is important.",
    citations: ["ASC 815-20-25-1 through 25-135", "ASU 2017-12 §2 (simplification)", "FASB Staff Q&A 815-20 (2022)", "PwC FX Hedging under US GAAP 2023"],
    linkedIds: ["asc815-30", "vanilla-option"],
    hedgecoreField: "hedge.gaap_framework = ASC_815 (pending)",
    auditNote: "Hedge designation documentation generated by HedgeCore must be filed on trade date, prior to effectiveness assessment.",
  },
  "asc815-30": {
    id: "asc815-30", title: "ASC 815-30 Cash Flow Hedges (US GAAP)", version: "v1.3", updated: "2025-11-01",
    category: "ASC 815 (US GAAP)", status: "STABLE",
    abstract: "Effective portion of a cash flow hedge is recorded in Accumulated Other Comprehensive Income (AOCI) and reclassified to earnings when the hedged forecasted transaction affects P&L. The total change in fair value of the hedging derivative is split into (1) effective portion → AOCI; (2) excluded component (if any) → systematic and rational amortisation to earnings per ASU 2017-12. Ineffective portion is immediately expensed. Reclassification adjustment disclosures required at each period end. Discontinuation rules apply if hedged transaction is no longer probable.",
    citations: ["ASC 815-30-35", "ASU 2017-12 §4.4 (excluded components)", "SEC Staff Bulletin SAB Topic 11.C", "EY Financial Reporting Developments 2023 §5"],
    linkedIds: ["asc815-20", "ifrs9-cfh"],
    hedgecoreField: "hedge.gaap_framework = ASC_815 (pending)",
    auditNote: "AOCI roll-forward and reclassification disclosures required in interim and annual filings.",
  },

  // ── Policy ──────────────────────────────────────────────────────────────────
  "hedge-ratio-policy": {
    id: "hedge-ratio-policy", title: "Hedge Ratio Policy Template", version: "v3.2", updated: "2026-01-10",
    category: "POLICY TEMPLATES", status: "STABLE",
    abstract: "Institutional template encoding hedge ratios by trade status. Confirmed AR/AP positions: 80% NDF vanilla, max 12 months. Forecast positions: 50% NDF vanilla, max 6 months. Policy ratios are reviewed quarterly by the Treasury Committee and encoded in HedgeCore as `policy.hedge_ratios.confirmed` and `policy.hedge_ratios.forecast`. The policy must reference the underlying IFRS 9 effectiveness justification. Minimum trade size USD 500,000. Counterparty must maintain ISDA 2002 MA + two-way VM CSA.",
    citations: ["IFRS 9.6.4.1(c) (hedge ratio)", "Treasury Committee Resolution 2024-Q3", "HedgeCore Policy Engine v1.0"],
    linkedIds: ["ndf", "ifrs9-eff", "csa", "bucket-mode"],
    hedgecoreField: "policy.hedge_ratios · policy.execution_product",
    auditNote: "Policy version and approval date must match HedgeCore policy configuration. Version mismatch is an integrity exception.",
  },
  "bucket-mode": {
    id: "bucket-mode", title: "Tenor Bucketing Convention", version: "v1.1", updated: "2025-12-10",
    category: "POLICY TEMPLATES", status: "STABLE",
    abstract: "Exposures are grouped by value date month into tenor buckets. The bucketing mode (`BY_VALUE_DATE_MONTH`) assigns each trade to the month of its value_date field. Forward points are applied per bucket using the market snapshot's `forward_points_by_month` curve. Buckets with net exposure below minimum trade size are aggregated to the nearest subsequent bucket. The hedge ladder is generated bucket-by-bucket. Bucket mode is a configurable policy parameter in HedgeCore and must match the IFRS 9 hedge documentation which specifies the hedged time period.",
    citations: ["HedgeCore API §policy.bucket_mode", "IFRS 9.6.5.4 (hedged time period)"],
    linkedIds: ["hedge-ratio-policy", "hc-bucketing", "hc-ladder"],
    hedgecoreField: "policy.bucket_mode = BY_VALUE_DATE_MONTH",
    auditNote: "Bucket assignments are deterministic given frozen market snapshot. Replay with same snapshot must produce identical bucketing.",
  },
  "min-trade": {
    id: "min-trade", title: "Minimum Trade Size", version: "v1.0", updated: "2025-06-01",
    category: "POLICY TEMPLATES", status: "STABLE",
    abstract: "The minimum notional below which individual hedge trades are not executed and instead aggregated into the next valid bucket. Currently set to USD 500,000 equivalent. Residuals below USD 100,000 are written off as unhedgeable tail. This parameter prevents operational overhead from sub-economic trades and avoids broker minimum size violations. It is encoded as `policy.min_trade_size_usd` and enforced by the HedgeCore ladder generator.",
    citations: ["Treasury Committee Policy 2024-Q3 §3.1", "HedgeCore API §policy.min_trade_size_usd"],
    linkedIds: ["bucket-mode", "hc-ladder"],
    hedgecoreField: "policy.min_trade_size_usd = 500000",
    auditNote: "Sub-minimum residuals must be documented in the hedge plan and approved by the Treasury Operations desk.",
  },

  // ── HedgeCore Architecture ──────────────────────────────────────────────────
  "hc-exposure-model": {
    id: "hc-exposure-model", title: "HedgeCore Exposure Data Model", version: "v2.0", updated: "2026-02-01",
    category: "HEDGECORE ARCHITECTURE", status: "STABLE",
    abstract: "Each trade in HedgeCore is a `TradeRow` with: `record_id` (unique), `entity`, `currency`, `type` (AR|AP), `amount` (MXN equivalent), `value_date` (ISO 8601), `status` (CONFIRMED|FORECAST), and optional `counterparty`. The exposure ledger is the canonical input to the netting engine. All amounts are stored in MXN equivalent using the spot rate at snapshot time. Multi-currency exposures are converted at the snapshot spot rate and flagged in the `currency` field. The model is immutable once frozen into a market snapshot — subsequent edits create a new snapshot version.",
    citations: ["HedgeCore API §TradeRow", "IAS 21.23 (functional currency translation)", "IFRS 9.B6.3.2 (hedged item identification)"],
    linkedIds: ["hc-netting", "ifrs9-cfh"],
    hedgecoreField: "TradeRow · /api/v1/pipeline/inputs",
    auditNote: "Trade record integrity verified by SHA-256 hash of the frozen input set. Hash stored in market_hash field of MarketSnapshot.",
  },
  "hc-netting": {
    id: "hc-netting", title: "HedgeCore Netting Engine", version: "v1.4", updated: "2026-02-01",
    category: "HEDGECORE ARCHITECTURE", status: "STABLE",
    abstract: "The netting engine aggregates all AR positions (long USD) against AP positions (short USD) by currency and tenor bucket to produce a net exposure per bucket. Confirmed and forecast positions are netted separately before applying the respective hedge ratios. The netting is deterministic and reproducible given a frozen market snapshot. Portfolio netting across entities is configurable via the `entity_netting` flag in the policy config. Legal enforceability of entity netting must be confirmed by legal counsel if the entity set includes different legal jurisdictions.",
    citations: ["HedgeCore API §/pipeline/run", "IFRS 9.B6.6.1 (hedged item — net position)", "BIS Working Paper 2018 §3 (netting conventions)"],
    linkedIds: ["hc-exposure-model", "hc-bucketing"],
    hedgecoreField: "policy.entity_netting_enabled · FrozenInputs.net_exposures",
    auditNote: "Netting output must be regenerable from the same frozen snapshot hash. Audit trail captures snapshot_hash and engine version.",
  },
  "hc-bucketing": {
    id: "hc-bucketing", title: "HedgeCore Bucketing Algorithm", version: "v1.2", updated: "2026-02-01",
    category: "HEDGECORE ARCHITECTURE", status: "STABLE",
    abstract: "After netting, the engine assigns each net exposure to a tenor bucket by value_date month. Forward points for each bucket are read from the market snapshot's `forward_points_by_month` dictionary (keyed by YYYY-MM). Buckets with net exposure below `min_trade_size_usd` are aggregated to the next bucket. Empty buckets are skipped. The algorithm is O(n·b) where n is number of trades and b is number of buckets. Determinism is guaranteed by the frozen snapshot — same inputs always produce the same bucket assignment.",
    citations: ["HedgeCore API §policy.bucket_mode", "IFRS 9.6.5.4"],
    linkedIds: ["hc-netting", "hc-ladder", "bucket-mode"],
    hedgecoreField: "MarketSnapshot.forward_points_by_month · FrozenInputs.bucket_map",
    auditNote: "Bucket assignments logged with snapshot hash. Any change in bucket_mode requires new hedge designation.",
  },
  "hc-ladder": {
    id: "hc-ladder", title: "HedgeCore Hedge Ladder Generator", version: "v1.5", updated: "2026-02-01",
    category: "HEDGECORE ARCHITECTURE", status: "STABLE",
    abstract: "The ladder generator converts the bucketed net exposure into execution-ready hedge instructions. For each bucket: (1) apply confirmed/forecast hedge ratio from policy; (2) compute target notional in USD (notional_mxn / spot_rate × hedge_ratio); (3) round to nearest USD 10,000; (4) enforce min_trade_size_usd floor; (5) assign value_date as last business day of bucket month; (6) assign instrument type from policy.execution_product; (7) record forward rate = spot + forward_points. Output is a list of `HedgeRow` objects ready for trader review. The complete ladder is frozen into the SandboxResult for audit purposes.",
    citations: ["HedgeCore API §HedgeRow", "HedgeCore API §SandboxResult", "IFRS 9.6.5.2 (hedging instrument — partial designation)"],
    linkedIds: ["hc-bucketing", "ndf", "hedge-ratio-policy"],
    hedgecoreField: "SandboxResult.hedge_ladder · HedgeRow",
    auditNote: "Ladder generation is the terminal step of the pipeline. Full reproducibility guaranteed by run_id and snapshot_hash.",
  },

  // ── HedgeCore RunEnvelope ────────────────────────────────────────────────────
  "hc-runevelope": {
    id: "hc-runevelope", title: "RunEnvelope — Audit Hash Chain", version: "v1.3", updated: "2026-03-01",
    category: "HEDGECORE ARCHITECTURE", status: "STABLE",
    abstract: "Every HedgeCore calculation emits a RunEnvelope — a cryptographic receipt binding all inputs and outputs to a single run_id. Fields: run_id (UUID v4), timestamp (ISO-8601 UTC), engine_version (semver), inputs_hash (SHA-256 of canonical JSON of trades+hedges+market+policy), outputs_hash (SHA-256 of hedge_plan+scenario_results), trades_hash, hedges_hash, market_hash, policy_hash. The inputs_hash enables replay: given the same inputs, the same engine version must produce the same outputs_hash — any discrepancy indicates tampering or non-determinism. The RunEnvelope is stored in the WORM calculation_runs table and referenced by the SandboxResult, FreezeArtifact, and LedgerEntry provenance chain. For audit: compare the run_id in the ledger entry against the corresponding RunEnvelope in the audit trail viewer.",
    citations: ["HedgeCore API §RunEnvelope", "SHA-256 FIPS 180-4", "WORM table policy §audit_events", "IFRS 9.B6.5.28 (contemporaneous documentation)"],
    linkedIds: ["hc-ladder", "hc-bucketing"],
    hedgecoreField: "RunEnvelope · calculation_runs.run_id · /api/v1/runs/{run_id}",
    auditNote: "To verify a run: GET /v1/runs/{run_id} → compare inputs_hash with your local SHA-256(canonical_json(inputs)). Any mismatch must be escalated to the Risk team.",
  },

  // ── Risk Taxonomy (R1–R8, FROZEN v1) ─────────────────────────────────────────
  "r1-directional": {
    id: "r1-directional", title: "R1: Directional / Delta", version: "v1.0", updated: "2026-01-01",
    category: "RISK TAXONOMY", status: "STABLE",
    abstract: "First-order directional exposure to underlying FX rate moves. For an MXN exporter, R1 captures the USD value change of unhedged MXN receivables as the USD/MXN spot rate moves. Quantified as USD PnL per 1% move in the FX rate. The hedge ladder directly reduces R1 by converting directional exposure into fixed forward rates. R1 is the primary objective of the HedgeCore hedge programme — the engine minimises R1 residual after applying hedge ratios. R1 residual is reported per bucket in the scenario stress output.",
    citations: ["risk_taxonomy.py §R1 (FROZEN)", "BIS FX Exposure Framework 2022 §3.1", "IFRS 9.6.4.1(a) (economic relationship)", "HedgeCore API §ScenarioBucketResult"],
    linkedIds: ["hc-ladder", "ndf", "r4-carry"],
    hedgecoreField: "ScenarioResults.per_bucket.unhedged_usd · hedge_benefit_usd",
    auditNote: "R1 residual after hedging must not exceed policy.max_residual_ratio. Reported in scenario stress output per bucket.",
  },
  "r2-volatility": {
    id: "r2-volatility", title: "R2: Volatility / Vega", version: "v1.0", updated: "2026-01-01",
    category: "RISK TAXONOMY", status: "STABLE",
    abstract: "Exposure to changes in implied FX volatility. For vanilla forward hedges and NDFs, vega exposure is zero (linear instruments). R2 becomes material when vanilla options are used as hedging instruments — the time value component creates volatility sensitivity. HedgeCore v1 does not price options natively; R2 is flagged as a disclosure item only. Quantified as USD per 1 vol point (vega-dollar equivalent). Policy must explicitly state whether options are eligible instruments before R2 hedging is permitted.",
    citations: ["risk_taxonomy.py §R2 (FROZEN)", "Garman-Kohlhagen (1983) §vega", "IFRS 9.B6.5.15 (time value exclusion)", "HedgeCore API §capability_flags"],
    linkedIds: ["vanilla-option", "r3-convexity", "r1-directional"],
    hedgecoreField: "WaterfallRule.rule_id = R2 · capability_flags.options_enabled",
    auditNote: "R2 is zero for pure NDF/forward programmes. Disclose if options are in scope.",
  },
  "r3-convexity": {
    id: "r3-convexity", title: "R3: Convexity / Gamma", version: "v1.0", updated: "2026-01-01",
    category: "RISK TAXONOMY", status: "STABLE",
    abstract: "Second-order nonlinear exposure capturing convexity under large FX moves. For NDF and vanilla forward portfolios, gamma is negligible — the P&L profile is linear. R3 becomes significant under extreme shock scenarios (3σ+) where linear approximation breaks down. HedgeCore scenario analysis applies shocks of ±1σ, ±2σ, ±3σ to the spot rate; the difference between linear and actual P&L quantifies the R3 contribution. If gamma is linearised, it must be disclosed per risk_taxonomy.py constraint.",
    citations: ["risk_taxonomy.py §R3 (FROZEN)", "BIS Working Paper 2019 §convexity", "IFRS 9.B6.4.12 (non-linear hedging instruments)"],
    linkedIds: ["r2-volatility", "r1-directional", "hc-ladder"],
    hedgecoreField: "ScenarioResults.totals.shocked_spot · sigma",
    auditNote: "R3 disclosure required if any non-linear instrument is designated as hedging instrument.",
  },
  "r4-carry": {
    id: "r4-carry", title: "R4: Carry / Cost Governance (Theta)", version: "v1.0", updated: "2026-01-01",
    category: "RISK TAXONOMY", status: "STABLE",
    abstract: "Governance axis for cost-of-hedge: forward points, bid-offer spread, financing costs, and option theta. R4 is treated as a constraint rather than a hedgeable risk — the engine uses R4 to reject hedge actions that exceed the policy cost budget. The HedgeCore friction calculation (spread_bps × notional) quantifies explicit transaction costs per hedge trade. Forward carry (forward points vs spot) is the primary cost driver for NDF hedges. R4 is not hedgeable; it is managed by policy (spread_bps, min_trade_size_usd, execution_product).",
    citations: ["risk_taxonomy.py §R4 (FROZEN)", "HedgeCore API §BucketResult.friction_usd", "FX Global Code Principle 14 (costs)", "IFRS 9.6.4.1(c) (hedge ratio — cost)"],
    linkedIds: ["r1-directional", "ndf", "min-trade"],
    hedgecoreField: "BucketResult.friction_usd · policy.cost_assumptions.spread_bps",
    auditNote: "Total friction_usd must be disclosed in the hedge plan summary. Exceeding cost budget triggers R4 FAIL in the waterfall.",
  },
  "r5-concentration": {
    id: "r5-concentration", title: "R5: Concentration / Correlation", version: "v1.0", updated: "2026-01-01",
    category: "RISK TAXONOMY", status: "STABLE",
    abstract: "Portfolio concentration risk and correlation structure. For a single-currency FX programme (e.g. MXN only), R5 measures exposure concentration in a single FX pair. For multi-currency portfolios (EUR, MXN, BRL simultaneously), R5 captures correlation between currency moves — a correlated shock could amplify losses across pairs. HedgeCore multi-currency mode tracks R5 implicitly through the portfolio exposure decomposition. Policy must specify concentration limits (max % in any single pair) if the portfolio covers multiple currencies.",
    citations: ["risk_taxonomy.py §R5 (FROZEN)", "BIS Correlation Risk Paper 2021 §4", "IFRS 9.B6.3.9 (hedged item — groups)", "HedgeCore pairRegistry.ts"],
    linkedIds: ["r1-directional", "r6-credit", "hc-exposure-model"],
    hedgecoreField: "provider_metadata.fx_rates · pairRegistry.ts · PortfolioExposure",
    auditNote: "Multi-currency programmes must disclose correlation assumptions. Single-pair programmes: R5 is low.",
  },
  "r6-credit": {
    id: "r6-credit", title: "R6: Credit / Spread", version: "v1.0", updated: "2026-01-01",
    category: "RISK TAXONOMY", status: "STABLE",
    abstract: "Counterparty credit risk on open derivative positions. For an NDF or forward hedge, R6 is the replacement cost if the counterparty defaults before settlement — the mark-to-market of the hedge position at the time of default. Mitigated by: (1) ISDA Master Agreement close-out netting; (2) CSA/VM CSA bilateral margining; (3) central clearing (CCP) for eligible products. HedgeCore does not compute CVA natively in v1; R6 is disclosed as a qualitative risk item. Counterparty selection and credit line limits are policy-governed.",
    citations: ["risk_taxonomy.py §R6 (FROZEN)", "Basel III SA-CCR §3 (counterparty credit)", "IFRS 13.48 (CVA/DVA)", "ISDA 2024 Netting Opinion"],
    linkedIds: ["isda-netting", "csa", "r5-concentration"],
    hedgecoreField: "counterparty.isda_version · counterparty.csa_type",
    auditNote: "R6 disclosure required in hedge plan. CVA must be computed externally and referenced in the audit trail.",
  },
  "r7-liquidity": {
    id: "r7-liquidity", title: "R7: Liquidity / Microstructure", version: "v1.0", updated: "2026-01-01",
    category: "RISK TAXONOMY", status: "STABLE",
    abstract: "Liquidity and execution risk: bid-offer spread widening, market impact, depth collapse, and unwind constraints. For MXN NDF hedges, R7 is most significant during risk-off periods when MXN bid-offer spreads widen sharply. HedgeCore models R7 implicitly through spread_bps (which is widened for NDF vs deliverable FWD). Minimum trade size (min_trade_size_usd) is a liquidity governance parameter — sub-minimum residuals are unhedgeable. Instrument eligibility must enforce liquidity gating; all approximations must be disclosed.",
    citations: ["risk_taxonomy.py §R7 (FROZEN)", "BIS Liquidity Framework 2023 §5", "FX Global Code Principle 10 (execution)", "HedgeCore API §policy.cost_assumptions"],
    linkedIds: ["r4-carry", "min-trade", "ndf"],
    hedgecoreField: "policy.cost_assumptions.spread_bps · policy.min_trade_size_usd",
    auditNote: "Spread widening scenarios (2× normal spread_bps) should be stress-tested quarterly.",
  },
  "r8-tail": {
    id: "r8-tail", title: "R8: Tail / Gap / Crash", version: "v1.0", updated: "2026-01-01",
    category: "RISK TAXONOMY", status: "STABLE",
    abstract: "Extreme tail events: discontinuous FX moves, crashes, and gap risk beyond linear scenario models. For MXN, historical tail events include: 2008 Lehman (MXN −30% in weeks), 2016 US election night (MXN −13% in hours), 2020 COVID (MXN −25% in days). HedgeCore scenario analysis captures tail risk through the ±3σ stress scenario. The hedge_benefit_usd at 3σ is the primary R8 metric — it quantifies how much capital the hedge programme saves in a tail event. Tail hedges (deep OTM options, etc.) are policy-gated and not implemented in v1.",
    citations: ["risk_taxonomy.py §R8 (FROZEN)", "Banxico Risk Report 2023 §tail risk", "IFRS 9.B6.4.15 (stress testing)", "HedgeCore API §ScenarioTotalResult"],
    linkedIds: ["r1-directional", "r3-convexity", "hc-ladder"],
    hedgecoreField: "ScenarioResults.totals[sigma=3].hedge_benefit_usd",
    auditNote: "3σ hedge benefit must be reported to the Treasury Committee quarterly. R8 is the primary metric for programme value demonstration.",
  },
};

const CATEGORIES = [
  { id: "FX INSTRUMENTS",        label: "FX Instruments",           count: 4,  icon: "⇄" },
  { id: "ISDA FRAMEWORK",        label: "ISDA Framework",           count: 3,  icon: "§" },
  { id: "IFRS 9 STANDARD",       label: "IFRS 9 Standard",          count: 4,  icon: "≡" },
  { id: "ASC 815 (US GAAP)",     label: "ASC 815 (US GAAP)",        count: 2,  icon: "≡" },
  { id: "POLICY TEMPLATES",      label: "Policy Templates",         count: 3,  icon: "⊡" },
  { id: "HEDGECORE ARCHITECTURE",label: "HedgeCore Architecture",   count: 5,  icon: "⬡" },
  { id: "RISK TAXONOMY",         label: "Risk Taxonomy (R1–R8)",    count: 8,  icon: "⊛" },
] as const;

type CategoryId = typeof CATEGORIES[number]["id"];

// ─── primitives ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: Entry["status"] }) {
  const map: Record<Entry["status"], { c: string; b: string }> = {
    STABLE:     { c: S.pass,      b: S.pass },
    DRAFT:      { c: S.amber,     b: S.amber },
    REVIEW:     { c: S.cyan,      b: S.cyan },
    DEPRECATED: { c: S.tertiary,  b: S.rim },
  };
  const { c, b } = map[status];
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em",
      padding: "1px 5px", border: `1px solid ${b}`, color: c,
    }}>{status}</span>
  );
}

function CitTag({ text }: { text: string }) {
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: "0.4rem", letterSpacing: "0.04em",
      padding: "1px 5px", border: `1px solid ${S.rim}`, color: S.tertiary,
      display: "inline-block",
    }}>{text}</span>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function HedgeWiki() {
  const _planAllowed = usePlanRedirect("enterprise");
  const renderTs = useRenderTs();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<CategoryId>("FX INSTRUMENTS");
  const [activeEntry, setActiveEntry] = useState<EntryId>("ndf");

  const [searchQuery, setSearchQuery] = useState("");
  const searchFiltered = searchQuery.trim()
    ? Object.values(ENTRIES).filter(e =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.abstract.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;
  const filteredEntries = searchFiltered ?? Object.values(ENTRIES).filter(e => e.category === activeCategory);
  const entry = ENTRIES[activeEntry] ?? Object.values(ENTRIES)[0];

  return (

    <PageShell icon={Globe} title="HedgeWiki" breadcrumb={["Dashboard", "HedgeWiki"]} noPadding>
    <div style={{ display: 'flex', minHeight: '100vh' }}>
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary, flex: 1 }}>

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <button onClick={() => router.push("/")} style={{
          fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
          background: "transparent", border: `1px solid ${S.rim}`,
          padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
        }}>← Home</button>
        <span style={{ color: S.rim }}>|</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 2h7l3 3v9H3V2z" stroke="var(--accent-cyan)" strokeWidth="1.25" strokeLinejoin="round"/>
          <path d="M10 2v3h3" stroke="var(--accent-cyan)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
          <path d="M5 7h6M5 9.5h4" stroke="var(--accent-cyan)" strokeWidth="1" strokeLinecap="round"/>
        </svg>
        <div>
          <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary, lineHeight: 1.1 }}>
            HedgeWiki
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.07em", color: S.tertiary }}>
            GOVERNANCE KNOWLEDGE GRAPH · HEDGECORE LAYER
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search articles…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem",
              background: S.bgSub, border: `1px solid ${S.rim}`,
              color: S.primary, padding: "3px 8px", outline: "none",
              width: 160,
            }}
            aria-label="Search knowledge articles"
          />
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", padding: "1px 6px", border: `1px solid ${S.rim}`, color: S.tertiary }}>
            {Object.keys(ENTRIES).length} ARTICLES · {CATEGORIES.length} DOMAINS
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>{renderTs}</span>
        </div>
      </header>

      {/* Body: three-pane layout */}
      <div style={{ display: "grid", gridTemplateColumns: "164px 220px 1fr", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* PANE 1: Category rail */}
        <nav data-wiki-sidebar style={{
          borderRight: `1px solid ${S.rim}`, background: S.bgSub,
          display: "flex", flexDirection: "column", overflow: "auto",
        }}>
          <div style={{ padding: "14px 14px 8px", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.07em" }}>
            KNOWLEDGE DOMAINS
          </div>
          {CATEGORIES.map(cat => {
            const isActive = cat.id === activeCategory;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id as CategoryId);
                  const firstEntry = Object.values(ENTRIES).find(e => e.category === cat.id);
                  if (firstEntry) setActiveEntry(firstEntry.id);
                }}
                style={{
                  display: "flex", flexDirection: "column", gap: 1,
                  padding: "8px 14px", background: isActive ? `color-mix(in srgb, var(--accent-cyan) 6%, transparent)` : "transparent",
                  border: "none", borderLeft: `2px solid ${isActive ? S.cyan : "transparent"}`,
                  cursor: "pointer", textAlign: "left" as const, width: "100%",
                }}
              >
                <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: isActive ? S.primary : S.secondary, fontWeight: isActive ? 600 : 400, lineHeight: 1.3 }}>
                  {cat.label}
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.4rem", color: S.tertiary }}>{cat.count} entries</span>
              </button>
            );
          })}

          <div style={{ marginTop: "auto", padding: "14px", borderTop: `1px solid ${S.rim}` }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.05em", marginBottom: 6 }}>GRAPH STATS</div>
            {[
              { l: "Entries", v: Object.keys(ENTRIES).length },
              { l: "Citations", v: Object.values(ENTRIES).reduce((s, e) => s + e.citations.length, 0) },
              { l: "Graph links", v: Object.values(ENTRIES).reduce((s, e) => s + e.linkedIds.length, 0) },
              { l: "HC fields",  v: Object.values(ENTRIES).filter(e => e.hedgecoreField).length },
            ].map(({ l, v }) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.tertiary }}>{l}</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>{v}</span>
              </div>
            ))}
          </div>
        </nav>

        {/* PANE 2: Entry list */}
        <div data-wiki-sidebar style={{ borderRight: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", overflow: "auto" }}>
          <div style={{ padding: "14px 14px 8px", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>
            {searchQuery.trim() ? `SEARCH RESULTS · ${filteredEntries.length} MATCHES` : `${activeCategory} · ${filteredEntries.length} ENTRIES`}
          </div>
          <div style={{ height: 1, background: S.rim }} />
          {filteredEntries.map(e => {
            const isActive = e.id === activeEntry;
            return (
              <button
                key={e.id}
                onClick={() => setActiveEntry(e.id)}
                style={{
                  display: "flex", flexDirection: "column", gap: 3, padding: "10px 14px",
                  background: isActive ? `color-mix(in srgb, var(--accent-cyan) 5%, transparent)` : "transparent",
                  border: "none", borderBottom: `1px solid ${S.soft}`,
                  borderLeft: `2px solid ${isActive ? S.cyan : "transparent"}`,
                  cursor: "pointer", textAlign: "left" as const, width: "100%",
                }}
              >
                <div style={{ fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: isActive ? 600 : 500, color: isActive ? S.primary : S.secondary, lineHeight: 1.3 }}>
                  {e.title}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <StatusChip status={e.status} />
                  <span style={{ fontFamily: S.fontMono, fontSize: "0.4rem", color: S.tertiary }}>{e.version}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* PANE 3: Entry detail */}
        <div data-wiki-content style={{ padding: "20px 28px", overflow: "auto" }}>
          {/* Print CSS for wiki */}
          <style>{`
            @media print {
              [data-wiki-sidebar], .no-print { display: none !important; }
              [data-wiki-content] { width: 100% !important; max-width: 100% !important; }
              body { background: white !important; color: black !important; }
            }
          `}</style>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 3 }}>
                {entry.category}
              </div>
              <h1 style={{ fontFamily: S.fontUI, fontSize: "1rem", fontWeight: 700, color: S.primary, margin: 0, lineHeight: 1.25 }}>
                {entry.title}
              </h1>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* L-10: Print button */}
                <button
                  onClick={() => window.print()}
                  aria-label="Print article to PDF"
                  style={{
                    background: "none",
                    border: `1px solid ${S.rim}`,
                    color: S.secondary,
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    padding: "3px 8px",
                    cursor: "pointer",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Printer size={11} /> PRINT
                </button>
                <StatusChip status={entry.status} />
              </div>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>{entry.version} · {entry.updated}</span>
            </div>
          </div>

          <div style={{ height: 1, background: S.rim, marginBottom: 16 }} />

          {/* Abstract */}
          <section style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>ABSTRACT</div>
            <p style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", lineHeight: 1.72, color: S.secondary, margin: 0 }}>
              {entry.abstract}
            </p>
          </section>

          {/* Citations */}
          <section style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>
              AUTHORITATIVE CITATIONS ({entry.citations.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
              {entry.citations.map(c => <CitTag key={c} text={c} />)}
            </div>
          </section>

          {/* HedgeCore linkage */}
          {entry.hedgecoreField && (
            <section style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>
                HEDGECORE FIELD LINKAGE
              </div>
              <div style={{
                padding: "8px 12px", background: S.bgSub, border: `1px solid ${S.rim}`,
                borderLeft: `3px solid ${S.cyan}`,
                fontFamily: S.fontMono, fontSize: "0.75rem", color: S.cyan, letterSpacing: "0.03em",
              }}>
                {entry.hedgecoreField}
              </div>
            </section>
          )}

          {/* Audit note */}
          {entry.auditNote && (
            <section style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>
                AUDIT NOTE
              </div>
              <div style={{
                padding: "8px 12px", background: `color-mix(in srgb, var(--accent-amber) 5%, transparent)`,
                border: `1px solid ${S.amber}`,
                fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, lineHeight: 1.6,
              }}>
                ⚑ {entry.auditNote}
              </div>
            </section>
          )}

          {/* Linked entries */}
          {entry.linkedIds.length > 0 && (
            <section>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>
                KNOWLEDGE GRAPH LINKS ({entry.linkedIds.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                {entry.linkedIds.map(linkedId => {
                  const linked = ENTRIES[linkedId];
                  if (!linked) return null;
                  return (
                    <button
                      key={linkedId}
                      onClick={() => {
                        setActiveCategory(linked.category as CategoryId);
                        setActiveEntry(linkedId);
                      }}
                      style={{
                        display: "flex", flexDirection: "column", gap: 2,
                        padding: "6px 10px", background: S.bgSub,
                        border: `1px solid ${S.rim}`, cursor: "pointer",
                        textAlign: "left" as const,
                      }}
                    >
                      <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", fontWeight: 500, color: S.secondary }}>{linked.title}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.4rem", color: S.tertiary, letterSpacing: "0.04em" }}>{linked.category} · {linked.version}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

      </div>

      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 20px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>ORDR Terminal · HedgeWiki</span>
        <span style={{ color: S.rim }}>·</span>
        <span>Versioned Governance Knowledge Graph</span>
        <span style={{ color: S.rim }}>·</span>
        <span>{Object.keys(ENTRIES).length} articles · {Object.values(ENTRIES).reduce((s, e) => s + e.citations.length, 0)} citations</span>
      </footer>
    </div>
    <HelpPanel config={HEDGEWIKI_HELP} storageKey="hedgewiki" />
    </div>
  
    </PageShell>
    );
}
