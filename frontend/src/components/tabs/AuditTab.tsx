"use client";

import { useState } from 'react';
import type { RunEnvelope, TraceLite, TraceEvent } from '../../api/types';

interface Props {
  runEnvelope: RunEnvelope;
  traceLite: TraceLite;
}

// ── Hash display: shorten for readability ──────────────────────────────────
function HashDisplay({ label, hash }: { label: string; hash: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(hash).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--border-soft)] last:border-0">
      <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider shrink-0 w-28 mt-0.5">{label}</span>
      <span className="font-mono text-[11px] text-[var(--accent-cyan)] break-all flex-1">{hash}</span>
      <button
        onClick={copy}
        className="text-[9px] font-mono px-1.5 py-0.5 border border-[var(--border-soft)] text-[var(--text-tertiary)] hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)] transition-colors shrink-0"
      >
        {copied ? "✓" : "Copy"}
      </button>
    </div>
  );
}

// ── Step color map ─────────────────────────────────────────────────────────
const STEP_STYLES: Record<string, { bg: string; text: string }> = {
  PARSE:     { bg: "bg-white/5",                               text: "text-[var(--text-secondary)]" },
  VALIDATE:  { bg: "bg-[var(--accent-cyan)]/10",               text: "text-[var(--accent-cyan)]" },
  NORMALIZE: { bg: "bg-[var(--accent-indigo)]/10",             text: "text-[var(--accent-indigo)]" },
  KERNEL:    { bg: "bg-[var(--accent-green)]/10",              text: "text-[var(--accent-green)]" },
  SCENARIO:  { bg: "bg-[var(--accent-amber)]/10",              text: "text-[var(--accent-amber)]" },
  AUDIT:     { bg: "bg-[var(--accent-red)]/10",                text: "text-[var(--accent-red)]" },
};

function stepStyle(step: string) {
  return STEP_STYLES[step] ?? { bg: "bg-white/5", text: "text-[var(--text-tertiary)]" };
}

// ── Group trace events by stage ────────────────────────────────────────────
function groupByStage(events: TraceEvent[]): { stage: string; events: TraceEvent[] }[] {
  const groups: Map<string, TraceEvent[]> = new Map();
  for (const e of events) {
    const g = groups.get(e.step) ?? [];
    g.push(e);
    groups.set(e.step, g);
  }
  return Array.from(groups.entries()).map(([stage, evts]) => ({ stage, events: evts }));
}

// ── Repro step builder ────────────────────────────────────────────────────
function buildReproSteps(envelope: RunEnvelope): string[] {
  return [
    `1. Retrieve input artifacts using inputs_hash: ${envelope.inputs_hash.slice(0, 16)}…`,
    `2. Confirm market snapshot (market_hash: ${envelope.market_hash.slice(0, 16)}…) is available in data store.`,
    `3. Confirm policy parameters (policy_hash: ${envelope.policy_hash.slice(0, 16)}…) match locked policy version.`,
    `4. Execute HedgeCalc engine v${envelope.engine_version} with retrieved inputs.`,
    `5. Verify outputs_hash of replay result equals: ${envelope.outputs_hash.slice(0, 16)}… (exact bit-for-bit match required).`,
    `6. Compare replay run_id to original: ${envelope.run_id} — note: run_id will differ; hashes must match.`,
  ];
}

