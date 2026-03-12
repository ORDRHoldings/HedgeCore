"use client";

/**
 * Landing Page — ORDR-Terminal
 *
 * White background, institutional blue nav/menus, IBM Plex fonts.
 * No auth context, no sidebar.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  TrendingUp,
  PieChart,
  FlaskConical,
  Globe,
  BookOpen,
  Newspaper,
  Shield,
  Lock,
  Users,
  FileCheck,
  Code2,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════
   Colors — white backgrounds + institutional blue accents
   ═══════════════════════════════════════════════════════ */

const C = {
  bg: "#ffffff",
  bgSoft: "#f8fafc",
  border: "#e2e8f0",
  borderSubtle: "#f1f5f9",
  text: "#0f172a",
  textMuted: "#64748b",
  textDim: "#94a3b8",
  accent: "#22c55e",
  // Treasury blue palette
  blue: "#1e3a5f",
  blueDark: "#0f2440",
  blueMid: "#2a4a72",
  blueLight: "#3b6998",
  blueAccent: "#4a90d9",
  bluePale: "#e8f0fe",
  blueGlow: "rgba(30,58,95,0.08)",
} as const;

/* ═══════════════════════════════════════════════════════
   Fonts — IBM Plex family
   ═══════════════════════════════════════════════════════ */

const F = {
  ui: "'IBM Plex Sans', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', monospace",
  heading: "'Manrope', 'IBM Plex Sans', sans-serif",
} as const;

/* ═══════════════════════════════════════════════════════
   Product data
   ═══════════════════════════════════════════════════════ */

interface Product {
  name: string;
  desc: string;
  tags: string[];
  href: string;
  external?: boolean;
  icon: React.ReactNode;
}

const PRODUCTS: Product[] = [
  {
    name: "ORDR TREASURY",
    desc: "Institutional FX hedge governance platform. Deterministic engine, 4-eyes approval, WORM audit trail, IFRS 9 effectiveness testing, and full position lifecycle management.",
    tags: ["GOVERNANCE", "AUDIT", "HEDGING"],
    href: "/dashboard",
    icon: <LayoutGrid size={22} strokeWidth={1.8} />,
  },
  {
    name: "ORDR MARKET",
    desc: "Professional charting and agentic trading platform. 77 indicators, multi-asset coverage across FX, equities, crypto, and commodities with AI-powered execution.",
    tags: ["CHARTING", "AGENTIC", "TRADING"],
    href: "/market",
    icon: <TrendingUp size={22} strokeWidth={1.8} />,
  },
  {
    name: "ORDR PORTFOLIO HEDGE",
    desc: "Deterministic portfolio risk engine. Ingest positions, decompose exposures, classify risk R1\u2013R8, and generate hedge execution plans with sub-50ms computation.",
    tags: ["RISK", "PORTFOLIO", "ENGINE"],
    href: "/portfolio-risk",
    icon: <PieChart size={22} strokeWidth={1.8} />,
  },
  {
    name: "ORDR LABS",
    desc: "Scenario Studio and Sandbox for stress testing, Monte Carlo simulation, crisis library, and what-if analysis. Research and experiment without risk.",
    tags: ["SIMULATION", "STRESS TEST", "SANDBOX"],
    href: "/scenario-studio",
    icon: <FlaskConical size={22} strokeWidth={1.8} />,
  },
  {
    name: "ORDR POLISOPHIC",
    desc: "Political and macroeconomic risk intelligence. Corridor scoring, geopolitical event tracking, and currency-impact analysis for informed hedging decisions.",
    tags: ["GEOPOLITICAL", "INTELLIGENCE", "RISK"],
    href: "/polisophic",
    icon: <Globe size={22} strokeWidth={1.8} />,
  },
  {
    name: "ORDR HEDGEWIKI",
    desc: "Institutional knowledge base. FX instruments, ISDA definitions, IFRS 9 / ASC 815 guidance, and hedge accounting methodology reference for professionals.",
    tags: ["KNOWLEDGE", "REFERENCE", "COMPLIANCE"],
    href: "https://hedge-wiki.vercel.app/",
    external: true,
    icon: <BookOpen size={22} strokeWidth={1.8} />,
  },
  {
    name: "ORDR FINHUB",
    desc: "Financial magazine and data hub. Market analysis, institutional research, economic data feeds, and curated financial intelligence for decision-makers.",
    tags: ["MAGAZINE", "DATA HUB", "RESEARCH"],
    href: "/market-intelligence",
    icon: <Newspaper size={22} strokeWidth={1.8} />,
  },
];

