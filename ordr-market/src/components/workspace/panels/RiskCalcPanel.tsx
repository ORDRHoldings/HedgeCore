'use client';
/**
 * RiskCalcPanel — Position Risk Calculator
 *
 * Given account size, risk %, entry, and stop-loss, computes:
 *   · Exact lot size (standard lots)
 *   · Max loss in USD
 *   · R:R ratio and potential gain if TP is set
 *
 * Formula: lot size = riskUSD / (SL distance × lot unit value)
 * For JPY pairs the lot unit value accounts for the USD/JPY conversion.
 */
import React, { useState, useEffect } from 'react';
import { Calculator, TrendingUp, TrendingDown, AlertCircle, RefreshCw } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';

const RISK_PRESETS = [0.5, 1, 1.5, 2, 3, 5];
const LS_ACCOUNT_KEY = 'ordr_risk_account_size';

// ── Pip / lot value helpers ───────────────────────────────────────────────────

function isJpyPair(symbol: string): boolean {
  return symbol.toUpperCase().includes('JPY');
}

/**
 * PnL per standard lot (100 000 units) for a given SL distance.
 * For XAU (gold), contract size = 100 oz.
 * For JPY pairs, quote is in JPY so we divide by current price to get USD PnL.
 * For everything else (USD-quoted), straightforward.
 */
