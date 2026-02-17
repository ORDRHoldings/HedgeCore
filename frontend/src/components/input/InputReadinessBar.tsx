"use client";

interface Props {
  hasErrors: boolean;
  warningCount: number;
  errorCount: number;
  tradeCount: number;
  hedgeCount: number;
  presetName: string | null;
  marketMode: 'DEMO' | 'MANUAL';
  loading: boolean;
  onCalculate: () => void;
  onLoadDemo: () => void;
}

export default function InputReadinessBar({
  hasErrors,
  warningCount,
  errorCount,
  tradeCount,
  hedgeCount,
  presetName,
  marketMode,
  loading,
  onCalculate,
  onLoadDemo,
}: Props) {
  const canCalculate = !hasErrors && tradeCount > 0 && !loading;

  const tradesOk = tradeCount > 0;
  const noErrors = !hasErrors;

  return (
    <div className="sticky top-0 z-40 bg-[var(--bg-panel)] border-b border-[var(--border-rim)] backdrop-blur-[14px]">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        {/* Left: readiness indicators */}
        <div className="flex items-center gap-4">
          {/* Readiness dots */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${tradesOk ? 'bg-[var(--accent-green)]' : 'bg-white/10'}`}
              title="Trades loaded"
            />
            <span
              className={`w-2.5 h-2.5 rounded-full ${noErrors ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-red)]'}`}
              title="Validation"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-green)]" title="Market snapshot" />
          </div>

          {/* Summary text */}
          <div className="text-sm text-[var(--text-secondary)] flex items-center gap-3 flex-wrap">
            <span>
              Trades: <strong className="text-[var(--text-primary)]">{tradeCount}</strong>
            </span>
            <span className="text-[var(--border-rim)]">&middot;</span>
            <span>
              Hedges: <strong className="text-[var(--text-primary)]">{hedgeCount}</strong>
            </span>
            {presetName && (
              <>
                <span className="text-[var(--border-rim)]">&middot;</span>
                <span>
                  Policy: <strong className="text-[var(--text-primary)]">{presetName}</strong>
                </span>
              </>
            )}
            <span className="text-[var(--border-rim)]">&middot;</span>
            <span>
              Snapshot: <strong className="text-[var(--text-primary)]">{marketMode}</strong>
            </span>

            {errorCount > 0 && (
              <>
                <span className="text-[var(--border-rim)]">&middot;</span>
                <span className="text-[var(--accent-red)] font-medium">
                  {errorCount} {errorCount === 1 ? 'exception' : 'exceptions'}
                </span>
              </>
            )}
            {warningCount > 0 && (
              <>
                <span className="text-[var(--border-rim)]">&middot;</span>
                <span className="text-[var(--accent-amber)]">
                  {warningCount} {warningCount === 1 ? 'advisory' : 'advisories'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onLoadDemo}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-deep)] border border-[var(--border-rim)] rounded-lg hover:bg-white/5 transition-colors"
          >
            Load Institutional Fixture
          </button>
          <button
            onClick={onCalculate}
            disabled={!canCalculate}
            className={`px-6 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
              canCalculate
                ? 'bg-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/80 text-[var(--bg-deep)]'
                : 'bg-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Running…
              </span>
            ) : (
              'Run Engine'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
