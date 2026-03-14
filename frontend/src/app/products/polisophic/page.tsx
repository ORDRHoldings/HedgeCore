"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Gauge, Radio, TrendingDown, MapPin, Layers, History,
  Brain, AlertTriangle, Globe2, Eye,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "195", label: "Countries" },
  { value: "Real-Time", label: "Event Feed" },
  { value: "AI-Powered", label: "Interpretation" },
  { value: "L3 Overlay", label: "Engine Integration" },
  { value: "Corridor", label: "Scoring Model" },
];

const FEATURES = [
  { icon: <Gauge size={20} />, title: "Corridor Scoring Engine", desc: "Political risk quantified into numerical corridor scores mapped to specific currency pairs. Each corridor captures the geopolitical tension between two jurisdictions and translates it into vol adjustments and hedge ratio modifiers. Scores are computed deterministically from structured risk factors -- the AI interprets corridor changes and explains causal chains connecting political events to FX impact. Corridor updates feed directly into the hedge engine as Layer 3 overlays." },
  { icon: <Radio size={20} />, title: "Real-Time Event Tracking", desc: "Continuous monitoring of elections, sanctions, trade agreements, central bank decisions, military conflicts, and regulatory changes across 195 jurisdictions. Events are classified by type, severity, affected currencies, and expected duration. The AI filters noise from signal, prioritizing events that affect your specific portfolio exposure. Historical event databases provide pattern matching against past geopolitical episodes with similar characteristics." },
  { icon: <TrendingDown size={20} />, title: "Currency Impact Analysis", desc: "Quantified mapping from geopolitical events to FX volatility and exposure risk. Each event type has calibrated impact coefficients based on historical analysis of similar episodes. The deterministic engine computes exposure impact; the AI provides narrative context explaining transmission mechanisms -- how a specific political event translates through trade flows, capital flows, or sentiment channels into currency movements affecting your positions." },
  { icon: <MapPin size={20} />, title: "Country Risk Profiles", desc: "Comprehensive sovereign risk profiles for 195 countries covering political stability indices, economic indicators (GDP growth, inflation, current account, reserves), institutional quality metrics, and historical event timelines. Each profile includes currency correlation maps showing how country-specific risks transmit to FX pairs in your portfolio. AI provides forward-looking risk assessments by synthesizing profile data with current event trajectories." },
  { icon: <Layers size={20} />, title: "Engine Overlay Integration", desc: "Geopolitical intelligence feeds directly into the hedge computation engine as a Layer 3 policy overlay. When activated, corridor scores modify vol assumptions and hedge ratio targets within the deterministic calculation path. The overlay is neutral by default -- activation requires governance approval based on governance tier thresholds. The AI recommends when overlay activation may be warranted based on corridor score trajectories and portfolio sensitivity analysis." },
  { icon: <History size={20} />, title: "Historical Correlation Engine", desc: "How past geopolitical events affected specific currency pairs. Pattern recognition across decades of macro events with statistical significance testing. Regime classification (pre-event, acute, recovery) with measured FX impact at each phase. Cross-event correlation analysis identifying which types of political events produce correlated currency movements. AI surfaces historical analogues to current events and quantifies how similar your current exposure is to historical episodes." },
  { icon: <AlertTriangle size={20} />, title: "Early Warning System", desc: "AI-powered monitoring of leading indicators for geopolitical risk escalation: diplomatic communications sentiment, sanctions pipeline tracking, military deployment patterns, trade flow disruptions, and capital flow reversals. Alerts are calibrated to your portfolio sensitivity -- an event that affects currencies you hold triggers at lower thresholds than events affecting currencies outside your exposure. Multi-channel delivery via terminal, email, and voice." },
  { icon: <Eye size={20} />, title: "Scenario Integration", desc: "Geopolitical scenarios link directly to the Labs scenario studio. Pre-built geopolitical stress tests for each corridor with configurable severity levels. Compound scenarios combining geopolitical shocks with market stress (e.g., sanctions + liquidity freeze + counterparty default). AI designs geopolitical stress scenarios based on current risk landscape and your portfolio composition." },
];

