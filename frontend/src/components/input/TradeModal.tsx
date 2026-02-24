"use client";

import { useState, useEffect, useRef } from 'react';
import type { TradeRow, FuturesCurrency } from '../../api/types';
import { FUTURES_CURRENCY_LIST } from '../../api/types';
import Modal from '../shared/Modal';
import FieldError from '../shared/FieldError';

// ── Inline date picker (Bloomberg-style, no native OS picker) ────────────────
function ModalDatePicker({
  value, onChange, hasError,
}: { value: string; onChange: (v: string) => void; hasError: boolean }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const initDate = value ? new Date(value + 'T00:00:00') : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [textInput, setTextInput] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTextInput(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay  = new Date(viewYear, viewMonth + 1, 0);
  const firstDow = (firstDay.getDay() + 6) % 7;
  const rows     = Math.ceil((firstDow + lastDay.getDate()) / 7);

  function selectDay(day: number) {
    const mm  = String(viewMonth + 1).padStart(2, '0');
    const dd  = String(day).padStart(2, '0');
    const iso = `${viewYear}-${mm}-${dd}`;
    onChange(iso); setTextInput(iso); setOpen(false);
  }
  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }
  function jumpToQuarter(qi: number) {
    const m = (qi - 1) * 3;
    setViewMonth(m);
    setViewYear(m < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear());
  }
  function handleTextBlur() {
    const iso = textInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const d = new Date(iso + 'T00:00:00');
      if (!isNaN(d.getTime())) { onChange(iso); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
    }
  }

  const borderColor = hasError ? 'var(--accent-red)' : 'var(--border-rim)';

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        role="button" tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); }
          if (e.key === 'Escape') setOpen(false);
        }}
        style={{
          width: '100%', padding: '6px 10px',
          border: `1px solid ${borderColor}`,
          background: 'var(--bg-sub)', color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.8125rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          userSelect: 'none', outline: 'none',
        }}
      >
        <span>{value || 'YYYY-MM-DD'}</span>
        <span style={{ fontSize: '0.625rem', color: 'var(--text-tertiary)' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, zIndex: 9999,
          background: 'var(--bg-panel)', border: '1px solid var(--border-rim)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', width: 260,
          padding: '10px 10px 8px', fontFamily: "'IBM Plex Mono', monospace",
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button onClick={prevMonth} style={{ background:'none', border:'1px solid var(--border-rim)', color:'var(--text-secondary)', cursor:'pointer', padding:'2px 7px', fontFamily:'inherit', fontSize:'0.6875rem' }}>◄</button>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} style={{ background:'none', border:'1px solid var(--border-rim)', color:'var(--text-secondary)', cursor:'pointer', padding:'2px 7px', fontFamily:'inherit', fontSize:'0.6875rem' }}>►</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {[1,2,3,4].map(qi => (
              <button key={qi} onClick={() => jumpToQuarter(qi)} style={{ flex:1, background:'none', border:'1px solid var(--border-rim)', color:'var(--text-tertiary)', cursor:'pointer', fontFamily:'inherit', fontSize:'0.5625rem', letterSpacing:'0.06em', padding:'2px 0' }}>Q{qi}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:'0.5625rem', color:'var(--text-tertiary)', letterSpacing:'0.04em', padding:'2px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: rows * 7 }, (_, i) => {
              const day = i - firstDow + 1;
              if (day < 1 || day > lastDay.getDate()) return <div key={i} />;
              const cellDate = new Date(viewYear, viewMonth, day);
              const selMM = String(viewMonth + 1).padStart(2, '0');
              const selDD = String(day).padStart(2, '0');
              const iso = `${viewYear}-${selMM}-${selDD}`;
              const isSelected = iso === value;
              const isToday = cellDate.toDateString() === today.toDateString();
              const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
              return (
                <button key={i} onClick={() => !isPast && selectDay(day)} style={{
                  textAlign:'center', padding:'3px 0', fontSize:'0.6875rem', fontFamily:'inherit',
                  cursor: isPast ? 'not-allowed' : 'pointer', borderRadius: 2,
                  border: isToday ? '1px solid var(--accent-amber)' : '1px solid transparent',
                  background: isSelected ? 'var(--accent-cyan)' : 'transparent',
                  color: isSelected ? '#0a0f14' : isPast ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  opacity: isPast ? 0.35 : 1, fontWeight: isSelected ? 700 : 400,
                }}>{day}</button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize:'0.5625rem', color:'var(--text-tertiary)', letterSpacing:'0.08em', marginBottom:4 }}>TYPE DATE</div>
            <input type="text" value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onBlur={handleTextBlur}
              onKeyDown={e => { if (e.key === 'Enter') handleTextBlur(); if (e.key === 'Escape') setOpen(false); }}
              placeholder="YYYY-MM-DD"
              style={{ fontFamily:'inherit', fontSize:'0.75rem', width:'100%', background:'var(--bg-sub)', border:'1px solid var(--border-rim)', color:'var(--text-primary)', padding:'3px 8px', outline:'none' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (trade: TradeRow) => void;
  existingTrade?: TradeRow;
  /** Pre-fill form in CREATE mode (not edit). Used for duplicate workflow. */
  initialValues?: Partial<TradeRow>;
  existingIds: Set<string>;
  forwardBuckets: Set<string>;
}

const S = {
  bg: 'var(--bg-deep)',
  bgSub: 'var(--bg-sub)',
  border: 'var(--border-rim)',
  borderSoft: 'var(--border-soft)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textTertiary: 'var(--text-tertiary)',
  cyan: 'var(--accent-cyan)',
  amber: 'var(--accent-amber)',
  red: 'var(--accent-red)',
  fontMono: "'IBM Plex Mono', monospace",
  fontUI: "'IBM Plex Sans', sans-serif",
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: `1px solid ${S.border}`,
  background: S.bgSub,
  color: S.textPrimary,
  fontFamily: S.fontUI,
  fontSize: '0.8125rem',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: S.fontMono,
  fontSize: '0.75rem',
  color: S.textTertiary,
  letterSpacing: '0.07em',
  marginBottom: 4,
};

const hintStyle: React.CSSProperties = {
  fontFamily: S.fontMono,
  fontSize: '0.6875rem',
  color: S.textTertiary,
  letterSpacing: '0.04em',
};

function getBucket(dateStr: string): string { return dateStr.slice(0, 7); }

function LabeledField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span style={labelStyle}>{label}</span>
        {hint && <span style={hintStyle}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function TradeModal({ open, onClose, onSave, existingTrade, initialValues, existingIds, forwardBuckets }: Props) {
  const [form, setForm] = useState<TradeRow>({
    record_id: '', entity: '', type: 'AP', currency: 'MXN',
    amount: 0, value_date: '', status: 'CONFIRMED', description: '',
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      if (existingTrade) {
        setForm(existingTrade);
      } else if (initialValues) {
        // Duplicate mode: pre-fill with values but always blank record_id
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { record_id: _discard, ...valuesWithoutId } = (initialValues as Partial<TradeRow> & { record_id?: string });
        setForm({
          record_id: '', entity: '', type: 'AP', currency: 'MXN',
          amount: 0, value_date: '', status: 'CONFIRMED', description: '',
          ...valuesWithoutId,
        });
      } else {
        setForm({
          record_id: '', entity: '', type: 'AP', currency: 'MXN',
          amount: 0, value_date: '', status: 'CONFIRMED', description: '',
        });
      }
      setTouched({});
    }
  }, [open, existingTrade, initialValues]);

  const set = (field: keyof TradeRow, value: string | number) =>
    setForm(f => ({ ...f, [field]: value }));
  const touch = (field: string) => setTouched(t => ({ ...t, [field]: true }));

  // Validation
  const isEdit = !!existingTrade;
  const isDuplicate = !existingTrade && !!initialValues;

  const idDuplicate = form.record_id !== '' && existingIds.has(form.record_id);
  const idEmpty     = form.record_id.trim() === '';
  const entityEmpty = form.entity.trim() === '';
  const amountInvalid = form.amount <= 0;
  const dateEmpty   = form.value_date === '';
  const bucketMissing = forwardBuckets.size > 0 && form.value_date !== '' && !forwardBuckets.has(getBucket(form.value_date));

  const canSave = (isEdit || (!idEmpty && !idDuplicate)) && !entityEmpty && !amountInvalid && !dateEmpty;

  const handleSave = () => {
    if (!canSave) {
      setTouched({ record_id: true, entity: true, amount: true, value_date: true });
      return;
    }
    onSave(form);
  };

  // Selected currency info
  const selectedCcy = FUTURES_CURRENCY_LIST.find(c => c.code === form.currency);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Exposure' : isDuplicate ? 'Duplicate Exposure' : 'New Exposure Line'}
      subtitle={isEdit ? `Editing: ${existingTrade?.record_id}` : isDuplicate ? 'Duplicated from existing position — assign a new Record ID' : 'Commercial exposure · FX-eligible instrument'}
      width="lg"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textTertiary, letterSpacing: '0.05em' }}>
            {canSave ? '● READY TO SAVE' : '○ COMPLETE REQUIRED FIELDS'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                fontFamily: S.fontUI, fontSize: '0.6875rem', fontWeight: 500,
                padding: '5px 14px', border: `1px solid ${S.border}`,
                color: S.textSecondary, background: 'transparent', cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{
                fontFamily: S.fontUI, fontSize: '0.6875rem', fontWeight: 600,
                padding: '5px 16px', border: `1px solid ${canSave ? S.cyan : S.border}`,
                color: canSave ? S.cyan : S.textTertiary,
                background: 'transparent', cursor: canSave ? 'pointer' : 'not-allowed',
                opacity: canSave ? 1 : 0.5,
              }}
            >{isEdit ? 'Update Position' : isDuplicate ? 'Save Duplicate' : 'Add Position'}</button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* ── Section: Identification ── */}
        <div style={{
          borderBottom: `1px solid ${S.borderSoft}`,
          padding: '12px 0 16px',
        }}>
          <p style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.textTertiary, letterSpacing: '0.08em', marginBottom: 10 }}>IDENTIFICATION</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <LabeledField label="RECORD ID *" hint={isEdit ? "locked — cannot change after creation" : "unique across all positions"}>
              <input
                style={{ ...inputStyle, borderColor: (touched.record_id && (idEmpty || idDuplicate)) ? S.red : S.border, opacity: isEdit ? 0.6 : 1, cursor: isEdit ? 'not-allowed' : 'text' }}
                value={form.record_id}
                onChange={e => { if (!isEdit) set('record_id', e.target.value); }}
                onBlur={() => touch('record_id')}
                placeholder="e.g. INV-2026-001"
                readOnly={isEdit}
              />
              {touched.record_id && idEmpty && !isEdit && <FieldError error="Record ID is required" />}
              {touched.record_id && idDuplicate && !idEmpty && !isEdit && <FieldError error={`Duplicate ID: ${form.record_id}`} />}
            </LabeledField>
            <LabeledField label="ENTITY *" hint="legal entity or business division">
              <input
                style={{ ...inputStyle, borderColor: (touched.entity && entityEmpty) ? S.red : S.border }}
                value={form.entity}
                onChange={e => set('entity', e.target.value)}
                onBlur={() => touch('entity')}
                placeholder="e.g. LatAm Corp SA de CV"
              />
              {touched.entity && entityEmpty && <FieldError error="Entity is required" />}
            </LabeledField>
          </div>
        </div>

        {/* ── Section: Exposure Details ── */}
        <div style={{ borderBottom: `1px solid ${S.borderSoft}`, padding: '12px 0 16px' }}>
          <p style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.textTertiary, letterSpacing: '0.08em', marginBottom: 10 }}>EXPOSURE DETAILS</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

            {/* Type */}
            <LabeledField label="FLOW TYPE *" hint="AR = inflow · AP = outflow">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.type}
                onChange={e => set('type', e.target.value)}
              >
                <option value="AR">AR — Receivable</option>
                <option value="AP">AP — Payable</option>
              </select>
            </LabeledField>

            {/* Currency */}
            <LabeledField label="CURRENCY *" hint="CME/ICE futures listed">
              <select
                style={{ ...inputStyle, cursor: 'pointer', color: selectedCcy ? S.textPrimary : S.textTertiary }}
                value={form.currency}
                onChange={e => set('currency', e.target.value as FuturesCurrency)}
              >
                {FUTURES_CURRENCY_LIST.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              {selectedCcy && (
                <span style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.textTertiary, marginTop: 3, display: 'block' }}>
                  {selectedCcy.exchange} · {selectedCcy.name}
                </span>
              )}
            </LabeledField>

            {/* Amount */}
            <LabeledField label={`AMOUNT (${form.currency}) *`} hint="absolute value, no sign">
              <input
                style={{ ...inputStyle, borderColor: (touched.amount && amountInvalid) ? S.red : S.border }}
                type="number"
                min={0}
                step={100000}
                value={form.amount || ''}
                onChange={e => set('amount', +e.target.value)}
                onBlur={() => touch('amount')}
                placeholder="e.g. 5000000"
              />
              {touched.amount && amountInvalid && <FieldError error="Amount must be > 0" />}
            </LabeledField>
          </div>
        </div>

        {/* ── Section: Timing & Status ── */}
        <div style={{ padding: '12px 0 4px' }}>
          <p style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.textTertiary, letterSpacing: '0.08em', marginBottom: 10 }}>TIMING & CERTAINTY</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

            {/* Value Date */}
            <LabeledField label="VALUE DATE *" hint="settlement date · click to pick">
              <div onClick={() => touch('value_date')}>
                <ModalDatePicker
                  value={form.value_date}
                  onChange={v => { set('value_date', v); touch('value_date'); }}
                  hasError={!!(touched.value_date && dateEmpty)}
                />
              </div>
              {touched.value_date && dateEmpty && <FieldError error="Value date is required" />}
              {!dateEmpty && bucketMissing && (
                <FieldError warning={`No forward points for bucket ${getBucket(form.value_date)}`} />
              )}
            </LabeledField>

            {/* Status */}
            <LabeledField label="STATUS *" hint="certainty of occurrence">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.status}
                onChange={e => set('status', e.target.value as 'CONFIRMED' | 'FORECAST')}
              >
                <option value="CONFIRMED">CONFIRMED — Contracted</option>
                <option value="FORECAST">FORECAST — Projected</option>
              </select>
            </LabeledField>

            {/* Description */}
            <LabeledField label="DESCRIPTION" hint="optional · audit trail">
              <input
                style={inputStyle}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="e.g. Q1 steel import payment"
              />
            </LabeledField>
          </div>
        </div>

        {/* ── Carry note for non-MXN ── */}
        {form.currency !== 'MXN' && (
          <div style={{
            background: `color-mix(in srgb, ${S.amber} 6%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.amber} 22%, transparent)`,
            padding: '8px 12px',
            marginTop: 8,
          }}>
            <p style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.amber, letterSpacing: '0.06em', marginBottom: 3 }}>CROSS-CURRENCY ADVISORY</p>
            <p style={{ fontFamily: S.fontUI, fontSize: '0.6875rem', color: S.textSecondary, lineHeight: 1.5, margin: 0 }}>
              Exposure in <strong style={{ color: S.textPrimary }}>{form.currency}</strong> will be converted to USD equivalent for engine processing.
              Ensure the Market Conditions step includes a valid {form.currency}/USD spot rate and forward curve.
              The hedge plan will express actions in MXN notional.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
