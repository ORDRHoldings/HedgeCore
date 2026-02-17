"use client";

import { useState, useEffect } from 'react';
import type { HedgeRow } from '../../api/types';
import Modal from '../shared/Modal';
import FieldError from '../shared/FieldError';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (hedge: HedgeRow) => void;
  existingHedge?: HedgeRow;
  existingIds: Set<string>;
  forwardBuckets: Set<string>;
}

const inputCls = 'w-full px-3 py-2 border border-[var(--border-rim)] rounded-sm text-sm bg-white text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-cyan)]/40 focus:border-[var(--accent-cyan)]/60 outline-none';
const labelCls = 'text-sm font-medium text-[var(--text-secondary)]';

function getBucket(dateStr: string): string { return dateStr.slice(0, 7); }

export default function HedgeModal({ open, onClose, onSave, existingHedge, existingIds, forwardBuckets }: Props) {
  const [form, setForm] = useState<HedgeRow>({
    hedge_id: '', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD',
    notional_mxn: 0, value_date: '', status: 'ACTIVE',
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setForm(existingHedge ?? {
        hedge_id: '', instrument: 'NDF', direction: 'SELL_MXN_BUY_USD',
        notional_mxn: 0, value_date: '', status: 'ACTIVE',
      });
      setTouched({});
    }
  }, [open, existingHedge]);

  const set = (field: keyof HedgeRow, value: string | number) => setForm(f => ({ ...f, [field]: value }));
  const touch = (field: string) => setTouched(t => ({ ...t, [field]: true }));

  const idDuplicate = form.hedge_id !== '' && existingIds.has(form.hedge_id) && form.hedge_id !== existingHedge?.hedge_id;
  const idEmpty = form.hedge_id.trim() === '';
  const notionalInvalid = form.notional_mxn <= 0;
  const dateEmpty = form.value_date === '';
  const bucketMissing = form.value_date !== '' && !forwardBuckets.has(getBucket(form.value_date));

  const canSave = !idEmpty && !idDuplicate && !notionalInvalid && !dateEmpty;

  const handleSave = () => {
    if (!canSave) return;
    onSave(form);
    onClose();
  };

  const isEdit = !!existingHedge;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Hedge' : 'Add Hedge'}
      subtitle="Existing risk mitigation position"
      width="lg"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
          <button onClick={handleSave} disabled={!canSave} className="px-4 py-2 text-sm bg-[var(--accent-cyan)] text-white rounded-sm hover:bg-[var(--accent-cyan)]/80 disabled:opacity-50 disabled:cursor-not-allowed">
            {isEdit ? 'Update' : 'Add Hedge Instrument'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Hedge ID *</label>
            <input className={inputCls} value={form.hedge_id} onChange={e => set('hedge_id', e.target.value)} onBlur={() => touch('hedge_id')} />
            {touched.hedge_id && idEmpty && <FieldError error="Hedge ID is required." />}
            {touched.hedge_id && idDuplicate && <FieldError error={`Duplicate ID: ${form.hedge_id}`} />}
          </div>
          <div>
            <label className={labelCls}>Instrument</label>
            <select className={inputCls} value={form.instrument} onChange={e => set('instrument', e.target.value)}>
              <option value="NDF">NDF</option>
              <option value="FWD">FWD</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Direction</label>
            <select className={inputCls} value={form.direction} onChange={e => set('direction', e.target.value)}>
              <option value="SELL_MXN_BUY_USD">SELL MXN / BUY USD</option>
              <option value="BUY_MXN_SELL_USD">BUY MXN / SELL USD</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Notional MXN *</label>
            <input className={inputCls} type="number" min={0} step={100000} value={form.notional_mxn || ''} onChange={e => set('notional_mxn', +e.target.value)} onBlur={() => touch('notional_mxn')} />
            {touched.notional_mxn && notionalInvalid && <FieldError error="Notional must be greater than 0." />}
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="LOCKED">LOCKED</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Value Date *</label>
          <input className={inputCls} type="date" value={form.value_date} onChange={e => set('value_date', e.target.value)} onBlur={() => touch('value_date')} />
          {touched.value_date && dateEmpty && <FieldError error="Value date is required." />}
          {!dateEmpty && bucketMissing && <FieldError warning={`Bucket ${getBucket(form.value_date)} has no forward points (V-015).`} />}
        </div>
      </div>
    </Modal>
  );
}
