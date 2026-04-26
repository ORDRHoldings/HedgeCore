"use client";

import { useRef, useState } from 'react';

interface ColumnDef {
  name: string;
  required: boolean;
  type: string;
  example: string;
  notes: string;
}

interface Props {
  label: string;
  onFile: (file: File) => void;
  schemaType?: 'trades' | 'hedges';
}

const TRADES_SCHEMA: ColumnDef[] = [
  { name: 'record_id',    required: true,  type: 'string',  example: 'INV-2026-001',    notes: 'Unique identifier for this exposure line' },
  { name: 'entity',       required: true,  type: 'string',  example: 'LatAm Corp SA',   notes: 'Legal entity or business division name' },
  { name: 'type',         required: true,  type: 'AR | AP', example: 'AP',              notes: 'AR = receivable (inflow), AP = payable (outflow)' },
  { name: 'currency',     required: true,  type: 'string',  example: 'MXN',             notes: 'ISO 4217 code — must have CME/ICE futures listing' },
  { name: 'amount',       required: true,  type: 'number',  example: '14500000',        notes: 'Absolute value in local currency (not USD). Positive.' },
  { name: 'value_date',   required: true,  type: 'YYYY-MM-DD', example: '2026-04-15',  notes: 'Settlement / payment date. Must be a future date.' },
  { name: 'status',       required: true,  type: 'CONFIRMED | FORECAST', example: 'CONFIRMED', notes: 'CONFIRMED = contracted, FORECAST = projected' },
  { name: 'description',  required: false, type: 'string',  example: 'Q1 steel import', notes: 'Optional free-text description (audit trail)' },
];

const HEDGES_SCHEMA: ColumnDef[] = [
  { name: 'hedge_id',       required: true,  type: 'string',  example: 'H-001',         notes: 'Unique identifier for this hedge instrument' },
  { name: 'instrument',     required: true,  type: 'FWD | NDF', example: 'NDF',         notes: 'FWD = deliverable forward, NDF = non-deliverable' },
  { name: 'direction',      required: true,  type: 'string',  example: 'SELL_MXN_BUY_USD', notes: 'SELL_MXN_BUY_USD or BUY_MXN_SELL_USD' },
  { name: 'notional_mxn',   required: true,  type: 'number',  example: '12000000',      notes: 'Notional in MXN. Positive value.' },
  { name: 'value_date',     required: true,  type: 'YYYY-MM-DD', example: '2026-04-10', notes: 'Settlement date of the hedge instrument' },
  { name: 'status',         required: true,  type: 'ACTIVE | LOCKED', example: 'ACTIVE', notes: 'ACTIVE = adjustable, LOCKED = committed/live' },
];

