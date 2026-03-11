"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { generateDiagnosticsBundle } from "@/lib/support/diagnostics";

import { PageShell } from "@/components/layout/PageShell";
import { HelpCircle } from "lucide-react";

// ── Style constants ────────────────────────────────────────────────────────────
const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass,#4ade80)",
  fail:      "var(--accent-red,#f87171)",
} as const;

// ── Severity options ───────────────────────────────────────────────────────────
const SEVERITIES = [
  { value: "S0", label: "S0 — CRITICAL",     description: "System unavailable, data integrity risk",          color: "#f87171" },
  { value: "S1", label: "S1 — HIGH",          description: "Core calculation broken, blocking production",     color: "#f59e0b" },
  { value: "S2", label: "S2 — MEDIUM",        description: "Feature impaired, workaround available",          color: "#22d3ee" },
  { value: "S3", label: "S3 — LOW",           description: "Non-blocking issue, question",                    color: "var(--text-secondary)" },
  { value: "S4", label: "S4 — ENHANCEMENT",   description: "Feature request or documentation feedback",       color: "var(--text-secondary)" },
] as const;

type Severity = typeof SEVERITIES[number]["value"];

const CATEGORIES = [
  { value: "access",      label: "Access & Permissions" },
  { value: "calculation", label: "Calculation & Engine" },
  { value: "data",        label: "Data & Market Rates" },
  { value: "platform",    label: "Platform & UI" },
  { value: "other",       label: "Other" },
] as const;

const SLA: Array<{ severity: string; response: string }> = [
  { severity: "S0 CRITICAL",   response: "1 hour" },
  { severity: "S1 HIGH",       response: "4 hours" },
  { severity: "S2 MEDIUM",     response: "1 business day" },
  { severity: "S3 LOW",        response: "3 business days" },
  { severity: "S4 ENHANCEMENT",response: "Reviewed quarterly" },
];

// ── Field styles ───────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: S.fontUI,
  fontSize: 13,
  color: S.primary,
  background: S.bgSub,
  border: `1px solid ${S.rim}`,
  borderRadius: 4,
  padding: "9px 12px",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: S.fontMono,
  fontSize: 12,
  color: S.tertiary,
  letterSpacing: "0.08em",
  marginBottom: 6,
  textTransform: "uppercase",
};