export default function PolisophicPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>ORDR Polisophic</h1>
        <p style={{ fontFamily: F.ui, fontSize: 20, color: C.textSub, maxWidth: 700, margin: "0 auto 12px", lineHeight: 1.6 }}>
          AI-Powered Geopolitical Intelligence for Currency Risk
        </p>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 650, margin: "0 auto 32px", lineHeight: 1.7 }}>
          Corridor scoring, event tracking, and country risk profiles with AI-driven interpretation.
          Political risk is quantified deterministically; the AI explains causality, identifies patterns, and translates geopolitical events into actionable hedge intelligence.
        </p>
        <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Request Demo <ArrowRight size={16} />
        </Link>
      </section>

      {/* Stats */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div className="stats-row" style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", gap: 48 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 24, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Corridor Scoring Diagram */}
      <section style={{ padding: "80px 48px 40px", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Corridor Scoring Flow</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 32px", lineHeight: 1.7, maxWidth: 700 }}>
          Geopolitical events are captured, scored, interpreted by AI, and fed into the deterministic hedge engine as policy overlays.
        </p>
        <svg viewBox="0 0 800 310" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
          {/* Geopolitical Events */}
          <rect x="20" y="30" width="160" height="250" rx="8" fill="#0C0C0C" />
          <text x="100" y="58" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="rgba(255,255,255,0.7)" textAnchor="middle">GLOBAL EVENTS</text>
          {["Elections", "Sanctions", "Trade Deals", "Central Banks", "Conflicts", "Regulation"].map((ev, i) => (
            <g key={ev}>
              <rect x="35" y={72 + i * 32} width="130" height="24" rx="4" fill="rgba(255,255,255,0.08)" />
              <text x="100" y={88 + i * 32} fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="rgba(255,255,255,0.6)" textAnchor="middle">{ev}</text>
            </g>
          ))}

          {/* Corridor Scoring */}
          <rect x="220" y="60" width="160" height="190" rx="8" fill="#1E3A5F" />
          <text x="300" y="88" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#FFFFFF" textAnchor="middle">CORRIDOR</text>
          <text x="300" y="104" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#FFFFFF" textAnchor="middle">SCORING</text>
          {["Risk Factors", "Vol Adjustment", "Ratio Modifier", "Severity Level"].map((item, i) => (
            <g key={item}>
              <rect x="235" y={118 + i * 30} width="130" height="22" rx="3" fill="rgba(255,255,255,0.12)" />
              <text x="300" y={133 + i * 30} fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="rgba(255,255,255,0.7)" textAnchor="middle">{item}</text>
            </g>
          ))}

          {/* AI Interpretation */}
          <rect x="420" y="60" width="160" height="190" rx="8" fill="rgba(30,58,95,0.06)" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="4 2" />
          <text x="500" y="88" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" textAnchor="middle">AI LAYER</text>
          {["Causal Analysis", "Pattern Matching", "Impact Narrative", "Alert Generation", "Recommendations"].map((item, i) => (
            <g key={item}>
              <text x="500" y={118 + i * 28} fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#1E3A5F" textAnchor="middle">{item}</text>
            </g>
          ))}

          {/* Hedge Engine */}
          <rect x="620" y="90" width="160" height="130" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="700" y="118" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#111" textAnchor="middle">HEDGE ENGINE</text>
          <text x="700" y="142" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#555" textAnchor="middle">L3 Overlay Applied</text>
          <text x="700" y="162" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#555" textAnchor="middle">Vol Adjusted</text>
          <text x="700" y="182" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#555" textAnchor="middle">Ratios Modified</text>
          <text x="700" y="202" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#555" textAnchor="middle">Deterministic Output</text>

          {/* Arrows */}
          <line x1="180" y1="155" x2="218" y2="155" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" markerEnd="url(#arrPo)" />
          <line x1="380" y1="155" x2="418" y2="155" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrPo2)" />
          <line x1="580" y1="155" x2="618" y2="155" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrPo3)" />

          <defs>
            <marker id="arrPo" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="rgba(255,255,255,0.3)" /></marker>
            <marker id="arrPo2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#1E3A5F" /></marker>
            <marker id="arrPo3" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#E5E7EB" /></marker>
          </defs>
        </svg>
      </section>

      {/* Capabilities */}
      <section style={{ padding: "40px 48px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 48px", color: C.text }}>Capabilities</h2>
        <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ color: C.accent }}>{f.icon}</div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text }}>{f.title}</div>
              </div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Overlay Activation Notice */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "56px 48px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div style={{ color: C.accent, flexShrink: 0, marginTop: 2 }}><AlertTriangle size={24} /></div>
          <div>
            <div style={{ fontFamily: F.ui, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Governance-Controlled Activation</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
              The geopolitical overlay is neutralized by default. Activation requires explicit governance approval based on your configured
              governance tier thresholds. When activated, corridor scores modify the deterministic engine&apos;s vol assumptions and hedge ratio
              targets -- but the engine itself remains deterministic. The AI recommends activation windows but cannot activate overlays autonomously.
              All activation events are WORM-logged with SHA-256 hash chain verification.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Quantify geopolitical risk</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>AI-interpreted corridor scoring, event tracking, and macro overlay integration.</p>
        <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Request Demo <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`@media(max-width:768px){
        .feat-grid { grid-template-columns: 1fr !important; }
        .stats-row { flex-wrap: wrap; gap: 24px !important; }
      }`}</style>
    </MarketingLayout>
  );
}
