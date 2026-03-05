"use client";
/**
 * BlurredPreview — wraps content in a blur + shows upgrade CTA.
 * Used as the fallback in TierGate for insufficient-tier users.
 */

import Link from "next/link";
import type { PlanTier } from "@/types/api";
import { TIER_LABELS, TIER_UPGRADE_LABELS } from "@/lib/tier/features";

const FEATURE_VALUE_PROPS: Record<string, { headline: string; bullets: string[] }> = {
  "exposures": {
    headline: "Track all your FX exposures",
    bullets: [
      "Unlimited positions — AR & AP",
      "Lifecycle: policy → hedge → ledger",
      "CSV & Excel bulk import",
    ],
  },
  "hedge-plan": {
    headline: "Get actionable hedge recommendations",
    bullets: [
      "AI-ranked hedge proposals",
      "IBKR execution packets",
      "Staged hedge schedules",
    ],
  },
  "policies": {
    headline: "Govern FX with policy rules",
    bullets: [
      "60+ policy presets",
      "AI policy wizard",
      "4-eyes approval workflow",
    ],
  },
  "execute": {
    headline: "Execute with confidence",
    bullets: [
      "4-step guided execution wizard",
      "Risk gate with dual-key authorization",
      "Full audit trail",
    ],
  },
  "analytics": {
    headline: "Portfolio risk analytics",
    bullets: [
      "Multi-currency heat maps",
      "Scenario studio",
      "8-dimension risk scoring",
    ],
  },
  "governance": {
    headline: "Enterprise governance",
    bullets: [
      "Tri-state pipeline (Sandbox → Staging → Ledger)",
      "Cryptographic audit chain",
      "Committee packs & PDF reports",
    ],
  },
  "default": {
    headline: "Upgrade to unlock this feature",
    bullets: [
      "Advanced FX tools for treasury teams",
      "Full audit trail & compliance",
    ],
  },
};

interface Props {
  requiredTier: PlanTier;
  featureName?: string;
  children?: React.ReactNode;
}

export function BlurredPreview({ requiredTier, featureName, children }: Props) {
  const vp = FEATURE_VALUE_PROPS[featureName ?? "default"] ?? FEATURE_VALUE_PROPS["default"];
  const upgradeLabel = TIER_UPGRADE_LABELS[requiredTier === "smb" ? "lite" : "smb"];
  const tierLabel = TIER_LABELS[requiredTier];

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 4 }}>
      {/* Blurred content preview */}
      {children && (
        <div
          style={{
            filter: "blur(4px)",
            pointerEvents: "none",
            userSelect: "none",
            opacity: 0.5,
          }}
        >
          {children}
        </div>
      )}

      {/* Overlay CTA */}
      <div
        style={{
          position: children ? "absolute" : "relative",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: children
            ? "rgba(248,250,252,0.85)"
            : "var(--bg-panel)",
          backdropFilter: children ? "blur(2px)" : undefined,
          padding: "32px 24px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: 360,
            border: "1px solid var(--border-rim)",
            background: "var(--bg-panel)",
            borderRadius: 6,
            padding: "28px 32px",
          }}
        >
          <div
            style={{
              display: "inline-block",
              fontFamily: "var(--font-terminal-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "#fff",
              background: "var(--accent-cyan)",
              padding: "3px 10px",
              borderRadius: 2,
              marginBottom: 14,
            }}
          >
            {tierLabel}+
          </div>

          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 10,
            }}
          >
            {vp.headline}
          </h3>

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0 0 20px",
              textAlign: "left",
            }}
          >
            {vp.bullets.map((b) => (
              <li
                key={b}
                style={{
                  fontFamily: "var(--font-terminal)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <span style={{ color: "var(--accent-cyan)", flexShrink: 0, marginTop: 1 }}>✓</span>
                {b}
              </li>
            ))}
          </ul>

          <Link
            href="/settings?upgrade=true"
            style={{
              display: "block",
              fontFamily: "var(--font-terminal-mono)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#fff",
              background: "var(--accent-cyan)",
              padding: "10px 20px",
              borderRadius: 3,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            {upgradeLabel || "Upgrade →"}
          </Link>

          <p
            style={{
              fontFamily: "var(--font-terminal)",
              fontSize: 11,
              color: "var(--text-tertiary)",
              marginTop: 10,
              marginBottom: 0,
            }}
          >
            No credit card required for trial.
          </p>
        </div>
      </div>
    </div>
  );
}