// ── Main inner component ───────────────────────────────────────────────────────
function ContactPageInner() {
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill subject from URL if present
  const preSubject = searchParams.get("subject") ?? "";

  const [subject, setSubject] = useState(preSubject);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("S3");
  const [category, setCategory] = useState("platform");
  const [attachDiag, setAttachDiag] = useState(false);
  const [diagStatus, setDiagStatus] = useState<"idle" | "generating" | "ready" | "failed">("idle");
  const [diagSizeKb, setDiagSizeKb] = useState<number | null>(null);
  const [diagBundle, setDiagBundle] = useState<object | null>(null);

  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [ticketRef, setTicketRef] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Generate diagnostics bundle when checkbox is ticked
  useEffect(() => {
    if (!attachDiag) {
      setDiagStatus("idle");
      setDiagBundle(null);
      setDiagSizeKb(null);
      return;
    }
    setDiagStatus("generating");
    generateDiagnosticsBundle({
      consent: true,
      tenantId: user?.company?.id ?? null,
      userId: user?.id ?? null,
      roles: user?.roles ?? [],
      branchCode: user?.branch?.code ?? null,
      platformVersion: "v2.0.0",
    })
      .then((bundle) => {
        const json = JSON.stringify(bundle);
        setDiagBundle(bundle);
        setDiagSizeKb(Math.ceil(json.length / 1024));
        setDiagStatus("ready");
      })
      .catch(() => {
        setDiagStatus("failed");
      });
  }, [attachDiag, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setSubmitStatus("submitting");
    setErrorMsg(null);

    const payload: Record<string, unknown> = {
      subject,
      description,
      severity,
      category,
    };
    if (attachDiag && diagBundle) {
      payload.diagnostics_bundle = diagBundle;
    }

    try {
      const res = await dashboardFetch("/v1/support/tickets", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTicketRef((data as Record<string, string>).ticket_ref ?? (data as Record<string, string>).ref ?? (data as Record<string, string>).id ?? "TKT-0000");
      setSubmitStatus("success");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Submission failed. Check your connection and try again.");
      setSubmitStatus("error");
    }
  };

  const isValid = subject.trim().length > 0 && description.trim().length >= 50;

  return (
    
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <button
            onClick={() => router.push("/help")}
            style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: "0.05em" }}
          >
            DOCUMENTATION
          </button>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>›</span>
          <button
            onClick={() => router.push("/help/support")}
            style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: "0.05em" }}
          >
            SUPPORT CENTER
          </button>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>›</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, letterSpacing: "0.05em" }}>
            OPEN TICKET
          </span>
        </div>

        {/* 2-col layout */}
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

          {/* LEFT: Form */}
          <div style={{ flex: "1 1 480px", minWidth: 320, maxWidth: 720 }}>
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              {/* Form header */}
              <div style={{ padding: "20px 24px", borderBottom: `1px solid ${S.soft}` }}>
                <h1
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: S.primary,
                    textTransform: "uppercase",
                    margin: "0 0 6px 0",
                  }}
                >
                  OPEN A SUPPORT TICKET
                </h1>
                <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, margin: 0, lineHeight: 1.5 }}>
                  Describe your issue. Our team responds within the SLA shown based on severity.
                </p>
              </div>

              {/* Success state */}
              {submitStatus === "success" ? (
                <div style={{ padding: "40px 24px", textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 13,
                      color: S.pass,
                      marginBottom: 12,
                      letterSpacing: "0.06em",
                    }}
                  >
                    TICKET SUBMITTED
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 20,
                      fontWeight: 700,
                      color: S.primary,
                      marginBottom: 16,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {ticketRef}
                  </div>
                  <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginBottom: 24 }}>
                    Your ticket has been submitted. Check My Tickets in the Support Center for status updates.
                  </p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <button
                      onClick={() => router.push("/help/support#my-tickets")}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: S.cyan,
                        background: "transparent",
                        border: `1px solid ${S.cyan}`,
                        borderRadius: 4,
                        padding: "7px 16px",
                        cursor: "pointer",
                        textTransform: "uppercase",
                      }}
                    >
                      VIEW MY TICKETS
                    </button>
                    <button
                      onClick={() => {
                        setSubmitStatus("idle");
                        setSubject("");
                        setDescription("");
                        setSeverity("S3");
                        setCategory("platform");
                        setAttachDiag(false);
                        setTicketRef(null);
                      }}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: S.secondary,
                        background: "transparent",
                        border: `1px solid ${S.soft}`,
                        borderRadius: 4,
                        padding: "7px 16px",
                        cursor: "pointer",
                        textTransform: "uppercase",
                      }}
                    >
                      NEW TICKET
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ padding: "24px" }}>

                  {/* Subject */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Subject *</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      maxLength={255}
                      required
                      placeholder="Brief description of the issue"
                      style={inputStyle}
                    />
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Description * (min 50 characters)</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={6}
                      required
                      placeholder="Provide a detailed description. Include steps to reproduce, expected vs actual behavior, and any error messages."
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
                    />
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: description.length >= 50 ? S.pass : S.tertiary,
                        marginTop: 4,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {description.length} / 50 min characters
                    </div>
                  </div>

                  {/* Severity */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Severity *</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {SEVERITIES.map((sev) => {
                        const selected = severity === sev.value;
                        const borderColor = selected
                          ? sev.value === "S0" ? S.fail
                          : sev.value === "S1" ? S.amber
                          : sev.value === "S2" ? S.cyan
                          : S.rim
                          : S.soft;
                        return (
                          <label
                            key={sev.value}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "10px 14px",
                              border: `1px solid ${borderColor}`,
                              borderRadius: 4,
                              cursor: "pointer",
                              background: selected ? S.bgSub : "transparent",
                              transition: "border-color 0.15s, background 0.15s",
                            }}
                          >
                            <input
                              type="radio"
                              name="severity"
                              value={sev.value}
                              checked={selected}
                              onChange={() => setSeverity(sev.value)}
                              style={{ accentColor: sev.color, flexShrink: 0 }}
                            />
                            <div>
                              <div
                                style={{
                                  fontFamily: S.fontMono,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: selected ? sev.color : S.secondary,
                                  letterSpacing: "0.06em",
                                  marginBottom: 2,
                                }}
                              >
                                {sev.label}
                              </div>
                              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
                                {sev.description}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={labelStyle}>Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Diagnostics bundle */}
                  <div
                    style={{
                      marginBottom: 24,
                      padding: "14px",
                      background: S.bgSub,
                      border: `1px solid ${S.soft}`,
                      borderRadius: 4,
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={attachDiag}
                        onChange={(e) => setAttachDiag(e.target.checked)}
                        style={{ marginTop: 2, accentColor: S.cyan, flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginBottom: 4 }}>
                          Attach system diagnostics bundle to this ticket (recommended)
                        </div>
                        {attachDiag && (
                          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.5, marginTop: 6 }}>
                            Bundle includes: platform version, backend health, last 10 API calls metadata, last 5 UI errors. No tokens, passwords, or request payloads are included.
                          </div>
                        )}
                      </div>
                    </label>
                    {attachDiag && (
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: `1px solid ${S.soft}`,
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          letterSpacing: "0.06em",
                          color:
                            diagStatus === "ready" ? S.pass
                            : diagStatus === "failed" ? S.fail
                            : S.tertiary,
                        }}
                      >
                        {diagStatus === "generating" && "Generating..."}
                        {diagStatus === "ready" && `Bundle ready (${diagSizeKb} KB)`}
                        {diagStatus === "failed" && "Generation failed — ticket will be submitted without bundle"}
                        {diagStatus === "idle" && "Waiting..."}
                      </div>
                    )}
                  </div>

                  {/* Error message */}
                  {submitStatus === "error" && errorMsg && (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: "10px 14px",
                        background: "rgba(248,113,113,0.10)",
                        border: `1px solid ${S.fail}`,
                        borderRadius: 4,
                        fontFamily: S.fontUI,
                        fontSize: 13,
                        color: S.fail,
                      }}
                    >
                      {errorMsg}
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={!isValid || submitStatus === "submitting"}
                    style={{
                      width: "100%",
                      fontFamily: S.fontMono,
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: !isValid || submitStatus === "submitting" ? S.tertiary : S.bgDeep,
                      background: !isValid || submitStatus === "submitting" ? S.bgSub : S.cyan,
                      border: `1px solid ${!isValid || submitStatus === "submitting" ? S.soft : S.cyan}`,
                      borderRadius: 4,
                      padding: "12px",
                      cursor: !isValid || submitStatus === "submitting" ? "not-allowed" : "pointer",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {submitStatus === "submitting" ? "SUBMITTING..." : "SUBMIT TICKET"}
                  </button>

                  {!isValid && (
                    <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 8, textAlign: "center" }}>
                      {subject.trim().length === 0 ? "Subject is required." : "Description must be at least 50 characters."}
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>

          {/* RIGHT: Info panel */}
          <div style={{ width: 280, flexShrink: 0 }}>

            {/* SLA table */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${S.soft}` }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em" }}>
                  SLA — RESPONSE TIMES
                </span>
              </div>
              <div style={{ padding: "4px 0" }}>
                {SLA.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "9px 16px",
                      borderBottom: i < SLA.length - 1 ? `1px solid ${S.soft}` : "none",
                    }}
                  >
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, letterSpacing: "0.04em" }}>
                      {row.severity}
                    </span>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
                      {row.response}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact info */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${S.soft}` }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em" }}>
                  CONTACT
                </span>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <a
                  href="mailto:ordr-support@synexiun.com"
                  style={{
                    fontFamily: S.fontUI,
                    fontSize: 13,
                    color: S.cyan,
                    textDecoration: "none",
                    display: "block",
                    marginBottom: 12,
                  }}
                >
                  ordr-support@synexiun.com
                </a>
                <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, margin: 0, lineHeight: 1.5 }}>
                  Email support for urgent matters or when the platform is unavailable.
                </p>
              </div>
            </div>

            {/* Quick links */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${S.soft}` }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em" }}>
                  QUICK LINKS
                </span>
              </div>
              <div style={{ padding: "4px 0" }}>
                {[
                  { label: "Documentation", path: "/help" },
                  { label: "FAQ", path: "/help/faq" },
                  { label: "Support Center", path: "/help/support" },
                ].map((link) => (
                  <button
                    key={link.path}
                    onClick={() => router.push(link.path)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "9px 16px",
                      fontFamily: S.fontUI,
                      fontSize: 13,
                      color: S.secondary,
                      background: "none",
                      border: "none",
                      borderBottom: `1px solid ${S.soft}`,
                      cursor: "pointer",
                    }}
                  >
                    {link.label}
                  </button>
                ))}
                <div style={{ height: 4 }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    
  );
}

export default function ContactPage() {
  return (
    <PageShell icon={HelpCircle} title="Contact Support" breadcrumb={["Help","Contact"]}>

    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "var(--bg-deep)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
            color: "var(--text-tertiary)",
            fontSize: 13,
          }}
        >
          Loading...
        </div>
      }
    >
      <ContactPageInner />
    </Suspense>
  
    </PageShell>
  );
}
