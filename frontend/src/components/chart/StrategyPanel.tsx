"use client";
/**
 * StrategyPanel.tsx — Collapsible bottom strategy panel
 *
 * Three tabs: BUILDER (visual condition builder), BACKTEST (placeholder),
 * ALERTS (placeholder). Resizable via drag handle.
 * All logic is UI-only — no execution engine yet.
 */
import React, { useState, useCallback, useRef } from "react";
import {
  ChevronUp, ChevronDown, Plus, Play, Bell, Trash2, FlaskConical,
} from "lucide-react";

/* ===================================================================
   Constants
   =================================================================== */

const MIN_HEIGHT = 100;
const HANDLE_HEIGHT = 6;

const C = {
  bg: "#0F1319",
  bgInput: "#131722",
  bgSub: "#1E222D",
  border: "#2A2E39",
  text: "#D1D4DC",
  textDim: "#787B86",
  textMuted: "#545B69",
  accent: "#2962FF",
  green: "#26A69A",
  red: "#EF5350",
  amber: "#FF9800",
  fontMono: "'IBM Plex Mono', monospace",
  fontUI: "'IBM Plex Sans', sans-serif",
} as const;

type Tab = "BUILDER" | "BACKTEST" | "ALERTS";

/* ===================================================================
   Sample conditions
   =================================================================== */

interface Condition {
  id: string;
  type: "entry" | "exit";
  label: string;
  indicator: string;
  comparison: string;
  value: string;
}

const SAMPLE_CONDITIONS: Condition[] = [
  {
    id: "c1",
    type: "entry",
    label: "RSI crosses above 30",
    indicator: "RSI(14)",
    comparison: "crosses above",
    value: "30",
  },
  {
    id: "c2",
    type: "entry",
    label: "Price crosses SMA(20)",
    indicator: "Price",
    comparison: "crosses above",
    value: "SMA(20)",
  },
  {
    id: "c3",
    type: "exit",
    label: "RSI crosses below 70",
    indicator: "RSI(14)",
    comparison: "crosses below",
    value: "70",
  },
];

/* ===================================================================
   Props
   =================================================================== */

export interface StrategyPanelProps {
  height: number;
  onResize: (height: number) => void;
  onClose: () => void;
}

/* ===================================================================
   Collapsed toggle strip (exported for use when panel is closed)
   =================================================================== */

export function StrategyPanelToggle({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        background: hovered ? C.bgSub : C.bg,
        borderTop: `1px solid ${C.border}`,
        cursor: "pointer",
        userSelect: "none",
        transition: "background 0.12s",
      }}
    >
      <ChevronUp size={12} color={C.textDim} />
      <span
        style={{
          fontFamily: C.fontMono,
          fontSize: 10,
          fontWeight: 600,
          color: C.textDim,
          letterSpacing: 1,
        }}
      >
        STRATEGY LAB
      </span>
    </div>
  );
}

/* ===================================================================
   Main Component
   =================================================================== */

