'use client';
import React, { useState } from 'react';
import { ShoppingCart, ArrowUpRight, ArrowDownRight, Shield, Target, AlertTriangle } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';

export function TradePanel() {
  const { symbolInfo, state } = useWorkspace();
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [lots, setLots] = useState('0.10');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');

  const bull = side === 'buy';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Symbol header */}
      <div style={{
        padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShoppingCart size={12} color={T.text2} />
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font }}>{state.symbol}</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: symbolInfo.change >= 0 ? T.bull : T.bear, fontFamily: T.mono }}>
            {formatPrice(symbolInfo.price)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <div style={{
            flex: 1, padding: '6px 0', borderRadius: 3, textAlign: 'center',
            background: T.bullBg, border: `1px solid ${T.bullBorder}`,
          }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: T.bull, letterSpacing: '0.04em' }}>BID</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.bull, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' }}>
              {formatPrice(symbolInfo.bid)}
            </div>
          </div>
          <div style={{
            flex: 1, padding: '6px 0', borderRadius: 3, textAlign: 'center',
            background: T.bearBg, border: `1px solid ${T.bearBorder}`,
          }}>
            <div style={{ fontSize: 8, fontWeight: 600, color: T.bear, letterSpacing: '0.04em' }}>ASK</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.bear, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' }}>
              {formatPrice(symbolInfo.ask)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {/* Order type */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
          {(['market', 'limit', 'stop'] as const).map(ot => (
            <button
              key={ot}
              onClick={() => setOrderType(ot)}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 3, border: 'none',
                background: orderType === ot ? T.accentBg : T.surfaceAlt,
                color: orderType === ot ? T.accent : T.text2,
                fontSize: 10, fontWeight: orderType === ot ? 600 : 400,
                fontFamily: T.font, cursor: 'pointer', outline: 'none',
                textTransform: 'capitalize',
              }}
            >
              {ot}
            </button>
          ))}
        </div>

        {/* Side */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button
            onClick={() => setSide('buy')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 3, border: 'none',
              background: side === 'buy' ? T.bull : T.surfaceAlt,
              color: side === 'buy' ? '#fff' : T.text2,
              fontSize: 11, fontWeight: 600, fontFamily: T.font,
              cursor: 'pointer', outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <ArrowUpRight size={12} /> BUY
          </button>
          <button
            onClick={() => setSide('sell')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 3, border: 'none',
              background: side === 'sell' ? T.bear : T.surfaceAlt,
              color: side === 'sell' ? '#fff' : T.text2,
              fontSize: 11, fontWeight: 600, fontFamily: T.font,
              cursor: 'pointer', outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <ArrowDownRight size={12} /> SELL
          </button>
        </div>

        {/* Size */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 9, fontWeight: 600, color: T.text3, letterSpacing: '0.04em', fontFamily: T.font, display: 'block', marginBottom: 3 }}>
            LOT SIZE
          </label>
          <input
            value={lots}
            onChange={e => setLots(e.target.value)}
            style={{
              width: '100%', height: 28, padding: '0 8px', borderRadius: 3,
              border: `1px solid ${T.border}`, background: T.surfaceAlt,
              color: T.text1, fontSize: 11, fontFamily: T.mono, outline: 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
        </div>

        {/* SL / TP */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9, fontWeight: 600, color: T.bear, letterSpacing: '0.04em', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
              <Shield size={9} /> STOP LOSS
            </label>
            <input
              value={sl}
              onChange={e => setSl(e.target.value)}
              placeholder="---"
              style={{
                width: '100%', height: 26, padding: '0 6px', borderRadius: 3,
                border: `1px solid ${T.border}`, background: T.surfaceAlt,
                color: T.text1, fontSize: 10, fontFamily: T.mono, outline: 'none',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9, fontWeight: 600, color: T.bull, letterSpacing: '0.04em', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
              <Target size={9} /> TAKE PROFIT
            </label>
            <input
              value={tp}
              onChange={e => setTp(e.target.value)}
              placeholder="---"
              style={{
                width: '100%', height: 26, padding: '0 6px', borderRadius: 3,
                border: `1px solid ${T.border}`, background: T.surfaceAlt,
                color: T.text1, fontSize: 10, fontFamily: T.mono, outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Risk info */}
        <div style={{
          padding: '6px 8px', borderRadius: 3, background: T.warnBg,
          border: `1px solid rgba(229,168,75,0.15)`, marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={11} color={T.warn} />
          <span style={{ fontSize: 9, color: T.warn, fontFamily: T.font }}>
            Paper trading mode — no real orders
          </span>
        </div>
      </div>

      {/* Submit button */}
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button style={{
          width: '100%', padding: '10px 0', borderRadius: 4, border: 'none',
          background: bull ? T.bull : T.bear, color: '#fff',
          fontSize: 12, fontWeight: 700, fontFamily: T.font, cursor: 'pointer',
          letterSpacing: '0.03em', outline: 'none',
        }}>
          {side === 'buy' ? 'BUY' : 'SELL'} {lots} {state.symbol}
        </button>
      </div>
    </div>
  );
}
