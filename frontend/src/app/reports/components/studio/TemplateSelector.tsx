"use client";

import { useState, useCallback, useMemo } from "react";
import { T } from "@/lib/design/tokens";
import { REPORT_PRESETS, REPORT_CATEGORIES } from "@/constants/reportPresets";
import type { ReportTemplate } from "@/types/reportTypes";
import { FileStack, Users, FileText } from "lucide-react";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  selectedTemplateId: string | null;
  onTemplateChange: (template: ReportTemplate | null) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TemplateSelector({
  selectedTemplateId,
  onTemplateChange,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedTemplate = useMemo(
    () =>
      selectedTemplateId
        ? REPORT_PRESETS.find((p) => p.template_id === selectedTemplateId) ?? null
        : null,
    [selectedTemplateId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ReportTemplate[]>();
    for (const preset of REPORT_PRESETS) {
      const arr = map.get(preset.category) ?? [];
      arr.push(preset);
      map.set(preset.category, arr);
    }
    return map;
  }, []);

  const handleSelect = useCallback(
    (template: ReportTemplate) => {
      onTemplateChange(template);
      setDropdownOpen(false);
    },
    [onTemplateChange],
  );

  const handleCustom = useCallback(() => {
    onTemplateChange(null);
    setDropdownOpen(false);
  }, [onTemplateChange]);

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <FileStack size={14} style={{ color: T.tertiary }} />
        <span
          style={{
            fontFamily: T.fontMono,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: T.tertiary,
            textTransform: "uppercase",
          }}
        >
          TEMPLATE
        </span>
      </div>

      {/* Dropdown trigger */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: T.bgDeep,
            border: `1px solid ${T.rim}`,
            borderRadius: 4,
            fontFamily: T.fontMono,
            fontSize: 12,
            color: selectedTemplate ? T.primary : T.tertiary,
            textAlign: "left",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {selectedTemplate ? selectedTemplate.short_name : "Select template..."}
          </span>
          <span style={{ color: T.tertiary, fontSize: 10, flexShrink: 0, marginLeft: 4 }}>
            {dropdownOpen ? "\u25B2" : "\u25BC"}
          </span>
        </button>

        {/* Dropdown list */}
        {dropdownOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 50,
              background: T.bgPanel,
              border: `1px solid ${T.rim}`,
              borderRadius: 4,
              marginTop: 2,
              maxHeight: 320,
              overflowY: "auto",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            {REPORT_CATEGORIES.map((cat) => {
              const templates = grouped.get(cat.key) ?? [];
              if (templates.length === 0) return null;
              return (
                <div key={cat.key}>
                  {/* Category header */}
                  <div
                    style={{
                      padding: "6px 12px",
                      fontFamily: T.fontMono,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: T.tertiary,
                      textTransform: "uppercase",
                      background: T.bgSub,
                      borderBottom: `1px solid ${T.rim}`,
                    }}
                  >
                    {cat.label}
                  </div>
                  {templates.map((tmpl) => {
                    const isSelected = tmpl.template_id === selectedTemplateId;
                    return (
                      <button
                        key={tmpl.template_id}
                        onClick={() => handleSelect(tmpl)}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "7px 12px 7px 16px",
                          background: isSelected ? T.bgSub : "transparent",
                          border: "none",
                          borderLeft: isSelected
                            ? `2px solid ${T.accent}`
                            : "2px solid transparent",
                          textAlign: "left",
                          cursor: "pointer",
                          fontFamily: T.fontUI,
                          fontSize: 12,
                          color: isSelected ? T.accent : T.primary,
                        }}
                      >
                        {tmpl.short_name}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Custom option */}
            <button
              onClick={handleCustom}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                borderTop: `1px solid ${T.rim}`,
                textAlign: "left",
                cursor: "pointer",
                fontFamily: T.fontMono,
                fontSize: 12,
                fontWeight: 600,
                color: T.secondary,
                fontStyle: "italic",
              }}
            >
              + Custom Report
            </button>
          </div>
        )}
      </div>

      {/* Metadata display when a template is selected */}
      {selectedTemplate && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: T.bgDeep,
            borderRadius: 4,
            border: `1px solid ${T.soft}`,
          }}
        >
          <div
            style={{
              fontFamily: T.fontUI,
              fontSize: 12,
              fontWeight: 600,
              color: T.primary,
              marginBottom: 8,
            }}
          >
            {selectedTemplate.name}
          </div>

          <div
            style={{
              fontFamily: T.fontUI,
              fontSize: 12,
              color: T.tertiary,
              lineHeight: 1.5,
              marginBottom: 10,
            }}
          >
            {selectedTemplate.description.slice(0, 120)}
            {selectedTemplate.description.length > 120 ? "..." : ""}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <MetaItem
              icon={<Users size={12} />}
              label="Audience"
              value={selectedTemplate.audience.join(", ")}
            />
            <MetaItem
              icon={<FileText size={12} />}
              label="Pages"
              value={String(selectedTemplate.estimated_pages)}
            />
            <MetaItem
              icon={<FileStack size={12} />}
              label="Sections"
              value={String(selectedTemplate.default_sections.length)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Meta sub-component ────────────────────────────────────────────────────────

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: T.tertiary }}>{icon}</span>
      <span
        style={{
          fontFamily: T.fontMono,
          fontSize: 12,
          color: T.tertiary,
        }}
      >
        {label}:
      </span>
      <span
        style={{
          fontFamily: T.fontMono,
          fontSize: 12,
          color: T.secondary,
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}
