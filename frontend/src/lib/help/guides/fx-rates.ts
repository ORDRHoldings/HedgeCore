import type { GuideDoc } from "@/lib/help/guides/types";

export const FX_RATES: GuideDoc = {
  id: "fx-rates",
  title: "FX Rates",
  summary:
    "Live FX spot rates sourced from Finnhub for 8 major and EM pairs, with forward curve construction, Garman-Kohlhagen option pricing, and covered interest parity. Rates feed the hedge engine as primary pricing inputs.",
  path: "/fx-rates",
  icon: "₿",
  lastReviewed: "2026-02-28",
  relatedIds: ["getting-started", "polisophic", "execution-bridge", "governance"],
  sections: [
    // ─── L1: FX Rates Module ──────────────────────────────────────────────────
    {
      id: "fx-rates-overview",
      heading: "FX Rates Module",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/fx/rates/route.ts", endpoint: "GET /api/market/fx/rates" },
      ],
      blocks: [
        {
          type: "text",
          body: "The FX Rates module provides live mid-market spot rates for 8 currency pairs sourced from Finnhub's forex API. Rates are cached for 60 seconds to minimize API usage while keeping data fresh. When Finnhub is unavailable or the API key is not configured, the system falls back to BIS-calibrated reference rates and displays a SIM DATA badge.",
        },
        {
          type: "table",
          table: {
            headers: ["Data Source", "Endpoint", "Cache TTL", "Fallback"],
            rows: [
              ["Finnhub", "GET /forex/rates?base=USD", "60 seconds", "BIS-calibrated reference rates (static fallback)"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "FX rates are mid-market indicative prices, not tradeable bid/ask quotes. For execution pricing, confirmed dealer quotes must be obtained separately. Configure FINNHUB_API_KEY in the environment to enable live rates.",
          },
        },
      ],
    },

    // ─── L1: Supported Currency Pairs ─────────────────────────────────────────
    {
      id: "fx-rates-pairs",
      heading: "Supported Currency Pairs",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/fx/rates/route.ts" },
        { file: "frontend/src/lib/market/transforms.ts", symbol: "buildFxRates" },
      ],
      blocks: [
        {
          type: "table",
          table: {
            headers: ["Pair", "Convention", "Description", "Pair Type"],
            rows: [
              ["USDMXN", "USD per 1 MXN (indirect)", "US Dollar / Mexican Peso", "EM NDF"],
              ["EURUSD", "EUR per 1 USD (direct)", "Euro / US Dollar", "G10"],
              ["GBPUSD", "GBP per 1 USD (direct)", "British Pound / US Dollar", "G10"],
              ["USDJPY", "USD per 1 JPY (indirect)", "US Dollar / Japanese Yen", "G10"],
              ["USDCAD", "USD per 1 CAD (indirect)", "US Dollar / Canadian Dollar", "G10"],
              ["USDCHF", "USD per 1 CHF (indirect)", "US Dollar / Swiss Franc", "G10"],
              ["AUDUSD", "AUD per 1 USD (direct)", "Australian Dollar / US Dollar", "G10"],
              ["USDCNH", "USD per 1 CNH (indirect)", "US Dollar / Chinese Renminbi Offshore", "EM NDF"],
            ],
          },
        },
      ],
    },

    // ─── L2: Reading FX Rates ─────────────────────────────────────────────────
    {
      id: "fx-rates-reading",
      heading: "Reading FX Rates",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "Each FX rate is displayed as a mid-market price. To interpret the rate correctly, you must understand the quote convention (direct vs indirect) and how bid/ask/mid relate to the market price.",
        },
        {
          type: "field-dict",
          fields: [
            {
              name: "Bid",
              type: "decimal",
              constraints: "> 0",
              meaning: "Price at which a market maker will buy the base currency. The seller receives the bid.",
              example: "EURUSD bid = 1.0820 — dealer buys EUR at 1.0820 USD per EUR",
            },
            {
              name: "Ask",
              type: "decimal",
              constraints: "> bid",
              meaning: "Price at which a market maker will sell the base currency. The buyer pays the ask.",
              example: "EURUSD ask = 1.0822 — dealer sells EUR at 1.0822 USD per EUR",
            },
            {
              name: "Mid",
              type: "decimal",
              constraints: "= (bid + ask) / 2",
              meaning: "Arithmetic midpoint of bid and ask. The rate displayed in ORDR Treasury. Not a tradeable price.",
              example: "EURUSD mid = 1.0821",
            },
            {
              name: "Spread (bps)",
              type: "decimal",
              constraints: "= (ask - bid) / mid × 10000",
              meaning: "Bid-ask spread expressed in basis points. Indicates transaction cost and liquidity.",
              example: "Spread = (1.0822 - 1.0820) / 1.0821 × 10000 ≈ 1.85 bps",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "Direct quote: the domestic currency is quoted per 1 unit of foreign (e.g., EURUSD = 1.0821 means 1 EUR costs 1.0821 USD). Indirect quote: the foreign currency is quoted per 1 unit of domestic (e.g., USDJPY = 150.25 means 1 USD buys 150.25 JPY).",
          },
        },
      ],
    },

    // ─── L2: Forward Points ───────────────────────────────────────────────────
    {
      id: "fx-rates-forward-points",
      heading: "Forward Points",
      level: "L2",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/mathEngine.ts", symbol: "forwardPoints" },
        { file: "frontend/src/lib/mathEngine.ts", symbol: "discreteCIP" },
      ],
      blocks: [
        {
          type: "text",
          body: "Forward rates for FX hedging are constructed from the spot rate plus carry differential (the interest rate difference between the two currencies). Forward points are the difference between the forward rate and the spot rate, expressed in pips.",
        },
        {
          type: "formula",
          formula: {
            label: "Discrete Covered Interest Parity Forward Rate",
            expression: "F(T) = S × (1 + r_quote × T) / (1 + r_base × T)",
            explanation:
              "Where S is the spot rate, r_quote is the interest rate of the quote currency, r_base is the rate of the base currency, and T is the tenor in years. Forward points = F(T) − S.",
            source: "Standard FX theory — Covered Interest Parity (discrete form)",
            codeRef: { file: "frontend/src/lib/mathEngine.ts", symbol: "discreteCIP" },
          },
        },
        {
          type: "text",
          body: "Positive forward points (currency at a forward premium) occur when the quote currency interest rate is higher than the base. Negative forward points (forward discount) occur when the quote rate is lower. For EM pairs such as USDMXN, the carry differential is typically large, producing significant forward points.",
        },
      ],
    },

    // ─── L3: Garman-Kohlhagen Option Pricing ─────────────────────────────────
    {
      id: "fx-rates-gk",
      heading: "Garman-Kohlhagen Option Pricing",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/mathEngine.ts", symbol: "garmanKohlhagen" },
      ],
      blocks: [
        {
          type: "text",
          body: "ORDR Treasury implements Garman-Kohlhagen (1983) for FX option pricing. This is the extension of Black-Scholes for currency options, accounting for both domestic and foreign risk-free rates. Greeks (delta, gamma, vega, theta, rho) are computed analytically.",
        },
        {
          type: "formula",
          formula: {
            label: "Garman-Kohlhagen Call Price",
            expression: "C = S·e^(-rf·T)·N(d₁) - K·e^(-rd·T)·N(d₂)",
            explanation:
              "S = spot rate, K = strike, T = time to expiry (years), rd = domestic risk-free rate, rf = foreign risk-free rate, σ = implied volatility. d₁ = [ln(S/K) + (rd − rf + σ²/2)·T] / (σ·√T), d₂ = d₁ − σ·√T.",
            source: "Garman & Kohlhagen (1983), Journal of International Money and Finance",
            codeRef: { file: "frontend/src/lib/mathEngine.ts", symbol: "garmanKohlhagen" },
          },
        },
        {
          type: "table",
          table: {
            headers: ["Greek", "Expression", "Interpretation"],
            rows: [
              ["Delta (Δ)", "e^(-rf·T) · N(d₁)", "Rate of change of option price per unit change in spot"],
              ["Gamma (Γ)", "e^(-rf·T) · N'(d₁) / (S·σ·√T)", "Rate of change of delta; convexity of option price"],
              ["Vega (ν)", "S·e^(-rf·T) · N'(d₁)·√T / 100", "Sensitivity to 1% change in implied volatility"],
              ["Theta (Θ)", "-(S·e^(-rf·T)·N'(d₁)·σ)/(2·√T) / 365 ± carry", "Time decay per calendar day"],
              ["Rho (ρ)", "K·T·e^(-rd·T)·N(d₂) / 100", "Sensitivity to 1% change in domestic risk-free rate"],
            ],
          },
        },
      ],
    },

    // ─── L3: Covered Interest Parity ─────────────────────────────────────────
    {
      id: "fx-rates-cip",
      heading: "Covered Interest Parity",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/mathEngine.ts", symbol: "continuousCIP" },
        { file: "frontend/src/lib/mathEngine.ts", symbol: "discreteCIP" },
      ],
      blocks: [
        {
          type: "formula",
          formula: {
            label: "Covered Interest Parity (Discrete)",
            expression: "F/S = (1 + r_d × T) / (1 + r_f × T)",
            explanation:
              "The forward rate F is an arbitrage-free relationship anchored to spot rate S and the interest rate differential. Deviations from CIP indicate a CIP basis — elevated during periods of dollar funding stress. T is the tenor in years.",
            source: "Standard FX theory — CIP (discrete form); continuous form: F = S × exp((r_d − r_f) × T)",
            codeRef: { file: "frontend/src/lib/mathEngine.ts", symbol: "discreteCIP" },
          },
        },
        {
          type: "text",
          body: "CIP deviations are monitored in institutional FX desks as an indicator of dollar funding conditions and cross-currency basis swap dynamics. Large, sustained deviations indicate market stress and may affect NDF pricing for EM pairs.",
        },
      ],
    },

    // ─── L4: Data Freshness & Fallback ───────────────────────────────────────
    {
      id: "fx-rates-freshness",
      heading: "Data Freshness & Fallback",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/fx/rates/route.ts", endpoint: "GET /api/market/fx/rates" },
        { file: "frontend/src/lib/market/transforms.ts", symbol: "buildFallbackRates" },
      ],
      blocks: [
        {
          type: "field-dict",
          fields: [
            {
              name: "Cache TTL",
              type: "integer (milliseconds)",
              constraints: "60000 ms = 60 seconds",
              meaning: "In-memory server-side cache duration. Subsequent requests within the TTL are served from cache without calling Finnhub.",
              example: "Cache hit response includes source: 'cache'",
            },
            {
              name: "API Key Absent",
              type: "fallback trigger",
              meaning: "If FINNHUB_API_KEY is not set, buildFallbackRates() is called immediately. A SIM DATA badge is displayed on the frontend.",
              example: "source: 'fallback', reason: 'no_api_key'",
            },
            {
              name: "API Error",
              type: "fallback trigger",
              meaning: "If Finnhub returns an HTTP error or the response is malformed, the fallback rates are served. Timeout is 8 seconds per request.",
              example: "source: 'fallback', error: 'Finnhub HTTP 429'",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "When SIM DATA is displayed, all rates on screen are BIS-calibrated reference values, not live market prices. Do not use SIM DATA rates for execution pricing, position marking, or regulatory reporting.",
          },
        },
      ],
    },

    // ─── L5: Rate Governance ──────────────────────────────────────────────────
    {
      id: "fx-rates-governance",
      heading: "Rate Governance",
      level: "L5",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "FX rates displayed in ORDR Treasury are indicative mid-market prices sourced from Finnhub's public API. They are suitable for exposure analysis, hedge sizing, and risk monitoring. They are not suitable as confirmed execution rates for regulatory reporting or ISDA settlement.",
        },
        {
          type: "table",
          table: {
            headers: ["Use Case", "ORDR FX Rates Suitable?", "Requirement for Suitable Rate"],
            rows: [
              ["Exposure analysis and risk monitoring", "Yes", "Mid-market indicative rates are appropriate"],
              ["Hedge engine input (sandbox)", "Yes", "Indicative rates used for sizing and scenario analysis"],
              ["Regulatory exposure reporting", "No — verify with institution's data vendor", "Approved market data vendor rate required"],
              ["ISDA NDF fixing rate", "No", "ISDA FX Definitions 2002 — specific fixing source (e.g., Banco de México EMTA for MXN)"],
              ["Mark-to-market for financial statements", "No", "Confirmed mid-market rates from approved source at period end"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "For NDF settlement under ISDA FX Definitions 2002, the fixing rate is sourced from the designated fixing agent for each currency (e.g., EMTA MXN survey for USDMXN, SFEMC CNH fixing for USDCNH). ORDR Treasury Finnhub mid-market rates are not a substitute for these fixing sources.",
          },
        },
      ],
    },
  ],
};
