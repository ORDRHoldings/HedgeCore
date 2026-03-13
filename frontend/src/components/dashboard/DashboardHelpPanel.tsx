"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X, ChevronDown, ChevronRight, BookOpen, Zap, BarChart2, GitMerge,
  Shield, Terminal, ExternalLink, Info, FlaskConical, Globe2, DollarSign,
  Activity, LayoutDashboard, Radio, Landmark, FileInput, Rocket, FileBarChart,
  Settings, Cpu, Wallet,
} from "lucide-react";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)", bgPanel: "var(--bg-panel)", bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)", soft: "var(--border-soft)",
  primary: "var(--text-primary)", secondary: "var(--text-secondary)", tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)", amber: "var(--accent-amber)", pass: "var(--status-pass)",
  red: "var(--accent-red,#B91C1C)",
} as const;

const PIPELINE_STEPS = [
  { n: 1, label: "Position Ingestion",    sub: "CSV / ERP / API",     path: "/position-desk",       color: S.cyan  },
  { n: 2, label: "Policy Assignment",     sub: "Template selection",  path: "/policies",    color: S.cyan  },
  { n: 3, label: "Sandbox Simulation",    sub: "Run engine",          path: "/sandbox",     color: S.amber },
  { n: 4, label: "Results Analysis",      sub: "R² · MTM · DVO1",  path: "/results",     color: S.amber },
  { n: 5, label: "Staging & Approval",    sub: "4-eyes governance",   path: "/staging",     color: S.pass  },
  { n: 6, label: "Ledger Commit",         sub: "WORM audit chain",    path: "/ledger",      color: S.pass  },
  { n: 7, label: "Execution & Reporting", sub: "MiFID II / IFRS 9",  path: "/hedge-desk",   color: S.pass  },
];

const FORMULAS = [
  { label: "Hedge Notional",      latex: "H_N = E_USD × r_hedge",      desc: "Exposure × hedge ratio from active policy.",          source: "IFRS 9.6.4" },
  { label: "All-in Rate",         latex: "R_all-in = S_0 + F_pts",   desc: "Spot rate plus forward points (NDF settlement).",     source: "ISDA FX Definitions" },
  { label: "Hedge Effectiveness", latex: "R² = 1 − SSR / SST",        desc: "Coefficient of determination: hedged vs instrument.", source: "IFRS 9.B6.4.16" },
  { label: "Coverage Ratio",      latex: "HC% = H_N / E_gross × 100",  desc: "Proportion of gross exposure under hedge.",           source: "Basel III §88" },
];

interface WidgetEntry {
  label: string;
  desc: string;
  category: "intelligence" | "operations" | "navigation" | "market";
  color: string;
}