export default function AuditTab({ runEnvelope, traceLite }: Props) {
  const [traceOpen, setTraceOpen] = useState(false);
  const [reproOpen, setReproOpen] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  const toggleStage = (stage: string) =>
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage); else next.add(stage);
      return next;
    });

  const stageGroups = groupByStage(traceLite.events);
  const reproSteps  = buildReproSteps(runEnvelope);

  return (
    <div className="space-y-5">
      {/* Attestation badge */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 bg-[var(--accent-green)]/8 text-[var(--accent-green)] border border-[var(--accent-green)]/30 rounded px-3 py-1.5 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
          Deterministic · Snapshot-Bound · Fully Reproducible
        </span>
        <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-2 py-1">
          Engine v{runEnvelope.engine_version}
        </span>
        <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-2 py-1">
          {traceLite.events.length} trace events
        </span>
      </div>

      {/* ── Evidence Ledger ─────────────────────────────────────────────────── */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-[var(--bg-deep)] border-b border-[var(--border-soft)]">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] tracking-widest">AE-01</span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
              Evidence Ledger
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
            {new Date(runEnvelope.timestamp).toISOString()}
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Run identity */}
          <div>
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Run Identity</div>
            <div className="space-y-0">
              {[
                { label: "Run ID",    value: runEnvelope.run_id },
                { label: "Timestamp", value: new Date(runEnvelope.timestamp).toISOString() },
                { label: "Engine",    value: `v${runEnvelope.engine_version}` },
              ].map(r => (
                <div key={r.label} className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--border-soft)] last:border-0">
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider shrink-0 w-28 mt-0.5">{r.label}</span>
                  <span className="font-mono text-[11px] text-[var(--text-primary)] break-all flex-1">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cryptographic hashes */}
          <div>
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Cryptographic Attestation</div>
            <div className="space-y-0">
              <HashDisplay label="Inputs Hash"  hash={runEnvelope.inputs_hash} />
              <HashDisplay label="Outputs Hash" hash={runEnvelope.outputs_hash} />
              <HashDisplay label="Trades Hash"  hash={runEnvelope.trades_hash} />
              <HashDisplay label="Hedges Hash"  hash={runEnvelope.hedges_hash} />
              <HashDisplay label="Market Hash"  hash={runEnvelope.market_hash} />
              <HashDisplay label="Policy Hash"  hash={runEnvelope.policy_hash} />
            </div>
          </div>
        </div>

        {/* Snapshot source metadata */}
        <div className="px-5 pb-5">
          <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Audit Proof Properties</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              {[
                { label: "Determinism", value: "Guaranteed", color: "var(--accent-green)" },
                { label: "Snapshot Binding", value: "market_hash locked", color: "var(--accent-cyan)" },
                { label: "Policy Binding", value: "policy_hash locked", color: "var(--accent-cyan)" },
                { label: "Reproducibility", value: "Hash-verifiable", color: "var(--accent-green)" },
                { label: "Source", value: "Calculation Engine", color: "var(--text-primary)" },
                { label: "Integrity Check", value: "SHA-256 (both I/O)", color: "var(--text-primary)" },
              ].map(p => (
                <div key={p.label}>
                  <div className="text-[10px] text-[var(--text-tertiary)]">{p.label}</div>
                  <div className="font-mono font-semibold text-sm mt-0.5" style={{ color: p.color }}>{p.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Trace Bundle Viewer ──────────────────────────────────────────────── */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded overflow-hidden">
        <button
          onClick={() => setTraceOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 bg-[var(--bg-deep)] border-b border-[var(--border-soft)] hover:bg-[var(--bg-sub)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] tracking-widest">AE-02</span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
              Trace Bundle Viewer
            </h3>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-1.5 py-0.5">
              {traceLite.events.length} events · {stageGroups.length} stages
            </span>
          </div>
          <span className={`text-[var(--text-tertiary)] text-sm transition-transform duration-200 ${traceOpen ? "rotate-90" : ""}`}>▶</span>
        </button>

        {traceOpen && (
          <div className="p-5 space-y-2">
            {stageGroups.map(({ stage, events }) => {
              const sty = stepStyle(stage);
              const isExpanded = expandedStages.has(stage);
              return (
                <div key={stage} className="border border-[var(--border-soft)] rounded overflow-hidden">
                  <button
                    onClick={() => toggleStage(stage)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--bg-deep)] hover:bg-[var(--bg-sub)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${sty.bg} ${sty.text}`}>
                        {stage}
                      </span>
                      <span className="text-sm text-[var(--text-secondary)]">
                        {events.length} event{events.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className={`text-[var(--text-tertiary)] text-[10px] transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                  </button>
                  {isExpanded && (
                    <div className="divide-y divide-[var(--border-soft)]">
                      {events.map((e, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                          <span className="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0 w-44 break-all mt-0.5">{e.timestamp}</span>
                          <span className="text-[var(--text-secondary)] leading-relaxed">{e.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Repro Steps ─────────────────────────────────────────────────────── */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded overflow-hidden">
        <button
          onClick={() => setReproOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 bg-[var(--bg-deep)] border-b border-[var(--border-soft)] hover:bg-[var(--bg-sub)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] tracking-widest">AE-03</span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
              Repro Steps
            </h3>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-1.5 py-0.5">
              How to replay this run
            </span>
          </div>
          <span className={`text-[var(--text-tertiary)] text-sm transition-transform duration-200 ${reproOpen ? "rotate-90" : ""}`}>▶</span>
        </button>

        {reproOpen && (
          <div className="p-5">
            <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
              The following steps describe how to reproduce this exact run. Output hash must match{" "}
              <span className="font-mono text-[var(--accent-cyan)]">{runEnvelope.outputs_hash.slice(0, 16)}…</span> to confirm determinism.
            </p>
            <div className="space-y-2">
              {reproSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded text-sm">
                  <span className="font-mono text-[var(--accent-cyan)] shrink-0 font-bold w-4">{i + 1}.</span>
                  <span className="text-[var(--text-secondary)] leading-relaxed font-mono">{step.replace(/^\d+\.\s*/, "")}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/20 rounded text-[11px] text-[var(--text-secondary)]">
              <strong className="text-[var(--accent-cyan)]">Note:</strong> Replay is only valid when using the same engine version ({runEnvelope.engine_version}) and identical input hashes. Any change to inputs, policy, or market data will produce different outputs — this is by design (full determinism guarantee).
            </div>
          </div>
        )}
      </div>

      {/* Export */}
      <div className="flex gap-2">
        <button className="text-[10px] font-mono px-3 py-1.5 border border-[var(--border-rim)] text-[var(--text-tertiary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] transition-colors">
          Download Audit ZIP ↓
        </button>
        <button className="text-[10px] font-mono px-3 py-1.5 border border-[var(--border-rim)] text-[var(--text-tertiary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] transition-colors">
          Export Evidence PDF ↓
        </button>
      </div>
    </div>
  );
}