export default function CsvUploader({ label, onFile, schemaType = 'trades' }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const schema = schemaType === 'hedges' ? HEDGES_SCHEMA : TRADES_SCHEMA;
  const schemaLabel = schemaType === 'hedges' ? 'Hedge Instruments' : 'Commercial Exposure';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onFile(file); e.target.value = ''; }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) onFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); };
  const handleDragLeave = () => setDragActive(false);

  const S = {
    bg: 'var(--bg-deep)',
    bgSub: 'var(--bg-sub)',
    bgPanel: 'var(--bg-panel)',
    border: 'var(--border-rim)',
    borderSoft: 'var(--border-soft)',
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textTertiary: 'var(--text-tertiary)',
    cyan: 'var(--accent-cyan)',
    amber: 'var(--accent-amber)',
    green: 'var(--status-pass)',
    red: 'var(--accent-red)',
    fontMono: "'IBM Plex Mono', monospace",
    fontUI: "'IBM Plex Sans', sans-serif",
  };

  return (
    <>
      {/* ── Trigger area ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => ref.current?.click()}
          style={{
            cursor: 'pointer',
            padding: '3px 10px',
            fontFamily: S.fontMono,
            fontSize: '0.75rem',
            fontWeight: 500,
            border: `1px dashed ${dragActive ? S.cyan : S.border}`,
            color: dragActive ? S.cyan : S.textSecondary,
            background: dragActive ? `color-mix(in srgb, ${S.cyan} 5%, transparent)` : 'transparent',
            letterSpacing: '0.04em',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <path d="M6 1v7M3 5l3 3 3-3M1 9v2h10V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {label}
        </div>
        <button
          onClick={() => setHelpOpen(true)}
          title="CSV format guide"
          style={{
            width: 16, height: 16,
            border: `1px solid ${S.border}`,
            borderRadius: '50%',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: S.fontMono,
            fontSize: '0.75rem',
            color: S.textTertiary,
            flexShrink: 0,
          }}
        >?</button>
        <input ref={ref} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleChange} />
      </div>

      {/* ── Help modal ── */}
      {helpOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(8,12,16,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setHelpOpen(false); }}
        >
          <div style={{
            background: S.bgPanel,
            border: `1px solid ${S.border}`,
            width: 680,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: S.fontUI,
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderBottom: `1px solid ${S.border}`,
              background: S.bgSub,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textTertiary, letterSpacing: '0.08em' }}>CSV IMPORT FORMAT</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: S.textPrimary }}>
                  {schemaLabel} — Column Reference
                </span>
              </div>
              <button
                onClick={() => setHelpOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.textTertiary, fontSize: '1rem', lineHeight: 1, padding: '2px 4px' }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', padding: '16px' }}>

              {/* Quick tips */}
              <div style={{
                background: `color-mix(in srgb, ${S.cyan} 5%, transparent)`,
                border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
                padding: '10px 14px',
                marginBottom: 16,
              }}>
                <p style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.cyan, letterSpacing: '0.06em', marginBottom: 6 }}>IMPORT TIPS</p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    'First row must be the header row — column names are case-sensitive',
                    'Delimiter: comma (,). Encoding: UTF-8. Do not include currency symbols or commas in numeric fields.',
                    'Amounts are absolute values in local currency. Type (AR/AP) determines flow direction.',
                    'Date format must be ISO 8601: YYYY-MM-DD (e.g., 2026-04-15)',
                    'Drag & drop the CSV file directly onto the import button',
                    'Maximum 500 rows per import. Duplicates are rejected by Record ID.',
                  ].map((tip, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, fontSize: '0.75rem', color: S.textSecondary, lineHeight: 1.5 }}>
                      <span style={{ color: S.cyan, fontFamily: S.fontMono, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Schema table */}
              <p style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textTertiary, letterSpacing: '0.08em', marginBottom: 8 }}>COLUMN SCHEMA</p>
              <div style={{ border: `1px solid ${S.border}`, overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '130px 70px 140px 110px 1fr',
                  background: S.bgSub,
                  borderBottom: `1px solid ${S.border}`,
                  padding: '6px 10px',
                }}>
                  {['COLUMN', 'REQ.', 'TYPE', 'EXAMPLE', 'NOTES'].map(h => (
                    <span key={h} style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textTertiary, letterSpacing: '0.08em' }}>{h}</span>
                  ))}
                </div>
                {/* Rows */}
                {schema.map((col, i) => (
                  <div
                    key={col.name}
                    style={{
                      display: 'grid', gridTemplateColumns: '130px 70px 140px 110px 1fr',
                      padding: '7px 10px',
                      borderBottom: i < schema.length - 1 ? `1px solid ${S.borderSoft}` : 'none',
                      background: i % 2 === 0 ? 'transparent' : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                    }}
                  >
                    <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textPrimary }}>{col.name}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: col.required ? S.red : S.textTertiary }}>
                      {col.required ? '● required' : '○ optional'}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.amber }}>{col.type}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textSecondary }}>{col.example}</span>
                    <span style={{ fontSize: '0.75rem', color: S.textSecondary, lineHeight: 1.45 }}>{col.notes}</span>
                  </div>
                ))}
              </div>

              {/* CSV example */}
              <p style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textTertiary, letterSpacing: '0.08em', marginTop: 16, marginBottom: 8 }}>EXAMPLE CSV</p>
              <div style={{
                background: S.bgSub,
                border: `1px solid ${S.border}`,
                padding: '10px 14px',
                overflowX: 'auto',
              }}>
                <pre style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textSecondary, margin: 0, lineHeight: 1.7 }}>
                  {schemaType === 'trades'
                    ? `record_id,entity,type,currency,amount,value_date,status,description\nINV-001,LatAm Corp,AP,MXN,14500000,2026-04-15,CONFIRMED,Q1 steel import\nINV-002,LatAm Corp,AR,EUR,800000,2026-04-30,CONFIRMED,EU customer receivable\nINV-003,LatAm Corp,AP,MXN,9200000,2026-05-10,FORECAST,Projected supplier payment`
                    : `hedge_id,instrument,direction,notional_mxn,value_date,status\nH-001,NDF,SELL_MXN_BUY_USD,12000000,2026-04-15,ACTIVE\nH-002,FWD,SELL_MXN_BUY_USD,9500000,2026-05-10,LOCKED`
                  }
                </pre>
              </div>

              {/* Validation notes */}
              <div style={{
                background: `color-mix(in srgb, ${S.amber} 5%, transparent)`,
                border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`,
                padding: '10px 14px',
                marginTop: 14,
              }}>
                <p style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.amber, letterSpacing: '0.06em', marginBottom: 6 }}>VALIDATION RULES</p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {(schemaType === 'trades' ? [
                    'record_id must be unique within the import file and across existing records',
                    'amount must be > 0 (engine applies direction via type field)',
                    'currency must be an ISO 4217 code with an active CME or ICE futures contract',
                    'value_date must be within the engine planning horizon (today + 18 months)',
                  ] : [
                    'hedge_id must be unique within the import file and across existing instruments',
                    'notional_mxn must be > 0',
                    'direction must exactly match: SELL_MXN_BUY_USD or BUY_MXN_SELL_USD',
                    'value_date must align with an active market forward bucket for correct carry attribution',
                  ]).map((rule, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, fontSize: '0.75rem', color: S.textSecondary, lineHeight: 1.5 }}>
                      <span style={{ color: S.amber, fontFamily: S.fontMono, flexShrink: 0 }}>V-{String(i + 1).padStart(2, '0')}</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '10px 16px', borderTop: `1px solid ${S.border}`,
              background: S.bgSub,
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setHelpOpen(false)}
                style={{
                  fontFamily: S.fontUI, fontSize: '0.75rem', fontWeight: 500,
                  padding: '4px 14px',
                  border: `1px solid ${S.border}`,
                  color: S.textSecondary,
                  background: 'transparent', cursor: 'pointer',
                }}
              >Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
