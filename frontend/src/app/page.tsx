"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics/events";
import {
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  Shield, Users, FileCheck, Cpu, Eye, Layers, ArrowRight, CheckCircle2,
  Upload, Settings, Calculator, ShieldCheck, Quote, Play,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import {
  DARK, LIGHT, F,
  PRODUCTS, METRICS, CAPABILITIES, COMPLIANCE,
  WORKFLOW_STEPS, TESTIMONIALS, TICKER_DATA,
  type MarketingTheme, type ThemeMode,
} from "@/components/marketing/theme";

/* ═══════════════════════════════════════════════════════
   Hooks
   ═══════════════════════════════════════════════════════ */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } },
      { threshold },
    );
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

function useMobile(breakpoint = 768) {
  const [mob, setMob] = useState(false);
  useEffect(() => {
    const c = () => setMob(window.innerWidth < breakpoint);
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, [breakpoint]);
  return mob;
}

/* ═══════════════════════════════════════════════════════
   Icon resolver
   ═══════════════════════════════════════════════════════ */

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid size={22} strokeWidth={1.6} />,
  TrendingUp: <TrendingUp size={22} strokeWidth={1.6} />,
  PieChart: <PieChart size={22} strokeWidth={1.6} />,
  FlaskConical: <FlaskConical size={22} strokeWidth={1.6} />,
  Globe: <Globe size={22} strokeWidth={1.6} />,
  BookOpen: <BookOpen size={22} strokeWidth={1.6} />,
  Newspaper: <Newspaper size={22} strokeWidth={1.6} />,
  Shield: <Shield size={20} />,
  Users: <Users size={20} />,
  Layers: <Layers size={20} />,
  FileCheck: <FileCheck size={20} />,
  Cpu: <Cpu size={20} />,
  Eye: <Eye size={20} />,
  Upload: <Upload size={22} />,
  Settings: <Settings size={22} />,
  Calculator: <Calculator size={22} />,
  ShieldCheck: <ShieldCheck size={22} />,
};

/* ═══════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════ */

function AnimatedMetric({ value, label, suffix, visible, T }: {
  value: string; label: string; suffix: string; visible: boolean; T: MarketingTheme;
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
        color: T.accent, lineHeight: 1,
      }}>
        {display}
        {suffix && suffix !== "ms" && (
          <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.6 }}>{suffix}</span>
        )}
      </div>
      <div style={{
        fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em",
        color: T.textDim, marginTop: 8, textTransform: "uppercase" as const,
      }}>{label}</div>
    </div>
  );
}

