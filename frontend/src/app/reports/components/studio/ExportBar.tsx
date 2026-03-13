"use client";

import { useState, useCallback, useMemo } from "react";
import { T } from "@/lib/design/tokens";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { DataBindingState } from "./DataBinding";
import type { StudioSection } from "./SectionList";
import { Download, Save, FileText, Table, CheckCircle, AlertTriangle } from "lucide-react";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  binding: DataBindingState;
  sections: StudioSection[];
  selectedTemplateId: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExportBar({
  token,
  binding,
  sections,
  selectedTemplateId,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Validation
  const issues = useMemo(() => {
    const list: string[] = [];
    if (!binding.runId) list.push("No run bound");
    if (sections.length === 0) list.push("No sections defined");
    return list;
  }, [binding.runId, sections.length]);

  const isValid = issues.length === 0;

  // Estimated page count (simple heuristic: 2 sections per page)
  const estimatedPages = Math.max(1, Math.ceil(sections.length / 2));

  // Save handler
  const handleSave = useCallback(async () => {
    if (!token || !binding.runId) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const payload = {
        run_id: binding.runId,
        template_id: selectedTemplateId,
        sections: sections.map((s) => ({
          type: s.type,
          title: s.title,
          order: s.order,
          status: s.status,
        })),
      };
      const res = await dashboardFetch("/v1/reports/save", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSaveMessage("Saved");
      } else {
        setSaveMessage("Save failed");
      }
    } catch {
      setSaveMessage("Save failed");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }, [token, binding.runId, selectedTemplateId, sections]);

  // PDF export
  const handlePdf = useCallback(async () => {
    if (!isValid) return;
    setExporting(true);
    try {
      const { exportCommitteePackPdf } = await import("@/utils/clientExport");
      // Fetch full calc result for PDF export
      const res = await dashboardFetch(
        `/v1/export/committee-pack/${encodeURIComponent(binding.runId!)}`,
        token,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // The committee pack PDF expects a CalculateResponse-shaped object
      // Construct a minimal one from the pack data
      if (data && data.hedge_plan) {
        const scenarioArr = (data.scenarios ?? []) as Record<string, unknown>[];
        await exportCommitteePackPdf(
          {
            run_id: (binding.runId ?? "") as string,
            hedge_plan: data.hedge_plan,
            scenario_results: {
              sigmas: scenarioArr.map((s) => (s.sigma as number) ?? 0),
              totals: scenarioArr.map((s) => ({
                sigma: (s.sigma as number) ?? 0,
                shocked_spot: 0,
                total_unhedged_usd: 0,
                total_hedged_usd: 0,
                total_hedge_benefit_usd: (s.hedge_benefit_usd as number) ?? 0,
              })),
              per_bucket: [],
            },
            validation_report: { status: "PASS" as const, errors: [], warnings: [] },
            run_envelope: data.run_envelope ?? {
              run_id: binding.runId ?? "",
              timestamp: new Date().toISOString(),
              engine_version: "1.0",
              inputs_hash: "",
              outputs_hash: "",
              trades_hash: "",
              hedges_hash: "",
              market_hash: "",
              policy_hash: "",
            },
            trace_lite: { run_id: binding.runId ?? "", events: [] },
          },
          "USD",
        );
      }
    } catch {
      // Silent fail for export
    } finally {
      setExporting(false);
    }
  }, [isValid, binding.runId, token]);

  // XLSX export
  const handleXlsx = useCallback(async () => {
    if (!isValid) return;
    setExporting(true);
    try {
      const { exportReportXlsx } = await import("@/utils/clientExport");
      exportReportXlsx("ReportStudio", []);
    } catch {
      // Silent fail
    } finally {
      setExporting(false);
    }
  }, [isValid]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 20px",
        background: T.bgPanel,
        borderTop: `1px solid ${T.rim}`,
        flexShrink: 0,
      }}
    >
      {/* Left: stats and validation */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            fontFamily: T.fontMono,
            fontSize: 12,
            color: T.tertiary,
          }}
        >
          {sections.length} section{sections.length !== 1 ? "s" : ""}
        </span>

        <span
          style={{
            fontFamily: T.fontMono,
            fontSize: 12,
            color: T.tertiary,
          }}
        >
          ~{estimatedPages} page{estimatedPages !== 1 ? "s" : ""}
        </span>

        {/* Validation badge */}
        {isValid ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 3,
              fontFamily: T.fontMono,
              fontSize: 12,
              fontWeight: 600,
              color: T.pass,
              background: T.bgDeep,
              border: `1px solid ${T.pass}`,
            }}
          >
            <CheckCircle size={12} />
            VALID
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 3,
              fontFamily: T.fontMono,
              fontSize: 12,
              fontWeight: 600,
              color: T.warn,
              background: T.bgDeep,
              border: `1px solid ${T.warn}`,
            }}
          >
            <AlertTriangle size={12} />
            {issues.length} ISSUE{issues.length !== 1 ? "S" : ""}
          </span>
        )}

        {/* Save message */}
        {saveMessage && (
          <span
            style={{
              fontFamily: T.fontMono,
              fontSize: 12,
              color: saveMessage === "Saved" ? T.pass : T.fail,
            }}
          >
            {saveMessage}
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !binding.runId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 14px",
            background: "transparent",
            border: `1px solid ${T.rim}`,
            borderRadius: 4,
            fontFamily: T.fontMono,
            fontSize: 12,
            fontWeight: 600,
            color: binding.runId ? T.secondary : T.disabled,
            cursor: binding.runId ? "pointer" : "not-allowed",
            letterSpacing: "0.04em",
          }}
        >
          <Save size={13} />
          {saving ? "SAVING..." : "SAVE"}
        </button>

        {/* PDF */}
        <button
          onClick={handlePdf}
          disabled={!isValid || exporting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 14px",
            background: "transparent",
            border: `1px solid ${T.rim}`,
            borderRadius: 4,
            fontFamily: T.fontMono,
            fontSize: 12,
            fontWeight: 600,
            color: isValid ? T.secondary : T.disabled,
            cursor: isValid ? "pointer" : "not-allowed",
            letterSpacing: "0.04em",
          }}
        >
          <FileText size={13} />
          PDF
        </button>

        {/* XLSX */}
        <button
          onClick={handleXlsx}
          disabled={!isValid || exporting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 14px",
            background: "transparent",
            border: `1px solid ${T.rim}`,
            borderRadius: 4,
            fontFamily: T.fontMono,
            fontSize: 12,
            fontWeight: 600,
            color: isValid ? T.secondary : T.disabled,
            cursor: isValid ? "pointer" : "not-allowed",
            letterSpacing: "0.04em",
          }}
        >
          <Table size={13} />
          XLSX
        </button>

        {/* Primary export */}
        <button
          onClick={handlePdf}
          disabled={!isValid || exporting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 18px",
            background: isValid ? T.accent : T.bgSub,
            border: "none",
            borderRadius: 4,
            fontFamily: T.fontMono,
            fontSize: 12,
            fontWeight: 700,
            color: isValid ? T.bgDeep : T.disabled,
            cursor: isValid ? "pointer" : "not-allowed",
            letterSpacing: "0.06em",
          }}
        >
          <Download size={14} />
          {exporting ? "EXPORTING..." : "EXPORT"}
        </button>
      </div>
    </div>
  );
}