const STATS = [
  { value: "7", label: "Products" },
  { value: "219", label: "API Endpoints" },
  { value: "41", label: "Engine Modules" },
  { value: "77", label: "Indicators" },
  { value: "3,200+", label: "Test Cases" },
  { value: "<50ms", label: "Computation" },
];

const TICKER_DATA = [
  { sym: "EUR/USD", price: "1.0847", chg: "+0.12%", up: true },
  { sym: "GBP/USD", price: "1.2634", chg: "+0.08%", up: true },
  { sym: "USD/JPY", price: "149.82", chg: "-0.24%", up: false },
  { sym: "USD/CHF", price: "0.8847", chg: "+0.05%", up: true },
  { sym: "AUD/USD", price: "0.6521", chg: "-0.18%", up: false },
  { sym: "SPX", price: "5,667.20", chg: "+0.34%", up: true },
  { sym: "GOLD", price: "2,178.40", chg: "+0.52%", up: true },
  { sym: "BTC", price: "67,842", chg: "-1.23%", up: false },
];

const CAPABILITIES = [
  { num: "R1\u2013R8", label: "Risk Taxonomy", desc: "Frozen, canonical risk classification. Eight risk categories covering translation, transaction, economic, and strategic exposure." },
  { num: "SHA-256", label: "Hash Chain Audit", desc: "WORM append-only audit trail with per-tenant SHA-256 hash chain. Tamper-evident, compliance-ready, regulation-proof." },
  { num: "4-Eyes", label: "Governance", desc: "Separation of duties enforcement. Maker-checker workflow with tri-state pipeline: Sandbox \u2192 Staging \u2192 Ledger." },
  { num: "60", label: "Policy Presets", desc: "Pre-configured hedge policy templates covering maturity profiles, governance tiers, evidence grades, and accounting modes." },
];

const ARCH_BLOCKS = [
  { label: "Engine", value: "41", desc: "Production kernel modules \u2014 pure deterministic functions" },
  { label: "Routes", value: "219", desc: "RESTful API endpoints with full RBAC protection" },
  { label: "Models", value: "27", desc: "Database entities with async ORM and WORM semantics" },
  { label: "Coverage", value: "62%", desc: "Test coverage across 3,200+ automated test cases" },
];

const TRUST_ITEMS = [
  { label: "WORM Audit Trail", icon: <Shield size={18} strokeWidth={1.8} /> },
  { label: "SHA-256 Hash Chain", icon: <Lock size={18} strokeWidth={1.8} /> },
  { label: "4-Eyes Governance", icon: <Users size={18} strokeWidth={1.8} /> },
  { label: "IFRS 9 / ASC 815", icon: <FileCheck size={18} strokeWidth={1.8} /> },
  { label: "Deterministic Engine", icon: <Code2 size={18} strokeWidth={1.8} /> },
];

/* ═══════════════════════════════════════════════════════
   Intersection Observer hook
   ═══════════════════════════════════════════════════════ */

