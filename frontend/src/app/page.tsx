"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics/events";
import {
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  Shield, Lock, Users, FileCheck, Code2, Sun, Moon, ArrowRight, Zap, Database,
  BarChart3, Activity, Mail, ChevronRight, Cpu, Eye, Layers, Terminal,
  CheckCircle2, ExternalLink,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════
   Theme System
   ═══════════════════════════════════════════════════════ */

type ThemeMode = "light" | "dark";

interface Theme {
  bg: string; bgDeep: string; bgCard: string; bgGlass: string; bgNav: string;
  border: string; borderSoft: string; text: string; textSub: string; textDim: string;
  accent: string; accentSoft: string; accentGlow: string; accentText: string;
  accent2: string; accent2Soft: string;
  cardShadow: string; navShadow: string;
  heroGrad: string; sectionAlt: string;
  tagBg: string; tagText: string; tagBorder: string;
  ctaBg: string; footerBg: string;
  green: string; red: string;
}

const DARK: Theme = {
  bg: "#050508", bgDeep: "#020204", bgCard: "#0c0c12", bgGlass: "rgba(12,12,18,0.7)",
  bgNav: "rgba(5,5,8,0.8)",
  border: "#16161f", borderSoft: "#1e1e2a", text: "#eeeef2", textSub: "#9494a8", textDim: "#5c5c72",
  accent: "#22d3ee", accentSoft: "rgba(34,211,238,0.08)", accentGlow: "rgba(34,211,238,0.15)",
  accentText: "#000", accent2: "#818cf8", accent2Soft: "rgba(129,140,248,0.08)",
  cardShadow: "0 4px 40px rgba(0,0,0,0.5)", navShadow: "0 1px 40px rgba(0,0,0,0.5)",
  heroGrad: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(34,211,238,0.08), transparent 60%), radial-gradient(ellipse 60% 40% at 80% 10%, rgba(129,140,248,0.06), transparent 50%)",
  sectionAlt: "#08080d",
  tagBg: "rgba(34,211,238,0.06)", tagText: "#22d3ee", tagBorder: "rgba(34,211,238,0.12)",
  ctaBg: "#0a0a10", footerBg: "#030305",
  green: "#34d399", red: "#f87171",
};

const LIGHT: Theme = {
  bg: "#ffffff", bgDeep: "#f8fafc", bgCard: "#ffffff", bgGlass: "rgba(255,255,255,0.8)",
  bgNav: "rgba(255,255,255,0.85)",
  border: "#e2e8f0", borderSoft: "#edf0f4", text: "#0f172a", textSub: "#64748b", textDim: "#94a3b8",
  accent: "#1e3a5f", accentSoft: "rgba(30,58,95,0.06)", accentGlow: "rgba(30,58,95,0.1)",
  accentText: "#fff", accent2: "#4a90d9", accent2Soft: "rgba(74,144,217,0.06)",
  cardShadow: "0 4px 24px rgba(0,0,0,0.06)", navShadow: "0 1px 24px rgba(0,0,0,0.06)",
  heroGrad: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30,58,95,0.05), transparent 60%)",
  sectionAlt: "#f4f6f9",
  tagBg: "rgba(30,58,95,0.05)", tagText: "#1e3a5f", tagBorder: "rgba(30,58,95,0.1)",
  ctaBg: "#1e3a5f", footerBg: "#0f172a",
  green: "#16a34a", red: "#dc2626",
};

const F = {
  ui: "'IBM Plex Sans', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  heading: "'Manrope', 'IBM Plex Sans', sans-serif",
} as const;

/* ═══════════════════════════════════════════════════════
   Data
   ═══════════════════════════════════════════════════════ */

