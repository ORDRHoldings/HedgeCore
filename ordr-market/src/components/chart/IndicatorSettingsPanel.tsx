"use client";
/**
 * IndicatorSettingsPanel.tsx -- Floating parameter editor for active indicators
 *
 * Opens as a small popover positioned near the indicator chip.
 * Provides live parameter editing with immediate recalculation,
 * visibility toggle, reset-to-defaults, and remove actions.
 * Dark theme matching the chart canvas.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { RotateCcw, Trash2, Eye, EyeOff } from "lucide-react";
import type { IndicatorSchema, IndicatorParam } from "./core/indicatorSchema";
import { getIndicatorSchema, getDefaultParams, clampParam } from "./core/indicatorSchema";

/* ================================================================
   Constants
   ================================================================ */

const PANEL_BG = "#1E222D";
const INPUT_BG = "#131722";
const BORDER = "#2A2E39";
const TEXT_PRIMARY = "#D1D4DC";
const TEXT_WHITE = "#FFFFFF";
const MUTED = "#787B86";
const ACCENT = "#2962FF";
const DANGER = "#EF5350";
const FONT_MONO = "'IBM Plex Mono', monospace";
const FONT_UI = "'IBM Plex Sans', sans-serif";

/* ================================================================
   Props
   ================================================================ */

export interface IndicatorSettingsPanelProps {
  indicatorId: string;
  params: Record<string, number>;
  visible: boolean;
  anchorRect: { top: number; left: number; width: number; height: number } | null;
  onParamsChange: (id: string, params: Record<string, number>) => void;
  onRemove: (id: string) => void;
  onVisibilityToggle?: (id: string) => void;
  onClose: () => void;
  isHidden?: boolean;
}

/* ================================================================
   Component
   ================================================================ */

export default function IndicatorSettingsPanel({
  indicatorId,
  params,
  visible,
  anchorRect,
  onParamsChange,
  onRemove,
  onVisibilityToggle,
  onClose,
  isHidden,
}: IndicatorSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const schema = getIndicatorSchema(indicatorId);

  // Click outside to close
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing immediately from the gear click
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [visible, onClose]);

  // Escape to close
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, onClose]);

  const handleParamChange = useCallback(
    (paramKey: string, value: number) => {
      if (!schema) return;
      const paramDef = schema.params.find((p) => p.key === paramKey);
      if (!paramDef) return;
      const clamped = clampParam(paramDef, value);
      onParamsChange(indicatorId, { ...params, [paramKey]: clamped });
    },
    [indicatorId, params, schema, onParamsChange],
  );

  const handleReset = useCallback(() => {
    const defaults = getDefaultParams(indicatorId);
    onParamsChange(indicatorId, defaults);
  }, [indicatorId, onParamsChange]);

  const handleRemove = useCallback(() => {
    onRemove(indicatorId);
    onClose();
  }, [indicatorId, onRemove, onClose]);

  if (!visible || !schema) return null;

  // Position: below and slightly right of the chip
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 10000,
    top: anchorRect ? anchorRect.top + anchorRect.height + 4 : 100,
    left: anchorRect ? anchorRect.left : 100,
    minWidth: 220,
    maxWidth: 280,
    background: PANEL_BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    overflow: "hidden",
  };

  const hasParams = schema.params.length > 0;
  const isDefault = hasParams && schema.params.every((p) => {
    const current = params[p.key];
    return current === undefined || current === p.default;
  });

  return (
    <div ref={panelRef} style={panelStyle} data-testid="indicator-settings-panel">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px 8px 12px",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: schema.color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            fontWeight: 700,
            color: TEXT_WHITE,
            flex: 1,
          }}
        >
          {schema.name}
        </span>
      </div>

      {/* Params */}
      {hasParams && (
        <div style={{ padding: "8px 12px" }}>
          {schema.params.map((p) => (
            <ParamRow
              key={p.key}
              param={p}
              value={params[p.key] ?? (p.default as number)}
              onChange={(v) => handleParamChange(p.key, v)}
            />
          ))}
        </div>
      )}

      {/* No params message */}
      {!hasParams && (
        <div
          style={{
            padding: "12px",
            fontFamily: FONT_UI,
            fontSize: 12,
            color: MUTED,
            textAlign: "center",
          }}
        >
          No configurable parameters
        </div>
      )}

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 12px 10px 12px",
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        {/* Visibility toggle */}
        {onVisibilityToggle && (
          <ActionButton
            icon={isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
            tooltip={isHidden ? "Show" : "Hide"}
            onClick={() => onVisibilityToggle(indicatorId)}
            color={MUTED}
            hoverColor={ACCENT}
            testId="indicator-settings-visibility"
          />
        )}

        {/* Reset */}
        {hasParams && (
          <ActionButton
            icon={<RotateCcw size={13} />}
            tooltip="Reset defaults"
            onClick={handleReset}
            color={isDefault ? "#363A45" : MUTED}
            hoverColor={ACCENT}
            disabled={isDefault}
            testId="indicator-settings-reset"
          />
        )}

        <span style={{ flex: 1 }} />

        {/* Remove */}
        <ActionButton
          icon={<Trash2 size={13} />}
          tooltip="Remove indicator"
          onClick={handleRemove}
          color={MUTED}
          hoverColor={DANGER}
          testId="indicator-settings-remove"
        />
      </div>
    </div>
  );
}

