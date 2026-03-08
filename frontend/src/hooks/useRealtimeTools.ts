/**
 * useRealtimeTools — Maps OpenAI Realtime function calls to backend API calls.
 *
 * Each tool name maps to a backend endpoint. The browser executes the call
 * using dashboardFetch (JWT-authenticated) and returns a JSON string for
 * OpenAI's function_call_output.
 */

import { dashboardFetch } from "@/lib/api/dashboardClient";

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  try {
    switch (name) {
      case "calculate_hedge":
        return await callCalculateHedge(args, token);
      case "get_spot_rate":
        return await callGetSpotRate(args, token);
      case "list_positions":
        return await callListPositions(args, token);
      case "get_portfolio_summary":
        return await callGetPortfolioSummary(token);
      case "list_policies":
        return await callListPolicies(token);
      case "get_pending_approvals":
        return await callGetPendingApprovals(token);
      default:
        return JSON.stringify({ error: `Unknown function: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

async function callCalculateHedge(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const pair = String(args.pair ?? "USDMXN");
  const amount = Number(args.exposure_amount ?? 0);
  const flowType = String(args.flow_type ?? "AP");
  const valueDate = String(args.value_date ?? "2026-12-31");

  // Derive foreign currency from pair
  let currency: string;
  if (pair.endsWith("USD")) currency = pair.slice(0, 3);
  else if (pair.startsWith("USD")) currency = pair.slice(3);
  else currency = pair.slice(0, 3);

  // Fetch live spot rates
  let market: Record<string, number> = {};
  try {
    const ratesResp = await dashboardFetch("/v1/market/fx/rates", token);
    if (ratesResp.ok) {
      const ratesData = await ratesResp.json();
      const rates = ratesData.rates ?? [];
      for (const r of rates) {
        if (r.symbol && r.mid) market[r.symbol] = r.mid;
      }
    }
  } catch {
    // Fall through — market stays empty
  }

  // Fallback if pair not in live rates
  if (!(pair in market)) {
    market[pair] = 17.24;
  }

  const payload = {
    trades: [
      {
        record_id: "VOICE-001",
        entity: "Voice Request",
        flow_type: flowType,
        currency,
        amount,
        value_date: valueDate,
        status: "CONFIRMED",
      },
    ],
    market,
    policy_instance_id: null,
  };

  const resp = await dashboardFetch("/v1/calculate", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return await resp.text();
}

async function callGetSpotRate(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const pair = String(args.pair ?? "USDMXN");
  const resp = await dashboardFetch("/v1/market/fx/rates", token);
  if (!resp.ok) return JSON.stringify({ error: `HTTP ${resp.status}` });

  const data = await resp.json();
  const rates = data.rates ?? [];
  const match = rates.find((r: { symbol?: string }) => r.symbol === pair);
  if (!match) return JSON.stringify({ error: `${pair} not found` });
  return JSON.stringify({ pair, mid: match.mid, bid: match.bid, ask: match.ask });
}

async function callListPositions(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const sf = String(args.status_filter ?? "ALL");
  const params = sf === "ALL" ? "" : `?execution_status=${sf}`;
  const resp = await dashboardFetch(`/v1/positions${params}`, token);
  if (!resp.ok) return JSON.stringify({ error: `HTTP ${resp.status}` });

  const data = await resp.json();
  const positions = Array.isArray(data) ? data : data.items ?? data.positions ?? [];
  return JSON.stringify({
    count: positions.length,
    positions: positions.slice(0, 10).map((p: Record<string, unknown>) => ({
      id: String(p.id ?? "").slice(0, 8),
      entity: p.entity ?? "—",
      currency: p.currency ?? "—",
      amount: p.amount ?? 0,
      status: p.execution_status ?? "—",
    })),
  });
}

async function callGetPortfolioSummary(token: string): Promise<string> {
  const resp = await dashboardFetch("/v1/dashboard/summary", token);
  if (!resp.ok) return JSON.stringify({ error: `HTTP ${resp.status}` });
  return await resp.text();
}

async function callListPolicies(token: string): Promise<string> {
  const resp = await dashboardFetch("/v1/policies/templates", token);
  if (!resp.ok) return JSON.stringify({ error: `HTTP ${resp.status}` });

  const data = await resp.json();
  const templates = Array.isArray(data) ? data : data.templates ?? [];
  return JSON.stringify({
    count: templates.length,
    policies: templates.slice(0, 10).map((t: Record<string, unknown>) => ({
      id: String(t.id ?? "").slice(0, 8),
      name: t.name ?? "—",
      short_name: t.short_name ?? "—",
    })),
  });
}

async function callGetPendingApprovals(token: string): Promise<string> {
  const resp = await dashboardFetch("/v1/proposals?status=PROPOSED&limit=10", token);
  if (!resp.ok) return JSON.stringify({ error: `HTTP ${resp.status}` });

  const data = await resp.json();
  const proposals = Array.isArray(data) ? data : data.proposals ?? [];
  return JSON.stringify({
    count: proposals.length,
    proposals: proposals.slice(0, 10).map((p: Record<string, unknown>) => ({
      id: String(p.id ?? "").slice(0, 8),
      ref: p.execution_ref ?? "—",
      status: p.status ?? "—",
    })),
  });
}
