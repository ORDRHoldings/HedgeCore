"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import { classifyError, type ErrKind } from "@/lib/auth/loginClassifier";

// ─── Brand tokens (light alabaster palette — matches reference) ──────────────
const C = {
  alabaster:   "#F8FAFC",
  white:       "#FFFFFF",
  obsidian:    "#050505",
  slate900:    "#0F172A",
  slate700:    "#334155",
  slate600:    "#475569",
  slate400:    "#94A3B8",
  slate300:    "#CBD5E1",
  platinum:    "#E2E8F0",
  orange:      "#FF7A00",
  orangeGlow:  "rgba(255,122,0,0.30)",
  green:       "#10B981",
  red:         "#DC2626",
  redBg:       "rgba(220,38,38,0.06)",
  redBorder:   "rgba(220,38,38,0.20)",
  amber:       "#D97706",
  amberBg:     "rgba(217,119,6,0.06)",
  amberBorder: "rgba(217,119,6,0.20)",
  rule:        "rgba(0,0,0,0.05)",
  ruleLight:   "rgba(0,0,0,0.03)",
  fontHead:    "'Manrope','Inter',sans-serif",
  fontUI:      "'Inter','IBM Plex Sans',sans-serif",
  fontMono:    "'JetBrains Mono','IBM Plex Mono',monospace",
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

// ─── Canvas particle field (314 points for π) ───────────────────────────────
function useParticleField(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const pointsRef = useRef<{ x: number; y: number; vx: number; vy: number; r: number }[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const POINT_COUNT = 314;

    function init() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = window.innerWidth + "px";
      canvas!.style.height = window.innerHeight + "px";
      ctx!.scale(dpr, dpr);

      const pts: typeof pointsRef.current = [];
      for (let i = 0; i < POINT_COUNT; i++) {
        pts.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 1.2,
        });
      }
      pointsRef.current = pts;
    }

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = "#1e293b";
      const pts = pointsRef.current;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();

        // Connect nearby points (Fibonacci 89px limit)
        for (let j = i + 1; j < pts.length; j++) {
          const p2 = pts[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 89) {
            ctx!.beginPath();
            ctx!.strokeStyle = `rgba(30, 41, 59, ${0.1 * (1 - dist / 89)})`;
            ctx!.lineWidth = 0.5;
            ctx!.moveTo(p.x, p.y);
            ctx!.lineTo(p2.x, p2.y);
            ctx!.stroke();
          }
        }
      }
      animRef.current = requestAnimationFrame(draw);
    }

    init();
    draw();
    const handleResize = () => { init(); };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animRef.current);
    };
  }, [canvasRef]);
}

