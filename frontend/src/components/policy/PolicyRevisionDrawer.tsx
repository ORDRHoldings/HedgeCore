"use client";

/**
 * PolicyRevisionDrawer — LOG-POLICY-1
 *
 * Slide-in drawer showing the full audit history for a policy template.
 * Wires to GET /v1/policies/templates/{id}/history
 *
 * Integrity feature: "Verify Hash Chain" button calls GET /v1/audit/chain/verify
 * and renders a PASS/FAIL badge so auditors can confirm the WORM chain is intact.
 *
 * Usage:
 *   <PolicyRevisionDrawer templateId={id} templateName={name} token={token} onClose={() => setOpen(false)} />
 */

import { useState, useEffect, useCallback } from "react";
import { X, Clock, ChevronRight, CheckCircle, Trash2, Settings, Zap, ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import axios from "axios";

// ── Design tokens ──────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub,var(--bg-panel))",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan,#22d3ee)",
  amber:    "var(--accent-amber,#fbbf24)",
  green:    "var(--status-pass,#34d399)",
  red:      "var(--accent-red,#f87171)",
} as const;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PolicyAuditEvent {
  id: string;
  event_type: string;       // "POLICY"
  description: string;
  payload: Record<string, unknown>;
  actor_email: string | null;
  created_at: string;
}

interface ChainIntegrityReport {
  is_intact: boolean;
  broken_at: string | null;
  events_checked: number;
  verified_at: string;
  tenant_id: string | null;
}

type VerifyState = "idle" | "verifying" | "pass" | "fail" | "error";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getApiKey(): string {
  if (process.env.NEXT_PUBLIC_HEDGECALC_API_KEY) return process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
  // DEV-KEY-1: localStorage only in development
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    const stored = localStorage.getItem("hc_api_key");
    if (stored) return stored;
  }
  return "";
}

function authHeaders(token?: string): Record<string, string> {
  // DEV-KEY-1: Omit X-API-Key header when key is empty
  const headers: Record<string, string> = {};
  const apiKey = getApiKey();
  if (apiKey) headers["X-API-Key"] = apiKey;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function fetchTemplateHistory(templateId: string, token?: string): Promise<PolicyAuditEvent[]> {
  const { data } = await axios.get(
    `${BASE}/v1/policies/templates/${templateId}/history`,
    { headers: authHeaders(token) },
  );
  return data as PolicyAuditEvent[];
}

async function fetchChainVerify(token?: string): Promise<ChainIntegrityReport> {
  const { data } = await axios.get(
    `${BASE}/v1/audit/chain/verify`,
    { headers: authHeaders(token) },
  );
  return data as ChainIntegrityReport;
}

// ── Event row ──────────────────────────────────────────────────────────────────

function actionIcon(description: string) {
  const d = description.toLowerCase();
  if (d.includes("creat")) return <Settings size={11} color={S.cyan} />;
  if (d.includes("activ")) return <Zap size={11} color={S.green} />;
  if (d.includes("updat")) return <CheckCircle size={11} color={S.amber} />;
  if (d.includes("delet")) return <Trash2 size={11} color={S.red} />;
  return <ChevronRight size={11} color={S.tertiary} />;
}

function actionColor(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("creat")) return S.cyan;
  if (d.includes("activ")) return S.green;
  if (d.includes("updat")) return S.amber;
  if (d.includes("delet")) return S.red;
  return S.tertiary;
}

interface EventRowProps {
  event: PolicyAuditEvent;
  isLast: boolean;
}

