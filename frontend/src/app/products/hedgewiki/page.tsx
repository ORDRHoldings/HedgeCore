"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  BookOpen, FileText, Scale, Library, ShieldCheck, Award, Search,
  ArrowRight, ChevronLeft, ExternalLink,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { DARK, LIGHT, F } from "@/components/marketing/theme";
import type { MarketingTheme, ThemeMode } from "@/components/marketing/theme";

const COLOR = "#a78bfa";

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

function MetricCounter({ m, i, visible, T, mob, accentColor }: { m: { value: string; label: string; suffix?: string; prefix?: string; display?: string }; i: number; visible: boolean; T: MarketingTheme; mob: boolean; accentColor: string }) {
  const numeric = parseInt(m.value.replace(/[^0-9]/g, ""), 10);
  const counted = useCounter(numeric, visible);
  return (
    <div style={{ textAlign: "center", padding: "20px 12px", borderRight: !mob && i < 3 ? `1px solid ${T.border}` : "none", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)", transition: `opacity 0.6s ease ${i * 0.1}s, transform 0.6s ease ${i * 0.1}s` }}>
      <div style={{ fontFamily: F.mono, fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: accentColor, lineHeight: 1 }}>
        {m.display ? m.display : <>{m.prefix || ""}{counted.toLocaleString()}{m.suffix && <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.6 }}>{m.suffix}</span>}</>}
      </div>
      <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: T.textDim, marginTop: 8, textTransform: "uppercase" }}>{m.label}</div>
    </div>
  );
}

const FEATURES = [
  { icon: <FileText size={22} />, title: "ISDA Definitions", desc: "Complete reference for ISDA 2006 Definitions, FX supplements, protocol documentation. The definitive derivatives glossary." },
  { icon: <Scale size={22} />, title: "IFRS 9 / ASC 815 Guide", desc: "Hedge accounting standards, effectiveness testing requirements, documentation templates. Everything for compliance." },
  { icon: <Library size={22} />, title: "Methodology Library", desc: "Valuation methodologies, risk metrics, pricing models for FX derivatives. From Black-Scholes to Monte Carlo." },
  { icon: <ShieldCheck size={22} />, title: "Regulatory Reference", desc: "EMIR, MiFID II, Dodd-Frank, BCBS FRTB requirements and compliance checklists. Always current, always accessible." },
  { icon: <Award size={22} />, title: "Best Practices", desc: "Treasury management frameworks, hedge policy templates, governance playbooks. Learn from institutional standards." },
  { icon: <Search size={22} />, title: "Searchable Index", desc: "Full-text search across thousands of definitions, standards, and guidelines. Find what you need in seconds." },
];

const METRICS = [
  { value: "1000", label: "Entries", suffix: "+" },
  { value: "6", label: "Standards" },
  { value: "0", label: "Search", display: "Full-Text" },
  { value: "0", label: "Updates", display: "Current" },
];

const USE_CASES = [
  { title: "For Compliance Teams", desc: "Regulatory reference library with EMIR, MiFID II, Dodd-Frank, and BCBS FRTB requirements. Compliance checklists and documentation templates." },
  { title: "For Treasury Professionals", desc: "ISDA definitions, hedge accounting guidance, and treasury management frameworks. The institutional knowledge base for FX professionals." },
  { title: "For New Team Members", desc: "Comprehensive onboarding resource covering derivatives terminology, risk metrics, and valuation methodologies. Get up to speed fast." },
];

export default function HedgeWikiPage() {
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
        .feat-card:hover{transform:translateY(-4px);border-color:${dk ? "rgba(167,139,250,0.25)" : "rgba(30,58,95,0.2)"} !important;box-shadow:${dk ? "0 8px 40px rgba(167,139,250,0.08)" : "0 8px 40px rgba(30,58,95,0.08)"}}
        @keyframes o-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      `}</style>

      {/* ══════════ HERO ══════════ */}
      <section style={{ padding: mob ? "32px 20px 48px" : "56px 48px 72px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: T.heroGrad, pointerEvents: "none" }} />
        {dk && <div style={{ position: "absolute", top: "10%", right: "15%", width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${COLOR}08, transparent 60%)`, pointerEvents: "none", animation: "o-float 13s ease infinite" }} />}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 800, margin: "0 auto", opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(24px)", transition: "all .7s ease" }}>
          <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: T.textDim, textDecoration: "none", marginBottom: 20 }}>
            <ChevronLeft size={14} /> All Products
          </Link>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${COLOR}12`, color: COLOR, border: `1px solid ${COLOR}20` }}>
              <BookOpen size={24} />
            </div>
          </div>
          <h1 style={{ fontFamily: F.heading, fontSize: mob ? 40 : 64, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05, margin: 0, ...(dk ? { background: `linear-gradient(135deg, #f0f0f5 0%, ${COLOR} 50%, #22d3ee 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } : { color: T.accent }) }}>
            ORDR HedgeWiki
          </h1>
          <p style={{ fontFamily: F.ui, fontSize: mob ? 16 : 19, color: T.textSub, maxWidth: 600, margin: "20px auto 0", lineHeight: 1.6 }}>
            The institutional knowledge base. ISDA definitions, IFRS 9 / ASC 815 guidance, regulatory reference, and methodology library.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36, flexWrap: "wrap" }}>
            <a href="https://hedge-wiki.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: T.accentText, background: T.accent, padding: "13px 32px", borderRadius: 10, textDecoration: "none", display: "flex", alignItems: "center", gap: 8, boxShadow: dk ? `0 0 30px ${COLOR}25` : "0 4px 16px rgba(30,58,95,0.15)" }}>
              Open HedgeWiki <ExternalLink size={16} />
            </a>
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
              Institutional knowledge, always accessible
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
            <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, color: T.text }}>Knowledge for every role</h2>
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
          <h2 style={{ fontFamily: F.heading, fontSize: mob ? 32 : 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, ...(dk ? { background: `linear-gradient(135deg, #f0f0f5, ${COLOR}, #22d3ee)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" } : { color: "#fff" }) }}>
            Explore the knowledge base
          </h2>
          <p style={{ fontSize: 16, color: dk ? T.textDim : "rgba(255,255,255,0.5)", marginTop: 16, lineHeight: 1.6 }}>ISDA definitions, regulatory guides, and methodology reference.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36 }}>
            <a href="https://hedge-wiki.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: dk ? "#000" : T.accent, background: dk ? T.accent : "#fff", padding: "14px 36px", borderRadius: 10, textDecoration: "none", display: "flex", alignItems: "center", gap: 8, boxShadow: dk ? `0 0 30px ${COLOR}30` : "0 4px 16px rgba(0,0,0,0.1)" }}>
              Open HedgeWiki <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
