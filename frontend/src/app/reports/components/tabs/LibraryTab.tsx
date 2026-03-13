"use client";

import { useState, useMemo } from "react";
import { T } from "@/lib/design/tokens";
import { REPORT_PRESETS, REPORT_CATEGORIES } from "@/constants/reportPresets";
import { Plus, Search } from "lucide-react";

interface Props {
  onSelectPreset: (presetId: string) => void;
}

export default function LibraryTab({ onSelectPreset }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return REPORT_PRESETS.filter((t) => {
      // category filter
      if (activeCategory !== "ALL" && t.category !== activeCategory) return false;
      // search filter
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [search, activeCategory]);

  return (
    <div style={{ padding: 24, background: T.bgDeep, minHeight: "60vh" }}>
      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: T.bgPanel,
          border: `1px solid ${T.rim}`,
          borderRadius: 6,
          padding: "8px 14px",
          marginBottom: 16,
          maxWidth: 480,
        }}
      >
        <Search size={15} color={T.tertiary} />
        <input
          type="text"
          placeholder="Search templates by name, description, or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: T.fontMono,
            fontSize: 13,
            color: T.primary,
            letterSpacing: "0.02em",
          }}
        />
      </div>

      {/* Category filter pills */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <button
          onClick={() => setActiveCategory("ALL")}
          style={{
            fontFamily: T.fontMono,
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "5px 12px",
            borderRadius: 4,
            border: `1px solid ${activeCategory === "ALL" ? T.accent : T.rim}`,
            background: activeCategory === "ALL" ? T.accentDim : "transparent",
            color: activeCategory === "ALL" ? T.accent : T.tertiary,
            cursor: "pointer",
            fontWeight: activeCategory === "ALL" ? 700 : 500,
          }}
        >
          All ({REPORT_PRESETS.length})
        </button>
        {REPORT_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              title={cat.description}
              style={{
                fontFamily: T.fontMono,
                fontSize: 11,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "5px 12px",
                borderRadius: 4,
                border: `1px solid ${isActive ? T.accent : T.rim}`,
                background: isActive ? T.accentDim : "transparent",
                color: isActive ? T.accent : T.tertiary,
                cursor: "pointer",
                fontWeight: isActive ? 700 : 500,
              }}
            >
              {cat.label} ({cat.count})
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {filtered.map((template) => {
          const isHovered = hoveredId === template.template_id;
          return (
            <div
              key={template.template_id}
              onClick={() => onSelectPreset(template.template_id)}
              onMouseEnter={() => setHoveredId(template.template_id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background: T.bgPanel,
                border: `1px solid ${isHovered ? T.accent : T.rim}`,
                borderRadius: 6,
                padding: 16,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                transition: "border-color 0.15s",
              }}
            >
              {/* Template ID badge */}
              <span
                style={{
                  fontFamily: T.fontMono,
                  fontSize: 11,
                  color: T.accent,
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                }}
              >
                {template.template_id}
              </span>

              {/* Name */}
              <span
                style={{
                  fontFamily: T.fontUI,
                  fontSize: 14,
                  fontWeight: 700,
                  color: T.primary,
                  lineHeight: 1.3,
                }}
              >
                {template.name}
              </span>

              {/* Description (2 lines max) */}
              <span
                style={{
                  fontFamily: T.fontUI,
                  fontSize: 12,
                  color: T.secondary,
                  lineHeight: 1.5,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {template.description}
              </span>

              {/* Audience badges */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {template.audience.map((a) => (
                  <span
                    key={a}
                    style={{
                      fontFamily: T.fontMono,
                      fontSize: 10,
                      letterSpacing: "0.04em",
                      color: T.tertiary,
                      background: T.bgSub,
                      border: `1px solid ${T.soft}`,
                      borderRadius: 3,
                      padding: "2px 6px",
                      textTransform: "uppercase",
                    }}
                  >
                    {a}
                  </span>
                ))}
              </div>

              {/* Bottom row: page count + section count */}
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginTop: "auto",
                  paddingTop: 8,
                  borderTop: `1px solid ${T.soft}`,
                }}
              >
                <span
                  style={{
                    fontFamily: T.fontMono,
                    fontSize: 11,
                    color: T.tertiary,
                  }}
                >
                  {template.estimated_pages} pages
                </span>
                <span
                  style={{
                    fontFamily: T.fontMono,
                    fontSize: 11,
                    color: T.tertiary,
                  }}
                >
                  {template.default_sections.length} sections
                </span>
              </div>
            </div>
          );
        })}

        {/* Custom Report card */}
        <div
          onClick={() => onSelectPreset("CUSTOM")}
          onMouseEnter={() => setHoveredId("CUSTOM")}
          onMouseLeave={() => setHoveredId(null)}
          style={{
            background: "transparent",
            border: `2px dashed ${hoveredId === "CUSTOM" ? T.accent : T.rim}`,
            borderRadius: 6,
            padding: 16,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            minHeight: 180,
            transition: "border-color 0.15s",
          }}
        >
          <Plus
            size={28}
            color={hoveredId === "CUSTOM" ? T.accent : T.tertiary}
          />
          <span
            style={{
              fontFamily: T.fontMono,
              fontSize: 13,
              fontWeight: 600,
              color: hoveredId === "CUSTOM" ? T.accent : T.tertiary,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Custom Report
          </span>
          <span
            style={{
              fontFamily: T.fontUI,
              fontSize: 12,
              color: T.tertiary,
              textAlign: "center",
            }}
          >
            Build from scratch with full section control
          </span>
        </div>
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            fontFamily: T.fontMono,
            fontSize: 13,
            color: T.tertiary,
            letterSpacing: "0.04em",
          }}
        >
          NO TEMPLATES MATCH YOUR SEARCH
        </div>
      )}
    </div>
  );
}
