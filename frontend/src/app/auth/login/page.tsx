"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import { classifyError, type ErrKind } from "@/lib/auth/loginClassifier";
import { useParticleField } from "@/lib/hooks/useParticleField";

// ─── Treasury dark palette (matches globals.css design tokens) ──────────────
const C = {
  bg:          "#0B1120",           // --bg-sidebar
  bgDeep:      "#111827",           // --bg-deep
  panel:       "rgba(17,24,39,0.92)",
  border:      "#374151",           // --border-rim
  borderSoft:  "rgba(55,65,81,0.5)",
  text1:       "#E5E7EB",           // --text-primary
  text2:       "#9CA3AF",           // --text-secondary
  text3:       "#6B7280",           // --text-tertiary
  accent:      "#1C62F2",           // --accent-blue
  accentGlow:  "rgba(28,98,242,0.28)",
  accentDim:   "rgba(28,98,242,0.12)",
  accentLight: "#5B8EF5",
  green:       "#059669",           // --accent-green
  greenGlow:   "rgba(5,150,105,0.3)",
  red:         "#DC2626",           // --accent-red
  redBg:       "rgba(220,38,38,0.08)",
  redBorder:   "rgba(220,38,38,0.22)",
  amber:       "#D97706",           // --accent-amber
  amberBg:     "rgba(217,119,6,0.08)",
  amberBorder: "rgba(217,119,6,0.22)",
  fontHead:    "'Manrope','Inter',sans-serif",
  fontUI:      "'IBM Plex Sans','Inter',sans-serif",
  fontMono:    "'IBM Plex Mono','JetBrains Mono',monospace",
} as const;

// ─── Environment badge ───────────────────────────────────────────────────────
const APP_ENV     = (process.env.NEXT_PUBLIC_APP_ENV ?? "production").toLowerCase();
const SHOW_ENV    = APP_ENV !== "production" && APP_ENV !== "demo";
const ENV_LABEL   = APP_ENV === "dev" ? "DEVELOPMENT" : APP_ENV.toUpperCase();

// ─── Error config ────────────────────────────────────────────────────────────
const ERR_MAP: Record<ErrKind, {
  icon: string; label: string;
  body: (raw: string) => string;
  color: string; bg: string; border: string;
}> = {
  auth: {
    icon: "⊘", label: "ACCESS DENIED",
    body: () => "User ID or access credential not recognised. Verify and retry.",
    color: C.red, bg: C.redBg, border: C.redBorder,
  },
  warmup: {
    icon: "◷", label: "SERVER INITIALIZING",
    body: () => "Infrastructure initializing from cold state. Allow up to 30 seconds.",
    color: C.amber, bg: C.amberBg, border: C.amberBorder,
  },
  rate: {
    icon: "⊘", label: "RATE LIMITED",
    body: () => "Access attempts exceeded threshold. Observe a 60-second cooldown.",
    color: C.amber, bg: C.amberBg, border: C.amberBorder,
  },
  server: {
    icon: "⚠", label: "SYSTEM ERROR",
    body: (raw) => raw,
    color: C.red, bg: C.redBg, border: C.redBorder,
  },
};