const WIDGETS: WidgetEntry[] = [
  // Intelligence & Risk
  { label: "Geopolitical & Macro",  desc: "POLISOPHIC-powered 3-tab panel: geo risk events with severity levels, macro tape (DXY, VIX, bonds, commodities), and central bank rate tracker.",                category: "intelligence", color: S.amber },
  { label: "Currency Intelligence", desc: "Per-currency deep-dive: risk score, implied vol, policy rate, CPI, GDP, central bank stance, and macro headlines. Defaults to USD when no positions exist.",     category: "intelligence", color: S.amber },
  { label: "USD Exposure Radar",    desc: "USD-centric analysis: DXY overview, FX matrix with spot/vol/carry/forward points for 8 pairs, and USD strength divergence chart.",                               category: "intelligence", color: S.cyan },

  // Market Data
  { label: "Market Pulse",          desc: "Bloomberg-style 4×2 ticker grid: SPX, DXY, VIX, UST10, WTI, Gold, EUR/USD, USD/JPY with live market session indicator.",                                       category: "market", color: S.pass },
  { label: "FX Rates",              desc: "BIS-calibrated reference rates for 8 major and EM currency pairs with 5-minute auto-refresh and trend indicators.",                                              category: "market", color: S.pass },

  // Operations & KPIs
  { label: "System Pulse",          desc: "Application health score, 6 KPI tiles (exposure, coverage, proposals, approvals, alerts, team), and tri-state pipeline funnel.",                                 category: "operations", color: S.cyan },
  { label: "Portfolio KPIs",        desc: "Total exposure, hedge coverage %, active proposals, pending approvals, open alerts, team size — scoped to your authority.",                                       category: "operations", color: S.cyan },
  { label: "Hedge Health",          desc: "Composite 0-100 health score across 5 dimensions. Shows setup checklist when starting fresh.",                                                                   category: "operations", color: S.cyan },
  { label: "Pipeline Status",       desc: "Tri-state funnel visualization: Sandbox → Staging → Ledger with pass rates and flow summary.",                                                                  category: "operations", color: S.cyan },
  { label: "Pending Approvals",     desc: "4-eyes proposals awaiting your second-approver signature with urgency chips.",                                                                                   category: "operations", color: S.cyan },
  { label: "Recent Runs",           desc: "Last 10 engine runs with status, pair, notional, hedge ratio, and drill-through.",                                                                               category: "operations", color: S.cyan },
  { label: "FX Exposure Summary",   desc: "Per-currency stacked bars: confirmed vs forecast exposure, sorted by notional.",                                                                                 category: "operations", color: S.cyan },
  { label: "Active Hedge Policy",   desc: "Current policy template: risk posture, confirmed/forecast ratios, basis points, execution product.",                                                             category: "operations", color: S.cyan },
  { label: "Team Activity",         desc: "Live audit feed — filterable by Pipeline / Trades / Reports, branch-scoped.",                                                                                    category: "operations", color: S.cyan },
  { label: "Branch Comparison",     desc: "Side-by-side risk and exposure metrics across all branches (admin / supervisor).",                                                                               category: "operations", color: S.cyan },

  // Navigation
  { label: "Command Hub",           desc: "Visual navigation grid to 12 app modules with color-coded icons, shortcut badges, and role-filtered visibility.",                                                category: "navigation", color: S.pass },
  { label: "Quick Actions",         desc: "Permission-gated 2-column shortcut grid to your most common actions.",                                                                                           category: "navigation", color: S.pass },
];

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  intelligence: { label: "INTELLIGENCE & RISK", color: S.amber },
  market:       { label: "MARKET DATA",         color: S.pass },
  operations:   { label: "OPERATIONS & KPIS",   color: S.cyan },
  navigation:   { label: "NAVIGATION",          color: S.pass },
};

const QUICK_LINKS = [
  { label: "Position Desk",  path: "/position-desk", Icon: FileInput     },
  { label: "Policy Engine",  path: "/policies",      Icon: Shield        },
  { label: "Execution",      path: "/hedge-desk",     Icon: Rocket        },
  { label: "Sandbox",        path: "/sandbox",       Icon: FlaskConical  },
  { label: "Reports",        path: "/reports",       Icon: FileBarChart  },
  { label: "FX Rates",       path: "/market-intelligence",   Icon: Globe2        },
  { label: "Audit Trail",    path: "/audit-trail",   Icon: BookOpen      },
  { label: "Polisophic",     path: "/polisophic",    Icon: Landmark      },
  { label: "Connectors",     path: "/connectors",    Icon: Cpu           },
  { label: "Hedge Wiki",     path: "/hedgewiki",     Icon: Wallet        },
  { label: "Settings",       path: "/settings",      Icon: Settings      },
];

interface Props { onClose: () => void; role: string; }

