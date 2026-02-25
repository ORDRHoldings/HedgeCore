"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronDown, ChevronRight, BookOpen, Zap, BarChart2, GitMerge, Shield, Terminal, ExternalLink, Info, FlaskConical } from "lucide-react";
const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)", bgPanel: "var(--bg-panel)", bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)", primary: "var(--text-primary)", secondary: "var(--text-secondary)", tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)", amber: "var(--accent-amber)", pass: "var(--status-pass)",
} as const;
const PIPELINE_STEPS = [
  { n: 1, label: "Position Ingestion",    sub: "CSV / ERP / API",     path: "/input",       color: S.cyan  },
  { n: 2, label: "Policy Assignment",     sub: "Template selection",  path: "/policies",    color: S.cyan  },
  { n: 3, label: "Sandbox Simulation",    sub: "Run engine",          path: "/sandbox",     color: S.amber },
  { n: 4, label: "Results Analysis",      sub: "R² · MTM · DVO1",  path: "/results",     color: S.amber },
  { n: 5, label: "Staging & Approval",    sub: "4-eyes governance",   path: "/staging",     color: S.pass  },
  { n: 6, label: "Ledger Commit",         sub: "WORM audit chain",    path: "/ledger",      color: S.pass  },
  { n: 7, label: "Execution & Reporting", sub: "MiFID II / IFRS 9",  path: "/execution",   color: S.pass  },
];
const FORMULAS = [
  { label: "Hedge Notional",      latex: "H_N = E_USD × r_hedge",     desc: "Exposure × hedge ratio from active policy.",          source: "IFRS 9.6.4" },
  { label: "All-in Rate",         latex: "R_all-in = S_0 + F_pts",  desc: "Spot rate plus forward points (NDF settlement).",     source: "ISDA FX Definitions" },
  { label: "Hedge Effectiveness", latex: "R² = 1 − SSR / SST",       desc: "Coefficient of determination: hedged vs instrument.", source: "IFRS 9.B6.4.16" },
  { label: "Coverage Ratio",      latex: "HC% = H_N / E_gross × 100", desc: "Proportion of gross exposure under hedge.",           source: "Basel III §88" },
];
const WIDGETS = [
  { label: "Portfolio KPIs",      desc: "Exposure, coverage %, proposals, alerts — scoped to your authority." },
  { label: "FX Exposure Summary", desc: "Per-currency bar chart: confirmed vs forecast, sorted by notional." },
  { label: "Pipeline Status",     desc: "Tri-state funnel: Sandbox → Staging → Ledger with pass rates." },
  { label: "Pending Approvals",   desc: "4-eyes proposals awaiting your second-approver signature." },
  { label: "Recent Runs",         desc: "Last 10 engine runs with status, pair, notional, and drill-through." },
  { label: "Active Hedge Policy", desc: "Current policy: risk posture, conf/fcst ratio, basis points." },
  { label: "Team Activity",       desc: "Live audit feed — filterable by Pipeline / Trades / Reports." },
  { label: "Branch Comparison",   desc: "Side-by-side risk metrics across branches (admin / supervisor)." },
  { label: "Quick Actions",       desc: "Permission-gated shortcuts to the most common actions." },
];
const QUICK_LINKS = [
  { label: "Policy Engine",  path: "/policies",    Icon: Shield       },
  { label: "Run Simulation", path: "/sandbox",     Icon: FlaskConical },
  { label: "Audit Trail",    path: "/audit-trail", Icon: BookOpen     },
  { label: "ORDR Terminal",  path: "/terminal",    Icon: Terminal     },
  { label: "HedgeWiki",      path: "/hedgewiki",   Icon: ExternalLink },
];
interface Props { onClose: () => void; role: string; }
export default function DashboardHelpPanel({ onClose, role }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set(["overview", "pipeline"]));
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isOpen = (id: string) => open.has(id);
  const roleLabel = role.replace(/_/g, " ").replace(/\w/g, c => c.toUpperCase());
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: S.fontUI, color: S.primary }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 10px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.6rem", color: S.cyan, letterSpacing: "0.12em", marginBottom: 2 }}>? HELP · ORDR PLATFORM</div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700, color: S.primary, letterSpacing: "0.02em" }}>Dashboard</div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary, letterSpacing: "0.1em", marginTop: 1 }}>COMMAND CENTRE · {roleLabel.toUpperCase()}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: `1px solid ${S.rim}`, cursor: "pointer", padding: 4, color: S.tertiary, display: "flex", alignItems: "center", lineHeight: 1 }}><X size={13} /></button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <Sec id="overview" label="What this page does" icon={<Info size={12} color={S.cyan} />} isOpen={isOpen("overview")} onToggle={toggle} S={S}>
          <p style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.5, margin: 0 }}>The <strong style={{ color: S.cyan }}>Dashboard</strong> is your institutional command centre — a role-based drag-and-resize widget grid showing live metrics.</p>
          <p style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.5, margin: "8px 0 0" }}>Your layout saves automatically. Widgets are filtered by your <strong style={{ color: S.amber }}>{roleLabel}</strong> permissions.</p>
          <div style={{ marginTop: 10, padding: "8px 10px", background: `color-mix(in srgb, ${S.cyan} 6%, transparent)`, border: `1px solid ${S.cyan}22`, fontFamily: S.fontMono, fontSize: "0.6rem", color: S.secondary, lineHeight: 1.6 }}><strong style={{ color: S.cyan }}>Tip:</strong> Click <em>Add Widget</em> to browse the catalog.</div>
        </Sec>
        <Sec id="pipeline" label="7-Step Hedge Workflow" icon={<GitMerge size={12} color={S.amber} />} isOpen={isOpen("pipeline")} onToggle={toggle} S={S}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {PIPELINE_STEPS.map((step, idx) => (
              <div key={step.n} onClick={() => router.push(step.path)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", background: idx % 2 === 0 ? S.bgDeep : "transparent", cursor: "pointer", borderLeft: `2px solid ${step.color}`, marginBottom: 1 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: `color-mix(in srgb, ${step.color} 20%, transparent)`, border: `1px solid ${step.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: S.fontMono, fontSize: "0.55rem", color: step.color, fontWeight: 700, flexShrink: 0 }}>{step.n}</div>
                <div><div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary, fontWeight: 600 }}>{step.label}</div><div style={{ fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary, letterSpacing: "0.06em", marginTop: 1 }}>{step.sub}</div></div>
                <ExternalLink size={9} style={{ color: S.tertiary, flexShrink: 0, marginTop: 5, marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        </Sec>
        <Sec id="formulas" label="Key Formulas" icon={<Zap size={12} color={S.amber} />} isOpen={isOpen("formulas")} onToggle={toggle} S={S}>
          {FORMULAS.map(f => (
            <div key={f.label} style={{ marginBottom: 12, padding: "8px 10px", background: S.bgDeep, border: `1px solid ${S.rim}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.6rem", color: S.cyan, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>{f.label}</div>
              <div style={{ fontFamily: "'Times New Roman', serif", fontSize: "0.875rem", color: S.primary, padding: "4px 0", fontStyle: "italic" }}>{f.latex}</div>
              <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, marginTop: 4, lineHeight: 1.4 }}>{f.desc}</div>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary, marginTop: 4, letterSpacing: "0.06em" }}>Source: {f.source}</div>
            </div>
          ))}
        </Sec>
        <Sec id="widgets" label="Widget Glossary" icon={<BarChart2 size={12} color={S.cyan} />} isOpen={isOpen("widgets")} onToggle={toggle} S={S}>
          {WIDGETS.map(w => (
            <div key={w.label} style={{ display: "flex", flexDirection: "column", padding: "7px 0", borderBottom: `1px solid ${S.rim}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.primary, fontWeight: 600, letterSpacing: "0.04em" }}>{w.label}</div>
              <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, marginTop: 2, lineHeight: 1.4 }}>{w.desc}</div>
            </div>
          ))}
        </Sec>
        <Sec id="links" label="Quick Navigation" icon={<ExternalLink size={12} color={S.pass} />} isOpen={isOpen("links")} onToggle={toggle} S={S}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {QUICK_LINKS.map(({ label, path, Icon }) => (
              <button key={path} onClick={() => router.push(path)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: `1px solid ${S.rim}`, padding: "7px 10px", cursor: "pointer", color: S.secondary, fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.04em", textAlign: "left" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = S.cyan; (e.currentTarget as HTMLElement).style.color = S.cyan; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = S.rim; (e.currentTarget as HTMLElement).style.color = S.secondary; }}
              >
                <Icon size={11} />{label}<ChevronRight size={10} style={{ marginLeft: "auto", opacity: 0.4 }} />
              </button>
            ))}
          </div>
        </Sec>
      </div>
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <BookOpen size={10} style={{ color: S.tertiary }} />
        <button onClick={() => router.push("/hedgewiki")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono, fontSize: "0.55rem", color: S.cyan, letterSpacing: "0.06em", textDecoration: "underline", padding: 0 }}>Full Documentation → HedgeWiki</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => router.push("/help")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary, letterSpacing: "0.06em", padding: 0 }}>Help Centre</button>
      </div>
    </div>
  );
}
function Sec({ id, label, icon, isOpen, onToggle, S: _S, children }: { id: string; label: string; icon: React.ReactNode; isOpen: boolean; onToggle: (id: string) => void; S: typeof S; children: React.ReactNode; }) {
  return (
    <div style={{ borderBottom: `1px solid ${_S.rim}` }}>
      <button onClick={() => onToggle(id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: isOpen ? `color-mix(in srgb, ${_S.cyan} 4%, transparent)` : "transparent", border: "none", cursor: "pointer", fontFamily: _S.fontMono, fontSize: "0.6875rem", color: isOpen ? _S.primary : _S.secondary, fontWeight: 600, letterSpacing: "0.04em", textAlign: "left", transition: "background 120ms" }}>
        {icon}<span style={{ flex: 1 }}>{label}</span>
        {isOpen ? <ChevronDown size={12} style={{ color: _S.tertiary }} /> : <ChevronRight size={12} style={{ color: _S.tertiary }} />}
      </button>
      {isOpen && <div style={{ padding: "4px 14px 12px" }}>{children}</div>}
    </div>
  );
}
