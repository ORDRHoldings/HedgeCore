'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingCart, ArrowUpRight, ArrowDownRight, Shield, Target, AlertTriangle, Calculator, TrendingUp, XCircle } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';

const EQUITY_KEY = 'ordr_paper_equity';

function pipSizeFor(symbol: string): number {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.includes('JPY')) return 0.01;
  if (s.length === 6) return 0.0001;        // standard FX pair
  if (s.startsWith('XAU')) return 0.1;      // gold
  if (s.startsWith('XAG')) return 0.01;     // silver
  return 1;                                  // indices / other
}

function lotsLabel(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 6) return 'lots';
  if (s.startsWith('XA')) return 'oz';
  return 'units';
}

export function TradePanel() {
  const { symbolInfo, state, dispatch } = useWorkspace();
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [lots, setLots] = useState('0.10');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');

  // Risk calculator state (equity persisted)
  const [equity, setEquity] = useState<string>(() => {
    if (typeof window === 'undefined') return '10000';
    return localStorage.getItem(EQUITY_KEY) ?? '10000';
  });
  const [riskPct, setRiskPct] = useState('1.0');
  const [showCalc, setShowCalc] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(EQUITY_KEY, equity);
  }, [equity]);

  const bull = side === 'buy';
  const price = bull ? symbolInfo.ask : symbolInfo.bid;
  const pipSize = pipSizeFor(state.symbol);

  const calc = useMemo(() => {
    const eq = parseFloat(equity) || 0;
    const rp = parseFloat(riskPct) || 0;
    const slVal = parseFloat(sl) || 0;
    const tpVal = parseFloat(tp) || 0;

    const riskAmt = eq * (rp / 100);
    const slDist = slVal > 0 ? Math.abs(price - slVal) : 0;
    const slPips = slDist / pipSize;

    // Rough pip value: for FX, 1 standard lot (100k units) per pip ≈ $10 for USD quote
    // Use pip value = 1 per lot (relative — shows risk in price-point terms)
    const calcLots = slPips > 0 ? (riskAmt / (slPips * 10)) : 0;

    const tpDist = tpVal > 0 ? Math.abs(tpVal - price) : 0;
    const rr = slDist > 0 && tpDist > 0 ? tpDist / slDist : 0;

    return {
      riskAmt,
      slPips: Math.round(slPips),
      calcLots: Math.max(0.01, Math.round(calcLots * 100) / 100),
      rr: Math.round(rr * 100) / 100,
    };
  }, [equity, riskPct, sl, tp, price, pipSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Symbol header */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShoppingCart size={12} color={T.text2} />
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font }}>{state.symbol}</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: symbolInfo.change >= 0 ? T.bull : T.bear, fontFamily: T.mono }}>
            {formatPrice(symbolInfo.price)}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowCalc(c => !c)}
            title="Risk calculator"
            style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 3,
              border: `1px solid ${showCalc ? T.accent : T.border}`,
              background: showCalc ? T.accentBg : 'transparent',
              color: showCalc ? T.accent : T.text3,
              fontSize: 9, fontWeight: 600, fontFamily: T.font, cursor: 'pointer', outline: 'none',
            }}
          >
            <Calculator size={9} /> CALC
          </button>
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
          <label style={{ fontSize: 9, fontWeight: 600, color: T.text3, letterSpacing: '0.04em', fontFamily: T.font, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <span>LOT SIZE ({lotsLabel(state.symbol)})</span>
          </label>
          <input
            value={lots}
            onChange={e => setLots(e.target.value)}
            style={{
              width: '100%', height: 28, padding: '0 8px', borderRadius: 3,
              border: `1px solid ${T.border}`, background: T.surfaceAlt,
              color: T.text1, fontSize: 11, fontFamily: T.mono, outline: 'none',
              fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box',
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
                boxSizing: 'border-box',
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
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* ── Risk Calculator ── */}
        {showCalc && (
          <div style={{
            padding: '8px', borderRadius: 4,
            border: `1px solid ${T.border}`, background: T.surfaceAlt,
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.accent, letterSpacing: '0.06em', fontFamily: T.font, marginBottom: 6 }}>
              RISK CALCULATOR
            </div>

            {/* Equity + Risk % */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 8, color: T.text3, fontFamily: T.font, display: 'block', marginBottom: 2 }}>EQUITY ($)</label>
                <input
                  value={equity}
                  onChange={e => setEquity(e.target.value)}
                  style={{
                    width: '100%', height: 24, padding: '0 6px', borderRadius: 3,
                    border: `1px solid ${T.border}`, background: T.surface,
                    color: T.text1, fontSize: 10, fontFamily: T.mono, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 8, color: T.text3, fontFamily: T.font, display: 'block', marginBottom: 2 }}>RISK %</label>
                <input
                  value={riskPct}
                  onChange={e => setRiskPct(e.target.value)}
                  style={{
                    width: '100%', height: 24, padding: '0 6px', borderRadius: 3,
                    border: `1px solid ${T.border}`, background: T.surface,
                    color: T.text1, fontSize: 10, fontFamily: T.mono, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Derived stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', marginBottom: 6 }}>
              {[
                { label: 'Risk Amt', value: calc.riskAmt > 0 ? `$${calc.riskAmt.toFixed(2)}` : '—', color: T.warn },
                { label: 'SL Pips', value: calc.slPips > 0 ? String(calc.slPips) : '—', color: T.text1 },
                { label: 'Calc Size', value: calc.slPips > 0 ? String(calc.calcLots) : '—', color: T.accent },
                { label: 'R:R', value: calc.rr > 0 ? `1:${calc.rr}` : '—', color: calc.rr >= 2 ? T.bull : calc.rr > 0 ? T.warn : T.text3 },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color, fontFamily: T.mono }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Use calculated size button */}
            {calc.slPips > 0 && (
              <button
                onClick={() => setLots(String(calc.calcLots))}
                style={{
                  width: '100%', padding: '4px 0', borderRadius: 3,
                  border: `1px solid ${T.accent}`, background: T.accentBg,
                  color: T.accent, fontSize: 9, fontWeight: 600,
                  fontFamily: T.font, cursor: 'pointer', outline: 'none',
                }}
              >
                Use {calc.calcLots} lots
              </button>
            )}
          </div>
        )}

        {/* Paper warning */}
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

      {/* Running P&L — open positions for current symbol */}
      {(() => {
        const symPositions = state.paperPositions.filter(p => p.symbol === state.symbol);
        if (symPositions.length === 0) return null;
        const pnlPerPos = symPositions.map(pos => {
          const closePrice = pos.side === 'buy' ? symbolInfo.bid : symbolInfo.ask;
          return pos.side === 'buy' ? closePrice - pos.entryPrice : pos.entryPrice - closePrice;
        });
        const totalPnl = pnlPerPos.reduce((a, b) => a + b, 0);
        return (
          <div style={{ padding: '6px 10px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <TrendingUp size={10} color={T.text3} />
              <span style={{ fontSize: 8, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font }}>
                OPEN POSITIONS · {state.symbol}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.mono, color: totalPnl >= 0 ? T.bull : T.bear }}>
                {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(5)}
              </span>
            </div>
            {symPositions.map((pos, i) => (
              <div key={pos.id} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 0', borderTop: i > 0 ? `1px solid ${T.border}` : 'none',
              }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: pos.side === 'buy' ? T.bull : T.bear, fontFamily: T.mono, width: 22 }}>
                  {pos.side === 'buy' ? '▲' : '▼'}
                </span>
                <span style={{ fontSize: 8, color: T.text2, fontFamily: T.mono }}>{pos.lots} lots</span>
                <span style={{ fontSize: 8, color: T.text3, fontFamily: T.mono }}>@ {pos.entryPrice.toFixed(5)}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 9, fontWeight: 600, fontFamily: T.mono, color: pnlPerPos[i] >= 0 ? T.bull : T.bear }}>
                  {pnlPerPos[i] >= 0 ? '+' : ''}{pnlPerPos[i].toFixed(5)}
                </span>
                <button
                  onClick={() => dispatch({
                    type: 'CLOSE_PAPER_POSITION',
                    id: pos.id,
                    exitPrice: pos.side === 'buy' ? symbolInfo.bid : symbolInfo.ask,
                  })}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer', padding: 2,
                    color: T.text3, display: 'flex', alignItems: 'center',
                  }}
                  title="Close position"
                >
                  <XCircle size={10} />
                </button>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Submit */}
      <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button
          onClick={() => {
            dispatch({
              type: 'ADD_PAPER_POSITION',
              position: {
                symbol: state.symbol,
                side,
                lots: parseFloat(lots) || 0.01,
                entryPrice: price,
                sl: sl ? parseFloat(sl) : null,
                tp: tp ? parseFloat(tp) : null,
                orderType,
              },
            });
            dispatch({ type: 'SET_BOTTOM_TAB', tab: 'orders' });
          }}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 4, border: 'none',
            background: bull ? T.bull : T.bear, color: '#fff',
            fontSize: 12, fontWeight: 700, fontFamily: T.font, cursor: 'pointer',
            letterSpacing: '0.03em', outline: 'none',
          }}
        >
          {side === 'buy' ? 'BUY' : 'SELL'} {lots} {state.symbol}
        </button>
      </div>
    </div>
  );
}
