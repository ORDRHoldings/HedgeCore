"use client";
/**
 * TradingPanel.tsx — Right-side collapsible trading panel
 *
 * Three tabs: ORDER (paper trading form), POSITIONS (placeholder),
 * WATCHLIST (mini price cards for major pairs).
 * All order inputs are UI-only — no backend execution.
 */
import React, { useState, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, ShoppingCart, List, Eye,
} from "lucide-react";

/* ===================================================================
   Constants
   =================================================================== */

const PANEL_WIDTH = 280;
const COLLAPSED_WIDTH = 28;
const TRANSITION_MS = 200;

const C = {
  bg: "#0F1319",
  bgInput: "#131722",
  border: "#2A2E39",
  text: "#D1D4DC",
  textDim: "#787B86",
  textMuted: "#545B69",
  accent: "#2962FF",
  buyGreen: "#26A69A",
  sellRed: "#EF5350",
  fontMono: "'IBM Plex Mono', monospace",
  fontUI: "'IBM Plex Sans', sans-serif",
} as const;

type Tab = "ORDER" | "POSITIONS" | "WATCHLIST";
type Side = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT" | "STOP";

/* ===================================================================
   Watchlist mock data
   =================================================================== */

interface WatchlistPair {
  symbol: string;
  display: string;
  price: number;
  change: number;
}

const WATCHLIST_PAIRS: WatchlistPair[] = [
  { symbol: "EURUSD", display: "EUR/USD", price: 1.08432, change: 0.12 },
  { symbol: "GBPUSD", display: "GBP/USD", price: 1.27145, change: -0.08 },
  { symbol: "USDJPY", display: "USD/JPY", price: 149.832, change: 0.24 },
  { symbol: "AUDUSD", display: "AUD/USD", price: 0.65218, change: -0.15 },
  { symbol: "USDCAD", display: "USD/CAD", price: 1.36512, change: 0.06 },
  { symbol: "USDCHF", display: "USD/CHF", price: 0.87645, change: -0.03 },
];

/* ===================================================================
   Props
   =================================================================== */

export interface TradingPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  pair: string;
  onPairChange?: (pair: string) => void;
}

/* ===================================================================
   Component
   =================================================================== */

