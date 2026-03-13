"use client";

import { useCallback } from "react";
import { T } from "@/lib/design/tokens";
import DataBinding from "./DataBinding";
import TemplateSelector from "./TemplateSelector";
import SectionList from "./SectionList";
import type { DataBindingState } from "./DataBinding";
import type { StudioSection } from "./SectionList";
import type { ReportTemplate } from "@/types/reportTypes";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  binding: DataBindingState;
  onBindingChange: (next: DataBindingState) => void;
  selectedTemplateId: string | null;
  onTemplateChange: (template: ReportTemplate | null) => void;
  sections: StudioSection[];
  onSectionsChange: (next: StudioSection[]) => void;
  selectedSectionIndex: number | null;
  onSelectSection: (index: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConfigPanel({
  token,
  binding,
  onBindingChange,
  selectedTemplateId,
  onTemplateChange,
  sections,
  onSectionsChange,
  selectedSectionIndex,
  onSelectSection,
}: Props) {
  // Wrap template change to also populate sections
  const handleTemplateChange = useCallback(
    (template: ReportTemplate | null) => {
      onTemplateChange(template);
    },
    [onTemplateChange],
  );

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
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={handleTemplateChange}
        />
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
