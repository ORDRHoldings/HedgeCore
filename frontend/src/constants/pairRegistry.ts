/**
 * pairRegistry.ts — ORDR Terminal Multi-Currency Pair Registry
 * 26 FX pairs across G10, EM_LATAM, EM_ASIA, EM_CEEMEA
 */

export type PairGroup = "G10" | "EM_LATAM" | "EM_ASIA" | "EM_CEEMEA";
export type SettlementType = "DELIVERABLE" | "NDF";
export type ForwardPointFormat = "ADDITIVE" | "PERCENTAGE";

export interface PairMeta {
  id: string;              // "EURUSD"
  group: PairGroup;
  label: string;           // "EUR/USD"
  localCcy: string;        // local (non-USD) currency
  termCcy: string;         // always "USD" for USD pairs
  isNdf: boolean;
  settlementType: SettlementType;
  forwardPointFormat: ForwardPointFormat;
  /** True if quoted as 1 LOCAL = X USD (e.g. EURUSD, GBPUSD) */
  isInverted: boolean;
  /** Typical daily volume in USD millions */
  adv_mn: number;
  /** Typical 1M implied vol % */
  vol1m: number;
}

export const PAIR_REGISTRY: PairMeta[] = [
  // ── G10 ──────────────────────────────────────────────────────────────────
  { id: "EURUSD",  group: "G10",      label: "EUR/USD", localCcy: "EUR", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: true,  adv_mn: 500_000, vol1m: 7.8  },
  { id: "GBPUSD",  group: "G10",      label: "GBP/USD", localCcy: "GBP", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: true,  adv_mn: 300_000, vol1m: 8.2  },
  { id: "USDJPY",  group: "G10",      label: "USD/JPY", localCcy: "JPY", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 400_000, vol1m: 9.5  },
  { id: "USDCHF",  group: "G10",      label: "USD/CHF", localCcy: "CHF", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 120_000, vol1m: 7.1  },
  { id: "USDCAD",  group: "G10",      label: "USD/CAD", localCcy: "CAD", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 180_000, vol1m: 7.4  },
  { id: "AUDUSD",  group: "G10",      label: "AUD/USD", localCcy: "AUD", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: true,  adv_mn: 200_000, vol1m: 10.2 },
  { id: "NZDUSD",  group: "G10",      label: "NZD/USD", localCcy: "NZD", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: true,  adv_mn: 50_000,  vol1m: 11.0 },
  { id: "USDSEK",  group: "G10",      label: "USD/SEK", localCcy: "SEK", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 40_000,  vol1m: 8.9  },
  { id: "USDNOK",  group: "G10",      label: "USD/NOK", localCcy: "NOK", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 35_000,  vol1m: 9.8  },
  { id: "USDDKK",  group: "G10",      label: "USD/DKK", localCcy: "DKK", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 25_000,  vol1m: 5.2  },
  // ── EM_LATAM ──────────────────────────────────────────────────────────────
  { id: "USDMXN",  group: "EM_LATAM", label: "USD/MXN", localCcy: "MXN", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 50_000,  vol1m: 12.5 },
  { id: "USDBRL",  group: "EM_LATAM", label: "USD/BRL", localCcy: "BRL", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 30_000,  vol1m: 16.8 },
  { id: "USDCOP",  group: "EM_LATAM", label: "USD/COP", localCcy: "COP", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 5_000,   vol1m: 14.2 },
  { id: "USDCLP",  group: "EM_LATAM", label: "USD/CLP", localCcy: "CLP", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 4_000,   vol1m: 13.6 },
  { id: "USDPEN",  group: "EM_LATAM", label: "USD/PEN", localCcy: "PEN", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 3_000,   vol1m: 11.0 },
  // ── EM_ASIA ───────────────────────────────────────────────────────────────
  { id: "USDINR",  group: "EM_ASIA",  label: "USD/INR", localCcy: "INR", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 50_000,  vol1m: 4.2  },
  { id: "USDKRW",  group: "EM_ASIA",  label: "USD/KRW", localCcy: "KRW", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 60_000,  vol1m: 8.1  },
  { id: "USDTWD",  group: "EM_ASIA",  label: "USD/TWD", localCcy: "TWD", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 20_000,  vol1m: 3.8  },
  { id: "USDPHP",  group: "EM_ASIA",  label: "USD/PHP", localCcy: "PHP", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 8_000,   vol1m: 6.5  },
  { id: "USDIDR",  group: "EM_ASIA",  label: "USD/IDR", localCcy: "IDR", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 12_000,  vol1m: 7.2  },
  { id: "USDTHB",  group: "EM_ASIA",  label: "USD/THB", localCcy: "THB", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 10_000,  vol1m: 5.9  },
  { id: "USDMYR",  group: "EM_ASIA",  label: "USD/MYR", localCcy: "MYR", termCcy: "USD", isNdf: true,  settlementType: "NDF",         forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 8_000,   vol1m: 6.4  },
  // ── EM_CEEMEA ─────────────────────────────────────────────────────────────
  { id: "USDZAR",  group: "EM_CEEMEA",label: "USD/ZAR", localCcy: "ZAR", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 15_000,  vol1m: 16.0 },
  { id: "USDTRY",  group: "EM_CEEMEA",label: "USD/TRY", localCcy: "TRY", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 10_000,  vol1m: 22.0 },
  { id: "USDPLN",  group: "EM_CEEMEA",label: "USD/PLN", localCcy: "PLN", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 8_000,   vol1m: 9.5  },
  { id: "USDHUF",  group: "EM_CEEMEA",label: "USD/HUF", localCcy: "HUF", termCcy: "USD", isNdf: false, settlementType: "DELIVERABLE", forwardPointFormat: "ADDITIVE",   isInverted: false, adv_mn: 6_000,   vol1m: 10.2 },
];

/** Lookup by pair ID */
export function getPairMeta(id: string): PairMeta | undefined {
  return PAIR_REGISTRY.find(p => p.id === id);
}

/** All pairs in a given group */
export function getPairsByGroup(group: PairGroup): PairMeta[] {
  return PAIR_REGISTRY.filter(p => p.group === group);
}

/** All NDF pairs */
export function getNdfPairs(): PairMeta[] {
  return PAIR_REGISTRY.filter(p => p.isNdf);
}

/** Group labels for display */
export const GROUP_LABELS: Record<PairGroup, string> = {
  G10:       "G10",
  EM_LATAM:  "EM · Latin America",
  EM_ASIA:   "EM · Asia",
  EM_CEEMEA: "EM · CEEMEA",
};
