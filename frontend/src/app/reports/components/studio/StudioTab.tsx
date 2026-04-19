"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { T } from "@/lib/design/tokens";
import { REPORT_PRESETS } from "@/constants/reportPresets";
import type { ReportTemplate } from "@/types/reportTypes";

import ConfigPanel from "./ConfigPanel";
import PreviewPane from "./PreviewPane";
import ExportBar from "./ExportBar";
import SaveAsTemplateModal, { type SaveModalMode } from "./SaveAsTemplateModal";
import type { DataBindingState } from "./DataBinding";
import type { StudioSection } from "./SectionList";
import type { CustomReportTemplate } from "@/lib/api/customReportTemplatesClient";

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

/** Convert a CustomReportTemplate into StudioSection[]. */
function customTemplateToSections(tmpl: CustomReportTemplate): StudioSection[] {
  return tmpl.sections.map((sec, idx) => ({
    id: `sec-${tmpl.id}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
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
  const [selectedCustomTemplate, setSelectedCustomTemplate] =
    useState<CustomReportTemplate | null>(null);
  const [sections, setSections] = useState<StudioSection[]>([]);
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<SaveModalMode>("create");
  const [modalPrefill, setModalPrefill] = useState<CustomReportTemplate | null>(null);
  const [customRefreshKey, setCustomRefreshKey] = useState(0);

  // ── Auto-load preset from Library ────────────────────────────────────────

  useEffect(() => {
    if (initialPresetId && initialPresetId !== appliedPresetRef.current) {
      const preset = REPORT_PRESETS.find((p) => p.template_id === initialPresetId);
      if (preset) {
        appliedPresetRef.current = initialPresetId;
        setSelectedTemplateId(preset.template_id);
        setSelectedCustomTemplate(null);
        setSections(templateToSections(preset));
        setSelectedSectionIndex(null);
      }
    }
  }, [initialPresetId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTemplateChange = useCallback(
    (template: ReportTemplate | null) => {
      setSelectedCustomTemplate(null);
      if (template) {
        setSelectedTemplateId(template.template_id);
        setSections(templateToSections(template));
        setSelectedSectionIndex(null);
      } else {
        setSelectedTemplateId(null);
      }
    },
    [],
  );

  const handleCustomTemplateSelect = useCallback(
    (tmpl: CustomReportTemplate) => {
      setSelectedTemplateId(tmpl.id);
      setSelectedCustomTemplate(tmpl);
      setSections(customTemplateToSections(tmpl));
      setSelectedSectionIndex(null);
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

  const handleOpenSaveModal = useCallback(() => {
    setModalMode("create");
    setModalPrefill(null);
    setSaveModalOpen(true);
  }, []);

  const handleOpenUpdateModal = useCallback(() => {
    if (!selectedCustomTemplate) return;
    setModalMode("update");
    setModalPrefill(selectedCustomTemplate);
    setSaveModalOpen(true);
  }, [selectedCustomTemplate]);

  const handleRequestDuplicate = useCallback((tmpl: CustomReportTemplate) => {
    setSections(customTemplateToSections(tmpl));
    setSelectedSectionIndex(null);
    setSelectedTemplateId(null);
    setSelectedCustomTemplate(null);
    setModalMode("duplicate");
    setModalPrefill(tmpl);
    setSaveModalOpen(true);
  }, []);

  const handleCloseSaveModal = useCallback(() => setSaveModalOpen(false), []);

  const handleTemplateSaved = useCallback((tmpl: CustomReportTemplate) => {
    setSelectedTemplateId(tmpl.id);
    setSelectedCustomTemplate(tmpl);
    setCustomRefreshKey((k) => k + 1);
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
          selectedCustomTemplate={selectedCustomTemplate}
          onTemplateChange={handleTemplateChange}
          onCustomTemplateSelect={handleCustomTemplateSelect}
          onRequestDuplicate={handleRequestDuplicate}
          sections={sections}
          onSectionsChange={handleSectionsChange}
          selectedSectionIndex={selectedSectionIndex}
          onSelectSection={handleSelectSection}
          onSaveAsTemplate={handleOpenSaveModal}
          onUpdateTemplate={handleOpenUpdateModal}
          customRefreshKey={customRefreshKey}
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

      <SaveAsTemplateModal
        open={saveModalOpen}
        token={token}
        sections={sections}
        mode={modalMode}
        prefill={modalPrefill}
        onClose={handleCloseSaveModal}
        onSaved={handleTemplateSaved}
      />
    </div>
  );
}
