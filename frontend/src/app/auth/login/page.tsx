"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import Image from "next/image";

// ─── Palette & tokens ────────────────────────────────────────────────────────
const C = {
  cream:      "#FAF8F4",
  stone:      "#F2EFE9",
  stoneDeep:  "#E8E3DA",
  ink:        "#1A1714",
  inkMid:     "#3D3830",
  inkLight:   "#8A8278",
  inkFaint:   "#C4BDB4",
  orange:     "#F58220",
  orangeLight:"#FDF0E4",
  orangeMid:  "rgba(245,130,32,0.12)",
  orangeGlow: "rgba(245,130,32,0.06)",
  white:      "#FFFFFF",
  rule:       "rgba(26,23,20,0.08)",
  ruleStrong: "rgba(26,23,20,0.14)",
  fontHead:   "'Manrope','IBM Plex Sans',sans-serif",
  fontUI:     "'IBM Plex Sans','Inter',sans-serif",
  fontMono:   "'IBM Plex Mono','JetBrains Mono',monospace",
} as const;

// ─── Fibonacci spiral — mathematically precise ───────────────────────────────
// Golden ratio φ ≈ 1.6180339887
// We build nested golden rectangles, each side = Fibonacci number
// Sequence: 1,1,2,3,5,8,13,21,34,55,89,144...
// We scale by a unit so the whole composition fits in the SVG viewport

