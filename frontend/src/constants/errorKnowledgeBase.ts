/**
 * Error Knowledge Base — rich explanations and resolutions for all V-codes.
 *
 * Each entry provides domain-specific FX hedging context so users understand
 * WHY an error matters and HOW to resolve it. Used by BackendErrorBanner
 * and ValidationSummary for expandable error detail panels.
 */

/* ------------------------------------------------------------------ */
/*  Resolve action types                                               */
/* ------------------------------------------------------------------ */

export type ResolveActionType =
  | 'auto_resolve'      // Re-fetch market data + recalculate
  | 'edit_trade'        // Open TradeModal at parsed index
  | 'edit_hedge'        // Open HedgeModal at parsed index
  | 'remove_duplicate'  // Remove duplicate entry (with confirmation)
  | 'navigate_policy'   // Navigate to policy step
  | 'navigate_market'   // Trigger market autofill
  | 'add_trades';       // Navigate to exposure + scroll to add form

export interface ResolveAction {
  type: ResolveActionType;
  /** Button label (e.g. "FIX TRADE", "GO TO POLICY") */
  buttonLabel: string;
  /** Optional icon prefix character for the button */
  buttonIcon?: string;
  /** For dual-action errors (duplicates): secondary button label */
  secondaryLabel?: string;
  /** For dual-action errors: secondary action type */
  secondaryType?: ResolveActionType;
}

/* ------------------------------------------------------------------ */
/*  Error knowledge entry                                              */
/* ------------------------------------------------------------------ */

export interface ErrorKnowledge {
  /** Short human-readable title (5-10 words) */
  title: string;
  /** WHY this error matters — domain context (2-3 sentences) */
  explanation: string;
  /** HOW to fix — specific, actionable guidance */
  resolution: string;
  /** Whether the engine auto-resolves this via market data fetch on Generate */
  autoResolved: boolean;
  /** Which wizard step the user should navigate to for fixing */
  targetStep: 'exposure' | 'market' | 'policy' | 'hedges';
  /** Actionable resolution button metadata */
  resolveAction: ResolveAction;
}

/* ------------------------------------------------------------------ */
/*  Knowledge base entries                                             */
/* ------------------------------------------------------------------ */

