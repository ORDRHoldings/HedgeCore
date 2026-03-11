"use client";

/**
 * Landing Page — ORDR Terminal
 *
 * Premium dark institutional landing page with:
 * - Hero section (100vh) with animated grid + CTAs
 * - Product ecosystem grid (9 products)
 * - Why ORDR value props
 * - Platform stats bar
 * - Footer
 *
 * No auth context, no sidebar. Pure presentational.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  BarChart3,
  Shield,
  Globe,
  PieChart,
  FlaskConical,
  Box,
  Banknote,
  Landmark,
  BookOpen,
  ChevronDown,
  Lock,
  Zap,
  Eye,
  Activity,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════
   Design tokens
   ═══════════════════════════════════════════════════════ */

const FONT_UI = "'IBM Plex Sans', sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";
const FONT_HEADING = "'Manrope', 'IBM Plex Sans', sans-serif";

const C = {
  bgBase: "#0B1120",
  bgMid: "#131722",
  bgCard: "#1E222D",
  border: "#2A2E39",
  borderSubtle: "rgba(255,255,255,0.06)",
  textPrimary: "#D1D4DC",
  textMuted: "#787B86",
  textDim: "#545B69",
  accentBlue: "#2962FF",
  accentGreen: "#26A69A",
  white: "#FFFFFF",
} as const;

/* ═══════════════════════════════════════════════════════
   Product data
   ═══════════════════════════════════════════════════════ */

interface Product {
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  href: string;
  gated?: boolean;
}

const PRODUCTS: Product[] = [
  {
    title: "ORDR Market",
    description: "Free charting platform with 23 indicators, Volume Profile, 60fps Canvas 2D engine, and drawing tools.",
    badge: "FREE",
    badgeColor: C.accentGreen,
    icon: <BarChart3 size={20} />,
    href: "/market",
  },
  {
    title: "ORDR Terminal",
    description: "Full institutional dashboard with position management, hedge calculation, and governance workflows.",
    badge: "FULL ACCESS",
    badgeColor: C.accentBlue,
    icon: <Shield size={20} />,
    href: "/auth/login",
  },
  {
    title: "Polisophic Intelligence",
    description: "Geopolitical risk scoring, corridor analysis, and macro intelligence feeds for FX exposure.",
    badge: "OPEN",
    badgeColor: "#E040FB",
    icon: <Globe size={20} />,
    href: "/polisophic",
  },
  {
    title: "Portfolio Risk",
    description: "Multi-position portfolio analysis with factor decomposition, correlation, and VaR analytics.",
    badge: "OPEN",
    badgeColor: "#FF9800",
    icon: <PieChart size={20} />,
    href: "/portfolio-risk",
  },
  {
    title: "Scenario Studio",
    description: "Stress testing, historical VaR, configurable shock packs and scenario analysis for hedge strategies.",
    badge: "OPEN",
    badgeColor: "#00BCD4",
    icon: <FlaskConical size={20} />,
    href: "/scenario-studio",
  },
  {
    title: "Sandbox",
    description: "Safe calculation environment for testing hedge strategies without production impact.",
    badge: "OPEN",
    badgeColor: "#8BC34A",
    icon: <Box size={20} />,
    href: "/sandbox",
  },
  {
    title: "Currency Desk",
    description: "Real-time FX execution, forward curves, and currency management for institutional treasury.",
    badge: "INSTITUTIONAL",
    badgeColor: "#F44336",
    icon: <Banknote size={20} />,
    href: "/market-overview",
    gated: true,
  },
  {
    title: "Treasury Desk",
    description: "Corporate treasury hedging workflows, maturity management, and accounting integration.",
    badge: "INSTITUTIONAL",
    badgeColor: "#F44336",
    icon: <Landmark size={20} />,
    href: "/hedge-desk",
    gated: true,
  },
  {
    title: "HedgeWiki",
    description: "Comprehensive methodology documentation, whitepapers, and calculation reference library.",
    badge: "OPEN",
    badgeColor: "#8BC34A",
    icon: <BookOpen size={20} />,
    href: "/methodology",
  },
];

const STATS = [
  { value: "219", label: "API Endpoints" },
  { value: "41", label: "Engine Modules" },
  { value: "60", label: "Policy Presets" },
  { value: "3,200+", label: "Tests" },
  { value: "23", label: "Indicators" },
];

const VALUE_PROPS = [
  {
    icon: <Zap size={28} />,
    title: "Deterministic Engine",
    description: "Every calculation is reproducible, auditable, and hash-chained. No black boxes.",
  },
  {
    icon: <Eye size={28} />,
    title: "Institutional Governance",
    description: "4-eyes approval, separation of duties, WORM audit trails, and policy-driven hedging.",
  },
  {
    icon: <Activity size={28} />,
    title: "Professional Charting",
    description: "TradingView-class charting with 23 indicators, Volume Profile, and Canvas 2D at 60fps.",
  },
];

