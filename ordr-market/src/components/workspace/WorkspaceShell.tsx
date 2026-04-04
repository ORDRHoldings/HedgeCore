'use client';
/**
 * ORDR Market — Workspace Shell
 * Root layout orchestrator. Manages CSS layout for all regions:
 * CommandBar | LeftRail+Panel | ChartCore | RightStack | BottomDock | StatusBar
 */
import React, { useState, useEffect } from 'react';
import { WorkspaceProvider, useWorkspace } from './WorkspaceProvider';
import { CommandBar } from './CommandBar';
import { LeftRail } from './LeftRail';
import { RightStack } from './RightStack';
import { BottomDock } from './BottomDock';
import { ChartCore } from './ChartCore';
import { SecondaryChartPane } from './SecondaryChartPane';
import { CommandPalette } from './CommandPalette';
import { QuickTradeModal } from './QuickTradeModal';
import { T } from './tokens';
import type { ChartLayout, SecondaryChart } from './workspace-types';

// ── Session clock helpers ─────────────────────────────────────────────────────
const SESSIONS = [
  { label: 'London',   offset:  0, open:  8, close: 17 },  // UTC
  { label: 'New York', offset: -5, open:  8, close: 17 },  // EST = UTC-5
  { label: 'Tokyo',    offset:  9, open:  9, close: 18 },  // JST = UTC+9
] as const;

function sessionTime(now: Date, utcOffsetHours: number): string {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const local = new Date(utcMs + utcOffsetHours * 3_600_000);
  return `${local.getHours().toString().padStart(2, '0')}:${local.getMinutes().toString().padStart(2, '0')}`;
}

function isSessionOpen(now: Date, utcOffsetHours: number, openH: number, closeH: number): boolean {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const local = new Date(utcMs + utcOffsetHours * 3_600_000);
  const h = local.getHours();
  return h >= openH && h < closeH;
}

function isForexOpen(now: Date): boolean {
  // Forex is open Sun 22:00 UTC – Fri 22:00 UTC
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 6) return false; // Saturday always closed
  if (day === 0 && now.getUTCHours() < 22) return false; // Sunday before 22:00
  if (day === 5 && now.getUTCHours() >= 22) return false; // Friday after 22:00
  return true;
}

function fmtSpread(bid: number, ask: number): string {
  if (!bid || !ask || bid <= 0 || ask <= 0) return '—';
  const spread = ask - bid;
  // Show in pips: JPY pairs multiply by 100, others by 10000
  const pips = spread * (ask > 100 ? 100 : 10_000);
  return `${pips.toFixed(1)}p`;
}

// ── Status Bar ───────────────────────────────────────────────────────────────
function StatusBar() {
  const { state, symbolInfo } = useWorkspace();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const modeLabel = { focus: 'FOCUS', workspace: 'WORKSPACE', execution: 'EXECUTION' }[state.mode];
  const marketOpen = isForexOpen(now);
  const anySessionOpen = SESSIONS.some(s => isSessionOpen(now, s.offset, s.open, s.close));

  const Divider = () => <span style={{ width: 1, height: 10, background: T.border, flexShrink: 0 }} />;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: T.statusBarH,
      background: T.surface, borderTop: `1px solid ${T.border}`,
      padding: '0 10px', gap: 8, flexShrink: 0, fontFamily: T.font, zIndex: 20,
    }}>
      {/* Market open indicator */}
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: marketOpen ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 500, color: T.text2 }}>{marketOpen ? 'Market Open' : 'Market Closed'}</span>
      <Divider />

      {/* Live session clocks */}
      {SESSIONS.map(s => {
        const open = isSessionOpen(now, s.offset, s.open, s.close);
        return (
          <span
            key={s.label}
            style={{ fontSize: 10, color: open ? T.text1 : T.text3, fontFamily: T.mono, fontWeight: open ? 600 : 400 }}
          >
            {s.label} {sessionTime(now, s.offset)}{open ? ' ●' : ''}
          </span>
        );
      })}

      <Divider />

      {/* Bid / Ask / Spread */}
      {symbolInfo.bid > 0 && symbolInfo.ask > 0 && (
        <>
          <span style={{ fontSize: 10, color: T.bull, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' }}>
            B {symbolInfo.bid > 100 ? symbolInfo.bid.toFixed(2) : symbolInfo.bid.toFixed(5)}
          </span>
          <span style={{ fontSize: 10, color: T.bear, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' }}>
            A {symbolInfo.ask > 100 ? symbolInfo.ask.toFixed(2) : symbolInfo.ask.toFixed(5)}
          </span>
          <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono }}>
            {fmtSpread(symbolInfo.bid, symbolInfo.ask)}
          </span>
          <Divider />
        </>
      )}

      <div style={{ flex: 1 }} />

      <span style={{ fontSize: 10, color: T.text3 }}>{state.indicators.length} indicators</span>
      <Divider />
      <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>{state.symbol}</span>
      <Divider />
      <span style={{
        padding: '0 6px', height: 16, borderRadius: 3,
        background: T.infoBg, color: T.accent,
        fontWeight: 600, fontSize: 9, fontFamily: T.font,
        display: 'inline-flex', alignItems: 'center',
        letterSpacing: '0.05em',
      }}>
        {modeLabel}
      </span>
    </div>
  );
}

