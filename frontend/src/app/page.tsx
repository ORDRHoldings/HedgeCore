"use client";

/**
 * Landing Page — ORDR Terminal
 *
 * Premium dark landing page with two product cards:
 * - ORDR Market (free, /market)
 * - ORDR Terminal (institutional, /auth/login)
 *
 * No auth context, no sidebar. Pure presentational.
 */

import { useState, useEffect } from "react";
import Link from "next/link";

const FONT_UI = "'IBM Plex Sans', sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";
const FONT_HEADING = "'Manrope', 'IBM Plex Sans', sans-serif";

const FEATURES_MARKET = [
  "23 technical indicators + auto-detection",
  "Volume Profile with POC / VAH / VAL",
  "Real-time FX data across 17 pairs",
  "Canvas 2D rendering at 60fps",
  "Drawing tools: trend, fib, S/R, FVG",
  "No account required",
];

const FEATURES_TERMINAL = [
  "Deterministic hedge calculations",
  "4-eyes governance with SoD",
  "WORM audit trail + hash chain",
  "Policy engine with 60 presets",
  "IFRS 9 / ASC 815 effectiveness",
  "Role-based access (9 roles, 41 perms)",
];

const FEATURES_POLISOPHIC = [
  "Geopolitical corridor risk scoring",
  "Multi-factor country risk analysis",
  "Real-time risk event monitoring",
  "Portfolio impact assessment",
];

const FEATURES_PORTFOLIO = [
  "Full hedge lifecycle management",
  "Position desk with readiness KPIs",
  "7-step execution pipeline",
  "Portfolio risk analytics",
];

const FEATURES_SANDBOX = [
  "Tri-state pipeline: Sandbox to Ledger",
  "Scenario studio with stress testing",
  "Policy comparison and backtesting",
  "Safe experimentation environment",
];

const FEATURES_WIKI = [
  "FX hedging knowledge base",
  "Strategy guides and best practices",
  "Instrument and product glossary",
  "Regulatory framework references",
];

const STATS = [
  { value: "219", label: "API Endpoints" },
  { value: "41", label: "Engine Modules" },
  { value: "60", label: "Policy Presets" },
  { value: "3,200+", label: "Tests" },
];