/* ═══════════════════════════════════════════════════════
   Intersection Observer hook for fade-in
   ═══════════════════════════════════════════════════════ */

function useFadeIn(threshold = 0.15) {
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
   Main component
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
    const el = document.getElementById("platform");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

  const productsFade = useFadeIn();
  const whyFade = useFadeIn();
  const statsFade = useFadeIn();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bgBase,
        color: C.textPrimary,
        fontFamily: FONT_UI,
        overflowX: "hidden",
        overflowY: "auto",
        position: "relative",
      }}
    >
      {/* ── CSS Animations ── */}
      <style>{`
        @keyframes ordr-grid-fade {
          0% { opacity: 0.03; }
          50% { opacity: 0.07; }
          100% { opacity: 0.03; }
        }
        @keyframes ordr-hero-in {
          from { opacity: 0; transform: translateY(32px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ordr-chevron-bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(8px); }
        }
        @keyframes ordr-glow {
          0%, 100% { opacity: 0.08; }
          50% { opacity: 0.16; }
        }
        @keyframes ordr-fade-in-up {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ordr-card-hover {
          transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
        }
        .ordr-card-hover:hover {
          border-color: rgba(41, 98, 255, 0.3) !important;
          box-shadow: 0 0 24px rgba(41, 98, 255, 0.08);
          transform: translateY(-2px);
        }
        .ordr-card-gated {
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .ordr-card-gated:hover {
          border-color: rgba(244, 67, 54, 0.25) !important;
          box-shadow: 0 0 16px rgba(244, 67, 54, 0.06);
        }
        .ordr-cta-hover {
          transition: all 0.2s ease;
        }
        .ordr-cta-hover:hover {
          filter: brightness(1.15);
          transform: translateY(-1px);
        }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ── Animated grid background ── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(41,98,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(41,98,255,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          animation: "ordr-grid-fade 12s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── Gradient glow orbs ── */}
      <div
        style={{
          position: "fixed",
          top: "-10%",
          left: "20%",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(41,98,255,0.12) 0%, transparent 60%)",
          animation: "ordr-glow 10s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "30%",
          right: "10%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(38,166,154,0.08) 0%, transparent 60%)",
          animation: "ordr-glow 14s ease-in-out infinite 3s",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ════════════════════════════════════════════════════════
          SECTION 1 — Hero (100vh)
          ════════════════════════════════════════════════════════ */}
      <section
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Nav */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: isMobile ? "20px 24px" : "28px 48px",
            maxWidth: 1280,
            width: "100%",
            margin: "0 auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 24,
                fontWeight: 700,
                color: C.white,
                letterSpacing: "0.1em",
              }}
            >
              ORDR
            </span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 12,
                fontWeight: 500,
                color: C.textDim,
                letterSpacing: "0.12em",
              }}
            >
              TERMINAL
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link
              href="/market"
              className="ordr-cta-hover"
              style={{
                fontFamily: FONT_MONO,
                fontSize: 12,
                fontWeight: 600,
                color: C.textMuted,
                textDecoration: "none",
                padding: "8px 16px",
                letterSpacing: "0.06em",
              }}
            >
              MARKET
            </Link>
            <Link
              href="/auth/login"
              className="ordr-cta-hover"
              style={{
                fontFamily: FONT_MONO,
                fontSize: 12,
                fontWeight: 600,
                color: C.textPrimary,
                textDecoration: "none",
                padding: "8px 20px",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                letterSpacing: "0.06em",
              }}
            >
              SIGN IN
            </Link>
          </div>
        </nav>

        {/* Hero content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: isMobile ? "0 24px 80px" : "0 48px 120px",
            animation: "ordr-hero-in 1s ease-out",
          }}
        >
          <h1
            style={{
              fontFamily: FONT_HEADING,
              fontSize: isMobile ? 48 : 72,
              fontWeight: 800,
              lineHeight: 1.05,
              color: C.white,
              margin: 0,
              letterSpacing: "-0.03em",
            }}
          >
            ORDR
          </h1>
          <p
            style={{
              fontFamily: FONT_HEADING,
              fontSize: isMobile ? 18 : 24,
              fontWeight: 600,
              color: C.textPrimary,
              margin: "16px 0 0",
              letterSpacing: "-0.01em",
            }}
          >
            The Institutional Trading Platform
          </p>
          <p
            style={{
              fontFamily: FONT_UI,
              fontSize: isMobile ? 14 : 16,
              color: C.textMuted,
              margin: "20px 0 0",
              maxWidth: 560,
              lineHeight: 1.7,
            }}
          >
            Professional charting, deterministic hedging, and treasury
            management — unified.
          </p>

          {/* CTAs */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 40,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link
              href="/market"
              className="ordr-cta-hover"
              style={{
                fontFamily: FONT_MONO,
                fontSize: 13,
                fontWeight: 700,
                color: C.white,
                background: `linear-gradient(135deg, ${C.accentGreen} 0%, #1B8A80 100%)`,
                padding: "14px 32px",
                borderRadius: 8,
                textDecoration: "none",
                letterSpacing: "0.06em",
              }}
            >
              LAUNCH ORDR MARKET
            </Link>
            <Link
              href="/auth/login"
              className="ordr-cta-hover"
              style={{
                fontFamily: FONT_MONO,
                fontSize: 13,
                fontWeight: 700,
                color: C.textPrimary,
                background: "transparent",
                padding: "14px 32px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                textDecoration: "none",
                letterSpacing: "0.06em",
              }}
            >
              SIGN IN
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          onClick={scrollToProducts}
          style={{
            position: "absolute",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            animation: "ordr-chevron-bounce 2s ease-in-out infinite",
            cursor: "pointer",
            opacity: 0.4,
          }}
        >
          <ChevronDown size={24} color={C.textMuted} />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 2 — Product Ecosystem
          ════════════════════════════════════════════════════════ */}
      <section
        id="platform"
        ref={productsFade.ref}
        style={{
          position: "relative",
          zIndex: 1,
          padding: isMobile ? "80px 24px" : "120px 48px",
          maxWidth: 1280,
          margin: "0 auto",
          opacity: productsFade.visible ? 1 : 0,
          transform: productsFade.visible ? "translateY(0)" : "translateY(40px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        {/* Section header */}
        <div style={{ marginBottom: isMobile ? 40 : 56, textAlign: "center" }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              fontWeight: 700,
              color: C.accentBlue,
              letterSpacing: "0.2em",
              display: "block",
              marginBottom: 12,
            }}
          >
            THE PLATFORM
          </span>
          <h2
            style={{
              fontFamily: FONT_HEADING,
              fontSize: isMobile ? 28 : 36,
              fontWeight: 700,
              color: C.white,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Everything you need, unified
          </h2>
          <p
            style={{
              fontFamily: FONT_UI,
              fontSize: 15,
              color: C.textMuted,
              marginTop: 16,
              maxWidth: 480,
              marginLeft: "auto",
              marginRight: "auto",
              lineHeight: 1.6,
            }}
          >
            From free charting to institutional treasury management.
            Each module is purpose-built for professional FX workflows.
          </p>
        </div>

        {/* Product grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 20,
          }}
        >
          {PRODUCTS.map((product) => (
            <ProductCard key={product.title} product={product} isMobile={isMobile} />
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 3 — Why ORDR
          ════════════════════════════════════════════════════════ */}
      <section
        ref={whyFade.ref}
        style={{
          position: "relative",
          zIndex: 1,
          padding: isMobile ? "80px 24px" : "120px 48px",
          maxWidth: 1280,
          margin: "0 auto",
          opacity: whyFade.visible ? 1 : 0,
          transform: whyFade.visible ? "translateY(0)" : "translateY(40px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: isMobile ? 40 : 56 }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              fontWeight: 700,
              color: C.accentBlue,
              letterSpacing: "0.2em",
              display: "block",
              marginBottom: 12,
            }}
          >
            WHY ORDR
          </span>
          <h2
            style={{
              fontFamily: FONT_HEADING,
              fontSize: isMobile ? 28 : 36,
              fontWeight: 700,
              color: C.white,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Built for institutions
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: 32,
          }}
        >
          {VALUE_PROPS.map((vp) => (
            <div
              key={vp.title}
              style={{
                textAlign: "center",
                padding: isMobile ? "32px 24px" : "48px 32px",
                background: `rgba(30, 34, 45, 0.4)`,
                border: `1px solid ${C.borderSubtle}`,
                borderRadius: 16,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: "rgba(41, 98, 255, 0.08)",
                  color: C.accentBlue,
                  marginBottom: 20,
                }}
              >
                {vp.icon}
              </div>
              <h3
                style={{
                  fontFamily: FONT_HEADING,
                  fontSize: 18,
                  fontWeight: 700,
                  color: C.white,
                  margin: "0 0 12px",
                }}
              >
                {vp.title}
              </h3>
              <p
                style={{
                  fontFamily: FONT_UI,
                  fontSize: 14,
                  color: C.textMuted,
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {vp.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 4 — Stats Bar
          ════════════════════════════════════════════════════════ */}
      <section
        ref={statsFade.ref}
        style={{
          position: "relative",
          zIndex: 1,
          padding: isMobile ? "48px 24px" : "64px 48px",
          maxWidth: 1280,
          margin: "0 auto",
          opacity: statsFade.visible ? 1 : 0,
          transform: statsFade.visible ? "translateY(0)" : "translateY(40px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: isMobile ? 24 : 56,
            flexWrap: "wrap",
            padding: isMobile ? "32px 16px" : "40px 48px",
            background: "rgba(30, 34, 45, 0.4)",
            border: `1px solid ${C.borderSubtle}`,
            borderRadius: 16,
          }}
        >
          {STATS.map((s, i) => (
            <div key={s.label} style={{ textAlign: "center", display: "flex", alignItems: "center", gap: isMobile ? 0 : 56 }}>
              <div>
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: isMobile ? 28 : 36,
                    fontWeight: 800,
                    color: C.white,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.textDim,
                    letterSpacing: "0.12em",
                    marginTop: 6,
                  }}
                >
                  {s.label.toUpperCase()}
                </div>
              </div>
              {/* Divider between stats (not after last) */}
              {i < STATS.length - 1 && !isMobile && (
                <div
                  style={{
                    width: 1,
                    height: 40,
                    background: C.border,
                    marginLeft: 0,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECTION 5 — Footer
          ════════════════════════════════════════════════════════ */}
      <footer
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: "64px 32px 40px",
          borderTop: `1px solid ${C.borderSubtle}`,
          marginTop: 40,
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 14,
            fontWeight: 700,
            color: C.textDim,
            letterSpacing: "0.12em",
            marginBottom: 12,
          }}
        >
          ORDR TERMINAL &mdash; SYNEXIUN
        </div>
        <div
          style={{
            fontFamily: FONT_UI,
            fontSize: 13,
            color: C.textDim,
            marginBottom: 8,
          }}
        >
          Built for institutional FX treasury management
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            color: "rgba(84, 91, 105, 0.6)",
            letterSpacing: "0.04em",
          }}
        >
          &copy; {new Date().getFullYear()} Synexiun. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Product Card Component
   ═══════════════════════════════════════════════════════ */

function ProductCard({ product, isMobile }: { product: Product; isMobile: boolean }) {
  const { title, description, badge, badgeColor, icon, href, gated } = product;

  const cardContent = (
    <div
      className={gated ? "ordr-card-gated" : "ordr-card-hover"}
      style={{
        background: gated
          ? "rgba(20, 24, 32, 0.5)"
          : "rgba(30, 34, 45, 0.6)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${C.borderSubtle}`,
        borderRadius: 14,
        padding: isMobile ? "28px 24px" : "28px 24px",
        display: "flex",
        flexDirection: "column" as const,
        height: "100%",
        opacity: gated ? 0.7 : 1,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `${badgeColor}14`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: badgeColor,
            }}
          >
            {icon}
          </div>
          <div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 14,
                fontWeight: 700,
                color: gated ? C.textMuted : C.white,
                letterSpacing: "0.04em",
              }}
            >
              {title.toUpperCase()}
            </div>
          </div>
        </div>
        {/* Badge */}
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            fontWeight: 700,
            color: badgeColor,
            background: `${badgeColor}18`,
            padding: "3px 8px",
            borderRadius: 4,
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {gated && <Lock size={9} />}
          {badge}
        </span>
      </div>

      {/* Description */}
      <p
        style={{
          fontFamily: FONT_UI,
          fontSize: 13,
          color: gated ? C.textDim : C.textMuted,
          lineHeight: 1.6,
          margin: "0 0 20px",
          flex: 1,
        }}
      >
        {description}
      </p>

      {/* CTA */}
      {gated ? (
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            fontWeight: 600,
            color: C.textDim,
            textAlign: "center",
            padding: "10px 16px",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            letterSpacing: "0.06em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Lock size={12} />
          REQUEST ACCESS
        </div>
      ) : (
        <div
          className="ordr-cta-hover"
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            fontWeight: 700,
            color: C.white,
            textAlign: "center",
            padding: "10px 16px",
            background: `linear-gradient(135deg, ${badgeColor} 0%, ${badgeColor}CC 100%)`,
            borderRadius: 8,
            letterSpacing: "0.06em",
          }}
        >
          {badge === "FREE" ? "OPEN MARKET" : badge === "FULL ACCESS" ? "SIGN IN" : "EXPLORE"}
        </div>
      )}
    </div>
  );

  if (gated) {
    return cardContent;
  }

  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      {cardContent}
    </Link>
  );
}
