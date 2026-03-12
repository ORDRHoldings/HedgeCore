"use client";
/**
 * ChartIndicatorDialog.tsx -- TradingView-style indicator search dialog
 *
 * Full-screen overlay modal for searching and configuring chart indicators.
 * Categories: ALL, TREND, OSCILLATORS, VOLUME, VOLATILITY, SMART MONEY.
 * Keyboard: Esc closes, Arrow keys navigate, Enter toggles.
 * Sub-pane indicators limited to 3 active at a time.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Plus, Check, Search, AlertTriangle } from "lucide-react";

/* ================================================================
   Indicator Registry
   ================================================================ */

export type IndicatorCategory =
  | "trend"
  | "oscillators"
  | "volume"
  | "volatility"
  | "smartmoney";

export interface IndicatorDef {
  key: string;
  name: string;
  shortDesc: string;
  category: IndicatorCategory;
  type: "overlay" | "subpane";
}

export const INDICATOR_REGISTRY: IndicatorDef[] = [
  // Trend (overlays)
  { key: "sma20", name: "SMA (20)", shortDesc: "Simple Moving Average, 20 period", category: "trend", type: "overlay" },
  { key: "sma50", name: "SMA (50)", shortDesc: "Simple Moving Average, 50 period", category: "trend", type: "overlay" },
  { key: "sma200", name: "SMA (200)", shortDesc: "Simple Moving Average, 200 period", category: "trend", type: "overlay" },
  { key: "ema20", name: "EMA (20)", shortDesc: "Exponential Moving Average, 20 period", category: "trend", type: "overlay" },
  { key: "ema50", name: "EMA (50)", shortDesc: "Exponential Moving Average, 50 period", category: "trend", type: "overlay" },
  { key: "hma9", name: "HMA (9)", shortDesc: "Hull Moving Average, 9 period", category: "trend", type: "overlay" },
  { key: "tema20", name: "TEMA (20)", shortDesc: "Triple EMA, 20 period", category: "trend", type: "overlay" },
  { key: "vwap", name: "VWAP", shortDesc: "Volume Weighted Average Price", category: "trend", type: "overlay" },
  { key: "ichimoku", name: "Ichimoku Cloud", shortDesc: "Ichimoku Kinko Hyo (9, 26, 52)", category: "trend", type: "overlay" },
  { key: "parabolicSAR", name: "Parabolic SAR", shortDesc: "Stop and Reverse dots", category: "trend", type: "overlay" },

  // Volatility (overlays)
  { key: "bollinger", name: "Bollinger Bands", shortDesc: "BB (20, 2) -- volatility envelope", category: "volatility", type: "overlay" },
  { key: "keltner", name: "Keltner Channel", shortDesc: "KC (20, 10) -- ATR-based channel", category: "volatility", type: "overlay" },
  { key: "donchian", name: "Donchian Channel", shortDesc: "DC (20) -- high/low channel", category: "volatility", type: "overlay" },

  // Oscillators (sub-panes)
  { key: "rsi", name: "RSI", shortDesc: "Relative Strength Index, 14 period", category: "oscillators", type: "subpane" },
  { key: "macd", name: "MACD", shortDesc: "Moving Average Convergence Divergence", category: "oscillators", type: "subpane" },
  { key: "stochastic", name: "Stochastic", shortDesc: "Stochastic Oscillator (14, 3, 3)", category: "oscillators", type: "subpane" },
  { key: "stochRSI", name: "Stochastic RSI", shortDesc: "Stoch RSI (14, 14, 3, 3)", category: "oscillators", type: "subpane" },
  { key: "williamsR", name: "Williams %R", shortDesc: "Williams Percent Range, 14 period", category: "oscillators", type: "subpane" },
  { key: "cci", name: "CCI", shortDesc: "Commodity Channel Index, 20 period", category: "oscillators", type: "subpane" },
  { key: "adx", name: "ADX", shortDesc: "Average Directional Index, 14 period", category: "oscillators", type: "subpane" },

  // Volume (sub-panes + overlay)
  { key: "volumeProfile", name: "Volume Profile", shortDesc: "Horizontal volume at price levels", category: "volume", type: "overlay" },
  { key: "obv", name: "OBV", shortDesc: "On-Balance Volume", category: "volume", type: "subpane" },
  { key: "mfi", name: "MFI", shortDesc: "Money Flow Index, 14 period", category: "volume", type: "subpane" },
  { key: "cmf", name: "CMF", shortDesc: "Chaikin Money Flow, 20 period", category: "volume", type: "subpane" },

  // Smart Money (overlays)
  { key: "sr", name: "Support / Resistance", shortDesc: "Auto-detected key levels", category: "smartmoney", type: "overlay" },
  { key: "fvg", name: "Fair Value Gaps", shortDesc: "Imbalance zones (FVG)", category: "smartmoney", type: "overlay" },
  { key: "trendlines", name: "Auto Trendlines", shortDesc: "Algorithmically detected trends", category: "smartmoney", type: "overlay" },
  { key: "pivotPoints", name: "Pivot Points", shortDesc: "Classic pivot levels", category: "smartmoney", type: "overlay" },
];

