"use client";

import { Suspense, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useHedge } from '../../lib/hedgeContext';
import { useSelector } from 'react-redux';
import type { RootState } from '../../lib/store';
import ExecutionBridge from '../../components/execution/ExecutionBridge';
import { deriveCurrencyContext } from '../../utils/currencyContext';
import HelpPanel from "@/components/layout/HelpPanel";
import { EXECUTION_HELP } from "@/lib/helpContent";

// ─── Internal sub-nav tabs ─────────────────────────────────────────────────────
type ExecTab = 'bridge' | 'sim';

const S = {
  fontMono: "'IBM Plex Mono', monospace",
  fontUI:   "'IBM Plex Sans', sans-serif",
};

// ─── Execution Hub Content ─────────────────────────────────────────────────────
function ExecutionHubContent() {
  const router = useRouter();
  const params = useSearchParams();
  const bucketParam = params.get('bucket') ?? null;
  const tabParam = (params.get('tab') as ExecTab | null) ?? 'bridge';

  const [activeTab,    setActiveTab]    = useState<ExecTab>(tabParam);
  const [authReady,    setAuthReady]    = useState(false);

  const { result, lastInputs } = useHedge();
  const { sandboxResult } = useSelector((s: RootState) => s.pipeline);

  const handleAuthStatusChange = useCallback((ready: boolean) => {
    setAuthReady(ready);
  }, []);

  const baseCcy = lastInputs
    ? deriveCurrencyContext(lastInputs.trades, lastInputs.market).baseCcy
    : 'MXN';

  const hasPlan = !!result;
  const hasSimulation = !!sandboxResult;

  const handleTabChange = (tab: ExecTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
    if (tab === 'sim') router.push('/sandbox');
  };

  // ── Deprecation banner ───────────────────────────────────────────────────────
  const deprecationBanner = (
    <div style={{
      padding: "8px 20px",
      background: "color-mix(in srgb, var(--accent-amber) 8%, transparent)",
      border: "none",
      borderBottom: "1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)",
      display: "flex", alignItems: "center", gap: 10,
      fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
      fontSize: 10, color: "var(--accent-amber)", letterSpacing: "0.06em",
    }}>
      <span>⚠</span>
      <span>LEGACY INTERFACE — This page is superseded by the</span>
      <button
        onClick={() => router.push("/execution-desk")}
        style={{
          fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
          fontSize: 10, fontWeight: 700, color: "var(--accent-cyan)",
          background: "transparent", border: "none", cursor: "pointer",
          padding: 0, letterSpacing: "0.06em", textDecoration: "underline",
        }}
      >
        EXECUTION DESK →
      </button>
      <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>Maintained for simulation use only.</span>
    </div>
  );

  // ── Shared header strip ──────────────────────────────────────────────────────
  const header = (
    <div style={{
      height: 44,
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border-rim)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: 0,
      flexShrink: 0,
    }}>
      {/* Back to Position Desk */}
      <button
        onClick={() => router.push('/input')}
        style={{
          fontFamily: S.fontUI,
          fontSize: '0.625rem', fontWeight: 500,
          padding: '2px 8px', border: '1px solid var(--border-rim)',
          color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer',
          marginRight: 16,
        }}
      >
        ← Position Desk
      </button>

      {/* Sub-nav tabs */}
      <div style={{ display: 'flex', height: '100%', gap: 0 }}>
        {([
          { key: 'bridge', label: 'Execution Bridge', badge: hasPlan ? result!.hedge_plan.buckets.filter(b => !b.suppressed).length : 0 },
          { key: 'sim',    label: 'Simulation Engine', badge: null },
        ] as { key: ExecTab; label: string; badge: number | null }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            style={{
              fontFamily: S.fontUI,
              fontSize: '0.6875rem', fontWeight: activeTab === tab.key ? 600 : 400,
              padding: '0 16px',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
              background: 'transparent', cursor: 'pointer',
              height: '100%',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span style={{
                fontFamily: S.fontMono,
                fontSize: '0.6875rem',
                background: 'var(--accent-cyan)',
                color: '#0a0f14',
                borderRadius: 2,
                padding: '1px 5px',
                fontWeight: 700,
              }}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Auth status chip */}
      {result && (
        <span style={{
          fontFamily:   S.fontMono,
          fontSize:     '0.625rem',
          fontWeight:   700,
          letterSpacing:'0.08em',
          color:        authReady ? 'var(--status-pass,#4ade80)' : 'var(--accent-amber)',
          background:   authReady ? 'color-mix(in srgb, var(--status-pass,#4ade80) 10%, transparent)' : 'color-mix(in srgb, var(--accent-amber) 10%, transparent)',
          border:       `1px solid ${authReady ? 'color-mix(in srgb, var(--status-pass,#4ade80) 25%, transparent)' : 'color-mix(in srgb, var(--accent-amber) 25%, transparent)'}`,
          padding:      '2px 8px',
          borderRadius: 2,
        }}>
          {authReady ? 'READY' : 'PENDING AUTH'}
        </span>
      )}

      {/* Execution History link */}
      <Link
        href="/execution-history"
        style={{
          fontFamily:   S.fontMono,
          fontSize:     '0.625rem',
          color:        'var(--text-tertiary)',
          textDecoration:'none',
          padding:      '2px 8px',
          border:       '1px solid var(--border-rim)',
          borderRadius: 2,
          transition:   'color 0.12s',
        }}
      >
        Execution Log →
      </Link>

      {/* Run ID chip */}
      {result && (
        <span style={{
          fontFamily: S.fontMono,
          fontSize: '0.6875rem', color: 'var(--text-tertiary)',
          letterSpacing: '0.06em',
        }}>
          RUN <span style={{ color: 'var(--accent-cyan)' }}>{result.run_id.slice(0, 8).toUpperCase()}</span>
        </span>
      )}
    </div>
  );

  // ── No plan yet — empty state ────────────────────────────────────────────────
  if (!hasPlan) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{
        minHeight: '100%',
        fontFamily: S.fontUI,
        color: 'var(--text-primary)',
        background: 'var(--bg-deep)',
        display: 'flex', flexDirection: 'column',
        flex: 1,
      }}>
        {header}
        {deprecationBanner}

        {/* Two-column empty state */}
        <div style={{ maxWidth: '72rem', margin: '60px auto', padding: '0 20px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{
              width: 52, height: 52,
              border: '1px solid var(--border-rim)',
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <polyline points="2,20 6,14 10,16 14,8 18,12 22,4" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
              Execution Hub
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto 28px' }}>
              This is your central command for hedge execution. Generate a hedge plan from the
              Position Desk, then return here to review execution tickets and market data.
            </p>
          </div>

          {/* Workflow cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              {
                step: '01',
                title: 'Load Positions',
                desc: 'Add exposure data on the Position Desk — manually or via CSV upload.',
                href: '/input',
                label: 'Go to Position Desk',
                color: 'var(--text-tertiary)',
              },
              {
                step: '02',
                title: 'Run Simulation',
                desc: 'Use the Simulation Engine to stress-test scenarios and validate waterfall rules.',
                href: '/sandbox',
                label: 'Open Simulation Engine',
                color: hasSimulation ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
              },
              {
                step: '03',
                title: 'Execute Trades',
                desc: 'Generate bucket-level execution tickets with NDF or futures instructions.',
                href: '/input',
                label: 'Run Hedge Engine',
                color: 'var(--text-tertiary)',
              },
            ].map(card => (
              <div key={card.step} style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-rim)',
                borderRadius: 4,
                padding: '20px',
              }}>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: '0.6875rem', letterSpacing: '0.12em',
                  color: card.color, marginBottom: 8,
                }}>{card.step}</div>
                <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: 6 }}>{card.title}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>{card.desc}</p>
                <Link
                  href={card.href}
                  style={{
                    display: 'inline-block',
                    fontFamily: S.fontMono,
                    fontSize: '0.75rem', letterSpacing: '0.05em',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-rim)',
                    padding: '4px 10px',
                    textDecoration: 'none',
                  }}
                >
                  {card.label}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HelpPanel config={EXECUTION_HELP} storageKey="execution" />
      </div>
    );
  }

  // ── Have hedge plan — show Execution Bridge ──────────────────────────────────
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
    <div style={{
      minHeight: '100%',
      fontFamily: S.fontUI,
      color: 'var(--text-primary)',
      background: 'var(--bg-deep)',
      display: 'flex', flexDirection: 'column',
      flex: 1,
    }}>
      {header}
      {deprecationBanner}

      {bucketParam && (
        <div style={{
          background: 'color-mix(in srgb, var(--accent-cyan) 4%, transparent)',
          borderBottom: '1px solid color-mix(in srgb, var(--accent-cyan) 15%, transparent)',
          padding: '6px 20px',
          fontFamily: S.fontMono,
          fontSize: '0.6875rem', letterSpacing: '0.08em',
          color: 'var(--text-tertiary)',
          flexShrink: 0,
        }}>
          FOCUSED BUCKET:{' '}
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{bucketParam}</span>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, maxWidth: '80rem', margin: '0 auto', padding: '24px 20px', width: '100%' }}>
        <ExecutionBridge
          hedgePlan={result.hedge_plan}
          scenarioResults={result.scenario_results}
          runId={result.run_id}
          focusBucket={bucketParam ?? undefined}
          baseCcy={baseCcy}
          validationReport={result.validation_report}
          policy={lastInputs?.policy}
          onAuthStatusChange={handleAuthStatusChange}
        />
      </div>
    </div>
    <HelpPanel config={EXECUTION_HELP} storageKey="execution" />
    </div>
  );
}

export default function ExecutionPage() {
  return (
    <Suspense
      fallback={
        <div style={{
          padding: 20,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.625rem',
          color: 'var(--text-tertiary)',
        }}>
          Loading execution hub…
        </div>
      }
    >
      <ExecutionHubContent />
    </Suspense>
  );
}
