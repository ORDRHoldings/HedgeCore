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

  // SME/startup gets small-business preset
  if (answers.company_size === 'MICRO' && preset.id === 'small-business') score += 30;

  // Annual volume vs min trade size (penalise mismatch)
  const annualPerMonth = answers.annual_fx_volume_usd / 12;
  if (annualPerMonth < preset.policy.min_trade_size_usd * 2) score -= 15; // likely suppressed

  return score;
}

function findNearestPreset(answers: QuestionnaireAnswers): PolicyPreset {
  let best = POLICY_PRESETS[0];
  let bestScore = -Infinity;
  for (const preset of POLICY_PRESETS) {
    const s = scoreFallback(preset, answers);
    if (s > bestScore) { bestScore = s; best = preset; }
  }
  return best;
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

const SYSTEM_PROMPT = `You are an expert FX treasury policy advisor. Given a company profile questionnaire, you produce a tailored hedge policy configuration.

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
    "min_trade_size_usd": <0 to 10000000>
  }
}

Rules:
- confirmed hedge ratio: 0.0–1.0 (higher = more conservative, more protected)
- forecast hedge ratio: 0.0–1.0 (lower for unpredictable cash flows)
- spread_bps: reflects transaction cost (1.5 = interbank, 5–8 = typical corporate, 10+ = small/NGO)
- execution_product: NDF for EM currency pairs, FWD for G10/stable currencies
- min_trade_size_usd: 0 for small companies, higher for institutional clients
- Do NOT include any text outside the JSON object. Return ONLY the JSON.`;

async function callClaude(answers: QuestionnaireAnswers): Promise<AIPolicyResult | null> {
  if (!ANTHROPIC_API_KEY) return null;

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

    const suggested: PolicyPreset = {
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