export const ERROR_KNOWLEDGE_BASE: Record<string, ErrorKnowledge> = {

  'V-001': {
    title: 'Zero or Negative Trade Amount',
    explanation:
      'Every trade position must have a positive notional amount representing the commercial cash flow to be hedged. '
      + 'A zero or negative value means the hedging engine cannot calculate the correct forward coverage for this '
      + 'bucket, which would produce incorrect hedge ratios and potentially leave the position fully unhedged.',
    resolution:
      'Open the Exposure Intake table and locate the flagged trade row. Edit the Amount field to a positive value '
      + 'representing the expected cash flow in the trade currency. If the amount is genuinely zero, remove the '
      + 'trade row entirely rather than keeping a zero-notional position.',
    autoResolved: false,
    targetStep: 'exposure',
    resolveAction: { type: 'edit_trade', buttonLabel: 'FIX TRADE', buttonIcon: '\u270E' },
  },

  'V-002': {
    title: 'Unsupported Currency Code',
    explanation:
      'The trade currency must be one of the 26 CME/ICE futures-listed currencies (e.g. MXN, BRL, EUR, JPY). '
      + 'The hedging engine uses exchange-listed forward curves to price NDF and deliverable forward instruments. '
      + 'A currency not on the futures list has no available forward points, so no hedge can be structured.',
    resolution:
      'Check the Currency column in the flagged trade row. Ensure the 3-letter ISO code is uppercase and matches '
      + 'a supported code (MXN, BRL, CLP, COP, EUR, GBP, JPY, AUD, CAD, CHF, etc.). If you uploaded a CSV, verify '
      + 'the currency column has no extra whitespace or lowercase letters.',
    autoResolved: false,
    targetStep: 'exposure',
    resolveAction: { type: 'edit_trade', buttonLabel: 'FIX TRADE', buttonIcon: '\u270E' },
  },

  'V-003': {
    title: 'Invalid Trade Type (Not AR/AP)',
    explanation:
      'Each trade must be classified as either AR (Accounts Receivable \u2014 you will receive foreign currency) or '
      + 'AP (Accounts Payable \u2014 you will pay foreign currency). This classification determines the hedge direction: '
      + 'AR exposures are hedged by selling the foreign currency forward, AP exposures by buying it forward. '
      + 'Without a valid type, the engine cannot determine which side of the forward contract to recommend.',
    resolution:
      'Open the trade row and set the Type field to either "AR" or "AP". AR = you expect to receive the currency '
      + '(e.g., export receivables). AP = you expect to pay the currency (e.g., import payables). If your CSV has '
      + 'different labels (like "RECEIVABLE"/"PAYABLE"), map them to AR/AP before upload.',
    autoResolved: false,
    targetStep: 'exposure',
    resolveAction: { type: 'edit_trade', buttonLabel: 'FIX TRADE', buttonIcon: '\u270E' },
  },

  'V-004': {
    title: 'Invalid Trade Status',
    explanation:
      'Trades must be either CONFIRMED (firm, contractually committed cash flows) or FORECAST (projected but not '
      + 'yet committed). The hedge policy applies different coverage ratios to each: confirmed exposures are typically '
      + 'hedged at a higher ratio (e.g., 80-100%) while forecasts are hedged conservatively (e.g., 40-60%). '
      + 'An invalid status means the engine cannot apply the correct policy-mandated hedge ratio.',
    resolution:
      'Edit the Status field on the flagged trade to either "CONFIRMED" or "FORECAST". CONFIRMED = the underlying '
      + 'commercial transaction is contractually committed. FORECAST = the cash flow is projected based on sales '
      + 'pipeline or budget. If uncertain, use FORECAST for conservative hedging.',
    autoResolved: false,
    targetStep: 'exposure',
    resolveAction: { type: 'edit_trade', buttonLabel: 'FIX TRADE', buttonIcon: '\u270E' },
  },

  'V-005': {
    title: 'Value Date in the Past',
    explanation:
      'This trade has a settlement date that has already passed relative to the market snapshot timestamp. '
      + 'A past-dated trade cannot be hedged with a forward contract because the delivery date is in the past. '
      + 'While this is a warning (not blocking), the trade will still be counted in exposure calculations '
      + 'but any recommended hedge for its bucket would be economically meaningless.',
    resolution:
      'Either remove the past-dated trade from the exposure set (it has already settled), or update the Value Date '
      + 'to a future date if the settlement was delayed. If you intentionally include historical trades for reporting '
      + 'context, this warning can be safely acknowledged.',
    autoResolved: false,
    targetStep: 'exposure',
    resolveAction: { type: 'edit_trade', buttonLabel: 'EDIT TRADE', buttonIcon: '\u270E' },
  },

  'V-006': {
    title: 'Duplicate Trade Record ID',
    explanation:
      'Each trade must have a unique Record ID to ensure the hedging engine does not double-count exposure. '
      + 'Duplicate IDs cause the same commercial cash flow to appear twice, inflating the bucket exposure and '
      + 'leading to over-hedging. This is a critical data integrity issue that can result in taking on twice '
      + 'the intended forward position.',
    resolution:
      'Search the exposure table for the duplicate Record ID shown in the error. Remove the duplicate row, or '
      + 'if both rows represent distinct transactions, assign a unique Record ID to each. When uploading CSV data, '
      + 'ensure your source system exports unique identifiers per trade.',
    autoResolved: false,
    targetStep: 'exposure',
    resolveAction: {
      type: 'remove_duplicate',
      buttonLabel: 'REMOVE DUPLICATE',
      buttonIcon: '\u2717',
      secondaryLabel: 'EDIT TRADE',
      secondaryType: 'edit_trade',
    },
  },

  'V-007': {
    title: 'Zero or Negative Hedge Notional',
    explanation:
      'An existing hedge position must have a positive notional amount. The notional represents the face value '
      + 'of the forward or NDF contract already in place. A zero or negative notional makes it impossible for the '
      + 'engine to calculate how much residual exposure remains after netting against existing hedges.',
    resolution:
      'Edit the hedge entry and set the Notional field to the actual contract face value (positive number). '
      + 'If the hedge has been unwound or cancelled, remove the entry from the hedges table rather than setting '
      + 'the notional to zero.',
    autoResolved: false,
    targetStep: 'hedges',
    resolveAction: { type: 'edit_hedge', buttonLabel: 'FIX HEDGE', buttonIcon: '\u270E' },
  },

  'V-008': {
    title: 'Invalid Hedge Direction',
    explanation:
      'Each existing hedge must specify its direction as either SELL_MXN_BUY_USD (hedging receivables \u2014 selling '
      + 'local currency forward to lock in the exchange rate) or BUY_MXN_SELL_USD (hedging payables \u2014 buying local '
      + 'currency forward). The direction is essential for netting: the engine subtracts same-direction hedges from '
      + 'commercial exposure to calculate the residual that still needs hedging.',
    resolution:
      'Set the Direction field to either "SELL_MXN_BUY_USD" or "BUY_MXN_SELL_USD". For AR (receivable) hedges '
      + 'where you sold forward to lock in a rate, use SELL_MXN_BUY_USD. For AP (payable) hedges where you bought '
      + 'forward, use BUY_MXN_SELL_USD.',
    autoResolved: false,
    targetStep: 'hedges',
    resolveAction: { type: 'edit_hedge', buttonLabel: 'FIX HEDGE', buttonIcon: '\u270E' },
  },

  'V-009': {
    title: 'Invalid Hedge Instrument Type',
    explanation:
      'Hedges must use either NDF (Non-Deliverable Forward \u2014 settled in USD based on the fixing rate difference) '
      + 'or FWD (Deliverable Forward \u2014 physical exchange of currencies at maturity). The instrument type affects '
      + 'cost calculations: NDFs have no principal exchange risk but may have wider bid-ask spreads, while '
      + 'deliverable forwards involve actual currency delivery and different credit considerations.',
    resolution:
      'Set the Instrument field to either "NDF" or "FWD". Use NDF for currencies with restricted deliverability '
      + '(e.g., BRL, CLP, COP, KRW) or when your treasury policy prefers cash-settled instruments. Use FWD for '
      + 'freely deliverable currency pairs (e.g., EUR, GBP, JPY) where physical settlement is desired.',
    autoResolved: false,
    targetStep: 'hedges',
    resolveAction: { type: 'edit_hedge', buttonLabel: 'FIX HEDGE', buttonIcon: '\u270E' },
  },

  'V-010': {
    title: 'Duplicate Hedge ID',
    explanation:
      'Each existing hedge must have a unique Hedge ID. Duplicate IDs cause the engine to double-count the hedge '
      + 'notional against the bucket exposure, making it appear that more hedging is already in place than actually '
      + 'exists. This leads to under-hedging recommendations and leaves the portfolio exposed.',
    resolution:
      'Find the duplicate Hedge ID in the hedges table and either remove the duplicate entry or assign a unique '
      + 'identifier to each distinct hedge contract. Cross-reference with your deal blotter or trade management '
      + 'system to ensure 1:1 mapping between Hedge IDs and actual forward contracts.',
    autoResolved: false,
    targetStep: 'hedges',
    resolveAction: {
      type: 'remove_duplicate',
      buttonLabel: 'REMOVE DUPLICATE',
      buttonIcon: '\u2717',
      secondaryLabel: 'EDIT HEDGE',
      secondaryType: 'edit_hedge',
    },
  },

  'V-011': {
    title: 'Spot Rate Outside Valid Range',
    explanation:
      'The spot exchange rate falls outside the plausible range for the detected currency pair. This sanity check '
      + 'prevents catastrophic pricing errors \u2014 for example, entering a USD/MXN rate of 1.70 (which is EUR/USD '
      + 'scale) instead of 17.0 would cause the engine to recommend hedge notionals that are off by an order of '
      + 'magnitude. The valid range is determined dynamically based on the currencies in your trade set.',
    resolution:
      'The spot rate is auto-fetched when you click Generate. If this error persists, check the spot rate in the '
      + 'Market Snapshot panel. Ensure the value uses the correct quote convention (e.g., USD/MXN ~ 17-21, '
      + 'USD/BRL ~ 4.5-6.5). If entering manually, verify you are using the mid-market rate, not a bid or offer '
      + 'that may fall outside the expected range.',
    autoResolved: true,
    targetStep: 'market',
    resolveAction: { type: 'auto_resolve', buttonLabel: 'AUTO-RESOLVE', buttonIcon: '\u27F3' },
  },

  'V-012': {
    title: 'Forward Points Map is Empty',
    explanation:
      'The forward points curve has no entries. Forward points represent the interest rate differential between '
      + 'the two currencies at each tenor and are essential for pricing forward contracts. Without forward points, '
      + 'the engine cannot calculate the all-in forward rate for any bucket, meaning it cannot generate hedge '
      + 'tickets with economically meaningful strike prices.',
    resolution:
      'The forward curve is auto-populated when you click Generate. If this error persists after a retry, ensure '
      + 'your trade value dates span at least one future month. You can also manually enter forward points in the '
      + 'Market Snapshot panel by adding entries for each YYYY-MM bucket that your trades settle in.',
    autoResolved: true,
    targetStep: 'market',
    resolveAction: { type: 'auto_resolve', buttonLabel: 'AUTO-RESOLVE', buttonIcon: '\u27F3' },
  },

  'V-013': {
    title: 'Invalid Bucket Key Format',
    explanation:
      'Forward points must be keyed by monthly buckets in YYYY-MM format (e.g., "2026-03", "2026-12"). The engine '
      + 'maps each trade to its settlement month and looks up the corresponding forward points. An improperly '
      + 'formatted key like "Mar-2026" or "2026/03" will not match any trade bucket, leaving those tenors unpriced.',
    resolution:
      'If entering forward points manually, ensure each key follows the YYYY-MM pattern exactly: 4-digit year, '
      + 'a hyphen, then 2-digit month (01-12). Examples: "2026-01", "2026-06", "2026-12". Do not use month names, '
      + 'slashes, or single-digit months. If data was imported from a spreadsheet, check for date formatting issues.',
    autoResolved: false,
    targetStep: 'market',
    resolveAction: { type: 'navigate_market', buttonLabel: 'FIX MARKET DATA', buttonIcon: '\u2192' },
  },

  'V-014': {
    title: 'Trade Bucket Missing Forward Points',
    explanation:
      'A trade settles in a month (bucket) for which no forward points exist in the market snapshot. Without the '
      + 'forward points for that specific tenor, the engine cannot calculate the forward exchange rate, and thus '
      + 'cannot generate a hedge ticket for that bucket. The trade exposure will remain unhedged in the output.',
    resolution:
      'This is auto-resolved: when you click Generate, the engine fetches forward points for all required buckets '
      + 'from live market data. If the error persists, verify the trade Value Date is correct and the month falls '
      + 'within available forward curve tenors (usually up to 12-24 months out). For very long-dated exposures, '
      + 'forward points may not be available from the market data provider.',
    autoResolved: true,
    targetStep: 'market',
    resolveAction: { type: 'auto_resolve', buttonLabel: 'AUTO-RESOLVE', buttonIcon: '\u27F3' },
  },

  'V-015': {
    title: 'Hedge Bucket Missing Forward Points',
    explanation:
      'An existing hedge has a maturity date in a month that has no forward points in the current market snapshot. '
      + 'While the engine can still net this hedge against the exposure, it cannot accurately mark-to-market the '
      + 'position or compute the residual in forward-rate terms. This is a warning, not a blocking error, but it '
      + 'degrades the accuracy of cost and P&L projections for that bucket.',
    resolution:
      'Add a forward points entry for the missing month in the Market Snapshot panel, or verify the hedge Value Date '
      + 'is correct. If the hedge is a legacy position with a maturity far in the past or future, consider whether '
      + 'it should still be included in the active hedge set.',
    autoResolved: false,
    targetStep: 'market',
    resolveAction: { type: 'navigate_market', buttonLabel: 'FIX MARKET DATA', buttonIcon: '\u2192' },
  },

  'V-016': {
    title: 'Hedge Ratio Outside 0-100% Range',
    explanation:
      'Hedge ratios must be between 0 (no hedging) and 1 (100% coverage). A ratio above 1.0 means over-hedging '
      + '(taking on speculative forward positions beyond the commercial exposure), which most corporate treasury '
      + 'policies explicitly prohibit. A negative ratio is mathematically meaningless. The engine uses these ratios '
      + 'to multiply the net exposure in each bucket to determine the target hedge notional.',
    resolution:
      'Open the Hedge Policy step and adjust the hedge ratios. Set the Confirmed ratio to a value between 0 and 1 '
      + '(e.g., 0.80 for 80% coverage of confirmed flows). Set the Forecast ratio similarly but typically lower '
      + '(e.g., 0.50 for 50%). Alternatively, select a pre-built policy preset which has validated ratios.',
    autoResolved: false,
    targetStep: 'policy',
    resolveAction: { type: 'navigate_policy', buttonLabel: 'GO TO POLICY', buttonIcon: '\u2192' },
  },

  'V-017': {
    title: 'Negative Minimum Trade Size',
    explanation:
      'The minimum trade size threshold determines the smallest hedge ticket the engine will generate. Buckets '
      + 'whose recommended hedge falls below this threshold are suppressed to avoid uneconomical small trades that '
      + 'incur disproportionate transaction costs. A negative value is invalid and would cause the suppression '
      + 'logic to malfunction, potentially generating micro-sized trades.',
    resolution:
      'Set the Minimum Trade Size to 0 or a positive value in the Hedge Policy step. Typical corporate minimums '
      + 'are $25,000-$100,000 USD equivalent, depending on your bank counterparty relationships and transaction '
      + 'cost tolerance. Setting to 0 means no suppression (all buckets generate tickets regardless of size).',
    autoResolved: false,
    targetStep: 'policy',
    resolveAction: { type: 'navigate_policy', buttonLabel: 'GO TO POLICY', buttonIcon: '\u2192' },
  },

  'V-018': {
    title: 'Negative Bid-Ask Spread',
    explanation:
      'The spread assumption (in basis points) estimates transaction costs for each hedge ticket. The engine adds '
      + 'this spread to the mid-market forward rate to compute an all-in cost. A negative spread implies the trader '
      + 'is receiving a better rate than mid-market, which is unrealistic for cost estimation and would understate '
      + 'the true cost of the hedging program.',
    resolution:
      'Set the Spread (bps) to 0 or a positive value in the Hedge Policy step under Cost Assumptions. Typical NDF '
      + 'spreads for EM currencies (MXN, BRL) are 3-15 bps depending on tenor and notional size. For G10 '
      + 'deliverable forwards (EUR, GBP) spreads are usually 0.5-3 bps. Set to 0 to exclude transaction costs.',
    autoResolved: false,
    targetStep: 'policy',
    resolveAction: { type: 'navigate_policy', buttonLabel: 'GO TO POLICY', buttonIcon: '\u2192' },
  },

  'V-019': {
    title: 'No Trade Positions Loaded',
    explanation:
      'The hedging engine requires at least one trade (commercial cash flow) to generate a hedge plan. Trades '
      + 'represent the underlying business exposures \u2014 receivables or payables in foreign currency \u2014 that the '
      + 'hedge program is designed to protect. Without any trades, there is nothing to hedge.',
    resolution:
      'Add trade positions using one of these methods: (1) Click "+ ADD POSITION" to manually enter a position '
      + 'with Record ID, Entity, Type (AR/AP), Currency, Amount, Value Date, and Status. (2) Use "Import CSV" to '
      + 'upload a CSV file with your exposure data. (3) Select a demo fixture from the Dataset Selector above.',
    autoResolved: false,
    targetStep: 'exposure',
    resolveAction: { type: 'add_trades', buttonLabel: 'ADD TRADES', buttonIcon: '+' },
  },

  'V-021': {
    title: 'Forward Points Value Too Large (Pips Format Detected)',
    explanation:
      'The forward points value exceeds the maximum absolute threshold, suggesting it was entered in pips (e.g., '
      + '1500) rather than in decimal format (e.g., 0.1500). The engine expects forward points as the decimal '
      + 'offset added to the spot rate. Pips-scale values would produce wildly incorrect forward rates \u2014 for '
      + 'example, a spot of 17.50 plus 1500 would give a forward of 1517.50 instead of the intended 17.65.',
    resolution:
      'Convert the forward points from pips to decimal format by dividing by 10,000. Example: if your source '
      + 'shows 1500 pips for 6-month USD/MXN, enter 0.1500 instead. The market auto-fetch provides values in the '
      + 'correct decimal format automatically. Verify: spot (17.50) + fwd points (0.15) = outright forward (17.65).',
    autoResolved: false,
    targetStep: 'market',
    resolveAction: { type: 'navigate_market', buttonLabel: 'FIX MARKET DATA', buttonIcon: '\u2192' },
  },
};

/** Set of V-codes that are auto-resolved by the market auto-fetch on Generate */
export const AUTO_RESOLVED_CODES = new Set(
  Object.entries(ERROR_KNOWLEDGE_BASE)
    .filter(([, v]) => v.autoResolved)
    .map(([k]) => k),
);

/* ------------------------------------------------------------------ */
/*  Field-index parser utilities                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse the array index from a validation error field string.
 * Examples: "trades[2].amount" => 2, "hedges[0].notional_mxn" => 0
 */
export function parseFieldIndex(field: string): number | undefined {
  const match = field.match(/\[(\d+)\]/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Determine whether the field references trades, hedges, market, or policy.
 */
export function parseFieldTarget(field: string): 'trades' | 'hedges' | 'market' | 'policy' | undefined {
  if (field.startsWith('trades')) return 'trades';
  if (field.startsWith('hedges')) return 'hedges';
  if (field.startsWith('market')) return 'market';
  if (field.startsWith('policy')) return 'policy';
  return undefined;
}
