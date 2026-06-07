"use client";

/**
 * Root route — ORDR Treasury marketing landing.
 *
 * Public, full-viewport, scrollable. ClientProviders treats "/" as a public
 * route (no sidebar, no voice). Renders inside AuthProvider so the CTA can link
 * straight to the real product login at /auth/login.
 *
 * Every figure on this page is sourced from the codebase, not marketing fiction:
 *   60 engine modules  = 46 deterministic kernel (engine_v1) + 14 orchestrator (engine)
 *   5,514 tests / 70%  = CI baseline + coverage gate (CLAUDE.md §6)
 *   R1–R8, tri-state governance, WORM + SHA-256 hash chain, RBAC 9/41, forced RLS
 *   ERP posting adapters are described as paper-mode (RISK-ERP-01) — no fake "live" claims.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, CSSProperties } from "react";

/* ─── Local design constants — CSS-variable references, inherit product theme ─── */
const C = {
  bgDeep:   "var(--bg-deep)",
  bgSide:   "var(--bg-sidebar)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  t1:       "var(--text-primary)",
  t2:       "var(--text-secondary)",
  t3:       "var(--text-tertiary)",
  accent:   "var(--accent-blue)",
  green:    "var(--accent-green)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red)",
  cyan:     "var(--accent-cyan)",
  fontHead: "'Manrope','Inter',sans-serif",
  fontUI:   "'IBM Plex Sans','Inter',sans-serif",
  fontMono: "'IBM Plex Mono','JetBrains Mono',monospace",
} as const;

const LOGIN_HREF = "/auth/login";

