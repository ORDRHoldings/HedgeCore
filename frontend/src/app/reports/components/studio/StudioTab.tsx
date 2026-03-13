"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { T } from "@/lib/design/tokens";
import { REPORT_PRESETS } from "@/constants/reportPresets";
import type { ReportTemplate } from "@/types/reportTypes";

import ConfigPanel from "./ConfigPanel";
import PreviewPane from "./PreviewPane";
import ExportBar from "./ExportBar";
import type { DataBindingState } from "./DataBinding";
import type { StudioSection } from "./SectionList";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  userId?: string;
  initialPresetId?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert template default_sections into StudioSection[] with generated IDs. */
function templateToSections(template: ReportTemplate): StudioSection[] {
  return template.default_sections.map((sec, idx) => ({
    id: `sec-${template.template_id}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    type: sec.type,
    title: sec.title,
    order: idx,
    status: sec.status ?? "INCLUDED",
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StudioTab({ token, userId, initialPresetId }: Props) {
  void userId;
  const appliedPresetRef = useRef<string | null>(null);

  // ── State ─────────────────────────────────────────────────────────────────

  const [binding, setBinding] = useState<DataBindingState>({
    runId: null,
    policyId: null,
    runLabel: "",
    policyLabel: "",
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sections, setSections] = useState<StudioSection[]>([]);
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number | null>(null);

  // ── Auto-load preset from Library ────────────────────────────────────────

  useEffect(() => {
    if (initialPresetId && initialPresetId !== appliedPresetRef.current) {
      const preset = REPORT_PRESETS.find((p) => p.template_id === initialPresetId);
      if (preset) {
        appliedPresetRef.current = initialPresetId;
        setSelectedTemplateId(preset.template_id);
        setSections(templateToSections(preset));
        setSelectedSectionIndex(null);
      }
    }
  }, [initialPresetId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTemplateChange = useCallback(
    (template: ReportTemplate | null) => {
      if (template) {
        setSelectedTemplateId(template.template_id);
        setSections(templateToSections(template));
        setSelectedSectionIndex(null);
      } else {
        // Custom report -- clear template, keep sections
        setSelectedTemplateId(null);
      }
    },
    [],
  );

  const handleSectionsChange = useCallback((next: StudioSection[]) => {
    setSections(next);
  }, []);

  const handleSelectSection = useCallback((index: number) => {
    setSelectedSectionIndex(index);
  }, []);

  const handleBindingChange = useCallback((next: DataBindingState) => {
    setBinding(next);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: T.bgDeep,
      }}
    >
      {/* Main content: config + preview side by side */}
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left: Config Panel (300px) */}
        <ConfigPanel
          token={token}
          binding={binding}
          onBindingChange={handleBindingChange}
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={handleTemplateChange}
          sections={sections}
          onSectionsChange={handleSectionsChange}
          selectedSectionIndex={selectedSectionIndex}
          onSelectSection={handleSelectSection}
        />

        {/* Right: Preview Pane */}
        <PreviewPane
          token={token}
          binding={binding}
          sections={sections}
          selectedSectionIndex={selectedSectionIndex}
        />
      </div>

      {/* Bottom: Export Bar */}
      <ExportBar
        token={token}
        binding={binding}
        sections={sections}
        selectedTemplateId={selectedTemplateId}
      />
    </div>
  );
}
