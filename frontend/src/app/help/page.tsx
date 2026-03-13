"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import type { GuideDoc, GuideLevel, GuideSection, GuideBlock, GuideCallout, GuideFormula, GuideTable, GuideFieldDict } from "@/lib/help/guides/types";
import { GUIDE_LEVEL_META, computeVerifiedStats } from "@/lib/help/guides/types";

import { PageShell } from "@/components/layout/PageShell";
import { HelpCircle } from "lucide-react";

// ── Guide data import (graceful fallback) ──────────────────────────────────────
let GUIDES: GuideDoc[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  GUIDES = require("@/lib/help/guides").GUIDES ?? [];
} catch {
  GUIDES = [];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PLATFORM_VERSION = "v2.0.0";
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" &&
  ["hedgecore.vercel.app", "ordr-terminal.vercel.app"].includes(window.location.hostname)
    ? "https://hedgecore.onrender.com/api"
    : "/api");

// ── Styling system ─────────────────────────────────────────────────────────────
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
  fail:      "var(--accent-red,#B91C1C)",
} as const;

// ── Guide nav items ────────────────────────────────────────────────────────────
const GUIDE_NAV: Array<{ id: string; title: string; icon: string; path: string }> = [
  { id: "getting-started",    title: "Getting Started",         icon: "🚀", path: "/dashboard" },
  { id: "dashboard-widgets",  title: "Dashboard & Widgets",     icon: "⬡",  path: "/dashboard" },
  { id: "data-ingestion",     title: "Data Ingestion",          icon: "⬆",  path: "/position-desk" },
  { id: "position-desk",      title: "Position Desk",           icon: "📋", path: "/position-desk" },
  { id: "policy-engine",      title: "Policy Engine",           icon: "⚙",  path: "/policies" },
  { id: "sandbox-simulation", title: "Sandbox & Simulation",    icon: "🧪", path: "/sandbox" },
  { id: "execution-pipeline", title: "Execution Pipeline",      icon: "▶",  path: "/hedge-desk" },
  { id: "execution-bridge",   title: "Execution Bridge",        icon: "⇄",  path: "/execution" },
  { id: "fx-rates",           title: "FX Rates",                icon: "₿",  path: "/market-intelligence" },
  { id: "polisophic",         title: "Polisophic Risk Intel",   icon: "🌍", path: "/polisophic" },
  { id: "governance",         title: "Governance & Audit",      icon: "🔒", path: "/audit-trail" },
  { id: "troubleshooting",    title: "Troubleshooting",         icon: "⚠",  path: "/help" },
  { id: "api-reference",      title: "API Reference",           icon: "〈〉", path: "/help" },
  { id: "faq",                title: "FAQ",                     icon: "?",  path: "/help" },
];

const QUICK_LINKS = [
  { label: "Dashboard",          path: "/dashboard" },
  { label: "Position Desk",      path: "/position-desk" },
  { label: "Policy Engine",      path: "/policies" },
  { label: "Sandbox",            path: "/sandbox" },
  { label: "Execution",          path: "/hedge-desk" },
  { label: "FX Rates",           path: "/market-intelligence" },
  { label: "Audit Trail",        path: "/audit-trail" },
  { label: "HedgeWiki",          path: "/hedgewiki" },
];

const KB_LINKS = [
  { label: "NDF — Non-Deliverable Forward", id: "ndf" },
  { label: "FX Swap mechanics",             id: "fxswap" },
  { label: "IFRS 9 Hedge Accounting",       id: "ifrs9-eff" },
  { label: "HET Regression",                id: "het-regression" },
  { label: "Delta-hedge ratio methodology", id: "delta-hedge" },
  { label: "Waterfall rule engine",         id: "waterfall" },
];

