"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { GUIDES } from "@/lib/help/guides";
import type { GuideDoc } from "@/lib/help/guides/types";
import { generateDiagnosticsBundle } from "@/lib/support/diagnostics";

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

// ── Severity badge colors ──────────────────────────────────────────────────────
function severityColor(sev: string): string {
  switch (sev) {
    case "S0": return S.fail;
    case "S1": return S.amber;
    case "S2": return S.cyan;
    case "S3": return S.secondary;
    default:   return S.tertiary;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "OPEN":        return S.cyan;
    case "IN_PROGRESS": return S.amber;
    case "RESOLVED":    return S.pass;
    case "CLOSED":      return S.tertiary;
    default:            return S.secondary;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface SupportTicket {
  id: string;
  ref: string;
  subject: string;
  severity: string;
  status: string;
  submitted_at: string;
  updated_at: string;
  description?: string;
  events?: Array<{ ts: string; actor: string; event: string; note?: string }>;
}

// ── Nav links ──────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Overview",          href: "#overview" },
  { label: "System Diagnostics",href: "#diagnostics" },
  { label: "Knowledge Base",    href: "#knowledge-base" },
  { label: "Open Ticket",       href: "/help/contact" },
  { label: "My Tickets",        href: "#my-tickets" },
];

const SLA_COMPACT = [
  { severity: "S0", label: "CRITICAL",    response: "1 hour",            color: "#f87171" },
  { severity: "S1", label: "HIGH",        response: "4 hours",           color: "#f59e0b" },
  { severity: "S2", label: "MEDIUM",      response: "1 business day",    color: "#22d3ee" },
  { severity: "S3", label: "LOW",         response: "3 business days",   color: "var(--text-secondary)" },
  { severity: "S4", label: "ENHANCEMENT", response: "Quarterly review",  color: "var(--text-secondary)" },
];

// ── Section title ──────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: S.fontMono,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.1em",
        color: S.primary,
        textTransform: "uppercase",
        margin: "0 0 4px 0",
      }}
    >
      {children}
    </h2>
  );
}