// ─── Eye icons ───────────────────────────────────────────────────────────────
function IconEyeOpen() {
  return (
    <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M1 7.5C2 5.2 4.5 2.5 7.5 2.5S13 5.2 14 7.5c-1 2.3-3.5 5-6.5 5S2 9.8 1 7.5Z"
        stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconEyeClosed() {
  return (
    <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2 2.5L12.5 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.3 6.35a2 2 0 002.4 2.4M4.6 4.7C3 5.6 1.8 6.7 1 7.5c.9 1.6 3.2 5 6.5 5 1.3 0 2.5-.5 3.5-1.2M9.4 3.8A6.8 6.8 0 007.5 3.5C4.2 3.5 1.9 6.1 1 7.5c.3.7.9 1.5 1.6 2.2"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Parallax hook ───────────────────────────────────────────────────────────
function useParallax(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const x = (window.innerWidth  / 2 - e.clientX) / 60;
      const y = (window.innerHeight / 2 - e.clientY) / 60;
      el.style.transform = `perspective(1200px) rotateY(${-x}deg) rotateX(${y}deg)`;
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [ref]);
}

// ─── Main login page ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const [username,     setUsername]     = useState("");
  const [password,     setPassword]     = useState("");
  const [showPwd,      setShowPwd]      = useState(false);
  const [capsLock,     setCapsLock]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [errKind,      setErrKind]      = useState<ErrKind | null>(null);
  const [warmingUp,    setWarmingUp]    = useState(false);
  const [showOverlay,  setShowOverlay]  = useState(true);
  const [focusField,   setFocusField]   = useState<"user" | "pass" | null>(null);
  const [btnHovered,   setBtnHovered]   = useState(false);

  // MFA
  const [mfaChallenge, setMfaChallenge] = useState(false);
  const [mfaToken,     setMfaToken]     = useState<string | null>(null);
  const [mfaCode,      setMfaCode]      = useState("");
  const [mfaLoading,   setMfaLoading]   = useState(false);
  const [mfaError,     setMfaError]     = useState<string | null>(null);
  const mfaInputRef = useRef<HTMLInputElement>(null);

  const { login }   = useAuth();
  const router      = useRouter();
  const usernameRef = useRef<HTMLInputElement>(null);
  const warmupRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const prismRef    = useRef<HTMLDivElement>(null);

  // Particle field — blue, more visible, larger reach
  useParticleField(canvasRef, {
    color:          C.accent,
    connectionDist: 160,
    lineOpacity:    0.42,
  });
  useParallax(prismRef);

  useEffect(() => {
    const t  = setTimeout(() => setShowOverlay(false), 1800);
    const t2 = setTimeout(() => usernameRef.current?.focus(), 900);
    return () => {
      clearTimeout(t); clearTimeout(t2);
      if (warmupRef.current) clearTimeout(warmupRef.current);
    };
  }, []);

  const clearError = useCallback(() => { setError(null); setErrKind(null); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("User ID and access credential are required.");
      setErrKind("auth");
      return;
    }
    clearError();
    setLoading(true);
    setWarmingUp(false);

    warmupRef.current = setTimeout(() => setWarmingUp(true), 8_000);
    const result = await login(username, password);
    if (warmupRef.current) clearTimeout(warmupRef.current);
    setWarmingUp(false);
    setLoading(false);

    if (result.success) {
      try {
        const cookieToken = document.cookie
          .split("; ")
          .find(r => r.startsWith("access_token="))
          ?.split("=")[1] ?? null;
        if (cookieToken) {
          const BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://hedgecore.onrender.com/api";
          const mfaRes = await fetch(`${BASE}/v1/mfa/status`, {
            headers: { Authorization: `Bearer ${cookieToken}` },
            signal: AbortSignal.timeout(5000),
          });
          if (mfaRes.ok) {
            const mfaData = await mfaRes.json();
            if (mfaData.is_enabled) {
              setMfaToken(cookieToken);
              setMfaChallenge(true);
              setTimeout(() => mfaInputRef.current?.focus(), 80);
              return;
            }
          }
        }
      } catch { /* fail-open */ }
      router.push("/dashboard");   // ← skip /welcome, go directly to dashboard
    } else {
      const msg = result.error ?? "Authentication failed";
      setError(msg);
      setErrKind(classifyError(msg));
    }
  };

  const handleMfaVerify = async () => {
    if (mfaCode.length !== 6) { setMfaError("Enter a 6-digit code."); return; }
    setMfaLoading(true);
    setMfaError(null);
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://hedgecore.onrender.com/api";
      const res = await fetch(`${BASE}/v1/mfa/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mfaToken}`,
        },
        body: JSON.stringify({ totp_code: mfaCode }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        router.push("/dashboard");  // ← skip /welcome
      } else {
        const data = await res.json().catch(() => ({}));
        setMfaError((data as { detail?: string }).detail ?? "Invalid code — try again.");
        setMfaCode("");
        setTimeout(() => mfaInputRef.current?.focus(), 80);
      }
    } catch {
      setMfaError("Verification request failed — check your connection.");
    } finally {
      setMfaLoading(false);
    }
  };

  const inputHasError = !!error && errKind === "auth";
  const errCfg = errKind ? ERR_MAP[errKind] : null;

  // ─── Shared styles ──────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: C.fontMono,
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: C.text3,
    marginBottom: 10,
    textAlign: "center",
  };

  const inputStyle = (field: "user" | "pass", hasErr: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "15px 0",
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${hasErr ? C.red : focusField === field ? C.accent : C.border}`,
    fontFamily: C.fontMono,
    fontSize: "16px",
    color: C.text1,
    outline: "none",
    boxSizing: "border-box" as const,
    caretColor: C.accentLight,
    transition: "all 0.35s ease",
    transform: focusField === field ? "translateX(6px)" : "none",
    opacity: loading ? 0.45 : 1,
    letterSpacing: "0.03em",
    textAlign: "center",
  });

  // ─── MFA content ───────────────────────────────────────────────────────────
  const mfaContent = mfaChallenge ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, textAlign: "center" }}>
      <div>
        <h2 style={{
          fontFamily: C.fontHead, fontSize: "22px", fontWeight: 700,
          color: C.text1, margin: 0, letterSpacing: "-0.02em",
        }}>
          MFA Verification
        </h2>
        <p style={{
          fontFamily: C.fontUI, fontSize: "15px",
          color: C.text2, margin: "10px 0 0", lineHeight: 1.6,
        }}>
          Enter your 6-digit authenticator code.
        </p>
      </div>

      <div>
        <label style={labelStyle}>Authenticator Code</label>
        <input
          ref={mfaInputRef}
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={mfaCode}
          onChange={e => { setMfaCode(e.target.value.replace(/\D/g, "")); setMfaError(null); }}
          onKeyDown={e => e.key === "Enter" && handleMfaVerify()}
          placeholder="000000"
          disabled={mfaLoading}
          style={{
            ...inputStyle("user", !!mfaError),
            fontSize: "26px", fontWeight: 700, letterSpacing: "0.35em",
            opacity: mfaLoading ? 0.45 : 1,
          }}
          aria-label="6-digit MFA code"
        />
      </div>

      {mfaError && (
        <div style={{
          padding: "12px 16px",
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          borderLeft: `3px solid ${C.red}`, borderRadius: 3,
          fontFamily: C.fontMono, fontSize: "11px",
          color: C.red, letterSpacing: "0.06em", textAlign: "left",
        }}>
          ⊘ {mfaError}
        </div>
      )}

      <button
        onClick={handleMfaVerify}
        disabled={mfaLoading || mfaCode.length !== 6}
        className="no-scale"
        style={{
          width: "100%", padding: "20px",
          fontFamily: C.fontMono, fontSize: "13px", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.3em",
          color: "#FFFFFF",
          background: (mfaLoading || mfaCode.length !== 6) ? C.border : C.accent,
          border: "none", borderRadius: 4,
          cursor: (mfaLoading || mfaCode.length !== 6) ? "not-allowed" : "pointer",
          transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: mfaCode.length === 6 ? `0 8px 28px ${C.accentGlow}` : "none",
        }}
      >
        {mfaLoading ? "VERIFYING…" : "VERIFY & CONTINUE"}
      </button>
    </div>
  ) : null;

  // ─── Login form ─────────────────────────────────────────────────────────────
  const loginForm = (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Context header */}
      <div style={{ marginBottom: 36, textAlign: "center" }}>
        <p style={{
          fontFamily: C.fontMono, fontSize: "11px",
          textTransform: "uppercase", letterSpacing: "0.22em",
          color: C.text3, margin: "0 0 14px 0",
        }}>
          Institutional FX Hedge Governance
        </p>
        <div style={{ width: "40px", height: "1px", background: C.accent, opacity: 0.5, margin: "0 auto 18px" }} />
        <p style={{
          fontFamily: C.fontUI, fontSize: "15px",
          color: C.text2, lineHeight: 1.7, margin: 0,
        }}>
          Authenticate to access deterministic hedge calculations,
          policy governance, and the execution pipeline.
        </p>
      </div>

      {/* Error banner */}
      {error && errCfg && (
        <div style={{
          padding: "13px 16px",
          background: errCfg.bg, border: `1px solid ${errCfg.border}`,
          borderLeft: `3px solid ${errCfg.color}`, borderRadius: 3,
          marginBottom: 24, display: "flex", flexDirection: "column", gap: 5,
        }}>
          <div style={{
            fontFamily: C.fontMono, fontSize: "10px", fontWeight: 600,
            color: errCfg.color, letterSpacing: "0.12em",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>{errCfg.icon}</span><span>{errCfg.label}</span>
          </div>
          <div style={{ fontFamily: C.fontUI, fontSize: "13px", color: errCfg.color, opacity: 0.85, lineHeight: 1.5 }}>
            {errCfg.body(error)}
          </div>
        </div>
      )}

      {/* Warmup banner */}
      {warmingUp && (
        <div style={{
          padding: "13px 16px", marginBottom: 24,
          background: C.amberBg, border: `1px solid ${C.amberBorder}`,
          borderLeft: `3px solid ${C.amber}`, borderRadius: 3,
          fontFamily: C.fontMono, fontSize: "10px",
          color: C.amber, letterSpacing: "0.06em",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span className="login-spin">◷</span>
          Server initializing — cold start may take up to 30 seconds…
        </div>
      )}

      {/* Terminal ID */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Terminal ID</label>
        <input
          ref={usernameRef}
          type="text"
          value={username}
          onChange={e => { setUsername(e.target.value); clearError(); }}
          onFocus={() => setFocusField("user")}
          onBlur={() => setFocusField(null)}
          placeholder="Enter your user ID"
          disabled={loading}
          autoComplete="username"
          style={inputStyle("user", inputHasError)}
          aria-label="Terminal ID"
        />
      </div>

      {/* Access Key */}
      <div style={{ marginBottom: 36 }}>
        <label style={labelStyle}>Access Key</label>
        <div style={{ position: "relative" }}>
          <input
            type={showPwd ? "text" : "password"}
            value={password}
            onChange={e => { setPassword(e.target.value); clearError(); }}
            onFocus={() => setFocusField("pass")}
            onBlur={() => setFocusField(null)}
            onKeyDown={e => setCapsLock(e.getModifierState("CapsLock"))}
            placeholder="••••••••••••"
            disabled={loading}
            autoComplete="current-password"
            style={{ ...inputStyle("pass", inputHasError), paddingRight: 40 }}
            aria-label="Access Key"
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            tabIndex={-1}
            className="no-scale"
            style={{
              position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", padding: 4,
              color: C.text3, cursor: "pointer",
              display: "flex", alignItems: "center",
            }}
            aria-label={showPwd ? "Hide password" : "Show password"}
          >
            {showPwd ? <IconEyeOpen /> : <IconEyeClosed />}
          </button>
        </div>
        {capsLock && (
          <span style={{
            fontFamily: C.fontMono, fontSize: "10px", marginTop: 7,
            color: C.amber, letterSpacing: "0.08em", display: "block", textAlign: "center",
          }}>
            ⚠ CAPS LOCK IS ON
          </span>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="no-scale"
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
        style={{
          width: "100%", padding: "20px",
          fontFamily: C.fontMono, fontSize: "13px", fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: loading ? "0.3em" : btnHovered ? "0.45em" : "0.3em",
          color: loading ? C.text3 : "#FFFFFF",
          background: loading ? C.border : C.accent,
          border: "none", borderRadius: 4,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: btnHovered && !loading ? `0 12px 36px ${C.accentGlow}` : "none",
        }}
      >
        {loading ? (
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span className="login-spin">⟳</span>
            AUTHENTICATING...
          </span>
        ) : "ESTABLISH LINK"}
      </button>

      {/* Security badges */}
      <div style={{
        marginTop: 32, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 20,
        display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8,
      }}>
        {["AES-256", "HASH-CHAINED AUDIT", "RBAC", "4-EYES APPROVAL"].map(badge => (
          <span key={badge} style={{
            fontFamily: C.fontMono, fontSize: "9px", fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: C.text3, padding: "4px 9px",
            border: `1px solid ${C.border}`, borderRadius: 2,
          }}>
            {badge}
          </span>
        ))}
      </div>

      {/* Footer status */}
      <div style={{
        marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center",
        fontFamily: C.fontMono, fontSize: "10px", color: C.text3, letterSpacing: "0.06em",
      }}>
        <span>© {new Date().getFullYear()} SYNEXIUN</span>
        <span style={{ color: C.green, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block",
            boxShadow: `0 0 8px ${C.greenGlow}`,
          }} />
          ENCRYPTION ACTIVE
        </span>
      </div>
    </form>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      fontFamily: C.fontUI,
      color: C.text1,
    }}>
      {/* Entrance overlay */}
      <div
        className="login-init-overlay"
        style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: C.bgDeep,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
          animation: "loginFadeOut 1.0s cubic-bezier(0.8, 0, 0.2, 1) forwards 0.8s",
          ...(showOverlay ? {} : { opacity: 0, visibility: "hidden" as const }),
        }}
      >
        <div style={{
          position: "absolute",
          border: `1px solid ${C.accent}`,
          opacity: 0.3,
          animation: "loginGrowBox 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }} />
      </div>

      {/* Canvas particle field */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", top: 0, left: 0,
          width: "100%", height: "100%",
          zIndex: 1, opacity: 1,
          pointerEvents: "none",
        }}
      />

      {/* Radial glow behind card */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 2, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(28,98,242,0.07) 0%, transparent 70%)",
      }} />

      {/* Corner telemetry */}
      <div className="login-telemetry" style={{ top: 24, left: 24 }}>
        SYS_LOAD: φ=1.618<br/>NODE_SYNC: TRUE
      </div>
      <div className="login-telemetry" style={{ top: 24, right: 24, textAlign: "right" }}>
        CLOCK_PI: 3.1415...<br/>LOC: [0.00, 0.00]
      </div>
      <div className="login-telemetry" style={{ bottom: 24, left: 24 }}>
        SEC_LEVEL: QUANTUM<br/>ENC: AES-256
      </div>
      <div className="login-telemetry" style={{ bottom: 24, right: 24, textAlign: "right" }}>
        ORDR_OS v4.0
        {SHOW_ENV && <><br/>{ENV_LABEL}</>}
        <br/>HANDSHAKE: WAIT
      </div>

      {/* Main card */}
      <div
        ref={prismRef}
        style={{
          position: "relative", zIndex: 10,
          width: 440, padding: "52px 48px",
          background: C.panel,
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          boxShadow: `0 40px 120px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05)`,
          animation: "loginTerminalBloom 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.4s",
          transform: "scale(0.6)", opacity: 0,
          willChange: "transform, opacity, filter",
        }}
      >
        {/* Accent top line */}
        <div style={{
          position: "absolute", top: 0, left: "20%", right: "20%", height: "2px",
          background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`,
          borderRadius: "0 0 2px 2px",
        }} />

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ordr-logo-horizontal.png"
            alt="ORDR Terminal"
            style={{ width: 240, height: "auto", display: "block", margin: "0 auto",
              filter: "brightness(0) invert(1)", opacity: 0.9 }}
          />
        </div>

        {/* Form */}
        {mfaChallenge ? mfaContent : loginForm}
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes loginGrowBox {
          0%   { width: 0; height: 0; opacity: 0.6; }
          100% { width: calc(100vw * 1.8); height: calc(100vh * 1.8); opacity: 0; }
        }
        @keyframes loginFadeOut {
          to { opacity: 0; visibility: hidden; }
        }
        @keyframes loginTerminalBloom {
          0%   { transform: scale(0.6); opacity: 0; filter: blur(12px); }
          100% { transform: scale(1);   opacity: 1; filter: blur(0); }
        }
        @keyframes loginSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .login-spin {
          display: inline-block;
          animation: loginSpin 1s linear infinite;
        }
        .login-telemetry {
          position: fixed;
          font-family: 'IBM Plex Mono', 'JetBrains Mono', monospace;
          font-size: 11px;
          color: ${C.text3};
          opacity: 0.7;
          pointer-events: none;
          z-index: 5;
          letter-spacing: 0.05em;
          line-height: 1.8;
        }
        input::placeholder { color: ${C.text3}; opacity: 1; }
      `}</style>
    </div>
  );
}
