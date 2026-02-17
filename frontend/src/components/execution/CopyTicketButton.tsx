"use client";

import { useState } from 'react';
import type { BucketResult } from '../../api/types';
import type { InstrumentMapping } from '../../utils/symbolMapper';

interface Props {
  bucket: BucketResult;
  mapping: InstrumentMapping;
  runId: string;
  /** Scenario base currency (e.g. 'JPY', 'EUR', 'MXN'). REQUIRED — no MXN default. */
  baseCcy: string;
}

function getBrokerSide(actionMxn: number): string {
  if (actionMxn > 0) return 'BUY';
  if (actionMxn < 0) return 'SELL';
  return 'N/A';
}

function getExposureEffect(actionMxn: number, ccy: string): string {
  if (actionMxn > 0) return `Long ${ccy} / Short USD`;
  if (actionMxn < 0) return `Short ${ccy} / Long USD`;
  return '';
}

function getNdfSide(direction: string | null, ccy: string): string {
  if (direction === 'SELL_MXN_BUY_USD') return `SELL ${ccy} / BUY USD`;
  if (direction === 'BUY_MXN_SELL_USD') return `BUY ${ccy} / SELL USD`;
  return 'N/A';
}

function formatTicket(bucket: BucketResult, mapping: InstrumentMapping, runId: string, ccy: string): string {
  const notional = `${Math.abs(bucket.action_mxn).toLocaleString('en', { maximumFractionDigits: 0 })} ${ccy} (~${Math.abs(bucket.action_usd).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} USD)`;
  const hasAction = bucket.action_mxn !== 0 && !bucket.suppressed;

  if (mapping.is_proxy) {
    if (!hasAction) {
      return [
        '=== HedgeCalc Trade Ticket ===',
        `Run: ${runId}`,
        `Bucket: ${bucket.bucket}`,
        `Currency: ${ccy}`,
        'Action: NO EXECUTION REQUIRED',
        '',
        'Notes: Derived from HedgeCalc.',
        '===============================',
      ].join('\n');
    }

    const action = `${getBrokerSide(bucket.action_mxn)} ${mapping.suggested_contracts ?? 0} ${mapping.display_label} (${mapping.expiry_label})`;
    const lines = [
      '=== HedgeCalc Trade Ticket ===',
      `Run: ${runId}`,
      `Bucket: ${bucket.bucket}`,
      `Currency: ${ccy}`,
      `Action: ${action}`,
      `IBKR Symbol: ${mapping.ibkr_symbol ?? 'OTC/NDF'}`,
      `Notional: ${notional}`,
      ...(mapping.contract_size_mxn != null
        ? [`Contract Size: ${(mapping.contract_size_mxn / 1000).toFixed(0)}K ${ccy}/contract`]
        : []),
      `Forward Rate (ref): ${bucket.forward_rate.toFixed(6)}`,
      `Friction Est: ${bucket.friction_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`,
      `Carry: ${bucket.carry_note}`,
      '',
      `Exposure Effect: ${getExposureEffect(bucket.action_mxn, ccy)}`,
      'Notes: Derived from HedgeCalc. Verify sizing with broker.',
      '===============================',
    ];
    return lines.join('\n');
  }

  // NDF/FWD mode
  const lines = [
    '=== HedgeCalc Trade Ticket ===',
    `Run: ${runId}`,
    `Bucket: ${bucket.bucket}`,
    `Currency: ${ccy}`,
    `Instrument: ${mapping.display_label}`,
    `Side: ${getNdfSide(bucket.action_direction, ccy)}`,
    `Notional: ${notional}`,
    `Expiry: ${mapping.expiry_label}`,
    `Forward Rate: ${bucket.forward_rate.toFixed(6)}`,
    `Friction Est: ${bucket.friction_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`,
    `Carry: ${bucket.carry_note}`,
    '',
    'Notes: Derived from HedgeCalc. Verify sizing with broker.',
    '===============================',
  ];
  return lines.join('\n');
}

export default function CopyTicketButton({ bucket, mapping, runId, baseCcy }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = formatTicket(bucket, mapping, runId, baseCcy);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1.5 text-sm rounded border border-[var(--border-rim)] bg-[var(--bg-deep)] text-[var(--text-primary)] hover:bg-white/5 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy Ticket'}
    </button>
  );
}