export default function TradingPanel({
  isOpen,
  onToggle,
  pair,
  onPairChange,
}: TradingPanelProps) {
  const [tab, setTab] = useState<Tab>("ORDER");
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("0.10");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  const displayPair = useMemo(() => {
    if (pair.length >= 6) return `${pair.slice(0, 3)}/${pair.slice(3)}`;
    return pair;
  }, [pair]);

  /* ── Collapsed strip ── */
  if (!isOpen) {
    return (
      <div
        onClick={onToggle}
        style={{
          width: COLLAPSED_WIDTH,
          minWidth: COLLAPSED_WIDTH,
          background: C.bg,
          borderLeft: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          userSelect: "none",
          transition: `width ${TRANSITION_MS}ms ease`,
        }}
      >
        <ChevronLeft size={14} color={C.textDim} />
        <span
          style={{
            fontFamily: C.fontMono,
            fontSize: 10,
            fontWeight: 700,
            color: C.textDim,
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            letterSpacing: 2,
            marginTop: 8,
          }}
        >
          TRADE
        </span>
      </div>
    );
  }

  /* ── Expanded panel ── */
  return (
    <div
      style={{
        width: PANEL_WIDTH,
        minWidth: PANEL_WIDTH,
        background: C.bg,
        borderLeft: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        transition: `width ${TRANSITION_MS}ms ease`,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span
          style={{
            fontFamily: C.fontMono,
            fontSize: 12,
            fontWeight: 700,
            color: C.text,
            letterSpacing: 1,
          }}
        >
          TRADING
        </span>
        <span
          style={{
            fontFamily: C.fontMono,
            fontSize: 9,
            marginLeft: 8,
            padding: "1px 5px",
            borderRadius: 3,
            background: "rgba(239,83,80,0.12)",
            color: C.sellRed,
          }}
        >
          Paper
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onToggle}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          <ChevronRight size={16} color={C.textDim} />
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {(["ORDER", "POSITIONS", "WATCHLIST"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "8px 0",
              fontFamily: C.fontMono,
              fontSize: 10,
              fontWeight: 600,
              color: tab === t ? C.text : C.textMuted,
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? `2px solid ${C.accent}` : "2px solid transparent",
              cursor: "pointer",
              letterSpacing: 0.5,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {tab === "ORDER" && (
          <OrderTab
            pair={displayPair}
            side={side}
            setSide={setSide}
            orderType={orderType}
            setOrderType={setOrderType}
            price={price}
            setPrice={setPrice}
            quantity={quantity}
            setQuantity={setQuantity}
            takeProfit={takeProfit}
            setTakeProfit={setTakeProfit}
            stopLoss={stopLoss}
            setStopLoss={setStopLoss}
          />
        )}
        {tab === "POSITIONS" && <PositionsTab />}
        {tab === "WATCHLIST" && (
          <WatchlistTab onPairChange={onPairChange} />
        )}
      </div>
    </div>
  );
}

/* ===================================================================
   ORDER Tab
   =================================================================== */

function OrderTab({
  pair,
  side,
  setSide,
  orderType,
  setOrderType,
  price,
  setPrice,
  quantity,
  setQuantity,
  takeProfit,
  setTakeProfit,
  stopLoss,
  setStopLoss,
}: {
  pair: string;
  side: Side;
  setSide: (s: Side) => void;
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  price: string;
  setPrice: (v: string) => void;
  quantity: string;
  setQuantity: (v: string) => void;
  takeProfit: string;
  setTakeProfit: (v: string) => void;
  stopLoss: string;
  setStopLoss: (v: string) => void;
}) {
  const isBuy = side === "BUY";
  const sideColor = isBuy ? C.buyGreen : C.sellRed;
  const lotPresets = ["0.01", "0.10", "1.00"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Symbol */}
      <div
        style={{
          fontFamily: C.fontMono,
          fontSize: 14,
          fontWeight: 700,
          color: C.text,
          textAlign: "center",
          padding: "4px 0",
        }}
      >
        {pair}
      </div>

      {/* Buy / Sell toggle */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={() => setSide("BUY")}
          style={{
            flex: 1,
            padding: "8px 0",
            fontFamily: C.fontMono,
            fontSize: 12,
            fontWeight: 700,
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            background: side === "BUY" ? C.buyGreen : "rgba(38,166,154,0.12)",
            color: side === "BUY" ? "#fff" : C.buyGreen,
            transition: "all 0.15s",
          }}
        >
          BUY
        </button>
        <button
          onClick={() => setSide("SELL")}
          style={{
            flex: 1,
            padding: "8px 0",
            fontFamily: C.fontMono,
            fontSize: 12,
            fontWeight: 700,
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            background: side === "SELL" ? C.sellRed : "rgba(239,83,80,0.12)",
            color: side === "SELL" ? "#fff" : C.sellRed,
            transition: "all 0.15s",
          }}
        >
          SELL
        </button>
      </div>

      {/* Order Type */}
      <FieldLabel label="ORDER TYPE">
        <select
          value={orderType}
          onChange={(e) => setOrderType(e.target.value as OrderType)}
          style={selectStyle()}
        >
          <option value="MARKET">Market</option>
          <option value="LIMIT">Limit</option>
          <option value="STOP">Stop</option>
        </select>
      </FieldLabel>

      {/* Price (for limit/stop) */}
      {orderType !== "MARKET" && (
        <FieldLabel label="PRICE">
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00000"
            style={inputStyle()}
          />
        </FieldLabel>
      )}

      {/* Quantity */}
      <FieldLabel label="QUANTITY (LOTS)">
        <input
          type="text"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0.10"
          style={inputStyle()}
        />
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {lotPresets.map((lot) => (
            <button
              key={lot}
              onClick={() => setQuantity(lot)}
              style={{
                flex: 1,
                padding: "4px 0",
                fontFamily: C.fontMono,
                fontSize: 10,
                fontWeight: 600,
                border: `1px solid ${quantity === lot ? sideColor : C.border}`,
                borderRadius: 3,
                background: quantity === lot ? `${sideColor}18` : "transparent",
                color: quantity === lot ? sideColor : C.textDim,
                cursor: "pointer",
              }}
            >
              {lot}
            </button>
          ))}
        </div>
      </FieldLabel>

      {/* TP / SL */}
      <div style={{ display: "flex", gap: 8 }}>
        <FieldLabel label="TAKE PROFIT" style={{ flex: 1 }}>
          <input
            type="text"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            placeholder="—"
            style={inputStyle()}
          />
        </FieldLabel>
        <FieldLabel label="STOP LOSS" style={{ flex: 1 }}>
          <input
            type="text"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder="—"
            style={inputStyle()}
          />
        </FieldLabel>
      </div>

      {/* Place Order button */}
      <button
        style={{
          padding: "10px 0",
          fontFamily: C.fontMono,
          fontSize: 12,
          fontWeight: 700,
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          background: sideColor,
          color: "#fff",
          letterSpacing: 0.5,
          marginTop: 4,
        }}
      >
        PLACE {side} ORDER
      </button>

      {/* Risk calculator */}
      <div
        style={{
          background: C.bgInput,
          borderRadius: 6,
          padding: 10,
          border: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            fontFamily: C.fontMono,
            fontSize: 10,
            fontWeight: 600,
            color: C.textMuted,
            marginBottom: 8,
            letterSpacing: 0.5,
          }}
        >
          RISK CALCULATOR
        </div>
        <RiskRow label="Pip Value" value="$1.00" />
        <RiskRow label="Margin Req." value="$33.33" />
        <RiskRow label="Risk %" value="0.33%" />
        <div
          style={{
            fontFamily: C.fontMono,
            fontSize: 9,
            color: C.textMuted,
            marginTop: 6,
            fontStyle: "italic",
          }}
        >
          Estimates only (Paper)
        </div>
      </div>
    </div>
  );
}

/* ===================================================================
   POSITIONS Tab
   =================================================================== */

function PositionsTab() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 200,
        gap: 12,
      }}
    >
      <List size={32} color={C.textMuted} strokeWidth={1.5} />
      <span
        style={{
          fontFamily: C.fontMono,
          fontSize: 12,
          color: C.textMuted,
          fontWeight: 600,
        }}
      >
        No open positions
      </span>
      <span
        style={{
          fontFamily: C.fontUI,
          fontSize: 11,
          color: C.textMuted,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Paper trading positions will appear here when you place orders.
      </span>
    </div>
  );
}

/* ===================================================================
   WATCHLIST Tab
   =================================================================== */

function WatchlistTab({
  onPairChange,
}: {
  onPairChange?: (pair: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {WATCHLIST_PAIRS.map((wp) => {
        const isUp = wp.change >= 0;
        const changeColor = isUp ? C.buyGreen : C.sellRed;
        const isHovered = hovered === wp.symbol;

        return (
          <button
            key={wp.symbol}
            onClick={() => onPairChange?.(wp.symbol)}
            onMouseEnter={() => setHovered(wp.symbol)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 10px",
              background: isHovered ? "rgba(41,98,255,0.08)" : "transparent",
              border: `1px solid ${isHovered ? C.accent : C.border}`,
              borderRadius: 6,
              cursor: "pointer",
              transition: "all 0.12s",
            }}
          >
            <div style={{ flex: 1, textAlign: "left" }}>
              <div
                style={{
                  fontFamily: C.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.text,
                }}
              >
                {wp.display}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: C.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.text,
                }}
              >
                {wp.price.toFixed(wp.price >= 100 ? 3 : 5)}
              </div>
              <div
                style={{
                  fontFamily: C.fontMono,
                  fontSize: 10,
                  fontWeight: 600,
                  color: changeColor,
                }}
              >
                {isUp ? "+" : ""}
                {wp.change.toFixed(2)}%
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ===================================================================
   Shared helpers
   =================================================================== */

function FieldLabel({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <div
        style={{
          fontFamily: C.fontMono,
          fontSize: 10,
          fontWeight: 600,
          color: C.textMuted,
          marginBottom: 4,
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function RiskRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "3px 0",
      }}
    >
      <span
        style={{
          fontFamily: C.fontUI,
          fontSize: 11,
          color: C.textDim,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: C.fontMono,
          fontSize: 11,
          fontWeight: 600,
          color: C.text,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "6px 8px",
    fontFamily: C.fontMono,
    fontSize: 12,
    color: C.text,
    background: C.bgInput,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    outline: "none",
    boxSizing: "border-box",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "6px 8px",
    fontFamily: C.fontMono,
    fontSize: 12,
    color: C.text,
    background: C.bgInput,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    outline: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  };
}
