"use client";

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useHedge } from '../../lib/hedgeContext';
import ExecutionBridge from '../../components/execution/ExecutionBridge';
import AppTopBar from '../../components/layout/AppTopBar';

// ─── Execution Page — Full implementation ─────────────────────────────────────
// Reads hedge plan from HedgeContext (same data as /results Execution tab).
// If a specific ?bucket=YYYY-MM is provided we scroll to that bucket card.

function ExecutionContent() {
  const router = useRouter();
  const params = useSearchParams();
  const bucketParam = params.get('bucket') ?? null;
  const { result } = useHedge();

  // ── No run yet ──────────────────────────────────────────────────────────────
  if (!result) {
    return (
      <div style={{
        minHeight: '100%',
        fontFamily: "'IBM Plex Sans', sans-serif",
        color: 'var(--text-primary)',
        background: 'var(--bg-deep)',
      }}>
        {/* Header strip */}
        <div style={{
          height: 44,
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border-rim)',
          display: 'flex', alignItems: 'center',
          padding: '0 20px', gap: 16,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.5625rem',
        }}>
          <button
            onClick={() => router.push('/input')}
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: '0.625rem', fontWeight: 500,
              padding: '2px 8px', border: '1px solid var(--border-rim)',
              color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer',
            }}
          >
            ← Input
          </button>
          <span style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>EXECUTION BRIDGE</span>
        </div>

        {/* Empty state */}
        <div style={{ maxWidth: '60rem', margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56,
            border: '1px solid var(--border-rim)',
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <polyline points="2,20 6,14 10,16 14,8 18,12 22,4" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            No hedge plan available
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
            Run the hedge engine on the Input page to generate execution tickets.
          </p>
          <Link
            href="/input"
            style={{
              display: 'inline-block',
              padding: '7px 20px',
              border: '1px solid var(--accent-cyan)',
              color: 'var(--accent-cyan)',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.625rem',
              letterSpacing: '0.05em',
              textDecoration: 'none',
            }}
          >
            ← Go to Input Page
          </Link>
        </div>
      </div>
    );
  }

  // ── Have results — show full execution bridge ───────────────────────────────
  return (
    <div style={{
      minHeight: '100%',
      fontFamily: "'IBM Plex Sans', sans-serif",
      color: 'var(--text-primary)',
      background: 'var(--bg-deep)',
    }}>
      {/* ── App top bar ── */}
      <AppTopBar currentModule="Execution" currentPath="/execution" />
      {/* Header strip */}
      <div style={{
        height: 44,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-rim)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 16,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '0.5625rem',
      }}>
        <button
          onClick={() => router.back()}
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: '0.625rem', fontWeight: 500,
            padding: '2px 8px', border: '1px solid var(--border-rim)',
            color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <span style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>EXECUTION BRIDGE</span>
        {bucketParam && (
          <>
            <span style={{ color: 'var(--border-rim)' }}>|</span>
            <span style={{ color: 'var(--text-tertiary)' }}>BUCKET </span>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{bucketParam}</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-tertiary)', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.5rem' }}>
          RUN {result.run_id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '24px 20px' }}>
        <ExecutionBridge
          hedgePlan={result.hedge_plan}
          scenarioResults={result.scenario_results}
          runId={result.run_id}
          focusBucket={bucketParam ?? undefined}
        />
      </div>
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
          Loading execution view…
        </div>
      }
    >
      <ExecutionContent />
    </Suspense>
  );
}
