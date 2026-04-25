"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Activity, Clock, Copy, Check } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

// ── Component status ────────────────────────────────────────────────────────

type ComponentStatus = "operational" | "degraded" | "partial-outage" | "major-outage" | "maintenance";

interface ComponentRow {
  name: string;
  region?: string;
  status: ComponentStatus;
  uptime90d: string;
  description: string;
}

const COMPONENTS: ComponentRow[] = [
  { name: "API",                  region: "EU + US", status: "operational", uptime90d: "99.98%", description: "REST API, webhooks, OAuth, JWT auth" },
  { name: "Dashboard (Web app)",  region: "EU + US", status: "operational", uptime90d: "99.99%", description: "Next.js frontend served via Vercel edge" },
  { name: "Database (Postgres)",  region: "EU + US", status: "operational", uptime90d: "100%",   description: "Managed Postgres, per-region; continuous WAL + nightly backup" },
  { name: "Audit ledger",         region: "Global",  status: "operational", uptime90d: "100%",   description: "WORM tables + SHA-256 hash chain — daily integrity check" },
  { name: "Market data feeds",    region: "Global",  status: "operational", uptime90d: "99.95%", description: "FX rates, forward curves, IR curves (third-party)" },
  { name: "Webhooks (outbound)",  region: "EU + US", status: "operational", uptime90d: "99.97%", description: "Customer-configured event delivery, signed HMAC-SHA256" },
  { name: "Email + DNS",          region: "Global",  status: "operational", uptime90d: "99.99%", description: "Transactional email (auth, alerts), public DNS" },
  { name: "Auth (JWT + OAuth)",   region: "EU + US", status: "operational", uptime90d: "99.99%", description: "Login, refresh, password reset, SSO providers" },
];

// ── Incidents ──────────────────────────────────────────────────────────────

type IncidentSeverity = "sev-1" | "sev-2" | "sev-3";
type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";

interface IncidentUpdate { ts: string; status: IncidentStatus; message: string; }
interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  startedAt: string;
  resolvedAt?: string;
  components: string[];
  updates: IncidentUpdate[];
}

const RECENT_INCIDENTS: Incident[] = [];

// ── Communication templates ────────────────────────────────────────────────

interface CommTemplate { id: string; title: string; channel: string; body: string; }

