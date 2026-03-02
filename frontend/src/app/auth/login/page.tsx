"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import { classifyError, type ErrKind } from "@/lib/auth/loginClassifier";

// ─── Institutional dark palette ──────────────────────────────────────────────
const C = {
  // Backgrounds
  bg:          "#0B0E13",
  bgSurface:   "#111620",
  bgCard:      "#151B27",
  bgInput:     "#0D1118",
  bgHover:     "#1A2234",

  // Borders
  border:      "#1E2835",
  borderFocus: "#2A3A52",
  borderOrange:"rgba(245,130,32,0.35)",

  // Text
  textPrimary:   "#E8EDF4",
  textSecondary: "#8A94A6",
  textTertiary:  "#4A5568",
  textMuted:     "#2D3748",

  // Brand
  orange:      "#F58220",
  orangeDim:   "rgba(245,130,32,0.12)",
  orangeGlow:  "rgba(245,130,32,0.06)",
  ink:         "#111111",

  // Status
  red:         "#EF4444",
  redBg:       "rgba(239,68,68,0.06)",
  redBorder:   "rgba(239,68,68,0.20)",
  amber:       "#F59E0B",
  amberBg:     "rgba(245,158,11,0.06)",
  amberBorder: "rgba(245,158,11,0.20)",
  green:       "#10B981",
  greenGlow:   "rgba(16,185,129,0.5)",

  // Fonts
  fontHead: "'Manrope','IBM Plex Sans',sans-serif",
  fontUI:   "'IBM Plex Sans','Inter',sans-serif",
  fontMono: "'IBM Plex Mono','JetBrains Mono',monospace",
} as const;

// ─── Environment detection (never shows "demo") ─────────────────────────────
const APP_ENV = (process.env.NEXT_PUBLIC_APP_ENV ?? "production").toLowerCase();
const SHOW_ENV_BADGE = APP_ENV !== "production" && APP_ENV !== "demo";
const ENV_LABEL = APP_ENV === "dev" ? "DEVELOPMENT" : APP_ENV.toUpperCase();

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

// ─── Eye icons (password visibility) ─────────────────────────────────────────
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

// ─── ORDR Terminal Logo (large, bold) ────────────────────────────────────────
function ORDRLogo({ size = 64 }: { size?: number }) {
  // Scale factor: at size=64, the mark is 64px tall
  // Original mark occupies ~108px height in source coordinates
  const scale = size / 108;
  // Mark width is ~132px in source → scaled width
  const markW = 132 * scale;
  // Text spacing
  const textX = markW + 16 * scale;
  const totalH = size;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 420 108"
      fill="none"
      style={{ height: size, width: "auto", display: "block" }}
      aria-label="ORDR Terminal"
    >
      {/* Knotwork mark: 4 interlocked rings + arrow */}
      <g transform="translate(66,54)">
        <circle cx="-32" cy="0" r="34" stroke="#FFFFFF" strokeWidth="10" fill="none"/>
        <circle cx="32" cy="0" r="34" stroke="#FFFFFF" strokeWidth="10" fill="none"/>
        <circle cx="0" cy="-20" r="34" stroke="#FFFFFF" strokeWidth="10" fill="none"/>
        <circle cx="0" cy="20" r="34" stroke="#FFFFFF" strokeWidth="10" fill="none"/>
        <line x1="18" y1="-30" x2="46" y2="-52" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round"/>
        <polyline points="28,-52 46,-52 46,-34" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </g>
      {/* ORDR wordmark */}
      <text x="148" y="48" fontFamily="'Manrope','Arial Black',sans-serif" fontWeight="800" fontSize="46" letterSpacing="8" fill="#FFFFFF">ORDR</text>
      {/* TERMINAL sub-label in brand orange */}
      <text x="150" y="84" fontFamily="'Manrope','Arial Black',sans-serif" fontWeight="800" fontSize="28" letterSpacing="8" fill="#F58220">TERMINAL</text>
    </svg>
  );
}

