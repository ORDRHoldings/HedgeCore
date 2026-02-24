"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useHedge } from "@/lib/hedgeContext";
import type { RootState, AppDispatch } from "@/lib/store";
import { listPositionsThunk } from "@/lib/store/slices/positionSlice";
import type { PositionRow } from "@/api/positionClient";

const S = {
  bgDeep: "var(--bg-deep,#0a0c10)", bgPanel: "var(--bg-panel,#0f1117)",
  bgSub: "var(--bg-sub,#141720)", rim: "var(--border-rim,#1e2330)",
  soft: "var(--border-soft,#2a3147)",
  primary: "var(--text-primary,#e2e8f0)",
  secondary: "var(--text-secondary,#94a3b8)",
  tertiary: "var(--text-tertiary,#475569)",
  cyan: "var(--accent-cyan,#22d3ee)", amber: "var(--accent-amber,#fbbf24)",
  green: "var(--status-pass,#34d399)", red: "var(--accent-red,#f87171)",
  fontMono: "IBM Plex Mono,monospace",
} as const;

function utcNow(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
function hhmmss(): string { return new Date().toISOString().slice(11, 19); }
function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

interface LogLine {
  id: number; ts: string; text: string;
  kind: "info" | "ok" | "warn" | "error" | "cmd";
}

let _logId = 0;
function mkLine(text: string, kind: LogLine["kind"] = "info"): LogLine {
  return { id: ++_logId, ts: hhmmss(), text, kind };
}
const KIND_COLOR: Record<LogLine["kind"], string> = {
  info: S.secondary, ok: S.green, warn: S.amber, error: S.red, cmd: S.cyan,
};

function Chip({ label, value, valueColor }: { label: string; value: string; valueColor?: string; }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
      border: `1px solid ${S.rim}`, background: S.bgPanel }}>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary }}>{label}</span>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 700, color: valueColor ?? S.primary }}>{value}</span>
    </div>
  );
}

function execColor(s: PositionRow["execution_status"]): string {
  if (s === "HEDGED") return S.green;
  if (s === "READY_TO_EXECUTE") return S.cyan;
  if (s === "POLICY_ASSIGNED") return S.amber;
  if (s === "REJECTED") return S.red;
  return S.tertiary;
}

