"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import { classifyError, type ErrKind } from "@/lib/auth/loginClassifier";
import { useParticleField } from "@/lib/hooks/useParticleField";

// ─── Design tokens — CSS variable references, inherits app theme ─────────────
const C = {
  bg:          "var(--bg-sidebar)",
  bgDeep:      "var(--bg-deep)",
  panel:       "var(--bg-panel)",
  panelAlpha:  "rgba(10,10,14,0.97)",
  border:      "var(--border-rim)",
  borderSoft:  "var(--border-soft)",
  borderFocus: "rgba(255,255,255,0.28)",
  text1:       "var(--text-primary)",
  text2:       "var(--text-secondary)",
  text3:       "var(--text-tertiary)",
  accent:      "#888888",
  accentHover: "#999999",
  accentGlow:  "rgba(255,255,255,0.06)",
  accentDim:   "rgba(255,255,255,0.04)",
  green:       "var(--accent-green)",
  greenGlow:   "rgba(5,150,105,0.20)",
  red:         "var(--accent-red)",
  redBg:       "rgba(220,38,38,0.06)",
  redBorder:   "rgba(220,38,38,0.18)",
  amber:       "var(--accent-amber)",
  amberBg:     "rgba(217,119,6,0.06)",
  amberBorder: "rgba(217,119,6,0.18)",
  // Input fields — solid dark, light text
  inputBg:          "#131317",
  inputText:        "#e8e8ef",
  inputPlaceholder: "rgba(255,255,255,0.32)",
  fontHead:    "'Manrope','Inter',sans-serif",
  fontUI:      "'IBM Plex Sans','Inter',sans-serif",
  fontMono:    "'IBM Plex Mono','JetBrains Mono',monospace",
} as const;

// ─── Environment badge ────────────────────────────────────────────────────────
const APP_ENV   = (process.env.NEXT_PUBLIC_APP_ENV ?? "production").toLowerCase();
const SHOW_ENV  = APP_ENV !== "production" && APP_ENV !== "demo";
const ENV_LABEL = APP_ENV === "dev" ? "DEVELOPMENT" : APP_ENV.toUpperCase();

// ─── Error config ─────────────────────────────────────────────────────────────
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

// ─── Eye icons ────────────────────────────────────────────────────────────────
function IconEyeOpen() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M1 7.5C2 5.2 4.5 2.5 7.5 2.5S13 5.2 14 7.5c-1 2.3-3.5 5-6.5 5S2 9.8 1 7.5Z"
        stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconEyeClosed() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2 2.5L12.5 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.3 6.35a2 2 0 002.4 2.4M4.6 4.7C3 5.6 1.8 6.7 1 7.5c.9 1.6 3.2 5 6.5 5 1.3 0 2.5-.5 3.5-1.2M9.4 3.8A6.8 6.8 0 007.5 3.5C4.2 3.5 1.9 6.1 1 7.5c.3.7.9 1.5 1.6 2.2"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Main login page ──────────────────────────────────────────────────────────