function EventRow({ event, isLast }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasPayload = Object.keys(event.payload ?? {}).length > 0;
  const color = actionColor(event.description);

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${S.rim}`, padding: "8px 0" }}>
      <div
        onClick={() => hasPayload && setExpanded(prev => !prev)}
        style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          cursor: hasPayload ? "pointer" : "default",
        }}
      >
        {/* Timeline dot */}
        <div style={{
          width: 20, height: 20, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid color-mix(in srgb, ${color} 25%, ${S.rim})`,
          background: `color-mix(in srgb, ${color} 8%, ${S.bgPanel})`,
        }}>
          {actionIcon(event.description)}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: S.fontUI, fontSize: "0.75rem", color: S.primary,
            fontWeight: 500, lineHeight: 1.3,
          }}>
            {event.description}
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 2,
          }}>
            {event.actor_email && (
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.04em" }}>
                {event.actor_email}
              </span>
            )}
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.04em" }}>
              {new Date(event.created_at).toLocaleString("en-GB", {
                day: "2-digit", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit", second: "2-digit",
                timeZoneName: "short",
              })}
            </span>
            {hasPayload && (
              <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.04em" }}>
                {expanded ? "▲ HIDE" : "▼ DETAILS"}
              </span>
            )}
          </div>
        </div>

        {/* Event ID chip */}
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.04em",
          color: S.tertiary, flexShrink: 0, paddingTop: 2,
        }}>
          {event.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Expandable payload */}
      {expanded && hasPayload && (
        <div style={{
          marginTop: 6, marginLeft: 28,
          background: S.bgDeep, border: `1px solid ${S.soft}`,
          padding: "8px 10px",
          fontFamily: S.fontMono, fontSize: "0.5rem", color: S.secondary, letterSpacing: "0.03em",
          whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {JSON.stringify(event.payload, null, 2)}
        </div>
      )}
    </div>
  );
}

// ── Verify badge ────────────────────────────────────────────────────────────────

interface VerifyBadgeProps {
  state: VerifyState;
  detail: { events_checked?: number; broken_at?: string | null; error?: string } | null;
}

function VerifyBadge({ state, detail }: VerifyBadgeProps) {
  if (state === "idle") return null;
  if (state === "verifying") return (
    <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.cyan, letterSpacing: "0.06em" }}>
      VERIFYING…
    </span>
  );
  if (state === "pass") return (
    <span
      data-testid="chain-verify-pass"
      style={{
        fontFamily: S.fontMono, fontSize: "0.5rem", color: S.green,
        letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4,
      }}
    >
      <ShieldCheck size={11} color={S.green} />
      CHAIN INTACT — {detail?.events_checked ?? "?"} EVENTS VERIFIED
    </span>
  );
  if (state === "fail") return (
    <span
      data-testid="chain-verify-fail"
      style={{
        fontFamily: S.fontMono, fontSize: "0.5rem", color: S.red,
        letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4,
      }}
    >
      <ShieldAlert size={11} color={S.red} />
      CHAIN BROKEN AT {detail?.broken_at ? detail.broken_at.slice(0, 8).toUpperCase() : "UNKNOWN"}
    </span>
  );
  // error
  return (
    <span
      data-testid="chain-verify-error"
      style={{
        fontFamily: S.fontMono, fontSize: "0.5rem", color: S.amber,
        letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4,
      }}
    >
      <Shield size={11} color={S.amber} />
      ⚠ {detail?.error ?? "VERIFICATION FAILED"}
    </span>
  );
}

// ── Main drawer ────────────────────────────────────────────────────────────────

interface PolicyRevisionDrawerProps {
  templateId:   string;
  templateName: string;
  templateCode: string;
  token?:       string;
  onClose:      () => void;
}

