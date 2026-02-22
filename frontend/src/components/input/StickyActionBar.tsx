"use client";

interface ValidationGate {
  label: string;
  met: boolean;
  message?: string;
}

interface Props {
  loading: boolean;
  onCalculate: () => void;
  canCalculate: boolean;
  gates?: ValidationGate[];
}

export default function StickyActionBar({ loading, onCalculate, canCalculate, gates = [] }: Props) {
  const unmet = gates.filter(g => !g.met);

  return (
    <div
      className="sticky bottom-0 z-40 shrink-0 border-t border-[var(--border-rim)] bg-[var(--bg-sub)] no-print"
      style={{ fontFamily: "'IBM Plex Sans',sans-serif" }}
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-6">

        {/* Validation panel — left side */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {unmet.length > 0 ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6875rem', letterSpacing: '0.07em', color: 'var(--text-tertiary)' }}>
                GATE CHECK
              </span>
              {unmet.map((g, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.75rem',
                    color: 'var(--accent-red)',
                    border: '1px solid var(--accent-red)',
                    padding: '1px 6px',
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-red)', display: 'inline-block' }} />
                  {g.label}
                  {g.message && <span style={{ color: 'var(--text-tertiary)', fontSize: '0.6875rem' }}> — {g.message}</span>}
                </span>
              ))}
            </div>
          ) : canCalculate ? (
            <div className="flex items-center gap-2">
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--status-pass)', display: 'inline-block',
              }} />
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.75rem', color: 'var(--status-pass)' }}>
                ALL GATES PASSED — READY TO COMPUTE
              </span>
            </div>
          ) : (
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Load exposure data to enable hedge plan computation.
            </span>
          )}
        </div>

        {/* Primary action — right side */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onCalculate}
            disabled={!canCalculate || loading}
            style={{
              fontFamily: "'IBM Plex Sans',sans-serif",
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              padding: '6px 20px',
              border: `1px solid ${canCalculate && !loading ? 'var(--accent-cyan)' : 'var(--border-rim)'}`,
              color: canCalculate && !loading ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
              background: 'transparent',
              cursor: canCalculate && !loading ? 'pointer' : 'not-allowed',
              opacity: canCalculate && !loading ? 1 : 0.5,
              transition: 'all 100ms linear',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" />
                </svg>
                Computing…
              </span>
            ) : (
              'Generate Hedge Plan'
            )}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
