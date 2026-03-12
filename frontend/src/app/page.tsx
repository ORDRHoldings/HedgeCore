"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  Shield, Lock, Users, FileCheck, Code2, Sun, Moon, ArrowRight, Zap, Database,
  BarChart3, Activity, Mail,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════
   Dual Theme System
   ═══════════════════════════════════════════════════════ */

type ThemeMode = "light" | "dark";

interface Theme {
  bg: string; bgSoft: string; bgCard: string; bgNav: string;
  border: string; borderCard: string; text: string; textMuted: string; textDim: string;
  accent: string; accentGlow: string; cardHover: string; cardShadow: string;
  cardGlowBorder: string; tagBg: string; tagText: string; iconBg: string; iconColor: string;
  ctaBg: string; ctaText: string; tickerBg: string; statBg: string;
  heroGradient: string; navBorder: string; btnPrimary: string; btnPrimaryText: string;
  btnSecBorder: string; btnSecText: string; glowOrb1: string; glowOrb2: string;
}

const LIGHT: Theme = {
  bg: "#ffffff", bgSoft: "#f8fafc", bgCard: "#ffffff", bgNav: "#1e3a5f",
  border: "#e2e8f0", borderCard: "#e2e8f0", text: "#0f172a", textMuted: "#64748b", textDim: "#94a3b8",
  accent: "#1e3a5f", accentGlow: "rgba(30,58,95,0.12)", cardHover: "#f8fafc",
  cardShadow: "0 4px 24px rgba(0,0,0,0.06)", cardGlowBorder: "#4a90d9",
  tagBg: "#f1f5f9", tagText: "#64748b", iconBg: "#e8f0fe", iconColor: "#1e3a5f",
  ctaBg: "#1e3a5f", ctaText: "#ffffff", tickerBg: "#1e3a5f", statBg: "#f8fafc",
  heroGradient: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(30,58,95,0.04), transparent 70%)",
  navBorder: "rgba(255,255,255,0.1)", btnPrimary: "#1e3a5f", btnPrimaryText: "#fff",
  btnSecBorder: "#d1d5db", btnSecText: "#0f172a", glowOrb1: "transparent", glowOrb2: "transparent",
};

const DARK: Theme = {
  bg: "#09090b", bgSoft: "#111113", bgCard: "#131316", bgNav: "rgba(9,9,11,0.85)",
  border: "#1e1e22", borderCard: "#27272a", text: "#fafafa", textMuted: "#a1a1aa", textDim: "#71717a",
  accent: "#22d3ee", accentGlow: "rgba(34,211,238,0.08)", cardHover: "#18181b",
  cardShadow: "0 4px 32px rgba(0,0,0,0.4)", cardGlowBorder: "#22d3ee",
  tagBg: "rgba(34,211,238,0.08)", tagText: "#22d3ee", iconBg: "rgba(34,211,238,0.08)", iconColor: "#22d3ee",
  ctaBg: "#111113", ctaText: "#fafafa", tickerBg: "#111113", statBg: "#111113",
  heroGradient: "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(34,211,238,0.06), transparent 60%)",
  navBorder: "#27272a", btnPrimary: "#22d3ee", btnPrimaryText: "#000",
  btnSecBorder: "#3f3f46", btnSecText: "#a1a1aa", glowOrb1: "rgba(34,211,238,0.1)", glowOrb2: "rgba(129,140,248,0.08)",
};

const F = {
  ui: "'IBM Plex Sans', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', monospace",
  heading: "'Manrope', 'IBM Plex Sans', sans-serif",
} as const;

/* ═══════════════════════════════════════════════════════
   Data
   ═══════════════════════════════════════════════════════ */

interface Product {
  name: string; desc: string; tags: string[];
  href: string; external?: boolean; icon: React.ReactNode;
}

