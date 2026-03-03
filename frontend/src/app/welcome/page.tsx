"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useParticleField } from "@/lib/hooks/useParticleField";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import {
  Shield, Activity, Calculator, FileCheck, Link2, BarChart3,
  Globe, Lock, CheckCircle2, ArrowRight,
} from "lucide-react";

const T = {
  bgDeep:   "#09090E",
  bgPanel:  "#0D1017",
  bgSub:    "#111520",
  rim:      "#1A1F30",
  soft:     "#222A3F",
  cyan:     "#3B8EEA",
  cyanDim:  "rgba(59,142,234,0.10)",
  cyanBdr:  "rgba(59,142,234,0.22)",
  amber:    "#F0A830",
  green:    "#00C896",
  red:      "#FF4B6A",
  primary:  "#C8D4EA",
  secondary:"#6A7A98",
  tertiary: "#3A4460",
  mono:     "'IBM Plex Mono','JetBrains Mono',monospace",
  ui:       "'IBM Plex Sans','Inter',sans-serif",
} as const;

const WORKFLOW_STEPS = [
  { icon: Globe,       num: "01", title: "EXPOSE",    desc: "Register multi-currency FX exposures across entities" },
  { icon: Shield,      num: "02", title: "POLICY",    desc: "Apply governance hedge policies & ratio limits" },
  { icon: Calculator,  num: "03", title: "CALCULATE", desc: "Deterministic engine — reproducible, auditable" },
  { icon: FileCheck,   num: "04", title: "EXECUTE",   desc: "4-eyes approval & hash-chained ledger commit" },
];

