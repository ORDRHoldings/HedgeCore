import { NextRequest, NextResponse } from 'next/server';
import { POLICY_PRESETS } from '@/constants/policyPresets';
import type { PolicyPreset } from '@/constants/policyPresets';

// ─────────────────────────────────────────────────────────────────────────────
// AI Policy Builder API Route
// POST /api/policy-ai
// Body: { answers: QuestionnaireAnswers }
// Returns: { suggested: PolicyPreset, explanation: string, fallback: boolean }
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export interface QuestionnaireAnswers {
  industry: string;
  company_size: 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE';
  annual_fx_volume_usd: number;
  primary_currency_pair: string;
  cash_flow_predictability: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_appetite: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  cost_sensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  time_horizon_months: number;
  hedge_objective: string;
  // Extended fields — collected by WizardState, passed to improve AI accuracy
  ifrs_compliance?: boolean;                // IFRS 9 hedge accounting required
  instrument_preferences?: string[];        // e.g. ['Forward', 'Option', 'NDF']
  rolling_hedge?: boolean;                  // rolling programme vs static
  hedge_ratio_target?: number;             // 0–1 user-declared target ratio

  // Extended fields — wizard data previously dropped (audit finding #4)
  netting_enabled?: boolean;
  netting_net_confirmed_forecast?: boolean;
  settlement_cycle_days?: number;
  materiality_threshold_usd?: number;
  min_hedge_size_usd?: number;
  max_single_trade_usd?: number;
  instrument_allowed?: Record<string, boolean>;
  instrument_max_tenor_days?: Record<string, number>;
  instrument_requires_approval?: Record<string, boolean>;
  instrument_max_notional_usd?: Record<string, number>;
  tenor_min_days?: number;
  tenor_max_days?: number;
  roll_allowed?: boolean;
  roll_window_days?: number;
  max_carry_cost_bps_annual?: number;
  max_option_premium_pct?: number;
  max_spread_bps?: number;
  leverage_cap?: number;
  margin_budget_usd?: number;
  max_instrument_concentration_pct?: number;
  max_counterparty_concentration_pct?: number;
  max_tenor_concentration_pct?: number;
  max_currency_concentration_pct?: number;
  max_acceptable_loss?: number;
  standard_stress_pack?: string;
  var_confidence?: number;
  drawdown_tolerance?: number;
  backtest_window_days?: number;
  worst_case_focus?: string;
  custom_scenarios?: Array<Record<string, unknown>>;
  governance_notes?: string;
  benchmark?: string;
  policy_status?: string;
  maturity_profile?: string;
  governance_tier?: string;
  accounting_mode?: string;
  layered_approach?: boolean;
  seasonal_patterns?: string;
  payment_frequency?: string;
  avg_transaction_size_usd?: number;
  has_intercompany_flows?: boolean;
  cash_flow_visibility?: string;
  hedge_experience?: string;
  portfolio_scope?: string;
  extended_flow_types?: string[];
  geography_focus?: string[];
  board_resolution_ref?: string;
  effective_from?: string;
  effective_until?: string;
  review_due_date?: string;
  regulatory_regimes?: string[];
}

export interface AIPolicyRecommendation {
  preset: PolicyPreset;
  rationale: string;
  label: string;
}

export interface AIPolicyResult {
  suggested: PolicyPreset;
  explanation: string;
  fallback: boolean;
  nearest_preset_name?: string;
  /** 3 recommendations: [0]=AI Custom, [1]=Best Preset Match, [2]=Alternative */
  recommendations: AIPolicyRecommendation[];
}

// ── Fallback: score each preset against the answers and return nearest match ──

const SIZE_RANK: Record<string, number> = {
  MICRO: 0, SMALL: 1, MEDIUM: 2, LARGE: 3, ENTERPRISE: 4,
};

const RISK_RANK: Record<string, number> = {
  CONSERVATIVE: 0, MODERATE: 1, AGGRESSIVE: 2,
};

