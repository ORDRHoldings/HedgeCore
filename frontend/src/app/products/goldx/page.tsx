"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Coins, Shield, Zap, Globe, FileText, TrendingUp,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const GOLD = "#B8860B";

const STATS = [
  { v: "1:1", l: "Gold Backing" },
  { v: "100%", l: "Audited" },
  { v: "XAU", l: "Settlement" },
  { v: "T+0", l: "Redemption" },
  { v: "DeFi", l: "Compatible" },
  { v: "ISO 4217", l: "Compliant" },
];

const FEATURES = [
  {
    icon: <Coins size={20} />,
    title: "Physical Backing",
    desc: "Every GOLDX token represents 0.001 troy ounces of .999 fine gold stored in insured, segregated vaults. Physical redemption available.",
  },
  {
    icon: <Shield size={20} />,
    title: "Fully Audited",
    desc: "Quarterly independent vault audits by Big Four firm. Proof-of-reserves published on-chain. Real-time vault balance queryable via API.",
  },
  {
    icon: <Zap size={20} />,
    title: "Instant Transfer",
    desc: "Move gold globally in seconds. No SWIFT delays, no correspondent banking. Blockchain settlement with institutional-grade finality.",
  },
  {
    icon: <Globe size={20} />,
    title: "DeFi Compatible",
    desc: "ERC-20 compatible. Works with major DeFi protocols for lending, yield generation, and collateralization while maintaining gold backing.",
  },
  {
    icon: <FileText size={20} />,
    title: "Regulatory Compliant",
    desc: "ISO 4217 compliant denomination. FATF-aligned AML/KYC. Available in jurisdictions with digital asset frameworks.",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "Yield Opportunities",
    desc: "Lend your GOLDX to institutional borrowers via the ORDR platform for yield while maintaining full redemption rights.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Deposit Fiat or Crypto",
    desc: "Transfer USD, EUR, BTC, or ETH to the GOLDX platform. Instant conversion at live XAU/USD spot rate.",
  },
  {
    step: "02",
    title: "Receive GOLDX Tokens",
    desc: "GOLDX tokens minted to your wallet at T+0. Each token backed by physical gold purchased and allocated to your account.",
  },
  {
    step: "03",
    title: "Use Across ORDR",
    desc: "Use GOLDX as collateral in ORDR Treasury, earn yield via ORDR Fund, or hold as a stable store of value across the ecosystem.",
  },
  {
    step: "04",
    title: "Redeem Anytime",
    desc: "Convert back to fiat at live gold spot price, or request physical delivery. No lock-ups. No notice period. Your gold, your terms.",
  },
];

const INTEGRATIONS = [
  {
    product: "ORDR Treasury",
    desc: "Use GOLDX as FX hedge collateral. Gold-denominated positions for emerging market currency exposure.",
  },
  {
    product: "ORDR Fund",
    desc: "Gold allocation in pooled fund structures. Pro-rata GOLDX distribution to LPs.",
  },
  {
    product: "ORDR Market",
    desc: "Trade XAU/USD and GOLDX pairs. AI-analyzed gold market charts with correlation to DXY and real rates.",
  },
];

// SVG chart data: 13 points for Mar'25 through Mar'26
// Realistic gold price path
const CHART_POINTS = [
  { month: "Mar'25", price: 2180 },
  { month: "Apr",    price: 2120 },
  { month: "May",    price: 2080 },
  { month: "Jun",    price: 2050 },
  { month: "Jul",    price: 2110 },
  { month: "Aug",    price: 2220 },
  { month: "Sep",    price: 2390 },
  { month: "Oct",    price: 2650 },
  { month: "Nov",    price: 2720 },
  { month: "Dec",    price: 2800 },
  { month: "Jan'26", price: 2870 },
  { month: "Feb",    price: 2920 },
  { month: "Mar'26", price: 2980 },
];

