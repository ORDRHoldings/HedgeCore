"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import {
  Building2, ShieldAlert, BarChart3, Landmark, Umbrella, Flame,
  ArrowRight, Shield, Zap, Globe, BookOpen, Activity, TrendingUp,
} from "lucide-react";

const SOLUTIONS = [
  {
    slug: "corporate-treasury",
    name: "Corporate Treasury",
    tagline: "End-to-end FX exposure governance for CFOs and treasury teams.",
    metric: "96.2% hedge effectiveness",
    metricSub: "across 24-position live book",
    products: ["ORDR Treasury", "ORDR Labs", "ORDR HedgeWiki"],
    productIcons: [Shield, Zap, BookOpen],
    stats: [
      { val: "<50ms", label: "Calculation time" },
      { val: "60+", label: "Policy presets" },
      { val: "4-eyes", label: "Approval workflow" },
      { val: "WORM", label: "Audit trail" },
    ],
    terminal: [
      { label: "EUR/USD · Forward · 3M", val: "Hedge: $12.4M", color: "#22C55E" },
      { label: "GBP/USD · Option · 6M", val: "Hedge: $8.7M",  color: "#22C55E" },
      { label: "JPY/USD · Collar · 3M", val: "Hedge: $5.2M",  color: "#F59E0B" },
      { label: "Effectiveness", val: "96.2%  ✓ IFRS 9",       color: "#60A5FA" },
    ],
    icon: Building2,
  },
  {
    slug: "risk-management",
    name: "Risk Management",
    tagline: "R1-R8 risk decomposition with geopolitical overlay across 190+ corridors.",
    metric: "8-factor risk taxonomy",
    metricSub: "VaR · ES · concentration · HHI",
    products: ["ORDR Treasury", "ORDR Labs", "ORDR Polisophic"],
    productIcons: [Shield, Zap, Globe],
    stats: [
      { val: "R1–R8", label: "Risk taxonomy" },
      { val: "95%", label: "Confidence VaR" },
      { val: "190+", label: "Geopolitical corridors" },
      { val: "Monte Carlo", label: "Scenario engine" },
    ],
    terminal: [
      { label: "Directional (R1)",    val: "VaR $2.1M",   color: "#F87171" },
      { label: "Basis (R2)",          val: "ES  $0.4M",   color: "#F87171" },
      { label: "Concentration HHI",   val: "0.231 MOD",  color: "#F59E0B" },
      { label: "Polisophic EUR/TRY",  val: "Score: 74 HIGH", color: "#EF4444" },
    ],
    icon: ShieldAlert,
  },
  {
    slug: "asset-management",
    name: "Asset Management",
    tagline: "Pooled capital governance, pro-rata allocation, and dual-portal LP reporting.",
    metric: "4-minute LP report",
    metricSub: "multi-currency, dual portal",
    products: ["ORDR Fund", "ORDR Portfolio", "ORDR Journal"],
    productIcons: [TrendingUp, BarChart3, Activity],
    stats: [
      { val: "$245M", label: "AUM tracked" },
      { val: "14", label: "Currencies supported" },
      { val: "Pro-rata", label: "Allocation engine" },
      { val: "Dual portal", label: "GP + LP views" },
    ],
    terminal: [
      { label: "Fund I · Q1 2026",    val: "NAV $47.3M",   color: "#22C55E" },
      { label: "FX Attribution",       val: "–$312K EUR",   color: "#F87171" },
      { label: "Carried Interest",     val: "$1.84M accrued", color: "#60A5FA" },
      { label: "Report generated",     val: "3m 47s  ✓",   color: "#22C55E" },
    ],
    icon: BarChart3,
  },
  {
    slug: "banking",
    name: "Banking & Trading",
    tagline: "Institutional trading infrastructure with AI-coached discipline and compliance-grade governance.",
    metric: "60fps live charting",
    metricSub: "algorithmic + discretionary desks",
    products: ["ORDR Market", "ORDR Journal", "ORDR FinHub"],
    productIcons: [Landmark, Activity, Activity],
    stats: [
      { val: "60fps", label: "Chart rendering" },
      { val: "77+", label: "Technical indicators" },
      { val: "219+", label: "Data sources" },
      { val: "SHA-256", label: "Trade audit chain" },
    ],
    terminal: [
      { label: "EUR/USD · EMA(9/21)",  val: "LONG signal",  color: "#22C55E" },
      { label: "Win rate (90d)",       val: "67.3%",        color: "#22C55E" },
      { label: "Profit factor",        val: "1.84",         color: "#60A5FA" },
      { label: "AI Coach",            val: "\"Hold — trend intact\"", color: "#A78BFA" },
    ],
    icon: Landmark,
  },
  {
    slug: "insurance",
    name: "Insurance & ALM",
    tagline: "Long-dated liability matching with Solvency II capital modeling and IFRS 9 effectiveness tests.",
    metric: "103.2% funded ratio",
    metricSub: "after 25% GBP shock scenario",
    products: ["ORDR Treasury", "ORDR Labs", "ORDR HedgeWiki"],
    productIcons: [Shield, Zap, BookOpen],
    stats: [
      { val: "5yr+", label: "Tenor ALM buckets" },
      { val: "Solvency II", label: "SCR shock modeling" },
      { val: "IFRS 9", label: "Effectiveness testing" },
      { val: "WORM", label: "Regulatory audit" },
    ],
    terminal: [
      { label: "GBP Liability · 5yr",  val: "£185M notional", color: "#60A5FA" },
      { label: "CCS · 3yr hedge",      val: "£95M",           color: "#22C55E" },
      { label: "SCR 25% shock",        val: "Funded: 103.2%", color: "#22C55E" },
      { label: "IFRS 9 test",          val: "✓ PASS 97.1%",   color: "#22C55E" },
    ],
    icon: Umbrella,
  },
  {
    slug: "energy",
    name: "Energy & Commodities",
    tagline: "Commodity-linked FX hedging with geopolitical corridor intelligence from ORDR Polisophic.",
    metric: "0.73 USD/Brent correlation",
    metricSub: "live cross-commodity FX overlay",
    products: ["ORDR Polisophic", "ORDR Treasury", "ORDR Labs"],
    productIcons: [Globe, Shield, Zap],
    stats: [
      { val: "WTI/Brent", label: "Commodity overlay" },
      { val: "190+", label: "Geopolitical corridors" },
      { val: "0.73", label: "USD/Brent correlation" },
      { val: "SHA-256", label: "Hedge audit chain" },
    ],
    terminal: [
      { label: "USD/SAR corridor",    val: "Score: 41 LOW",  color: "#22C55E" },
      { label: "USD/NOK · Brent link", val: "Score: 63 MOD", color: "#F59E0B" },
      { label: "USD/CAD · crude",     val: "Hedge: $18.4M",  color: "#22C55E" },
      { label: "Polisophic alert",    val: "MENA event +2",  color: "#F87171" },
    ],
    icon: Flame,
  },
];

