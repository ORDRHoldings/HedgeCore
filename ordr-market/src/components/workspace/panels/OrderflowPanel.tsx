'use client';
import React from 'react';
import { BarChart3, Lock } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';

export function OrderflowPanel() {
  const { symbolInfo } = useWorkspace();

  // Mock DOM/ladder data
  const levels = Array.from({ length: 12 }, (_, i) => {
    const offset = (6 - i) * (symbolInfo.price > 100 ? 0.50 : 0.00020);
    const price = symbolInfo.price + offset;
    const bidVol = Math.floor(Math.random() * 500 + 50);
    const askVol = Math.floor(Math.random() * 500 + 50);
    const isSpread = i === 5 || i === 6;
    return { price, bidVol, askVol, isSpread };
  });

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
          const bidPct = level.bidVol / 550;
          const askPct = level.askVol / 550;
          const isAbove = i < 6;
          return (
            <div
              key={i}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 2fr 1fr',
                padding: '2px 10px', alignItems: 'center',
                background: level.isSpread ? 'rgba(255,255,255,0.02)' : 'transparent',
                height: 22,
              }}
            >
              {/* Bid */}
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute', right: 0, top: 2, bottom: 2,
                  width: `${bidPct * 100}%`, background: 'rgba(38,166,154,0.15)',
                  borderRadius: 2,
                }} />
                <span style={{ fontSize: 10, color: T.bull, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums', position: 'relative' }}>
                  {!isAbove ? level.bidVol : ''}
                </span>
              </div>

              {/* Price */}
              <span style={{
                textAlign: 'center', fontSize: 10, fontWeight: 500,
                color: level.isSpread ? T.accent : T.text1,
                fontFamily: T.mono, fontVariantNumeric: 'tabular-nums',
              }}>
                {formatPrice(level.price)}
              </span>

              {/* Ask */}
              <div style={{ position: 'relative', textAlign: 'right' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 2, bottom: 2,
                  width: `${askPct * 100}%`, background: 'rgba(239,83,80,0.15)',
                  borderRadius: 2,
                }} />
                <span style={{ fontSize: 10, color: T.bear, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums', position: 'relative' }}>
                  {isAbove ? level.askVol : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 10px', borderTop: `1px solid ${T.border}`, flexShrink: 0,
        fontSize: 9, color: T.text3, fontFamily: T.font, textAlign: 'center',
      }}>
        Live orderflow requires a data subscription
      </div>
    </div>
  );
}