const Y_LABELS = [1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2900, 3000];
const CHART_W = 900;
const CHART_H = 320;
const PAD_L = 72;
const PAD_R = 24;
const PAD_T = 24;
const PAD_B = 48;
const Y_MIN = 1800;
const Y_MAX = 3000;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function priceToY(price: number): number {
  return PAD_T + PLOT_H - ((price - Y_MIN) / (Y_MAX - Y_MIN)) * PLOT_H;
}

function idxToX(i: number): number {
  return PAD_L + (i / (CHART_POINTS.length - 1)) * PLOT_W;
}

const linePoints = CHART_POINTS.map((p, i) => `${idxToX(i)},${priceToY(p.price)}`).join(" ");
const areaPoints =
  `${PAD_L},${PAD_T + PLOT_H} ` +
  CHART_POINTS.map((p, i) => `${idxToX(i)},${priceToY(p.price)}`).join(" ") +
  ` ${PAD_L + PLOT_W},${PAD_T + PLOT_H}`;

// Tokenomics donut: using stroke-dasharray on a circle r=100, circumference=628.3
const DONUT_CX = 150;
const DONUT_CY = 150;
const DONUT_R = 100;
const DONUT_CIRC = 2 * Math.PI * DONUT_R; // ~628.3

const SEGMENTS = [
  { pct: 0.70, color: GOLD,      label: "Physical Gold Reserves", labelColor: GOLD },
  { pct: 0.15, color: "#1E3A5F", label: "Operational Reserve",    labelColor: "#1E3A5F" },
  { pct: 0.10, color: "#0F766E", label: "Liquidity Pool",         labelColor: "#0F766E" },
  { pct: 0.05, color: "#6B7280", label: "Development Fund",       labelColor: "#6B7280" },
];

// Build stroke-dasharray offsets
let cumPct = 0;
const donutRings = SEGMENTS.map((seg) => {
  const dash = seg.pct * DONUT_CIRC;
  const gap = DONUT_CIRC - dash;
  // rotate so segment starts at top (-90deg = -DONUT_CIRC/4 offset)
  const offset = -(cumPct * DONUT_CIRC) + DONUT_CIRC / 4;
  cumPct += seg.pct;
  return { ...seg, dash, gap, offset };
});

const VAULT_DATA = [
  { label: "Total Supply",    value: "10,000,000 GOLDX" },
  { label: "Circulating",     value: "3,847,291 GOLDX" },
  { label: "Gold in Vault",   value: "3,847.29 troy oz" },
  { label: "Vault Location",  value: "Zurich / Singapore / New York" },
  { label: "Last Audit",      value: "2026-Q1" },
  { label: "Custodian",       value: "Third-party independent" },
];

