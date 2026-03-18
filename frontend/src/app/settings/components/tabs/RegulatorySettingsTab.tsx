"use client";

import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { S, monoInputStyle, inputStyle } from "../../types/settings";

interface RegulatorySettings {
  reporting_entity_lei:    string;
  counterparty_lei:        string;
  executing_entity_lei:    string;
  venue:                   string;
  regulatory_frameworks:   string[];
  is_financial_counterparty: boolean;
  lei_configured:          boolean;
  frameworks_count:        number;
}

const DEFAULT: RegulatorySettings = {
  reporting_entity_lei:    "",
  counterparty_lei:        "",
  executing_entity_lei:    "",
  venue:                   "XOFF",
  regulatory_frameworks:   [],
  is_financial_counterparty: false,
  lei_configured:          false,
  frameworks_count:        0,
};

const FRAMEWORKS: { id: string; label: string }[] = [
  { id: "EMIR",       label: "EMIR Article 9 (EU)" },
  { id: "MIFID2",     label: "MiFID II RTS 25 (EU)" },
  { id: "DODD_FRANK", label: "Dodd-Frank Title VII (US)" },
];

const fieldLabelStyle = {
  fontFamily: S.fontMono,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase" as const,
  color: S.secondary,
  marginBottom: 4,
  display: "block",
};

const hintStyle = {
  fontFamily: S.fontMono,
  fontSize: 11,
  color: S.tertiary,
  marginTop: 4,
  letterSpacing: "0.02em",
};

interface Props { token: string; }

