'use client';
import React, { useState } from 'react';
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';

export function AlertsPanel() {
  const { state, dispatch, symbolInfo } = useWorkspace();
  const [showCreate, setShowCreate] = useState(false);
  const [alertPrice, setAlertPrice] = useState('');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');

  const createAlert = () => {
    const val = parseFloat(alertPrice);
    if (isNaN(val)) return;
    dispatch({
      type: 'ADD_ALERT',
      alert: {
        type: 'price', symbol: state.symbol,
        condition: `Price ${alertCondition} ${formatPrice(val)}`,
        value: val, active: true, triggered: false,
      },
    });
    setAlertPrice('');
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
        <div style={{
          padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, marginBottom: 6 }}>
            Price Alert — {state.symbol}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <button
              onClick={() => setAlertCondition('above')}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 3, fontSize: 10, fontWeight: 500,
                border: `1px solid ${alertCondition === 'above' ? T.bull : T.border}`,
                background: alertCondition === 'above' ? T.bullBg : 'transparent',
                color: alertCondition === 'above' ? T.bull : T.text2,
                cursor: 'pointer', fontFamily: T.font, outline: 'none',
              }}
            >
              Crosses Above
            </button>
            <button
              onClick={() => setAlertCondition('below')}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 3, fontSize: 10, fontWeight: 500,
                border: `1px solid ${alertCondition === 'below' ? T.bear : T.border}`,
                background: alertCondition === 'below' ? T.bearBg : 'transparent',
                color: alertCondition === 'below' ? T.bear : T.text2,
                cursor: 'pointer', fontFamily: T.font, outline: 'none',
              }}
            >
              Crosses Below
            </button>
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
            <button
              onClick={createAlert}
              style={{
                padding: '0 12px', height: 26, borderRadius: 3, border: 'none',
                background: T.accent, color: '#fff', fontSize: 10,
                fontWeight: 600, cursor: 'pointer', fontFamily: T.font, outline: 'none',
              }}
            >
              Create
            </button>
          </div>
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
                <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font }}>{alert.symbol}</div>
                <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{alert.condition}</div>
              </div>
              <button
                onClick={() => dispatch({ type: 'TOGGLE_ALERT', id: alert.id })}
                style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0, outline: 'none', color: alert.active ? T.accent : T.text3 }}
              >
                {alert.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              </button>
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
