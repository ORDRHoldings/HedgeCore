"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import Image from "next/image";
import { classifyError, type ErrKind } from "@/lib/auth/loginClassifier";

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const C = {
  cream:       "#FAF8F4",
  stone:       "#F2EFE9",
  stoneDeep:   "#E8E3DA",
  ink:         "#1A1714",
  inkMid:      "#3D3830",
  inkLight:    "#8A8278",
  inkSub:      "#6B6460",       // E3: contrast-corrected subtitle (was inkLight)
  inkFaint:    "#C4BDB4",
  orange:      "#D97218",       // E3: darkened from #F58220 for WCAG AA large-text compliance
  orangeMid:   "rgba(217,114,24,0.12)",
  white:       "#FFFFFF",
  rule:        "rgba(26,23,20,0.07)",
  ruleStrong:  "rgba(26,23,20,0.13)",
  red:         "#B91C1C",
  redBg:       "rgba(185,28,28,0.05)",
  redBorder:   "rgba(185,28,28,0.18)",
  amber:       "#92400E",
  amberBg:     "rgba(146,64,14,0.05)",
  amberBorder: "rgba(146,64,14,0.20)",
  fontHead:    "'Manrope','IBM Plex Sans',sans-serif",
  fontUI:      "'IBM Plex Sans','Inter',sans-serif",
  fontMono:    "'IBM Plex Mono','JetBrains Mono',monospace",
} as const;

// ─── B3: Environment badge ─────────────────────────────────────────────────────
const APP_ENV        = (process.env.NEXT_PUBLIC_APP_ENV ?? "demo").toLowerCase();
const SHOW_ENV_BADGE = APP_ENV !== "production";
const ENV_LABEL      = APP_ENV === "dev" ? "DEV" : "DEMO";
const ENV_COLOR      = APP_ENV === "dev" ? "#1E3A8A"              : C.amber;
const ENV_BG         = APP_ENV === "dev" ? "rgba(30,58,138,0.08)" : C.amberBg;
const ENV_BORDER     = APP_ENV === "dev" ? "rgba(30,58,138,0.25)" : C.amberBorder;

