"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useParticleField } from "@/lib/hooks/useParticleField";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import {
  Shield, Activity, Calculator, FileCheck, Link2, BarChart3,
  ChevronDown, Zap, Globe, Lock, CheckCircle2, ArrowRight,
} from "lucide-react";

// ─── Brand tokens (match login page) ─────────────────────────────────────────
const C = {
  alabaster: "#F8FAFC",
  white: "#FFFFFF",
  obsidian: "#050505",
  slate900: "#0F172A",
  slate700: "#334155",
  slate600: "#475569",
  slate400: "#94A3B8",
  slate300: "#CBD5E1",
  platinum: "#E2E8F0",
  orange: "#FF7A00",
  orangeGlow: "rgba(255,122,0,0.18)",
  green: "#10B981",
  fontHead: "'Manrope','Inter',sans-serif",
  fontUI: "'Inter','IBM Plex Sans',sans-serif",
  fontMono: "'JetBrains Mono','IBM Plex Mono',monospace",
} as const;

// ─── IntersectionObserver-based reveal hook ──────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// ─── Workflow steps ──────────────────────────────────────────────────────────
const ENTERPRISE_STEPS = [
  { icon: Globe, title: "EXPOSE", desc: "Register multi-currency FX exposures" },
  { icon: Shield, title: "POLICY", desc: "Apply governance hedge policies" },
  { icon: Calculator, title: "CALCULATE", desc: "Deterministic engine execution" },
  { icon: FileCheck, title: "EXECUTE", desc: "4-eyes approval & ledger commit" },
];
const SMB_STEPS = [
  { icon: Globe, title: "EXPOSE", desc: "Register your FX positions" },
  { icon: Activity, title: "HEDGE", desc: "Calculate optimal coverage" },
  { icon: FileCheck, title: "EXECUTE", desc: "Approve & commit to ledger" },
];

// ─── Capability cards ────────────────────────────────────────────────────────
const CAPABILITIES = [
  { icon: Globe, title: "Multi-Currency Exposure Tracking", desc: "Register and monitor FX exposures across unlimited currency pairs" },
  { icon: Shield, title: "Policy-Driven Hedge Governance", desc: "Enforce institutional hedge ratios, tenor limits, and instrument rules" },
  { icon: Calculator, title: "Deterministic Calculation Engine", desc: "Reproducible, auditable hedge calculations with zero stochastic drift" },
  { icon: FileCheck, title: "4-Eyes Approval Workflow", desc: "Maker-checker separation of duties with hierarchical authorization" },
  { icon: Link2, title: "Hash-Chained Audit Trail", desc: "SHA-256 tamper-evident ledger with per-tenant cryptographic chain" },
  { icon: BarChart3, title: "Real-Time Market Intelligence", desc: "Live FX rates, economic calendar, and geopolitical risk signals" },
];