export default function StrategyPanel({
  height,
  onResize,
  onClose,
}: StrategyPanelProps) {
  const [tab, setTab] = useState<Tab>("BUILDER");
  const [conditions, setConditions] = useState<Condition[]>(SAMPLE_CONDITIONS);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  /* ── Resize drag ── */
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: height };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        const maxH = Math.floor(window.innerHeight * 0.5);
        const newH = Math.max(MIN_HEIGHT, Math.min(maxH, dragRef.current.startH + delta));
        onResize(newH);
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [height, onResize],
  );

  const removeCondition = useCallback((id: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addCondition = useCallback(() => {
    const newId = `c${Date.now()}`;
    setConditions((prev) => [
      ...prev,
      {
        id: newId,
        type: "entry",
        label: "New Condition",
        indicator: "Price",
        comparison: "crosses above",
        value: "SMA(20)",
      },
    ]);
  }, []);

  return (
    <div
      style={{
        height,
        minHeight: MIN_HEIGHT,
        background: C.bg,
        borderTop: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          height: HANDLE_HEIGHT,
          cursor: "ns-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 40,
            height: 2,
            borderRadius: 1,
            background: C.border,
          }}
        />
      </div>

      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          height: 32,
          minHeight: 32,
          borderBottom: `1px solid ${C.border}`,
          gap: 4,
        }}
      >
        <FlaskConical size={14} color={C.accent} />
        <span
          style={{
            fontFamily: C.fontMono,
            fontSize: 11,
            fontWeight: 700,
            color: C.text,
            letterSpacing: 1,
            marginRight: 12,
          }}
        >
          STRATEGY LAB
        </span>

        {/* Tabs */}
        {(["BUILDER", "BACKTEST", "ALERTS"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "4px 10px",
              fontFamily: C.fontMono,
              fontSize: 10,
              fontWeight: 600,
              color: tab === t ? C.text : C.textMuted,
              background: tab === t ? "rgba(41,98,255,0.12)" : "transparent",
              border: tab === t ? `1px solid ${C.accent}` : "1px solid transparent",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          <ChevronDown size={16} color={C.textDim} />
        </button>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {tab === "BUILDER" && (
          <BuilderTab
            conditions={conditions}
            onAdd={addCondition}
            onRemove={removeCondition}
          />
        )}
        {tab === "BACKTEST" && <BacktestTab />}
        {tab === "ALERTS" && <AlertsTab />}
      </div>
    </div>
  );
}

/* ===================================================================
   BUILDER Tab
   =================================================================== */

function BuilderTab({
  conditions,
  onAdd,
  onRemove,
}: {
  conditions: Condition[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const entryConditions = conditions.filter((c) => c.type === "entry");
  const exitConditions = conditions.filter((c) => c.type === "exit");

  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      {/* Left: Conditions list */}
      <div
        style={{
          width: 280,
          minWidth: 200,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: C.fontMono,
              fontSize: 10,
              fontWeight: 600,
              color: C.textMuted,
              letterSpacing: 0.5,
            }}
          >
            CONDITIONS
          </span>
          <button
            onClick={onAdd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              fontFamily: C.fontMono,
              fontSize: 10,
              fontWeight: 600,
              color: C.accent,
              background: "rgba(41,98,255,0.12)",
              border: `1px solid ${C.accent}`,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            <Plus size={10} />
            ADD
          </button>
        </div>

        {conditions.map((cond) => (
          <ConditionCard key={cond.id} condition={cond} onRemove={onRemove} />
        ))}

        {conditions.length === 0 && (
          <div
            style={{
              fontFamily: C.fontUI,
              fontSize: 11,
              color: C.textMuted,
              textAlign: "center",
              padding: 20,
            }}
          >
            No conditions defined. Click ADD to create one.
          </div>
        )}
      </div>

      {/* Right: Strategy summary */}
      <div
        style={{
          flex: 1,
          background: C.bgInput,
          borderRadius: 6,
          border: `1px solid ${C.border}`,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <SummarySection title="ENTRY RULES" color={C.green}>
          {entryConditions.length === 0 ? (
            <span style={{ fontFamily: C.fontUI, fontSize: 11, color: C.textMuted }}>
              No entry conditions
            </span>
          ) : (
            entryConditions.map((c) => (
              <div
                key={c.id}
                style={{
                  fontFamily: C.fontMono,
                  fontSize: 11,
                  color: C.text,
                  padding: "2px 0",
                }}
              >
                {c.indicator} {c.comparison} {c.value}
              </div>
            ))
          )}
        </SummarySection>

        <SummarySection title="EXIT RULES" color={C.red}>
          {exitConditions.length === 0 ? (
            <span style={{ fontFamily: C.fontUI, fontSize: 11, color: C.textMuted }}>
              No exit conditions
            </span>
          ) : (
            exitConditions.map((c) => (
              <div
                key={c.id}
                style={{
                  fontFamily: C.fontMono,
                  fontSize: 11,
                  color: C.text,
                  padding: "2px 0",
                }}
              >
                {c.indicator} {c.comparison} {c.value}
              </div>
            ))
          )}
        </SummarySection>

        <div style={{ flex: 1 }} />

        <button
          disabled
          style={{
            padding: "8px 16px",
            fontFamily: C.fontMono,
            fontSize: 11,
            fontWeight: 700,
            color: C.textMuted,
            background: C.bgSub,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            cursor: "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: 0.6,
          }}
        >
          <Play size={12} />
          RUN BACKTEST
          <span
            style={{
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 3,
              background: "rgba(255,152,0,0.15)",
              color: C.amber,
              marginLeft: 4,
            }}
          >
            Coming Soon
          </span>
        </button>
      </div>
    </div>
  );
}

/* ===================================================================
   Condition Card
   =================================================================== */

function ConditionCard({
  condition,
  onRemove,
}: {
  condition: Condition;
  onRemove: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const typeColor = condition.type === "entry" ? C.green : C.red;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        background: C.bgInput,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${typeColor}`,
        borderRadius: 4,
      }}
    >
      <span
        style={{
          fontFamily: C.fontMono,
          fontSize: 10,
          fontWeight: 700,
          color: typeColor,
          textTransform: "uppercase",
          minWidth: 32,
        }}
      >
        {condition.type}
      </span>
      <span
        style={{
          fontFamily: C.fontMono,
          fontSize: 11,
          color: C.text,
          flex: 1,
        }}
      >
        {condition.label}
      </span>
      {hovered && (
        <button
          onClick={() => onRemove(condition.id)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Trash2 size={12} color={C.red} />
        </button>
      )}
    </div>
  );
}

/* ===================================================================
   Summary Section
   =================================================================== */

function SummarySection({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: C.fontMono,
          fontSize: 10,
          fontWeight: 700,
          color,
          letterSpacing: 0.5,
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

/* ===================================================================
   BACKTEST Tab
   =================================================================== */

function BacktestTab() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 80,
        gap: 12,
      }}
    >
      <Play size={28} color={C.textMuted} strokeWidth={1.5} />
      <span
        style={{
          fontFamily: C.fontMono,
          fontSize: 12,
          color: C.textMuted,
          fontWeight: 600,
        }}
      >
        Backtest Engine
      </span>
      <span
        style={{
          fontFamily: C.fontUI,
          fontSize: 11,
          color: C.textMuted,
          textAlign: "center",
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        Configure a strategy in the Builder tab, then run backtests to see
        simulated equity curves and performance metrics.
      </span>
      <span
        style={{
          fontFamily: C.fontMono,
          fontSize: 10,
          padding: "2px 8px",
          borderRadius: 3,
          background: "rgba(255,152,0,0.12)",
          color: C.amber,
        }}
      >
        Coming Soon
      </span>
    </div>
  );
}

/* ===================================================================
   ALERTS Tab
   =================================================================== */

function AlertsTab() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 80,
        gap: 12,
      }}
    >
      <Bell size={28} color={C.textMuted} strokeWidth={1.5} />
      <span
        style={{
          fontFamily: C.fontMono,
          fontSize: 12,
          color: C.textMuted,
          fontWeight: 600,
        }}
      >
        No alerts configured
      </span>
      <button
        disabled
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 14px",
          fontFamily: C.fontMono,
          fontSize: 11,
          fontWeight: 600,
          color: C.textMuted,
          background: C.bgSub,
          border: `1px solid ${C.border}`,
          borderRadius: 4,
          cursor: "not-allowed",
          opacity: 0.6,
        }}
      >
        <Plus size={12} />
        CREATE ALERT
        <span
          style={{
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 3,
            background: "rgba(255,152,0,0.15)",
            color: C.amber,
          }}
        >
          Coming Soon
        </span>
      </button>
    </div>
  );
}