export default function WelcomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [ready,        setReady]       = useState(false);
  const [displayName,  setDisplayName] = useState("");
  const [cursorOn,     setCursorOn]    = useState(true);
  const [typeDone,     setTypeDone]    = useState(false);
  const [healthOk,     setHealthOk]    = useState<boolean | null>(null);
  const [skipChecked,  setSkipChecked] = useState(false);
  const [nowStr,       setNowStr]      = useState("");
  const [mounted,      setMounted]     = useState(false);
  const [activeStep,   setActiveStep]  = useState<number | null>(null);

  useParticleField(canvasRef);

  useEffect(() => { setReady(true); setMounted(true); }, []);

  // Clock
  useEffect(() => {
    function fmt() {
      const d = new Date();
      const date = d.toISOString().slice(0, 10);
      const hh   = String(d.getUTCHours()).padStart(2, "0");
      const mm   = String(d.getUTCMinutes()).padStart(2, "0");
      setNowStr(`${date}  ${hh}:${mm} UTC`);
    }
    fmt();
    const iv = setInterval(fmt, 30_000);
    return () => clearInterval(iv);
  }, []);

  // Auth guard
  useEffect(() => {
    if (ready && !isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [ready, isLoading, isAuthenticated, router]);

  // Skip redirect
  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem(`welcome_skipped_${user.id}`) === "true") router.replace("/dashboard");
  }, [user, router]);

  // Typewriter
  useEffect(() => {
    if (!user?.full_name) return;
    const name = user.full_name.toUpperCase();
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayName(name.slice(0, i));
      if (i >= name.length) { clearInterval(iv); setTimeout(() => setTypeDone(true), 300); }
    }, 70);
    return () => clearInterval(iv);
  }, [user?.full_name]);

  // Cursor blink
  useEffect(() => {
    if (!typeDone) return;
    const iv = setInterval(() => setCursorOn(p => !p), 530);
    return () => clearInterval(iv);
  }, [typeDone]);

  // Health check
  useEffect(() => {
    if (!token) return;
    dashboardFetch("/health", token).then(r => setHealthOk(r.ok)).catch(() => setHealthOk(false));
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

  if (!ready || isLoading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: T.bgDeep, fontFamily: T.mono, fontSize: 11, color: T.tertiary,
        letterSpacing: "0.2em",
      }}>
        INITIALIZING SESSION…
      </div>
    );
  }
  if (!isAuthenticated || !user || !token) return null;

  const isSMB    = user.plan_tier === "smb";
  const role     = (user.roles?.[0] ?? "analyst").replace(/_/g, " ").toUpperCase();
  const company  = user.company?.name?.toUpperCase() ?? "ORDR";
  const permCount = user.permissions?.length ?? 0;

  const statusRows = [
    {
      label: "PLATFORM",
      value: healthOk === null ? "CHECKING…" : healthOk ? "OPERATIONAL" : "DEGRADED",
      dot:   healthOk === null ? T.tertiary  : healthOk ? T.green : T.amber,
    },
    { label: "AUTHORITY",  value: role,                              dot: T.cyan  },
    { label: "PROFILE",    value: isSMB ? "SMB PLAN" : "ENTERPRISE", dot: T.cyan  },
    { label: "SCOPE",      value: company,                           dot: T.tertiary },
    { label: "PERMISSIONS", value: `${permCount} GRANTS`,            dot: T.tertiary },
  ];

  const secBadges = [
    { icon: Lock,         label: "AES-256"        },
    { icon: Link2,        label: "HASH-CHAINED"   },
    { icon: Shield,       label: "RBAC"            },
    { icon: CheckCircle2, label: "4-EYES APPROVAL" },
    { icon: BarChart3,    label: "AUDIT TRAIL"     },
    { icon: Activity,     label: "LIVE ENGINE"     },
  ];

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: T.bgDeep, fontFamily: T.ui, color: T.primary,
      overflow: "hidden",
    }}>
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", inset: 0, width: "100%", height: "100%",
          zIndex: 0, opacity: 0.18, pointerEvents: "none",
        }}
      />

      {/* ── Top strip ────────────────────────────────────────────────────────── */}
      <div style={{
        height: 44, flexShrink: 0, zIndex: 1,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", background: T.bgPanel,
        borderBottom: `1px solid ${T.rim}`,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.cyan, letterSpacing: "0.25em" }}>
          ⬡ ORDR TERMINAL
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.tertiary, letterSpacing: "0.1em" }}>
          {nowStr}
        </span>
      </div>

      {/* ── Main body ────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", overflow: "hidden", zIndex: 1,
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}>

        {/* ─ Left panel ───────────────────────────────────────────────────── */}
        <div style={{
          width: "38%", flexShrink: 0,
          borderRight: `1px solid ${T.rim}`,
          display: "flex", flexDirection: "column",
          padding: "44px 40px 32px",
          overflowY: "auto",
        }}>
          {/* Session label */}
          <div style={{
            fontFamily: T.mono, fontSize: 8, letterSpacing: "0.22em",
            color: T.tertiary, marginBottom: 20,
          }}>
            TERMINAL SESSION INITIALIZED
          </div>

          {/* Name + cursor */}
          <div style={{
            fontFamily: T.mono, fontSize: 26, fontWeight: 700,
            color: T.primary, letterSpacing: "0.04em", lineHeight: 1.15,
            minHeight: 60, display: "flex", alignItems: "center", gap: 4,
          }}>
            <span>{displayName}</span>
            <span style={{
              display: "inline-block", width: 2, height: "0.75em",
              background: T.cyan,
              opacity: typeDone ? (cursorOn ? 1 : 0) : 1,
              transition: "opacity 80ms",
            }} />
          </div>

          {/* Role badge + company */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
            <span style={{
              fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
              color: T.cyan, background: T.cyanDim,
              border: `1px solid ${T.cyanBdr}`,
              padding: "3px 10px", borderRadius: 2,
            }}>
              {role}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.secondary, letterSpacing: "0.06em" }}>
              {company}
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: T.rim, margin: "32px 0" }} />

          {/* Status rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {statusRows.map((row, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "11px 0",
                borderBottom: i < statusRows.length - 1 ? `1px solid ${T.rim}` : "none",
              }}>
                <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: "0.15em", color: T.tertiary }}>
                  {row.label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: row.dot, flexShrink: 0,
                    boxShadow: `0 0 6px ${row.dot}80`,
                  }} />
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.primary, letterSpacing: "0.06em" }}>
                    {row.value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Security badges */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 32 }}>
            {secBadges.map(b => (
              <span key={b.label} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontFamily: T.mono, fontSize: 7, letterSpacing: "0.1em",
                color: T.tertiary, border: `1px solid ${T.rim}`,
                padding: "3px 7px", borderRadius: 2,
              }}>
                <b.icon size={8} strokeWidth={1.5} />
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* ─ Right panel ──────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          padding: "44px 52px 32px",
          overflowY: "auto",
        }}>
          {/* Workflow header */}
          <div style={{
            fontFamily: T.mono, fontSize: 8, letterSpacing: "0.22em",
            color: T.tertiary, marginBottom: 32,
          }}>
            {isSMB ? "HEDGE WORKFLOW" : "INSTITUTIONAL WORKFLOW"}
          </div>

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            {WORKFLOW_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = activeStep === idx;
              return (
                <div
                  key={step.num}
                  onMouseEnter={() => setActiveStep(idx)}
                  onMouseLeave={() => setActiveStep(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 24,
                    padding: "20px 22px",
                    background: isActive ? T.cyanDim : "transparent",
                    borderLeft: `2px solid ${isActive ? T.cyan : T.rim}`,
                    borderRadius: "0 3px 3px 0",
                    cursor: "default",
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? "translateX(0)" : "translateX(-12px)",
                    transition: `opacity 0.5s ease ${idx * 80}ms, transform 0.5s ease ${idx * 80}ms, background 120ms, border-color 120ms`,
                  }}
                >
                  {/* Big faint step number */}
                  <span style={{
                    fontFamily: T.mono, fontSize: 36, fontWeight: 700,
                    color: isActive ? "rgba(59,142,234,0.2)" : T.rim,
                    lineHeight: 1, userSelect: "none", minWidth: 52,
                    transition: "color 120ms",
                  }}>
                    {step.num}
                  </span>

                  {/* Icon */}
                  <div style={{
                    width: 34, height: 34, borderRadius: 3, flexShrink: 0,
                    background: isActive ? T.cyanDim : `${T.bgSub}`,
                    border: `1px solid ${isActive ? T.cyanBdr : T.rim}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 120ms",
                  }}>
                    <Icon size={15} strokeWidth={1.5} style={{ color: isActive ? T.cyan : T.secondary }} />
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: 12, fontWeight: 700,
                      letterSpacing: "0.1em", color: isActive ? T.primary : T.secondary,
                      marginBottom: 4, transition: "color 120ms",
                    }}>
                      {step.title}
                    </div>
                    <div style={{
                      fontFamily: T.ui, fontSize: 12, color: T.secondary,
                      lineHeight: 1.5,
                    }}>
                      {step.desc}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ArrowRight size={13} style={{
                    color: isActive ? T.cyan : T.tertiary,
                    flexShrink: 0, transition: "color 120ms",
                  }} />
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: T.rim, margin: "32px 0" }} />

          {/* Launch */}
          <button
            onClick={handleLaunch}
            className="welcome-launch-btn"
            style={{
              width: "100%", height: 50,
              fontFamily: T.mono, fontSize: 12, fontWeight: 700,
              letterSpacing: "0.22em", color: T.bgDeep,
              background: T.cyan, border: "none", borderRadius: 2,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 12,
              transition: "all 200ms ease",
            }}
          >
            ENTER TERMINAL
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>

          {/* Skip checkbox */}
          <label style={{
            display: "flex", alignItems: "center", gap: 8,
            marginTop: 14, cursor: "pointer", alignSelf: "center",
          }}>
            <input
              type="checkbox"
              checked={skipChecked}
              onChange={e => setSkipChecked(e.target.checked)}
              style={{ accentColor: T.cyan, width: 12, height: 12 }}
            />
            <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: "0.08em", color: T.tertiary }}>
              {"DON'T SHOW THIS AGAIN"}
            </span>
          </label>
        </div>
      </div>

      {/* ── Bottom status bar ────────────────────────────────────────────────── */}
      <div style={{
        height: 30, flexShrink: 0, zIndex: 1,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", background: T.bgPanel,
        borderTop: `1px solid ${T.rim}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: healthOk === null ? T.tertiary : healthOk ? T.green : T.amber,
            boxShadow: healthOk ? `0 0 6px ${T.green}60` : "none",
          }} />
          <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: "0.12em", color: T.tertiary }}>
            {healthOk === null ? "CHECKING PLATFORM…" : healthOk ? "ALL SYSTEMS OPERATIONAL" : "PLATFORM DEGRADED"}
          </span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: "0.08em", color: T.tertiary }}>
          © {new Date().getFullYear()} SYNEXIUN · ORDR TERMINAL
        </span>
      </div>

      <style>{`
        .welcome-launch-btn:hover {
          background: #5BA3F5 !important;
          box-shadow: 0 0 32px rgba(59,142,234,0.35) !important;
          letter-spacing: 0.28em !important;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
