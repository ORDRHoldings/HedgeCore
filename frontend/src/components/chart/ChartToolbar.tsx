"use client";
/**
 * ChartToolbar.tsx — Grouped dropdown menus for ORDR Chart Platform
 *
 * Dark-themed toolbar with MA, Bands, Oscillators, Volume, Smart Money,
 * and Drawing tool groups. Manages dropdown open/close state internally.
 */
import React, { useState, useEffect, useRef } from "react";
import type { DrawingType } from "./renderers/drawings";
import { getPointsRequired } from "./renderers/drawings";
import { THEME } from "./core/theme";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export interface ChartIndicatorConfig {
  [key: string]: boolean;
}

interface DropdownItem {
  key: string;
  label: string;
  color: string;
  isSubPane?: boolean;
}

interface ChartToolbarProps {
  config: ChartIndicatorConfig;
  onToggle: (key: string) => void;
  activeSubPanes: string[];
  onToggleSubPane: (key: string) => void;
  drawingMode: DrawingType | null;
  onSetDrawingMode: (mode: DrawingType | null) => void;
  hasDrawings: boolean;
  onClearDrawings: () => void;
}

/* ═══════════════════════════════════════════════════════
   Menu Definitions
   ═══════════════════════════════════════════════════════ */

const MA_ITEMS: DropdownItem[] = [
  { key: "sma20", label: "SMA 20", color: THEME.sma1Color },
  { key: "sma50", label: "SMA 50", color: THEME.sma2Color },
  { key: "sma200", label: "SMA 200", color: "#FF5252" },
  { key: "ema20", label: "EMA 20", color: THEME.emaColor },
  { key: "ema50", label: "EMA 50", color: "#00E676" },
  { key: "hma9", label: "HMA 9", color: "#00E676" },
  { key: "tema20", label: "TEMA 20", color: "#FF4081" },
  { key: "vwap", label: "VWAP", color: THEME.vwapColor },
  { key: "wma", label: "WMA 20", color: "#FF9800" },
  { key: "smma", label: "SMMA 20", color: "#FF7043" },
  { key: "alma", label: "ALMA 21", color: "#AB47BC" },
  { key: "dema", label: "DEMA 20", color: "#26C6DA" },
  { key: "lsma", label: "LSMA 25", color: "#66BB6A" },
  { key: "mcginley", label: "McGinley 14", color: "#FFA726" },
  { key: "vwma", label: "VWMA 20", color: "#EC407A" },
  { key: "maRibbon", label: "MA Ribbon", color: "#EF5350" },
];

const BAND_ITEMS: DropdownItem[] = [
  { key: "bollinger", label: "Bollinger Bands", color: THEME.bbLine },
  { key: "keltner", label: "Keltner Channel", color: THEME.kcLine },
  { key: "ichimoku", label: "Ichimoku Cloud", color: "#2962FF" },
  { key: "donchian", label: "Donchian Channel", color: "#00BCD4" },
  { key: "envelope", label: "Envelope (20,2.5%)", color: "#78909C" },
  { key: "supertrend", label: "SuperTrend (10,3)", color: "#26A69A" },
  { key: "chandelierExit", label: "Chandelier Exit", color: "#26A69A" },
  { key: "chandeKrollStop", label: "Chande Kroll Stop", color: "#EF5350" },
  { key: "alligator", label: "Alligator", color: "#2962FF" },
  { key: "zigzag", label: "ZigZag", color: "#FFD54F" },
  { key: "autoFib", label: "Auto Fibonacci", color: "#26A69A" },
];