export default function WelcomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [typewriterDone, setTypewriterDone] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [skipChecked, setSkipChecked] = useState(false);

  useParticleField(canvasRef);

  // Sections reveal
  const sec2 = useInView(0.1);
  const sec3 = useInView(0.1);
  const sec4 = useInView(0.1);
  const sec5 = useInView(0.1);

  useEffect(() => { setReady(true); }, []);

  // Auth guard
  useEffect(() => {
    if (ready && !isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [ready, isLoading, isAuthenticated, router]);

  // Skip check
  useEffect(() => {
    if (!user) return;
    const skipped = localStorage.getItem(`welcome_skipped_${user.id}`);
    if (skipped === "true") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  // Typewriter effect
  useEffect(() => {
    if (!user?.full_name) return;
    const name = user.full_name.toUpperCase();
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayName(name.slice(0, i));
      if (i >= name.length) { clearInterval(iv); setTimeout(() => setTypewriterDone(true), 400); }
    }, 70);
    return () => clearInterval(iv);
  }, [user?.full_name]);

  // Health check
  useEffect(() => {
    if (!token) return;
    dashboardFetch("/health", token)
      .then(r => setHealthOk(r.ok))
      .catch(() => setHealthOk(false));
  }, [token]);

  const handleLaunch = useCallback(() => {
    if (skipChecked && user) {
      localStorage.setItem(`welcome_skipped_${user.id}`, "true");
      if (token) {
        dashboardFetch("/v1/ui/prefs", token, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ show_quickstart: false }),
        }).catch(() => {});
      }
    }
    router.push("/dashboard");
  }, [skipChecked, user, token, router]);

  // Loading/redirect states
  if (!ready || isLoading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: C.alabaster, fontFamily: C.fontMono, fontSize: 12, color: C.slate400,
      }}>
        INITIALIZING SESSION…
      </div>
    );
  }
  if (!isAuthenticated || !user || !token) return null;

  const isSMB = user.plan_tier === "smb";
  const steps = isSMB ? SMB_STEPS : ENTERPRISE_STEPS;
  const role = user.roles?.[0] ?? "analyst";
  const permCount = user.permissions?.length ?? 0;

  return (
    <div style={{
      minHeight: "100vh", background: C.alabaster,
      fontFamily: C.fontUI, color: C.obsidian, overflowX: "hidden",
    }}>
      {/* ── Particle canvas ── */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          zIndex: 0, opacity: 0.35, pointerEvents: "none",
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1: Hero Welcome
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", position: "relative",
        zIndex: 1, padding: "60px 24px",
      }}>
        {/* Logo */}
        <div style={{
          animation: "welcomeFadeInUp 1s ease forwards",
          opacity: 0,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ordr-logo-horizontal.png" alt="ORDR Terminal"
            style={{ width: 220, height: "auto", marginBottom: 48 }}
          />
        </div>

        {/* Typewriter welcome */}
        <h1 style={{
          fontFamily: C.fontHead, fontSize: "clamp(2rem, 5vw, 3.5rem)",
          fontWeight: 800, letterSpacing: "-0.03em", margin: 0,
          color: C.slate900, animation: "welcomeFadeInUp 1s ease 0.3s forwards",
          opacity: 0,
        }}>
          WELCOME, <span style={{ color: C.orange }}>{displayName}</span>
          <span style={{
            display: "inline-block", width: 3, height: "0.8em",
            background: C.orange, marginLeft: 2, verticalAlign: "baseline",
            animation: typewriterDone ? "welcomeBlink 1s step-end infinite" : "none",
          }} />
        </h1>

        {/* Subtitle */}
        <p style={{
          fontFamily: C.fontMono, fontSize: 11, letterSpacing: "0.2em",
          color: C.slate400, marginTop: 16, textTransform: "uppercase",
          animation: "welcomeFadeInUp 1s ease 0.6s forwards", opacity: 0,
        }}>
          {user.company?.name?.toUpperCase() ?? "ORDR"} TERMINAL · SESSION INITIALIZED
        </p>

        {/* Badges */}
        <div style={{
          display: "flex", gap: 10, marginTop: 24,
          animation: "welcomeFadeInUp 1s ease 0.9s forwards", opacity: 0,
        }}>
          <span style={{
            fontFamily: C.fontMono, fontSize: 9, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: C.white, background: C.orange,
            padding: "4px 14px", borderRadius: 100,
          }}>
            {role.replace(/_/g, " ")}
          </span>
          <span style={{
            fontFamily: C.fontMono, fontSize: 9, fontWeight: 600,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: C.slate600, background: C.platinum,
            padding: "4px 14px", borderRadius: 100,
          }}>
            {isSMB ? "SMB" : "ENTERPRISE"}
          </span>
        </div>

        {/* Scroll hint */}
        <div style={{
          position: "absolute", bottom: 40,
          animation: "welcomePulseChevron 2s ease-in-out infinite",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <span style={{
            fontFamily: C.fontMono, fontSize: 8, letterSpacing: "0.2em",
            color: C.slate400, textTransform: "uppercase",
          }}>
            EXPLORE YOUR TERMINAL
          </span>
          <ChevronDown size={18} style={{ color: C.slate400 }} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2: System Status Cards
      ═══════════════════════════════════════════════════════════════════════ */}
      <section
        ref={sec2.ref}
        style={{
          padding: "80px 24px", position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column", alignItems: "center",
        }}
      >
        <h2 style={{
          fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.25em",
          color: C.slate400, textTransform: "uppercase", marginBottom: 40,
          opacity: sec2.visible ? 1 : 0,
          transform: sec2.visible ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.8s ease",
        }}>
          SYSTEM STATUS
        </h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16, maxWidth: 960, width: "100%",
        }}>
          {[
            {
              title: "PLATFORM STATUS",
              value: healthOk === null ? "CHECKING…" : healthOk ? "OPERATIONAL" : "DEGRADED",
              color: healthOk === null ? C.slate400 : healthOk ? C.green : C.orange,
              details: [
                { label: "API", value: healthOk ? "ONLINE" : "—" },
                { label: "ENGINE", value: "READY" },
                { label: "AUTH", value: "ACTIVE" },
              ],
              delay: 0,
            },
            {
              title: "YOUR AUTHORITY",
              value: role.replace(/_/g, " ").toUpperCase(),
              color: C.orange,
              details: [
                { label: "PERMISSIONS", value: String(permCount) },
                { label: "SCOPE", value: user.company?.name ?? "GLOBAL" },
                { label: "MFA", value: "AVAILABLE" },
              ],
              delay: 150,
            },
            {
              title: "TERMINAL PROFILE",
              value: isSMB ? "SMB PLAN" : "ENTERPRISE PLAN",
              color: isSMB ? C.slate600 : C.orange,
              details: [
                { label: "COMPANY", value: user.company?.name ?? "—" },
                { label: "BRANCH", value: user.branch?.name ?? "—" },
                { label: "DEPT", value: user.department?.name ?? "—" },
              ],
              delay: 300,
            },
          ].map((card, idx) => (
            <div
              key={idx}
              style={{
                background: "rgba(255,255,255,0.72)",
                backdropFilter: "blur(20px)",
                border: `1px solid ${C.platinum}`,
                borderRadius: 3, padding: "28px 24px",
                opacity: sec2.visible ? 1 : 0,
                transform: sec2.visible ? "translateY(0)" : "translateY(30px)",
                transition: `all 0.7s ease ${card.delay}ms`,
              }}
            >
              <div style={{
                fontFamily: C.fontMono, fontSize: 8, letterSpacing: "0.2em",
                color: C.slate400, marginBottom: 12,
              }}>
                {card.title}
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 20,
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: card.color,
                  boxShadow: `0 0 8px ${card.color}50`,
                  display: "inline-block",
                }} />
                <span style={{
                  fontFamily: C.fontMono, fontSize: 13, fontWeight: 700,
                  letterSpacing: "0.08em", color: card.color,
                }}>
                  {card.value}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {card.details.map((d, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between",
                    fontFamily: C.fontMono, fontSize: 9, letterSpacing: "0.08em",
                  }}>
                    <span style={{ color: C.slate400 }}>{d.label}</span>
                    <span style={{ color: C.slate700, fontWeight: 600 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3: Workflow Roadmap
      ═══════════════════════════════════════════════════════════════════════ */}
      <section
        ref={sec3.ref}
        style={{
          padding: "80px 24px", position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column", alignItems: "center",
        }}
      >
        <h2 style={{
          fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.25em",
          color: C.slate400, textTransform: "uppercase", marginBottom: 48,
          opacity: sec3.visible ? 1 : 0,
          transform: sec3.visible ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.8s ease",
        }}>
          {isSMB ? "YOUR HEDGE WORKFLOW" : "INSTITUTIONAL WORKFLOW"}
        </h2>

        <div style={{
          display: "flex", alignItems: "flex-start", gap: 0,
          maxWidth: 900, width: "100%", justifyContent: "center",
          flexWrap: "wrap",
        }}>
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isLast = idx === steps.length - 1;
            return (
              <div key={idx} style={{ display: "flex", alignItems: "flex-start" }}>
                {/* Step node */}
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  width: 160,
                  opacity: sec3.visible ? 1 : 0,
                  transform: sec3.visible ? "translateY(0)" : "translateY(30px)",
                  transition: `all 0.7s ease ${idx * 200}ms`,
                }}>
                  {/* Numbered circle */}
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    border: `2px solid ${C.orange}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative", background: C.white,
                  }}>
                    <Icon size={22} strokeWidth={1.5} style={{ color: C.orange }} />
                    <span style={{
                      position: "absolute", top: -6, right: -6,
                      width: 20, height: 20, borderRadius: "50%",
                      background: C.obsidian, color: C.white,
                      fontFamily: C.fontMono, fontSize: 9, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {idx + 1}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: C.fontMono, fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.15em", color: C.slate900, marginTop: 14,
                  }}>
                    {step.title}
                  </span>
                  <span style={{
                    fontFamily: C.fontUI, fontSize: 11, color: C.slate600,
                    marginTop: 6, textAlign: "center", lineHeight: 1.5,
                  }}>
                    {step.desc}
                  </span>
                </div>

                {/* Connector */}
                {!isLast && (
                  <div style={{
                    display: "flex", alignItems: "center", height: 56, paddingTop: 0,
                    opacity: sec3.visible ? 1 : 0,
                    transition: `opacity 0.7s ease ${(idx + 1) * 200}ms`,
                  }}>
                    <svg width="60" height="20" viewBox="0 0 60 20">
                      <line
                        x1="0" y1="10" x2="48" y2="10"
                        stroke={C.orange} strokeWidth="2"
                        strokeDasharray="6 4"
                        style={{
                          strokeDashoffset: sec3.visible ? 0 : 60,
                          transition: `stroke-dashoffset 1.2s ease ${(idx + 1) * 300}ms`,
                        }}
                      />
                      <polygon
                        points="48,5 58,10 48,15"
                        fill={C.orange}
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4: Capabilities Grid
      ═══════════════════════════════════════════════════════════════════════ */}
      <section
        ref={sec4.ref}
        style={{
          padding: "80px 24px", position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column", alignItems: "center",
        }}
      >
        <h2 style={{
          fontFamily: C.fontMono, fontSize: 10, letterSpacing: "0.25em",
          color: C.slate400, textTransform: "uppercase", marginBottom: 40,
          opacity: sec4.visible ? 1 : 0,
          transform: sec4.visible ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.8s ease",
        }}>
          TERMINAL CAPABILITIES
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12, maxWidth: 900, width: "100%",
        }}>
          {CAPABILITIES.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <div
                key={idx}
                className="welcome-cap-card"
                style={{
                  padding: "22px 20px",
                  background: "rgba(255,255,255,0.6)",
                  border: `1px solid ${C.platinum}`,
                  borderRadius: 3,
                  display: "flex", gap: 14, alignItems: "flex-start",
                  opacity: sec4.visible ? 1 : 0,
                  transform: sec4.visible ? "translateY(0)" : "translateY(20px)",
                  transition: `all 0.6s ease ${idx * 100}ms`,
                  cursor: "default",
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 3, flexShrink: 0,
                  background: `${C.orange}0A`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={15} strokeWidth={1.5} style={{ color: C.orange }} />
                </div>
                <div>
                  <div style={{
                    fontFamily: C.fontMono, fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.08em", color: C.slate900, marginBottom: 4,
                  }}>
                    {cap.title}
                  </div>
                  <div style={{
                    fontFamily: C.fontUI, fontSize: 11, color: C.slate600,
                    lineHeight: 1.6,
                  }}>
                    {cap.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5: Launch Panel
      ═══════════════════════════════════════════════════════════════════════ */}
      <section
        ref={sec5.ref}
        style={{
          padding: "80px 24px 60px", position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column", alignItems: "center",
        }}
      >
        {/* Primary CTA */}
        <button
          onClick={handleLaunch}
          className="welcome-launch-btn"
          style={{
            fontFamily: C.fontMono, fontSize: 12, fontWeight: 600,
            letterSpacing: "0.3em", textTransform: "uppercase",
            color: C.white, background: C.obsidian,
            border: "none", borderRadius: 3,
            padding: "22px 64px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 12,
            transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            opacity: sec5.visible ? 1 : 0,
            transform: sec5.visible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          LAUNCH TERMINAL
          <ArrowRight size={16} strokeWidth={2} />
        </button>

        {/* Skip checkbox */}
        <label style={{
          display: "flex", alignItems: "center", gap: 8,
          marginTop: 24, cursor: "pointer",
          opacity: sec5.visible ? 1 : 0,
          transition: "opacity 0.6s ease 0.3s",
        }}>
          <input
            type="checkbox"
            checked={skipChecked}
            onChange={e => setSkipChecked(e.target.checked)}
            style={{ accentColor: C.orange, width: 14, height: 14 }}
          />
          <span style={{
            fontFamily: C.fontMono, fontSize: 9, letterSpacing: "0.08em",
            color: C.slate400,
          }}>
            {"Don't show this again"}
          </span>
        </label>

        {/* Security badges footer */}
        <div style={{
          display: "flex", flexWrap: "wrap", justifyContent: "center",
          gap: 8, marginTop: 48,
          opacity: sec5.visible ? 1 : 0,
          transition: "opacity 0.6s ease 0.5s",
        }}>
          {[
            { icon: Lock, label: "AES-256" },
            { icon: Link2, label: "HASH-CHAINED AUDIT" },
            { icon: Shield, label: "RBAC" },
            { icon: CheckCircle2, label: "4-EYES APPROVAL" },
          ].map(badge => (
            <span key={badge.label} style={{
              fontFamily: C.fontMono, fontSize: 7, fontWeight: 500,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: C.slate400, padding: "4px 10px",
              border: `1px solid ${C.platinum}`, borderRadius: 1,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <badge.icon size={9} strokeWidth={1.5} />
              {badge.label}
            </span>
          ))}
        </div>

        {/* Copyright */}
        <div style={{
          marginTop: 40, fontFamily: C.fontMono, fontSize: 8,
          color: C.slate400, letterSpacing: "0.06em",
        }}>
          © {new Date().getFullYear()} SYNEXIUN · ORDR TERMINAL
        </div>
      </section>

      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes welcomeFadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes welcomeBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
        @keyframes welcomePulseChevron {
          0%, 100% { opacity: 0.4; transform: translateY(0); }
          50%      { opacity: 1;   transform: translateY(6px); }
        }
        .welcome-launch-btn:hover {
          background: #FF7A00 !important;
          box-shadow: 0 16px 48px rgba(255,122,0,0.25) !important;
          letter-spacing: 0.4em !important;
        }
        .welcome-cap-card:hover {
          border-color: rgba(255,122,0,0.3) !important;
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.04) !important;
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