function pnlPerLot(slDist: number, symbol: string, price: number): number {
  if (symbol.toUpperCase().includes('XAU')) return slDist * 100;          // gold ~100oz contract
  if (isJpyPair(symbol) && price > 0)          return slDist * 100_000 / price;
  return slDist * 100_000;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function RiskCalcPanel() {
  const { state, symbolInfo, dispatch } = useWorkspace();

  const [accountStr, setAccountStr] = useState<string>(() => {
    if (typeof window === 'undefined') return '10000';
    return localStorage.getItem(LS_ACCOUNT_KEY) ?? '10000';
  });
  const [riskPct,    setRiskPct]    = useState<number>(1);
  const [side,       setSide]       = useState<'long' | 'short'>('long');
  const [entryStr,   setEntryStr]   = useState('');
  const [slStr,      setSlStr]      = useState('');
  const [tpStr,      setTpStr]      = useState('');

  // Auto-fill entry price from live feed
  useEffect(() => {
    if (symbolInfo.price > 0) {
      setEntryStr(formatPrice(symbolInfo.price, state.symbol));
    }
  }, [symbolInfo.price, state.symbol]);

  // Sync risk levels to chart canvas
  useEffect(() => {
    const e = parseFloat(entryStr) || 0;
    const s = parseFloat(slStr) || 0;
    const t = parseFloat(tpStr) || 0;
    if (e > 0) {
      dispatch({ type: 'SET_RISK_LEVELS', levels: { entry: e, sl: s > 0 ? s : null, tp: t > 0 ? t : null, side } });
    } else {
      dispatch({ type: 'SET_RISK_LEVELS', levels: null });
    }
  }, [entryStr, slStr, tpStr, side]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear risk levels when panel unmounts
  useEffect(() => () => { dispatch({ type: 'SET_RISK_LEVELS', levels: null }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist account size
  function handleAccountChange(v: string) {
    setAccountStr(v);
    const n = parseFloat(v);
    if (n > 0 && typeof window !== 'undefined') localStorage.setItem(LS_ACCOUNT_KEY, v);
  }

  // ── Computed values ──────────────────────────────────────────────────────────
  const account = parseFloat(accountStr) || 0;
  const entry   = parseFloat(entryStr)   || 0;
  const sl      = parseFloat(slStr)      || 0;
  const tp      = parseFloat(tpStr)      || 0;

  const riskUsd  = account * riskPct / 100;
  const slDist   = entry > 0 && sl > 0 ? Math.abs(entry - sl) : 0;
  const tpDist   = entry > 0 && tp > 0 ? Math.abs(tp - entry) : 0;
  const unitPnl  = pnlPerLot(slDist, state.symbol, entry);
  const lots     = unitPnl > 0 ? riskUsd / unitPnl : 0;
  const rrRatio  = slDist > 0 && tpDist > 0 ? tpDist / slDist : 0;
  const tpGainUsd = lots > 0 && tpDist > 0 ? lots * pnlPerLot(tpDist, state.symbol, entry) : 0;

  const slValid  = sl > 0 && entry > 0 && (side === 'long' ? sl < entry : sl > entry);
  const tpValid  = tp > 0 && entry > 0 && (side === 'long' ? tp > entry : tp < entry);

  const rrColor = rrRatio >= 3 ? T.bull : rrRatio >= 2 ? T.accent : rrRatio >= 1 ? '#FF9800' : T.bear;

  // ── Styles ───────────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, color: T.text3, fontFamily: T.font,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 26, padding: '0 8px', borderRadius: 3,
    border: `1px solid ${T.border}`, background: T.surfaceAlt,
    color: T.text1, fontSize: 11, fontFamily: T.mono, outline: 'none',
    boxSizing: 'border-box',
  };
  const outputRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '4px 0', borderBottom: `1px solid ${T.border}`,
  };
  const outputLabel: React.CSSProperties = {
    fontSize: 10, color: T.text3, fontFamily: T.font,
  };
  const outputValue: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.mono,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Calculator size={12} color={T.text2} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>
          Risk Calculator
        </span>
        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono }}>{state.symbol}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>

        {/* ── Account Size ─────────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <div style={labelStyle}>Account Size (USD)</div>
          <input
            type="number"
            value={accountStr}
            onChange={e => handleAccountChange(e.target.value)}
            placeholder="10000"
            style={inputStyle}
          />
        </div>

        {/* ── Risk % presets ───────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <div style={labelStyle}>Risk per Trade</div>
          <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
            {RISK_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setRiskPct(p)}
                style={{
                  flex: 1, padding: '4px 0', borderRadius: 3, border: 'none',
                  background: riskPct === p ? T.accentBg : T.border,
                  color: riskPct === p ? T.accent : T.text2,
                  fontSize: 9, fontWeight: 600, fontFamily: T.mono, cursor: 'pointer', outline: 'none',
                }}
              >
                {p}%
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, flexShrink: 0 }}>Custom:</span>
            <input
              type="number"
              placeholder="e.g. 0.75"
              min={0.1} max={10} step={0.1}
              onBlur={e => { const v = parseFloat(e.target.value); if (v > 0) setRiskPct(v); }}
              style={{ ...inputStyle, height: 22, fontSize: 10 }}
            />
          </div>
          {account > 0 && (
            <div style={{ fontSize: 10, color: T.accent, fontFamily: T.mono, marginTop: 4, fontWeight: 600 }}>
              Risk amount: ${(account * riskPct / 100).toFixed(2)}
            </div>
          )}
        </div>

        {/* ── Direction ────────────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <div style={labelStyle}>Direction</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['long', 'short'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 3, border: 'none',
                  background: side === s ? (s === 'long' ? 'rgba(38,198,118,0.18)' : 'rgba(239,83,80,0.18)') : T.border,
                  color: side === s ? (s === 'long' ? T.bull : T.bear) : T.text2,
                  fontSize: 10, fontWeight: 600, fontFamily: T.font, cursor: 'pointer', outline: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                {s === 'long' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {s === 'long' ? 'Long' : 'Short'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Entry / SL / TP ──────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
            <span style={labelStyle}>Entry Price</span>
            <button
              title="Refresh from live price"
              onClick={() => setEntryStr(formatPrice(symbolInfo.price, state.symbol))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.text3, lineHeight: 0 }}
            >
              <RefreshCw size={9} />
            </button>
          </div>
          <input
            type="number"
            value={entryStr}
            onChange={e => setEntryStr(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={labelStyle}>Stop Loss</div>
          <input
            type="number"
            value={slStr}
            onChange={e => setSlStr(e.target.value)}
            placeholder={entry > 0 ? (side === 'long' ? `< ${entryStr}` : `> ${entryStr}`) : 'Enter SL price'}
            style={{
              ...inputStyle,
              borderColor: sl > 0 ? (slValid ? T.bear : 'rgba(239,83,80,0.8)') : T.border,
            }}
          />
          {sl > 0 && !slValid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3, fontSize: 9, color: T.bear, fontFamily: T.font }}>
              <AlertCircle size={9} />
              SL must be {side === 'long' ? 'below' : 'above'} entry
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Take Profit (optional)</div>
          <input
            type="number"
            value={tpStr}
            onChange={e => setTpStr(e.target.value)}
            placeholder={entry > 0 ? (side === 'long' ? `> ${entryStr}` : `< ${entryStr}`) : 'Enter TP price'}
            style={{
              ...inputStyle,
              borderColor: tp > 0 ? (tpValid ? T.bull : 'rgba(239,83,80,0.5)') : T.border,
            }}
          />
        </div>

        {/* ── Results ──────────────────────────────────────────── */}
        {lots > 0 && slValid && (
          <div style={{ background: T.surfaceAlt, borderRadius: 4, padding: '8px 10px', marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: T.text3, fontFamily: T.font, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Position Sizing
            </div>

            <div style={outputRow}>
              <span style={outputLabel}>Lot Size</span>
              <span style={{ ...outputValue, color: T.accent, fontSize: 13 }}>{lots.toFixed(3)}</span>
            </div>
            <div style={outputRow}>
              <span style={outputLabel}>Max Loss</span>
              <span style={{ ...outputValue, color: T.bear }}>-${riskUsd.toFixed(2)}</span>
            </div>
            <div style={outputRow}>
              <span style={outputLabel}>SL Distance</span>
              <span style={outputValue}>{slDist < 0.01 ? slDist.toFixed(5) : slDist.toFixed(2)}</span>
            </div>
            <div style={outputRow}>
              <span style={outputLabel}>Position Value</span>
              <span style={outputValue}>${(lots * 100_000 * entry).toLocaleString('en', { maximumFractionDigits: 0 })}</span>
            </div>

            {rrRatio > 0 && tpValid && (
              <>
                <div style={{ ...outputRow, marginTop: 4 }}>
                  <span style={outputLabel}>R:R Ratio</span>
                  <span style={{ ...outputValue, color: rrColor, fontSize: 13 }}>1 : {rrRatio.toFixed(2)}</span>
                </div>
                <div style={outputRow}>
                  <span style={outputLabel}>Potential Gain</span>
                  <span style={{ ...outputValue, color: T.bull }}>+${tpGainUsd.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* R:R quality badge */}
        {rrRatio > 0 && slValid && tpValid && (
          <div style={{
            textAlign: 'center', padding: '6px', borderRadius: 3, marginBottom: 10,
            background: rrRatio >= 2 ? 'rgba(76,175,80,0.12)' : 'rgba(255,152,0,0.10)',
            border: `1px solid ${rrRatio >= 2 ? 'rgba(76,175,80,0.3)' : 'rgba(255,152,0,0.3)'}`,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: rrColor, fontFamily: T.font }}>
              {rrRatio >= 3 ? '⬛ Excellent setup' : rrRatio >= 2 ? '✓ Good R:R' : rrRatio >= 1 ? '⚠ Marginal R:R' : '✗ Poor R:R'}
            </span>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ fontSize: 8, color: T.text3, fontFamily: T.font, lineHeight: 1.5, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
          Approx. for USD-quoted FX pairs (EURUSD, GBPUSD, etc.). JPY & XAU adjusted. Paper mode only.
        </div>
      </div>
    </div>
  );
}