const OSCILLATOR_ITEMS: DropdownItem[] = [
  { key: "rsi", label: "RSI (14)", color: THEME.rsiColor, isSubPane: true },
  { key: "macd", label: "MACD (12,26,9)", color: THEME.macdLine, isSubPane: true },
  { key: "stochastic", label: "Stochastic (14,3)", color: THEME.stochK, isSubPane: true },
  { key: "stochRSI", label: "Stoch RSI", color: "#FF6D00", isSubPane: true },
  { key: "williamsR", label: "Williams %R", color: "#FF6D00", isSubPane: true },
  { key: "cci", label: "CCI (20)", color: "#2196F3", isSubPane: true },
  { key: "adx", label: "ADX (14)", color: "#787B86", isSubPane: true },
  { key: "ao", label: "Awesome Oscillator", color: "#26A69A", isSubPane: true },
  { key: "bop", label: "Balance of Power", color: "#9E9E9E", isSubPane: true },
  { key: "bullBearPower", label: "Bull Bear Power", color: "#26A69A", isSubPane: true },
  { key: "cmo", label: "CMO (14)", color: "#FF6D00", isSubPane: true },
  { key: "choppiness", label: "Choppiness (14)", color: "#9E9E9E", isSubPane: true },
  { key: "connorsRSI", label: "Connors RSI", color: "#7B1FA2", isSubPane: true },
  { key: "dpo", label: "DPO (21)", color: "#FF4081", isSubPane: true },
  { key: "fisher", label: "Fisher Transform", color: "#E91E63", isSubPane: true },
  { key: "klinger", label: "Klinger Oscillator", color: "#2196F3", isSubPane: true },
  { key: "kst", label: "KST", color: "#FF9800", isSubPane: true },
  { key: "massIndex", label: "Mass Index", color: "#9C27B0", isSubPane: true },
  { key: "momentum", label: "Momentum (10)", color: "#26C6DA", isSubPane: true },
  { key: "ppo", label: "PPO", color: "#2962FF", isSubPane: true },
  { key: "roc", label: "ROC (9)", color: "#00BCD4", isSubPane: true },
  { key: "rvi", label: "Relative Vigor Index", color: "#26C6DA", isSubPane: true },
  { key: "trix", label: "TRIX (18)", color: "#FF4081", isSubPane: true },
  { key: "tsi", label: "TSI", color: "#7B1FA2", isSubPane: true },
  { key: "ultimateOscillator", label: "Ultimate Oscillator", color: "#FF9800", isSubPane: true },
  { key: "vortex", label: "Vortex (14)", color: "#26C6DA", isSubPane: true },
  { key: "aroon", label: "Aroon (25)", color: "#26C6DA", isSubPane: true },
  { key: "bbPercentB", label: "BB %B", color: "#2196F3", isSubPane: true },
  { key: "bbWidth", label: "BB Width", color: "#FF9800", isSubPane: true },
  { key: "histVol", label: "Historical Volatility", color: "#7B1FA2", isSubPane: true },
  { key: "correlation", label: "Correlation Coeff", color: "#26A69A", isSubPane: true },
];

const VOLUME_ITEMS: DropdownItem[] = [
  { key: "volumeProfile", label: "Volume Profile", color: THEME.vpPocColor },
  { key: "obv", label: "OBV", color: "#FF9800", isSubPane: true },
  { key: "mfi", label: "MFI (14)", color: "#E040FB", isSubPane: true },
  { key: "cmf", label: "CMF (20)", color: "#00BCD4", isSubPane: true },
  { key: "adl", label: "Acc/Dist Line", color: "#FF9800", isSubPane: true },
  { key: "cvd", label: "Cumulative Vol Delta", color: "#26C6DA", isSubPane: true },
  { key: "cvi", label: "Chaikin Volatility", color: "#FF6D00", isSubPane: true },
  { key: "netVolume", label: "Net Volume", color: "#26A69A", isSubPane: true },
  { key: "pvt", label: "Price Vol Trend", color: "#E91E63", isSubPane: true },
  { key: "volumeOscillator", label: "Volume Oscillator", color: "#FF9800", isSubPane: true },
  { key: "adr", label: "Avg Daily Range", color: "#FFD54F", isSubPane: true },
];

