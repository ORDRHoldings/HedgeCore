"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import Image from "next/image";

// ── Design tokens — obsidian + molten orange ──────────────────────────────────
const T = {
  // Backgrounds — true black with warm depth
  bg:        "#08070A",
  bgLayer:   "#0D0C10",
  bgCard:    "#0F0E13",
  bgInput:   "#0A0910",

  // Borders
  border:    "rgba(255,255,255,0.06)",
  borderHi:  "rgba(255,255,255,0.10)",
  borderFoc: "rgba(245,130,32,0.55)",

  // Brand orange from logo
  orange:    "#F58220",
  orangeDim: "rgba(245,130,32,0.10)",
  orangeGlow:"rgba(245,130,32,0.18)",
  orangeDeep:"rgba(245,130,32,0.04)",

  // Text
  textPrimary:   "#F0EDE8",
  textSecondary: "#7A7570",
  textTertiary:  "#3D3A38",

  // Utility
  success:  "#22C55E",
  danger:   "#F43F5E",
  dangerDim:"rgba(244,63,94,0.10)",

  // Typography
  fontUI:   "'IBM Plex Sans','Inter',sans-serif",
  fontMono: "'IBM Plex Mono','JetBrains Mono',monospace",
  fontHead: "'Manrope','IBM Plex Sans',sans-serif",
} as const;

// ── Particle / ambient layer ──────────────────────────────────────────────────
function AmbientBackground() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        background: T.bg,
        overflow: "hidden",
      }}
    >
      {/* Subtle noise grain via SVG filter */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </svg>

      {/* Grain overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
          opacity: 0.5,
          mixBlendMode: "overlay",
        }}
      />

      {/* Left vertical accent rule */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-220px)",
          width: 1,
          height: "100%",
          background: `linear-gradient(180deg, transparent 0%, ${T.border} 20%, ${T.border} 80%, transparent 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(220px)",
          width: 1,
          height: "100%",
          background: `linear-gradient(180deg, transparent 0%, ${T.border} 20%, ${T.border} 80%, transparent 100%)`,
        }}
      />

      {/* Central molten orange glow — deep and atmospheric */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -58%)",
          width: 900,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${T.orangeGlow} 0%, ${T.orangeDeep} 45%, transparent 75%)`,
          pointerEvents: "none",
        }}
      />

      {/* Secondary warm bloom — bottom */}
      <div
        style={{
          position: "absolute",
          bottom: -100,
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 300,
          background: `radial-gradient(ellipse at center, ${T.orangeDeep} 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Horizontal hairline — top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${T.orange}55 30%, ${T.orange}88 50%, ${T.orange}55 70%, transparent 100%)`,
        }}
      />
    </div>
  );
}

