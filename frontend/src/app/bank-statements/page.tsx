"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { useAuth } from "@/lib/authContext";
import {
  listStatements, listBankTransactions, uploadStatement, listAccounts,
  runReconciliation, getReconciliationSummary, manualMatch, markException, unmatchTransaction,
  type BankStatementRecord, type BankTransactionRecord, type BankAccount,
  type ReconciliationSummary, type ReconciliationRunResponse,
} from "@/lib/api/cashClient";
import { Upload, RefreshCw, X, Play } from "lucide-react";

// ── Design tokens ──────────────────────────────────────────────────────────
const S = {
  mono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  deep: "var(--bg-deep)",
  panel: "var(--bg-panel)",
  sub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  text1: "var(--text-primary)",
  text2: "var(--text-secondary)",
  text3: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
} as const;

const HEX = {
  cyan: "#1C62F2",
  green: "#059669",
  red: "#DC2626",
  amber: "#D97706",
  purple: "#8b5cf6",
  text1: "#0F172A",
  text2: "#334155",
  text3: "#94A3B8",
} as const;

type Tab = "STATEMENTS" | "TRANSACTIONS" | "RECONCILIATION";

const reconStatusColor: Record<string, string> = { UNMATCHED: HEX.amber, MATCHED: HEX.green, EXCEPTION: HEX.red };
const dirColor: Record<string, string> = { DEBIT: HEX.red, CREDIT: HEX.green };
const formatColor: Record<string, string> = { MT940: HEX.purple, CAMT053: HEX.cyan, BAI2: HEX.amber };

const fmtAmount = (v: string | number) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Badge = ({ label, color }: { label: string; color: string }) => (
  <span style={{
    padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
    background: `${color}18`, color, border: `1px solid ${color}30`,
  }}>{label}</span>
);

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "STATEMENTS", label: "STATEMENTS", icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" },
  { key: "TRANSACTIONS", label: "TRANSACTIONS", icon: "M21 12H3M21 6H3M21 18H3" },
  { key: "RECONCILIATION", label: "RECONCILIATION", icon: "M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" },
];

