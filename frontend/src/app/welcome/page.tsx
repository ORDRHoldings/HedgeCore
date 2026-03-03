"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { ArrowRight, Globe, Shield, Calculator, FileCheck } from "lucide-react";

/* ── Design tokens — light alabaster palette ────────────────────────────── */
const T = {
  bg:      "#F8FAFC",
  panel:   "#FFFFFF",
  sub:     "#F1F5F9",
  rim:     "#E2E8F0",
  soft:    "#CBD5E1",
  rule:    "rgba(0,0,0,0.05)",
  blue:    "#1C62F2",
  blueDim: "rgba(28,98,242,0.06)",
  blueBdr: "rgba(28,98,242,0.18)",
  primary: "#0F172A",
  secondary:"#334155",
  muted:   "#94A3B8",
  mono:    "'JetBrains Mono','IBM Plex Mono',monospace",
  ui:      "'Inter','IBM Plex Sans',sans-serif",
  head:    "'Manrope','Inter',sans-serif",
} as const;

const STEPS = [
  { icon: Globe,       code: "01", name: "EXPOSE",    note: "Register multi-currency FX exposures" },
  { icon: Shield,      code: "02", name: "POLICY",    note: "Assign governance hedge policies" },
  { icon: Calculator,  code: "03", name: "CALCULATE", note: "Run deterministic hedge engine" },
  { icon: FileCheck,   code: "04", name: "EXECUTE",   note: "4-eyes approval & ledger commit" },
] as const;

