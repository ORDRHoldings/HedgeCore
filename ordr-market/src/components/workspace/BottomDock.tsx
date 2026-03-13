'use client';
/**
 * ORDR Market — Bottom Dock
 * Collapsible bottom dock with mode tabs: MTF Strip, Scanner, Replay, Strategy, Orders.
 * Includes drag-to-resize handle at top.
 */
import React, { useCallback, useRef } from 'react';
import {
  Clock, ScanLine, PlayCircle, Cpu, ClipboardList, GripHorizontal,
  X,
} from 'lucide-react';
import { T } from './tokens';
import { useWorkspace } from './WorkspaceProvider';
import type { BottomTab } from './workspace-types';
import { BASE_TIMEFRAMES, formatPrice } from './workspace-data';

const BOTTOM_TABS: { id: BottomTab; icon: React.ReactNode; label: string }[] = [
  { id: 'mtf',      icon: <Clock size={12} />,         label: 'Multi-Timeframe' },
  { id: 'scanner',   icon: <ScanLine size={12} />,     label: 'Scanner' },
  { id: 'replay',    icon: <PlayCircle size={12} />,   label: 'Replay' },
  { id: 'strategy',  icon: <Cpu size={12} />,          label: 'Strategy' },
  { id: 'orders',    icon: <ClipboardList size={12} />, label: 'Orders' },
];

// ── MTF Strip ────────────────────────────────────────────────────────────────
function MTFStrip() {
  const { state } = useWorkspace();
  const timeframes = ['5m', '15m', '1h', '4h', 'D'];

  return (
    <div style={{ display: 'flex', gap: 1, padding: 8, height: '100%', overflow: 'hidden' }}>
      {timeframes.map(tf => {
        const active = state.timeframe === tf;
        return (
          <div
            key={tf}
            style={{
              flex: 1, minWidth: 120,
              display: 'flex', flexDirection: 'column',
              background: active ? T.selectedBg : T.surfaceAlt,
              border: `1px solid ${active ? T.accent : T.border}`,
              borderRadius: T.r3, overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 8px', borderBottom: `1px solid ${T.border}`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? T.accent : T.text1, fontFamily: T.font }}>{tf}</span>
              <span style={{ fontSize: 9, color: T.text3 }}>{state.symbol}</span>
            </div>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 8, background: T.chartBg, minHeight: 60,
            }}>
              <span style={{ fontSize: 10, color: '#787B86', fontFamily: T.mono }}>Chart · {tf}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Scanner Shell ────────────────────────────────────────────────────────────
function ScannerShell() {
  return (
    <div style={{ padding: 12, height: '100%', overflow: 'auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font }}>Scanner</span>
        <span style={{
          fontSize: 9, padding: '1px 6px', borderRadius: 3,
          background: T.warnBg, color: T.warn, fontWeight: 600,
        }}>BETA</span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6,
      }}>
        {['Bullish FVG', 'Bearish FVG', 'Order Block', 'Liquidity Sweep', 'EMA Cross', 'Volume Spike'].map(scan => (
          <div
            key={scan}
            style={{
              padding: '8px 10px', borderRadius: T.r3,
              border: `1px solid ${T.border}`, background: T.surfaceAlt,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font }}>{scan}</div>
            <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>0 results</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Replay Shell ─────────────────────────────────────────────────────────────
function ReplayShell() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 12,
    }}>
      <PlayCircle size={20} color={T.text3} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font }}>Bar Replay</div>
        <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>Step through historical bars to practice analysis</div>
      </div>
      <button style={{
        padding: '6px 16px', borderRadius: 3, border: 'none',
        background: T.accent, color: '#fff', fontSize: 11,
        fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
      }}>
        Start Replay
      </button>
    </div>
  );
}

// ── Strategy Dock ────────────────────────────────────────────────────────────
function StrategyDock() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 12,
    }}>
      <Cpu size={20} color={T.text3} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font }}>Strategy Runner</div>
        <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>Run backtest results inline below the chart</div>
      </div>
      <a href="/strategy" style={{
        padding: '6px 16px', borderRadius: 3, border: `1px solid ${T.border}`,
        background: 'transparent', color: T.text1, fontSize: 11,
        fontWeight: 500, cursor: 'pointer', fontFamily: T.font, textDecoration: 'none',
      }}>
        Open Strategy Lab
      </a>
    </div>
  );
}

// ── Orders/Positions ─────────────────────────────────────────────────────────
function OrdersDock() {
  return (
    <div style={{ padding: 12, height: '100%' }}>
      <div style={{
        display: 'flex', gap: 12, marginBottom: 8,
      }}>
        {['Open Positions', 'Pending Orders', 'Trade History'].map((tab, i) => (
          <span key={tab} style={{
            fontSize: 10, fontWeight: i === 0 ? 600 : 400,
            color: i === 0 ? T.accent : T.text3,
            cursor: 'pointer', fontFamily: T.font,
            paddingBottom: 4,
            borderBottom: i === 0 ? `2px solid ${T.accent}` : 'none',
          }}>
            {tab}
          </span>
        ))}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 'calc(100% - 32px)', color: T.text3, fontSize: 11,
      }}>
        No open positions
      </div>
    </div>
  );
}

// ── Content Router ───────────────────────────────────────────────────────────
function DockContent({ tab }: { tab: BottomTab }) {
  switch (tab) {
    case 'mtf':      return <MTFStrip />;
    case 'scanner':  return <ScannerShell />;
    case 'replay':   return <ReplayShell />;
    case 'strategy': return <StrategyDock />;
    case 'orders':   return <OrdersDock />;
  }
}

// ── Main Bottom Dock ─────────────────────────────────────────────────────────
export function BottomDock() {
  const { state, dispatch } = useWorkspace();
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: state.bottomHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      dispatch({ type: 'SET_BOTTOM_HEIGHT', height: dragRef.current.startH + delta });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [state.bottomHeight, dispatch]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      background: T.surface, overflow: 'hidden',
    }}>
      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        style={{
          height: 4, cursor: 'row-resize', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Drag to resize"
      >
        <GripHorizontal size={12} color={T.text3} style={{ opacity: 0.4 }} />
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', height: 28,
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        padding: '0 8px', gap: 0,
      }}>
        {BOTTOM_TABS.map(tab => {
          const active = state.bottomTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: tab.id })}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0 8px', height: 26, borderRadius: 3,
                border: 'none', outline: 'none',
                background: active ? T.accentBg : 'transparent',
                color: active ? T.accent : T.text3,
                fontSize: 10, fontWeight: active ? 600 : 400,
                fontFamily: T.font, cursor: 'pointer', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = active ? T.accentBg : 'transparent'; e.currentTarget.style.color = active ? T.accent : T.text3; } }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: null })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 3, border: 'none',
            background: 'transparent', color: T.text3, cursor: 'pointer', outline: 'none',
          }}
          title="Close dock"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {state.bottomTab && <DockContent tab={state.bottomTab} />}
      </div>
    </div>
  );
}