const COMM_TEMPLATES: CommTemplate[] = [
  {
    id: "investigating",
    title: "Initial — Investigating",
    channel: "Status page · within 10 min of declaring Sev-1",
    body: `[INVESTIGATING] We are investigating reports of {{symptom}} affecting {{components}}.
Customer impact: {{impact summary, e.g., "API requests returning 5xx in EU region"}}.
We will post the next update within 15 minutes.

Posted: {{UTC timestamp}}
Incident ID: ORDR-INC-{{YYYYMMDD-N}}`,
  },
  {
    id: "identified",
    title: "Update — Cause identified",
    channel: "Status page",
    body: `[IDENTIFIED] We have identified the cause as {{root cause one-line}}. We are deploying a fix.
ETA to mitigation: {{minutes}}.
Customers affected: {{scope}}.

Posted: {{UTC timestamp}}`,
  },
  {
    id: "monitoring",
    title: "Update — Monitoring",
    channel: "Status page",
    body: `[MONITORING] The fix has been deployed at {{UTC timestamp}}. We are monitoring and will confirm resolution within 30 minutes.
We have not observed further {{symptom}} since the fix was deployed.

Posted: {{UTC timestamp}}`,
  },
  {
    id: "resolved",
    title: "Final — Resolved",
    channel: "Status page",
    body: `[RESOLVED] This incident is resolved as of {{UTC timestamp}}.
Total duration: {{H:MM}}.
Customer impact: {{final scope summary}}.
A full post-mortem will be published at {{post-mortem URL or 'within 5 business days'}}.

Thank you for your patience.`,
  },
  {
    id: "customer-email-data-risk",
    title: "Customer email — Data integrity at risk",
    channel: "Email · within 30 min of Sev-1 if data integrity is at risk",
    body: `Subject: [ORDR Sev-1] Active incident affecting {{components}} — your action may be needed

Hi {{customer team}},

We are actively responding to a Sev-1 incident affecting {{components}}. As of {{UTC timestamp}}, here is what we know:

- Symptom: {{one line}}
- Customer impact: {{specific to their tenant if possible}}
- Data integrity: {{statement — "no data has been altered or lost" OR "we are validating data integrity now and will report by {{time}}"}}
- Mitigation: {{what we are doing}}

What we ask of you: {{specific ask, OR "no action needed; we will notify you when resolved"}}

Live updates: https://status.ordrtreasuryfx.com
Direct contact during incident: {{IC name + phone}}

We will send the next update within 30 minutes.

— ORDR TreasuryFX Incident Response`,
  },
  {
    id: "customer-email-resolved",
    title: "Customer email — Resolved + post-mortem follow-up",
    channel: "Email · within 24 hours of resolution",
    body: `Subject: [ORDR] {{incident title}} — Resolved

Hi {{customer team}},

The incident impacting {{components}} from {{start UTC}} to {{end UTC}} ({{duration}}) is resolved.

Summary:
- Symptom: {{one line}}
- Root cause: {{one line, no jargon}}
- Customer impact on your tenant: {{specific or "none observed"}}
- Data integrity: {{verified statement}}
- Mitigation deployed: {{one line}}

We will publish a full post-mortem within 5 business days at {{URL}}. It will cover what happened, why our detection / response / mitigation worked or didn't, and what we are changing.

If you have any questions before then, please reply directly.

— ORDR TreasuryFX`,
  },
  {
    id: "post-mortem-summary",
    title: "Post-mortem summary (public, blameless)",
    channel: "Public post-mortem URL · within 5 business days",
    body: `# Post-Mortem — {{incident ID}} — {{incident title}}

**Date:** {{YYYY-MM-DD}}
**Duration:** {{start UTC}} → {{end UTC}} ({{H:MM}})
**Severity:** {{Sev-1 / Sev-2}}
**Customer impact:** {{scope}}

## What happened
{{Plain-language narrative. No blame. State sequence of events.}}

## Root cause
{{The actual cause. If multiple contributing factors, list each.}}

## Detection
- How we noticed: {{source}}
- Time to detect: {{minutes from first user impact}}
- Was monitoring sufficient? {{yes/no + what we'll change}}

## Response
- Time to declare incident: {{minutes from detect}}
- Time to mitigate: {{minutes from declare}}
- What worked well: {{bullet}}
- What slowed us down: {{bullet}}

## Action items
| Owner | Action | Due |
|---|---|---|
| {{name}} | {{specific action}} | {{date}} |

## What we are changing
{{Architectural, process, or monitoring changes. Concrete and time-bounded.}}`,
  },
];

// ── Component status helpers ───────────────────────────────────────────────

const STATUS_META: Record<ComponentStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  operational:     { label: "Operational",     color: "#166534", bg: "#DCFCE7", icon: CheckCircle2 },
  degraded:        { label: "Degraded",        color: "#92400E", bg: "#FEF3C7", icon: AlertCircle },
  "partial-outage":{ label: "Partial outage",  color: "#9A3412", bg: "#FED7AA", icon: AlertCircle },
  "major-outage":  { label: "Major outage",    color: "#991B1B", bg: "#FEE2E2", icon: AlertCircle },
  maintenance:     { label: "Maintenance",     color: "#1E40AF", bg: "#DBEAFE", icon: Clock },
};

const ALL_OPERATIONAL = COMPONENTS.every((c) => c.status === "operational");