function BankStatementsInner() {
  const isMobile = useIsMobile();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("STATEMENTS");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Statements
  const [statements, setStatements] = useState<BankStatementRecord[]>([]);
  const [stmtAccountFilter, setStmtAccountFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadAccountId, setUploadAccountId] = useState("");
  const [uploadFormat, setUploadFormat] = useState("MT940");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Transactions
  const [transactions, setTransactions] = useState<BankTransactionRecord[]>([]);
  const [txAccountFilter, setTxAccountFilter] = useState("");
  const [txStatusFilter, setTxStatusFilter] = useState("");
  const [txDateFrom, setTxDateFrom] = useState("");
  const [txDateTo, setTxDateTo] = useState("");

  // Reconciliation
  const [reconAccountId, setReconAccountId] = useState("");
  const [reconSummary, setReconSummary] = useState<ReconciliationSummary | null>(null);
  const [reconResult, setReconResult] = useState<ReconciliationRunResponse | null>(null);
  const [matchTxId, setMatchTxId] = useState("");
  const [matchSettlementId, setMatchSettlementId] = useState("");
  const [matchJournalId, setMatchJournalId] = useState("");

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    try { setAccounts(await listAccounts(token)); } catch { /* noop */ }
  }, [token]);

  const loadStatements = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try { setStatements(await listStatements(token, stmtAccountFilter || undefined)); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  }, [token, stmtAccountFilter]);

  const loadTransactions = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    const params: Record<string, string> = {};
    if (txAccountFilter) params.account_id = txAccountFilter;
    if (txStatusFilter) params.status = txStatusFilter;
    if (txDateFrom) params.date_from = txDateFrom;
    if (txDateTo) params.date_to = txDateTo;
    try { setTransactions(await listBankTransactions(token, Object.keys(params).length > 0 ? params : undefined)); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  }, [token, txAccountFilter, txStatusFilter, txDateFrom, txDateTo]);

  const loadReconSummary = useCallback(async () => {
    if (!token || !reconAccountId) { setReconSummary(null); return; }
    try { setReconSummary(await getReconciliationSummary(token, reconAccountId)); } catch { setReconSummary(null); }
  }, [token, reconAccountId]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { if (tab === "STATEMENTS") loadStatements(); }, [tab, loadStatements]);
  useEffect(() => { if (tab === "TRANSACTIONS") loadTransactions(); }, [tab, loadTransactions]);
  useEffect(() => { if (tab === "RECONCILIATION") loadReconSummary(); }, [tab, loadReconSummary]);

  const handleUpload = async () => {
    if (!token || !uploadFile || !uploadAccountId) return;
    setUploading(true); setError(null);
    try {
      await uploadStatement(token, uploadFile, uploadAccountId, uploadFormat);
      setShowUpload(false); setUploadFile(null); setUploadAccountId("");
      setSuccess("Statement uploaded successfully");
      loadStatements();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setUploading(false); }
  };

  const handleRunRecon = async () => {
    if (!token || !reconAccountId) return;
    setError(null);
    try {
      const result = await runReconciliation(token, reconAccountId);
      setReconResult(result);
      setSuccess(`Auto-reconciliation complete: ${result.matched} matched, ${result.unmatched} unmatched, ${result.exceptions} exceptions`);
      loadReconSummary();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Reconciliation failed"); }
  };

  const handleManualMatch = async () => {
    if (!token || !matchTxId || (!matchSettlementId && !matchJournalId)) return;
    try {
      await manualMatch(token, { transaction_id: matchTxId, settlement_id: matchSettlementId || undefined, journal_id: matchJournalId || undefined });
      setMatchTxId(""); setMatchSettlementId(""); setMatchJournalId("");
      setSuccess("Transaction matched successfully");
      loadReconSummary();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Match failed"); }
  };

  const handleMarkException = async (txId: string) => {
    if (!token) return;
    try { await markException(token, txId); loadTransactions(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };

  const handleUnmatch = async (txId: string) => {
    if (!token) return;
    try { await unmatchTransaction(token, txId); loadTransactions(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };

  const accountName = (id: string) => accounts.find(a => a.id === id)?.nickname || id.slice(0, 8);

  const reload = () => { if (tab === "STATEMENTS") loadStatements(); else if (tab === "TRANSACTIONS") loadTransactions(); else loadReconSummary(); };

  // KPIs
  const totalStatements = statements.length;
  const totalTx = transactions.length;
  const matchedTx = transactions.filter(t => t.reconciliation_status === "MATCHED").length;
  const unmatchedTx = transactions.filter(t => t.reconciliation_status === "UNMATCHED").length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: S.deep }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: S.panel, borderBottom: `1px solid ${S.rim}` }}>
        <div style={{ padding: "20px 28px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 6,
              background: "rgba(28,98,242,0.06)", border: "1px solid rgba(28,98,242,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontFamily: S.mono, fontSize: 15, fontWeight: 700, color: S.text1, letterSpacing: "0.08em", margin: 0 }}>
                BANK STATEMENTS & RECONCILIATION
              </h1>
              <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text3 }}>
                Statement import, transaction browser & auto-reconciliation engine
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={reload} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
              background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4,
              cursor: "pointer", fontSize: 11, fontFamily: S.mono, fontWeight: 600,
              color: S.text3, letterSpacing: "0.06em",
            }}>
              <RefreshCw size={12} />REFRESH
            </button>
            <span style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
              padding: "4px 12px", borderRadius: 3,
              background: "rgba(28,98,242,0.06)", color: HEX.cyan,
              border: "1px solid rgba(28,98,242,0.12)",
            }}>
              PHASE 2d/2e
            </span>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "repeat(5, 1fr)",
          margin: "14px 28px 0", borderRadius: 6,
          border: `1px solid ${S.rim}`, overflow: "hidden",
        }}>
          {([
            { label: "STATEMENTS", value: totalStatements, color: totalStatements > 0 ? HEX.cyan : undefined },
            { label: "TRANSACTIONS", value: totalTx, color: undefined },
            { label: "MATCHED", value: matchedTx, color: matchedTx > 0 ? HEX.green : undefined },
            { label: "UNMATCHED", value: unmatchedTx, color: unmatchedTx > 0 ? HEX.amber : undefined },
            { label: "MATCH RATE", value: totalTx > 0 ? `${((matchedTx / totalTx) * 100).toFixed(1)}%` : "\u2014", color: totalTx > 0 && matchedTx / totalTx >= 0.8 ? HEX.green : undefined },
          ] as { label: string; value: string | number; color?: string }[]).map((kpi, i) => (
            <div key={kpi.label} style={{
              padding: "12px 16px",
              borderRight: i < 4 ? `1px solid ${S.rim}` : "none",
              background: S.panel, position: "relative", overflow: "hidden",
            }}>
              {kpi.color && <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, background: kpi.color, opacity: 0.6 }} />}
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 4 }}>
                {kpi.label}
              </div>
              <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: kpi.color || S.text1 }}>
                {loading ? "\u2014" : kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, padding: "14px 28px 0" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                fontFamily: S.mono, fontSize: 11, fontWeight: tab === t.key ? 700 : 500,
                letterSpacing: "0.1em", color: tab === t.key ? HEX.cyan : S.text3,
                padding: "8px 16px", background: "transparent", border: "none",
                borderBottom: tab === t.key ? `2px solid ${HEX.cyan}` : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {error && (
          <div style={{
            padding: "10px 16px", marginBottom: 16, borderRadius: 4,
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
            fontFamily: S.ui, fontSize: 13, color: HEX.red,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            {error}
            <div style={{ flex: 1 }} />
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: HEX.red, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>&times;</button>
          </div>
        )}
        {success && (
          <div style={{
            padding: "10px 16px", marginBottom: 16, borderRadius: 4,
            background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.25)",
            fontFamily: S.ui, fontSize: 13, color: HEX.green,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
            {success}
            <div style={{ flex: 1 }} />
            <button onClick={() => setSuccess(null)} style={{ background: "none", border: "none", color: HEX.green, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>&times;</button>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 60 }}>
            <div style={{ width: 28, height: 28, border: `2px solid ${S.rim}`, borderTopColor: S.cyan, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.1em" }}>LOADING</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : tab === "STATEMENTS" ? (
          /* ── STATEMENTS TAB ── */
          <div style={{ maxWidth: 1100 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>ACCOUNT
                  <select value={stmtAccountFilter} onChange={e => setStmtAccountFilter(e.target.value)}
                    style={{ marginLeft: 8, padding: "6px 10px", background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.mono }}>
                    <option value="">All Accounts</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
                  </select>
                </label>
              </div>
              <button onClick={() => setShowUpload(!showUpload)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                background: HEX.cyan, color: "#fff", border: "none", borderRadius: 4,
                fontSize: 11, fontFamily: S.mono, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer",
              }}>
                <Upload size={13} />UPLOAD STATEMENT
              </button>
            </div>

            {showUpload && (
              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
                <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 14 }}>IMPORT BANK STATEMENT</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 14 }}>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>ACCOUNT
                    <select value={uploadAccountId} onChange={e => setUploadAccountId(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono }}>
                      <option value="">Select...</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>FORMAT
                    <select value={uploadFormat} onChange={e => setUploadFormat(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono }}>
                      <option value="MT940">MT940</option><option value="CAMT053">CAMT053</option><option value="BAI2">BAI2</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>FILE
                    <input type="file" accept=".txt,.xml,.bai" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                      style={{ width: "100%", padding: 6, marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12 }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadAccountId}
                    style={{ padding: "8px 18px", background: uploading ? HEX.text3 : HEX.cyan, color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: uploading ? "wait" : "pointer", letterSpacing: "0.06em" }}>
                    {uploading ? "UPLOADING..." : "UPLOAD"}
                  </button>
                  <button onClick={() => setShowUpload(false)} style={{ padding: "8px 18px", background: "transparent", color: S.text3, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: "pointer" }}>CANCEL</button>
                </div>
              </div>
            )}

            <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.mono }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                    {["ACCOUNT", "DATE", "OPENING", "CLOSING", "CCY", "FORMAT", "TXs", "FILE"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: h === "OPENING" || h === "CLOSING" ? "right" : "left", fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statements.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: S.text3, fontSize: 12 }}>No statements imported</td></tr>}
                  {statements.map(s => (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${S.rim}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(28,98,242,0.04)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: S.text1 }}>{accountName(s.account_id)}</td>
                      <td style={{ padding: "12px 14px", color: S.text2 }}>{s.statement_date}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: S.text2 }}>{fmtAmount(s.opening_balance)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 600, color: S.text1 }}>{fmtAmount(s.closing_balance)}</td>
                      <td style={{ padding: "12px 14px", color: S.text2 }}>{s.currency}</td>
                      <td style={{ padding: "12px 14px" }}><Badge label={s.format} color={formatColor[s.format] || HEX.text3} /></td>
                      <td style={{ padding: "12px 14px", color: S.text2 }}>{s.transaction_count}</td>
                      <td style={{ padding: "12px 14px", color: S.text3, fontSize: 11 }}>{s.filename || "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ) : tab === "TRANSACTIONS" ? (
          /* ── TRANSACTIONS TAB ── */
          <div style={{ maxWidth: 1200 }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              {([
                { label: "ACCOUNT", type: "select", value: txAccountFilter, onChange: setTxAccountFilter, options: [{ value: "", label: "All" }, ...accounts.map(a => ({ value: a.id, label: a.nickname }))] },
                { label: "STATUS", type: "select", value: txStatusFilter, onChange: setTxStatusFilter, options: [{ value: "", label: "All" }, { value: "UNMATCHED", label: "UNMATCHED" }, { value: "MATCHED", label: "MATCHED" }, { value: "EXCEPTION", label: "EXCEPTION" }] },
              ] as const).map(f => (
                <label key={f.label} style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>{f.label}
                  <select value={f.value} onChange={e => f.onChange(e.target.value)}
                    style={{ display: "block", padding: "6px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.mono }}>
                    {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ))}
              <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>FROM
                <input type="date" value={txDateFrom} onChange={e => setTxDateFrom(e.target.value)}
                  style={{ display: "block", padding: "6px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.mono }} />
              </label>
              <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>TO
                <input type="date" value={txDateTo} onChange={e => setTxDateTo(e.target.value)}
                  style={{ display: "block", padding: "6px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.mono }} />
              </label>
            </div>

            <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.mono }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                    {["DATE", "AMOUNT", "CCY", "DIR", "DESCRIPTION", "COUNTERPARTY", "REF", "STATUS", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: h === "AMOUNT" ? "right" : "left", fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: S.text3, fontSize: 12 }}>No transactions found</td></tr>}
                  {transactions.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: `1px solid ${S.rim}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(28,98,242,0.04)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "10px 12px", color: S.text2 }}>{tx.tx_date}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: S.text1 }}>{fmtAmount(tx.amount)}</td>
                      <td style={{ padding: "10px 12px", color: S.text2 }}>{tx.currency}</td>
                      <td style={{ padding: "10px 12px" }}><Badge label={tx.direction} color={dirColor[tx.direction]} /></td>
                      <td style={{ padding: "10px 12px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: S.text2 }}>{tx.description || "\u2014"}</td>
                      <td style={{ padding: "10px 12px", color: S.text3 }}>{tx.counterparty || "\u2014"}</td>
                      <td style={{ padding: "10px 12px", color: S.text3 }}>{tx.reference || "\u2014"}</td>
                      <td style={{ padding: "10px 12px" }}><Badge label={tx.reconciliation_status} color={reconStatusColor[tx.reconciliation_status]} /></td>
                      <td style={{ padding: "10px 12px" }}>
                        {tx.reconciliation_status === "UNMATCHED" && (
                          <button onClick={() => handleMarkException(tx.id)} title="Mark Exception"
                            style={{ background: "none", border: `1px solid ${HEX.red}40`, borderRadius: 3, color: HEX.red, cursor: "pointer", padding: "4px 8px", fontSize: 10, fontFamily: S.mono, fontWeight: 700, minHeight: 24, display: "inline-flex", alignItems: "center" }}>
                            <X size={10} />
                          </button>
                        )}
                        {tx.reconciliation_status === "MATCHED" && (
                          <button onClick={() => handleUnmatch(tx.id)} title="Unmatch"
                            style={{ background: "none", border: `1px solid ${HEX.amber}40`, borderRadius: 3, color: HEX.amber, cursor: "pointer", padding: "4px 8px", fontSize: 10, fontFamily: S.mono, fontWeight: 700, minHeight: 24, display: "inline-flex", alignItems: "center" }}>
                            <X size={10} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ) : (
          /* ── RECONCILIATION TAB ── */
          <div style={{ maxWidth: 1100 }}>
            <div style={{ display: "flex", gap: 14, marginBottom: 20, alignItems: "flex-end" }}>
              <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>ACCOUNT
                <select value={reconAccountId} onChange={e => setReconAccountId(e.target.value)}
                  style={{ display: "block", padding: "8px 12px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono, minWidth: 220 }}>
                  <option value="">Select account...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
                </select>
              </label>
              <button onClick={handleRunRecon} disabled={!reconAccountId}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                  background: reconAccountId ? HEX.cyan : HEX.text3, color: "#fff",
                  border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono, fontWeight: 700,
                  cursor: reconAccountId ? "pointer" : "not-allowed", letterSpacing: "0.06em",
                }}>
                <Play size={13} />RUN AUTO-RECONCILIATION
              </button>
            </div>

            {/* Recon KPI tiles */}
            {reconSummary && (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
                {([
                  { label: "TOTAL TRANSACTIONS", value: reconSummary.total_transactions.toString(), color: HEX.cyan },
                  { label: "MATCHED", value: reconSummary.matched.toString(), sub: `${reconSummary.match_rate.toFixed(1)}% rate`, color: HEX.green },
                  { label: "UNMATCHED", value: reconSummary.unmatched.toString(), color: reconSummary.unmatched > 0 ? HEX.amber : HEX.text3 },
                  { label: "EXCEPTIONS", value: reconSummary.exceptions.toString(), color: reconSummary.exceptions > 0 ? HEX.red : HEX.text3 },
                ] as { label: string; value: string; sub?: string; color: string }[]).map(kpi => (
                  <div key={kpi.label} style={{
                    padding: "16px 18px", borderRadius: 6,
                    background: S.panel, border: `1px solid ${S.rim}`,
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, background: kpi.color, opacity: 0.6 }} />
                    <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 6 }}>{kpi.label}</div>
                    <div style={{ fontFamily: S.mono, fontSize: 26, fontWeight: 800, color: kpi.color, lineHeight: 1, marginBottom: kpi.sub ? 4 : 0 }}>{kpi.value}</div>
                    {kpi.sub && <div style={{ fontFamily: S.ui, fontSize: 11, color: S.text3 }}>{kpi.sub}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Last run result */}
            {reconResult && !success && (
              <div style={{
                padding: "10px 16px", marginBottom: 16, borderRadius: 4,
                background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.25)",
                fontFamily: S.mono, fontSize: 12, color: HEX.green,
              }}>
                Auto-reconciliation: {reconResult.matched} matched, {reconResult.unmatched} unmatched, {reconResult.exceptions} exceptions
              </div>
            )}

            {/* Manual Match */}
            {reconAccountId && (
              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
                <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 14 }}>MANUAL MATCH</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 14 }}>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>TRANSACTION ID
                    <input value={matchTxId} onChange={e => setMatchTxId(e.target.value)} placeholder="UUID"
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.mono, boxSizing: "border-box" }} />
                  </label>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>SETTLEMENT ID <span style={{ fontWeight: 400, color: S.text3, fontSize: 9 }}>(optional)</span>
                    <input value={matchSettlementId} onChange={e => setMatchSettlementId(e.target.value)} placeholder="UUID"
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.mono, boxSizing: "border-box" }} />
                  </label>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>JOURNAL ID <span style={{ fontWeight: 400, color: S.text3, fontSize: 9 }}>(optional)</span>
                    <input value={matchJournalId} onChange={e => setMatchJournalId(e.target.value)} placeholder="UUID"
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.mono, boxSizing: "border-box" }} />
                  </label>
                </div>
                <button onClick={handleManualMatch} disabled={!matchTxId || (!matchSettlementId && !matchJournalId)}
                  style={{ marginTop: 14, padding: "8px 18px", background: HEX.cyan, color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}>
                  MATCH
                </button>
              </div>
            )}

            {!reconAccountId && (
              <div style={{ textAlign: "center", padding: 60, color: S.text3, fontSize: 12, fontFamily: S.mono }}>
                Select an account to view reconciliation status
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BankStatementsPage() {
  const isMobile = useIsMobile();
  return (
    <Suspense fallback={
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-deep)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, border: "2px solid var(--border-rim)", borderTopColor: "var(--accent-cyan)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 12, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>LOADING</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    }>
      <BankStatementsInner />
    </Suspense>
  );
}
