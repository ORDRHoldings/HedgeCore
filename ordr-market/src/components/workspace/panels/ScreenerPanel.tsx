'use client';
import React, { useState } from 'react';
import { ScanLine, Filter, ChevronDown } from 'lucide-react';
import { T } from '../tokens';

const SCAN_PRESETS = [
  { id: 'fvg_bull',    name: 'Bullish FVG',       desc: 'Unfilled bullish fair value gaps', count: 3 },
  { id: 'fvg_bear',    name: 'Bearish FVG',       desc: 'Unfilled bearish fair value gaps', count: 1 },
  { id: 'ob_bull',     name: 'Bullish Order Block', desc: 'Valid bullish order blocks',     count: 2 },
  { id: 'ob_bear',     name: 'Bearish Order Block', desc: 'Valid bearish order blocks',     count: 0 },
  { id: 'liq_sweep',   name: 'Liquidity Sweep',   desc: 'Recent liquidity sweeps',          count: 1 },
  { id: 'ema_cross',   name: 'EMA Cross',         desc: 'EMA crossover signals',            count: 0 },
  { id: 'vol_spike',   name: 'Volume Spike',      desc: 'Abnormal volume bars',             count: 4 },
  { id: 'divergence',  name: 'RSI Divergence',    desc: 'Price-RSI divergence patterns',    count: 1 },
];

export function ScreenerPanel() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>Market Screener</span>
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 3,
            background: T.warnBg, color: T.warn, fontWeight: 600,
          }}>BETA</span>
        </div>
        <p style={{ fontSize: 10, color: T.text3, margin: '4px 0 0', fontFamily: T.font, lineHeight: 1.4 }}>
          Scan for SMC patterns, structure breaks, and technical setups across the current chart.
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
        {SCAN_PRESETS.map(scan => {
          const isActive = active === scan.id;
          return (
            <div
              key={scan.id}
              onClick={() => setActive(isActive ? null : scan.id)}
              style={{
                padding: '8px 8px', borderRadius: 4,
                border: `1px solid ${isActive ? T.accent : T.border}`,
                background: isActive ? T.selectedBg : T.surfaceAlt,
                marginBottom: 4, cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = isActive ? T.selectedBg : T.surfaceAlt; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ScanLine size={12} color={isActive ? T.accent : T.text2} />
                <span style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, flex: 1 }}>{scan.name}</span>
                <span style={{
                  fontSize: 9, fontWeight: 600, fontFamily: T.mono,
                  padding: '0 5px', height: 16, borderRadius: 8,
                  background: scan.count > 0 ? T.infoBg : T.surfaceAlt,
                  color: scan.count > 0 ? T.accent : T.text3,
                  display: 'inline-flex', alignItems: 'center',
                }}>
                  {scan.count}
                </span>
              </div>
              <div style={{ fontSize: 9, color: T.text3, marginTop: 3, fontFamily: T.font }}>{scan.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