const PRODUCTS: Product[] = [
  { name: "ORDR TREASURY", desc: "FX hedge governance. Deterministic engine, 4-eyes approval, WORM audit trail, IFRS 9 effectiveness testing.", tags: ["GOVERNANCE", "AUDIT", "HEDGING"], href: "/dashboard", icon: <LayoutGrid size={20} strokeWidth={1.8} /> },
  { name: "ORDR MARKET", desc: "Professional charting & agentic trading. 77 indicators, multi-asset FX, equities, crypto, commodities.", tags: ["CHARTING", "TRADING"], href: "/market", icon: <TrendingUp size={20} strokeWidth={1.8} /> },
  { name: "ORDR PORTFOLIO HEDGE", desc: "Portfolio risk engine. Decompose exposures, classify R1\u2013R8, generate hedge plans. Sub-50ms computation.", tags: ["RISK", "ENGINE"], href: "/portfolio-risk", icon: <PieChart size={20} strokeWidth={1.8} /> },
  { name: "ORDR LABS", desc: "Scenario Studio & Sandbox. Stress testing, Monte Carlo, crisis library, what-if analysis.", tags: ["SIMULATION", "SANDBOX"], href: "/scenario-studio", icon: <FlaskConical size={20} strokeWidth={1.8} /> },
  { name: "ORDR POLISOPHIC", desc: "Political & macro risk intelligence. Corridor scoring, geopolitical tracking, currency-impact analysis.", tags: ["GEOPOLITICAL", "INTELLIGENCE"], href: "/polisophic", icon: <Globe size={20} strokeWidth={1.8} /> },
  { name: "ORDR HEDGEWIKI", desc: "Institutional knowledge base. ISDA definitions, IFRS 9 / ASC 815 guidance, methodology reference.", tags: ["KNOWLEDGE", "COMPLIANCE"], href: "https://hedge-wiki.vercel.app/", external: true, icon: <BookOpen size={20} strokeWidth={1.8} /> },
  { name: "ORDR FINHUB", desc: "Financial magazine & data hub. Market analysis, research, economic feeds, curated intelligence.", tags: ["MAGAZINE", "RESEARCH"], href: "/market-intelligence", icon: <Newspaper size={20} strokeWidth={1.8} /> },
];

const TICKER = [
  { sym: "EUR/USD", price: "1.0847", chg: "+0.12%", up: true },
  { sym: "GBP/USD", price: "1.2634", chg: "+0.08%", up: true },
  { sym: "USD/JPY", price: "149.82", chg: "-0.24%", up: false },
  { sym: "USD/CHF", price: "0.8847", chg: "+0.05%", up: true },
  { sym: "AUD/USD", price: "0.6521", chg: "-0.18%", up: false },
  { sym: "SPX", price: "5,667.20", chg: "+0.34%", up: true },
  { sym: "GOLD", price: "2,178.40", chg: "+0.52%", up: true },
  { sym: "BTC", price: "67,842", chg: "-1.23%", up: false },
];

const STATS = [
  { value: "7", label: "Products", icon: <LayoutGrid size={14} /> },
  { value: "219", label: "API Endpoints", icon: <Zap size={14} /> },
  { value: "41", label: "Engine Modules", icon: <Database size={14} /> },
  { value: "77", label: "Indicators", icon: <BarChart3 size={14} /> },
  { value: "3,200+", label: "Tests", icon: <Activity size={14} /> },
  { value: "<50ms", label: "Latency", icon: <Code2 size={14} /> },
];

const CAPABILITIES = [
  { num: "R1\u2013R8", label: "Risk Taxonomy", desc: "Eight frozen risk categories. Translation, transaction, economic, strategic exposure." },
  { num: "SHA-256", label: "Hash Chain", desc: "Per-tenant WORM audit trail. Tamper-evident, regulation-proof." },
  { num: "4-Eyes", label: "Governance", desc: "Maker-checker with Sandbox \u2192 Staging \u2192 Ledger pipeline." },
  { num: "60", label: "Policy Presets", desc: "Maturity profiles, governance tiers, evidence grades." },
];

