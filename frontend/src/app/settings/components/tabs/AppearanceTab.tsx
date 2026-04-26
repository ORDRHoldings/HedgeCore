"use client";
/**
 * AppearanceTab -- Appearance & UX settings.
 * Templates, themes, constrained customization, live preview.
 */
import { useState, useCallback, useMemo } from "react";
import { S } from "../../types/settings";
import {
  Monitor, Moon, Sun, Palette, Layout, Type, Eye, Zap,
  Check, AlertTriangle, ArrowUp, ArrowDown, Info, TriangleAlert, XCircle,
} from "lucide-react";

import type {
  AppearanceSettings, ThemeId, AccentId, Density,
  UIFont, NumericFont, BaseFontSize,
} from "@/lib/theme/types";
import { THEME_PRESETS, CURATED_ACCENTS } from "@/lib/theme/presets";
import { TEMPLATES } from "@/lib/theme/templates";
import { validateThemeContrast, validateAccentContrast } from "@/lib/theme/contrast";

/* ── Props ─────────────────────────────────────────────────────────────────── */
interface Props {
  appearance: AppearanceSettings;
  onChange: (settings: AppearanceSettings) => void;
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** Section header with icon, title, optional description. */
function SectionHead({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  desc?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
        letterSpacing: "0.08em", color: S.secondary, textTransform: "uppercase",
        borderBottom: `1px solid ${S.rim}`, paddingBottom: 6,
      }}>
        <Icon size={14} style={{ color: S.cyan, flexShrink: 0 }} />
        {title}
      </div>
      {desc && (
        <div style={{
          fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 4,
        }}>
          {desc}
        </div>
      )}
    </div>
  );
}

/** Toggle row: label + native toggle switch. */
function ToggleRow({
  label,
  checked,
  onChange,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  note?: string;
}) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
      background: checked ? `color-mix(in srgb, ${S.cyan} 5%, transparent)` : S.bgSub,
      border: `1px solid ${checked ? S.cyan : S.rim}`,
      borderRadius: 2, padding: "10px 14px",
    }}>
      {/* Track */}
      <div
        role="switch"
        aria-checked={checked}
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        style={{
          position: "relative", width: 34, height: 18, borderRadius: 9, flexShrink: 0,
          background: checked ? S.cyan : S.tertiary, cursor: "pointer",
          transition: "background 0.15s",
        }}
      >
        <div style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 14, height: 14, borderRadius: 7,
          background: S.white, transition: "left 0.15s",
        }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: S.fontUI, fontSize: 12, fontWeight: 600,
          color: checked ? S.primary : S.secondary,
        }}>
          {label}
        </div>
        {note && (
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 2 }}>
            {note}
          </div>
        )}
      </div>
    </label>
  );
}