// ── Live clock strip ──────────────────────────────────────────────────────────
function StatusStrip() {
  const [ts, setTs] = useState("──:──:── UTC");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTs(d.toISOString().replace("T", "  ").slice(0, 22) + " UTC");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 28,
        background: "rgba(8,7,10,0.95)",
        borderTop: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        gap: 20,
        fontFamily: T.fontMono,
        fontSize: "0.625rem",
        color: T.textTertiary,
        letterSpacing: "0.1em",
        zIndex: 20,
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Online indicator */}
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: T.success,
            boxShadow: `0 0 6px ${T.success}`,
          }}
        />
        <span style={{ color: T.textSecondary, letterSpacing: "0.08em" }}>SYSTEMS ONLINE</span>
      </span>
      <span style={{ color: T.textTertiary, opacity: 0.4 }}>—</span>
      <span>TLS 1.3</span>
      <span style={{ color: T.textTertiary, opacity: 0.4 }}>—</span>
      <span>AUTH GATEWAY v1.0</span>
      <span style={{ marginLeft: "auto", color: T.textSecondary }}>{ts}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const [focusedField, setFocusedField] = useState<"user" | "pass" | null>(null);
  const { login } = useAuth();
  const router = useRouter();
  const usernameRef = useRef<HTMLInputElement>(null);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Stagger mount for silky entrance
    const t = setTimeout(() => setMounted(true), 60);
    usernameRef.current?.focus();
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setWarmingUp(false);
    warmupTimerRef.current = setTimeout(() => setWarmingUp(true), 8_000);
    const result = await login(username, password);
    if (warmupTimerRef.current) clearTimeout(warmupTimerRef.current);
    setWarmingUp(false);
    setLoading(false);
    if (result.success) {
      router.push("/dashboard");
    } else {
      setError(result.error ?? "Authentication failed");
    }
  };

  // Input style factory
  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "13px 16px",
    fontFamily: T.fontMono,
    fontSize: "0.8125rem",
    color: T.textPrimary,
    background: focused ? "rgba(245,130,32,0.03)" : T.bgInput,
    border: `1px solid ${focused ? T.borderFoc : T.border}`,
    borderRadius: 2,
    outline: "none",
    transition: "border-color 200ms ease, background 200ms ease",
    boxSizing: "border-box" as const,
    letterSpacing: "0.02em",
    caretColor: T.orange,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: T.fontUI,
        position: "relative",
      }}
    >
      <AmbientBackground />
      <StatusStrip />

      {/* ── Main column ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 420,
          padding: "0 24px",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 600ms cubic-bezier(0.16,1,0.3,1), transform 600ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >

        {/* ── Logo block ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 44,
          }}
        >
          {/* Logo image — rendered large and proud */}
          <div
            style={{
              width: 140,
              height: 140,
              position: "relative",
              marginBottom: 20,
              // Subtle orange glow halo behind logo
              filter: "drop-shadow(0 0 28px rgba(245,130,32,0.20)) drop-shadow(0 0 8px rgba(245,130,32,0.12))",
            }}
          >
            <Image
              src="/ordr-logo.svg"
              alt="ORDR Terminal"
              fill
              sizes="140px"
              style={{ objectFit: "contain" }}
              priority
            />
          </div>

          {/* Platform descriptor */}
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: "0.6rem",
              color: T.textTertiary,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            Institutional FX Risk Infrastructure
          </div>
        </div>

        {/* ── Auth card ── */}
        <div
          style={{
            background: `linear-gradient(160deg, rgba(20,18,26,0.95) 0%, rgba(13,12,18,0.98) 100%)`,
            border: `1px solid ${T.border}`,
            borderRadius: 3,
            backdropFilter: "blur(24px)",
            overflow: "hidden",
            boxShadow: `
              0 0 0 1px rgba(255,255,255,0.02),
              0 32px 80px rgba(0,0,0,0.6),
              0 4px 20px rgba(0,0,0,0.4),
              inset 0 1px 0 rgba(255,255,255,0.04)
            `,
          }}
        >
          {/* Card header — ultra thin accent bar top */}
          <div
            style={{
              height: 2,
              background: `linear-gradient(90deg, transparent 0%, ${T.orange}CC 40%, ${T.orange} 50%, ${T.orange}CC 60%, transparent 100%)`,
            }}
          />

          {/* Card title row */}
          <div
            style={{
              padding: "16px 24px 14px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: T.fontMono,
                fontSize: "0.65rem",
                fontWeight: 600,
                color: T.textSecondary,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Authenticate
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: T.orange,
                  boxShadow: `0 0 8px ${T.orange}`,
                  opacity: 0.8,
                }}
              />
              <span
                style={{
                  fontFamily: T.fontMono,
                  fontSize: "0.6rem",
                  color: T.textTertiary,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                }}
              >
                Secure Session
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: "28px 24px 24px" }}>

            {/* Username */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: T.fontMono,
                  fontSize: "0.6rem",
                  fontWeight: 600,
                  color: focusedField === "user" ? T.orange : T.textTertiary,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  marginBottom: 7,
                  transition: "color 200ms ease",
                }}
              >
                Username · Email
              </label>
              <input
                ref={usernameRef}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="demo  ·  or  user@company.com"
                required
                autoComplete="username"
                style={inputStyle(focusedField === "user")}
                onFocus={() => setFocusedField("user")}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: T.fontMono,
                  fontSize: "0.6rem",
                  fontWeight: 600,
                  color: focusedField === "pass" ? T.orange : T.textTertiary,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  marginBottom: 7,
                  transition: "color 200ms ease",
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="demo  ·  or  your password"
                required
                autoComplete="current-password"
                style={inputStyle(focusedField === "pass")}
                onFocus={() => setFocusedField("pass")}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: 20,
                  fontFamily: T.fontMono,
                  fontSize: "0.7rem",
                  color: T.danger,
                  background: T.dangerDim,
                  border: `1px solid rgba(244,63,94,0.20)`,
                  borderRadius: 2,
                  letterSpacing: "0.04em",
                }}
              >
                ✕  {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="no-scale"
              style={{
                width: "100%",
                padding: "13px 16px",
                fontFamily: T.fontUI,
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: loading ? T.textSecondary : T.bg,
                background: loading
                  ? "rgba(245,130,32,0.12)"
                  : `linear-gradient(135deg, ${T.orange} 0%, #E8710A 100%)`,
                border: loading ? `1px solid ${T.border}` : "none",
                borderRadius: 2,
                cursor: loading ? "wait" : "pointer",
                transition: "all 200ms cubic-bezier(0.16,1,0.3,1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                boxShadow: loading ? "none" : `0 4px 24px rgba(245,130,32,0.30), 0 1px 4px rgba(245,130,32,0.20)`,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = `0 8px 32px rgba(245,130,32,0.40), 0 2px 8px rgba(245,130,32,0.25)`;
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = `0 4px 24px rgba(245,130,32,0.30), 0 1px 4px rgba(245,130,32,0.20)`;
                }
              }}
            >
              {loading ? (
                <>
                  <span
                    style={{
                      width: 13,
                      height: 13,
                      border: `1.5px solid rgba(245,130,32,0.2)`,
                      borderTop: `1.5px solid ${T.orange}`,
                      borderRadius: "50%",
                      animation: "ordrSpin 700ms linear infinite",
                      flexShrink: 0,
                    }}
                  />
                  {warmingUp ? "Waking up server…" : "Authenticating…"}
                </>
              ) : (
                <>
                  Initialize Session
                  {/* Thin arrow */}
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M2 7h10M8 3l4 4-4 4" stroke={T.bg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Cold start notice */}
          {warmingUp && (
            <div
              style={{
                padding: "12px 24px",
                borderTop: `1px solid ${T.border}`,
                fontFamily: T.fontMono,
                fontSize: "0.7rem",
                color: T.textSecondary,
                lineHeight: 1.7,
                background: T.orangeDeep,
              }}
            >
              <span style={{ color: T.orange, fontWeight: 600, letterSpacing: "0.08em" }}>SERVER COLD START</span>
              <br />
              Backend waking from sleep (free tier) — up to 30 s. Please wait.
            </div>
          )}

          {/* Card footer */}
          <div
            style={{
              padding: "10px 24px",
              borderTop: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: T.fontMono,
                fontSize: "0.58rem",
                color: T.textTertiary,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              ORDR Terminal v1.0
            </span>
            <span
              style={{
                fontFamily: T.fontMono,
                fontSize: "0.58rem",
                color: T.textTertiary,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              © 2026 Synexiun
            </span>
          </div>
        </div>

        {/* ── Compliance notice ── */}
        <div
          style={{
            marginTop: 24,
            textAlign: "center",
            fontFamily: T.fontMono,
            fontSize: "0.6rem",
            color: T.textTertiary,
            letterSpacing: "0.06em",
            lineHeight: 1.9,
            opacity: 0.7,
          }}
        >
          Authorized personnel only — all sessions are monitored and logged.
          <br />
          Unauthorized access may be subject to legal action.
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes ordrSpin {
          to { transform: rotate(360deg); }
        }
        input::placeholder {
          color: ${T.textTertiary};
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}