const PRODUCTS = [
  { name: "ORDR Treasury", short: "TREASURY", desc: "FX hedge governance engine. Deterministic computation, 4-eyes approval, WORM audit trail, IFRS 9 effectiveness testing. The institutional standard.", tags: ["GOVERNANCE", "AUDIT", "HEDGING"], href: "/dashboard", icon: <LayoutGrid size={22} strokeWidth={1.6} />, color: "#22d3ee" },
  { name: "ORDR Market", short: "MARKET", desc: "Professional charting & agentic trading platform. 77 indicators, multi-asset coverage — FX, equities, crypto, commodities.", tags: ["CHARTING", "TRADING"], href: "/market", icon: <TrendingUp size={22} strokeWidth={1.6} />, color: "#34d399" },
  { name: "ORDR Portfolio Hedge", short: "PORTFOLIO", desc: "Portfolio risk engine. Decompose exposures, classify R1–R8, generate hedge plans with sub-50ms computation.", tags: ["RISK", "ENGINE"], href: "/portfolio-risk", icon: <PieChart size={22} strokeWidth={1.6} />, color: "#818cf8" },
  { name: "ORDR Labs", short: "LABS", desc: "Scenario Studio & Sandbox. Stress testing, Monte Carlo simulation, crisis library, what-if analysis for hedge strategy.", tags: ["SIMULATION", "SANDBOX"], href: "/scenario-studio", icon: <FlaskConical size={22} strokeWidth={1.6} />, color: "#f59e0b" },
  { name: "ORDR Polisophic", short: "POLISOPHIC", desc: "Political & macro risk intelligence. Corridor scoring, geopolitical event tracking, currency-impact analysis.", tags: ["GEOPOLITICAL", "INTEL"], href: "/polisophic", icon: <Globe size={22} strokeWidth={1.6} />, color: "#ec4899" },
  { name: "ORDR HedgeWiki", short: "HEDGEWIKI", desc: "Institutional knowledge base. ISDA definitions, IFRS 9 / ASC 815 guidance, methodology reference library.", tags: ["KNOWLEDGE", "COMPLIANCE"], href: "https://hedge-wiki.vercel.app/", external: true, icon: <BookOpen size={22} strokeWidth={1.6} />, color: "#a78bfa" },
  { name: "ORDR FinHub", short: "FINHUB", desc: "Financial magazine & data hub. Market analysis, research feeds, economic data, curated intelligence.", tags: ["MAGAZINE", "RESEARCH"], href: "/market-intelligence", icon: <Newspaper size={22} strokeWidth={1.6} />, color: "#fb923c" },
];

const TICKER = [
  { sym: "EUR/USD", price: "1.0847", chg: "+0.12%", up: true },
  { sym: "GBP/USD", price: "1.2634", chg: "+0.08%", up: true },
  { sym: "USD/JPY", price: "149.82", chg: "-0.24%", up: false },
  { sym: "USD/CHF", price: "0.8847", chg: "+0.05%", up: true },
  { sym: "AUD/USD", price: "0.6521", chg: "-0.18%", up: false },
  { sym: "USD/CAD", price: "1.3612", chg: "+0.03%", up: true },
  { sym: "SPX", price: "5,667.20", chg: "+0.34%", up: true },
  { sym: "GOLD", price: "2,178.40", chg: "+0.52%", up: true },
  { sym: "BTC", price: "67,842", chg: "-1.23%", up: false },
  { sym: "NDX", price: "19,842", chg: "+0.61%", up: true },
];

const METRICS = [
  { value: "7", label: "Products", suffix: "" },
  { value: "219", label: "API Endpoints", suffix: "+" },
  { value: "41", label: "Engine Modules", suffix: "" },
  { value: "77", label: "Chart Indicators", suffix: "" },
  { value: "3,263", label: "Passing Tests", suffix: "" },
  { value: "<50", label: "ms Latency", suffix: "ms" },
];

const CAPABILITIES = [
  { icon: <Shield size={20} />, label: "WORM Audit Trail", desc: "Append-only event log with SHA-256 hash chain. Tamper-evident, regulation-proof audit semantics for every calculation and approval.", num: "SHA-256" },
  { icon: <Users size={20} />, label: "4-Eyes Governance", desc: "Maker-checker approval workflow with Separation of Duties enforcement. Sandbox → Staging → Ledger pipeline.", num: "4-EYES" },
  { icon: <Layers size={20} />, label: "R1–R8 Risk Taxonomy", desc: "Eight frozen risk categories covering translation, transaction, economic, and strategic exposure classification.", num: "R1–R8" },
  { icon: <FileCheck size={20} />, label: "IFRS 9 / ASC 815", desc: "Built-in prospective effectiveness testing, hedge documentation, and accounting framework alignment.", num: "IFRS 9" },
  { icon: <Cpu size={20} />, label: "Deterministic Engine", desc: "Same inputs produce identical outputs. No ML black boxes. Reproducible, explainable, auditor-friendly.", num: "v1" },
  { icon: <Eye size={20} />, label: "60 Policy Presets", desc: "Maturity profiles, governance tiers, evidence grades, accounting modes — ready-to-deploy institutional templates.", num: "60" },
];

const COMPLIANCE = [
  { label: "WORM Semantics", sub: "Append-only audit tables" },
  { label: "SHA-256 Hash Chain", sub: "Per-tenant tamper detection" },
  { label: "4-Eyes Approval", sub: "Maker-checker with SoD" },
  { label: "IFRS 9 / ASC 815", sub: "Hedge effectiveness testing" },
  { label: "BCBS FRTB", sub: "Stress test methodology" },
  { label: "Fail-Closed RBAC", sub: "9 roles × 41 permissions" },
];

/* ═══════════════════════════════════════════════════════
   Hooks
   ═══════════════════════════════════════════════════════ */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible: v };
}

function useCounter(target: number, visible: boolean, duration = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(target * ease));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [visible, target, duration]);
  return count;
}

/* ═══════════════════════════════════════════════════════
   Animated Counter Component
   ═══════════════════════════════════════════════════════ */