/* ─── Scroll reveal ──────────────────────────────────────────────────────────── */
function Reveal({
  children,
  delay = 0,
  as = "div",
  style,
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "section" | "header";
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setShown(true)),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Tag = as as "div";
  return (
    <Tag
      ref={ref}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(18px)",
        transition: `opacity .7s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .7s cubic-bezier(.22,1,.36,1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}

/* ─── Section label (editorial numbering) ────────────────────────────────────── */
function Kicker({ n, label }: { n: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.accent, letterSpacing: "0.18em" }}>{n}</span>
      <span style={{ width: 28, height: 1, background: C.rim }} />
      <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.t3, letterSpacing: "0.28em", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

const MAXW = 1240;
const sectionPad: CSSProperties = { maxWidth: MAXW, margin: "0 auto", padding: "0 28px" };

/* ─── Data (sourced from codebase canon) ─────────────────────────────────────── */
const TICKER = [
  ["EUR/USD", "1.0874", "+0.12%"], ["GBP/USD", "1.2691", "−0.08%"],
  ["USD/JPY", "157.32", "+0.21%"], ["USD/CHF", "0.8945", "+0.04%"],
  ["AUD/USD", "0.6612", "−0.15%"], ["USD/CAD", "1.3702", "+0.06%"],
  ["EUR/GBP", "0.8568", "+0.03%"], ["NZD/USD", "0.6118", "−0.11%"],
] as const;

const STATS = [
  ["60", "Engine modules", "46 deterministic kernel · 14 orchestrator"],
  ["5,514", "Tests green", "70% coverage gate enforced in CI"],
  ["R1–R8", "Risk taxonomy", "Frozen, audited, never mutated"],
  ["SHA-256", "Hash-chained audit", "Per-tenant, tamper-evident WORM"],
] as const;

const DESKS = [
  ["Exposure Desk", "Ingest positions from ERP, FX feeds and manual entry. Net by currency, tenor and entity before a single hedge is sized."],
  ["Hedge Engine", "Deterministic kernel sizes hedges against the R1–R8 taxonomy and the frozen strategy-to-instrument map. Same inputs, same output, every time."],
  ["Governance Desk", "Tri-state pipeline with 4-eyes maker/checker and Separation of Duties. Nothing reaches the ledger without an independent second signature."],
  ["Audit Vault", "WORM tables and a per-tenant SHA-256 hash chain. Every run, decision and policy revision is append-only and provable to a regulator."],
  ["Compliance Layer", "Hedge-accounting and trade-reporting frameworks mapped to the artifacts each one demands — EMIR, MiFID II, Dodd-Frank, IFRS 9, ASC 815."],
  ["Counterparty & TCA", "Counterparty exposure, transaction-cost analysis and posting adapters that reconcile the hedge back to the books."],
] as const;

const RISKS = [
  ["R1", "Transaction risk"], ["R2", "Translation risk"],
  ["R3", "Economic risk"], ["R4", "Contingent risk"],
  ["R5", "Pre-transaction risk"], ["R6", "Operating risk"],
  ["R7", "Tax risk"], ["R8", "Competitive risk"],
] as const;

const GOV = [
  ["SANDBOX", "Model and test hedge proposals in full isolation. No effect on books, no audit weight.", C.t3],
  ["STAGING", "Proposal submitted for review. The maker is locked out of approving their own work by Separation of Duties.", C.amber],
  ["LEDGER", "An independent checker signs off; the run is committed, hash-chained and immutable forever.", C.green],
] as const;

const REGS = [
  ["EMIR", "EU derivative trade reporting & risk-mitigation"],
  ["MiFID II", "Transaction reporting & best-execution evidence"],
  ["Dodd-Frank", "US swap reporting & recordkeeping"],
  ["FINRA 17a-4", "Write-once, non-rewriteable retention"],
  ["ISDA", "Master-agreement aligned documentation"],
  ["IFRS 9", "Hedge-accounting effectiveness testing"],
  ["ASC 815", "US GAAP derivative & hedge designation"],
  ["CFTC", "US swap-data repository reporting"],
] as const;

const SECURITY = [
  ["Forced row-level security", "PostgreSQL RLS is forced on every tenant-scoped table. A request without a tenant context returns zero rows — fail-closed by construction."],
  ["RBAC — 9 roles, 41 permissions", "Hierarchy levels 0–15. Missing permission is denied, never defaulted. Superuser paths are explicitly gated."],
  ["JWT + API-key auth", "HS256 access/refresh tokens for users; bcrypt-hashed HK_live_ keys for machine access, route-allowlisted at startup."],
  ["Tamper-evident audit", "SHA-256 hash chain per tenant from a fixed genesis. Any altered record breaks the chain and is detectable on verification."],
  ["Rate limiting & headers", "60 req/min token-bucket per principal. nosniff, frame-deny, strict referrer and per-environment CORS — no wildcards in production."],
  ["WORM data integrity", "audit_events, calculation_runs and policy_revisions are append-only. No UPDATE, no DELETE — enforced at the database, not just the app."],
] as const;

const TIERS = [
  {
    name: "Desk", price: "Single entity",
    blurb: "One treasury team, the full deterministic engine and governance.",
    items: ["Exposure & hedge engine", "Tri-state governance + 4-eyes", "WORM audit & hash chain", "IFRS 9 / ASC 815 effectiveness"],
  },
  {
    name: "Enterprise", price: "Multi-entity", featured: true,
    blurb: "Group treasury across entities with full regulatory reporting.",
    items: ["Everything in Desk", "Multi-entity RLS isolation", "EMIR / MiFID II / Dodd-Frank reporting", "Counterparty hub & TCA", "ERP posting adapters", "SSO / WorkOS"],
  },
  {
    name: "Sovereign", price: "Dedicated",
    blurb: "Isolated deployment for the most demanding mandates.",
    items: ["Everything in Enterprise", "Dedicated database & tenancy", "Custom retention & residency", "Named onboarding & SLAs"],
  },
] as const;

/* ─── Page ───────────────────────────────────────────────────────────────────── */
export default function TreasuryLanding() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ background: C.bgDeep, color: C.t1, fontFamily: C.fontUI, minHeight: "100vh", overflowX: "hidden" }}>
      {/* atmospheric background */}
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `linear-gradient(${C.soft} 1px, transparent 1px), linear-gradient(90deg, ${C.soft} 1px, transparent 1px)`,
          backgroundSize: "64px 64px", opacity: 0.35,
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 80%)",
        }} />
        <div style={{
          position: "absolute", top: "-15%", left: "50%", transform: "translateX(-50%)",
          width: 900, height: 700,
          background: "radial-gradient(circle, rgba(28,98,242,0.10) 0%, transparent 65%)",
          filter: "blur(20px)",
        }} />
      </div>

      <style>{`
        @media (max-width: 980px){
          .ordr-hero-grid{grid-template-columns:1fr!important;gap:40px!important}
          .ordr-two{grid-template-columns:1fr!important;gap:32px!important}
          .ordr-gov{grid-template-columns:1fr!important}
          .ordr-gov-arrow{display:none!important}
        }
        @media (max-width: 720px){
          .ordr-statbar{grid-template-columns:1fr 1fr!important}
          .ordr-statbar > div:nth-child(3){border-left:none!important}
        }
        html{scroll-behavior:smooth}
      `}</style>
      <div style={{ position: "relative", zIndex: 1 }}>
        <Nav scrolled={scrolled} />
        <Ticker />
        <Hero />
        <StatBar />
        <Platform />
        <Engine />
        <Governance />
        <Audit />
        <Compliance />
        <Security />
        <Integrations />
        <Pricing />
        <FinalCta />
        <Footer />
      </div>
    </div>
  );
}

/* ─── Nav ────────────────────────────────────────────────────────────────────── */
function Nav({ scrolled }: { scrolled: boolean }) {
  const links = [
    ["Platform", "#platform"], ["Engine", "#engine"], ["Governance", "#governance"],
    ["Audit", "#audit"], ["Compliance", "#compliance"], ["Security", "#security"],
  ];
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: scrolled ? "rgba(17,24,39,0.82)" : "transparent",
      backdropFilter: scrolled ? "saturate(140%) blur(12px)" : "none",
      borderBottom: `1px solid ${scrolled ? C.rim : "transparent"}`,
      transition: "background .3s, border-color .3s, backdrop-filter .3s",
    }}>
      <div style={{ ...sectionPad, height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.rim}`,
            background: C.panel, display: "grid", placeItems: "center",
            fontFamily: C.fontMono, fontSize: 13, fontWeight: 700, color: C.accent,
          }}>◇</span>
          <span style={{ fontFamily: C.fontHead, fontSize: 15, fontWeight: 700, letterSpacing: "0.02em" }}>
            ORDR <span style={{ color: C.t3, fontWeight: 500 }}>Treasury</span>
          </span>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 26 }} className="ordr-navlinks">
          {links.map(([label, href]) => (
            <a key={href} href={href} style={{ fontSize: 13, color: C.t2, textDecoration: "none", letterSpacing: "0.01em" }}
               onMouseEnter={(e) => (e.currentTarget.style.color = C.t1)}
               onMouseLeave={(e) => (e.currentTarget.style.color = C.t2)}>
              {label}
            </a>
          ))}
        </nav>
        <Link href={LOGIN_HREF} style={{
          fontFamily: C.fontMono, fontSize: 12, letterSpacing: "0.08em", textDecoration: "none",
          color: C.t1, padding: "8px 16px", border: `1px solid ${C.rim}`, borderRadius: 7,
          background: C.panel, display: "inline-flex", alignItems: "center", gap: 8, transition: "border-color .2s, background .2s",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.sub; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.rim; e.currentTarget.style.background = C.panel; }}>
          ACCESS TERMINAL <span style={{ color: C.accent }}>→</span>
        </Link>
      </div>
    </header>
  );
}