const TRUST = [
  { label: "WORM Audit", icon: <Shield size={16} strokeWidth={1.8} /> },
  { label: "SHA-256 Chain", icon: <Lock size={16} strokeWidth={1.8} /> },
  { label: "4-Eyes", icon: <Users size={16} strokeWidth={1.8} /> },
  { label: "IFRS 9 / ASC 815", icon: <FileCheck size={16} strokeWidth={1.8} /> },
  { label: "Deterministic", icon: <Code2 size={16} strokeWidth={1.8} /> },
];

/* ═══════════════════════════════════════════════════════
   Hooks
   ═══════════════════════════════════════════════════════ */

function useStagger(count: number, baseDelay = 60) {
  const [vis, setVis] = useState<boolean[]>(Array(count).fill(false));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        for (let i = 0; i < count; i++) {
          setTimeout(() => setVis((p) => { const n = [...p]; n[i] = true; return n; }), i * baseDelay);
        }
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [count, baseDelay]);
  return { ref, vis };
}

function useFadeIn(threshold = 0.1) {
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

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export default function LandingPage() {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [mob, setMob] = useState(false);
  const [heroVis, setHeroVis] = useState(false);

  useEffect(() => {
    const s = localStorage.getItem("ordr_landing_theme");
    if (s === "dark" || s === "light") setMode(s);
  }, []);

  useEffect(() => {
    const c = () => setMob(window.innerWidth < 768);
    c(); window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  useEffect(() => { setTimeout(() => setHeroVis(true), 100); }, []);

  const toggle = useCallback(() => {
    setMode((p) => { const n = p === "light" ? "dark" : "light"; localStorage.setItem("ordr_landing_theme", n); return n; });
  }, []);

  const T = mode === "light" ? LIGHT : DARK;
  const dk = mode === "dark";
  const prodStagger = useStagger(7, 80);
  const capFade = useFadeIn();
  const archStagger = useStagger(5, 100);
  const trustFade = useFadeIn();

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: F.ui, overflowX: "hidden", transition: "background 0.5s, color 0.5s" }}>

      <style>{`
        @keyframes o-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes o-pulse { 0%,100% { opacity:.3 } 50% { opacity:1 } }
        @keyframes o-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes o-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes o-gradient { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes o-borderGlow { 0% { border-color: ${dk ? "rgba(34,211,238,0.15)" : "rgba(30,58,95,0.08)"}; } 50% { border-color: ${dk ? "rgba(34,211,238,0.4)" : "rgba(74,144,217,0.3)"}; } 100% { border-color: ${dk ? "rgba(34,211,238,0.15)" : "rgba(30,58,95,0.08)"}; } }
        html { scroll-behavior: smooth; }
        .o-card { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); cursor: pointer; text-decoration: none; color: inherit; position: relative; }
        .o-card:hover { transform: translateY(-4px) scale(1.01); box-shadow: ${dk ? "0 8px 40px rgba(34,211,238,0.1), 0 0 0 1px rgba(34,211,238,0.2)" : "0 8px 40px rgba(0,0,0,0.08), 0 0 0 1px rgba(74,144,217,0.2)"} !important; z-index: 2; }
        .o-card:hover .o-card-icon { transform: scale(1.12) rotate(-3deg); }
        .o-card:hover .o-card-arrow { opacity: 1; transform: translateX(0); }
        .o-card:hover .o-card-shine { opacity: 1; }
        .o-cap { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .o-cap:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.25) !important; background: rgba(255,255,255,0.08) !important; }
        .o-nav-link { position: relative; transition: color 0.15s; }
        .o-nav-link:hover { color: #fff !important; }
        .o-nav-link::after { content:''; position:absolute; bottom:-2px; left:0; right:0; height:1.5px; background:#fff; transform:scaleX(0); transition:transform 0.2s; transform-origin:left; }
        .o-nav-link:hover::after { transform:scaleX(1); }
        .o-btn { transition: all 0.2s ease; }
        .o-btn:hover { transform: translateY(-2px); box-shadow: ${dk ? "0 4px 20px rgba(34,211,238,0.2)" : "0 4px 20px rgba(30,58,95,0.15)"}; }
        .o-toggle { transition: all 0.25s ease; }
        .o-toggle:hover { transform: scale(1.1); box-shadow: ${dk ? "0 0 16px rgba(34,211,238,0.25)" : "0 0 16px rgba(30,58,95,0.12)"}; }
        .o-stat { transition: all 0.3s ease; }
        .o-stat:hover { transform: translateY(-2px); background: ${dk ? "rgba(34,211,238,0.06)" : "rgba(30,58,95,0.04)"} !important; }
        .o-arch { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .o-arch:hover { transform: translateY(-3px); box-shadow: ${dk ? "0 8px 30px rgba(34,211,238,0.08)" : "0 8px 30px rgba(0,0,0,0.06)"}; border-color: ${dk ? "rgba(34,211,238,0.3)" : "rgba(74,144,217,0.3)"} !important; }
        .o-trust { transition: all 0.2s ease; }
        .o-trust:hover { transform: scale(1.05); }
      `}</style>

      {/* ══════════ NAV ══════════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: mob ? "0 16px" : "0 48px", height: 52,
        background: dk ? T.bgNav : T.bgNav,
        backdropFilter: dk ? "blur(20px) saturate(180%)" : "none",
        WebkitBackdropFilter: dk ? "blur(20px) saturate(180%)" : "none",
        borderBottom: `1px solid ${T.navBorder}`,
        transition: "background 0.5s, border-color 0.5s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: F.mono, fontSize: 12, fontWeight: 800,
            background: dk ? "linear-gradient(135deg, #22d3ee, #818cf8)" : "#fff",
            color: dk ? "#000" : "#1e3a5f",
          }}>O</div>
          <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "#fff" }}>ORDR-Terminal</span>
        </div>
        {!mob && (
          <div style={{ display: "flex", gap: 24 }}>
            {["Products", "Platform", "Architecture"].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className="o-nav-link" style={{
                fontFamily: F.ui, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.65)", textDecoration: "none", padding: "4px 0",
              }}>{item}</a>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={toggle} className="o-toggle" style={{
            width: 34, height: 34, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
            color: dk ? "#22d3ee" : "rgba(255,255,255,0.8)",
          }} title={dk ? "Light Mode" : "Gemini Pro Dark"}>
            {dk ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <Link href="/auth/login" className="o-btn" style={{
            fontFamily: F.ui, fontSize: 12, fontWeight: 600, color: "#fff",
            padding: "6px 16px", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 7,
            textDecoration: "none", background: "transparent",
          }}>Sign In</Link>
          {!mob && (
            <Link href="/auth/login" className="o-btn" style={{
              fontFamily: F.ui, fontSize: 12, fontWeight: 600,
              color: dk ? "#000" : "#1e3a5f", background: dk ? "#22d3ee" : "#fff",
              padding: "6px 16px", borderRadius: 7, textDecoration: "none", border: "none",
            }}>Get Access</Link>
          )}
        </div>
      </nav>

      {/* ══════════ TICKER ══════════ */}
      <div style={{
        position: "fixed", top: 52, left: 0, right: 0, zIndex: 99,
        padding: "6px 0", overflow: "hidden", background: dk ? T.tickerBg : "#16324d",
        borderBottom: `1px solid ${dk ? T.border : "rgba(255,255,255,0.06)"}`,
        transition: "background 0.5s",
      }}>
        <div style={{ display: "flex", gap: 36, animation: "o-ticker 40s linear infinite", width: "max-content" }}>
          {[...TICKER, ...TICKER].map((t, i) => (
            <div key={`${t.sym}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", color: "rgba(255,255,255,0.45)" }}>{t.sym}</span>
              <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: "#fff" }}>{t.price}</span>
              <span style={{
                fontFamily: F.mono, fontSize: 12, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                color: t.up ? "#34d399" : "#f87171",
                background: t.up ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
              }}>{t.chg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════ HERO (compact) + PRODUCTS (immediate) ══════════ */}
      <div style={{ paddingTop: 82 }}>

        {/* Hero — compact, no full-page waste */}
        <section style={{
          padding: mob ? "40px 20px 24px" : "56px 48px 32px",
          textAlign: "center", position: "relative", overflow: "hidden",
          background: T.bg, transition: "background 0.5s",
        }}>
          {/* Glow orbs (dark mode) */}
          {dk && <>
            <div style={{ position: "absolute", top: "-20%", left: "10%", width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${T.glowOrb1}, transparent 70%)`, pointerEvents: "none", animation: "o-float 8s ease infinite" }} />
            <div style={{ position: "absolute", top: "0%", right: "5%", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${T.glowOrb2}, transparent 70%)`, pointerEvents: "none", animation: "o-float 10s ease infinite 2s" }} />
          </>}
          {/* Grid pattern */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `linear-gradient(${dk ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.02)"} 1px, transparent 1px), linear-gradient(90deg, ${dk ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.02)"} 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 70% 80% at 50% 50%, black 10%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 80% at 50% 50%, black 10%, transparent 70%)",
          }} />

          <div style={{
            position: "relative", zIndex: 1, maxWidth: 800, margin: "0 auto",
            opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.7s ease, transform 0.7s ease",
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px",
              border: `1px solid ${T.border}`, borderRadius: 100,
              fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: T.textDim, marginBottom: 20,
              background: dk ? "rgba(34,211,238,0.04)" : "transparent",
              transition: "all 0.5s",
            }}>
              <span style={{ width: 5, height: 5, background: "#22c55e", borderRadius: "50%", animation: "o-pulse 2s ease infinite", boxShadow: dk ? "0 0 6px #22c55e" : "none" }} />
              Institutional Infrastructure &mdash; ORDR-Terminal
            </div>

            <h1 style={{
              fontFamily: F.heading, fontSize: mob ? 40 : 64, fontWeight: 800,
              letterSpacing: "-0.04em", lineHeight: 1, margin: 0,
              ...(dk ? {
                background: "linear-gradient(135deg, #22d3ee, #818cf8, #c084fc)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundSize: "200% 200%", animation: "o-gradient 6s ease infinite",
              } : { color: T.accent }),
            }}>ORDR-Terminal</h1>
            <p style={{
              fontFamily: F.ui, fontSize: mob ? 15 : 17, color: T.textMuted,
              fontWeight: 400, maxWidth: 500, lineHeight: 1.55, margin: "14px auto 0",
            }}>
              Seven products. One platform. The operating system for modern capital markets.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
              <Link href="/auth/login" className="o-btn" style={{
                fontFamily: F.ui, fontSize: 14, fontWeight: 600,
                color: T.btnPrimaryText, background: T.btnPrimary,
                padding: "11px 28px", borderRadius: 9, textDecoration: "none", border: "none",
                boxShadow: dk ? "0 0 20px rgba(34,211,238,0.15)" : "0 2px 8px rgba(30,58,95,0.15)",
              }}>Get Access <ArrowRight size={14} style={{ marginLeft: 6, verticalAlign: "middle" }} /></Link>
              <a href="mailto:info@orderterminal.com" className="o-btn" style={{
                fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: T.btnSecText,
                background: "transparent", padding: "11px 28px", borderRadius: 9,
                border: `1.5px solid ${T.btnSecBorder}`, textDecoration: "none",
              }}>Contact Us</a>
            </div>
          </div>

          {/* Stats row — compact, inline */}
          <div style={{
            display: "flex", justifyContent: "center", gap: mob ? 6 : 12,
            maxWidth: 880, margin: "32px auto 0", flexWrap: "wrap",
            opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s",
          }}>
            {STATS.map((s) => (
              <div key={s.label} className="o-stat" style={{
                flex: mob ? "1 1 30%" : 1, background: T.statBg, padding: mob ? "10px 8px" : "14px 12px",
                textAlign: "center", borderRadius: 10, border: `1px solid ${T.border}`,
                transition: "all 0.5s",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <span style={{ color: dk ? T.accent : T.accent, opacity: 0.6 }}>{s.icon}</span>
                  <span style={{ fontFamily: F.mono, fontSize: mob ? 16 : 22, fontWeight: 700, color: dk ? T.accent : T.accent, letterSpacing: "-0.02em" }}>{s.value}</span>
                </div>
                <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 600, color: T.textDim, letterSpacing: "0.12em", marginTop: 4, textTransform: "uppercase" as const }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════ PRODUCTS — immediately visible ══════════ */}
        <section id="products" ref={prodStagger.ref} style={{
          padding: mob ? "24px 16px 40px" : "32px 48px 56px",
          background: T.bg, transition: "background 0.5s",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(4, 1fr)",
            gap: mob ? 12 : 14,
            maxWidth: 1200, margin: "0 auto",
          }}>
            {PRODUCTS.map((p, i) => {
              const isLastRow = !mob && i >= 4;
              const colSpan = !mob && i === 4 ? undefined : undefined;
              return (
                <ProductCard key={p.name} product={p} theme={T} dk={dk} mob={mob}
                  visible={prodStagger.vis[i] || false}
                  style={isLastRow && !mob && PRODUCTS.length === 7 && i === 6 ? {} : {}}
                />
              );
            })}
          </div>
        </section>
      </div>

      {/* ══════════ CAPABILITIES ══════════ */}
      <section id="platform" ref={capFade.ref} style={{
        background: dk ? T.bgSoft : T.ctaBg, color: "#fff",
        padding: mob ? "48px 16px" : "64px 48px",
        position: "relative", overflow: "hidden",
        opacity: capFade.visible ? 1 : 0,
        transform: capFade.visible ? "translateY(0)" : "translateY(30px)",
        transition: "opacity 0.7s ease, transform 0.7s ease, background 0.5s",
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 10%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 10%, transparent 70%)",
        }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: mob ? "block" : "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: mob ? 28 : 40 }}>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: dk ? "rgba(34,211,238,0.5)" : "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, marginBottom: 8 }}>
                Platform
              </div>
              <h2 style={{ fontFamily: F.heading, fontSize: mob ? 28 : 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1.1, margin: 0 }}>
                Built to institutional standards
              </h2>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", maxWidth: 360, lineHeight: 1.5, marginTop: mob ? 12 : 0 }}>
              Deterministic. Auditable. Governed. Every component designed for regulatory scrutiny.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, 1fr)", gap: mob ? 10 : 16 }}>
            {CAPABILITIES.map((cap) => (
              <div key={cap.label} className="o-cap" style={{
                padding: mob ? "18px 14px" : "24px 20px",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12,
                background: "rgba(255,255,255,0.03)",
              }}>
                <div style={{
                  fontFamily: F.mono, fontSize: mob ? 24 : 32, fontWeight: 700, letterSpacing: "-0.02em",
                  ...(dk ? { background: "linear-gradient(135deg, #22d3ee, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } : { color: "#fff" }),
                }}>{cap.num}</div>
                <div style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 6 }}>{cap.label}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.45, marginTop: 6 }}>{cap.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ ARCHITECTURE ══════════ */}
      <section id="architecture" ref={archStagger.ref} style={{
        background: T.bg, padding: mob ? "48px 16px" : "64px 48px",
        transition: "background 0.5s",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: mob ? "block" : "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: mob ? 24 : 36 }}>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: dk ? T.accent : "#4a90d9", textTransform: "uppercase" as const, marginBottom: 8 }}>Architecture</div>
              <h2 style={{ fontFamily: F.heading, fontSize: mob ? 28 : 36, fontWeight: 800, letterSpacing: "-0.03em", color: T.text, lineHeight: 1.1, margin: 0 }}>
                Deterministic by design
              </h2>
            </div>
            <p style={{ fontSize: 14, color: T.textMuted, maxWidth: 360, lineHeight: 1.5, marginTop: mob ? 12 : 0 }}>
              Same inputs, same outputs. No ML black boxes. Reproducible and explainable to auditors.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(5, 1fr)", gap: mob ? 10 : 14 }}>
            {[
              { label: "Engine", value: "41", desc: "Pure deterministic kernel modules" },
              { label: "Routes", value: "219", desc: "RBAC-protected API endpoints" },
              { label: "Models", value: "27", desc: "Async ORM + WORM semantics" },
              { label: "Coverage", value: "62%", desc: "Across 3,200+ test cases" },
              { label: "Auth", value: "9\u00d741", desc: "Roles \u00d7 permissions, fail-closed" },
            ].map((b, i) => (
              <div key={b.label} className="o-arch" style={{
                padding: mob ? "16px 14px" : "20px 18px",
                border: `1px solid ${T.border}`, borderRadius: 12,
                background: dk ? T.bgCard : T.bg,
                opacity: archStagger.vis[i] ? 1 : 0,
                transform: archStagger.vis[i] ? "translateY(0)" : "translateY(16px)",
                transition: "opacity 0.5s ease, transform 0.5s ease, background 0.5s, border-color 0.3s",
                ...(mob && i === 4 ? { gridColumn: "1 / -1" } : {}),
              }}>
                <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: T.textDim, textTransform: "uppercase" as const }}>{b.label}</div>
                <div style={{ fontFamily: F.mono, fontSize: mob ? 20 : 24, fontWeight: 700, color: dk ? T.accent : T.accent, marginTop: 4 }}>{b.value}</div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4, lineHeight: 1.35 }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ TRUST STRIP ══════════ */}
      <div ref={trustFade.ref} style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        gap: mob ? 16 : 40, padding: mob ? "20px 16px" : "28px 48px",
        borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
        background: dk ? T.bgSoft : "#e8f0fe", flexWrap: "wrap",
        opacity: trustFade.visible ? 1 : 0, transition: "opacity 0.6s ease, background 0.5s",
      }}>
        {TRUST.map((t) => (
          <div key={t.label} className="o-trust" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: dk ? T.accent : "#1e3a5f" }}>{t.icon}</span>
            <span style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 600, color: dk ? T.textMuted : "#1e3a5f" }}>{t.label}</span>
          </div>
        ))}
      </div>

      {/* ══════════ CTA ══════════ */}
      <section style={{
        background: dk ? T.bgSoft : T.ctaBg,
        padding: mob ? "48px 20px" : "64px 48px",
        textAlign: "center", position: "relative", overflow: "hidden",
        transition: "background 0.5s",
      }}>
        {dk && <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 600, height: 300, background: "radial-gradient(ellipse, rgba(34,211,238,0.06), transparent 60%)", pointerEvents: "none" }} />}
        {!dk && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 50%, #2a4a72, #1e3a5f)" }} />}
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: mob ? 28 : 38, fontWeight: 800, letterSpacing: "-0.03em", margin: 0,
            ...(dk ? { background: "linear-gradient(135deg, #22d3ee, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } : { color: "#fff" }),
          }}>
            The terminal for modern capital markets
          </h2>
          <p style={{ fontSize: 15, color: dk ? T.textDim : "rgba(255,255,255,0.5)", marginTop: 12, maxWidth: 420, marginLeft: "auto", marginRight: "auto", lineHeight: 1.45 }}>
            Seven products. One platform. Institutional-grade infrastructure.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
            <Link href="/auth/login" className="o-btn" style={{
              fontFamily: F.ui, fontSize: 14, fontWeight: 600,
              color: dk ? "#000" : "#1e3a5f", background: dk ? "#22d3ee" : "#fff",
              padding: "12px 32px", borderRadius: 9, textDecoration: "none", border: "none",
              boxShadow: dk ? "0 0 20px rgba(34,211,238,0.15)" : "0 2px 8px rgba(0,0,0,0.1)",
            }}>Get Access <ArrowRight size={14} style={{ marginLeft: 6, verticalAlign: "middle" }} /></Link>
            <a href="mailto:info@orderterminal.com" className="o-btn" style={{
              fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: dk ? T.textDim : "rgba(255,255,255,0.65)",
              background: "transparent", padding: "12px 32px", borderRadius: 9,
              textDecoration: "none", border: `1.5px solid ${dk ? T.border : "rgba(255,255,255,0.2)"}`,
              display: "flex", alignItems: "center", gap: 6,
            }}><Mail size={14} /> info@orderterminal.com</a>
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer style={{
        padding: mob ? "24px 16px" : "28px 48px",
        borderTop: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12, background: T.bg, transition: "background 0.5s, border-color 0.5s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 18, height: 18, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: F.mono, fontSize: 8, fontWeight: 800,
            background: dk ? "linear-gradient(135deg, #22d3ee, #818cf8)" : "#1e3a5f", color: dk ? "#000" : "#fff",
          }}>O</div>
          <span style={{ fontFamily: F.ui, fontSize: 12, color: T.textDim }}>
            ORDR-Terminal &copy; {new Date().getFullYear()}
          </span>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <a href="mailto:info@orderterminal.com" style={{ fontSize: 12, color: T.textDim, textDecoration: "none" }}>info@orderterminal.com</a>
          {["Privacy", "Terms", "Security", "Docs"].map((link) => (
            <a key={link} href="#" style={{ fontSize: 12, color: T.textDim, textDecoration: "none" }}>{link}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Product Card — animated, dense, interactive
   ═══════════════════════════════════════════════════════ */

function ProductCard({ product, theme: T, dk, mob, visible, style: extraStyle }: {
  product: Product; theme: Theme; dk: boolean; mob: boolean; visible: boolean; style?: React.CSSProperties;
}) {
  const { name, desc, tags, href, external, icon } = product;

  const inner = (
    <div className="o-card" style={{
      background: T.bgCard, padding: mob ? "20px 16px" : "24px 20px",
      display: "flex", flexDirection: "column" as const, gap: 10,
      borderRadius: 14, border: `1px solid ${T.borderCard}`,
      boxShadow: dk ? "0 2px 12px rgba(0,0,0,0.3)" : "0 1px 8px rgba(0,0,0,0.04)",
      minHeight: mob ? undefined : 220,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.97)",
      transition: "opacity 0.5s ease, transform 0.5s cubic-bezier(0.4,0,0.2,1), background 0.5s, border-color 0.5s, box-shadow 0.3s",
      overflow: "hidden",
      ...extraStyle,
    }}>
      {/* Shimmer line on top */}
      <div className="o-card-shine" style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: dk ? "linear-gradient(90deg, transparent, #22d3ee, #818cf8, transparent)" : "linear-gradient(90deg, transparent, #4a90d9, #1e3a5f, transparent)",
        backgroundSize: "200% 100%", animation: "o-shimmer 3s linear infinite",
        opacity: 0, transition: "opacity 0.3s",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="o-card-icon" style={{
          width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          background: T.iconBg, color: T.iconColor, transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
          flexShrink: 0,
        }}>{icon}</div>
        <div style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", color: T.text }}>{name}</div>
        <div className="o-card-arrow" style={{
          marginLeft: "auto", color: dk ? T.accent : T.accent,
          opacity: 0, transform: "translateX(-4px)", transition: "all 0.25s",
        }}><ArrowRight size={16} /></div>
      </div>
      <p style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5, flex: 1, margin: 0 }}>{desc}</p>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: "auto" }}>
        {tags.map((tag) => (
          <span key={tag} style={{
            fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
            color: T.tagText, background: T.tagBg, padding: "2px 7px", borderRadius: 4,
            border: dk ? `1px solid ${T.border}` : "none",
          }}>{tag}</span>
        ))}
      </div>
    </div>
  );

  if (external) return <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{inner}</a>;
  return <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>{inner}</Link>;
}
