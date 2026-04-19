"use client";
import { useState, useEffect, useCallback } from "react";
import { S, NotificationSettings, inputStyle, monoInputStyle } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";
import Field from "../shared/Field";
import SliderField from "../shared/SliderField";
import {
  listWebhookEndpoints,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  WebhookEndpoint,
  WebhookApiError,
} from "@/lib/api/webhookClient";
import { Plus, Trash2, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  s:     NotificationSettings;
  set:   (v: NotificationSettings) => void;
  token: string;
}

const TOGGLE_ITEMS = [
  { key: "alert_on_breach"     as const, label: "Hedge Ratio Breach",        desc: "Alert when actual hedge coverage deviates from policy target" },
  { key: "alert_on_engine_run" as const, label: "Engine Run Complete",        desc: "Alert when a hedge plan calculation finishes" },
  { key: "alert_on_staging"    as const, label: "Staging Requires Approval",  desc: "Alert when a staged artifact needs your authorization" },
];

const ALL_EVENTS = [
  "position.created",
  "calculation.completed",
  "proposal.approved",
  "proposal.rejected",
] as const;

type SupportedEvent = (typeof ALL_EVENTS)[number];

const EVENT_LABELS: Record<SupportedEvent, string> = {
  "position.created":       "Position Created",
  "calculation.completed":  "Calculation Completed",
  "proposal.approved":      "Proposal Approved",
  "proposal.rejected":      "Proposal Rejected",
};

const MAX_ENDPOINTS = 5;