const PLATFORM_STATS = [
  { val: "<50ms", label: "Hedge calculation" },
  { val: "41", label: "Engine modules" },
  { val: "60+", label: "Policy presets" },
  { val: "R1–R8", label: "Risk taxonomy" },
  { val: "190+", label: "Geo corridors" },
  { val: "SHA-256", label: "WORM audit" },
  { val: "4-eyes", label: "Governance" },
  { val: "IFRS 9", label: "Effectiveness" },
];

export default function SolutionsPage() {
  const isMobile = useIsMobile();
  return (
    <MarketingLayout>

      {/* Hero */}
      <section style={{
        padding: `100px ${isMobile ? 24 : 48}px 64px`,
        textAlign: "center",
        background: C.bg,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.12em", color: C.accent,
            marginBottom: 16, textTransform: "uppercase",
          }}>
            ORDR TERMINAL — ENTERPRISE SOLUTIONS
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: 54, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 20px",
            color: C.accent,
          }}>
            Six Industries.<br />One Deterministic Platform.
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: 18, color: C.textSub,
            maxWidth: 620, margin: "0 auto 0", lineHeight: 1.7,
          }}>
            Every ORDR solution runs on the same frozen computation kernel, the same
            WORM audit chain, and the same governance framework — configured for your
            sector&apos;s specific regulatory requirements and risk profile.
          </p>
        </div>
      </section>

      {/* Platform Stats Strip */}
      <section style={{
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        background: "#F9FAFB",
        padding: `0 ${isMobile ? 24 : 48}px`,
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "flex", flexWrap: "wrap",
          justifyContent: "space-between",
        }}>
          {PLATFORM_STATS.map((s) => (
            <div key={s.label} style={{
              padding: "20px 12px", textAlign: "center", flex: "1 0 120px",
            }}>
              <div style={{
                fontFamily: F.mono, fontSize: 18, fontWeight: 700,
                color: C.accent, marginBottom: 4,
              }}>{s.val}</div>
              <div style={{
                fontFamily: F.ui, fontSize: 11, color: C.textMuted,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Solutions Grid */}
      <section style={{ padding: `80px ${isMobile ? 24 : 48}px`, maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: 24,
        }}>
          {SOLUTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.slug}
                href={`/solutions/${s.slug}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  background: "#fff",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  overflow: "hidden",
                  transition: "box-shadow 0.15s ease",
                }}
              >
                {/* Card header */}
                <div style={{ padding: "28px 28px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 8,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: C.accentLight, color: C.accent, flexShrink: 0,
                    }}>
                      <Icon size={20} strokeWidth={1.5} />
                    </div>
                    <div>
                      <div style={{
                        fontFamily: F.heading, fontSize: 18, fontWeight: 700,
                        color: C.text, lineHeight: 1.2,
                      }}>{s.name}</div>
                      <div style={{
                        fontFamily: F.mono, fontSize: 10, color: C.accent,
                        fontWeight: 600, letterSpacing: "0.08em",
                        textTransform: "uppercase", marginTop: 2,
                      }}>{s.metric}</div>
                    </div>
                  </div>
                  <p style={{
                    fontFamily: F.ui, fontSize: 13, color: C.textSub,
                    lineHeight: 1.65, margin: "0 0 16px",
                  }}>{s.tagline}</p>

                  {/* Mini stats row */}
                  <div style={{
                    display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16,
                  }}>
                    {s.stats.map((st) => (
                      <div key={st.label} style={{
                        background: "#F9FAFB", border: `1px solid ${C.border}`,
                        borderRadius: 4, padding: "4px 10px", textAlign: "center",
                      }}>
                        <div style={{
                          fontFamily: F.mono, fontSize: 12, fontWeight: 700,
                          color: C.accent,
                        }}>{st.val}</div>
                        <div style={{
                          fontFamily: F.ui, fontSize: 10, color: C.textMuted,
                          textTransform: "uppercase", letterSpacing: "0.04em",
                        }}>{st.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Terminal panel */}
                <div style={{
                  background: "#111827",
                  padding: "16px 20px",
                  borderTop: `1px solid ${C.border}`,
                }}>
                  <div style={{
                    fontFamily: F.mono, fontSize: 10, fontWeight: 600,
                    color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em",
                    textTransform: "uppercase", marginBottom: 8,
                  }}>
                    SAMPLE OUTPUT
                  </div>
                  {s.terminal.map((row, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", padding: "3px 0",
                      borderBottom: i < s.terminal.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    }}>
                      <span style={{
                        fontFamily: F.mono, fontSize: 11, color: "rgba(255,255,255,0.45)",
                      }}>{row.label}</span>
                      <span style={{
                        fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                        color: row.color,
                      }}>{row.val}</span>
                    </div>
                  ))}
                </div>

                {/* Products used + CTA */}
                <div style={{
                  padding: "14px 20px",
                  borderTop: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#FAFAFA",
                }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {s.products.map((p) => (
                      <span key={p} style={{
                        fontFamily: F.mono, fontSize: 10, fontWeight: 600,
                        color: C.accent, background: C.accentLight,
                        border: `1px solid rgba(30,58,95,0.15)`,
                        borderRadius: 3, padding: "2px 7px",
                        letterSpacing: "0.04em",
                      }}>{p}</span>
                    ))}
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontFamily: F.ui, fontSize: 12, fontWeight: 600, color: C.accent,
                  }}>
                    Explore <ArrowRight size={12} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Architecture diagram */}
      <section style={{ background: C.bgAlt, padding: `80px ${isMobile ? 24 : 48}px` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              fontFamily: F.mono, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.1em", color: C.textMuted,
              marginBottom: 12, textTransform: "uppercase",
            }}>
              PLATFORM ARCHITECTURE
            </div>
            <h2 style={{
              fontFamily: F.heading, fontSize: 40, fontWeight: 800,
              letterSpacing: "-0.02em", margin: "0 0 16px", color: C.accent,
            }}>
              Same engine. Every sector.
            </h2>
            <p style={{
              fontFamily: F.ui, fontSize: 16, color: C.textSub,
              maxWidth: 620, margin: "0 auto", lineHeight: 1.7,
            }}>
              AI interprets and communicates results. The deterministic kernel computes them.
              Governance wraps everything. No layer can override another.
            </p>
          </div>

          <svg viewBox="0 0 1000 500" width="100%" style={{ display: "block" }}>
            <defs>
              <marker id="arr" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
              </marker>
            </defs>

            {/* Industry Solutions Layer */}
            <rect x="40" y="40" width="920" height="80" rx="6" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
            <text x="500" y="62" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fontWeight="600" fill="#9CA3AF" letterSpacing="0.12em">
              INDUSTRY SOLUTIONS
            </text>
            {["Corporate Treasury", "Risk Management", "Asset Management", "Banking", "Insurance", "Energy"].map((label, i) => (
              <g key={label}>
                <rect x={57 + i * 150} y="72" width="136" height="34" rx="5" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
                <text x={125 + i * 150} y="93" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="600" fill="#1E3A5F">
                  {label}
                </text>
              </g>
            ))}

            <line x1="500" y1="120" x2="500" y2="150" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arr)" />

            {/* Agentic AI Layer */}
            <rect x="120" y="155" width="760" height="90" rx="6" fill="#1E3A5F" />
            <text x="500" y="178" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fontWeight="600" fill="rgba(255,255,255,0.5)" letterSpacing="0.12em">
              AGENTIC AI LAYER — INTERPRETS · COMMUNICATES · NEVER OVERRIDES
            </text>
            {["Risk Assistant", "Market Coach AI", "Anomaly Detection", "Voice / Chat / Phone"].map((label, i) => (
              <g key={label}>
                <rect x={148 + i * 183} y="190" width="163" height="40" rx="5" fill="rgba(255,255,255,0.1)" />
                <text x={229 + i * 183} y="215" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10.5" fontWeight="500" fill="#FFFFFF">
                  {label}
                </text>
              </g>
            ))}

            <line x1="500" y1="245" x2="500" y2="275" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arr)" />

            {/* Deterministic Engine */}
            <rect x="120" y="280" width="760" height="90" rx="6" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
            <text x="500" y="302" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fontWeight="600" fill="#6B7280" letterSpacing="0.12em">
              DETERMINISTIC ENGINE — FROZEN v1 KERNEL — SAME OUTPUT FOR SAME INPUTS
            </text>
            {["Hedge Kernel", "R1–R8 Taxonomy", "Effectiveness Tests", "Scenarios / VaR"].map((label, i) => (
              <g key={label}>
                <rect x={148 + i * 183} y="315" width="163" height="40" rx="5" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
                <text x={229 + i * 183} y="340" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10.5" fontWeight="500" fill="#1E3A5F">
                  {label}
                </text>
              </g>
            ))}

            <line x1="500" y1="370" x2="500" y2="400" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arr)" />

            {/* Governance */}
            <rect x="180" y="405" width="640" height="60" rx="6" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="1.5" />
            <text x="500" y="427" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fontWeight="600" fill="#6B7280" letterSpacing="0.12em">
              GOVERNANCE &amp; AUDIT INFRASTRUCTURE
            </text>
            {["WORM Audit Trail", "4-Eyes Approval", "SHA-256 Hash Chain", "41-Permission RBAC"].map((label, i) => (
              <text key={label} x={254 + i * 152} y="450" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            ))}

            <text x="500" y="492" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9.5" fill="#9CA3AF">
              AI recommends. Engine computes. Governance records. No layer can override another.
            </text>
          </svg>
        </div>
      </section>

      {/* Proof pillars */}
      <section style={{ padding: `80px ${isMobile ? 24 : 48}px` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              fontFamily: F.mono, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.1em", color: C.textMuted,
              marginBottom: 12, textTransform: "uppercase",
            }}>
              WHY ORDR
            </div>
            <h2 style={{
              fontFamily: F.heading, fontSize: 40, fontWeight: 800,
              letterSpacing: "-0.02em", margin: "0 0 12px", color: C.accent,
            }}>
              Designed for regulators. Built for operators.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 20 }}>
            {[
              {
                label: "CALCULATION INTEGRITY",
                title: "Frozen deterministic kernel",
                desc: "Same inputs → same outputs. Always. The v1 hedge kernel is hash-locked. No model drift, no stochastic surprises. Every calculation is SHA-256 chained and verifiable by auditors.",
                code: `run_id: CR-20260118-0042\nresult: 96.2% effectiveness\nhash: 3a7f19b...`,
              },
              {
                label: "GOVERNANCE",
                title: "4-eyes approval, separation of duties",
                desc: "Makers and checkers are enforced at the database level. The same user cannot approve their own proposal. WORM tables cannot be edited — by anyone, including administrators.",
                code: `maker: user_091\nchecker: user_034\nSoD: ✓ ENFORCED\nstatus: APPROVED`,
              },
              {
                label: "INTELLIGENCE",
                title: "AI that explains, not executes",
                desc: "The Agentic AI layer sits above the engine. It reads positions, monitors thresholds, surfaces anomalies, and communicates in natural language. It never touches the calculation kernel.",
                code: `[AI] EUR position +12%\n[AI] Hedge drift detected\n[AI] Recommend rebalance\n[ENG] Calculation: user decision`,
              },
            ].map((p) => (
              <div key={p.label} style={{
                border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden",
              }}>
                <div style={{ padding: "24px 24px 0" }}>
                  <div style={{
                    fontFamily: F.mono, fontSize: 10, fontWeight: 600,
                    color: C.accent, letterSpacing: "0.1em",
                    textTransform: "uppercase", marginBottom: 8,
                  }}>{p.label}</div>
                  <h3 style={{
                    fontFamily: F.heading, fontSize: 17, fontWeight: 700,
                    color: C.text, margin: "0 0 10px",
                  }}>{p.title}</h3>
                  <p style={{
                    fontFamily: F.ui, fontSize: 13, color: C.textSub,
                    lineHeight: 1.65, margin: "0 0 16px",
                  }}>{p.desc}</p>
                </div>
                <div style={{
                  background: "#111827", padding: "12px 16px",
                  borderTop: `1px solid ${C.border}`,
                }}>
                  <pre style={{
                    fontFamily: F.mono, fontSize: 10, color: "#86EFAC",
                    margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap",
                  }}>{p.code}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{
        padding: `80px ${isMobile ? 24 : 48}px`,
        textAlign: "center",
        background: C.accent,
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 38, fontWeight: 800,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: "#fff",
          }}>
            Not sure which solution fits?
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
            margin: "0 auto 32px", lineHeight: 1.6,
          }}>
            Every ORDR deployment starts from the same unified platform. Talk to our team
            and we&apos;ll help configure the right solution for your organization, regulatory
            environment, and risk profile.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/contact" style={{
              fontFamily: F.ui, fontSize: 14, fontWeight: 700,
              color: C.accent, background: "#fff",
              padding: "13px 32px", borderRadius: 6, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              Talk to our team <ArrowRight size={15} />
            </Link>
            <Link href="/auth/login" style={{
              fontFamily: F.ui, fontSize: 14, fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              padding: "13px 32px", borderRadius: 6, textDecoration: "none",
              border: "1.5px solid rgba(255,255,255,0.3)",
            }}>
              Start free trial
            </Link>
          </div>
        </div>
      </section>


    </MarketingLayout>
  );
}
