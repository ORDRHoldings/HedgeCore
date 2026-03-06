/**
 * app/api/analytics/scenarios/route.ts
 *
 * Next.js serverless proxy: computes scenario analytics from the working
 * /v1/positions/exposure endpoint. Workaround for Render deploy delay on
 * the analytics backend fix (5ad25b4).
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.NEXT_PUBLIC_API_URL ?? "https://hedgecore.onrender.com/api";

const FX_SHOCKS: Record<string, { shock_1w_99: number }> = {
  MXN: { shock_1w_99: 0.068 },
  EUR: { shock_1w_99: 0.032 },
  GBP: { shock_1w_99: 0.041 },
  JPY: { shock_1w_99: 0.028 },
  BRL: { shock_1w_99: 0.092 },
  CNY: { shock_1w_99: 0.018 },
  INR: { shock_1w_99: 0.031 },
  ZAR: { shock_1w_99: 0.089 },
  CAD: { shock_1w_99: 0.029 },
  AUD: { shock_1w_99: 0.038 },
  CHF: { shock_1w_99: 0.024 },
  TRY: { shock_1w_99: 0.148 },
};

const SCENARIO_SHOCKS = [
  { name: "2020 COVID Flash Crash", date: "Mar 2020", em_shock: -0.182, dm_shock: -0.087, color: "#DC2626" },
  { name: "2022 USD Surge",         date: "Sep 2022", em_shock: -0.134, dm_shock: -0.071, color: "#D97706" },
  { name: "2015 EM Selloff",        date: "Aug 2015", em_shock: -0.121, dm_shock: -0.052, color: "#F59E0B" },
  { name: "2018 EM Crisis",         date: "Aug 2018", em_shock: -0.098, dm_shock: -0.038, color: "#6366F1" },
  { name: "2016 GBP Brexit",        date: "Jun 2016", em_shock: -0.065, dm_shock: -0.112, color: "#8B5CF6" },
  { name: "Base Case (+1sigma)",    date: "1M horizon", em_shock: -0.042, dm_shock: -0.028, color: "#059669" },
];

const EM_CURRENCIES = new Set(["MXN", "BRL", "INR", "ZAR", "TRY", "CNY", "COP", "PHP", "THB", "IDR"]);

function round2(n: number) {
  return Math.round(n * 100) / 100;
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
    return NextResponse.json({ error: body }, { status: upstream.status });
  }

  const rows: ExposureRow[] = await upstream.json();

  // unhedged = confirmed (no HEDGED status data available from exposure endpoint)
  const totalEm = rows
    .filter((r) => EM_CURRENCIES.has(r.currency))
    .reduce((s, r) => s + r.total_confirmed, 0);

  const totalDm = rows
    .filter((r) => !EM_CURRENCIES.has(r.currency))
    .reduce((s, r) => s + r.total_confirmed, 0);

  const scenarios = SCENARIO_SHOCKS.map((sc) => {
    const emPnl  = totalEm  * sc.em_shock;
    const dmPnl  = totalDm  * sc.dm_shock;
    const total  = emPnl + dmPnl;
    const hedged = total * 0.43; // ~57% hedge ratio assumption
    return {
      name:           sc.name,
      date:           sc.date,
      color:          sc.color,
      unhedged_pnl:   round2(total),
      hedged_pnl:     round2(hedged),
      hedge_benefit:  round2(total - hedged),
      em_pnl:         round2(emPnl),
      dm_pnl:         round2(dmPnl),
      em_shock_pct:   round2(sc.em_shock * 100),
      dm_shock_pct:   round2(sc.dm_shock * 100),
    };
  });

  const currencyImpacts = rows
    .filter((r) => r.total_confirmed > 0)
    .map((r) => {
      const ccy      = r.currency;
      const unhedged = r.total_confirmed;
      const shock    = FX_SHOCKS[ccy] ?? { shock_1w_99: 0.05 };
      const isEm     = EM_CURRENCIES.has(ccy);
      const worst    = isEm ? SCENARIO_SHOCKS[0].em_shock : SCENARIO_SHOCKS[0].dm_shock;
      return {
        currency:       ccy,
        unhedged_usd:   round2(unhedged),
        worst_case_pnl: round2(unhedged * worst),
        var_99_1w:      round2(unhedged * shock.shock_1w_99),
        is_em:          isEm,
      };
    })
    .sort((a, b) => a.worst_case_pnl - b.worst_case_pnl);

  return NextResponse.json({
    as_of: new Date().toISOString(),
    scenarios,
    currency_impacts: currencyImpacts,
    total_em_unhedged: round2(totalEm),
    total_dm_unhedged: round2(totalDm),
  });
}
