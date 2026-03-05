"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import TierGateClient from "@/components/tier/TierGateClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontHeading: "var(--font-heading,'Manrope',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  rim: "var(--border-rim,#E2E8F0)",
  soft: "var(--border-soft,#CBD5E1)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  accentRed: "var(--accent-red,#DC2626)",
  statusPass: "var(--status-pass,#059669)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

const RISK_DIMENSIONS = ["Directional", "Volatility", "Tenor", "Liquidity", "Credit", "Correlation", "Basis", "Concentration"];
const CURRENCY_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/MXN", "USD/CAD", "AUD/USD"];

function heatColor(score: number): string {
  if (score >= 0.7) return "#FEE2E2";
  if (score >= 0.4) return "#FEF3C7";
  return "#D1FAE5";
}

function heatTextColor(score: number): string {
  if (score >= 0.7) return "#DC2626";
  if (score >= 0.4) return "#D97706";
  return "#059669";
}

// Deterministic seeded mock — stable across renders
function seededRand(pair: string, dim: string): number {
  const seed = (pair + dim).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return ((seed * 2654435761) % 100) / 100;
}

interface ExposureItem {
  currency: string;
  total_ar: number;
  total_ap: number;
  net_usd: number;
}

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function PortfolioContent() {
  const { token } = useAuthStore();

  const exposureQ = useQuery<ExposureItem[]>({
    queryKey: ["portfolio-exposure"],
    queryFn: () => api.get<ExposureItem[]>("/v1/positions/exposure"),
    enabled: !!token,
  });

  const exposure: ExposureItem[] = exposureQ.data ?? [];

  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="ANALYTICS"
        title="Portfolio Risk"
        subtitle="Multi-dimensional risk heat map — next release preview"
        badge={
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              background: "#FEF3C7",
              color: S.accentAmber,
              border: `1px solid #FCD34D`,
              padding: "3px 8px",
              borderRadius: 3,
            }}
          >
            PREVIEW
          </span>
        }
      />

      {/* Coming soon banner */}
      <div
        style={{
          background: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: 8,
          padding: "14px 20px",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: S.fontUI,
          fontSize: 13,
          color: "#1E40AF",
        }}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }}>📊</span>
        <div>
          <strong>Portfolio Risk module</strong> — full interactive analytics coming in the next release. The heat map below uses representative data for preview purposes.
        </div>
      </div>

      {/* Risk Heat Map */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "20px 24px",
          marginBottom: 24,
          overflowX: "auto",
        }}
      >
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: S.textTertiary,
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Risk Heat Map — Currency Pairs × Risk Dimensions
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
            <thead>
              <tr>
                <th
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: S.textTertiary,
                    textTransform: "uppercase",
                    textAlign: "left",
                    padding: "8px 12px",
                    background: S.bgSub,
                    borderBottom: `1px solid ${S.rim}`,
                    minWidth: 100,
                  }}
                >
                  PAIR
                </th>
                {RISK_DIMENSIONS.map((dim) => (
                  <th
                    key={dim}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: S.textTertiary,
                      textTransform: "uppercase",
                      textAlign: "center",
                      padding: "8px 10px",
                      background: S.bgSub,
                      borderBottom: `1px solid ${S.rim}`,
                      minWidth: 80,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dim}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CURRENCY_PAIRS.map((pair, ri) => (
                <tr key={pair}>
                  <td
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 700,
                      color: S.textPrimary,
                      padding: "10px 12px",
                      borderBottom: ri < CURRENCY_PAIRS.length - 1 ? `1px solid ${S.rim}` : "none",
                      background: S.bgPanel,
                    }}
                  >
                    {pair}
                  </td>
                  {RISK_DIMENSIONS.map((dim) => {
                    const score = seededRand(pair, dim);
                    return (
                      <td
                        key={dim}
                        style={{
                          padding: "10px 10px",
                          textAlign: "center",
                          background: heatColor(score),
                          borderBottom: ri < CURRENCY_PAIRS.length - 1 ? `1px solid ${S.rim}` : "none",
                          borderLeft: `1px solid ${S.rim}`,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 11,
                            fontWeight: 700,
                            color: heatTextColor(score),
                          }}
                        >
                          {(score * 10).toFixed(1)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${S.rim}` }}>
          {[
            { label: "Low Risk (0–4.0)", bg: "#D1FAE5", color: "#059669" },
            { label: "Medium Risk (4.0–7.0)", bg: "#FEF3C7", color: "#D97706" },
            { label: "High Risk (7.0–10.0)", bg: "#FEE2E2", color: "#DC2626" },
          ].map(({ label, bg, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, background: bg, borderRadius: 2, border: "1px solid rgba(0,0,0,0.08)" }} />
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Exposure Table */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            borderBottom: `1px solid ${S.rim}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: S.textTertiary,
              textTransform: "uppercase",
            }}
          >
            Live Exposure by Currency
          </div>
          {exposureQ.isLoading && (
            <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>Loading…</div>
          )}
        </div>

        {!exposureQ.isLoading && exposure.length === 0 && (
          <div
            style={{
              padding: "32px 24px",
              textAlign: "center",
              fontFamily: S.fontUI,
              fontSize: 13,
              color: S.textTertiary,
            }}
          >
            No exposure data — add positions to see live currency breakdown.
          </div>
        )}

        {exposure.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {["Currency", "Total AR (USD)", "Total AP (USD)", "Net Exposure (USD)"].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: S.textTertiary,
                      textTransform: "uppercase",
                      textAlign: h === "Currency" ? "left" : "right",
                      padding: "10px 20px",
                      borderBottom: `1px solid ${S.rim}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exposure.map((row, i) => (
                <tr
                  key={row.currency}
                  style={{ borderBottom: i < exposure.length - 1 ? `1px solid ${S.rim}` : "none" }}
                >
                  <td style={{ padding: "12px 20px" }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 13,
                        fontWeight: 700,
                        color: S.textPrimary,
                      }}
                    >
                      {row.currency}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", textAlign: "right", fontFamily: S.fontMono, fontSize: 13, color: S.statusPass }}>
                    {fmtUSD(row.total_ar)}
                  </td>
                  <td style={{ padding: "12px 20px", textAlign: "right", fontFamily: S.fontMono, fontSize: 13, color: S.accentAmber }}>
                    {fmtUSD(row.total_ap)}
                  </td>
                  <td
                    style={{
                      padding: "12px 20px",
                      textAlign: "right",
                      fontFamily: S.fontMono,
                      fontSize: 13,
                      fontWeight: 700,
                      color: row.net_usd >= 0 ? S.statusPass : S.accentRed,
                    }}
                  >
                    {row.net_usd >= 0 ? "+" : ""}{fmtUSD(row.net_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <TierGateClient requiredTier="enterprise" featureName="portfolio-risk">
      <PortfolioContent />
    </TierGateClient>
  );
}
