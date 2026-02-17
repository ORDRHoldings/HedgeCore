"use client";

import type { ScenarioTotalResult } from '../../api/types';
import { fmtUSD, fmtRate, fmtSigma } from '../../utils/formatters';

interface Props { totals: ScenarioTotalResult[] }

export default function ScenarioTable({ totals }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="table-enterprise">
        <thead>
          <tr>
            <th>Shock</th>
            <th className="numeric">Shocked Spot</th>
            <th className="numeric">Unhedged Portfolio Impact</th>
            <th className="numeric">Hedge Instrument Impact</th>
            <th className="numeric">Loss Reduction</th>
          </tr>
        </thead>
        <tbody>
          {totals.map(t => (
            <tr key={t.sigma}>
              <td className="font-mono font-semibold">{fmtSigma(t.sigma)}</td>
              <td className="numeric">{fmtRate(t.shocked_spot)}</td>
              <td className="numeric">{fmtUSD(t.total_unhedged_usd)}</td>
              <td className="numeric">{fmtUSD(t.total_hedged_usd)}</td>
              <td className={`numeric${t.total_hedge_benefit_usd > 0 ? ' text-[var(--accent-green)] font-semibold' : ' text-[var(--accent-red)]'}`}>
                {fmtUSD(t.total_hedge_benefit_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
