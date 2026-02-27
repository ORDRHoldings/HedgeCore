/**
 * contractSizing.ts — Convert hedge plan notional → futures contract tickets
 *
 * Takes the output of the hedge calculation engine (per-bucket notional amounts)
 * and converts them into specific CME futures contract quantities with full
 * broker-ready specifications.
 */

import { CME_CONTRACTS, OTC_ONLY_CURRENCIES, nearestContractMonth } from "@/lib/constants/cmeContracts";
import type { CMEContractSpec } from "@/lib/constants/cmeContracts";
import type { PositionRow } from "@/api/positionClient";

export interface FuturesTicket {
  positionId: string;
  recordId: string;
  entity: string;
  currency: string;
  side: "BUY" | "SELL";
  contracts: number;
  contractSize: number;
  totalCovered: number;       // contracts × contractSize
  residual: number;           // abs(notional) − totalCovered
  symbol: string;             // CME Globex code (e.g. "6E")
  contractName: string;       // Full name (e.g. "Euro FX Futures")
  exchange: string;
  estimatedRate: number;
  settlementMonth: string;    // e.g. "Jun 2026"
  instrumentType: "FUTURES" | "NDF" | "FWD";
  estimatedCostUsd: number;
  notional: number;           // Original position amount
}

/**
 * Determine side based on position type and direction:
 * - AR (receivable in foreign ccy) → we'll receive foreign ccy → SELL futures to hedge
 * - AP (payable in foreign ccy) → we'll pay foreign ccy → BUY futures to hedge
 */
function deriveSide(flowType: "AR" | "AP"): "BUY" | "SELL" {
  return flowType === "AR" ? "SELL" : "BUY";
}

/**
 * Convert a single position's hedge requirement into a futures ticket.
 *
 * @param position  The position to hedge
 * @param forwardRate  Forward rate from engine (or spot if unavailable)
 * @param frictionUsd  Estimated transaction cost from engine
 */
export function computeFuturesTicket(
  position: PositionRow,
  forwardRate: number = 1.0,
  frictionUsd: number = 0,
): FuturesTicket {
  const currency = position.currency;
  const notional = Math.abs(position.amount);
  const side = deriveSide(position.type);
  const spec: CMEContractSpec | undefined = CME_CONTRACTS[currency];

  if (spec && !OTC_ONLY_CURRENCIES.includes(currency)) {
    // CME-listed currency → compute contract count
    const contracts = Math.round(notional / spec.contractSize);
    const totalCovered = contracts * spec.contractSize;
    const residual = notional - totalCovered;

    return {
      positionId: position.id,
      recordId: position.record_id,
      entity: position.entity,
      currency,
      side,
      contracts: Math.max(contracts, 0),
      contractSize: spec.contractSize,
      totalCovered,
      residual: Math.abs(residual),
      symbol: spec.symbol,
      contractName: spec.name,
      exchange: spec.exchange,
      estimatedRate: forwardRate,
      settlementMonth: nearestContractMonth(position.value_date),
      instrumentType: "FUTURES",
      estimatedCostUsd: frictionUsd,
      notional,
    };
  }

  // OTC-only currency → NDF/FWD
  return {
    positionId: position.id,
    recordId: position.record_id,
    entity: position.entity,
    currency,
    side,
    contracts: 0,
    contractSize: 0,
    totalCovered: 0,
    residual: 0,
    symbol: `${currency}/USD NDF`,
    contractName: `${currency} Non-Deliverable Forward`,
    exchange: "OTC",
    estimatedRate: forwardRate,
    settlementMonth: nearestContractMonth(position.value_date),
    instrumentType: "NDF",
    estimatedCostUsd: frictionUsd,
    notional,
  };
}

/**
 * Batch convert all positions into futures tickets.
 */
export function computeAllTickets(
  positions: PositionRow[],
  forwardRates?: Record<string, number>,
  frictionCosts?: Record<string, number>,
): FuturesTicket[] {
  return positions.map((p) =>
    computeFuturesTicket(
      p,
      forwardRates?.[p.id] ?? forwardRates?.[p.currency] ?? 1.0,
      frictionCosts?.[p.id] ?? 0,
    )
  );
}

/** Format ticket as one-line summary: "SELL 4×6E EUR @ 1.0850 Jun 2026" */
export function formatTicketSummary(t: FuturesTicket): string {
  if (t.instrumentType === "FUTURES") {
    return `${t.side} ${t.contracts}×${t.symbol} ${t.currency} @ ${t.estimatedRate.toFixed(4)} ${t.settlementMonth}`;
  }
  return `${t.side} ${fmtNum(t.notional)} ${t.currency} NDF @ ${t.estimatedRate.toFixed(4)} ${t.settlementMonth}`;
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
