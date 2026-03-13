"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  TrendingUp, Monitor, BarChart3, LayoutDashboard, Pencil, Radio,
  ArrowRight, ChevronLeft,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { DARK, LIGHT, F } from "@/components/marketing/theme";
import type { MarketingTheme, ThemeMode } from "@/components/marketing/theme";

const COLOR = "#34d399";

function useThemeSync(): { T: MarketingTheme; dk: boolean } {
  const [mode, setMode] = useState<ThemeMode>("dark");
  useEffect(() => {
    const s = localStorage.getItem("ordr_landing_theme");
    if (s === "dark" || s === "light") setMode(s);
    const h = () => { const v = localStorage.getItem("ordr_landing_theme"); if (v === "dark" || v === "light") setMode(v); };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);
  return { T: mode === "dark" ? DARK : LIGHT, dk: mode === "dark" };
}

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
    const step = (ts: number) => { if (!start) start = ts; const p = Math.min((ts - start) / duration, 1); setCount(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, [visible, target, duration]);
  return count;
}

function MetricCounter({ m, i, visible, T, mob, accentColor }: { m: { value: string; label: string; suffix?: string; prefix?: string }; i: number; visible: boolean; T: MarketingTheme; mob: boolean; accentColor: string }) {
  const numeric = parseInt(m.value.replace(/[^0-9]/g, ""), 10);
  const counted = useCounter(numeric, visible);
  return (
    <div style={{ textAlign: "center", padding: "20px 12px", borderRight: !mob && i < 3 ? `1px solid ${T.border}` : "none", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)", transition: `opacity 0.6s ease ${i * 0.1}s, transform 0.6s ease ${i * 0.1}s` }}>
      <div style={{ fontFamily: F.mono, fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: accentColor, lineHeight: 1 }}>
        {m.prefix || ""}{counted.toLocaleString()}{m.suffix && <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.6 }}>{m.suffix}</span>}
      </div>
      <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: T.textDim, marginTop: 8, textTransform: "uppercase" }}>{m.label}</div>
    </div>
  );
}

const FEATURES = [
  { icon: <Monitor size={22} />, title: "Custom Canvas Engine", desc: "60fps rendering with smooth zoom, pan, and momentum. Purpose-built 2D canvas engine with zero external charting dependencies." },
  { icon: <BarChart3 size={22} />, title: "Multi-Asset Coverage", desc: "FX, equities, indices, crypto, commodities -- all from one terminal. Unified charting across every asset class." },
  { icon: <TrendingUp size={22} />, title: "77+ Technical Indicators", desc: "Full indicator library including RSI, MACD, Bollinger Bands, Ichimoku, volume profile, and custom overlays." },
  { icon: <LayoutDashboard size={22} />, title: "6-Tab Intelligence", desc: "Overview, Heatmap, Calendar, Companies, Watchlists, Signals. Complete market intelligence in a single workspace." },
  { icon: <Pencil size={22} />, title: "Drawing Tools", desc: "Trendline, horizontal, fibonacci, rectangle with rubber-band preview, magnetic snap, and angle display." },
  { icon: <Radio size={22} />, title: "Real-Time Data", desc: "TwelveData + IBKR providers with automatic failover. Spot FX, forwards, options chains, and equity data." },
];

const METRICS = [
  { value: "77", label: "Indicators", suffix: "+" },
  { value: "60", label: "fps Canvas" },
  { value: "6", label: "Intelligence Tabs" },
  { value: "5", label: "Asset Classes" },
];

const USE_CASES = [
  { title: "For Traders", desc: "Professional-grade charting with real-time data, technical indicators, and drawing tools. Monitor markets across FX, equities, and crypto." },
  { title: "For Analysts", desc: "Stock heatmaps, economic calendars, company research, and signal detection. All the intelligence tools in one workspace." },
  { title: "For Portfolio Managers", desc: "Custom watchlists, multi-asset overview, and sector analysis. Track your positions with real-time market context." },
];

