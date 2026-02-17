"use client";

import type { HedgePlan } from '../../api/types';
import { fmtMXN, fmtUSD, fmtRate } from '../../utils/formatters';

interface Props { plan: HedgePlan }

export default function HedgePlanTable({ plan }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="table-enterprise">
        <thead>
          <tr>
            <th>Bucket</th>
            <th className="numeric">Confirmed</th>
            <th className="numeric">Forecast</th>
            <th className="numeric">Commercial</th>
            <th className="numeric">Existing</th>
            <th className="numeric">Target</th>
            <th className="numeric">Action MXN</th>
            <th>Direction</th>
            <th className="numeric">Fwd Rate</th>
            <th className="numeric">Action USD</th>
            <th className="numeric">Friction</th>
            <th>Supp</th>
            <th className="numeric">Hedge Pos</th>
            <th className="numeric">Residual</th>
          </tr>
        </thead>
        <tbody>
          {plan.buckets.map(b => (
            <tr key={b.bucket} className={b.suppressed ? 'bg-[var(--accent-amber)]/5' : ''}>
              <td className="font-mono font-medium">{b.bucket}</td>
              <td className="numeric">{fmtMXN(b.confirmed_flow_mxn)}</td>
              <td className="numeric">{fmtMXN(b.forecast_flow_mxn)}</td>
              <td className="numeric font-semibold">{fmtMXN(b.commercial_exposure_mxn)}</td>
              <td className="numeric">{fmtMXN(b.existing_hedges_mxn)}</td>
              <td className="numeric">{fmtMXN(b.target_signed_mxn)}</td>
              <td className="numeric font-semibold">{fmtMXN(b.action_mxn)}</td>
              <td>
                {b.action_direction ? (
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${b.action_direction.startsWith('SELL') ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]' : 'bg-[var(--accent-green)]/10 text-[var(--accent-green)]'}`}>
                    {b.action_direction.replace(/_/g, ' ')}
                  </span>
                ) : '-'}
              </td>
              <td className="numeric">{fmtRate(b.forward_rate)}</td>
              <td className="numeric">{fmtUSD(b.action_usd)}</td>
              <td className="numeric">{fmtUSD(b.friction_usd)}</td>
              <td className="text-center font-mono">{b.suppressed ? 'Y' : ''}</td>
              <td className="numeric">{fmtMXN(b.hedge_position_mxn)}</td>
              <td className={`numeric${b.residual_mxn !== 0 ? ' text-[var(--accent-amber)] font-semibold' : ''}`}>{fmtMXN(b.residual_mxn)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>TOTAL</td>
            <td className="numeric"></td>
            <td className="numeric"></td>
            <td className="numeric">{fmtMXN(plan.summary.total_commercial_exposure_mxn)}</td>
            <td className="numeric">{fmtMXN(plan.summary.total_existing_hedges_mxn)}</td>
            <td className="numeric"></td>
            <td className="numeric">{fmtMXN(plan.summary.total_action_mxn)}</td>
            <td></td>
            <td></td>
            <td className="numeric">{fmtUSD(plan.summary.total_action_usd)}</td>
            <td className="numeric">{fmtUSD(plan.summary.total_friction_usd)}</td>
            <td></td>
            <td className="numeric">{fmtMXN(plan.summary.total_hedge_position_mxn)}</td>
            <td className="numeric">{fmtMXN(plan.summary.total_residual_mxn)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