/* ================================================================
   ParamRow
   ================================================================ */

function ParamRow({
  param,
  value,
  onChange,
}: {
  param: IndicatorParam;
  value: number;
  onChange: (v: number) => void;
}) {
  const [localValue, setLocalValue] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Sync from props when not focused
  useEffect(() => {
    if (!focused) {
      setLocalValue(String(value));
    }
  }, [value, focused]);

  const commit = useCallback(() => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) {
      onChange(parsed);
    } else {
      setLocalValue(String(value));
    }
  }, [localValue, value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        (e.target as HTMLInputElement).blur();
      }
      // Arrow up/down to increment/decrement
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const step = param.step ?? 1;
        const delta = e.key === "ArrowUp" ? step : -step;
        const next = parseFloat(localValue) + delta;
        if (!isNaN(next)) {
          const clamped = clampParam(param, next);
          setLocalValue(String(clamped));
          onChange(clamped);
        }
      }
    },
    [commit, localValue, param, onChange],
  );

  const isSelect = param.type === "select" && Array.isArray(param.options);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 6,
      }}
      data-testid={`param-row-${param.key}`}
    >
      <label
        style={{
          fontFamily: FONT_UI,
          fontSize: 12,
          color: MUTED,
          marginRight: 12,
          whiteSpace: "nowrap",
        }}
      >
        {param.label}
      </label>
      {isSelect ? (
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: 120,
            padding: "4px 6px",
            background: INPUT_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: TEXT_PRIMARY,
            outline: "none",
            cursor: "pointer",
          }}
          data-testid={`param-select-${param.key}`}
        >
          {param.options!.map((opt) => (
            <option key={String(opt.value)} value={Number(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          value={localValue}
          min={param.min}
          max={param.max}
          step={param.step}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: 64,
            padding: "4px 6px",
            background: INPUT_BG,
            border: `1px solid ${focused ? ACCENT : BORDER}`,
            borderRadius: 4,
            fontFamily: FONT_MONO,
            fontSize: 12,
            color: TEXT_PRIMARY,
            textAlign: "right",
            outline: "none",
            transition: "border-color 0.15s",
          }}
          data-testid={`param-input-${param.key}`}
        />
      )}
    </div>
  );
}

/* ================================================================
   ActionButton
   ================================================================ */

function ActionButton({
  icon,
  tooltip,
  onClick,
  color,
  hoverColor,
  disabled,
  testId,
}: {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  color: string;
  hoverColor: string;
  disabled?: boolean;
  testId?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      title={tooltip}
      aria-label={tooltip}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 4,
        border: "none",
        background: hovered && !disabled ? "rgba(255,255,255,0.06)" : "transparent",
        color: hovered && !disabled ? hoverColor : color,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "color 0.15s, background 0.15s",
        padding: 0,
      }}
      data-testid={testId}
    >
      {icon}
    </button>
  );
}
