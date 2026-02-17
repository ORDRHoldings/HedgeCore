"use client";

import { useState, useEffect, ReactNode } from "react";

export interface XRayTab {
  id: string;
  label: string;
  content: ReactNode;
}

export interface XRayDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  tabs: XRayTab[];
  initialTab?: string;
}

export default function XRayDrawer({
  open,
  onClose,
  title = "X-Ray",
  tabs,
  initialTab,
}: XRayDrawerProps) {
  const [activeTab, setActiveTab] = useState(initialTab ?? tabs[0]?.id ?? "");

  useEffect(() => {
    if (open && initialTab) setActiveTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <aside
        className="fixed top-0 right-0 z-50 flex flex-col w-[480px] max-w-[90vw] h-full bg-[var(--bg-panel)] border-l border-[var(--border-rim)] shadow-xl"
        style={{ animation: "slideInRight 200ms ease-out" }}
        role="dialog"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-rim)] shrink-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-sub)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Close drawer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        {tabs.length > 1 && (
          <div className="flex border-b border-[var(--border-rim)] px-4 shrink-0" role="tablist">
            {tabs.map((tab) => {
              const isActive = tab.id === (active?.id ?? "");
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "relative px-3 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-cyan)]" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto p-4 font-mono text-xs leading-relaxed text-[var(--text-primary)]">
          {active?.content}
        </div>
      </aside>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

/* ── JSON Viewer sub-component ── */

export interface JsonViewerProps {
  data: unknown;
  initialExpanded?: boolean;
}

export function JsonViewer({ data, initialExpanded = false }: JsonViewerProps) {
  return (
    <div className="font-mono text-xs">
      <JsonNode value={data} depth={0} initialExpanded={initialExpanded} />
    </div>
  );
}

function JsonNode({
  value,
  depth,
  label,
  initialExpanded,
}: {
  value: unknown;
  depth: number;
  label?: string;
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded || depth < 1);

  if (value === null || value === undefined) {
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        {label && <span className="text-[var(--text-secondary)]">{label}: </span>}
        <span className="text-[var(--text-tertiary)]">null</span>
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        {label && <span className="text-[var(--text-secondary)]">{label}: </span>}
        <span className="text-[var(--accent-cyan)]">{String(value)}</span>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        {label && <span className="text-[var(--text-secondary)]">{label}: </span>}
        <span className="tabular-nums text-[var(--accent-cyan)]">{value}</span>
      </div>
    );
  }

  if (typeof value === "string") {
    return (
      <div style={{ paddingLeft: depth * 16 }} className="break-all">
        {label && <span className="text-[var(--text-secondary)]">{label}: </span>}
        <span className="text-[var(--accent-green)]">&quot;{value}&quot;</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div style={{ paddingLeft: depth * 16 }}>
          {label && <span className="text-[var(--text-secondary)]">{label}: </span>}
          <span className="text-[var(--text-tertiary)]">[]</span>
        </div>
      );
    }
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ChevronIcon expanded={expanded} />
          {label && <span>{label}: </span>}
          <span className="text-[var(--text-tertiary)]">[{value.length}]</span>
        </button>
        {expanded &&
          value.map((item, i) => (
            <JsonNode key={i} value={item} depth={depth + 1} label={String(i)} />
          ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <div style={{ paddingLeft: depth * 16 }}>
          {label && <span className="text-[var(--text-secondary)]">{label}: </span>}
          <span className="text-[var(--text-tertiary)]">{"{}"}</span>
        </div>
      );
    }
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ChevronIcon expanded={expanded} />
          {label && <span>{label}: </span>}
          <span className="text-[var(--text-tertiary)]">{`{${entries.length}}`}</span>
        </button>
        {expanded &&
          entries.map(([k, v]) => (
            <JsonNode key={k} value={v} depth={depth + 1} label={k} />
          ))}
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      {label && <span className="text-[var(--text-secondary)]">{label}: </span>}
      <span>{String(value)}</span>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="currentColor"
      className={`transition-transform ${expanded ? "rotate-90" : ""}`}
    >
      <path d="M3 1l5 4-5 4V1z" />
    </svg>
  );
}