/* ================================================================
   Category Tabs
   ================================================================ */

type CategoryTab = "all" | IndicatorCategory;

const TABS: { key: CategoryTab; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "trend", label: "TREND" },
  { key: "oscillators", label: "OSCILLATORS" },
  { key: "volume", label: "VOLUME" },
  { key: "volatility", label: "VOLATILITY" },
  { key: "smartmoney", label: "SMART MONEY" },
];

/* ================================================================
   Constants
   ================================================================ */

const MAX_SUBPANES = 3;
const ACCENT = "#2962FF";
const MODAL_BG = "#1E222D";
const ROW_HOVER = "#2A2E39";
const MUTED = "#787B86";
const TEXT_PRIMARY = "#D1D4DC";
const TEXT_WHITE = "#FFFFFF";
const BORDER = "#2A2E39";
const INPUT_BG = "#131722";
const OVERLAY_BG = "rgba(0,0,0,0.7)";
const WARNING_COLOR = "#FF9800";

const FONT_MONO = "'IBM Plex Mono', monospace";
const FONT_UI = "'IBM Plex Sans', sans-serif";

/* ================================================================
   Props
   ================================================================ */

export interface ChartIndicatorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeOverlays: Record<string, boolean>;
  activeSubPanes: string[];
  onToggleOverlay: (key: string) => void;
  onToggleSubPane: (key: string) => void;
}

/* ================================================================
   Helpers (exported for testing)
   ================================================================ */

export function filterIndicators(
  registry: IndicatorDef[],
  search: string,
  category: CategoryTab,
): IndicatorDef[] {
  let results = registry;
  if (category !== "all") {
    results = results.filter((ind) => ind.category === category);
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    results = results.filter(
      (ind) =>
        ind.name.toLowerCase().includes(q) ||
        ind.shortDesc.toLowerCase().includes(q),
    );
  }
  return results;
}

export function isIndicatorActive(
  ind: IndicatorDef,
  activeOverlays: Record<string, boolean>,
  activeSubPanes: string[],
): boolean {
  if (ind.type === "subpane") {
    return activeSubPanes.includes(ind.key);
  }
  return !!activeOverlays[ind.key];
}

/* ================================================================
   Component
   ================================================================ */