export default function LandingPage() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0B1120",
        color: "#E2E8F0",
        fontFamily: FONT_UI,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Animated gradient background */}
      <style>{`
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.12; }
          50% { opacity: 0.2; }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.15,
          background:
            "radial-gradient(ellipse at 20% 50%, #1C62F2 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, #26A69A 0%, transparent 50%)",
          animation: "gradientMove 15s ease infinite",
          backgroundSize: "200% 200%",
          pointerEvents: "none",
        }}
      />
      {/* Secondary glow pulse */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          width: 600,
          height: 600,
          transform: "translateX(-50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(28, 98, 242, 0.15) 0%, transparent 70%)",
          animation: "pulseGlow 8s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* ── Nav Bar ── */}
      <nav
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 22,
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "0.08em",
            }}
          >
            ORDR
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              fontWeight: 500,
              color: "#4A5A74",
              letterSpacing: "0.1em",
              marginTop: 2,
            }}
          >
            TERMINAL
          </span>
        </div>
        <Link
          href="/auth/login"
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            fontWeight: 600,
            color: "#A0AEC0",
            textDecoration: "none",
            padding: "8px 20px",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            letterSpacing: "0.06em",
            transition: "all 0.2s",
          }}
        >
          SIGN IN
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          padding: isMobile ? "40px 24px 32px" : "72px 32px 48px",
          maxWidth: 900,
          margin: "0 auto",
          animation: "fadeInUp 0.8s ease-out",
        }}
      >
        <h1
          style={{
            fontFamily: FONT_HEADING,
            fontSize: isMobile ? 32 : 52,
            fontWeight: 800,
            lineHeight: 1.1,
            color: "#FFFFFF",
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          The Operating System
          <br />
          <span style={{ color: "#1C62F2" }}>for FX Treasury</span>
        </h1>
        <p
          style={{
            fontFamily: FONT_UI,
            fontSize: isMobile ? 15 : 18,
            color: "#7B8BA5",
            marginTop: 20,
            lineHeight: 1.6,
            maxWidth: 640,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Institutional-grade hedge calculation, governance, and audit.
          Deterministic engine. WORM audit trail. 4-eyes approval.
          Built for treasurers who need to prove every decision.
        </p>
      </section>

      {/* ── Product Cards ── */}
      <section
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 24,
          padding: isMobile ? "0 24px" : "0 32px",
          maxWidth: 1080,
          margin: "0 auto",
          animation: "fadeInUp 1s ease-out",
        }}
      >
        {/* ORDR Market Card */}
        <div
          style={{
            background: "rgba(30, 34, 45, 0.6)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 32,
            flex: 1,
            minWidth: isMobile ? "auto" : 320,
            maxWidth: isMobile ? "none" : 500,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            {/* Chart icon (SVG) */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(38, 166, 154, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#26A69A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M7 16l4-8 4 4 6-10" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: "#FFFFFF", letterSpacing: "0.04em" }}>
                ORDR MARKET
              </div>
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#26A69A",
                  background: "rgba(38, 166, 154, 0.15)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  letterSpacing: "0.08em",
                }}
              >
                FREE
              </span>
            </div>
          </div>

          <p style={{ fontFamily: FONT_UI, fontSize: 14, color: "#7B8BA5", lineHeight: 1.6, marginBottom: 24, marginTop: 0 }}>
            Professional FX charting platform. Canvas 2D engine with institutional
            indicators, auto-detection, and drawing tools. No account needed.
          </p>

          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px 0", flex: 1 }}>
            {FEATURES_MARKET.map((f) => (
              <li
                key={f}
                style={{
                  fontFamily: FONT_UI,
                  fontSize: 13,
                  color: "#A0AEC0",
                  padding: "5px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#26A69A", flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>

          <Link
            href="/market"
            style={{
              display: "block",
              textAlign: "center",
              fontFamily: FONT_MONO,
              fontSize: 13,
              fontWeight: 700,
              color: "#FFFFFF",
              background: "linear-gradient(135deg, #26A69A 0%, #1B8A80 100%)",
              padding: "12px 24px",
              borderRadius: 10,
              textDecoration: "none",
              letterSpacing: "0.06em",
              transition: "all 0.2s",
            }}
          >
            OPEN MARKET
          </Link>
        </div>

        {/* ORDR Terminal Card */}
        <div
          style={{
            background: "rgba(30, 34, 45, 0.6)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 32,
            flex: 1,
            minWidth: isMobile ? "auto" : 320,
            maxWidth: isMobile ? "none" : 500,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            {/* Shield icon (SVG) */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(28, 98, 242, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1C62F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: "#FFFFFF", letterSpacing: "0.04em" }}>
                ORDR TERMINAL
              </div>
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#1C62F2",
                  background: "rgba(28, 98, 242, 0.15)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  letterSpacing: "0.08em",
                }}
              >
                INSTITUTIONAL
              </span>
            </div>
          </div>

          <p style={{ fontFamily: FONT_UI, fontSize: 14, color: "#7B8BA5", lineHeight: 1.6, marginBottom: 24, marginTop: 0 }}>
            Full hedge lifecycle platform. Deterministic engine, tri-state governance
            pipeline, WORM audit, and policy-driven execution with 4-eyes approval.
          </p>

          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px 0", flex: 1 }}>
            {FEATURES_TERMINAL.map((f) => (
              <li
                key={f}
                style={{
                  fontFamily: FONT_UI,
                  fontSize: 13,
                  color: "#A0AEC0",
                  padding: "5px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1C62F2", flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>

          <Link
            href="/auth/login"
            style={{
              display: "block",
              textAlign: "center",
              fontFamily: FONT_MONO,
              fontSize: 13,
              fontWeight: 700,
              color: "#FFFFFF",
              background: "linear-gradient(135deg, #1C62F2 0%, #1550C8 100%)",
              padding: "12px 24px",
              borderRadius: 10,
              textDecoration: "none",
              letterSpacing: "0.06em",
              transition: "all 0.2s",
            }}
          >
            SIGN IN
          </Link>
        </div>
      </section>

      {/* ── Secondary Product Cards ── */}
      <section
        style={{
          position: "relative",
          zIndex: 10,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
          gap: 16,
          padding: isMobile ? "32px 24px 0" : "32px 32px 0",
          maxWidth: 1080,
          margin: "0 auto",
          animation: "fadeInUp 1.1s ease-out",
        }}
      >
        {/* Polisophic */}
        <ProductCard
          title="POLISOPHIC"
          badge="GEOPOLITICAL"
          badgeColor="#E040FB"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E040FB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          }
          description="Geopolitical risk corridor scoring with multi-factor analysis and portfolio impact assessment."
          features={FEATURES_POLISOPHIC}
          href="/auth/login"
          ctaLabel="SIGN IN TO ACCESS"
          ctaGradient="linear-gradient(135deg, #E040FB 0%, #AB47BC 100%)"
          isMobile={isMobile}
        />

        {/* Hedge Portfolio */}
        <ProductCard
          title="HEDGE PORTFOLIO"
          badge="PORTFOLIO"
          badgeColor="#FF9800"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF9800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M7 10l3-3 2 2 5-5" />
            </svg>
          }
          description="Full hedge lifecycle from position entry to execution with 7-step pipeline and risk analytics."
          features={FEATURES_PORTFOLIO}
          href="/auth/login"
          ctaLabel="SIGN IN TO ACCESS"
          ctaGradient="linear-gradient(135deg, #FF9800 0%, #E65100 100%)"
          isMobile={isMobile}
        />

        {/* Simulation & Sandbox */}
        <ProductCard
          title="SIMULATION"
          badge="SANDBOX"
          badgeColor="#00BCD4"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00BCD4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          }
          description="Tri-state governance pipeline with scenario studio, stress testing, and safe experimentation."
          features={FEATURES_SANDBOX}
          href="/auth/login"
          ctaLabel="SIGN IN TO ACCESS"
          ctaGradient="linear-gradient(135deg, #00BCD4 0%, #00838F 100%)"
          isMobile={isMobile}
        />

        {/* HedgeWiki */}
        <ProductCard
          title="HEDGEWIKI"
          badge="KNOWLEDGE"
          badgeColor="#8BC34A"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8BC34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M8 7h8" />
              <path d="M8 11h6" />
            </svg>
          }
          description="Comprehensive FX hedging knowledge base with strategy guides, glossary, and regulatory references."
          features={FEATURES_WIKI}
          href="https://hedge-wiki.vercel.app/"
          ctaLabel="OPEN HEDGEWIKI"
          ctaGradient="linear-gradient(135deg, #8BC34A 0%, #558B2F 100%)"
          isMobile={isMobile}
          external
        />
      </section>

      {/* ── Stats Bar ── */}
      <section
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          justifyContent: "center",
          gap: isMobile ? 16 : 48,
          flexWrap: "wrap",
          padding: isMobile ? "48px 24px 24px" : "64px 32px 32px",
          maxWidth: 1080,
          margin: "0 auto",
          animation: "fadeInUp 1.2s ease-out",
        }}
      >
        {STATS.map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: isMobile ? 24 : 32,
                fontWeight: 800,
                color: "#FFFFFF",
                letterSpacing: "-0.02em",
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                fontWeight: 600,
                color: "#4A5A74",
                letterSpacing: "0.1em",
                marginTop: 4,
              }}
            >
              {s.label.toUpperCase()}
            </div>
          </div>
        ))}
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          padding: "40px 32px 32px",
        }}
      >
        <div
          style={{
            width: 48,
            height: 1,
            background: "rgba(255,255,255,0.08)",
            margin: "0 auto 20px",
          }}
        />
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: 600,
            color: "#2D3A50",
            letterSpacing: "0.12em",
          }}
        >
          ORDR TERMINAL &mdash; SYNEXIUN
        </span>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Secondary Product Card Component
   ═══════════════════════════════════════════════════════ */

function ProductCard({
  title, badge, badgeColor, icon, description, features, href, ctaLabel, ctaGradient, isMobile, external,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  description: string;
  features: string[];
  href: string;
  ctaLabel: string;
  ctaGradient: string;
  isMobile: boolean;
  external?: boolean;
}) {
  const linkProps = external
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <div
      style={{
        background: "rgba(30, 34, 45, 0.5)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: isMobile ? "24px 20px" : "24px 20px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${badgeColor}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: "#FFFFFF", letterSpacing: "0.04em" }}>
            {title}
          </div>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              fontWeight: 700,
              color: badgeColor,
              background: `${badgeColor}20`,
              padding: "1px 6px",
              borderRadius: 3,
              letterSpacing: "0.08em",
            }}
          >
            {badge}
          </span>
        </div>
      </div>

      <p style={{ fontFamily: FONT_UI, fontSize: 12, color: "#7B8BA5", lineHeight: 1.5, marginBottom: 16, marginTop: 0 }}>
        {description}
      </p>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px 0", flex: 1 }}>
        {features.map((f) => (
          <li
            key={f}
            style={{
              fontFamily: FONT_UI,
              fontSize: 12,
              color: "#A0AEC0",
              padding: "3px 0",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: badgeColor, flexShrink: 0 }} />
            {f}
          </li>
        ))}
      </ul>

      <Link
        href={href}
        {...linkProps}
        style={{
          display: "block",
          textAlign: "center",
          fontFamily: FONT_MONO,
          fontSize: 11,
          fontWeight: 700,
          color: "#FFFFFF",
          background: ctaGradient,
          padding: "10px 16px",
          borderRadius: 8,
          textDecoration: "none",
          letterSpacing: "0.06em",
          transition: "all 0.2s",
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