export default function GoldXPage() {
  return (
    <MarketingLayout>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link
          href="/products"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: F.mono, fontSize: 12, color: C.textMuted,
            textDecoration: "none", marginBottom: 24,
          }}
        >
          <ChevronLeft size={14} /> All Products
        </Link>

        <div style={{
          display: "inline-block", fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.15em", color: GOLD, textTransform: "uppercase",
          marginBottom: 20,
        }}>
          [GOLDX · GOLD-BACKED DIGITAL ASSET]
        </div>

        <h1 style={{
          fontFamily: F.heading, fontSize: 48, fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.1,
          margin: "0 0 20px", color: C.text,
        }}>
          GOLDX — Digital Gold, Physical Backing
        </h1>

        <p style={{
          fontFamily: F.ui, fontSize: 17, color: C.textSub,
          maxWidth: 680, margin: "0 auto 32px", lineHeight: 1.7,
        }}>
          Every GOLDX token is backed 1:1 by physical gold held in audited vaults.
          The transparency of blockchain, the security of gold.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="https://goldx-sandy.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: "#fff", background: GOLD,
              padding: "12px 28px", borderRadius: 6, textDecoration: "none",
            }}
          >
            Explore GOLDX <ArrowRight size={16} />
          </a>
          <Link
            href="/products"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: C.text, border: `1px solid ${C.border}`,
              padding: "12px 28px", borderRadius: 6, textDecoration: "none",
            }}
          >
            ORDR Ecosystem
          </Link>
        </div>
      </section>

      {/* ── Stats Strip ──────────────────────────────────────────────────── */}
      <section style={{
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        background: C.bgAlt,
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)",
        }}>
          {STATS.map((s, i) => (
            <div
              key={s.l}
              style={{
                padding: "32px 16px", textAlign: "center",
                borderRight: i < 5 ? `1px solid ${C.border}` : "none",
                transition: "border-color 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = GOLD;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor =
                  i < 5 ? C.border : "transparent";
              }}
            >
              <div style={{
                fontFamily: F.mono, fontSize: 26, fontWeight: 800,
                color: GOLD, marginBottom: 4,
              }}>
                {s.v}
              </div>
              <div style={{
                fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.12em", color: C.textMuted, textTransform: "uppercase",
              }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Gold Price Chart ─────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.15em", color: C.textMuted,
          textTransform: "uppercase", marginBottom: 12,
        }}>
          GOLD MARKET DATA
        </div>
        <h2 style={{
          fontFamily: F.heading, fontSize: 32, fontWeight: 800,
          margin: "0 0 12px", color: C.text,
        }}>
          Gold Spot Price — 12 Month History (XAU/USD)
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textSub,
          margin: "0 0 36px", lineHeight: 1.7, maxWidth: 640,
        }}>
          GOLDX token value tracks XAU/USD in real time. Live gold prices sourced from institutional feeds.
        </p>

        <div style={{
          background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "24px 16px 16px",
          boxShadow: C.cardShadow,
        }}>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: "100%", height: "auto" }}
          >
            {/* Grid lines */}
            {Y_LABELS.map((y) => {
              const cy = priceToY(y);
              return (
                <g key={y}>
                  <line
                    x1={PAD_L} y1={cy} x2={PAD_L + PLOT_W} y2={cy}
                    stroke="#F0F0F4" strokeWidth="1"
                  />
                  <text
                    x={PAD_L - 8} y={cy + 4}
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize="9" fill="#AAAAAA" textAnchor="end"
                  >
                    ${y.toLocaleString()}
                  </text>
                </g>
              );
            })}

            {/* Vertical grid lines */}
            {CHART_POINTS.map((p, i) => {
              const cx = idxToX(i);
              return (
                <line
                  key={p.month}
                  x1={cx} y1={PAD_T} x2={cx} y2={PAD_T + PLOT_H}
                  stroke="#F0F0F4" strokeWidth="1"
                />
              );
            })}

            {/* Area fill */}
            <polygon points={areaPoints} fill="rgba(184,134,11,0.08)" />

            {/* Price line */}
            <polyline
              points={linePoints}
              stroke={GOLD}
              strokeWidth="2.5"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Data point dots */}
            {CHART_POINTS.map((p, i) => (
              <circle
                key={`dot-${p.month}`}
                cx={idxToX(i)}
                cy={priceToY(p.price)}
                r="3"
                fill={GOLD}
              />
            ))}

            {/* X-axis labels */}
            {CHART_POINTS.map((p, i) => (
              <text
                key={`lbl-${p.month}`}
                x={idxToX(i)}
                y={PAD_T + PLOT_H + 18}
                fontFamily="IBM Plex Mono, monospace"
                fontSize="9" fill="#999999" textAnchor="middle"
              >
                {p.month}
              </text>
            ))}

            {/* Current price badge */}
            <rect
              x={idxToX(CHART_POINTS.length - 1) - 80}
              y={priceToY(2980) - 30}
              width={160} height={24}
              rx="4" fill={GOLD}
            />
            <text
              x={idxToX(CHART_POINTS.length - 1)}
              y={priceToY(2980) - 13}
              fontFamily="IBM Plex Mono, monospace"
              fontSize="10" fontWeight="700"
              fill="#FFFFFF" textAnchor="middle"
            >
              XAU/USD  $2,987.40
            </text>

            {/* Change label */}
            <rect
              x={PAD_L + 8}
              y={PAD_T + 8}
              width={110} height={22}
              rx="4" fill="rgba(16,185,129,0.12)"
            />
            <text
              x={PAD_L + 63}
              y={PAD_T + 23}
              fontFamily="IBM Plex Mono, monospace"
              fontSize="10" fontWeight="700"
              fill="#059669" textAnchor="middle"
            >
              +37.2% / 12M
            </text>
          </svg>

          {/* Data strip below chart */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            borderTop: `1px solid ${C.border}`, marginTop: 8,
          }}>
            {[
              { label: "Current", value: "$2,987.40" },
              { label: "52W High", value: "$3,004.80" },
              { label: "52W Low",  value: "$2,041.20" },
              { label: "YTD",      value: "+18.4%" },
            ].map((d, i) => (
              <div
                key={d.label}
                style={{
                  padding: "16px 20px",
                  borderRight: i < 3 ? `1px solid ${C.border}` : "none",
                  textAlign: "center",
                }}
              >
                <div style={{
                  fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.1em", color: C.textMuted,
                  textTransform: "uppercase", marginBottom: 4,
                }}>
                  {d.label}
                </div>
                <div style={{
                  fontFamily: F.mono, fontSize: 16, fontWeight: 800,
                  color: d.label === "YTD" ? "#059669" : C.text,
                }}>
                  {d.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tokenomics ───────────────────────────────────────────────────── */}
      <section style={{
        background: C.bgAlt,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "80px 48px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.15em", color: C.textMuted,
            textTransform: "uppercase", marginBottom: 12,
          }}>
            TOKENOMICS
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 800,
            margin: "0 0 48px", color: C.text,
          }}>
            Token Distribution &amp; Treasury Backing
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>

            {/* Donut chart */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
              <svg
                viewBox="0 0 300 300"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ width: "100%", maxWidth: 280, height: "auto" }}
              >
                {/* Background circle */}
                <circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R} stroke="#E5E7EB" strokeWidth="36" fill="none" />

                {/* Segment rings */}
                {donutRings.map((seg) => (
                  <circle
                    key={seg.label}
                    cx={DONUT_CX}
                    cy={DONUT_CY}
                    r={DONUT_R}
                    stroke={seg.color}
                    strokeWidth="36"
                    fill="none"
                    strokeDasharray={`${seg.dash} ${seg.gap}`}
                    strokeDashoffset={seg.offset}
                    strokeLinecap="butt"
                  />
                ))}

                {/* Center label */}
                <text
                  x={DONUT_CX} y={DONUT_CY - 8}
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize="18" fontWeight="800"
                  fill={GOLD} textAnchor="middle"
                >
                  GOLDX
                </text>
                <text
                  x={DONUT_CX} y={DONUT_CY + 12}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fontSize="10"
                  fill="#999999" textAnchor="middle"
                >
                  Tokenomics
                </text>
              </svg>

              {/* Legend */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 280 }}>
                {SEGMENTS.map((seg) => (
                  <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: 2,
                      background: seg.color, flexShrink: 0,
                    }} />
                    <div style={{
                      fontFamily: F.ui, fontSize: 13, color: C.textSub, flex: 1,
                    }}>
                      {seg.label}
                    </div>
                    <div style={{
                      fontFamily: F.mono, fontSize: 13, fontWeight: 700,
                      color: seg.labelColor,
                    }}>
                      {Math.round(seg.pct * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vault data table */}
            <div style={{
              background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 8, overflow: "hidden",
              boxShadow: C.cardShadow,
            }}>
              <div style={{
                padding: "16px 24px",
                borderBottom: `1px solid ${C.border}`,
                background: `rgba(184,134,11,0.04)`,
              }}>
                <div style={{
                  fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.12em", color: GOLD, textTransform: "uppercase",
                }}>
                  VAULT &amp; SUPPLY DATA
                </div>
              </div>
              <div style={{ padding: "8px 0" }}>
                {VAULT_DATA.map((row, i) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", padding: "14px 24px",
                      borderBottom: i < VAULT_DATA.length - 1 ? `1px solid ${C.border}` : "none",
                    }}
                  >
                    <div style={{
                      fontFamily: F.ui, fontSize: 13, color: C.textMuted,
                    }}>
                      {row.label}
                    </div>
                    <div style={{
                      fontFamily: F.mono, fontSize: 13, fontWeight: 700,
                      color: C.text, textAlign: "right", maxWidth: "55%",
                    }}>
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.15em", color: C.textMuted,
          textTransform: "uppercase", marginBottom: 12,
        }}>
          FEATURES
        </div>
        <h2 style={{
          fontFamily: F.heading, fontSize: 32, fontWeight: 800,
          margin: "0 0 48px", color: C.text,
        }}>
          Gold ownership, reimagined
        </h2>

        <div className="goldx-feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                padding: "28px 24px", border: `1px solid ${C.border}`,
                borderRadius: 8, background: C.bg,
              }}
            >
              <div style={{ color: GOLD, marginBottom: 14 }}>{f.icon}</div>
              <div style={{
                fontFamily: F.ui, fontSize: 15, fontWeight: 700,
                color: C.text, marginBottom: 10,
              }}>
                {f.title}
              </div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section style={{ background: C.bgDark, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.15em", color: C.textMuted,
            textTransform: "uppercase", marginBottom: 12,
          }}>
            HOW IT WORKS
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 800,
            margin: "0 0 48px", color: "#FFFFFF",
          }}>
            From fiat to gold in four steps
          </h2>

          <div className="goldx-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {HOW_IT_WORKS.map((step) => (
              <div
                key={step.step}
                style={{
                  background: "#111111",
                  borderLeft: `4px solid ${GOLD}`,
                  borderRadius: 6,
                  padding: "28px 28px",
                }}
              >
                <div style={{
                  fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                  color: GOLD, letterSpacing: "0.15em",
                  textTransform: "uppercase", marginBottom: 10,
                }}>
                  Step {step.step}
                </div>
                <div style={{
                  fontFamily: F.ui, fontSize: 16, fontWeight: 700,
                  color: "#FFFFFF", marginBottom: 10,
                }}>
                  {step.title}
                </div>
                <p style={{
                  fontFamily: F.ui, fontSize: 13,
                  color: "rgba(255,255,255,0.55)",
                  lineHeight: 1.7, margin: 0,
                }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ORDR Ecosystem Integration ───────────────────────────────────── */}
      <section style={{
        background: C.bgAlt,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "80px 48px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 800,
            margin: "0 0 48px", color: C.text, textAlign: "center",
          }}>
            GOLDX across the ORDR ecosystem
          </h2>

          <div className="goldx-int-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {INTEGRATIONS.map((item) => (
              <div
                key={item.product}
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "28px 24px",
                  boxShadow: C.cardShadow,
                }}
              >
                <div style={{
                  fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                  color: GOLD, letterSpacing: "0.12em",
                  textTransform: "uppercase", marginBottom: 10,
                }}>
                  {item.product}
                </div>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.7, margin: 0,
                }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section style={{
        background: C.bg, borderTop: `1px solid ${C.border}`,
        padding: "80px 48px", textAlign: "center",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 36, fontWeight: 800,
          margin: "0 0 16px", color: C.text,
        }}>
          Own real gold, on-chain
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: C.textSub,
          margin: "0 auto 32px", maxWidth: 520, lineHeight: 1.7,
        }}>
          GOLDX — the simplest way to hold gold in the digital age.
        </p>
        <a
          href="https://goldx-sandy.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: "#fff", background: GOLD,
            padding: "14px 32px", borderRadius: 6, textDecoration: "none",
          }}
        >
          Explore GOLDX <ArrowRight size={16} />
        </a>
      </section>

      <style>{`
        @media (max-width: 768px) {
          .goldx-feat-grid  { grid-template-columns: 1fr !important; }
          .goldx-steps-grid { grid-template-columns: 1fr !important; }
          .goldx-int-grid   { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </MarketingLayout>
  );
}
