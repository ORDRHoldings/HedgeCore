"use client";

/**
 * WidgetCatalog.tsx
 * Right-side slide-in panel for adding/removing dashboard widgets.
 * Filters widgets by user's permissions.
 */

import { X, Plus, Check } from "lucide-react";
import { WIDGET_REGISTRY, type WidgetDef } from "@/lib/widgets/widgetRegistry";
import { useAuth } from "@/lib/authContext";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  bgDeep:    "var(--bg-deep)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

interface WidgetCatalogProps {
  open: boolean;
  onClose: () => void;
  activeWidgetIds: string[];
  onAdd: (widgetId: string) => void;
  onReset: () => void;
}

export default function WidgetCatalog({
  open,
  onClose,
  activeWidgetIds,
  onAdd,
  onReset,
}: WidgetCatalogProps) {
  const { user, hasPermission } = useAuth();

  const available = WIDGET_REGISTRY.filter((w) => {
    if (!w.requiredPermission) return true;
    return hasPermission(w.requiredPermission);
  });

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          background: "rgba(0,0,0,0.35)",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 340,
          zIndex: 1000,
          background: S.bgPanel,
          borderLeft: `1px solid ${S.rim}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: `1px solid ${S.rim}`,
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontFamily: S.fontUI,
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: S.primary,
              letterSpacing: "0.04em",
            }}>
              Widget Catalog
            </div>
            <div style={{
              fontFamily: S.fontMono,
              fontSize: "0.4375rem",
              color: S.tertiary,
              letterSpacing: "0.06em",
              marginTop: 2,
            }}>
              {available.length} AVAILABLE · {activeWidgetIds.length} ACTIVE
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${S.rim}`,
              color: S.tertiary,
              padding: "4px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Close catalog"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Widget list */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
          {available.length === 0 && (
            <div style={{
              fontFamily: S.fontMono,
              fontSize: "0.5625rem",
              color: S.tertiary,
              padding: "24px 0",
              textAlign: "center",
            }}>
              No widgets available for your role.
            </div>
          )}

          {available.map((widget) => {
            const isActive = activeWidgetIds.includes(widget.id);
            return (
              <div
                key={widget.id}
                style={{
                  marginBottom: 8,
                  padding: "12px 14px",
                  background: S.bgSub,
                  border: `1px solid ${isActive ? S.cyan : S.rim}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: S.fontUI,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: S.primary,
                      letterSpacing: "0.01em",
                    }}>
                      {widget.title}
                    </div>
                    {widget.requiredPermission && (
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: "0.4375rem",
                        color: S.tertiary,
                        letterSpacing: "0.05em",
                        marginTop: 2,
                      }}>
                        {widget.requiredPermission}
                      </div>
                    )}
                  </div>

                  {isActive ? (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontFamily: S.fontMono,
                      fontSize: "0.4375rem",
                      color: S.cyan,
                      border: `1px solid ${S.cyan}`,
                      padding: "2px 7px",
                      flexShrink: 0,
                    }}>
                      <Check size={10} strokeWidth={2} />
                      ON GRID
                    </div>
                  ) : (
                    <button
                      onClick={() => onAdd(widget.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontFamily: S.fontMono,
                        fontSize: "0.4375rem",
                        color: S.cyan,
                        background: "transparent",
                        border: `1px solid ${S.cyan}`,
                        padding: "3px 8px",
                        cursor: "pointer",
                        flexShrink: 0,
                        letterSpacing: "0.04em",
                      }}
                    >
                      <Plus size={10} strokeWidth={2} />
                      ADD
                    </button>
                  )}
                </div>

                <div style={{
                  fontFamily: S.fontUI,
                  fontSize: "0.5625rem",
                  color: S.secondary,
                  lineHeight: 1.5,
                }}>
                  {widget.description}
                </div>

                <div style={{
                  display: "flex",
                  gap: 8,
                  fontFamily: S.fontMono,
                  fontSize: "0.375rem",
                  color: S.tertiary,
                  letterSpacing: "0.04em",
                }}>
                  <span>DEFAULT {widget.defaultW}×{widget.defaultH}</span>
                  <span style={{ color: S.soft }}>·</span>
                  <span>MIN {widget.minW}×{widget.minH}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Reset */}
        <div style={{
          padding: "12px 16px",
          borderTop: `1px solid ${S.rim}`,
          flexShrink: 0,
        }}>
          <button
            onClick={() => { onReset(); onClose(); }}
            style={{
              width: "100%",
              padding: "9px 16px",
              fontFamily: S.fontMono,
              fontSize: "0.5625rem",
              letterSpacing: "0.06em",
              color: S.secondary,
              background: "transparent",
              border: `1px solid ${S.rim}`,
              cursor: "pointer",
              textTransform: "uppercase" as const,
            }}
          >
            Reset to Role Default
          </button>
          <div style={{
            marginTop: 8,
            fontFamily: S.fontMono,
            fontSize: "0.375rem",
            color: S.tertiary,
            textAlign: "center",
            letterSpacing: "0.04em",
          }}>
            Resets layout to your role's default widget set
          </div>
        </div>
      </div>
    </>
  );
}