function ActionChip({ label, href, router }: { label: string; href: string; router: ReturnType<typeof useRouter>; }) {
  const [hov, setHov] = useState(false);
  return (
    <button type="button" onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => router.push(href)}
      style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", padding: "4px 12px",
        border: `1px solid ${hov ? S.cyan : S.soft}`,
        color: hov ? S.cyan : S.secondary,
        background: hov ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})` : "transparent",
        cursor: "pointer", transition: "all 0.12s",
      }}>{label}</button>
  );
}

export default function TerminalPage() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { user, token } = useAuth();
  const { result } = useHedge();
  const positions = useSelector((s: RootState) => s.positions.positions);
  const loading = useSelector((s: RootState) => s.positions.loading);

  useEffect(() => {
    if (token && positions.length === 0) dispatch(listPositionsThunk({ token }));
  }, [dispatch, token, positions.length]);

  const [clock, setClock] = useState(utcNow());
  useEffect(() => {
    const id = setInterval(() => setClock(utcNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const logRef = useRef<HTMLDivElement>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const logInit = useRef(false);

  useEffect(() => {
    if (logInit.current || loading) return;
    logInit.current = true;
    const n = positions.length;
    setLog([
      mkLine("ORDR Terminal v1.0.0 initialised", "ok"),
      mkLine("Hedge engine connected · Engine v1.0.0", "ok"),
      mkLine(`Position feed loaded · ${n} position${n !== 1 ? "s" : ""}`, "info"),
      mkLine(`Policy engine: ${result ? "custom" : "DEMO"} active`, "info"),
    ]);
  }, [loading, positions.length, result]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const [cmd, setCmd] = useState("");
  const pushLog = useCallback((text: string, kind: LogLine["kind"] = "info") => {
    setLog(prev => [...prev, mkLine(text, kind)]);
  }, []);

  const handleCommand = useCallback((raw: string) => {
    const c = raw.trim().toLowerCase();
    if (!c) return;
    pushLog(`> ${raw}`, "cmd");
    if (c === "help") {
      pushLog("Commands: help, status, positions, clear", "info");
    } else if (c === "status") {
      pushLog(`Engine v1.0.0 · ONLINE · ${user?.email ?? "anonymous"}`, "ok");
    } else if (c === "positions") {
      pushLog(`${positions.length} position${positions.length !== 1 ? "s" : ""} loaded`, "info");
    } else if (c === "clear") {
      setLog([]);
    } else {
      pushLog(`Unknown command: ${raw}`, "error");
    }
    setCmd("");
  }, [pushLog, positions.length, user]);

  const cols = useMemo(() => [
    { label: "ID", w: "100px" }, { label: "ENTITY", w: "110px" },
    { label: "CCY", w: "60px" }, { label: "AMOUNT", w: "100px" },
    { label: "VALUE DATE", w: "100px" }, { label: "STATUS", w: "90px" },
    { label: "EXEC STATUS", w: "140px" },
  ], []);

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontMono, display: "flex", flexDirection: "column" }}>

      {/* Status bar */}
      <div style={{ borderBottom: `1px solid ${S.rim}`, background: S.bgPanel,
        padding: "8px 20px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: S.cyan, letterSpacing: "0.12em", marginRight: 4 }}>ORDR TERMINAL</span>
        <Chip label="MODE" value="DEMO" valueColor={S.amber} />
        <Chip label="ENGINE" value="v1.0.0" valueColor={S.green} />
        <Chip label="UTC" value={clock} valueColor={S.primary} />
        <Chip label="SESSION" value={user?.email ?? "—"} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <ActionChip label="[RUN ENGINE]" href="/input" router={router} />
          <ActionChip label="[EXECUTION]" href="/execution" router={router} />
          <ActionChip label="[SCENARIOS]" href="/scenario-studio" router={router} />
          <ActionChip label="[AUDIT]" href="/audit-trail" router={router} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* Positions feed - 60% */}
        <div style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", borderRight: `1px solid ${S.rim}`, minHeight: 0 }}>
          <div style={{ padding: "7px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.5625rem", letterSpacing: "0.1em", color: S.tertiary }}>POSITIONS FEED</span>
            <span style={{ marginLeft: "auto", fontSize: "0.5625rem", color: S.cyan, padding: "1px 6px",
              border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
              background: `color-mix(in srgb, ${S.cyan} 8%, transparent)` }}>
              {positions.length} POSITIONS
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: cols.map(c => c.w).join(" "), padding: "5px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep }}>
            {cols.map(c => (<span key={c.label} style={{ fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em" }}>{c.label}</span>))}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: "24px 16px", color: S.tertiary, fontSize: "0.6875rem" }}>Loading...</div>
            ) : positions.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: S.tertiary, fontSize: "0.6875rem" }}>
                NO POSITIONS LOADED<br />
                <span style={{ fontSize: "0.5625rem", display: "block", marginTop: 4 }}>Navigate to /input.</span>
              </div>
            ) : positions.map((p, i) => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: cols.map(c => c.w).join(" "),
                  padding: "5px 16px", background: i % 2 === 0 ? S.bgPanel : S.bgDeep, borderBottom: `1px solid ${S.rim}` }}>
                  <span style={{ fontSize: "0.6875rem", color: S.cyan, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.id.slice(0, 8)}</span>
                  <span style={{ fontSize: "0.6875rem", color: S.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.entity ?? "—"}</span>
                  <span style={{ fontSize: "0.6875rem", color: S.amber, fontWeight: 700 }}>{p.currency}</span>
                  <span style={{ fontSize: "0.6875rem", color: S.primary }}>{fmt(p.amount)}</span>
                  <span style={{ fontSize: "0.6875rem", color: S.secondary }}>{p.value_date ?? "—"}</span>
                  <span style={{ fontSize: "0.6875rem", color: p.status === "CONFIRMED" ? S.green : S.amber }}>{p.status}</span>
                  <span style={{ fontSize: "0.6875rem", color: execColor(p.execution_status), fontWeight: 600 }}>{p.execution_status}</span>
                </div>))
            }
          </div>
        </div>
        {/* Activity log - 40% */}
        <div style={{ flex: "0 0 40%", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "7px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
            <span style={{ fontSize: "0.5625rem", letterSpacing: "0.1em", color: S.tertiary }}>ACTIVITY LOG</span>
          </div>
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
            {log.map(line => (
              <div key={line.id} style={{ display: "flex", gap: 8, lineHeight: 1.5 }}>
                <span style={{ fontSize: "0.5625rem", color: S.tertiary, whiteSpace: "nowrap", marginTop: 1 }}>[{line.ts}]</span>
                <span style={{ fontSize: "0.6875rem", color: KIND_COLOR[line.kind], wordBreak: "break-word" }}>{line.text}</span>
              </div>))}
          </div>
        </div>
      </div>

      {/* Command input */}
      <div style={{ borderTop: `1px solid ${S.rim}`, background: S.bgPanel, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: S.cyan, fontSize: "0.875rem", fontWeight: 700, userSelect: "none" }}>{">"}  </span>
        <input type="text" value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleCommand(cmd); }}
          placeholder="Type a command... (help, status, positions, clear)"
          autoComplete="off" spellCheck={false}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: S.fontMono, fontSize: "0.8125rem", color: S.primary }}/>
        <button type="button" onClick={() => handleCommand(cmd)}
          style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", padding: "3px 10px",
            border: `1px solid ${S.soft}`, color: S.tertiary, background: "transparent", cursor: "pointer" }}>EXEC</button>
      </div>
    </div>
  );
}
