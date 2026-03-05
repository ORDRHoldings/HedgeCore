"use client";
/**
 * /help — Getting started guide, HedgeWiki FAQ, and support ticket.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import type { PlanTier } from "@/types/api";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontHeading: "var(--font-heading,'Manrope',sans-serif)",
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

// ── Getting Started guides ───────────────────────────────────────────────────

interface Step {
  n: number;
  title: string;
  description: string;
}

const STEPS_BY_TIER: Record<PlanTier, Step[]> = {
  lite: [
    {
      n: 1,
      title: "Create your account",
      description: "Sign up with a work email. No credit card required for the free tier.",
    },
    {
      n: 2,
      title: "Upload FX data",
      description: "Go to Audit Lab → Upload and import a CSV export from your bank or treasury system.",
    },
    {
      n: 3,
      title: "See your results",
      description: "View the audit run to see hidden bank markups, fees, and an FX cost breakdown.",
    },
  ],
  smb: [
    {
      n: 1,
      title: "Add your FX exposures",
      description: "Navigate to Exposures and create positions for your AR and AP currency flows.",
    },
    {
      n: 2,
      title: "Set a hedge policy",
      description: "Go to Policies and activate a template that matches your hedge ratio objectives.",
    },
    {
      n: 3,
      title: "Run a hedge plan",
      description: "ORDR will calculate hedge recommendations and assign instruments to your positions.",
    },
    {
      n: 4,
      title: "Execute the hedge",
      description: "Use the Execute wizard to run through the 4-step risk-gated execution flow.",
    },
    {
      n: 5,
      title: "Review the audit trail",
      description: "Every action is captured in the tamper-evident audit log for compliance review.",
    },
    {
      n: 6,
      title: "Invite your team",
      description: "Go to Settings → Team and invite colleagues to enable 4-eyes authorization.",
    },
  ],
  professional: [
    {
      n: 1,
      title: "Add your FX exposures",
      description: "Navigate to Exposures and create positions for your AR and AP currency flows.",
    },
    {
      n: 2,
      title: "Set a hedge policy",
      description: "Go to Policies and activate a template that matches your hedge ratio objectives.",
    },
    {
      n: 3,
      title: "Run a hedge plan",
      description: "ORDR will calculate hedge recommendations and assign instruments to your positions.",
    },
    {
      n: 4,
      title: "Execute the hedge",
      description: "Use the Execute wizard to run through the 4-step risk-gated execution flow.",
    },
    {
      n: 5,
      title: "Review the audit trail",
      description: "Every action is captured in the tamper-evident audit log for compliance review.",
    },
    {
      n: 6,
      title: "Invite your team",
      description: "Go to Settings → Team and invite colleagues to enable 4-eyes authorization.",
    },
  ],
  enterprise: [
    {
      n: 1,
      title: "Onboard your treasury structure",
      description: "Configure branches, departments, and governance mode under Settings → Company.",
    },
    {
      n: 2,
      title: "Configure hedge policies",
      description: "Create or activate policy templates with currency pairs and ratio constraints.",
    },
    {
      n: 3,
      title: "Upload FX exposures",
      description: "Import positions via CSV or API. Lifecycle state is tracked automatically.",
    },
    {
      n: 4,
      title: "Run the hedge engine",
      description: "ORDR generates deterministic proposals with SHA-256 run hashes for full auditability.",
    },
    {
      n: 5,
      title: "4-eyes authorization in Staging",
      description: "Checker reviews execution proposals in the Staging Queue before they commit to the Ledger.",
    },
    {
      n: 6,
      title: "Ledger commit",
      description: "Authorized proposals are written to the WORM ledger as the final execution record.",
    },
    {
      n: 7,
      title: "Verify chain integrity",
      description: "Run Audit Trail → Verify Chain Integrity to confirm the SHA-256 hash chain is intact.",
    },
    {
      n: 8,
      title: "Export for compliance",
      description: "Download the full audit log as JSON for auditor submission or SOX compliance.",
    },
  ],
};

function GettingStartedSection({ tier }: { tier: PlanTier }) {
  const steps = STEPS_BY_TIER[tier] ?? STEPS_BY_TIER.lite;

  const tierBadge: Record<PlanTier, { bg: string; color: string; label: string }> = {
    lite: { bg: "#F1F5F9", color: "#64748B", label: "FREE" },
    smb: { bg: "#EFF6FF", color: "#1C62F2", label: "SMB" },
    professional: { bg: "#EFF6FF", color: "#1C62F2", label: "PRO" },
    enterprise: { bg: "#F0FDF4", color: "#059669", label: "ENTERPRISE" },
  };

  const badge = tierBadge[tier];

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
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
          Getting Started
        </div>
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.1em",
            background: badge.bg,
            color: badge.color,
            padding: "2px 8px",
            borderRadius: 3,
          }}
        >
          {badge.label} GUIDE
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {steps.map((step) => (
          <div
            key={step.n}
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              padding: "18px 20px",
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#EFF6FF",
                border: `2px solid #BFDBFE`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.accentCyan }}>
                {step.n}
              </span>
            </div>
            <div>
              <div style={{ fontFamily: S.fontHeading, fontSize: 13, fontWeight: 700, color: S.textPrimary, marginBottom: 4 }}>
                {step.title}
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary, lineHeight: 1.5 }}>
                {step.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── HedgeWiki FAQ ─────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "What is an FX markup?",
    a: "An FX markup is the spread that a bank or FX provider adds on top of the mid-market rate when converting currencies. For example, if EUR/USD mid is 1.0850 but your bank quotes 1.0800, the 50-pip difference is the markup. ORDR Audit Lab quantifies this hidden cost across your transaction history.",
  },
  {
    q: "How is the calculation run hash computed?",
    a: "Each calculation run produces a deterministic SHA-256 hash over a canonical JSON representation of the inputs (positions, policy, market snapshot) and outputs (proposals, verdicts). The hash is stored as part of the run record and can be independently verified. This ensures that results cannot be altered retroactively.",
  },
  {
    q: "What is a hedge proposal?",
    a: "A hedge proposal is ORDR's recommendation to offset an FX exposure using a specific financial instrument (e.g. forward contract, FX option). Each proposal specifies the instrument, notional, tenor, and hedge ratio, and is linked to one or more positions. Proposals move through Sandbox → Staging → Ledger.",
  },
  {
    q: "What is the tri-state pipeline?",
    a: "ORDR uses a three-stage pipeline to ensure governance compliance. Sandbox proposals are exploratory and uncommitted. Staging holds proposals pending 4-eyes authorization. Ledger entries are final, write-once (WORM) records that constitute the authoritative hedge execution log.",
  },
  {
    q: "What is 4-eyes authorization (Segregation of Duties)?",
    a: "4-eyes authorization requires that a proposal's maker (the user who created it) cannot also be the checker (the user who authorizes it). This Segregation of Duties (SoD) control is required under most treasury governance frameworks and is enforced by ORDR's team governance mode.",
  },
  {
    q: "How does the audit chain work?",
    a: "Every audit event is linked to the previous event using a SHA-256 hash (hash of event payload + previous hash). This creates a cryptographically verifiable chain. If any event is tampered with, the hashes downstream will break. You can verify chain integrity at any time from the Audit Trail page.",
  },
  {
    q: "What is the hedge ratio?",
    a: "The hedge ratio is the proportion of an FX exposure that is hedged. A 100% hedge ratio means the full notional is covered. Treasury policy typically defines a minimum ratio (e.g. 75%) to balance cost and risk. ORDR enforces the policy-defined ratio when generating proposals.",
  },
];

function HedgeWikiSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <section style={{ marginBottom: 40 }}>
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
        HedgeWiki — Frequently Asked Questions
      </div>

      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} style={{ borderBottom: i < FAQ_ITEMS.length - 1 ? `1px solid ${S.rim}` : "none" }}>
              <button
                onClick={() => toggle(i)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "16px 22px",
                  background: isOpen ? "#EFF6FF" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
              >
                <span
                  style={{
                    fontFamily: S.fontHeading,
                    fontSize: 14,
                    fontWeight: 600,
                    color: isOpen ? S.accentCyan : S.textPrimary,
                    lineHeight: 1.4,
                  }}
                >
                  {item.q}
                </span>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 16,
                    color: S.textTertiary,
                    flexShrink: 0,
                    transform: isOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.15s",
                  }}
                >
                  ∨
                </span>
              </button>
              {isOpen && (
                <div
                  style={{
                    padding: "0 22px 16px",
                    fontFamily: S.fontUI,
                    fontSize: 13,
                    color: S.textSecondary,
                    lineHeight: 1.65,
                    borderTop: `1px solid ${S.rim}`,
                    background: "#FAFCFF",
                    paddingTop: 14,
                  }}
                >
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Support Ticket ────────────────────────────────────────────────────────────

type Severity = "S1" | "S2" | "S3" | "S4";

const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  S1: "Critical — production outage or data loss",
  S2: "High — major feature broken, business impact",
  S3: "Medium — degraded functionality, workaround exists",
  S4: "Low — minor issue, question, or feature request",
};

function SupportSection() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("S3");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () =>
      api.post("/v1/support/tickets", { subject, description, severity }),
    onSuccess: () => {
      setSubmitted(true);
      setSubject("");
      setDescription("");
      setSeverity("S3");
    },
  });

  if (submitted) {
    return (
      <section>
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
          Contact Support
        </div>
        <div
          style={{
            background: "#D1FAE5",
            border: "1px solid #6EE7B7",
            borderRadius: 10,
            padding: "32px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
          <div style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 16, color: S.statusPass, marginBottom: 6 }}>
            Support ticket submitted
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: "#047857", marginBottom: 16 }}>
            Our team will respond within the SLA for your severity level.
          </div>
          <button
            onClick={() => setSubmitted(false)}
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              background: "none",
              border: `1px solid ${S.soft}`,
              borderRadius: 5,
              padding: "7px 18px",
              cursor: "pointer",
              color: S.textSecondary,
            }}
          >
            Submit another ticket
          </button>
        </div>
      </section>
    );
  }

  const canSubmit = subject.length >= 5 && description.length >= 20;

  return (
    <section>
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
        Contact Support
      </div>

      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          maxWidth: 620,
        }}
      >
        <div>
          <label
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              color: S.textTertiary,
              display: "block",
              marginBottom: 6,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Severity
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {(["S1", "S2", "S3", "S4"] as Severity[]).map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  background: severity === s ? S.accentCyan : S.bgSub,
                  color: severity === s ? "#fff" : S.textSecondary,
                  border: `1px solid ${severity === s ? S.accentCyan : S.rim}`,
                  padding: "8px 0",
                  borderRadius: 6,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <div
            style={{
              fontFamily: S.fontUI,
              fontSize: 12,
              color: S.textTertiary,
              marginTop: 6,
            }}
          >
            {SEVERITY_DESCRIPTIONS[severity]}
          </div>
        </div>

        <div>
          <label
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              color: S.textTertiary,
              display: "block",
              marginBottom: 6,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief description of your issue"
            style={{
              fontFamily: S.fontUI,
              fontSize: 14,
              color: S.textPrimary,
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              padding: "9px 14px",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              color: S.textTertiary,
              display: "block",
              marginBottom: 6,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened, steps to reproduce, and expected behaviour."
            rows={5}
            style={{
              fontFamily: S.fontUI,
              fontSize: 13,
              color: S.textPrimary,
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              padding: "10px 14px",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              lineHeight: 1.55,
            }}
          />
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginTop: 4 }}>
            {description.length} / min 20 characters
          </div>
        </div>

        {submitMutation.isError && (
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 6,
              padding: "9px 14px",
              fontFamily: S.fontUI,
              fontSize: 13,
              color: S.accentRed,
            }}
          >
            {(submitMutation.error as Error)?.message ?? "Failed to submit ticket."}
          </div>
        )}

        <button
          onClick={() => submitMutation.mutate()}
          disabled={!canSubmit || submitMutation.isPending}
          style={{
            fontFamily: S.fontMono,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.05em",
            background: canSubmit && !submitMutation.isPending ? S.accentCyan : S.bgSub,
            color: canSubmit && !submitMutation.isPending ? "#fff" : S.textTertiary,
            border: "none",
            padding: "10px 24px",
            borderRadius: 6,
            cursor: canSubmit && !submitMutation.isPending ? "pointer" : "not-allowed",
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {submitMutation.isPending && (
            <span
              style={{
                width: 13,
                height: 13,
                border: "2px solid rgba(255,255,255,0.4)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                display: "inline-block",
                animation: "spin 0.7s linear infinite",
              }}
            />
          )}
          {submitMutation.isPending ? "Submitting…" : "Submit Ticket"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const { user } = useAuthStore();
  const tier = user?.plan_tier ?? "lite";

  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="SUPPORT"
        title="Help Center"
        subtitle="Getting started guide, HedgeWiki, and support tickets"
      />

      <GettingStartedSection tier={tier} />
      <HedgeWikiSection />
      <SupportSection />
    </div>
  );
}