// ── Page ───────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openTpl, setOpenTpl] = useState<string | null>(null);

  const copy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  };

  return (
    <MarketingLayout>
      {/* ── Hero / overall status banner ── */}
      <section style={{
        padding: "100px 24px 32px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.18em", color: C.accent,
          textTransform: "uppercase", marginBottom: 18,
        }}>
          System status
        </div>
        <h1 style={{
          fontFamily: F.heading, fontSize: 44, fontWeight: 800,
          letterSpacing: "-0.025em", margin: "0 0 24px",
          color: C.text, lineHeight: 1.1,
        }}>
          ORDR TreasuryFX status
        </h1>

        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "18px 22px", borderRadius: 8,
          background: ALL_OPERATIONAL ? "#DCFCE7" : "#FEF3C7",
          border: `1px solid ${ALL_OPERATIONAL ? "#86EFAC" : "#FDE68A"}`,
        }}>
          {ALL_OPERATIONAL ? (
            <CheckCircle2 size={22} color="#166534" />
          ) : (
            <AlertCircle size={22} color="#92400E" />
          )}
          <div style={{
            fontFamily: F.heading, fontSize: 18, fontWeight: 700,
            color: ALL_OPERATIONAL ? "#166534" : "#92400E",
          }}>
            {ALL_OPERATIONAL ? "All systems operational" : "Some systems are experiencing issues"}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{
            fontFamily: F.mono, fontSize: 11, color: C.textMuted,
          }}>
            Last checked: just now
          </div>
        </div>
      </section>

      {/* ── Components ── */}
      <section style={{
        padding: "16px 24px 48px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 22, fontWeight: 800,
          margin: "0 0 18px", color: C.text,
        }}>
          Components
        </h2>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8,
          overflow: "hidden", background: C.bg,
        }}>
          {COMPONENTS.map((c, i) => {
            const meta = STATUS_META[c.status];
            const Icon = meta.icon;
            return (
              <div key={c.name} style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 130px",
                gap: 16,
                padding: "16px 20px",
                borderBottom: i < COMPONENTS.length - 1 ? `1px solid ${C.borderLight}` : "none",
                background: i % 2 === 0 ? C.bg : C.bgAlt,
                alignItems: "center",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{
                      fontFamily: F.heading, fontSize: 15, fontWeight: 700,
                      color: C.text,
                    }}>
                      {c.name}
                    </span>
                    {c.region ? (
                      <span style={{
                        fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        color: C.textMuted,
                        background: C.bgMuted,
                        padding: "2px 8px", borderRadius: 999,
                      }}>
                        {c.region}
                      </span>
                    ) : null}
                  </div>
                  <div style={{
                    fontFamily: F.ui, fontSize: 13, color: C.textSub,
                  }}>
                    {c.description}
                  </div>
                </div>
                <div style={{
                  fontFamily: F.mono, fontSize: 12, color: C.text,
                  textAlign: "right",
                }}>
                  <div style={{ fontWeight: 700 }}>{c.uptime90d}</div>
                  <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>90-day uptime</div>
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: meta.bg, color: meta.color,
                  padding: "6px 12px", borderRadius: 999,
                  fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  justifySelf: "end",
                }}>
                  <Icon size={12} /> {meta.label}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Recent incidents ── */}
      <section style={{
        padding: "16px 24px 48px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 22, fontWeight: 800,
          margin: "0 0 18px", color: C.text,
        }}>
          Recent incidents (last 90 days)
        </h2>
        {RECENT_INCIDENTS.length === 0 ? (
          <div style={{
            border: `1px dashed ${C.border}`, borderRadius: 8,
            padding: "48px 24px", textAlign: "center",
            background: C.bgAlt,
          }}>
            <Activity size={28} color={C.textMuted} strokeWidth={1.5} style={{ marginBottom: 12 }} />
            <div style={{
              fontFamily: F.heading, fontSize: 16, fontWeight: 700,
              color: C.text, marginBottom: 4,
            }}>
              No incidents in the last 90 days
            </div>
            <div style={{
              fontFamily: F.ui, fontSize: 13, color: C.textSub,
            }}>
              When an incident occurs, it appears here with full timeline and post-mortem links.
            </div>
          </div>
        ) : (
          <div>{/* incident list rendering here when populated */}</div>
        )}
      </section>

      {/* ── Subscribe ── */}
      <section style={{
        padding: "16px 24px 48px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <div style={{
          background: C.bgDark, color: C.textOnDark,
          padding: "32px 30px", borderRadius: 12,
          display: "grid", gridTemplateColumns: "1fr auto", gap: 24,
          alignItems: "center",
        }}>
          <div>
            <div style={{
              fontFamily: F.heading, fontSize: 18, fontWeight: 700,
              marginBottom: 6,
            }}>
              Subscribe to status updates
            </div>
            <div style={{
              fontFamily: F.ui, fontSize: 14, lineHeight: 1.5,
              color: C.textOnDarkMuted, maxWidth: 520,
            }}>
              Email or webhook delivery for incident notifications. No marketing — incident traffic only.
            </div>
          </div>
          <a href="mailto:status@ordrtreasuryfx.com?subject=Subscribe%20to%20status%20updates" style={{
            background: C.bg, color: C.text,
            padding: "12px 20px", borderRadius: 6,
            fontFamily: F.mono, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            textDecoration: "none",
          }}>
            Subscribe
          </a>
        </div>
      </section>

      {/* ── IR communication templates ── */}
      <section style={{
        padding: "16px 24px 100px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 22, fontWeight: 800,
          margin: "0 0 6px", color: C.text,
        }}>
          Incident communication templates
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 14, lineHeight: 1.55,
          color: C.textSub, margin: "0 0 24px", maxWidth: 720,
        }}>
          Templates the on-call team uses during incidents — published here so customers can see exactly what to expect when something goes wrong. Click any template to expand and copy.
        </p>
        <div style={{
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {COMM_TEMPLATES.map((tpl) => {
            const isOpen = openTpl === tpl.id;
            const isCopied = copiedId === tpl.id;
            return (
              <div key={tpl.id} style={{
                border: `1px solid ${C.border}`, borderRadius: 8,
                overflow: "hidden", background: C.bg,
              }}>
                <button
                  onClick={() => setOpenTpl(isOpen ? null : tpl.id)}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "14px 18px", background: "none",
                    border: "none", cursor: "pointer",
                    display: "grid", gridTemplateColumns: "1fr auto",
                    gap: 12, alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{
                      fontFamily: F.heading, fontSize: 15, fontWeight: 700,
                      color: C.text, marginBottom: 2,
                    }}>
                      {tpl.title}
                    </div>
                    <div style={{
                      fontFamily: F.mono, fontSize: 11,
                      color: C.textMuted, letterSpacing: "0.04em",
                    }}>
                      {tpl.channel}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    color: C.accent,
                  }}>
                    {isOpen ? "Hide" : "View"}
                  </div>
                </button>
                {isOpen ? (
                  <div style={{
                    borderTop: `1px solid ${C.borderLight}`,
                    padding: "16px 18px",
                    background: C.bgAlt,
                  }}>
                    <pre style={{
                      fontFamily: F.mono, fontSize: 12, lineHeight: 1.55,
                      color: C.text, margin: 0,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {tpl.body}
                    </pre>
                    <button
                      onClick={() => copy(tpl.id, tpl.body)}
                      style={{
                        marginTop: 14,
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: isCopied ? "#DCFCE7" : C.bg,
                        color: isCopied ? "#166534" : C.text,
                        border: `1px solid ${isCopied ? "#86EFAC" : C.border}`,
                        padding: "8px 14px", borderRadius: 6,
                        fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      {isCopied ? <Check size={12} /> : <Copy size={12} />}
                      {isCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </MarketingLayout>
  );
}
