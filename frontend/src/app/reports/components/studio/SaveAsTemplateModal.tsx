"use client";

import { useEffect, useState } from "react";
import { T } from "@/lib/design/tokens";
import { Save, X } from "lucide-react";
import type { ReportAudience, ReportCategory } from "@/types/reportTypes";
import type { StudioSection } from "./SectionList";
import {
  createCustomReportTemplate,
  updateCustomReportTemplate,
  type CustomReportTemplate,
  type CustomReportSectionSpec,
  CustomReportTemplateApiError,
} from "@/lib/api/customReportTemplatesClient";

export type SaveModalMode = "create" | "update" | "duplicate";

interface Props {
  open: boolean;
  token: string;
  sections: StudioSection[];
  mode: SaveModalMode;
  prefill?: CustomReportTemplate | null;
  onClose: () => void;
  onSaved: (tmpl: CustomReportTemplate) => void;
}

const CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: "EXECUTIVE_BOARD", label: "Executive / Board" },
  { value: "TREASURY_FX", label: "Treasury / FX" },
  { value: "RISK_COMMITTEE", label: "Risk Committee" },
  { value: "POLICY_PACK", label: "Policy Pack" },
  { value: "EXECUTION_PACK", label: "Execution Pack" },
  { value: "SCENARIO_STRESS", label: "Scenario / Stress" },
  { value: "EXPOSURE_DECOMP", label: "Exposure Decomposition" },
  { value: "DATA_QUALITY", label: "Data Quality" },
  { value: "CONNECTOR_HEALTH", label: "Connector Health" },
  { value: "COMPLIANCE_AUDIT", label: "Compliance / Audit" },
  { value: "MULTI_CURRENCY", label: "Multi-Currency" },
];

const AUDIENCES: { value: ReportAudience; label: string }[] = [
  { value: "BOARD", label: "Board" },
  { value: "CFO", label: "CFO" },
  { value: "TREASURER", label: "Treasurer" },
  { value: "RISK_COMMITTEE", label: "Risk Committee" },
  { value: "AUDIT", label: "Audit" },
  { value: "TRADER", label: "Trader" },
  { value: "ANALYST", label: "Analyst" },
  { value: "REGULATOR", label: "Regulator" },
];

