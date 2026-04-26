"use client";
/**
 * ChartContextMenu.tsx — TradingView-style right-click context menu
 *
 * Absolute-positioned menu with sections, keyboard shortcuts, separators,
 * and hover submenus for chart type, price scale, and crosshair mode.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export interface ChartContextMenuProps {
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
}

type MenuItemType = "action" | "separator" | "header" | "submenu";

interface MenuItem {
  type: MenuItemType;
  label?: string;
  action?: string;
  shortcut?: string;
  submenuKey?: string;
}

interface SubmenuItem {
  label: string;
  action: string;
  radio?: boolean;
}

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const FONT_MONO = "'IBM Plex Mono', monospace";
const FONT_UI = "'IBM Plex Sans', sans-serif";
const MENU_WIDTH = 220;
const SUBMENU_WIDTH = 180;

const MENU_ITEMS: MenuItem[] = [
  { type: "header", label: "Chart" },
  { type: "action", label: "Reset Chart", action: "reset", shortcut: "Ctrl+R" },
  { type: "action", label: "Auto-fit", action: "autofit", shortcut: "Double-click" },
  { type: "separator" },
  { type: "action", label: "Screenshot", action: "screenshot", shortcut: "Ctrl+Shift+S" },
  { type: "action", label: "Fullscreen", action: "fullscreen", shortcut: "F11" },
  { type: "header", label: "Indicators" },
  { type: "action", label: "Add Indicator...", action: "addIndicator", shortcut: "/" },
  { type: "header", label: "Drawings" },
  { type: "action", label: "Trend Line", action: "trendline", shortcut: "Alt+T" },
  { type: "action", label: "Horizontal Line", action: "horizontal", shortcut: "Alt+H" },
  { type: "action", label: "Fibonacci", action: "fibonacci", shortcut: "Alt+F" },
  { type: "action", label: "Rectangle", action: "rectangle", shortcut: "Alt+R" },
  { type: "separator" },
  { type: "action", label: "Delete All Drawings", action: "deleteAllDrawings", shortcut: "Ctrl+Del" },
  { type: "header", label: "Display" },
  { type: "submenu", label: "Chart Type", submenuKey: "chartType" },
  { type: "submenu", label: "Price Scale", submenuKey: "priceScale" },
  { type: "submenu", label: "Crosshair Mode", submenuKey: "crosshairMode" },
];

const SUBMENUS: Record<string, { items: SubmenuItem[]; defaultAction: string }> = {
  chartType: {
    items: [
      { label: "Candles", action: "chartType:candles", radio: true },
      { label: "Hollow", action: "chartType:hollow", radio: true },
      { label: "Bars", action: "chartType:bars", radio: true },
      { label: "Line", action: "chartType:line", radio: true },
      { label: "Area", action: "chartType:area", radio: true },
      { label: "Heikin Ashi", action: "chartType:heikinashi", radio: true },
      { label: "Baseline", action: "chartType:baseline", radio: true },
    ],
    defaultAction: "chartType:candles",
  },
  priceScale: {
    items: [
      { label: "Linear", action: "priceScale:linear", radio: true },
      { label: "Logarithmic", action: "priceScale:log", radio: true },
      { label: "Percentage", action: "priceScale:percentage", radio: true },
    ],
    defaultAction: "priceScale:linear",
  },
  crosshairMode: {
    items: [
      { label: "Crosshair", action: "crosshairMode:crosshair", radio: true },
      { label: "Dot", action: "crosshairMode:dot", radio: true },
      { label: "None", action: "crosshairMode:none", radio: true },
    ],
    defaultAction: "crosshairMode:crosshair",
  },
};

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export default function ChartContextMenu({
  x,
  y,
  isOpen,
  onClose,
  onAction,
}: ChartContextMenuProps) {
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [selectedRadios, setSelectedRadios] = useState<Record<string, string>>({
    chartType: "chartType:candles",
    priceScale: "priceScale:linear",
    crosshairMode: "crosshairMode:crosshair",
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Delay to avoid closing immediately from the contextmenu event
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen, onClose]);

  // Reset submenu on close
  useEffect(() => {
    if (!isOpen) setActiveSubmenu(null);
  }, [isOpen]);

  // Position clamping
  const menuStyle = useCallback((): React.CSSProperties => {
    const viewW = typeof window !== "undefined" ? window.innerWidth : 1920;
    const viewH = typeof window !== "undefined" ? window.innerHeight : 1080;
    // Approximate max menu height (generous)
    const approxHeight = MENU_ITEMS.length * 28 + 60;
    let left = x;
    let top = y;
    if (left + MENU_WIDTH > viewW - 8) left = viewW - MENU_WIDTH - 8;
    if (top + approxHeight > viewH - 8) top = viewH - approxHeight - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    return {
      position: "fixed",
      left,
      top,
      zIndex: 10000,
    };
  }, [x, y]);

  const handleAction = useCallback(
    (action: string) => {
      // Track radio selection
      for (const key of Object.keys(SUBMENUS)) {
        if (action.startsWith(`${key}:`)) {
          setSelectedRadios((prev) => ({ ...prev, [key]: action }));
        }
      }
      onAction(action);
      onClose();
    },
    [onAction, onClose]
  );

  const handleSubmenuEnter = useCallback((key: string) => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
    setActiveSubmenu(key);
  }, []);

  const handleSubmenuLeave = useCallback(() => {
    submenuTimerRef.current = setTimeout(() => {
      setActiveSubmenu(null);
    }, 200);
  }, []);

  if (!isOpen) return null;

  return (
    <div ref={menuRef} style={menuStyle()}>
      <div
        style={{
          width: MENU_WIDTH,
          background: "#1E222D",
          border: "1px solid #2A2E39",
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          padding: "4px 0",
          overflow: "hidden",
        }}
      >
        {MENU_ITEMS.map((item, i) => {
          if (item.type === "separator") {
            return (
              <div
                key={`sep-${i}`}
                style={{
                  height: 1,
                  background: "#2A2E39",
                  margin: "4px 8px",
                }}
              />
            );
          }

          if (item.type === "header") {
            return (
              <div
                key={`hdr-${i}`}
                style={{
                  padding: "6px 12px 2px",
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#545B69",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  userSelect: "none",
                }}
              >
                {item.label}
              </div>
            );
          }

          if (item.type === "submenu" && item.submenuKey) {
            const subKey = item.submenuKey;
            const sub = SUBMENUS[subKey];
            const isActive = activeSubmenu === subKey;

            return (
              <div
                key={`sub-${subKey}`}
                style={{ position: "relative" }}
                onMouseEnter={() => handleSubmenuEnter(subKey)}
                onMouseLeave={handleSubmenuLeave}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 12px",
                    cursor: "pointer",
                    background: isActive ? "#2A2E39" : "transparent",
                    transition: "background 0.1s",
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_UI,
                      fontSize: 12,
                      color: "#D1D4DC",
                      flex: 1,
                    }}
                  >
                    {item.label}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#787B86"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </div>

                {/* Submenu */}
                {isActive && sub && (
                  <div
                    onMouseEnter={() => handleSubmenuEnter(subKey)}
                    onMouseLeave={handleSubmenuLeave}
                    style={{
                      position: "absolute",
                      left: MENU_WIDTH - 2,
                      top: -4,
                      width: SUBMENU_WIDTH,
                      background: "#1E222D",
                      border: "1px solid #2A2E39",
                      borderRadius: 6,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                      padding: "4px 0",
                      zIndex: 10001,
                    }}
                  >
                    {sub.items.map((subItem) => {
                      const isSelected = selectedRadios[subKey] === subItem.action;
                      return (
                        <SubMenuRow
                          key={subItem.action}
                          label={subItem.label}
                          isRadio={!!subItem.radio}
                          isSelected={isSelected}
                          onClick={() => handleAction(subItem.action)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Regular action item
          return (
            <ActionRow
              key={item.action ?? `item-${i}`}
              label={item.label ?? ""}
              shortcut={item.shortcut}
              onClick={() => {
                if (item.action) handleAction(item.action);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════ */

function ActionRow({
  label,
  shortcut,
  onClick,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 12px",
        cursor: "pointer",
        background: hovered ? "#2A2E39" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <span
        style={{
          fontFamily: FONT_UI,
          fontSize: 12,
          color: label === "Delete All Drawings" ? "#EF5350" : "#D1D4DC",
          flex: 1,
        }}
      >
        {label}
      </span>
      {shortcut && (
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: "#545B69",
            marginLeft: 12,
            whiteSpace: "nowrap",
          }}
        >
          {shortcut}
        </span>
      )}
    </div>
  );
}

function SubMenuRow({
  label,
  isRadio,
  isSelected,
  onClick,
}: {
  label: string;
  isRadio: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 12px",
        cursor: "pointer",
        background: hovered ? "#2A2E39" : "transparent",
        transition: "background 0.1s",
        gap: 8,
      }}
    >
      {isRadio && (
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: `2px solid ${isSelected ? "#2962FF" : "#545B69"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isSelected && (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#2962FF",
              }}
            />
          )}
        </div>
      )}
      <span
        style={{
          fontFamily: FONT_UI,
          fontSize: 12,
          color: isSelected ? "#D1D4DC" : "#787B86",
          fontWeight: isSelected ? 600 : 400,
        }}
      >
        {label}
      </span>
    </div>
  );
}
