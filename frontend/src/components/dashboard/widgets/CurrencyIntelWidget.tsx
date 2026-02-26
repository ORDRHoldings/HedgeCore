"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Globe2,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  X,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  green: "var(--status-pass,#15803D)",
  red: "var(--accent-red,#B91C1C)",
} as const;

/* ─── Static intelligence data (POLISOPHIC integration point) ──────────── */
/* When POLISOPHIC integrates, replace these with live API calls.
   For now, we provide institutional-grade static intelligence for
   the user's exposure currencies with realistic macro context.        */

interface CurrencyIntel {
  currency: string;
  name: string;
  flag: string;
  centralBank: string;
  policyRate: string;
  rateDirection: "hawkish" | "dovish" | "neutral";
  nextMeeting: string;
  inflationYoY: string;
  inflationTrend: "rising" | "falling" | "stable";
  gdpGrowth: string;
  currentAccount: string;
  volatilityIndex: number; // 0-100
  riskScore: number; // 0-100 (100 = highest risk)
  headlines: string[];
  polisophicScore?: number; // Future: 0-100 composite risk score
}

const INTEL_DB: Record<string, CurrencyIntel> = {
  USD: {
    currency: "USD",
    name: "US Dollar",
    flag: "$",
    centralBank: "Federal Reserve",
    policyRate: "4.50%",
    rateDirection: "neutral",
    nextMeeting: "2026-03-18",
    inflationYoY: "2.8%",
    inflationTrend: "falling",
    gdpGrowth: "2.3%",
    currentAccount: "-3.1%",
    volatilityIndex: 12,
    riskScore: 15,
    headlines: [
      "Fed holds rates steady, signals data-dependent path",
      "USD DXY consolidates near 104 amid mixed payroll data",
      "US Treasury yields stabilize after Q1 volatility",
    ],
  },
  MXN: {
    currency: "MXN",
    name: "Mexican Peso",
    flag: "$",
    centralBank: "Banxico",
    policyRate: "9.50%",
    rateDirection: "dovish",
    nextMeeting: "2026-03-27",
    inflationYoY: "4.1%",
    inflationTrend: "falling",
    gdpGrowth: "1.8%",
    currentAccount: "-1.2%",
    volatilityIndex: 28,
    riskScore: 35,
    headlines: [
      "Banxico signals further easing as inflation moderates",
      "MXN carry trade remains attractive despite rate cuts",
      "Near-shoring flows continue to support peso fundamentals",
    ],
  },
  EUR: {
    currency: "EUR",
    name: "Euro",
    flag: "\u20AC",
    centralBank: "ECB",
    policyRate: "3.15%",
    rateDirection: "dovish",
    nextMeeting: "2026-04-03",
    inflationYoY: "2.2%",
    inflationTrend: "stable",
    gdpGrowth: "0.9%",
    currentAccount: "2.8%",
    volatilityIndex: 14,
    riskScore: 20,
    headlines: [
      "ECB maintains accommodative stance amid weak PMI data",
      "EUR/USD range-bound as policy divergence narrows",
      "German industrial output shows tentative recovery signs",
    ],
  },
  GBP: {
    currency: "GBP",
    name: "British Pound",
    flag: "\u00A3",
    centralBank: "Bank of England",
    policyRate: "4.25%",
    rateDirection: "neutral",
    nextMeeting: "2026-03-20",
    inflationYoY: "2.6%",
    inflationTrend: "stable",
    gdpGrowth: "1.1%",
    currentAccount: "-2.9%",
    volatilityIndex: 16,
    riskScore: 22,
    headlines: [
      "BoE holds rates as wage growth remains sticky",
      "UK services PMI surprises to the upside at 53.2",
      "Sterling supported by relative yield advantage",
    ],
  },
  JPY: {
    currency: "JPY",
    name: "Japanese Yen",
    flag: "\u00A5",
    centralBank: "Bank of Japan",
    policyRate: "0.50%",
    rateDirection: "hawkish",
    nextMeeting: "2026-03-14",
    inflationYoY: "3.0%",
    inflationTrend: "rising",
    gdpGrowth: "1.2%",
    currentAccount: "3.5%",
    volatilityIndex: 22,
    riskScore: 30,
    headlines: [
      "BoJ signals potential further tightening as inflation persists",
      "JPY intervention risk elevated above 155 level",
      "Japan wage growth accelerates, supporting policy normalization",
    ],
  },
  BRL: {
    currency: "BRL",
    name: "Brazilian Real",
    flag: "R$",
    centralBank: "BCB",
    policyRate: "13.25%",
    rateDirection: "hawkish",
    nextMeeting: "2026-03-19",
    inflationYoY: "5.1%",
    inflationTrend: "rising",
    gdpGrowth: "2.1%",
    currentAccount: "-2.4%",
    volatilityIndex: 32,
    riskScore: 45,
    headlines: [
      "BCB raises Selic to combat persistent inflation pressures",
      "BRL under pressure from fiscal concerns and EM risk aversion",
      "Brazil trade surplus narrows but remains structurally positive",
    ],
  },
  CAD: {
    currency: "CAD",
    name: "Canadian Dollar",
    flag: "C$",
    centralBank: "Bank of Canada",
    policyRate: "3.25%",
    rateDirection: "neutral",
    nextMeeting: "2026-04-02",
    inflationYoY: "2.4%",
    inflationTrend: "stable",
    gdpGrowth: "1.5%",
    currentAccount: "-1.8%",
    volatilityIndex: 14,
    riskScore: 18,
    headlines: [
      "BoC pauses after aggressive easing cycle",
      "CAD finds support from stabilizing oil prices",
      "Canadian housing market shows early signs of recovery",
    ],
  },
  ZAR: {
    currency: "ZAR",
    name: "South African Rand",
    flag: "R",
    centralBank: "SARB",
    policyRate: "7.50%",
    rateDirection: "neutral",
    nextMeeting: "2026-03-27",
    inflationYoY: "4.5%",
    inflationTrend: "stable",
    gdpGrowth: "1.0%",
    currentAccount: "-2.0%",
    volatilityIndex: 35,
    riskScore: 50,
    headlines: [
      "SARB maintains cautious stance amid rand volatility",
      "SA load-shedding risks weigh on growth outlook",
      "Rand finds support from improved commodity terms of trade",
    ],
  },
};

