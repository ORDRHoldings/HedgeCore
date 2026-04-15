"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  listStatements, listBankTransactions, uploadStatement, listAccounts,
  runReconciliation, getReconciliationSummary, manualMatch, markException, unmatchTransaction,
  type BankStatementRecord, type BankTransactionRecord, type BankAccount,
  type ReconciliationSummary, type ReconciliationRunResponse,
} from "@/lib/api/cashClient";
import { FileSpreadsheet, Upload, RefreshCw, Check, X, Play, Search } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

type Tab = "STATEMENTS" | "TRANSACTIONS" | "RECONCILIATION";

const reconStatusColor: Record<string, string> = {
  UNMATCHED: "#f59e0b",
  MATCHED: "#10b981",
  EXCEPTION: "#ef4444",
};

const dirColor: Record<string, string> = {
  DEBIT: "#ef4444",
  CREDIT: "#10b981",
};

const formatColor: Record<string, string> = {
  MT940: "#8b5cf6",
  CAMT053: "#3b82f6",
  BAI2: "#f59e0b",
};

const fmtAmount = (v: string | number) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function BankStatementsInner() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("STATEMENTS");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Statements tab
  const [statements, setStatements] = useState<BankStatementRecord[]>([]);
  const [stmtAccountFilter, setStmtAccountFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadAccountId, setUploadAccountId] = useState("");
  const [uploadFormat, setUploadFormat] = useState("MT940");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Transactions tab
  const [transactions, setTransactions] = useState<BankTransactionRecord[]>([]);
  const [txAccountFilter, setTxAccountFilter] = useState("");
  const [txStatusFilter, setTxStatusFilter] = useState("");
  const [txDateFrom, setTxDateFrom] = useState("");
  const [txDateTo, setTxDateTo] = useState("");

  // Reconciliation tab
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
      loadStatements();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setUploading(false); }
  };

  const handleRunRecon = async () => {
    if (!token || !reconAccountId) return;
    setError(null);
    try {
      const result = await runReconciliation(token, reconAccountId);
      setReconResult(result);
      loadReconSummary();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Reconciliation failed"); }
  };

  const handleManualMatch = async () => {
    if (!token || !matchTxId || (!matchSettlementId && !matchJournalId)) return;
    try {
      await manualMatch(token, {
        transaction_id: matchTxId,
        settlement_id: matchSettlementId || undefined,
        journal_id: matchJournalId || undefined,
      });
      setMatchTxId(""); setMatchSettlementId(""); setMatchJournalId("");
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

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "STATEMENTS", label: "STATEMENTS", icon: FileSpreadsheet },
    { key: "TRANSACTIONS", label: "TRANSACTIONS", icon: Search },
    { key: "RECONCILIATION", label: "RECONCILIATION", icon: Check },
  ];

  return (
    <div style={{ fontFamily: S.fontUI, padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileSpreadsheet size={22} color="var(--accent-primary)" />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Bank Statements</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Hedge Desk → Statements & Reconciliation</div>
          </div>
        </div>
        <button onClick={() => { if (tab === "STATEMENTS") loadStatements(); else if (tab === "TRANSACTIONS") loadTransactions(); else loadReconSummary(); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: S.fontMono, color: "var(--text-primary)" }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "8px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}<button onClick={() => setError(null)} style={{ float: "right", background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}>x</button></div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
              background: tab === t.key ? S.bgPanel : "transparent", color: tab === t.key ? "#fff" : "#9ca3af",
              border: `1px solid ${tab === t.key ? S.rim : "transparent"}`, borderRadius: 6, cursor: "pointer" }}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: "#9ca3af", fontSize: 13, padding: 20 }}>Loading...</div>}

      {/* ── STATEMENTS TAB ── */}
      {tab === "STATEMENTS" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
            <select value={stmtAccountFilter} onChange={e => setStmtAccountFilter(e.target.value)}
              style={{ padding: 8, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.fontMono }}>
              <option value="">All Accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
            </select>
            <button onClick={() => setShowUpload(!showUpload)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
              <Upload size={14} />UPLOAD STATEMENT
            </button>
          </div>

          {showUpload && (
            <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>ACCOUNT
                  <select value={uploadAccountId} onChange={e => setUploadAccountId(e.target.value)}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="">Select...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>FORMAT
                  <select value={uploadFormat} onChange={e => setUploadFormat(e.target.value)}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="MT940">MT940</option><option value="CAMT053">CAMT053</option><option value="BAI2">BAI2</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>FILE
                  <input type="file" accept=".txt,.xml,.bai" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    style={{ width: "100%", padding: 6, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12 }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadAccountId}
                  style={{ padding: "8px 16px", background: uploading ? "#6b7280" : "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: uploading ? "wait" : "pointer" }}>
                  {uploading ? "UPLOADING..." : "UPLOAD"}
                </button>
                <button onClick={() => setShowUpload(false)} style={{ padding: "8px 16px", background: "transparent", color: "#9ca3af", border: `1px solid ${S.rim}`, borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CANCEL</button>
              </div>
            </div>
          )}

          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["ACCOUNT", "DATE", "OPENING", "CLOSING", "CCY", "FORMAT", "TXs", "FILE"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statements.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No statements imported</td></tr>}
                {statements.map(s => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                    <td style={{ padding: "10px 12px" }}>{accountName(s.account_id)}</td>
                    <td style={{ padding: "10px 12px" }}>{s.statement_date}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtAmount(s.opening_balance)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtAmount(s.closing_balance)}</td>
                    <td style={{ padding: "10px 12px" }}>{s.currency}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${formatColor[s.format] || "#6b7280"}22`, color: formatColor[s.format] || "#6b7280" }}>{s.format}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{s.transaction_count}</td>
                    <td style={{ padding: "10px 12px", color: "#9ca3af", fontSize: 11 }}>{s.filename || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TRANSACTIONS TAB ── */}
      {tab === "TRANSACTIONS" && !loading && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>ACCOUNT
              <select value={txAccountFilter} onChange={e => setTxAccountFilter(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                <option value="">All</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>STATUS
              <select value={txStatusFilter} onChange={e => setTxStatusFilter(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                <option value="">All</option>
                <option value="UNMATCHED">UNMATCHED</option>
                <option value="MATCHED">MATCHED</option>
                <option value="EXCEPTION">EXCEPTION</option>
              </select>
            </label>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>FROM
              <input type="date" value={txDateFrom} onChange={e => setTxDateFrom(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
            </label>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>TO
              <input type="date" value={txDateTo} onChange={e => setTxDateTo(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
            </label>
          </div>

          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["DATE", "AMOUNT", "CCY", "DIR", "DESCRIPTION", "COUNTERPARTY", "REF", "STATUS", "ACTIONS"].map(h => (
                    <th key={h} style={{ padding: "10px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No transactions found</td></tr>}
                {transactions.map(tx => (
                  <tr key={tx.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                    <td style={{ padding: "8px 10px" }}>{tx.tx_date}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{fmtAmount(tx.amount)}</td>
                    <td style={{ padding: "8px 10px" }}>{tx.currency}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: `${dirColor[tx.direction]}22`, color: dirColor[tx.direction] }}>{tx.direction}</span>
                    </td>
                    <td style={{ padding: "8px 10px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description || "\u2014"}</td>
                    <td style={{ padding: "8px 10px", color: "#9ca3af" }}>{tx.counterparty || "\u2014"}</td>
                    <td style={{ padding: "8px 10px", color: "#9ca3af" }}>{tx.reference || "\u2014"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${reconStatusColor[tx.reconciliation_status]}22`, color: reconStatusColor[tx.reconciliation_status] }}>{tx.reconciliation_status}</span>
                    </td>
                    <td style={{ padding: "8px 10px", display: "flex", gap: 4 }}>
                      {tx.reconciliation_status === "UNMATCHED" && (
                        <button onClick={() => handleMarkException(tx.id)} title="Mark Exception" style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 2 }}><X size={13} /></button>
                      )}
                      {tx.reconciliation_status === "MATCHED" && (
                        <button onClick={() => handleUnmatch(tx.id)} title="Unmatch" style={{ background: "none", border: "none", color: "#f59e0b", cursor: "pointer", padding: 2 }}><X size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── RECONCILIATION TAB ── */}
      {tab === "RECONCILIATION" && !loading && (
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-end" }}>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>ACCOUNT
              <select value={reconAccountId} onChange={e => setReconAccountId(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, minWidth: 200 }}>
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
              </select>
            </label>
            <button onClick={handleRunRecon} disabled={!reconAccountId}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: reconAccountId ? "#2563eb" : "#6b7280", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: reconAccountId ? "pointer" : "not-allowed" }}>
              <Play size={14} />RUN AUTO-RECONCILIATION
            </button>
          </div>

          {/* KPI Strip */}
          {reconSummary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "TOTAL", value: reconSummary.total_transactions, color: "#fff" },
                { label: "MATCHED", value: reconSummary.matched, color: "#10b981" },
                { label: "UNMATCHED", value: reconSummary.unmatched, color: "#f59e0b" },
                { label: "MATCH RATE", value: `${reconSummary.match_rate.toFixed(1)}%`, color: reconSummary.match_rate >= 80 ? "#10b981" : "#f59e0b" },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontFamily: S.fontMono, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>{kpi.label}</div>
                  <div style={{ fontSize: 24, fontFamily: S.fontMono, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Last run result */}
          {reconResult && (
            <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 12, fontFamily: S.fontMono }}>
              Auto-reconciliation complete: {reconResult.matched} matched, {reconResult.unmatched} unmatched, {reconResult.exceptions} exceptions
            </div>
          )}

          {/* Manual Match */}
          {reconAccountId && (
            <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontFamily: S.fontMono, fontWeight: 600, marginBottom: 12, color: "#9ca3af" }}>MANUAL MATCH</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 11, fontFamily: S.fontMono }}>TRANSACTION ID
                  <input value={matchTxId} onChange={e => setMatchTxId(e.target.value)} placeholder="UUID"
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.fontMono, boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 11, fontFamily: S.fontMono }}>SETTLEMENT ID (optional)
                  <input value={matchSettlementId} onChange={e => setMatchSettlementId(e.target.value)} placeholder="UUID"
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.fontMono, boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 11, fontFamily: S.fontMono }}>JOURNAL ID (optional)
                  <input value={matchJournalId} onChange={e => setMatchJournalId(e.target.value)} placeholder="UUID"
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.fontMono, boxSizing: "border-box" }} />
                </label>
              </div>
              <button onClick={handleManualMatch} disabled={!matchTxId || (!matchSettlementId && !matchJournalId)}
                style={{ marginTop: 12, padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
                MATCH
              </button>
            </div>
          )}

          {!reconAccountId && <div style={{ color: "#6b7280", textAlign: "center", padding: 40, fontSize: 13 }}>Select an account to view reconciliation status</div>}
        </div>
      )}
    </div>
  );
}

export default function BankStatementsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#6b7280" }}>Loading...</div>}>
      <BankStatementsInner />
    </Suspense>
  );
}
