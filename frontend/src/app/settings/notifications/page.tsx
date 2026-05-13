"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Trash2, Send, Plus } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/authContext";
import {
  listWebhooks,
  registerWebhook,
  deleteWebhook,
  testWebhook,
  WebhookEndpoint,
} from "@/lib/api/webhookClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  accent: "var(--accent-blue)",
  danger: "var(--status-fail)",
  success: "var(--status-pass)",
  text: "var(--text-primary)",
  textMuted: "var(--text-secondary)",
  disabled: "var(--text-disabled)",
  inverse: "var(--bg-deep)",
  slack: "color-mix(in srgb, var(--accent-red) 50%, var(--accent-indigo))",
  teams: "var(--accent-indigo)",
} as const;

const ALL_EVENTS = [
  "position.created",
  "calculation.completed",
  "proposal.approved",
  "proposal.rejected",
  "hedge_run.completed",
  "journal_entry.posted",
  "erp_post.failed",
];

const CHANNEL_LABELS: Record<string, { label: string; color: string }> = {
  slack: { label: "Slack", color: S.slack },
  teams: { label: "Teams", color: S.teams },
  generic: { label: "Generic", color: S.bgSub },
};

function NotificationsPageInner() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Form state
  const [channelType, setChannelType] = useState<"slack" | "teams" | "generic">("slack");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState("");

  // Test state
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !token) return;
    if (!["professional", "enterprise", "intelligence"].includes(user.plan_tier)) {
      router.replace("/upgrade");
      return;
    }
    listWebhooks(token)
      .then(setEndpoints)
      .catch(() => showToast("Failed to load channels", false))
      .finally(() => setLoading(false));
  }, [user, token, router]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleEvent(ev: string) {
    setSelectedEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  }

  async function handleSave() {
    if (!token) return;
    if (!url.startsWith("https://")) {
      setUrlError("URL must start with https://");
      return;
    }
    setUrlError("");
    setSaving(true);
    try {
      const created = await registerWebhook(token, {
        url,
        events: selectedEvents,
        channel_type: channelType,
      });
      setEndpoints((prev) => [...prev, created]);
      setUrl("");
      setSelectedEvents([]);
      showToast("Channel saved. Secret shown once — copy it now.", true);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "Save failed";
      if (detail.includes("Maximum") || detail.includes("maximum")) {
        showToast("Limit reached (5 active channels)", false);
      } else {
        showToast(detail, false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    try {
      await deleteWebhook(token, id);
      setEndpoints((prev) => prev.filter((ep) => ep.id !== id));
      showToast("Channel removed", true);
    } catch {
      showToast("Delete failed", false);
    }
  }

  async function handleTest(id: string) {
    if (!token) return;
    setTesting(id);
    try {
      const result = await testWebhook(token, id);
      if (result.success) {
        showToast("Test ping delivered successfully", true);
      } else {
        showToast(`Test failed: ${result.error ?? `HTTP ${result.status_code}`}`, false);
      }
    } catch {
      showToast("Test request failed", false);
    } finally {
      setTesting(null);
    }
  }

  return (
    <PageShell icon={Bell} title="NOTIFICATIONS" breadcrumb={["Settings", "Notifications"]}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 9999,
            background: toast.ok ? S.success : S.danger,
            color: S.inverse,
            padding: "10px 18px",
            borderRadius: 6,
            fontFamily: S.fontUI,
            fontSize: 13,
          }}
        >
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 820, padding: "24px 0", display: "flex", flexDirection: "column", gap: 32 }}>

        {/* Add channel form */}
        <section
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 8,
            padding: 24,
          }}
        >
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textMuted, marginBottom: 16, letterSpacing: 1 }}>
            ADD CHANNEL
          </div>

          {/* Channel type toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["slack", "teams", "generic"] as const).map((ct) => (
              <button
                key={ct}
                onClick={() => setChannelType(ct)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: channelType === ct ? "none" : `1px solid ${S.rim}`,
                  background: channelType === ct ? (CHANNEL_LABELS[ct].color) : "transparent",
                  color: channelType === ct ? S.inverse : S.textMuted,
                  fontFamily: S.fontUI,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {CHANNEL_LABELS[ct].label}
              </button>
            ))}
          </div>

          {/* URL input */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
              placeholder={
                channelType === "slack"
                  ? "https://hooks.slack.com/services/..."
                  : channelType === "teams"
                  ? "https://your-org.webhook.office.com/..."
                  : "https://example.com/webhook"
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                background: S.bgDeep,
                border: `1px solid ${urlError ? S.danger : S.rim}`,
                borderRadius: 4,
                color: S.text,
                fontFamily: S.fontMono,
                fontSize: 12,
                boxSizing: "border-box",
              }}
            />
            {urlError && (
              <div style={{ color: S.danger, fontSize: 11, marginTop: 4, fontFamily: S.fontUI }}>
                {urlError}
              </div>
            )}
          </div>

          {/* Events multiselect */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textMuted, marginBottom: 8 }}>
              EVENTS (leave empty to subscribe to all)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ALL_EVENTS.map((ev) => (
                <label
                  key={ev}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: selectedEvents.includes(ev) ? S.text : S.textMuted,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    style={{ accentColor: S.accent }}
                  />
                  {ev}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !url}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 20px",
              background: saving || !url ? S.disabled : S.accent,
              color: S.inverse,
              border: "none",
              borderRadius: 4,
              fontFamily: S.fontUI,
              fontSize: 13,
              cursor: saving || !url ? "not-allowed" : "pointer",
            }}
          >
            <Plus size={14} />
            {saving ? "Saving..." : "Save Channel"}
          </button>
        </section>

        {/* Active channels list */}
        <section>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textMuted, marginBottom: 12, letterSpacing: 1 }}>
            ACTIVE CHANNELS ({endpoints.length} / 5)
          </div>

          {loading ? (
            <div style={{ color: S.textMuted, fontFamily: S.fontUI, fontSize: 13 }}>Loading...</div>
          ) : endpoints.length === 0 ? (
            <div style={{ color: S.textMuted, fontFamily: S.fontUI, fontSize: 13 }}>
              No channels configured. Add one above.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "6px 12px" }}>TYPE</th>
                  <th style={{ padding: "6px 12px" }}>URL</th>
                  <th style={{ padding: "6px 12px" }}>EVENTS</th>
                  <th style={{ padding: "6px 12px" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => (
                  <tr
                    key={ep.id}
                    style={{
                      background: S.bgPanel,
                      borderBottom: `1px solid ${S.rim}`,
                    }}
                  >
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          background: CHANNEL_LABELS[ep.channel_type]?.color ?? S.bgSub,
                          color: S.inverse,
                          padding: "2px 8px",
                          borderRadius: 3,
                          fontFamily: S.fontMono,
                          fontSize: 10,
                        }}
                      >
                        {CHANNEL_LABELS[ep.channel_type]?.label ?? ep.channel_type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 11, color: S.text }}>
                      {ep.url.length > 48 ? ep.url.slice(0, 45) + "…" : ep.url}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: S.fontUI, fontSize: 12, color: S.textMuted }}>
                      {ep.events.length === 0 ? "all" : `${ep.events.length} event${ep.events.length !== 1 ? "s" : ""}`}
                    </td>
                    <td style={{ padding: "10px 12px", display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleTest(ep.id)}
                        disabled={testing === ep.id}
                        title="Send test ping"
                        style={{
                          background: "transparent",
                          border: `1px solid ${S.rim}`,
                          borderRadius: 4,
                          color: S.textMuted,
                          padding: "4px 10px",
                          cursor: testing === ep.id ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontFamily: S.fontUI,
                        }}
                      >
                        <Send size={11} />
                        {testing === ep.id ? "Testing…" : "Test"}
                      </button>
                      <button
                        onClick={() => handleDelete(ep.id)}
                        title="Remove channel"
                        style={{
                          background: "transparent",
                          border: `1px solid ${S.rim}`,
                          borderRadius: 4,
                          color: S.danger,
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </PageShell>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense>
      <NotificationsPageInner />
    </Suspense>
  );
}