function FibonacciPanel() {
  // SVG viewport: 760 × 900 (landscape-ish; we'll use viewBox with padding)
  // Unit scale: 1 fib unit = 5.2px so fib(12)=144 → 748px ≈ fills panel
  const U = 5.0; // px per unit

  // Fibonacci squares placed from the center outward
  // Each square placed in a specific direction relative to the prior rectangle
  // fib[n] = side length in units
  const fib = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];

  // Build the rectangle positions.
  // Starting at center with fib[0] and fib[1] as a 1×1 and 1×1 pair forming a 2×1 rectangle.
  // Then add fib[2]=2 square on top of the 2×1, etc.
  // Standard Fibonacci tiling directions: right, up, left, down, right, up, left, down...
  // We'll track the current bounding box origin (x,y) and size.

  type Rect = { x: number; y: number; w: number; h: number; n: number; idx: number };
  const rects: Rect[] = [];

  // Canvas center
  const cx = 380, cy = 430;

  // Place the first two 1×1 squares
  // Square 0: index 0, fib=1, at (cx-U, cy-U*0.5) to (cx, cy+U*0.5)  -- left
  // Square 1: index 1, fib=1, at (cx, cy-U*0.5) to (cx+U, cy+U*0.5)  -- right
  // Together they form a 2×1 rectangle

  // We'll do the standard spiral tiling:
  // Start with two 1×1 squares side by side horizontally
  // Then wrap squares around the growing rectangle

  // Anchor: top-left of the current combined rectangle
  let rx = cx - U, ry = cy - U / 2; // 2×1 rectangle top-left
  let rw = 2 * U, rh = U; // width=2, height=1

  rects.push({ x: cx - U, y: cy - U / 2, w: U, h: U, n: fib[0], idx: 0 });
  rects.push({ x: cx,     y: cy - U / 2, w: U, h: U, n: fib[1], idx: 1 });

  // Direction cycle: 0=top, 1=left, 2=bottom, 3=right
  const dirs = [0, 1, 2, 3]; // up, left, down, right
  let dirIdx = 0;

  for (let i = 2; i < fib.length; i++) {
    const side = fib[i] * U;
    const dir = dirs[dirIdx % 4];
    let nx: number, ny: number, nw: number, nh: number;

    if (dir === 0) {
      // Place square above current rectangle
      nx = rx;
      ny = ry - side;
      nw = rw; nh = side;
      // New combined rectangle
      ry = ny;
      rh = rh + side;
    } else if (dir === 1) {
      // Place square to the left
      nx = rx - side;
      ny = ry;
      nw = side; nh = rh;
      rx = nx;
      rw = rw + side;
    } else if (dir === 2) {
      // Place square below
      nx = rx;
      ny = ry + rh;
      nw = rw; nh = side;
      rh = rh + side;
    } else {
      // Place square to the right
      nx = rx + rw;
      ny = ry;
      nw = side; nh = rh;
      rw = rw + side;
    }

    rects.push({ x: nx, y: ny, w: nw, h: nh, n: fib[i], idx: i });
    dirIdx++;
  }

  // Build spiral arc path
  // Each arc: quarter circle, center at the corner of the square where the spiral enters
  // Arc starts and ends at specific corners of each square
  // Centers follow the inner corner of each square
  type Arc = { cx: number; cy: number; r: number; startAngle: number; endAngle: number; sweep: number };
  const arcs: Arc[] = [];

  // For each square in the tiling, the arc sweeps one quarter circle
  // The pivot corner depends on which direction the square was added
  // dirs cycle: up, left, down, right
  // For the first two squares, we handle specially

  // Square 0 (fib=1, at left): arc center = bottom-right corner
  const arcData: { pivotCorner: 'TR'|'TL'|'BL'|'BR'; rect: Rect }[] = [];

  // First two squares
  arcData.push({ pivotCorner: 'BR', rect: rects[0] }); // fib[0]
  arcData.push({ pivotCorner: 'BL', rect: rects[1] }); // fib[1]

  // Subsequent squares follow the direction they were placed
  const cornerForDir: ('TR'|'TL'|'BL'|'BR')[] = ['BL', 'BR', 'TR', 'TL']; // up, left, down, right
  for (let i = 2; i < rects.length; i++) {
    arcData.push({ pivotCorner: cornerForDir[(i - 2) % 4], rect: rects[i] });
  }

  // Start angles for spiral (the arc goes counterclockwise for the golden spiral)
  // Convention: 0=right, 90=down, 180=left, 270=up (SVG coords, y-down)
  // Start angles for each direction of square placement
  const startAngles = [180, 270, 0, 90]; // matches dirs: up, left, down, right
  // First two squares
  const startAngle0 = 90;  // fib[0]: arc from bottom-right going left→up
  const startAngle1 = 0;   // fib[1]: arc from bottom-left going down→right ...

  for (let i = 0; i < arcData.length; i++) {
    const { pivotCorner, rect } = arcData[i];
    let pcx: number, pcy: number;

    if (pivotCorner === 'TL') { pcx = rect.x;          pcy = rect.y; }
    else if (pivotCorner === 'TR') { pcx = rect.x + rect.w; pcy = rect.y; }
    else if (pivotCorner === 'BL') { pcx = rect.x;          pcy = rect.y + rect.h; }
    else { pcx = rect.x + rect.w; pcy = rect.y + rect.h; }

    const r = Math.max(rect.w, rect.h); // fib[i] * U
    let sa: number;
    if (i === 0) sa = startAngle0;
    else if (i === 1) sa = startAngle1;
    else sa = startAngles[(i - 2) % 4];

    arcs.push({ cx: pcx, cy: pcy, r, startAngle: sa, endAngle: sa + 90, sweep: 1 });
  }

  // Convert arc to SVG path arc command
  function arcPath(a: Arc): string {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = a.cx + a.r * Math.cos(toRad(a.startAngle));
    const y1 = a.cy + a.r * Math.sin(toRad(a.startAngle));
    const x2 = a.cx + a.r * Math.cos(toRad(a.endAngle));
    const y2 = a.cy + a.r * Math.sin(toRad(a.endAngle));
    return `M ${x1.toFixed(2)},${y1.toFixed(2)} A ${a.r.toFixed(2)},${a.r.toFixed(2)} 0 0,${a.sweep} ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  const spiralPath = arcs.map(arcPath).join(" ");

  // Annotation positions for fib numbers — center of each square
  const annotations = rects.map((r, i) => ({
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
    n: r.n,
    i,
    small: r.w < 15 || r.h < 15,
  }));

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: C.stone,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Background texture grid — very fine */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(${C.rule} 1px, transparent 1px),
            linear-gradient(90deg, ${C.rule} 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
          opacity: 0.5,
        }}
      />

      <svg
        viewBox="0 0 760 900"
        style={{
          width: "100%",
          height: "100%",
          maxWidth: 760,
          overflow: "visible",
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Golden rectangles — fine grid lines ── */}
        <g opacity="0.18" stroke={C.inkMid} strokeWidth="0.75" fill="none">
          {rects.slice(2).map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />
          ))}
        </g>

        {/* ── Fibonacci square borders — slightly stronger for first few ── */}
        <g opacity="0.32" stroke={C.inkMid} strokeWidth="0.5" fill="none" strokeDasharray="3,4">
          {rects.slice(0, 2).map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />
          ))}
        </g>

        {/* ── Diagonal of the large golden rectangle — the "eye" line ── */}
        {rects.length > 0 && (
          <line
            x1={rects[rects.length - 1].x}
            y1={rects[rects.length - 1].y}
            x2={rects[rects.length - 1].x + rects[rects.length - 1].w}
            y2={rects[rects.length - 1].y + rects[rects.length - 1].h}
            stroke={C.inkFaint}
            strokeWidth="0.5"
            opacity="0.25"
          />
        )}

        {/* ── Fibonacci number annotations ── */}
        {annotations
          .filter((a) => !a.small && a.i >= 2)
          .map((a, i) => (
            <text
              key={i}
              x={a.x}
              y={a.y + 4}
              textAnchor="middle"
              fontFamily={C.fontMono}
              fontSize={Math.min(Math.max(a.n > 20 ? 11 : 9, 7), 13)}
              fill={C.inkLight}
              opacity="0.55"
              letterSpacing="0.05em"
            >
              {a.n}
            </text>
          ))}

        {/* ── The golden spiral — main hero ── */}
        {arcs.slice(0, 10).map((a, i) => {
          const toRad = (deg: number) => (deg * Math.PI) / 180;
          const x1 = a.cx + a.r * Math.cos(toRad(a.startAngle));
          const y1 = a.cy + a.r * Math.sin(toRad(a.startAngle));
          const x2 = a.cx + a.r * Math.cos(toRad(a.endAngle));
          const y2 = a.cy + a.r * Math.sin(toRad(a.endAngle));
          const opacity = i < 2 ? 0.3 : i < 4 ? 0.55 : i < 7 ? 0.8 : 0.95;
          const strokeW = i < 2 ? 0.8 : i < 5 ? 1.2 : i < 8 ? 1.6 : 2.0;
          return (
            <path
              key={i}
              d={`M ${x1.toFixed(2)},${y1.toFixed(2)} A ${a.r.toFixed(2)},${a.r.toFixed(2)} 0 0,${a.sweep} ${x2.toFixed(2)},${y2.toFixed(2)}`}
              stroke={C.orange}
              strokeWidth={strokeW}
              fill="none"
              strokeLinecap="round"
              opacity={opacity}
            />
          );
        })}

        {/* ── Golden ratio label ── */}
        <text
          x="680"
          y="860"
          textAnchor="end"
          fontFamily={C.fontMono}
          fontSize="11"
          fill={C.inkLight}
          opacity="0.5"
          letterSpacing="0.06em"
        >
          φ = 1.6180339887…
        </text>

        {/* ── Section label top-left ── */}
        <text
          x="32"
          y="52"
          fontFamily={C.fontMono}
          fontSize="9"
          fill={C.inkLight}
          opacity="0.4"
          letterSpacing="0.14em"
        >
          FIBONACCI GOLDEN SPIRAL
        </text>
        <text
          x="32"
          y="66"
          fontFamily={C.fontMono}
          fontSize="8"
          fill={C.inkFaint}
          opacity="0.5"
          letterSpacing="0.10em"
        >
          ORDR TERMINAL · GEOMETRIC FOUNDATION
        </text>
      </svg>

      {/* Bottom-left: sequence display */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: 32,
          fontFamily: C.fontMono,
          fontSize: "0.625rem",
          color: C.inkLight,
          letterSpacing: "0.12em",
          lineHeight: 1.8,
          opacity: 0.6,
        }}
      >
        <div style={{ marginBottom: 4, color: C.inkFaint, fontSize: "0.55rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Sequence
        </div>
        {[1,1,2,3,5,8,13,21,34,55,89,144].join("  ·  ")}
      </div>
    </div>
  );
}

// ─── Live clock status bar ────────────────────────────────────────────────────
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

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 28,
        background: C.white,
        borderTop: `1px solid ${C.stoneDeep}`,
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        gap: 20,
        fontFamily: C.fontMono,
        fontSize: "0.6rem",
        color: C.inkLight,
        letterSpacing: "0.10em",
        zIndex: 20,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "#22C55E",
            boxShadow: "0 0 5px #22C55E",
          }}
        />
        <span style={{ color: C.inkMid, letterSpacing: "0.08em" }}>SYSTEMS ONLINE</span>
      </span>
      <span style={{ color: C.inkFaint }}>—</span>
      <span>TLS 1.3</span>
      <span style={{ color: C.inkFaint }}>—</span>
      <span>AUTH GATEWAY v1.0</span>
      <span style={{ marginLeft: "auto", color: C.inkMid }}>{ts}</span>
    </div>
  );
}

// ─── Main Login Page ──────────────────────────────────────────────────────────
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
    const t = setTimeout(() => setMounted(true), 80);
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

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "13px 16px",
    fontFamily: C.fontMono,
    fontSize: "0.875rem",
    color: C.ink,
    background: focused ? C.white : C.cream,
    border: `1.5px solid ${focused ? C.orange : C.stoneDeep}`,
    borderRadius: 4,
    outline: "none",
    transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease",
    boxSizing: "border-box",
    boxShadow: focused ? `0 0 0 3px ${C.orangeMid}` : "none",
    caretColor: C.orange,
  });

  return (
    <>
      <style>{`
        @keyframes ordrSpin { to { transform: rotate(360deg); } }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        input::placeholder { color: ${C.inkFaint}; }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          fontFamily: C.fontUI,
          background: C.cream,
          paddingBottom: 28, // account for status bar
        }}
      >
        {/* ══ LEFT — Fibonacci Panel ══ */}
        <div
          style={{
            flex: "0 0 58%",
            position: "relative",
            minHeight: "100vh",
            display: "flex",
            alignItems: "stretch",
            // Mobile: hide
          }}
          className="fib-panel"
        >
          <FibonacciPanel />

          {/* Vertical divider — right edge */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 1,
              height: "100%",
              background: `linear-gradient(180deg, transparent 0%, ${C.stoneDeep} 20%, ${C.stoneDeep} 80%, transparent 100%)`,
            }}
          />
        </div>

        {/* ══ RIGHT — Login Form ══ */}
        <div
          style={{
            flex: "1 1 42%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 40px",
            background: C.cream,
            position: "relative",
            minHeight: "100vh",
          }}
        >
          {/* Subtle top-right corner accent */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 120,
              height: 120,
              background: `radial-gradient(circle at top right, ${C.orangeGlow} 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              width: "100%",
              maxWidth: 380,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 600ms cubic-bezier(0.16,1,0.3,1), transform 600ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            {/* ── Logo ── */}
            <div
              style={{
                marginBottom: 40,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 96,
                  height: 96,
                  position: "relative",
                  marginBottom: 20,
                }}
              >
                <Image
                  src="/ordr-logo-dark.png"
                  alt="ORDR Terminal"
                  fill
                  sizes="96px"
                  style={{ objectFit: "contain" }}
                  priority
                />
              </div>

              {/* Tagline */}
              <div
                style={{
                  fontFamily: C.fontMono,
                  fontSize: "0.6rem",
                  color: C.inkLight,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  marginTop: -4,
                }}
              >
                Institutional FX Risk Infrastructure
              </div>
            </div>

            {/* ── Heading ── */}
            <div style={{ marginBottom: 32 }}>
              <h1
                style={{
                  fontFamily: C.fontHead,
                  fontSize: "1.75rem",
                  fontWeight: 800,
                  color: C.ink,
                  margin: 0,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              >
                Welcome back.
              </h1>
              <p
                style={{
                  fontFamily: C.fontUI,
                  fontSize: "0.875rem",
                  color: C.inkLight,
                  margin: "8px 0 0",
                  lineHeight: 1.5,
                }}
              >
                Sign in to your ORDR Terminal session.
              </p>
            </div>

            {/* ── Form ── */}
            <form onSubmit={handleSubmit}>
              {/* Username */}
              <div style={{ marginBottom: 18 }}>
                <label
                  style={{
                    display: "block",
                    fontFamily: C.fontMono,
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    color: focusedField === "user" ? C.orange : C.inkMid,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    marginBottom: 7,
                    transition: "color 180ms ease",
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
              <div style={{ marginBottom: 28 }}>
                <label
                  style={{
                    display: "block",
                    fontFamily: C.fontMono,
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    color: focusedField === "pass" ? C.orange : C.inkMid,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    marginBottom: 7,
                    transition: "color 180ms ease",
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
                    fontFamily: C.fontMono,
                    fontSize: "0.7rem",
                    color: "#C0392B",
                    background: "rgba(192,57,43,0.06)",
                    border: "1.5px solid rgba(192,57,43,0.18)",
                    borderRadius: 4,
                    letterSpacing: "0.03em",
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
                  padding: "14px 20px",
                  fontFamily: C.fontUI,
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: loading ? C.inkLight : C.white,
                  background: loading ? C.stoneDeep : C.orange,
                  border: "none",
                  borderRadius: 4,
                  cursor: loading ? "wait" : "pointer",
                  transition: "all 200ms cubic-bezier(0.16,1,0.3,1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  boxShadow: loading ? "none" : `0 4px 20px rgba(245,130,32,0.25)`,
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = "#E0711A";
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 6px 28px rgba(245,130,32,0.35)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = C.orange;
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 20px rgba(245,130,32,0.25)";
                  }
                }}
              >
                {loading ? (
                  <>
                    <span
                      style={{
                        width: 13,
                        height: 13,
                        border: `1.5px solid ${C.inkFaint}`,
                        borderTop: `1.5px solid ${C.inkMid}`,
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
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 7h10M8 3l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            {/* Cold-start notice */}
            {warmingUp && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  fontFamily: C.fontMono,
                  fontSize: "0.7rem",
                  color: C.inkMid,
                  background: C.orangeLight,
                  border: `1.5px solid rgba(245,130,32,0.20)`,
                  borderRadius: 4,
                  lineHeight: 1.7,
                }}
              >
                <span style={{ color: C.orange, fontWeight: 700, letterSpacing: "0.06em" }}>SERVER COLD START</span>
                <br />
                Backend waking from sleep (free tier). Up to 30 s — please wait.
              </div>
            )}

            {/* ── Divider ── */}
            <div
              style={{
                margin: "36px 0 20px",
                borderTop: `1px solid ${C.stoneDeep}`,
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: -8,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: C.cream,
                  padding: "0 12px",
                  fontFamily: C.fontMono,
                  fontSize: "0.58rem",
                  color: C.inkFaint,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                φ = 1.618  ·  All sessions logged
              </span>
            </div>

            {/* ── Compliance ── */}
            <div
              style={{
                textAlign: "center",
                fontFamily: C.fontMono,
                fontSize: "0.6rem",
                color: C.inkFaint,
                letterSpacing: "0.06em",
                lineHeight: 1.9,
              }}
            >
              Authorized personnel only.
              <br />
              Unauthorized access is prohibited and may be subject to legal action.
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Mobile responsive */}
      <style>{`
        @media (max-width: 768px) {
          .fib-panel {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
