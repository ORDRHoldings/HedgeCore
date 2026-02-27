/**
 * cmeContracts.ts — CME Group FX Futures contract specifications
 *
 * Reference: CME Group product specifications
 * Used by the Execution Desk to convert hedge plan notional amounts
 * into actual futures contract quantities for IBKR order tickets.
 */

export interface CMEContractSpec {
  symbol: string;       // CME Globex code: "6E", "6B", etc.
  name: string;         // Full contract name
  exchange: "CME";
  contractSize: number; // Units of foreign currency per contract
  currency: string;     // Foreign currency code
  tickSize: number;     // Minimum price increment
  tickValue: number;    // USD value per tick
  months: string[];     // Contract month codes (H=Mar, M=Jun, U=Sep, Z=Dec)
}

export const CME_CONTRACTS: Record<string, CMEContractSpec> = {
  EUR: { symbol: "6E", name: "Euro FX Futures",             exchange: "CME", contractSize: 125_000,     currency: "EUR", tickSize: 0.00005,   tickValue: 6.25,  months: ["H","M","U","Z"] },
  GBP: { symbol: "6B", name: "British Pound Futures",       exchange: "CME", contractSize: 62_500,      currency: "GBP", tickSize: 0.0001,    tickValue: 6.25,  months: ["H","M","U","Z"] },
  JPY: { symbol: "6J", name: "Japanese Yen Futures",        exchange: "CME", contractSize: 12_500_000,  currency: "JPY", tickSize: 0.0000005, tickValue: 6.25,  months: ["H","M","U","Z"] },
  CAD: { symbol: "6C", name: "Canadian Dollar Futures",     exchange: "CME", contractSize: 100_000,     currency: "CAD", tickSize: 0.00005,   tickValue: 5.00,  months: ["H","M","U","Z"] },
  AUD: { symbol: "6A", name: "Australian Dollar Futures",   exchange: "CME", contractSize: 100_000,     currency: "AUD", tickSize: 0.0001,    tickValue: 10.00, months: ["H","M","U","Z"] },
  MXN: { symbol: "6M", name: "Mexican Peso Futures",       exchange: "CME", contractSize: 500_000,     currency: "MXN", tickSize: 0.00001,   tickValue: 5.00,  months: ["H","M","U","Z"] },
  BRL: { symbol: "6L", name: "Brazilian Real Futures",      exchange: "CME", contractSize: 100_000,     currency: "BRL", tickSize: 0.00005,   tickValue: 5.00,  months: ["H","M","U","Z"] },
  CHF: { symbol: "6S", name: "Swiss Franc Futures",         exchange: "CME", contractSize: 125_000,     currency: "CHF", tickSize: 0.0001,    tickValue: 12.50, months: ["H","M","U","Z"] },
  NZD: { symbol: "6N", name: "New Zealand Dollar Futures",  exchange: "CME", contractSize: 100_000,     currency: "NZD", tickSize: 0.0001,    tickValue: 10.00, months: ["H","M","U","Z"] },
};

/** Currencies without CME-listed futures → hedge via OTC NDF/FWD */
export const OTC_ONLY_CURRENCIES = [
  "CNY", "INR", "KRW", "TWD", "HKD", "SGD",
  "SEK", "NOK", "DKK", "PLN", "CZK", "HUF",
  "ZAR", "TRY", "RUB", "CLP", "COP",
];

/** CME contract month codes → full names */
const MONTH_MAP: Record<string, string> = {
  H: "Mar", M: "Jun", U: "Sep", Z: "Dec",
};

/**
 * Find the nearest CME quarterly contract month on or after a given date.
 * Returns e.g. "Jun 2026" or "Sep 2026".
 */
export function nearestContractMonth(valueDate: string): string {
  const d = new Date(valueDate);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12

  // CME quarterly months: 3, 6, 9, 12
  const quarters = [3, 6, 9, 12];
  for (const q of quarters) {
    if (q >= month) {
      const name = MONTH_MAP[["H","M","U","Z"][quarters.indexOf(q)]];
      return `${name} ${year}`;
    }
  }
  // Past Dec → Mar next year
  return `Mar ${year + 1}`;
}
