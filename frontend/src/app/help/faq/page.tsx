"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { GUIDES } from "@/lib/help/guides";
import type { GuideSection, GuideBlock, GuideCallout } from "@/lib/help/guides/types";

// ── Style constants ────────────────────────────────────────────────────────────
const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass,#4ade80)",
  fail:      "var(--accent-red,#f87171)",
} as const;

// ── Callout styles ─────────────────────────────────────────────────────────────
const CALLOUT_STYLE: Record<string, { bg: string; border: string; label: string; labelColor: string }> = {
  info:       { bg: "rgba(34,211,238,0.07)",  border: "#22D3EE", label: "INFO",       labelColor: "#22D3EE" },
  warning:    { bg: "rgba(248,113,113,0.10)", border: "#F87171", label: "WARNING",    labelColor: "#F87171" },
  control:    { bg: "rgba(245,158,11,0.08)",  border: "#F59E0B", label: "CONTROL",    labelColor: "#F59E0B" },
  failure:    { bg: "rgba(185,28,28,0.12)",   border: "#991B1B", label: "FAILURE",    labelColor: "#F87171" },
  regulatory: { bg: "rgba(147,197,253,0.08)", border: "#93C5FD", label: "REGULATORY", labelColor: "#93C5FD" },
};

// ── Block renderer ─────────────────────────────────────────────────────────────
function renderBlock(block: GuideBlock, idx: number) {
  if (block.type === "text") {
    return (
      <p
        key={idx}
        style={{
          fontFamily: S.fontUI,
          fontSize: 13,
          color: S.secondary,
          lineHeight: 1.7,
          margin: "0 0 12px 0",
          whiteSpace: "pre-wrap",
        }}
      >
        {block.body}
      </p>
    );
  }

  if (block.type === "steps") {
    return (
      <ol
        key={idx}
        style={{
          fontFamily: S.fontUI,
          fontSize: 13,
          color: S.secondary,
          lineHeight: 1.7,
          margin: "0 0 12px 0",
          paddingLeft: 20,
        }}
      >
        {block.steps.map((step, si) => (
          <li key={si} style={{ marginBottom: 6 }}>
            <strong>{step.label}</strong>
            {step.detail ? ` — ${step.detail}` : ""}
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === "callout") {
    const callout = block as unknown as { type: "callout"; callout: GuideCallout };
    const cs = CALLOUT_STYLE[callout.callout.type] ?? CALLOUT_STYLE.info;
    return (
      <div
        key={idx}
        style={{
          background: cs.bg,
          border: `1px solid ${cs.border}`,
          borderRadius: 4,
          padding: "10px 14px",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: cs.labelColor,
            display: "block",
            marginBottom: 4,
          }}
        >
          {cs.label}
        </span>
        <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6 }}>
          {callout.callout.text}
        </span>
      </div>
    );
  }

  return null;
}

// ── Accordion item ─────────────────────────────────────────────────────────────
function AccordionItem({ section, idx }: { section: GuideSection; idx: number }) {
  const [open, setOpen] = useState(false);
  const isL2 = section.level === "L2";

  return (
    <div
      style={{
        borderBottom: `1px solid ${S.soft}`,
        background: open ? S.bgPanel : "transparent",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: isL2 ? "12px 24px 12px 40px" : "16px 24px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          borderLeft: open ? `3px solid ${S.cyan}` : "3px solid transparent",
          transition: "border-color 0.15s",
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 13,
            color: open ? S.cyan : S.tertiary,
            minWidth: 16,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {open ? "−" : "+"}
        </span>
        <span
          style={{
            fontFamily: S.fontUI,
            fontSize: isL2 ? 13 : 14,
            fontWeight: isL2 ? 400 : 600,
            color: open ? S.primary : S.secondary,
            flex: 1,
          }}
        >
          {idx + 1}. {section.heading}
        </span>
        {section.verified && (
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.pass,
              border: `1px solid ${S.pass}`,
              borderRadius: 3,
              padding: "1px 5px",
              letterSpacing: "0.08em",
              flexShrink: 0,
            }}
          >
            VERIFIED
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            padding: isL2 ? "4px 24px 16px 52px" : "4px 24px 16px 52px",
            background: S.bgPanel,
          }}
        >
          {section.blocks?.map((block, bi) => renderBlock(block, bi))}
          {(!section.blocks || section.blocks.length === 0) && (
            <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, fontStyle: "italic" }}>
              No content available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
function FaqPageInner() {
  useAuth();
  const router = useRouter();
  const faqGuide = GUIDES.find((g) => g.id === "faq");

  if (!faqGuide) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: S.bgDeep,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: S.fontUI,
          color: S.tertiary,
          fontSize: 14,
        }}
      >
        FAQ guide not found.
      </div>
    );
  }

  const sections = faqGuide.sections ?? [];
  const l1Sections = sections.filter((s) => s.level === "L1");
  const totalQuestions = sections.length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: S.bgDeep,
        padding: "24px 24px 48px",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <button
            onClick={() => router.push("/help")}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              color: S.tertiary,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              letterSpacing: "0.05em",
            }}
          >
            DOCUMENTATION
          </button>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>›</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, letterSpacing: "0.05em" }}>
            FAQ
          </span>
        </div>

        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h1
            style={{
              fontFamily: S.fontMono,
              fontSize: 14,
              fontWeight: 700,
              color: S.primary,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            FREQUENTLY ASKED QUESTIONS
          </h1>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              color: S.tertiary,
              border: `1px solid ${S.soft}`,
              borderRadius: 3,
              padding: "2px 8px",
              letterSpacing: "0.06em",
            }}
          >
            {totalQuestions} QUESTIONS
          </span>
        </div>

        {/* Summary */}
        <p
          style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            color: S.tertiary,
            marginBottom: 32,
            lineHeight: 1.6,
          }}
        >
          {faqGuide.summary}
        </p>

        {/* Accordion list */}
        <div
          style={{
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            overflow: "hidden",
            background: S.bgPanel,
            marginBottom: 40,
          }}
        >
          {l1Sections.length === 0
            ? sections.map((section, idx) => (
                <AccordionItem key={section.id} section={section} idx={idx} />
              ))
            : l1Sections.map((section, idx) => (
                <AccordionItem key={section.id} section={section} idx={idx} />
              ))}
        </div>

        {/* Last reviewed */}
        {faqGuide.lastReviewed && (
          <p
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              color: S.tertiary,
              letterSpacing: "0.06em",
              marginBottom: 24,
            }}
          >
            LAST REVIEWED: {faqGuide.lastReviewed}
          </p>
        )}

        {/* Footer CTA */}
        <div
          style={{
            borderTop: `1px solid ${S.soft}`,
            paddingTop: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
            Can&apos;t find what you&apos;re looking for?
          </span>
          <button
            onClick={() => router.push("/help/support")}
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: S.cyan,
              background: "transparent",
              border: `1px solid ${S.cyan}`,
              borderRadius: 4,
              padding: "7px 16px",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            CONTACT SUPPORT
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "var(--bg-deep)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
            color: "var(--text-tertiary)",
            fontSize: 13,
          }}
        >
          Loading FAQ...
        </div>
      }
    >
      <FaqPageInner />
    </Suspense>
  );
}