// ── Chart Grid ───────────────────────────────────────────────────────────────
function ChartGrid({ layout, secondaryCharts }: { layout: ChartLayout; secondaryCharts: SecondaryChart[] }) {
  const c = secondaryCharts;

  if (layout === '1') {
    return <ChartCore />;
  }

  if (layout === '2h') {
    // Primary left, secondary right
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, borderRight: `1px solid ${T.border}` }}><ChartCore /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {c[0] && <SecondaryChartPane id={c[0].id} symbol={c[0].symbol} timeframe={c[0].timeframe} />}
        </div>
      </div>
    );
  }

  if (layout === '2v') {
    // Primary top, secondary bottom
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, borderBottom: `1px solid ${T.border}` }}><ChartCore /></div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {c[0] && <SecondaryChartPane id={c[0].id} symbol={c[0].symbol} timeframe={c[0].timeframe} />}
        </div>
      </div>
    );
  }

  // layout === '4': 2×2 grid
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Top row */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ flex: 1, minWidth: 0, borderRight: `1px solid ${T.border}` }}><ChartCore /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {c[0] && <SecondaryChartPane id={c[0].id} symbol={c[0].symbol} timeframe={c[0].timeframe} />}
        </div>
      </div>
      {/* Bottom row */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, borderRight: `1px solid ${T.border}` }}>
          {c[1] && <SecondaryChartPane id={c[1].id} symbol={c[1].symbol} timeframe={c[1].timeframe} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {c[2] && <SecondaryChartPane id={c[2].id} symbol={c[2].symbol} timeframe={c[2].timeframe} />}
        </div>
      </div>
    </div>
  );
}

// ── Main Layout ──────────────────────────────────────────────────────────────
function WorkspaceLayout() {
  const { state } = useWorkspace();
  const isFocus = state.mode === 'focus';
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickTradeSide, setQuickTradeSide] = useState<'buy' | 'sell' | null>(null);

  // Cmd+K / Ctrl+K → open palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'b' || e.key === 'B') { e.preventDefault(); setQuickTradeSide('buy'); }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); setQuickTradeSide('sell'); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const showLeft = !isFocus;
  const showRight = !isFocus && state.rightTab !== null;
  const showBottom = !isFocus && state.bottomTab !== null;

  const leftWidth = showLeft ? (state.leftTab ? T.leftExpandedW : T.leftRailW) : 0;
  const rightWidth = showRight ? T.rightStackW : 0;
  const bottomHeight = showBottom ? state.bottomHeight : 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', width: '100vw',
      background: T.bg, overflow: 'hidden',
      fontFamily: T.font, color: T.text1,
    }}>
      <CommandBar />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {showLeft && (
          <div style={{
            width: leftWidth, flexShrink: 0,
            display: 'flex', overflow: 'hidden',
            transition: 'width 0.15s ease',
          }}>
            <LeftRail />
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <ChartGrid layout={state.chartLayout} secondaryCharts={state.secondaryCharts} />
          {showBottom && (
            <div style={{
              height: bottomHeight, flexShrink: 0,
              borderTop: `1px solid ${T.border}`,
              transition: 'height 0.15s ease',
              overflow: 'hidden',
            }}>
              <BottomDock />
            </div>
          )}
        </div>

        {showRight && (
          <div style={{
            width: rightWidth, flexShrink: 0,
            borderLeft: `1px solid ${T.border}`,
            transition: 'width 0.15s ease',
            overflow: 'hidden',
          }}>
            <RightStack />
          </div>
        )}
      </div>

      <StatusBar />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {quickTradeSide && (
        <QuickTradeModal side={quickTradeSide} onClose={() => setQuickTradeSide(null)} />
      )}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export default function WorkspaceShell() {
  return (
    <WorkspaceProvider>
      <WorkspaceLayout />
    </WorkspaceProvider>
  );
}
