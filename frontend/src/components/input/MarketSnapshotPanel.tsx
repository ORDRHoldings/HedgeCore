"use client";

import { useState } from 'react';
import type { MarketSnapshot } from '../../api/types';
import { POINTS_ABS_MAX, BUCKET_RE } from '../../constants/validation';
import { deriveCurrencyContext } from '../../utils/currencyContext';
import FieldError from '../shared/FieldError';
import StatusBadge from '../shared/StatusBadge';

interface Props {
  market: MarketSnapshot;
  onChange: (m: MarketSnapshot) => void;
  mode: 'DEMO' | 'MANUAL';
  /** Trades list for deriving currency context */
  trades?: import('../../api/types').TradeRow[];
}

export default function MarketSnapshotPanel({ market, onChange, mode, trades = [] }: Props) {
  const [newBucket, setNewBucket] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [bucketError, setBucketError] = useState('');
  const [pointsError, setPointsError] = useState('');

  const inputCls =
    'px-3 py-2 border border-[var(--border-rim)] rounded-sm text-sm bg-white text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-cyan)]/40 focus:border-[var(--accent-cyan)]/60 outline-none w-full';

  const ctx = deriveCurrencyContext(trades, market);
  const [spotMin, spotMax] = ctx.spotRange;
  const spotOutOfRange =
    market.spot_rate > 0 && (market.spot_rate < spotMin || market.spot_rate > spotMax);

  const updateSpot = (v: string) => {
    const val = parseFloat(v);
    onChange({
      ...market,
      spot_rate: isNaN(val) ? 0 : val,
      provider_metadata: {
        ...market.provider_metadata,
        source: mode === 'DEMO' ? 'hedgecalc_demo_fixture' : 'manual_user_input',
      },
    });
  };

  const updateAsOf = (v: string) => {
    onChange({
      ...market,
      as_of: v ? v + 'T12:00:00Z' : market.as_of,
    });
  };

  const validateBucket = (val: string) => {
    if (!val) {
      setBucketError('');
      return false;
    }
    if (!BUCKET_RE.test(val)) {
      setBucketError('Format must be YYYY-MM (V-013)');
      return false;
    }
    if (market.forward_points_by_month[val] !== undefined) {
      setBucketError('Bucket already exists');
      return false;
    }
    setBucketError('');
    return true;
  };

  const validatePoints = (val: string) => {
    if (!val) {
      setPointsError('');
      return false;
    }
    const num = parseFloat(val);
    if (isNaN(num)) {
      setPointsError('Must be a number');
      return false;
    }
    if (Math.abs(num) >= POINTS_ABS_MAX) {
      setPointsError(`|points| must be < ${POINTS_ABS_MAX} (V-021)`);
      return false;
    }
    setPointsError('');
    return true;
  };

  const addPoint = () => {
    const bucketValid = validateBucket(newBucket);
    const pointsValid = validatePoints(newPoints);
    if (bucketValid && pointsValid) {
      onChange({
        ...market,
        forward_points_by_month: {
          ...market.forward_points_by_month,
          [newBucket]: parseFloat(newPoints),
        },
      });
      setNewBucket('');
      setNewPoints('');
      setBucketError('');
      setPointsError('');
    }
  };

  const removePoint = (key: string) => {
    const { [key]: _, ...rest } = market.forward_points_by_month;
    onChange({ ...market, forward_points_by_month: rest });
  };

  const sortedPoints = Object.entries(market.forward_points_by_month).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const metadata = market.provider_metadata || {};
  const metaEntries = Object.entries(metadata).filter(
    ([k]) => k !== 'note',
  );

  return (
    <div className="bg-white border border-[var(--border-rim)] rounded-sm p-6 space-y-5">
      {/* Header row: As-of + Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge variant={mode === 'DEMO' ? 'demo' : 'manual'} label={mode} />
        </div>
      </div>

      {/* Spot + As-of */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-[var(--text-secondary)]">As-Of Date</label>
          <input
            type="date"
            className={inputCls}
            value={market.as_of.slice(0, 10)}
            onChange={(e) => updateAsOf(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)]">Current Spot {ctx.pairLabel}</label>
          <input
            type="number"
            step="0.01"
            className={`${inputCls} ${spotOutOfRange ? 'border-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/30' : ''}`}
            value={market.spot_rate || ''}
            onChange={(e) => updateSpot(e.target.value)}
          />
          {spotOutOfRange && (
            <FieldError error={`Spot ${ctx.pairLabel} must be between ${spotMin} and ${spotMax} (V-011)`} />
          )}
          {!spotOutOfRange && market.spot_rate > 0 && (
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Valid range: {spotMin}–{spotMax}
            </p>
          )}
        </div>
      </div>

      {/* Forward Curve Table */}
      <div>
        <label className="text-sm font-medium text-[var(--text-secondary)]">Forward Points by Month</label>
        {sortedPoints.length > 0 ? (
          <div className="mt-2 border border-[var(--border-soft)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-deep)] text-[var(--text-secondary)]">
                  <th className="px-4 py-2 text-left font-medium">Bucket</th>
                  <th className="px-4 py-2 text-right font-medium">Points</th>
                  <th className="px-4 py-2 text-right font-medium">Implied Rate</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedPoints.map(([k, v]) => (
                  <tr key={k} className="border-t border-[var(--border-soft)] hover:bg-[var(--bg-sub)]">
                    <td className="px-4 py-2 font-mono text-[var(--text-primary)]">{k}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {typeof v === 'number' ? v.toFixed(4) : v}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[var(--text-secondary)]">
                      {market.spot_rate > 0
                        ? (market.spot_rate + (typeof v === 'number' ? v : 0)).toFixed(4)
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => removePoint(k)}
                        className="text-[var(--accent-red)]/40 hover:text-[var(--accent-red)] text-lg leading-none"
                        title="Remove"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--accent-red)] mt-2">
            No forward points defined (V-012). At least one bucket required.
          </p>
        )}

        {/* Add row */}
        <div className="flex gap-2 mt-3 items-start">
          <div className="flex-1">
            <input
              placeholder="YYYY-MM"
              className={`${inputCls} ${bucketError ? 'border-[var(--accent-red)]' : ''}`}
              value={newBucket}
              onChange={(e) => {
                setNewBucket(e.target.value);
                if (bucketError) validateBucket(e.target.value);
              }}
              onBlur={() => newBucket && validateBucket(newBucket)}
            />
            {bucketError && <FieldError error={bucketError} />}
          </div>
          <div className="w-28">
            <input
              placeholder="Points"
              type="number"
              step="0.001"
              className={`${inputCls} ${pointsError ? 'border-[var(--accent-red)]' : ''}`}
              value={newPoints}
              onChange={(e) => {
                setNewPoints(e.target.value);
                if (pointsError) validatePoints(e.target.value);
              }}
              onBlur={() => newPoints && validatePoints(newPoints)}
            />
            {pointsError && <FieldError error={pointsError} />}
          </div>
          <button
            onClick={addPoint}
            className="px-4 py-2 text-sm bg-[var(--accent-cyan)] text-[var(--bg-deep)] rounded-lg hover:bg-[var(--accent-cyan)]/80 whitespace-nowrap mt-0"
          >
            Add
          </button>
        </div>
      </div>

      {/* Source Attribution */}
      {metaEntries.length > 0 && (
        <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded-lg px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            Source Attribution
          </p>
          {metaEntries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="text-[var(--text-secondary)] font-mono text-xs">{k}:</span>
              <span className="text-[var(--text-primary)]">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Governance Note */}
      <p className="text-xs text-[var(--text-secondary)] italic">
        Snapshot is frozen at calculation time. Changes after submission require re-calculation.
      </p>
    </div>
  );
}
