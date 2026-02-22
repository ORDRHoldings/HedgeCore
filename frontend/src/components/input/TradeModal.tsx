"use client";

import { useState, useEffect } from 'react';
import type { TradeRow, FuturesCurrency } from '../../api/types';
import { FUTURES_CURRENCY_LIST } from '../../api/types';
import Modal from '../shared/Modal';
import FieldError from '../shared/FieldError';

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
  fontSize: '0.5625rem',
  color: S.textTertiary,
  letterSpacing: '0.07em',
  marginBottom: 4,
};

const hintStyle: React.CSSProperties = {
  fontFamily: S.fontMono,
  fontSize: '0.5rem',
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
  const idDuplicate = form.record_id !== '' && existingIds.has(form.record_id);
  const idEmpty     = form.record_id.trim() === '';
  const entityEmpty = form.entity.trim() === '';
  const amountInvalid = form.amount <= 0;
  const dateEmpty   = form.value_date === '';
  const bucketMissing = forwardBuckets.size > 0 && form.value_date !== '' && !forwardBuckets.has(getBucket(form.value_date));

  const canSave = !idEmpty && !idDuplicate && !entityEmpty && !amountInvalid && !dateEmpty;

  const handleSave = () => {
    if (!canSave) {
      setTouched({ record_id: true, entity: true, amount: true, value_date: true });
      return;
    }
    onSave(form);
  };

  const isEdit = !!existingTrade;
  const isDuplicate = !existingTrade && !!initialValues;

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
          <span style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.textTertiary, letterSpacing: '0.05em' }}>
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
          <p style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.textTertiary, letterSpacing: '0.08em', marginBottom: 10 }}>IDENTIFICATION</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <LabeledField label="RECORD ID *" hint="unique across all positions">
              <input
                style={{ ...inputStyle, borderColor: (touched.record_id && (idEmpty || idDuplicate)) ? S.red : S.border }}
                value={form.record_id}
                onChange={e => set('record_id', e.target.value)}
                onBlur={() => touch('record_id')}
                placeholder="e.g. INV-2026-001"
              />
              {touched.record_id && idEmpty && <FieldError error="Record ID is required" />}
              {touched.record_id && idDuplicate && !idEmpty && <FieldError error={`Duplicate ID: ${form.record_id}`} />}
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
          <p style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.textTertiary, letterSpacing: '0.08em', marginBottom: 10 }}>EXPOSURE DETAILS</p>
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
                <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.textTertiary, marginTop: 3, display: 'block' }}>
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
          <p style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.textTertiary, letterSpacing: '0.08em', marginBottom: 10 }}>TIMING & CERTAINTY</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

            {/* Value Date */}
            <LabeledField label="VALUE DATE *" hint="ISO 8601 · settlement date">
              <input
                style={{ ...inputStyle, borderColor: (touched.value_date && dateEmpty) ? S.red : S.border }}
                type="date"
                value={form.value_date}
                onChange={e => set('value_date', e.target.value)}
                onBlur={() => touch('value_date')}
                min="2026-01-01"
                max="2028-12-31"
              />
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
            <p style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.amber, letterSpacing: '0.06em', marginBottom: 3 }}>CROSS-CURRENCY ADVISORY</p>
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