// ── Webhook CRUD panel ────────────────────────────────────────────────────────
function WebhookPanel({ token }: { token: string }) {
  const [endpoints,   setEndpoints]   = useState<WebhookEndpoint[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const [formOpen,    setFormOpen]    = useState(false);
  const [formUrl,     setFormUrl]     = useState("");
  const [formDesc,    setFormDesc]    = useState("");
  const [formEvents,  setFormEvents]  = useState<Set<SupportedEvent>>(new Set(ALL_EVENTS));
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [newSecret,   setNewSecret]   = useState<string | null>(null);
  const [newId,       setNewId]       = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [copied,      setCopied]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const eps = await listWebhookEndpoints(token);
      setEndpoints(eps);
    } catch (e) {
      setFetchError(e instanceof WebhookApiError ? e.message : "Failed to load endpoints");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggleEvent = (ev: SupportedEvent) => {
    setFormEvents(prev => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev); else next.add(ev);
      return next;
    });
  };

  const handleCreate = async () => {
    setSubmitError(null);
    if (!formUrl.startsWith("https://")) {
      setSubmitError("URL must start with https://");
      return;
    }
    setSubmitting(true);
    try {
      const resp = await createWebhookEndpoint(token, {
        url: formUrl.trim(),
        description: formDesc.trim() || undefined,
        events: Array.from(formEvents),
      });
      setNewSecret(resp.secret);
      setNewId(resp.id);
      setFormOpen(false);
      setFormUrl("");
      setFormDesc("");
      setFormEvents(new Set(ALL_EVENTS));
      await load();
    } catch (e) {
      setSubmitError(e instanceof WebhookApiError ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteWebhookEndpoint(token, id);
      setEndpoints(prev => prev.filter(ep => ep.id !== id));
      if (newId === id) { setNewSecret(null); setNewId(null); }
    } catch { /* silently refresh */ await load(); }
    finally { setDeletingId(null); }
  };

  const copySecret = () => {
    if (!newSecret) return;
    navigator.clipboard.writeText(newSecret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const atMax = endpoints.length >= MAX_ENDPOINTS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Secret reveal banner */}
      {newSecret && (
        <div style={{
          background: "color-mix(in srgb, #22C55E 8%, transparent)",
          border: `1px solid #22C55E`,
          borderRadius: 3, padding: "12px 14px",
        }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: "#22C55E", marginBottom: 6, letterSpacing: "0.07em" }}>
            SIGNING SECRET — COPY NOW (shown once only)
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, background: S.bgDeep, padding: "4px 8px", borderRadius: 2, flex: 1, overflowX: "auto", wordBreak: "break-all" }}>
              {newSecret}
            </code>
            <button onClick={copySecret} style={{
              background: "transparent", border: `1px solid ${S.soft}`, borderRadius: 2,
              padding: "4px 8px", cursor: "pointer", color: copied ? "#22C55E" : S.secondary,
              display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
              fontFamily: S.fontMono, fontSize: 11,
            }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 6 }}>
            Use this secret to verify the <code style={{ fontFamily: S.fontMono }}>X-ORDR-Signature</code> header on incoming requests.
          </div>
          <button onClick={() => { setNewSecret(null); setNewId(null); }} style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 4, padding: 0,
          }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Endpoint list */}
      {loading ? (
        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, padding: "8px 0" }}>Loading…</div>
      ) : fetchError ? (
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.fail }}>{fetchError}</div>
      ) : endpoints.length === 0 ? (
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, padding: "8px 0" }}>
          No active endpoints. Add one below.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {endpoints.map(ep => (
            <div key={ep.id} style={{
              background: ep.id === newId ? "color-mix(in srgb, #22C55E 5%, transparent)" : S.bgSub,
              border: `1px solid ${ep.id === newId ? "#22C55E" : S.rim}`,
              borderRadius: 2, padding: "10px 14px",
              display: "flex", alignItems: "flex-start", gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, wordBreak: "break-all" }}>
                  {ep.url}
                </div>
                {ep.description && (
                  <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, marginTop: 2 }}>
                    {ep.description}
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {ep.events.map(ev => (
                    <span key={ev} style={{
                      fontFamily: S.fontMono, fontSize: 10, color: S.cyan,
                      background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
                      border: `1px solid ${S.cyan}`, borderRadius: 2, padding: "1px 6px",
                    }}>
                      {ev}
                    </span>
                  ))}
                </div>
                {ep.created_at && (
                  <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 4 }}>
                    Created {new Date(ep.created_at).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDelete(ep.id)}
                disabled={deletingId === ep.id}
                title="Delete endpoint"
                style={{
                  background: "transparent", border: `1px solid ${S.soft}`, borderRadius: 2,
                  padding: "4px 6px", cursor: "pointer", color: S.fail, flexShrink: 0,
                  opacity: deletingId === ep.id ? 0.5 : 1,
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Capacity bar */}
      {!loading && (
        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
          {endpoints.length}/{MAX_ENDPOINTS} endpoints active
        </div>
      )}

      {/* Add endpoint form */}
      {!atMax && (
        <div>
          <button
            onClick={() => { setFormOpen(p => !p); setSubmitError(null); }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: formOpen ? S.bgSub : "transparent",
              border: `1px solid ${formOpen ? S.soft : S.rim}`,
              borderRadius: 2, padding: "6px 12px", cursor: "pointer",
              fontFamily: S.fontMono, fontSize: 11, color: S.secondary,
              letterSpacing: "0.06em",
            }}
          >
            {formOpen ? <ChevronUp size={12} /> : <Plus size={12} />}
            {formOpen ? "CANCEL" : "ADD ENDPOINT"}
          </button>

          {formOpen && (
            <div style={{
              background: S.bgSub, border: `1px solid ${S.soft}`,
              borderRadius: 2, padding: "14px", marginTop: 8,
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              <Field label="ENDPOINT URL" hint="HTTPS required">
                <input
                  type="url"
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="https://hooks.yourapp.com/ordr"
                  style={monoInputStyle}
                />
              </Field>

              <Field label="DESCRIPTION" hint="optional — displayed in this list">
                <input
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="Production alerts"
                  style={inputStyle}
                />
              </Field>

              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 8 }}>
                  SUBSCRIBED EVENTS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {ALL_EVENTS.map(ev => (
                    <label key={ev} style={{
                      display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                      fontFamily: S.fontUI, fontSize: 12,
                      color: formEvents.has(ev) ? S.primary : S.secondary,
                    }}>
                      <input
                        type="checkbox"
                        checked={formEvents.has(ev)}
                        onChange={() => toggleEvent(ev)}
                        style={{ accentColor: S.cyan, flexShrink: 0 }}
                      />
                      <span style={{ fontFamily: S.fontMono, fontSize: 11 }}>{ev}</span>
                      <span style={{ color: S.tertiary, fontSize: 11 }}>{EVENT_LABELS[ev]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {submitError && (
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.fail }}>{submitError}</div>
              )}

              <button
                onClick={handleCreate}
                disabled={submitting || !formUrl}
                style={{
                  background: submitting || !formUrl ? S.bgSub : S.cyan,
                  border: `1px solid ${S.cyan}`,
                  borderRadius: 2, padding: "7px 16px",
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                  color: submitting || !formUrl ? S.tertiary : "#000",
                  cursor: submitting || !formUrl ? "not-allowed" : "pointer",
                  alignSelf: "flex-start", letterSpacing: "0.06em",
                }}
              >
                {submitting ? "REGISTERING…" : "REGISTER ENDPOINT"}
              </button>
            </div>
          )}
        </div>
      )}

      {atMax && !loading && (
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
          Maximum of {MAX_ENDPOINTS} endpoints reached. Delete one to add another.
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function NotificationsTab({ s, set, token }: Props) {
  const u = <K extends keyof NotificationSettings>(k: K) =>
    (v: NotificationSettings[K]) => set({ ...s, [k]: v });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <SectionHeader label="Alert Triggers" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {TOGGLE_ITEMS.map(item => (
            <label key={item.key} style={{
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
              background: s[item.key] ? `color-mix(in srgb, ${S.cyan} 5%, transparent)` : S.bgSub,
              border: `1px solid ${s[item.key] ? S.cyan : S.soft}`,
              borderRadius: 2, padding: "10px 14px",
            }}>
              <input type="checkbox" checked={s[item.key] as boolean}
                onChange={e => u(item.key)(e.target.checked as NotificationSettings[typeof item.key])}
                style={{ accentColor: S.cyan, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: s[item.key] ? S.primary : S.secondary }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>{item.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader label="Breach Threshold" />
        <SliderField label="HEDGE RATIO DRIFT THRESHOLD (%)" hint="notify if coverage drifts by more than this % from policy target"
          value={s.breach_threshold_pct} min={1} max={20} step={1}
          fmt={v => `${v}%`} onChange={v => u("breach_threshold_pct")(v as number)} />
      </div>

      <div>
        <SectionHeader label="Webhook Endpoints" />
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginBottom: 10 }}>
          Register HTTPS endpoints to receive signed JSON payloads for engine events.
          Up to {MAX_ENDPOINTS} active endpoints per tenant.
          Each endpoint receives an HMAC-SHA256 signing secret on creation.
        </div>
        <WebhookPanel token={token} />
      </div>

      <div>
        <SectionHeader label="Delivery Channels" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="EMAIL RECIPIENTS" hint="comma-separated list">
            <input value={s.email_recipients} onChange={e => u("email_recipients")(e.target.value)}
              placeholder="cfo@company.com, treasury@company.com" style={inputStyle} />
          </Field>
          <Field label="SIMPLE WEBHOOK URL" hint="HTTPS endpoint — alert notifications (JSON POST)">
            <input value={s.webhook_url} onChange={e => u("webhook_url")(e.target.value)}
              placeholder="https://hooks.yourapp.com/ordr" style={monoInputStyle} />
          </Field>
          <Field label="SLACK INCOMING WEBHOOK URL">
            <input value={s.slack_webhook_url} onChange={e => u("slack_webhook_url")(e.target.value)}
              placeholder="https://hooks.slack.com/services/…" style={monoInputStyle} />
          </Field>
        </div>
      </div>

      <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, padding: "12px 14px" }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 6 }}>
          WEBHOOK PAYLOAD SCHEMA
        </div>
        <pre style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, margin: 0, lineHeight: 1.6, overflowX: "auto" }}>
{`{
  "event":     "HEDGE_RATIO_BREACH",
  "severity":  "WARNING",
  "run_id":    "run_xxxx",
  "message":   "Confirmed hedge ratio 72% — below policy target 80%",
  "drift_pct": 8,
  "timestamp": "2026-02-23T14:32:00Z",
  "tenant_id": "ordr_default"
}`}
        </pre>
      </div>
    </div>
  );
}