export default function LoginPage() {
  const [username,     setUsername]     = useState("");
  const [password,     setPassword]     = useState("");
  const [showPwd,      setShowPwd]      = useState(false);
  const [capsLock,     setCapsLock]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [errKind,      setErrKind]      = useState<ErrKind | null>(null);
  const [warmingUp,    setWarmingUp]    = useState(false);
  const [focusField,   setFocusField]   = useState<"user" | "pass" | null>(null);
  const [btnHovered,   setBtnHovered]   = useState(false);
  const [mounted,      setMounted]      = useState(false);

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

  useParticleField(canvasRef, {
    colorful:            true,
    connectionDist:      90,
    lineOpacity:         0.07,
    saturation:          0,
    lightness:           75,
    speed:               0.3,
    hueSpeedMultiplier:  0,
    hues:                [0],
  });

  useEffect(() => {
    const t = setTimeout(() => { setMounted(true); usernameRef.current?.focus(); }, 80);
    return () => {
      clearTimeout(t);
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
      router.push("/dashboard");
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
        router.push("/dashboard");
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

  // ─── Shared input wrapper style ───────────────────────────────────────────
  const fieldWrapStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: C.fontMono,
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: C.text3,
  };

  // ─── Input style — dark bg, light text, autofill-safe ─────────────────────
  const inputStyle = (field: "user" | "pass", hasErr: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "11px 14px",
    background: loading ? "#0e0e12" : C.inputBg,
    border: `1.5px solid ${
      hasErr         ? C.red
      : focusField === field ? C.borderFocus
      : "rgba(255,255,255,0.10)"
    }`,
    borderRadius: 5,
    fontFamily: C.fontMono,
    fontSize: "14px",
    color: C.inputText,
    outline: "none",
    boxSizing: "border-box" as const,
    caretColor: C.accent,
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    boxShadow: focusField === field && !hasErr
      ? `0 0 0 3px ${C.accentDim}, 0 1px 3px rgba(0,0,0,0.10)`
      : hasErr
      ? `0 0 0 3px rgba(220,38,38,0.08)`
      : "0 1px 2px rgba(0,0,0,0.08)",
    opacity: loading ? 0.65 : 1,
    letterSpacing: "0.01em",
  });

  // ─── MFA panel ─────────────────────────────────────────────────────────────
  const mfaContent = mfaChallenge ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: C.fontMono, fontSize: "10px", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.18em",
          color: C.accent, marginBottom: 8,
        }}>
          MFA Required
        </div>
        <p style={{ fontFamily: C.fontUI, fontSize: "13px", color: C.text2, margin: 0, lineHeight: 1.6 }}>
          Enter your 6-digit authenticator code.
        </p>
      </div>

      <div style={fieldWrapStyle}>
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
            fontSize: "22px", fontWeight: 700, letterSpacing: "0.4em",
            textAlign: "center",
          }}
          aria-label="6-digit MFA code"
        />
      </div>

      {mfaError && (
        <div style={{
          padding: "10px 12px",
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          borderLeft: `2px solid ${C.red}`, borderRadius: 4,
          fontFamily: C.fontMono, fontSize: "11px",
          color: C.red, letterSpacing: "0.04em",
        }}>
          ⊘ {mfaError}
        </div>
      )}

      <button
        onClick={handleMfaVerify}
        disabled={mfaLoading || mfaCode.length !== 6}
        className="no-scale"
        style={{
          width: "100%", padding: "12px",
          fontFamily: C.fontMono, fontSize: "12px", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.22em",
          color: "#fff",
          background: (mfaLoading || mfaCode.length !== 6) ? C.border : "#1a1a1e",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5,
          cursor: (mfaLoading || mfaCode.length !== 6) ? "not-allowed" : "pointer",
          transition: "all 0.2s ease",
          boxShadow: mfaCode.length === 6 ? "0 4px 16px rgba(0,0,0,0.30)" : "none",
        }}
      >
        {mfaLoading ? "Verifying…" : "Verify & Continue"}
      </button>
    </div>
  ) : null;

  // ─── Login form ────────────────────────────────────────────────────────────
  const loginForm = (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Error banner */}
      {error && errCfg && (
        <div style={{
          padding: "10px 12px", marginBottom: 18,
          background: errCfg.bg, border: `1px solid ${errCfg.border}`,
          borderLeft: `3px solid ${errCfg.color}`, borderRadius: 4,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{
            fontFamily: C.fontMono, fontSize: "10px", fontWeight: 700,
            color: errCfg.color, letterSpacing: "0.10em",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>{errCfg.icon}</span><span>{errCfg.label}</span>
          </div>
          <div style={{ fontFamily: C.fontUI, fontSize: "12px", color: errCfg.color, opacity: 0.85, lineHeight: 1.5 }}>
            {errCfg.body(error)}
          </div>
        </div>
      )}

      {/* Warmup banner */}
      {warmingUp && (
        <div style={{
          padding: "10px 12px", marginBottom: 18,
          background: C.amberBg, border: `1px solid ${C.amberBorder}`,
          borderLeft: `3px solid ${C.amber}`, borderRadius: 4,
          fontFamily: C.fontMono, fontSize: "10px",
          color: C.amber, letterSpacing: "0.04em",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span className="login-spin">◷</span>
          Server initializing — cold start may take up to 30 seconds…
        </div>
      )}

      {/* ── Terminal ID ── */}
      <div style={{ ...fieldWrapStyle, marginBottom: 16 }}>
        <label style={labelStyle} htmlFor="login-user">Terminal ID</label>
        <input
          id="login-user"
          ref={usernameRef}
          type="text"
          value={username}
          onChange={e => { setUsername(e.target.value); clearError(); }}
          onFocus={() => setFocusField("user")}
          onBlur={() => setFocusField(null)}
          placeholder="Enter user ID"
          disabled={loading}
          autoComplete="username"
          style={inputStyle("user", inputHasError)}
          aria-label="Terminal ID"
        />
      </div>

      {/* ── Access Key ── */}
      <div style={{ ...fieldWrapStyle, marginBottom: 24 }}>
        <label style={labelStyle} htmlFor="login-pass">Access Key</label>
        <div style={{ position: "relative" }}>
          <input
            id="login-pass"
            type={showPwd ? "text" : "password"}
            value={password}
            onChange={e => { setPassword(e.target.value); clearError(); }}
            onFocus={() => setFocusField("pass")}
            onBlur={() => setFocusField(null)}
            onKeyDown={e => setCapsLock(e.getModifierState("CapsLock"))}
            placeholder="Enter access key"
            disabled={loading}
            autoComplete="current-password"
            style={{ ...inputStyle("pass", inputHasError), paddingRight: 42 }}
            aria-label="Access Key"
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            tabIndex={-1}
            className="no-scale"
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", padding: 4,
              color: C.text3, cursor: "pointer",
              display: "flex", alignItems: "center",
              transition: "color 0.15s",
            }}
            aria-label={showPwd ? "Hide password" : "Show password"}
          >
            {showPwd ? <IconEyeOpen /> : <IconEyeClosed />}
          </button>
        </div>
        {capsLock && (
          <span style={{
            fontFamily: C.fontMono, fontSize: "10px",
            color: C.amber, letterSpacing: "0.06em",
          }}>
            ⚠ CAPS LOCK ON
          </span>
        )}
      </div>

      {/* ── Authenticate button ── */}
      <button
        type="submit"
        disabled={loading}
        className="no-scale"
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
        style={{
          width: "100%", padding: "12px",
          fontFamily: C.fontMono, fontSize: "12px", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.22em",
          color: loading ? C.text3 : "#fff",
          background: loading
            ? C.border
            : btnHovered
            ? "#2a2a2e"
            : "#1a1a1e",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.15s ease, box-shadow 0.15s ease",
          boxShadow: btnHovered && !loading
            ? "0 6px 20px rgba(0,0,0,0.40)"
            : "0 2px 8px rgba(0,0,0,0.30)",
        }}
      >
        {loading ? (
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span className="login-spin">⟳</span>
            Authenticating…
          </span>
        ) : "Authenticate →"}
      </button>

      {/* ── Security badges ── */}
      <div style={{
        marginTop: 22,
        borderTop: `1px solid ${C.borderSoft}`,
        paddingTop: 16,
        display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6,
      }}>
        {["AES-256", "Hash-Chained Audit", "RBAC", "4-Eyes"].map(badge => (
          <span key={badge} style={{
            fontFamily: C.fontMono, fontSize: "9px", fontWeight: 600,
            letterSpacing: "0.08em", textTransform: "uppercase",
            color: C.text3, padding: "3px 8px",
            border: `1px solid ${C.border}`, borderRadius: 3,
          }}>
            {badge}
          </span>
        ))}
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center",
        fontFamily: C.fontMono, fontSize: "9px", color: C.text3, letterSpacing: "0.05em",
      }}>
        <span>© {new Date().getFullYear()} SYNEXIUN</span>
        <span style={{ color: C.green, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", background: C.green,
            display: "inline-block", boxShadow: `0 0 6px ${C.greenGlow}`,
          }} />
          Encrypted
        </span>
      </div>
    </form>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: C.bgDeep,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      fontFamily: C.fontUI,
      color: C.text1,
    }}>
      {/* Particle field — subtle, monochrome */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", top: 0, left: 0,
          width: "100%", height: "100%",
          zIndex: 1, opacity: 0.72,
          pointerEvents: "none",
        }}
      />

      {/* Radial vignette */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 2, pointerEvents: "none",
        background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 25%, color-mix(in srgb, var(--bg-deep) 80%, transparent) 100%)",
      }} />

      {/* Horizontal scan line — subtle depth */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 2, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px)",
      }} />

      {/* Corner telemetry */}
      <div className="login-telemetry" style={{ bottom: 20, left: 20 }}>
        SEC_LEVEL: AES-256{SHOW_ENV && <><br/>{ENV_LABEL}</>}
      </div>
      <div className="login-telemetry" style={{ bottom: 20, right: 20, textAlign: "right" }}>
        ORDR_OS v4.0<br/>HANDSHAKE: WAIT
      </div>

      {/* ── Main card ── */}
      <div style={{
        position: "relative", zIndex: 10,
        width: 360,
        padding: "36px 32px 30px",
        background: C.panelAlpha,
        backdropFilter: "blur(24px) saturate(140%)",
        WebkitBackdropFilter: "blur(24px) saturate(140%)",
        border: `1px solid ${C.border}`,
        borderTop: `1px solid ${C.border}`,
        borderRadius: 8,
        boxShadow: [
          "0 40px 80px rgba(0,0,0,0.55)",
          "0 0 0 1px rgba(255,255,255,0.03)",
          "inset 0 1px 0 rgba(255,255,255,0.05)",
        ].join(", "),
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0) scale(1)" : "translateY(12px) scale(0.99)",
        transition: "opacity 0.45s ease, transform 0.45s ease",
        willChange: "transform, opacity",
      }}>

        {/* Top accent line */}
        <div style={{
          position: "absolute", top: 0, left: "20%", right: "20%", height: "2px",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
          borderRadius: "0 0 2px 2px",
          opacity: 0.7,
        }} />

        {/* Logo + wordmark */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ordr-logo-horizontal.png"
            alt="ORDR Terminal"
            style={{
              width: 152, height: "auto",
              display: "block", margin: "0 auto",
              filter: "brightness(0) invert(1)",
              opacity: 0.88,
            }}
          />
          <div style={{
            marginTop: 10,
            fontFamily: C.fontMono, fontSize: "9px",
            textTransform: "uppercase", letterSpacing: "0.22em",
            color: C.text3,
          }}>
            Institutional FX Hedge Governance
          </div>
        </div>

        {/* Divider */}
        <div style={{
          height: "1px",
          background: `linear-gradient(90deg, transparent, ${C.border}, transparent)`,
          marginBottom: 24,
        }} />

        {/* Form content */}
        {mfaChallenge ? mfaContent : loginForm}
      </div>

      {/* Keyframes + global input styles */}
      <style>{`
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
          font-size: 10px;
          color: ${C.text3};
          opacity: 0.35;
          pointer-events: none;
          z-index: 5;
          letter-spacing: 0.05em;
          line-height: 1.8;
        }
        #login-user::placeholder,
        #login-pass::placeholder {
          color: ${C.inputPlaceholder};
          opacity: 1;
        }
        /* Autofill — WebKit + standard + Firefox */
        #login-user:-webkit-autofill,
        #login-user:-webkit-autofill:hover,
        #login-user:-webkit-autofill:focus,
        #login-pass:-webkit-autofill,
        #login-pass:-webkit-autofill:hover,
        #login-pass:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #131317 inset !important;
          -webkit-text-fill-color: #e8e8ef !important;
          caret-color: #888888;
        }
        #login-user:autofill,
        #login-user:autofill:hover,
        #login-user:autofill:focus,
        #login-pass:autofill,
        #login-pass:autofill:hover,
        #login-pass:autofill:focus {
          box-shadow: 0 0 0 1000px #131317 inset !important;
          -webkit-text-fill-color: #e8e8ef !important;
          caret-color: #888888;
        }
        /* Firefox password manager fallback */
        @-moz-document url-prefix() {
          #login-user, #login-pass {
            background: #131317 !important;
            color: #e8e8ef !important;
          }
        }
      `}</style>
    </div>
  );
}
