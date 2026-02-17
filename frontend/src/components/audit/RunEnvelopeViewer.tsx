"use client";

import { useState } from 'react';
import type { RunEnvelope } from '../../api/types';

interface Props { envelope: RunEnvelope }

export default function RunEnvelopeViewer({ envelope }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] backdrop-blur-[14px] rounded-xl p-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)] w-full text-left">
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>&#9654;</span>
        Run Envelope
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-sm font-mono">
          <div><span className="text-[var(--text-secondary)]">run_id:</span> <span className="text-[var(--text-primary)]">{envelope.run_id}</span></div>
          <div><span className="text-[var(--text-secondary)]">timestamp:</span> <span className="text-[var(--text-primary)]">{envelope.timestamp}</span></div>
          <div><span className="text-[var(--text-secondary)]">engine:</span> <span className="text-[var(--text-primary)]">v{envelope.engine_version}</span></div>
          <div className="border-t border-[var(--border-soft)] pt-2 mt-2">
            <div><span className="text-[var(--text-secondary)]">inputs_hash:</span> <span className="text-[var(--accent-cyan)] break-all">{envelope.inputs_hash}</span></div>
            <div><span className="text-[var(--text-secondary)]">outputs_hash:</span> <span className="text-[var(--accent-cyan)] break-all">{envelope.outputs_hash}</span></div>
            <div><span className="text-[var(--text-secondary)]">trades_hash:</span> <span className="text-[var(--accent-cyan)]">{envelope.trades_hash}</span></div>
            <div><span className="text-[var(--text-secondary)]">hedges_hash:</span> <span className="text-[var(--accent-cyan)]">{envelope.hedges_hash}</span></div>
            <div><span className="text-[var(--text-secondary)]">market_hash:</span> <span className="text-[var(--accent-cyan)]">{envelope.market_hash}</span></div>
            <div><span className="text-[var(--text-secondary)]">policy_hash:</span> <span className="text-[var(--accent-cyan)]">{envelope.policy_hash}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
