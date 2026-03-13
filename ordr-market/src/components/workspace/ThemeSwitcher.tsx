'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { THEME_PRESETS } from '@/lib/theme/presets';
import { TEMPLATES } from '@/lib/theme/templates';
import { T } from './tokens';

export function ThemeSwitcher() {
  const { appearance, setAppearance, resolvedMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const currentPreset = THEME_PRESETS[appearance.themeId];

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '0 8px', height: 26, borderRadius: T.r2,
          border: `1px solid ${T.border}`,
          background: open ? T.accentBg : 'transparent',
          color: open ? T.accent : T.text2,
          fontSize: 11, fontWeight: 500, fontFamily: T.font,
          cursor: 'pointer', outline: 'none',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; }}}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}}
        title="Theme"
      >
        <Palette size={13} />
        <span>{currentPreset?.name ?? 'Theme'}</span>
        {resolvedMode === 'dark' ? <Moon size={10} /> : <Sun size={10} />}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 32, right: 0, zIndex: 200,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.r4, boxShadow: T.shadowFloat,
          padding: '6px 0', minWidth: 220, maxHeight: 400, overflowY: 'auto',
        }}>
          {/* Theme Presets */}
          <div style={{ padding: '2px 10px 4px', fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.08em', fontFamily: T.font }}>
            THEMES
          </div>
          {Object.values(THEME_PRESETS).map(preset => {
            const isActive = appearance.themeId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => {
                  setAppearance({ ...appearance, themeId: preset.id as typeof appearance.themeId, modeOverride: preset.mode, templateId: null });
                  setOpen(false);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 10px', cursor: 'pointer',
                  background: isActive ? T.accentBg : 'transparent',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = T.hover; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = isActive ? T.accentBg : 'transparent'; }}
              >
                {/* Color swatch */}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: preset.colors.bgDeep, border: '1px solid rgba(128,128,128,0.3)' }} />
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: preset.colors.bgPanel, border: '1px solid rgba(128,128,128,0.3)' }} />
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: preset.colors.accentBlue, border: '1px solid rgba(128,128,128,0.3)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: T.text1, fontFamily: T.font }}>{preset.name}</div>
                  <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{preset.mode === 'dark' ? 'Dark' : 'Light'}</div>
                </div>
                {isActive && <Check size={12} color={T.accent} />}
              </div>
            );
          })}

          {/* Divider */}
          <div style={{ height: 1, background: T.border, margin: '4px 0' }} />

          {/* Quick Templates */}
          <div style={{ padding: '2px 10px 4px', fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.08em', fontFamily: T.font }}>
            TEMPLATES
          </div>
          {TEMPLATES.map(tmpl => {
            const isActive = appearance.templateId === tmpl.id;
            return (
              <div
                key={tmpl.id}
                onClick={() => {
                  setAppearance(tmpl.settings);
                  setOpen(false);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 10px', cursor: 'pointer',
                  background: isActive ? T.accentBg : 'transparent',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = T.hover; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = isActive ? T.accentBg : 'transparent'; }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: T.text1, fontFamily: T.font }}>{tmpl.name}</div>
                  <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{tmpl.description}</div>
                </div>
                {isActive && <Check size={12} color={T.accent} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
