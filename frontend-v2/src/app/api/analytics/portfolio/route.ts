/**
 * app/api/analytics/portfolio/route.ts
 *
 * Next.js serverless proxy: computes portfolio analytics from the working
 * /v1/positions/exposure endpoint. Workaround for Render deploy delay on
 * the analytics backend fix (5ad25b4).
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.NEXT_PUBLIC_API_URL ?? "https://hedgecore.onrender.com/api";

const FX_SHOCKS: Record<
  string,
  { shock_1w_99: number; vol_ann: number; carry: number; liquidity: string }
> = {
  MXN: { shock_1w_99: 0.068, vol_ann: 0.142, carry: -0.032, liquidity: "HIGH" },
  EUR: { shock_1w_99: 0.032, vol_ann: 0.078, carry: 0.012, liquidity: "VERY_HIGH" },
  GBP: { shock_1w_99: 0.041, vol_ann: 0.095, carry: 0.008, liquidity: "VERY_HIGH" },
  JPY: { shock_1w_99: 0.028, vol_ann: 0.071, carry: -0.055, liquidity: "VERY_HIGH" },
  BRL: { shock_1w_99: 0.092, vol_ann: 0.198, carry: -0.082, liquidity: "MEDIUM" },
  CNY: { shock_1w_99: 0.018, vol_ann: 0.038, carry: -0.015, liquidity: "HIGH" },
  INR: { shock_1w_99: 0.031, vol_ann: 0.065, carry: -0.042, liquidity: "HIGH" },
  ZAR: { shock_1w_99: 0.089, vol_ann: 0.189, carry: -0.071, liquidity: "MEDIUM" },
  CAD: { shock_1w_99: 0.029, vol_ann: 0.068, carry: 0.005, liquidity: "VERY_HIGH" },
  AUD: { shock_1w_99: 0.038, vol_ann: 0.088, carry: 0.003, liquidity: "VERY_HIGH" },
  CHF: { shock_1w_99: 0.024, vol_ann: 0.062, carry: 0.022, liquidity: "VERY_HIGH" },
  TRY: { shock_1w_99: 0.148, vol_ann: 0.312, carry: -0.145, liquidity: "MEDIUM" },
};

const DEFAULT_SHOCK = { shock_1w_99: 0.05, vol_ann: 0.12, carry: 0.0, liquidity: "MEDIUM" };
const EM_CURRENCIES = new Set(["MXN", "BRL", "INR", "ZAR", "TRY", "CNY", "COP", "PHP", "THB", "IDR"]);
const LIQUIDITY_SCORE: Record<string, number> = {
  VERY_HIGH: 0.1,
  HIGH: 0.25,
  MEDIUM: 0.6,
  LOW: 0.9,
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

interface ExposureRow {
  currency: string;
  total_confirmed: number;
  total_forecast: number;
  count_confirmed: number;
  count_forecast: number;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("Authorization") ?? "";

  const upstream = await fetch(`${BACKEND}/v1/positions/exposure`, {
    headers: { Authorization: auth },
  });

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "upstream error");
    return NextResponse.json(
      { error: body },
      { status: upstream.status },
    );
  }

  const rows: ExposureRow[] = await upstream.json();

  const totalGross = rows.reduce((s, r) => s + r.total_confirmed, 0);

  const currencies = rows
    .filter((r) => r.total_confirmed > 0)
    .map((r) => {
      const ccy = r.currency;
      const gross = r.total_confirmed;
      const shock = FX_SHOCKS[ccy] ?? DEFAULT_SHOCK;
      return {
        currency: ccy,
        gross_exposure_usd: round2(gross),
        hedged_usd: 0,
        unhedged_usd: round2(gross),
        hedge_ratio: 0,
        weight_pct: totalGross > 0 ? round2((gross / totalGross) * 100) : 0,
        var_99_1w: round2(gross * shock.shock_1w_99),
        unhedged_var_99: round2(gross * shock.shock_1w_99),
        vol_ann: shock.vol_ann,
        carry: shock.carry,
        liquidity: shock.liquidity,
        position_count: r.count_confirmed,
        is_em: EM_CURRENCIES.has(ccy),
      };
    })
    .sort((a, b) => b.gross_exposure_usd - a.gross_exposure_usd);

  const portfolioVar = currencies.reduce((s, c) => s + c.unhedged_var_99, 0);

  const heatmap = currencies.slice(0, 10).map((c) => {
    const shock = FX_SHOCKS[c.currency] ?? DEFAULT_SHOCK;
    return {
      currency: c.currency,
      directional: round4(Math.min(c.unhedged_usd / Math.max(totalGross, 1), 1)),
      volatility: round4(Math.min(shock.vol_ann / 0.35, 1)),
      liquidity: LIQUIDITY_SCORE[shock.liquidity] ?? 0.5,
      carry: round4(Math.min(Math.abs(shock.carry) / 0.2, 1)),
      tenor: 0.4,
    };
  });

  return NextResponse.json({
    as_of: new Date().toISOString(),
    summary: {
      total_exposure_usd: round2(totalGross),
      total_hedged_usd: 0,
      total_unhedged_usd: round2(totalGross),
      portfolio_hedge_ratio: 0,
      currency_count: currencies.length,
      var_99_1w_undiversified: round2(portfolioVar),
      var_99_1w_diversified: round2(portfolioVar * 0.72),
    },
    currencies,
    heatmap,
    run_history: [],
  });
}
