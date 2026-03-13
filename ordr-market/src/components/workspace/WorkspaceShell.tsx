'use client';
/**
 * ORDR Market — Workspace Shell
 * Root layout orchestrator. Manages CSS layout for all regions:
 * CommandBar | LeftRail+Panel | ChartCore | RightStack | BottomDock | StatusBar
 */
import React from 'react';
import { WorkspaceProvider, useWorkspace } from './WorkspaceProvider';
import { CommandBar } from './CommandBar';
import { LeftRail } from './LeftRail';
import { RightStack } from './RightStack';
import { BottomDock } from './BottomDock';
import { ChartCore } from './ChartCore';
import { T } from './tokens';

// ── Status Bar ───────────────────────────────────────────────────────────────
function StatusBar() {
  const { state } = useWorkspace();

  const modeLabel = { focus: 'FOCUS', workspace: 'WORKSPACE', execution: 'EXECUTION' }[state.mode];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: T.statusBarH,
      background: T.surface, borderTop: `1px solid ${T.border}`,
      padding: '0 10px', gap: 8, flexShrink: 0, fontFamily: T.font, zIndex: 20,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 500, color: T.text2 }}>Market Open</span>
      <span style={{ width: 1, height: 10, background: T.border }} />
      <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>London 09:42</span>
      <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>New York 04:42</span>
      <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>Tokyo 17:42</span>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 10, color: T.text3 }}>{state.indicators.length} indicators</span>
      <span style={{ width: 1, height: 10, background: T.border }} />
      <span style={{ fontSize: 10, color: T.text3, fontFamily: T.mono }}>12ms</span>
      <span style={{ width: 1, height: 10, background: T.border }} />
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

// ── Main Layout ──────────────────────────────────────────────────────────────
function WorkspaceLayout() {
  const { state } = useWorkspace();
  const isFocus = state.mode === 'focus';

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
          <ChartCore />
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