const SMART_ITEMS: DropdownItem[] = [
  { key: "sr", label: "S/R", color: "#26A69A" },
  { key: "fvg", label: "FVG", color: "#26A69A" },
  { key: "trendlines", label: "TREND", color: "#EF5350" },
  { key: "pivotPoints", label: "PIVOT", color: "#9598A1" },
  { key: "parabolicSAR", label: "SAR", color: "#26A69A" },
];

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export default function ChartToolbar({
  config, onToggle, activeSubPanes, onToggleSubPane,
  drawingMode, onSetDrawingMode, hasDrawings, onClearDrawings,
}: ChartToolbarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 3,
      padding: "4px 8px",
      borderBottom: `1px solid ${THEME.subPaneBorder}`,
      background: THEME.axisBg,
      flexWrap: "wrap", minHeight: 32,
      position: "relative", zIndex: 20,
    }}>
      {/* Grouped dropdowns */}
      <DropdownGroup
        label="MA" items={MA_ITEMS}
        config={config} activeSubPanes={activeSubPanes}
        onToggle={onToggle} onToggleSubPane={onToggleSubPane}
        openMenu={openMenu} setOpenMenu={setOpenMenu}
      />
      <DropdownGroup
        label="BANDS" items={BAND_ITEMS}
        config={config} activeSubPanes={activeSubPanes}
        onToggle={onToggle} onToggleSubPane={onToggleSubPane}
        openMenu={openMenu} setOpenMenu={setOpenMenu}
      />
      <DropdownGroup
        label="OSC" items={OSCILLATOR_ITEMS}
        config={config} activeSubPanes={activeSubPanes}
        onToggle={onToggle} onToggleSubPane={onToggleSubPane}
        openMenu={openMenu} setOpenMenu={setOpenMenu}
      />
      <DropdownGroup
        label="VOL" items={VOLUME_ITEMS}
        config={config} activeSubPanes={activeSubPanes}
        onToggle={onToggle} onToggleSubPane={onToggleSubPane}
        openMenu={openMenu} setOpenMenu={setOpenMenu}
      />

      <Sep />

      {/* Smart Money — inline toggles */}
      {SMART_ITEMS.map(item => (
        <TBtn key={item.key} active={config[item.key]} onClick={() => onToggle(item.key)}>
          {item.label}
        </TBtn>
      ))}

      <Sep />

      {/* Drawing tools */}
      {(["trendline", "horizontal", "fibonacci", "rectangle"] as DrawingType[]).map(dt => (
        <TBtn
          key={dt}
          active={drawingMode === dt}
          onClick={() => onSetDrawingMode(drawingMode === dt ? null : dt)}
        >
          {dt === "trendline" ? "LINE" : dt === "horizontal" ? "HORIZ" : dt === "fibonacci" ? "FIB" : "RECT"}
        </TBtn>
      ))}
      {hasDrawings && (
        <TBtn active={false} onClick={onClearDrawings} color="#EF5350">CLR</TBtn>
      )}

      {drawingMode && (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: THEME.stochK, marginLeft: 8 }}>
          {(() => {
            const n = getPointsRequired(drawingMode);
            if (n < 0) return "Click points, double-click to finish";
            return `Click ${n} point${n !== 1 ? "s" : ""} on chart`;
          })()}
        </span>
      )}

      {activeSubPanes.length > 0 && (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: THEME.axisText, marginLeft: "auto" }}>
          {activeSubPanes.length}/3 PANES
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Dropdown Group
   ═══════════════════════════════════════════════════════ */

function DropdownGroup({ label, items, config, activeSubPanes, onToggle, onToggleSubPane, openMenu, setOpenMenu }: {
  label: string;
  items: DropdownItem[];
  config: ChartIndicatorConfig;
  activeSubPanes: string[];
  onToggle: (key: string) => void;
  onToggleSubPane: (key: string) => void;
  openMenu: string | null;
  setOpenMenu: (key: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = openMenu === label;

  const activeCount = items.filter(i =>
    i.isSubPane ? activeSubPanes.includes(i.key) : config[i.key]
  ).length;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, setOpenMenu]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpenMenu(isOpen ? null : label)}
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10, fontWeight: 600,
          padding: "2px 8px", borderRadius: 4,
          border: `1px solid ${activeCount > 0 ? THEME.stochK : "transparent"}`,
          background: activeCount > 0 ? "rgba(41,98,255,0.12)" : "transparent",
          color: activeCount > 0 ? THEME.stochK : THEME.axisText,
          cursor: "pointer", lineHeight: "18px",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        {label}
        {activeCount > 0 && (
          <span style={{ fontSize: 10, opacity: 0.7 }}>({activeCount})</span>
        )}
        <span style={{ fontSize: 10, marginLeft: 2 }}>{isOpen ? "\u25B4" : "\u25BE"}</span>
      </button>

      {isOpen && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          background: "#1A1E2E", border: `1px solid ${THEME.subPaneBorder}`,
          borderRadius: 8, padding: 4, minWidth: 180,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          zIndex: 100,
        }}>
          {items.map(item => {
            const isActive = item.isSubPane ? activeSubPanes.includes(item.key) : config[item.key];
            return (
              <button
                key={item.key}
                onClick={() => item.isSubPane ? onToggleSubPane(item.key) : onToggle(item.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "6px 10px", borderRadius: 4,
                  border: "none", cursor: "pointer",
                  background: isActive ? "rgba(41,98,255,0.12)" : "transparent",
                  color: isActive ? "#D1D4DC" : THEME.axisText,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11, textAlign: "left",
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: item.color, flexShrink: 0,
                }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {isActive && <span style={{ color: "#26A69A", fontSize: 12 }}>{"\u2713"}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Toolbar Button + Separator
   ═══════════════════════════════════════════════════════ */

function TBtn({ children, active, onClick, color }: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10, fontWeight: 600,
        padding: "2px 8px", borderRadius: 4,
        border: `1px solid ${active ? (color || THEME.stochK) : "transparent"}`,
        background: active ? (color ? `${color}20` : "rgba(41,98,255,0.12)") : "transparent",
        color: active ? (color || THEME.stochK) : THEME.axisText,
        cursor: "pointer", lineHeight: "18px",
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 16, background: THEME.subPaneBorder, margin: "0 4px" }} />;
}
