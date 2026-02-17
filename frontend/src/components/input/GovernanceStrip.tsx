"use client";

interface Props {
  tradeCount: number;
  hedgeCount: number;
  policyName: string | null;
  snapshotMode: 'DEMO' | 'MANUAL';
  snapshotTimestamp: string;
  engineVersion: string;
  runId?: string;
  inputHash?: string;
  validationState: 'PASS' | 'FAIL' | 'PENDING';
  errorCount: number;
  warningCount: number;
  fixtureId: string | null;
  fixtureLabel: string | null;
  integrityScore?: number;
}

const VAL_COLOR: Record<string, string> = {
  PASS: 'var(--status-pass)',
  FAIL: 'var(--accent-red)',
  PENDING: 'var(--status-warn)',
};

export default function GovernanceStrip({
  tradeCount,
  hedgeCount,
  policyName,
  snapshotMode,
  snapshotTimestamp,
  engineVersion,
  runId,
  inputHash,
  validationState,
  errorCount,
  warningCount,
  fixtureLabel,
  integrityScore,
}: Props) {
  const ageMinutes = Math.floor((Date.now() - Date.parse(snapshotTimestamp)) / 60000);
  const ageLabel = isNaN(ageMinutes) || ageMinutes < 0 ? '--' : `${ageMinutes}m`;

  const integrityColor =
    integrityScore === undefined ? 'var(--text-tertiary)' :
    integrityScore >= 95 ? 'var(--status-pass)' :
    integrityScore >= 70 ? 'var(--status-warn)' : 'var(--accent-red)';

  return (
    <div
      className="sticky top-0 z-50 shrink-0 border-b border-[var(--border-rim)] bg-[var(--bg-sub)] print-header"
      style={{ height: 32, fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.5625rem', letterSpacing: '0.04em', color: 'var(--text-secondary)', overflow: 'hidden' }}
    >
      <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">

        {/* ── Left: telemetry ── */}
        <div className="flex items-center">
          <span className="px-2"><span style={{ color: 'var(--text-tertiary)' }}>TRADES </span>{tradeCount}</span>
          <span className="border-r border-[var(--border-soft)] h-4" />
          <span className="px-2"><span style={{ color: 'var(--text-tertiary)' }}>HEDGES </span>{hedgeCount}</span>
          <span className="border-r border-[var(--border-soft)] h-4" />
          <span className="px-2"><span style={{ color: 'var(--text-tertiary)' }}>POLICY </span>{policyName ?? 'None'}</span>
          <span className="border-r border-[var(--border-soft)] h-4" />
          <span className="px-2">
            <span style={{ color: 'var(--text-tertiary)' }}>SNAP </span>
            <span style={{ color: snapshotMode === 'DEMO' ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>{snapshotMode}</span>
          </span>
          <span className="border-r border-[var(--border-soft)] h-4" />
          <span className="px-2"><span style={{ color: 'var(--text-tertiary)' }}>AGE </span>{ageLabel}</span>
          {fixtureLabel && (
            <>
              <span className="border-r border-[var(--border-soft)] h-4" />
              <span className="px-2" style={{ color: 'var(--accent-amber)' }}>⬡ {fixtureLabel}</span>
            </>
          )}
        </div>

        {/* ── Center: validation ── */}
        <div className="flex items-center gap-1 px-3">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: VAL_COLOR[validationState] }} />
          <span style={{ color: VAL_COLOR[validationState] }}>VALIDATION: {validationState}</span>
          {errorCount > 0 && (
            <>
              <span className="border-r border-[var(--border-soft)] h-4 mx-1" />
              <span style={{ color: 'var(--accent-red)' }}>{errorCount} EXC</span>
            </>
          )}
          {warningCount > 0 && (
            <>
              <span className="border-r border-[var(--border-soft)] h-4 mx-1" />
              <span style={{ color: 'var(--accent-amber)' }}>{warningCount} ADV</span>
            </>
          )}
          {integrityScore !== undefined && (
            <>
              <span className="border-r border-[var(--border-soft)] h-4 mx-1" />
              <span style={{ color: integrityColor }}>INT {integrityScore}/100</span>
            </>
          )}
        </div>

        {/* ── Right: identifiers ── */}
        <div className="flex items-center">
          {runId && (
            <>
              <span className="px-2"><span style={{ color: 'var(--text-tertiary)' }}>RUN </span>{runId.slice(0, 8)}</span>
              <span className="border-r border-[var(--border-soft)] h-4" />
            </>
          )}
          {inputHash && (
            <>
              <span className="px-2"><span style={{ color: 'var(--text-tertiary)' }}>INPUT </span>{inputHash.slice(0, 8)}</span>
              <span className="border-r border-[var(--border-soft)] h-4" />
            </>
          )}
          <span className="px-2"><span style={{ color: 'var(--text-tertiary)' }}>ENGINE </span>v{engineVersion}</span>
          <span className="border-r border-[var(--border-soft)] h-4" />
          <span className="px-2" style={{ color: 'var(--accent-cyan)' }}>DETERMINISTIC</span>
        </div>
      </div>
    </div>
  );
}