function useFadeIn(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export default function LandingPage() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const scrollToProducts = useCallback(() => {
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const productsFade = useFadeIn();
  const capFade = useFadeIn();
  const archFade = useFadeIn();

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text, fontFamily: F.ui,
      overflowX: "hidden",
    }}>

      {/* ── CSS Animations & Hover States ── */}
      <style>{`
        @keyframes ordr-fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ordr-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes ordr-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        html { scroll-behavior: smooth; }
        .ordr-card { transition: all 0.25s ease; cursor: pointer; text-decoration: none; color: inherit; }
        .ordr-card:hover { background: ${C.bgSoft} !important; }
        .ordr-card:hover .ordr-card-arrow { opacity: 1; transform: translateX(0); }
        .ordr-card:hover .ordr-card-icon { transform: scale(1.05); border-color: ${C.blueAccent} !important; }
        .ordr-cap-card { transition: all 0.25s ease; }
        .ordr-cap-card:hover { border-color: rgba(255,255,255,0.2) !important; background: rgba(255,255,255,0.06) !important; }
        .ordr-nav-link { position: relative; transition: color 0.15s; }
        .ordr-nav-link:hover { color: #fff !important; }
        .ordr-nav-link::after { content: ''; position: absolute; bottom: -2px; left: 0; right: 0; height: 1.5px; background: #fff; transform: scaleX(0); transition: transform 0.2s; transform-origin: left; }
        .ordr-nav-link:hover::after { transform: scaleX(1); }
        .ordr-btn { transition: all 0.2s ease; }
        .ordr-btn:hover { transform: translateY(-1px); }
      `}</style>

      {/* ════════════════════════════════════════════════════════
          NAV — Treasury Blue
          ════════════════════════════════════════════════════════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: isMobile ? "0 16px" : "0 56px", height: 56,
        background: C.blue,
        borderBottom: `1px solid ${C.blueMid}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: F.mono, fontSize: 13, fontWeight: 800,
            background: "#fff", color: C.blue,
          }}>O</div>
          <span style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", color: "#fff" }}>ORDR</span>
          <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 4px", fontWeight: 300 }}>|</span>
          <span style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)", letterSpacing: "0.02em" }}>Terminal</span>
        </div>
        {!isMobile && (
          <div style={{ display: "flex", gap: 28 }}>
            {["Products", "Platform", "Architecture", "Docs", "Pricing"].map((item) => (
              <a key={item} href={item === "Products" ? "#products" : item === "Platform" ? "#capabilities" : item === "Architecture" ? "#architecture" : "#"} className="ordr-nav-link" style={{
                fontFamily: F.ui, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.7)", textDecoration: "none", padding: "4px 0",
              }}>{item}</a>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/auth/login" className="ordr-btn" style={{
            fontFamily: F.ui, fontSize: 13, fontWeight: 600, color: "#fff",
            padding: "7px 18px", border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 8,
            textDecoration: "none", background: "transparent",
          }}>Sign In</Link>
          {!isMobile && (
            <Link href="/auth/login" className="ordr-btn" style={{
              fontFamily: F.ui, fontSize: 13, fontWeight: 600,
              color: C.blue, background: "#fff",
              padding: "7px 18px", borderRadius: 8, textDecoration: "none",
              border: "1.5px solid #fff",
            }}>Request Access</Link>
          )}
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════
          HERO — White background
          ════════════════════════════════════════════════════════ */}
      <section style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        padding: isMobile ? "120px 24px 60px" : "140px 48px 60px",
        position: "relative", overflow: "hidden", background: C.bg,
      }}>
        {/* Grid background */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1, animation: "ordr-fadeUp 0.8s ease-out" }}>
          {/* Status pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 16px", border: `1px solid ${C.border}`, borderRadius: 100,
            fontFamily: F.ui, fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 32,
          }}>
            <span style={{ width: 6, height: 6, background: C.accent, borderRadius: "50%", animation: "ordr-pulse 2s ease infinite" }} />
            Institutional Infrastructure &mdash; by Synexiun
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: F.heading, fontSize: isMobile ? 52 : 84, fontWeight: 800,
            letterSpacing: "-0.045em", color: C.blue, lineHeight: 0.92, margin: 0,
          }}>ORDR-Terminal</h1>
          <div style={{
            fontFamily: F.heading, fontSize: isMobile ? 52 : 84, fontWeight: 300,
            letterSpacing: "-0.045em", color: C.textDim, lineHeight: 0.92, marginTop: 4,
          }}>Redefining Capital Markets</div>

          <p style={{
            fontFamily: F.ui, fontSize: isMobile ? 16 : 18, color: C.textMuted,
            fontWeight: 400, maxWidth: 540, lineHeight: 1.65, margin: "28px auto 0",
          }}>
            Seven interconnected products for institutional treasury, risk management,
            charting, intelligence, and governance. The operating system for modern capital markets.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 40, flexWrap: "wrap" }}>
            <Link href="/auth/login" className="ordr-btn" style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: "#fff", background: C.blue,
              padding: "14px 36px", borderRadius: 10, textDecoration: "none",
              boxShadow: "0 2px 8px rgba(30,58,95,0.2)",
              border: "none",
            }}>Request Access</Link>
            <button onClick={scrollToProducts} className="ordr-btn" style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text,
              background: "transparent", padding: "14px 36px", borderRadius: 10,
              border: `1.5px solid ${C.border}`, cursor: "pointer",
            }}>Explore Products</button>
          </div>

          {/* Stats strip */}
          <div style={{
            display: "flex", justifyContent: "center", gap: 1, background: C.border,
            maxWidth: 900, margin: "56px auto 0", borderRadius: 12, overflow: "hidden",
            animation: "ordr-fadeUp 0.8s ease-out 0.2s both",
          }}>
            {STATS.map((s) => (
              <div key={s.label} style={{
                flex: 1, background: C.bg, padding: isMobile ? "16px 8px" : "24px 16px",
                textAlign: "center",
              }}>
                <div style={{ fontFamily: F.mono, fontSize: isMobile ? 18 : 26, fontWeight: 700, color: C.blue, letterSpacing: "-0.02em" }}>{s.value}</div>
                <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 600, color: C.textDim, letterSpacing: "0.14em", marginTop: 6, textTransform: "uppercase" as const }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          TICKER BAR — Blue background
          ════════════════════════════════════════════════════════ */}
      <div style={{
        borderTop: `1px solid ${C.blueMid}`, borderBottom: `1px solid ${C.blueMid}`,
        padding: "12px 0", overflow: "hidden", background: C.blue,
      }}>
        <div style={{ display: "flex", gap: 40, animation: "ordr-ticker 45s linear infinite", width: "max-content" }}>
          {[...TICKER_DATA, ...TICKER_DATA].map((t, i) => (
            <div key={`${t.sym}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: "rgba(255,255,255,0.5)" }}>{t.sym}</span>
              <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: "#fff" }}>{t.price}</span>
              <span style={{
                fontFamily: F.mono, fontSize: 12, fontWeight: 600,
                padding: "2px 6px", borderRadius: 4,
                color: t.up ? "#34d399" : "#f87171",
                background: t.up ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
              }}>{t.chg}</span>
              {i < TICKER_DATA.length * 2 - 1 && <span style={{ width: 3, height: 3, background: "rgba(255,255,255,0.2)", borderRadius: "50%", marginLeft: 8 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          PRODUCTS — White background
          ════════════════════════════════════════════════════════ */}
      <section
        id="products"
        ref={productsFade.ref}
        style={{
          padding: isMobile ? "80px 20px" : "120px 56px",
          background: C.bg,
          opacity: productsFade.visible ? 1 : 0,
          transform: productsFade.visible ? "translateY(0)" : "translateY(40px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: isMobile ? 48 : 72 }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: C.blueAccent, textTransform: "uppercase" as const, marginBottom: 12 }}>
            The ORDR-Terminal Suite
          </div>
          <h2 style={{ fontFamily: F.heading, fontSize: isMobile ? 32 : 44, fontWeight: 800, letterSpacing: "-0.035em", color: C.text, lineHeight: 1.1, margin: 0 }}>
            Seven products. One platform.
          </h2>
          <p style={{ fontSize: 17, color: C.textMuted, maxWidth: 500, lineHeight: 1.6, margin: "16px auto 0" }}>
            Every product is built on the same institutional-grade infrastructure.
            From charting to governance, from intelligence to execution.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
          gap: 1,
          background: C.border,
          maxWidth: 1200, margin: "0 auto", borderRadius: 16, overflow: "hidden",
          border: `1px solid ${C.border}`,
        }}>
          {PRODUCTS.map((p) => (
            <ProductCard key={p.name} product={p} isMobile={isMobile} />
          ))}
          {!isMobile && <div style={{ background: C.bgSoft }} />}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          CAPABILITIES — Treasury Blue background
          ════════════════════════════════════════════════════════ */}
      <section
        id="capabilities"
        ref={capFade.ref}
        style={{
          background: C.blue, color: "#fff",
          padding: isMobile ? "80px 20px" : "120px 56px",
          position: "relative", overflow: "hidden",
          opacity: capFade.visible ? 1 : 0,
          transform: capFade.visible ? "translateY(0)" : "translateY(40px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 10%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 10%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ marginBottom: isMobile ? 48 : 72 }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, marginBottom: 12 }}>
              Platform Capabilities
            </div>
            <h2 style={{ fontFamily: F.heading, fontSize: isMobile ? 32 : 44, fontWeight: 800, letterSpacing: "-0.035em", color: "#fff", lineHeight: 1.1, margin: 0 }}>
              Built to institutional standards
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)", maxWidth: 500, lineHeight: 1.6, marginTop: 16 }}>
              Every calculation is deterministic. Every decision is auditable. Every workflow is governed.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: isMobile ? 16 : 32 }}>
            {CAPABILITIES.map((cap) => (
              <div key={cap.label} className="ordr-cap-card" style={{
                padding: isMobile ? "24px 20px" : "32px 24px",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
              }}>
                <div style={{ fontFamily: F.mono, fontSize: isMobile ? 28 : 36, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>{cap.num}</div>
                <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginTop: 8 }}>{cap.label}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, marginTop: 8 }}>{cap.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          ARCHITECTURE — White background
          ════════════════════════════════════════════════════════ */}
      <section
        id="architecture"
        ref={archFade.ref}
        style={{
          background: C.bg,
          padding: isMobile ? "80px 20px" : "120px 56px",
          opacity: archFade.visible ? 1 : 0,
          transform: archFade.visible ? "translateY(0)" : "translateY(40px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: isMobile ? undefined : "1fr 1fr",
          gap: 80, alignItems: "center",
        }}>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", color: C.blueAccent, textTransform: "uppercase" as const, marginBottom: 12 }}>
              Architecture
            </div>
            <h2 style={{ fontFamily: F.heading, fontSize: isMobile ? 32 : 44, fontWeight: 800, letterSpacing: "-0.035em", color: C.text, lineHeight: 1.1, margin: 0 }}>
              Deterministic by design
            </h2>
            <p style={{ fontSize: 17, color: C.textMuted, maxWidth: 440, lineHeight: 1.6, marginTop: 16 }}>
              Same inputs always produce the same outputs. No ML black boxes, no stochastic drift.
              Every hedge ratio is reproducible and explainable to auditors, regulators, and boards.
            </p>
            <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/methodology" className="ordr-btn" style={{
                fontFamily: F.ui, fontSize: 14, fontWeight: 600,
                color: "#fff", background: C.blue,
                padding: "12px 28px", borderRadius: 10, textDecoration: "none", border: "none",
              }}>Documentation</Link>
              <Link href="/help" className="ordr-btn" style={{
                fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.textMuted,
                background: "transparent", padding: "12px 28px", borderRadius: 10,
                textDecoration: "none", border: `1.5px solid ${C.border}`,
              }}>API Reference</Link>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: isMobile ? 40 : 0 }}>
            {ARCH_BLOCKS.map((b) => (
              <div key={b.label} style={{
                padding: "24px 20px", border: `1px solid ${C.border}`, borderRadius: 12,
                background: C.bg,
              }}>
                <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", color: C.textDim, textTransform: "uppercase" as const }}>{b.label}</div>
                <div style={{ fontFamily: F.mono, fontSize: 22, fontWeight: 700, color: C.blue, marginTop: 4 }}>{b.value}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6, lineHeight: 1.4 }}>{b.desc}</div>
              </div>
            ))}
            <div style={{
              gridColumn: "1 / -1", padding: "24px 20px", border: `1px solid ${C.border}`,
              borderRadius: 12, background: C.bg,
            }}>
              <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", color: C.textDim, textTransform: "uppercase" as const }}>Authorization</div>
              <div style={{ fontFamily: F.mono, fontSize: 22, fontWeight: 700, color: C.blue, marginTop: 4 }}>9 Roles &middot; 41 Permissions</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6, lineHeight: 1.4 }}>Hierarchical RBAC with fail-closed enforcement, API key auth, and JWT session management</div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          TRUST STRIP — Light blue tint
          ════════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        gap: isMobile ? 24 : 56, padding: isMobile ? "32px 20px" : "56px",
        borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        background: C.bluePale, flexWrap: "wrap",
      }}>
        {TRUST_ITEMS.map((t) => (
          <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: C.blue }}>{t.icon}</span>
            <span style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 500, color: C.blueDark }}>{t.label}</span>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════
          CTA — Treasury Blue background
          ════════════════════════════════════════════════════════ */}
      <section style={{
        background: C.blue,
        padding: isMobile ? "80px 20px" : "100px 56px",
        textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${C.blueMid}, ${C.blue})` }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: isMobile ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", margin: 0, color: "#fff",
          }}>
            The terminal for modern capital markets
          </h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", marginTop: 16, maxWidth: 460, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
            Seven products. One platform. Institutional-grade infrastructure from day one.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 40, flexWrap: "wrap" }}>
            <Link href="/auth/login" className="ordr-btn" style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: C.blue, background: "#fff",
              padding: "14px 36px", borderRadius: 10, textDecoration: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              border: "none",
            }}>Request Access</Link>
            <Link href="/help/contact" className="ordr-btn" style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.7)",
              background: "transparent", padding: "14px 36px", borderRadius: 10,
              textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.2)",
            }}>Schedule Demo</Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FOOTER — White
          ════════════════════════════════════════════════════════ */}
      <footer style={{
        padding: isMobile ? "32px 20px" : "40px 56px",
        borderTop: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 16, background: C.bg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 20, height: 20, borderRadius: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: F.mono, fontSize: 9, fontWeight: 800,
            background: C.blue, color: "#fff",
          }}>O</div>
          <span style={{ fontFamily: F.ui, fontSize: 12, color: C.textDim }}>
            ORDR-Terminal &mdash; Synexiun &copy; {new Date().getFullYear()}
          </span>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {["Privacy", "Terms", "Security", "Documentation", "API", "Contact"].map((link) => (
            <a key={link} href="#" style={{ fontSize: 12, color: C.textDim, textDecoration: "none" }}>{link}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Product Card
   ═══════════════════════════════════════════════════════ */

function ProductCard({ product, isMobile }: { product: Product; isMobile: boolean }) {
  const { name, desc, tags, href, external, icon } = product;

  const card = (
    <div className="ordr-card" style={{
      background: C.bg,
      padding: isMobile ? "28px 24px" : "40px 32px",
      display: "flex", flexDirection: "column" as const, gap: 16,
      position: "relative" as const, minHeight: isMobile ? undefined : 280,
      cursor: "pointer",
    }}>
      <div className="ordr-card-icon" style={{
        width: 52, height: 52, borderRadius: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: C.bluePale, border: `1px solid ${C.border}`,
        color: C.blue, transition: "all 0.25s",
      }}>
        {icon}
      </div>
      <div style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", color: C.text, marginTop: 4 }}>
        {name}
      </div>
      <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.6, flex: 1, margin: 0 }}>
        {desc}
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
        {tags.map((tag) => (
          <span key={tag} style={{
            fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
            color: C.textMuted, background: C.bgSoft, padding: "3px 8px", borderRadius: 4,
          }}>{tag}</span>
        ))}
      </div>
      <div className="ordr-card-arrow" style={{
        position: "absolute", top: 36, right: 32,
        fontFamily: F.mono, fontSize: 18, color: C.blue,
        opacity: 0, transform: "translateX(-4px)", transition: "all 0.25s",
      }}>&rarr;</div>
    </div>
  );

  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{card}</a>;
  }
  return <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>{card}</Link>;
}