// ── Backend health hook ────────────────────────────────────────────────────────
function useBackendHealth(apiBase: string) {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/health`, { method: "GET", signal: AbortSignal.timeout(5000) })
      .then((r) => { if (!cancelled) setStatus(r.ok ? "online" : "offline"); })
      .catch(() => { if (!cancelled) setStatus("offline"); });
    return () => { cancelled = true; };
  }, [apiBase]);
  return status;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" &&
   ["hedgecore.vercel.app", "ordr-terminal.vercel.app"].includes(window.location.hostname)
    ? "https://hedgecore.onrender.com/api"
    : "/api");

// ── Guide card ─────────────────────────────────────────────────────────────────
function GuideCard({ guide, onEscalate }: { guide: GuideDoc; onEscalate: (g: GuideDoc) => void }) {
  const router = useRouter();
  const sections = guide.sections ?? [];
  const levelCounts: Record<string, number> = {};
  sections.forEach((s) => {
    levelCounts[s.level] = (levelCounts[s.level] ?? 0) + 1;
  });
  const levels = ["L1", "L2", "L3", "L4", "L5"].filter((l) => levelCounts[l]);

  const levelColor: Record<string, string> = {
    L1: "#22D3EE", L2: "#34D399", L3: "#A78BFA", L4: "#F59E0B", L5: "#F87171",
  };

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 6,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 13,
          fontWeight: 600,
          color: S.primary,
        }}
      >
        {guide.title}
      </div>
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 12,
          color: S.secondary,
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {guide.summary}
      </div>
      {levels.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {levels.map((l) => (
            <span
              key={l}
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                color: levelColor[l],
                border: `1px solid ${levelColor[l]}`,
                borderRadius: 3,
                padding: "1px 5px",
                letterSpacing: "0.06em",
              }}
            >
              {l} ({levelCounts[l]})
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          onClick={() => router.push(`/help?guide=${guide.id}`)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            color: S.cyan,
            background: "transparent",
            border: `1px solid ${S.cyan}`,
            borderRadius: 3,
            padding: "4px 10px",
            cursor: "pointer",
            letterSpacing: "0.06em",
          }}
        >
          VIEW GUIDE
        </button>
        <button
          onClick={() => onEscalate(guide)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            color: S.tertiary,
            background: "transparent",
            border: `1px solid ${S.soft}`,
            borderRadius: 3,
            padding: "4px 10px",
            cursor: "pointer",
            letterSpacing: "0.06em",
          }}
        >
          ESCALATE TO TICKET
        </button>
      </div>
    </div>
  );
}

// ── Ticket row ─────────────────────────────────────────────────────────────────
function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return iso; }
  };

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: "pointer", borderBottom: `1px solid ${S.soft}` }}
      >
        <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12, color: S.cyan, letterSpacing: "0.04em" }}>
          {ticket.ref}
        </td>
        <td style={{ padding: "10px 12px", fontFamily: S.fontUI, fontSize: 13, color: S.primary, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ticket.subject}
        </td>
        <td style={{ padding: "10px 12px" }}>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              color: severityColor(ticket.severity),
              border: `1px solid ${severityColor(ticket.severity)}`,
              borderRadius: 3,
              padding: "1px 6px",
              letterSpacing: "0.06em",
            }}
          >
            {ticket.severity}
          </span>
        </td>
        <td style={{ padding: "10px 12px" }}>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              color: statusColor(ticket.status),
              border: `1px solid ${statusColor(ticket.status)}`,
              borderRadius: 3,
              padding: "1px 6px",
              letterSpacing: "0.06em",
            }}
          >
            {ticket.status}
          </span>
        </td>
        <td style={{ padding: "10px 12px", fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
          {dateStr(ticket.submitted_at)}
        </td>
        <td style={{ padding: "10px 12px", fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
          {dateStr(ticket.updated_at)}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: S.bgSub }}>
          <td colSpan={6} style={{ padding: "14px 16px" }}>
            {ticket.description && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.06em", marginBottom: 4 }}>DESCRIPTION</div>
                <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                  {ticket.description}
                </p>
              </div>
            )}
            {ticket.events && ticket.events.length > 0 && (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>EVENTS</div>
                {ticket.events.map((ev, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "6px 0",
                      borderTop: i > 0 ? `1px solid ${S.soft}` : "none",
                    }}
                  >
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, minWidth: 80 }}>
                      {new Date(ev.ts).toLocaleTimeString()}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, minWidth: 80 }}>
                      {ev.actor}
                    </span>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                      {ev.event}{ev.note ? ` — ${ev.note}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page inner ────────────────────────────────────────────────────────────
function SupportPageInner() {
  const { token, user } = useAuth();
  const router = useRouter();
  const backendHealth = useBackendHealth(API_BASE);

  // Active nav section
  const [activeSection, setActiveSection] = useState("overview");

  // Diagnostics
  const [diagConsent, setDiagConsent] = useState(false);
  const [diagStatus, setDiagStatus] = useState<"idle" | "generating" | "ready" | "failed">("idle");
  const [diagBundle, setDiagBundle] = useState<object | null>(null);
  const [copied, setCopied] = useState(false);

  // Knowledge base search
  const [kbSearch, setKbSearch] = useState("");

  // Tickets
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsStatus, setTicketsStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  // Load tickets on mount
  useEffect(() => {
    if (!token) return;
    setTicketsStatus("loading");
    dashboardFetch("/v1/support/tickets", token)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTickets(Array.isArray(data) ? data : (data as { items?: SupportTicket[] }).items ?? []);
        setTicketsStatus("loaded");
      })
      .catch((err: unknown) => {
        setTicketsError(err instanceof Error ? err.message : "Failed to load tickets");
        setTicketsStatus("error");
      });
  }, [token]);

  // Track active section on scroll
  useEffect(() => {
    const sections = ["overview", "diagnostics", "knowledge-base", "my-tickets"];
    const handler = () => {
      for (const id of [...sections].reverse()) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) {
          setActiveSection(id);
          return;
        }
      }
      setActiveSection("overview");
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleGenerateDiag = useCallback(() => {
    if (!diagConsent) return;
    setDiagStatus("generating");
    setDiagBundle(null);
    generateDiagnosticsBundle({
      consent: true,
      tenantId: user?.company?.id ?? null,
      userId: user?.id ?? null,
      roles: user?.roles ?? [],
      branchCode: user?.branch?.code ?? null,
      platformVersion: "v2.0.0",
      apiBaseUrl: API_BASE,
    })
      .then((bundle) => {
        setDiagBundle(bundle);
        setDiagStatus("ready");
      })
      .catch(() => setDiagStatus("failed"));
  }, [diagConsent, user]);

  const handleDownloadDiag = () => {
    if (!diagBundle) return;
    const json = JSON.stringify(diagBundle, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ordr-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyDiag = () => {
    if (!diagBundle) return;
    navigator.clipboard.writeText(JSON.stringify(diagBundle, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleEscalate = (guide: GuideDoc) => {
    router.push(`/help/contact?subject=${encodeURIComponent(`Re: ${guide.title}`)}`);
  };

  const filteredGuides = GUIDES.filter((g) => {
    if (!kbSearch.trim()) return true;
    const q = kbSearch.toLowerCase();
    return g.title.toLowerCase().includes(q) || (g.summary ?? "").toLowerCase().includes(q);
  });

  const scrollTo = (href: string) => {
    if (href.startsWith("/")) {
      router.push(href);
      return;
    }
    const id = href.replace("#", "");
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };

  const roleLabel = user?.roles?.[0] ?? "User";
  const branchCode = user?.branch?.code ?? undefined;

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, display: "flex" }}>

      {/* LEFT SIDEBAR */}
      <div
        style={{
          width: 240,
          flexShrink: 0,
          background: S.bgPanel,
          borderRight: `1px solid ${S.rim}`,
          padding: "24px 0",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "0 16px", marginBottom: 20 }}>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              color: S.tertiary,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            SUPPORT CENTER
          </span>
        </div>

        {/* Nav links */}
        <div style={{ marginBottom: 24 }}>
          {NAV_LINKS.map((link) => {
            const sectionId = link.href.replace("#", "");
            const isActive = !link.href.startsWith("/") && activeSection === sectionId;
            return (
              <button
                key={link.href}
                onClick={() => scrollTo(link.href)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 16px",
                  fontFamily: S.fontUI,
                  fontSize: 13,
                  color: isActive ? S.primary : S.secondary,
                  background: "none",
                  border: "none",
                  borderLeft: isActive ? `3px solid ${S.cyan}` : "3px solid transparent",
                  cursor: "pointer",
                  transition: "border-color 0.15s, color 0.15s",
                }}
              >
                {link.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            borderTop: `1px solid ${S.soft}`,
            paddingTop: 16,
            padding: "16px 16px 0",
          }}
        >
          <button
            onClick={() => router.push("/help")}
            style={{
              display: "block",
              fontFamily: S.fontUI,
              fontSize: 12,
              color: S.tertiary,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              marginBottom: 8,
            }}
          >
            Documentation
          </button>
          <button
            onClick={() => router.push("/help/faq")}
            style={{
              display: "block",
              fontFamily: S.fontUI,
              fontSize: 12,
              color: S.tertiary,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            FAQ
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, padding: "24px 32px", minWidth: 0 }}>

        {/* SECTION 1: OVERVIEW */}
        <section id="overview" style={{ marginBottom: 48 }}>
          <SectionTitle>SUPPORT CENTER</SectionTitle>
          <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, marginTop: 4, marginBottom: 24, lineHeight: 1.6 }}>
            Diagnose platform issues, search the knowledge base, manage support tickets, and escalate to the support team.
          </p>

          {/* Stat grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {[
              { label: "PLATFORM", value: "ORDR Terminal v2.0.0" },
              {
                label: "BACKEND",
                value: backendHealth === "checking" ? "CHECKING..." : backendHealth === "online" ? "ONLINE" : "OFFLINE",
                color: backendHealth === "online" ? S.pass : backendHealth === "offline" ? S.fail : S.amber,
              },
              { label: "SESSION", value: `${roleLabel}${branchCode ? ` / ${branchCode}` : ""}` },
              { label: "GUIDES", value: `${GUIDES.length} guides available` },
            ].map((stat, i) => (
              <div
                key={i}
                style={{
                  background: S.bgPanel,
                  border: `1px solid ${S.rim}`,
                  borderRadius: 6,
                  padding: "16px",
                }}
              >
                <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 8 }}>
                  {stat.label}
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 13,
                    fontWeight: 700,
                    color: stat.color ?? S.primary,
                    letterSpacing: "0.04em",
                  }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 2: SYSTEM DIAGNOSTICS */}
        <section id="diagnostics" style={{ marginBottom: 48 }}>
          <SectionTitle>SYSTEM DIAGNOSTICS</SectionTitle>
          <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, marginTop: 4, marginBottom: 20, lineHeight: 1.6 }}>
            Generate a diagnostics bundle to share with support when reporting issues.
          </p>

          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              padding: "20px",
              marginBottom: 16,
            }}
          >
            {/* Consent checkbox */}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                marginBottom: 16,
              }}
            >
              <input
                type="checkbox"
                checked={diagConsent}
                onChange={(e) => setDiagConsent(e.target.checked)}
                style={{ marginTop: 3, accentColor: S.cyan, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginBottom: 4 }}>
                  I consent to generating a diagnostics report.
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.5 }}>
                  Bundle contains: platform version, backend health status, last 10 API call paths, last 5 UI error messages. No tokens, passwords, or payloads.
                </div>
              </div>
            </label>

            {/* Generate button */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                disabled={!diagConsent || diagStatus === "generating"}
                onClick={handleGenerateDiag}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: !diagConsent || diagStatus === "generating" ? S.tertiary : S.bgDeep,
                  background: !diagConsent || diagStatus === "generating" ? S.bgSub : S.cyan,
                  border: `1px solid ${!diagConsent || diagStatus === "generating" ? S.soft : S.cyan}`,
                  borderRadius: 4,
                  padding: "8px 16px",
                  cursor: !diagConsent || diagStatus === "generating" ? "not-allowed" : "pointer",
                }}
              >
                {diagStatus === "generating" ? "GENERATING..." : "GENERATE BUNDLE"}
              </button>

              {diagStatus === "ready" && diagBundle && (
                <>
                  <button
                    onClick={handleDownloadDiag}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: S.secondary,
                      background: "transparent",
                      border: `1px solid ${S.soft}`,
                      borderRadius: 4,
                      padding: "8px 16px",
                      cursor: "pointer",
                    }}
                  >
                    DOWNLOAD JSON
                  </button>
                  <button
                    onClick={handleCopyDiag}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: copied ? S.pass : S.secondary,
                      background: "transparent",
                      border: `1px solid ${copied ? S.pass : S.soft}`,
                      borderRadius: 4,
                      padding: "8px 16px",
                      cursor: "pointer",
                    }}
                  >
                    {copied ? "COPIED" : "COPY TO CLIPBOARD"}
                  </button>
                </>
              )}

              {diagStatus === "failed" && (
                <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.fail, letterSpacing: "0.06em" }}>
                  Generation failed
                </span>
              )}
            </div>

            {/* Bundle display */}
            {diagStatus === "ready" && diagBundle && (
              <div style={{ marginTop: 16 }}>
                <pre
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: S.secondary,
                    background: S.bgSub,
                    border: `1px solid ${S.rim}`,
                    borderRadius: 4,
                    padding: "12px",
                    maxHeight: 400,
                    overflowY: "auto",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    lineHeight: 1.6,
                  }}
                >
                  {JSON.stringify(diagBundle, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 3: KNOWLEDGE BASE */}
        <section id="knowledge-base" style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
            <div>
              <SectionTitle>KNOWLEDGE BASE</SectionTitle>
              <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, margin: "4px 0 0", lineHeight: 1.5 }}>
                {GUIDES.length} guides available
              </p>
            </div>
            <input
              type="text"
              value={kbSearch}
              onChange={(e) => setKbSearch(e.target.value)}
              placeholder="Search guides..."
              style={{
                fontFamily: S.fontUI,
                fontSize: 13,
                color: S.primary,
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 4,
                padding: "8px 12px",
                outline: "none",
                width: 240,
              }}
            />
          </div>

          {filteredGuides.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                fontFamily: S.fontUI,
                fontSize: 13,
                color: S.tertiary,
              }}
            >
              No guides match &quot;{kbSearch}&quot;.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {filteredGuides.map((guide) => (
                <GuideCard key={guide.id} guide={guide} onEscalate={handleEscalate} />
              ))}
            </div>
          )}
        </section>

        {/* SECTION 4: MY TICKETS */}
        <section id="my-tickets" style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <SectionTitle>MY TICKETS</SectionTitle>
            <button
              onClick={() => router.push("/help/contact")}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: S.bgDeep,
                background: S.cyan,
                border: `1px solid ${S.cyan}`,
                borderRadius: 4,
                padding: "7px 14px",
                cursor: "pointer",
              }}
            >
              OPEN TICKET
            </button>
          </div>

          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {ticketsStatus === "loading" && (
              <div style={{ padding: "40px", textAlign: "center", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
                Loading tickets...
              </div>
            )}
            {ticketsStatus === "error" && (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail, marginBottom: 8, letterSpacing: "0.06em" }}>
                  LOAD FAILED
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
                  {ticketsError}
                </div>
              </div>
            )}
            {(ticketsStatus === "loaded" || ticketsStatus === "idle") && tickets.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
                No tickets submitted yet.
              </div>
            )}
            {ticketsStatus === "loaded" && tickets.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                      {["Ref", "Subject", "Severity", "Status", "Submitted", "Last Update"].map((col) => (
                        <th
                          key={col}
                          style={{
                            padding: "10px 12px",
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: S.tertiary,
                            letterSpacing: "0.08em",
                            textAlign: "left",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <TicketRow key={ticket.id} ticket={ticket} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* RIGHT RAIL */}
      <div
        style={{
          width: 280,
          flexShrink: 0,
          padding: "24px 0 24px 0",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
          borderLeft: `1px solid ${S.rim}`,
        }}
      >
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Quick links */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${S.soft}` }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em" }}>
                QUICK LINKS
              </span>
            </div>
            <div style={{ padding: "4px 0" }}>
              {[
                { label: "Documentation", path: "/help" },
                { label: "FAQ", path: "/help/faq" },
                { label: "Contact Support", path: "/help/contact" },
              ].map((link) => (
                <button
                  key={link.path}
                  onClick={() => router.push(link.path)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 14px",
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

          {/* Severity guide */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${S.soft}` }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em" }}>
                SEVERITY GUIDE
              </span>
            </div>
            <div style={{ padding: "4px 0" }}>
              {SLA_COMPACT.map((row, i) => (
                <div
                  key={row.severity}
                  style={{
                    padding: "8px 14px",
                    borderBottom: i < SLA_COMPACT.length - 1 ? `1px solid ${S.soft}` : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        color: row.color,
                        letterSpacing: "0.06em",
                        fontWeight: 700,
                      }}
                    >
                      {row.severity} {row.label}
                    </span>
                    <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary }}>
                      {row.response}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Backend health */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${S.soft}` }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em" }}>
                BACKEND HEALTH
              </span>
            </div>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background:
                    backendHealth === "online" ? S.pass
                    : backendHealth === "offline" ? S.fail
                    : S.amber,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  color:
                    backendHealth === "online" ? S.pass
                    : backendHealth === "offline" ? S.fail
                    : S.amber,
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                }}
              >
                {backendHealth === "checking" ? "CHECKING" : backendHealth === "online" ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
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
          Loading Support Center...
        </div>
      }
    >
      <SupportPageInner />
    </Suspense>
  );
}