export default function DashboardHelpPanel({ onClose, role }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set(["overview", "pipeline"]));
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isOpen = (id: string) => open.has(id);
  const roleLabel = role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const categories = ["intelligence", "market", "operations", "navigation"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: S.fontUI, color: S.primary }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 10px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.6rem", color: S.cyan, letterSpacing: "0.12em", marginBottom: 2 }}>? HELP · ORDR PLATFORM</div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.8125rem", fontWeight: 700, color: S.primary, letterSpacing: "0.02em" }}>Dashboard</div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary, letterSpacing: "0.1em", marginTop: 1 }}>COMMAND CENTRE · {roleLabel.toUpperCase()}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: `1px solid ${S.rim}`, cursor: "pointer", padding: 4, color: S.tertiary, display: "flex", alignItems: "center", lineHeight: 1 }}><X size={13} /></button>
      </div>

      {/* Sections */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Overview */}
        <Sec id="overview" label="What this page does" icon={<Info size={12} color={S.cyan} />} isOpen={isOpen("overview")} onToggle={toggle}>
          <p style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.55, margin: 0 }}>
            The <strong style={{ color: S.cyan }}>Dashboard</strong> is your institutional command centre — a role-based, drag-and-resize widget grid showing live metrics, market intelligence, and system health.
          </p>
          <p style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.55, margin: "8px 0 0" }}>
            Your layout saves automatically per user. Widgets are filtered by your <strong style={{ color: S.amber }}>{roleLabel}</strong> permissions. Click <strong>Reset</strong> to restore the default layout for your role.
          </p>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { icon: "⊕", text: "Add Widget — browse the full catalog of 17 widgets" },
              { icon: "↻", text: "Reset — restore role-default layout" },
              { icon: "⤡", text: "Drag headers to reposition, resize from corners" },
              { icon: "×", text: "Remove individual widgets with the × button" },
            ].map((tip) => (
              <div key={tip.text} style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                fontFamily: S.fontMono, fontSize: "0.6rem", color: S.secondary, lineHeight: 1.4,
              }}>
                <span style={{ color: S.cyan, fontWeight: 700, flexShrink: 0, width: 14, textAlign: "center" }}>{tip.icon}</span>
                <span>{tip.text}</span>
              </div>
            ))}
          </div>
        </Sec>

        {/* 7-Step Hedge Workflow */}
        <Sec id="pipeline" label="7-Step Hedge Workflow" icon={<GitMerge size={12} color={S.amber} />} isOpen={isOpen("pipeline")} onToggle={toggle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {PIPELINE_STEPS.map((step, idx) => (
              <div key={step.n} onClick={() => router.push(step.path)} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px",
                background: idx % 2 === 0 ? S.bgDeep : "transparent",
                cursor: "pointer", borderLeft: `2px solid ${step.color}`, marginBottom: 1,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: `color-mix(in srgb, ${step.color} 20%, transparent)`,
                  border: `1px solid ${step.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: S.fontMono, fontSize: "0.55rem", color: step.color, fontWeight: 700, flexShrink: 0,
                }}>{step.n}</div>
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary, fontWeight: 600 }}>{step.label}</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary, letterSpacing: "0.06em", marginTop: 1 }}>{step.sub}</div>
                </div>
                <ExternalLink size={9} style={{ color: S.tertiary, flexShrink: 0, marginTop: 5, marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        </Sec>

        {/* Widget Gallery */}
        <Sec id="widgets" label={`Widget Gallery · ${WIDGETS.length}`} icon={<BarChart2 size={12} color={S.cyan} />} isOpen={isOpen("widgets")} onToggle={toggle}>
          <div style={{
            fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.5,
            marginBottom: 10,
          }}>
            All available widgets organized by function. Add any from the catalog.
          </div>

          {categories.map((cat) => {
            const meta = CATEGORY_META[cat];
            const items = WIDGETS.filter((w) => w.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 12 }}>
                {/* Category header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  marginBottom: 6, padding: "4px 0",
                }}>
                  <div style={{
                    width: 3, height: 12, borderRadius: 1,
                    background: meta.color,
                  }} />
                  <span style={{
                    fontFamily: S.fontMono, fontSize: "0.55rem", fontWeight: 700,
                    color: meta.color, letterSpacing: "0.1em",
                  }}>
                    {meta.label}
                  </span>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary,
                    background: `color-mix(in srgb, ${S.tertiary} 10%, transparent)`,
                    padding: "0 4px", borderRadius: 2,
                  }}>
                    {items.length}
                  </span>
                </div>

                {/* Widget entries */}
                {items.map((w) => (
                  <div key={w.label} style={{
                    padding: "6px 10px", marginBottom: 2,
                    borderLeft: `2px solid ${w.color}22`,
                  }}>
                    <div style={{
                      fontFamily: S.fontMono, fontSize: "0.625rem", color: S.primary,
                      fontWeight: 600, letterSpacing: "0.02em",
                    }}>
                      {w.label}
                    </div>
                    <div style={{
                      fontFamily: S.fontUI, fontSize: "0.625rem", color: S.tertiary,
                      marginTop: 2, lineHeight: 1.4,
                    }}>
                      {w.desc}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </Sec>

        {/* Key Formulas */}
        <Sec id="formulas" label="Key Formulas" icon={<Zap size={12} color={S.amber} />} isOpen={isOpen("formulas")} onToggle={toggle}>
          {FORMULAS.map(f => (
            <div key={f.label} style={{ marginBottom: 12, padding: "8px 10px", background: S.bgDeep, border: `1px solid ${S.rim}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.6rem", color: S.cyan, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>{f.label}</div>
              <div style={{ fontFamily: "'Times New Roman', serif", fontSize: "0.875rem", color: S.primary, padding: "4px 0", fontStyle: "italic" }}>{f.latex}</div>
              <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, marginTop: 4, lineHeight: 1.4 }}>{f.desc}</div>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary, marginTop: 4, letterSpacing: "0.06em" }}>Source: {f.source}</div>
            </div>
          ))}
        </Sec>

        {/* Quick Navigation */}
        <Sec id="links" label="Quick Navigation" icon={<ExternalLink size={12} color={S.pass} />} isOpen={isOpen("links")} onToggle={toggle}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4,
          }}>
            {QUICK_LINKS.map(({ label, path, Icon }) => (
              <button key={path} onClick={() => router.push(path)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "transparent", border: `1px solid ${S.rim}`,
                  padding: "7px 8px", cursor: "pointer", color: S.secondary,
                  fontFamily: S.fontMono, fontSize: "0.6rem", letterSpacing: "0.03em",
                  textAlign: "left", borderRadius: 3,
                  transition: "all 150ms",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = S.cyan; (e.currentTarget as HTMLElement).style.color = S.cyan; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = S.rim; (e.currentTarget as HTMLElement).style.color = S.secondary; }}
              >
                <Icon size={10} style={{ flexShrink: 0 }} />{label}
              </button>
            ))}
          </div>
        </Sec>
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <BookOpen size={10} style={{ color: S.tertiary }} />
        <button onClick={() => router.push("/hedgewiki")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono, fontSize: "0.55rem", color: S.cyan, letterSpacing: "0.06em", textDecoration: "underline", padding: 0 }}>Full Documentation → HedgeWiki</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => router.push("/help")} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary, letterSpacing: "0.06em", padding: 0 }}>Help Centre</button>
      </div>
    </div>
  );
}

function Sec({ id, label, icon, isOpen, onToggle, children }: {
  id: string; label: string; icon: React.ReactNode; isOpen: boolean;
  onToggle: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: `1px solid ${S.rim}` }}>
      <button onClick={() => onToggle(id)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        background: isOpen ? `color-mix(in srgb, ${S.cyan} 4%, transparent)` : "transparent",
        border: "none", cursor: "pointer",
        fontFamily: S.fontMono, fontSize: "0.6875rem",
        color: isOpen ? S.primary : S.secondary,
        fontWeight: 600, letterSpacing: "0.04em", textAlign: "left",
        transition: "background 120ms",
      }}>
        {icon}<span style={{ flex: 1 }}>{label}</span>
        {isOpen ? <ChevronDown size={12} style={{ color: S.tertiary }} /> : <ChevronRight size={12} style={{ color: S.tertiary }} />}
      </button>
      {isOpen && <div style={{ padding: "4px 14px 12px" }}>{children}</div>}
    </div>
  );
}
