"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { safeFetch } from "@/lib/api/dashboardClient";
import { importCsvAudited, importExcelAudited } from "@/api/connectorClient";
import type { ConnectorRun } from "@/api/connectorClient";
import { createPosition } from "@/api/positionClient";
import type { PositionRow } from "@/api/positionClient";
import { FUTURES_CURRENCY_LIST } from "@/api/types";
import type { FuturesCurrency, TradeRow } from "@/api/types";
import { translateCaughtError, HEDGE_EMPTY_STATES, type TranslatedError } from "@/lib/errors/hedgeErrors";
import DisclosurePanel from "./DisclosurePanel";
import HedgeErrorBanner from "./ErrorBanner";
import {
  CheckSquareIcon, SquareIcon, AlertCircleIcon, LoaderIcon,
  ListIcon, PlusIcon, UploadIcon, CheckIcon, XIcon,
} from "lucide-react";

/* ── Design tokens ────────────────────────────────────────────────────────── */

const HD = {
  navy:    "#0A1F44",
  royal:   "#1C62F2",
  emerald: "#2ECC71",
  crimson: "#E74C3C",
  slate:   "#8A9AB5",
  bgPanel: "var(--bg-panel)",
  bgSub:   "var(--bg-sub)",
  bgDeep:  "var(--bg-deep)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  green:   "var(--status-pass,#22c55e)",
  red:     "var(--accent-red,#ef4444)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

type IntakeMode = "select" | "manual" | "upload";

const TABS: { key: IntakeMode; label: string; icon: typeof ListIcon }[] = [
  { key: "select", label: "SELECT EXISTING",  icon: ListIcon },
  { key: "manual", label: "MANUAL ENTRY",     icon: PlusIcon },
  { key: "upload", label: "UPLOAD CSV / XLSX", icon: UploadIcon },
];

interface PhaseSelectProps {
  token: string;
  onComplete: (positions: PositionRow[]) => void;
}

const STATUS_LABEL: Record<string, { color: string; label: string }> = {
  POLICY_ASSIGNED:   { color: HD.cyan,    label: "POLICY ASSIGNED" },
  READY_TO_EXECUTE:  { color: HD.emerald, label: "READY" },
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PhaseSelect — Unified intake step                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function PhaseSelect({ token, onComplete }: PhaseSelectProps) {
  const [mode, setMode] = useState<IntakeMode>("select");

  // Shared basket across all intake modes
  const [basket, setBasket] = useState<PositionRow[]>([]);

  // When positions are added from manual/upload, merge into basket
  const addToBasket = useCallback((newPositions: PositionRow[]) => {
    setBasket(prev => {
      const ids = new Set(prev.map(p => p.id));
      const merged = [...prev];
      for (const p of newPositions) {
        if (!ids.has(p.id)) {
          merged.push(p);
          ids.add(p.id);
        }
      }
      return merged;
    });
  }, []);

  const removeFromBasket = useCallback((id: string) => {
    setBasket(prev => prev.filter(p => p.id !== id));
  }, []);

  const clearBasket = useCallback(() => setBasket([]), []);

  const handleProceed = () => {
    if (basket.length === 0) return;
    onComplete(basket);
  };

  // Summary
  const currencySummary = basket.reduce<Record<string, number>>((acc, p) => {
    acc[p.currency] = (acc[p.currency] ?? 0) + (p.amount ?? 0);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%", overflow: "hidden" }}>

      {/* ── Step header ───────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 24px",
        background: HD.bgSub,
        borderBottom: `1px solid ${HD.rim}`,
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: HD.tertiary }}>STEP 1 OF 5</span>
        <span style={{ width: 1, height: 14, background: HD.soft, display: "inline-block" }} />
        <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: HD.primary }}>SELECT POSITIONS</span>
      </div>

      {/* ── Hint ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 24px 0 24px", flexShrink: 0 }}>
        <DisclosurePanel title="Add positions to your hedge run" level="L1" defaultOpen>
          <p style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.secondary, margin: 0, lineHeight: 1.6 }}>
            Build your position basket using any combination of the methods below.
            Select from existing positions, add manually, or upload a file.
            All positions are combined into one basket before proceeding.
          </p>
        </DisclosurePanel>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 0, padding: "0 24px",
        borderBottom: `1px solid ${HD.soft}`, flexShrink: 0,
      }}>
        {TABS.map(tab => {
          const active = mode === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setMode(tab.key)}
              style={{
                fontFamily: HD.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: active ? HD.cyan : HD.tertiary,
                background: active ? `color-mix(in srgb, ${HD.cyan} 6%, ${HD.bgPanel})` : "transparent",
                border: "none",
                borderBottom: active ? `2px solid ${HD.cyan}` : "2px solid transparent",
                padding: "10px 16px 8px",
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.12s",
              }}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "select" && (
          <SelectExistingTab token={token} basket={basket} onToggle={(p, add) => {
            if (add) addToBasket([p]);
            else removeFromBasket(p.id);
          }} onToggleAll={(positions, selectAll) => {
            if (selectAll) addToBasket(positions);
            else setBasket(prev => prev.filter(b => !positions.some(p => p.id === b.id)));
          }} />
        )}
        {mode === "manual" && (
          <ManualEntryTab token={token} onCreated={addToBasket} />
        )}
        {mode === "upload" && (
          <UploadTab token={token} onImported={addToBasket} />
        )}
      </div>

      {/* ── Basket summary + proceed ──────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 24px",
        background: HD.bgSub,
        border: `1px solid ${HD.soft}`,
        borderRadius: 0,
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>BASKET</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 16, fontWeight: 700, color: basket.length > 0 ? HD.royal : HD.slate }}>
              {basket.length}
              <span style={{ fontSize: 11, color: HD.tertiary }}> position{basket.length !== 1 ? "s" : ""}</span>
            </span>
          </div>
          {Object.entries(currencySummary).map(([ccy, total]) => (
            <div key={ccy} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>{ccy}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 14, fontWeight: 600, color: HD.primary }}>
                {fmt(total)}
              </span>
            </div>
          ))}
          {basket.length > 0 && (
            <button
              onClick={clearBasket}
              style={{
                fontFamily: HD.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                color: HD.tertiary, background: "transparent",
                border: `1px solid ${HD.rim}`, padding: "4px 10px",
                cursor: "pointer", borderRadius: 2,
              }}
            >
              CLEAR ALL
            </button>
          )}
        </div>

        <button
          onClick={handleProceed}
          disabled={basket.length === 0}
          style={{
            fontFamily: HD.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: basket.length > 0 ? "#ffffff" : HD.slate,
            background: basket.length > 0 ? HD.royal : `color-mix(in srgb,${HD.slate} 20%,transparent)`,
            border: `1px solid ${basket.length > 0 ? HD.royal : HD.soft}`,
            padding: "10px 24px",
            cursor: basket.length > 0 ? "pointer" : "not-allowed",
            borderRadius: 3,
            transition: "all 0.15s",
          }}
        >
          PROCEED WITH {basket.length} POSITION{basket.length !== 1 ? "S" : ""} →
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 1: Select Existing Positions                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SelectExistingTab({ token, basket, onToggle, onToggleAll }: {
  token: string;
  basket: PositionRow[];
  onToggle: (p: PositionRow, add: boolean) => void;
  onToggleAll: (positions: PositionRow[], selectAll: boolean) => void;
}) {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<TranslatedError | null>(null);

  const basketIds = new Set(basket.map(p => p.id));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await safeFetch<{ items?: PositionRow[] }>("/v1/positions?limit=200", token);
      if (!result.ok) { setError(result.error); return; }
      const items: PositionRow[] = (result.data.items ?? []) as PositionRow[];
      const eligible = items.filter(p =>
        p.execution_status === "POLICY_ASSIGNED" ||
        p.execution_status === "READY_TO_EXECUTE"
      );
      setPositions(eligible);
    } catch (e) {
      setError(translateCaughtError(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const allSelected = positions.length > 0 && positions.every(p => basketIds.has(p.id));

  const toggleAll = () => {
    if (allSelected) {
      onToggleAll(positions, false);
    } else {
      onToggleAll(positions.slice(0, 50), true);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Selection summary */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "10px 24px",
        background: `color-mix(in srgb, ${HD.cyan} 4%, transparent)`,
        borderBottom: `1px solid ${HD.soft}`,
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: HD.cyan }}>
          {positions.filter(p => basketIds.has(p.id)).length} of {positions.length} ELIGIBLE
        </span>
        <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
          Only POLICY ASSIGNED and READY positions shown. Max 50 per run.
        </span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "32px 1fr 100px 80px 110px 100px",
          gap: 0,
          padding: "8px 24px",
          background: HD.bgSub,
          borderBottom: `1px solid ${HD.soft}`,
          position: "sticky", top: 0, zIndex: 1,
        }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={toggleAll}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
            >
              {allSelected
                ? <CheckSquareIcon size={16} color={HD.cyan} />
                : <SquareIcon size={16} color={HD.slate} />
              }
            </button>
          </div>
          {["ENTITY", "STATUS", "CCY", "AMOUNT", "VALUE DATE"].map(h => (
            <span key={h} style={{
              fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.1em", color: HD.tertiary,
            }}>
              {h}
            </span>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40 }}>
            <LoaderIcon size={16} color={HD.slate} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.tertiary }}>LOADING POSITIONS...</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ padding: "20px 24px" }}>
            <HedgeErrorBanner error={error} onRetry={load} onReconnect={() => window.location.href = "/auth/login"} />
          </div>
        )}

        {/* Empty */}
        {!loading && !error && positions.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 60 }}>
            <AlertCircleIcon size={32} color={HD.slate} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, letterSpacing: "0.06em" }}>
              {HEDGE_EMPTY_STATES.no_positions.title.toUpperCase()}
            </span>
            <span style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.secondary, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
              {HEDGE_EMPTY_STATES.no_positions.message}
            </span>
            <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.tertiary, marginTop: 4 }}>
              Use the <strong style={{ color: HD.cyan }}>Manual Entry</strong> or <strong style={{ color: HD.cyan }}>Upload</strong> tab to add new positions.
            </span>
          </div>
        )}

        {/* Rows */}
        {!loading && !error && positions.map((p, idx) => {
          const isSelected = basketIds.has(p.id);
          const st = STATUS_LABEL[p.execution_status] ?? { color: HD.slate, label: p.execution_status };
          return (
            <div
              key={p.id}
              onClick={() => onToggle(p, !isSelected)}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr 100px 80px 110px 100px",
                gap: 0,
                padding: "8px 24px",
                borderBottom: `1px solid ${HD.soft}`,
                background: isSelected ? `color-mix(in srgb,${HD.royal} 6%,${HD.bgPanel})` : idx % 2 === 0 ? HD.bgPanel : HD.bgSub,
                cursor: "pointer",
                transition: "background 0.1s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                {isSelected
                  ? <CheckSquareIcon size={16} color={HD.royal} />
                  : <SquareIcon size={16} color={HD.slate} />
                }
              </div>
              <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center" }}>
                {p.entity}
              </span>
              <span style={{
                fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700,
                color: st.color, display: "flex", alignItems: "center",
                letterSpacing: "0.06em",
              }}>
                {st.label}
              </span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center" }}>
                {p.currency}
              </span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center" }}>
                {fmt(p.amount ?? 0)}
              </span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.secondary, display: "flex", alignItems: "center" }}>
                {p.value_date}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 2: Manual Entry                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface ManualFormData {
  record_id: string;
  entity: string;
  type: "AR" | "AP";
  currency: FuturesCurrency;
  amount: string;
  value_date: string;
  status: "CONFIRMED" | "FORECAST";
  description: string;
}

const EMPTY_FORM: ManualFormData = {
  record_id: "",
  entity: "",
  type: "AP",
  currency: "MXN",
  amount: "",
  value_date: "",
  status: "CONFIRMED",
  description: "",
};

function ManualEntryTab({ token, onCreated }: {
  token: string;
  onCreated: (positions: PositionRow[]) => void;
}) {
  const [form, setForm] = useState<ManualFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);

  const set = <K extends keyof ManualFormData>(key: K, val: ManualFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.record_id.trim()) errs.record_id = "Required";
    if (!form.entity.trim()) errs.entity = "Required";
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) errs.amount = "Must be > 0";
    if (!form.value_date) errs.value_date = "Required";
    else {
      const d = new Date(form.value_date);
      if (isNaN(d.getTime()) || d <= new Date()) errs.value_date = "Must be a future date";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setApiError(null);
    try {
      const trade: TradeRow = {
        record_id: form.record_id.trim(),
        entity: form.entity.trim(),
        type: form.type,
        currency: form.currency,
        amount: parseFloat(form.amount),
        value_date: form.value_date,
        status: form.status,
        description: form.description.trim(),
      };
      const created = await createPosition(trade, token);
      onCreated([created]);
      setSavedCount(prev => prev + 1);
      setForm(EMPTY_FORM);
      setSuccessFlash(true);
      setTimeout(() => setSuccessFlash(false), 2000);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail;
      setApiError(typeof detail === "string" ? detail : String(e));
    } finally {
      setSaving(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  const inputStyle = (field: string): React.CSSProperties => ({
    fontFamily: HD.fontMono,
    fontSize: 12,
    background: HD.bgDeep,
    border: `1px solid ${fieldErrors[field] ? HD.red : HD.rim}`,
    color: HD.primary,
    padding: "7px 10px",
    borderRadius: 2,
    outline: "none",
    width: "100%",
    transition: "border-color 0.12s",
  });

  const labelStyle: React.CSSProperties = {
    fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700,
    letterSpacing: "0.1em", color: HD.tertiary, marginBottom: 4,
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>

      {/* Success flash */}
      {successFlash && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", marginBottom: 12,
          background: `color-mix(in srgb, ${HD.green} 6%, ${HD.bgPanel})`,
          border: `1px solid ${HD.green}`,
          borderRadius: 3,
        }}>
          <CheckIcon size={14} color={HD.green} />
          <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.green }}>
            Position created and added to basket
          </span>
          <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.tertiary, marginLeft: "auto" }}>
            {savedCount} added this session
          </span>
        </div>
      )}

      {/* API error */}
      {apiError && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", marginBottom: 12,
          background: `color-mix(in srgb, ${HD.red} 6%, ${HD.bgPanel})`,
          border: `1px solid ${HD.red}`,
          borderRadius: 3,
        }}>
          <XIcon size={14} color={HD.red} />
          <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.red, flex: 1 }}>
            {apiError}
          </span>
          <button
            onClick={() => setApiError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: HD.tertiary, fontFamily: HD.fontMono }}
          >×</button>
        </div>
      )}

      {/* Form grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "16px 20px",
        marginBottom: 20,
      }}>
        {/* Record ID */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>RECORD ID *</label>
          <input
            value={form.record_id}
            onChange={e => set("record_id", e.target.value)}
            placeholder="INV-2026-001"
            style={inputStyle("record_id")}
          />
          {fieldErrors.record_id && <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.red, marginTop: 2 }}>{fieldErrors.record_id}</span>}
        </div>

        {/* Entity */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>ENTITY *</label>
          <input
            value={form.entity}
            onChange={e => set("entity", e.target.value)}
            placeholder="LatAm Corp SA"
            style={inputStyle("entity")}
          />
          {fieldErrors.entity && <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.red, marginTop: 2 }}>{fieldErrors.entity}</span>}
        </div>

        {/* Flow Type */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>FLOW TYPE *</label>
          <select
            value={form.type}
            onChange={e => set("type", e.target.value as "AR" | "AP")}
            style={{ ...inputStyle("type"), cursor: "pointer" }}
          >
            <option value="AP">AP — Payable (outflow)</option>
            <option value="AR">AR — Receivable (inflow)</option>
          </select>
        </div>

        {/* Currency */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>CURRENCY *</label>
          <select
            value={form.currency}
            onChange={e => set("currency", e.target.value as FuturesCurrency)}
            style={{ ...inputStyle("currency"), cursor: "pointer" }}
          >
            {FUTURES_CURRENCY_LIST.map(c => (
              <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>AMOUNT (LOCAL CCY) *</label>
          <input
            type="number"
            value={form.amount}
            onChange={e => set("amount", e.target.value)}
            placeholder="14500000"
            min="0"
            step="1"
            style={inputStyle("amount")}
          />
          {fieldErrors.amount && <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.red, marginTop: 2 }}>{fieldErrors.amount}</span>}
        </div>

        {/* Value Date */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>VALUE DATE *</label>
          <input
            type="date"
            value={form.value_date}
            onChange={e => set("value_date", e.target.value)}
            min={today}
            style={inputStyle("value_date")}
          />
          {fieldErrors.value_date && <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.red, marginTop: 2 }}>{fieldErrors.value_date}</span>}
        </div>

        {/* Status */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>STATUS</label>
          <select
            value={form.status}
            onChange={e => set("status", e.target.value as "CONFIRMED" | "FORECAST")}
            style={{ ...inputStyle("status"), cursor: "pointer" }}
          >
            <option value="CONFIRMED">CONFIRMED — contracted</option>
            <option value="FORECAST">FORECAST — projected</option>
          </select>
        </div>

        {/* Description */}
        <div style={{ display: "flex", flexDirection: "column", gridColumn: "span 2" }}>
          <label style={labelStyle}>DESCRIPTION</label>
          <input
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="Q1 steel import payment"
            style={inputStyle("description")}
          />
        </div>
      </div>

      {/* Submit */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
            padding: "9px 24px",
            color: saving ? HD.tertiary : "#fff",
            background: saving ? "transparent" : HD.cyan,
            border: `1px solid ${saving ? HD.rim : HD.cyan}`,
            cursor: saving ? "not-allowed" : "pointer",
            borderRadius: 3,
            transition: "all 0.12s",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {saving && <LoaderIcon size={12} style={{ animation: "spin 1s linear infinite" }} />}
          {saving ? "CREATING..." : "CREATE & ADD TO BASKET"}
        </button>
      </div>

      {/* Help note */}
      <div style={{
        marginTop: 20,
        padding: "10px 14px",
        background: `color-mix(in srgb, ${HD.cyan} 4%, transparent)`,
        border: `1px solid color-mix(in srgb, ${HD.cyan} 15%, transparent)`,
        borderRadius: 3,
      }}>
        <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.6 }}>
          Each position is created in the system immediately.
          After creation, assign a policy from the <strong style={{ color: HD.cyan }}>Position Desk</strong> to
          make it eligible for hedge calculation, then switch to the <strong style={{ color: HD.cyan }}>Select Existing</strong> tab.
        </span>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 3: Upload CSV / XLSX                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

function UploadTab({ token, onImported }: {
  token: string;
  onImported: (positions: PositionRow[]) => void;
}) {
  const [dragging, setDragging]   = useState(false);
  const [file, setFile]           = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]       = useState<ConnectorRun | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleCommit = useCallback(async () => {
    if (!file || !token) return;
    setUploading(true);
    setError(null);
    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const run = isCsv
        ? await importCsvAudited(file, token)
        : await importExcelAudited(file, token);
      setResult(run);

      // After import, re-fetch eligible positions and add new ones to basket
      if (run.created_ok > 0) {
        try {
          const res = await safeFetch<{ items?: PositionRow[] }>("/v1/positions?limit=200", token);
          if (res.ok) {
            const items = (res.data.items ?? []) as PositionRow[];
            const eligible = items.filter(p =>
              p.execution_status === "POLICY_ASSIGNED" ||
              p.execution_status === "READY_TO_EXECUTE"
            );
            onImported(eligible);
          }
        } catch {
          // Best-effort: user can switch to Select tab
        }
      }
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (e as any)?.response?.data?.detail ?? String(e);
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setUploading(false);
    }
  }, [file, token, onImported]);

  const isExcel = file?.name.toLowerCase().endsWith(".xlsx");
  const isCsv   = file?.name.toLowerCase().endsWith(".csv");

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? HD.cyan : HD.rim}`,
          borderRadius: 4,
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging
            ? `color-mix(in srgb, ${HD.cyan} 4%, ${HD.bgDeep})`
            : HD.bgDeep,
          transition: "all 0.15s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          style={{ display: "none" }}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
        />
        <UploadIcon size={24} color={HD.slate} style={{ marginBottom: 12 }} />
        <div style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, letterSpacing: "0.08em", marginBottom: 8 }}>
          DROP FILE HERE OR CLICK TO BROWSE
        </div>
        <div style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
          Accepted: <span style={{ color: HD.cyan }}>.csv</span> and <span style={{ color: HD.cyan }}>.xlsx</span>
        </div>
        <div style={{ fontFamily: HD.fontUI, fontSize: 11, color: HD.tertiary, marginTop: 4 }}>
          Required columns: record_id · entity · flow_type · currency · amount · value_date
        </div>
      </div>

      {/* Selected file */}
      {file && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 14px",
          background: HD.bgPanel,
          border: `1px solid ${HD.rim}`,
          borderRadius: 3,
        }}>
          <span style={{
            fontFamily: HD.fontMono, fontSize: 9, letterSpacing: "0.06em",
            padding: "2px 6px",
            border: `1px solid ${isExcel ? HD.amber : HD.cyan}`,
            color: isExcel ? HD.amber : HD.cyan,
          }}>
            {isExcel ? "XLSX" : isCsv ? "CSV" : "FILE"}
          </span>
          <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary, flex: 1 }}>
            {file.name}
          </span>
          <span style={{ fontFamily: HD.fontUI, fontSize: 11, color: HD.tertiary }}>
            {(file.size / 1024).toFixed(1)} KB
          </span>
          <button
            onClick={e => { e.stopPropagation(); setFile(null); setResult(null); setError(null); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: HD.tertiary, fontFamily: HD.fontMono, fontSize: 14,
            }}
          >×</button>
        </div>
      )}

      {/* Commit */}
      {file && !result && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleCommit}
            disabled={uploading}
            style={{
              fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              padding: "9px 24px",
              color: uploading ? HD.tertiary : "#fff",
              background: uploading ? "transparent" : HD.cyan,
              border: `1px solid ${uploading ? HD.rim : HD.cyan}`,
              cursor: uploading ? "not-allowed" : "pointer",
              borderRadius: 3,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {uploading && <LoaderIcon size={12} style={{ animation: "spin 1s linear infinite" }} />}
            {uploading ? "IMPORTING..." : "COMMIT IMPORT"}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: "10px 14px",
          border: `1px solid ${HD.red}`,
          background: `color-mix(in srgb, ${HD.red} 5%, ${HD.bgPanel})`,
          fontFamily: HD.fontMono, fontSize: 11, color: HD.red,
          borderRadius: 3,
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && <ImportResultBanner run={result} onDismiss={() => { setResult(null); setFile(null); }} />}

      {/* Help note */}
      <div style={{
        padding: "10px 14px",
        background: `color-mix(in srgb, ${HD.cyan} 4%, transparent)`,
        border: `1px solid color-mix(in srgb, ${HD.cyan} 15%, transparent)`,
        borderRadius: 3,
      }}>
        <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.6 }}>
          Imported positions must have a policy assigned before they can be included in a hedge run.
          After import, assign policies from the <strong style={{ color: HD.cyan }}>Position Desk</strong>,
          then switch to the <strong style={{ color: HD.cyan }}>Select Existing</strong> tab.
        </span>
      </div>
    </div>
  );
}

/* ── Import result banner ──────────────────────────────────────────── */

function ImportResultBanner({ run, onDismiss }: { run: ConnectorRun; onDismiss: () => void }) {
  const success = run.status === "COMPLETED" && run.error_count === 0;
  const partial  = run.status === "COMPLETED" && run.error_count > 0;
  const color = success ? HD.green : partial ? HD.amber : HD.red;

  return (
    <div style={{
      border: `1px solid ${color}`,
      background: `color-mix(in srgb, ${color} 4%, ${HD.bgPanel})`,
      borderRadius: 3,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px",
        borderBottom: `1px solid ${color}`,
      }}>
        <span style={{ fontFamily: HD.fontMono, fontSize: 11, letterSpacing: "0.08em", color }}>
          {success ? "IMPORT COMPLETE" : partial ? "IMPORT PARTIAL" : "IMPORT FAILED"}
        </span>
        <span style={{ fontFamily: HD.fontUI, fontSize: 11, color: HD.secondary }}>
          {run.created_ok}/{run.total_rows} rows created
          {run.error_count > 0 && ` · ${run.error_count} errors`}
        </span>
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", color: HD.tertiary, fontFamily: HD.fontMono }}
        >×</button>
      </div>
      <div style={{ display: "flex", gap: 20, padding: "7px 14px", flexWrap: "wrap" }}>
        {([
          ["Type", run.connector_type],
          ["File", run.source_filename ?? "—"],
          ["Status", run.status],
          ["Run", run.id.slice(0, 8) + "…"],
        ] as const).map(([label, val]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.08em" }}>{label}</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