export default function PolicyRevisionDrawer({
  templateId, templateName, templateCode, token, onClose,
}: PolicyRevisionDrawerProps) {
  const [events, setEvents]     = useState<PolicyAuditEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Verify hash chain state
  const [verifyState, setVerifyState]   = useState<VerifyState>("idle");
  const [verifyDetail, setVerifyDetail] = useState<{ events_checked?: number; broken_at?: string | null; error?: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchTemplateHistory(templateId, token)
      .then(evts => { setEvents(evts); setLoading(false); })
      .catch((e: unknown) => {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(detail ?? (e instanceof Error ? e.message : "Failed to load history"));
        setLoading(false);
      });
  }, [templateId, token]);

  useEffect(() => { load(); }, [load]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleVerify = useCallback(() => {
    setVerifyState("verifying");
    setVerifyDetail(null);
    fetchChainVerify(token)
      .then(report => {
        if (report.is_intact) {
          setVerifyState("pass");
          setVerifyDetail({ events_checked: report.events_checked });
        } else {
          setVerifyState("fail");
          setVerifyDetail({ broken_at: report.broken_at });
        }
      })
      .catch((e: unknown) => {
        const status = (e as { response?: { status?: number } })?.response?.status;
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        const errMsg =
          status === 401 ? "Authentication required to verify chain" :
          status === 403 ? "Insufficient permissions to verify chain" :
          detail ?? (e instanceof Error ? e.message : "Verification request failed");
        setVerifyState("error");
        setVerifyDetail({ error: errMsg });
      });
  }, [token]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.45)",
        }}
      />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
        width: "min(520px, 96vw)",
        background: S.bgPanel,
        borderLeft: `1px solid ${S.rim}`,
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 32px rgba(0,0,0,0.25)",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px", borderBottom: `1px solid ${S.rim}`,
          background: S.bgSub,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <Clock size={14} color={S.amber} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.amber, letterSpacing: "0.1em", fontWeight: 700 }}>
              AUDIT HISTORY
            </div>
            <div style={{
              fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {templateName}
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.05em" }}>
              {templateCode} · {templateId.slice(0, 8).toUpperCase()}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: "none", border: `1px solid ${S.rim}`, cursor: "pointer",
              color: S.tertiary, padding: "4px 8px", display: "flex", alignItems: "center",
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {loading && (
            <div style={{
              fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.cyan,
              letterSpacing: "0.08em", padding: "20px 0",
            }}>
              LOADING AUDIT TRAIL…
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                padding: "8px 12px",
                border: `1px solid color-mix(in srgb, ${S.amber} 40%, ${S.rim})`,
                background: `color-mix(in srgb, ${S.amber} 6%, ${S.bgPanel})`,
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.amber, flex: 1 }}>
                ⚠ {error}
              </span>
              <button
                type="button"
                onClick={load}
                style={{
                  fontFamily: S.fontMono, fontSize: "0.5rem", letterSpacing: "0.06em",
                  padding: "2px 8px", border: `1px solid ${S.amber}`,
                  color: S.amber, background: "transparent", cursor: "pointer",
                }}
              >
                RETRY
              </button>
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div style={{
              fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
              letterSpacing: "0.06em", padding: "20px 0",
            }}>
              NO AUDIT EVENTS FOUND FOR THIS TEMPLATE
            </div>
          )}

          {!loading && events.length > 0 && (
            <div>
              {/* Summary bar */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                padding: "4px 10px",
                border: `1px solid color-mix(in srgb, ${S.cyan} 20%, ${S.rim})`,
                background: `color-mix(in srgb, ${S.cyan} 4%, ${S.bgPanel})`,
              }}>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.cyan, letterSpacing: "0.08em" }}>
                  {events.length} EVENT{events.length !== 1 ? "S" : ""} · MOST RECENT FIRST · CLICK ROW FOR PAYLOAD
                </span>
              </div>

              {events.map((evt, i) => (
                <EventRow key={evt.id} event={evt} isLast={i === events.length - 1} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "8px 16px", borderTop: `1px solid ${S.rim}`,
          background: S.bgSub, flexShrink: 0,
        }}>
          {/* Verify hash chain row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginBottom: 8,
            paddingBottom: 8,
            borderBottom: `1px solid ${S.rim}`,
          }}>
            <button
              type="button"
              data-testid="verify-chain-btn"
              onClick={handleVerify}
              disabled={verifyState === "verifying"}
              style={{
                fontFamily: S.fontMono, fontSize: "0.5rem", letterSpacing: "0.06em",
                padding: "3px 10px",
                border: `1px solid ${verifyState === "pass" ? S.green : verifyState === "fail" ? S.red : S.rim}`,
                color: verifyState === "pass" ? S.green : verifyState === "fail" ? S.red : S.secondary,
                background: "transparent",
                cursor: verifyState === "verifying" ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 5,
                opacity: verifyState === "verifying" ? 0.6 : 1,
              }}
            >
              <ShieldCheck size={10} />
              VERIFY HASH CHAIN
            </button>
            <VerifyBadge state={verifyState} detail={verifyDetail} />
          </div>

          {/* Bottom row: worm label + close */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.05em" }}>
              WORM-PROTECTED · HASH-CHAINED · TAMPER-EVIDENT
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{
                fontFamily: S.fontMono, fontSize: "0.5rem", letterSpacing: "0.06em",
                padding: "3px 12px", border: `1px solid ${S.rim}`,
                color: S.tertiary, background: "transparent", cursor: "pointer",
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
