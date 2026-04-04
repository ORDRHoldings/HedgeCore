'use client';
/**
 * QuickTradeModal — keyboard-driven paper trade entry
 *
 * Opens on B (buy) or S (sell) keypress when no input is focused.
 * Pre-fills symbol + current price. Calculates R:R ratio live.
 * Submit with Enter or the button. Cancel with Escape.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { useWorkspace } from './WorkspaceProvider';
import { T } from './tokens';

interface Props {
  side: 'buy' | 'sell' | null;
  onClose: () => void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${T.border}`,
  borderRadius: 4,
  color: T.text1,
  fontFamily: T.mono,
  fontSize: 12,
  padding: '5px 8px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

export function QuickTradeModal({ side, onClose }: Props) {
  const { state, dispatch, symbolInfo } = useWorkspace();
  const price = symbolInfo.price ?? 0;
  const isBuy = side === 'buy';

  const [lots, setLots] = useState('1');
  const [sl, setSl] = useState(() => {
    if (!price) return '';
    const diff = price < 10 ? 0.0020 : price < 100 ? 0.50 : price * 0.005;
    return (isBuy ? price - diff : price + diff).toFixed(price < 10 ? 5 : 2);
  });
  const [tp, setTp] = useState(() => {
    if (!price) return '';
    const diff = price < 10 ? 0.0060 : price < 100 ? 1.50 : price * 0.015;
    return (isBuy ? price + diff : price - diff).toFixed(price < 10 ? 5 : 2);
  });

  const lotsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (side) {
      // Reset SL/TP when side changes
      if (price) {
        const diff = price < 10 ? 0.0020 : price < 100 ? 0.50 : price * 0.005;
        setSl((side === 'buy' ? price - diff : price + diff).toFixed(price < 10 ? 5 : 2));
        const rDiff = price < 10 ? 0.0060 : price < 100 ? 1.50 : price * 0.015;
        setTp((side === 'buy' ? price + rDiff : price - rDiff).toFixed(price < 10 ? 5 : 2));
      }
      setTimeout(() => lotsRef.current?.focus(), 50);
    }
  }, [side, price]);

  // Keyboard: Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = useCallback(() => {
    if (!side || !price) return;
    const lotsN = parseFloat(lots);
    if (!isFinite(lotsN) || lotsN <= 0) return;

    const slN  = sl  ? parseFloat(sl)  : null;
    const tpN  = tp  ? parseFloat(tp)  : null;

    dispatch({
      type: 'ADD_PAPER_POSITION',
      position: {
        symbol: state.symbol,
        side,
        lots: lotsN,
        entryPrice: price,
        sl: slN && isFinite(slN) ? slN : null,
        tp: tpN && isFinite(tpN) ? tpN : null,
        orderType: 'market',
      },
    });
    dispatch({
      type: 'ADD_TOAST',
      toast: {
        message: `${side.toUpperCase()} ${lotsN} ${state.symbol} @ ${price < 10 ? price.toFixed(5) : price.toFixed(2)}`,
        type: 'info',
      },
    });
    onClose();
  }, [side, price, lots, sl, tp, state.symbol, dispatch, onClose]);

  // R:R calculation
  const slN = parseFloat(sl);
  const tpN = parseFloat(tp);
  const risk   = isFinite(slN) ? Math.abs(price - slN) : null;
  const reward = isFinite(tpN) ? Math.abs(price - tpN) : null;
  const rr = (risk && reward && risk > 0) ? (reward / risk) : null;

  const accentColor = isBuy ? '#26C6DA' : '#EF5350';
  const priceLabel = price < 10 ? price.toFixed(5) : price.toFixed(2);

  if (!side) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#14161F',
        border: `1px solid ${accentColor}44`,
        borderRadius: 8,
        padding: '18px 20px',
        width: 300,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${accentColor}22`,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          {isBuy
            ? <TrendingUp size={16} color={accentColor} />
            : <TrendingDown size={16} color={accentColor} />
          }
          <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: '0.06em' }}>
            {side.toUpperCase()} {state.symbol}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 12, color: T.text2 }}>
            @ {priceLabel}
          </span>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.text3, padding: 0, display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono, letterSpacing: '0.04em' }}>LOTS / QTY</span>
            <input
              ref={lotsRef}
              type="number"
              step="0.01"
              min="0.01"
              value={lots}
              onChange={e => setLots(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              style={INPUT_STYLE}
            />
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 10, color: '#EF5350', fontFamily: T.mono, letterSpacing: '0.04em' }}>STOP LOSS</span>
              <input
                type="number"
                step={price < 10 ? 0.0001 : 0.01}
                value={sl}
                onChange={e => setSl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                style={{ ...INPUT_STYLE, borderColor: 'rgba(239,83,80,0.3)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 10, color: '#26C6DA', fontFamily: T.mono, letterSpacing: '0.04em' }}>TAKE PROFIT</span>
              <input
                type="number"
                step={price < 10 ? 0.0001 : 0.01}
                value={tp}
                onChange={e => setTp(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                style={{ ...INPUT_STYLE, borderColor: 'rgba(38,198,218,0.3)' }}
              />
            </label>
          </div>

          {/* R:R badge */}
          {rr !== null && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '5px 8px',
            }}>
              <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>Risk / Reward</span>
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: T.mono,
                color: rr >= 2 ? '#26C6DA' : rr >= 1 ? '#FFB300' : '#EF5350',
              }}>
                1 : {rr.toFixed(2)}
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            style={{
              marginTop: 4,
              height: 34, borderRadius: 5,
              border: `1px solid ${accentColor}`,
              background: `${accentColor}22`,
              color: accentColor,
              fontFamily: T.mono, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.06em',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${accentColor}44`; }}
            onMouseLeave={e => { e.currentTarget.style.background = `${accentColor}22`; }}
          >
            EXECUTE {side.toUpperCase()} — {priceLabel}
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 9, color: T.text3, fontFamily: T.mono, textAlign: 'center' }}>
          Enter to confirm · Esc to cancel
        </div>
      </div>
    </div>
  );
}