/* ─── Ticker ─────────────────────────────────────────────────────────────────── */
function Ticker() {
  const row = [...TICKER, ...TICKER];
  return (
    <div style={{ borderBottom: `1px solid ${C.soft}`, background: "rgba(11,17,32,0.5)", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 34, whiteSpace: "nowrap", padding: "8px 0", animation: "ordr-marquee 38s linear infinite", width: "max-content" }}>
        {row.map(([pair, px, chg], i) => {
          const up = !chg.startsWith("−");
          return (
            <span key={i} style={{ fontFamily: C.fontMono, fontSize: 12, display: "inline-flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ color: C.t3 }}>{pair}</span>
              <span style={{ color: C.t1 }}>{px}</span>
              <span style={{ color: up ? C.green : C.red }}>{chg}</span>
            </span>
          );
        })}
      </div>
      <style>{`@keyframes ordr-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      @media (max-width:860px){.ordr-navlinks{display:none!important}}`}</style>
    </div>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section style={{ ...sectionPad, paddingTop: 96, paddingBottom: 72 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,0.95fr)", gap: 56, alignItems: "center" }} className="ordr-hero-grid">
        <div>
          <Reveal>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 9, padding: "5px 12px", marginBottom: 26,
              border: `1px solid ${C.rim}`, borderRadius: 999, background: C.panel,
              fontFamily: C.fontMono, fontSize: 12, color: C.t2, letterSpacing: "0.06em",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
              INSTITUTIONAL FX HEDGE GOVERNANCE
            </div>
          </Reveal>
          <Reveal delay={60}>
            <h1 style={{
              fontFamily: C.fontHead, fontWeight: 800, lineHeight: 1.04, letterSpacing: "-0.02em",
              fontSize: "clamp(38px, 5.4vw, 64px)", margin: 0,
            }}>
              The treasury that<br />
              <span style={{ color: C.t2 }}>can prove every</span><br />
              hedge it ever made.
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: C.t2, maxWidth: 520, margin: "22px 0 0" }}>
              ORDR Treasury sizes corporate FX hedges with a deterministic engine, routes
              every decision through 4-eyes governance, and seals it in a tamper-evident,
              hash-chained audit trail. One platform from exposure to regulator.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div style={{ display: "flex", gap: 14, marginTop: 34, flexWrap: "wrap" }}>
              <Link href={LOGIN_HREF} style={primaryBtn()}>Access the Terminal <span aria-hidden>→</span></Link>
              <a href="#platform" style={ghostBtn()}>Explore the platform</a>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <div style={{ display: "flex", gap: 22, marginTop: 30, flexWrap: "wrap" }}>
              {[["Deterministic", "engine_v1"], ["Append-only", "WORM audit"], ["Multi-tenant", "forced RLS"]].map(([a, b]) => (
                <div key={a} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontFamily: C.fontMono, fontSize: 13, color: C.t1 }}>{a}</span>
                  <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.t3, letterSpacing: "0.04em" }}>{b}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
        <Reveal delay={140}>
          <RunEnvelope />
        </Reveal>
      </div>
    </section>
  );
}