export default function WelcomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();

  const [ready,       setReady]       = useState(false);
  const [skipChecked, setSkipChecked] = useState(false);
  const [healthOk,    setHealthOk]    = useState<boolean | null>(null);
  const [hovStep,     setHovStep]     = useState<number | null>(null);
  const [hovBtn,      setHovBtn]      = useState(false);

  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (ready && !isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [ready, isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem(`welcome_skipped_${user.id}`) === "true") {
      router.replace("/dashboard");
    }
  }, [user, router]);

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

  if (!ready || isLoading) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: T.bg, fontFamily: T.mono, fontSize: 14,
        color: T.muted, letterSpacing: "0.18em",
      }}>
        LOADING SESSION…
      </div>
    );
  }
  if (!isAuthenticated || !user || !token) return null;

  const role    = (user.roles?.[0] ?? "analyst").replace(/_/g, " ").toUpperCase();
  const name    = (user.full_name ?? user.email ?? "").toUpperCase();
  const company = (user.company?.name ?? "").toUpperCase();
  const plan    = (user.plan_tier ?? "enterprise").toUpperCase();

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: T.ui,
      padding: "32px 20px",
    }}>

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div style={{
        width: "100%",
        maxWidth: 480,
        background: T.panel,
        border: `1px solid ${T.rim}`,
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(15,23,42,0.06), 0 1px 4px rgba(15,23,42,0.04)",
      }}>

        {/* Card header bar */}
        <div style={{
          padding: "16px 28px",
          borderBottom: `1px solid ${T.rim}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: 14, fontWeight: 700,
            color: T.blue, letterSpacing: "0.22em",
          }}>
            ⬡ ORDR
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: healthOk === null ? T.soft : healthOk ? T.blue : T.muted,
              display: "inline-block",
              boxShadow: healthOk ? `0 0 6px rgba(28,98,242,0.4)` : "none",
            }} />
            <span style={{
              fontFamily: T.mono, fontSize: 14, letterSpacing: "0.14em",
              color: T.muted,
            }}>
              {healthOk === null ? "CHECKING" : healthOk ? "OPERATIONAL" : "DEGRADED"}
            </span>
          </div>
        </div>

        {/* Identity section */}
        <div style={{ padding: "32px 28px 24px" }}>
          <div style={{
            fontFamily: T.mono, fontSize: 15,
            color: T.muted, letterSpacing: "0.18em", marginBottom: 10,
          }}>
            SESSION INITIALIZED
          </div>

          <div style={{
            fontFamily: T.head, fontSize: 27, fontWeight: 700,
            color: T.primary, letterSpacing: "-0.01em",
            lineHeight: 1.2, marginBottom: 14,
          }}>
            Welcome back
            {name ? `, ${name.split(" ")[0].charAt(0) + name.split(" ")[0].slice(1).toLowerCase()}` : ""}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: T.mono, fontSize: 14, fontWeight: 600,
              letterSpacing: "0.1em", color: T.blue,
              background: T.blueDim, border: `1px solid ${T.blueBdr}`,
              padding: "3px 10px", borderRadius: 2,
            }}>
              {role}
            </span>
            {company && (
              <span style={{
                fontFamily: T.mono, fontSize: 14, color: T.secondary,
                letterSpacing: "0.06em",
              }}>
                {company}
              </span>
            )}
            <span style={{
              fontFamily: T.mono, fontSize: 14, color: T.muted,
              letterSpacing: "0.06em",
            }}>
              {plan}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: T.rim }} />

        {/* Workflow steps */}
        <div style={{ padding: "6px 0" }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const hov  = hovStep === i;
            return (
              <div
                key={s.code}
                onMouseEnter={() => setHovStep(i)}
                onMouseLeave={() => setHovStep(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 28px",
                  background: hov ? T.blueDim : "transparent",
                  borderLeft: `2px solid ${hov ? T.blue : "transparent"}`,
                  transition: "all 120ms ease",
                  cursor: "default",
                }}
              >
                {/* Step number */}
                <span style={{
                  fontFamily: T.mono, fontSize: 15, fontWeight: 700,
                  color: hov ? T.blue : T.muted, letterSpacing: "0.06em",
                  width: 20, flexShrink: 0, transition: "color 120ms",
                }}>
                  {s.code}
                </span>

                {/* Icon */}
                <Icon
                  size={15}
                  strokeWidth={1.5}
                  style={{ color: hov ? T.blue : T.secondary, flexShrink: 0, transition: "color 120ms" }}
                />

                {/* Text */}
                <div style={{ flex: 1 }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: 14, fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: hov ? T.primary : T.secondary,
                    marginRight: 12, transition: "color 120ms",
                  }}>
                    {s.name}
                  </span>
                  <span style={{
                    fontFamily: T.ui, fontSize: 14,
                    color: T.muted, lineHeight: 1,
                  }}>
                    {s.note}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: T.rim }} />

        {/* CTA section */}
        <div style={{ padding: "24px 28px" }}>
          <button
            onClick={handleLaunch}
            onMouseEnter={() => setHovBtn(true)}
            onMouseLeave={() => setHovBtn(false)}
            style={{
              width: "100%",
              height: 46,
              fontFamily: T.mono, fontSize: 14, fontWeight: 700,
              letterSpacing: "0.18em",
              color: "#fff",
              background: hovBtn ? "#1456D8" : T.blue,
              border: "none", borderRadius: 3,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "background 150ms ease",
              boxShadow: hovBtn ? "0 4px 16px rgba(28,98,242,0.30)" : "none",
            }}
          >
            LAUNCH TERMINAL
            <ArrowRight size={15} strokeWidth={2} />
          </button>

          <label style={{
            display: "flex", alignItems: "center", gap: 8,
            marginTop: 16, cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={skipChecked}
              onChange={e => setSkipChecked(e.target.checked)}
              style={{ accentColor: T.blue, width: 13, height: 13 }}
            />
            <span style={{
              fontFamily: T.mono, fontSize: 15,
              color: T.muted, letterSpacing: "0.1em",
            }}>
              {"DON'T SHOW THIS AGAIN"}
            </span>
          </label>
        </div>

      </div>
      {/* ── end card ─────────────────────────────────────────────────────── */}

    </div>
  );
}