/** Button group: connected horizontal buttons with active state. */
function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", borderRadius: 2, overflow: "hidden", border: `1px solid ${S.rim}` }}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontFamily: S.fontUI, fontSize: 12, fontWeight: active ? 700 : 500,
              color: active ? S.cyan : S.secondary,
              background: active ? `color-mix(in srgb, ${S.cyan} 8%, ${S.bgSub})` : S.bgSub,
              border: "none",
              borderRight: i < options.length - 1 ? `1px solid ${S.rim}` : "none",
              padding: "8px 12px", cursor: "pointer",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            {opt.icon && <opt.icon size={13} style={{ flexShrink: 0 }} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small colored circle for swatches. */
function SwatchCircle({
  color,
  size = 20,
  active = false,
  onClick,
  label,
}: {
  color: string;
  size?: number;
  active?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  return (
    <div
      onClick={onClick}
      title={label}
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{
        width: size, height: size, borderRadius: "50%", background: color,
        border: active ? `2px solid ${S.cyan}` : `1px solid ${S.rim}`,
        boxShadow: active ? `0 0 0 3px color-mix(in srgb, ${S.cyan} 25%, transparent)` : "none",
        transition: "box-shadow 0.12s, border 0.12s",
      }} />
      {label && (
        <span style={{
          fontFamily: S.fontMono, fontSize: 12, color: active ? S.cyan : S.tertiary,
          whiteSpace: "nowrap",
        }}>
          {label}
        </span>
      )}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────────── */

export default function AppearanceTab({ appearance, onChange }: Props) {
  const [accentError, setAccentError] = useState<string | null>(null);

  const preset = THEME_PRESETS[appearance.themeId];
  const colors = preset?.colors;

  /** Update a single field, clearing templateId (user customized). */
  const patch = useCallback(
    <K extends keyof AppearanceSettings>(key: K, val: AppearanceSettings[K]) => {
      setAccentError(null);
      onChange({ ...appearance, [key]: val, templateId: null });
    },
    [appearance, onChange],
  );

  /** Apply a template wholesale. */
  const applyTemplate = useCallback(
    (tpl: typeof TEMPLATES[number]) => {
      setAccentError(null);
      onChange({ ...tpl.settings });
    },
    [onChange],
  );

  /** Contrast warnings for the current theme. */
  const contrastWarnings = useMemo(() => {
    if (!colors) return [];
    return validateThemeContrast({
      bgDeep: colors.bgDeep,
      bgPanel: colors.bgPanel,
      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      borderRim: colors.borderRim,
      focusRing: colors.focusRing,
      accentBlue: colors.accentBlue,
    }).filter(r => !r.pass);
  }, [colors]);

  const handleAccent = useCallback(
    (id: AccentId) => {
      const accent = CURATED_ACCENTS.find(a => a.id === id);
      if (!accent || !colors) { patch("accentId", id); return; }
      const res = validateAccentContrast(accent.hex, colors.bgDeep, colors.bgPanel);
      if (!res.passOnDeep && !res.passOnPanel) {
        setAccentError(
          `${accent.label} fails contrast on both surfaces (${res.ratioDeep.toFixed(1)}:1 / ${res.ratioPanel.toFixed(1)}:1). Minimum 3:1 required.`
        );
        return;
      }
      setAccentError(null);
      onChange({ ...appearance, accentId: id, templateId: null });
    },
    [appearance, colors, onChange, patch],
  );

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
      {/* ── Left: Settings ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 400, display: "flex", flexDirection: "column", gap: 28 }}>

        {/* 1) Templates */}
        <section>
          <SectionHead icon={Zap} title="Quick Templates" desc="Apply a curated bundle of appearance settings." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {TEMPLATES.map(tpl => {
              const active = appearance.templateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl)}
                  style={{
                    cursor: "pointer", borderRadius: 2, padding: "14px 16px",
                    background: active ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgSub})` : S.bgSub,
                    border: `1px solid ${active ? S.cyan : S.rim}`,
                    transition: "border-color 0.12s, background 0.12s",
                  }}
                >
                  <div style={{
                    fontFamily: S.fontUI, fontSize: 13, fontWeight: 700,
                    color: active ? S.cyan : S.primary, marginBottom: 4,
                  }}>
                    {tpl.name}
                    {active && <Check size={12} style={{ marginLeft: 6, verticalAlign: "middle" }} />}
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 8 }}>
                    {tpl.description}
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, lineHeight: 1.6 }}>
                    {THEME_PRESETS[tpl.settings.themeId]?.name ?? tpl.settings.themeId}
                    {" / "}
                    {tpl.settings.density}
                    {" / "}
                    {tpl.settings.reducedMotion ? "no-motion" : "motion"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ height: 1, background: S.rim }} />

        {/* 2) Theme Presets */}
        <section>
          <SectionHead icon={Palette} title="Theme Preset" desc="Select a vetted color token set." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {Object.values(THEME_PRESETS).map(tp => {
              const active = appearance.themeId === tp.id;
              const c = tp.colors;
              return (
                <div
                  key={tp.id}
                  onClick={() => {
                    setAccentError(null);
                    onChange({ ...appearance, themeId: tp.id as ThemeId, templateId: null });
                  }}
                  style={{
                    cursor: "pointer", borderRadius: 2, padding: "14px 16px",
                    background: active ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgSub})` : S.bgSub,
                    border: `1px solid ${active ? S.cyan : S.rim}`,
                    transition: "border-color 0.12s, background 0.12s",
                  }}
                >
                  {/* Swatch row */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {[c.bgDeep, c.bgPanel, c.accentBlue, c.textPrimary].map((hex, i) => (
                      <div key={i} style={{
                        width: 16, height: 16, borderRadius: "50%",
                        background: hex, border: `1px solid ${S.rim}`,
                      }} />
                    ))}
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <div style={{
                      fontFamily: S.fontUI, fontSize: 13, fontWeight: 700,
                      color: active ? S.cyan : S.primary, flex: 1,
                    }}>
                      {tp.name}
                    </div>
                    {active && <Check size={14} style={{ color: S.cyan, flexShrink: 0 }} />}
                  </div>
                  <div style={{
                    display: "inline-block", marginTop: 4,
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                    letterSpacing: "0.08em", color: tp.mode === "dark" ? S.secondary : S.primary,
                    background: tp.mode === "dark" ? S.bgDeep : "rgba(255,255,255,0.12)",
                    padding: "2px 8px", borderRadius: 2,
                    border: `1px solid ${S.rim}`,
                    textTransform: "uppercase",
                  }}>
                    {tp.mode}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ height: 1, background: S.rim }} />

        {/* 3) Mode Override */}
        <section>
          <SectionHead icon={Monitor} title="Mode Override" />
          <ButtonGroup
            options={[
              { value: "system" as const, label: "System", icon: Monitor },
              { value: "dark" as const, label: "Dark", icon: Moon },
              { value: "light" as const, label: "Light", icon: Sun },
            ]}
            value={appearance.modeOverride}
            onChange={(v) => patch("modeOverride", v)}
          />
        </section>

        <div style={{ height: 1, background: S.rim }} />

        {/* 4) Density */}
        <section>
          <SectionHead icon={Layout} title="Density" />
          <ButtonGroup<Density>
            options={[
              { value: "compact", label: "Compact" },
              { value: "standard", label: "Standard" },
              { value: "spacious", label: "Spacious" },
            ]}
            value={appearance.density}
            onChange={(v) => patch("density", v)}
          />
        </section>

        <div style={{ height: 1, background: S.rim }} />

        {/* 5) Typography */}
        <section>
          <SectionHead icon={Type} title="Typography" />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* UI Font */}
            <div>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
                letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
              }}>
                UI FONT
              </div>
              <ButtonGroup<UIFont>
                options={[
                  { value: "IBM Plex Sans", label: "IBM Plex Sans" },
                  { value: "Inter", label: "Inter" },
                  { value: "system-ui", label: "System UI" },
                ]}
                value={appearance.uiFont}
                onChange={(v) => patch("uiFont", v)}
              />
            </div>
            {/* Numeric Font */}
            <div>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
                letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6,
              }}>
                NUMERIC FONT
              </div>
              <ButtonGroup<NumericFont>
                options={[
                  { value: "IBM Plex Mono", label: "IBM Plex Mono" },
                  { value: "JetBrains Mono", label: "JetBrains Mono" },
                  { value: "ui-monospace", label: "System Mono" },
                ]}
                value={appearance.numericFont}
                onChange={(v) => patch("numericFont", v)}
              />
            </div>
            {/* Base Font Size */}
            <div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 6,
              }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}>
                  BASE FONT SIZE
                </div>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 13, fontWeight: 700,
                  color: S.cyan,
                }}>
                  {appearance.baseFontSize}px
                </div>
              </div>
              <input
                type="range"
                min={12}
                max={16}
                step={1}
                value={appearance.baseFontSize}
                onChange={(e) => patch("baseFontSize", Number(e.target.value) as BaseFontSize)}
                style={{
                  width: "100%", accentColor: S.cyan, cursor: "pointer",
                }}
              />
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 2,
              }}>
                <span>12px</span>
                <span>16px</span>
              </div>
            </div>
            {/* Tabular Numerals */}
            <ToggleRow
              label="Tabular Numerals"
              checked={appearance.tabularNumerals}
              onChange={(v) => patch("tabularNumerals", v)}
              note="Align numeric columns using fixed-width digits."
            />
          </div>
        </section>

        <div style={{ height: 1, background: S.rim }} />

        {/* 6) Accessibility */}
        <section>
          <SectionHead icon={Eye} title="Accessibility" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ToggleRow
              label="Reduced Motion"
              checked={appearance.reducedMotion}
              onChange={(v) => patch("reducedMotion", v)}
              note="Disable animations and transitions."
            />
            <ToggleRow
              label="High Contrast"
              checked={appearance.highContrast}
              onChange={(v) => patch("highContrast", v)}
              note="Increase contrast for text and borders."
            />
            <ToggleRow
              label="Color + Icon for Gains / Losses"
              checked={appearance.colorPlusIcon}
              onChange={(v) => patch("colorPlusIcon", v)}
              note="Show directional icons and +/- signs alongside color for gains/losses."
            />
          </div>
        </section>

        <div style={{ height: 1, background: S.rim }} />

        {/* 7) Accent Color */}
        <section>
          <SectionHead icon={Palette} title="Accent Color" desc="Applied to buttons, links, and focus rings." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12, alignItems: "flex-start" }}>
            {CURATED_ACCENTS.map(acc => (
              <SwatchCircle
                key={acc.id}
                color={acc.hex}
                size={28}
                active={appearance.accentId === acc.id}
                onClick={() => handleAccent(acc.id)}
                label={acc.label}
              />
            ))}
          </div>
          {accentError && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 10,
              background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.fail} 30%, transparent)`,
              borderRadius: 2, padding: "8px 12px",
              fontFamily: S.fontUI, fontSize: 12, color: S.fail,
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              {accentError}
            </div>
          )}
        </section>

        <div style={{ height: 1, background: S.rim }} />

        {/* 8) Contrast Warnings */}
        {contrastWarnings.length > 0 && (
          <section>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
              background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
              borderLeft: `3px solid ${S.amber}`,
              borderRadius: 2, padding: "10px 14px",
            }}>
              <AlertTriangle size={14} style={{ color: S.amber, flexShrink: 0 }} />
              <div>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                  color: S.amber, letterSpacing: "0.06em", marginBottom: 2,
                }}>
                  WCAG CONTRAST WARNINGS
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                  The following color pairs do not meet minimum contrast requirements:
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {contrastWarnings.map((w, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
                  padding: "4px 8px", background: S.bgSub, borderRadius: 2,
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: w.fg, border: `1px solid ${S.rim}`, flexShrink: 0,
                  }} />
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: w.bg, border: `1px solid ${S.rim}`, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1 }}>{w.pair}</span>
                  <span style={{ color: S.fail, fontWeight: 700 }}>
                    {w.ratio.toFixed(1)}:1
                  </span>
                  <span style={{ color: S.tertiary }}>
                    (need {w.required}:1)
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Right: Live Preview ────────────────────────────────────────── */}
      <div style={{
        width: 380, flexShrink: 0, position: "sticky", top: 24, alignSelf: "flex-start",
      }}>
        <PreviewPane appearance={appearance} />
      </div>
    </div>
  );
}

/* ── Live Preview Pane ─────────────────────────────────────────────────────── */

function PreviewPane({ appearance }: { appearance: AppearanceSettings }) {
  const preset = THEME_PRESETS[appearance.themeId];
  if (!preset) return null;
  const c = preset.colors;
  const accent = CURATED_ACCENTS.find(a => a.id === appearance.accentId);
  const accentHex = accent?.hex ?? c.accentBlue;

  const fontUI = appearance.uiFont === "system-ui" ? "system-ui, sans-serif" : `'${appearance.uiFont}', sans-serif`;
  const fontNum = appearance.numericFont === "ui-monospace" ? "ui-monospace, monospace" : `'${appearance.numericFont}', monospace`;
  const fs = appearance.baseFontSize;
  const tabular: React.CSSProperties = appearance.tabularNumerals
    ? { fontVariantNumeric: "tabular-nums" }
    : {};

  const densityPad = appearance.density === "compact" ? 6 : appearance.density === "spacious" ? 14 : 10;

  return (
    <div style={{
      background: c.bgDeep, border: `1px solid ${c.borderRim}`, borderRadius: 3,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700,
        letterSpacing: "0.08em", textTransform: "uppercase",
        color: c.textSecondary, padding: "10px 16px",
        borderBottom: `1px solid ${c.borderRim}`, background: c.bgPanel,
      }}>
        LIVE PREVIEW
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Nav sample */}
        <div style={{
          display: "flex", gap: 0, background: c.bgPanel,
          borderRadius: 2, overflow: "hidden", border: `1px solid ${c.borderRim}`,
        }}>
          {["Dashboard", "Positions", "Hedges"].map((item, i) => {
            const active = i === 0;
            return (
              <div
                key={item}
                style={{
                  flex: 1, textAlign: "center", padding: `${densityPad}px 12px`,
                  fontFamily: fontUI, fontSize: Math.max(12, fs - 1), fontWeight: active ? 700 : 500,
                  color: active ? accentHex : c.textSecondary,
                  background: active ? `${accentHex}12` : "transparent",
                  borderBottom: active ? `2px solid ${accentHex}` : "2px solid transparent",
                }}
              >
                {item}
              </div>
            );
          })}
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {/* Gain */}
          <div style={{
            background: c.bgPanel, border: `1px solid ${c.borderRim}`,
            borderRadius: 2, padding: `${densityPad}px 12px`,
          }}>
            <div style={{
              fontFamily: fontUI, fontSize: Math.max(12, fs - 2),
              color: c.textSecondary, marginBottom: 4,
            }}>
              Net Gain
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: fontNum, fontSize: fs + 2, fontWeight: 700,
              color: c.accentGreen, ...tabular,
            }}>
              {appearance.colorPlusIcon && (
                <ArrowUp size={14} style={{ color: c.accentGreen, flexShrink: 0 }} />
              )}
              {appearance.colorPlusIcon ? "+$1,234,567" : "$1,234,567"}
            </div>
          </div>
          {/* Loss */}
          <div style={{
            background: c.bgPanel, border: `1px solid ${c.borderRim}`,
            borderRadius: 2, padding: `${densityPad}px 12px`,
          }}>
            <div style={{
              fontFamily: fontUI, fontSize: Math.max(12, fs - 2),
              color: c.textSecondary, marginBottom: 4,
            }}>
              Unrealized
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: fontNum, fontSize: fs + 2, fontWeight: 700,
              color: c.accentRed, ...tabular,
            }}>
              {appearance.colorPlusIcon && (
                <ArrowDown size={14} style={{ color: c.accentRed, flexShrink: 0 }} />
              )}
              {appearance.colorPlusIcon ? "-$892,100" : "$892,100"}
            </div>
          </div>
        </div>

        {/* Data table */}
        <div style={{
          background: c.bgPanel, border: `1px solid ${c.borderRim}`, borderRadius: 2,
          overflow: "hidden",
        }}>
          <table style={{
            width: "100%", borderCollapse: "collapse",
            fontFamily: fontUI, fontSize: Math.max(12, fs - 1),
          }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${c.borderRim}` }}>
                {["Pair", "Notional", "PnL"].map(h => (
                  <th scope="col" key={h} style={{
                    textAlign: h === "Pair" ? "left" : "right",
                    padding: `${densityPad - 2}px 10px`,
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
                    fontWeight: 700, letterSpacing: "0.06em",
                    color: c.textTertiary, textTransform: "uppercase",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { pair: "EUR/USD", notional: "5,000,000", pnl: "+12,340", gain: true },
                { pair: "GBP/USD", notional: "3,200,000", pnl: "-8,920", gain: false },
                { pair: "USD/JPY", notional: "8,100,000", pnl: "+45,100", gain: true },
                { pair: "USD/MXN", notional: "2,500,000", pnl: "-3,210", gain: false },
              ].map((row, i) => (
                <tr key={row.pair} style={{
                  borderBottom: i < 3 ? `1px solid ${c.borderSoft}` : "none",
                }}>
                  <td style={{
                    padding: `${densityPad - 2}px 10px`, color: c.textPrimary,
                    fontFamily: fontNum, fontWeight: 600, ...tabular,
                  }}>
                    {row.pair}
                  </td>
                  <td style={{
                    padding: `${densityPad - 2}px 10px`, textAlign: "right",
                    color: c.textSecondary, fontFamily: fontNum, ...tabular,
                  }}>
                    {row.notional}
                  </td>
                  <td style={{
                    padding: `${densityPad - 2}px 10px`, textAlign: "right",
                    color: row.gain ? c.accentGreen : c.accentRed,
                    fontFamily: fontNum, fontWeight: 600, ...tabular,
                  }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      {appearance.colorPlusIcon && (
                        row.gain
                          ? <ArrowUp size={12} style={{ flexShrink: 0 }} />
                          : <ArrowDown size={12} style={{ flexShrink: 0 }} />
                      )}
                      {row.pnl}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Alert banners */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Info */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: `${accentHex}0D`, border: `1px solid ${accentHex}30`,
            borderLeft: `3px solid ${accentHex}`,
            borderRadius: 2, padding: `${densityPad - 2}px 12px`,
            fontFamily: fontUI, fontSize: Math.max(12, fs - 1), color: c.textPrimary,
          }}>
            <Info size={14} style={{ color: accentHex, flexShrink: 0 }} />
            Policy engine recalculated.
          </div>
          {/* Warning */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: `${c.statusWarn}0D`, border: `1px solid ${c.statusWarn}30`,
            borderLeft: `3px solid ${c.statusWarn}`,
            borderRadius: 2, padding: `${densityPad - 2}px 12px`,
            fontFamily: fontUI, fontSize: Math.max(12, fs - 1), color: c.textPrimary,
          }}>
            <TriangleAlert size={14} style={{ color: c.statusWarn, flexShrink: 0 }} />
            Approaching hedge ratio limit.
          </div>
          {/* Error */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: `${c.statusFail}0D`, border: `1px solid ${c.statusFail}30`,
            borderLeft: `3px solid ${c.statusFail}`,
            borderRadius: 2, padding: `${densityPad - 2}px 12px`,
            fontFamily: fontUI, fontSize: Math.max(12, fs - 1), color: c.textPrimary,
          }}>
            <XCircle size={14} style={{ color: c.statusFail, flexShrink: 0 }} />
            Execution rejected by checker.
          </div>
        </div>

        {/* Chart legend */}
        <div style={{
          display: "flex", gap: 16, flexWrap: "wrap",
          padding: `${densityPad - 2}px 0`,
        }}>
          {[
            { color: c.chart1, label: "Confirmed" },
            { color: c.chart2, label: "Forecast" },
            { color: c.chart3, label: "Stress" },
            { color: c.chart4, label: "Benchmark" },
          ].map(item => (
            <div key={item.label} style={{
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: item.color,
              }} />
              <span style={{
                fontFamily: fontUI, fontSize: Math.max(12, fs - 2), color: c.textSecondary,
              }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