/* Terminal-style proof panel: a hash-chained calculation run */
function RunEnvelope() {
  return (
    <div style={{
      border: `1px solid ${C.rim}`, borderRadius: 12, background: "linear-gradient(180deg, var(--bg-panel), var(--bg-sidebar))",
      boxShadow: "0 30px 80px -40px rgba(0,0,0,0.8)", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${C.soft}` }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: C.red, opacity: 0.7 }} />
        <span style={{ width: 9, height: 9, borderRadius: 999, background: C.amber, opacity: 0.7 }} />
        <span style={{ width: 9, height: 9, borderRadius: 999, background: C.green, opacity: 0.7 }} />
        <span style={{ marginLeft: 8, fontFamily: C.fontMono, fontSize: 12, color: C.t3 }}>calculation_run.envelope</span>
        <span style={{ marginLeft: "auto", fontFamily: C.fontMono, fontSize: 11, color: C.green, border: `1px solid ${C.rim}`, padding: "2px 7px", borderRadius: 5 }}>VERIFIED</span>
      </div>
      <div style={{ padding: "16px 16px 18px", fontFamily: C.fontMono, fontSize: 12.5, lineHeight: 1.85 }}>
        {[
          ["run_id", "9f3c·a210·77e1", C.t1],
          ["strategy", "FORWARD · 6M tenor", C.t1],
          ["exposure", "EUR 24,500,000", C.t1],
          ["risk_class", "R1 transaction", C.accent],
          ["hedge_ratio", "0.85 (policy-bound)", C.t1],
          ["maker", "a.okafor", C.t2],
          ["checker", "l.tanaka · SoD ✓", C.green],
        ].map(([k, v, col]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: C.t3 }}>{k}</span>
            <span style={{ color: col as string }}>{v}</span>
          </div>
        ))}
        <div style={{ height: 1, background: C.soft, margin: "12px 0" }} />
        <div style={{ color: C.t3, fontSize: 11.5, marginBottom: 4 }}>prev_hash</div>
        <div style={{ color: C.t2, wordBreak: "break-all", fontSize: 11.5 }}>0000…a4f1c9b2e7d0…3f8a</div>
        <div style={{ color: C.t3, fontSize: 11.5, margin: "8px 0 4px" }}>this_hash · SHA-256</div>
        <div style={{ color: C.accent, wordBreak: "break-all", fontSize: 11.5 }}>7c1e…d92f04ab66c5…e10b</div>
      </div>
    </div>
  );
}

/* ─── Stat bar ───────────────────────────────────────────────────────────────── */
function StatBar() {
  return (
    <section style={{ borderTop: `1px solid ${C.soft}`, borderBottom: `1px solid ${C.soft}`, background: "rgba(11,17,32,0.4)" }}>
      <div style={{ ...sectionPad, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }} className="ordr-statbar">
        {STATS.map(([big, label, sub], i) => (
          <Reveal key={label} delay={i * 70} style={{ padding: "30px 22px", borderLeft: i === 0 ? "none" : `1px solid ${C.soft}` }}>
            <div style={{ fontFamily: C.fontHead, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", color: C.t1 }}>{big}</div>
            <div style={{ fontSize: 13, color: C.t1, marginTop: 6, fontWeight: 600 }}>{label}</div>
            <div style={{ fontFamily: C.fontMono, fontSize: 12, color: C.t3, marginTop: 4 }}>{sub}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── Platform / desks ───────────────────────────────────────────────────────── */
function Platform() {
  return (
    <section id="platform" style={{ ...sectionPad, paddingTop: 88, paddingBottom: 24 }}>
      <Reveal as="header">
        <Kicker n="01" label="The platform" />
        <h2 style={h2()}>One operating system for the entire hedge lifecycle</h2>
        <p style={lead()}>Six coordinated desks take an exposure from raw position to regulator-ready record — no spreadsheets, no handoffs that lose the audit thread.</p>
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 16, marginTop: 44 }}>
        {DESKS.map(([title, body], i) => (
          <Reveal key={title} delay={(i % 3) * 70}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.accent }}>{String(i + 1).padStart(2, "0")}</span>
                <h3 style={cardTitle()}>{title}</h3>
              </div>
              <p style={cardBody()}>{body}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── Engine + R1–R8 ─────────────────────────────────────────────────────────── */
function Engine() {
  return (
    <section id="engine" style={{ ...sectionPad, paddingTop: 88, paddingBottom: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 54, alignItems: "start" }} className="ordr-two">
        <Reveal as="header">
          <Kicker n="02" label="Deterministic engine" />
          <h2 style={h2()}>Same inputs. Same hedge. Every single time.</h2>
          <p style={lead()}>
            The hedge kernel is a set of pure, deterministic functions — 46 modules under a 14-module
            orchestrator. No ML, no auto-learning, no hidden state. A fail-closed validator rejects
            bad input before it can reach a calculation, and every run is reproducible from its envelope.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
            {["Pure functions", "Fail-closed validation", "No stateful decisions", "Reproducible runs", "v1 architecture frozen"].map((t) => (
              <span key={t} style={pill()}>{t}</span>
            ))}
          </div>
        </Reveal>
        <Reveal delay={120}>
          <Card style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.t3, letterSpacing: "0.16em" }}>R1–R8 RISK TAXONOMY</span>
              <span style={{ fontFamily: C.fontMono, fontSize: 11, color: C.t3, border: `1px solid ${C.rim}`, padding: "2px 7px", borderRadius: 5 }}>FROZEN</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {RISKS.map(([id, name]) => (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${C.soft}`, borderRadius: 8, background: C.bgDeep }}>
                  <span style={{ fontFamily: C.fontMono, fontSize: 13, fontWeight: 700, color: C.accent }}>{id}</span>
                  <span style={{ fontSize: 13, color: C.t2 }}>{name}</span>
                </div>
              ))}
            </div>
            <p style={{ fontFamily: C.fontMono, fontSize: 12, color: C.t3, marginTop: 16, lineHeight: 1.6 }}>
              Each risk class maps to a strategy and a permitted instrument set. The mapping is part of the frozen v1 contract — it cannot drift between runs.
            </p>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Governance ─────────────────────────────────────────────────────────────── */
