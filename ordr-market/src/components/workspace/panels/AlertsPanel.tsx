'use client';
import React, { useState } from 'react';
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, AlertTriangle, RotateCcw, Activity } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';

type AlertTab = 'price' | 'indicator';

const INDICATOR_CONDITIONS = [
  { label: 'RSI > threshold',    condition: 'rsi_above',       hasValue: true,  placeholder: '70' },
  { label: 'RSI < threshold',    condition: 'rsi_below',       hasValue: true,  placeholder: '30' },
  { label: 'Price × EMA above',  condition: 'ema_cross_above', hasValue: true,  placeholder: '20 (period)' },
  { label: 'Price × EMA below',  condition: 'ema_cross_below', hasValue: true,  placeholder: '20 (period)' },
  { label: 'MACD Bull Cross',    condition: 'macd_bull_cross', hasValue: false, placeholder: '' },
  { label: 'MACD Bear Cross',    condition: 'macd_bear_cross', hasValue: false, placeholder: '' },
] as const;

function conditionLabel(condition: string, value: number): string {
  if (condition === 'rsi_above')       return `RSI > ${value}`;
  if (condition === 'rsi_below')       return `RSI < ${value}`;
  if (condition === 'ema_cross_above') return `Price crosses EMA(${value}) ↑`;
  if (condition === 'ema_cross_below') return `Price crosses EMA(${value}) ↓`;
  if (condition === 'macd_bull_cross') return 'MACD Bull Cross ↑';
  if (condition === 'macd_bear_cross') return 'MACD Bear Cross ↓';
  return condition;
}

