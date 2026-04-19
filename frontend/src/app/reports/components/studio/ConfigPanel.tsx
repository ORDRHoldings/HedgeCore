"use client";

import { useCallback } from "react";
import { T } from "@/lib/design/tokens";
import { Save } from "lucide-react";
import DataBinding from "./DataBinding";
import TemplateSelector from "./TemplateSelector";
import SectionList from "./SectionList";
import type { DataBindingState } from "./DataBinding";
import type { StudioSection } from "./SectionList";
import type { ReportTemplate } from "@/types/reportTypes";
import type { CustomReportTemplate } from "@/lib/api/customReportTemplatesClient";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  binding: DataBindingState;
  onBindingChange: (next: DataBindingState) => void;
  selectedTemplateId: string | null;
  onTemplateChange: (template: ReportTemplate | null) => void;
  onCustomTemplateSelect: (tmpl: CustomReportTemplate) => void;
  sections: StudioSection[];
  onSectionsChange: (next: StudioSection[]) => void;
  selectedSectionIndex: number | null;
  onSelectSection: (index: number) => void;
  onSaveAsTemplate: () => void;
  customRefreshKey?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConfigPanel({
  token,
  binding,
  onBindingChange,
  selectedTemplateId,
  onTemplateChange,
  onCustomTemplateSelect,
  sections,
  onSectionsChange,
  selectedSectionIndex,
  onSelectSection,
  onSaveAsTemplate,
  customRefreshKey,
}: Props) {
  // Wrap template change to also populate sections
  const handleTemplateChange = useCallback(
    (template: ReportTemplate | null) => {
      onTemplateChange(template);
    },
    [onTemplateChange],
  );

  const canSave = sections.length > 0;

  return (
    <div
      style={{
        width: 300,
        minWidth: 300,
        maxWidth: 300,
        height: "100%",
        overflowY: "auto",
        borderRight: `1px solid ${T.rim}`,
        background: T.bgPanel,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Data Binding */}
      <div style={{ borderBottom: `1px solid ${T.rim}` }}>
        <DataBinding
          token={token}
          binding={binding}
          onBindingChange={onBindingChange}
        />
      </div>

      {/* Template Selector */}
      <div style={{ borderBottom: `1px solid ${T.rim}` }}>
        <TemplateSelector
          token={token}
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={handleTemplateChange}
          onCustomTemplateSelect={onCustomTemplateSelect}
          refreshKey={customRefreshKey}
        />
      </div>

      {/* Save as Template */}
      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${T.rim}` }}>
        <button
          onClick={onSaveAsTemplate}
          disabled={!canSave}
          style={{
            width: "100%",
            padding: "7px 10px",
            background: canSave ? T.accent : "transparent",
            color: canSave ? T.bgDeep : T.tertiary,
            border: `1px solid ${canSave ? T.accent : T.rim}`,
            borderRadius: 3,
            fontFamily: T.fontMono,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: canSave ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
          title={canSave ? "Save current sections as a reusable template" : "Add sections first"}
        >
          <Save size={12} />
          Save as Template
        </button>
      </div>

      {/* Section List */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionList
          sections={sections}
          selectedIndex={selectedSectionIndex}
          onSelectSection={onSelectSection}
          onSectionsChange={onSectionsChange}
        />
      </div>
    </div>
  );
}
