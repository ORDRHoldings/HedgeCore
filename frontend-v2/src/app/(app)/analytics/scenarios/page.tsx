"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import TierGateClient from "@/components/tier/TierGateClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontHeading: "var(--font-heading,'Manrope',sans-serif)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  rim: "var(--border-rim,#E2E8F0)",
  soft: "var(--border-soft,#CBD5E1)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

const UPCOMING_FEATURES = [
  {
    icon: "🎯",
    title: "Stress Testing",
    description: "Simulate GFC, COVID, and custom macro shocks against your live portfolio.",
  },
  {
    icon: "📈",
    title: "Monte Carlo Simulation",
    description: "10,000-path stochastic simulations with configurable correlation matrices.",
  },
  {
    icon: "🧮",
    title: "VaR & CVaR",
    description: "Historical and parametric value-at-risk at 95% and 99% confidence intervals.",
  },
  {
    icon: "⚖️",
    title: "Hedge Effectiveness Testing",
    description: "IAS 39 / IFRS 9 effectiveness ratios with regression analysis.",
  },
  {
    icon: "🗺️",
    title: "Sensitivity Analysis",
    description: "Delta, gamma, and vega sensitivity grids per instrument and tenor bucket.",
  },
  {
    icon: "📋",
    title: "Board-Ready Reports",
    description: "One-click PDF scenario reports formatted for committee review.",
  },
];

function ScenariosContent() {
  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="ANALYTICS"
        title="Scenario Studio"
        subtitle="Stress test your FX portfolio against macro shocks and custom scenarios"
        badge={
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              background: "#F3E8FF",
              color: "#7C3AED",
              border: "1px solid #DDD6FE",
              padding: "3px 8px",
              borderRadius: 3,
            }}
          >
            COMING SOON
          </span>
        }
      />

      {/* Hero placeholder */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "48px 40px",
          textAlign: "center",
          marginBottom: 28,
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 16, lineHeight: 1 }}>🔭</div>
        <h2
          style={{
            fontFamily: S.fontHeading,
            fontSize: 22,
            fontWeight: 700,
            color: S.textPrimary,
            marginBottom: 10,
            letterSpacing: "-0.02em",
          }}
        >
          Scenario Studio
        </h2>
        <p
          style={{
            fontFamily: S.fontUI,
            fontSize: 15,
            color: S.textSecondary,
            maxWidth: 540,
            margin: "0 auto 24px",
            lineHeight: 1.6,
          }}
        >
          Model how your FX hedges perform under historical and hypothetical market conditions.
          Quantify tail risk, measure hedge effectiveness, and stress test your treasury policy
          before it is tested by the market.
        </p>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            color: S.textTertiary,
            background: S.bgSub,
            border: `1px solid ${S.soft}`,
            padding: "9px 20px",
            borderRadius: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>🚀</span>
          Launching next release
        </div>
      </div>

      {/* Feature grid */}
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: S.textTertiary,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        What&apos;s Coming
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {UPCOMING_FEATURES.map(({ icon, title, description }) => (
          <div
            key={title}
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              padding: "20px 20px",
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 24, flexShrink: 0, lineHeight: 1.2 }}>{icon}</span>
            <div>
              <div
                style={{
                  fontFamily: S.fontHeading,
                  fontSize: 14,
                  fontWeight: 700,
                  color: S.textPrimary,
                  marginBottom: 5,
                }}
              >
                {title}
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary, lineHeight: 1.5 }}>
                {description}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          background: "#F3E8FF",
          border: "1px solid #DDD6FE",
          borderRadius: 8,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: S.fontUI,
          fontSize: 13,
          color: "#5B21B6",
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
        <span>
          <strong>Early access program:</strong> Enterprise customers can join the Scenario Studio beta.
          Contact your account manager or reach out via the Help page.
        </span>
      </div>
    </div>
  );
}

export default function ScenariosPage() {
  return (
    <TierGateClient requiredTier="enterprise" featureName="scenario-studio">
      <ScenariosContent />
    </TierGateClient>
  );
}
