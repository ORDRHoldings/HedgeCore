/**
 * useRealtimeTools — Maps OpenAI Realtime function calls to backend API calls.
 *
 * Each tool name maps to a backend endpoint. The browser executes the call
 * using dashboardFetch (JWT-authenticated) and returns a JSON string for
 * OpenAI's function_call_output.
 */

import { dashboardFetch } from "@/lib/api/dashboardClient";

// Tools that require explicit user confirmation in the UI before executing.
// The hook (useRealtimeVoice) gates execution on a click-to-confirm card; on
// denial, the tool resolves with {error: "User denied execution"} and the
// model is informed so it doesn't retry.
export const MUTATING_TOOLS: ReadonlySet<string> = new Set([
  "pin_pair",
  "unpin_pair",
]);

export function isMutatingTool(name: string): boolean {
  return MUTATING_TOOLS.has(name);
}

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
      case "pin_pair":
        return await callPinPair(args, token);
      case "unpin_pair":
        return await callUnpinPair(args, token);
      case "get_recent_runs":
        return await callGetRecentRuns(args, token);
      case "recall_recent_sessions":
        return await callRecallRecentSessions(args, token);
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

// MUTATING: pin a currency pair to the user's primary watchlist.
// Find-or-create flow: GET /v1/watchlists, fall back to POST if none exist,
// then PUT to add the symbol if not already present.
async function callPinPair(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const pair = String(args.pair ?? "").trim().toUpperCase();
  if (!/^[A-Z]{6}$/.test(pair)) {
    return JSON.stringify({ error: `Invalid pair: ${pair || "(empty)"}` });
  }

  const listResp = await dashboardFetch("/v1/watchlists", token);
  if (!listResp.ok) return JSON.stringify({ error: `HTTP ${listResp.status}` });
  const lists = (await listResp.json()) as Array<{
    id: string;
    name: string;
    symbols: string[];
  }>;

  let target = lists[0];
  if (!target) {
    const createResp = await dashboardFetch("/v1/watchlists", token, {
      method: "POST",
      body: JSON.stringify({ name: "Voice Watchlist", symbols: [pair] }),
    });
    if (!createResp.ok) return JSON.stringify({ error: `HTTP ${createResp.status}` });
    const created = (await createResp.json()) as { id: string; symbols: string[] };
    return JSON.stringify({
      pinned: pair,
      watchlist_id: created.id.slice(0, 8),
      total_symbols: created.symbols.length,
      created: true,
    });
  }

  if (target.symbols.includes(pair)) {
    return JSON.stringify({
      pinned: pair,
      watchlist_id: target.id.slice(0, 8),
      total_symbols: target.symbols.length,
      already_present: true,
    });
  }

  const nextSymbols = [...target.symbols, pair];
  const putResp = await dashboardFetch(`/v1/watchlists/${target.id}`, token, {
    method: "PUT",
    body: JSON.stringify({ symbols: nextSymbols }),
  });
  if (!putResp.ok) return JSON.stringify({ error: `HTTP ${putResp.status}` });

  return JSON.stringify({
    pinned: pair,
    watchlist_id: target.id.slice(0, 8),
    total_symbols: nextSymbols.length,
  });
}

// MUTATING: remove a currency pair from the user's primary watchlist.
// Find-and-remove flow: GET /v1/watchlists, then PUT with the symbol filtered out.
async function callUnpinPair(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const pair = String(args.pair ?? "").trim().toUpperCase();
  if (!/^[A-Z]{6}$/.test(pair)) {
    return JSON.stringify({ error: `Invalid pair: ${pair || "(empty)"}` });
  }

  const listResp = await dashboardFetch("/v1/watchlists", token);
  if (!listResp.ok) return JSON.stringify({ error: `HTTP ${listResp.status}` });
  const lists = (await listResp.json()) as Array<{
    id: string;
    name: string;
    symbols: string[];
  }>;

  const target = lists[0];
  if (!target) {
    return JSON.stringify({ error: "No watchlist exists" });
  }

  if (!target.symbols.includes(pair)) {
    return JSON.stringify({
      unpinned: pair,
      watchlist_id: target.id.slice(0, 8),
      total_symbols: target.symbols.length,
      not_present: true,
    });
  }

  const nextSymbols = target.symbols.filter((s) => s !== pair);
  const putResp = await dashboardFetch(`/v1/watchlists/${target.id}`, token, {
    method: "PUT",
    body: JSON.stringify({ symbols: nextSymbols }),
  });
  if (!putResp.ok) return JSON.stringify({ error: `HTTP ${putResp.status}` });

  return JSON.stringify({
    unpinned: pair,
    watchlist_id: target.id.slice(0, 8),
    total_symbols: nextSymbols.length,
  });
}

// READ-ONLY: fetch the N most recent voice sessions for the caller's tenant.
// Backend filters by company_id from the JWT — no cross-tenant exposure.
async function callRecallRecentSessions(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const rawLimit = Number(args.limit ?? 3);
  const limit = Math.max(1, Math.min(5, Number.isFinite(rawLimit) ? rawLimit : 3));

  const resp = await dashboardFetch(`/v1/voice/memory/recent?limit=${limit}`, token);
  if (!resp.ok) return JSON.stringify({ error: `HTTP ${resp.status}` });

  const data = await resp.json();
  const items = Array.isArray(data?.sessions) ? data.sessions : [];
  return JSON.stringify({
    count: items.length,
    sessions: items.map((s: Record<string, unknown>) => ({
      session_id: String(s.session_id ?? "").slice(0, 8),
      started_at: s.started_at ?? null,
      ended_at: s.ended_at ?? null,
      last_user_turn: s.last_user_turn ?? null,
      last_assistant_turn: s.last_assistant_turn ?? null,
      tool_calls: s.tool_calls_count ?? 0,
      turns: s.turn_count ?? 0,
    })),
  });
}

// READ-ONLY: fetch the N most recent calculation runs for the caller's company.
async function callGetRecentRuns(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const rawLimit = Number(args.limit ?? 5);
  const limit = Math.max(1, Math.min(20, Number.isFinite(rawLimit) ? rawLimit : 5));

  const resp = await dashboardFetch(`/v1/runs?limit=${limit}`, token);
  if (!resp.ok) return JSON.stringify({ error: `HTTP ${resp.status}` });

  const data = await resp.json();
  const items = Array.isArray(data) ? data : data.items ?? [];
  return JSON.stringify({
    count: items.length,
    runs: items.slice(0, limit).map((r: Record<string, unknown>) => ({
      run_id: String(r.run_id ?? r.id ?? "").slice(0, 8),
      trades: r.trade_count ?? 0,
      hedges: r.hedge_count ?? 0,
      at: r.created_at ?? "—",
    })),
  });
}
