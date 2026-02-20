"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import { Shield, ChevronRight } from "lucide-react";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ── Design tokens — dark institutional terminal ──────────────────────────────
const T = {
  bg: "#0A0E12",
  panelBg: "#141821",
  cardBg: "#111722",
  border: "#1E2835",
  borderHi: "#2A3544",
  textPrimary: "#E8EDF4",
  textSecondary: "#8A94A6",
  textTertiary: "#4A5568",
  accent: "#3B82F6",
  accentDim: "rgba(59,130,246,0.12)",
  accentGlow: "rgba(59,130,246,0.06)",
  success: "#10B981",
  danger: "#EF4444",
  dangerDim: "rgba(239,68,68,0.12)",
  fontUI: "'IBM Plex Sans', 'Inter', sans-serif",
  fontMono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
} as const;

// ── Animated grid background ─────────────────────────────────────────────────
function GridBackground() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        background: T.bg,
      }}
    >
      {/* Subtle grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(${T.border}33 1px, transparent 1px),
            linear-gradient(90deg, ${T.border}33 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          opacity: 0.4,
        }}
      />
      {/* Radial glow behind form */}
      <div
        style={{
          position: "absolute",
          top: "38%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${T.accentGlow} 0%, transparent 70%)`,
        }}
      />
      {/* Top-left corner accent line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 1,
          background: `linear-gradient(90deg, ${T.accent}44, transparent 40%)`,
        }}
      />
    </div>
  );
}

// ── System status ticker ─────────────────────────────────────────────────────
function StatusBar() {
  const [ts, setTs] = useState("--:--:--");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTs(
        d.toISOString().replace("T", " ").slice(0, 19) + " UTC"
      );
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
        height: 32,
        background: T.panelBg,
        borderTop: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 24px",
        fontFamily: T.fontMono,
        fontSize: "0.5625rem",
        color: T.textTertiary,
        letterSpacing: "0.05em",
        zIndex: 10,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: T.success,
            boxShadow: `0 0 6px ${T.success}66`,
          }}
        />
        <span style={{ color: T.textSecondary }}>SYSTEMS ONLINE</span>
      </span>
      <span style={{ color: T.border }}>|</span>
      <span>AUTH GATEWAY v1.0</span>
      <span style={{ color: T.border }}>|</span>
      <span>TLS 1.3 ENCRYPTED</span>
      <span style={{ marginLeft: "auto", color: T.textSecondary }}>{ts}</span>
    </div>
  );
}

// ── Main Login Page ──────────────────────────────────────────────────────────
export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const usernameRef = useRef<HTMLInputElement>(null);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFadeIn(true);
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setWarmingUp(false);

    // After 8 s of waiting, show "server waking up" notice
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
      <GridBackground />
      <StatusBar />

      {/* ── Login Card ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 400,
          padding: "0 20px",
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 500ms ease, transform 500ms ease",
        }}
      >
        {/* Brand Identity */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 36,
          }}
        >
          {/* Shield icon in circle */}
          <div
            style={{
              width: 52,
              height: 52,
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `1px solid ${T.borderHi}`,
              borderRadius: 12,
              background: T.panelBg,
            }}
          >
            <Shield
              size={24}
              strokeWidth={1.4}
              style={{ color: T.accent }}
            />
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: T.textPrimary,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            <span>ORDR</span>{" "}
            <span style={{ color: T.accent }}>Terminal</span>
          </div>
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: "0.625rem",
              color: T.textTertiary,
              marginTop: 8,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Institutional Risk Infrastructure
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          {/* Card header bar */}
          <div
            style={{
              padding: "12px 24px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: T.fontMono,
                fontSize: "0.625rem",
                fontWeight: 600,
                color: T.textSecondary,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Authenticate
            </span>
            <span
              style={{
                fontFamily: T.fontMono,
                fontSize: "0.5625rem",
                color: T.textTertiary,
                letterSpacing: "0.04em",
              }}
            >
              SECURE SESSION
            </span>
          </div>

          {/* Form body */}
          <form
            onSubmit={handleSubmit}
            style={{ padding: "24px 24px 20px" }}
          >
            {/* Email / Username field */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: T.fontMono,
                  fontSize: "0.5625rem",
                  fontWeight: 500,
                  color: T.textTertiary,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Username / Email
              </label>
              <input
                ref={usernameRef}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="demo  ·  or  user@company.com"
                required
                autoComplete="username"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontFamily: T.fontMono,
                  fontSize: "0.8125rem",
                  color: T.textPrimary,
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 1,
                  outline: "none",
                  transition: "border-color 150ms",
                  boxSizing: "border-box",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = T.accent)
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = T.border)
                }
              />
            </div>

            {/* Password field */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: T.fontMono,
                  fontSize: "0.5625rem",
                  fontWeight: 500,
                  color: T.textTertiary,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 6,
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
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontFamily: T.fontMono,
                  fontSize: "0.8125rem",
                  color: T.textPrimary,
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 1,
                  outline: "none",
                  transition: "border-color 150ms",
                  boxSizing: "border-box",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = T.accent)
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = T.border)
                }
              />
            </div>

            {/* Error display */}
            {error && (
              <div
                style={{
                  padding: "8px 12px",
                  marginBottom: 16,
                  fontFamily: T.fontMono,
                  fontSize: "0.6875rem",
                  color: T.danger,
                  background: T.dangerDim,
                  border: `1px solid ${T.danger}33`,
                  borderRadius: 1,
                }}
              >
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="no-scale"
              style={{
                width: "100%",
                padding: "11px 16px",
                fontFamily: T.fontUI,
                fontSize: "0.75rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: loading ? T.textTertiary : "#fff",
                background: loading ? T.border : T.accent,
                border: "none",
                borderRadius: 1,
                cursor: loading ? "wait" : "pointer",
                transition: "all 150ms",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  e.currentTarget.style.background = "#2563EB";
              }}
              onMouseLeave={(e) => {
                if (!loading)
                  e.currentTarget.style.background = T.accent;
              }}
            >
              {loading ? (
                <>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      border: `2px solid ${T.textTertiary}44`,
                      borderTop: `2px solid ${T.textSecondary}`,
                      borderRadius: "50%",
                      animation: "htSpin 800ms linear infinite",
                      flexShrink: 0,
                    }}
                  />
                  {warmingUp ? "Waking up server..." : "Authenticating..."}
                </>
              ) : (
                <>
                  Initialize Session
                  <ChevronRight size={14} strokeWidth={2} />
                </>
              )}
            </button>
          </form>

          {/* Warm-up notice — shown after 8 s of waiting */}
          {warmingUp && (
            <div
              style={{
                padding: "10px 24px",
                borderTop: `1px solid ${T.border}`,
                fontFamily: T.fontMono,
                fontSize: "0.5625rem",
                color: T.textSecondary,
                lineHeight: 1.7,
                background: `rgba(59,130,246,0.04)`,
              }}
            >
              <span style={{ color: T.accent, fontWeight: 600 }}>SERVER COLD START</span>
              <br />
              The backend is waking up from sleep (free tier).
              This takes up to 30 seconds — please wait.
            </div>
          )}

          {/* Demo hint bar — only shown in demo mode */}
          {DEMO_MODE && (
            <div
              style={{
                padding: "10px 24px",
                borderTop: `1px solid ${T.border}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: T.fontMono,
                fontSize: "0.5625rem",
                color: T.textTertiary,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: T.textSecondary,
                  letterSpacing: "0.06em",
                }}
              >
                DEMO ACCESS
              </span>
              <span style={{ color: T.border }}>|</span>
              <span>
                username{" "}
                <code
                  style={{
                    color: T.accent,
                    background: T.accentDim,
                    padding: "1px 5px",
                    borderRadius: 1,
                  }}
                >
                  demo
                </code>
                {"  "}password{" "}
                <code
                  style={{
                    color: T.accent,
                    background: T.accentDim,
                    padding: "1px 5px",
                    borderRadius: 1,
                  }}
                >
                  demo
                </code>
              </span>
            </div>
          )}
        </div>

        {/* Compliance notice */}
        <div
          style={{
            marginTop: 20,
            textAlign: "center",
            fontFamily: T.fontMono,
            fontSize: "0.5rem",
            color: T.textTertiary,
            letterSpacing: "0.05em",
            lineHeight: 1.8,
          }}
        >
          Authorized personnel only. All sessions are monitored and logged.
          <br />
          Unauthorized access is prohibited and may be subject to legal action.
        </div>
      </div>

      {/* Spinner keyframe */}
      <style>{`
        @keyframes htSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
