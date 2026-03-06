"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import api from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import TierGateClient from "@/components/tier/TierGateClient";

// ─── Style tokens ────────────────────────────────────────────────────────────
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep:   "var(--bg-deep,#EEF1F5)",
  bgPanel:  "var(--bg-panel,#FFFFFF)",
  bgSub:    "var(--bg-sub,#F1F5F9)",
  rim:      "var(--border-rim,#CCD4DC)",
  soft:     "var(--border-soft,#CBD5E1)",
  accentCyan:  "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  accentRed:   "var(--accent-red,#DC2626)",
  statusPass:  "var(--status-pass,#16A34A)",
  textPrimary:   "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary:  "var(--text-tertiary,#64748B)",
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────
interface ScenarioItem {
  name: string;
  date: string;
  color: string;
  unhedged_pnl: number;
  hedged_pnl: number;
  hedge_benefit: number;
  em_pnl: number;
  dm_pnl: number;
  em_shock_pct: number;
  dm_shock_pct: number;
}

interface CurrencyImpact {
  currency: string;
  unhedged_usd: number;
  worst_case_pnl: number;
  var_99_1w: number;
  is_em: boolean;
}

interface ScenariosResponse {
  as_of: string;
  scenarios: ScenarioItem[];
  currency_impacts: CurrencyImpact[];
  total_em_unhedged: number;
  total_dm_unhedged: number;
}

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(n);

const fmtUSDPlain = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n: number) =>
  (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

const fmtTimestamp = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
};

// ─── Section card wrapper ─────────────────────────────────────────────────────
function SectionCard({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 18px",
          borderBottom: `1px solid ${S.rim}`,
          background: S.bgSub,
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: S.textTertiary,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div style={{ fontFamily: S.fontUI }}>
      <div style={{ marginBottom: 28 }}>
        <div className="skeleton" style={{ height: 20, width: 200, borderRadius: 4, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 32, width: 340, borderRadius: 4 }} />
      </div>
      {[1, 2].map((i) => (
        <div
          key={i}
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 24,
          }}
        >
          <div className="skeleton" style={{ height: 42, width: "100%" }} />
          {[1, 2, 3, 4].map((r) => (
            <div
              key={r}
              style={{
                display: "flex",
                gap: 16,
                padding: "14px 18px",
                borderBottom: `1px solid ${S.rim}`,
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((c) => (
                <div
                  key={c}
                  className="skeleton"
                  style={{ height: 14, flex: 1, borderRadius: 3 }}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────
function ErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 8,
        padding: "40px 32px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: S.accentRed,
          marginBottom: 10,
          textTransform: "uppercase",
        }}
      >
        DATA ERROR
      </div>
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 14,
          color: S.textSecondary,
        }}
      >
        {message}
      </div>
    </div>
  );
}

// ─── Bar chart (div-based) ────────────────────────────────────────────────────
function PnLBarChart({ scenarios }: { scenarios: ScenarioItem[] }) {
  const maxAbs = Math.max(...scenarios.flatMap((s) => [Math.abs(s.unhedged_pnl), Math.abs(s.hedged_pnl)]));

  return (
    <div style={{ padding: "20px 18px" }}>
      <div
        style={{
          display: "flex",
          gap: 20,
          marginBottom: 14,
          fontFamily: S.fontMono,
          fontSize: 10,
          letterSpacing: "0.08em",
          color: S.textTertiary,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 3, background: "#DC2626", display: "inline-block", borderRadius: 1 }} />
          UNHEDGED P&amp;L
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 3, background: "#16A34A", display: "inline-block", borderRadius: 1 }} />
          HEDGED P&amp;L
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {scenarios.map((s) => {
          const unhedgedW = maxAbs > 0 ? (Math.abs(s.unhedged_pnl) / maxAbs) * 100 : 0;
          const hedgedW   = maxAbs > 0 ? (Math.abs(s.hedged_pnl)   / maxAbs) * 100 : 0;
          return (
            <div key={s.name}>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  color: S.textSecondary,
                  marginBottom: 6,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{s.name}</span>
                <span style={{ color: S.textTertiary }}>{s.date}</span>
              </div>
              {/* Unhedged bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{ flex: 1, height: 12, background: S.bgSub, borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${unhedgedW}%`,
                      background: "#DC2626",
                      borderRadius: 2,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: "#DC2626",
                    minWidth: 110,
                    textAlign: "right",
                  }}
                >
                  {fmtUSD(s.unhedged_pnl)}
                </span>
              </div>
              {/* Hedged bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 12, background: S.bgSub, borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${hedgedW}%`,
                      background: "#16A34A",
                      borderRadius: 2,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: "#16A34A",
                    minWidth: 110,
                    textAlign: "right",
                  }}
                >
                  {fmtUSD(s.hedged_pnl)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Scenarios table ──────────────────────────────────────────────────────────
const TH_STYLE: React.CSSProperties = {
  fontFamily: S.fontMono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.1em",
  color: S.textTertiary,
  textTransform: "uppercase",
  padding: "10px 14px",
  textAlign: "right",
  whiteSpace: "nowrap",
  background: S.bgSub,
  borderBottom: `1px solid ${S.rim}`,
};

const TD_STYLE: React.CSSProperties = {
  fontFamily: S.fontMono,
  fontSize: 12,
  padding: "12px 14px",
  textAlign: "right",
  borderBottom: `1px solid ${S.rim}`,
  verticalAlign: "middle",
};

function ScenariosTable({ scenarios }: { scenarios: ScenarioItem[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
        <thead>
          <tr>
            <th style={{ ...TH_STYLE, textAlign: "left" }}>SCENARIO</th>
            <th style={TH_STYLE}>DATE</th>
            <th style={TH_STYLE}>EM SHOCK</th>
            <th style={TH_STYLE}>DM SHOCK</th>
            <th style={TH_STYLE}>UNHEDGED P&amp;L</th>
            <th style={TH_STYLE}>HEDGED P&amp;L</th>
            <th style={TH_STYLE}>HEDGE BENEFIT</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s) => (
            <tr key={s.name} style={{ transition: "background 0.15s" }}>
              {/* Scenario name */}
              <td
                style={{
                  ...TD_STYLE,
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 3,
                    height: 18,
                    borderRadius: 2,
                    background: s.color,
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                <span style={{ color: S.textPrimary, fontWeight: 600 }}>{s.name}</span>
              </td>
              {/* Date */}
              <td style={{ ...TD_STYLE, color: S.textTertiary, fontWeight: 500 }}>{s.date}</td>
              {/* EM shock */}
              <td style={{ ...TD_STYLE, color: s.em_shock_pct < 0 ? "#DC2626" : S.statusPass }}>
                {fmtPct(s.em_shock_pct)}
              </td>
              {/* DM shock */}
              <td style={{ ...TD_STYLE, color: s.dm_shock_pct < 0 ? "#DC2626" : S.statusPass }}>
                {fmtPct(s.dm_shock_pct)}
              </td>
              {/* Unhedged P&L */}
              <td style={{ ...TD_STYLE, color: "#DC2626", fontWeight: 600 }}>
                {fmtUSD(s.unhedged_pnl)}
              </td>
              {/* Hedged P&L */}
              <td style={{ ...TD_STYLE, color: "#DC2626", fontWeight: 600 }}>
                {fmtUSD(s.hedged_pnl)}
              </td>
              {/* Hedge benefit — green (reduces loss) */}
              <td style={{ ...TD_STYLE, color: "#16A34A", fontWeight: 700 }}>
                {fmtUSD(s.hedge_benefit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Currency impact table ────────────────────────────────────────────────────
function CurrencyImpactTable({ impacts }: { impacts: CurrencyImpact[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
        <thead>
          <tr>
            <th style={{ ...TH_STYLE, textAlign: "left" }}>CURRENCY</th>
            <th style={TH_STYLE}>UNHEDGED EXPOSURE</th>
            <th style={TH_STYLE}>WORST CASE P&amp;L</th>
            <th style={TH_STYLE}>VaR 99% 1W</th>
            <th style={{ ...TH_STYLE, textAlign: "center" }}>TYPE</th>
          </tr>
        </thead>
        <tbody>
          {impacts.map((ci) => (
            <tr key={ci.currency}>
              <td
                style={{
                  ...TD_STYLE,
                  textAlign: "left",
                  fontWeight: 700,
                  color: S.textPrimary,
                  fontSize: 13,
                }}
              >
                {ci.currency}
              </td>
              <td style={{ ...TD_STYLE, color: S.textPrimary }}>
                {fmtUSDPlain(ci.unhedged_usd)}
              </td>
              <td style={{ ...TD_STYLE, color: "#DC2626", fontWeight: 600 }}>
                {fmtUSD(ci.worst_case_pnl)}
              </td>
              <td style={{ ...TD_STYLE, color: "#DC2626", fontWeight: 600 }}>
                {fmtUSD(ci.var_99_1w)}
              </td>
              <td style={{ ...TD_STYLE, textAlign: "center" }}>
                <span
                  style={{
                    display: "inline-block",
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    padding: "3px 8px",
                    borderRadius: 3,
                    background: ci.is_em ? "#FEF3C7" : "#EFF6FF",
                    color:      ci.is_em ? "#92400E" : "#1D4ED8",
                    border:     `1px solid ${ci.is_em ? "#FDE68A" : "#BFDBFE"}`,
                  }}
                >
                  {ci.is_em ? "EM" : "DM"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────
function KpiStrip({ data }: { data: ScenariosResponse }) {
  const worstScenario = data.scenarios.reduce<ScenarioItem | null>(
    (acc, s) => (acc === null || s.unhedged_pnl < acc.unhedged_pnl ? s : acc),
    null,
  );
  const avgBenefit =
    data.scenarios.length > 0
      ? data.scenarios.reduce((sum, s) => sum + s.hedge_benefit, 0) / data.scenarios.length
      : 0;

  const kpis: { label: string; value: string; sub?: string; color?: string }[] = [
    {
      label: "SCENARIOS MODELLED",
      value: String(data.scenarios.length),
      sub: "Historical & macro",
    },
    {
      label: "TOTAL EM UNHEDGED",
      value: fmtUSDPlain(data.total_em_unhedged),
      sub: "Emerging markets",
      color: data.total_em_unhedged > 0 ? S.accentAmber : S.textPrimary,
    },
    {
      label: "TOTAL DM UNHEDGED",
      value: fmtUSDPlain(data.total_dm_unhedged),
      sub: "Developed markets",
    },
    {
      label: "WORST SCENARIO",
      value: worstScenario ? fmtUSD(worstScenario.unhedged_pnl) : "—",
      sub: worstScenario?.name ?? "",
      color: "#DC2626",
    },
    {
      label: "AVG HEDGE BENEFIT",
      value: fmtUSD(avgBenefit),
      sub: "Across all scenarios",
      color: "#16A34A",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 14,
        marginBottom: 24,
      }}
    >
      {kpis.map(({ label, value, sub, color }) => (
        <div
          key={label}
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 8,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: S.textTertiary,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 18,
              fontWeight: 700,
              color: color ?? S.textPrimary,
              marginBottom: sub ? 4 : 0,
              letterSpacing: "-0.01em",
            }}
          >
            {value}
          </div>
          {sub && (
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: 11,
                color: S.textTertiary,
              }}
            >
              {sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────
function ScenariosContent() {
  const token = useAuthStore((s) => s.token);

  const { data, isLoading, error } = useQuery<ScenariosResponse>({
    queryKey: ["analytics-scenarios"],
    queryFn: async () => {
      const res = await api.get("/v1/analytics/scenarios");
      return res.data;
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="ANALYTICS / SCENARIOS"
        title="Scenario Stress Testing"
      />

      {isLoading && <LoadingSkeleton />}

      {!isLoading && error && (
        <ErrorState
          message={
            error instanceof Error
              ? error.message
              : "Failed to load scenario data. Please try again."
          }
        />
      )}

      {!isLoading && !error && data && (
        <>
          {/* Timestamp */}
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.textTertiary,
              letterSpacing: "0.06em",
              marginBottom: 20,
            }}
          >
            AS OF&nbsp;&nbsp;{fmtTimestamp(data.as_of)}
          </div>

          {/* KPI strip */}
          <KpiStrip data={data} />

          {/* Scenarios table */}
          <SectionCard label={`Historical Stress Scenarios  ·  ${data.scenarios.length} events`}>
            {data.scenarios.length === 0 ? (
              <div
                style={{
                  padding: "40px 32px",
                  textAlign: "center",
                  fontFamily: S.fontUI,
                  fontSize: 13,
                  color: S.textTertiary,
                }}
              >
                No scenario data available for the current portfolio.
              </div>
            ) : (
              <ScenariosTable scenarios={data.scenarios} />
            )}
          </SectionCard>

          {/* Bar chart */}
          {data.scenarios.length > 0 && (
            <SectionCard label="Unhedged vs. Hedged P&L — Visual Comparison">
              <PnLBarChart scenarios={data.scenarios} />
            </SectionCard>
          )}

          {/* Currency impact table */}
          <SectionCard label={`Currency Impact Analysis  ·  ${data.currency_impacts.length} currencies`}>
            {data.currency_impacts.length === 0 ? (
              <div
                style={{
                  padding: "40px 32px",
                  textAlign: "center",
                  fontFamily: S.fontUI,
                  fontSize: 13,
                  color: S.textTertiary,
                }}
              >
                No currency impact data available.
              </div>
            ) : (
              <CurrencyImpactTable impacts={data.currency_impacts} />
            )}
          </SectionCard>

          {/* Methodology footnote */}
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.textTertiary,
              letterSpacing: "0.04em",
              lineHeight: 1.7,
              padding: "14px 18px",
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 8,
            }}
          >
            <span style={{ fontWeight: 700, color: S.textSecondary }}>METHODOLOGY:</span>
            &nbsp; Stress scenarios apply historical FX shock percentages (EM / DM) to current unhedged notional
            exposures. VaR 99% 1W is computed as the parametric 1-week value-at-risk at the 99th percentile using
            historical volatility. Hedge benefit equals the P&amp;L difference between the unhedged and hedged
            portfolio under each scenario. All values are indicative; this output does not constitute investment advice.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────
export default function ScenariosPage() {
  return (
    <TierGateClient requiredTier="enterprise" featureName="scenario-stress-testing">
      <ScenariosContent />
    </TierGateClient>
  );
}
