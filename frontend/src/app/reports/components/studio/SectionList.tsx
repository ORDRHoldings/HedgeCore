"use client";

import { useState, useCallback, useRef } from "react";
import { T } from "@/lib/design/tokens";
import { List, GripVertical, X, Plus } from "lucide-react";
import type { SectionType } from "@/types/reportTypes";

// ── Section item shape ────────────────────────────────────────────────────────

export interface StudioSection {
  id: string;
  type: SectionType;
  title: string;
  order: number;
  status: string;
}

// ── Available section types for "+ ADD" ────────────────────────────────────────

const ALL_SECTION_TYPES: { type: SectionType; label: string }[] = [
  { type: "COVER_PAGE", label: "Cover Page" },
  { type: "TABLE_OF_CONTENTS", label: "Table of Contents" },
  { type: "EXECUTIVE_SUMMARY", label: "Executive Summary" },
  { type: "EXPOSURE_DECOMPOSITION", label: "Exposure Decomposition" },
  { type: "HEDGE_PLAN_TABLE", label: "Hedge Plan Table" },
  { type: "HEDGE_EFFICIENCY", label: "Hedge Efficiency" },
  { type: "SCENARIO_SENSITIVITY", label: "Scenario Sensitivity" },
  { type: "POLICY_COMPLIANCE", label: "Policy Compliance" },
  { type: "FORWARD_CURVE", label: "Forward Curve" },
  { type: "STRESS_TEST_RESULTS", label: "Stress Test Results" },
  { type: "MACRO_OVERLAY", label: "Macro Overlay" },
  { type: "AUDIT_EVENTS", label: "Audit Events" },
  { type: "POLICY_RATIONALE", label: "Policy Rationale" },
  { type: "EXECUTION_LOG", label: "Execution Log" },
  { type: "APPROVAL_CHAIN", label: "Approval Chain" },
  { type: "POSITION_REGISTER", label: "Position Register" },
  { type: "DATA_QUALITY", label: "Data Quality" },
  { type: "CONNECTOR_HEALTH", label: "Connector Health" },
  { type: "ASSUMPTIONS_REGISTRY", label: "Assumptions Registry" },
  { type: "DISCLOSURES", label: "Disclosures" },
  { type: "CUSTOM_NARRATIVE", label: "Custom Narrative" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  sections: StudioSection[];
  selectedIndex: number | null;
  onSelectSection: (index: number) => void;
  onSectionsChange: (next: StudioSection[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SectionList({
  sections,
  selectedIndex,
  onSelectSection,
  onSectionsChange,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const dragIdx = useRef<number | null>(null);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, idx: number) => {
      dragIdx.current = idx;
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropIdx: number) => {
      e.preventDefault();
      if (dragIdx.current === null || dragIdx.current === dropIdx) return;
      const next = [...sections];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(dropIdx, 0, moved);
      // Re-assign order
      const reordered = next.map((s, i) => ({ ...s, order: i }));
      onSectionsChange(reordered);
      dragIdx.current = null;
    },
    [sections, onSectionsChange],
  );

  const handleRemove = useCallback(
    (idx: number) => {
      const next = sections.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i }));
      onSectionsChange(next);
    },
    [sections, onSectionsChange],
  );

  const handleAdd = useCallback(
    (type: SectionType, label: string) => {
      const newSection: StudioSection = {
        id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        title: label,
        order: sections.length,
        status: "INCLUDED",
      };
      onSectionsChange([...sections, newSection]);
      setShowAdd(false);
    },
    [sections, onSectionsChange],
  );

  // Determine which types are not yet in the list
  const existingTypes = new Set(sections.map((s) => s.type));
  const availableTypes = ALL_SECTION_TYPES.filter((t) => !existingTypes.has(t.type));

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <List size={14} style={{ color: T.tertiary }} />
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
            SECTIONS ({sections.length})
          </span>
        </div>
        <button
          onClick={() => setShowAdd((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: "none",
            fontFamily: T.fontMono,
            fontSize: 12,
            fontWeight: 600,
            color: T.accent,
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
        >
          <Plus size={13} />
          ADD
        </button>
      </div>

      {/* Section rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sections.map((sec, idx) => {
          const isSelected = selectedIndex === idx;
          return (
            <div
              key={sec.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              onClick={() => onSelectSection(idx)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                background: isSelected ? T.bgSub : "transparent",
                borderLeft: isSelected
                  ? `3px solid ${T.accent}`
                  : "3px solid transparent",
                borderRadius: 3,
                cursor: "pointer",
                transition: "background 0.1s",
              }}
            >
              {/* Drag handle */}
              <GripVertical
                size={14}
                style={{
                  color: T.tertiary,
                  cursor: "grab",
                  flexShrink: 0,
                }}
              />

              {/* Number */}
              <span
                style={{
                  fontFamily: T.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  color: T.tertiary,
                  width: 20,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </span>

              {/* Title */}
              <span
                style={{
                  fontFamily: T.fontUI,
                  fontSize: 12,
                  color: isSelected ? T.primary : T.secondary,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sec.title}
              </span>

              {/* Remove button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(idx);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: T.tertiary,
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {sections.length === 0 && (
        <div
          style={{
            padding: "20px 0",
            textAlign: "center",
            fontFamily: T.fontUI,
            fontSize: 12,
            color: T.tertiary,
          }}
        >
          No sections. Select a template or add sections manually.
        </div>
      )}

      {/* Add section dropdown */}
      {showAdd && (
        <div
          style={{
            marginTop: 8,
            background: T.bgDeep,
            border: `1px solid ${T.rim}`,
            borderRadius: 4,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {availableTypes.length === 0 && (
            <div
              style={{
                padding: "8px 12px",
                fontFamily: T.fontUI,
                fontSize: 12,
                color: T.tertiary,
              }}
            >
              All section types already added
            </div>
          )}
          {availableTypes.map((st) => (
            <button
              key={st.type}
              onClick={() => handleAdd(st.type, st.label)}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 12px",
                background: "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: T.fontUI,
                fontSize: 12,
                color: T.secondary,
              }}
            >
              {st.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