function AnimatedMetric({ value, label, suffix, visible, dk, T }: {
  value: string; label: string; suffix: string; visible: boolean; dk: boolean; T: Theme;
}) {
  const numeric = parseInt(value.replace(/[^0-9]/g, ""), 10);
  const hasLt = value.startsWith("<");
  const counted = useCounter(numeric, visible);
  const display = hasLt ? `<${counted}` : counted.toLocaleString();

  return (
    <div style={{
      textAlign: "center", padding: "20px 12px",
      opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)",
      transition: "opacity 0.6s ease, transform 0.6s ease",
    }}>
      <div style={{
        fontFamily: F.mono, fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em",
        color: dk ? T.accent : T.accent, lineHeight: 1,
      }}>
        {display}{suffix && <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.6 }}>{suffix === "ms" ? "" : suffix}</span>}
      </div>
      <div style={{
        fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em",
        color: T.textDim, marginTop: 8, textTransform: "uppercase" as const,
      }}>{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Terminal Preview Component
   ═══════════════════════════════════════════════════════ */
function TerminalPreview({ dk, T }: { dk: boolean; T: Theme }) {
  return (
    <div style={{
      width: "100%", maxWidth: 900, margin: "0 auto",
      background: dk ? "#0c0c14" : "#0f172a",
      borderRadius: 12, overflow: "hidden",
      border: `1px solid ${dk ? "#1a1a28" : "#1e293b"}`,
      boxShadow: dk
        ? "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.05)"
        : "0 24px 80px rgba(0,0,0,0.2)",
    }}>
      {/* Title bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
        background: dk ? "#08080e" : "#0c1526",
        borderBottom: `1px solid ${dk ? "#151520" : "#1e293b"}`,
      }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
        </div>
        <span style={{ fontFamily: F.mono, fontSize: 12, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>
          ORDR Terminal — Dashboard
        </span>
      </div>
      {/* Content simulation */}
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "NET EXPOSURE", value: "$42.8M", color: "#22d3ee" },
            { label: "HEDGE RATIO", value: "72.4%", color: "#34d399" },
            { label: "UNREALIZED P&L", value: "+$1.2M", color: "#34d399" },
            { label: "VaR (95%)", value: "$890K", color: "#f59e0b" },
          ].map(k => (
            <div key={k.label} style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 6, padding: "12px 14px",
            }}>
              <div style={{ fontFamily: F.mono, fontSize: 12, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>{k.label}</div>
              <div style={{ fontFamily: F.mono, fontSize: 20, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </div>
        {/* Chart placeholder */}
        <div style={{
          height: 120, background: "rgba(255,255,255,0.02)", borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.04)", position: "relative", overflow: "hidden",
        }}>
          <svg viewBox="0 0 800 120" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,90 Q80,85 160,70 T320,55 T480,40 T640,50 T800,30" fill="none" stroke="#22d3ee" strokeWidth="2" opacity="0.6" />
            <path d="M0,90 Q80,85 160,70 T320,55 T480,40 T640,50 T800,30 L800,120 L0,120Z" fill="url(#chartGrad)" />
          </svg>
          <div style={{
            position: "absolute", top: 10, left: 14,
            fontFamily: F.mono, fontSize: 12, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em",
          }}>EUR/USD · 1H · LIVE</div>
        </div>
        {/* Position rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {[
            { pair: "EUR/USD", notional: "$12.5M", hedge: "FWD 3M", status: "HEDGED", statusColor: "#34d399" },
            { pair: "GBP/USD", notional: "$8.2M", hedge: "OPT 6M", status: "PENDING", statusColor: "#f59e0b" },
            { pair: "USD/JPY", notional: "$15.1M", hedge: "—", status: "OPEN", statusColor: "#ef4444" },
          ].map(r => (
            <div key={r.pair} style={{
              display: "grid", gridTemplateColumns: "80px 1fr 100px 80px",
              padding: "8px 10px", background: "rgba(255,255,255,0.015)",
              borderRadius: 3, alignItems: "center",
            }}>
              <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: "#22d3ee" }}>{r.pair}</span>
              <span style={{ fontFamily: F.mono, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{r.notional}</span>
              <span style={{ fontFamily: F.mono, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{r.hedge}</span>
              <span style={{
                fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: r.statusColor,
                textAlign: "right",
              }}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════ */

export default function LandingPage() {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [mob, setMob] = useState(false);
  const [heroVis, setHeroVis] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const s = localStorage.getItem("ordr_landing_theme");
    if (s === "dark" || s === "light") setMode(s);
  }, []);

  useEffect(() => {
    const c = () => setMob(window.innerWidth < 768);
    c(); window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  useEffect(() => { setTimeout(() => setHeroVis(true), 80); }, []);

  useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  const toggle = useCallback(() => {
    setMode(p => { const n = p === "light" ? "dark" : "light"; localStorage.setItem("ordr_landing_theme", n); return n; });
  }, []);

  const T = mode === "light" ? LIGHT : DARK;
  const dk = mode === "dark";

  const metricsView = useInView(0.2);
  const productsView = useInView(0.1);
  const capView = useInView(0.1);
  const compView = useInView(0.15);
  const archView = useInView(0.15);

  const navSolid = scrollY > 60;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: F.ui, overflowX: "hidden" }}>

      <style>{`
        @keyframes o-ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes o-pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
        @keyframes o-glow { 0%,100%{opacity:.4} 50%{opacity:.8} }
        @keyframes o-mesh { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes o-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes o-shine { 0%{left:-100%} 100%{left:200%} }
        html{scroll-behavior:smooth}
        *{box-sizing:border-box}
        .o-nav-link{position:relative;transition:color .2s}
        .o-nav-link:hover{color:${dk ? "#fff" : "#0f172a"} !important}
        .o-nav-link::after{content:'';position:absolute;bottom:-2px;left:0;right:0;height:1.5px;background:${dk ? T.accent : T.accent};transform:scaleX(0);transition:transform .2s;transform-origin:left}
        .o-nav-link:hover::after{transform:scaleX(1)}
        .o-btn{transition:all .2s cubic-bezier(.4,0,.2,1)}
        .o-btn:hover{transform:translateY(-2px);box-shadow:${dk ? "0 6px 24px rgba(34,211,238,0.2)" : "0 6px 24px rgba(30,58,95,0.15)"}}
        .o-product{transition:all .35s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden}
        .o-product:hover{transform:translateY(-6px);box-shadow:${dk ? "0 16px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,211,238,0.15)" : "0 16px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(30,58,95,0.15)"} !important}
        .o-product:hover .o-product-glow{opacity:1}
        .o-product:hover .o-product-arrow{opacity:1;transform:translateX(0)}
        .o-cap-card{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .o-cap-card:hover{transform:translateY(-4px);border-color:${dk ? "rgba(34,211,238,0.25)" : "rgba(30,58,95,0.2)"} !important;box-shadow:${dk ? "0 8px 40px rgba(34,211,238,0.08)" : "0 8px 40px rgba(30,58,95,0.08)"}}
      `}</style>

      {/* ══════════ NAV ══════════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: mob ? "0 16px" : "0 48px", height: 56,
        background: navSolid ? (dk ? "rgba(5,5,8,0.95)" : "rgba(255,255,255,0.95)") : "transparent",
        backdropFilter: navSolid ? "blur(20px) saturate(180%)" : "none",
        WebkitBackdropFilter: navSolid ? "blur(20px) saturate(180%)" : "none",
        borderBottom: navSolid ? `1px solid ${T.border}` : "1px solid transparent",
        boxShadow: navSolid ? T.navShadow : "none",
        transition: "background .3s, border-color .3s, box-shadow .3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: F.mono, fontSize: 13, fontWeight: 800,
            background: dk ? "linear-gradient(135deg, #22d3ee, #818cf8)" : T.accent,
            color: dk ? "#000" : "#fff",
          }}>O</div>
          <span style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", color: T.text }}>
            ORDR
          </span>
          <span style={{
            fontFamily: F.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.06em",
            color: T.textDim, display: mob ? "none" : "inline",
          }}>Terminal</span>
        </div>
        {!mob && (
          <div style={{ display: "flex", gap: 28 }}>
            {["Products", "Platform", "Architecture"].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} className="o-nav-link" style={{
                fontFamily: F.ui, fontSize: 13, fontWeight: 500, color: T.textSub, textDecoration: "none", padding: "4px 0",
              }}>{item}</a>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={toggle} style={{
            width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            border: `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            color: dk ? T.accent : T.textSub, transition: "all .2s",
          }}>
            {dk ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <Link href="/auth/login" className="o-btn" style={{
            fontFamily: F.ui, fontSize: 13, fontWeight: 600, color: T.textSub,
            padding: "7px 18px", border: `1px solid ${T.border}`, borderRadius: 8,
            textDecoration: "none", background: "transparent",
          }}>Sign In</Link>
          {!mob && (
            <Link href="/auth/login" className="o-btn" onClick={() => trackEvent("click_get_access", "nav")} style={{
              fontFamily: F.ui, fontSize: 13, fontWeight: 600,
              color: T.accentText, background: T.accent,
              padding: "7px 20px", borderRadius: 8, textDecoration: "none", border: "none",
            }}>Get Access</Link>
          )}
        </div>
      </nav>

      {/* ══════════ TICKER ══════════ */}
      <div style={{
        position: "fixed", top: 56, left: 0, right: 0, zIndex: 99,
        padding: "5px 0", overflow: "hidden",
        background: dk ? "rgba(8,8,13,0.95)" : "rgba(15,23,42,0.95)",
        borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)"}`,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", gap: 40, animation: "o-ticker 50s linear infinite", width: "max-content" }}>
          {[...TICKER, ...TICKER].map((t, i) => (
            <div key={`${t.sym}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", color: "rgba(255,255,255,0.35)" }}>{t.sym}</span>
              <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{t.price}</span>
              <span style={{
                fontFamily: F.mono, fontSize: 12, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                color: t.up ? "#34d399" : "#f87171",
                background: t.up ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
              }}>{t.chg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════ HERO ══════════ */}
      <section style={{
        paddingTop: mob ? 120 : 86,
        minHeight: mob ? "auto" : "100vh",
        display: "flex", flexDirection: "column", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        {/* Gradient mesh background */}
        <div style={{
          position: "absolute", inset: 0, background: T.heroGrad, pointerEvents: "none",
        }} />
        {/* Grid overlay */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: `linear-gradient(${dk ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.015)"} 1px, transparent 1px), linear-gradient(90deg, ${dk ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.015)"} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 40%, black 10%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 40%, black 10%, transparent 70%)",
        }} />
        {/* Glow orbs */}
        {dk && <>
          <div style={{ position: "absolute", top: "5%", left: "15%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.06), transparent 60%)", pointerEvents: "none", animation: "o-float 12s ease infinite" }} />
          <div style={{ position: "absolute", top: "10%", right: "10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(129,140,248,0.05), transparent 60%)", pointerEvents: "none", animation: "o-float 15s ease infinite 3s" }} />
        </>}

        <div style={{
          position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto",
          padding: mob ? "40px 20px 32px" : "48px 48px 40px",
          width: "100%",
        }}>
          {/* Badge */}
          <div style={{
            opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(16px)",
            transition: "all .6s ease",
            textAlign: "center",
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
              border: `1px solid ${T.border}`, borderRadius: 100,
              fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: T.textDim,
              background: dk ? "rgba(34,211,238,0.03)" : "rgba(30,58,95,0.03)",
            }}>
              <span style={{ width: 6, height: 6, background: "#22c55e", borderRadius: "50%", animation: "o-pulse 2s ease infinite", boxShadow: dk ? "0 0 8px rgba(34,197,94,0.4)" : "none" }} />
              Institutional-Grade FX Infrastructure
            </div>
          </div>

          {/* Headline */}
          <div style={{
            textAlign: "center", marginTop: 32,
            opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(24px)",
            transition: "all .7s ease .1s",
          }}>
            <h1 style={{
              fontFamily: F.heading, fontSize: mob ? 44 : 76, fontWeight: 800,
              letterSpacing: "-0.04em", lineHeight: 1.05, margin: 0,
              ...(dk ? {
                background: "linear-gradient(135deg, #f0f0f5 0%, #22d3ee 45%, #818cf8 75%, #c084fc 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundSize: "200% 200%", animation: "o-mesh 8s ease infinite",
              } : { color: T.accent }),
            }}>
              The operating system{mob ? " " : <br />}for capital markets
            </h1>
            <p style={{
              fontFamily: F.ui, fontSize: mob ? 16 : 19, color: T.textSub,
              fontWeight: 400, maxWidth: 580, lineHeight: 1.6, margin: "20px auto 0",
            }}>
              Seven products. One platform. Deterministic hedge computation, governed execution, and institutional-grade audit trails — built for Treasury.
            </p>
          </div>

          {/* CTAs */}
          <div style={{
            display: "flex", gap: 12, justifyContent: "center", marginTop: 36, flexWrap: "wrap",
            opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(16px)",
            transition: "all .7s ease .2s",
          }}>
            <Link href="/auth/login" className="o-btn" onClick={() => trackEvent("click_launch_terminal", "hero")} style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: T.accentText, background: T.accent,
              padding: "13px 32px", borderRadius: 10, textDecoration: "none", border: "none",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: dk ? "0 0 30px rgba(34,211,238,0.15)" : "0 4px 16px rgba(30,58,95,0.15)",
            }}>Launch Terminal <ArrowRight size={16} /></Link>
            <a href="mailto:info@orderterminal.com" className="o-btn" onClick={() => trackEvent("click_contact_sales", "hero")} style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: T.textSub,
              background: "transparent", padding: "13px 32px", borderRadius: 10,
              border: `1.5px solid ${T.border}`, textDecoration: "none",
              display: "flex", alignItems: "center", gap: 8,
            }}><Mail size={16} /> Contact Sales</a>
          </div>

          {/* Terminal Preview */}
          {!mob && (
            <div style={{
              marginTop: 56,
              opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0) perspective(1200px) rotateX(2deg)" : "translateY(40px) perspective(1200px) rotateX(6deg)",
              transition: "all .9s cubic-bezier(.4,0,.2,1) .3s",
            }}>
              <TerminalPreview dk={dk} T={T} />
            </div>
          )}
        </div>
      </section>

      {/* ══════════ METRICS STRIP ══════════ */}
      <section ref={metricsView.ref} style={{
        background: T.sectionAlt,
        borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
        padding: mob ? "20px 16px" : "8px 48px",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "grid", gridTemplateColumns: mob ? "repeat(3, 1fr)" : "repeat(6, 1fr)",
          gap: 0,
        }}>
          {METRICS.map((m, i) => (
            <div key={m.label} style={{ borderRight: !mob && i < 5 ? `1px solid ${T.border}` : "none" }}>
              <AnimatedMetric {...m} visible={metricsView.visible} dk={dk} T={T} />
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ PRODUCTS ══════════ */}
      <section id="products" ref={productsView.ref} style={{
        padding: mob ? "64px 16px" : "96px 48px",
        background: T.bg, position: "relative",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Section header */}
          <div style={{
            marginBottom: mob ? 36 : 56, maxWidth: 600,
            opacity: productsView.visible ? 1 : 0,
            transform: productsView.visible ? "translateY(0)" : "translateY(20px)",
            transition: "all .6s ease",
          }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: dk ? T.accent : T.accent2, marginBottom: 12 }}>PRODUCTS</div>
            <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, color: T.text }}>
              Seven products.{mob ? " " : <br />}One institutional platform.
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 15, color: T.textSub, lineHeight: 1.6, marginTop: 16 }}>
              Each product is purpose-built for a specific function in the hedge lifecycle — from exposure classification to governed execution.
            </p>
          </div>

          {/* Product grid — 3 top, 4 bottom on desktop */}
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
            gap: mob ? 14 : 16,
          }}>
            {PRODUCTS.map((p, i) => {
              const visible = productsView.visible;
              const delay = i * 0.08;
              const card = (
                <div className="o-product" key={p.name} style={{
                  background: T.bgCard, padding: mob ? "24px 20px" : "28px 24px",
                  borderRadius: 14, border: `1px solid ${T.borderSoft}`,
                  boxShadow: dk ? "0 2px 20px rgba(0,0,0,0.3)" : "0 1px 8px rgba(0,0,0,0.04)",
                  display: "flex", flexDirection: "column", gap: 14,
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(24px)",
                  transition: `opacity .5s ease ${delay}s, transform .5s cubic-bezier(.4,0,.2,1) ${delay}s, box-shadow .3s, border-color .3s`,
                  cursor: "pointer",
                  ...((!mob && i === 6) ? { gridColumn: "2 / 3" } : {}),
                }}>
                  {/* Hover glow */}
                  <div className="o-product-glow" style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 2,
                    background: `linear-gradient(90deg, transparent, ${p.color}, transparent)`,
                    opacity: 0, transition: "opacity .3s",
                  }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                      background: `${p.color}${dk ? "12" : "0a"}`,
                      color: p.color, flexShrink: 0,
                      border: `1px solid ${p.color}${dk ? "20" : "15"}`,
                    }}>{p.icon}</div>
                    <div>
                      <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: T.text }}>{p.name}</div>
                    </div>
                    <div className="o-product-arrow" style={{ marginLeft: "auto", color: p.color, opacity: 0, transform: "translateX(-4px)", transition: "all .25s" }}>
                      {p.external ? <ExternalLink size={16} /> : <ArrowRight size={16} />}
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6, flex: 1, margin: 0 }}>{p.desc}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {p.tags.map(tag => (
                      <span key={tag} style={{
                        fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
                        color: T.tagText, background: T.tagBg, padding: "2px 8px", borderRadius: 4,
                        border: `1px solid ${T.tagBorder}`,
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              );
              if (p.external) return <a key={p.name} href={p.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{card}</a>;
              return <Link key={p.name} href={p.href} style={{ textDecoration: "none", color: "inherit" }}>{card}</Link>;
            })}
          </div>
        </div>
      </section>

      {/* ══════════ CAPABILITIES ══════════ */}
      <section id="platform" ref={capView.ref} style={{
        background: dk ? T.sectionAlt : T.bgDeep,
        padding: mob ? "64px 16px" : "96px 48px",
        position: "relative",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{
            display: mob ? "block" : "flex", justifyContent: "space-between", alignItems: "flex-end",
            marginBottom: mob ? 36 : 56,
            opacity: capView.visible ? 1 : 0, transform: capView.visible ? "translateY(0)" : "translateY(20px)",
            transition: "all .6s ease",
          }}>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: dk ? T.accent : T.accent2, marginBottom: 12 }}>PLATFORM</div>
              <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, color: T.text }}>
                Built to institutional standards
              </h2>
            </div>
            <p style={{ fontSize: 15, color: T.textSub, maxWidth: 400, lineHeight: 1.6, marginTop: mob ? 16 : 0 }}>
              Every component designed for regulatory scrutiny. Deterministic, auditable, governed.
            </p>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: mob ? 12 : 16,
          }}>
            {CAPABILITIES.map((cap, i) => (
              <div key={cap.label} className="o-cap-card" style={{
                background: T.bgCard, border: `1px solid ${T.borderSoft}`, borderRadius: 14,
                padding: mob ? "24px 20px" : "28px 24px",
                opacity: capView.visible ? 1 : 0,
                transform: capView.visible ? "translateY(0)" : "translateY(20px)",
                transition: `all .5s ease ${i * 0.08}s`,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    background: dk ? T.accentSoft : T.accentSoft,
                    color: dk ? T.accent : T.accent,
                    border: `1px solid ${dk ? "rgba(34,211,238,0.1)" : "rgba(30,58,95,0.08)"}`,
                  }}>{cap.icon}</div>
                  <span style={{
                    fontFamily: F.mono, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em",
                    color: dk ? T.accent : T.accent, opacity: 0.5,
                  }}>{cap.num}</span>
                </div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>{cap.label}</div>
                <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6, margin: 0 }}>{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ COMPLIANCE ══════════ */}
      <section ref={compView.ref} style={{
        background: dk ? "#0a0a12" : "#1e3a5f",
        padding: mob ? "56px 16px" : "80px 48px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Grid pattern */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 10%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 10%, transparent 70%)",
        }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
          <div style={{
            opacity: compView.visible ? 1 : 0, transform: compView.visible ? "translateY(0)" : "translateY(20px)",
            transition: "all .6s ease",
          }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: dk ? "rgba(34,211,238,0.5)" : "rgba(255,255,255,0.4)", marginBottom: 12 }}>COMPLIANCE & SECURITY</div>
            <h2 style={{ fontFamily: F.heading, fontSize: mob ? 28 : 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.15, margin: 0, color: "#fff" }}>
              Audit-ready from day one
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", maxWidth: 500, margin: "16px auto 0", lineHeight: 1.6 }}>
              Every transaction, every approval, every calculation — hash-chained and immutable.
            </p>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(3, 1fr)", gap: mob ? 10 : 14,
            marginTop: mob ? 36 : 48, maxWidth: 900, margin: `${mob ? 36 : 48}px auto 0`,
          }}>
            {COMPLIANCE.map((c, i) => (
              <div key={c.label} style={{
                padding: mob ? "16px 14px" : "20px 18px",
                border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                textAlign: "left",
                opacity: compView.visible ? 1 : 0,
                transform: compView.visible ? "translateY(0)" : "translateY(16px)",
                transition: `all .5s ease ${i * 0.06}s`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <CheckCircle2 size={14} style={{ color: dk ? "#22d3ee" : "#34d399", flexShrink: 0 }} />
                  <span style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: "#fff" }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.4, paddingLeft: 22 }}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ ARCHITECTURE ══════════ */}
      <section id="architecture" ref={archView.ref} style={{
        background: T.bg, padding: mob ? "64px 16px" : "96px 48px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{
            display: mob ? "block" : "flex", justifyContent: "space-between", alignItems: "flex-end",
            marginBottom: mob ? 36 : 56,
            opacity: archView.visible ? 1 : 0, transform: archView.visible ? "translateY(0)" : "translateY(20px)",
            transition: "all .6s ease",
          }}>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: dk ? T.accent : T.accent2, marginBottom: 12 }}>ARCHITECTURE</div>
              <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, color: T.text }}>
                Deterministic by design
              </h2>
            </div>
            <p style={{ fontSize: 15, color: T.textSub, maxWidth: 400, lineHeight: 1.6, marginTop: mob ? 16 : 0 }}>
              Same inputs, same outputs. No ML black boxes. Reproducible and explainable to auditors.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(5, 1fr)", gap: mob ? 10 : 14 }}>
            {[
              { label: "Engine", value: "41", desc: "Pure deterministic kernel modules", icon: <Cpu size={18} /> },
              { label: "Routes", value: "219", desc: "RBAC-protected API endpoints", icon: <Zap size={18} /> },
              { label: "Models", value: "27", desc: "Async ORM + WORM semantics", icon: <Database size={18} /> },
              { label: "Coverage", value: "62%", desc: "Across 3,263 test cases", icon: <Activity size={18} /> },
              { label: "Auth", value: "9×41", desc: "Roles × permissions, fail-closed", icon: <Lock size={18} /> },
            ].map((b, i) => (
              <div key={b.label} className="o-cap-card" style={{
                padding: mob ? "20px 16px" : "24px 20px",
                border: `1px solid ${T.borderSoft}`, borderRadius: 12,
                background: T.bgCard,
                opacity: archView.visible ? 1 : 0,
                transform: archView.visible ? "translateY(0)" : "translateY(16px)",
                transition: `all .5s ease ${i * 0.08}s`,
                ...(mob && i === 4 ? { gridColumn: "1 / -1" } : {}),
              }}>
                <div style={{ color: dk ? T.accent : T.accent, opacity: 0.5, marginBottom: 12 }}>{b.icon}</div>
                <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: T.textDim, textTransform: "uppercase" as const }}>{b.label}</div>
                <div style={{ fontFamily: F.mono, fontSize: mob ? 24 : 30, fontWeight: 800, color: dk ? T.accent : T.accent, marginTop: 4, letterSpacing: "-0.02em" }}>{b.value}</div>
                <div style={{ fontSize: 12, color: T.textSub, marginTop: 6, lineHeight: 1.4 }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CTA ══════════ */}
      <section style={{
        background: dk ? T.sectionAlt : T.ctaBg,
        padding: mob ? "64px 20px" : "96px 48px",
        textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        {dk && <>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 700, height: 400, background: "radial-gradient(ellipse, rgba(34,211,238,0.04), transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "30%", left: "30%", width: 400, height: 300, background: "radial-gradient(ellipse, rgba(129,140,248,0.03), transparent 60%)", pointerEvents: "none" }} />
        </>}
        {!dk && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.08), transparent)" }} />}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
            border: `1px solid ${dk ? T.border : "rgba(255,255,255,0.15)"}`, borderRadius: 100,
            fontFamily: F.mono, fontSize: 12, fontWeight: 600,
            color: dk ? T.textDim : "rgba(255,255,255,0.5)",
            marginBottom: 24,
          }}>
            <Terminal size={14} />
            Ready to deploy
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: mob ? 32 : 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            ...(dk ? {
              background: "linear-gradient(135deg, #f0f0f5, #22d3ee, #818cf8)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            } : { color: "#fff" }),
          }}>
            The terminal for modern capital markets
          </h2>
          <p style={{ fontSize: 16, color: dk ? T.textDim : "rgba(255,255,255,0.5)", marginTop: 16, lineHeight: 1.6 }}>
            Institutional-grade FX hedge governance. Deterministic, auditable, governed — from exposure to execution.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36, flexWrap: "wrap" }}>
            <Link href="/auth/login" className="o-btn" onClick={() => trackEvent("click_launch_terminal", "footer")} style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: dk ? "#000" : T.accent, background: dk ? T.accent : "#fff",
              padding: "14px 36px", borderRadius: 10, textDecoration: "none", border: "none",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: dk ? "0 0 30px rgba(34,211,238,0.2)" : "0 4px 16px rgba(0,0,0,0.1)",
            }}>Launch Terminal <ArrowRight size={16} /></Link>
            <a href="mailto:info@orderterminal.com" className="o-btn" onClick={() => trackEvent("click_contact_sales", "footer")} style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: dk ? T.textSub : "rgba(255,255,255,0.6)",
              background: "transparent", padding: "14px 36px", borderRadius: 10,
              textDecoration: "none", border: `1.5px solid ${dk ? T.border : "rgba(255,255,255,0.15)"}`,
              display: "flex", alignItems: "center", gap: 8,
            }}><Mail size={16} /> Contact Sales</a>
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{
        background: dk ? T.footerBg : T.footerBg,
        borderTop: `1px solid ${dk ? T.border : "rgba(255,255,255,0.08)"}`,
        padding: mob ? "40px 16px 24px" : "56px 48px 32px",
        color: "rgba(255,255,255,0.4)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: mob ? "block" : "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 40 }}>
            {/* Brand */}
            <div style={{ marginBottom: mob ? 32 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: F.mono, fontSize: 13, fontWeight: 800,
                  background: "linear-gradient(135deg, #22d3ee, #818cf8)", color: "#000",
                }}>O</div>
                <span style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.8)" }}>ORDR Terminal</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
                Institutional-grade FX hedge governance. Built for Treasury teams, risk committees, and regulators.
              </p>
            </div>
            {/* Products */}
            <div style={{ marginBottom: mob ? 24 : 0 }}>
              <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 16 }}>PRODUCTS</div>
              {PRODUCTS.slice(0, 5).map(p => (
                <div key={p.name} style={{ marginBottom: 10 }}>
                  <Link href={p.href} style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>{p.name}</Link>
                </div>
              ))}
            </div>
            {/* Resources */}
            <div style={{ marginBottom: mob ? 24 : 0 }}>
              <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 16 }}>RESOURCES</div>
              {["Documentation", "API Reference", "HedgeWiki", "Methodology", "Changelog"].map(r => (
                <div key={r} style={{ marginBottom: 10 }}>
                  <a href="#" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>{r}</a>
                </div>
              ))}
            </div>
            {/* Company */}
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 16 }}>COMPANY</div>
              {["About", "Security", "Privacy", "Terms", "Contact"].map(r => (
                <div key={r} style={{ marginBottom: 10 }}>
                  <a href={r === "Contact" ? "mailto:info@orderterminal.com" : "#"} style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>{r}</a>
                </div>
              ))}
            </div>
          </div>
          {/* Bottom bar */}
          <div style={{
            borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: mob ? 32 : 48,
            paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 12,
          }}>
            <span style={{ fontFamily: F.ui, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
              &copy; {new Date().getFullYear()} ORDR Terminal. All rights reserved.
            </span>
            <a href="mailto:info@orderterminal.com" style={{ fontFamily: F.mono, fontSize: 12, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>info@orderterminal.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
