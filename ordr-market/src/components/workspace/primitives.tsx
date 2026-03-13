'use client';
/**
 * ORDR Market — Workspace Primitive Components
 *
 * Reusable atomic building blocks for the trading workspace UI.
 * All components are intentionally compact, monochromatic, and hover-precise.
 */

import React, { type ReactNode, type CSSProperties } from 'react';
import { T } from './tokens';

// ─────────────────────────────────────────────────────────────────────────────
// ICON BUTTON  —  standard 28px icon container for toolbars
// ─────────────────────────────────────────────────────────────────────────────
interface IconButtonProps {
  icon: ReactNode;
  active?: boolean;
  label?: string;        // shown as tooltip + inline text when provided
  onClick?: () => void;
  size?: number;         // container width (default 28)
  showLabel?: boolean;   // render text beside icon
  disabled?: boolean;
}

export function IconButton({
  icon, active, label, onClick, size = 28, showLabel = false, disabled,
}: IconButtonProps) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: showLabel ? undefined : size,
    width: showLabel ? undefined : size,
    height: size,
    padding: showLabel ? '0 7px' : '0',
    borderRadius: T.r2,
    border: 'none',
    background: active ? T.accentBg : 'transparent',
    color: active ? T.accent : T.text2,
    cursor: disabled ? 'default' : 'pointer',
    flexShrink: 0,
    outline: 'none',
    opacity: disabled ? 0.4 : 1,
    fontFamily: T.font,
    fontSize: 11,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    transition: 'background 0.1s ease, color 0.1s ease',
  };

  const handleEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (active || disabled) return;
    e.currentTarget.style.background = T.hover;
    e.currentTarget.style.color = T.text1;
  };
  const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (active || disabled) return;
    e.currentTarget.style.background = 'transparent';
    e.currentTarget.style.color = T.text2;
  };

  return (
    <button
      style={base}
      title={label}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {icon}
      {showLabel && label && (
        <span style={{ fontSize: 11, fontWeight: 500 }}>{label}</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RAIL BUTTON  —  32px square for left/right side rails
// ─────────────────────────────────────────────────────────────────────────────
interface RailButtonProps {
  icon: ReactNode;
  active?: boolean;
  tooltip?: string;
  onClick?: () => void;
}

export function RailButton({ icon, active, tooltip, onClick }: RailButtonProps) {
  const base: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: T.r3,
    border: 'none',
    background: active ? T.accentBg : 'transparent',
    color: active ? T.accent : T.text2,
    cursor: 'pointer',
    flexShrink: 0,
    outline: 'none',
  };

  const handleEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (active) return;
    e.currentTarget.style.background = T.hover;
    e.currentTarget.style.color = T.text1;
  };
  const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (active) return;
    e.currentTarget.style.background = 'transparent';
    e.currentTarget.style.color = T.text2;
  };

  return (
    <button
      style={base}
      title={tooltip}
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {icon}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMEFRAME BUTTON  —  compact label button for timeframe selector
// ─────────────────────────────────────────────────────────────────────────────
interface TimeframeButtonProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export function TimeframeButton({ label, active, onClick }: TimeframeButtonProps) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 5px',
    height: 24,
    minWidth: 26,
    borderRadius: T.r2,
    border: 'none',
    background: active ? T.accentBg : 'transparent',
    color: active ? T.accent : T.text2,
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    flexShrink: 0,
    fontFamily: T.font,
    outline: 'none',
    letterSpacing: '-0.1px',
  };

  const handleEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (active) return;
    e.currentTarget.style.background = T.hover;
    e.currentTarget.style.color = T.text1;
  };
  const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (active) return;
    e.currentTarget.style.background = 'transparent';
    e.currentTarget.style.color = T.text2;
  };

  return (
    <button
      style={base}
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE BADGE  —  SELL / BUY bid-ask buttons
// ─────────────────────────────────────────────────────────────────────────────
interface QuoteBadgeProps {
  side: 'SELL' | 'BUY';
  price: string;
  onClick?: () => void;
}

export function QuoteBadge({ side, price, onClick }: QuoteBadgeProps) {
  const isBuy = side === 'BUY';
  const color  = isBuy ? T.bull : T.bear;
  const bg     = isBuy ? T.bullBg : T.bearBg;
  const border = isBuy ? T.bullBorder : T.bearBorder;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 9px',
        height: 24,
        borderRadius: T.r2,
        border: `1px solid ${border}`,
        background: bg,
        cursor: 'pointer',
        flexShrink: 0,
        outline: 'none',
      }}
    >
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        color,
        letterSpacing: '0.05em',
        fontFamily: T.font,
      }}>
        {side}
      </span>
      <span style={{
        fontSize: 12,
        fontWeight: 500,
        color: T.text1,
        fontFamily: T.mono,
        letterSpacing: '-0.5px',
      }}>
        {price}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLBAR SEPARATOR  —  thin spacer line between toolbar groups
// ─────────────────────────────────────────────────────────────────────────────
interface ToolbarSeparatorProps {
  axis?: 'vertical' | 'horizontal';
}

export function ToolbarSeparator({ axis = 'vertical' }: ToolbarSeparatorProps) {
  if (axis === 'vertical') {
    return (
      <div style={{
        width: 1,
        height: 16,
        background: T.border,
        flexShrink: 0,
        margin: '0 5px',
      }} />
    );
  }
  return (
    <div style={{
      height: 1,
      width: '76%',
      background: T.border,
      flexShrink: 0,
      margin: '3px auto',
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS PILL  —  compact info chip for the bottom bar
// ─────────────────────────────────────────────────────────────────────────────
interface StatusPillProps {
  label: string;
  value?: string;
  dot?: string;    // color of the dot indicator
  active?: boolean;
  onClick?: () => void;
}

export function StatusPill({ label, value, dot, active, onClick }: StatusPillProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 7px',
        height: 18,
        borderRadius: T.r1,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      {dot && (
        <span style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: dot,
          flexShrink: 0,
        }} />
      )}
      <span style={{
        fontSize: 10,
        fontWeight: 500,
        color: active ? T.accent : T.text2,
        fontFamily: T.font,
        letterSpacing: '0.01em',
      }}>
        {label}
      </span>
      {value && (
        <span style={{
          fontSize: 10,
          fontWeight: 400,
          color: T.text3,
          fontFamily: T.mono,
          letterSpacing: '-0.3px',
        }}>
          {value}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLBAR GROUP  —  wraps related icon buttons with consistent padding
// ─────────────────────────────────────────────────────────────────────────────
interface ToolbarGroupProps {
  children: ReactNode;
  gap?: number;
}

export function ToolbarGroup({ children, gap = 0 }: ToolbarGroupProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap,
      flexShrink: 0,
    }}>
      {children}
    </div>
  );
}
