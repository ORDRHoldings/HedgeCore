"use client";

import { useState } from 'react';
import type { BucketResult } from '../../api/types';
import type { InstrumentMapping } from '../../utils/symbolMapper';

interface Props {
  mapping: InstrumentMapping;
  bucket: BucketResult;
  baseCcy?: string;
  runId?: string;
}

type IbkrTab = 'instructions' | 'json' | 'fix' | 'fxtrader';

function getBrokerSide(actionMxn: number): 'BUY' | 'SELL' | 'N/A' {
  if (actionMxn > 0) return 'BUY';
  if (actionMxn < 0) return 'SELL';
  return 'N/A';
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:   "'IBM Plex Sans', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  pass:     "var(--status-pass,#4ade80)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

export default function IbkrHandoff({ mapping, bucket, baseCcy = 'MXN', runId = '' }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [activeTab,  setActiveTab]  = useState<IbkrTab>('instructions');
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedFix,  setCopiedFix]  = useState(false);

  const hasAction  = bucket.action_mxn !== 0 && !bucket.suppressed;
  const side       = getBrokerSide(bucket.action_mxn);
  const isFutures  = !!mapping.ibkr_symbol;
  const runId8     = (runId || '').slice(0, 8).toUpperCase();
  const contracts  = mapping.suggested_contracts ?? 0;
  const notionalUsd = Math.abs(bucket.action_usd);

  // ── Construct IBKR JSON payload ───────────────────────────────────────────
  const ibkrJson = {
    account:     "<YOUR_IBKR_ACCOUNT>",
    conid:       "<contract_id — look up in TWS/IBKR Portal>",
    secType:     isFutures ? "FUT" : "CASH",
    symbol:      mapping.ibkr_symbol ?? baseCcy,
    exchange:    isFutures ? "CME" : "IDEALPRO",
    currency:    "USD",
    orderType:   "MKT",
    side:        side === 'N/A' ? 'BUY' : side,
    quantity:    isFutures ? contracts : Math.round(notionalUsd),
    tif:         "DAY",
    outsideRth:  false,
    referenceId: `ORDR-${runId8}-${bucket.bucket}`,
    notes:       `Hedge bucket ${bucket.bucket} | Run ${runId8}`,
  };
  const ibkrJsonStr = JSON.stringify(ibkrJson, null, 2);

  // ── Construct FIX fields ──────────────────────────────────────────────────
  const fixSide = side === 'BUY' ? '1' : side === 'SELL' ? '2' : '1';
  const fixLines = [
    `35=D          MsgType = NewOrderSingle`,
    `11=ORDR-${runId8}-${bucket.bucket}`.padEnd(32) + 'ClOrdID',
    `55=${mapping.ibkr_symbol ?? baseCcy}`.padEnd(32) + 'Symbol',
    `54=${fixSide}`.padEnd(32) + `Side: ${side}`,
    `38=${isFutures ? contracts : Math.round(notionalUsd)}`.padEnd(32) + 'OrderQty',
    `40=1          OrdType = Market`,
    `59=0          TimeInForce = Day`,
    `60=<execution_timestamp>`,
    `58=HedgeCalc Ref: ${bucket.bucket} | Run ${runId8}`,
  ].join('\n');

  // ── Construct FXTrader deep-link ──────────────────────────────────────────
  const fxTraderUrl = mapping.ibkr_symbol
    ? `https://ndg.interactivebrokers.com/fxtrader?pair=${mapping.ibkr_symbol}USD&side=${side === 'N/A' ? 'BUY' : side}&notional=${Math.round(notionalUsd)}`
    : null;

  // ── Copy helpers ──────────────────────────────────────────────────────────
  async function handleCopyJson() {
    await navigator.clipboard.writeText(ibkrJsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  }

  async function handleCopyFix() {
    await navigator.clipboard.writeText(fixLines);
    setCopiedFix(true);
    setTimeout(() => setCopiedFix(false), 2000);
  }

  const TAB_LABELS: { key: IbkrTab; label: string }[] = [
    { key: 'instructions', label: 'Instructions' },
    { key: 'json',         label: 'JSON Payload' },
    { key: 'fix',          label: 'FIX Protocol' },
    { key: 'fxtrader',     label: 'FXTrader' },
  ];

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 text-sm rounded border border-[var(--accent-cyan)]/20 bg-[var(--accent-cyan)]/5 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
      >
        IBKR Handoff
      </button>

      {showModal && (
        <div
          style={{
            position:       "fixed",
            inset:          0,
            zIndex:         50,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            background:     "rgba(0,0,0,0.72)",
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            background:  S.bgPanel,
            border:      `1px solid ${S.rim}`,
            borderRadius: 4,
            width:        "min(640px, 96vw)",
            maxHeight:    "85vh",
            display:      "flex",
            flexDirection:"column",
            overflow:     "hidden",
          }}>

            {/* ── Modal header ── */}
            <div style={{
              display:      "flex",
              alignItems:   "center",
              justifyContent: "space-between",
              padding:      "12px 18px",
              borderBottom: `1px solid ${S.rim}`,
              background:   S.bgSub,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: S.fontUI, fontSize: 14, fontWeight: 700, color: S.primary }}>
                  IBKR Execution Handoff
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, border: `1px solid ${S.soft}`, padding: "1px 6px", borderRadius: 2 }}>
                  {baseCcy} · {bucket.bucket}
                </span>
                {!hasAction && (
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber, background: `color-mix(in srgb, ${S.amber} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`, padding: "1px 6px", borderRadius: 2 }}>
                    NO ACTION
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: "transparent", border: `1px solid ${S.rim}`, padding: "3px 10px", borderRadius: 2, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* ── Tab bar ── */}
            <div style={{
              display:      "flex",
              borderBottom: `1px solid ${S.rim}`,
              background:   S.bgDeep,
              paddingLeft:  8,
            }}>
              {TAB_LABELS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    fontFamily:   S.fontMono,
                    fontSize: 12,
                    fontWeight:   activeTab === tab.key ? 700 : 400,
                    color:        activeTab === tab.key ? S.cyan : S.secondary,
                    background:   "transparent",
                    border:       "none",
                    borderBottom: activeTab === tab.key ? `2px solid ${S.cyan}` : "2px solid transparent",
                    padding:      "8px 14px",
                    cursor:       "pointer",
                    letterSpacing:"0.03em",
                    transition:   "color 0.12s, border-color 0.12s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>

              {/* ── Tab 1: Instructions ── */}
              {activeTab === 'instructions' && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: S.fontUI, fontSize: 13 }}>
                  {!hasAction ? (
                    <p style={{ color: S.secondary }}>No execution required for this bucket.</p>
                  ) : mapping.ibkr_symbol ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.08em", color: S.tertiary, fontWeight: 700 }}>
                          EXCHANGE-LISTED FUTURES — TWS / CLIENT PORTAL
                        </div>
                        <ol style={{ paddingLeft: 18, color: S.secondary, lineHeight: 1.7, margin: 0 }}>
                          <li>Open IBKR Trader Workstation (TWS) or Client Portal</li>
                          <li>
                            Search for symbol:{' '}
                            <code style={{ fontFamily: S.fontMono, fontWeight: 700, color: S.cyan, background: S.bgDeep, padding: "1px 6px", borderRadius: 2 }}>
                              {mapping.ibkr_symbol}
                            </code>
                          </li>
                          <li>
                            Select product:{' '}
                            <strong style={{ color: S.primary }}>{mapping.display_label}</strong>
                          </li>
                          <li>
                            Contract:{' '}
                            <strong style={{ color: S.primary }}>{mapping.expiry_label}</strong>
                          </li>
                          <li>
                            Action:{' '}
                            <strong style={{ color: side === 'BUY' ? S.pass : S.fail }}>{side}</strong>
                          </li>
                          <li>
                            Quantity:{' '}
                            <strong style={{ color: S.primary }}>{contracts} contract{contracts !== 1 ? 's' : ''}</strong>
                          </li>
                          <li>Order type: Market (or Limit — agree price with broker)</li>
                          <li>TIF: Day</li>
                        </ol>
                      </div>
                      <a
                        href="https://www.interactivebrokers.com/en/trading/futures.php"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, textDecoration: "none" }}
                      >
                        → IBKR Futures Products Page ↗
                      </a>
                      <div style={{ background: `color-mix(in srgb, ${S.amber} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`, borderRadius: 2, padding: "8px 12px", fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                        <strong style={{ color: S.amber }}>Verify before execution:</strong> Contract sizing, margin requirements, and expiry dates. These calculations are derived from HedgeCalc — confirm with your prime broker.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.08em", color: S.tertiary, fontWeight: 700 }}>
                          OTC NDF / FX FORWARD — FX DESK
                        </div>
                        <p style={{ color: S.secondary, lineHeight: 1.7 }}>
                          This instrument is Over-the-Counter (NDF/Forward). Contact your FX desk or IBKR FX team directly.
                        </p>
                        {[
                          { label: "Instrument",    value: mapping.display_label },
                          { label: "Currency Pair", value: `USD/${baseCcy}` },
                          { label: "Side",          value: side },
                          { label: "Notional",      value: `${Math.abs(bucket.action_mxn).toLocaleString('en', { maximumFractionDigits: 0 })} ${baseCcy}` },
                          { label: "USD Equiv",     value: `$${notionalUsd.toLocaleString('en', { maximumFractionDigits: 0 })}` },
                          { label: "Forward Rate",  value: bucket.forward_rate.toFixed(6) },
                        ].map(row => (
                          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
                            <span style={{ color: S.tertiary, fontSize: 12 }}>{row.label}</span>
                            <span style={{ fontFamily: S.fontMono, color: S.primary, fontWeight: 600, fontSize: 12 }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "10px 12px" }}>
                        <strong style={{ color: S.primary }}>IBKR FX Desk Contact:</strong>
                        <br />
                        Email: <a href="mailto:fx@interactivebrokers.com" style={{ color: S.cyan }}>fx@interactivebrokers.com</a>
                        <br />
                        Phone: +1 312 542 6901
                        <br />
                        <a href="https://www.interactivebrokers.com/en/trading/products-702-currencies.php" target="_blank" rel="noopener noreferrer" style={{ color: S.cyan, textDecoration: "none" }}>
                          → IBKR FX Currencies Page ↗
                        </a>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Tab 2: JSON Payload ── */}
              {activeTab === 'json' && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>
                    IBKR Client Portal API / TWS API-compatible order object. Fill in <code style={{ fontFamily: S.fontMono, color: S.cyan }}>account</code> and <code style={{ fontFamily: S.fontMono, color: S.cyan }}>conid</code> from your IBKR account.
                  </div>
                  <div style={{ position: "relative" }}>
                    <pre style={{
                      fontFamily:  S.fontMono,
                      fontSize:    12,
                      color:       S.primary,
                      background:  S.bgDeep,
                      border:      `1px solid ${S.rim}`,
                      borderRadius: 2,
                      padding:     "14px 16px",
                      overflowX:   "auto",
                      lineHeight:  1.6,
                      margin:      0,
                    }}>
                      {ibkrJsonStr}
                    </pre>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleCopyJson}
                      style={{
                        fontFamily:   S.fontMono,
                        fontSize: 12,
                        fontWeight:   700,
                        letterSpacing:"0.06em",
                        color:        copiedJson ? S.bgPanel : S.cyan,
                        background:   copiedJson ? S.pass : `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
                        border:       `1px solid ${copiedJson ? S.pass : S.cyan}`,
                        borderRadius: 2,
                        padding:      "5px 16px",
                        cursor:       "pointer",
                        transition:   "background 0.15s",
                      }}
                    >
                      {copiedJson ? '✓ COPIED' : 'COPY JSON'}
                    </button>
                    <a
                      href="https://www.interactivebrokers.com/api/doc.html#tag/Order/paths/~1iserver~1account~1{accountId}~1orders/post"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textDecoration: "none", display: "flex", alignItems: "center" }}
                    >
                      → IBKR API Docs ↗
                    </a>
                  </div>
                </div>
              )}

              {/* ── Tab 3: FIX Protocol ── */}
              {activeTab === 'fix' && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>
                    FIX 4.2 / 4.4 protocol fields for algorithmic or STP routing. <strong style={{ color: S.amber }}>ClOrdID</strong> provides the unique audit trail reference back to this HedgeCalc run.
                  </div>
                  <pre style={{
                    fontFamily:  S.fontMono,
                    fontSize:    12,
                    color:       S.primary,
                    background:  S.bgDeep,
                    border:      `1px solid ${S.rim}`,
                    borderRadius: 2,
                    padding:     "14px 16px",
                    overflowX:   "auto",
                    lineHeight:  1.8,
                    margin:      0,
                    whiteSpace:  "pre",
                  }}>
                    {fixLines}
                  </pre>
                  <button
                    onClick={handleCopyFix}
                    style={{
                      fontFamily:   S.fontMono,
                      fontSize: 12,
                      fontWeight:   700,
                      letterSpacing:"0.06em",
                      color:        copiedFix ? S.bgPanel : S.cyan,
                      background:   copiedFix ? S.pass : `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
                      border:       `1px solid ${copiedFix ? S.pass : S.cyan}`,
                      borderRadius: 2,
                      padding:      "5px 16px",
                      cursor:       "pointer",
                      transition:   "background 0.15s",
                      alignSelf:    "flex-start",
                    }}
                  >
                    {copiedFix ? '✓ COPIED' : 'COPY FIX'}
                  </button>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "8px 12px" }}>
                    Note: FIX sessions require prior configuration with your prime broker / IBKR FIX gateway. Contact IBKR for FIX connectivity setup.
                  </div>
                </div>
              )}

              {/* ── Tab 4: FXTrader / Deep-Link ── */}
              {activeTab === 'fxtrader' && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {mapping.ibkr_symbol && fxTraderUrl ? (
                    <>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>
                        IBKR FXTrader deep-link for direct currency pair execution. Constructed from the instrument mapping for this bucket. You must be logged in to IBKR for this link to work.
                      </div>
                      <div style={{
                        fontFamily:  S.fontMono,
                        fontSize: 12,
                        color:       S.cyan,
                        background:  S.bgDeep,
                        border:      `1px solid ${S.rim}`,
                        borderRadius: 2,
                        padding:     "10px 14px",
                        wordBreak:   "break-all",
                      }}>
                        {fxTraderUrl}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => window.open(fxTraderUrl, '_blank', 'noopener,noreferrer')}
                          style={{
                            fontFamily:   S.fontMono,
                            fontSize: 12,
                            fontWeight:   700,
                            letterSpacing:"0.06em",
                            color:        S.bgPanel,
                            background:   S.cyan,
                            border:       `1px solid ${S.cyan}`,
                            borderRadius: 2,
                            padding:      "6px 16px",
                            cursor:       "pointer",
                          }}
                        >
                          OPEN IN IBKR FXTRADER ↗
                        </button>
                      </div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "8px 12px" }}>
                        Advisory: This deep-link is constructed from HedgeCalc instrument mapping. Verify the pair, side, and notional in IBKR before submitting any order. Deep-link parameters are indicative only.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.7 }}>
                        FXTrader is available for exchange-listed currency futures. This bucket uses an OTC/NDF instrument.
                      </div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "10px 14px" }}>
                        <strong style={{ color: S.primary }}>For NDF execution:</strong> Use IBKR&apos;s FX desk directly or via the Client Portal → Forex → Non-Deliverable Forwards.
                        <br /><br />
                        <a href="https://www.interactivebrokers.com/en/trading/products-702-currencies.php" target="_blank" rel="noopener noreferrer" style={{ color: S.cyan, textDecoration: "none" }}>
                          → IBKR FX Products ↗
                        </a>
                        {' · '}
                        <a href="mailto:fx@interactivebrokers.com" style={{ color: S.cyan }}>
                          fx@interactivebrokers.com
                        </a>
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>

            {/* ── Modal footer ── */}
            <div style={{
              padding:    "10px 18px",
              borderTop:  `1px solid ${S.rim}`,
              background: S.bgSub,
              display:    "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                Run {runId8} · Bucket {bucket.bucket} · {baseCcy}
              </span>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  fontFamily:   S.fontMono,
                  fontSize: 12,
                  fontWeight:   600,
                  letterSpacing:"0.06em",
                  color:        S.secondary,
                  background:   "transparent",
                  border:       `1px solid ${S.rim}`,
                  borderRadius: 2,
                  padding:      "4px 14px",
                  cursor:       "pointer",
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