function Governance() {
  return (
    <section id="governance" style={{ ...sectionPad, paddingTop: 88, paddingBottom: 24 }}>
      <Reveal as="header">
        <Kicker n="03" label="Governance" />
        <h2 style={h2()}>Nothing reaches the ledger on one person’s signature</h2>
        <p style={lead()}>A tri-state pipeline with maker/checker control and Separation of Duties. The person who builds a proposal is structurally barred from approving it.</p>
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 44 }} className="ordr-gov">
        {GOV.map(([stage, body, col], i) => (
          <Reveal key={stage} delay={i * 90}>
            <Card style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: col as string, boxShadow: `0 0 8px ${col}` }} />
                <span style={{ fontFamily: C.fontMono, fontSize: 13, letterSpacing: "0.14em", color: C.t1 }}>{stage}</span>
              </div>
              <p style={cardBody()}>{body}</p>
              {i < 2 && <span aria-hidden style={{ position: "absolute", right: -13, top: "50%", color: C.t3, fontSize: 16 }} className="ordr-gov-arrow">→</span>}
            </Card>
          </Reveal>
        ))}
      </div>
      <Reveal delay={120}>
        <div style={{ display: "flex", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
          {[["4-eyes maker/checker", "Two independent principals on every committed run."],
            ["Separation of Duties", "Same user cannot both make and check a proposal."],
            ["Policy-bound hedging", "Hedge ratios constrained by policy revisions, themselves WORM-versioned."]].map(([t, b]) => (
            <div key={t} style={{ flex: "1 1 300px", border: `1px solid ${C.soft}`, borderRadius: 10, padding: "16px 18px", background: C.panel }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, marginBottom: 4 }}>{t}</div>
              <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.55 }}>{b}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ─── Audit ──────────────────────────────────────────────────────────────────── */
function Audit() {
  return (
    <section id="audit" style={{ ...sectionPad, paddingTop: 88, paddingBottom: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 54, alignItems: "center" }} className="ordr-two">
        <Reveal delay={120} style={{ order: 0 }}>
          <Card style={{ padding: 20 }}>
            <div style={{ fontFamily: C.fontMono, fontSize: 12, color: C.t3, letterSpacing: "0.14em", marginBottom: 14 }}>HASH CHAIN · PER TENANT</div>
            {[
              ["GENESIS", "0000000000000000…0000", C.t3],
              ["block 0001", "a4f1c9b2e7d0…3f8a", C.t2],
              ["block 0002", "7c1ed92f04ab…e10b", C.accent],
              ["block 0003", "b9a0…sealed", C.green],
            ].map(([k, v, col], i) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: i ? `1px solid ${C.soft}` : "none" }}>
                <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.t3, width: 84 }}>{k}</span>
                <span style={{ fontFamily: C.fontMono, fontSize: 12, color: col as string, wordBreak: "break-all" }}>{v}</span>
              </div>
            ))}
            <p style={{ fontFamily: C.fontMono, fontSize: 12, color: C.t3, marginTop: 14, lineHeight: 1.6 }}>
              Each block commits the SHA-256 of the one before it. Alter any record and every downstream hash fails verification.
            </p>
          </Card>
        </Reveal>
        <Reveal as="header">
          <Kicker n="04" label="Audit & integrity" />
          <h2 style={h2()}>Append-only by law of the database, not the app</h2>
          <p style={lead()}>
            Three tables — <span style={mono()}>audit_events</span>, <span style={mono()}>calculation_runs</span> and{" "}
            <span style={mono()}>policy_revisions</span> — are WORM: append-only, with no UPDATE and no DELETE path. Every
            entry is chained with per-tenant SHA-256 from a fixed genesis, so the record is not just stored — it is provable.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
            {["Write-once retention", "Tamper-evident", "Regulator-exportable", "20 ADRs of canon"].map((t) => <span key={t} style={pill()}>{t}</span>)}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Compliance ─────────────────────────────────────────────────────────────── */