function scoreFallback(preset: PolicyPreset, answers: QuestionnaireAnswers): number {
  let score = 0;

  // Risk posture match (highest weight)
  const riskDiff = Math.abs(RISK_RANK[preset.riskPosture] - RISK_RANK[answers.risk_appetite]);
  score -= riskDiff * 30;

  // Min trade size vs company size
  const sizeRank = SIZE_RANK[answers.company_size];
  const minSize = preset.policy.min_trade_size_usd;
  if (sizeRank <= 1 && minSize > 100000) score -= 20; // small/micro can't afford high minimums
  if (sizeRank >= 3 && minSize < 10000) score -= 10;  // large companies lose nothing here

  // Execution product preference
  const pair = (answers.primary_currency_pair || '').toUpperCase();
  const isEM = /MXN|BRL|COP|CLP|PEN|ARS|TRY|ZAR|INR|IDR|PHP|THB|KRW/.test(pair);
  if (isEM && preset.policy.execution_product === 'NDF') score += 10;
  if (!isEM && preset.policy.execution_product === 'FWD') score += 5;

  // Spread vs cost sensitivity
  const spread = preset.policy.cost_assumptions.spread_bps;
  if (answers.cost_sensitivity === 'HIGH' && spread <= 4) score += 15;
  if (answers.cost_sensitivity === 'HIGH' && spread >= 8) score -= 15;
  if (answers.cost_sensitivity === 'LOW'  && spread >= 6) score += 5;

  // Cash flow predictability vs forecast ratio
  const forecastRatio = preset.policy.hedge_ratios.forecast;
  if (answers.cash_flow_predictability === 'HIGH'   && forecastRatio >= 0.6) score += 10;
  if (answers.cash_flow_predictability === 'LOW'    && forecastRatio <= 0.3) score += 10;
  if (answers.cash_flow_predictability === 'MEDIUM' && forecastRatio >= 0.4 && forecastRatio <= 0.7) score += 5;

  // Industry → category hint
  const industry = (answers.industry || '').toLowerCase();
  if (/bank|fund|insurance|asset|pension|equity|capital/.test(industry) && preset.category === 'FINANCIAL') score += 15;
  if (/government|sovereign|public sector|ministry/.test(industry) && preset.category === 'SOVEREIGN') score += 20;
  if (/tech|software|saas|startup/.test(industry) && preset.id === 'tech-saas') score += 20;
  if (/airline|aviation/.test(industry) && preset.id === 'airline-fuel') score += 25;
  if (/pharma|health|medical/.test(industry) && preset.id === 'pharma-import') score += 25;
  if (/agri|farm|harvest|grain/.test(industry) && preset.id === 'agri-commodity') score += 25;
  if (/auto|vehicle|car|tier/.test(industry) && preset.id === 'auto-supply-chain') score += 25;
  if (/retail|e-commerce|consumer/.test(industry) && preset.id === 'retail-importer') score += 20;
  if (/hotel|hospitality|tourism|travel/.test(industry) && preset.id === 'hospitality-tourism') score += 25;
  if (/ship|freight|logistics|transport/.test(industry) && preset.id === 'shipping-logistics') score += 25;
  if (/mining|mineral|resource|quarry/.test(industry) && preset.id === 'mining-resources') score += 25;
  if (/construction|infrastructure|civil|build/.test(industry) && preset.id === 'construction-infra') score += 25;
  if (/media|entertainment|film|studio|stream/.test(industry) && preset.id === 'media-entertainment') score += 25;
  if (/ngo|nonprofit|charity|foundation|aid/.test(industry) && preset.id === 'ngo-nonprofit') score += 25;
  if (/family office|wealth|uhnw/.test(industry) && preset.id === 'family-office') score += 25;
  if (/hedge fund|macro|systematic/.test(industry) && preset.id === 'hedge-fund') score += 25;
  if (/venture|vc|startup fund|growth equity/.test(industry) && preset.id === 'vc-growth-equity') score += 25;
  if (/import|export|trading|distributor/.test(industry) && preset.id === 'import-export-trader') score += 20;
  if (/energy|utility|power|gas|renewable/.test(industry) && preset.id === 'energy-utilities') score += 25;
  if (/education|university|school|edtech/.test(industry) && preset.id === 'education-institutions') score += 25;
  if (/real estate|property|developer|reib/.test(industry) && preset.id === 'real-estate-dev') score += 25;

  // ── New preset IDs (60-preset library) ──────────────────────────────────────

  // Energy Expanded
  if (/oil|gas|upstream|e&p|exploration|production/.test(industry) && preset.id === 'oil-gas-upstream') score += 25;
  if (/lng|liquefied|natural gas export/.test(industry) && preset.id === 'lng-exporter') score += 25;
  if (/renewable|solar|wind|green energy|clean energy/.test(industry) && preset.id === 'renewable-energy') score += 25;
  if (/oilfield|field service|drillling|well service|halliburton|schlumberger/.test(industry) && preset.id === 'oil-field-services') score += 25;

  // Healthcare / Pharma
  if (/cro|clinical research|clinical trial|contract research/.test(industry) && preset.id === 'cro-clinical-research') score += 25;
  if (/medical device|medtech|surgical|implant|device oem/.test(industry) && preset.id === 'medical-device-oem') score += 25;
  if (/hospital|health system|clinic|healthcare provider/.test(industry) && preset.id === 'hospital-group-treasury') score += 25;

  // Technology
  if (/semiconductor|chip|wafer|fab|integrated circuit/.test(industry) && preset.id === 'semiconductor-supply') score += 25;
  if (/saas|cloud|enterprise software|b2b software/.test(industry) && preset.id === 'cloud-saas-enterprise') score += 25;
  if (/hardware|oem|device manufacturer|electronics mfg/.test(industry) && preset.id === 'hardware-oem-import') score += 25;

  // Financial Expanded
  if (/prime broker|fx broker|fx desk|trading desk/.test(industry) && preset.id === 'fx-prime-broker') score += 25;
  if (/pension|defined benefit|ldi|liability driven/.test(industry) && preset.id === 'pension-ldi') score += 25;
  if (/endowment|university fund|foundation fund|college invest/.test(industry) && preset.id === 'university-endowment') score += 25;
  if (/reit|cross.?border real estate|international property/.test(industry) && preset.id === 'reit-crossborder') score += 25;
  if (/spv|special purpose|securitisation|structured vehicle|abs|clo/.test(industry) && preset.id === 'spv-structured') score += 25;

  // Agriculture
  if (/coffee|arabica|robusta|cof/.test(industry) && preset.id === 'coffee-exporter') score += 25;
  if (/cocoa|chocolate|confection|cacao/.test(industry) && preset.id === 'cocoa-chocolate') score += 25;
  if (/grain|wheat|corn|soy|cereals|commodity grain/.test(industry) && preset.id === 'grain-trader') score += 25;
  if (/livestock|cattle|meat|beef|pork|poultry|protein export/.test(industry) && preset.id === 'livestock-meat-export') score += 25;

  // Sovereign / Quasi-Sovereign
  if (/development bank|multilateral|ifc|adb|ebrd|development finance/.test(industry) && preset.id === 'development-bank') score += 25;
  if (/sovereign wealth|swf|reserve management|national fund/.test(industry) && preset.id === 'sovereign-wealth-fund') score += 25;
  if (/municipal|city debt|sub.?sovereign|state debt|revenue bond/.test(industry) && preset.id === 'municipal-debt-service') score += 25;

  // EM Specialisation — also reward currency-pair matching
  const currencyPair = (answers.primary_currency_pair || '').toUpperCase();
  if ((/brazil|brl|brasil/.test(industry) || /BRL/.test(currencyPair)) && preset.id === 'brazil-brl-corporate') score += 25;
  if ((/mexico|mxn|nearshore|maquiladora/.test(industry) || /MXN/.test(currencyPair)) && preset.id === 'mexico-mxn-nearshore') score += 25;
  if ((/turkey|türkiye|try|turkish/.test(industry) || /TRY/.test(currencyPair)) && preset.id === 'turkey-try-corporate') score += 25;
  if ((/south africa|zar|rand|johannesburg|mining africa/.test(industry) || /ZAR/.test(currencyPair)) && preset.id === 'south-africa-zar-resources') score += 25;
  if ((/india|inr|rupee|it services|india tech/.test(industry) || /INR/.test(currencyPair)) && preset.id === 'india-inr-tech-services') score += 25;

  // IFRS 9 compliance bonus — reward high-confirmed-ratio presets for IFRS-compliant companies
  if (answers.ifrs_compliance && preset.policy.hedge_ratios.confirmed >= 0.75) score += 10;

  // Rolling hedge programme preference
  if (answers.rolling_hedge && preset.policy.hedge_ratios.forecast >= 0.4) score += 5;

  // Declared hedge ratio target — reward presets close to stated target
  if (answers.hedge_ratio_target !== undefined) {
    const targetDiff = Math.abs(preset.policy.hedge_ratios.confirmed - answers.hedge_ratio_target);
    score -= targetDiff * 20; // penalise distance from stated target
  }

  // Instrument preference — NDF preference for exotic EM instruments
  if (answers.instrument_preferences?.includes('NDF') && preset.policy.execution_product === 'NDF') score += 8;
  if (answers.instrument_preferences?.includes('Forward') && preset.policy.execution_product === 'FWD') score += 8;
  if (answers.instrument_preferences?.includes('Option') && preset.riskPosture !== 'CONSERVATIVE') score += 5;

  // SME/startup gets small-business preset
  if (answers.company_size === 'MICRO' && preset.id === 'small-business') score += 30;

  // Annual volume vs min trade size (penalise mismatch)
  const annualPerMonth = answers.annual_fx_volume_usd / 12;
  if (annualPerMonth < preset.policy.min_trade_size_usd * 2) score -= 15; // likely suppressed

  return score;
}

