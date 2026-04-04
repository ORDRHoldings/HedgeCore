'use client';
import React, { useMemo } from 'react';
import { BarChart3, Lock } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';

// Deterministic pseudo-random seeded by price level (stable across renders)
function seededVol(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.floor(((x - Math.floor(x)) * 450) + 50);
}

export function OrderflowPanel() {
  const { symbolInfo } = useWorkspace();

  const bid = symbolInfo.bid > 0 ? symbolInfo.bid : symbolInfo.price;
  const ask = symbolInfo.ask > 0 ? symbolInfo.ask : symbolInfo.price;
  const mid = (bid + ask) / 2;

  // Stable DOM ladder seeded from price — won't jitter on every render
  const levels = useMemo(() => {
    const tick = mid > 100 ? 0.50 : 0.00010;
    return Array.from({ length: 14 }, (_, i) => {
      const offset = (7 - i) * tick;
      const price = mid + offset;
      const isBid = price <= bid;
      const isAsk = price >= ask;
      const isSpread = !isBid && !isAsk;
      const bidVol = isBid ? seededVol(Math.round(price * 100000) + 1) : 0;
      const askVol = isAsk ? seededVol(Math.round(price * 100000) + 2) : 0;
      return { price, bidVol, askVol, isBid, isAsk, isSpread };
    });
  }, [mid, bid, ask]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <BarChart3 size={12} color={T.text2} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>
          Depth of Market
        </span>
        <span style={{
          fontSize: 9, padding: '1px 6px', borderRadius: 3,
          background: T.warnBg, color: T.warn, fontWeight: 600, fontFamily: T.font,
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <Lock size={8} /> PRO
        </span>
      </div>

      {/* DOM Ladder */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 2fr 1fr',
          padding: '2px 10px', fontSize: 9, fontWeight: 700,
          color: T.text3, letterSpacing: '0.04em', fontFamily: T.font,
        }}>
          <span>BID</span>
          <span style={{ textAlign: 'center' }}>PRICE</span>
          <span style={{ textAlign: 'right' }}>ASK</span>
        </div>

        {levels.map((level, i) => {
          const bidPct = level.bidVol / 500;
          const askPct = level.askVol / 500;
          return (
            <div
              key={i}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 2fr 1fr',
                padding: '2px 10px', alignItems: 'center',
                background: level.isSpread ? 'rgba(41,98,255,0.06)' : 'transparent',
                borderTop: level.isSpread ? `1px dashed ${T.border}` : 'none',
                borderBottom: level.isSpread ? `1px dashed ${T.border}` : 'none',
                height: 22,
              }}
            >
              {/* Bid volume */}
              <div style={{ position: 'relative' }}>
                {level.isBid && (
                  <div style={{
                    position: 'absolute', right: 0, top: 2, bottom: 2,
                    width: `${bidPct * 100}%`, background: 'rgba(38,166,154,0.18)',
                    borderRadius: 2,
                  }} />
                )}
                <span style={{ fontSize: 10, color: T.bull, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums', position: 'relative' }}>
                  {level.isBid ? level.bidVol : ''}
                </span>
              </div>

              {/* Price */}
              <span style={{
                textAlign: 'center', fontSize: 10, fontWeight: level.isSpread ? 700 : 500,
                color: level.isSpread ? T.accent : T.text1,
                fontFamily: T.mono, fontVariantNumeric: 'tabular-nums',
              }}>
                {formatPrice(level.price)}
                {level.price === bid ? ' B' : level.price === ask ? ' A' : ''}
              </span>

              {/* Ask volume */}
              <div style={{ position: 'relative', textAlign: 'right' }}>
                {level.isAsk && (
                  <div style={{
                    position: 'absolute', left: 0, top: 2, bottom: 2,
                    width: `${askPct * 100}%`, background: 'rgba(239,83,80,0.18)',
                    borderRadius: 2,
                  }} />
                )}
                <span style={{ fontSize: 10, color: T.bear, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums', position: 'relative' }}>
                  {level.isAsk ? level.askVol : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — bid/ask/spread summary */}
      <div style={{
        padding: '5px 10px', borderTop: `1px solid ${T.border}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 9, color: T.bull, fontFamily: T.mono }}>
          B {bid > 100 ? bid.toFixed(2) : bid.toFixed(5)}
        </span>
        <span style={{ fontSize: 9, color: T.bear, fontFamily: T.mono }}>
          A {ask > 100 ? ask.toFixed(2) : ask.toFixed(5)}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>
          Simulated depth
        </span>
      </div>
    </div>
  );
}
