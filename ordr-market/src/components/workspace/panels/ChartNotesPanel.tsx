'use client';
/**
 * ChartNotesPanel — Per-symbol chart notes
 *
 * A simple auto-saving textarea that persists analysis notes for each symbol
 * in localStorage.  Notes are keyed by symbol so switching charts loads the
 * correct note automatically.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Save, Trash2 } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';

const LS_PREFIX = 'ordr_note_';
const AUTOSAVE_DELAY = 800;

function noteKey(symbol: string) {
  return `${LS_PREFIX}${symbol.toUpperCase()}`;
}

function loadNote(symbol: string): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(noteKey(symbol)) ?? '';
}

function saveNote(symbol: string, text: string) {
  if (typeof window === 'undefined') return;
  if (text.trim()) {
    localStorage.setItem(noteKey(symbol), text);
  } else {
    localStorage.removeItem(noteKey(symbol));
  }
}

export function ChartNotesPanel() {
  const { state } = useWorkspace();
  const symbol = state.symbol;

  const [text,      setText]      = useState(() => loadNote(symbol));
  const [savedAt,   setSavedAt]   = useState(0);
  const [dirty,     setDirty]     = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reload when symbol changes
  useEffect(() => {
    setText(loadNote(symbol));
    setSavedAt(0);
    setDirty(false);
  }, [symbol]);

  // Auto-save after AUTOSAVE_DELAY ms of inactivity
  const scheduleAutoSave = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveNote(symbol, value);
      setSavedAt(Date.now());
      setDirty(false);
    }, AUTOSAVE_DELAY);
  }, [symbol]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    setDirty(true);
    scheduleAutoSave(value);
  }

  function handleSave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    saveNote(symbol, text);
    setSavedAt(Date.now());
    setDirty(false);
  }

  function handleClear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setText('');
    saveNote(symbol, '');
    setSavedAt(0);
    setDirty(false);
  }

  // Collect all symbols that have notes
  const noteSymbols: string[] = [];
  if (typeof window !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS_PREFIX)) noteSymbols.push(k.slice(LS_PREFIX.length));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <FileText size={12} color={T.text2} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>
          Notes — <span style={{ color: T.accent }}>{symbol}</span>
        </span>
        {dirty && (
          <span style={{ fontSize: 8, color: T.warn, fontFamily: T.font, fontWeight: 600 }}>unsaved</span>
        )}
        {savedAt > 0 && !dirty && (
          <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>
            saved {new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Textarea */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 10px', gap: 6 }}>
        <textarea
          value={text}
          onChange={handleChange}
          placeholder={`Analysis notes for ${symbol}…\n\nE.g. "Key level at 1.0850, watching for break above. RSI oversold on 1H. Session range mid at 1.0823."`}
          spellCheck={false}
          style={{
            flex: 1, resize: 'none', padding: '8px',
            borderRadius: 3, border: `1px solid ${dirty ? T.accent : T.border}`,
            background: T.surfaceAlt, color: T.text1,
            fontSize: 11, fontFamily: T.font, lineHeight: 1.6,
            outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
        />

        {/* Action row */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={handleSave}
            disabled={!dirty}
            style={{
              flex: 1, height: 26, borderRadius: 3, border: 'none',
              background: dirty ? T.accent : T.border,
              color: dirty ? '#fff' : T.text3,
              fontSize: 10, fontWeight: 600, cursor: dirty ? 'pointer' : 'not-allowed',
              fontFamily: T.font, outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <Save size={10} /> Save
          </button>
          <button
            onClick={handleClear}
            disabled={!text}
            title="Clear note for this symbol"
            style={{
              width: 26, height: 26, borderRadius: 3, border: `1px solid ${T.border}`,
              background: 'transparent', color: text ? T.bear : T.text3,
              fontSize: 10, cursor: text ? 'pointer' : 'not-allowed',
              fontFamily: T.font, outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { if (text) e.currentTarget.style.background = 'rgba(239,83,80,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Notes index — other symbols with notes */}
      {noteSymbols.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: '6px 10px', flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Saved notes
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {noteSymbols.map(sym => (
              <span
                key={sym}
                style={{
                  padding: '2px 6px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                  fontFamily: T.mono, cursor: 'default',
                  background: sym === symbol ? T.accentBg : T.border,
                  color: sym === symbol ? T.accent : T.text3,
                }}
              >
                {sym}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
