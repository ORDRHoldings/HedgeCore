"use client";

import { useState } from 'react';
import type { TraceLite } from '../../api/types';

interface Props { trace: TraceLite }

export default function TraceViewer({ trace }: Props) {
  const [open, setOpen] = useState(false);

  const stepColor: Record<string, string> = {
    PARSE: 'bg-white/5 text-[var(--text-secondary)]',
    VALIDATE: 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]',
    NORMALIZE: 'bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)]',
    KERNEL: 'bg-[var(--accent-green)]/10 text-[var(--accent-green)]',
    SCENARIO: 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]',
    AUDIT: 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]',
  };

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] backdrop-blur-[14px] rounded-xl p-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)] w-full text-left">
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>&#9654;</span>
        Trace Log ({trace.events.length} events)
      </button>
      {open && (
        <div className="mt-3 space-y-1 text-sm">
          {trace.events.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`px-1.5 py-0.5 rounded text-xs font-mono shrink-0 ${stepColor[e.step] || 'bg-white/5'}`}>{e.step}</span>
              <span className="text-[var(--text-secondary)]">{e.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
