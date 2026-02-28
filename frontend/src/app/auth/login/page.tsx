"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const C = {
  cream:       "#FAF8F4",
  stone:       "#F2EFE9",
  stoneDeep:   "#E8E3DA",
  ink:         "#1A1714",
  inkMid:      "#3D3830",
  inkLight:    "#8A8278",
  inkFaint:    "#C4BDB4",
  orange:      "#F58220",
  orangeMid:   "rgba(245,130,32,0.12)",
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

// ─── Environment badge ────────────────────────────────────────────────────────
const ENV_LABEL =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? "DEMO"
  : process.env.NODE_ENV === "development"     ? "DEV"
  : "PROD";

const ENV_STYLE: React.CSSProperties =
  ENV_LABEL === "PROD"
    ? { background: "rgba(21,128,61,0.09)",    color: "#15803D", border: "1px solid rgba(21,128,61,0.22)"    }
    : ENV_LABEL === "DEV"
    ? { background: "rgba(30,58,138,0.09)",    color: "#1E3A8A", border: "1px solid rgba(30,58,138,0.22)"    }
    : { background: "rgba(245,130,32,0.10)",   color: "#B45309", border: "1px solid rgba(245,130,32,0.30)"   };

// ─── Error classification ─────────────────────────────────────────────────────
type ErrKind = "auth" | "warmup" | "rate" | "server";

function classifyError(msg: string): ErrKind {
  const m = msg.toLowerCase();
  if (m.includes("waking") || m.includes("moment") || m.includes("cold") || m.includes("sleep"))
    return "warmup";
  if (m.includes("rate") || m.includes("too many") || m.includes("429"))
    return "rate";
  if (
    m.includes("authentication") || m.includes("invalid") ||
    m.includes("credentials")   || m.includes("unauthorized")
  ) return "auth";
  return "server";
}

const ERR_MAP: Record<ErrKind, { icon: string; label: string; body: (raw: string) => string; color: string; bg: string; border: string }> = {
  auth:   { icon: "⊘", label: "AUTHENTICATION FAILED",  body: ()    => "Invalid credentials. Verify your username and password.", color: C.red,   bg: C.redBg,   border: C.redBorder   },
  warmup: { icon: "◷", label: "SERVER INITIALIZING",    body: ()    => "Backend waking from sleep mode. Up to 30 s — please wait.", color: C.amber, bg: C.amberBg, border: C.amberBorder },
  rate:   { icon: "⊘", label: "RATE LIMITED",           body: ()    => "Too many attempts. Please wait before trying again.",      color: C.amber, bg: C.amberBg, border: C.amberBorder },
  server: { icon: "⚠", label: "SERVER ERROR",           body: (raw) => raw,                                                        color: C.red,   bg: C.redBg,   border: C.redBorder   },
};