export function AlertsPanel() {
  const { state, dispatch, symbolInfo } = useWorkspace();
  const [activeTab, setActiveTab] = useState<AlertTab>('price');
  const [showCreate, setShowCreate] = useState(false);
  const [alertPrice, setAlertPrice] = useState('');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');

  // Indicator alert form state
  const [indCondition, setIndCondition] = useState(INDICATOR_CONDITIONS[0].condition);
  const [indValue, setIndValue] = useState('70');

  const selectedIndCond = INDICATOR_CONDITIONS.find(c => c.condition === indCondition) ?? INDICATOR_CONDITIONS[0];

  const createAlert = () => {
    const val = parseFloat(alertPrice);
    if (isNaN(val)) return;
    dispatch({
      type: 'ADD_ALERT',
      alert: {
        type: 'price', symbol: state.symbol,
        condition: `price_${alertCondition}`,
        value: val, active: true, triggered: false,
      },
    });
    setAlertPrice('');
    setShowCreate(false);
  };

  const createIndicatorAlert = () => {
    const val = selectedIndCond.hasValue ? parseFloat(indValue) : 0;
    if (selectedIndCond.hasValue && isNaN(val)) return;
    dispatch({
      type: 'ADD_ALERT',
      alert: {
        type: 'indicator', symbol: state.symbol,
        condition: indCondition,
        value: val, active: true, triggered: false,
      },
    });
    setShowCreate(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Bell size={12} color={T.text2} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>
          Alerts ({state.alerts.length})
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '3px 8px', borderRadius: 3, border: 'none',
            background: T.accent, color: '#fff', fontSize: 9,
            fontWeight: 600, cursor: 'pointer', outline: 'none', fontFamily: T.font,
          }}
        >
          <Plus size={10} /> New
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          {/* Tabs: Price / Indicator */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
            {(['price', 'indicator'] as AlertTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: '4px 0', borderRadius: 3, fontSize: 9, fontWeight: 600,
                  border: `1px solid ${activeTab === tab ? T.accent : T.border}`,
                  background: activeTab === tab ? T.accentBg : 'transparent',
                  color: activeTab === tab ? T.accent : T.text2,
                  cursor: 'pointer', fontFamily: T.font, outline: 'none', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}
              >
                {tab === 'price' ? <><Bell size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />Price</> : <><Activity size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />Indicator</>}
              </button>
            ))}
          </div>

          {activeTab === 'price' ? (
            <>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, marginBottom: 6 }}>
                Price Alert — {state.symbol}
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {(['above', 'below'] as const).map(dir => (
                  <button
                    key={dir}
                    onClick={() => setAlertCondition(dir)}
                    style={{
                      flex: 1, padding: '4px 0', borderRadius: 3, fontSize: 10, fontWeight: 500,
                      border: `1px solid ${alertCondition === dir ? (dir === 'above' ? T.bull : T.bear) : T.border}`,
                      background: alertCondition === dir ? (dir === 'above' ? T.bullBg : T.bearBg) : 'transparent',
                      color: alertCondition === dir ? (dir === 'above' ? T.bull : T.bear) : T.text2,
                      cursor: 'pointer', fontFamily: T.font, outline: 'none',
                    }}
                  >
                    {dir === 'above' ? 'Crosses Above' : 'Crosses Below'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  value={alertPrice}
                  onChange={e => setAlertPrice(e.target.value)}
                  placeholder={formatPrice(symbolInfo.price)}
                  onKeyDown={e => { if (e.key === 'Enter') createAlert(); }}
                  style={{
                    flex: 1, height: 26, padding: '0 8px', borderRadius: 3,
                    border: `1px solid ${T.border}`, background: T.surfaceAlt,
                    color: T.text1, fontSize: 11, fontFamily: T.mono, outline: 'none',
                  }}
                />
                <button onClick={createAlert} style={{ padding: '0 12px', height: 26, borderRadius: 3, border: 'none', background: T.accent, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, outline: 'none' }}>
                  Create
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, marginBottom: 6 }}>
                Indicator Alert — {state.symbol}
              </div>
              <select
                value={indCondition}
                onChange={e => {
                  const cond = INDICATOR_CONDITIONS.find(c => c.condition === e.target.value);
                  setIndCondition(e.target.value as typeof indCondition);
                  if (cond?.placeholder) setIndValue(cond.placeholder.split(' ')[0]);
                }}
                style={{
                  width: '100%', height: 26, padding: '0 6px', borderRadius: 3,
                  border: `1px solid ${T.border}`, background: T.surfaceAlt,
                  color: T.text1, fontSize: 10, fontFamily: T.font, outline: 'none',
                  marginBottom: 6, cursor: 'pointer',
                }}
              >
                {INDICATOR_CONDITIONS.map(c => (
                  <option key={c.condition} value={c.condition}>{c.label}</option>
                ))}
              </select>
              {selectedIndCond.hasValue && (
                <input
                  value={indValue}
                  onChange={e => setIndValue(e.target.value)}
                  placeholder={selectedIndCond.placeholder}
                  onKeyDown={e => { if (e.key === 'Enter') createIndicatorAlert(); }}
                  style={{
                    width: '100%', height: 26, padding: '0 8px', borderRadius: 3,
                    border: `1px solid ${T.border}`, background: T.surfaceAlt,
                    color: T.text1, fontSize: 11, fontFamily: T.mono, outline: 'none',
                    boxSizing: 'border-box', marginBottom: 6,
                  }}
                />
              )}
              <button onClick={createIndicatorAlert} style={{ width: '100%', height: 26, borderRadius: 3, border: 'none', background: T.accent, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, outline: 'none' }}>
                Create Indicator Alert
              </button>
            </>
          )}
        </div>
      )}

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {state.alerts.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', padding: 20,
          }}>
            <Bell size={24} color={T.text3} style={{ opacity: 0.3, marginBottom: 8 }} />
            <span style={{ fontSize: 11, color: T.text3, fontFamily: T.font }}>No active alerts</span>
          </div>
        ) : (
          state.alerts.map(alert => (
            <div
              key={alert.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', margin: '0 4px', borderRadius: 3,
                marginBottom: 1, opacity: alert.active ? 1 : 0.5,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {alert.triggered ? (
                <AlertTriangle size={12} color={T.warn} />
              ) : (
                <Bell size={12} color={alert.active ? T.accent : T.text3} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 500, color: alert.triggered ? T.warn : T.text1, fontFamily: T.font }}>{alert.symbol}</span>
                  {alert.type === 'indicator' && <Activity size={9} color={T.accent} />}
                </div>
                <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>
                  {alert.type === 'indicator' ? conditionLabel(alert.condition, alert.value) : alert.condition}
                </div>
                {alert.triggered && (
                  <div style={{ fontSize: 9, color: T.warn, fontFamily: T.font, fontWeight: 600, marginTop: 1 }}>TRIGGERED</div>
                )}
              </div>
              {alert.triggered ? (
                <button
                  onClick={() => dispatch({ type: 'RESET_ALERT', id: alert.id })}
                  title="Reset alert"
                  style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 2, outline: 'none', color: T.warn, borderRadius: 3 }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.warnBg; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <RotateCcw size={11} />
                </button>
              ) : (
                <button
                  onClick={() => dispatch({ type: 'TOGGLE_ALERT', id: alert.id })}
                  style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0, outline: 'none', color: alert.active ? T.accent : T.text3 }}
                >
                  {alert.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                </button>
              )}
              <button
                onClick={() => dispatch({ type: 'REMOVE_ALERT', id: alert.id })}
                style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0, outline: 'none', color: T.text3 }}
                onMouseEnter={e => { e.currentTarget.style.color = T.bear; }}
                onMouseLeave={e => { e.currentTarget.style.color = T.text3; }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