export default function RegulatorySettingsTab({ token }: Props) {
  const [data,    setData]    = useState<RegulatorySettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardFetch("/v1/settings/regulatory", token);
      if (res.ok) {
        const json = await res.json() as RegulatorySettings;
        setData(json);
      }
    } catch {
      // silent — keep defaults
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggleFramework = (id: string) => {
    setData(prev => {
      const has = prev.regulatory_frameworks.includes(id);
      return {
        ...prev,
        regulatory_frameworks: has
          ? prev.regulatory_frameworks.filter(f => f !== id)
          : [...prev.regulatory_frameworks, id],
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        reporting_entity_lei:      data.reporting_entity_lei,
        counterparty_lei:          data.counterparty_lei,
        executing_entity_lei:      data.executing_entity_lei,
        venue:                     data.venue,
        regulatory_frameworks:     data.regulatory_frameworks,
        is_financial_counterparty: data.is_financial_counterparty,
      };
      const res = await dashboardFetch("/v1/settings/regulatory", token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      const updated = await res.json() as RegulatorySettings;
      setData(updated);
      showToast("success", "Regulatory settings saved.");
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.09em" }}>
        LOADING...
      </div>
    );
  }

  const leiConfigured = data.lei_configured;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* LEI status banner */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 3,
        border: `1px solid ${leiConfigured ? S.pass : S.amber}`,
        borderLeft: `3px solid ${leiConfigured ? S.pass : S.amber}`,
        background: leiConfigured
          ? `color-mix(in srgb, ${S.pass} 8%, transparent)`
          : `color-mix(in srgb, ${S.amber} 8%, transparent)`,
      }}>
        <span style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 700,
          color: leiConfigured ? S.pass : S.amber,
          letterSpacing: "0.05em",
        }}>
          {leiConfigured ? "✓" : "⚠"}
        </span>
        <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary }}>
          {leiConfigured
            ? "LEI configured — regulatory exports are ready"
            : "LEI not configured — regulatory exports will use NOT_PROVIDED placeholder"}
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          padding: "8px 14px",
          borderRadius: 3,
          border: `1px solid ${toast.kind === "success" ? S.pass : S.fail}`,
          borderLeft: `3px solid ${toast.kind === "success" ? S.pass : S.fail}`,
          background: toast.kind === "success" ? "#064E3B" : "#450A0A",
          fontFamily: S.fontUI,
          fontSize: 12,
          color: S.primary,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ fontFamily: S.fontMono, fontWeight: 700, color: toast.kind === "success" ? S.pass : S.fail }}>
            {toast.kind === "success" ? "✓" : "✗"}
          </span>
          {toast.msg}
        </div>
      )}

      {/* Section: LEI Identifiers */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase" as const,
          color: S.tertiary,
          borderBottom: `1px solid ${S.rim}`,
          paddingBottom: 6,
        }}>
          LEI IDENTIFIERS
        </div>

        {/* Reporting Entity LEI */}
        <div>
          <label style={fieldLabelStyle}>Reporting Entity LEI</label>
          <input
            type="text"
            value={data.reporting_entity_lei}
            onChange={e => setData(prev => ({ ...prev, reporting_entity_lei: e.target.value.toUpperCase().slice(0, 20) }))}
            maxLength={20}
            placeholder="e.g. 213800WSGIIZCXF1P572"
            style={monoInputStyle}
          />
          <div style={hintStyle}>(20-character ISO 17442 identifier)</div>
        </div>

        {/* Counterparty LEI */}
        <div>
          <label style={fieldLabelStyle}>Counterparty LEI</label>
          <input
            type="text"
            value={data.counterparty_lei}
            onChange={e => setData(prev => ({ ...prev, counterparty_lei: e.target.value.toUpperCase().slice(0, 20) }))}
            maxLength={20}
            placeholder="20-character LEI code"
            style={monoInputStyle}
          />
          <div style={hintStyle}>(20-character ISO 17442 identifier)</div>
        </div>

        {/* Executing Entity LEI */}
        <div>
          <label style={fieldLabelStyle}>Executing Entity LEI</label>
          <input
            type="text"
            value={data.executing_entity_lei}
            onChange={e => setData(prev => ({ ...prev, executing_entity_lei: e.target.value.toUpperCase().slice(0, 20) }))}
            maxLength={20}
            placeholder="Leave blank to use Reporting Entity LEI"
            style={monoInputStyle}
          />
          <div style={hintStyle}>(20-character ISO 17442 identifier)</div>
        </div>
      </div>

      {/* Section: Venue */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase" as const,
          color: S.tertiary,
          borderBottom: `1px solid ${S.rim}`,
          paddingBottom: 6,
        }}>
          VENUE
        </div>
        <div>
          <label style={fieldLabelStyle}>Venue Code</label>
          <input
            type="text"
            value={data.venue}
            onChange={e => setData(prev => ({ ...prev, venue: e.target.value.toUpperCase() }))}
            placeholder="MIC code e.g. XOFF"
            style={{ ...monoInputStyle, maxWidth: 200 }}
          />
        </div>
      </div>

      {/* Section: Regulatory Frameworks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase" as const,
          color: S.tertiary,
          borderBottom: `1px solid ${S.rim}`,
          paddingBottom: 6,
        }}>
          REGULATORY FRAMEWORKS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FRAMEWORKS.map(fw => {
            const checked = data.regulatory_frameworks.includes(fw.id);
            return (
              <label
                key={fw.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  padding: "8px 12px",
                  borderRadius: 2,
                  border: `1px solid ${checked ? S.cyan : S.soft}`,
                  background: checked
                    ? `color-mix(in srgb, ${S.cyan} 6%, transparent)`
                    : "transparent",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleFramework(fw.id)}
                  style={{ accentColor: S.cyan, cursor: "pointer" }}
                />
                <span style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  color: checked ? S.cyan : S.primary,
                  letterSpacing: "0.03em",
                }}>
                  {fw.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Section: Counterparty Classification */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase" as const,
          color: S.tertiary,
          borderBottom: `1px solid ${S.rim}`,
          paddingBottom: 6,
        }}>
          COUNTERPARTY CLASSIFICATION
        </div>
        <label style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          padding: "10px 14px",
          borderRadius: 2,
          border: `1px solid ${data.is_financial_counterparty ? S.cyan : S.soft}`,
          background: data.is_financial_counterparty
            ? `color-mix(in srgb, ${S.cyan} 6%, transparent)`
            : "transparent",
          maxWidth: 480,
        }}>
          <div
            onClick={() => setData(prev => ({ ...prev, is_financial_counterparty: !prev.is_financial_counterparty }))}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              background: data.is_financial_counterparty ? S.cyan : S.tertiary,
              position: "relative",
              cursor: "pointer",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <div style={{
              position: "absolute",
              top: 2,
              left: data.is_financial_counterparty ? 18 : 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
            }} />
          </div>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: data.is_financial_counterparty ? S.cyan : S.primary }}>
              FINANCIAL COUNTERPARTY
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 2 }}>
              Entity is classified as a Financial Counterparty (FC) under EMIR
            </div>
          </div>
        </label>
      </div>

      {/* Save button */}
      <div style={{ paddingTop: 4 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            color: saving ? S.tertiary : "#000",
            background: saving ? S.bgSub : S.cyan,
            border: `1px solid ${saving ? S.rim : S.cyan}`,
            borderRadius: 2,
            padding: "9px 22px",
            cursor: saving ? "wait" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {saving ? "SAVING..." : "SAVE REGULATORY SETTINGS"}
        </button>
      </div>

    </div>
  );
}