export default function ChartIndicatorDialog({
  isOpen,
  onClose,
  activeOverlays,
  activeSubPanes,
  onToggleOverlay,
  onToggleSubPane,
}: ChartIndicatorDialogProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");
  const [focusIndex, setFocusIndex] = useState(-1);
  const [warning, setWarning] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Filtered list
  const filtered = useMemo(
    () => filterIndicators(INDICATOR_REGISTRY, search, activeTab),
    [search, activeTab],
  );

  // Reset focus index when filter changes
  useEffect(() => {
    setFocusIndex(-1);
  }, [search, activeTab]);

  // Clear warning after 3s
  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 3000);
    return () => clearTimeout(t);
  }, [warning]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setActiveTab("all");
      setFocusIndex(-1);
      setWarning(null);
      // Small delay to let the DOM mount
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusIndex < 0 || !listRef.current) return;
    const rows = listRef.current.querySelectorAll("[data-indicator-row]");
    if (rows[focusIndex]) {
      (rows[focusIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [focusIndex]);

  const handleToggle = useCallback(
    (ind: IndicatorDef) => {
      if (ind.type === "subpane") {
        const currentlyActive = activeSubPanes.includes(ind.key);
        if (!currentlyActive && activeSubPanes.length >= MAX_SUBPANES) {
          setWarning(
            `Maximum ${MAX_SUBPANES} sub-pane indicators. Remove one first.`,
          );
          return;
        }
        onToggleSubPane(ind.key);
      } else {
        onToggleOverlay(ind.key);
      }
    },
    [activeSubPanes, onToggleOverlay, onToggleSubPane],
  );

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < filtered.length) {
          handleToggle(filtered[focusIndex]);
        }
        return;
      }
    },
    [onClose, filtered, focusIndex, handleToggle],
  );

  // Click outside to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: OVERLAY_BG,
      }}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      data-testid="indicator-dialog-overlay"
    >
      <div
        ref={modalRef}
        style={{
          width: 560,
          maxHeight: 500,
          background: MODAL_BG,
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        data-testid="indicator-dialog-modal"
      >
        {/* ---- Header ---- */}
        <div
          style={{
            padding: "16px 20px 0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: FONT_UI,
              fontSize: 16,
              fontWeight: 600,
              color: TEXT_WHITE,
            }}
          >
            Indicators
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: MUTED,
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
            }}
            data-testid="indicator-dialog-close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ---- Search ---- */}
        <div style={{ padding: "12px 20px 0 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: INPUT_BG,
              borderRadius: 8,
              padding: "8px 12px",
              border: `1px solid ${BORDER}`,
            }}
          >
            <Search size={14} color={MUTED} style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search indicators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: FONT_UI,
                fontSize: 14,
                color: TEXT_PRIMARY,
              }}
              data-testid="indicator-search-input"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: MUTED,
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                }}
                data-testid="indicator-search-clear"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ---- Category Tabs ---- */}
        <div
          style={{
            display: "flex",
            gap: 0,
            padding: "12px 20px 0 20px",
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: isActive ? ACCENT : MUTED,
                  background: "none",
                  border: "none",
                  borderBottom: isActive
                    ? `2px solid ${ACCENT}`
                    : "2px solid transparent",
                  padding: "6px 12px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                data-testid={`indicator-tab-${tab.key}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ---- Warning Banner ---- */}
        {warning && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px",
              background: "rgba(255,152,0,0.1)",
              borderBottom: `1px solid ${BORDER}`,
            }}
            data-testid="indicator-warning"
          >
            <AlertTriangle size={14} color={WARNING_COLOR} />
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 12,
                color: WARNING_COLOR,
              }}
            >
              {warning}
            </span>
          </div>
        )}

        {/* ---- Indicator List ---- */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            maxHeight: 350,
            padding: "4px 0",
          }}
          data-testid="indicator-list"
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                fontFamily: FONT_UI,
                fontSize: 13,
                color: MUTED,
              }}
              data-testid="indicator-empty"
            >
              No indicators found
            </div>
          )}

          {filtered.map((ind, idx) => {
            const active = isIndicatorActive(
              ind,
              activeOverlays,
              activeSubPanes,
            );
            const focused = idx === focusIndex;

            return (
              <IndicatorRow
                key={ind.key}
                ind={ind}
                active={active}
                focused={focused}
                onToggle={() => handleToggle(ind)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Indicator Row
   ================================================================ */

interface IndicatorRowProps {
  ind: IndicatorDef;
  active: boolean;
  focused: boolean;
  onToggle: () => void;
}

function IndicatorRow({ ind, active, focused, onToggle }: IndicatorRowProps) {
  const [hovered, setHovered] = useState(false);

  const showHighlight = hovered || focused;

  return (
    <button
      data-indicator-row
      data-testid={`indicator-row-${ind.key}`}
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        padding: "8px 20px",
        gap: 12,
        border: "none",
        cursor: "pointer",
        background: showHighlight ? ROW_HOVER : "transparent",
        outline: focused ? `1px solid ${ACCENT}` : "none",
        outlineOffset: -1,
      }}
    >
      {/* Name */}
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 13,
          fontWeight: active ? 700 : 400,
          color: active ? TEXT_WHITE : TEXT_PRIMARY,
          minWidth: 150,
          textAlign: "left",
        }}
      >
        {ind.name}
      </span>

      {/* Description */}
      <span
        style={{
          flex: 1,
          fontFamily: FONT_UI,
          fontSize: 12,
          color: MUTED,
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {ind.shortDesc}
      </span>

      {/* Type badge */}
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 9,
          letterSpacing: "0.05em",
          color: ind.type === "subpane" ? "#FF9800" : "#787B86",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {ind.type === "subpane" ? "PANE" : "OVL"}
      </span>

      {/* Toggle icon */}
      <span
        style={{
          width: 24,
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {active ? (
          <Check size={16} color={ACCENT} strokeWidth={3} />
        ) : (
          <Plus size={16} color={MUTED} />
        )}
      </span>
    </button>
  );
}