const QUICK_REFS = [
  { label: "Finnhub API",           url: "https://finnhub.io/docs/api" },
  { label: "IFRS 9 Standard",       url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/" },
  { label: "ISDA FX Definitions",   url: "https://www.isda.org/book/isda-2005-barrier-option-supplement-and-to-the-1998-fx-and-currency-option-definitions/" },
];

// ── Callout type metadata ──────────────────────────────────────────────────────
const CALLOUT_STYLE: Record<string, { bg: string; border: string; label: string; labelColor: string }> = {
  info:       { bg: "rgba(34,211,238,0.07)",  border: "#22D3EE", label: "INFO",       labelColor: "#22D3EE" },
  warning:    { bg: "rgba(248,113,113,0.10)", border: "#F87171", label: "WARNING",    labelColor: "#F87171" },
  control:    { bg: "rgba(245,158,11,0.08)",  border: "#F59E0B", label: "CONTROL",    labelColor: "#F59E0B" },
  failure:    { bg: "rgba(185,28,28,0.12)",   border: "#991B1B", label: "FAILURE",    labelColor: "#F87171" },
  regulatory: { bg: "rgba(147,197,253,0.08)", border: "#93C5FD", label: "REGULATORY", labelColor: "#93C5FD" },
};

// ── Hydration-safe render timestamp ───────────────────────────────────────────
function useRenderTs(): string {
  const [ts, setTs] = useState("");
  useEffect(() => {
    setTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return ts;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CalloutBox({ callout }: { callout: GuideCallout }) {
  const cs = CALLOUT_STYLE[callout.type] ?? CALLOUT_STYLE.info;
  return (
    <div style={{
      background: cs.bg,
      border: `1px solid ${cs.border}`,
      borderLeft: `3px solid ${cs.border}`,
      padding: "10px 14px",
      marginBottom: 12,
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
    }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: cs.labelColor, letterSpacing: "0.08em", marginTop: 2, flexShrink: 0 }}>
        {cs.label}
      </span>
      <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>
        {callout.text}
      </span>
    </div>
  );
}

function StepsList({ steps }: { steps: Array<{ n: number; label: string; detail: string }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
      {steps.map((step, idx) => (
        <div key={idx} style={{ display: "flex", gap: 14, position: "relative" }}>
          {/* Connector line */}
          {idx < steps.length - 1 && (
            <div style={{
              position: "absolute",
              left: 14,
              top: 28,
              width: 1,
              height: "calc(100% - 4px)",
              background: `color-mix(in srgb, var(--accent-cyan) 20%, transparent)`,
            }} />
          )}
          {/* Step circle */}
          <div style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            border: `1.5px solid ${S.cyan}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.cyan,
            background: S.bgDeep,
            zIndex: 1,
            marginTop: 2,
          }}>
            {String(step.n).padStart(2, "0")}
          </div>
          <div style={{ paddingBottom: 16, flex: 1 }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary, marginBottom: 3 }}>
              {step.label}
            </div>
            {step.detail && (
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>
                {step.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FormulaCard({ formula }: { formula: GuideFormula }) {
  return (
    <div style={{
      background: S.bgDeep,
      border: `1px solid ${S.rim}`,
      borderLeft: `3px solid ${S.cyan}`,
      padding: "14px 18px",
      marginBottom: 12,
    }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
        {formula.label}
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary, marginBottom: 10, letterSpacing: "0.02em" }}>
        {formula.expression}
      </div>
      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6, marginBottom: formula.source ? 8 : 0 }}>
        {formula.explanation}
      </div>
      {formula.source && (
        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 4 }}>
          Source: {formula.source}
        </div>
      )}
    </div>
  );
}

function DataTable({ table }: { table: GuideTable }) {
  return (
    <div style={{ overflowX: "auto", marginBottom: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontUI, fontSize: 12 }}>
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i} style={{
                padding: "6px 12px",
                textAlign: "left",
                background: `color-mix(in srgb, var(--accent-cyan) 12%, var(--bg-panel))`,
                color: S.cyan,
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                border: `1px solid ${S.rim}`,
                whiteSpace: "nowrap",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? S.bgPanel : S.bgSub }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "6px 12px",
                  color: S.secondary,
                  border: `1px solid ${S.soft}`,
                  lineHeight: 1.5,
                  verticalAlign: "top",
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldDict({ fields }: { fields: GuideFieldDict[] }) {
  return (
    <div style={{ overflowX: "auto", marginBottom: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontUI, fontSize: 12 }}>
        <thead>
          <tr>
            {["Field", "Type", "Constraints", "Meaning", "Example"].map((h, i) => (
              <th key={i} style={{
                padding: "6px 10px",
                textAlign: "left",
                background: `color-mix(in srgb, var(--accent-cyan) 12%, var(--bg-panel))`,
                color: S.cyan,
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                border: `1px solid ${S.rim}`,
                whiteSpace: "nowrap",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((f, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? S.bgPanel : S.bgSub }}>
              <td style={{ padding: "6px 10px", fontFamily: S.fontMono, fontSize: 12, color: S.cyan, border: `1px solid ${S.soft}`, whiteSpace: "nowrap" }}>{f.name}</td>
              <td style={{ padding: "6px 10px", fontFamily: S.fontMono, fontSize: 12, color: S.secondary, border: `1px solid ${S.soft}`, whiteSpace: "nowrap" }}>{f.type}</td>
              <td style={{ padding: "6px 10px", fontFamily: S.fontMono, fontSize: 12, color: S.amber, border: `1px solid ${S.soft}` }}>{f.constraints ?? "—"}</td>
              <td style={{ padding: "6px 10px", color: S.secondary, border: `1px solid ${S.soft}`, lineHeight: 1.5 }}>{f.meaning}</td>
              <td style={{ padding: "6px 10px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, border: `1px solid ${S.soft}` }}>{f.example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div style={{
      background: "#0D1117",
      border: `1px solid ${S.rim}`,
      marginBottom: 12,
      position: "relative",
    }}>
      <div style={{
        padding: "4px 12px",
        borderBottom: `1px solid ${S.rim}`,
        fontFamily: S.fontMono,
        fontSize: 12,
        color: S.tertiary,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        background: "rgba(255,255,255,0.03)",
      }}>
        {lang}
      </div>
      <pre style={{
        margin: 0,
        padding: "12px 14px",
        fontFamily: S.fontMono,
        fontSize: 12,
        color: "#E5E7EB",
        overflowX: "auto",
        lineHeight: 1.6,
        whiteSpace: "pre",
      }}>
        {code}
      </pre>
    </div>
  );
}

function renderBlock(block: GuideBlock, idx: number) {
  switch (block.type) {
    case "text":
      return (
        <p key={idx} style={{
          fontFamily: S.fontUI,
          fontSize: 13,
          color: S.secondary,
          lineHeight: 1.7,
          margin: "0 0 12px",
          whiteSpace: "pre-line",
        }}>
          {block.body}
        </p>
      );
    case "callout":
      return <CalloutBox key={idx} callout={block.callout} />;
    case "steps":
      return <StepsList key={idx} steps={block.steps} />;
    case "formula":
      return <FormulaCard key={idx} formula={block.formula} />;
    case "table":
      return <DataTable key={idx} table={block.table} />;
    case "field-dict":
      return <FieldDict key={idx} fields={block.fields} />;
    case "code":
      return <CodeBlock key={idx} lang={block.lang} code={block.code} />;
    default:
      return null;
  }
}

// ── Level badge ────────────────────────────────────────────────────────────────
function LevelBadge({ level, small }: { level: GuideLevel; small?: boolean }) {
  const meta = GUIDE_LEVEL_META[level];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: small ? "1px 5px" : "2px 7px",
      border: `1px solid ${meta.color}`,
      color: meta.color,
      fontFamily: S.fontMono,
      fontSize: small ? 9 : 10,
      letterSpacing: "0.06em",
      background: meta.bg,
      flexShrink: 0,
    }}>
      {meta.label}
    </span>
  );
}

// ── Section renderer ───────────────────────────────────────────────────────────
function SectionCard({
  section,
  sectionRef,
  onCopyLink,
  copiedId,
}: {
  section: GuideSection;
  sectionRef: (el: HTMLElement | null) => void;
  onCopyLink: (id: string) => void;
  copiedId: string | null;
}) {
  return (
    <div
      ref={sectionRef}
      id={section.id}
      style={{
        marginBottom: 32,
        paddingBottom: 28,
        borderBottom: `1px solid ${S.soft}`,
      }}
    >
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <button
          onClick={() => onCopyLink(section.id)}
          title="Copy link to section"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            color: S.tertiary,
            fontFamily: S.fontMono,
            fontSize: 12,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = S.cyan)}
          onMouseLeave={e => (e.currentTarget.style.color = S.tertiary)}
        >
          {copiedId === section.id ? "✓" : "#"}
        </button>
        <span style={{
          fontFamily: S.fontUI,
          fontSize: 15,
          fontWeight: 700,
          color: S.primary,
          flex: 1,
        }}>
          {section.heading}
        </span>
        <LevelBadge level={section.level} />
        {section.verified ? (
          <span style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: "#4ade80",
            letterSpacing: "0.06em",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}>
            <span style={{ fontSize: 12 }}>✓</span> VERIFIED
          </span>
        ) : (
          <span style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.amber,
            letterSpacing: "0.06em",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}>
            <span style={{ fontSize: 12 }}>⚠</span> UNVERIFIED
          </span>
        )}
      </div>

      {/* Top callout */}
      {section.callout && <CalloutBox callout={section.callout} />}

      {/* Content blocks */}
      <div style={{ marginBottom: section.codeRefs && section.codeRefs.length > 0 ? 12 : 0 }}>
        {section.blocks.map((block, idx) => renderBlock(block, idx))}
      </div>

      {/* Code refs */}
      {section.codeRefs && section.codeRefs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {section.codeRefs.map((ref, i) => (
            <span key={i} style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 8px",
              background: S.bgDeep,
              border: `1px solid ${S.rim}`,
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.tertiary,
              letterSpacing: "0.04em",
            }}>
              {ref.endpoint
                ? ref.endpoint
                : `${ref.file}${ref.symbol ? `#${ref.symbol}` : ""}`
              }
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page content (inside Suspense) ───────────────────────────────────────
function HelpPageContent() {
  const renderTs = useRenderTs();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();

  // ── State ──
  const [activeGuideId, setActiveGuideId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("guide") ?? "getting-started";
    }
    return "getting-started";
  });
  const [activeLevel, setActiveLevel] = useState<GuideLevel>(() => {
    if (typeof window !== "undefined") {
      const l = new URLSearchParams(window.location.search).get("level");
      if (l && ["L1","L2","L3","L4","L5"].includes(l)) return l as GuideLevel;
    }
    return "L2";
  });
  const [searchFilter, setSearchFilter] = useState("");
  const [healthStatus, setHealthStatus] = useState<"CHECKING" | "ONLINE" | "DEGRADED" | "OFFLINE">("CHECKING");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [levelHover, setLevelHover] = useState<GuideLevel | null>(null);

  // ── Refs for section anchors ──
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // ── Derived data ──
  const activeGuide: GuideDoc | undefined = GUIDES.find(g => g.id === activeGuideId);
  const sectionsAtLevel: GuideSection[] = activeGuide
    ? activeGuide.sections.filter(s => s.level === activeLevel)
    : [];
  const verifiedStats = activeGuide ? computeVerifiedStats(activeGuide) : null;

  const filteredNav = GUIDE_NAV.filter(g => {
    if (!searchFilter) return true;
    const lower = searchFilter.toLowerCase();
    if (g.title.toLowerCase().includes(lower)) return true;
    // Also search section headings from guide data
    const doc = GUIDES.find(d => d.id === g.id);
    if (doc) {
      return doc.sections.some(s => s.heading.toLowerCase().includes(lower));
    }
    return false;
  });

  // ── Effects ──
  useEffect(() => {
    const guide = searchParams.get("guide");
    const level = searchParams.get("level") as GuideLevel | null;
    const section = searchParams.get("section");

    if (guide && GUIDE_NAV.some(g => g.id === guide)) {
      setActiveGuideId(guide);
    }
    if (level && ["L1","L2","L3","L4","L5"].includes(level)) {
      setActiveLevel(level);
    }
    if (section) {
      setTimeout(() => {
        const el = sectionRefs.current.get(section);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setHealthStatus(
          data?.status === "ok" || data?.status === "healthy" ? "ONLINE" : "DEGRADED"
        );
      } catch {
        setHealthStatus("OFFLINE");
      }
    };
    fetchHealth();
  }, [token]);

  // ── Handlers ──
  const handleGuideSelect = useCallback((id: string) => {
    setActiveGuideId(id);
    router.push(`/help?guide=${id}&level=${activeLevel}`);
    // Scroll main content to top
    document.getElementById("help-main")?.scrollTo({ top: 0 });
  }, [activeLevel, router]);

  const handleLevelSelect = useCallback((level: GuideLevel) => {
    setActiveLevel(level);
    router.push(`/help?guide=${activeGuideId}&level=${level}`);
  }, [activeGuideId, router]);

  const handleCopyLink = useCallback((sectionId: string) => {
    const url = `${window.location.origin}/help?guide=${activeGuideId}&section=${sectionId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(sectionId);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {});
  }, [activeGuideId]);

  const handleTocClick = useCallback((sectionId: string) => {
    const el = sectionRefs.current.get(sectionId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ── Status color ──
  const statusColor = healthStatus === "ONLINE" ? S.pass
    : healthStatus === "CHECKING" ? S.amber
    : healthStatus === "DEGRADED" ? S.amber
    : S.fail;

  // ── Render ──
  return (
    <>
      {/* Print CSS */}
      <style>{`
        @media print {
          aside { display: none !important; }
          #help-main { width: 100% !important; max-width: 100% !important; }
          header, footer { display: none !important; }
          body { background: white !important; color: black !important; }
          #help-main * { color: black !important; border-color: #ccc !important; background: white !important; }
        }
        html, body { height: 100%; }
        * { box-sizing: border-box; }
        input:focus { outline: 1px solid var(--accent-cyan) !important; }
      `}</style>

      <div style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: S.bgDeep,
        fontFamily: S.fontUI,
        color: S.primary,
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <header style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: 44,
          padding: "0 20px",
          background: S.bgPanel,
          borderBottom: `1px solid ${S.rim}`,
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="var(--accent-cyan)" strokeWidth="1.25" />
            <path d="M8 6v4M8 5v-.5" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <div style={{
              fontFamily: S.fontUI,
              fontSize: "0.8125rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: S.primary,
              lineHeight: 1.1,
            }}>
              Help &amp; Documentation
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.07em", color: S.tertiary }}>
              ORDR TERMINAL · PLATFORM GUIDE
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {/* Active guide indicator */}
          {activeGuide && (
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.06em" }}>
              {GUIDE_NAV.find(g => g.id === activeGuideId)?.icon ?? ""}{" "}
              {activeGuide.title.toUpperCase()}
            </span>
          )}
          <span style={{ color: S.rim, fontSize: 12 }}>·</span>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>{renderTs}</span>
        </header>

        {/* ── Body ── */}
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "240px 1fr 280px",
          overflow: "hidden",
          minHeight: 0,
        }}>

          {/* ── LEFT SIDEBAR ── */}
          <aside style={{
            borderRight: `1px solid ${S.rim}`,
            background: S.bgPanel,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
          }}>
            {/* Sidebar header */}
            <div style={{ padding: "14px 14px 8px", borderBottom: `1px solid ${S.soft}` }}>
              <div style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}>
                Platform Guide
              </div>
              <input
                type="text"
                placeholder="Search guides…"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "5px 10px",
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  color: S.primary,
                  background: S.bgSub,
                  border: `1px solid ${S.soft}`,
                  borderRadius: 2,
                  outline: "none",
                  marginBottom: 8,
                }}
              />

              {/* Level selector tabs */}
              <div style={{ display: "flex", gap: 3 }}>
                {(["L1","L2","L3","L4","L5"] as GuideLevel[]).map(level => {
                  const meta = GUIDE_LEVEL_META[level];
                  const isActive = activeLevel === level;
                  return (
                    <button
                      key={level}
                      onClick={() => handleLevelSelect(level)}
                      onMouseEnter={() => setLevelHover(level)}
                      onMouseLeave={() => setLevelHover(null)}
                      title={`${meta.description} — ${meta.audience}`}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: isActive ? 700 : 400,
                        color: isActive ? meta.color : S.tertiary,
                        background: isActive ? meta.bg : "transparent",
                        border: `1px solid ${isActive ? meta.color : S.soft}`,
                        cursor: "pointer",
                        letterSpacing: "0.04em",
                        transition: "all 100ms",
                      }}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
              {/* Level hover description */}
              {levelHover && (
                <div style={{
                  marginTop: 5,
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  color: GUIDE_LEVEL_META[levelHover].color,
                  letterSpacing: "0.04em",
                }}>
                  {GUIDE_LEVEL_META[levelHover].description} — {GUIDE_LEVEL_META[levelHover].audience}
                </div>
              )}
            </div>

            {/* Guide nav */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {filteredNav.length === 0 && (
                <div style={{
                  padding: "12px 16px",
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  color: S.tertiary,
                  letterSpacing: "0.04em",
                }}>
                  No guides match "{searchFilter}"
                </div>
              )}
              {filteredNav.map(g => {
                const isActive = activeGuideId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => handleGuideSelect(g.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 14px",
                      fontFamily: S.fontUI,
                      fontSize: 12,
                      color: isActive ? S.cyan : S.secondary,
                      background: isActive
                        ? "color-mix(in srgb, var(--accent-cyan) 8%, transparent)"
                        : "transparent",
                      borderLeft: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
                      cursor: "pointer",
                      transition: "all 80ms",
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = "color-mix(in srgb, var(--accent-cyan) 4%, transparent)";
                        e.currentTarget.style.color = S.primary;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = S.secondary;
                      }
                    }}
                  >
                    <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>{g.icon}</span>
                    <span>{g.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: S.rim }} />

            {/* Quick links */}
            <div style={{ padding: "10px 0" }}>
              <div style={{
                padding: "0 14px 6px",
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
              }}>
                Quick Links
              </div>
              {QUICK_LINKS.map(lnk => (
                <button
                  key={lnk.path}
                  onClick={() => router.push(lnk.path)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "5px 14px",
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.tertiary,
                    background: "transparent",
                    cursor: "pointer",
                    letterSpacing: "0.02em",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = S.secondary)}
                  onMouseLeave={e => (e.currentTarget.style.color = S.tertiary)}
                >
                  → {lnk.label}
                </button>
              ))}
            </div>
          </aside>

          {/* ── MAIN CONTENT ── */}
          <main
            id="help-main"
            style={{
              overflow: "auto",
              padding: "28px 32px",
              minHeight: 0,
            }}
          >
            {/* No guide selected or guide not in GUIDES array */}
            {!activeGuide ? (
              <div style={{ padding: "48px 0", textAlign: "center" }}>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  color: S.tertiary,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}>
                  No Content Yet
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
                  Documentation for <strong style={{ color: S.primary }}>
                    {GUIDE_NAV.find(g => g.id === activeGuideId)?.title ?? activeGuideId}
                  </strong> has not been written yet.
                </div>
                <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                  Guide data is loaded from <code>@/lib/help/guides</code>
                </div>
              </div>
            ) : (
              <>
                {/* Guide header */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
                    <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>
                      {GUIDE_NAV.find(g => g.id === activeGuideId)?.icon ?? "📖"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                        <h1 style={{
                          margin: 0,
                          fontFamily: S.fontUI,
                          fontSize: 20,
                          fontWeight: 700,
                          color: S.primary,
                          letterSpacing: "0.01em",
                        }}>
                          {activeGuide.title}
                        </h1>
                        <span style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          color: S.tertiary,
                          border: `1px solid ${S.soft}`,
                          padding: "2px 7px",
                          background: S.bgSub,
                          letterSpacing: "0.05em",
                        }}>
                          REVIEWED {activeGuide.lastReviewed}
                        </span>
                      </div>
                      <p style={{
                        margin: "0 0 10px",
                        fontFamily: S.fontUI,
                        fontSize: 13,
                        color: S.secondary,
                        lineHeight: 1.6,
                        maxWidth: 640,
                      }}>
                        {activeGuide.summary}
                      </p>
                      <button
                        onClick={() => router.push(activeGuide.path)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 14px",
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          letterSpacing: "0.06em",
                          color: S.cyan,
                          background: "color-mix(in srgb, var(--accent-cyan) 8%, transparent)",
                          border: `1px solid ${S.cyan}`,
                          cursor: "pointer",
                        }}
                      >
                        Open module →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Level selector tabs (in-content duplicate) */}
                <div style={{
                  marginBottom: 20,
                  padding: "12px 16px",
                  background: S.bgPanel,
                  border: `1px solid ${S.rim}`,
                }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.07em", marginRight: 8 }}>
                      DETAIL LEVEL
                    </span>
                    {(["L1","L2","L3","L4","L5"] as GuideLevel[]).map(level => {
                      const meta = GUIDE_LEVEL_META[level];
                      const isActive = activeLevel === level;
                      const count = activeGuide.sections.filter(s => s.level === level).length;
                      return (
                        <button
                          key={level}
                          onClick={() => handleLevelSelect(level)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 10px",
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color: isActive ? meta.color : S.tertiary,
                            background: isActive ? meta.bg : "transparent",
                            border: `1px solid ${isActive ? meta.color : S.soft}`,
                            cursor: "pointer",
                            transition: "all 100ms",
                          }}
                        >
                          {level}
                          {count > 0 && (
                            <span style={{
                              fontSize: 12,
                              color: isActive ? meta.color : S.tertiary,
                              opacity: 0.8,
                            }}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: GUIDE_LEVEL_META[activeLevel].color, letterSpacing: "0.04em" }}>
                    Showing {activeLevel} — {GUIDE_LEVEL_META[activeLevel].description}{" "}
                    <span style={{ color: S.tertiary }}>({GUIDE_LEVEL_META[activeLevel].audience})</span>
                  </div>
                </div>

                {/* Table of Contents */}
                {sectionsAtLevel.length > 1 && (
                  <div style={{
                    marginBottom: 24,
                    padding: "12px 16px",
                    background: S.bgPanel,
                    border: `1px solid ${S.soft}`,
                  }}>
                    <div style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: S.tertiary,
                      letterSpacing: "0.09em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}>
                      Contents — {activeLevel}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {sectionsAtLevel.map((s, i) => (
                        <button
                          key={s.id}
                          onClick={() => handleTocClick(s.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "3px 0",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, minWidth: 20 }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}
                            onMouseEnter={e => (e.currentTarget.style.color = S.cyan)}
                            onMouseLeave={e => (e.currentTarget.style.color = S.secondary)}
                          >
                            {s.heading}
                          </span>
                          <span style={{ marginLeft: "auto" }}>
                            {s.verified ? (
                              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: "#4ade80" }}>✓</span>
                            ) : (
                              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber }}>⚠</span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section rendering */}
                {sectionsAtLevel.length === 0 ? (
                  <div style={{
                    padding: "40px 0",
                    textAlign: "center",
                  }}>
                    <div style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: S.tertiary,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}>
                      No {activeLevel} Content
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
                      No {activeLevel} content for this guide yet.
                    </div>
                    <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                      Try switching to a different level.
                    </div>
                  </div>
                ) : (
                  <div>
                    {sectionsAtLevel.map(section => (
                      <SectionCard
                        key={section.id}
                        section={section}
                        sectionRef={el => {
                          if (el) sectionRefs.current.set(section.id, el);
                          else sectionRefs.current.delete(section.id);
                        }}
                        onCopyLink={handleCopyLink}
                        copiedId={copiedId}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </main>

          {/* ── RIGHT RAIL ── */}
          <aside style={{
            borderLeft: `1px solid ${S.rim}`,
            background: S.bgPanel,
            overflow: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}>

            {/* System Status */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}>
                System Status
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  { label: "Backend API", color: statusColor, status: healthStatus },
                  { label: "Frontend",    color: S.pass,      status: "ONLINE" },
                  { label: "Platform",    color: S.tertiary,  status: PLATFORM_VERSION },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
                      {row.label}
                    </span>
                    <span style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: row.color,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}>
                      {row.label !== "Platform" && (
                        <span style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: row.color,
                          display: "inline-block",
                          flexShrink: 0,
                        }} />
                      )}
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: S.rim, marginBottom: 16 }} />

            {/* Documentation Coverage */}
            {activeGuide && verifiedStats && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.tertiary,
                    letterSpacing: "0.09em",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}>
                    Documentation Coverage
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 6 }}>
                    Verified: {verifiedStats.verified}/{verifiedStats.total} sections ({verifiedStats.pct}%)
                  </div>
                  {/* Progress bar */}
                  <div style={{
                    height: 4,
                    background: S.bgSub,
                    border: `1px solid ${S.soft}`,
                    marginBottom: 8,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${verifiedStats.pct}%`,
                      background: verifiedStats.pct >= 80 ? "#4ade80" : verifiedStats.pct >= 50 ? S.amber : S.fail,
                      transition: "width 300ms ease",
                    }} />
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                    Last Reviewed: {activeGuide.lastReviewed}
                  </div>
                </div>
                <div style={{ height: 1, background: S.rim, marginBottom: 16 }} />
              </>
            )}

            {/* Knowledge Base */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}>
                Knowledge Base
              </div>
              <button
                onClick={() => router.push("/hedgewiki")}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "7px 12px",
                  marginBottom: 10,
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  letterSpacing: "0.05em",
                  color: S.cyan,
                  background: "color-mix(in srgb, var(--accent-cyan) 8%, transparent)",
                  border: `1px solid ${S.cyan}`,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Open HedgeWiki →
              </button>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {KB_LINKS.map(lnk => (
                  <button
                    key={lnk.id}
                    onClick={() => router.push("/hedgewiki")}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "4px 2px",
                      fontFamily: S.fontUI,
                      fontSize: 12,
                      color: S.tertiary,
                      background: "transparent",
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = S.secondary)}
                    onMouseLeave={e => (e.currentTarget.style.color = S.tertiary)}
                  >
                    {lnk.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: S.rim, marginBottom: 16 }} />

            {/* Quick Refs */}
            <div>
              <div style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}>
                Quick Refs
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {QUICK_REFS.map(ref => (
                  <a
                    key={ref.label}
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      padding: "4px 2px",
                      fontFamily: S.fontUI,
                      fontSize: 12,
                      color: S.tertiary,
                      textDecoration: "none",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = S.cyan)}
                    onMouseLeave={e => (e.currentTarget.style.color = S.tertiary)}
                  >
                    ↗ {ref.label}
                  </a>
                ))}
              </div>
            </div>

          </aside>
        </div>

        {/* ── Footer ── */}
        <footer style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: 28,
          padding: "0 20px",
          borderTop: `1px solid ${S.rim}`,
          background: S.bgPanel,
          fontFamily: S.fontMono,
          fontSize: "0.6875rem",
          color: S.tertiary,
          letterSpacing: "0.04em",
          flexShrink: 0,
        }}>
          <span>ORDR Terminal</span>
          <span style={{ color: S.rim }}>·</span>
          <span>Platform Help &amp; Documentation</span>
          <span style={{ color: S.rim }}>·</span>
          <span>{PLATFORM_VERSION}</span>
          <div style={{ flex: 1 }} />
          <span>{renderTs}</span>
        </footer>
      </div>
    </>
  );
}

// ── Suspense boundary (Next.js 15 requirement for useSearchParams) ─────────────
export default function HelpPage() {
  return (

    <PageShell icon={HelpCircle} title="Help Center" breadcrumb={["Dashboard", "Help"]} noPadding>
    <Suspense fallback={
      <div style={{
        background: "var(--bg-deep)",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 12,
          color: "var(--text-tertiary)",
          letterSpacing: "0.1em",
        }}>
          LOADING…
        </span>
      </div>
    }>
      <HelpPageContent />
    </Suspense>
  
    </PageShell>
    );
}
