'use client';
/**
 * ORDR Market — Strategy Workbench
 * Code editor · Backtest engine · Equity curve · Trade log · Save/Load · Apply to chart
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, logout } from '@/lib/auth';
import { runBacktestSandboxed } from '@/lib/strategy/runSandboxed';
import { TEMPLATES, DEFAULT_TEMPLATE } from '@/lib/strategy/templates';
import {
  saveStrategy, loadStrategy, listUserStrategies, newStrategyId, deleteStrategy,
} from '@/lib/strategy/store';
import type {
  BacktestResult, BacktestConfig, Language, StrategyMeta, Trade,
} from '@/lib/strategy/types';
import { DEFAULT_CONFIG } from '@/lib/strategy/types';
import type { Bar } from '@/lib/strategy/types';

// ── Design tokens ──────────────────────────────────────────────────────────────
const F   = "'Inter',-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code',monospace";
const BG  = 'var(--bg-deep, #F0F3FA)';
const SURF = 'var(--bg-panel, #FFFFFF)';
const BD  = 'var(--border-rim, #E0E3EB)';
const T1  = 'var(--text-primary, #131722)';
const T2  = 'var(--text-secondary, #787B86)';
const T3  = 'var(--text-tertiary, #B2B5BE)';
const ACC = 'var(--accent-blue, #2962FF)';
const BULL = 'var(--accent-green, #1565C0)';
const BEAR = 'var(--accent-red, #C62828)';

// Editor dark theme
const ED_BG   = '#1E222D';
const ED_TEXT = '#D1D4DC';

// ── Mock bars generator ────────────────────────────────────────────────────────
function generateBars(count = 500, interval = '30m'): Bar[] {
  const msMap: Record<string, number> = {
    '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 18e5,
    '1h': 36e5, '4h': 144e5, 'D': 864e5, 'W': 6048e5, 'M': 2592e6,
  };
  const ms = msMap[interval] ?? 18e5;
  const bars: Bar[] = [];
  let price = 1.08250;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (Math.random() - 0.487) * 0.0028;
    const pull  = (1.08300 - price) * 0.004;
    const close = +(open + drift + pull).toFixed(5);
    const range = Math.abs(drift) * 1.5 + Math.random() * 0.0016;
    const high  = +(Math.max(open, close) + range * (0.4 + Math.random() * 0.4)).toFixed(5);
    const low   = +(Math.min(open, close) - range * (0.3 + Math.random() * 0.4)).toFixed(5);
    bars.push({ t: now - (count - i) * ms, o: open, h: high, l: low, c: close, v: Math.floor(38e3 + Math.random() * 14e4) });
    price = close;
  }
  return bars;
}

// ── Syntax highlighter ─────────────────────────────────────────────────────────
function highlight(code: string, lang: Language): string {
  let s = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Comments
  s = s.replace(/(\/\/[^\n]*)/g, '<span style="color:#608B4E">$1</span>');
  s = s.replace(/(#[^\n]*)/g, '<span style="color:#608B4E">$1</span>');

  // Strings
  s = s.replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:#CE9178">$1</span>');
  s = s.replace(/('(?:[^'\\]|\\.)*')/g, '<span style="color:#CE9178">$1</span>');

  // Numbers
  s = s.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#B5CEA8">$1</span>');

  // Keywords
  const jsKw  = ['function', 'const', 'let', 'var', 'if', 'else', 'return', 'true', 'false', 'null', 'for', 'while'];
  const pyKw  = ['def', 'and', 'or', 'not', 'True', 'False', 'None', 'return', 'if', 'else', 'elif', 'for', 'while'];
  const piKw  = ['strategy', 'input', 'plot', 'overlay', 'ta'];
  const kw = lang === 'python' ? pyKw : lang === 'pinescript' ? piKw : jsKw;
  const kwRx = new RegExp(`\\b(${kw.join('|')})\\b`, 'g');
  s = s.replace(kwRx, '<span style="color:#C586C0">$1</span>');

  // api.* calls
  s = s.replace(/\b(api)\b/g, '<span style="color:#4EC9B0">$1</span>');

  // Function names
  s = s.replace(/\b(onBar|on_bar|def\s+\w+)\b/g, '<span style="color:#DCDCAA">$1</span>');

  return s;
}

// ── Format helpers ─────────────────────────────────────────────────────────────
const fmt2  = (n: number) => (isFinite(n) ? n.toFixed(2) : '—');
const fmtPct= (n: number) => (isFinite(n) ? (n >= 0 ? '+' : '') + n.toFixed(2) + '%' : '—');
const fmtUSD= (n: number) => (isFinite(n) ? (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2) : '—');
const fmtDate=(t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

// ── Metric card ────────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  const color = positive === undefined ? T1 : positive ? BULL : BEAR;
  return (
    <div style={{ background: BG, borderRadius: 6, padding: '10px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T3, letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T2, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Equity curve canvas ────────────────────────────────────────────────────────
function EquityCurve({ equity, initialCapital }: { equity: { t: number; value: number }[]; initialCapital: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || equity.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const { width: W, height: H } = canvas.getBoundingClientRect();
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const PAD = { t: 14, r: 14, b: 28, l: 56 };
    const CW = W - PAD.l - PAD.r;
    const CH = H - PAD.t - PAD.b;

    const vals = equity.map(e => e.value);
    const yMin = Math.min(...vals) * 0.998;
    const yMax = Math.max(...vals) * 1.002;
    const yRange = yMax - yMin || 1;

    const xOf = (i: number) => PAD.l + (i / (equity.length - 1)) * CW;
    const yOf = (v: number)  => PAD.t + CH * (1 - (v - yMin) / yRange);

    // Background
    ctx.fillStyle = ED_BG;
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (CH / 4) * i + 0.5;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    }

    // Baseline
    const base = yOf(initialCapital);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, base); ctx.lineTo(W - PAD.r, base); ctx.stroke();
    ctx.setLineDash([]);

    // Fill under curve
    const isBull = vals[vals.length - 1] >= initialCapital;
    const fillColor = isBull ? 'rgba(21,101,192,0.15)' : 'rgba(198,40,40,0.15)';
    const lineColor = isBull ? '#1565C0' : '#C62828';

    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(equity[0].value));
    equity.forEach((e, i) => ctx.lineTo(xOf(i), yOf(e.value)));
    ctx.lineTo(xOf(equity.length - 1), H - PAD.b);
    ctx.lineTo(xOf(0), H - PAD.b);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    equity.forEach((e, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(e.value)) : ctx.lineTo(xOf(i), yOf(e.value)));
    ctx.stroke();

    // Y axis labels
    ctx.fillStyle = T3;
    ctx.font = `10px ${MONO}`;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = yMin + yRange * (1 - i / 4);
      ctx.fillText('$' + v.toFixed(0), PAD.l - 4, PAD.t + (CH / 4) * i + 4);
    }

    // X axis labels
    ctx.textAlign = 'center';
    const labelCount = Math.min(5, equity.length);
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor(i * (equity.length - 1) / (labelCount - 1));
      ctx.fillText(fmtDate(equity[idx].t), xOf(idx), H - 6);
    }
  }, [equity, initialCapital]);

  const ro = useRef<ResizeObserver | undefined>(undefined);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ro.current = new ResizeObserver(() => {
      const el = canvasRef.current;
      if (el) el.dispatchEvent(new Event('resize'));
    });
    ro.current.observe(canvas);
    return () => ro.current?.disconnect();
  }, []);

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />;
}

// ── Trade log ──────────────────────────────────────────────────────────────────
function TradeLog({ trades }: { trades: Trade[] }) {
  const closed = trades.filter(t => t.pnl !== null);
  if (closed.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: T3, fontSize: 13 }}>No closed trades</div>;
  }

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, background: SURF, zIndex: 1 }}>
          <tr>
            {['#', 'Dir', 'Entry', 'Exit', 'Entry $', 'Exit $', 'P&L', 'P&L %', 'Fees', 'Bars', 'Comment'].map(h => (
              <th key={h} style={{
                padding: '7px 10px', textAlign: h === '#' ? 'center' : 'left',
                fontWeight: 600, color: T2, fontSize: 11, letterSpacing: '0.04em',
                borderBottom: `1px solid ${BD}`, whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {closed.map((t, i) => {
            const win = (t.pnl ?? 0) > 0;
            return (
              <tr key={t.id} style={{ borderBottom: `1px solid ${BD}`, background: i % 2 === 0 ? 'transparent' : BG }}>
                <td style={{ padding: '6px 10px', textAlign: 'center', color: T3, fontFamily: MONO }}>{i + 1}</td>
                <td style={{ padding: '6px 10px' }}>
                  <span style={{
                    padding: '2px 6px', borderRadius: 3, fontSize: 11, fontWeight: 700, fontFamily: MONO,
                    background: t.direction === 'long' ? 'rgba(21,101,192,0.1)' : 'rgba(198,40,40,0.1)',
                    color: t.direction === 'long' ? BULL : BEAR,
                  }}>
                    {t.direction === 'long' ? 'LONG' : 'SHORT'}
                  </span>
                </td>
                <td style={{ padding: '6px 10px', color: T2, fontFamily: MONO, fontSize: 11 }}>{fmtDate(t.entryTime)}</td>
                <td style={{ padding: '6px 10px', color: T2, fontFamily: MONO, fontSize: 11 }}>{t.exitTime ? fmtDate(t.exitTime) : '—'}</td>
                <td style={{ padding: '6px 10px', fontFamily: MONO, fontWeight: 600 }}>{t.entryPrice.toFixed(5)}</td>
                <td style={{ padding: '6px 10px', fontFamily: MONO }}>{t.exitPrice ? t.exitPrice.toFixed(5) : '—'}</td>
                <td style={{ padding: '6px 10px', fontFamily: MONO, fontWeight: 700, color: win ? BULL : BEAR }}>
                  {fmtUSD(t.pnl ?? 0)}
                </td>
                <td style={{ padding: '6px 10px', fontFamily: MONO, color: win ? BULL : BEAR }}>
                  {fmtPct(t.pnlPct ?? 0)}
                </td>
                <td style={{ padding: '6px 10px', fontFamily: MONO, color: T3 }}>${t.fees.toFixed(2)}</td>
                <td style={{ padding: '6px 10px', fontFamily: MONO, color: T2 }}>
                  {t.exitBar !== null ? t.exitBar - t.entryBar : '—'}
                </td>
                <td style={{ padding: '6px 10px', color: T2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.comment || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StrategyPage() {
  const router = useRouter();
  const user = useMemo(() => getCurrentUser(), []);

  // ── Editor state ────────────────────────────────────────────────────────────
  const [lang, setLang]     = useState<Language>('javascript');
  const [codes, setCodes]   = useState<Record<Language, string>>({
    javascript: DEFAULT_TEMPLATE.js,
    pinescript: DEFAULT_TEMPLATE.pine,
    python:     DEFAULT_TEMPLATE.python,
  });
  const code = codes[lang];
  const setCode = (c: string) => setCodes(prev => ({ ...prev, [lang]: c }));

  // ── Strategy meta ────────────────────────────────────────────────────────────
  const [stratName, setStratName]   = useState(DEFAULT_TEMPLATE.name);
  const [stratId, setStratId]       = useState(() => newStrategyId());
  const [tags, setTags]             = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public' | 'marketplace'>('private');
  const [price, setPrice]           = useState(0);
  const [priceMonthly, setPriceMonthly] = useState(0);

  // ── Config state ─────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);

  // ── Backtest state ───────────────────────────────────────────────────────────
  const [result, setResult]     = useState<BacktestResult | null>(null);
  const [running, setRunning]   = useState(false);
  const [rightTab, setRightTab] = useState<'overview' | 'equity' | 'trades' | 'details'>('overview');

  // ── User strategies ──────────────────────────────────────────────────────────
  const [userStrats, setUserStrats] = useState<StrategyMeta[]>([]);
  const [showLoad, setShowLoad]     = useState(false);
  const [showSave, setShowSave]     = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // ── Editor refs ──────────────────────────────────────────────────────────────
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef      = useRef<HTMLPreElement>(null);

  // ── Load user strategies ─────────────────────────────────────────────────────
  useEffect(() => {
    if (user) setUserStrats(listUserStrategies(user.id));
  }, [user]);

  // ── Sync scroll ──────────────────────────────────────────────────────────────
  const syncScroll = useCallback(() => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop  = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // ── Tab key in editor ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current!;
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  }, [code, setCode]);

  // ── Run backtest ──────────────────────────────────────────────────────────────
  const runTest = useCallback(async () => {
    setRunning(true);
    setResult(null);
    await new Promise(r => setTimeout(r, 50));
    try {
      const bars = generateBars(500, config.interval);
      const res  = await runBacktestSandboxed(bars, code, lang, config);
      setResult(res);
      setRightTab(res.error ? 'overview' : 'equity');
    } finally {
      setRunning(false);
    }
  }, [code, lang, config]);

  // ── Save strategy ─────────────────────────────────────────────────────────────
  const saveStrat = useCallback(() => {
    const meta: StrategyMeta = {
      id: stratId, name: stratName, description: '',
      authorId: user?.id ?? 'anonymous', authorName: user?.username ?? 'anonymous',
      language: lang, code,
      createdAt: Date.now(), updatedAt: Date.now(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      visibility, price, priceMonthly,
      subscribers: 0,
      lastBacktest: result?.metrics,
    };
    saveStrategy(meta);
    if (user) setUserStrats(listUserStrategies(user.id));
    setShowSave(false);
  }, [stratId, stratName, user, lang, code, tags, visibility, price, priceMonthly, result]);

  // ── Load strategy ─────────────────────────────────────────────────────────────
  const loadStrat = useCallback((s: StrategyMeta) => {
    setStratId(s.id);
    setStratName(s.name);
    setLang(s.language);
    setCodes(prev => ({ ...prev, [s.language]: s.code }));
    setTags(s.tags.join(', '));
    setVisibility(s.visibility);
    setPrice(s.price);
    setPriceMonthly(s.priceMonthly);
    setShowLoad(false);
    setResult(null);
  }, []);

  // ── Apply template ────────────────────────────────────────────────────────────
  const applyTemplate = useCallback((t: typeof TEMPLATES[0]) => {
    setStratName(t.name);
    setCodes({ javascript: t.js, pinescript: t.pine, python: t.python });
    setShowTemplates(false);
    setResult(null);
  }, []);

  const m = result?.metrics;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BG, fontFamily: F, overflow: 'hidden' }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{
        height: 48, background: SURF, borderBottom: `1px solid ${BD}`,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px',
        flexShrink: 0, zIndex: 10,
      }}>
        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          <div style={{ width: 28, height: 28, borderRadius: 5, background: T1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#FFF', fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>O</span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: T1, letterSpacing: '0.04em' }}>ORDR</span>
        </a>

        <div style={{ width: 1, height: 20, background: BD }} />

        <span style={{ fontSize: 13, fontWeight: 700, color: ACC }}>Strategy Lab</span>

        {/* Strategy name input */}
        <input
          value={stratName} onChange={e => setStratName(e.target.value)}
          style={{
            marginLeft: 8, padding: '4px 10px', border: `1px solid ${BD}`, borderRadius: 5,
            fontFamily: F, fontSize: 13, fontWeight: 600, color: T1, background: BG,
            outline: 'none', width: 200,
          }}
        />

        <div style={{ flex: 1 }} />

        {/* Templates */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTemplates(p => !p)} style={topBtn}>Templates</button>
          {showTemplates && (
            <div style={{
              position: 'absolute', top: 36, right: 0, background: SURF, border: `1px solid ${BD}`,
              borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 220, overflow: 'hidden',
            }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)} style={{
                  display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: F,
                  borderBottom: `1px solid ${BD}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T1 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: T2, marginTop: 2 }}>{t.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Load */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowLoad(p => !p)} style={topBtn}>Load</button>
          {showLoad && (
            <div style={{
              position: 'absolute', top: 36, right: 0, background: SURF, border: `1px solid ${BD}`,
              borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 260, maxHeight: 320, overflow: 'auto',
            }}>
              {userStrats.length === 0
                ? <div style={{ padding: '20px 16px', textAlign: 'center', color: T3, fontSize: 13 }}>No saved strategies</div>
                : userStrats.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${BD}`, gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T1 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: T2 }}>{s.language} · {new Date(s.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <button onClick={() => loadStrat(s)} style={{ ...topBtn, padding: '3px 10px', fontSize: 11 }}>Load</button>
                    <button onClick={() => { deleteStrategy(s.id); setUserStrats(listUserStrategies(user?.id ?? '')); }}
                      style={{ padding: '3px 8px', border: '1px solid rgba(198,40,40,0.3)', borderRadius: 4, background: 'none', color: BEAR, fontSize: 11, cursor: 'pointer' }}>
                      Del
                    </button>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* Save */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowSave(p => !p)} style={topBtn}>Save</button>
          {showSave && (
            <div style={{
              position: 'absolute', top: 36, right: 0, background: SURF, border: `1px solid ${BD}`,
              borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 100, width: 280, padding: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T1, marginBottom: 12 }}>Save Strategy</div>
              {[
                { label: 'Tags (comma-separated)', value: tags, set: setTags, placeholder: 'trend, ema, fx' },
              ].map(f => (
                <div key={f.label} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T2, marginBottom: 4 }}>{f.label.toUpperCase()}</div>
                  <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                    style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BD}`, borderRadius: 5, fontFamily: F, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T2, marginBottom: 4 }}>VISIBILITY</div>
                <select value={visibility} onChange={e => setVisibility(e.target.value as typeof visibility)}
                  style={{ width: '100%', padding: '7px 10px', border: `1px solid ${BD}`, borderRadius: 5, fontFamily: F, fontSize: 12 }}>
                  <option value="private">Private</option>
                  <option value="public">Public (free)</option>
                  <option value="marketplace">Marketplace (paid)</option>
                </select>
              </div>
              {visibility === 'marketplace' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {[{ label: 'ONE-TIME (¢)', val: price, set: setPrice }, { label: 'MONTHLY (¢)', val: priceMonthly, set: setPriceMonthly }].map(f => (
                    <div key={f.label} style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: T2, marginBottom: 4 }}>{f.label}</div>
                      <input type="number" value={f.val} onChange={e => f.set(Number(e.target.value))}
                        style={{ width: '100%', padding: '6px 8px', border: `1px solid ${BD}`, borderRadius: 5, fontFamily: F, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
              )}
              <button onClick={saveStrat} style={{ ...runBtnStyle, width: '100%', marginTop: 4 }}>Save Strategy</button>
            </div>
          )}
        </div>

        {/* Run */}
        <button onClick={runTest} disabled={running} style={runBtnStyle}>
          {running ? '⟳ Running…' : '▶ Run Backtest'}
        </button>

        <div style={{ width: 1, height: 20, background: BD }} />

        {/* User */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: ACC,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFF', fontSize: 11, fontWeight: 700,
            }}>{user.avatar}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T1 }}>{user.username}</div>
              <div style={{ fontSize: 10, color: T3 }}>{user.credits} credits</div>
            </div>
            <button onClick={() => { logout(); router.push('/login'); }}
              style={{ padding: '3px 8px', border: `1px solid ${BD}`, borderRadius: 4, background: 'none', fontSize: 11, color: T2, cursor: 'pointer' }}>
              Sign Out
            </button>
          </div>
        ) : (
          <a href="/login" style={{ fontSize: 12, fontWeight: 700, color: ACC, textDecoration: 'none' }}>Sign In</a>
        )}

        <a href="/marketplace" style={{ fontSize: 12, color: T2, textDecoration: 'none', whiteSpace: 'nowrap' }}>Marketplace →</a>
      </div>

      {/* ── Body: editor + results ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: Code editor ─────────────────────────────────────────────── */}
        <div style={{
          width: '52%', display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${BD}`, background: ED_BG, flexShrink: 0,
        }}>
          {/* Language tabs */}
          <div style={{
            display: 'flex', alignItems: 'center', background: '#181C28',
            borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 12px', height: 40, gap: 0,
          }}>
            {(['javascript', 'pinescript', 'python'] as Language[]).map(l => (
              <button key={l} onClick={() => setLang(l)} style={{
                padding: '0 14px', height: 40, border: 'none', cursor: 'pointer',
                fontFamily: F, fontSize: 12, fontWeight: lang === l ? 700 : 500,
                background: lang === l ? ED_BG : 'transparent',
                color: lang === l ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                borderBottom: lang === l ? `2px solid ${ACC}` : '2px solid transparent',
                marginBottom: -1,
              }}>
                {{ javascript: 'JavaScript', pinescript: 'PineScript', python: 'Python' }[l]}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: MONO }}>
              Ctrl+Enter=run
            </span>
            {/* Templates dropdown — in editor bar for easy access */}
            <div style={{ position: 'relative', marginLeft: 10 }}>
              <button
                onClick={() => setShowTemplates(p => !p)}
                style={{
                  padding: '0 10px', height: 26, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
                  background: showTemplates ? 'rgba(41,98,255,0.25)' : 'rgba(255,255,255,0.07)',
                  color: showTemplates ? ACC : 'rgba(255,255,255,0.6)',
                  fontFamily: F, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Templates ▾
              </button>
              {showTemplates && (
                <div style={{
                  position: 'absolute', top: 32, right: 0, background: SURF, border: `1px solid ${BD}`,
                  borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 200, minWidth: 240, overflow: 'hidden',
                }}>
                  {TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => applyTemplate(t)} style={{
                      display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                      background: 'none', border: 'none', borderBottom: `1px solid ${BD}`,
                      cursor: 'pointer', fontFamily: F,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = BG)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: T1 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: T2, marginTop: 2 }}>{t.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Editor area */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {/* Highlighted pre (background) */}
            <pre ref={preRef} style={{
              position: 'absolute', inset: 0, margin: 0, padding: '14px 16px',
              fontFamily: MONO, fontSize: 13, lineHeight: '22px',
              background: 'transparent', color: ED_TEXT,
              overflow: 'hidden', pointerEvents: 'none',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              tabSize: 2,
            }}
              dangerouslySetInnerHTML={{ __html: highlight(code, lang) }}
            />
            {/* Transparent textarea */}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              onScroll={syncScroll}
              onKeyUp={e => { if (e.ctrlKey && e.key === 'Enter') runTest(); }}
              spellCheck={false}
              style={{
                position: 'absolute', inset: 0, margin: 0, padding: '14px 16px',
                fontFamily: MONO, fontSize: 13, lineHeight: '22px',
                background: 'transparent', color: 'transparent',
                caretColor: '#D1D4DC', border: 'none', outline: 'none',
                resize: 'none', overflow: 'auto', whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', tabSize: 2,
              }}
            />
          </div>

          {/* Config bar */}
          <div style={{
            background: '#181C28', borderTop: '1px solid rgba(255,255,255,0.07)',
            padding: '8px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          }}>
            {[
              { label: 'Capital', val: config.initialCapital, key: 'initialCapital', type: 'number' },
              { label: 'Comm %', val: config.commission,      key: 'commission',     type: 'number' },
              { label: 'Pos %',  val: config.positionSize,   key: 'positionSize',   type: 'number' },
            ].map(f => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{f.label}</span>
                <input type={f.type} value={f.val}
                  onChange={e => setConfig(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                  style={{
                    width: 72, padding: '3px 6px', background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
                    color: ED_TEXT, fontFamily: MONO, fontSize: 11, outline: 'none',
                  }}
                />
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Interval</span>
              <select value={config.interval}
                onChange={e => setConfig(p => ({ ...p, interval: e.target.value }))}
                style={{
                  padding: '3px 6px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 4, color: ED_TEXT, fontFamily: MONO, fontSize: 11, outline: 'none',
                }}>
                {['1m','5m','15m','30m','1h','4h','D'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </label>
            {result && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
                {result.barCount} bars · {result.execTimeMs}ms
              </span>
            )}
          </div>
        </div>

        {/* ── Right: Results ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Result tabs */}
          <div style={{
            height: 40, background: SURF, borderBottom: `1px solid ${BD}`,
            display: 'flex', alignItems: 'center', padding: '0 16px', gap: 0, flexShrink: 0,
          }}>
            {(['overview', 'equity', 'trades', 'details'] as const).map(t => (
              <button key={t} onClick={() => setRightTab(t)} style={{
                padding: '0 16px', height: 40, border: 'none', cursor: 'pointer',
                fontFamily: F, fontSize: 12, fontWeight: rightTab === t ? 700 : 500,
                color: rightTab === t ? T1 : T2, background: 'transparent',
                borderBottom: rightTab === t ? `2px solid ${ACC}` : '2px solid transparent',
                marginBottom: -1, textTransform: 'capitalize',
              }}>
                {t === 'equity' ? 'Equity Curve' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            {result?.error && (
              <span style={{ fontSize: 12, color: BEAR, marginLeft: 12 }}>⚠ Error</span>
            )}
          </div>

          {/* Result content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {!result && !running && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                <div style={{ fontSize: 40, opacity: 0.15 }}>▶</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T2 }}>Click Run Backtest to see results</div>
                <div style={{ fontSize: 12, color: T3 }}>500 bars of EURUSD 30m mock data</div>
              </div>
            )}
            {running && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div style={{ fontSize: 14, color: T2 }}>Running backtest…</div>
              </div>
            )}
            {result?.error && (
              <div style={{ padding: 24 }}>
                <div style={{ background: '#FFEBEE', border: '1px solid rgba(198,40,40,0.2)', borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BEAR, marginBottom: 8 }}>Strategy Error</div>
                  <pre style={{ fontFamily: MONO, fontSize: 12, color: BEAR, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {result.error}
                  </pre>
                </div>
              </div>
            )}

            {result && !result.error && rightTab === 'overview' && m && (
              <div style={{ padding: '20px 20px 0' }}>
                {/* P&L header */}
                <div style={{
                  background: m.totalReturn >= 0 ? 'rgba(21,101,192,0.08)' : 'rgba(198,40,40,0.08)',
                  border: `1px solid ${m.totalReturn >= 0 ? 'rgba(21,101,192,0.2)' : 'rgba(198,40,40,0.2)'}`,
                  borderRadius: 10, padding: '18px 24px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 24,
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T2, marginBottom: 4 }}>NET RETURN</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: m.totalReturn >= 0 ? BULL : BEAR, fontFamily: MONO }}>
                      {fmtPct(m.totalReturn)}
                    </div>
                    <div style={{ fontSize: 13, color: T2, fontFamily: MONO }}>{fmtUSD(m.totalReturnAbs)}</div>
                  </div>
                  <div style={{ width: 1, height: 56, background: BD }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T2, marginBottom: 4 }}>FINAL CAPITAL</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: T1, fontFamily: MONO }}>${m.finalCapital.toFixed(2)}</div>
                    <div style={{ fontSize: 12, color: T2 }}>from ${m.initialCapital.toLocaleString()}</div>
                  </div>
                  <div style={{ width: 1, height: 56, background: BD }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T2, marginBottom: 4 }}>TOTAL TRADES</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: T1, fontFamily: MONO }}>{m.totalTrades}</div>
                    <div style={{ fontSize: 12, color: T2 }}>{m.winRate.toFixed(1)}% win rate</div>
                  </div>
                </div>

                {/* Metrics grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
                  <MetricCard label="MAX DRAWDOWN"  value={fmtPct(m.maxDrawdown)}   positive={false} />
                  <MetricCard label="SHARPE RATIO"  value={fmt2(m.sharpe)}           positive={m.sharpe >= 1} />
                  <MetricCard label="SORTINO RATIO" value={fmt2(m.sortino)}          positive={m.sortino >= 1} />
                  <MetricCard label="PROFIT FACTOR" value={fmt2(m.profitFactor)}     positive={m.profitFactor >= 1} />
                  <MetricCard label="WIN TRADES"    value={String(m.winningTrades)}  sub={fmtPct(m.winRate)} positive={m.winRate >= 50} />
                  <MetricCard label="LOSS TRADES"   value={String(m.losingTrades)}   />
                  <MetricCard label="AVG WIN"        value={fmtUSD(m.avgWin)}        positive={true} />
                  <MetricCard label="AVG LOSS"       value={fmtUSD(m.avgLoss)}       positive={false} />
                  <MetricCard label="BEST TRADE"     value={fmtUSD(m.bestTrade)}     positive={true} />
                  <MetricCard label="WORST TRADE"    value={fmtUSD(m.worstTrade)}    positive={false} />
                  <MetricCard label="MAX CONSEC W"   value={String(m.maxConsecWins)} positive={true} />
                  <MetricCard label="MAX CONSEC L"   value={String(m.maxConsecLosses)} />
                  <MetricCard label="ANNUAL RETURN"  value={fmtPct(m.annualReturn)}  positive={m.annualReturn >= 0} />
                  <MetricCard label="CALMAR RATIO"   value={fmt2(m.calmar)}          positive={m.calmar >= 1} />
                  <MetricCard label="TOTAL FEES"     value={fmtUSD(-m.totalFees)}    />
                  <MetricCard label="AVG DURATION"   value={m.avgTradeDuration.toFixed(1) + ' bars'} />
                </div>
              </div>
            )}

            {result && !result.error && rightTab === 'equity' && (
              <div style={{ padding: 20, height: 'calc(100% - 40px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ flex: 1, minHeight: 280, borderRadius: 8, overflow: 'hidden' }}>
                  <EquityCurve equity={result.equity} initialCapital={config.initialCapital} />
                </div>
                {m && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                    <MetricCard label="RETURN"     value={fmtPct(m.totalReturn)}  positive={m.totalReturn >= 0} />
                    <MetricCard label="MAX DD"     value={fmtPct(m.maxDrawdown)}  positive={false} />
                    <MetricCard label="SHARPE"     value={fmt2(m.sharpe)}         positive={m.sharpe >= 1} />
                    <MetricCard label="WIN RATE"   value={fmtPct(m.winRate)}      positive={m.winRate >= 50} />
                    <MetricCard label="TRADES"     value={String(m.totalTrades)}  />
                  </div>
                )}
              </div>
            )}

            {result && !result.error && rightTab === 'trades' && (
              <div style={{ height: '100%' }}>
                <TradeLog trades={result.trades} />
              </div>
            )}

            {result && !result.error && rightTab === 'details' && m && (
              <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  ['Initial Capital',    '$' + m.initialCapital.toLocaleString()],
                  ['Final Capital',      '$' + m.finalCapital.toFixed(2)],
                  ['Total Return',       fmtPct(m.totalReturn)],
                  ['Annual Return',      fmtPct(m.annualReturn)],
                  ['Max Drawdown',       fmtPct(m.maxDrawdown)],
                  ['DD Duration',        m.maxDrawdownDuration + ' bars'],
                  ['Sharpe Ratio',       fmt2(m.sharpe)],
                  ['Sortino Ratio',      fmt2(m.sortino)],
                  ['Calmar Ratio',       fmt2(m.calmar)],
                  ['Total Trades',       String(m.totalTrades)],
                  ['Winning Trades',     String(m.winningTrades)],
                  ['Losing Trades',      String(m.losingTrades)],
                  ['Win Rate',           fmtPct(m.winRate)],
                  ['Profit Factor',      fmt2(m.profitFactor)],
                  ['Avg Trade',          fmtUSD(m.avgTrade)],
                  ['Avg Win',            fmtUSD(m.avgWin)],
                  ['Avg Loss',           fmtUSD(m.avgLoss)],
                  ['Best Trade',         fmtUSD(m.bestTrade)],
                  ['Worst Trade',        fmtUSD(m.worstTrade)],
                  ['Avg Duration',       m.avgTradeDuration.toFixed(1) + ' bars'],
                  ['Max Consec Wins',    String(m.maxConsecWins)],
                  ['Max Consec Losses',  String(m.maxConsecLosses)],
                  ['Total Fees',         '$' + m.totalFees.toFixed(2)],
                  ['Bars Tested',        String(result.barCount)],
                  ['Exec Time',          result.execTimeMs + 'ms'],
                ].map(([label, val]) => (
                  <div key={label} style={{
                    background: BG, borderRadius: 6, padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 12, color: T2 }}>{label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: T1 }}>{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Button style helpers ───────────────────────────────────────────────────────
const topBtn: React.CSSProperties = {
  padding: '5px 12px', border: `1px solid ${BD}`, borderRadius: 5,
  background: BG, fontFamily: F, fontSize: 12, fontWeight: 600,
  color: T1, cursor: 'pointer',
};

const runBtnStyle: React.CSSProperties = {
  padding: '7px 18px', border: 'none', borderRadius: 6,
  background: ACC, color: '#FFFFFF', fontFamily: F,
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
