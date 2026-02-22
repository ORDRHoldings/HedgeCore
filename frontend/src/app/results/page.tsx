"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useHedge } from '../../lib/hedgeContext';
import { deriveCurrencyContext } from '../../utils/currencyContext';
import ExportBar from '../../components/export/ExportBar';
import TabBar from '../../components/tabs/TabBar';
import OverviewTab from '../../components/tabs/OverviewTab';
import ExposureTab from '../../components/tabs/ExposureTab';
import RiskAnalysisTab from '../../components/tabs/RiskAnalysisTab';
import ExecutionTab from '../../components/tabs/ExecutionTab';
import AuditTab from '../../components/tabs/AuditTab';
import ReportsContainer from '../../components/reports/ReportsContainer';
import NotificationsContainer from '../../components/notifications/NotificationsContainer';

// ── Committee Pack: Top-level module navigation ───────────────────────────────
const TOP_LEVEL_SECTIONS = [
  { key: 'execution',     label: 'Execution Desk',    icon: '⬡' },
  { key: 'reports',       label: 'Committee Reports', icon: '▤' },
  { key: 'notifications', label: 'Controls & Alerts', icon: '◈' },
];

// ── Execution Desk: sub-tab navigation ───────────────────────────────────────
const EXECUTION_TABS = [
  { key: 'overview',  label: 'Committee Summary' },
  { key: 'exposure',  label: 'Exposure & Buckets' },
  { key: 'risk',      label: 'Scenario Analysis' },
  { key: 'execution', label: 'Trade Tickets' },
  { key: 'audit',     label: 'Audit Evidence' },
];

const VALID_EXECUTION_TABS = EXECUTION_TABS.map(t => t.key);

function getInitialSection(): string {
  if (typeof window === 'undefined') return 'execution';
  const params = new URLSearchParams(window.location.search);
  return params.get('section') ?? 'execution';
}

function getInitialExecutionTab(): string {
  if (typeof window === 'undefined') return 'overview';
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') ?? '';
  return VALID_EXECUTION_TABS.includes(tab) ? tab : 'overview';
}

