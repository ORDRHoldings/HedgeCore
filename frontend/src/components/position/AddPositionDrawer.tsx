"use client";

/**
 * AddPositionDrawer — Slide-in drawer for creating a single FX position.
 *
 * Extracted from /input page inline form. Preserves all field logic,
 * validation, date picker, and DB write via createPositionThunk.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useDispatch } from "react-redux";
import { T } from "@/lib/design/tokens";
import type { TradeRow, FuturesCurrency } from "@/api/types";
import { FUTURES_CURRENCY_LIST } from "@/api/types";
import type { AppDispatch } from "@/lib/store";
import {
  createPositionThunk,
  listPositionsThunk,
} from "@/lib/store/slices/positionSlice";
import { X } from "lucide-react";

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  token: string;
  onSuccess: () => void;
}

// ── Local design tokens (overlay-specific) ───────────────────────────────────
const S = {
  bgDeep:    T.bgDeep,
  bgPanel:   T.bgPanel,
  bgSub:     T.bgSub,
  rim:       T.rim,
  soft:      T.soft,
  primary:   T.primary,
  secondary: T.secondary,
  tertiary:  T.tertiary,
  accent:    T.accent,
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red)",
  green:     "var(--status-pass)",
  fontMono:  T.fontMono,
  fontUI:    T.fontUI,
} as const;

// ── Bloomberg-style date picker ──────────────────────────────────────────────
function InlineDatePicker({
  value, onChange, onBlur, hasError, focusedField, fieldName, onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  hasError: boolean;
  focusedField: string | null;
  fieldName: string;
  onFocus: () => void;
}) {
  const [open, setOpen]           = useState(false);
  const today                     = new Date();
  const initDate                  = value ? new Date(value + "T00:00:00") : today;
  const [viewYear, setViewYear]   = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [textInput, setTextInput] = useState(value);
  const containerRef              = useRef<HTMLDivElement>(null);

  useEffect(() => { setTextInput(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); onBlur();
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open, onBlur]);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DAYS   = ["Mo","Tu","We","Th","Fr","Sa","Su"];

  const firstDay   = new Date(viewYear, viewMonth, 1);
  const lastDay    = new Date(viewYear, viewMonth + 1, 0);
  const firstDow   = (firstDay.getDay() + 6) % 7;
  const totalCells = firstDow + lastDay.getDate();
  const rows       = Math.ceil(totalCells / 7);

  function selectDay(day: number) {
    const mm  = String(viewMonth + 1).padStart(2, "0");
    const dd  = String(day).padStart(2, "0");
    const iso = `${viewYear}-${mm}-${dd}`;
    onChange(iso); setTextInput(iso); setOpen(false); onBlur();
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function handleTextBlur() {
    const iso = textInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const d = new Date(iso + "T00:00:00");
      if (!isNaN(d.getTime())) { onChange(iso); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
    }
  }

  const isFocused   = focusedField === fieldName;
  const borderColor = hasError ? S.red : isFocused ? S.cyan : S.soft;
  const borderWidth = (hasError || isFocused) ? "2px" : "1px";

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div role="button" tabIndex={0}
        onClick={() => { setOpen(v => !v); onFocus(); }}
        onFocus={onFocus}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(v => !v); }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{
          fontFamily: S.fontMono, fontSize: "0.875rem",
          color: value ? S.primary : S.tertiary,
          borderBottom: `${borderWidth} solid ${borderColor}`,
          padding: "4px 0", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          userSelect: "none", transition: "border-color 0.1s",
        }}>
        <span>{value || "YYYY-MM-DD"}</span>
        <span style={{ fontSize: "0.75rem", color: S.tertiary, marginLeft: 4 }}>{open ? "\u25B2" : "\u25BC"}</span>
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 999,
          background: S.bgPanel, border: `1px solid ${S.rim}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", width: 260,
          padding: "10px 10px 8px", fontFamily: S.fontMono,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button onClick={prevMonth} style={{ background: "none", border: `1px solid ${S.rim}`, color: S.secondary, cursor: "pointer", padding: "2px 7px", fontFamily: "inherit", fontSize: "0.75rem" }}>{"\u25C4"}</button>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: S.primary, letterSpacing: "0.06em" }}>{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} style={{ background: "none", border: `1px solid ${S.rim}`, color: S.secondary, cursor: "pointer", padding: "2px 7px", fontFamily: "inherit", fontSize: "0.75rem" }}>{"\u25BA"}</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.04em", padding: "2px 0" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {Array.from({ length: rows * 7 }, (_, i) => {
              const day = i - firstDow + 1;
              const valid = day >= 1 && day <= lastDay.getDate();
              if (!valid) return <div key={i} />;
              const cellDate = new Date(viewYear, viewMonth, day);
              const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const selMM = String(viewMonth + 1).padStart(2, "0");
              const selDD = String(day).padStart(2, "0");
              const iso = `${viewYear}-${selMM}-${selDD}`;
              const isSelected = iso === value;
              const isToday = cellDate.toDateString() === today.toDateString();
              return (
                <button key={i} onClick={() => !isPast && selectDay(day)}
                  style={{
                    textAlign: "center", padding: "3px 0", fontSize: "0.75rem",
                    fontFamily: "inherit", cursor: isPast ? "not-allowed" : "pointer", borderRadius: 2,
                    border: isToday ? `1px solid ${S.amber}` : "1px solid transparent",
                    background: isSelected ? S.cyan : "transparent",
                    color: isSelected ? "#0a0f14" : isPast ? S.tertiary : S.primary,
                    opacity: isPast ? 0.35 : 1, fontWeight: isSelected ? 700 : 400,
                  }}>{day}</button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${S.soft}` }}>
            <div style={{ fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.08em", marginBottom: 4 }}>TYPE DATE</div>
            <input type="text" value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onBlur={handleTextBlur}
              onKeyDown={e => { if (e.key === "Enter") handleTextBlur(); if (e.key === "Escape") setOpen(false); }}
              placeholder="YYYY-MM-DD"
              style={{ fontFamily: "inherit", fontSize: "0.75rem", width: "100%",
                background: S.bgSub, border: `1px solid ${S.rim}`,
                color: S.primary, padding: "3px 8px", outline: "none" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main drawer component ────────────────────────────────────────────────────
export default function AddPositionDrawer({ open, onClose, token, onSuccess }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  const EMPTY_INLINE: TradeRow = {
    record_id: "", entity: "", type: "AP", currency: "MXN",
    amount: 0, value_date: "", status: "CONFIRMED", description: "",
  };

  const [form, setForm]           = useState<TradeRow>(EMPTY_INLINE);
  const [touched, setTouched]     = useState<Record<string, boolean>>({});
  const [saving, setSaving]       = useState(false);
  const [amountDisplay, setAmountDisplay] = useState("");
  const [focusedField, setFocusedField]   = useState<string | null>(null);
  const [savedId, setSavedId]     = useState<string | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      setForm(EMPTY_INLINE);
      setTouched({});
      setAmountDisplay("");
      setFocusedField(null);
      setSavedId(null);
      setErrorMsg(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setField = useCallback(<K extends keyof TradeRow>(field: K, value: TradeRow[K]) => {
    setForm(f => ({ ...f, [field]: value }));
    setSavedId(null);
    setErrorMsg(null);
  }, []);

  const touch = useCallback((field: string) => {
    setTouched(t => ({ ...t, [field]: true }));
  }, []);

  // Validation
  const errRecordId = touched.record_id && !form.record_id.trim() ? "Required" : null;
  const errEntity   = touched.entity && !form.entity.trim() ? "Required" : null;
  const errAmount   = touched.amount && !(form.amount > 0) ? "Must be > 0" : null;
  const errDate     = touched.value_date && !form.value_date ? "Required" : null;

  const isValid = useMemo(() =>
    form.record_id.trim() !== "" &&
    form.entity.trim() !== "" &&
    form.amount > 0 &&
    form.value_date !== "",
  [form]);

  const handleSave = useCallback(async () => {
    setTouched({ record_id: true, entity: true, amount: true, value_date: true });
    if (!isValid) return;
    setSaving(true);
    setErrorMsg(null);

    const result = await dispatch(createPositionThunk({ trade: form, token }));
    setSaving(false);
    if (createPositionThunk.fulfilled.match(result)) {
      const serverRecordId = result.payload.record_id;
      setSavedId(serverRecordId);
      dispatch(listPositionsThunk({ token }));
      onSuccess();
      // Reset for next entry
      setForm(EMPTY_INLINE);
      setTouched({});
      setAmountDisplay("");
    } else {
      setErrorMsg(String(result.payload) || "Failed to create position");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, token, form, isValid, onSuccess]);

  function fb(field: string, hasErr: boolean): string {
    if (hasErr) return `2px solid ${S.red}`;
    if (focusedField === field) return `2px solid ${S.cyan}`;
    return `1px solid ${S.soft}`;
  }

  function fmtAmt(val: number): string {
    if (!val || isNaN(val)) return "";
    return new Intl.NumberFormat("en-US").format(val);
  }

  function handleAmountChange(raw: string) {
    const stripped = raw.replace(/[^0-9.]/g, "");
    setAmountDisplay(stripped);
    setField("amount", parseFloat(stripped) || 0);
  }

  function handleAmountFocus() {
    setFocusedField("amount");
    setAmountDisplay(form.amount ? String(form.amount) : "");
  }

  function handleAmountBlur() {
    setFocusedField(null);
    touch("amount");
    setAmountDisplay(fmtAmt(form.amount));
  }

  if (!open) return null;

  const fieldCell: React.CSSProperties = {
    padding: "14px 16px",
    display: "flex", flexDirection: "column", gap: 6,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.75rem",
    letterSpacing: "0.12em", color: S.tertiary,
    textTransform: "uppercase",
    display: "flex", alignItems: "center", gap: 6,
  };
  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.875rem",
    background: "transparent", border: "none",
    color: S.primary, padding: "3px 0",
    outline: "none", width: "100%",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 300,
        }}
      />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 520, maxWidth: "100vw",
        background: S.bgDeep,
        borderLeft: `1px solid ${S.rim}`,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
        zIndex: 301,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: `1px solid ${S.rim}`,
          background: S.bgPanel,
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: S.primary }}>
              ADD POSITION
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 2 }}>
              Create a new FX exposure line
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: S.tertiary, padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
          {/* Success banner */}
          {savedId && (
            <div style={{
              padding: "10px 20px",
              background: `color-mix(in srgb, ${S.green} 6%, ${S.bgPanel})`,
              borderBottom: `1px solid ${S.green}`,
              fontFamily: S.fontMono, fontSize: 12, color: S.green,
            }}>
              Position saved: {savedId}
            </div>
          )}

          {/* Error banner */}
          {errorMsg && (
            <div style={{
              padding: "10px 20px",
              background: `color-mix(in srgb, ${S.red} 6%, ${S.bgPanel})`,
              borderBottom: `1px solid ${S.red}`,
              fontFamily: S.fontMono, fontSize: 12, color: S.red,
            }}>
              {errorMsg}
            </div>
          )}

          {/* Fields */}
          <div style={{ borderBottom: `1px solid ${S.rim}` }}>
            {/* Record ID */}
            <div style={{ ...fieldCell, borderBottom: `1px solid ${S.soft}` }}>
              <label style={{ ...labelStyle, color: errRecordId ? S.red : S.tertiary }}>
                RECORD ID {errRecordId && <span style={{ color: S.red, fontWeight: 400 }}> -- {errRecordId}</span>}
              </label>
              <input type="text" value={form.record_id}
                onChange={e => setField("record_id", e.target.value)}
                onFocus={() => setFocusedField("record_id")}
                onBlur={() => { setFocusedField(null); touch("record_id"); }}
                placeholder="e.g. TXN-001"
                style={{ ...inputStyle, borderBottom: fb("record_id", !!errRecordId) }}
              />
            </div>

            {/* Entity */}
            <div style={{ ...fieldCell, borderBottom: `1px solid ${S.soft}` }}>
              <label style={{ ...labelStyle, color: errEntity ? S.red : S.tertiary }}>
                ENTITY {errEntity && <span style={{ color: S.red, fontWeight: 400 }}> -- {errEntity}</span>}
              </label>
              <input type="text" value={form.entity}
                onChange={e => setField("entity", e.target.value)}
                onFocus={() => setFocusedField("entity")}
                onBlur={() => { setFocusedField(null); touch("entity"); }}
                placeholder="e.g. Acme Corp"
                style={{ ...inputStyle, borderBottom: fb("entity", !!errEntity) }}
              />
            </div>

            {/* Flow type + Currency (side by side) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderBottom: `1px solid ${S.soft}` }}>
              <div style={{ ...fieldCell, borderRight: `1px solid ${S.soft}` }}>
                <label style={labelStyle}>FLOW TYPE</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: fb("type", false), paddingBottom: 3 }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: "0.75rem", fontWeight: 700,
                    padding: "1px 5px", borderRadius: 2, letterSpacing: "0.06em",
                    background: form.type === "AP"
                      ? `color-mix(in srgb, ${S.red} 12%, transparent)`
                      : `color-mix(in srgb, ${S.green} 12%, transparent)`,
                    color: form.type === "AP" ? S.red : S.green,
                  }}>{form.type}</span>
                  <select
                    value={form.type}
                    onChange={e => setField("type", e.target.value as TradeRow["type"])}
                    onFocus={() => setFocusedField("type")}
                    onBlur={() => setFocusedField(null)}
                    style={{ ...inputStyle, flex: 1, cursor: "pointer", borderBottom: "none", padding: "2px 0", fontSize: "0.75rem" }}
                  >
                    <option value="AP">AP -- Accounts Payable</option>
                    <option value="AR">AR -- Accounts Receivable</option>
                  </select>
                </div>
              </div>
              <div style={fieldCell}>
                <label style={labelStyle}>CURRENCY</label>
                <select
                  value={form.currency}
                  onChange={e => setField("currency", e.target.value as FuturesCurrency)}
                  onFocus={() => setFocusedField("currency")}
                  onBlur={() => setFocusedField(null)}
                  style={{ ...inputStyle, cursor: "pointer", borderBottom: fb("currency", false) }}
                >
                  {FUTURES_CURRENCY_LIST.map(c => (
                    <option key={c.code} value={c.code}>{c.code} -- {c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount */}
            <div style={{ ...fieldCell, borderBottom: `1px solid ${S.soft}` }}>
              <label style={{ ...labelStyle, color: errAmount ? S.red : S.tertiary }}>
                AMOUNT ({form.currency}) {errAmount && <span style={{ color: S.red, fontWeight: 400 }}> -- {errAmount}</span>}
              </label>
              <div style={{ display: "flex", alignItems: "center", borderBottom: fb("amount", !!errAmount), paddingBottom: 3 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, marginRight: 6, flexShrink: 0 }}>{form.currency}</span>
                <input type="text" inputMode="numeric"
                  value={amountDisplay}
                  onChange={e => handleAmountChange(e.target.value)}
                  onFocus={handleAmountFocus}
                  onBlur={handleAmountBlur}
                  placeholder="0"
                  style={{ ...inputStyle, textAlign: "right", flex: 1, borderBottom: "none", padding: "3px 0" }}
                />
              </div>
            </div>

            {/* Value date */}
            <div style={{ ...fieldCell, borderBottom: `1px solid ${S.soft}` }}>
              <label style={{ ...labelStyle, color: errDate ? S.red : S.tertiary }}>
                VALUE DATE {errDate && <span style={{ color: S.red, fontWeight: 400 }}> -- {errDate}</span>}
              </label>
              <InlineDatePicker
                value={form.value_date}
                onChange={v => setField("value_date", v)}
                onBlur={() => touch("value_date")}
                hasError={!!errDate}
                focusedField={focusedField}
                fieldName="value_date"
                onFocus={() => setFocusedField("value_date")}
              />
            </div>

            {/* Status + Description (side by side) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <div style={{ ...fieldCell, borderRight: `1px solid ${S.soft}` }}>
                <label style={labelStyle}>STATUS</label>
                <select
                  value={form.status}
                  onChange={e => setField("status", e.target.value as TradeRow["status"])}
                  onFocus={() => setFocusedField("status")}
                  onBlur={() => setFocusedField(null)}
                  style={{ ...inputStyle, cursor: "pointer", borderBottom: fb("status", false) }}
                >
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="FORECAST">FORECAST</option>
                </select>
              </div>
              <div style={fieldCell}>
                <label style={labelStyle}>DESCRIPTION</label>
                <input type="text" value={form.description ?? ""}
                  onChange={e => setField("description", e.target.value)}
                  onFocus={() => setFocusedField("description")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Optional note"
                  style={{ ...inputStyle, borderBottom: fb("description", false) }}
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={{ padding: "12px 20px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            {(() => {
              const parts: string[] = [];
              if (form.type) parts.push(form.type);
              if (form.currency) parts.push(form.currency);
              if (form.amount > 0) parts.push(new Intl.NumberFormat("en-US").format(form.amount));
              if (form.value_date) parts.push(form.value_date.slice(0, 7));
              return parts.length > 1 ? parts.join(" \u00B7 ") : "Fill fields above to preview";
            })()}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10,
          padding: "14px 20px",
          borderTop: `1px solid ${S.rim}`,
          background: S.bgPanel,
          flexShrink: 0,
        }}>
          <button
            onClick={() => { setForm(EMPTY_INLINE); setTouched({}); setAmountDisplay(""); setSavedId(null); setErrorMsg(null); }}
            style={{
              fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.04em",
              padding: "7px 14px", border: `1px solid ${S.rim}`,
              color: S.tertiary, background: "transparent", cursor: "pointer",
            }}
          >CLEAR</button>
          <button
            onClick={onClose}
            style={{
              fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.04em",
              padding: "7px 14px", border: `1px solid ${S.rim}`,
              color: S.secondary, background: "transparent", cursor: "pointer",
            }}
          >CLOSE</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
              padding: "7px 18px",
              border: `1px solid ${isValid ? S.cyan : S.rim}`,
              color: isValid ? S.cyan : S.tertiary,
              background: isValid ? `color-mix(in srgb, ${S.cyan} 6%, transparent)` : "transparent",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
              transition: "all 0.1s",
            }}
          >{saving ? "SAVING..." : "+ ADD POSITION"}</button>
        </div>
      </div>
    </>
  );
}