/** Return top N presets by score */
function findTopPresets(answers: QuestionnaireAnswers, n: number): PolicyPreset[] {
  return [...POLICY_PRESETS]
    .map(p => ({ preset: p, score: scoreFallback(p, answers) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.preset);
}

// ── Claude API call ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert FX treasury policy advisor for institutional clients. Given a company profile questionnaire, you produce a comprehensive, structured hedge policy configuration that covers execution parameters, governance controls, scenario stress testing, and risk overlay settings.

Your response MUST be a single valid JSON object with exactly these fields:
{
  "name": "<short descriptive name, max 40 chars>",
  "short_name": "<4-6 uppercase chars, unique abbreviation>",
  "description": "<1-2 sentence description>",
  "targetAudience": "<who this is for>",
  "riskPosture": "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE",
  "category": "CORPORATE" | "FINANCIAL" | "SOVEREIGN" | "SECTOR",
  "formula": "<brief mathematical formula notation>",
  "formulaExplain": "<plain English explanation of the formula>",
  "rationale": "<2-3 sentences explaining why these parameters were chosen>",
  "policy": {
    "bucket_mode": "CALENDAR_MONTH",
    "hedge_ratios": {
      "confirmed": <0.0 to 1.0>,
      "forecast": <0.0 to 1.0>
    },
    "cost_assumptions": {
      "spread_bps": <1.0 to 30.0>
    },
    "execution_product": "NDF" | "FWD",
    "min_trade_size_usd": <0 to 10000000>,
    "maturity_profile": "SHORT" | "MEDIUM" | "LONG" | "MIXED",
    "governance_tier": "STANDARD" | "ENHANCED" | "COMMITTEE",
    "accounting_mode": "FAIR_VALUE" | "CASH_FLOW_HEDGE" | "NET_INVESTMENT" | "NONE"
  },
  "extended_policy": {
    "volatility": {
      "lookback_days": <20 to 252>,
      "method": "EWMA" | "REALIZED",
      "regime_enabled": <true if company is sophisticated enough>,
      "band_widening_enabled": <true for active risk managers>,
      "ratio_adjustment_enabled": <true for dynamic hedging>
    },
    "scenarios": {
      "shock_pack": "standard" | "conservative" | "aggressive" | "tail_risk" | "em_stress" | "g10_stress",
      "var_enabled": <true if risk-aware>,
      "var_confidence": <0.90 to 0.99>,
      "expected_shortfall_enabled": <true for institutional>
    },
    "decision_gate": {
      "max_cost_bps": <25 to 150>,
      "max_cost_usd": <5000 to 500000>,
      "min_effectiveness": <0.15 to 0.50>,
      "require_nonzero_hedges": true
    },
    "netting": {
      "enabled": <true if company has offsetting flows>,
      "net_confirmed_forecast": <true for aggressive netting>,
      "settlement_cycle_days": <1 to 5>
    },
    "instruments": {
      "allowed_types": ["NDF", "FWD"] | ["NDF", "FWD", "OPTION", "SWAP"],
      "max_tenor_days": <30 to 730>,
      "max_notional_usd": <0 to 100000000>
    },
    "effectiveness": {
      "method": "NONE" | "CRITICAL_TERMS_MATCH" | "STATISTICAL_FORECAST",
      "confidence": <0.80 to 0.99>
    }
  }
}

Rules:
- confirmed hedge ratio: 0.0–1.0 (higher = more conservative, more protected)
- forecast hedge ratio: 0.0–1.0 (lower for unpredictable cash flows)
- spread_bps: reflects transaction cost (1.5 = interbank, 5–8 = typical corporate, 10+ = small/NGO)
- execution_product: NDF for EM currency pairs, FWD for G10/stable currencies
- min_trade_size_usd: 0 for small companies, higher for institutional clients
- volatility regime: enable for companies with dedicated treasury teams
- scenario shock_pack: match to risk appetite (conservative for risk-averse, aggressive/tail_risk for sophisticated)
- decision gate: set cost/effectiveness thresholds based on company sophistication
- netting: enable when company has bi-directional FX flows
- effectiveness method: CRITICAL_TERMS_MATCH for hedge accounting, STATISTICAL_FORECAST for institutional
- Do NOT include any text outside the JSON object. Return ONLY the JSON.`;

async function callClaude(answers: QuestionnaireAnswers): Promise<AIPolicyResult | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const instrumentList = answers.instrument_preferences?.length
    ? answers.instrument_preferences.join(', ')
    : 'No preference stated';

  // Build extended context from wizard fields (audit finding #4 — previously dropped)
  let extendedContext = '';

  if (answers.netting_enabled !== undefined) {
    extendedContext += `\nNetting: ${answers.netting_enabled ? 'Available' : 'Not available'}`;
    if (answers.settlement_cycle_days) extendedContext += `, settlement T+${answers.settlement_cycle_days}`;
  }
  if (answers.max_spread_bps) {
    extendedContext += `\nMax spread tolerance: ${answers.max_spread_bps} bps`;
  }
  if (answers.margin_budget_usd) {
    extendedContext += `\nMargin budget: $${answers.margin_budget_usd.toLocaleString()}`;
  }
  if (answers.max_instrument_concentration_pct) {
    extendedContext += `\nMax instrument concentration: ${answers.max_instrument_concentration_pct}%`;
  }
  if (answers.standard_stress_pack) {
    extendedContext += `\nStress test preference: ${answers.standard_stress_pack}`;
  }
  if (answers.governance_notes) {
    extendedContext += `\nGovernance notes: ${answers.governance_notes}`;
  }
  if (answers.accounting_mode) {
    extendedContext += `\nAccounting treatment: ${answers.accounting_mode}`;
  }
  if (answers.layered_approach) {
    extendedContext += `\nLayered/sleeve hedging: Yes`;
  }
  if (answers.materiality_threshold_usd) {
    extendedContext += `\nMateriality threshold: $${answers.materiality_threshold_usd.toLocaleString()}`;
  }
  if (answers.max_single_trade_usd) {
    extendedContext += `\nMax single trade: $${answers.max_single_trade_usd.toLocaleString()}`;
  }
  if (answers.leverage_cap) {
    extendedContext += `\nLeverage cap: ${answers.leverage_cap}x`;
  }
  if (answers.max_carry_cost_bps_annual) {
    extendedContext += `\nMax carry cost: ${answers.max_carry_cost_bps_annual} bps/year`;
  }
  if (answers.max_option_premium_pct) {
    extendedContext += `\nMax option premium: ${answers.max_option_premium_pct}%`;
  }
  if (answers.portfolio_scope) {
    extendedContext += `\nPortfolio scope: ${answers.portfolio_scope}`;
  }
  if (answers.hedge_experience) {
    extendedContext += `\nHedge experience: ${answers.hedge_experience}`;
  }
  if (answers.cash_flow_visibility) {
    extendedContext += `\nCash flow visibility: ${answers.cash_flow_visibility}`;
  }
  if (answers.seasonal_patterns) {
    extendedContext += `\nSeasonal patterns: ${answers.seasonal_patterns}`;
  }
  if (answers.payment_frequency) {
    extendedContext += `\nPayment frequency: ${answers.payment_frequency}`;
  }
  if (answers.has_intercompany_flows) {
    extendedContext += `\nHas intercompany flows: Yes`;
  }
  if (answers.var_confidence) {
    extendedContext += `\nVaR confidence: ${answers.var_confidence}%`;
  }
  if (answers.drawdown_tolerance) {
    extendedContext += `\nDrawdown tolerance: ${answers.drawdown_tolerance}%`;
  }
  if (answers.regulatory_regimes?.length) {
    extendedContext += `\nRegulatory regimes: ${answers.regulatory_regimes.join(', ')}`;
  }
  if (answers.geography_focus?.length) {
    extendedContext += `\nGeography focus: ${answers.geography_focus.join(', ')}`;
  }
  if (answers.extended_flow_types?.length) {
    extendedContext += `\nFlow types: ${answers.extended_flow_types.join(', ')}`;
  }
  if (answers.benchmark) {
    extendedContext += `\nBenchmark: ${answers.benchmark}`;
  }

  const userPrompt = `Generate a tailored FX hedge policy for this company profile:

Industry: ${answers.industry}
Company size: ${answers.company_size}
Annual FX volume: $${answers.annual_fx_volume_usd.toLocaleString()} USD
Primary currency pair: ${answers.primary_currency_pair || 'USD/MXN'}
Cash flow predictability: ${answers.cash_flow_predictability}
Risk appetite: ${answers.risk_appetite}
Cost sensitivity: ${answers.cost_sensitivity}
Hedge time horizon: ${answers.time_horizon_months} months
Hedge objective: ${answers.hedge_objective}
IFRS 9 hedge accounting required: ${answers.ifrs_compliance ? 'Yes — confirmed ratio must be ≥75% for effectiveness testing' : 'No'}
Preferred instruments: ${instrumentList}
Rolling hedge programme: ${answers.rolling_hedge ? 'Yes — programme rolls forward each month' : 'No — static tenor positions'}
Declared hedge ratio target: ${answers.hedge_ratio_target !== undefined ? `${Math.round(answers.hedge_ratio_target * 100)}%` : 'Not specified'}${extendedContext}

Return ONLY the JSON policy object as specified.`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      console.warn('[policy-ai] Claude API returned', res.status);
      return null;
    }

    const json = await res.json();
    const text: string = json?.content?.[0]?.text ?? '';

    // Parse the JSON response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { console.warn('[policy-ai] No JSON found in Claude response'); return null; }

    const parsed = JSON.parse(match[0]) as {
      name: string;
      short_name: string;
      description: string;
      targetAudience: string;
      riskPosture: PolicyPreset['riskPosture'];
      category: PolicyPreset['category'];
      formula: string;
      formulaExplain: string;
      rationale: string;
      policy: PolicyPreset['policy'];
    };

    // Validate critical fields
    if (!parsed.name || !parsed.policy?.hedge_ratios) return null;

    // Derive maturity, governance, accounting from answers + AI response
    // The AI may return these extended fields in the policy block
    const policyRaw = parsed.policy as unknown as Record<string, unknown>;
    const aiMaturity: PolicyPreset['maturity_profile'] =
      policyRaw.maturity_profile === 'SHORT' ? 'SHORT' :
      policyRaw.maturity_profile === 'LONG' ? 'LONG' :
      policyRaw.maturity_profile === 'MIXED' ? 'MIXED' :
      answers.time_horizon_months <= 3 ? 'SHORT' :
      answers.time_horizon_months <= 12 ? 'MEDIUM' : 'LONG';

    const aiGovernance: PolicyPreset['governance_tier'] =
      policyRaw.governance_tier === 'COMMITTEE' ? 'COMMITTEE' :
      policyRaw.governance_tier === 'ENHANCED' ? 'ENHANCED' :
      answers.governance_notes ? 'ENHANCED' : 'STANDARD';

    const aiAccounting: PolicyPreset['accounting_mode'] =
      policyRaw.accounting_mode === 'FAIR_VALUE' ? 'FAIR_VALUE' :
      policyRaw.accounting_mode === 'NET_INVESTMENT' ? 'NET_INVESTMENT' :
      policyRaw.accounting_mode === 'CASH_FLOW_HEDGE' ? 'CASH_FLOW_HEDGE' :
      answers.ifrs_compliance ? 'CASH_FLOW_HEDGE' : 'NONE';

    // Extract extended_policy from AI response (Phase 2: wizard output deepening)
    const extRaw = (parsed as Record<string, unknown>).extended_policy as Record<string, unknown> | undefined;
    const extVol = (extRaw?.volatility ?? {}) as Record<string, unknown>;
    const extScenarios = (extRaw?.scenarios ?? {}) as Record<string, unknown>;
    const extGate = (extRaw?.decision_gate ?? {}) as Record<string, unknown>;
    const extNetting = (extRaw?.netting ?? {}) as Record<string, unknown>;
    const extInstruments = (extRaw?.instruments ?? {}) as Record<string, unknown>;
    const extEff = (extRaw?.effectiveness ?? {}) as Record<string, unknown>;

    const suggested: PolicyPreset & { extended_policy?: Record<string, unknown> } = {
      id: `ai-generated-${Date.now()}`,
      name: parsed.name,
      shortName: parsed.short_name ?? 'AI',
      description: parsed.description ?? '',
      targetAudience: parsed.targetAudience ?? answers.industry,
      riskPosture: parsed.riskPosture ?? answers.risk_appetite,
      category: parsed.category ?? 'CORPORATE',
      formula: parsed.formula ?? '',
      formulaExplain: parsed.formulaExplain ?? '',
      rationale: parsed.rationale ?? '',
      policy: {
        bucket_mode: 'CALENDAR_MONTH',
        hedge_ratios: {
          confirmed: Math.max(0, Math.min(1, parsed.policy.hedge_ratios.confirmed)),
          forecast:  Math.max(0, Math.min(1, parsed.policy.hedge_ratios.forecast)),
        },
        cost_assumptions: {
          spread_bps: Math.max(1, Math.min(30, parsed.policy.cost_assumptions.spread_bps)),
        },
        execution_product: parsed.policy.execution_product ?? 'NDF',
        min_trade_size_usd: Math.max(0, parsed.policy.min_trade_size_usd ?? 0),
      },
      maturity_profile: aiMaturity,
      governance_tier: aiGovernance,
      evidence_grade: 'DOCUMENTED',
      accounting_mode: aiAccounting,
      // Extended policy fields — structured governance/scenario/volatility output
      extended_policy: extRaw ? {
        volatility: {
          lookback_days: Math.max(20, Math.min(252, Number(extVol.lookback_days) || 60)),
          method: extVol.method === 'REALIZED' ? 'REALIZED' : 'EWMA',
          regime_enabled: Boolean(extVol.regime_enabled),
          band_widening_enabled: Boolean(extVol.band_widening_enabled),
          ratio_adjustment_enabled: Boolean(extVol.ratio_adjustment_enabled),
        },
        scenarios: {
          shock_pack: typeof extScenarios.shock_pack === 'string' ? extScenarios.shock_pack : 'standard',
          var_enabled: Boolean(extScenarios.var_enabled),
          var_confidence: Math.max(0.90, Math.min(0.99, Number(extScenarios.var_confidence) || 0.95)),
          expected_shortfall_enabled: Boolean(extScenarios.expected_shortfall_enabled),
        },
        decision_gate: {
          max_cost_bps: Math.max(25, Math.min(150, Number(extGate.max_cost_bps) || 75)),
          max_cost_usd: Math.max(5000, Math.min(500000, Number(extGate.max_cost_usd) || 25000)),
          min_effectiveness: Math.max(0.15, Math.min(0.50, Number(extGate.min_effectiveness) || 0.25)),
          require_nonzero_hedges: extGate.require_nonzero_hedges !== false,
        },
        netting: {
          enabled: Boolean(extNetting.enabled),
          net_confirmed_forecast: Boolean(extNetting.net_confirmed_forecast),
          settlement_cycle_days: Math.max(1, Math.min(5, Number(extNetting.settlement_cycle_days) || 2)),
        },
        instruments: {
          allowed_types: Array.isArray(extInstruments.allowed_types) ? extInstruments.allowed_types : ['NDF', 'FWD'],
          max_tenor_days: Math.max(30, Math.min(730, Number(extInstruments.max_tenor_days) || 365)),
          max_notional_usd: Number(extInstruments.max_notional_usd) || 0,
        },
        effectiveness: {
          method: ['NONE', 'CRITICAL_TERMS_MATCH', 'STATISTICAL_FORECAST'].includes(String(extEff.method))
            ? String(extEff.method) : 'NONE',
          confidence: Math.max(0.80, Math.min(0.99, Number(extEff.confidence) || 0.95)),
        },
      } : undefined,
    };

    const topPresets = findTopPresets(answers, 2);
    const [top1, top2] = topPresets;

    const recommendations: AIPolicyRecommendation[] = [
      {
        preset: suggested,
        rationale: parsed.rationale ?? 'AI-generated policy tailored to your company profile.',
        label: 'AI Custom',
      },
      {
        preset: top1,
        rationale: top1.rationale ?? `Best matching preset for your ${answers.industry} profile with ${answers.risk_appetite.toLowerCase()} risk appetite.`,
        label: 'Best Match',
      },
      {
        preset: top2 ?? top1,
        rationale: (top2 ?? top1).rationale ?? 'Alternative preset recommendation based on your cash flow characteristics.',
        label: 'Alternative',
      },
    ];

    return {
      suggested,
      explanation: parsed.rationale ?? 'AI-generated policy tailored to your company profile.',
      fallback: false,
      nearest_preset_name: top1.name,
      recommendations,
    };

  } catch (err) {
    console.warn('[policy-ai] Claude call failed:', err);
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { answers: QuestionnaireAnswers };
    const { answers } = body;

    if (!answers || !answers.industry) {
      return NextResponse.json({ error: 'Missing answers payload' }, { status: 400 });
    }

    // Try Claude first; fall back to preset scoring if unavailable
    const aiResult = await callClaude(answers);

    if (aiResult) {
      return NextResponse.json(aiResult);
    }

    // Fallback: nearest-match preset scoring (return top 3)
    const topPresets = findTopPresets(answers, 3);
    const [fb1, fb2, fb3] = topPresets;
    const fallbackResult: AIPolicyResult = {
      suggested: fb1,
      explanation: `Based on your profile (${answers.industry}, ${answers.risk_appetite.toLowerCase()} risk appetite, ${answers.cash_flow_predictability.toLowerCase()} cash flow predictability), the ${fb1.name} preset is the closest match. ${fb1.rationale}`,
      fallback: true,
      nearest_preset_name: fb1.name,
      recommendations: [
        { preset: fb1, rationale: fb1.rationale ?? 'Top-scored preset for your profile.', label: 'Best Match' },
        { preset: fb2 ?? fb1, rationale: (fb2 ?? fb1).rationale ?? 'Strong alternative based on risk posture.', label: 'Alternative' },
        { preset: fb3 ?? fb2 ?? fb1, rationale: (fb3 ?? fb2 ?? fb1).rationale ?? 'Third option for consideration.', label: 'Third Option' },
      ],
    };

    return NextResponse.json(fallbackResult);

  } catch (err) {
    console.error('[policy-ai] Error:', err);
    return NextResponse.json(
      { error: 'Policy AI failed', detail: String(err) },
      { status: 500 },
    );
  }
}