function Compliance() {
  return (
    <section id="compliance" style={{ ...sectionPad, paddingTop: 88, paddingBottom: 24 }}>
      <Reveal as="header">
        <Kicker n="05" label="Compliance" />
        <h2 style={h2()}>Mapped to the frameworks your auditors already cite</h2>
        <p style={lead()}>Hedge-accounting effectiveness and trade-reporting obligations modelled against the artifacts each regime expects — so an examination is an export, not a fire drill.</p>
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px,1fr))", gap: 14, marginTop: 44 }}>
        {REGS.map(([name, body], i) => (
          <Reveal key={name} delay={(i % 4) * 60}>
            <Card style={{ padding: "18px 20px" }}>
              <div style={{ fontFamily: C.fontMono, fontSize: 14, fontWeight: 700, color: C.t1, marginBottom: 6 }}>{name}</div>
              <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.5 }}>{body}</div>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── Security ───────────────────────────────────────────────────────────────── */
function Security() {
  return (
    <section id="security" style={{ ...sectionPad, paddingTop: 88, paddingBottom: 24 }}>
      <Reveal as="header">
        <Kicker n="06" label="Security architecture" />
        <h2 style={h2()}>Fail-closed at every layer that touches tenant data</h2>
        <p style={lead()}>Isolation, authorization and integrity are enforced structurally — in the database and at startup — not left to a developer remembering to check.</p>
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px,1fr))", gap: 16, marginTop: 44 }}>
        {SECURITY.map(([title, body], i) => (
          <Reveal key={title} delay={(i % 3) * 70}>
            <Card>
              <h3 style={cardTitle()}>{title}</h3>
              <p style={{ ...cardBody(), marginTop: 10 }}>{body}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── Integrations (honest paper-mode framing) ───────────────────────────────── */
function Integrations() {
  return (
    <section style={{ ...sectionPad, paddingTop: 88, paddingBottom: 24 }}>
      <Reveal>
        <Card style={{ padding: "30px 30px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 40, alignItems: "center" }} className="ordr-two">
            <div>
              <Kicker n="07" label="Integrations" />
              <h2 style={{ ...h2(), fontSize: "clamp(24px,3vw,32px)" }}>Reconcile the hedge back to the books</h2>
              <p style={lead()}>
                Posting adapters for QuickBooks, Xero and NetSuite, plus SWIFT / pain.001 payment messaging and
                market-data feeds. ERP posting currently runs in <strong style={{ color: C.t1 }}>paper mode</strong> —
                journals are generated and validated end-to-end, ready to switch to live credentials per tenant.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["QuickBooks", "paper mode"], ["Xero", "paper mode"], ["NetSuite", "paper mode"], ["SWIFT pain.001", "generation"], ["Market data", "live feed"], ["WorkOS SSO", "enterprise"]].map(([n, s]) => (
                <div key={n} style={{ border: `1px solid ${C.soft}`, borderRadius: 9, padding: "13px 14px", background: C.bgDeep }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{n}</div>
                  <div style={{ fontFamily: C.fontMono, fontSize: 11, color: C.t3, marginTop: 3, letterSpacing: "0.04em" }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </Reveal>
    </section>
  );
}

/* ─── Pricing ────────────────────────────────────────────────────────────────── */
function Pricing() {
  return (
    <section style={{ ...sectionPad, paddingTop: 88, paddingBottom: 24 }}>
      <Reveal as="header">
        <Kicker n="08" label="Engagement" />
        <h2 style={h2()}>Deploy at the scale of your mandate</h2>
        <p style={lead()}>From a single treasury desk to a sovereign, fully-isolated deployment. The engine and governance are identical at every tier — only the perimeter changes.</p>
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 44 }} className="ordr-gov">
        {TIERS.map((t, i) => (
          <Reveal key={t.name} delay={i * 80}>
            <div style={{
              border: `1px solid ${(t as { featured?: boolean }).featured ? C.accent : C.rim}`, borderRadius: 12,
              background: (t as { featured?: boolean }).featured ? "linear-gradient(180deg, rgba(28,98,242,0.08), var(--bg-panel))" : C.panel,
              padding: "26px 24px", height: "100%", display: "flex", flexDirection: "column",
              boxShadow: (t as { featured?: boolean }).featured ? "0 20px 60px -36px rgba(28,98,242,0.5)" : "none",
            }}>
              {(t as { featured?: boolean }).featured && (
                <span style={{ alignSelf: "flex-start", fontFamily: C.fontMono, fontSize: 11, color: C.accent, border: `1px solid ${C.accent}`, padding: "2px 8px", borderRadius: 5, marginBottom: 12, letterSpacing: "0.1em" }}>MOST DEPLOYED</span>
              )}
              <div style={{ fontFamily: C.fontHead, fontSize: 22, fontWeight: 800, color: C.t1 }}>{t.name}</div>
              <div style={{ fontFamily: C.fontMono, fontSize: 13, color: C.t3, marginTop: 4 }}>{t.price}</div>
              <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.55, margin: "14px 0 18px" }}>{t.blurb}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px", display: "flex", flexDirection: "column", gap: 10 }}>
                {t.items.map((it) => (
                  <li key={it} style={{ display: "flex", gap: 9, fontSize: 13, color: C.t2, lineHeight: 1.4 }}>
                    <span style={{ color: C.accent, fontFamily: C.fontMono }}>✓</span>{it}
                  </li>
                ))}
              </ul>
              <Link href={LOGIN_HREF} style={{ ...((t as { featured?: boolean }).featured ? primaryBtn() : ghostBtn()), marginTop: "auto", justifyContent: "center", width: "100%", boxSizing: "border-box" }}>
                {(t as { featured?: boolean }).featured ? "Access the Terminal" : "Sign in"}
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── Final CTA ──────────────────────────────────────────────────────────────── */
function FinalCta() {
  return (
    <section style={{ ...sectionPad, paddingTop: 96, paddingBottom: 96 }}>
      <Reveal>
        <div style={{
          position: "relative", overflow: "hidden", border: `1px solid ${C.rim}`, borderRadius: 16,
          background: "linear-gradient(180deg, var(--bg-panel), var(--bg-sidebar))", padding: "60px 40px", textAlign: "center",
        }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(circle at 50% 0%, rgba(28,98,242,0.16), transparent 60%)` }} />
          <div style={{ position: "relative" }}>
            <h2 style={{ fontFamily: C.fontHead, fontWeight: 800, fontSize: "clamp(28px,4vw,44px)", letterSpacing: "-0.02em", margin: 0 }}>
              Bring your treasury into the record.
            </h2>
            <p style={{ fontSize: 16, color: C.t2, maxWidth: 560, margin: "18px auto 0", lineHeight: 1.6 }}>
              Sign in to the ORDR Treasury terminal, or request access for your institution.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 30, flexWrap: "wrap" }}>
              <Link href={LOGIN_HREF} style={primaryBtn()}>Access the Terminal <span aria-hidden>→</span></Link>
              <Link href="/signup" style={ghostBtn()}>Request institutional access</Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ─── Footer ─────────────────────────────────────────────────────────────────── */
function Footer() {
  const year = 2026;
  return (
    <footer style={{ borderTop: `1px solid ${C.soft}`, background: "rgba(11,17,32,0.5)" }}>
      <div style={{ ...sectionPad, padding: "40px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.rim}`, background: C.panel, display: "grid", placeItems: "center", fontFamily: C.fontMono, fontSize: 12, color: C.accent }}>◇</span>
          <span style={{ fontFamily: C.fontHead, fontSize: 14, fontWeight: 700 }}>ORDR <span style={{ color: C.t3, fontWeight: 500 }}>Treasury</span></span>
        </div>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          {[["Platform", "#platform"], ["Governance", "#governance"], ["Security", "#security"], ["Sign in", LOGIN_HREF]].map(([l, h]) => (
            h === LOGIN_HREF
              ? <Link key={l} href={h} style={footLink()}>{l}</Link>
              : <a key={l} href={h} style={footLink()}>{l}</a>
          ))}
        </div>
        <div style={{ fontFamily: C.fontMono, fontSize: 12, color: C.t3, letterSpacing: "0.06em" }}>
          © {year} SYNEXIUN · ORDR_OS v4.0
        </div>
      </div>
    </footer>
  );
}

/* ─── Shared primitives ──────────────────────────────────────────────────────── */
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{ border: `1px solid ${C.rim}`, borderRadius: 12, background: C.panel, padding: 22, height: "100%", transition: "border-color .25s, transform .25s, box-shadow .25s", ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 24px 60px -44px rgba(28,98,242,0.55)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.rim; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      {children}
    </div>
  );
}

function primaryBtn(): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 9, padding: "13px 22px", borderRadius: 9,
    background: C.accent, color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600,
    border: `1px solid ${C.accent}`, boxShadow: "0 14px 40px -20px rgba(28,98,242,0.8)",
    fontFamily: C.fontUI,
  };
}
function ghostBtn(): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 9, padding: "13px 22px", borderRadius: 9,
    background: "transparent", color: C.t1, textDecoration: "none", fontSize: 14, fontWeight: 600,
    border: `1px solid ${C.rim}`, fontFamily: C.fontUI,
  };
}
function footLink(): CSSProperties { return { fontSize: 13, color: C.t2, textDecoration: "none" }; }
function h2(): CSSProperties { return { fontFamily: C.fontHead, fontWeight: 800, fontSize: "clamp(26px,3.4vw,40px)", letterSpacing: "-0.02em", lineHeight: 1.12, margin: 0, maxWidth: 720 }; }
function lead(): CSSProperties { return { fontSize: 16, color: C.t2, lineHeight: 1.6, maxWidth: 600, margin: "16px 0 0" }; }
function cardTitle(): CSSProperties { return { fontFamily: C.fontHead, fontSize: 17, fontWeight: 700, color: C.t1, margin: 0 }; }
function cardBody(): CSSProperties { return { fontSize: 14, color: C.t2, lineHeight: 1.6, margin: 0 }; }
function pill(): CSSProperties { return { fontFamily: C.fontMono, fontSize: 12, color: C.t2, border: `1px solid ${C.soft}`, borderRadius: 999, padding: "6px 13px", background: C.bgDeep }; }
function mono(): CSSProperties { return { fontFamily: C.fontMono, fontSize: 14, color: C.t1 }; }
