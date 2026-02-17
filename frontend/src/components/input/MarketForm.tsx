"use client";

import type { MarketSnapshot, TradeRow } from '../../api/types';
import MarketSnapshotPanel from './MarketSnapshotPanel';

interface Props {
  market: MarketSnapshot;
  onChange: (m: MarketSnapshot) => void;
  mode?: 'DEMO' | 'MANUAL';
  trades?: TradeRow[];
}

export default function MarketForm({ market, onChange, mode = 'MANUAL', trades = [] }: Props) {
  return <MarketSnapshotPanel market={market} onChange={onChange} mode={mode} trades={trades} />;
}