// ─── Parallax hook ───────────────────────────────────────────────────────────
function useParallax(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: MouseEvent) => {
      const x = (window.innerWidth / 2 - e.clientX) / 40;
      const y = (window.innerHeight / 2 - e.clientY) / 40;
      el.style.transform = `perspective(1000px) rotateY(${-x}deg) rotateX(${y}deg)`;
    };

    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [ref]);
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
  const [showOverlay, setShowOverlay] = useState(true);
  const [focusField, setFocusField]   = useState<"user" | "pass" | null>(null);
  const [btnHovered, setBtnHovered]   = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);

  // MFA challenge state
  const [mfaChallenge, setMfaChallenge] = useState(false);
  const [mfaToken,     setMfaToken]     = useState<string | null>(null);
  const [mfaCode,      setMfaCode]      = useState("");
  const [mfaLoading,   setMfaLoading]   = useState(false);
  const [mfaError,     setMfaError]     = useState<string | null>(null);
  const mfaInputRef = useRef<HTMLInputElement>(null);

  const { login }    = useAuth();
  const router       = useRouter();
  const usernameRef  = useRef<HTMLInputElement>(null);
  const warmupRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const prismRef     = useRef<HTMLDivElement>(null);

  // Particle field animation
  useParticleField(canvasRef);
  // Mouse parallax on form card
  useParallax(prismRef);

  useEffect(() => {
    // Dismiss entrance overlay
    const t = setTimeout(() => setShowOverlay(false), 2200);
    // Focus username field after bloom animation
    const t2 = setTimeout(() => usernameRef.current?.focus(), 1200);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
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

  // ─── Styles ────────────────────────────────────────────────────────────────

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: C.fontMono,
    fontSize: "8px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "2px",
    color: C.slate700,
    marginBottom: 8,
  };

  const inputStyle = (field: "user" | "pass", hasErr: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "13px 0",
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${hasErr ? C.red : focusField === field ? C.orange : C.platinum}`,
    fontFamily: C.fontMono,
    fontSize: "14px",
    color: C.obsidian,
    outline: "none",
    boxSizing: "border-box" as const,
    caretColor: C.orange,
    transition: "all 0.4s ease",
    transform: focusField === field ? "translateX(5px)" : "none",
    opacity: loading ? 0.5 : 1,
    letterSpacing: "0.02em",
  });

  // ─── MFA challenge content ─────────────────────────────────────────────────
  const mfaContent = mfaChallenge ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 21 }}>
      <div>
        <h2 style={{
          fontFamily: C.fontHead, fontSize: "1.125rem", fontWeight: 700,
          color: C.obsidian, margin: 0, letterSpacing: "-0.02em",
        }}>
          MFA Verification
        </h2>
        <p style={{
          fontFamily: C.fontUI, fontSize: "0.75rem",
          color: C.slate600, margin: "8px 0 0", lineHeight: 1.6,
        }}>
          Enter your 6-digit authenticator code to complete authentication.
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
            fontFamily: C.fontMono,
            fontSize: "1.5rem",
            fontWeight: 700,
            letterSpacing: "0.3em",
            textAlign: "center",
            opacity: mfaLoading ? 0.5 : 1,
          }}
          aria-label="6-digit MFA code"
        />
      </div>

      {mfaError && (
        <div style={{
          padding: "10px 14px",
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          borderLeft: `3px solid ${C.red}`, borderRadius: 2,
          fontFamily: C.fontMono, fontSize: "9px",
          color: C.red, letterSpacing: "0.06em",
        }}>
          ⊘ {mfaError}
        </div>
      )}

      <button
        onClick={handleMfaVerify}
        disabled={mfaLoading || mfaCode.length !== 6}
        className="no-scale"
        style={{
          width: "100%", padding: "21px",
          fontFamily: C.fontMono, fontSize: "10px", fontWeight: 500,
          textTransform: "uppercase", letterSpacing: "5px",
          color: "#FFFFFF",
          background: (mfaLoading || mfaCode.length !== 6) ? C.slate300 : C.obsidian,
          border: "none", borderRadius: 2,
          cursor: (mfaLoading || mfaCode.length !== 6) ? "not-allowed" : "pointer",
          transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {mfaLoading ? "VERIFYING…" : "VERIFY & CONTINUE"}
      </button>
    </div>
  ) : null;

  // ─── Login form ────────────────────────────────────────────────────────────
  const loginForm = (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Context header ── */}
      <div style={{ marginBottom: 34 }}>
        <p style={{
          fontFamily: C.fontMono,
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.25em",
          color: C.slate400,
          margin: "0 0 13px 0",
          textAlign: "center",
        }}>
          Institutional FX Hedge Governance
        </p>
        <div style={{
          width: "100%", height: 1,
          background: C.rule,
          marginBottom: 21,
        }} />
        <p style={{
          fontFamily: C.fontUI,
          fontSize: "12px",
          color: C.slate600,
          lineHeight: 1.7,
          margin: 0,
          textAlign: "center",
        }}>
          Authenticate to access deterministic hedge calculations,
          policy governance, and the execution pipeline.
        </p>
      </div>

      {/* Error banner */}
      {error && errCfg && (
        <div style={{
          padding: "12px 14px",
          background: errCfg.bg,
          border: `1px solid ${errCfg.border}`,
          borderLeft: `3px solid ${errCfg.color}`,
          borderRadius: 2,
          marginBottom: 21,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{
            fontFamily: C.fontMono, fontSize: "9px", fontWeight: 600,
            color: errCfg.color, letterSpacing: "0.1em",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>{errCfg.icon}</span>
            <span>{errCfg.label}</span>
          </div>
          <div style={{
            fontFamily: C.fontUI, fontSize: "11px",
            color: errCfg.color, opacity: 0.85, lineHeight: 1.5,
          }}>
            {errCfg.body(error)}
          </div>
        </div>
      )}

      {/* Warmup banner */}
      {warmingUp && (
        <div style={{
          padding: "12px 14px",
          background: C.amberBg,
          border: `1px solid ${C.amberBorder}`,
          borderLeft: `3px solid ${C.amber}`,
          borderRadius: 2,
          marginBottom: 21,
          fontFamily: C.fontMono, fontSize: "9px",
          color: C.amber, letterSpacing: "0.06em",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span className="login-spin">◷</span>
          Server initializing — cold start may take up to 30 seconds…
        </div>
      )}

      {/* Terminal ID */}
      <div style={{ marginBottom: 21 }}>
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
      <div style={{ marginBottom: 34 }}>
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
            style={{
              ...inputStyle("pass", inputHasError),
              paddingRight: 36,
            }}
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
              color: C.slate400, cursor: "pointer",
              display: "flex", alignItems: "center",
            }}
            aria-label={showPwd ? "Hide password" : "Show password"}
          >
            {showPwd ? <IconEyeOpen /> : <IconEyeClosed />}
          </button>
        </div>
        {capsLock && (
          <span style={{
            fontFamily: C.fontMono, fontSize: "8px", marginTop: 6,
            color: C.amber, letterSpacing: "0.08em", display: "block",
          }}>
            ⚠ CAPS LOCK IS ON
          </span>
        )}
      </div>

      {/* Submit — Establish Link */}
      <button
        type="submit"
        disabled={loading}
        className="no-scale"
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
        style={{
          width: "100%",
          padding: "21px",
          fontFamily: C.fontMono,
          fontSize: "10px",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: loading ? "5px" : btnHovered ? "8px" : "5px",
          color: loading ? C.slate400 : "#FFFFFF",
          background: loading ? C.slate300 : btnHovered ? C.orange : C.obsidian,
          border: "none",
          borderRadius: 2,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
          overflow: "hidden",
          boxShadow: btnHovered && !loading ? `0 13px 34px ${C.orangeGlow}` : "none",
        }}
      >
        {loading ? (
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span className="login-spin">⟳</span>
            AUTHENTICATING...
          </span>
        ) : "ESTABLISH LINK"}
      </button>

      {/* ── Security & compliance badges ── */}
      <div style={{
        marginTop: 34,
        borderTop: `1px solid ${C.rule}`,
        paddingTop: 21,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 8,
      }}>
        {["AES-256", "HASH-CHAINED AUDIT", "RBAC", "4-EYES APPROVAL"].map(badge => (
          <span key={badge} style={{
            fontFamily: C.fontMono,
            fontSize: "7px",
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: C.slate400,
            padding: "3px 8px",
            border: `1px solid ${C.platinum}`,
            borderRadius: 1,
          }}>
            {badge}
          </span>
        ))}
      </div>

      {/* Footer status */}
      <div style={{
        marginTop: 21,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: C.fontMono,
        fontSize: "8px",
        color: C.slate400,
        letterSpacing: "0.06em",
      }}>
        <span>© {new Date().getFullYear()} SYNEXIUN</span>
        <span style={{ color: C.green, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: C.green, display: "inline-block",
            boxShadow: `0 0 6px rgba(16,185,129,0.5)`,
          }} />
          ENCRYPTION ACTIVE
        </span>
      </div>
    </form>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: C.alabaster,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      fontFamily: C.fontUI,
      color: C.obsidian,
    }}>
      {/* ── Geometric initialization overlay (entrance bloom) ── */}
      <div
        className="login-init-overlay"
        style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
          animation: "loginFadeOut 1.2s cubic-bezier(0.8, 0, 0.2, 1) forwards 1s",
          ...(showOverlay ? {} : { opacity: 0, visibility: "hidden" as const }),
        }}
      >
        <div style={{
          position: "absolute",
          border: "1px solid rgba(0,0,0,0.05)",
          animation: "loginGrowBox 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }} />
      </div>

      {/* ── Canvas particle field ── */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", top: 0, left: 0,
          width: "100%", height: "100%",
          zIndex: 1, opacity: 0.6,
          pointerEvents: "none",
        }}
      />

      {/* ── Corner telemetry ── */}
      <div className="login-telemetry" style={{ top: 21, left: 21 }}>
        SYS_LOAD: φ=1.618<br/>NODE_SYNC: TRUE
      </div>
      <div className="login-telemetry" style={{ top: 21, right: 21, textAlign: "right" }}>
        CLOCK_PI: 3.1415...<br/>LOC: [0.00, 0.00]
      </div>
      <div className="login-telemetry" style={{ bottom: 21, left: 21 }}>
        SEC_LEVEL: QUANTUM<br/>ENC: AES-256
      </div>
      <div className="login-telemetry" style={{ bottom: 21, right: 21, textAlign: "right" }}>
        ORDR_OS v4.0
        {SHOW_ENV_BADGE && <><br/>{ENV_LABEL}</>}
        <br/>HANDSHAKE: WAIT
      </div>

      {/* ── The Terminal Prism (main card) ── */}
      <div
        ref={prismRef}
        style={{
          position: "relative",
          zIndex: 10,
          width: 420,
          padding: "48px 44px",
          background: "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid rgba(255, 255, 255, 0.6)",
          borderRadius: 3,
          boxShadow: "0 55px 144px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(0,0,0,0.02)",
          animation: "loginTerminalBloom 1.618s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.5s",
          // Start state (before animation)
          transform: "scale(0.6)",
          opacity: 0,
          willChange: "transform, opacity, filter",
        }}
      >
        {/* Logo — PNG, bold, stunning, visible */}
        <div
          style={{ textAlign: "center", marginBottom: 34 }}
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
        >
          <div style={{
            transition: "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
            transform: logoHovered ? "scale(1.05)" : "scale(1)",
            display: "inline-block",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ordr-logo-horizontal.png"
              alt="ORDR Terminal"
              style={{
                width: 260,
                height: "auto",
                display: "block",
              }}
            />
          </div>
        </div>

        {/* Form content */}
        {mfaChallenge ? mfaContent : loginForm}
      </div>

      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes loginGrowBox {
          0%   { width: 0; height: 0; opacity: 1; }
          100% { width: calc(100vw * 1.618); height: calc(100vh * 1.618); opacity: 0; }
        }
        @keyframes loginFadeOut {
          to { opacity: 0; visibility: hidden; }
        }
        @keyframes loginTerminalBloom {
          0%   { transform: scale(0.6); opacity: 0; filter: blur(10px); }
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
          font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
          font-size: 9px;
          color: #94A3B8;
          opacity: 0.5;
          pointer-events: none;
          z-index: 5;
          letter-spacing: 0.04em;
          line-height: 1.7;
        }
        .login-init-overlay,
        .login-init-overlay * {
          cursor: default;
        }
      `}</style>
    </div>
  );
}