export default function MarketPage() {
  const { T, dk } = useThemeSync();
  const [heroVis, setHeroVis] = useState(false);
  const [mob, setMob] = useState(false);
  const metricsView = useInView(0.2);
  const featuresView = useInView(0.1);
  const useCaseView = useInView(0.1);
  const ctaView = useInView(0.15);

  useEffect(() => { setTimeout(() => setHeroVis(true), 80); }, []);
  useEffect(() => { const c = () => setMob(window.innerWidth < 768); c(); window.addEventListener("resize", c); return () => window.removeEventListener("resize", c); }, []);

  return (
    <MarketingLayout>
      <style>{`
        .feat-card{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .feat-card:hover{transform:translateY(-4px);border-color:${dk ? "rgba(52,211,153,0.25)" : "rgba(30,58,95,0.2)"} !important;box-shadow:${dk ? "0 8px 40px rgba(52,211,153,0.08)" : "0 8px 40px rgba(30,58,95,0.08)"}}
        @keyframes o-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      `}</style>

      {/* ══════════ HERO ══════════ */}
      <section style={{ padding: mob ? "32px 20px 48px" : "56px 48px 72px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: T.heroGrad, pointerEvents: "none" }} />
        {dk && <div style={{ position: "absolute", top: "5%", right: "20%", width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${COLOR}08, transparent 60%)`, pointerEvents: "none", animation: "o-float 14s ease infinite" }} />}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 800, margin: "0 auto", opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(24px)", transition: "all .7s ease" }}>
          <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: T.textDim, textDecoration: "none", marginBottom: 20 }}>
            <ChevronLeft size={14} /> All Products
          </Link>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${COLOR}12`, color: COLOR, border: `1px solid ${COLOR}20` }}>
              <TrendingUp size={24} />
            </div>
          </div>
          <h1 style={{ fontFamily: F.heading, fontSize: mob ? 40 : 64, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05, margin: 0, ...(dk ? { background: `linear-gradient(135deg, #f0f0f5 0%, ${COLOR} 50%, #818cf8 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } : { color: T.accent }) }}>
            ORDR Market
          </h1>
          <p style={{ fontFamily: F.ui, fontSize: mob ? 16 : 19, color: T.textSub, maxWidth: 600, margin: "20px auto 0", lineHeight: 1.6 }}>
            Professional charting and market intelligence. Custom canvas engine, 77+ indicators, multi-asset coverage, and real-time data feeds.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36, flexWrap: "wrap" }}>
            <Link href="/auth/login" style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: T.accentText, background: T.accent, padding: "13px 32px", borderRadius: 10, textDecoration: "none", display: "flex", alignItems: "center", gap: 8, boxShadow: dk ? `0 0 30px ${COLOR}25` : "0 4px 16px rgba(30,58,95,0.15)" }}>
              Explore Market Intelligence <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════ METRICS ══════════ */}
      <section ref={metricsView.ref} style={{ background: T.sectionAlt, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, padding: mob ? "20px 16px" : "8px 48px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: mob ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 0 }}>
          {METRICS.map((m, i) => (
            <MetricCounter key={m.label} m={m} i={i} visible={metricsView.visible} T={T} mob={mob} accentColor={COLOR} />
          ))}
        </div>
      </section>

      {/* ══════════ FEATURES ══════════ */}
      <section ref={featuresView.ref} style={{ padding: mob ? "64px 16px" : "96px 48px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ marginBottom: mob ? 36 : 56, opacity: featuresView.visible ? 1 : 0, transform: featuresView.visible ? "translateY(0)" : "translateY(20px)", transition: "all .6s ease" }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: COLOR, marginBottom: 12 }}>FEATURES</div>
            <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, color: T.text }}>
              Market intelligence, purpose-built
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: mob ? 12 : 16 }}>
            {FEATURES.map((feat, i) => (
              <div key={feat.title} className="feat-card" style={{ background: T.bgCard, border: `1px solid ${T.borderSoft}`, borderRadius: 14, padding: mob ? "24px 20px" : "28px 24px", opacity: featuresView.visible ? 1 : 0, transform: featuresView.visible ? "translateY(0)" : "translateY(20px)", transition: `all .5s ease ${i * 0.08}s` }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${COLOR}${dk ? "12" : "0a"}`, color: COLOR, border: `1px solid ${COLOR}${dk ? "20" : "15"}`, marginBottom: 16 }}>{feat.icon}</div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>{feat.title}</div>
                <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6, margin: 0 }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ USE CASES ══════════ */}
      <section ref={useCaseView.ref} style={{ background: dk ? T.sectionAlt : T.bgDeep, padding: mob ? "64px 16px" : "96px 48px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ marginBottom: mob ? 36 : 56, opacity: useCaseView.visible ? 1 : 0, transform: useCaseView.visible ? "translateY(0)" : "translateY(20px)", transition: "all .6s ease" }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: COLOR, marginBottom: 12 }}>WHO IT IS FOR</div>
            <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, color: T.text }}>Professional-grade for every role</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: mob ? 12 : 16 }}>
            {USE_CASES.map((uc, i) => (
              <div key={uc.title} style={{ background: T.bgCard, border: `1px solid ${T.borderSoft}`, borderRadius: 14, padding: mob ? "24px 20px" : "28px 24px", opacity: useCaseView.visible ? 1 : 0, transform: useCaseView.visible ? "translateY(0)" : "translateY(20px)", transition: `all .5s ease ${i * 0.1}s` }}>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 700, color: COLOR, marginBottom: 8 }}>{uc.title}</div>
                <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6, margin: 0 }}>{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CTA ══════════ */}
      <section ref={ctaView.ref} style={{ background: dk ? T.sectionAlt : T.ctaBg, padding: mob ? "64px 20px" : "96px 48px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        {dk && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 700, height: 400, background: `radial-gradient(ellipse, ${COLOR}08, transparent 60%)`, pointerEvents: "none" }} />}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto", opacity: ctaView.visible ? 1 : 0, transform: ctaView.visible ? "translateY(0)" : "translateY(20px)", transition: "all .6s ease" }}>
          <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, ...(dk ? { background: `linear-gradient(135deg, #f0f0f5, ${COLOR}, #818cf8)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } : { color: "#fff" }) }}>
            Explore market intelligence
          </h2>
          <p style={{ fontSize: 16, color: dk ? T.textDim : "rgba(255,255,255,0.5)", marginTop: 16, lineHeight: 1.6 }}>Real-time charting, multi-asset data, and professional analytics.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36 }}>
            <Link href="/auth/login" style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: dk ? "#000" : T.accent, background: dk ? T.accent : "#fff", padding: "14px 36px", borderRadius: 10, textDecoration: "none", display: "flex", alignItems: "center", gap: 8, boxShadow: dk ? `0 0 30px ${COLOR}30` : "0 4px 16px rgba(0,0,0,0.1)" }}>
              Get Started <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