function TerminalPreview({ dk, T }: { dk: boolean; T: MarketingTheme }) {
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
          ORDR Terminal -- Dashboard
        </span>
      </div>
      {/* Content */}
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
          }}>EUR/USD . 1H . LIVE</div>
        </div>
        {/* Position rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {[
            { pair: "EUR/USD", notional: "$12.5M", hedge: "FWD 3M", status: "HEDGED", statusColor: "#34d399" },
            { pair: "GBP/USD", notional: "$8.2M", hedge: "OPT 6M", status: "PENDING", statusColor: "#f59e0b" },
            { pair: "USD/JPY", notional: "$15.1M", hedge: "--", status: "OPEN", statusColor: "#ef4444" },
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
   Landing Page
   ═══════════════════════════════════════════════════════ */

export default function LandingPage() {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [heroVis, setHeroVis] = useState(false);
  const mob = useMobile();

  useEffect(() => {
    const s = localStorage.getItem("ordr_landing_theme");
    if (s === "dark" || s === "light") setMode(s);
  }, []);

  useEffect(() => { setTimeout(() => setHeroVis(true), 80); }, []);

  const toggle = useCallback(() => {
    setMode(p => {
      const n = p === "light" ? "dark" : "light";
      localStorage.setItem("ordr_landing_theme", n);
      return n;
    });
  }, []);

  const T = mode === "dark" ? DARK : LIGHT;
  const dk = mode === "dark";

  const metricsView = useInView(0.2);
  const productsView = useInView(0.1);
  const capView = useInView(0.1);
  const workflowView = useInView(0.1);
  const compView = useInView(0.15);
  const testView = useInView(0.15);
  const ctaView = useInView(0.15);

  return (
    <MarketingLayout theme={T} mode={mode} onToggleTheme={toggle}>
      <style>{`
        @keyframes o-ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes o-pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
        @keyframes o-mesh { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes o-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        html{scroll-behavior:smooth}
        *{box-sizing:border-box}
        .o-btn{transition:all .2s cubic-bezier(.4,0,.2,1)}
        .o-btn:hover{transform:translateY(-2px);box-shadow:${dk ? "0 6px 24px rgba(34,211,238,0.2)" : "0 6px 24px rgba(30,58,95,0.15)"}}
        .o-product{transition:all .35s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden}
        .o-product:hover{transform:translateY(-6px);box-shadow:${dk ? "0 16px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,211,238,0.15)" : "0 16px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(30,58,95,0.15)"} !important}
        .o-product:hover .o-product-glow{opacity:1}
        .o-product:hover .o-product-arrow{opacity:1;transform:translateX(0)}
        .o-cap-card{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .o-cap-card:hover{transform:translateY(-4px);border-color:${dk ? "rgba(34,211,238,0.25)" : "rgba(30,58,95,0.2)"} !important;box-shadow:${dk ? "0 8px 40px rgba(34,211,238,0.08)" : "0 8px 40px rgba(30,58,95,0.08)"}}
        .o-test-card{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .o-test-card:hover{border-color:${dk ? "rgba(34,211,238,0.2)" : "rgba(30,58,95,0.15)"} !important}
      `}</style>

      {/* ══════════ 1. TICKER STRIP ══════════ */}
      <div style={{
        position: "fixed", top: 56, left: 0, right: 0, zIndex: 99,
        padding: "5px 0", overflow: "hidden",
        background: dk ? "rgba(8,8,13,0.95)" : "rgba(15,23,42,0.95)",
        borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)"}`,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", gap: 40, animation: "o-ticker 50s linear infinite", width: "max-content" }}>
          {[...TICKER_DATA, ...TICKER_DATA].map((t, i) => (
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

      {/* ══════════ 2. HERO ══════════ */}
      <section style={{
        paddingTop: mob ? 120 : 86,
        minHeight: mob ? "auto" : "100vh",
        display: "flex", flexDirection: "column", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        {/* Background effects */}
        <div style={{ position: "absolute", inset: 0, background: T.heroGrad, pointerEvents: "none" }} />
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: `linear-gradient(${dk ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.015)"} 1px, transparent 1px), linear-gradient(90deg, ${dk ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.015)"} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 40%, black 10%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 40%, black 10%, transparent 70%)",
        }} />
        {dk && <>
          <div style={{ position: "absolute", top: "5%", left: "15%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.06), transparent 60%)", pointerEvents: "none", animation: "o-float 12s ease infinite" }} />
          <div style={{ position: "absolute", top: "10%", right: "10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(129,140,248,0.05), transparent 60%)", pointerEvents: "none", animation: "o-float 15s ease infinite 3s" }} />
        </>}

        <div style={{
          position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto",
          padding: mob ? "40px 20px 32px" : "48px 48px 40px", width: "100%",
        }}>
          {/* Badge */}
          <div style={{
            opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(16px)",
            transition: "all .6s ease", textAlign: "center",
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
              fontFamily: F.heading, fontSize: mob ? 40 : 72, fontWeight: 800,
              letterSpacing: "-0.04em", lineHeight: 1.05, margin: 0,
              ...(dk ? {
                background: "linear-gradient(135deg, #f0f0f5 0%, #22d3ee 45%, #818cf8 75%, #c084fc 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundSize: "200% 200%", animation: "o-mesh 8s ease infinite",
              } : { color: T.accent }),
            }}>
              The Institutional Standard{mob ? " " : <br />}for FX Hedge Management
            </h1>
            <p style={{
              fontFamily: F.ui, fontSize: mob ? 16 : 19, color: T.textSub,
              fontWeight: 400, maxWidth: 640, lineHeight: 1.6, margin: "20px auto 0",
            }}>
              Deterministic computation, 4-eyes governance, WORM audit trails.
              Built for treasury teams that can&apos;t afford ambiguity.
            </p>
          </div>

          {/* CTAs */}
          <div style={{
            display: "flex", gap: 12, justifyContent: "center", marginTop: 36, flexWrap: "wrap",
            opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(16px)",
            transition: "all .7s ease .2s",
          }}>
            <Link href="/auth/login" className="o-btn" onClick={() => trackEvent("click_get_started", "hero")} style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: T.accentText, background: T.accent,
              padding: "13px 32px", borderRadius: 10, textDecoration: "none", border: "none",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: dk ? "0 0 30px rgba(34,211,238,0.15)" : "0 4px 16px rgba(30,58,95,0.15)",
            }}>Get Started <ArrowRight size={16} /></Link>
            <button className="o-btn" onClick={() => trackEvent("click_watch_demo", "hero")} style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: T.textSub,
              background: "transparent", padding: "13px 32px", borderRadius: 10,
              border: `1.5px solid ${T.border}`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}><Play size={16} /> Watch Demo</button>
          </div>

          {/* Terminal Preview */}
          {!mob && (
            <div style={{
              marginTop: 56,
              opacity: heroVis ? 1 : 0,
              transform: heroVis ? "translateY(0) perspective(1200px) rotateX(2deg)" : "translateY(40px) perspective(1200px) rotateX(6deg)",
              transition: "all .9s cubic-bezier(.4,0,.2,1) .3s",
            }}>
              <TerminalPreview dk={dk} T={T} />
            </div>
          )}
        </div>
      </section>

      {/* ══════════ 3. METRICS BAR ══════════ */}
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
              <AnimatedMetric {...m} visible={metricsView.visible} T={T} />
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ 5. PRODUCTS GRID ══════════ */}
      <section id="products" ref={productsView.ref} style={{
        padding: mob ? "64px 16px" : "96px 48px",
        background: T.bg, position: "relative",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
              Each product is purpose-built for a specific function in the hedge lifecycle -- from exposure classification to governed execution.
            </p>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
            gap: mob ? 14 : 16,
          }}>
            {PRODUCTS.map((p, i) => {
              const visible = productsView.visible;
              const delay = i * 0.08;
              return (
                <Link key={p.name} href={`/products/${p.slug}`} style={{ textDecoration: "none", color: "inherit", ...((!mob && i === 6) ? { gridColumn: "2 / 3" } : {}) }}>
                  <div className="o-product" style={{
                    background: T.bgCard, padding: mob ? "24px 20px" : "28px 24px",
                    borderRadius: 14, border: `1px solid ${T.borderSoft}`,
                    boxShadow: dk ? "0 2px 20px rgba(0,0,0,0.3)" : "0 1px 8px rgba(0,0,0,0.04)",
                    display: "flex", flexDirection: "column", gap: 14, height: "100%",
                    opacity: visible ? 1 : 0,
                    transform: visible ? "translateY(0)" : "translateY(24px)",
                    transition: `opacity .5s ease ${delay}s, transform .5s cubic-bezier(.4,0,.2,1) ${delay}s, box-shadow .3s, border-color .3s`,
                    cursor: "pointer",
                  }}>
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
                      }}>{ICON_MAP[p.icon] || <LayoutGrid size={22} />}</div>
                      <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: T.text }}>{p.name}</div>
                      <div className="o-product-arrow" style={{ marginLeft: "auto", color: p.color, opacity: 0, transform: "translateX(-4px)", transition: "all .25s" }}>
                        <ArrowRight size={16} />
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
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════ 6. CAPABILITIES ══════════ */}
      <section id="platform" ref={capView.ref} style={{
        background: dk ? T.sectionAlt : T.bgDeep,
        padding: mob ? "64px 16px" : "96px 48px",
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

          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: mob ? 12 : 16 }}>
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
                    background: T.accentSoft, color: T.accent,
                    border: `1px solid ${dk ? "rgba(34,211,238,0.1)" : "rgba(30,58,95,0.08)"}`,
                  }}>{ICON_MAP[cap.iconName]}</div>
                  <span style={{
                    fontFamily: F.mono, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em",
                    color: T.accent, opacity: 0.5,
                  }}>{cap.num}</span>
                </div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>{cap.label}</div>
                <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6, margin: 0 }}>{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 7. HOW IT WORKS ══════════ */}
      <section ref={workflowView.ref} style={{
        background: T.bg, padding: mob ? "64px 16px" : "96px 48px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{
            textAlign: "center", marginBottom: mob ? 40 : 64,
            opacity: workflowView.visible ? 1 : 0,
            transform: workflowView.visible ? "translateY(0)" : "translateY(20px)",
            transition: "all .6s ease",
          }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: dk ? T.accent : T.accent2, marginBottom: 12 }}>WORKFLOW</div>
            <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, color: T.text }}>
              Four steps. Full governance.
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 15, color: T.textSub, lineHeight: 1.6, marginTop: 16, maxWidth: 520, margin: "16px auto 0" }}>
              From raw exposure data to audited execution -- every step deterministic, every decision recorded.
            </p>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(4, 1fr)",
            gap: mob ? 20 : 24,
          }}>
            {WORKFLOW_STEPS.map((ws, i) => (
              <div key={ws.step} style={{
                position: "relative",
                padding: mob ? "28px 20px" : "32px 24px",
                background: T.bgCard,
                border: `1px solid ${T.borderSoft}`,
                borderRadius: 14,
                opacity: workflowView.visible ? 1 : 0,
                transform: workflowView.visible ? "translateY(0)" : "translateY(20px)",
                transition: `all .5s ease ${i * 0.1}s`,
              }}>
                {/* Step number */}
                <div style={{
                  fontFamily: F.mono, fontSize: 48, fontWeight: 900, letterSpacing: "-0.04em",
                  color: dk ? "rgba(34,211,238,0.06)" : "rgba(30,58,95,0.04)",
                  position: "absolute", top: 12, right: 16, lineHeight: 1,
                }}>{ws.step}</div>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: dk ? T.accentSoft : T.accentSoft,
                  color: T.accent, marginBottom: 16,
                  border: `1px solid ${dk ? "rgba(34,211,238,0.1)" : "rgba(30,58,95,0.08)"}`,
                }}>
                  {ICON_MAP[ws.iconName]}
                </div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>
                  {ws.title}
                </div>
                <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6, margin: 0 }}>
                  {ws.desc}
                </p>
                {/* Connector line (desktop only) */}
                {!mob && i < 3 && (
                  <div style={{
                    position: "absolute", top: "50%", right: -12,
                    width: 24, height: 1,
                    background: dk ? "rgba(34,211,238,0.15)" : "rgba(30,58,95,0.1)",
                    zIndex: 1,
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 8. COMPLIANCE STRIP ══════════ */}
      <section ref={compView.ref} style={{
        background: dk ? "#0a0a12" : "#1e3a5f",
        padding: mob ? "56px 16px" : "80px 48px",
        position: "relative", overflow: "hidden",
      }}>
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
              Every transaction, every approval, every calculation -- hash-chained and immutable.
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
                background: "rgba(255,255,255,0.02)", textAlign: "left",
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

      {/* ══════════ 9. TESTIMONIALS ══════════ */}
      <section ref={testView.ref} style={{
        background: T.bg, padding: mob ? "64px 16px" : "96px 48px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{
            textAlign: "center", marginBottom: mob ? 36 : 56,
            opacity: testView.visible ? 1 : 0,
            transform: testView.visible ? "translateY(0)" : "translateY(20px)",
            transition: "all .6s ease",
          }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: dk ? T.accent : T.accent2, marginBottom: 12 }}>TESTIMONIALS</div>
            <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, color: T.text }}>
              Trusted by institutional teams
            </h2>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
            gap: mob ? 16 : 20,
          }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={t.name} className="o-test-card" style={{
                background: T.bgCard,
                border: `1px solid ${T.borderSoft}`,
                borderRadius: 14,
                padding: mob ? "28px 20px" : "32px 28px",
                display: "flex", flexDirection: "column", gap: 20,
                opacity: testView.visible ? 1 : 0,
                transform: testView.visible ? "translateY(0)" : "translateY(20px)",
                transition: `all .5s ease ${i * 0.1}s`,
              }}>
                <Quote size={24} style={{ color: T.accent, opacity: 0.3 }} />
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: T.textSub,
                  lineHeight: 1.7, flex: 1, margin: 0, fontStyle: "italic",
                }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                  <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 700, color: T.text }}>{t.name}</div>
                  <div style={{ fontFamily: F.ui, fontSize: 13, color: T.textDim, marginTop: 2 }}>{t.title}</div>
                  <div style={{ fontFamily: F.mono, fontSize: 12, color: T.accent, opacity: 0.7, marginTop: 2 }}>{t.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ 10. CTA ══════════ */}
      <section ref={ctaView.ref} style={{
        background: dk ? T.sectionAlt : T.ctaBg,
        padding: mob ? "64px 20px" : "96px 48px",
        textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        {dk && <>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 700, height: 400, background: "radial-gradient(ellipse, rgba(34,211,238,0.04), transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "30%", left: "30%", width: 400, height: 300, background: "radial-gradient(ellipse, rgba(129,140,248,0.03), transparent 60%)", pointerEvents: "none" }} />
        </>}
        {!dk && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.08), transparent)" }} />}
        <div style={{
          position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto",
          opacity: ctaView.visible ? 1 : 0,
          transform: ctaView.visible ? "translateY(0)" : "translateY(20px)",
          transition: "all .6s ease",
        }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: mob ? 32 : 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            ...(dk ? {
              background: "linear-gradient(135deg, #f0f0f5, #22d3ee, #818cf8)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            } : { color: "#fff" }),
          }}>
            Ready to transform your hedge operations?
          </h2>
          <p style={{ fontSize: 16, color: dk ? T.textDim : "rgba(255,255,255,0.5)", marginTop: 16, lineHeight: 1.6 }}>
            Join the treasury teams that trust ORDR Terminal for deterministic, auditable, governed hedge management.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36, flexWrap: "wrap" }}>
            <Link href="/auth/login" className="o-btn" onClick={() => trackEvent("click_get_started", "footer_cta")} style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: dk ? "#000" : T.accent, background: dk ? T.accent : "#fff",
              padding: "14px 36px", borderRadius: 10, textDecoration: "none", border: "none",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: dk ? "0 0 30px rgba(34,211,238,0.2)" : "0 4px 16px rgba(0,0,0,0.1)",
            }}>Get Started <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