// ─── ORDR mark — inline SVG knotwork (no embedded text) ──────────────────────
function ORDRMark({ size = 42 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.82)}
      viewBox="26 32 148 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <g transform="translate(100, 95)">
        <circle cx="-32" cy="0"  r="34" stroke={C.ink}    strokeWidth="10" fill="none" />
        <circle cx="32"  cy="0"  r="34" stroke={C.ink}    strokeWidth="10" fill="none" />
        <circle cx="0" cy="-20"  r="34" stroke={C.ink}    strokeWidth="10" fill="none" />
        <circle cx="0"  cy="20"  r="34" stroke={C.ink}    strokeWidth="10" fill="none" />
        <line x1="18" y1="-30" x2="46" y2="-52"
          stroke={C.orange} strokeWidth="8" strokeLinecap="round" />
        <polyline points="28,-52 46,-52 46,-34"
          stroke={C.orange} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

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
// Mathematically precise tiling: φ = (1+√5)/2 ≈ 1.6180339887
// Fibonacci sequence: 1,1,2,3,5,8,13,21,34,55,89,144
// Each square's side = fib[i], placed cyclically: up · left · down · right
function GeometryPanel() {
  const U   = 5.0; // px per fibonacci unit
  const fib = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];

  type Rect = { x: number; y: number; w: number; h: number; n: number; idx: number };
  const rects: Rect[] = [];

  // Seed: two 1×1 squares side by side, centered in SVG
  const CX = 380, CY = 430;
  let rx = CX - U, ry = CY - U / 2;
  let rw = 2 * U,  rh = U;
  rects.push({ x: CX - U, y: CY - U / 2, w: U, h: U, n: 1, idx: 0 });
  rects.push({ x: CX,     y: CY - U / 2, w: U, h: U, n: 1, idx: 1 });

  // Wrap squares in cycle: 0=up, 1=left, 2=down, 3=right
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

  // Build quarter-circle arcs for the spiral
  type Arc = { cx: number; cy: number; r: number; sa: number };
  const arcs: Arc[] = [];

  const PIVOTS: ('BR' | 'BL' | 'TL' | 'TR')[] = ['BR', 'BL', 'BL', 'BR', 'TR', 'TL', 'TL', 'TR'];
  const SA_MAP  = [90, 0, 180, 270, 0, 90, 270, 180];

  for (let i = 0; i < rects.length && i < 10; i++) {
    const r   = rects[i];
    const piv = PIVOTS[i % 8];
    const pcx = piv.includes('R') ? r.x + r.w : r.x;
    const pcy = piv.includes('B') ? r.y + r.h : r.y;
    arcs.push({ cx: pcx, cy: pcy, r: Math.max(r.w, r.h), sa: SA_MAP[i % 8] });
  }

  function arcPath(a: Arc): string {
    const R = (deg: number) => (deg * Math.PI) / 180;
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
      background: C.stone, overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Micro grid texture */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(${C.rule} 1px, transparent 1px),
          linear-gradient(90deg, ${C.rule} 1px, transparent 1px)
        `,
        backgroundSize: "24px 24px",
        opacity: 0.65,
      }} />

      <svg
        viewBox="0 0 760 900"
        style={{ width: "100%", height: "100%", maxWidth: 760, overflow: "visible" }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Golden rectangle grid — very fine */}
        <g opacity="0.13" stroke={C.inkMid} strokeWidth="0.75" fill="none">
          {rects.slice(2).map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />
          ))}
        </g>

        {/* Fib number annotations — only in larger squares */}
        {rects
          .filter((r) => r.idx >= 5 && r.w > 20 && r.h > 20)
          .map((r, i) => (
            <text
              key={i}
              x={r.x + r.w / 2}
              y={r.y + r.h / 2 + 4}
              textAnchor="middle"
              fontFamily={C.fontMono}
              fontSize={Math.min(Math.max(r.n > 20 ? 10 : 8, 7), 12)}
              fill={C.inkFaint}
              opacity="0.40"
              letterSpacing="0.05em"
            >
              {r.n}
            </text>
          ))}

        {/* The golden spiral */}
        {arcs.map((a, i) => {
          const opacity = i < 2 ? 0.22 : i < 4 ? 0.42 : i < 7 ? 0.68 : 0.88;
          const sw      = i < 2 ? 0.8  : i < 5 ? 1.2  : i < 8 ? 1.6  : 1.9;
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

        {/* φ label — bottom-right, very faint */}
        <text
          x="710" y="868"
          textAnchor="end"
          fontFamily={C.fontMono}
          fontSize="10"
          fill={C.inkFaint}
          opacity="0.30"
          letterSpacing="0.06em"
        >
          φ = 1.6180339887
        </text>
      </svg>
    </div>
  );
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar() {
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

  const dot: React.CSSProperties = {
    width: 5, height: 5, borderRadius: "50%",
    background: "#22C55E", boxShadow: "0 0 6px rgba(34,197,94,0.55)",
    display: "inline-block", verticalAlign: "middle",
  };

  const sep: React.CSSProperties = { color: C.inkFaint };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, height: 28,
      background: C.white, borderTop: `1px solid ${C.stoneDeep}`,
      display: "flex", alignItems: "center", padding: "0 24px", gap: 14,
      fontFamily: C.fontMono, fontSize: "0.6rem", color: C.inkLight,
      letterSpacing: "0.09em", zIndex: 20,
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={dot} />
        <span style={{ color: C.inkMid, letterSpacing: "0.07em" }}>SYSTEMS ONLINE</span>
      </span>
      <span style={sep}>·</span>
      <span>TLS 1.3</span>
      <span style={sep}>·</span>
      <span>AUTH GATEWAY v1.0</span>
      <span style={sep}>·</span>
      <span>SESSION AUDIT ACTIVE</span>
      <span style={{ marginLeft: "auto", color: C.inkMid }}>{ts}</span>
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

  const { login }    = useAuth();
  const router       = useRouter();
  const usernameRef  = useRef<HTMLInputElement>(null);
  const warmupRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    usernameRef.current?.focus();
    return () => clearTimeout(t);
  }, []);

  const clearError = () => { setError(null); setErrKind(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  // Red border only for credential errors — not server/network errors
  const inputHasError = !!error && errKind === "auth";
  const errCfg = errKind ? ERR_MAP[errKind] : null;

  // ── Input style factory ────────────────────────────────────────────────────
  const inputStyle = (focused: boolean, hasError: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "12px 16px",
    fontFamily: C.fontMono,
    fontSize: "0.875rem",
    color: C.ink,
    background: focused ? C.white : C.cream,
    border: `1.5px solid ${hasError ? C.red : focused ? C.orange : C.stoneDeep}`,
    borderRadius: 3,
    outline: "none",
    transition: "border-color 160ms ease, background 160ms ease, box-shadow 160ms ease",
    boxSizing: "border-box",
    boxShadow: hasError
      ? "0 0 0 3px rgba(185,28,28,0.08)"
      : focused
      ? `0 0 0 3px ${C.orangeMid}`
      : "none",
    caretColor: hasError ? C.red : C.orange,
    opacity: loading ? 0.65 : 1,
  });

  // ── Divider line ───────────────────────────────────────────────────────────
  const divider: React.CSSProperties = {
    borderTop: `1px solid ${C.stoneDeep}`,
    margin: "32px 0 0",
    paddingTop: 20,
  };

  return (
    <>
      <style>{`
        @keyframes ordr-spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        input::placeholder { color: ${C.inkFaint}; opacity: 1; }
        .btn-session {
          transition: background 160ms ease, box-shadow 160ms ease, transform 100ms ease !important;
        }
        .btn-session:hover:not(:disabled) {
          background: #D9711A !important;
          box-shadow: 0 4px 22px rgba(245,130,32,0.30) !important;
        }
        .btn-session:active:not(:disabled) { transform: translateY(1px) !important; }
        .pwd-toggle {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; padding: 2px 4px;
          color: ${C.inkLight}; cursor: pointer; display: flex; align-items: center;
          border-radius: 2px;
        }
        .pwd-toggle:hover { color: ${C.inkMid}; }
        .pwd-toggle:focus-visible {
          outline: 2px solid ${C.orange}; outline-offset: 1px;
        }
        @media (max-width: 768px) {
          .geo-panel   { display: none !important; }
          .form-shell  { padding: 36px 24px !important; }
          .form-card   { max-width: 100% !important; }
        }
      `}</style>

      <div style={{
        minHeight: "100vh", display: "flex",
        fontFamily: C.fontUI, background: C.cream, paddingBottom: 28,
      }}>

        {/* ══ LEFT — Geometry canvas ══ */}
        <div
          className="geo-panel"
          style={{ flex: "0 0 58%", position: "relative", minHeight: "100vh" }}
        >
          <GeometryPanel />
          {/* Right-edge vertical rule */}
          <div style={{
            position: "absolute", top: 0, right: 0, width: 1, height: "100%",
            background: `linear-gradient(180deg, transparent 0%, ${C.stoneDeep} 16%, ${C.stoneDeep} 84%, transparent 100%)`,
          }} />
        </div>

        {/* ══ RIGHT — Login shell ══ */}
        <div
          className="form-shell"
          style={{
            flex: "1 1 42%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "52px 52px", minHeight: "100vh", position: "relative",
          }}
        >
          {/* Animated card */}
          <div
            className="form-card"
            style={{
              width: "100%", maxWidth: 460,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "none" : "translateY(12px)",
              transition: "opacity 480ms cubic-bezier(0.16,1,0.3,1), transform 480ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >

            {/* ── Logo lockup ── */}
            <div style={{
              marginBottom: 40,
              paddingBottom: 28,
              borderBottom: `1px solid ${C.stoneDeep}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>

                {/* Knotwork mark */}
                <ORDRMark size={44} />

                {/* Vertical rule */}
                <div style={{
                  width: 1, height: 38, background: C.stoneDeep, flexShrink: 0,
                }} />

                {/* Wordmark + descriptor + badge */}
                <div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 5,
                  }}>
                    <span style={{
                      fontFamily: C.fontHead, fontWeight: 800,
                      fontSize: "1.0625rem", letterSpacing: "0.07em",
                      color: C.ink, lineHeight: 1,
                    }}>ORDR</span>
                    <span style={{
                      fontFamily: C.fontHead, fontWeight: 800,
                      fontSize: "1.0625rem", letterSpacing: "0.07em",
                      color: C.orange, lineHeight: 1,
                    }}>TERMINAL</span>
                    <span style={{
                      ...ENV_STYLE,
                      fontFamily: C.fontMono,
                      fontSize: "0.54rem",
                      fontWeight: 600,
                      letterSpacing: "0.13em",
                      padding: "2px 6px",
                      borderRadius: 2,
                      lineHeight: 1.5,
                    }}>
                      {ENV_LABEL}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: C.fontMono, fontSize: "0.6rem",
                    color: C.inkLight, letterSpacing: "0.11em",
                    textTransform: "uppercase",
                  }}>
                    Institutional FX Risk Infrastructure
                  </div>
                </div>
              </div>
            </div>

            {/* ── Page heading ── */}
            <div style={{ marginBottom: 30 }}>
              <h1 style={{
                fontFamily: C.fontHead, fontSize: "1.4375rem", fontWeight: 800,
                color: C.ink, margin: 0, lineHeight: 1.15, letterSpacing: "-0.02em",
              }}>
                Initialize Session
              </h1>
              <p style={{
                fontFamily: C.fontUI, fontSize: "0.8125rem",
                color: C.inkLight, margin: "6px 0 0", lineHeight: 1.55,
              }}>
                Enter your credentials to access the terminal.
              </p>
            </div>

            {/* ── Form ── */}
            <form onSubmit={handleSubmit} noValidate>

              {/* Username / Email */}
              <div style={{ marginBottom: 18 }}>
                <label
                  htmlFor="ordr-username"
                  style={{
                    display: "block",
                    fontFamily: C.fontMono, fontSize: "0.6rem", fontWeight: 600,
                    color: focusField === "user" ? C.orange : C.inkMid,
                    letterSpacing: "0.14em", textTransform: "uppercase",
                    marginBottom: 7, transition: "color 160ms ease",
                  }}
                >
                  Username / Email
                </label>
                <input
                  id="ordr-username"
                  ref={usernameRef}
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); if (error) clearError(); }}
                  placeholder="username or email address"
                  required
                  disabled={loading}
                  autoComplete="username"
                  aria-invalid={inputHasError ? "true" : undefined}
                  aria-describedby={error ? "ordr-error" : undefined}
                  style={inputStyle(focusField === "user", inputHasError)}
                  onFocus={() => setFocusField("user")}
                  onBlur={() => setFocusField(null)}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 26 }}>
                <label
                  htmlFor="ordr-password"
                  style={{
                    display: "block",
                    fontFamily: C.fontMono, fontSize: "0.6rem", fontWeight: 600,
                    color: focusField === "pass" ? C.orange : C.inkMid,
                    letterSpacing: "0.14em", textTransform: "uppercase",
                    marginBottom: 7, transition: "color 160ms ease",
                  }}
                >
                  Password
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
                    style={{ ...inputStyle(focusField === "pass", inputHasError), paddingRight: 44 }}
                    onFocus={() => setFocusField("pass")}
                    onBlur={() => { setFocusField(null); setCapsLock(false); }}
                    onKeyUp={(e) => {
                      if (e.getModifierState) setCapsLock(e.getModifierState("CapsLock"));
                    }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="pwd-toggle"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? "Hide password" : "Show password"}
                  >
                    {showPwd ? <IconEyeClosed /> : <IconEyeOpen />}
                  </button>
                </div>

                {/* Caps lock warning */}
                {capsLock && (
                  <div style={{
                    marginTop: 6, fontFamily: C.fontMono, fontSize: "0.6rem",
                    color: C.amber, letterSpacing: "0.07em",
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    <span aria-hidden="true">⚠</span>
                    <span>Caps Lock is on</span>
                  </div>
                )}
              </div>

              {/* Error display */}
              {error && errCfg && (
                <div
                  id="ordr-error"
                  role="alert"
                  aria-live="assertive"
                  style={{
                    marginBottom: 20,
                    padding: "11px 14px",
                    background: errCfg.bg,
                    border: `1px solid ${errCfg.border}`,
                    borderLeft: `3px solid ${errCfg.color}`,
                    borderRadius: 3,
                  }}
                >
                  <div style={{
                    fontFamily: C.fontMono, fontSize: "0.58rem", fontWeight: 600,
                    color: errCfg.color, letterSpacing: "0.12em", marginBottom: 4,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span aria-hidden="true">{errCfg.icon}</span>
                    {errCfg.label}
                  </div>
                  <div style={{
                    fontFamily: C.fontUI, fontSize: "0.75rem",
                    color: C.inkMid, lineHeight: 1.5,
                  }}>
                    {errCfg.body(error)}
                  </div>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="btn-session"
                style={{
                  width: "100%",
                  padding: "13px 20px",
                  fontFamily: C.fontUI,
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: loading ? C.inkLight : C.white,
                  background: loading ? C.stoneDeep : C.orange,
                  border: "none",
                  borderRadius: 3,
                  cursor: loading ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  boxShadow: loading ? "none" : "0 2px 14px rgba(245,130,32,0.20)",
                }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 12, height: 12,
                      border: `1.5px solid ${C.inkFaint}`,
                      borderTop: `1.5px solid ${C.inkMid}`,
                      borderRadius: "50%",
                      animation: "ordr-spin 650ms linear infinite",
                      flexShrink: 0,
                    }} aria-hidden="true" />
                    <span>{warmingUp ? "Waking Server…" : "Authenticating…"}</span>
                  </>
                ) : (
                  <>
                    <span>Initialize Session</span>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                      <path d="M1.5 6.5h10M7.5 2.5l4 4-4 4"
                        stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>

              {/* Cold-start extended notice */}
              {warmingUp && (
                <div style={{
                  marginTop: 12, padding: "10px 14px",
                  background: C.amberBg,
                  border: `1px solid ${C.amberBorder}`,
                  borderLeft: `3px solid ${C.amber}`,
                  borderRadius: 3,
                }}>
                  <div style={{
                    fontFamily: C.fontMono, fontSize: "0.58rem", fontWeight: 600,
                    color: C.amber, letterSpacing: "0.12em", marginBottom: 3,
                  }}>
                    ◷  SERVER COLD START
                  </div>
                  <div style={{
                    fontFamily: C.fontUI, fontSize: "0.73rem",
                    color: C.inkMid, lineHeight: 1.5,
                  }}>
                    Backend initializing from sleep (free tier). Up to 30 s.
                  </div>
                </div>
              )}
            </form>

            {/* ── Session security note ── */}
            <div style={divider}>
              <p style={{
                fontFamily: C.fontMono, fontSize: "0.58rem",
                color: C.inkFaint, letterSpacing: "0.07em",
                lineHeight: 1.85, margin: 0, textAlign: "center",
              }}>
                All sessions are logged and audited.{"\u2002"}Authorized access only.<br />
                Unauthorized access is prohibited and subject to legal action.
              </p>
            </div>

          </div>
        </div>
      </div>

      <StatusBar />
    </>
  );
}