export default function ResultsPage() {
  const { result, lastInputs } = useHedge();
  const [activeSection, setActiveSection] = useState(getInitialSection);
  const [activeExecutionTab, setActiveExecutionTab] = useState(getInitialExecutionTab);

  const baseCcy = lastInputs
    ? deriveCurrencyContext(lastInputs.trades, lastInputs.market).baseCcy
    : 'MXN';

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set('section', section);
    window.history.replaceState({}, '', url.toString());
  };

  const handleExecutionTabChange = (tab: string) => {
    setActiveExecutionTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-full border border-[var(--border-rim)] flex items-center justify-center mb-4 text-[var(--text-tertiary)] text-xl">
          ◈
        </div>
        <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">No Committee Pack generated</p>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Run a calculation from the input page to produce a committee-grade hedge plan.
        </p>
        <Link
          href="/"
          className="px-4 py-2 text-sm font-medium border border-[var(--accent-cyan)] text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/5 transition-colors"
        >
          Go to Input Page
        </Link>
      </div>
    );
  }

  const runTs = new Date(result.run_envelope.timestamp);
  const runLabel =
    runTs.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    runTs.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
    ' UTC';

  const validationStatus = result.validation_report.status;
  const alertCount =
    (result.validation_report.errors?.length ?? 0) +
    (result.validation_report.warnings?.length ?? 0);

  return (
    <div className="space-y-0">
      {/* ── TIER 1: Run Identity Header ─────────────────────────────────────── */}
      <div className="bg-[var(--bg-panel)] border-b border-[var(--border-rim)] px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2
                  className="text-base font-bold text-[var(--text-primary)] tracking-tight"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Committee Pack
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 border border-[var(--border-rim)] text-[var(--text-tertiary)] tracking-widest uppercase">
                  {baseCcy}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 border tracking-widest uppercase ${
                    validationStatus === 'PASS'
                      ? 'border-[var(--accent-green)] text-[var(--accent-green)] bg-[var(--accent-green)]/5'
                      : 'border-[var(--accent-red)] text-[var(--accent-red)] bg-[var(--accent-red)]/5'
                  }`}
                >
                  {validationStatus}
                </span>
                {alertCount > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 border border-[var(--accent-amber)] text-[var(--accent-amber)] bg-[var(--accent-amber)]/5 tracking-widest uppercase">
                    {alertCount} alert{alertCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--text-tertiary)]">
                <span>
                  Run <span className="text-[var(--text-secondary)]">{result.run_id.slice(0, 12)}…</span>
                </span>
                <span className="text-[var(--border-rim)]">·</span>
                <span>{runLabel}</span>
                <span className="text-[var(--border-rim)]">·</span>
                <span>
                  Engine <span className="text-[var(--text-secondary)]">v{result.run_envelope.engine_version}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="no-print flex items-center gap-2">
            <Link
              href="/input"
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border border-[var(--border-rim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
              style={{ fontFamily: 'var(--font-terminal, var(--font-ui))' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              New Calculation
            </Link>
            <ExportBar result={result} baseCcy={baseCcy} />
          </div>
        </div>
      </div>

      {/* ── TIER 2: Module Navigation ────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-[var(--bg-panel)] border-b border-[var(--border-rim)] no-print">
        <div className="flex items-center gap-0 px-6">
          {TOP_LEVEL_SECTIONS.map((section) => {
            const isActive = activeSection === section.key;
            const showBadge = section.key === 'notifications' && alertCount > 0;
            return (
              <button
                key={section.key}
                onClick={() => handleSectionChange(section.key)}
                className={`
                  relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors
                  ${isActive
                    ? 'text-[var(--accent-cyan)] border-b-2 border-[var(--accent-cyan)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-b-2 border-transparent'
                  }
                `}
              >
                <span className="text-[10px] opacity-60">{section.icon}</span>
                {section.label}
                {showBadge && (
                  <span className="ml-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] border border-[var(--accent-amber)]/30">
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TIER 3: Module Content ───────────────────────────────────────────── */}

      {/* ── Execution Desk ── */}
      {activeSection === 'execution' && (
        <div>
          <div className="sticky top-[57px] z-30 bg-[var(--bg-deep)] border-b border-[var(--border-soft)] no-print px-6">
            <TabBar
              tabs={EXECUTION_TABS}
              activeTab={activeExecutionTab}
              onTabChange={handleExecutionTabChange}
            />
          </div>

          <div className="px-6 py-6">
            {activeExecutionTab === 'overview' && (
              <div>
                <div className="cp-section-header mb-5">
                  <span className="cp-section-index">01</span>
                  <h3 className="cp-section-title">Committee Summary</h3>
                  <span className="cp-badge">Deterministic · Snapshot-Bound</span>
                </div>
                <OverviewTab
                  summary={result.hedge_plan.summary}
                  totals={result.scenario_results.totals}
                />
              </div>
            )}

            {activeExecutionTab === 'exposure' && (
              <div>
                <div className="cp-section-header mb-5">
                  <span className="cp-section-index">02</span>
                  <h3 className="cp-section-title">Exposure &amp; Buckets</h3>
                </div>
                <ExposureTab hedgePlan={result.hedge_plan} />
              </div>
            )}

            {activeExecutionTab === 'risk' && (
              <div>
                <div className="cp-section-header mb-5">
                  <span className="cp-section-index">03</span>
                  <h3 className="cp-section-title">Scenario Analysis</h3>
                </div>
                <RiskAnalysisTab
                  scenarioResults={result.scenario_results}
                  summary={result.hedge_plan.summary}
                />
              </div>
            )}

            {activeExecutionTab === 'execution' && (
              <div>
                <div className="cp-section-header mb-5">
                  <span className="cp-section-index">04</span>
                  <h3 className="cp-section-title">Trade Tickets</h3>
                  <span className="cp-badge">Run {result.run_id.slice(0, 8)}…</span>
                </div>
                <ExecutionTab
                  hedgePlan={result.hedge_plan}
                  scenarioResults={result.scenario_results}
                  runId={result.run_id}
                  baseCcy={baseCcy}
                />
              </div>
            )}

            {activeExecutionTab === 'audit' && (
              <div>
                <div className="cp-section-header mb-5">
                  <span className="cp-section-index">05</span>
                  <h3 className="cp-section-title">Audit Evidence</h3>
                  <span className="cp-badge">Trace &amp; Attestation</span>
                </div>
                <AuditTab
                  runEnvelope={result.run_envelope}
                  traceLite={result.trace_lite}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Committee Reports ── */}
      {activeSection === 'reports' && (
        <div className="px-6 py-6">
          <div className="cp-section-header mb-6">
            <span className="cp-section-index">○</span>
            <h3 className="cp-section-title">Committee Reports</h3>
            <span className="cp-badge">6 Report Categories · Insight-Heavy</span>
          </div>
          <ReportsContainer result={result} baseCcy={baseCcy} />
        </div>
      )}

      {/* ── Controls & Alerts ── */}
      {activeSection === 'notifications' && (
        <div className="px-6 py-6">
          <div className="cp-section-header mb-6">
            <span className="cp-section-index">○</span>
            <h3 className="cp-section-title">Controls &amp; Alerts</h3>
            {alertCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 border border-[var(--accent-amber)] text-[var(--accent-amber)] tracking-widest uppercase">
                {alertCount} item{alertCount !== 1 ? 's' : ''} require attention
              </span>
            )}
          </div>
          <NotificationsContainer result={result} />
        </div>
      )}

      <style>{`
        .cp-section-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cp-section-index {
          font-size: 10px;
          font-family: var(--font-mono);
          color: var(--text-tertiary);
          letter-spacing: 0.1em;
          flex-shrink: 0;
        }
        .cp-section-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text-primary);
          font-family: var(--font-heading);
          letter-spacing: -0.01em;
          margin: 0;
        }
        .cp-badge {
          font-size: 9px;
          font-family: var(--font-mono);
          color: var(--text-tertiary);
          border: 1px solid var(--border-rim);
          padding: 2px 6px;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