// D3 + C3: updated copy throughout
// ErrKind and classifyError imported from @/lib/auth/loginClassifier
const ERR_MAP: Record<ErrKind, {
  icon: string; label: string;
  body: (raw: string) => string;
  color: string; bg: string; border: string;
}> = {
  auth: {
    icon: "⊘", label: "AUTHENTICATION FAILED",
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
    body: () => "Access attempts exceeded threshold. Observe a 60-second cooldown before retrying.",
    color: C.amber, bg: C.amberBg, border: C.amberBorder,
  },
  server: {
    icon: "⚠", label: "SERVER ERROR",
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

// ─── Geometry canvas — Fibonacci golden spiral ────────────────────────────────
// A4: quieted — grid 0.07 opacity, spiral max 0.55, no fib annotations, φ 0.18
function GeometryPanel() {
  const U   = 5.0;
  const fib = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];

  type Rect = { x: number; y: number; w: number; h: number; n: number; idx: number };
  const rects: Rect[] = [];

  const CX = 380, CY = 430;
  let rx = CX - U, ry = CY - U / 2;
  let rw = 2 * U,  rh = U;
  rects.push({ x: CX - U, y: CY - U / 2, w: U, h: U, n: 1, idx: 0 });
  rects.push({ x: CX,     y: CY - U / 2, w: U, h: U, n: 1, idx: 1 });

  const DIRS = [0, 1, 2, 3];
  let dirIdx = 0;

  for (let i = 2; i < fib.length; i++) {
    const side = fib[i] * U;
    const dir  = DIRS[dirIdx % 4];
    let nx: number, ny: number, nw: number, nh: number;

    if      (dir === 0) { nx = rx;        ny = ry - side; nw = rw;   nh = side; ry = ny; rh += side; }
    else if (dir === 1) { nx = rx - side; ny = ry;        nw = side; nh = rh;   rx = nx; rw += side; }
    else if (dir === 2) { nx = rx;        ny = ry + rh;   nw = rw;   nh = side;          rh += side; }
    else                { nx = rx + rw;   ny = ry;        nw = side; nh = rh;            rw += side; }

    rects.push({ x: nx, y: ny, w: nw, h: nh, n: fib[i], idx: i });
    dirIdx++;
  }

  type Arc = { cx: number; cy: number; r: number; sa: number };
  const arcs: Arc[] = [];

  const PIVOTS: ('BR' | 'BL' | 'TL' | 'TR')[] = ['BR', 'BL', 'BL', 'BR', 'TR', 'TL', 'TL', 'TR'];
  const SA_MAP = [90, 0, 180, 270, 0, 90, 270, 180];

  for (let i = 0; i < rects.length && i < 10; i++) {
    const r   = rects[i];
    const piv = PIVOTS[i % 8];
    const pcx = piv.includes('R') ? r.x + r.w : r.x;
    const pcy = piv.includes('B') ? r.y + r.h : r.y;
    arcs.push({ cx: pcx, cy: pcy, r: Math.max(r.w, r.h), sa: SA_MAP[i % 8] });
  }

  function arcPath(a: Arc): string {
    const R  = (deg: number) => (deg * Math.PI) / 180;
    const ea = a.sa + 90;
    const x1 = a.cx + a.r * Math.cos(R(a.sa));
    const y1 = a.cy + a.r * Math.sin(R(a.sa));
    const x2 = a.cx + a.r * Math.cos(R(ea));
    const y2 = a.cy + a.r * Math.sin(R(ea));
    return `M ${x1.toFixed(2)},${y1.toFixed(2)} A ${a.r.toFixed(2)},${a.r.toFixed(2)} 0 0,1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      background: C.cream,
      overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Micro grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(${C.rule} 1px, transparent 1px),
          linear-gradient(90deg, ${C.rule} 1px, transparent 1px)
        `,
        backgroundSize: "24px 24px",
        opacity: 0.65,
      }} />

      {/* A1: corner vignette to anchor as texture */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at center, transparent 35%, ${C.cream} 100%)`,
        opacity: 0.55,
        pointerEvents: "none",
      }} />

      {/* F2: preserveAspectRatio for wide screens */}
      <svg
        viewBox="0 0 760 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ width: "100%", height: "100%", maxWidth: 760, overflow: "visible" }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* A4: grid opacity 0.13 → 0.07 */}
        <g opacity="0.07" stroke={C.inkMid} strokeWidth="0.75" fill="none">
          {rects.slice(2).map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />
          ))}
        </g>

        {/* A4: Fibonacci number annotations REMOVED */}

        {/* A4: spiral opacity max 0.55, strokeWidth max 1.4 */}
        {arcs.map((a, i) => {
          const opacity = i < 2 ? 0.10 : i < 4 ? 0.22 : i < 7 ? 0.38 : 0.55;
          const sw      = i < 2 ? 0.6  : i < 5 ? 0.9  : i < 8 ? 1.2  : 1.4;
          return (
            <path
              key={i}
              d={arcPath(a)}
              stroke={C.orange}
              strokeWidth={sw}
              fill="none"
              strokeLinecap="round"
              opacity={opacity}
            />
          );
        })}

        {/* A4: φ label opacity 0.30 → 0.18 */}
        <text
          x="710" y="868"
          textAnchor="end"
          fontFamily={C.fontMono}
          fontSize="10"
          fill={C.inkFaint}
          opacity="0.18"
          letterSpacing="0.06em"
        >
          φ = 1.6180339887
        </text>
      </svg>
    </div>
  );
}

// ─── Status bar — C4 ──────────────────────────────────────────────────────────
// C4: NY time, SESSION AUDIT ACTIVE elevated, RENDER.COM free tier, no AUTH GATEWAY v1.0
function StatusBar() {
  const [ts, setTs] = useState("──:──:── ET");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const nyTime = d.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour:     "2-digit",
        minute:   "2-digit",
        second:   "2-digit",
        hour12:   false,
      });
      setTs(`${nyTime} ET`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const dot: React.CSSProperties = {
    width: 5, height: 5, borderRadius: "50%",
    background: "#22C55E", boxShadow: "0 0 6px rgba(34,197,94,0.55)",
    display: "inline-block", verticalAlign: "middle",
  };

  const sep: React.CSSProperties = { color: C.inkFaint };

  return (
    <div
      className="status-bar"
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, height: 28,
        background: C.white, borderTop: `1px solid ${C.stoneDeep}`,
        display: "flex", alignItems: "center", padding: "0 24px", gap: 14,
        fontFamily: C.fontMono, fontSize: "0.6rem", color: C.inkLight,
        letterSpacing: "0.09em", zIndex: 20,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={dot} />
        <span style={{ color: C.inkMid, letterSpacing: "0.07em" }}>SYSTEMS ONLINE</span>
      </span>
      <span style={sep}>·</span>
      <span style={{ color: C.inkFaint }}>TLS 1.3</span>
      <span style={sep}>·</span>
      <span style={{ color: C.inkMid, fontWeight: 500 }}>SESSION AUDIT ACTIVE</span>
      <span style={sep}>·</span>
      <span style={{ color: C.inkFaint }}>RENDER.COM · FREE TIER</span>
      <span style={{ marginLeft: "auto", color: C.inkMid, fontWeight: 600 }}>{ts}</span>
    </div>
  );
}

// ─── Main login page ──────────────────────────────────────────────────────────
export default function LoginPage() {
  const [username,   setUsername]   = useState("");
  const [password,   setPassword]   = useState("");
  const [showPwd,    setShowPwd]    = useState(false);
  const [capsLock,   setCapsLock]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [errKind,    setErrKind]    = useState<ErrKind | null>(null);
  const [warmingUp,  setWarmingUp]  = useState(false);
  const [mounted,    setMounted]    = useState(false);
  const [focusField, setFocusField] = useState<"user" | "pass" | null>(null);

  const { login }   = useAuth();
  const router      = useRouter();
  const usernameRef = useRef<HTMLInputElement>(null);
  const warmupRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // E1: warmupRef cleanup on unmount
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    usernameRef.current?.focus();
    return () => {
      clearTimeout(t);
      if (warmupRef.current) clearTimeout(warmupRef.current);
    };
  }, []);

  const clearError = () => { setError(null); setErrKind(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // D5: empty field guard — no backend hit on empty submission
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
      router.push("/dashboard");
    } else {
      const msg = result.error ?? "Authentication failed";
      setError(msg);
      setErrKind(classifyError(msg));
    }
  };

  const inputHasError = !!error && errKind === "auth";
  const errCfg        = errKind ? ERR_MAP[errKind] : null;

  // D1: enhanced input style with proper disabled state
  const inputStyle = (focused: boolean, hasError: boolean): React.CSSProperties => ({
    width:       "100%",
    padding:     "12px 16px",
    fontFamily:  C.fontMono,
    fontSize:    "0.875rem",
    color:       loading ? C.inkFaint : C.ink,
    background:  loading ? C.stoneDeep : focused ? C.white : C.cream,
    border:      `1.5px solid ${hasError ? C.red : focused ? C.orange : C.stoneDeep}`,
    borderRadius: 3,
    outline:     "none",
    transition:  "border-color 160ms ease, background 160ms ease, box-shadow 160ms ease",
    boxSizing:   "border-box",
    boxShadow:   hasError
      ? "0 0 0 3px rgba(185,28,28,0.08)"
      : focused
      ? `0 0 0 3px ${C.orangeMid}`
      : "none",
    caretColor:    hasError ? C.red : C.orange,
    opacity:       loading ? 0.55 : 1,
    cursor:        loading ? "not-allowed" : "text",
    pointerEvents: loading ? "none" : undefined,
  });

  const divider: React.CSSProperties = {
    borderTop:  `1px solid ${C.stoneDeep}`,
    margin:     "32px 0 0",
    paddingTop: 20,
  };

  // E4: unified caps lock handler for both fields
  const handleCapsLock = (e: React.KeyboardEvent) => {
    if (e.getModifierState) setCapsLock(e.getModifierState("CapsLock"));
  };

  return (
    <>
      <style>{`
        @keyframes ordr-spin    { to { transform: rotate(360deg); } }
        @keyframes onAutoFillStart { from {} to {} }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        input::placeholder          { color: #9E968D; opacity: 1; }
        input:disabled::placeholder { color: ${C.inkFaint}; }
        input:-webkit-autofill,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 100px ${C.cream} inset !important;
          -webkit-text-fill-color: ${C.ink} !important;
          animation-name: onAutoFillStart;
        }
        .btn-session {
          transition: background 160ms ease, box-shadow 160ms ease, transform 100ms ease !important;
        }
        .btn-session:hover:not(:disabled) {
          background: #C06510 !important;
          box-shadow: 0 4px 22px rgba(217,114,24,0.30) !important;
        }
        .btn-session:active:not(:disabled) { transform: translateY(1px) !important; }
        .pwd-toggle {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; padding: 2px 4px;
          color: ${C.inkLight}; cursor: pointer; display: flex; align-items: center;
          border-radius: 2px;
        }
        .pwd-toggle:hover { color: ${C.inkMid}; }
        .pwd-toggle:disabled { opacity: 0.4; cursor: not-allowed; }
        .pwd-toggle:focus-visible { outline: 2px solid ${C.orange}; outline-offset: 1px; }
        @media (max-width: 768px) {
          .geo-panel   { display: none !important; }
          .form-shell  { padding: 28px 20px !important; padding-bottom: 48px !important; }
          .form-card   { max-width: 100% !important; }
          .logo-lockup { margin-bottom: 28px !important; padding-bottom: 20px !important; }
          .status-bar  { padding: 0 16px !important; }
        }
      `}</style>

      {/* F2: cream wrapper for ultra-wide gutters */}
      <div style={{ background: C.cream, minHeight: "100vh" }}>
        <div style={{
          minHeight:   "100vh",
          display:     "flex",
          fontFamily:  C.fontUI,
          maxWidth:    1680,
          margin:      "0 auto",
          paddingBottom: 28,
        }}>

          {/* ══ LEFT — Geometry canvas ══ */}
          {/* A1: 58% → 52% | F2: maxWidth 960 */}
          <div
            className="geo-panel"
            style={{ flex: "0 0 52%", position: "relative", minHeight: "100vh", maxWidth: 960 }}
          >
            <GeometryPanel />
            <div style={{
              position: "absolute", top: 0, right: 0, width: 1, height: "100%",
              background: `linear-gradient(180deg, transparent 0%, ${C.stoneDeep} 16%, ${C.stoneDeep} 84%, transparent 100%)`,
            }} />
          </div>

          {/* ══ RIGHT — Login shell ══ */}
          {/* A1: 42% → 48% | A2: padding 52/52 → 48/40 | F2: maxWidth 720 */}
          <div
            className="form-shell"
            style={{
              flex:            "1 1 48%",
              display:         "flex",
              flexDirection:   "column",
              alignItems:      "center",
              justifyContent:  "center",
              padding:         "48px 40px",
              paddingBottom:   "calc(48px + 4vh)",
              minHeight:       "100vh",
              position:        "relative",
              maxWidth:        720,
            }}
          >
            {/* A2: maxWidth 480, minWidth 320 | animated entry */}
            <div
              className="form-card"
              style={{
                width:     "100%",
                maxWidth:  480,
                minWidth:  320,
                opacity:   mounted ? 1 : 0,
                transform: mounted ? "none" : "translateY(12px)",
                transition:"opacity 480ms cubic-bezier(0.16,1,0.3,1), transform 480ms cubic-bezier(0.16,1,0.3,1)",
              }}
            >

              {/* ── B1/B2/B3: Logo lockup ── */}
              <div
                className="logo-lockup"
                style={{ marginBottom: 44, paddingBottom: 32, borderBottom: `1px solid ${C.stoneDeep}` }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>

                  {/* B1: mark 76 → 64px */}
                  <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                    <Image
                      src="/ordr-mark.png"
                      alt="ORDR Terminal"
                      fill
                      sizes="64px"
                      style={{ objectFit: "contain" }}
                      priority
                    />
                  </div>

                  {/* B1: rule 56 → 44px, ruleStrong color */}
                  <div style={{ width: 1, height: 44, background: C.ruleStrong, flexShrink: 0 }} />

                  {/* Wordmark + descriptor + badge */}
                  <div>
                    {/* B1: ORDR heavy-ink, TERMINAL light-faint — weight contrast */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 5 }}>
                      <span style={{
                        fontFamily:    C.fontHead,
                        fontWeight:    800,
                        fontSize:      "1.125rem",
                        letterSpacing: "0.12em",
                        color:         C.ink,
                        lineHeight:    1,
                      }}>ORDR</span>
                      <span style={{
                        fontFamily:    C.fontHead,
                        fontWeight:    300,
                        fontSize:      "1.125rem",
                        letterSpacing: "0.18em",
                        color:         C.inkLight,
                        lineHeight:    1,
                      }}>TERMINAL</span>
                    </div>

                    {/* B2: descriptor — prose, sentence case, inkFaint, IBM Plex Sans */}
                    <div style={{
                      fontFamily:    C.fontUI,
                      fontSize:      "0.6875rem",
                      color:         C.inkFaint,
                      letterSpacing: "0.08em",
                      lineHeight:    1,
                      marginTop:     5,
                    }}>
                      Institutional FX Risk Infrastructure
                    </div>

                    {/* B3: environment badge — hidden in production */}
                    {SHOW_ENV_BADGE && (
                      <div style={{
                        display:       "inline-flex",
                        alignItems:    "center",
                        marginTop:     8,
                        padding:       "2px 6px",
                        border:        `1px solid ${ENV_BORDER}`,
                        background:    ENV_BG,
                        borderRadius:  2,
                        fontFamily:    C.fontMono,
                        fontSize:      "0.5rem",
                        fontWeight:    700,
                        color:         ENV_COLOR,
                        letterSpacing: "0.12em",
                      }}>
                        {ENV_LABEL}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── A3: Page heading — 1.5rem / -0.03em ── */}
              <div style={{ marginBottom: 30 }}>
                <h1 style={{
                  fontFamily:    C.fontHead,
                  fontSize:      "1.5rem",
                  fontWeight:    800,
                  color:         C.ink,
                  margin:        0,
                  lineHeight:    1.15,
                  letterSpacing: "-0.03em",
                }}>
                  Initialize Session
                </h1>
                {/* A3: subtitle demoted | C1: governance copy | E3: inkSub color */}
                <p style={{
                  fontFamily: C.fontUI,
                  fontSize:   "0.75rem",
                  color:      C.inkSub,
                  margin:     "6px 0 0",
                  lineHeight: 1.6,
                }}>
                  Authenticated access only. All sessions are recorded and subject to audit.
                </p>
              </div>

              {/* ── Form ── */}
              {/* E2: aria-label | D2: aria-busy */}
              <form
                onSubmit={handleSubmit}
                noValidate
                aria-label="ORDR Terminal authentication"
                aria-busy={loading}
              >

                {/* User ID / Email — C2 */}
                <div style={{ marginBottom: 18 }}>
                  <label
                    htmlFor="ordr-username"
                    style={{
                      display:       "block",
                      fontFamily:    C.fontMono,
                      fontSize:      "0.625rem",
                      fontWeight:    700,
                      color:         focusField === "user" ? C.orange : C.inkMid,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      marginBottom:  7,
                      transition:    "color 160ms ease",
                    }}
                  >
                    User ID / Email
                  </label>
                  <input
                    id="ordr-username"
                    ref={usernameRef}
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); if (error) clearError(); }}
                    placeholder="user ID or email address"
                    required
                    disabled={loading}
                    autoComplete="username"
                    aria-invalid={inputHasError ? "true" : undefined}
                    aria-describedby={error ? "ordr-error" : undefined}
                    style={inputStyle(focusField === "user", inputHasError)}
                    onFocus={() => setFocusField("user")}
                    onBlur={() => { setFocusField(null); setCapsLock(false); }}
                    onKeyUp={handleCapsLock}
                    onAnimationStart={(e) => {
                      if (e.animationName === "onAutoFillStart")
                        setUsername((e.target as HTMLInputElement).value);
                    }}
                  />
                </div>

                {/* Access Credential — C2 */}
                <div style={{ marginBottom: 8 }}>
                  <label
                    htmlFor="ordr-password"
                    style={{
                      display:       "block",
                      fontFamily:    C.fontMono,
                      fontSize:      "0.625rem",
                      fontWeight:    700,
                      color:         focusField === "pass" ? C.orange : C.inkMid,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      marginBottom:  7,
                      transition:    "color 160ms ease",
                    }}
                  >
                    Access Credential
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="ordr-password"
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (error) clearError(); }}
                      placeholder="••••••••••••"
                      required
                      disabled={loading}
                      autoComplete="current-password"
                      aria-invalid={inputHasError ? "true" : undefined}
                      aria-describedby={error ? "ordr-error" : undefined}
                      style={{ ...inputStyle(focusField === "pass", inputHasError), paddingRight: 48 }}
                      onFocus={() => setFocusField("pass")}
                      onBlur={() => { setFocusField(null); setCapsLock(false); }}
                      onKeyUp={handleCapsLock}
                      onAnimationStart={(e) => {
                        if (e.animationName === "onAutoFillStart")
                          setPassword((e.target as HTMLInputElement).value);
                      }}
                    />
                    {/* D4: aria-label updated, disabled during loading */}
                    <button
                      type="button"
                      tabIndex={-1}
                      className="pwd-toggle"
                      disabled={loading}
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? "Conceal access credential" : "Reveal access credential"}
                    >
                      {showPwd ? <IconEyeClosed /> : <IconEyeOpen />}
                    </button>
                  </div>

                  {/* E2/E4: caps lock — role=status, aria-live=polite, CAPS LOCK ACTIVE */}
                  {capsLock && (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        marginTop:  6,
                        fontFamily: C.fontMono,
                        fontSize:   "0.625rem",
                        color:      C.amber,
                        letterSpacing: "0.07em",
                        display:    "flex",
                        alignItems: "center",
                        gap:        5,
                      }}
                    >
                      <span aria-hidden="true">⚠</span>
                      <span>CAPS LOCK ACTIVE</span>
                    </div>
                  )}
                </div>

                {/* D7: session duration note */}
                <div style={{
                  marginBottom:  20,
                  textAlign:     "right",
                  fontFamily:    C.fontMono,
                  fontSize:      "0.58rem",
                  color:         C.inkFaint,
                  letterSpacing: "0.06em",
                }}>
                  Session: 30 min access · 7-day refresh
                </div>

                {/* Error display — D3: server error gets <details> */}
                {error && errCfg && (
                  <div
                    id="ordr-error"
                    role="alert"
                    aria-live="assertive"
                    style={{
                      marginBottom: 20,
                      padding:      "11px 14px",
                      background:   errCfg.bg,
                      border:       `1px solid ${errCfg.border}`,
                      borderLeft:   `3px solid ${errCfg.color}`,
                      borderRadius: 3,
                    }}
                  >
                    <div style={{
                      fontFamily:    C.fontMono,
                      fontSize:      "0.58rem",
                      fontWeight:    600,
                      color:         errCfg.color,
                      letterSpacing: "0.12em",
                      marginBottom:  4,
                      display:       "flex",
                      alignItems:    "center",
                      gap:           6,
                    }}>
                      <span aria-hidden="true">{errCfg.icon}</span>
                      {errCfg.label}
                    </div>
                    <div style={{ fontFamily: C.fontUI, fontSize: "0.75rem", color: C.inkMid, lineHeight: 1.5 }}>
                      {errKind === "server"
                        ? "Authentication service unavailable. If this persists, contact your system administrator."
                        : errCfg.body(error)
                      }
                    </div>
                    {/* D3: server error technical detail in collapsible disclosure */}
                    {errKind === "server" && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{
                          fontFamily:    C.fontMono,
                          fontSize:      "0.55rem",
                          color:         C.inkFaint,
                          letterSpacing: "0.06em",
                          cursor:        "pointer",
                        }}>
                          Technical detail
                        </summary>
                        <code style={{
                          display:     "block",
                          marginTop:   4,
                          fontFamily:  C.fontMono,
                          fontSize:    "0.6rem",
                          color:       C.inkFaint,
                          wordBreak:   "break-all",
                          lineHeight:  1.5,
                        }}>
                          {error}
                        </code>
                      </details>
                    )}
                  </div>
                )}

                {/* Submit button — D2: orange spinner arc, faded-orange loading bg | C3: updated copy */}
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-session"
                  aria-label={loading ? "Authenticating, please wait" : "Initialize Session"}
                  style={{
                    width:          "100%",
                    padding:        "13px 20px",
                    fontFamily:     C.fontUI,
                    fontSize:       "0.8125rem",
                    fontWeight:     700,
                    letterSpacing:  "0.07em",
                    textTransform:  "uppercase",
                    color:          loading ? C.inkMid : C.white,
                    background:     loading ? "rgba(217,114,24,0.35)" : C.orange,
                    border:         "none",
                    borderRadius:   3,
                    cursor:         loading ? "wait" : "pointer",
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    gap:            10,
                    boxShadow:      loading ? "none" : "0 2px 14px rgba(217,114,24,0.20)",
                  }}
                >
                  {loading ? (
                    <>
                      {/* D2: 14px, orange arc on stoneDeep track */}
                      <span style={{
                        width:        14,
                        height:       14,
                        border:       `1.5px solid ${C.stoneDeep}`,
                        borderTop:    `1.5px solid ${C.orange}`,
                        borderRadius: "50%",
                        animation:    "ordr-spin 650ms linear infinite",
                        flexShrink:   0,
                      }} aria-hidden="true" />
                      <span>{warmingUp ? "Server Initializing…" : "Authenticating…"}</span>
                    </>
                  ) : (
                    <>
                      <span>Initialize Session</span>
                      {/* C3: 13 → 12px */}
                      <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                        <path d="M1.5 6.5h10M7.5 2.5l4 4-4 4"
                          stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </>
                  )}
                </button>

                {/* Cold-start extended notice */}
                {warmingUp && (
                  <div style={{
                    marginTop:    12,
                    padding:      "10px 14px",
                    background:   C.amberBg,
                    border:       `1px solid ${C.amberBorder}`,
                    borderLeft:   `3px solid ${C.amber}`,
                    borderRadius: 3,
                  }}>
                    <div style={{
                      fontFamily:    C.fontMono,
                      fontSize:      "0.58rem",
                      fontWeight:    600,
                      color:         C.amber,
                      letterSpacing: "0.12em",
                      marginBottom:  3,
                    }}>
                      ◷  SERVER COLD START
                    </div>
                    <div style={{ fontFamily: C.fontUI, fontSize: "0.73rem", color: C.inkMid, lineHeight: 1.5 }}>
                      Infrastructure initializing from cold state. Allow up to 30 seconds.
                    </div>
                  </div>
                )}
              </form>

              {/* C1: shortened footer — E3: contrast-corrected #857D75 */}
              <div style={divider}>
                <p style={{
                  fontFamily:    C.fontMono,
                  fontSize:      "0.58rem",
                  color:         "#857D75",
                  letterSpacing: "0.07em",
                  lineHeight:    1.85,
                  margin:        0,
                  textAlign:     "center",
                }}>
                  Unauthorized access is prohibited and subject to civil and criminal penalties.
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* E2: StatusBar wrapped in aria-hidden — decorative, not announced */}
      <div aria-hidden="true">
        <StatusBar />
      </div>
    </>
  );
}