function riskLabel(score: number): { text: string; color: string } {
  if (score <= 20) return { text: "LOW", color: S.green };
  if (score <= 40) return { text: "MODERATE", color: S.cyan };
  if (score <= 60) return { text: "ELEVATED", color: S.amber };
  return { text: "HIGH", color: S.red };
}

function volLabel(vol: number): { text: string; color: string } {
  if (vol <= 15) return { text: "LOW", color: S.green };
  if (vol <= 25) return { text: "NORMAL", color: S.cyan };
  if (vol <= 35) return { text: "ELEVATED", color: S.amber };
  return { text: "HIGH", color: S.red };
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function CurrencyIntelWidget({ token, user, onRemove }: Props) {
  const [exposureCurrencies, setExposureCurrencies] = useState<string[]>([]);
  const [selectedCcy, setSelectedCcy] = useState<string>("USD");
  const [loading, setLoading] = useState(true);

  // Fetch company's exposure currencies from positions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await dashboardFetch("/v1/positions/exposure", token);
        if (res.ok) {
          const data = await res.json();
          const currencies: string[] = (data.exposures ?? data ?? [])
            .map((e: { currency: string }) => e.currency)
            .filter(Boolean);
          if (!cancelled && currencies.length > 0) {
            setExposureCurrencies(currencies);
            setSelectedCcy(currencies[0]);
          }
        }
      } catch {
        // Fall back to USD
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Default to USD if no exposure
  const tabs = exposureCurrencies.length > 0 ? exposureCurrencies : ["USD"];
  const intel = INTEL_DB[selectedCcy] ?? INTEL_DB.USD!;
  const risk = riskLabel(intel.riskScore);
  const vol = volLabel(intel.volatilityIndex);

  const dirIcon = intel.rateDirection === "hawkish"
    ? <TrendingUp size={9} color={S.red} />
    : intel.rateDirection === "dovish"
      ? <TrendingDown size={9} color={S.green} />
      : <Minus size={9} color={S.tertiary} />;

  const infIcon = intel.inflationTrend === "rising"
    ? <TrendingUp size={9} color={S.red} />
    : intel.inflationTrend === "falling"
      ? <TrendingDown size={9} color={S.green} />
      : <Minus size={9} color={S.tertiary} />;

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
      display: "flex", flexDirection: "column", overflow: "hidden", height: "100%",
    }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab",
      }}>
        <Globe2 size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase",
        }}>
          Currency Intelligence
        </span>

        {/* POLISOPHIC badge placeholder */}
        <span style={{
          fontFamily: S.fontMono, fontSize: 8, letterSpacing: "0.1em",
          color: S.amber, background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
          borderRadius: 3, padding: "1px 5px", textTransform: "uppercase",
        }}>
          POLISOPHIC
        </span>

        <div style={{ flex: 1 }} />

        {exposureCurrencies.length === 0 && !loading && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 9, color: S.amber, letterSpacing: "0.06em",
          }}>
            DEFAULT: USD
          </span>
        )}

        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{
            background: "none", border: "none", cursor: "pointer",
            color: S.tertiary, display: "flex", alignItems: "center", padding: 2,
          }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Currency tabs */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${S.rim}`,
        overflowX: "auto", flexShrink: 0,
      }}>
        {tabs.map((ccy) => {
          const isActive = ccy === selectedCcy;
          const ccyIntel = INTEL_DB[ccy];
          const ccyRisk = ccyIntel ? riskLabel(ccyIntel.riskScore) : null;
          return (
            <button key={ccy} onClick={() => setSelectedCcy(ccy)} style={{
              padding: "6px 14px", fontFamily: S.fontMono, fontSize: 10,
              letterSpacing: "0.08em", fontWeight: 700, cursor: "pointer",
              color: isActive ? S.cyan : S.tertiary,
              background: isActive ? `color-mix(in srgb, ${S.cyan} 6%, transparent)` : "transparent",
              borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
              border: "none", borderRight: `1px solid ${S.soft}`,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {ccy}
              {ccyRisk && (
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: ccyRisk.color, display: "inline-block",
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Body - scrollable */}
      <div style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>

        {/* Risk + Volatility banner */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10,
        }}>
          <div style={{
            padding: "8px 10px", background: S.bgSub, border: `1px solid ${S.soft}`,
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.1em" }}>
              RISK SCORE
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: risk.color, lineHeight: 1 }}>
                {intel.riskScore}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: risk.color, letterSpacing: "0.08em", fontWeight: 700 }}>
                {risk.text}
              </span>
            </div>
            {/* Mini bar */}
            <div style={{ height: 3, background: S.bgDeep, border: `1px solid ${S.soft}`, overflow: "hidden" }}>
              <div style={{ width: `${intel.riskScore}%`, height: "100%", background: risk.color, opacity: 0.8 }} />
            </div>
          </div>

          <div style={{
            padding: "8px 10px", background: S.bgSub, border: `1px solid ${S.soft}`,
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.1em" }}>
              IMPLIED VOL
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: vol.color, lineHeight: 1 }}>
                {intel.volatilityIndex}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: vol.color, letterSpacing: "0.08em", fontWeight: 700 }}>
                {vol.text}
              </span>
            </div>
            <div style={{ height: 3, background: S.bgDeep, border: `1px solid ${S.soft}`, overflow: "hidden" }}>
              <div style={{ width: `${intel.volatilityIndex}%`, height: "100%", background: vol.color, opacity: 0.8 }} />
            </div>
          </div>
        </div>

        {/* Macro grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          border: `1px solid ${S.soft}`, marginBottom: 10,
        }}>
          {[
            { label: "POLICY RATE", value: intel.policyRate, icon: dirIcon, sub: intel.rateDirection.toUpperCase() },
            { label: "CPI YOY", value: intel.inflationYoY, icon: infIcon, sub: intel.inflationTrend.toUpperCase() },
            { label: "GDP GROWTH", value: intel.gdpGrowth, icon: null, sub: "ANNUAL" },
          ].map(({ label, value, icon, sub }, i) => (
            <div key={label} style={{
              padding: "8px 10px", textAlign: "center",
              borderRight: i < 2 ? `1px solid ${S.soft}` : "none",
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: S.primary, lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginTop: 3 }}>
                {icon}
                <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.06em" }}>
                  {sub}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Central bank + current account row */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 8, marginBottom: 10,
        }}>
          <div style={{ padding: "6px 10px", background: S.bgSub, border: `1px solid ${S.soft}` }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>
              CENTRAL BANK
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.primary, fontWeight: 600 }}>
              {intel.centralBank}
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginTop: 2 }}>
              Next: {intel.nextMeeting}
            </div>
          </div>
          <div style={{ padding: "6px 10px", background: S.bgSub, border: `1px solid ${S.soft}` }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>
              CURRENT ACCOUNT
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: S.primary }}>
              {intel.currentAccount}
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginTop: 2 }}>
              % of GDP
            </div>
          </div>
        </div>

        {/* Headlines */}
        <div style={{ marginBottom: 4 }}>
          <div style={{
            fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
            letterSpacing: "0.1em", marginBottom: 6, display: "flex",
            alignItems: "center", gap: 5,
          }}>
            MACRO HEADLINES
            <span style={{
              fontFamily: S.fontMono, fontSize: 7, color: S.amber,
              letterSpacing: "0.08em",
            }}>
              POLISOPHIC FEED
            </span>
          </div>
          {intel.headlines.map((h, i) => (
            <div key={i} style={{
              padding: "5px 8px", display: "flex", alignItems: "flex-start", gap: 6,
              borderBottom: i < intel.headlines.length - 1 ? `1px solid ${S.soft}` : "none",
            }}>
              <ArrowRight size={8} color={S.cyan} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.4 }}>
                {h}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>Source: Institutional macro data · POLISOPHIC (pending integration)</span>
        <span>Informational only</span>
      </div>
    </div>
  );
}