export default function SaveAsTemplateModal({
  open, token, sections, mode, prefill, onClose, onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [category, setCategory] = useState<ReportCategory>("TREASURY_FX");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<ReportAudience[]>([]);
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-prefill whenever the modal opens in a mode that carries data.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if ((mode === "update" || mode === "duplicate") && prefill) {
      const suffix = mode === "duplicate" ? " (Copy)" : "";
      setName(prefill.name + suffix);
      setShortName(mode === "duplicate" ? "" : prefill.short_name);
      setCategory(prefill.category);
      setDescription(prefill.description ?? "");
      setAudience(prefill.audience);
      setTagsText(prefill.tags.join(", "));
    } else {
      setName("");
      setShortName("");
      setCategory("TREASURY_FX");
      setDescription("");
      setAudience([]);
      setTagsText("");
    }
  }, [open, mode, prefill]);

  if (!open) return null;

  const toggleAudience = (a: ReportAudience) => {
    setAudience((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    if (!shortName.trim()) { setError("Short name is required"); return; }
    if (sections.length === 0) { setError("No sections to save"); return; }

    const serialisedSections: CustomReportSectionSpec[] = sections.map((s, idx) => ({
      type: s.type,
      title: s.title,
      order: idx,
      status: (s.status as "INCLUDED" | "EXCLUDED" | "DRAFT") ?? "INCLUDED",
      page_break_before: false,
    }));

    const tags = tagsText.trim()
      ? tagsText.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;

    setSaving(true);
    try {
      let tmpl: CustomReportTemplate;
      if (mode === "update" && prefill) {
        tmpl = await updateCustomReportTemplate(token, prefill.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          audience,
          sections: serialisedSections,
          tags: tags ?? [],
        });
      } else {
        tmpl = await createCustomReportTemplate(token, {
          name: name.trim(),
          short_name: shortName.trim(),
          category,
          description: description.trim() || undefined,
          audience: audience.length > 0 ? audience : undefined,
          sections: serialisedSections,
          tags,
        });
      }
      onSaved(tmpl);
      onClose();
    } catch (e) {
      const msg = e instanceof CustomReportTemplateApiError
        ? e.message
        : (e instanceof Error ? e.message : "Failed to save");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === "update" ? "Update Custom Template"
      : mode === "duplicate" ? "Duplicate Custom Template"
        : "Save as Custom Template";

  const submitLabel =
    mode === "update" ? (saving ? "Updating…" : "Update Template")
      : (saving ? "Saving…" : "Save Template");

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "95vw", maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          background: T.bgPanel,
          border: `1px solid ${T.rim}`, borderRadius: 6,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px",
            borderBottom: `1px solid ${T.rim}`,
          }}
        >
          <Save size={14} style={{ color: T.accent }} />
          <span
            style={{
              fontFamily: T.fontMono, fontSize: 13, fontWeight: 600,
              letterSpacing: "0.05em", color: T.primary,
              textTransform: "uppercase", flex: 1,
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: T.tertiary, cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Monthly Treasurer Pack"
              style={inputStyle}
            />
          </Field>

          <Field label="Short Name *">
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="MO-TREAS"
              style={inputStyle}
              disabled={mode === "update"}
              title={mode === "update" ? "Short name cannot be changed" : undefined}
            />
          </Field>

          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
              style={inputStyle}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Internal description (optional)"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <Field label="Audience">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {AUDIENCES.map((a) => {
                const on = audience.includes(a.value);
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => toggleAudience(a.value)}
                    style={{
                      padding: "4px 10px",
                      fontFamily: T.fontMono, fontSize: 11,
                      background: on ? T.accent : "transparent",
                      color: on ? T.bgDeep : T.secondary,
                      border: `1px solid ${on ? T.accent : T.rim}`,
                      borderRadius: 3, cursor: "pointer",
                    }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Tags (comma-separated)">
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="monthly, fx, board"
              style={inputStyle}
            />
          </Field>

          <div
            style={{
              padding: "8px 10px", background: T.bgDeep,
              border: `1px solid ${T.soft}`, borderRadius: 4,
              fontFamily: T.fontMono, fontSize: 11, color: T.tertiary,
            }}
          >
            {mode === "update"
              ? `Updating template with ${sections.length} section${sections.length === 1 ? "" : "s"}.`
              : mode === "duplicate"
                ? `Creating a copy with ${sections.length} section${sections.length === 1 ? "" : "s"}.`
                : `Saving ${sections.length} section${sections.length === 1 ? "" : "s"} as a reusable template.`}
          </div>

          {error && (
            <div
              style={{
                padding: "8px 10px", background: "rgba(220,60,60,0.1)",
                border: "1px solid rgba(220,60,60,0.4)", borderRadius: 4,
                fontFamily: T.fontMono, fontSize: 12, color: "var(--accent-red,#ff7070)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex", gap: 8, justifyContent: "flex-end",
            padding: "10px 16px",
            borderTop: `1px solid ${T.rim}`,
          }}
        >
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontFamily: T.fontMono, fontSize: 11, fontWeight: 600,
          letterSpacing: "0.06em", color: T.tertiary, textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  background: T.bgDeep,
  border: `1px solid ${T.rim}`,
  borderRadius: 4,
  fontFamily: T.fontMono,
  fontSize: 12,
  color: T.primary,
  outline: "none",
};

const btnGhost: React.CSSProperties = {
  padding: "6px 14px",
  background: "transparent",
  border: `1px solid ${T.rim}`,
  color: T.secondary,
  fontFamily: T.fontMono,
  fontSize: 12,
  borderRadius: 3,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  padding: "6px 14px",
  background: T.accent,
  border: `1px solid ${T.accent}`,
  color: T.bgDeep,
  fontFamily: T.fontMono,
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 3,
  cursor: "pointer",
};