// ─── Subtle grid background ──────────────────────────────────────────────────
function GridBackground() {
  return (
    <>
      {/* Micro grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: "32px 32px",
        pointerEvents: "none",
      }} />
      {/* Center vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${C.orangeGlow} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      {/* Edge fade */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at center, transparent 40%, ${C.bg} 100%)`,
        pointerEvents: "none",
      }} />
    </>
  );
}

// ─── Status bar ──────────────────────────────────────────────────────────────
function StatusBar() {
  const [ts, setTs] = useState("──:──:── ET");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const nyTime = d.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      });
      setTs(`${nyTime} ET`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const sep: React.CSSProperties = { color: C.textMuted, margin: "0 2px" };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, height: 32,
      background: C.bgSurface,
      borderTop: `1px solid ${C.border}`,
      display: "flex", alignItems: "center",
      padding: "0 24px", gap: 14,
      fontFamily: C.fontMono, fontSize: "0.6rem",
      color: C.textTertiary, letterSpacing: "0.09em",
      zIndex: 20,
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: C.green, boxShadow: `0 0 6px ${C.greenGlow}`,
          display: "inline-block",
        }} />
        <span style={{ color: C.textSecondary, letterSpacing: "0.07em" }}>SYSTEMS ONLINE</span>
      </span>
      <span style={sep}>·</span>
      <span>TLS 1.3</span>
      <span style={sep}>·</span>
      <span>AES-256</span>
      <span style={sep}>·</span>
      <span style={{ color: C.textSecondary, fontWeight: 500 }}>SESSION AUDIT ACTIVE</span>
      {SHOW_ENV_BADGE && (
        <>
          <span style={sep}>·</span>
          <span style={{
            color: C.orange,
            fontWeight: 600,
            letterSpacing: "0.1em",
          }}>{ENV_LABEL}</span>
        </>
      )}
      <span style={{ marginLeft: "auto", color: C.textSecondary, fontWeight: 600 }}>{ts}</span>
    </div>
  );
}

// ─── Main login page ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const [username,   setUsername]   = useState("");
  const [password,   setPassword]  = useState("");
  const [showPwd,    setShowPwd]   = useState(false);
  const [capsLock,   setCapsLock]  = useState(false);
  const [loading,    setLoading]   = useState(false);
  const [error,      setError]     = useState<string | null>(null);
  const [errKind,    setErrKind]   = useState<ErrKind | null>(null);
  const [warmingUp,  setWarmingUp] = useState(false);
  const [mounted,    setMounted]   = useState(false);
  const [focusField, setFocusField] = useState<"user" | "pass" | null>(null);

  // MFA challenge state
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

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    usernameRef.current?.focus();
    return () => {
      clearTimeout(t);
      if (warmupRef.current) clearTimeout(warmupRef.current);
    };
  }, []);

  const clearError = () => { setError(null); setErrKind(null); };

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
      // Check MFA status
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
      } catch {
        // Fail-open for MFA status check
      }
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

  // ─── Common input styles ───────────────────────────────────────────────────
  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    fontFamily: C.fontUI,
    fontSize: "0.875rem",
    fontWeight: 400,
    color: C.textPrimary,
    background: C.bgInput,
    border: `1.5px solid ${C.border}`,
    borderRadius: 4,
    outline: "none",
    boxSizing: "border-box",
    caretColor: C.orange,
    transition: "border-color 150ms, box-shadow 150ms",
    letterSpacing: "0.01em",
  };

  const inputFocused: React.CSSProperties = {
    borderColor: C.borderFocus,
    boxShadow: `0 0 0 3px rgba(245,130,32,0.08)`,
  };

  const inputErrorStyle: React.CSSProperties = {
    borderColor: C.red,
    boxShadow: `0 0 0 3px ${C.redBg}`,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: C.fontMono,
    fontSize: "0.625rem",
    fontWeight: 600,
    color: C.textSecondary,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  };

  // ─── MFA Challenge ─────────────────────────────────────────────────────────
  const mfaContent = mfaChallenge ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{
          fontFamily: C.fontHead, fontSize: "1.25rem", fontWeight: 800,
          color: C.textPrimary, margin: 0, letterSpacing: "-0.02em",
        }}>
          MFA Verification
        </h2>
        <p style={{
          fontFamily: C.fontUI, fontSize: "0.8125rem",
          color: C.textSecondary, margin: "8px 0 0", lineHeight: 1.6,
        }}>
          Enter your 6-digit authenticator code to complete authentication.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
            ...inputBase,
            fontFamily: C.fontMono,
            fontSize: "1.5rem",
            fontWeight: 700,
            letterSpacing: "0.3em",
            textAlign: "center",
            ...(mfaError ? inputErrorStyle : {}),
            opacity: mfaLoading ? 0.5 : 1,
            cursor: mfaLoading ? "not-allowed" : "text",
          }}
          aria-label="6-digit MFA code"
        />
      </div>

      {mfaError && (
        <div style={{
          padding: "10px 14px",
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          borderLeft: `3px solid ${C.red}`, borderRadius: 4,
          fontFamily: C.fontMono, fontSize: "0.6875rem",
          color: C.red, letterSpacing: "0.06em",
        }}>
          ⊘ {mfaError}
        </div>
      )}

      <button
        onClick={handleMfaVerify}
        disabled={mfaLoading || mfaCode.length !== 6}
        style={{
          width: "100%", padding: "14px",
          fontFamily: C.fontHead, fontSize: "0.8125rem", fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: "#000000",
          background: mfaLoading ? C.textMuted : C.orange,
          border: "none", borderRadius: 4, cursor: mfaLoading ? "not-allowed" : "pointer",
          transition: "all 150ms",
          opacity: (mfaLoading || mfaCode.length !== 6) ? 0.5 : 1,
        }}
      >
        {mfaLoading ? "VERIFYING…" : "VERIFY & CONTINUE"}
      </button>
    </div>
  ) : null;

  // ─── Login form ────────────────────────────────────────────────────────────
  const loginForm = (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Form header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{
          fontFamily: C.fontHead,
          fontSize: "1.125rem",
          fontWeight: 700,
          color: C.textPrimary,
          margin: 0,
          letterSpacing: "-0.01em",
        }}>
          Secure Access
        </h2>
        <p style={{
          fontFamily: C.fontUI,
          fontSize: "0.8125rem",
          color: C.textSecondary,
          margin: "6px 0 0",
          lineHeight: 1.5,
        }}>
          Authenticate to access ORDR Terminal
        </p>
      </div>

      {/* Error banner */}
      {error && errCfg && (
        <div style={{
          padding: "12px 14px",
          background: errCfg.bg,
          border: `1px solid ${errCfg.border}`,
          borderLeft: `3px solid ${errCfg.color}`,
          borderRadius: 4,
          marginBottom: 20,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{
            fontFamily: C.fontMono, fontSize: "0.625rem", fontWeight: 700,
            color: errCfg.color, letterSpacing: "0.1em",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>{errCfg.icon}</span>
            <span>{errCfg.label}</span>
          </div>
          <div style={{
            fontFamily: C.fontUI, fontSize: "0.75rem",
            color: errCfg.color, opacity: 0.85, lineHeight: 1.5,
          }}>
            {errCfg.body(error)}
          </div>
        </div>
      )}

      {/* Warmup overlay */}
      {warmingUp && (
        <div style={{
          padding: "12px 14px",
          background: C.amberBg,
          border: `1px solid ${C.amberBorder}`,
          borderLeft: `3px solid ${C.amber}`,
          borderRadius: 4,
          marginBottom: 20,
          fontFamily: C.fontMono, fontSize: "0.6875rem",
          color: C.amber, letterSpacing: "0.06em",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            display: "inline-block",
            animation: "spin 1s linear infinite",
          }}>◷</span>
          Server initializing — cold start may take up to 30 seconds…
        </div>
      )}

      {/* User ID */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <label style={labelStyle}>User ID</label>
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
          style={{
            ...inputBase,
            ...(focusField === "user" ? inputFocused : {}),
            ...(inputHasError ? inputErrorStyle : {}),
            opacity: loading ? 0.5 : 1,
          }}
          aria-label="User ID"
        />
      </div>

      {/* Access credential */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        <label style={labelStyle}>Access Credential</label>
        <div style={{ position: "relative" }}>
          <input
            type={showPwd ? "text" : "password"}
            value={password}
            onChange={e => { setPassword(e.target.value); clearError(); }}
            onFocus={() => setFocusField("pass")}
            onBlur={() => setFocusField(null)}
            onKeyDown={e => setCapsLock(e.getModifierState("CapsLock"))}
            placeholder="Enter your credential"
            disabled={loading}
            autoComplete="current-password"
            style={{
              ...inputBase,
              paddingRight: 48,
              ...(focusField === "pass" ? inputFocused : {}),
              ...(inputHasError ? inputErrorStyle : {}),
              opacity: loading ? 0.5 : 1,
            }}
            aria-label="Password"
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            tabIndex={-1}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", padding: 4,
              color: C.textTertiary, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            aria-label={showPwd ? "Hide password" : "Show password"}
          >
            {showPwd ? <IconEyeOpen /> : <IconEyeClosed />}
          </button>
        </div>
        {capsLock && (
          <span style={{
            fontFamily: C.fontMono, fontSize: "0.6rem",
            color: C.amber, letterSpacing: "0.08em",
          }}>
            ⚠ CAPS LOCK IS ON
          </span>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          padding: "14px",
          fontFamily: C.fontHead,
          fontSize: "0.8125rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: loading ? C.textTertiary : "#000000",
          background: loading ? C.textMuted : C.orange,
          border: "none",
          borderRadius: 4,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "all 150ms",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
            AUTHENTICATING…
          </span>
        ) : "AUTHENTICATE"}
      </button>
    </form>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: C.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      overflow: "auto",
      opacity: mounted ? 1 : 0,
      transition: "opacity 400ms ease",
    }}>
      <GridBackground />

      {/* Main content */}
      <div style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column",
        alignItems: "center",
        width: "100%",
        maxWidth: 440,
        padding: "0 24px 64px",
      }}>
        {/* Logo — large, bold, commanding */}
        <div style={{
          marginBottom: 48,
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <ORDRLogo size={72} />
        </div>

        {/* Divider line */}
        <div style={{
          width: 48, height: 2, background: C.orange,
          marginBottom: 40, opacity: 0.7,
        }} />

        {/* Form card */}
        <div style={{
          width: "100%",
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: "32px 28px",
          boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.5)`,
        }}>
          {mfaChallenge ? mfaContent : loginForm}
        </div>

        {/* Trust indicators */}
        <div style={{
          marginTop: 28,
          display: "flex", flexWrap: "wrap",
          justifyContent: "center", gap: 6,
        }}>
          {[
            "256-BIT ENCRYPTION",
            "HASH-CHAINED AUDIT",
            "RBAC ENFORCED",
            "SOD COMPLIANT",
          ].map(badge => (
            <span key={badge} style={{
              fontFamily: C.fontMono,
              fontSize: "0.5625rem",
              fontWeight: 500,
              letterSpacing: "0.1em",
              color: C.textTertiary,
              padding: "4px 10px",
              border: `1px solid ${C.border}`,
              borderRadius: 3,
            }}>
              {badge}
            </span>
          ))}
        </div>

        {/* Copyright */}
        <div style={{
          marginTop: 24,
          fontFamily: C.fontMono,
          fontSize: "0.5625rem",
          color: C.textMuted,
          letterSpacing: "0.08em",
          textAlign: "center",
          lineHeight: 1.8,
        }}>
          ORDR Terminal v1.0 · Institutional FX Hedge Governance
          <br />
          © {new Date().getFullYear()} Synexiun. All rights reserved.
        </div>
      </div>

      <StatusBar />

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
